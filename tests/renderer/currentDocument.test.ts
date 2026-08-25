import { EditorState } from "@codemirror/state";
import { history, redo, undo } from "@codemirror/commands";
import { describe, expect, it } from "vitest";
import {
  applyStandaloneSaveResult,
  createFileDocument,
  createProjectDocument,
  createUntitledDocument,
  initialDocumentContent,
  isCurrentDocumentDirty,
  markCurrentDocumentSaved,
  updateCurrentDocumentContent
} from "../../src/renderer/currentDocument";
import {
  createLineEndingTrackingExtension,
  lineEndingBreakSetToArray,
  type LineEndingBreakSet
} from "../../src/renderer/editorLineEndingField";
import {
  analyzeLineEndings,
  serializeLineEndings
} from "../../src/renderer/lineEndingTracking";
import { computeLineEndingDistribution } from "../../src/renderer/lineEndingDistribution";

/**
 * Drives the real production tracking field (StateField + history +
 * invertedEffects, from editorLineEndingField.ts) through an edit
 * sequence, rather than re-implementing break-tracking logic in the test.
 * Returns an EditorView-shaped object usable with @codemirror/commands'
 * undo()/redo(), plus a snapshot() helper that reads back exactly what
 * MarkdownEditor.tsx's onChange would hand to updateCurrentDocumentContent.
 */
function driveLineEndingField(doc: string) {
  const { field, extension } = createLineEndingTrackingExtension(
    analyzeLineEndings(doc),
    () => "lf"
  );
  let state = EditorState.create({
    doc: doc.replace(/\r\n|\r/g, "\n"),
    extensions: [history(), extension]
  });
  return {
    get state() {
      return state;
    },
    dispatch: (spec: Parameters<EditorState["update"]>[0]) => {
      state = state.update(spec).state;
    },
    snapshot(): { content: string; breaks: LineEndingBreakSet } {
      return { content: state.doc.toString(), breaks: state.field(field) };
    }
  };
}

describe("currentDocument line-ending tracking wiring (#253)", () => {
  it("seeds an untitled document's tracked breaks from its initial content", () => {
    const document = createUntitledDocument();

    expect(lineEndingBreakSetToArray(document.lineEndingBreaks)).toEqual(
      analyzeLineEndings(initialDocumentContent)
    );
  });

  it("seeds a file document's tracked breaks by analyzing the raw file content", () => {
    const raw = "a\r\nb\nc\rd";
    const document = createFileDocument({ path: "C:/notes.md", content: raw });

    expect(lineEndingBreakSetToArray(document.lineEndingBreaks)).toEqual(
      analyzeLineEndings(raw)
    );
  });

  it("seeds a project document's tracked breaks by analyzing the raw content", () => {
    const raw = "one\r\ntwo\r\nthree";
    const document = createProjectDocument(
      { relativePath: "notes/a.md", name: "a.md" },
      raw
    );

    expect(lineEndingBreakSetToArray(document.lineEndingBreaks)).toEqual(
      analyzeLineEndings(raw)
    );
  });

  it("replaces content and tracked breaks together as one update, not independently", () => {
    const document = createUntitledDocument();
    const nextContent = "x\ny\nz";
    const nextBreaks = analyzeLineEndings("x\r\ny\r\nz");
    const nextSet = createFileDocument({
      path: "C:/tmp.md",
      content: "x\r\ny\r\nz"
    }).lineEndingBreaks;

    const updated = updateCurrentDocumentContent(document, nextContent, nextSet);

    expect(updated.content).toBe(nextContent);
    expect(lineEndingBreakSetToArray(updated.lineEndingBreaks)).toEqual(
      nextBreaks
    );
    // savedContent is untouched by a content edit — only Save updates it.
    expect(updated.savedContent).toBe(document.savedContent);
  });

  it("carries the current tracking state forward unchanged across a standalone save-target change", () => {
    const raw = "a\r\nb\r\nc";
    const document = createFileDocument({ path: "C:/old.md", content: raw });

    const saved = applyStandaloneSaveResult(document, {
      kind: "saved",
      path: "C:/new.md",
      encoding: "utf8",
      lineEnding: "lf",
      byteLength: raw.length,
      characterLength: raw.length
    });

    expect(saved.kind).toBe("file");
    expect(saved.path).toBe("C:/new.md");
    // Content/tracking didn't change on Save As — only file identity did.
    expect(saved.lineEndingBreaks).toBe(document.lineEndingBreaks);
    expect(lineEndingBreakSetToArray(saved.lineEndingBreaks)).toEqual(
      analyzeLineEndings(raw)
    );
  });
});

