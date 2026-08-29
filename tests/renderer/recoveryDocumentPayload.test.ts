import { describe, expect, it } from "vitest";
import type { PergamumProject } from "../../src/shared/api";
import type { ActiveProjectContext } from "../../src/shared/editorId";
import { sha256Hex } from "../../src/renderer/editorContentDigest";
import {
  createFileDocument,
  createProjectDocument,
  createUntitledDocument,
  updateCurrentDocumentContent,
  type CurrentDocument
} from "../../src/renderer/currentDocument";
import { buildLineEndingBreakSet } from "../../src/renderer/editorLineEndingField";
import { analyzeLineEndings } from "../../src/renderer/lineEndingTracking";
import {
  createMarkdownCurrentEditor
} from "../../src/renderer/currentEditor";
import {
  createInitialOpenDocumentsState,
  openOrActivateEditor
} from "../../src/renderer/openDocuments";
import {
  buildRecoveryDirtyDocuments,
  buildRecoveryDocumentPayload,
  recoveryDocumentKeyForDocument
} from "../../src/renderer/recovery/recoveryDocumentPayload";

const projectContext: ActiveProjectContext = { rootPath: "C:/Proj/root" };
const project = {
  rootPath: "C:/Proj/root",
  activeProjectFilePath: "C:/Proj/root/Proj.pergamum",
  accessMode: { kind: "readWrite" },
  name: "Proj",
  config: null,
  documents: [{ relativePath: "ch/01.md", name: "01.md" }]
} as unknown as PergamumProject;

/** Apply new content with correctly recomputed line-ending breaks (what
 *  CodeMirror would produce), mirroring a real edit. */
function withContent(
  doc: CurrentDocument,
  nextContent: string
): CurrentDocument {
  return updateCurrentDocumentContent(
    doc,
    nextContent,
    buildLineEndingBreakSet(analyzeLineEndings(nextContent))
  );
}

function fileDoc(pathValue: string, content: string, lineEnding = "lf") {
  return createFileDocument({
    path: pathValue,
    content,
    metadata: {
      encoding: "utf8",
      lineEnding: lineEnding as "lf",
      byteLength: content.length,
      characterLength: content.length,
      hadBom: false
    }
  });
}

describe("recoveryDocumentPayload — identity", () => {
  it("keys a Markdown file by its normalized absolute path", () => {
    const doc = fileDoc("c:\\Novel\\chapter.md", "hi");
    const key = recoveryDocumentKeyForDocument(doc, {
      project: null,
      activeProjectContext: null
    });
    expect(key).toBe("file:C:/Novel/chapter.md");

    const payload = buildRecoveryDocumentPayload(doc, {
      project: null,
      activeProjectContext: null
    })!;
    expect(payload).toMatchObject({
      documentKey: "file:C:/Novel/chapter.md",
      documentType: "markdown.file",
      sourceUri: "file://C:/Novel/chapter.md",
      filePath: "C:/Novel/chapter.md",
      projectId: null,
      projectFilePath: null
    });
  });

  it("keys an Untitled document by its stable UUIDv7, with null attrs + null base fingerprint", () => {
    const doc = createUntitledDocument(
      () => "0198d95f-97d8-7000-8000-000000000abc"
    );
    expect(
      recoveryDocumentKeyForDocument(doc, {
        project: null,
        activeProjectContext: null
      })
    ).toBe("untitled:0198d95f-97d8-7000-8000-000000000abc");

    const payload = buildRecoveryDocumentPayload(doc, {
      project: null,
      activeProjectContext: null
    })!;
    expect(payload).toMatchObject({
      documentKey: "untitled:0198d95f-97d8-7000-8000-000000000abc",
      documentType: "markdown.untitled",
      sourceUri: "untitled://0198d95f-97d8-7000-8000-000000000abc",
      filePath: null,
      documentEncoding: null,
      documentLineend: null,
      baseMtimeMs: null,
      baseSize: null,
      baseSha256: null
    });
  });

  it("keys a project document as file:<abs> and records project_file_path", () => {
    const doc = createProjectDocument(
      { relativePath: "ch/01.md", name: "01.md" },
      "chapter one",
      {
        encoding: "utf8",
        lineEnding: "crlf",
        byteLength: 11,
        characterLength: 11,
        hadBom: false
      }
    );
    const payload = buildRecoveryDocumentPayload(doc, {
      project,
      activeProjectContext: projectContext
    })!;
    expect(payload).toMatchObject({
      documentKey: "file:C:/Proj/root/ch/01.md",
      documentType: "markdown.file",
      projectId: null,
      projectFilePath: "C:/Proj/root/Proj.pergamum",
      documentEncoding: "utf-8",
      documentLineend: "crlf"
    });
  });

  it("maps a BOM'd source to utf-8-bom and mixed/none line endings to unknown", () => {
    const doc = createFileDocument({
      path: "C:/x.md",
      content: "a",
      metadata: {
        encoding: "utf8",
        lineEnding: "mixed",
        byteLength: 1,
        characterLength: 1,
        hadBom: true
      }
    });
    const payload = buildRecoveryDocumentPayload(doc, {
      project: null,
      activeProjectContext: null
    })!;
    expect(payload.documentEncoding).toBe("utf-8-bom");
    expect(payload.documentLineend).toBe("unknown");
  });
});

describe("recoveryDocumentPayload — payload + base fingerprint", () => {
  it("payloadText is the FULL current body; base fingerprint is the SAVED baseline", () => {
    const loaded = fileDoc("C:/a.md", "line one\nline two\n");
    const dirty = withContent(
      loaded,
      "line one CHANGED\nline two\nline three\n"
    );

    const payload = buildRecoveryDocumentPayload(dirty, {
      project: null,
      activeProjectContext: null
    })!;

    expect(payload.payloadText).toBe(
      "line one CHANGED\nline two\nline three\n"
    );
    // Base fingerprint comes from savedContent, not the dirty body.
    expect(payload.baseSha256).toBe(sha256Hex("line one\nline two\n"));
    expect(payload.baseSize).toBe(
      new TextEncoder().encode("line one\nline two\n").length
    );
    expect(payload.baseMtimeMs).toBeNull();
  });

  it("base fingerprint does not move across successive dirty edits", () => {
    const doc = fileDoc("C:/a.md", "base\n");
    const first = buildRecoveryDocumentPayload(withContent(doc, "base + a\n"), {
      project: null,
      activeProjectContext: null
    })!;
    const second = buildRecoveryDocumentPayload(
      withContent(doc, "base + a + b\n"),
      { project: null, activeProjectContext: null }
    )!;

    expect(second.baseSha256).toBe(first.baseSha256);
    expect(second.baseSize).toBe(first.baseSize);
    expect(second.payloadText).not.toBe(first.payloadText);
  });
});

describe("buildRecoveryDirtyDocuments", () => {
  it("includes only dirty Markdown editors", () => {
    let state = createInitialOpenDocumentsState();
    // clean file
    state = openOrActivateEditor(
      state,
      createMarkdownCurrentEditor(fileDoc("C:/clean.md", "clean")),
      null
    );
    // dirty file
    state = openOrActivateEditor(
      state,
      createMarkdownCurrentEditor(
        withContent(fileDoc("C:/dirty.md", "orig"), "edited")
      ),
      null
    );

    const dirty = buildRecoveryDirtyDocuments(state, {
      project: null,
      activeProjectContext: null
    });
    expect(dirty.map((d) => d.documentKey)).toEqual(["file:C:/dirty.md"]);
    expect(dirty[0].payload.payloadText).toBe("edited");
  });
});
