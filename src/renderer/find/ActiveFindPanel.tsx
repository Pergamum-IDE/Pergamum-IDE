import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from "react";
import type { Translate } from "../../shared/i18n";
import {
  CASE_SENSITIVE_ICON,
  GLOSSARY_SEARCH_ICON,
  SearchOptionToggle,
  USE_REGEX_ICON,
  WHOLE_WORD_ICON,
  inlineSearchIcon
} from "../searchOptionToggle";
import replaceCurrentIconRaw from "../../../assets/icons/svgrepo/editor/replace-svgrepo-com.svg?raw";
import replaceAllIconRaw from "../../../assets/icons/svgrepo/editor/replace-all-svgrepo-com.svg?raw";
import {
  replacementTemplateErrorTranslationKey,
  type ActiveDocumentFindOptions,
  type ReplacementTemplateError
} from "./activeDocumentFind";
import type { FindGlossaryCandidate } from "./findGlossaryPicker";
import { ActiveFindGlossarySelect } from "./ActiveFindGlossarySelect";
import type { ActiveGlossarySearchRelation } from "./activeGlossaryFind";
import type { ActiveGlossaryNearbySettings } from "./activeGlossaryNearbySearch";
import { ActiveFindGlossaryCompletionPopup } from "./ActiveFindGlossaryCompletionPopup";
import {
  activeFindGlossaryAtomValues,
  applyActiveFindGlossaryCompletion,
  collectActiveFindGlossaryCompletionItems,
  resolveActiveFindGlossaryCompletionPrefix,
  type ActiveFindGlossaryCompletionTarget,
  type GlossaryCompletionDisplayItem
} from "./activeFindGlossaryCompletion";
import type { ActiveFindPanelMode } from "./activeFindKeymapExtension";

const REPLACE_CURRENT_ICON = inlineSearchIcon(replaceCurrentIconRaw);
const REPLACE_ALL_ICON = inlineSearchIcon(replaceAllIconRaw);

