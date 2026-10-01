/**
 * #424 — CodeMirror wiring that opens the Pergamum active-document Find /
 * Replace panel from Ctrl+F (Mod-f, Search mode) and Ctrl+H (Mod-h, Replace
 * mode) INSTEAD of `@codemirror/search`'s native bottom search panel.
 *
 * The extension never touches React state directly. It routes Ctrl+F / Ctrl+H
 * through a MODULE-LEVEL "current Active Find config" slot
 * ({@link publishCurrentActiveFindConfig}), NOT a mount-local ref.
 *
 * #425 follow-up — why module-level: the keymap is baked into each document's
 * `EditorState`, and those states are cached in an App-owned Map that OUTLIVES
 * a MarkdownEditor / EditorSurface mount (a Settings-tab round trip unmounts
 * the whole editor; the cache is restored verbatim on return). A keymap
 * closure that captured a mount-local ref kept calling the PREVIOUS
 * `MarkdownEditorSurface`'s `requestOpen` after such a remount — a shortcut
 * fired from an unmounted editor and `requestOpen` was routed to a dead
 * surface, while the live surface stayed `findOpen:false`. A single module
 * slot is sufficient because at most ONE active-document Find surface
 * (EditorSurface's `MarkdownEditorSurface` → its one `MarkdownEditor`) is ever
 * mounted; every other `MarkdownEditor` (e.g. the Glossary description field)
 * publishes nothing, so the shortcuts stay inert there.
 *
 * IME safety mirrors the Ctrl+Space trigger in `glossaryCompletionExtension.ts`:
 * the handler declines (no `preventDefault`, no open) while an IME composition
 * is in progress, checked via `KeyboardEvent.isComposing`,
 * `EditorView.composing`, and a local `compositionstart`/`compositionend` flag.
 *
 * `Prec.highest` puts this keydown handler ahead of the base keymap; the base
 * setup ALSO drops `Mod-f` / `F3` / `Mod-g` from `searchKeymap` (see
 * `markdownEditorCodeMirrorSetup.ts`), so the native panel can never open from
 * the keyboard even if precedence ever changed. `Mod-h` is unbound in the
 * base keymap on Windows / Linux (the emacs-style `Ctrl-h` is `mac:` only).
 */

import type { EditorView } from "@codemirror/view";
import type { PergamumPlatform } from "../../shared/keybindings";
import type { EditorKeybindingHandlers } from "../keybindings/codeMirrorKeymap";
import {
  eventMatchesCatalogCommand,
  type CatalogKeyEvent
} from "../keybindings/catalogKeyMatch";
import { getRuntimePlatform } from "../platformModifier";
import { logRendererDebugEvent } from "../debugLog";

export type ActiveFindPanelMode = "search" | "replace";

export interface MarkdownEditorActiveFindConfig {
  /**
   * Open (or switch) the Find panel for the active document. `mode` is
   * `"search"` for Ctrl+F, `"replace"` for Ctrl+H. `initialQuery` is the
   * editor's current single-line selection (if any) — the panel seeds its
   * search box with it.
   */
  readonly requestOpen: (
    mode: ActiveFindPanelMode,
    initialQuery: string
  ) => void;
}

/** Longest editor selection still used to seed the search box. */
const MAX_SELECTION_SEED_LENGTH = 200;

/**
 * #425 follow-up — the mount-resilient "current Active Find target".
 *
 * `config` is the live `MarkdownEditorSurface`'s stable `requestOpen` config.
 * `editorInstanceId` is an opaque per-mount id, carried only into debug logs.
 * Published by the one `MarkdownEditor` that receives an `activeFind` prop;
 * cleared on that editor's unmount.
 */
export interface CurrentActiveFindBinding {
  readonly config: MarkdownEditorActiveFindConfig;
  readonly editorInstanceId: string;
}

let currentActiveFindBinding: CurrentActiveFindBinding | null = null;

/** Make `binding` THE current Ctrl+F / Ctrl+H target. */
export function publishCurrentActiveFindConfig(
  binding: CurrentActiveFindBinding
): void {
  currentActiveFindBinding = binding;
  logRendererDebugEvent({
    level: "debug",
    event: "activeFind.binding.published",
    details: { activeFindEditorInstanceId: binding.editorInstanceId }
  });
}

/**
 * Clear the current target, but only if it is still `config` — so a later
 * mount's publish is never wiped by an earlier mount's (async) teardown.
 */
