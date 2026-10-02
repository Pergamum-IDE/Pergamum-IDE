/**
 * #665: keyboard / focus state of the Renderer application menu (Windows /
 * Linux).
 *
 * Pure: `stepMenuKey` and the pointer steps take the current state and return
 * the next state plus an ordered list of side effects for the component to
 * run. Keeping the transitions here (not in the component) is what makes the
 * contracts testable:
 *
 *   - bare Alt activates / toggles the menu bar (it is armed on keydown and
 *     fires on keyup, so Alt+F / Alt+Tab never trigger it)
 *   - Alt+mnemonic and (Alt, then) mnemonic come from the canonical model's
 *     `mnemonic` metadata (#668), never from label text
 *   - AltGr (Ctrl+Alt), IME composition and an active modal surface never
 *     activate the menu
 *   - keyboard activation of an item closes the menu, restores the original
 *     focus owner and only THEN invokes the item (so native edit roles act on
 *     the editor, not on the menu)
 *
 * Menu entries are identified by their path key ("1", "1/3", "0/3/0"), the same
 * keys the projection assigns. Any nesting depth works the same way.
 */

import type {
  RendererMenuEntry,
  RendererMenuInvokeTarget
} from "./applicationMenuProjection";

type TopLevelEntry = Extract<RendererMenuEntry, { kind: "submenu" }>;

export interface MenuKeyboardState {
  /** Top-level menu whose popup is open. */
  readonly openKey: string | null;
  /** Top-level menu that is the active one (keyboard mode, or the open one). */
  readonly barKey: string | null;
  /** Open nested submenus, outermost first. */
  readonly submenuKeys: readonly string[];
  /** The entry that owns DOM focus; null while the menu is used by pointer only. */
  readonly focusKey: string | null;
  /** Alt went down alone and nothing else has happened since. */
  readonly altArmed: boolean;
}

export const inactiveMenuState: MenuKeyboardState = {
  openKey: null,
  barKey: null,
  submenuKeys: [],
  focusKey: null,
  altArmed: false
};

export function isMenuActive(state: MenuKeyboardState): boolean {
  return state.openKey !== null || state.barKey !== null;
}

export type MenuEffect =
  /** Remember the focus owner before the menu takes keyboard focus. */
  | { readonly type: "captureFocusOwner" }
  /** Synchronously give focus back to the remembered owner. */
  | { readonly type: "restoreFocusOwner" }
  | { readonly type: "invoke"; readonly target: RendererMenuInvokeTarget }
  | { readonly type: "preventDefault" };

export interface MenuStepResult {
  readonly state: MenuKeyboardState;
  readonly effects: readonly MenuEffect[];
}

export interface MenuStepContext {
  readonly menus: readonly TopLevelEntry[];
  /** A modal surface owns the keyboard: the menu must not react. */
  readonly blocked: boolean;
  /** The app-wide IME composition guard. */
  readonly composing: boolean;
}

export interface MenuKeyInput {
  readonly type: "keydown" | "keyup";
  readonly key: string;
  readonly keyCode?: number;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly repeat: boolean;
  readonly isComposing: boolean;
  /** `getModifierState("AltGraph")`. */
  readonly altGraph: boolean;
}

const none: readonly MenuEffect[] = [];
const prevent: MenuEffect = { type: "preventDefault" };

// --- tree helpers -----------------------------------------------------------

function isNavigable(entry: RendererMenuEntry): boolean {
  return (
    entry.kind === "submenu" || (entry.kind === "item" && !entry.disabled)
  );
}

function parentKeyOf(key: string): string | null {
  const index = key.lastIndexOf("/");

  return index === -1 ? null : key.slice(0, index);
}

/** Submenu keys that must be open for `key` to be visible (excluding itself). */
export function ancestorSubmenuKeys(key: string): string[] {
  const segments = key.split("/");
  const ancestors: string[] = [];

  for (let length = 2; length < segments.length; length += 1) {
    ancestors.push(segments.slice(0, length).join("/"));
  }

  return ancestors;
}

