import {
  useEffect,
  useRef,
  useState,
  type FC,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import type { Translate } from "../../shared/i18n";
import {
  markdownCalloutMarker,
  markdownCalloutTypes,
  type MarkdownCalloutType
} from "../../shared/markdownCalloutMarkup";
import {
  markdownCalloutIconSvg,
  markdownCalloutLabelsFor
} from "../preview/markdownCallout";

export interface CalloutInsertDropdownProps {
  disabled: boolean;
  onInsertCallout: (type: MarkdownCalloutType) => void;
  translate: Translate;
}

/**
 * #570: toolbar dropdown that inserts a GitHub Alert-style callout.
 *
 * The trigger is deliberately text-only (`コールアウト ▼`): a permanent
 * generic alert icon in the toolbar would read as an error / notification
 * indicator. Type-specific icons + colors appear only on the menu items,
 * always next to their text label so meaning never depends on color.
 * Types, labels (`callout.*`) and icons are the same ones #568 renders.
 */
export const CalloutInsertDropdown: FC<CalloutInsertDropdownProps> = ({
  disabled,
  onInsertCallout,
  translate
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const triggerLabel = translate("toolbar.callout");
  const tooltip = translate("toolbar.callout.tooltip");
  const labels = markdownCalloutLabelsFor(translate);

  useEffect(() => {
    if (disabled) {
      setIsOpen(false);
    }
  }, [disabled]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    menuRef.current?.focus();

    const handleMouseDownOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", handleMouseDownOutside, true);

    return () => {
      window.removeEventListener("mousedown", handleMouseDownOutside, true);
    };
  }, [isOpen]);

  function openMenu(): void {
    if (disabled) {
      return;
    }

    setActiveIndex(0);
    setIsOpen(true);
  }

  function closeMenu({ restoreFocus }: { restoreFocus: boolean }): void {
    setIsOpen(false);

    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }

  function insert(type: MarkdownCalloutType): void {
    // No focus restore to the trigger: the insertion itself focuses the
    // editor so the callout body can be typed immediately.
    closeMenu({ restoreFocus: false });
    onInsertCallout(type);
  }

  function handleTriggerKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>
  ): void {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    event.preventDefault();
    openMenu();
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    const count = markdownCalloutTypes.length;

    switch (event.key) {
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        closeMenu({ restoreFocus: true });
        return;
      case "Tab":
        closeMenu({ restoreFocus: false });
        return;
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % count);
        return;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((current) => (current - 1 + count) % count);
        return;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        return;
      case "End":
        event.preventDefault();
        setActiveIndex(count - 1);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        insert(markdownCalloutTypes[activeIndex]);
        return;
      default:
        return;
    }
  }

  return (
    <div
      ref={containerRef}
      className="calloutInsertDropdown"
      data-testid="calloutInsertDropdown"
    >
      <button
        ref={triggerRef}
        type="button"
        className="calloutInsertDropdownTrigger"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={tooltip}
        onClick={() => {
          if (isOpen) {
            closeMenu({ restoreFocus: false });
            return;
          }

          openMenu();
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="calloutInsertDropdownValue">{triggerLabel}</span>
        <span className="calloutInsertDropdownCaret" aria-hidden="true" />
      </button>

      {isOpen ? (
        <div
          ref={menuRef}
          className="calloutInsertDropdownMenu"
          role="menu"
          aria-label={triggerLabel}
          aria-activedescendant={`callout-insert-option-${markdownCalloutTypes[activeIndex]}`}
          tabIndex={-1}
          onKeyDown={handleMenuKeyDown}
        >
          {markdownCalloutTypes.map((type, index) => (
            <button
              key={type}
              id={`callout-insert-option-${type}`}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="calloutInsertDropdownOption"
              data-callout-type={type}
              data-callout-marker={markdownCalloutMarker(type)}
              data-active={index === activeIndex || undefined}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => insert(type)}
            >
              <span
                className="calloutInsertDropdownOptionIcon"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: markdownCalloutIconSvg(type) }}
              />
              <span className="calloutInsertDropdownOptionLabel">
                {labels[type]}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
