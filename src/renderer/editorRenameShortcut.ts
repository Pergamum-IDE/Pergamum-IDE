import type { EditorKeybindingHandlers } from "./keybindings/codeMirrorKeymap";

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

export const RENAME_DOCUMENT_COMMAND_ID = "editor.document.rename";

/**
 * #587 Slice 3 / #641: commandId -> handler for the F2 editor-body rename of
 * the active document (the key comes from the keybinding catalog). Inert when
 * no enabled config is published. The handled event also stops propagating so
 * File Explorer's own F2 does not see it. File Explorer's F2 rename is a
 * separate, non-catalog shortcut.
 */
export function createRenameKeybindingHandlers(
  getConfig: () => MarkdownEditorRenameShortcutConfig | null = getCurrentRenameShortcutConfig
): EditorKeybindingHandlers {
  return {
    [RENAME_DOCUMENT_COMMAND_ID]: (): boolean => {
      const config = getConfig();
      if (!config || !config.isEnabled) {
        return false;
      }
      config.requestRenameActiveDocument();
      return true;
    }
  };
}