function findEntry(
  menus: readonly TopLevelEntry[],
  key: string
): RendererMenuEntry | null {
  const visit = (
    entries: readonly RendererMenuEntry[]
  ): RendererMenuEntry | null => {
    for (const entry of entries) {
      if (entry.key === key) {
        return entry;
      }
      if (entry.kind === "submenu" && key.startsWith(`${entry.key}/`)) {
        return visit(entry.items);
      }
    }
    return null;
  };

  return visit(menus);
}

/** The entries shown in the popup that `key` belongs to (or the top-level bar). */
function siblingsOf(
  menus: readonly TopLevelEntry[],
  key: string
): readonly RendererMenuEntry[] {
  const parentKey = parentKeyOf(key);

  if (parentKey === null) {
    return menus;
  }

  const parent = findEntry(menus, parentKey);

  return parent !== null && parent.kind === "submenu" ? parent.items : [];
}

function enabledKeys(entries: readonly RendererMenuEntry[]): string[] {
  return entries.filter(isNavigable).map((entry) => entry.key);
}

function firstEnabledChildKey(entry: TopLevelEntry): string | null {
  return enabledKeys(entry.items)[0] ?? null;
}

function lastEnabledChildKey(entry: TopLevelEntry): string | null {
  const keys = enabledKeys(entry.items);

  return keys[keys.length - 1] ?? null;
}

function wrap(index: number, length: number): number {
  return (index + length) % length;
}

function moveAmong(
  keys: readonly string[],
  current: string,
  step: 1 | -1
): string | null {
  if (keys.length === 0) {
    return null;
  }

  const index = keys.indexOf(current);

  return keys[index === -1 ? (step === 1 ? 0 : keys.length - 1) : wrap(index + step, keys.length)];
}

function depthOf(key: string): number {
  return key.split("/").length - 1;
}

// --- state transitions ------------------------------------------------------

function disarm(state: MenuKeyboardState): MenuKeyboardState {
  return state.altArmed ? { ...state, altArmed: false } : state;
}

function activateBar(
  state: MenuKeyboardState,
  menus: readonly TopLevelEntry[]
): MenuStepResult {
  const first = menus[0];

  if (first === undefined) {
    return { state: disarm(state), effects: none };
  }

  return {
    state: {
      openKey: null,
      barKey: first.key,
      submenuKeys: [],
      focusKey: first.key,
      altArmed: false
    },
    effects: isMenuActive(state) ? none : [{ type: "captureFocusOwner" }]
  };
}

function openTopLevel(
  state: MenuKeyboardState,
  menu: TopLevelEntry,
  focus: "first" | "last" | "trigger",
  keyboard: boolean
): MenuStepResult {
  const childKey =
    focus === "first"
      ? firstEnabledChildKey(menu)
      : focus === "last"
        ? lastEnabledChildKey(menu)
        : null;

  return {
    state: {
      openKey: menu.key,
      barKey: menu.key,
      submenuKeys: [],
      // Pointer use never moves DOM focus; keyboard use does.
      focusKey: keyboard ? (childKey ?? menu.key) : null,
      altArmed: false
    },
    effects: isMenuActive(state) ? none : [{ type: "captureFocusOwner" }]
  };
}

/** Closes everything. `restore` gives focus back to the remembered owner. */
export function closeMenu(
  state: MenuKeyboardState,
  restore: boolean
): MenuStepResult {
  if (!isMenuActive(state) && !state.altArmed) {
    return { state, effects: none };
  }

  return {
    state: inactiveMenuState,
    effects: restore && isMenuActive(state) ? [{ type: "restoreFocusOwner" }] : none
  };
}

function openSubmenu(
  state: MenuKeyboardState,
  entry: TopLevelEntry,
  keyboard: boolean
): MenuStepResult {
  return {
    state: {
      ...state,
      submenuKeys: [...ancestorSubmenuKeys(entry.key), entry.key],
      focusKey: keyboard ? (firstEnabledChildKey(entry) ?? entry.key) : state.focusKey
    },
    effects: none
  };
}

