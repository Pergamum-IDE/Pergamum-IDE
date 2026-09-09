import type { MouseEvent as ReactMouseEvent } from "react";
import type { Translate } from "../../shared/i18n";
import type { GlossaryCompletionDisplayItem } from "./activeFindGlossaryCompletion";

/**
 * #424 Slice 5 — the Ctrl+Space Glossary IntelliSense popup for the active
 * Find / Replace panel inputs.
 *
 * Deliberately mirrors the Markdown Editor's CodeMirror completion tooltip
 * (the source of truth): a compact single-column list, one row per candidate,
 * the registered form followed inline by a muted italic `"→ 代表語"` detail
 * only for a non-representative form, and the active row highlighted the same
 * way CodeMirror highlights `[aria-selected]`. Styling lives in a shared
 * `.activeFindPanelCompletion*` block tuned to match CM's default theme
 * (rather than depending on CodeMirror's own internal classes).
 *
 * Presentational only: the owner (`ActiveFindPanel`) keeps it open, holds the
 * filtered rows + active index, and applies the picked `insertText` to the
 * originating input. The popup never takes focus — every row `preventDefault`s
 * its mousedown so the input keeps the caret and keyboard nav keeps working.
 */
export interface ActiveFindGlossaryCompletionPopupProps {
  readonly translate: Translate;
  readonly items: readonly GlossaryCompletionDisplayItem[];
  readonly activeIndex: number;
  readonly onSelect: (item: GlossaryCompletionDisplayItem) => void;
  readonly onActiveIndexChange: (index: number) => void;
}

function preventFocusSteal(event: ReactMouseEvent): void {
  event.preventDefault();
}

export function ActiveFindGlossaryCompletionPopup({
  translate,
  items,
  activeIndex,
  onSelect,
  onActiveIndexChange
}: ActiveFindGlossaryCompletionPopupProps): JSX.Element {
  return (
    <ul
      className="activeFindPanelCompletion"
      role="listbox"
      aria-label={translate("editor.find.glossaryCompletion")}
    >
      {items.length === 0 ? (
        <li className="activeFindPanelCompletionEmpty" aria-disabled="true">
          {translate("editor.find.glossaryEmpty")}
        </li>
      ) : (
        items.map((item, index) => {
          const isActive = index === activeIndex;
          return (
            <li
              key={item.atomId}
              role="option"
              aria-selected={isActive}
              data-active={isActive ? "true" : undefined}
              className="activeFindPanelCompletionOption"
              title={
                item.detail ? `${item.value} ${item.detail}` : item.value
              }
              onMouseDown={preventFocusSteal}
              onMouseEnter={() => onActiveIndexChange(index)}
              onClick={() => onSelect(item)}
            >
              <span className="activeFindPanelCompletionLabel">
                {item.value}
              </span>
              {item.detail !== null ? (
                <span className="activeFindPanelCompletionDetail">
                  {item.detail}
                </span>
              ) : null}
            </li>
          );
        })
      )}
    </ul>
  );
}
