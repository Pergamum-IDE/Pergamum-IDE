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

import { Prec, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

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

type MarkdownToolbarShortcutTrigger =
  | "bold"
  | "italic"
  | "strikethrough"
  | "heading"
  | "link"
  | "horizontalRule"
  | "codeBlock";

function matchMarkdownToolbarShortcutTrigger(
  event: KeyboardEvent
): MarkdownToolbarShortcutTrigger | null {
  if (event.altKey || !(event.ctrlKey || event.metaKey)) {
    return null;
  }

  const key = event.key.toLowerCase();

  if (event.shiftKey) {
    switch (key) {
      case "x":
        return "strikethrough";
      case "l":
        return "horizontalRule";
      case "b":
        return "codeBlock";
      default:
        return null;
    }
  }

  switch (key) {
    case "b":
      return "bold";
    case "i":
      return "italic";
    case "k":
      return "link";
    case "l":
      return "heading";
    default:
      return null;
  }
}

export function createMarkdownToolbarShortcutKeymapExtension(input?: {
  readonly getConfig?: () => MarkdownEditorToolbarShortcutConfig | null;
}): Extension {
  let localComposing = false;

  const getConfig =
    input?.getConfig ?? getCurrentMarkdownToolbarShortcutConfig;

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
        const trigger = matchMarkdownToolbarShortcutTrigger(event);
        if (!trigger) {
          return false;
        }

        const config = getConfig();
        if (!config || !config.isEnabled) {
          return false;
        }

        if (event.isComposing || view.composing || localComposing) {
          return false;
        }

        if (view.state.readOnly) {
          return false;
        }

        event.preventDefault();

        switch (trigger) {
          case "bold":
            config.applyBold();
            break;
          case "italic":
            config.applyItalic();
            break;
          case "strikethrough":
            config.applyStrikethrough();
            break;
          case "heading":
            config.requestOpenHeadingSelector();
            break;
          case "horizontalRule":
            config.insertHorizontalRule();
            break;
          case "codeBlock":
            config.insertCodeBlock();
            break;
          case "link": {
            const selection = view.state.selection.main;
            const selectedText = view.state.sliceDoc(
              selection.from,
              selection.to
            );
            config.requestOpenLinkDialog(selectedText, view.contentDOM);
            break;
          }
        }

        return true;
      }
    })
  );
}