describe("canonical content is normalized from the moment a document is opened (#253 review blocker 1)", () => {
  it("stores CodeMirror-normalized (\\n-only) content for a CRLF file, not the raw bytes", () => {
    const raw = "a\r\nb\r\nc";
    const document = createFileDocument({ path: "C:/crlf.md", content: raw });

    expect(document.content).toBe("a\nb\nc");
    expect(document.savedContent).toBe("a\nb\nc");
  });

  it("stores normalized content for a mixed-line-ending file", () => {
    const raw = "one\r\ntwo\nthree\rfour";
    const document = createFileDocument({ path: "C:/mixed.md", content: raw });

    expect(document.content).toBe("one\ntwo\nthree\nfour");
    expect(document.savedContent).toBe("one\ntwo\nthree\nfour");
  });

  it("stores content identical to what CodeMirror's own Text would produce for the same raw input", () => {
    const raw = "a\r\nb\rc\nd";
    const document = createFileDocument({ path: "C:/x.md", content: raw });

    expect(document.content).toBe(EditorState.create({ doc: raw }).doc.toString());
  });

  it("does not report an untouched CRLF/mixed file as dirty immediately after opening", () => {
    expect(
      isCurrentDocumentDirty(
        createFileDocument({ path: "C:/crlf.md", content: "a\r\nb\r\nc" })
      )
    ).toBe(false);
    expect(
      isCurrentDocumentDirty(
        createFileDocument({
          path: "C:/mixed.md",
          content: "one\r\ntwo\nthree\rfour"
        })
      )
    ).toBe(false);
    expect(
      isCurrentDocumentDirty(
        createProjectDocument(
          { relativePath: "a.md", name: "a.md" },
          "a\r\nb\r\nc"
        )
      )
    ).toBe(false);
  });

  it("round-trips an untouched pure CRLF file through Save As without ever having been edited", () => {
    const raw = "line one\r\nline two\r\nline three";
    const document = createFileDocument({ path: "C:/crlf.md", content: raw });

    const serialized = serializeLineEndings(
      document.content,
      lineEndingBreakSetToArray(document.lineEndingBreaks)
    );

    expect(serialized).toBe(raw);
  });

  it("round-trips an untouched mixed-line-ending file through Save As, preserving the distribution", () => {
    const raw = "one\r\ntwo\nthree\rfour\r\nfive";
    const document = createFileDocument({ path: "C:/mixed.md", content: raw });

    const serialized = serializeLineEndings(
      document.content,
      lineEndingBreakSetToArray(document.lineEndingBreaks)
    );

    expect(serialized).toBe(raw);
    expect(serialized).toContain("\r\n");
    expect(serialized).toMatch(/[^\r]\n[^\r]/);
    expect(serialized).toMatch(/[^\n]\r[^\n]/);
  });

  it("does not cause a spurious content-replace when handed to a fresh CodeMirror EditorState (no false dirty across a document switch)", () => {
    // This mirrors what MarkdownEditor.tsx's mount/document-switch effect
    // checks (`view.state.doc.toString() === value`) before deciding
    // whether a corrective dispatch — and therefore an onChange callback —
    // is needed. If document.content weren't already normalized, this
    // would be false for any CRLF/CR/mixed file, firing a bogus onChange
    // with different content than savedContent immediately on open/switch.
    const raw = "a\r\nb\r\nc\r\nd";
    const document = createFileDocument({ path: "C:/crlf.md", content: raw });

    const state = EditorState.create({ doc: document.content });

    expect(state.doc.toString()).toBe(document.content);
    expect(isCurrentDocumentDirty(document)).toBe(false);
  });
});