function activateLeaf(
  entry: Extract<RendererMenuEntry, { kind: "item" }>
): MenuStepResult {
  // Focus goes back BEFORE the item runs: a native edit role then acts on the
  // original editor, and a command that opens a dialog / palette is the last
  // one to take focus (no delayed restore can steal it back).
  return {
    state: inactiveMenuState,
    effects: [
      { type: "restoreFocusOwner" },
      { type: "invoke", target: entry.target }
    ]
  };
}

// --- pointer steps (mouse keeps DOM focus where it is) ------------------------

function isKeyboardMode(state: MenuKeyboardState): boolean {
  return state.focusKey !== null;
}

export function pointerToggleTopLevel(
  state: MenuKeyboardState,
  menu: TopLevelEntry
): MenuStepResult {
  if (state.openKey === menu.key) {
    return closeMenu(state, true);
  }

  return openTopLevel(state, menu, "trigger", isKeyboardMode(state));
}

export function pointerHoverTopLevel(
  state: MenuKeyboardState,
  menu: TopLevelEntry
): MenuStepResult {
  if (state.openKey === null || state.openKey === menu.key) {
    return { state, effects: none };
  }

  return openTopLevel(state, menu, "trigger", isKeyboardMode(state));
}

export function pointerHoverEntry(
  state: MenuKeyboardState,
  entry: RendererMenuEntry
): MenuStepResult {
  if (entry.kind === "separator") {
    return { state, effects: none };
  }

  const focusKey =
    isKeyboardMode(state) && isNavigable(entry) ? entry.key : state.focusKey;

  if (entry.kind === "submenu") {
    return {
      state: {
        ...state,
        submenuKeys: [...ancestorSubmenuKeys(entry.key), entry.key],
        focusKey
      },
      effects: none
    };
  }

  return {
    state: { ...state, submenuKeys: ancestorSubmenuKeys(entry.key), focusKey },
    effects: none
  };
}

export function pointerClickEntry(
  state: MenuKeyboardState,
  entry: RendererMenuEntry
): MenuStepResult {
  if (entry.kind === "submenu") {
    return pointerHoverEntry(state, entry);
  }

  if (entry.kind === "item" && !entry.disabled) {
    return activateLeaf(entry);
  }

  return { state, effects: none };
}

// --- keyboard ---------------------------------------------------------------

function isFunctionKey(key: string): boolean {
  return /^F\d{1,2}$/.test(key);
}

function isSpace(key: string): boolean {
  return key === " " || key === "Spacebar";
}

function mnemonicMenu(
  menus: readonly TopLevelEntry[],
  key: string
): TopLevelEntry | null {
  if (key.length !== 1) {
    return null;
  }

  const letter = key.toLocaleUpperCase("en-US");

  return menus.find((menu) => menu.mnemonic === letter) ?? null;
}

function step(
  state: MenuKeyboardState,
  next: Partial<MenuKeyboardState>,
  effects: readonly MenuEffect[] = none
): MenuStepResult {
  return { state: { ...state, ...next }, effects };
}

export function stepMenuKey(
  state: MenuKeyboardState,
  input: MenuKeyInput,
  context: MenuStepContext
): MenuStepResult {
  // Never react to a key that belongs to an IME composition or to a modal.
  if (
    context.blocked ||
    context.composing ||
    input.isComposing ||
    input.keyCode === 229
  ) {
    return { state: disarm(state), effects: none };
  }

  if (input.type === "keyup") {
    return stepKeyUp(state, input, context);
  }

  return stepKeyDown(state, input, context);
}

function stepKeyUp(
  state: MenuKeyboardState,
  input: MenuKeyInput,
  context: MenuStepContext
): MenuStepResult {
  if (input.key !== "Alt" || !state.altArmed) {
    return { state, effects: none };
  }

  // A bare Alt tap: toggle the menu keyboard mode.
  const result = isMenuActive(state)
    ? closeMenu({ ...state, altArmed: false }, true)
    : activateBar(state, context.menus);

  return { state: result.state, effects: [...result.effects, prevent] };
}

