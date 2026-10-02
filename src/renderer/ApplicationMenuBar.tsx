import {
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
 * Scope of this slice: mouse interaction and basic popup dismissal. Running
 * the command (#664) goes through the `onInvoke` boundary only; keyboard
 * navigation, mnemonics and full ARIA are #665.
 */

export interface ApplicationMenuBarProps {
  readonly platform: AppPlatform;
  readonly translate: Translate;
  /** Called once per enabled leaf item click, after the menu closed. */
  readonly onInvoke?: (target: RendererMenuInvokeTarget) => void;
  /** View state supplied by #664; absent = no shortcut label / enabled. */
  readonly getShortcutLabel?: RendererMenuProjectionOptions["getShortcutLabel"];
  readonly isDisabled?: RendererMenuProjectionOptions["isDisabled"];
}

type SubmenuEntry = Extract<RendererMenuEntry, { kind: "submenu" }>;

export function ApplicationMenuBar({
  platform,
  translate,
  onInvoke,
  getShortcutLabel,
  isDisabled
}: ApplicationMenuBarProps) {
  const isVisible = shouldShowRendererMenuBar(platform);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
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
    [isVisible, platform, translate, getShortcutLabel, isDisabled, openIndex]
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Basic popup dismissal while a menu is open: outside click, Escape, and
  // the window losing focus / resizing (the popup anchor would be stale).
  useEffect(() => {
    if (openIndex === null) {
      return;
    }

    const close = () => setOpenIndex(null);
    const handleMouseDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        close();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    };

    document.addEventListener("mousedown", handleMouseDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [openIndex]);

  if (!isVisible) {
    return null;
  }

  const activate = (target: RendererMenuInvokeTarget) => {
    setOpenIndex(null);
    onInvoke?.(target);
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
          isOpen={openIndex === index}
          buttonRef={(element) => {
            triggerRefs.current[index] = element;
          }}
          onToggle={() =>
            setOpenIndex((current) => (current === index ? null : index))
          }
          onHover={() =>
            setOpenIndex((current) => (current === null ? null : index))
          }
        >
          {openIndex === index && (
            <MenuPopup
              entries={menu.items}
              anchor={triggerRefs.current[index]}
              placement="below"
              onActivate={activate}
            />
          )}
        </MenuBarItem>
      ))}
    </div>
  );
}

function MenuBarItem({
  menu,
  isOpen,
  buttonRef,
  onToggle,
  onHover,
  children
}: {
  readonly menu: SubmenuEntry;
  readonly isOpen: boolean;
  readonly buttonRef: (element: HTMLButtonElement | null) => void;
  readonly onToggle: () => void;
  readonly onHover: () => void;
  readonly children?: React.ReactNode;
}) {
  return (
    <div className="applicationMenuBarItemSlot" onMouseEnter={onHover}>
      <button
        ref={buttonRef}
        type="button"
        role="menuitem"
        // Focus order / roving tabindex is #665.
        tabIndex={-1}
        className="applicationMenuBarItem"
        data-open={isOpen ? "true" : undefined}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={onToggle}
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
  onActivate
}: {
  readonly entries: readonly RendererMenuEntry[];
  readonly anchor: HTMLElement | null | undefined;
  readonly placement: "below" | "beside";
  readonly onActivate: (target: RendererMenuInvokeTarget) => void;
}) {
  const popupRef = useRef<HTMLUListElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null
  );
  const [openSubmenuKey, setOpenSubmenuKey] = useState<string | null>(null);

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
      // Viewport coordinates from getBoundingClientRect are physical.
      style={{
        left: position?.x ?? 0,
        top: position?.y ?? 0,
        visibility: position ? "visible" : "hidden"
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
            return (
              <MenuSubmenuItem
                key={entry.key}
                entry={entry}
                isOpen={openSubmenuKey === entry.key}
                onOpen={() => setOpenSubmenuKey(entry.key)}
                onActivate={onActivate}
              />
            );
          case "item":
            return (
              <MenuItem
                key={entry.key}
                entry={entry}
                onHover={() => setOpenSubmenuKey(null)}
                onActivate={onActivate}
              />
            );
        }
      })}
    </ul>
  );
}

function MenuItem({
  entry,
  onHover,
  onActivate
}: {
  readonly entry: Extract<RendererMenuEntry, { kind: "item" }>;
  readonly onHover: () => void;
  readonly onActivate: (target: RendererMenuInvokeTarget) => void;
}) {
  const handleClick = (event: ReactMouseEvent) => {
    // A nested item must not also activate the submenu item that contains it.
    event.stopPropagation();

    if (!entry.disabled) {
      onActivate(entry.target);
    }
  };

  return (
    <li
      className="applicationMenuItem"
      role="menuitem"
      aria-disabled={entry.disabled ? true : undefined}
      data-disabled={entry.disabled ? "true" : undefined}
      onMouseEnter={onHover}
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
  isOpen,
  onOpen,
  onActivate
}: {
  readonly entry: SubmenuEntry;
  readonly isOpen: boolean;
  readonly onOpen: () => void;
  readonly onActivate: (target: RendererMenuInvokeTarget) => void;
}) {
  const [itemElement, setItemElement] = useState<HTMLLIElement | null>(null);

  return (
    <li
      ref={setItemElement}
      className="applicationMenuItem"
      role="menuitem"
      aria-haspopup="menu"
      aria-expanded={isOpen}
      data-open={isOpen ? "true" : undefined}
      onMouseEnter={onOpen}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      <span className="applicationMenuItemLabel">{entry.label}</span>
      <span className="applicationMenuItemChevron" aria-hidden="true" />
      {isOpen && (
        <MenuPopup
          entries={entry.items}
          anchor={itemElement}
          placement="beside"
          onActivate={onActivate}
        />
      )}
    </li>
  );
}