describe("dirty detection considers line-ending tracking state, not just content (#253 review blocker)", () => {
  it("is never dirty immediately after opening, for any of pure LF / CRLF / CR / mixed content", () => {
    for (const raw of [
      "a\nb\nc",
      "a\r\nb\r\nc",
      "a\rb\rc",
      "one\r\ntwo\nthree\rfour"
    ]) {
      expect(
        isCurrentDocumentDirty(createFileDocument({ path: "C:/x.md", content: raw }))
      ).toBe(false);
      expect(
        isCurrentDocumentDirty(
          createProjectDocument({ relativePath: "x.md", name: "x.md" }, raw)
        )
      ).toBe(false);
    }
    expect(isCurrentDocumentDirty(createUntitledDocument())).toBe(false);
  });

  it("is dirty when canonical content round-trips back to savedContent but the tracked break kinds no longer match", () => {
    // A<CRLF> B<LF> C
    const raw = "A\r\nB\nC";
    const document = createFileDocument({ path: "C:/x.md", content: raw });
    expect(isCurrentDocumentDirty(document)).toBe(false);

    const editor = driveLineEndingField(raw);
    // Delete "A\n" (positions 0-2), which strictly contains the CRLF break
    // at position 1 — removing it outright (the surviving lf break at
    // position 3 simply shifts to position 1).
    editor.dispatch({ changes: { from: 0, to: 2 } });
    let snapshot = editor.snapshot();
    let updated = updateCurrentDocumentContent(
      document,
      snapshot.content,
      snapshot.breaks
    );
    // Content itself already differs at this point — trivially dirty.
    expect(updated.content).not.toBe(document.savedContent);
    expect(isCurrentDocumentDirty(updated)).toBe(true);

    // Type "A\n" back at the start — the new break inherits the
    // *following* break's kind (lf), per the #253 inheritance rule, not
    // the crlf that was just deleted.
    editor.dispatch({ changes: { from: 0, to: 0, insert: "A\n" } });
    snapshot = editor.snapshot();
    updated = updateCurrentDocumentContent(
      document,
      snapshot.content,
      snapshot.breaks
    );

    // Canonical content is byte-for-byte back to the saved string...
    expect(updated.content).toBe(document.savedContent);
    // ...but the tracked kinds are now lf/lf, not the saved crlf/lf — so
    // saving now would change the file's on-disk bytes. Must be dirty.
    expect(lineEndingBreakSetToArray(updated.lineEndingBreaks)).toEqual([
      { position: 1, kind: "lf" },
      { position: 3, kind: "lf" }
    ]);
    expect(lineEndingBreakSetToArray(updated.savedLineEndingBreaks)).toEqual([
      { position: 1, kind: "crlf" },
      { position: 3, kind: "lf" }
    ]);
    expect(isCurrentDocumentDirty(updated)).toBe(true);
  });

  it("becomes clean again after a successful save captures the new tracking state as the saved snapshot", () => {
    const raw = "A\r\nB\nC";
    const document = createFileDocument({ path: "C:/x.md", content: raw });
    const editor = driveLineEndingField(raw);

    editor.dispatch({ changes: { from: 0, to: 2 } });
    editor.dispatch({ changes: { from: 0, to: 0, insert: "A\n" } });
    const snapshot = editor.snapshot();
    const dirtyDocument = updateCurrentDocumentContent(
      document,
      snapshot.content,
      snapshot.breaks
    );
    expect(isCurrentDocumentDirty(dirtyDocument)).toBe(true);

    const saved = markCurrentDocumentSaved(dirtyDocument);

    expect(saved.savedContent).toBe(dirtyDocument.content);
    expect(saved.savedLineEndingBreaks).toBe(dirtyDocument.lineEndingBreaks);
    expect(isCurrentDocumentDirty(saved)).toBe(false);
  });

  it("Save As also captures the current tracking state as the saved snapshot", () => {
    const raw = "A\r\nB\nC";
    const document = createFileDocument({ path: "C:/old.md", content: raw });
    const editor = driveLineEndingField(raw);

    editor.dispatch({ changes: { from: 0, to: 2 } });
    editor.dispatch({ changes: { from: 0, to: 0, insert: "A\n" } });
    const snapshot = editor.snapshot();
    const dirtyDocument = updateCurrentDocumentContent(
      document,
      snapshot.content,
      snapshot.breaks
    );
    expect(isCurrentDocumentDirty(dirtyDocument)).toBe(true);

    const saved = applyStandaloneSaveResult(dirtyDocument, {
      kind: "saved",
      path: "C:/new.md",
      encoding: "utf8",
      lineEnding: "lf",
      byteLength: snapshot.content.length,
      characterLength: snapshot.content.length
    });

    expect(saved.path).toBe("C:/new.md");
    expect(saved.savedLineEndingBreaks).toBe(dirtyDocument.lineEndingBreaks);
    expect(isCurrentDocumentDirty(saved)).toBe(false);
  });

  it("stays dirty across Undo/Redo unless both content and tracked breaks match the saved snapshot", () => {
    const raw = "A\r\nB\r\nC";
    const document = createFileDocument({ path: "C:/x.md", content: raw });
    const editor = driveLineEndingField(raw);

    // Edit: delete the first (crlf) break.
    editor.dispatch({ changes: { from: 1, to: 2 } });
    let snapshot = editor.snapshot();
    let candidate = updateCurrentDocumentContent(
      document,
      snapshot.content,
      snapshot.breaks
    );
    expect(isCurrentDocumentDirty(candidate)).toBe(true); // content differs

    // Undo the deletion: both content and breaks must exactly restore via
    // the resetLineEndingBreaksEffect snapshot mechanism.
    undo(editor);
    snapshot = editor.snapshot();
    candidate = updateCurrentDocumentContent(
      document,
      snapshot.content,
      snapshot.breaks
    );
    expect(candidate.content).toBe(document.savedContent);
    expect(isCurrentDocumentDirty(candidate)).toBe(false);

    // Redo re-applies the deletion: content changes again, so dirty again.
    redo(editor);
    snapshot = editor.snapshot();
    candidate = updateCurrentDocumentContent(
      document,
      snapshot.content,
      snapshot.breaks
    );
    expect(isCurrentDocumentDirty(candidate)).toBe(true);
  });

  it("is dirty when content exactly matches the saved snapshot but the tracked break kinds are structurally different", () => {
    const raw = "A\r\nB\nC";
    const document = createFileDocument({ path: "C:/x.md", content: raw });

    const contentOnlyMatch = updateCurrentDocumentContent(
      document,
      document.savedContent,
      // Same content, but a structurally different break set (lf/lf
      // instead of the saved crlf/lf) — e.g. what a document-switch-back
      // with reconciled breaks, or a future undo edge case, could produce.
      driveLineEndingField("A\nB\nC").snapshot().breaks
    );

    expect(contentOnlyMatch.content).toBe(document.savedContent);
    expect(isCurrentDocumentDirty(contentOnlyMatch)).toBe(true);
  });
});