function stepKeyDown(
  state: MenuKeyboardState,
  input: MenuKeyInput,
  context: MenuStepContext
): MenuStepResult {
  const { menus } = context;
  const key = input.key;
  // AltGr reaches the page as Ctrl+Alt on Windows: never a mnemonic.
  const isAltGr = input.altGraph || (input.altKey && input.ctrlKey);

  if (key === "Alt") {
    if (input.repeat) {
      return { state, effects: none };
    }

    return {
      state: {
        ...state,
        altArmed: !input.ctrlKey && !input.metaKey && !input.shiftKey
      },
      effects: none
    };
  }

  if (key === "Control" || key === "Meta" || key === "Shift" || key === "AltGraph") {
    return { state: key === "Shift" ? state : disarm(state), effects: none };
  }

  // Any other key means the Alt (if held) was not a bare tap.
  const current = disarm(state);

  if (isAltGr) {
    return { state: current, effects: none };
  }

  // Alt + mnemonic opens the menu, whether or not the menu was active.
  if (input.altKey && !input.metaKey && !input.shiftKey) {
    const menu = mnemonicMenu(menus, key);

    if (menu !== null) {
      const result = openTopLevel(current, menu, "first", true);

      return { state: result.state, effects: [...result.effects, prevent] };
    }

    return { state: current, effects: none };
  }

  if (!isMenuActive(current)) {
    return { state: current, effects: none };
  }

  // Ctrl / Meta / Alt combinations and function keys belong to the existing
  // accelerators (F1, Ctrl+P, Ctrl+C, ...): leave the menu, put focus back on
  // its owner first (so native edit acts on the editor) and let the event go on.
  if (input.ctrlKey || input.metaKey || input.altKey || isFunctionKey(key)) {
    return closeMenu(current, true);
  }

  if (key === "Tab") {
    // The menu is not a focus trap: leave it and let Tab move on.
    return closeMenu(current, true);
  }

  return stepNavigationKey(current, key, context);
}

function stepNavigationKey(
  state: MenuKeyboardState,
  key: string,
  context: MenuStepContext
): MenuStepResult {
  const { menus } = context;
  const focusKey = state.focusKey ?? state.barKey;

  if (focusKey === null) {
    return { state, effects: none };
  }

  const handled = (result: MenuStepResult): MenuStepResult => ({
    state: result.state,
    effects: [...result.effects, prevent]
  });

  // A menu opened with the mouse has no keyboard focus path: Escape simply
  // closes it (the staircase below is for keyboard use).
  if (state.focusKey === null && key === "Escape") {
    return handled(closeMenu(state, true));
  }

  if (depthOf(focusKey) === 0) {
    return stepTopLevelKey(state, focusKey, key, menus, handled);
  }

  return stepPopupKey(state, focusKey, key, menus, handled);
}

function topLevelIndex(menus: readonly TopLevelEntry[], key: string): number {
  return menus.findIndex((menu) => menu.key === key);
}

function stepTopLevelKey(
  state: MenuKeyboardState,
  focusKey: string,
  key: string,
  menus: readonly TopLevelEntry[],
  handled: (result: MenuStepResult) => MenuStepResult
): MenuStepResult {
  const index = topLevelIndex(menus, focusKey);
  const menu = menus[index];

  if (menu === undefined) {
    return { state, effects: none };
  }

  const switchTo = (target: TopLevelEntry): MenuStepResult =>
    state.openKey === null
      ? {
          state: {
            ...state,
            barKey: target.key,
            focusKey: target.key,
            submenuKeys: []
          },
          effects: none
        }
      : openTopLevel(state, target, "first", true);

  switch (key) {
    case "ArrowRight":
      return handled(switchTo(menus[wrap(index + 1, menus.length)]));
    case "ArrowLeft":
      return handled(switchTo(menus[wrap(index - 1, menus.length)]));
    case "Home":
      return handled(switchTo(menus[0]));
    case "End":
      return handled(switchTo(menus[menus.length - 1]));
    case "ArrowDown":
    case "Enter":
      return handled(openTopLevel(state, menu, "first", true));
    case "ArrowUp":
      return handled(openTopLevel(state, menu, "last", true));
    case "Escape":
      // Popup open with the trigger focused: close it first; then leave.
      return handled(
        state.openKey !== null
          ? step(state, { openKey: null, submenuKeys: [], focusKey: menu.key })
          : closeMenu(state, true)
      );
    default:
      if (isSpace(key)) {
        return handled(openTopLevel(state, menu, "first", true));
      }

      // Two-step mnemonic: (Alt, release,) then the letter.
      if (state.openKey === null) {
        const target = mnemonicMenu(menus, key);

        if (target !== null) {
          return handled(openTopLevel(state, target, "first", true));
        }
      }

      return { state, effects: none };
  }
}

