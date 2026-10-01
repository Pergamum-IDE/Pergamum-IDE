import type { EditorView } from "@codemirror/view";
import { editorCommandIds } from "../shared/commandIds";
import type { EditorKeybindingHandlers } from "./keybindings/codeMirrorKeymap";

export interface MarkdownEditorEmphasisMarkShortcutConfig {
  readonly requestOpenEmphasisMarkDialog: (input: {
    selectedText: string;
    selection: { from: number; to: number };
  }) => void;
  readonly notifyNoSelection: () => void;
  readonly notifyReadOnly: () => void;
  readonly notifyMultiLine: () => void;
}

let currentEmphasisMarkShortcutConfig: MarkdownEditorEmphasisMarkShortcutConfig | null =
  null;

export function publishCurrentEmphasisMarkShortcutConfig(
  config: MarkdownEditorEmphasisMarkShortcutConfig
): void {
  currentEmphasisMarkShortcutConfig = config;
}

export function unpublishCurrentEmphasisMarkShortcutConfig(
  config: MarkdownEditorEmphasisMarkShortcutConfig
): void {
  if (currentEmphasisMarkShortcutConfig === config) {
    currentEmphasisMarkShortcutConfig = null;
  }
}

export function getCurrentEmphasisMarkShortcutConfig(): MarkdownEditorEmphasisMarkShortcutConfig | null {
  return currentEmphasisMarkShortcutConfig;
}

/**
 * #641: commandId -> existing callback for `editor.markdown.insertEmphasisMark`. The
 * key comes from the keybinding catalog. The former gates are kept: no
 * published config -> the key falls through; read-only / no selection /
 * multi-line selections notify and consume the key.
 */
export function createEmphasisMarkKeybindingHandlers(
  getConfig: () => MarkdownEditorEmphasisMarkShortcutConfig | null = getCurrentEmphasisMarkShortcutConfig
): EditorKeybindingHandlers {
  return {
    [editorCommandIds.insertEmphasisMark]: (view: EditorView): boolean => {
      const config = getConfig();
      if (!config) {
        return false;
      }

      if (view.state.readOnly) {
        config.notifyReadOnly();
        return true;
      }

      const selection = view.state.selection.main;
      if (selection.empty) {
        config.notifyNoSelection();
        return true;
      }

      const fromLine = view.state.doc.lineAt(selection.from).number;
      const toLine = view.state.doc.lineAt(selection.to).number;
      if (fromLine !== toLine) {
        config.notifyMultiLine();
        return true;
      }

      config.requestOpenEmphasisMarkDialog({
        selectedText: view.state.sliceDoc(selection.from, selection.to),
        selection: { from: selection.from, to: selection.to }
      });
      return true;
    }
  };
}
