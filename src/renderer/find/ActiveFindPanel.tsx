import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Translate } from "../../shared/i18n";

/**
 * #424 Slice 1 — the Pergamum active-document Find panel.
 *
 * A deliberately minimal, presentational component: the owner
 * (`MarkdownEditorSurface`) holds the query / match list / active index and
 * drives every action. The layout is a two-row stack so Slice 2+ can grow the
 * query row (`語彙` / `Ab` / `Aa` / `.*`) and the nav row (`マークする`) and add
 * a `検索 / 置換` tab strip above, without restructuring.
 */
export interface ActiveFindPanelProps {
  readonly translate: Translate;
  readonly query: string;
  /** Total matches for the current query in the active document. */
  readonly matchCount: number;
  /** 0-based index of the currently highlighted match, or `null`. */
  readonly activeIndex: number | null;
  /**
   * Bumped by the owner to re-focus + select the search input — e.g. Ctrl+F
   * pressed again while the panel is already open.
   */
  readonly focusToken: number;
  readonly onQueryChange: (query: string) => void;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
  readonly onClose: () => void;
}

export function ActiveFindPanel({
  translate,
  query,
  matchCount,
  activeIndex,
  focusToken,
  onQueryChange,
  onNext,
  onPrevious,
  onClose
}: ActiveFindPanelProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus + select on mount and whenever the owner bumps `focusToken`.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    input.focus();
    input.select();
  }, [focusToken]);

  const hasQuery = query.trim().length > 0;
  const hasMatches = matchCount > 0;

  const countText = !hasQuery
    ? ""
    : hasMatches
      ? translate("editor.find.matchCount", {
          current: (activeIndex ?? 0) + 1,
          total: matchCount
        })
      : translate("editor.find.noMatches");

  const handleInputKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>
  ): void => {
    // Never treat a key as a command while the IME is composing.
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (
      event.code === "KeyF" &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey
    ) {
      // Ctrl+F inside the panel: keep it here, re-select the query.
      event.preventDefault();
      inputRef.current?.select();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) {
        onPrevious();
      } else {
        onNext();
      }
    }
  };

  return (
    <div
      className="activeFindPanel"
      role="search"
      aria-label={translate("editor.find.panelLabel")}
    >
      <div className="activeFindPanelRow activeFindPanelQueryRow">
        <input
          ref={inputRef}
          type="text"
          className="activeFindPanelInput"
          value={query}
          placeholder={translate("editor.find.searchPlaceholder")}
          aria-label={translate("editor.find.searchPlaceholder")}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          onKeyDown={handleInputKeyDown}
        />
        <button
          type="button"
          className="activeFindPanelButton activeFindPanelCloseButton"
          aria-label={translate("editor.find.close")}
          title={translate("editor.find.close")}
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <div className="activeFindPanelRow activeFindPanelNavRow">
        <button
          type="button"
          className="activeFindPanelButton activeFindPanelPrevButton"
          aria-label={translate("editor.find.previous")}
          title={translate("editor.find.previous")}
          disabled={!hasMatches}
          onClick={onPrevious}
        >
          ◀
        </button>
        <span className="activeFindPanelCount" role="status" aria-live="polite">
          {countText}
        </span>
        <button
          type="button"
          className="activeFindPanelButton activeFindPanelNextButton"
          aria-label={translate("editor.find.next")}
          title={translate("editor.find.next")}
          disabled={!hasMatches}
          onClick={onNext}
        >
          ▶
        </button>
      </div>
    </div>
  );
}
