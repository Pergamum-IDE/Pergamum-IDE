import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from "react";
import type { Translate } from "../../shared/i18n";
import {
  CASE_SENSITIVE_ICON,
  SearchOptionToggle,
  USE_REGEX_ICON,
  WHOLE_WORD_ICON,
  inlineSearchIcon
} from "../searchOptionToggle";
import replaceCurrentIconRaw from "../../../assets/icons/svgrepo/editor/replace-svgrepo-com.svg?raw";
import {
  replacementTemplateErrorTranslationKey,
  type ActiveDocumentFindOptions,
  type ReplacementTemplateError
} from "./activeDocumentFind";
import type { ActiveFindPanelMode } from "./activeFindKeymapExtension";

const REPLACE_CURRENT_ICON = inlineSearchIcon(replaceCurrentIconRaw);

/**
 * #424 — the Pergamum active-document Find / Replace panel.
 *
 * A presentational component: the owner (`MarkdownEditorSurface`) holds the
 * query / replace text / options / match list / active index and drives every
 * action, including the actual CodeMirror replace transaction.
 *
 * Slice 3 adds the `検索 / 置換` mode tabs, the replace-text input, and the
 * icon-only "replace current match" button (`assets/icons/svgrepo/editor/
 * replace-svgrepo-com.svg`). Focus polish: every button `preventDefault`s its
 * mousedown so clicking it never pulls focus out of the active text input.
 */
export interface ActiveFindPanelProps {
  readonly translate: Translate;
  readonly mode: ActiveFindPanelMode;
  readonly query: string;
  readonly replaceText: string;
  readonly options: ActiveDocumentFindOptions;
  readonly markAll: boolean;
  /** Non-null while `.*` is on and the pattern does not compile. */
  readonly regexError: string | null;
  /** Non-null in Replace mode while `.*` is on and the template is invalid. */
  readonly templateError: ReplacementTemplateError | null;
  /** `true` for a read-only project / document — replace is unavailable. */
  readonly readOnly: boolean;
  /** Owner-computed: the replace-current button / Enter action is allowed. */
  readonly replaceCurrentEnabled: boolean;
  readonly matchCount: number;
  readonly activeIndex: number | null;
  /** Bumped by the owner to re-focus + select the mode's primary input. */
  readonly focusToken: number;
  readonly onModeChange: (mode: ActiveFindPanelMode) => void;
  readonly onQueryChange: (query: string) => void;
  readonly onReplaceTextChange: (replaceText: string) => void;
  readonly onToggleOption: (key: keyof ActiveDocumentFindOptions) => void;
  readonly onToggleMarkAll: () => void;
  readonly onReplaceCurrent: () => void;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
  readonly onClose: () => void;
}

/** Shared: a button whose mousedown never steals focus from the text input. */
function preventFocusSteal(event: ReactMouseEvent): void {
  event.preventDefault();
}

