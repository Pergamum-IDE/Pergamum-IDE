import type { EditorView } from "@codemirror/view";
import { editorCommandIds } from "../shared/commandIds";
import type { EditorKeybindingHandlers } from "./keybindings/codeMirrorKeymap";

export interface MarkdownEditorRubyShortcutConfig {
  readonly requestOpenRubyDialog: (input: {
    selectedText: string;
    selection: { from: number; to: number };
  }) => void;
  readonly notifyNoSelection: () => void;
  readonly notifyReadOnly: () => void;
  readonly notifyMultiLine: () => void;
}

let currentRubyShortcutConfig: MarkdownEditorRubyShortcutConfig | null = null;

export function publishCurrentRubyShortcutConfig(
  config: MarkdownEditorRubyShortcutConfig
): void {
  currentRubyShortcutConfig = config;
}

export function unpublishCurrentRubyShortcutConfig(
  config: MarkdownEditorRubyShortcutConfig
): void {
  if (currentRubyShortcutConfig === config) {
    currentRubyShortcutConfig = null;
  }
}

export function getCurrentRubyShortcutConfig(): MarkdownEditorRubyShortcutConfig | null {
  return currentRubyShortcutConfig;
}

/**
 * #641: commandId -> existing callback for `editor.markdown.insertRuby`. The
 * key comes from the keybinding catalog. The former gates are kept: no
 * published config -> the key falls through; read-only / no selection /
 * multi-line selections notify and consume the key.
 */
export function createRubyKeybindingHandlers(
  getConfig: () => MarkdownEditorRubyShortcutConfig | null = getCurrentRubyShortcutConfig
): EditorKeybindingHandlers {
  return {
    [editorCommandIds.insertRuby]: (view: EditorView): boolean => {
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

      config.requestOpenRubyDialog({
        selectedText: view.state.sliceDoc(selection.from, selection.to),
        selection: { from: selection.from, to: selection.to }
      });
      return true;
    }
  };
}
