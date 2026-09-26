import { Prec, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export interface MarkdownEditorRenameShortcutConfig {
  readonly isEnabled: boolean;
  readonly requestRenameActiveDocument: () => void;
}

let currentRenameShortcutConfig: MarkdownEditorRenameShortcutConfig | null =
  null;

export function publishCurrentRenameShortcutConfig(
  config: MarkdownEditorRenameShortcutConfig
): void {
  currentRenameShortcutConfig = config;
}

export function unpublishCurrentRenameShortcutConfig(
  config: MarkdownEditorRenameShortcutConfig
): void {
  if (currentRenameShortcutConfig === config) {
    currentRenameShortcutConfig = null;
  }
}

export function getCurrentRenameShortcutConfig(): MarkdownEditorRenameShortcutConfig | null {
  return currentRenameShortcutConfig;
}

/**
 * #587 Slice 3: F2 shortcut trigger check for editor body rename.
 */
export function isRenameShortcutTrigger(event: KeyboardEvent): boolean {
  return (
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    event.key === "F2"
  );
}

export function createRenameShortcutKeymapExtension(input?: {
  readonly getConfig?: () => MarkdownEditorRenameShortcutConfig | null;
}): Extension {
  let localComposing = false;

  const getConfig = input?.getConfig ?? getCurrentRenameShortcutConfig;

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
      keydown(event): boolean {
        if (localComposing || event.isComposing) {
          return false;
        }

        if (!isRenameShortcutTrigger(event)) {
          return false;
        }

        const config = getConfig();
        if (!config || !config.isEnabled) {
          return false;
        }

        event.preventDefault();
        event.stopPropagation();
        config.requestRenameActiveDocument();
        return true;
      }
    })
  );
}
