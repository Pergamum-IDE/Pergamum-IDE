import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  createGlossaryDescriptionCurrentEditor,
  type CurrentEditor
} from "../../src/renderer/currentEditor";
import { collectExportCandidatesFromOrigin } from "../../src/renderer/exportCandidates";
import {
  isJapaneseMachineCheckTargetRunnable,
  resolveTabJapaneseMachineCheckTarget
} from "../../src/renderer/japaneseMachineCheckTarget";
import {
  createGlossaryDescriptionEditorId,
  createProjectDocumentEditorId,
  createFileEditorIdForPath,
  createUntitledEditorId,
  type EditorId
} from "../../src/shared/editorId";
import type { GlossaryEntry } from "../../src/shared/glossary";

const project = { rootPath: "C:\\Novel" };
const entryId = "0190b6a1-1c2d-7e3f-8a4b-0000000000e1";

function savedEntry(): GlossaryEntry {
  return {
    id: entryId,
    description: "古い保存済みの説明B。",
    atoms: [
      {
        id: "0190b6a1-1c2d-7e3f-8a4b-000000000001",
        entryId,
        sortOrder: 0,
        value: "保存済みの代表",
        matchFlags: 0,
        createdAt: "2026-09-24T00:00:00.000Z",
        updatedAt: "2026-09-24T00:00:00.000Z"
      }
    ],
    tags: [],
    createdAt: "2026-09-24T00:00:00.000Z",
    updatedAt: "2026-09-24T00:00:00.000Z"
  };
}

function draftEditor(): CurrentEditor {
  const editor = createGlossaryDescriptionCurrentEditor(savedEntry());

  return {
    ...editor,
    draft: {
      ...editor.draft,
      description: "現在のドラフトA。",
      atoms: [{ id: "local:1", value: "アリス", matchFlags: 0 }]
    }
  };
}

describe("document tab: Japanese Style Check target is the clicked tab's (#684)", () => {
  // The ACTIVE editor (chapter02) is deliberately visible to the deps but must
  // never be used: only the clicked tab's own data is.
  const deps = {
    projectDocumentRelativePath: (id: EditorId) =>
      id.kind === "projectDocument" ? `real-case/${id.relativePath}` : null,
    openEditor: (id: EditorId) =>
      id.kind === "glossaryDescription" ? draftEditor() : null
  };

  it("an inactive project document: its own path and its own dirty flag", () => {
    const clicked = {
      id: createProjectDocumentEditorId("chapter01.md", project),
      isDirty: true
    };

    expect(resolveTabJapaneseMachineCheckTarget(clicked, deps)).toEqual({
      kind: "projectFile",
      relativePath: "real-case/chapter01.md",
      isDirty: true
    });
    expect(
      resolveTabJapaneseMachineCheckTarget(
        { ...clicked, isDirty: false },
        deps
      )
    ).toMatchObject({ isDirty: false });
  });

  it("keeps the on-disk casing the app resolves, not the tab id's", () => {
    const clicked = {
      id: createProjectDocumentEditorId("Chapter01.MD", project),
      isDirty: false
    };

    expect(
      resolveTabJapaneseMachineCheckTarget(clicked, {
        ...deps,
        projectDocumentRelativePath: () => "Chapter01.MD"
      })
    ).toMatchObject({ relativePath: "Chapter01.MD" });
  });

  it("project .markdown and .txt are checkable; other files are not", () => {
    for (const [path, expected] of [
      ["a.markdown", true],
      ["a.txt", true],
      ["a.json", false]
    ] as const) {
      const target = resolveTabJapaneseMachineCheckTarget(
        {
          id: createProjectDocumentEditorId(path, project),
          isDirty: false
        },
        { ...deps, projectDocumentRelativePath: () => path }
      );

      expect(target !== null, path).toBe(expected);
    }
  });

  it("an inactive glossary Description: that tab's current draft, not the saved value", () => {
    const clicked = {
      id: createGlossaryDescriptionEditorId(entryId),
      isDirty: true
    };

    expect(resolveTabJapaneseMachineCheckTarget(clicked, deps)).toEqual({
      kind: "glossaryDescription",
      text: "現在のドラフトA。",
      displayName: "アリス"
    });
  });

  it("external files, untitled documents and missing editors have no target", () => {
    for (const id of [
      createFileEditorIdForPath("C:/Outside/notes.md"),
      createUntitledEditorId(1)
    ]) {
      expect(
        resolveTabJapaneseMachineCheckTarget({ id, isDirty: false }, deps),
        id.kind
      ).toBeNull();
    }
    expect(
      resolveTabJapaneseMachineCheckTarget(
        { id: createGlossaryDescriptionEditorId(entryId), isDirty: false },
        { ...deps, openEditor: () => null }
      )
    ).toBeNull();
  });

  it("an explicit target is judged on itself", () => {
    expect(
      isJapaneseMachineCheckTargetRunnable({
        kind: "projectFile",
        relativePath: "a.md"
      })
    ).toBe(true);
    expect(
      isJapaneseMachineCheckTargetRunnable({
        kind: "projectFile",
        relativePath: "a.png"
      })
    ).toBe(false);
    expect(
      isJapaneseMachineCheckTargetRunnable({
        kind: "glossaryDescription",
        text: "",
        displayName: "アリス"
      })
    ).toBe(true);
  });
});

