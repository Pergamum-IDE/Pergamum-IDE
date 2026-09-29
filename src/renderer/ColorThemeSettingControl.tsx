import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import { resolveColorTheme } from "../shared/colorTheme";
import type { Translate, TranslationKey } from "../shared/i18n";
import type { SettingSelectOption } from "../shared/settingsUiCatalog";

export interface ColorThemeSettingControlProps {
  readonly id: string;
  readonly labelId: string;
  readonly value: string;
  readonly options: readonly SettingSelectOption[];
  readonly disabled?: boolean;
  readonly translate: Translate;
  readonly onChange: (value: string) => void;
}

// Paints a row/trigger as a miniature of the theme through custom properties
// (read by .colorThemeDropdown* in styles.css) so the look never depends on
// the currently active application theme.
function previewStyle(themeId: string): CSSProperties {
  const { preview } = resolveColorTheme(themeId);

  return {
    "--theme-preview-background": preview.background,
    "--theme-preview-foreground": preview.foreground,
    "--theme-preview-border": preview.border,
    "--theme-preview-accent": preview.accent
  } as CSSProperties;
}

function ThemeSwatch({ themeId }: { readonly themeId: string }): JSX.Element {
  // The swatch color comes from the registry, not a CSS token: every option
  // keeps its own color whichever theme is currently active.
  return (
    <span
      className="colorThemeSwatch"
      style={{ backgroundColor: resolveColorTheme(themeId).accentColor }}
      aria-hidden="true"
    />
  );
}

/**
 * #623: `workbench.colorTheme` selector — a dropdown (listbox popup) that
 * replaces the plain <select> for this one setting so each theme shows its
 * representative color. Collapsed it shows only the selected theme; open it
 * lists the built-in themes. Keyboard and popup behavior follows the
 * existing PreviewRendererDropdown: the trigger opens with Enter / Space /
 * ArrowDown / ArrowUp, the listbox takes focus and handles Arrow keys /
 * Home / End / Enter / Space / Escape, and an outside mouse-down closes it.
 * Other enum settings keep the plain <select>.
 */
export function ColorThemeSettingControl({
  id,
  labelId,
  value,
  options,
  disabled = false,
  translate,
  onChange
}: ColorThemeSettingControlProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [activeValue, setActiveValue] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const valueId = `${id}-value`;
  const optionId = (optionValue: string): string =>
    `${id}-option-${optionValue}`;
  const labelFor = (option: SettingSelectOption): string =>
    translate(option.labelKey as TranslationKey);
  const selectedOption =
    options.find((option) => option.value === value) ?? options[0];
  const selectedLabel = selectedOption ? labelFor(selectedOption) : value;

  useEffect(() => {
    setActiveValue(value);
  }, [value]);

  useEffect(() => {
    if (disabled) {
      setIsOpen(false);
    }
  }, [disabled]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    listboxRef.current?.focus();

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

  function open(): void {
    if (disabled) {
      return;
    }

    setActiveValue(value);
    setIsOpen(true);
  }

  function close(restoreFocus: boolean): void {
    setIsOpen(false);

    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }

  function choose(optionValue: string): void {
    onChange(optionValue);
    close(true);
  }

  function move(delta: number): void {
    if (options.length === 0) {
      return;
    }

    const currentIndex = Math.max(
      0,
      options.findIndex((option) => option.value === activeValue)
    );
    const next = options[(currentIndex + delta + options.length) % options.length];

    if (next) {
      setActiveValue(next.value);
    }
  }

  function handleTriggerKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>
  ): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      open();
    }
  }

  function handleListboxKeyDown(
    event: ReactKeyboardEvent<HTMLDivElement>
  ): void {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        close(true);
        return;
      case "Tab":
        // Let focus move on naturally; just dismiss the popup.
        setIsOpen(false);
        return;
      case "ArrowDown":
        event.preventDefault();
        move(1);
        return;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        return;
      case "Home":
        event.preventDefault();
        if (options[0]) {
          setActiveValue(options[0].value);
        }
        return;
      case "End":
        event.preventDefault();
        if (options[options.length - 1]) {
          setActiveValue(options[options.length - 1]!.value);
        }
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(activeValue);
        return;
      default:
        return;
    }
  }

  return (
    <div ref={containerRef} id={id} className="colorThemeDropdown">
      <button
        ref={triggerRef}
        type="button"
        className="colorThemeDropdownTrigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        style={previewStyle(selectedOption?.value ?? value)}
        aria-labelledby={`${labelId} ${valueId}`}
        onClick={() => (isOpen ? close(false) : open())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="colorThemeDropdownValue">
          <ThemeSwatch themeId={selectedOption?.value ?? value} />
          <span id={valueId} className="colorThemeDropdownLabel">
            {selectedLabel}
          </span>
        </span>
        <span className="colorThemeDropdownCaret" aria-hidden="true" />
      </button>

      {isOpen ? (
        <div
          ref={listboxRef}
          className="colorThemeDropdownMenu"
          role="listbox"
          aria-labelledby={labelId}
          aria-activedescendant={optionId(activeValue)}
          tabIndex={-1}
          onKeyDown={handleListboxKeyDown}
        >
          {options.map((option) => {
            const optionLabel = labelFor(option);
            const isSelected = option.value === value;

            return (
              <div
                key={option.value}
                id={optionId(option.value)}
                role="option"
                className="colorThemeDropdownOption"
                data-theme-id={option.value}
                style={previewStyle(option.value)}
                data-active={option.value === activeValue || undefined}
                aria-selected={isSelected}
                aria-label={translate(
                  "settings.workbench.colorTheme.optionAria",
                  { theme: optionLabel }
                )}
                onMouseEnter={() => setActiveValue(option.value)}
                onClick={() => choose(option.value)}
              >
                <ThemeSwatch themeId={option.value} />
                <span className="colorThemeDropdownLabel">{optionLabel}</span>
                <span
                  className="colorThemeDropdownCheck"
                  data-selected={isSelected || undefined}
                  aria-hidden="true"
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
