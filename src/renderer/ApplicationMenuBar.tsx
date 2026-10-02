import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from "react";
import type { Translate } from "../shared/i18n";
import type { AppPlatform } from "../shared/platform";
import {
  closeMenu,
  inactiveMenuState,
  isMenuActive,
  pointerClickEntry,
  pointerHoverEntry,
  pointerHoverTopLevel,
  pointerToggleTopLevel,
  stepMenuKey,
  type MenuKeyboardState,
  type MenuStepResult
} from "./applicationMenuKeyboard";
import {
  computeSubmenuPopupPosition,
  computeTopLevelPopupPosition
} from "./applicationMenuPopupPosition";
import {
  projectApplicationMenu,
  shouldShowRendererMenuBar,
  type RendererMenuEntry,
  type RendererMenuInvokeTarget,
  type RendererMenuProjectionOptions
} from "./applicationMenuProjection";

/**
 * #663: the Renderer menu bar of Windows / Linux (macOS keeps its native
 * global menu, so nothing is rendered there). It draws the canonical
 * Application Menu model (#662) below the OS title bar; the native Electron
 * menu stays alive as the accelerator / native-role backend, only its visible
 * bar is hidden (main process).
 *
 * #664 connects clicks, shortcut labels and enablement. #665 adds keyboard
 * operation: every transition lives in `applicationMenuKeyboard` (pure); this
 * component applies the resulting state and runs its effects in order, which
 * is what guarantees "focus goes back to the original owner BEFORE an item is
 * invoked".
 */

export interface ApplicationMenuBarProps {
  readonly platform: AppPlatform;
  readonly translate: Translate;
  /** Called once per enabled leaf activation, after the menu closed and focus was restored. */
  readonly onInvoke?: (target: RendererMenuInvokeTarget) => void;
  /** View state supplied by #664; absent = no shortcut label / enabled. */
  readonly getShortcutLabel?: RendererMenuProjectionOptions["getShortcutLabel"];
  readonly isDisabled?: RendererMenuProjectionOptions["isDisabled"];
  /**
   * A modal / dialog / Command Palette owns the keyboard (the app-wide modal
   * state, not a DOM query): the menu neither reacts to Alt nor stays open.
   */
  readonly isKeyboardBlocked?: boolean;
  /** The app-wide IME composition guard. */
  readonly isImeComposing?: () => boolean;
}

type SubmenuEntry = Extract<RendererMenuEntry, { kind: "submenu" }>;

interface MenuViewState {
  readonly state: MenuKeyboardState;
  /** The latest state (event handlers must not act on a stale render). */
  readonly current: () => MenuKeyboardState;
  readonly dispatchPointer: (result: MenuStepResult) => void;
}

function findFocusable(
  root: HTMLElement | null,
  key: string
): HTMLElement | null {
  if (!root) {
    return null;
  }

  return (
    Array.from(root.querySelectorAll<HTMLElement>("[data-menu-key]")).find(
      (element) => element.dataset.menuKey === key
    ) ?? null
  );
}

