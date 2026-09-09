import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Translate } from "../../shared/i18n";
import {
  CASE_SENSITIVE_ICON,
  SearchOptionToggle,
  USE_REGEX_ICON,
  WHOLE_WORD_ICON
} from "../searchOptionToggle";
import type { ActiveDocumentFindOptions } from "./activeDocumentFind";

/**
 * #424 — the Pergamum active-document Find panel.
 *
 * A presentational component: the owner (`MarkdownEditorSurface`) holds the
 * query / options / match list / active index and drives every action. The
 * layout is a two-row stack (plus an optional regex-error line) so a later
 * slice can add the `語彙` button and a `検索 / 置換` tab strip without
 * restructuring.
 *
 * Slice 2 adds the `Ab` / `Aa` / `.*` toggles (shared with the project-wide
 * Search pane via `../searchOptionToggle`), the `マークする` toggle, and the
 * regex-error message.
 */
export interface ActiveFindPanelProps {
  readonly translate: Translate;
  readonly query: string;
  readonly options: ActiveDocumentFindOptions;
  readonly markAll: boolean;
  /** Non-null while `.*` is on and the pattern does not compile. */
  readonly regexError: string | null;
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
  readonly onToggleOption: (key: keyof ActiveDocumentFindOptions) => void;
  readonly onToggleMarkAll: () => void;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
  readonly onClose: () => void;
}

export function ActiveFindPanel({
  translate,
  query,
  options,
  markAll,
  regexError,
  matchCount,
  activeIndex,
  focusToken,
  onQueryChange,
  onToggleOption,
  onToggleMarkAll,
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
  const hasRegexError = regexError !== null;

  const countText = !hasQuery || hasRegexError
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
          data-invalid={hasRegexError ? "true" : undefined}
          value={query}
          placeholder={translate("editor.find.searchPlaceholder")}
          aria-label={translate("editor.find.searchPlaceholder")}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          onKeyDown={handleInputKeyDown}
        />
        <div
          className="activeFindPanelOptions"
          role="group"
          aria-label={translate("search.options.label")}
        >
          <SearchOptionToggle
            icon={WHOLE_WORD_ICON}
            pressed={options.wholeWord}
            disabled={options.useRegex}
            label={translate("search.option.wholeWord")}
            hint={
              options.useRegex
                ? translate("search.wholeWordUnavailableWithRegex")
                : translate("search.option.wholeWord.hint")
            }
            onToggle={() => onToggleOption("wholeWord")}
          />
          <SearchOptionToggle
            icon={CASE_SENSITIVE_ICON}
            pressed={options.caseSensitive}
            label={translate("search.option.caseSensitive")}
            hint={translate("search.option.caseSensitive.hint")}
            onToggle={() => onToggleOption("caseSensitive")}
          />
          <SearchOptionToggle
            icon={USE_REGEX_ICON}
            pressed={options.useRegex}
            label={translate("search.option.useRegex")}
            hint={translate("search.option.useRegex.hint")}
            onToggle={() => onToggleOption("useRegex")}
          />
        </div>
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
        <button
          type="button"
          className="activeFindPanelMarkToggle"
          data-pressed={markAll ? "true" : undefined}
          aria-pressed={markAll}
          title={translate("editor.find.markMatches")}
          onClick={onToggleMarkAll}
        >
          {translate("editor.find.markMatches")}
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

      {hasRegexError ? (
        <p className="activeFindPanelError" role="alert">
          {translate("search.invalidRegex")}
        </p>
      ) : null}
    </div>
  );
}