describe("editor.lineEnding.expected never affects dirty state or document content (#252)", () => {
  it("leaves content, savedContent, and the tracked/saved break sets byte- and reference-identical across every possible expected kind", () => {
    const raw = "A\r\nB\nC";
    const document = createFileDocument({ path: "C:/x.md", content: raw });
    expect(isCurrentDocumentDirty(document)).toBe(false);

    const contentBefore = document.content;
    const savedContentBefore = document.savedContent;
    const breaksBefore = document.lineEndingBreaks;
    const savedBreaksBefore = document.savedLineEndingBreaks;

    // editor.lineEnding.expected is a Settings value, not a CurrentDocument
    // field — computeLineEndingDistribution (the only #252 consumer that
    // takes an expected kind) is a pure read: calling it with every
    // possible value must never mutate the document it read from.
    for (const expectedKind of ["lf", "crlf", "cr"] as const) {
      computeLineEndingDistribution(document.lineEndingBreaks, expectedKind);

      expect(document.content).toBe(contentBefore);
      expect(document.savedContent).toBe(savedContentBefore);
      expect(document.lineEndingBreaks).toBe(breaksBefore);
      expect(document.savedLineEndingBreaks).toBe(savedBreaksBefore);
      expect(isCurrentDocumentDirty(document)).toBe(false);
    }
  });
});