export function ApplicationMenuBar({
  platform,
  translate,
  onInvoke,
  getShortcutLabel,
  isDisabled,
  isKeyboardBlocked = false,
  isImeComposing
}: ApplicationMenuBarProps) {
  const isVisible = shouldShowRendererMenuBar(platform);
  const [state, setState] = useState<MenuKeyboardState>(inactiveMenuState);
  const stateRef = useRef(state);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const focusOwnerRef = useRef<HTMLElement | null>(null);
  // Re-projected whenever a menu opens or switches (#664): enablement that
  // depends on the focused element (Cut / Paste) is then read fresh.
  const menus = useMemo(
    () =>
      isVisible
        ? projectApplicationMenu(platform, {
            translate,
            getShortcutLabel,
            isDisabled
          })
        : [],
    [isVisible, platform, translate, getShortcutLabel, isDisabled, state.openKey]
  );
  const latest = useRef({ menus, onInvoke, isKeyboardBlocked, isImeComposing });
  latest.current = { menus, onInvoke, isKeyboardBlocked, isImeComposing };

  /**
   * Applies a transition: the state first, then the effects in order. The
   * order matters: for a keyboard activation the focus owner is restored
   * synchronously BEFORE `onInvoke` runs.
   */
  const apply = useCallback((result: MenuStepResult, event?: Event) => {
    stateRef.current = result.state;
    setState(result.state);

    for (const effect of result.effects) {
      switch (effect.type) {
        case "captureFocusOwner": {
          const active = document.activeElement;

          focusOwnerRef.current =
            active instanceof HTMLElement &&
            active !== document.body &&
            !rootRef.current?.contains(active)
              ? active
              : null;
          break;
        }
        case "restoreFocusOwner": {
          const owner = focusOwnerRef.current;

          focusOwnerRef.current = null;
          if (
            owner &&
            owner.isConnected &&
            !(owner as HTMLButtonElement).disabled
          ) {
            owner.focus({ preventScroll: true });
          }
          break;
        }
        case "invoke":
          latest.current.onInvoke?.(effect.target);
          break;
        case "preventDefault":
          event?.preventDefault();
          event?.stopPropagation();
          break;
      }
    }
  }, []);

  // Keyboard (Alt, mnemonics, navigation) + dismissal, for as long as the bar
  // is shown. macOS never gets here: the bar renders nothing there.
  useEffect(() => {
    if (!isVisible) {
      return;
    }

    const handleKey = (type: "keydown" | "keyup") => (event: KeyboardEvent) => {
      const result = stepMenuKey(
        stateRef.current,
        {
          type,
          key: event.key,
          keyCode: event.keyCode,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
          isComposing: event.isComposing,
          altGraph:
            typeof event.getModifierState === "function" &&
            event.getModifierState("AltGraph")
        },
        {
          menus: latest.current.menus,
          blocked: latest.current.isKeyboardBlocked,
          composing: latest.current.isImeComposing?.() ?? false
        }
      );

      if (result.state !== stateRef.current || result.effects.length > 0) {
        apply(result, event);
      }
    };
    const handleKeyDown = handleKey("keydown");
    const handleKeyUp = handleKey("keyup");
    const handleMouseDown = (event: MouseEvent) => {
      const current = stateRef.current;

      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }
      // A click elsewhere: the clicked target is the new focus owner, so
      // nothing is restored. It also cancels a pending bare Alt.
      if (isMenuActive(current) || current.altArmed) {
        apply(closeMenu(current, false));
      }
    };
    const handleBlur = () => {
      // Another window owns focus now: close without taking focus back.
      apply(closeMenu(stateRef.current, false));
    };
    const handleResize = () => {
      const insideMenu = rootRef.current?.contains(document.activeElement);

      apply(closeMenu(stateRef.current, insideMenu === true));
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    document.addEventListener("mousedown", handleMouseDown, true);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      document.removeEventListener("mousedown", handleMouseDown, true);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("resize", handleResize);
    };
  }, [isVisible, apply]);

  // A modal surface took the keyboard (Command Palette, a dialog, ...): close
  // WITHOUT restoring - the new surface is the focus owner.
  useEffect(() => {
    if (isKeyboardBlocked && isMenuActive(stateRef.current)) {
      apply(closeMenu(stateRef.current, false));
    }
  }, [isKeyboardBlocked, apply]);

  // DOM focus follows the keyboard focus key (pointer-only use never moves it).
  useLayoutEffect(() => {
    if (state.focusKey === null) {
      return;
    }

    const element = findFocusable(rootRef.current, state.focusKey);

    if (element && document.activeElement !== element) {
      element.focus({ preventScroll: true });
    }
  }, [state.focusKey, state.openKey, state.submenuKeys]);

  if (!isVisible) {
    return null;
  }

  const view: MenuViewState = {
    state,
    current: () => stateRef.current,
    dispatchPointer: (result) => apply(result)
  };

  return (
    <div
      ref={rootRef}
      className="applicationMenuBar"
      role="menubar"
      // Menu clicks must not pull focus out of the editor.
      onMouseDown={(event) => event.preventDefault()}
    >
      {menus.map((menu, index) => (
        <MenuBarItem
          key={menu.key}
          menu={menu}
          view={view}
          buttonRef={(element) => {
            triggerRefs.current[index] = element;
          }}
        >
          {state.openKey === menu.key && (
            <MenuPopup
              entries={menu.items}
              anchor={triggerRefs.current[index]}
              placement="below"
              view={view}
            />
          )}
        </MenuBarItem>
      ))}
    </div>
  );
}

function MenuBarItem({
  menu,
  view,
  buttonRef,
  children
}: {
  readonly menu: SubmenuEntry;
  readonly view: MenuViewState;
  readonly buttonRef: (element: HTMLButtonElement | null) => void;
  readonly children?: React.ReactNode;
}) {
  const isOpen = view.state.openKey === menu.key;

  return (
    <div
      className="applicationMenuBarItemSlot"
      onMouseEnter={() =>
        view.dispatchPointer(pointerHoverTopLevel(view.current(), menu))
      }
    >
      <button
        ref={buttonRef}
        type="button"
        role="menuitem"
        // Never part of the Tab order; focus moves here only while the menu
        // is in keyboard mode.
        tabIndex={-1}
        className="applicationMenuBarItem"
        data-menu-key={menu.key}
        data-open={isOpen ? "true" : undefined}
        data-focused={view.state.focusKey === menu.key ? "true" : undefined}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() =>
          view.dispatchPointer(pointerToggleTopLevel(view.current(), menu))
        }
      >
        {menu.label}
      </button>
      {children}
    </div>
  );
}

