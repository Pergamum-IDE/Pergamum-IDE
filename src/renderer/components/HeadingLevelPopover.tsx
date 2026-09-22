import { useEffect, useRef, type FC, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Translate, TranslationKey } from "../../shared/i18n";
import type { HeadingLevel } from "../../shared/markdownHeadingMarkup";

export interface HeadingLevelPopoverProps {
  onSelectHeadingLevel: (level: HeadingLevel) => void;
  onClose: () => void;
  translate: Translate;
}

const HEADING_LEVEL_OPTIONS: ReadonlyArray<{
  readonly level: HeadingLevel;
  readonly labelKey: TranslationKey;
}> = [
  { level: 1, labelKey: "toolbar.heading.h1" },
  { level: 2, labelKey: "toolbar.heading.h2" },
  { level: 3, labelKey: "toolbar.heading.h3" },
  { level: 4, labelKey: "toolbar.heading.h4" },
  { level: 5, labelKey: "toolbar.heading.h5" },
  { level: 6, labelKey: "toolbar.heading.h6" },
  { level: "normal", labelKey: "toolbar.heading.normalParagraph" }
];

export const HeadingLevelPopover: FC<HeadingLevelPopoverProps> = ({
  onSelectHeadingLevel,
  onClose,
  translate
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();

    const handleMouseDownOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    window.addEventListener("mousedown", handleMouseDownOutside, true);

    return () => {
      window.removeEventListener("mousedown", handleMouseDownOutside, true);
    };
  }, [onClose]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <div
      ref={containerRef}
      className="headingLevelPopover"
      role="dialog"
      aria-label={translate("toolbar.insertHeading")}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <ul className="headingLevelPopoverList" role="listbox">
        {HEADING_LEVEL_OPTIONS.map(({ level, labelKey }) => (
          <li key={String(level)} className="headingLevelPopoverItem">
            <button
              type="button"
              className="headingLevelPopoverOption"
              role="option"
              onClick={() => onSelectHeadingLevel(level)}
            >
              {translate(labelKey)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