export function ActiveFindPanel({
  translate,
  mode,
  query,
  replaceText,
  options,
  markAll,
  regexError,
  templateError,
  readOnly,
  replaceCurrentEnabled,
  matchCount,
  activeIndex,
  focusToken,
  onModeChange,
  onQueryChange,
  onReplaceTextChange,
  onToggleOption,
  onToggleMarkAll,
  onReplaceCurrent,
  onNext,
  onPrevious,
  onClose
}: ActiveFindPanelProps): JSX.Element {
  const queryInputRef = useRef<HTMLInputElement | null>(null);

  const replaceMode = mode === "replace";

  // Focus + select the query input on mount and whenever the owner bumps
  // `focusToken` (Ctrl+F / Ctrl+H, or a mode-tab click).
  useEffect(() => {
    const input = queryInputRef.current;
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

  const errorText = hasRegexError
    ? translate("search.invalidRegex")
    : replaceMode && templateError !== null
      ? translate(replacementTemplateErrorTranslationKey(templateError))
      : replaceMode && readOnly
        ? translate("editor.find.readOnlyReplaceUnavailable")
        : null;

  /**
   * #424 Slice 3 dogfood: while a panel input has focus the CodeMirror keymap
   * never sees Ctrl+F / Ctrl+H (the editor is not focused), so the panel
   * switches modes itself. Handled → `preventDefault` + `stopPropagation`.
   * Returns `true` when it consumed the event.
   */
  const handleModeShortcut = (
    event: ReactKeyboardEvent<HTMLInputElement>
  ): boolean => {
    const plainCtrlOrCmd =
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.ctrlKey !== event.metaKey;
    if (!plainCtrlOrCmd) {
      return false;
    }
    if (event.code === "KeyF") {
      event.preventDefault();
      event.stopPropagation();
      // The owner re-focuses + selects the query input via `focusToken`.
      onModeChange("search");
      return true;
    }
    if (event.code === "KeyH") {
      event.preventDefault();
      event.stopPropagation();
      onModeChange("replace");
      return true;
    }
    return false;
  };

  const handleQueryKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>
  ): void => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (handleModeShortcut(event)) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
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

  const handleReplaceKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>
  ): void => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (handleModeShortcut(event)) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) {
        onPrevious();
      } else if (replaceCurrentEnabled) {
        onReplaceCurrent();
      }
    }
  };

  return (
    <div
      className="activeFindPanel"
      role="search"
      aria-label={translate("editor.find.panelLabel")}
    >
      <div className="activeFindPanelRow activeFindPanelModeRow" role="tablist">
        <button
          type="button"
          role="tab"
          className="activeFindPanelModeTab"
          aria-selected={!replaceMode}
          data-active={!replaceMode ? "true" : undefined}
          title={translate("editor.find.mode.search")}
          onMouseDown={preventFocusSteal}
          onClick={() => onModeChange("search")}
        >
          {translate("editor.find.mode.search")}
        </button>
        <button
          type="button"
          role="tab"
          className="activeFindPanelModeTab"
          aria-selected={replaceMode}
          data-active={replaceMode ? "true" : undefined}
          title={translate("editor.find.mode.replace")}
          onMouseDown={preventFocusSteal}
          onClick={() => onModeChange("replace")}
        >
          {translate("editor.find.mode.replace")}
        </button>
      </div>

      <div className="activeFindPanelRow activeFindPanelQueryRow">
        <input
          ref={queryInputRef}
          type="text"
          className="activeFindPanelInput"
          data-invalid={hasRegexError ? "true" : undefined}
          value={query}
          placeholder={translate("editor.find.searchPlaceholder")}
          aria-label={translate("editor.find.searchPlaceholder")}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          onKeyDown={handleQueryKeyDown}
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
          onMouseDown={preventFocusSteal}
          onClick={onClose}
        >
          ×
        </button>
      </div>

      {replaceMode ? (
        <div className="activeFindPanelRow activeFindPanelReplaceRow">
          <input
            type="text"
            className="activeFindPanelInput activeFindPanelReplaceInput"
            data-invalid={templateError !== null ? "true" : undefined}
            value={replaceText}
            placeholder={translate("editor.find.replacePlaceholder")}
            aria-label={translate("editor.find.replacePlaceholder")}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => onReplaceTextChange(event.currentTarget.value)}
            onKeyDown={handleReplaceKeyDown}
          />
        </div>
      ) : null}

      <div className="activeFindPanelRow activeFindPanelNavRow">
        <button
          type="button"
          className="activeFindPanelButton activeFindPanelPrevButton"
          aria-label={translate("editor.find.previous")}
          title={translate("editor.find.previous")}
          disabled={!hasMatches}
          onMouseDown={preventFocusSteal}
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
          onMouseDown={preventFocusSteal}
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
          onMouseDown={preventFocusSteal}
          onClick={onNext}
        >
          ▶
        </button>
        {replaceMode ? (
          <button
            type="button"
            className="activeFindPanelButton activeFindPanelReplaceCurrentButton"
            aria-label={translate("editor.find.replaceCurrent")}
            title={translate("editor.find.replaceCurrentTooltip")}
            disabled={!replaceCurrentEnabled}
            onMouseDown={preventFocusSteal}
            onClick={onReplaceCurrent}
          >
            <span
              className="activeFindPanelReplaceCurrentIcon"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: REPLACE_CURRENT_ICON }}
            />
          </button>
        ) : null}
      </div>

      {errorText !== null ? (
        <p className="activeFindPanelError" role="alert">
          {errorText}
        </p>
      ) : null}
    </div>
  );
}
