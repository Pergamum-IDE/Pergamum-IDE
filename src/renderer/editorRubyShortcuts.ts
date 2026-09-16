import { Prec, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

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
 * Trigger check for Ctrl+R / Cmd+R.
 */
export function isRubyShortcutTrigger(event: KeyboardEvent): boolean {
  return (
    !event.altKey &&
    !event.shiftKey &&
    (event.ctrlKey || event.metaKey) &&
    (event.key === "r" || event.key === "R" || event.code === "KeyR")
  );
}

export function createRubyKeymapExtension(input?: {
  readonly getConfig?: () => MarkdownEditorRubyShortcutConfig | null;
}): Extension {
  let localComposing = false;

  const getConfig = input?.getConfig ?? getCurrentRubyShortcutConfig;

  return Prec.highest(
    EditorView.domEventHandlers({
      compositionstart(): boolean {
        localComposing = true;
        return false;
      },
      compositionend(): boolean {
        localComposing = false;
        return false;
      },
      keydown(event, view): boolean {
        if (!isRubyShortcutTrigger(event)) {
          return false;
        }

        const config = getConfig();
        if (!config) {
          return false;
        }

        if (event.isComposing || view.composing || localComposing) {
          return false;
        }

        if (view.state.readOnly) {
          event.preventDefault();
          config.notifyReadOnly();
          return true;
        }

        const selection = view.state.selection.main;
        if (selection.empty) {
          event.preventDefault();
          config.notifyNoSelection();
          return true;
        }

        const fromLine = view.state.doc.lineAt(selection.from).number;
        const toLine = view.state.doc.lineAt(selection.to).number;
        if (fromLine !== toLine) {
          event.preventDefault();
          config.notifyMultiLine();
          return true;
        }

        const selectedText = view.state.sliceDoc(selection.from, selection.to);
        event.preventDefault();
        config.requestOpenRubyDialog({
          selectedText,
          selection: { from: selection.from, to: selection.to }
        });
        return true;
      }
    })
  );
}