/**
 * #424 — the Pergamum active-document Find / Replace panel.
 *
 * A presentational component: the owner (`MarkdownEditorSurface`) holds the
 * query / replace text / options / match list / active index and drives every
 * action, including the actual CodeMirror replace transaction.
 *
 * Slice 3 adds the `検索 / 置換` mode tabs, the replace-text input, and the
 * icon-only "replace current match" button. Slice 4 adds the visible-label
 * "全置換 / Replace All" button (影響範囲が大きいのでアイコンだけにしない) and the
 * icon-only `語彙` picker that drops a glossary atom's RAW value into the
 * search box. Slice 5 adds Ctrl+Space Glossary IntelliSense on BOTH inputs —
 * a popup deliberately matched to the Markdown Editor's completion tooltip
 * (shared `GlossaryCompletionDisplayItem` rows, same representative rule, same
 * key handling) that inserts an atom's RAW value (query = whole-value replace;
 * replace = prefix-consuming caret insert / selection replace). Focus polish:
 * every button / row `preventDefault`s its mousedown so clicking it never pulls
 * focus out of the active text input.
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
  /** Owner-computed: the replace-all button is allowed. */
  readonly replaceAllEnabled: boolean;
  /** Project glossary atoms (project order) — IntelliSense + glossary mode. */
  readonly glossaryCandidates: readonly FindGlossaryCandidate[];
  /**
   * #424 Slice 6: `"text"` = the plain text query + `Ab`/`Aa`/`.*`; `"glossary"`
   * = a Glossary Atom selector (multi in Search, single in Replace) + relation.
   */
  readonly queryKind: "text" | "glossary";
  /** Search tab glossary mode: `いずれか` / `全て`. */
  readonly glossaryRelation: ActiveGlossarySearchRelation;
  /** #424 Slice 7: effective nearby-search range, for the `近傍` summary label. */
  readonly glossaryNearbySettings: ActiveGlossaryNearbySettings;
  /** Search tab glossary mode: selected atom ids (multi). */
  readonly searchGlossaryAtomIds: readonly string[];
  /** Replace tab glossary mode: selected atom id (single), or `null`. */
  readonly replaceGlossaryAtomId: string | null;
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
  readonly onReplaceAll: () => void;
  /** #424 Slice 6: toggle text ⇄ glossary query kind (the `語彙` icon). */
  readonly onQueryKindChange: (kind: "text" | "glossary") => void;
  readonly onGlossaryRelationChange: (
    relation: ActiveGlossarySearchRelation
  ) => void;
  readonly onSearchGlossaryAtomIdsChange: (atomIds: string[]) => void;
  readonly onReplaceGlossaryAtomIdChange: (atomId: string | null) => void;
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
  replaceAllEnabled,
  glossaryCandidates,
  queryKind,
  glossaryRelation,
  glossaryNearbySettings,
  searchGlossaryAtomIds,
  replaceGlossaryAtomId,
  matchCount,
  activeIndex,
  focusToken,
  onModeChange,
  onQueryChange,
  onReplaceTextChange,
  onToggleOption,
  onToggleMarkAll,
  onReplaceCurrent,
  onReplaceAll,
  onQueryKindChange,
  onGlossaryRelationChange,
  onSearchGlossaryAtomIdsChange,
  onReplaceGlossaryAtomIdChange,
  onNext,
  onPrevious,
  onClose
}: ActiveFindPanelProps): JSX.Element {
  const queryInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);

  const replaceMode = mode === "replace";
  const glossaryMode = queryKind === "glossary";
  const hasGlossaryCandidates = glossaryCandidates.length > 0;

  // #424 Slice 5: Ctrl+Space Glossary IntelliSense on the query / replace
  // inputs. The popup never takes focus — the originating input keeps the
  // caret and drives keyboard navigation through its own `onKeyDown`.
  const [completionOpen, setCompletionOpen] = useState(false);
  const [completionTarget, setCompletionTarget] =
    useState<ActiveFindGlossaryCompletionTarget>("query");
  const [completionPrefix, setCompletionPrefix] = useState("");
  const [completionActiveIndex, setCompletionActiveIndex] = useState(0);
  // Applied after the controlled value re-renders: restore focus + caret.
  const pendingCompletionCaretRef = useRef<{
    target: ActiveFindGlossaryCompletionTarget;
    start: number;
    end: number;
  } | null>(null);
  const [completionApplyToken, setCompletionApplyToken] = useState(0);

  const inputRefFor = (
    target: ActiveFindGlossaryCompletionTarget
  ): HTMLInputElement | null =>
    (target === "query" ? queryInputRef : replaceInputRef).current;

  const completionAtomValues = useMemo(
    () => activeFindGlossaryAtomValues(glossaryCandidates),
    [glossaryCandidates]
  );

  const completionItems = useMemo<GlossaryCompletionDisplayItem[]>(
    () =>
      completionOpen
        ? collectActiveFindGlossaryCompletionItems(
            glossaryCandidates,
            completionPrefix
          )
        : [],
    [completionOpen, glossaryCandidates, completionPrefix]
  );

  // Focus + select the text query input on mount and whenever the owner bumps
  // `focusToken` (Ctrl+F / Ctrl+H, or a mode-tab click). In glossary mode the
  // `ActiveFindGlossarySelect` owns its own focusToken effect. A pending owner
  // re-focus also dismisses the Ctrl+Space completion.
  useEffect(() => {
    setCompletionOpen(false);
    const input = queryInputRef.current;
    if (!input) {
      return;
    }
    input.focus();
    input.select();
  }, [focusToken]);

  // Ctrl+Space completion is a transient sub-popover: close it whenever the
  // panel switches tabs or query kind.
  useEffect(() => {
    setCompletionOpen(false);
  }, [mode, queryKind]);

  // #424 Slice 5: keep the completion's active index inside the row list as it
  // re-filters under the user's typing.
  useEffect(() => {
    setCompletionActiveIndex((index) => {
      if (completionItems.length === 0) {
        return 0;
      }
      return Math.min(Math.max(index, 0), completionItems.length - 1);
    });
  }, [completionItems.length]);

  // #424 Slice 5: after a picked candidate updated the controlled value,
  // restore focus + caret to the originating input.
  useEffect(() => {
    const pending = pendingCompletionCaretRef.current;
    if (pending === null) {
      return;
    }
    pendingCompletionCaretRef.current = null;
    const input = inputRefFor(pending.target);
    if (input === null) {
      return;
    }
    input.focus();
    try {
      input.setSelectionRange(pending.start, pending.end);
    } catch {
      // Defensive: some environments throw on setSelectionRange for certain
      // input types. Focus was already restored, which is the important part.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completionApplyToken]);

  const hasQuery = query.trim().length > 0;
  const hasMatches = matchCount > 0;
  const hasRegexError = regexError !== null;
  const glossarySelectedIds = replaceMode
    ? replaceGlossaryAtomId !== null
      ? [replaceGlossaryAtomId]
      : []
    : searchGlossaryAtomIds;
  const hasGlossarySelection = glossarySelectedIds.length > 0;
  // Whether the count / navigation area has a live query at all.
  const hasActiveQuery = glossaryMode ? hasGlossarySelection : hasQuery;

  const countText = !hasActiveQuery || hasRegexError
    ? ""
    : hasMatches
      ? translate("editor.find.matchCount", {
          current: (activeIndex ?? 0) + 1,
          total: matchCount
        })
      : translate("editor.find.noMatches");

  // #424 Slice 7: short "近傍: 前後2パラグラフ" / "Nearby: within 500 characters".
  const nearbySummaryText =
    glossaryNearbySettings.unit === "paragraphs"
      ? translate("editor.find.glossaryRelationSummary.paragraphs", {
          distance: glossaryNearbySettings.paragraphDistance
        })
      : translate("editor.find.glossaryRelationSummary.characters", {
          distance: glossaryNearbySettings.characterDistance
        });

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
    if (event.code === "KeyF" || event.code === "KeyH") {
      const nextMode: ActiveFindPanelMode =
        event.code === "KeyF" ? "search" : "replace";
      event.preventDefault();
      event.stopPropagation();
      // The owner re-focuses + selects the query input via `focusToken`.
      onModeChange(nextMode);
      return true;
    }
    return false;
  };

  // #424 Slice 5 -----------------------------------------------------------
  const prefixFor = (
    target: ActiveFindGlossaryCompletionTarget,
    value: string,
    caret: number
  ): string =>
    resolveActiveFindGlossaryCompletionPrefix(
      target,
      value,
      caret,
      completionAtomValues
    );

  const openCompletion = (
    target: ActiveFindGlossaryCompletionTarget
  ): void => {
    const input = inputRefFor(target);
    if (input === null) {
      return;
    }
    setCompletionTarget(target);
    setCompletionPrefix(
      prefixFor(target, input.value, input.selectionStart ?? input.value.length)
    );
    setCompletionActiveIndex(0);
    setCompletionOpen(true);
  };

  const selectCompletionItem = (item: GlossaryCompletionDisplayItem): void => {
    const target = completionTarget;
    const input = inputRefFor(target);
    if (input === null) {
      setCompletionOpen(false);
      return;
    }
    const selectionStart = input.selectionStart ?? input.value.length;
    const selectionEnd = input.selectionEnd ?? input.value.length;
    const edit = applyActiveFindGlossaryCompletion({
      value: input.value,
      selectionStart,
      selectionEnd,
      insertText: item.insertText,
      target,
      // Consume the covered completion prefix on a caret-only replace, exactly
      // as the editor tooltip replaces its own prefix.
      replacePrefixLength:
        selectionStart === selectionEnd ? completionPrefix.length : 0
    });
    if (target === "query") {
      // Whole-value replace → re-runs the search through the owner.
      onQueryChange(edit.value);
    } else {
      onReplaceTextChange(edit.value);
    }
    pendingCompletionCaretRef.current = {
      target,
      start: edit.selectionStart,
      end: edit.selectionEnd
    };
    setCompletionApplyToken((token) => token + 1);
    setCompletionOpen(false);
  };

  /**
   * Ctrl+Space (NOT Cmd+Space) opens (or refreshes) the completion popup for
   * `target`; while it is open the same input's arrows / Enter / Escape drive
   * it, matching the editor tooltip's key handling (Tab is NOT an accept key
   * there — it stays a normal focus move here). Cmd+Space is deliberately left
   * alone: the editor's `Ctrl+Space` glossary trigger is the source of truth,
   * and macOS reserves Cmd+Space for Spotlight / the input-source switcher.
   * Returns `true` when it consumed the event (so the caller stops before
   * mode-shortcut / next / replace-current handling).
   */
  const handleCompletionKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
    target: ActiveFindGlossaryCompletionTarget
  ): boolean => {
    const ctrlSpaceTrigger =
      event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.shiftKey &&
      event.code === "Space";
    if (ctrlSpaceTrigger) {
      event.preventDefault();
      event.stopPropagation();
      openCompletion(target);
      return true;
    }

    if (!completionOpen || completionTarget !== target) {
      return false;
    }

    const count = completionItems.length;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCompletionActiveIndex((index) =>
        count === 0 ? 0 : (index + 1) % count
      );
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setCompletionActiveIndex((index) =>
        count === 0 ? 0 : (index - 1 + count) % count
      );
      return true;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (count > 0) {
        selectCompletionItem(
          completionItems[Math.min(completionActiveIndex, count - 1)]
        );
      } else {
        setCompletionOpen(false);
      }
      return true;
    }
    if (event.key === "Tab") {
      // Editor parity: Tab is not bound in the completion tooltip — let it move
      // focus, just dismiss the popup first.
      setCompletionOpen(false);
      return false;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setCompletionOpen(false);
      return true;
    }
    return false;
  };

  const handleQueryInputChange = (value: string): void => {
    onQueryChange(value);
    if (completionOpen && completionTarget === "query") {
      setCompletionPrefix(prefixFor("query", value, value.length));
    }
  };

  const handleReplaceInputChange = (
    event: ReactChangeEvent<HTMLInputElement>
  ): void => {
    const input = event.currentTarget;
    const value = input.value;
    onReplaceTextChange(value);
    if (completionOpen && completionTarget === "replace") {
      setCompletionPrefix(
        prefixFor("replace", value, input.selectionStart ?? value.length)
      );
    }
  };

  const handleCompletionInputBlur = (
    target: ActiveFindGlossaryCompletionTarget
  ): void => {
    // Candidate items `preventDefault` their mousedown, so a candidate click
    // never blurs the input; any real blur means the user left — dismiss.
    if (completionOpen && completionTarget === target) {
      setCompletionOpen(false);
    }
  };
  // ----------------------------------------------------------------------

  const handleQueryKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>
  ): void => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (handleCompletionKeyDown(event, "query")) {
      return;
    }
    if (handleModeShortcut(event)) {
      setCompletionOpen(false);
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
    if (handleCompletionKeyDown(event, "replace")) {
      return;
    }
    if (handleModeShortcut(event)) {
      setCompletionOpen(false);
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

  // #424 Slice 6: keys the glossary-mode selector does not own still route to
  // the panel — Ctrl+F / Ctrl+H mode switching and Escape-closes-the-panel.
  const handleGlossarySelectUnhandledKey = (
    event: ReactKeyboardEvent<HTMLInputElement>
  ): boolean => {
    if (event.nativeEvent.isComposing) {
      return false;
    }
    if (handleModeShortcut(event)) {
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return true;
    }
    return false;
  };

  return (
    <div
      className="activeFindPanel"
      role="search"
      aria-label={translate("editor.find.panelLabel")}
    >
      <div className="activeFindPanelRow activeFindPanelModeRow">
        <div className="activeFindPanelModeTabs" role="tablist">
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
        {/* Close acts on the whole panel — it lives on the mode-tab row, not
            the query row. */}
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

      <div
        className="activeFindPanelRow activeFindPanelQueryRow"
        data-query-kind={queryKind}
      >
        {glossaryMode ? (
          <ActiveFindGlossarySelect
            key={replaceMode ? "single" : "multi"}
            translate={translate}
            variant={replaceMode ? "single" : "multi"}
            candidates={glossaryCandidates}
            selectedIds={
              replaceMode
                ? replaceGlossaryAtomId !== null
                  ? [replaceGlossaryAtomId]
                  : []
                : searchGlossaryAtomIds
            }
            onChange={(ids) =>
              replaceMode
                ? onReplaceGlossaryAtomIdChange(ids[ids.length - 1] ?? null)
                : onSearchGlossaryAtomIdsChange(ids)
            }
            placeholder={translate(
              replaceMode
                ? "editor.find.glossaryReplacePlaceholder"
                : "editor.find.glossarySearchPlaceholder"
            )}
            focusToken={focusToken}
            onUnhandledKeyDown={handleGlossarySelectUnhandledKey}
          />
        ) : (
          <>
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
              onChange={(event) =>
                handleQueryInputChange(event.currentTarget.value)
              }
              onKeyDown={handleQueryKeyDown}
              onBlur={() => handleCompletionInputBlur("query")}
            />
            {completionOpen && completionTarget === "query" ? (
              <ActiveFindGlossaryCompletionPopup
                translate={translate}
                items={completionItems}
                activeIndex={completionActiveIndex}
                onSelect={selectCompletionItem}
                onActiveIndexChange={setCompletionActiveIndex}
              />
            ) : null}
          </>
        )}
        {/* #424 Slice 6: the `語彙` icon now toggles text ⇄ glossary query kind. */}
        <button
          type="button"
          className="activeFindPanelButton activeFindPanelGlossaryButton"
          aria-pressed={glossaryMode}
          data-active={glossaryMode ? "true" : undefined}
          aria-label={translate("editor.find.queryKind.glossary")}
          title={translate(
            glossaryMode
              ? "editor.find.queryKind.text"
              : "editor.find.glossaryModeTooltip"
          )}
          disabled={!glossaryMode && !hasGlossaryCandidates}
          onMouseDown={preventFocusSteal}
          onClick={() =>
            onQueryKindChange(glossaryMode ? "text" : "glossary")
          }
        >
          <span
            className="activeFindPanelGlossaryIcon"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: GLOSSARY_SEARCH_ICON }}
          />
        </button>
        {glossaryMode ? null : (
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
        )}
      </div>

      {replaceMode ? (
        <div className="activeFindPanelRow activeFindPanelReplaceRow">
          <input
            ref={replaceInputRef}
            type="text"
            className="activeFindPanelInput activeFindPanelReplaceInput"
            data-invalid={templateError !== null ? "true" : undefined}
            value={replaceText}
            placeholder={translate("editor.find.replacePlaceholder")}
            aria-label={translate("editor.find.replacePlaceholder")}
            spellCheck={false}
            autoComplete="off"
            onChange={handleReplaceInputChange}
            onKeyDown={handleReplaceKeyDown}
            onBlur={() => handleCompletionInputBlur("replace")}
          />
          {completionOpen && completionTarget === "replace" ? (
            <ActiveFindGlossaryCompletionPopup
              translate={translate}
              items={completionItems}
              activeIndex={completionActiveIndex}
              onSelect={selectCompletionItem}
              onActiveIndexChange={setCompletionActiveIndex}
            />
          ) : null}
        </div>
      ) : null}

      <div className="activeFindPanelRow activeFindPanelNavRow">
        {glossaryMode && !replaceMode ? (
          <label className="activeFindPanelGlossaryRelation">
            <span className="activeFindPanelGlossaryRelationLabel">
              {translate("editor.find.glossaryRelation")}
            </span>
            <select
              className="activeFindPanelGlossaryRelationSelect"
              value={glossaryRelation}
              onChange={(event) =>
                onGlossaryRelationChange(
                  event.currentTarget.value as ActiveGlossarySearchRelation
                )
              }
            >
              <option value="any">
                {translate("editor.find.glossaryRelation.any")}
              </option>
              <option value="all">
                {translate("editor.find.glossaryRelation.all")}
              </option>
              <option value="nearby">
                {translate("editor.find.glossaryRelation.nearby")}
              </option>
            </select>
            {glossaryRelation === "nearby" ? (
              <span
                className="activeFindPanelGlossaryRelationSummary"
                title={nearbySummaryText}
              >
                {nearbySummaryText}
              </span>
            ) : null}
          </label>
        ) : null}
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
          <>
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
            <button
              type="button"
              className="activeFindPanelButton activeFindPanelReplaceAllButton"
              aria-label={translate("editor.find.replaceAll")}
              title={translate("editor.find.replaceAllTooltip")}
              disabled={!replaceAllEnabled}
              onMouseDown={preventFocusSteal}
              onClick={onReplaceAll}
            >
              <span
                className="activeFindPanelReplaceAllIcon"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: REPLACE_ALL_ICON }}
              />
              <span className="activeFindPanelReplaceAllLabel">
                {translate("editor.find.replaceAll")}
              </span>
            </button>
          </>
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
