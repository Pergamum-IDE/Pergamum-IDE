// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { applyBlockquoteToLine } from "../../src/shared/markdownBlockquoteMarkup";
import { CommandRegistry } from "../../src/shared/commandRegistry";
import { editorCommandIds } from "../../src/shared/commandIds";
import {
  createEditorCommands,
  createEditorCommandTitles
} from "../../src/renderer/editorCommands";

function createTestView(
  doc: string,
  selection?: { anchor: number; head?: number },
  readOnly = false
): EditorView {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const state = EditorState.create({
    doc,
    selection,
    extensions: [EditorState.readOnly.of(readOnly)]
  });
  return new EditorView({
    state,
    parent: container
  });
}

function runBlockquoteOnView(view: EditorView): boolean {
  if (view.state.facet(EditorState.readOnly)) {
    return false;
  }
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc;
  const firstLine = doc.lineAt(from);
  const lastLine = doc.lineAt(to);

  const changes = [];
  for (let lineNumber = firstLine.number; lineNumber <= lastLine.number; lineNumber++) {
    const line = doc.line(lineNumber);
    const newText = applyBlockquoteToLine(line.text);
    if (newText !== line.text) {
      changes.push({ from: line.from, to: line.to, insert: newText });
    }
  }

  if (changes.length === 0) {
    return true;
  }

  view.dispatch({
    changes,
    scrollIntoView: true,
    userEvent: "input.replace"
  });

  return true;
}

describe("editorBlockquoteCommand behavior", () => {
  it("prepends '> ' to current line when single cursor with no selection", () => {
    const view = createTestView("これは本文です。", { anchor: 2 });
    runBlockquoteOnView(view);
    expect(view.state.doc.toString()).toBe("> これは本文です。");
  });

  it("prepends '> ' to every line touched by multi-line selection", () => {
    const view = createTestView("一行目\n二行目\n三行目", { anchor: 0, head: 10 });
    runBlockquoteOnView(view);
    expect(view.state.doc.toString()).toBe("> 一行目\n> 二行目\n> 三行目");
  });

  it("prepends '> ' to empty line in selection", () => {
    const view = createTestView("", { anchor: 0 });
    runBlockquoteOnView(view);
    expect(view.state.doc.toString()).toBe("> ");
  });

  it("does not double-quote already quoted lines with '> '", () => {
    const view = createTestView("> 既存の引用", { anchor: 3 });
    runBlockquoteOnView(view);
    expect(view.state.doc.toString()).toBe("> 既存の引用");
  });

  it("does not double-quote already quoted lines with '>' (no space)", () => {
    const view = createTestView(">既存の引用", { anchor: 2 });
    runBlockquoteOnView(view);
    expect(view.state.doc.toString()).toBe(">既存の引用");
  });

  it("quotes only unquoted lines in a mixed multi-line selection", () => {
    const view = createTestView("> 既存引用\n未引用行\n> 別の引用", { anchor: 0, head: 15 });
    runBlockquoteOnView(view);
    expect(view.state.doc.toString()).toBe("> 既存引用\n> 未引用行\n> 別の引用");
  });

  it("no-ops and returns false when editor is read-only", () => {
    const view = createTestView("本文", { anchor: 0 }, true);
    const result = runBlockquoteOnView(view);
    expect(result).toBe(false);
    expect(view.state.doc.toString()).toBe("本文");
  });
});

describe("editor.markdown.insertBlockquote command registry & guards", () => {
  function setupRegistry(canInsertBlockquote: boolean) {
    const registry = new CommandRegistry();
    const mockController = {
      newFile: vi.fn(),
      canNewFile: () => true,
      openMarkdownDocument: vi.fn(),
      saveCurrentDocument: vi.fn(),
      saveCurrentDocumentAs: vi.fn(),
      saveAllDocuments: vi.fn(),
      canSaveCurrentDocument: () => true,
      canSaveCurrentDocumentAs: () => true,
      canSaveAllDocuments: () => true,
      closeEditor: vi.fn(),
      canCloseEditor: () => true,
      insertImage: vi.fn(),
      canInsertImage: () => true,
      insertBlockquote: vi.fn(),
      canInsertBlockquote: () => canInsertBlockquote,
      delegateNativeEditCommand: vi.fn(),
      canDelegateNativeEditCommand: () => true
    };
    const titles = createEditorCommandTitles((key) => key);
    for (const command of createEditorCommands(mockController, titles)) {
      registry.register(command);
    }
    return { registry, mockController };
  }

  it("is registered with command ID editor.markdown.insertBlockquote and visible in Command Palette", () => {
    const { registry } = setupRegistry(true);
    const cmd = registry.get(editorCommandIds.insertBlockquote);
    expect(cmd).not.toBeNull();
    expect(cmd?.id).toBe("editor.markdown.insertBlockquote");
    expect(cmd?.palette?.visible).toBeUndefined(); // default visible
  });

  it("executes when enabled (Markdown document or Glossary Description in read-write project)", async () => {
    const { registry, mockController } = setupRegistry(true);
    await registry.execute(editorCommandIds.insertBlockquote, { source: "commandPalette" });
    expect(mockController.insertBlockquote).toHaveBeenCalledOnce();
  });

  it("throws disabled error and does not execute when disabled (.txt, special tab, read-only, no active editor)", async () => {
    const { registry, mockController } = setupRegistry(false);
    await expect(
      registry.execute(editorCommandIds.insertBlockquote, { source: "commandPalette" })
    ).rejects.toThrow();
    expect(mockController.insertBlockquote).not.toHaveBeenCalled();
  });
});
