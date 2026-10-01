/**
 * #529: Ctrl+B / Ctrl+I / Ctrl+Shift+X / Ctrl+K / Ctrl+L for the Markdown
 * toolbar commands (Bold / Italic / Strikethrough / Insert link / Insert
 * heading).
 *
 * Same module-level-slot shape as `editorEmphasisShortcuts.ts` and
 * `activeFindKeymapExtension.ts` — the CodeMirror `EditorState` that backs a
 * document is cached in an App-owned Map that outlives an
 * EditorSurface/MarkdownEditor remount, so a keydown handler baked into that
 * cached state must read the current config from a module-level slot rather
 * than a closed-over ref (see `activeFindKeymapExtension.ts`'s header
 * comment for the full rationale).
 *
 * `isEnabled` folds in every gate the toolbar buttons themselves use
 * (Markdown document, not a special tab, not read-only) — it is a plain
 * boolean, not a callback, because the whole config object is rebuilt
 * (and republished) whenever that gate's value changes.
 */

import type { EditorView } from "@codemirror/view";
import { editorCommandIds } from "../shared/commandIds";
import type { EditorKeybindingHandlers } from "./keybindings/codeMirrorKeymap";

export interface MarkdownEditorToolbarShortcutConfig {
  readonly isEnabled: boolean;
  readonly applyBold: () => void;
  readonly applyItalic: () => void;
  readonly applyStrikethrough: () => void;
  readonly requestOpenHeadingSelector: () => void;
  readonly requestOpenLinkDialog: (
    selectedText: string,
    opener: Element | null
  ) => void;
  /** #531 Ctrl+Shift+L */
  readonly insertHorizontalRule: () => void;
  /** #531 Ctrl+Shift+B */
  readonly insertCodeBlock: () => void;
  /** #601 Ctrl+Shift+Q */
  readonly insertBlockquote: () => void;
  /** #535 Ctrl+Shift+I */
  readonly requestInsertImage: () => void;
  /** #603 Ctrl+T / Mod+T */
  readonly requestOpenTablePicker?: () => void;
  /** #606 Mod+Shift+C */
  readonly toggleSyntaxChecker?: () => void;
}

let currentMarkdownToolbarShortcutConfig: MarkdownEditorToolbarShortcutConfig | null =
  null;

export function publishCurrentMarkdownToolbarShortcutConfig(
  config: MarkdownEditorToolbarShortcutConfig
): void {
  currentMarkdownToolbarShortcutConfig = config;
}

export function unpublishCurrentMarkdownToolbarShortcutConfig(
  config: MarkdownEditorToolbarShortcutConfig
): void {
  if (currentMarkdownToolbarShortcutConfig === config) {
    currentMarkdownToolbarShortcutConfig = null;
  }
}

export function getCurrentMarkdownToolbarShortcutConfig(): MarkdownEditorToolbarShortcutConfig | null {
  return currentMarkdownToolbarShortcutConfig;
}

/**
 * #641: the catalog commands this family handles. The keys come from the
 * keybinding catalog (see keybindings/codeMirrorKeymap.ts), not from here.
 */
export const MARKDOWN_TOOLBAR_KEYBINDING_COMMAND_IDS: readonly string[] = [
  editorCommandIds.bold,
  editorCommandIds.italic,
  editorCommandIds.strikethrough,
  editorCommandIds.heading,
  editorCommandIds.link,
  editorCommandIds.insertHorizontalRule,
  editorCommandIds.insertCodeBlock,
  editorCommandIds.insertBlockquote,
  editorCommandIds.insertImage,
  editorCommandIds.insertTable,
  editorCommandIds.toggleSyntaxChecker
];

/**
 * commandId -> existing toolbar callback. Every handler keeps the former
 * gates: a published, enabled config (Markdown document, not a special tab)
 * and a writable editor. A gate that fails returns `false`, so the key falls
 * through untouched.
 */
export function createMarkdownToolbarKeybindingHandlers(
  getConfig: () => MarkdownEditorToolbarShortcutConfig | null = getCurrentMarkdownToolbarShortcutConfig
): EditorKeybindingHandlers {
  const run =
    (
      action: (
        config: MarkdownEditorToolbarShortcutConfig,
        view: EditorView
      ) => void
    ) =>
    (view: EditorView): boolean => {
      const config = getConfig();
      if (!config || !config.isEnabled) {
        return false;
      }
      if (view.state.readOnly) {
        return false;
      }
      action(config, view);
      return true;
    };

  return {
    [editorCommandIds.bold]: run((config) => config.applyBold()),
    [editorCommandIds.italic]: run((config) => config.applyItalic()),
    [editorCommandIds.strikethrough]: run((config) =>
      config.applyStrikethrough()
    ),
    [editorCommandIds.heading]: run((config) =>
      config.requestOpenHeadingSelector()
    ),
    [editorCommandIds.insertHorizontalRule]: run((config) =>
      config.insertHorizontalRule()
    ),
    [editorCommandIds.insertCodeBlock]: run((config) =>
      config.insertCodeBlock()
    ),
    [editorCommandIds.insertBlockquote]: run((config) =>
      config.insertBlockquote()
    ),
    [editorCommandIds.insertImage]: run((config) => config.requestInsertImage()),
    [editorCommandIds.insertTable]: run((config) =>
      config.requestOpenTablePicker?.()
    ),
    [editorCommandIds.toggleSyntaxChecker]: run((config) =>
      config.toggleSyntaxChecker?.()
    ),
    [editorCommandIds.link]: run((config, view) => {
      const selection = view.state.selection.main;
      const selectedText = view.state.sliceDoc(selection.from, selection.to);
      config.requestOpenLinkDialog(selectedText, view.contentDOM);
    })
  };
}