function MenuPopup({
  entries,
  anchor,
  placement,
  view
}: {
  readonly entries: readonly RendererMenuEntry[];
  readonly anchor: HTMLElement | null | undefined;
  readonly placement: "below" | "beside";
  readonly view: MenuViewState;
}) {
  const popupRef = useRef<HTMLUListElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null
  );

  // Measured before paint, so the popup is never visible at a wrong place.
  useLayoutEffect(() => {
    const popup = popupRef.current;

    if (!popup || !anchor) {
      return;
    }

    const size = { width: popup.offsetWidth, height: popup.offsetHeight };
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };
    const anchorRect = anchor.getBoundingClientRect();

    if (placement === "below") {
      // Hang from the bottom edge of the bar, not of the (inset) trigger.
      const barBottom = anchor
        .closest('[role="menubar"]')
        ?.getBoundingClientRect().bottom;
      setPosition(
        computeTopLevelPopupPosition({
          // (DOMRect fields are prototype getters: build the rect explicitly.)
          trigger: {
            left: anchorRect.left,
            top: anchorRect.top,
            right: anchorRect.right,
            bottom: barBottom ?? anchorRect.bottom
          },
          popup: size,
          viewport
        })
      );
      return;
    }

    const parent = anchor.closest("[data-application-menu-popup]");
    setPosition(
      computeSubmenuPopupPosition({
        parentPopup: parent?.getBoundingClientRect() ?? anchorRect,
        item: anchorRect,
        popup: size,
        viewport
      })
    );
  }, [anchor, placement, entries]);

  return (
    <ul
      ref={popupRef}
      className="applicationMenuPopup"
      role="menu"
      data-application-menu-popup=""
      // Viewport coordinates from getBoundingClientRect are physical. Opacity
      // (not visibility) keeps the popup focusable before it is positioned.
      style={{
        left: position?.x ?? 0,
        top: position?.y ?? 0,
        opacity: position ? 1 : 0
      }}
    >
      {entries.map((entry) => {
        switch (entry.kind) {
          case "separator":
            return (
              <li
                key={entry.key}
                className="applicationMenuSeparator"
                role="separator"
              />
            );
          case "submenu":
            return <MenuSubmenuItem key={entry.key} entry={entry} view={view} />;
          case "item":
            return <MenuItem key={entry.key} entry={entry} view={view} />;
        }
      })}
    </ul>
  );
}

function MenuItem({
  entry,
  view
}: {
  readonly entry: Extract<RendererMenuEntry, { kind: "item" }>;
  readonly view: MenuViewState;
}) {
  const handleClick = (event: ReactMouseEvent) => {
    // A nested item must not also activate the submenu item that contains it.
    event.stopPropagation();
    view.dispatchPointer(pointerClickEntry(view.current(), entry));
  };

  return (
    <li
      className="applicationMenuItem"
      role="menuitem"
      tabIndex={-1}
      data-menu-key={entry.key}
      data-focused={view.state.focusKey === entry.key ? "true" : undefined}
      aria-disabled={entry.disabled ? true : undefined}
      data-disabled={entry.disabled ? "true" : undefined}
      onMouseEnter={() =>
        view.dispatchPointer(pointerHoverEntry(view.current(), entry))
      }
      onClick={handleClick}
    >
      <span className="applicationMenuItemLabel">{entry.label}</span>
      {entry.shortcutLabel !== undefined && (
        <span className="applicationMenuItemShortcut">
          {entry.shortcutLabel}
        </span>
      )}
    </li>
  );
}

function MenuSubmenuItem({
  entry,
  view
}: {
  readonly entry: SubmenuEntry;
  readonly view: MenuViewState;
}) {
  const [itemElement, setItemElement] = useState<HTMLLIElement | null>(null);
  const isOpen = view.state.submenuKeys.includes(entry.key);

  return (
    <li
      ref={setItemElement}
      className="applicationMenuItem"
      role="menuitem"
      tabIndex={-1}
      data-menu-key={entry.key}
      data-focused={view.state.focusKey === entry.key ? "true" : undefined}
      aria-haspopup="menu"
      aria-expanded={isOpen}
      data-open={isOpen ? "true" : undefined}
      onMouseEnter={() =>
        view.dispatchPointer(pointerHoverEntry(view.current(), entry))
      }
      onClick={(event) => {
        event.stopPropagation();
        view.dispatchPointer(pointerClickEntry(view.current(), entry));
      }}
    >
      <span className="applicationMenuItemLabel">{entry.label}</span>
      <span className="applicationMenuItemChevron" aria-hidden="true" />
      {isOpen && (
        <MenuPopup
          entries={entry.items}
          anchor={itemElement}
          placement="beside"
          view={view}
        />
      )}
    </li>
  );
}
