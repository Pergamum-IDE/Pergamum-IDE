import {
  useEffect,
  useRef,
  useState,
  type FC,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import type { Translate, TranslationKey } from "../../shared/i18n";
import {
  isPreviewRendererId,
  type PreviewRendererId
} from "../../shared/settings";
import { getSettingCatalogItem } from "../../shared/settingsUiCatalog";

export interface PreviewRendererToolbarOption {
  readonly value: PreviewRendererId;
  readonly labelKey: TranslationKey;
}

export function getPreviewRendererToolbarOptions(): readonly PreviewRendererToolbarOption[] {
  const item = getSettingCatalogItem("preview.renderer");

  if (!item || item.control.kind !== "select") {
    return [];
  }

  return item.control.options.flatMap((option) =>
    isPreviewRendererId(option.value)
      ? [
          {
            value: option.value,
            labelKey: option.labelKey as TranslationKey
          }
        ]
      : []
  );
}

export interface PreviewRendererDropdownProps {
  selectedRenderer: PreviewRendererId;
  defaultRenderer: PreviewRendererId;
  disabled: boolean;
  onSelectRenderer: (renderer: PreviewRendererId) => void;
  translate: Translate;
}

const previewRendererOptions = getPreviewRendererToolbarOptions();

function moveActiveIndex(
  options: readonly PreviewRendererToolbarOption[],
  current: PreviewRendererId,
  delta: number
): PreviewRendererId {
  if (options.length === 0) {
    return current;
  }

  const currentIndex = Math.max(
    0,
    options.findIndex((option) => option.value === current)
  );
  const nextIndex =
    (currentIndex + delta + options.length) % options.length;

  return options[nextIndex].value;
}

function labelForRenderer(
  renderer: PreviewRendererId,
  translate: Translate
): string {
  const option = previewRendererOptions.find(
    (candidate) => candidate.value === renderer
  );

  return option ? translate(option.labelKey) : renderer;
}

export const PreviewRendererDropdown: FC<PreviewRendererDropdownProps> = ({
  selectedRenderer,
  defaultRenderer,
  disabled,
  onSelectRenderer,
  translate
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeRenderer, setActiveRenderer] =
    useState<PreviewRendererId>(selectedRenderer);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);

  const label = translate("settings.preview.renderer.label");
  const selectedLabel = labelForRenderer(selectedRenderer, translate);
  const defaultLabel = labelForRenderer(defaultRenderer, translate);
  const defaultIndicatorLabel = translate(
    "toolbar.previewRenderer.defaultIndicator"
  );
  const defaultDescription = translate(
    "toolbar.previewRenderer.defaultDescription",
    { renderer: defaultLabel }
  );

  useEffect(() => {
    setActiveRenderer(selectedRenderer);
  }, [selectedRenderer]);

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

  function openDropdown(): void {
    if (disabled) {
      return;
    }

    setActiveRenderer(selectedRenderer);
    setIsOpen(true);
  }

  function closeDropdown({ restoreFocus }: { restoreFocus: boolean }): void {
    setIsOpen(false);

    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }

  function selectRenderer(renderer: PreviewRendererId): void {
    onSelectRenderer(renderer);
    closeDropdown({ restoreFocus: true });
  }

  function handleTriggerKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>
  ): void {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    event.preventDefault();
    openDropdown();
  }

  function handleListboxKeyDown(
    event: ReactKeyboardEvent<HTMLDivElement>
  ): void {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        closeDropdown({ restoreFocus: true });
        return;
      case "ArrowDown":
        event.preventDefault();
        setActiveRenderer((current) =>
          moveActiveIndex(previewRendererOptions, current, 1)
        );
        return;
      case "ArrowUp":
        event.preventDefault();
        setActiveRenderer((current) =>
          moveActiveIndex(previewRendererOptions, current, -1)
        );
        return;
      case "Home":
        event.preventDefault();
        if (previewRendererOptions[0]) {
          setActiveRenderer(previewRendererOptions[0].value);
        }
        return;
      case "End":
        event.preventDefault();
        if (previewRendererOptions[previewRendererOptions.length - 1]) {
          setActiveRenderer(
            previewRendererOptions[previewRendererOptions.length - 1].value
          );
        }
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        selectRenderer(activeRenderer);
        return;
      default:
        return;
    }
  }

  return (
    <div
      ref={containerRef}
      className="previewRendererDropdown"
      data-testid="previewRendererDropdown"
    >
      <button
        ref={triggerRef}
        type="button"
        className="previewRendererDropdownTrigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={label}
        aria-describedby="previewRendererDropdownDefault"
        title={`${label}: ${selectedLabel}. ${defaultDescription}`}
        onClick={() => {
          if (isOpen) {
            closeDropdown({ restoreFocus: false });
            return;
          }

          openDropdown();
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="previewRendererDropdownValue">{selectedLabel}</span>
        <span className="previewRendererDropdownCaret" aria-hidden="true" />
      </button>
      <span id="previewRendererDropdownDefault" className="srOnly">
        {defaultDescription}
      </span>

      {isOpen ? (
        <div
          ref={listboxRef}
          className="previewRendererDropdownMenu"
          role="listbox"
          aria-label={label}
          aria-activedescendant={`preview-renderer-option-${activeRenderer}`}
          tabIndex={-1}
          onKeyDown={handleListboxKeyDown}
        >
          {previewRendererOptions.map((option) => {
            const optionLabel = translate(option.labelKey);
            const isSelected = option.value === selectedRenderer;
            const isActive = option.value === activeRenderer;
            const isDefault = option.value === defaultRenderer;

            return (
              <button
                key={option.value}
                id={`preview-renderer-option-${option.value}`}
                type="button"
                role="option"
                tabIndex={-1}
                className="previewRendererDropdownOption"
                data-preview-renderer-id={option.value}
                data-active={isActive || undefined}
                data-default-renderer={isDefault || undefined}
                aria-selected={isSelected}
                aria-label={
                  isDefault
                    ? `${optionLabel} (${defaultIndicatorLabel})`
                    : optionLabel
                }
                onMouseEnter={() => setActiveRenderer(option.value)}
                onClick={() => selectRenderer(option.value)}
              >
                <span
                  className="previewRendererDropdownCheck"
                  data-selected={isSelected || undefined}
                  aria-hidden="true"
                />
                <span className="previewRendererDropdownOptionText">
                  <span className="previewRendererDropdownOptionLabel">
                    {optionLabel}
                  </span>
                  {isDefault ? (
                    <span className="previewRendererDropdownDefaultBadge">
                      {defaultIndicatorLabel}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