describe("document tab: Export origin is the clicked file (#684)", () => {
  it("collects exactly the clicked file, with the existing candidate rules", async () => {
    const listFileExplorerChildren = vi.fn();
    const readProjectDocumentContent = vi.fn(async (path: string) => `# ${path}`);
    const candidates = await collectExportCandidatesFromOrigin(
      { kind: "file", filePath: "chapter01.md" },
      { listFileExplorerChildren, readProjectDocumentContent },
      { enablePlainTextDocuments: true }
    );

    expect(candidates.map((candidate) => candidate.filePath)).toEqual([
      "chapter01.md"
    ]);
    expect(readProjectDocumentContent).toHaveBeenCalledTimes(1);
    expect(readProjectDocumentContent).toHaveBeenCalledWith("chapter01.md");
    expect(listFileExplorerChildren).not.toHaveBeenCalled();
  });

  it("a .txt follows enablePlainTextDocuments, like the File Explorer export", async () => {
    const run = (enablePlainTextDocuments: boolean) =>
      collectExportCandidatesFromOrigin(
        { kind: "file", filePath: "notes.txt" },
        {
          listFileExplorerChildren: vi.fn(),
          readProjectDocumentContent: async () => "text"
        },
        { enablePlainTextDocuments }
      );

    expect(await run(true)).toHaveLength(1);
    expect(await run(false)).toHaveLength(0);
  });
});

describe("App wiring (#684)", () => {
  const app = readFileSync("src/renderer/App.tsx", "utf8");
  const block = (() => {
    const start = app.indexOf('      case "export": {');
    const end = app.indexOf('      case "copyAbsolutePath":', start);

    return app.slice(start, end);
  })();

  it("runs both actions through the existing commands, not by calling handlers", () => {
    expect(block).toContain("assistCommandIds.openExportDialog");
    expect(block).toContain("assistCommandIds.openJapaneseMachineCheckDialog");
    expect(block).toContain('{ source: "documentTabBar" }');
    expect(block).toContain("{ target }");
    expect(block).toContain("{ target }");
    expect(block).not.toContain("handleFileExplorerExport");
    expect(block).not.toContain("setJapaneseMachineCheckTarget");
  });

  it("never activates or focuses the clicked tab", () => {
    const code = block
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");

    expect(code).not.toMatch(
      /activate|setActive|selectDocument|openOrActivate|\.focus\(/
    );
  });

  it("keeps the zero-argument commands as they were", () => {
    expect(app).toContain(
      "void handleFileExplorerExport(target?.origin ?? { kind: \"projectRoot\" });"
    );
    expect(app).toContain(
      "explicitTarget ?? resolveJapaneseMachineCheckTargetRef.current()"
    );
    expect(app).toContain(
      "explicitTarget === undefined\n            ? resolveJapaneseMachineCheckTargetRef.current() !== null"
    );
  });
});
