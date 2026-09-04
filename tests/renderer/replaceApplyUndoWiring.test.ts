import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * #386 - Open Documents Replace apply / Undo wiring.
 *
 * Investigation conclusion, pinned as assertions:
 *  - Pergamum reuses ONE CodeMirror EditorView across every open Markdown tab
 *    (#250); inactive tabs keep only a text string, no EditorView/EditorState.
 *  - So the active document's replace can be a real `input.replace` transaction
 *    (one undo step); inactive documents' replace is a plain content swap and
 *    is not on any undo stack. Per-tab history would be an editor-architecture
 *    change beyond #386.
 */

const appSource = readFileSync("src/renderer/App.tsx", "utf8");
const markdownEditorSource = readFileSync(
  "src/renderer/MarkdownEditor.tsx",
  "utf8"
);

describe("Open Documents Replace apply path (#386)", () => {
  it("routes the active Markdown buffer's replace through a single input.replace transaction", () => {
    expect(markdownEditorSource).toContain("applyReplaceInBufferChanges");
    expect(markdownEditorSource).toContain('"input.replace"');
    // The active-editor branch of the apply loop uses the tagged method.
    expect(appSource).toContain(
      "paragraphIndentControllerRef.current?.applyReplaceInBufferChanges("
    );
  });

  it("keeps every document's replacements in one change list (no per-edit offset correction)", () => {
    const applyIndex = appSource.indexOf(
      "function applyOpenDocumentsReplaceSelection("
    );
    expect(applyIndex).toBeGreaterThan(-1);
    const applyBlock = appSource.slice(applyIndex, applyIndex + 4000);
    // ascending, overlap-free change list built once per document
    expect(applyBlock).toContain("changeSpecs");
    expect(applyBlock).toContain("ChangeSet.of(");
    // inactive tabs: content string + mapped line-ending breaks, no transaction
    expect(applyBlock).toContain("updateCurrentDocumentContent(");
    expect(applyBlock).toContain(".lineEndingBreaks.map(");
  });

  it("the Open Documents apply path never writes a file", () => {
    const applyIndex = appSource.indexOf(
      "function applyOpenDocumentsReplaceSelection("
    );
    const applyBlock = appSource.slice(applyIndex, applyIndex + 4000);
    expect(applyBlock).not.toContain("writeMarkdown");
    expect(applyBlock).not.toContain("saveProjectDocument");
    expect(applyBlock).not.toContain("markCurrentDocumentSaved");
  });
});

describe("single shared EditorView architecture (#250) - the reason inactive-tab replace has no undo", () => {
  it("MarkdownEditor creates its EditorView once and swaps the document on tab switch", () => {
    // One mount-only EditorView.
    expect(markdownEditorSource).toContain("viewRef.current = null;");
    expect(markdownEditorSource).toContain("const view = new EditorView({");
    // Tab switch replaces the whole document via documentSwitchTransactionSpec.
    expect(markdownEditorSource).toContain("documentSwitchTransactionSpec(");
  });

  it("the document-switch transaction is excluded from undo history", () => {
    const fieldSource = readFileSync(
      "src/renderer/editorLineEndingField.ts",
      "utf8"
    );
    expect(fieldSource).toContain("Transaction.addToHistory.of(false)");
  });
});
