/**
 * #641: CodeMirror editor keymap generated from the shared keybinding catalog.
 *
 * Keys come from the catalog (`resolveEditorKeybindings`), converted with
 * `toCodeMirrorKey`; behavior comes from existing callbacks, bridged by
 * command id (`EditorKeybindingHandlers`). Nothing here moves execution into
 * a central dispatcher: each handler keeps its own guards (enablement,
 * read-only, document kind).
 *
 * The bindings live in their own CodeMirror keymap scope and are run from a
 * `keydown` DOM handler via `runScopeHandlers`, NOT by the ordinary keymap
 * handler. That keeps the IME guards (`event.isComposing`, `view.composing`,
 * a local composition flag) in front of every shortcut, exactly as the
 * hand-written handlers did.
 */

import { Prec, type Extension } from "@codemirror/state";
import {
  EditorView,
  keymap,
  runScopeHandlers,
  type KeyBinding
} from "@codemirror/view";
import {
  resolveEditorKeybindings,
  toCodeMirrorKey,
  type PergamumPlatform,
  type ResolvedKeybinding
} from "../../shared/keybindings";
import { getRuntimePlatform } from "../platformModifier";
import { modifiersMatchCatalogKey } from "./catalogKeyMatch";

/** The CodeMirror keymap scope all generated bindings use. */
export const PERGAMUM_EDITOR_KEYMAP_SCOPE = "pergamum-editor";

/** Returns `true` when it handled the key (the event is then consumed). */
export type EditorKeybindingHandler = (view: EditorView) => boolean;

export type EditorKeybindingHandlers = Readonly<
  Partial<Record<string, EditorKeybindingHandler>>
>;

/** Serializable description of one generated binding (for tests / UI). */
export interface EditorKeybindingDescriptor {
  readonly platform: PergamumPlatform;
  readonly commandId: string;
  readonly codeMirrorKey: string;
  readonly when: string | null;
  readonly readonly: boolean;
  readonly handlerStatus: ResolvedKeybinding["handlerStatus"];
}

function selectEditorBindings(
  platform: PergamumPlatform,
  commandIds?: readonly string[]
): ResolvedKeybinding[] {
  const allowed = commandIds === undefined ? null : new Set(commandIds);
  return resolveEditorKeybindings(platform).filter(
    (binding) => allowed === null || allowed.has(binding.command)
  );
}

export function listEditorKeybindingDescriptors(
  platform: PergamumPlatform,
  commandIds?: readonly string[]
): EditorKeybindingDescriptor[] {
  return selectEditorBindings(platform, commandIds).map((binding) => ({
    platform,
    commandId: binding.command,
    codeMirrorKey: toCodeMirrorKey(binding.key as string, platform),
    when: binding.when,
    readonly: binding.readonly,
    handlerStatus: binding.handlerStatus
  }));
}

/** Command ids that have a catalog key on `platform` but no handler. */
export function findMissingEditorKeybindingHandlers(input: {
  readonly platform: PergamumPlatform;
  readonly handlers: EditorKeybindingHandlers;
  readonly commandIds?: readonly string[];
}): string[] {
  const missing = new Set<string>();
  for (const binding of selectEditorBindings(input.platform, input.commandIds)) {
    if (input.handlers[binding.command] === undefined) {
      missing.add(binding.command);
    }
  }
  return [...missing].sort();
}

/**
 * The event currently being dispatched by {@link createPergamumEditorKeymapExtension}
 * (set synchronously around `runScopeHandlers`). CodeMirror ignores Shift when
 * matching a character key (e.g. CapsLock makes Ctrl+Shift+R report key "r"),
 * so each generated binding re-checks the exact modifier set against this.
 */
let currentDispatchEvent: KeyboardEvent | null = null;

/**
 * One `KeyBinding` per catalog key that has a handler. A command without a
 * handler is skipped (see {@link findMissingEditorKeybindingHandlers}); a
 * broken binding is never created.
 */
