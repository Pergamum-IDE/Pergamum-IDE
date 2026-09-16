import { Prec, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

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
 * Trigger check for Ctrl+. / Cmd+.
 */
export function isEmphasisMarkShortcutTrigger(event: KeyboardEvent): boolean {
  return (
    !event.altKey &&
    !event.shiftKey &&
    (event.ctrlKey || event.metaKey) &&
    (event.key === "." || event.code === "Period")
  );
}

export function createEmphasisMarkKeymapExtension(input?: {
  readonly getConfig?: () => MarkdownEditorEmphasisMarkShortcutConfig | null;
}): Extension {
  let localComposing = false;

  const getConfig = input?.getConfig ?? getCurrentEmphasisMarkShortcutConfig;

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
        if (!isEmphasisMarkShortcutTrigger(event)) {
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
        config.requestOpenEmphasisMarkDialog({
          selectedText,
          selection: { from: selection.from, to: selection.to }
        });
        return true;
      }
    })
  );
}
