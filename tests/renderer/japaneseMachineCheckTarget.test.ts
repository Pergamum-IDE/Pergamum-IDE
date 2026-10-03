import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createGlossaryDescriptionCurrentEditor,
  type CurrentEditor,
  type GlossaryDescriptionCurrentEditor
} from "../../src/renderer/currentEditor";
import { DEFAULT_GLOSSARY_ENTRY_PRESET_REPRESENTATIVE } from "../../src/renderer/glossaryEntryTabCommands";
import {
  createGlossaryDescriptionMachineCheckTarget,
  resolveJapaneseMachineCheckTarget,
  type JapaneseMachineCheckTargetContext
} from "../../src/renderer/japaneseMachineCheckTarget";
import { parseJapaneseMachineCheckRequest } from "../../src/shared/japaneseMachineCheck";
import type { GlossaryEntry } from "../../src/shared/glossary";

const entryId = "0190b6a1-1c2d-7e3f-8a4b-0000000000e1";

function savedEntry(): GlossaryEntry {
  return {
    id: entryId,
    description: "保存済みの説明。",
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

function glossaryEditor(
  atomValues: readonly string[],
  description: string
): GlossaryDescriptionCurrentEditor {
  const editor = createGlossaryDescriptionCurrentEditor(savedEntry());

  return {
    ...editor,
    draft: {
      ...editor.draft,
      description,
      atoms: atomValues.map((value, index) => ({
        id: `local:atom-${index}`,
        value,
        matchFlags: 0
      }))
    }
  };
}

const markdownEditor = { kind: "markdown", document: {} } as unknown as CurrentEditor;

function context(
  overrides: Partial<JapaneseMachineCheckTargetContext> = {}
): JapaneseMachineCheckTargetContext {
  return {
    currentEditor: markdownEditor,
    isSpecialTabActive: false,
    activeProjectDocumentRelativePath: null,
    isProjectDocumentDirty: () => false,
    ...overrides
  };
}

describe("project file target (#688 Slice 4: semantics unchanged)", () => {
  it("is a projectFile target for .md / .markdown / .txt, with the dirty flag", () => {
    for (const path of ["a.md", "d/b.markdown", "c.TXT"]) {
      expect(
        resolveJapaneseMachineCheckTarget(
          context({
            activeProjectDocumentRelativePath: path,
            isProjectDocumentDirty: (p) => p === path
          })
        )
      ).toEqual({ kind: "projectFile", relativePath: path, isDirty: true });
    }
    expect(
      resolveJapaneseMachineCheckTarget(
        context({ activeProjectDocumentRelativePath: "a.md" })
      )
    ).toEqual({ kind: "projectFile", relativePath: "a.md", isDirty: false });
  });

  it("is null without a supported project file", () => {
    for (const path of [null, "cover.png", "a.json", ""]) {
      expect(
        resolveJapaneseMachineCheckTarget(
          context({ activeProjectDocumentRelativePath: path })
        ),
        String(path)
      ).toBeNull();
    }
    expect(
      resolveJapaneseMachineCheckTarget(context({ currentEditor: null }))
    ).toBeNull();
  });

  it("is not gated on a special tab, exactly as before #688", () => {
    expect(
      resolveJapaneseMachineCheckTarget(
        context({
          isSpecialTabActive: true,
          activeProjectDocumentRelativePath: "a.md"
        })
      )
    ).toEqual({ kind: "projectFile", relativePath: "a.md", isDirty: false });
  });
});

describe("glossary Description target (#688 Slice 4)", () => {
  it("is available for a saved entry, a dirty one and a new one", () => {
    const saved = glossaryEditor(["アリス"], "保存済みの説明。");
    const dirty = glossaryEditor(["アリシア"], "書き換えた説明。");
    const brandNew = {
      ...glossaryEditor(["新しい語彙"], ""),
      entryId: "0190b6a1-1c2d-7e3f-8a4b-00000000ffff"
    };

    for (const editor of [saved, dirty, brandNew]) {
      expect(
        resolveJapaneseMachineCheckTarget(context({ currentEditor: editor }))
      ).toMatchObject({ kind: "glossaryDescription" });
    }
  });

  it("uses the current draft's Description, not the saved one", () => {
    const editor = glossaryEditor(["アリス"], "未保存の本文。");

    expect(editor.draft.entry.description).toBe("保存済みの説明。");
    expect(createGlossaryDescriptionMachineCheckTarget(editor)).toEqual({
      kind: "glossaryDescription",
      text: "未保存の本文。",
      displayName: "アリス"
    });
  });

  it("names it by the draft's representative Atom (the first Atom), trimmed", () => {
    expect(
      createGlossaryDescriptionMachineCheckTarget(
        glossaryEditor(["  アリス  ", "Alice"], "本文")
      ).displayName
    ).toBe("アリス");
  });

  it("follows the draft, not the tab's cached representativeSurface or the saved Atom", () => {
    const editor = glossaryEditor(["アリシア"], "本文");

    expect(editor.representativeSurface).toBe("保存済みの代表");
    expect(editor.draft.entry.atoms[0]?.value).toBe("保存済みの代表");
    expect(createGlossaryDescriptionMachineCheckTarget(editor).displayName).toBe(
      "アリシア"
    );
  });

  it("follows an Atom reorder", () => {
    const before = glossaryEditor(["アリス", "Alice"], "本文");
    const after = glossaryEditor(["Alice", "アリス"], "本文");

    expect(createGlossaryDescriptionMachineCheckTarget(before).displayName).toBe(
      "アリス"
    );
    expect(createGlossaryDescriptionMachineCheckTarget(after).displayName).toBe(
      "Alice"
    );
  });

  it("falls back to the existing default when the representative Atom is missing or blank", () => {
    for (const atoms of [[], [""], ["   "], ["\t\n"]]) {
      const target = createGlossaryDescriptionMachineCheckTarget(
        glossaryEditor(atoms, "本文だけある。")
      );

      expect(target.displayName, JSON.stringify(atoms)).toBe(
        DEFAULT_GLOSSARY_ENTRY_PRESET_REPRESENTATIVE
      );
      // The Description is still the draft's.
      expect(target.text).toBe("本文だけある。");
    }
    expect(DEFAULT_GLOSSARY_ENTRY_PRESET_REPRESENTATIVE).toBe("新しい語彙");
  });

  it("is not blocked by an otherwise invalid draft (no Atoms, duplicate Atoms)", () => {
    for (const atoms of [[], ["同じ", "同じ"]]) {
      expect(
        resolveJapaneseMachineCheckTarget(
          context({ currentEditor: glossaryEditor(atoms, "本文") })
        )
      ).not.toBeNull();
    }
  });

  it("keeps names with file-name-forbidden characters as they are", () => {
    for (const name of ["AC/DC", "Type:Moon", "A?B", "A<B>"]) {
      expect(
        createGlossaryDescriptionMachineCheckTarget(glossaryEditor([name], "本文"))
          .displayName
      ).toBe(name);
    }
  });

  it("keeps a very long representative Atom whole, and it round-trips through the parser", () => {
    for (const long of [
      "あ".repeat(300),
      "a".repeat(2000),
      "𠮷".repeat(500)
    ]) {
      const target = createGlossaryDescriptionMachineCheckTarget(
        glossaryEditor([long], "本文")
      );

      expect(target.displayName).toBe(long);
      expect(parseJapaneseMachineCheckRequest(target)).toEqual(target);
    }
  });

  it("is null while a special tab is in front, even with a Description behind it", () => {
    expect(
      resolveJapaneseMachineCheckTarget(
        context({
          currentEditor: glossaryEditor(["アリス"], "本文"),
          isSpecialTabActive: true,
          activeProjectDocumentRelativePath: "a.md"
        })
      )
    ).toBeNull();
  });

  it("sends only text, name and kind: no entry id, no path", () => {
    const target = resolveJapaneseMachineCheckTarget(
      context({ currentEditor: glossaryEditor(["アリス"], "本文") })
    );

    expect(Object.keys(target ?? {}).sort()).toEqual([
      "displayName",
      "kind",
      "text"
    ]);
  });
});

describe("snapshot (#688 Slice 4)", () => {
  it("a target made earlier does not change when the draft changes afterwards", () => {
    const editor = glossaryEditor(["アリス"], "本文A");
    const target = createGlossaryDescriptionMachineCheckTarget(editor);
    const frozen = { ...target };

    // The user keeps editing: new Description, new representative Atom.
    editor.draft.description = "本文B";
    editor.draft.atoms[0]!.value = "アリシア";
    const next = createGlossaryDescriptionMachineCheckTarget(editor);

    expect(target).toEqual(frozen);
    expect(target).toEqual({
      kind: "glossaryDescription",
      text: "本文A",
      displayName: "アリス"
    });
    expect(next).toEqual({
      kind: "glossaryDescription",
      text: "本文B",
      displayName: "アリシア"
    });
    expect(next).not.toBe(target);
  });

  it("enablement and invocation share the resolver, and the dialog passes one frozen target to prepare and run", () => {
    const app = readFileSync("src/renderer/App.tsx", "utf8");
    const dialog = readFileSync(
      "src/renderer/dialog/JapaneseMachineCheckDialog.tsx",
      "utf8"
    );

    expect(app).toContain("resolveJapaneseMachineCheckTargetRef.current() !== null");
    expect(app).toContain(
      "explicitTarget ?? resolveJapaneseMachineCheckTargetRef.current()"
    );
    expect(app).toContain("setJapaneseMachineCheckTarget(target)");
    expect(dialog).toContain(".prepare(target)");
    expect(dialog).toContain(".run({ ...target, runId })");
  });

  it("adds no log of the target, its text or its name", () => {
    const source = readFileSync(
      "src/renderer/japaneseMachineCheckTarget.ts",
      "utf8"
    );

    expect(source).not.toMatch(/logRendererDebugEvent|console\./);
  });
});