export function unpublishCurrentActiveFindConfig(
  config: MarkdownEditorActiveFindConfig
): void {
  if (currentActiveFindBinding?.config === config) {
    const editorInstanceId = currentActiveFindBinding.editorInstanceId;
    currentActiveFindBinding = null;
    logRendererDebugEvent({
      level: "debug",
      event: "activeFind.binding.unpublished",
      details: { activeFindEditorInstanceId: editorInstanceId }
    });
  }
}

/** The current Active Find config, or `null` when no Find surface is mounted. */
export function getCurrentActiveFindConfig(): MarkdownEditorActiveFindConfig | null {
  return currentActiveFindBinding?.config ?? null;
}

let editorInstanceCounter = 0;

/** Opaque per-MarkdownEditor-mount id (e.g. `"editor-4"`) for debug logs only. */
export function nextActiveFindEditorInstanceId(): string {
  editorInstanceCounter += 1;
  return `editor-${editorInstanceCounter}`;
}

/**
 * `"search"` for the catalog's `editor.find.open` key and `"replace"` for
 * `editor.find.replace.open` (Mod-f / Mod-h, darwin Mod-Alt-f - Cmd+H hides
 * the app there). Used where the shortcut is recognized outside the editor
 * keymap (the Find panel's own inputs). Mod is Ctrl on win32/linux and Cmd on
 * darwin; a bare Ctrl+F / Ctrl+H on darwin is an OS text-editing key and is
 * not consumed (#636, #641).
 */
export function activeFindModeForKeyEvent(
  event: KeyboardEvent | CatalogKeyEvent,
  platform: PergamumPlatform = getRuntimePlatform()
): ActiveFindPanelMode | null {
  if (eventMatchesCatalogCommand(event, "editor.find.open", platform)) {
    return "search";
  }
  if (eventMatchesCatalogCommand(event, "editor.find.replace.open", platform)) {
    return "replace";
  }
  return null;
}

export const ACTIVE_FIND_OPEN_COMMAND_ID = "editor.find.open";
export const ACTIVE_FIND_REPLACE_COMMAND_ID = "editor.find.replace.open";

/**
 * #641: commandId -> existing `requestOpen` callback for Find / Replace. The
 * keys come from the keybinding catalog.
 */
export function createActiveFindKeybindingHandlers(input?: {
  /**
   * Override for the current-config lookup. Production passes nothing — the
   * handlers read the module-level {@link getCurrentActiveFindConfig} slot.
   * Unit tests pass an explicit accessor to isolate from that global.
   */
  readonly getConfig?: () => MarkdownEditorActiveFindConfig | null;
  /**
   * Diagnostics context. `editorInstanceId` is the id of the MarkdownEditor
   * that built these handlers. `expectActiveFindSurface` is `true` only for
   * the editor that IS the active-document Find surface — so a
   * `activeFind.shortcut.routeFailed` debug log fires only when routing
   * genuinely broke, never for the (by design inert) Glossary description
   * field. Absent in unit tests and harmless when omitted.
   */
  readonly diagnostics?: {
    readonly editorInstanceId: string;
    readonly expectActiveFindSurface: boolean;
  };
}): EditorKeybindingHandlers {
  const getConfig = input?.getConfig ?? getCurrentActiveFindConfig;
  const diagnostics = input?.diagnostics;

  const open =
    (mode: ActiveFindPanelMode) =>
    (view: EditorView): boolean => {
      const config = getConfig();

      if (!config) {
        // #425 follow-up: only a genuine routing failure — the editor that
        // should own the Active Find binding somehow has none. The Glossary
        // description field (expectActiveFindSurface:false) is silently inert.
        if (diagnostics?.expectActiveFindSurface) {
          logRendererDebugEvent({
            level: "warn",
            event: "activeFind.shortcut.routeFailed",
            details: {
              reason: "no_active_find_binding",
              activeFindMode: mode,
              activeFindEditorInstanceId: diagnostics.editorInstanceId
            }
          });
        }
        return false;
      }

      const selection = view.state.selection.main;
      const selectedText = selection.empty
        ? ""
        : view.state.sliceDoc(selection.from, selection.to);
      const initialQuery =
        selectedText.length > 0 &&
        selectedText.length <= MAX_SELECTION_SEED_LENGTH &&
        !selectedText.includes("\n")
          ? selectedText
          : "";

      config.requestOpen(mode, initialQuery);
      return true;
    };

  return {
    [ACTIVE_FIND_OPEN_COMMAND_ID]: open("search"),
    [ACTIVE_FIND_REPLACE_COMMAND_ID]: open("replace")
  };
}