export function createPergamumEditorKeyBindings(input: {
  readonly platform: PergamumPlatform;
  readonly handlers: EditorKeybindingHandlers;
  readonly commandIds?: readonly string[];
  /**
   * CodeMirror keymap scope. Defaults to {@link PERGAMUM_EDITOR_KEYMAP_SCOPE}
   * (run through the guarded dispatcher); pass `"editor"` for bindings that
   * should run through CodeMirror's ordinary keymap handling.
   */
  readonly scope?: string;
  /** Commands whose handled event must not propagate further. */
  readonly stopPropagationCommandIds?: readonly string[];
}): KeyBinding[] {
  const bindings: KeyBinding[] = [];
  for (const binding of selectEditorBindings(input.platform, input.commandIds)) {
    const handler = input.handlers[binding.command];
    if (handler === undefined) {
      continue;
    }
    const catalogKey = binding.key as string;
    bindings.push({
      key: toCodeMirrorKey(catalogKey, input.platform),
      scope: input.scope ?? PERGAMUM_EDITOR_KEYMAP_SCOPE,
      ...(input.stopPropagationCommandIds?.includes(binding.command)
        ? { stopPropagation: true }
        : {}),
      run: (view) => {
        const event = currentDispatchEvent;
        if (
          event !== null &&
          !modifiersMatchCatalogKey(event, catalogKey, input.platform)
        ) {
          return false;
        }
        return handler(view);
      }
    });
  }
  return bindings;
}

/**
 * macOS Option composes a character (`Option+M` -> "µ", `Option+\`` -> dead
 * key). CodeMirror skips its keyCode fallback for Option without Cmd / Ctrl,
 * and with Cmd it depends on `keyCode`. Present the physical key instead so
 * catalog keys such as `Alt-\``, `Shift-Alt-m` and `Mod-Alt-f` match, like the
 * former `event.code` based handlers did. Everything else passes through
 * untouched.
 */
function withPhysicalKeyForMacOption(
  event: KeyboardEvent,
  platform: PergamumPlatform
): KeyboardEvent {
  if (platform !== "darwin" || !event.altKey) {
    return event;
  }
  const letter = /^Key([A-Z])$/.exec(event.code);
  const digit = /^Digit([0-9])$/.exec(event.code);
  const key =
    letter !== null
      ? (letter[1] as string).toLowerCase()
      : digit !== null
        ? (digit[1] as string)
        : event.code === "Backquote"
          ? "`"
          : null;
  if (key === null) {
    return event;
  }
  // A plain object: KeyboardEvent getters throw when read off a copy.
  return {
    key,
    code: event.code,
    keyCode: event.keyCode,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    preventDefault: () => event.preventDefault(),
    stopPropagation: () => event.stopPropagation()
  } as unknown as KeyboardEvent;
}

/**
 * The editor keymap extension for the given commands. Place at most ONE of
 * these per editor state: bindings share one scope, so a second instance
 * would run the first one's bindings too and bypass its command selection.
 */
export function createPergamumEditorKeymapExtension(input: {
  readonly handlers: EditorKeybindingHandlers;
  /** Restricts the catalog commands wired into this editor. */
  readonly commandIds?: readonly string[];
  readonly stopPropagationCommandIds?: readonly string[];
  readonly platform?: PergamumPlatform;
}): Extension {
  const platform = input.platform ?? getRuntimePlatform();
  const bindings = createPergamumEditorKeyBindings({
    platform,
    handlers: input.handlers,
    ...(input.commandIds === undefined ? {} : { commandIds: input.commandIds }),
    ...(input.stopPropagationCommandIds === undefined
      ? {}
      : { stopPropagationCommandIds: input.stopPropagationCommandIds })
  });

  // compositionstart fires before view.composing flips true, so track it
  // locally too (same IME safety as the former per-shortcut handlers).
  let localComposing = false;

  return [
    keymap.of(bindings),
    Prec.highest(
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
          if (event.isComposing || view.composing || localComposing) {
            return false;
          }
          let handled: boolean;
          currentDispatchEvent = event;
          try {
            handled = runScopeHandlers(
              view,
              withPhysicalKeyForMacOption(event, platform),
              PERGAMUM_EDITOR_KEYMAP_SCOPE
            );
          } finally {
            currentDispatchEvent = null;
          }
          if (handled) {
            event.preventDefault();
          }
          return handled;
        }
      })
    )
  ];
}
