import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * #386 - Project Documents Replace wiring (source-scan; the full flow needs an
 * App harness). Pins the safety-critical shape of the apply path.
 */

const appSource = readFileSync("src/renderer/App.tsx", "utf8");

function functionBlock(name: string): string {
  const start = appSource.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  // Big enough to cover the whole function; the assertions are `toContain`.
  return appSource.slice(start, start + 6000);
}

describe("openReplacePreviewForProjectDocuments (#386)", () => {
  const open = functionBlock("openReplacePreviewForProjectDocuments");

  it("runs the dirty-open-document gate before anything else", () => {
    expect(open).toContain("isCurrentEditorDirty(openDocument.editor)");
    expect(open).toContain('translate("search.replace.unsavedGate.title")');
    // The gate returns before any candidate generation / dialog open.
    expect(open.indexOf("search.replace.unsavedGate")).toBeLessThan(
      open.indexOf("setReplacePreviewDialogState(")
    );
  });

  it("blocks empty find text and read-only projects, and preflights regex", () => {
    expect(open).toContain('replaceValidationInfoDialog("search.replace.emptyFindText")');
    expect(open).toContain("isReadOnlyProject");
    expect(open).toContain('"search.replace.invalidRegex"');
  });

  it("opens the dialog in the projectDocuments scope, loading", () => {
    expect(open).toContain('scope: "projectDocuments"');
    expect(open).toContain("loading: true");
    expect(open).toContain("generateProjectReplacePreviewCandidates(");
  });
});

describe("generateProjectReplacePreviewCandidates (#386)", () => {
  const gen = functionBlock("generateProjectReplacePreviewCandidates");

  it("reads project files from disk and remembers each file's base text", () => {
    expect(gen).toContain(
      "window.pergamum.projects.readProjectDocument("
    );
    expect(gen).toContain("normalizeLineEndings(raw)");
    expect(gen).toContain("replaceProjectApplyBaseRef.current = baseByRelativePath");
  });

  it("reuses the shared candidate generator and applies the 50k safety ceiling", () => {
    expect(gen).toContain("generateOpenDocumentsReplaceCandidates(");
    expect(gen).toContain("REPLACE_PREVIEW_CANDIDATE_LIMIT");
  });

  it("discards a result that arrives after Cancel / re-open", () => {
    expect(gen).toContain(
      "replacePreviewGenerationRef.current !== generation"
    );
  });
});

describe("applyProjectReplaceSelection (#386)", () => {
  const apply = functionBlock("applyProjectReplaceSelection");

  it("re-reads each file and refuses to overwrite one changed after the preview", () => {
    expect(apply).toContain(
      "window.pergamum.projects.readProjectDocument(relativePath)"
    );
    expect(apply).toContain("!== base.baseText");
    expect(apply).toContain("changedFileCount");
  });

  it("applies only the enabled candidates, offset-safe, then atomic-saves", () => {
    expect(apply).toContain("enabled.has(candidate.id)");
    expect(apply).toContain("applyReplacementEditsToText(");
    expect(apply).toContain("serializeLineEndings(");
    expect(apply).toContain(
      "window.pergamum.projects.saveProjectDocument("
    );
  });

  it("aggregates success / partial / total failure into a ReplaceApplyResult, not a separate dialog/toast", () => {
    expect(apply).toContain('kind: "success"');
    expect(apply).toContain('kind: "partialFailure"');
    expect(apply).toContain('kind: "allFailure"');
    // Polish round: the result lands in dialog state, not confirmDialog/setStatus.
    expect(apply).not.toContain("confirmDialog({");
    expect(apply).not.toContain("setStatus({");
  });

  it("syncs open clean buffers and re-runs the search after a successful save", () => {
    expect(apply).toContain("syncOpenCleanBuffersAfterProjectReplace(");
    expect(apply).toContain("setSearchInvalidationToken(");
  });

  it("never closes the dialog itself - only the user's 閉じる (after applyResult) does", () => {
    expect(apply).not.toContain("closeReplacePreviewDialog()");
  });

  it("goes through an explicit applying:true transition before doing any file I/O", () => {
    const applyingIndex = apply.indexOf("applying: true");
    const readIndex = apply.indexOf(
      "window.pergamum.projects.readProjectDocument(relativePath)"
    );
    expect(applyingIndex).toBeGreaterThan(-1);
    expect(readIndex).toBeGreaterThan(-1);
    expect(applyingIndex).toBeLessThan(readIndex);
  });
});

describe("applyReplacePreviewSelection dispatcher (#386)", () => {
  const dispatcher = functionBlock("applyReplacePreviewSelection");

  it("refuses to start a second project apply while one is already applying or completed", () => {
    expect(dispatcher).toContain("state.applying || state.applyResult !== null");
  });
});

describe("ReplacePreviewDialog wiring for the applying / result props (#386)", () => {
  it("passes applying and applyResult from dialog state through to the component", () => {
    const renderIndex = appSource.indexOf("<ReplacePreviewDialog");
    expect(renderIndex).toBeGreaterThan(-1);
    const renderBlock = appSource.slice(renderIndex, renderIndex + 800);
    expect(renderBlock).toContain("applying={replacePreviewDialogState.applying}");
    expect(renderBlock).toContain(
      "applyResult={replacePreviewDialogState.applyResult}"
    );
  });
});

describe("syncOpenCleanBuffersAfterProjectReplace (#386)", () => {
  const sync = functionBlock("syncOpenCleanBuffersAfterProjectReplace");

  it("only touches CLEAN buffers, keeps them clean, and never marks anything dirty", () => {
    expect(sync).toContain("isCurrentEditorDirty(openDocument.editor)");
    expect(sync).toContain("markCurrentDocumentSaved(");
  });

  it("refreshes the active view with a non-undoable disk sync", () => {
    expect(sync).toContain("syncBufferToDiskContent");
    const markdownEditorSource = readFileSync(
      "src/renderer/MarkdownEditor.tsx",
      "utf8"
    );
    // The controller method dispatches the document-switch spec (addToHistory
    // false), so the sync is not on the undo stack.
    const methodStart = markdownEditorSource.indexOf(
      "syncBufferToDiskContent: (fullText, breaks) =>"
    );
    expect(methodStart).toBeGreaterThan(-1);
    expect(
      markdownEditorSource.slice(methodStart, methodStart + 400)
    ).toContain("documentSwitchTransactionSpec(");
  });
});
