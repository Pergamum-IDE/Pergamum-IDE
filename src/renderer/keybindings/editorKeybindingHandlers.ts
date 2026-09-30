/**
 * #641: the editor's commandId -> callback bridge, merged from the families
 * that still own their own published-config slots. Keys are NOT defined here;
 * they come from the keybinding catalog (see codeMirrorKeymap.ts).
 */

import { editorCommandIds } from "../../shared/commandIds";
import { createEmphasisMarkKeybindingHandlers } from "../editorEmphasisShortcuts";
import {
  MARKDOWN_TOOLBAR_KEYBINDING_COMMAND_IDS,
  createMarkdownToolbarKeybindingHandlers
} from "../editorMarkdownToolbarShortcuts";
import {
  RENAME_DOCUMENT_COMMAND_ID,
  createRenameKeybindingHandlers
} from "../editorRenameShortcut";
import { createRubyKeybindingHandlers } from "../editorRubyShortcuts";
import {
  ACTIVE_FIND_OPEN_COMMAND_ID,
  ACTIVE_FIND_REPLACE_COMMAND_ID,
  createActiveFindKeybindingHandlers
} from "../find/activeFindKeymapExtension";
import { GLOSSARY_COMPLETION_COMMAND_ID } from "../glossaryCompletion";
import {
  createGlossaryCompletionKeybindingHandlers,
  type MarkdownEditorGlossaryCompletionConfig
} from "../glossaryCompletionExtension";
import {
  TAB_CAPTURE_TOGGLE_COMMAND_ID,
  createTabCaptureToggleKeybindingHandlers
} from "../tabCaptureKeymapExtension";
import {
  GLOSSARY_SELECTION_COMMAND_ID,
  createGlossarySelectionKeybindingHandlers
} from "../glossarySelectionShortcutExtension";
import type { EditorKeybindingHandlers } from "./codeMirrorKeymap";

/**
 * Every catalog command the dispatched CodeMirror editor keymap handles.
 * Editor-scope commands missing here are handled elsewhere: F3 / Shift+F3
 * Find next / previous is a window listener (#643), and `editor.indent` /
 * `editor.outdent` are built into the base CodeMirror setup
 * (markdownEditorCodeMirrorSetup.ts) through CodeMirror's ordinary keymap.
 */
export const EDITOR_KEYMAP_COMMAND_IDS: readonly string[] = [
  ...MARKDOWN_TOOLBAR_KEYBINDING_COMMAND_IDS,
  editorCommandIds.insertRuby,
  editorCommandIds.insertEmphasisMark,
  GLOSSARY_SELECTION_COMMAND_ID,
  ACTIVE_FIND_OPEN_COMMAND_ID,
  ACTIVE_FIND_REPLACE_COMMAND_ID,
  GLOSSARY_COMPLETION_COMMAND_ID,
  TAB_CAPTURE_TOGGLE_COMMAND_ID,
  RENAME_DOCUMENT_COMMAND_ID
];

/** Commands whose handled key event must not propagate (F2 rename). */
export const EDITOR_KEYMAP_STOP_PROPAGATION_COMMAND_IDS: readonly string[] = [
  RENAME_DOCUMENT_COMMAND_ID
];

export interface DefaultEditorKeybindingHandlersOptions {
  /** Per-editor glossary completion context. */
  readonly glossaryCompletion?: {
    readonly getConfig: () => MarkdownEditorGlossaryCompletionConfig | null;
    readonly isReadOnly: () => boolean;
  };
  /** Per-editor Active Find diagnostics context. */
  readonly activeFindDiagnostics?: {
    readonly editorInstanceId: string;
    readonly expectActiveFindSurface: boolean;
  };
}

/** Handlers reading the module-level "current config" slots. */
export function createDefaultEditorKeybindingHandlers(
  options: DefaultEditorKeybindingHandlersOptions = {}
): EditorKeybindingHandlers {
  return {
    ...createMarkdownToolbarKeybindingHandlers(),
    ...createRubyKeybindingHandlers(),
    ...createEmphasisMarkKeybindingHandlers(),
    ...createGlossarySelectionKeybindingHandlers(),
    ...createActiveFindKeybindingHandlers(
      options.activeFindDiagnostics === undefined
        ? undefined
        : { diagnostics: options.activeFindDiagnostics }
    ),
    ...(options.glossaryCompletion === undefined
      ? {}
      : createGlossaryCompletionKeybindingHandlers(options.glossaryCompletion)),
    ...createTabCaptureToggleKeybindingHandlers(),
    ...createRenameKeybindingHandlers()
  };
}
