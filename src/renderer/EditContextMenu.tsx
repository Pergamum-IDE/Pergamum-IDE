import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import type { EditCommandId } from "../shared/commandIds";
import { ContextMenuItemContent } from "./ContextMenuItemContent";
import { clampContextMenuPosition } from "./contextMenuPosition";

export interface EditContextMenuViewItem {
  readonly commandId: EditCommandId;
  readonly label: string;
  readonly enabled: boolean;
  /** Effective shortcut label; omitted when the command is unbound. */
  readonly shortcut?: string;
}

interface EditContextMenuProps {
  readonly x: number;
  readonly y: number;
  readonly ariaLabel: string;
  readonly items: readonly EditContextMenuViewItem[];
  readonly onSelect: (commandId: EditCommandId) => void;
  /** Closes the menu. The owner is responsible for restoring focus. */
  readonly onClose: () => void;
}

/**
 * #685: renderer-drawn Cut / Copy / Paste / Select All menu. Display only —
 * what a command does (and whether it is enabled) stays with the Command
 * Registry; the owner passes the enablement snapshot taken at right-click.
 */
export function EditContextMenu({
  x,
  y,
  ariaLabel,
  items,
  onSelect,
  onClose
}: EditContextMenuProps): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  useLayoutEffect(() => {
    if (!menuRef.current) {
      return;
    }
    const rect = menuRef.current.getBoundingClientRect();
    setPosition(
      clampContextMenuPosition({
        clickX: x,
        clickY: y,
        menuWidth: rect.width,
        menuHeight: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      })
    );
  }, [x, y]);

  useEffect(() => {
    menuRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
      ?.focus();
  }, []);

  function moveFocus(target: "next" | "previous" | "first" | "last"): void {
    const enabledItems = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)'
      ) ?? []
    );
    if (enabledItems.length === 0) {
      return;
    }
    const currentIndex = enabledItems.indexOf(
      document.activeElement as HTMLButtonElement
    );
    const lastIndex = enabledItems.length - 1;
    const nextIndex =
      target === "first"
        ? 0
        : target === "last"
          ? lastIndex
          : target === "next"
            ? currentIndex < 0 || currentIndex === lastIndex
              ? 0
              : currentIndex + 1
            : currentIndex <= 0
              ? lastIndex
              : currentIndex - 1;
    enabledItems[nextIndex]?.focus();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    // Keys pressed during IME composition belong to the IME.
    if (event.nativeEvent.isComposing) {
      return;
    }
    switch (event.key) {
      case "Escape":
      case "Tab":
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      case "ArrowDown":
        event.preventDefault();
        moveFocus("next");
        return;
      case "ArrowUp":
        event.preventDefault();
        moveFocus("previous");
        return;
      case "Home":
        event.preventDefault();
        moveFocus("first");
        return;
      case "End":
        event.preventDefault();
        moveFocus("last");
        return;
    }
  }

  return (
    <div
      className="editContextMenuBackdrop"
      onClick={onClose}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        ref={menuRef}
        className="editContextMenu"
        role="menu"
        aria-label={ariaLabel}
        style={
          {
            "--edit-context-menu-x": `${position.x}px`,
            "--edit-context-menu-y": `${position.y}px`
          } as CSSProperties
        }
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {items.map((item) => (
          <button
            key={item.commandId}
            type="button"
            role="menuitem"
            className="editContextMenuItem"
            data-edit-context-command={item.commandId}
            disabled={!item.enabled}
            aria-disabled={!item.enabled}
            onClick={() => onSelect(item.commandId)}
          >
            <ContextMenuItemContent
              label={item.label}
              shortcut={item.shortcut}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