function stepPopupKey(
  state: MenuKeyboardState,
  focusKey: string,
  key: string,
  menus: readonly TopLevelEntry[],
  handled: (result: MenuStepResult) => MenuStepResult
): MenuStepResult {
  const entry = findEntry(menus, focusKey);
  const parentKey = parentKeyOf(focusKey);

  if (entry === null || parentKey === null) {
    return { state, effects: none };
  }

  const keys = enabledKeys(siblingsOf(menus, focusKey));
  const inRootPopup = depthOf(focusKey) === 1;
  const topIndex = topLevelIndex(menus, focusKey.split("/")[0]);
  const parentSubmenu = inRootPopup ? null : findEntry(menus, parentKey);
  const focusTo = (target: string | null): MenuStepResult =>
    target === null ? { state, effects: none } : step(state, { focusKey: target });
  const closeSubmenuToParent = (): MenuStepResult =>
    step(state, {
      submenuKeys: ancestorSubmenuKeys(parentKey),
      focusKey: parentSubmenu !== null ? parentSubmenu.key : parentKey
    });
  const switchTopLevel = (offset: 1 | -1): MenuStepResult =>
    openTopLevel(state, menus[wrap(topIndex + offset, menus.length)], "first", true);
  const openEntrySubmenu = (): MenuStepResult | null =>
    entry.kind === "submenu" ? openSubmenu(state, entry, true) : null;

  switch (key) {
    case "ArrowDown":
      return handled(focusTo(moveAmong(keys, focusKey, 1)));
    case "ArrowUp":
      return handled(focusTo(moveAmong(keys, focusKey, -1)));
    case "Home":
      return handled(focusTo(keys[0] ?? null));
    case "End":
      return handled(focusTo(keys[keys.length - 1] ?? null));
    case "Enter":
      return handled(activateOrOpen(state, entry, openEntrySubmenu));
    case "ArrowRight":
      return handled(
        entry.kind === "submenu"
          ? (openEntrySubmenu() as MenuStepResult)
          : inRootPopup
            ? switchTopLevel(1)
            : { state, effects: none }
      );
    case "ArrowLeft":
      return handled(inRootPopup ? switchTopLevel(-1) : closeSubmenuToParent());
    case "Escape":
      return handled(
        inRootPopup
          ? // Root popup: close it and return to the top-level trigger.
            step(state, {
              openKey: null,
              submenuKeys: [],
              focusKey: focusKey.split("/")[0]
            })
          : closeSubmenuToParent()
      );
    default:
      if (isSpace(key)) {
        return handled(activateOrOpen(state, entry, openEntrySubmenu));
      }

      return { state, effects: none };
  }
}

function activateOrOpen(
  state: MenuKeyboardState,
  entry: RendererMenuEntry,
  openEntrySubmenu: () => MenuStepResult | null
): MenuStepResult {
  if (entry.kind === "submenu") {
    return openEntrySubmenu() ?? { state, effects: none };
  }

  if (entry.kind === "item" && !entry.disabled) {
    return activateLeaf(entry);
  }

  return { state, effects: none };
}
