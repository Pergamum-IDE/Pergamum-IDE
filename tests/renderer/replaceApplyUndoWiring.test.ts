import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * #386/#393 - Open Documents Replace apply / Undo wiring.
 *
 * #386 shipped with a documented limitation: Pergamum reused ONE CodeMirror
 * EditorView across every open Markdown tab (#250), so only the ACTIVE
 * document's replace could land as a real `input.replace` transaction;
 * every other open buffer got a plain content-string swap with no undo
 * history at all.
 *
 * #387/#392 introduced a runtime-only per-document `EditorState` cache
 * (owned above MarkdownEditor, in App.tsx, so it survives tab switches and
 * even non-Markdown-tab excursions). #393 wires Open Documents Replace up to
 * that cache: an INACTIVE document with a cache entry whose doc still
 * matches the current content now ALSO gets a real `input.replace`
 * transaction — via `EditorState.update(...)` directly on the cached state,
 * no EditorView required — landing on that document's own undo history. Only
 * a document with no cache entry yet, or a stale one, falls back to the
 * plain content-splice path (still no undo history for that one document).
 */

const appSource = readFileSync("src/renderer/App.tsx", "utf8");
const markdownEditorSource = readFileSync(
  "src/renderer/MarkdownEditor.tsx",
  "utf8"
);

function applyOpenDocumentsReplaceSelectionBlock(): string {
  const applyIndex = appSource.indexOf(
    "function applyOpenDocumentsReplaceSelection("
  );
  expect(applyIndex).toBeGreaterThan(-1);
  // Generous enough to cover the whole function body (measured ~6.6KB) with
  // headroom for future small additions - assertions below are all
  // `toContain`, so a wider window never produces a false positive.
  return appSource.slice(applyIndex, applyIndex + 9000);
}

describe("Open Documents Replace apply path (#386/#393)", () => {
  it("routes the active Markdown buffer's replace through a single input.replace transaction", () => {
    expect(markdownEditorSource).toContain("applyReplaceInBufferChanges");
    expect(markdownEditorSource).toContain('"input.replace"');
    // The active-editor branch of the apply loop uses the tagged method.
    expect(appSource).toContain(
      "paragraphIndentControllerRef.current?.applyReplaceInBufferChanges("
    );
  });

  it("keeps every document's replacements in one change list (no per-edit offset correction)", () => {
    const applyBlock = applyOpenDocumentsReplaceSelectionBlock();
    // ascending, overlap-free change list built once per document, shared by
    // every branch below (active transaction / cached-state transaction /
    // content-splice fallback).
    expect(applyBlock).toContain("changeSpecs");
  });

  it("#393: an inactive document with a fresh cached EditorState gets a real input.replace transaction too", () => {
    const applyBlock = applyOpenDocumentsReplaceSelectionBlock();
    expect(applyBlock).toContain("markdownEditorDocumentStatesRef.current.get(");
    // The freshness gate (cached doc vs. current content) and the actual
    // `EditorState.update({..., userEvent: "input.replace"})` transaction
    // both live in the pure, independently-tested
    // applyChangesToCachedMarkdownEditorDocumentState helper - App.tsx just
    // calls it and branches on the result.
    expect(appSource).toContain("applyChangesToCachedMarkdownEditorDocumentState");
    expect(applyBlock).toContain(
      "applyChangesToCachedMarkdownEditorDocumentState("
    );
    expect(applyBlock).toContain('"input.replace"');
    // The advanced state is written back into the cache App.tsx owns, so a
    // later switch to this document restores exactly this history.
    expect(applyBlock).toContain("markdownEditorDocumentStatesRef.current.set(");
    expect(applyBlock).toContain("transactionResult.nextDocumentState");
  });

  it("falls back to a plain content-string swap (no undo history) only when there is no fresh cached state", () => {
    const applyBlock = applyOpenDocumentsReplaceSelectionBlock();
    // inactive tabs with no (or a stale) cache entry: content string + mapped
    // line-ending breaks, no transaction.
    expect(applyBlock).toContain("updateCurrentDocumentContent(");
    expect(applyBlock).toContain("ChangeSet.of(");
    expect(applyBlock).toContain(".lineEndingBreaks.map(");
  });

  it("the Open Documents apply path never writes a file", () => {
    const applyBlock = applyOpenDocumentsReplaceSelectionBlock();
    expect(applyBlock).not.toContain("writeMarkdown");
    expect(applyBlock).not.toContain("saveProjectDocument");
    expect(applyBlock).not.toContain("markCurrentDocumentSaved");
  });
});

describe("per-document EditorState cache (#387/#392) is what makes #393 possible", () => {
  it("MarkdownEditor creates its EditorView once and swaps/restores per-document EditorState on tab switch", () => {
    // One mount-only EditorView.
    expect(markdownEditorSource).toContain("viewRef.current = null;");
    expect(markdownEditorSource).toContain("const view = new EditorView({");
    // A genuine switch resolves (cache-restore or fresh-build) a per-document
    // state and swaps it in via setState - #250's single shared EditorView,
    // #387's per-document EditorState.
    expect(markdownEditorSource).toContain("view.setState(");
    expect(markdownEditorSource).toContain("resolveDocumentState(");
  });

  it("App.tsx owns the cache Map so it survives MarkdownEditor's own unmount (#392)", () => {
    expect(appSource).toContain("markdownEditorDocumentStatesRef");
    expect(appSource).toContain("documentStates={markdownEditorDocumentStatesRef.current}");
  });
});
