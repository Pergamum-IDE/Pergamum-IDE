import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent
} from "react";
import type { GlossaryEntry } from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import { compileSearchRegex, type TextSearchOptions } from "../shared/textSearch";
import type { ProjectTextSearchResult } from "./projectTextSearch";
import {
  buildGlossaryAtomSearchTerms,
  collectSelectableGlossaryAtoms,
  isGlossarySearchMatch,
  type GlossaryAtomSearchTerm,
  type GlossarySearchMatch,
  type GlossarySearchRelationMode,
  type SelectableGlossaryAtom
} from "./glossaryAtomSearch";
import {
  logSearchCompleted,
  logSearchFailed,
  logSearchStaleDiscarded,
  logSearchStarted,
  newSearchRunId,
  type SearchTelemetryContext
} from "./searchTelemetry";
import type { ReplacePreviewOpenRequest } from "./replace/replacePreviewTypes";
import glossarySearchIconRaw from "../../assets/icons/svgrepo/search/vocabulary-svgrepo-com.svg?raw";
import wholeWordIconRaw from "../../assets/icons/Pergamum/search/word.svg?raw";
import caseSensitiveIconRaw from "../../assets/icons/svgrepo/search/case-sensitive-svgrepo-com.svg?raw";
import useRegexIconRaw from "../../assets/icons/svgrepo/search/regex-svgrepo-com.svg?raw";

/**
 * #384 — the Search pane.
 *
 * Two search MODES, chosen by the `語彙検索` toggle:
 *
 * - `text`: the query box drives a debounced project-wide search — plain
 *   substring, whole-word (`Ab`), match-case (`Aa`), or regular expression
 *   (`.*`). Regex and whole-word are mutually exclusive; an invalid pattern
 *   shows a validation message and runs nothing.
 *
 * - `glossary`: the query box becomes a GlossaryAtom multi-select and the
 *   `Ab` / `Aa` / `.*` icons are replaced by a relation-mode selector
 *   (`any` OR / `all` per paragraph / `nearby` 400-char window). The text
 *   options are forced off while this mode is active and are not restored when
 *   it is turned off. No search runs until at least one atom is picked.
 *
 * The host supplies `runSearch` (text) / `runGlossarySearch` (glossary) — both
 * read a dirty editor buffer first, the disk file otherwise — and `onOpenMatch`
 * (open the file + select the match). Stale results are discarded by a
 * generation counter.
 */

/** `'text'` = query-box search; `'glossary'` = GlossaryAtom relation search. */
export type SearchMode = "text" | "glossary";

/**
 * #386: the Search pane's two tabs. `search` is the existing pane; `replace`
 * reuses the shared query + options (`Ab` / `Aa` / `.*` only — no glossary),
 * adds a replace-with box and two replace-scope buttons, and keeps showing the
 * search results. No replace processing exists yet - the buttons open
 * placeholder confirm dialogs.
 */
export type SearchPaneTab = "search" | "replace";

/** Relation-selector options, in display order, with their i18n keys. */
const GLOSSARY_RELATION_MODES = [
  {
    mode: "any",
    labelKey: "search.glossary.relation.any",
    hintKey: "search.glossary.relation.any.hint"
  },
  {
    mode: "all",
    labelKey: "search.glossary.relation.all",
    hintKey: "search.glossary.relation.all.hint"
  },
  {
    mode: "nearby",
    labelKey: "search.glossary.relation.nearby",
    hintKey: "search.glossary.relation.nearby.hint"
  }
] as const satisfies ReadonlyArray<{
  mode: GlossarySearchRelationMode;
  labelKey: string;
  hintKey: string;
}>;

export interface SearchOptions {
  readonly wholeWord: boolean;
  readonly caseSensitive: boolean;
  readonly useRegex: boolean;
}

const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  wholeWord: false,
  caseSensitive: false,
  useRegex: false
};

/** Stable identity for the omitted-prop case, so the atom memo does not churn. */
const NO_GLOSSARY_ENTRIES: readonly GlossaryEntry[] = [];

/** Debounce between the last change and running the project search. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * How long a search must actually run before the result area shows a loading
 * skeleton. Fast searches finish before this and never flash one; slow ones
 * (huge project, slow storage, heavy regex / glossary nearby) show it so the
 * pane does not look frozen.
 */
const SEARCH_LOADING_SKELETON_DELAY_MS = 200;

type SearchState =
  | { readonly kind: "idle" }
  | { readonly kind: "searching" }
  | { readonly kind: "results"; readonly result: ProjectTextSearchResult }
  | { readonly kind: "invalidRegex" }
  | { readonly kind: "error" };

/** Shared idle instance so an effect that "stays idle" causes no re-render. */
const IDLE_STATE: SearchState = { kind: "idle" };

/**
 * The bundled svgrepo / Pergamum search glyphs ship as standalone documents
 * (XML prolog, `<!DOCTYPE>`, a BOM, a hard-coded black `fill`). Strip the
 * document scaffolding and swap the fixed fill for `currentColor` so the
 * icon inherits the toggle button's text colour in every theme.
 */
function inlineSearchIcon(raw: string): string {
  return raw
    .replace(/^﻿/, "")
    .replace(/<\?xml[^>]*\?>/gi, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/fill="#0{3}(?:0{3})?"/gi, 'fill="currentColor"')
    .replace(/fill:\s*#0{3}(?:0{3})?/gi, "fill:currentColor")
    .replace(/(<svg\b[^>]*?)\swidth="[^"]*"/i, "$1")
    .replace(/(<svg\b[^>]*?)\sheight="[^"]*"/i, "$1")
    .trim();
}

const GLOSSARY_SEARCH_ICON = inlineSearchIcon(glossarySearchIconRaw);
const WHOLE_WORD_ICON = inlineSearchIcon(wholeWordIconRaw);
const CASE_SENSITIVE_ICON = inlineSearchIcon(caseSensitiveIconRaw);
const USE_REGEX_ICON = inlineSearchIcon(useRegexIconRaw);

interface SearchOptionToggleProps {
  readonly icon: string;
  readonly pressed: boolean;
  readonly label: string;
  readonly hint: string;
  readonly disabled?: boolean;
  readonly onToggle: () => void;
}

function SearchOptionToggle({
  icon,
  pressed,
  label,
  hint,
  disabled = false,
  onToggle
}: SearchOptionToggleProps): JSX.Element {
  return (
    <button
      type="button"
      className="searchOptionToggle"
      data-pressed={pressed && !disabled ? "true" : undefined}
      aria-pressed={pressed && !disabled}
      aria-label={label}
      title={hint}
      disabled={disabled}
      onClick={onToggle}
    >
      <span
        className="searchOptionToggleIcon"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: icon }}
      />
    </button>
  );
}

/** A preview line with its matched span wrapped in `<mark>`. */
function SearchResultPreview({
  previewText,
  matchStart,
  matchEnd
}: {
  previewText: string;
  matchStart: number;
  matchEnd: number;
}): JSX.Element {
  const safeStart = Math.max(0, Math.min(matchStart, previewText.length));
  const safeEnd = Math.max(safeStart, Math.min(matchEnd, previewText.length));
  return (
    <span className="searchResultPreview">
      {previewText.slice(0, safeStart)}
      <mark className="searchResultMatch">
        {previewText.slice(safeStart, safeEnd)}
      </mark>
      {previewText.slice(safeEnd)}
    </span>
  );
}

/**
 * Matched-atom badge(s) on a result row. `any` rows carry one atom; `all` /
 * `nearby` group rows list every selected atom they cover.
 */
function GlossaryMatchBadges({
  match
}: {
  match: GlossarySearchMatch;
}): JSX.Element {
  const atoms =
    match.glossaryAtoms && match.glossaryAtoms.length > 0
      ? match.glossaryAtoms
      : [
          {
            atomId: match.glossaryAtomId,
            atomValue: match.glossaryAtomValue,
            entryId: match.glossaryEntryId,
            entryLabel: match.glossaryEntryLabel,
            startOffset: match.startOffset,
            endOffset: match.endOffset
          }
        ];

  return (
    <span className="searchResultRowAtoms">
      {atoms.map((atom) => (
        <span
          key={atom.atomId}
          className="searchResultRowAtom"
          title={`${atom.atomValue}\n${atom.entryLabel}`}
        >
          {atom.atomValue}
        </span>
      ))}
    </span>
  );
}

/**
 * Delayed loading state for the result area: the "searching" label plus a few
 * inert placeholder rows. Only rendered once a search has run past
 * {@link SEARCH_LOADING_SKELETON_DELAY_MS}. `aria-busy` marks the region;
 * the rows are decorative (`aria-hidden`) and their pulse is disabled under
 * `prefers-reduced-motion: reduce` (see styles.css).
 */
function SearchLoadingSkeleton({
  translate
}: {
  translate: Translate;
}): JSX.Element {
  return (
    <div className="searchLoadingSkeleton" role="status" aria-busy="true">
      <p className="workspacePlaceholder searchLoadingSkeletonLabel">
        {translate("search.searching")}
      </p>
      <div className="searchLoadingSkeletonRows" aria-hidden="true">
        {[0, 1, 2, 3].map((row) => (
          <span key={row} className="searchLoadingSkeletonRow" />
        ))}
      </div>
    </div>
  );
}

/** The grouped result list, shared by text and glossary search. */
function SearchResults({
  translate,
  result,
  onRowClick
}: {
  translate: Translate;
  result: ProjectTextSearchResult;
  onRowClick: (
    relativePath: string,
    startOffset: number,
    endOffset: number
  ) => void;
}): JSX.Element {
  return (
    <>
      <p className="searchResultsSummary" role="status">
        {translate("search.summary", {
          matchCount: result.totalMatches,
          fileCount: result.fileCount
        })}
      </p>
      {result.truncated ? (
        <p className="searchResultsNote">{translate("search.truncated")}</p>
      ) : null}
      {result.skippedFileCount > 0 ? (
        <p className="searchResultsNote">
          {translate("search.skipped", { count: result.skippedFileCount })}
        </p>
      ) : null}
      <ul className="searchResultGroups">
        {result.files.map((file) => (
          <li key={file.relativePath} className="searchResultGroup">
            <div className="searchResultGroupHeader">
              <span
                className="searchResultGroupName"
                title={file.relativePath}
              >
                {file.name}
              </span>
              {file.relativePath !== file.name ? (
                <span className="searchResultGroupPath">
                  {file.relativePath}
                </span>
              ) : null}
            </div>
            <ul className="searchResultRows">
              {file.matches.map((match) => (
                <li key={`${file.relativePath}:${match.startOffset}`}>
                  <button
                    type="button"
                    className="searchResultRow"
                    onClick={() =>
                      onRowClick(
                        file.relativePath,
                        match.startOffset,
                        match.endOffset
                      )
                    }
                  >
                    <span className="searchResultRowLocation">
                      {match.line}:{match.column}
                    </span>
                    {isGlossarySearchMatch(match) ? (
                      <GlossaryMatchBadges match={match} />
                    ) : null}
                    <SearchResultPreview
                      previewText={match.previewText}
                      matchStart={match.previewMatchStart}
                      matchEnd={match.previewMatchEnd}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * The `語彙検索` mode's atom picker: a trigger + focus-out-dismissed popup with
 * a filter box and a two-line row per atom (value / parent entry). Selected
 * atoms show as removable chips. Mirrors the Document Map "Render tags"
 * multi-select interaction (no global key listeners).
 */
function GlossaryAtomSelect({
  translate,
  atoms,
  selectedAtomIds,
  onChange
}: {
  translate: Translate;
  atoms: readonly SelectableGlossaryAtom[];
  selectedAtomIds: readonly string[];
  onChange: (selectedAtomIds: string[]) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const selectedSet = new Set(selectedAtomIds);
  const byId = new Map(atoms.map((atom) => [atom.atomId, atom]));
  const selectedAtoms = selectedAtomIds
    .map((atomId) => byId.get(atomId))
    .filter((atom): atom is SelectableGlossaryAtom => atom !== undefined);

  const normalizedFilter = filter.trim().toLowerCase();
  const visibleAtoms =
    normalizedFilter.length === 0
      ? atoms
      : atoms.filter(
          (atom) =>
            atom.value.toLowerCase().includes(normalizedFilter) ||
            atom.entryLabel.toLowerCase().includes(normalizedFilter)
        );

  function toggle(atomId: string): void {
    onChange(
      selectedSet.has(atomId)
        ? selectedAtomIds.filter((id) => id !== atomId)
        : [...selectedAtomIds, atomId]
    );
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>): void {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
    }
  }

  return (
    <div className="glossaryAtomSelect" onBlur={handleBlur}>
      <div className="glossaryAtomSelectRow">
        <button
          type="button"
          className="glossaryAtomSelectTrigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={translate("search.glossary.placeholder")}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="glossaryAtomSelectValue">
            {selectedAtoms.length === 0 ? (
              <span className="glossaryAtomSelectPlaceholder">
                {translate("search.glossary.placeholder")}
              </span>
            ) : (
              translate("search.glossary.selectedCount", {
                count: selectedAtoms.length
              })
            )}
          </span>
          <span className="glossaryAtomSelectCaret" aria-hidden="true">
            ▾
          </span>
        </button>

        {open ? (
          <div
            className="glossaryAtomSelectPopup"
            role="listbox"
            aria-multiselectable="true"
          >
            <input
              type="search"
              className="glossaryAtomSelectFilter"
              value={filter}
              placeholder={translate("search.glossary.filterPlaceholder")}
              aria-label={translate("search.glossary.filterPlaceholder")}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setFilter(event.currentTarget.value)}
            />
            <div className="glossaryAtomSelectOptions">
              {visibleAtoms.length === 0 ? (
                <p className="glossaryAtomSelectNoMatch">
                  {translate("search.glossary.noFilterMatch")}
                </p>
              ) : (
                visibleAtoms.map((atom) => {
                  const checked = selectedSet.has(atom.atomId);
                  return (
                    <button
                      key={atom.atomId}
                      type="button"
                      role="option"
                      aria-selected={checked}
                      className="glossaryAtomSelectOption"
                      onClick={() => toggle(atom.atomId)}
                    >
                      <span
                        className="glossaryAtomSelectCheck"
                        data-checked={checked || undefined}
                        aria-hidden="true"
                      />
                      <span className="glossaryAtomSelectOptionText">
                        <span className="glossaryAtomSelectOptionValue">
                          {atom.value}
                        </span>
                        <span className="glossaryAtomSelectOptionEntry">
                          {atom.entryLabel}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : null}
      </div>

      {selectedAtoms.length > 0 ? (
        <div className="glossaryAtomSelectChips">
          {selectedAtoms.map((atom) => (
            <span
              key={atom.atomId}
              className="glossaryAtomChip"
              title={`${atom.value}\n${atom.entryLabel}`}
            >
              <span className="glossaryAtomChipValue">{atom.value}</span>
              <button
                type="button"
                className="glossaryAtomChipRemove"
                aria-label={translate("search.glossary.removeAtom", {
                  value: atom.value
                })}
                onClick={() => toggle(atom.atomId)}
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            className="glossaryAtomSelectClear"
            onClick={() => onChange([])}
          >
            {translate("search.glossary.clear")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * `語彙検索` mode's relation selector, shown in place of the `Ab` / `Aa` / `.*`
 * icons. A compact native `<select>` so it never overflows the narrow pane.
 */
function GlossaryRelationSelect({
  translate,
  value,
  onChange
}: {
  translate: Translate;
  value: GlossarySearchRelationMode;
  onChange: (mode: GlossarySearchRelationMode) => void;
}): JSX.Element {
  return (
    <select
      className="glossaryRelationSelect"
      aria-label={translate("search.glossary.relation.label")}
      title={translate("search.glossary.relation.label")}
      value={value}
      onChange={(event) =>
        onChange(event.currentTarget.value as GlossarySearchRelationMode)
      }
    >
      {GLOSSARY_RELATION_MODES.map(({ mode, labelKey, hintKey }) => (
        <option key={mode} value={mode} title={translate(hintKey)}>
          {translate(labelKey)}
        </option>
      ))}
    </select>
  );
}

interface SearchSidebarProps {
  readonly translate: Translate;
  /** Whether a project is open (nothing to search without one). */
  readonly projectAvailable?: boolean;
  /**
   * Runs the project-wide text search. `isCancelled` flips `true` once a newer
   * search has started; the implementation should stop early.
   */
  readonly runSearch?: (
    query: string,
    options: TextSearchOptions,
    isCancelled: () => boolean
  ) => Promise<ProjectTextSearchResult>;
  /** #384 Glossary Search: every project glossary entry, for the atom picker. */
  readonly glossaryEntries?: readonly GlossaryEntry[];
  /** #384 Glossary Search: search the selected atoms under a relation mode. */
  readonly runGlossarySearch?: (
    terms: readonly GlossaryAtomSearchTerm[],
    relationMode: GlossarySearchRelationMode,
    isCancelled: () => boolean
  ) => Promise<ProjectTextSearchResult>;
  /** Open the file and select the match range. */
  readonly onOpenMatch?: (
    relativePath: string,
    startOffset: number,
    endOffset: number
  ) => void;
  /**
   * #384: an incoming Command Palette `%` request. A new `token` applies it:
   * a non-empty `query` forces text search mode, resets the options, sets the
   * query (the existing debounced effect then runs the search) and focuses the
   * query input. An empty `query` only focuses the input - no state change,
   * no search.
   */
  readonly queryRequest?: {
    readonly token: number;
    readonly query: string;
  } | null;
  /** #386: `[開いている文書のみ置換...]`. Hands the host the current find /
   *  replace / options; the host opens the Replace Preview Dialog immediately
   *  (loading state) and generates the candidates itself. No replace
   *  processing. */
  readonly onReplaceInOpenDocuments?: (
    request: ReplacePreviewOpenRequest
  ) => void;
  /** #386: `[プロジェクト内文書置換...]`. The host runs the dirty-document gate,
   *  then a placeholder confirm - no replace, no file write. */
  readonly onReplaceInProject?: () => void;
}

export function SearchSidebar({
  translate,
  projectAvailable = false,
  runSearch,
  glossaryEntries = NO_GLOSSARY_ENTRIES,
  runGlossarySearch,
  onOpenMatch,
  queryRequest = null,
  onReplaceInOpenDocuments,
  onReplaceInProject
}: SearchSidebarProps): JSX.Element {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("text");
  const [activeTab, setActiveTab] = useState<SearchPaneTab>("search");
  const [replaceText, setReplaceText] = useState("");
  const [options, setOptions] = useState<SearchOptions>(DEFAULT_SEARCH_OPTIONS);
  const [selectedAtomIds, setSelectedAtomIds] = useState<string[]>([]);
  const [glossaryRelationMode, setGlossaryRelationMode] =
    useState<GlossarySearchRelationMode>("any");
  const [searchState, setSearchState] = useState<SearchState>(IDLE_STATE);
  // `true` once the CURRENT search has run past the skeleton delay.
  const [loadingSkeletonVisible, setLoadingSkeletonVisible] = useState(false);

  const runSearchRef = useRef(runSearch);
  runSearchRef.current = runSearch;
  const runGlossaryRef = useRef(runGlossarySearch);
  runGlossaryRef.current = runGlossarySearch;
  const generationRef = useRef(0);
  const skeletonTimerRef = useRef<number | undefined>(undefined);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const appliedQueryRequestTokenRef = useRef<number | null>(null);

  const clearSkeletonTimer = (): void => {
    if (skeletonTimerRef.current !== undefined) {
      window.clearTimeout(skeletonTimerRef.current);
      skeletonTimerRef.current = undefined;
    }
  };

  // Any in-flight search that resolves after unmount must not set state.
  useEffect(
    () => () => {
      generationRef.current += 1;
    },
    []
  );

  // #384: apply an incoming Command Palette `%` request exactly once per token.
  useEffect(() => {
    if (
      !queryRequest ||
      queryRequest.token === appliedQueryRequestTokenRef.current
    ) {
      return;
    }
    appliedQueryRequestTokenRef.current = queryRequest.token;

    const requestedQuery = queryRequest.query.trim();
    if (requestedQuery.length > 0) {
      setMode("text");
      setOptions(DEFAULT_SEARCH_OPTIONS);
      setGlossaryRelationMode("any");
      setSelectedAtomIds([]);
      setQuery(queryRequest.query);
    }

    // Focus after the mode switch has had a chance to render the input.
    const focusHandle = window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(focusHandle);
  }, [queryRequest]);

  const trimmedQuery = query.trim();
  const glossaryMode = mode === "glossary";
  const replaceTab = activeTab === "replace";
  const textSearchAvailable = runSearch !== undefined;
  const glossarySearchAvailable = runGlossarySearch !== undefined;

  // #386: the replace-scope buttons must not open a confirm while the pattern
  // is an invalid regex (there is nothing meaningful to preview / replace).
  const replaceBlockedByInvalidRegex =
    mode === "text" &&
    options.useRegex &&
    trimmedQuery.length > 0 &&
    compileSearchRegex(trimmedQuery, options.caseSensitive).regex === null;

  const selectableAtoms = useMemo(
    () => collectSelectableGlossaryAtoms(glossaryEntries),
    [glossaryEntries]
  );
  const hasGlossaryAtoms = selectableAtoms.length > 0;
  const glossaryTerms = useMemo(
    () => buildGlossaryAtomSearchTerms(selectableAtoms, selectedAtomIds),
    [selectableAtoms, selectedAtomIds]
  );

  useEffect(() => {
    // A fresh effect pass = a new / cancelled / debounced search: drop any
    // pending skeleton timer and hide an old skeleton before re-arming below.
    clearSkeletonTimer();
    setLoadingSkeletonVisible(false);

    if (!projectAvailable) {
      setSearchState((current) => (current === IDLE_STATE ? current : IDLE_STATE));
      return;
    }

    if (glossaryMode) {
      if (
        !glossarySearchAvailable ||
        !hasGlossaryAtoms ||
        glossaryTerms.length === 0
      ) {
        setSearchState((current) => (current === IDLE_STATE ? current : IDLE_STATE));
        return;
      }

      const generation = generationRef.current + 1;
      generationRef.current = generation;
      setSearchState({ kind: "searching" });

      const handle = window.setTimeout(() => {
        const run = runGlossaryRef.current;
        if (!run) {
          return;
        }
        const telemetry: SearchTelemetryContext = {
          searchRunId: newSearchRunId(),
          mode: "glossary",
          startedAt: new Date(),
          glossary: {
            relationMode: glossaryRelationMode,
            selectedAtomIds: glossaryTerms.map((term) => term.atomId)
          }
        };
        // Only show the skeleton once THIS search has actually run past the
        // delay and is still the current generation.
        clearSkeletonTimer();
        const skeletonHandle = window.setTimeout(() => {
          if (generationRef.current === generation) {
            setLoadingSkeletonVisible(true);
          }
        }, SEARCH_LOADING_SKELETON_DELAY_MS);
        skeletonTimerRef.current = skeletonHandle;
        logSearchStarted(telemetry);
        const startedAt = performance.now();
        void run(
          glossaryTerms,
          glossaryRelationMode,
          () => generationRef.current !== generation
        )
          .then((result) => {
            window.clearTimeout(skeletonHandle);
            const metrics = {
              durationMs: Math.round(performance.now() - startedAt),
              documentCount: result.documentCount,
              searchedCharacterCount: result.searchedCharacterCount,
              resultCount: result.totalMatches
            };
            if (generationRef.current !== generation) {
              logSearchStaleDiscarded(telemetry, metrics);
              return;
            }
            setLoadingSkeletonVisible(false);
            setSearchState({ kind: "results", result });
            logSearchCompleted(telemetry, metrics);
          })
          .catch((error: unknown) => {
            window.clearTimeout(skeletonHandle);
            if (generationRef.current === generation) {
              setLoadingSkeletonVisible(false);
              setSearchState({ kind: "error" });
            }
            logSearchFailed(telemetry, {
              durationMs: Math.round(performance.now() - startedAt),
              error
            });
          });
      }, SEARCH_DEBOUNCE_MS);

      return () => {
        window.clearTimeout(handle);
        clearSkeletonTimer();
      };
    }

    // Text mode.
    if (trimmedQuery.length === 0 || !textSearchAvailable) {
      setSearchState((current) => (current === IDLE_STATE ? current : IDLE_STATE));
      return;
    }

    if (
      options.useRegex &&
      compileSearchRegex(trimmedQuery, options.caseSensitive).regex === null
    ) {
      // Invalid pattern: run nothing and invalidate any in-flight search so a
      // previously good result cannot linger as the current one.
      generationRef.current += 1;
      setSearchState({ kind: "invalidRegex" });
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setSearchState({ kind: "searching" });

    const handle = window.setTimeout(() => {
      const run = runSearchRef.current;
      if (!run) {
        return;
      }
      const telemetry: SearchTelemetryContext = {
        searchRunId: newSearchRunId(),
        mode: "text",
        startedAt: new Date(),
        text: {
          wholeWord: options.wholeWord,
          caseSensitive: options.caseSensitive,
          regex: options.useRegex
        }
      };
      clearSkeletonTimer();
      const skeletonHandle = window.setTimeout(() => {
        if (generationRef.current === generation) {
          setLoadingSkeletonVisible(true);
        }
      }, SEARCH_LOADING_SKELETON_DELAY_MS);
      skeletonTimerRef.current = skeletonHandle;
      logSearchStarted(telemetry);
      const startedAt = performance.now();
      void run(
        trimmedQuery,
        {
          caseSensitive: options.caseSensitive,
          wholeWord: options.wholeWord,
          useRegex: options.useRegex
        },
        () => generationRef.current !== generation
      )
        .then((result) => {
          window.clearTimeout(skeletonHandle);
          const metrics = {
            durationMs: Math.round(performance.now() - startedAt),
            documentCount: result.documentCount,
            searchedCharacterCount: result.searchedCharacterCount,
            resultCount: result.totalMatches
          };
          if (generationRef.current !== generation) {
            logSearchStaleDiscarded(telemetry, metrics);
            return;
          }
          setLoadingSkeletonVisible(false);
          setSearchState({ kind: "results", result });
          logSearchCompleted(telemetry, metrics);
        })
        .catch((error: unknown) => {
          window.clearTimeout(skeletonHandle);
          if (generationRef.current === generation) {
            setLoadingSkeletonVisible(false);
            setSearchState({ kind: "error" });
          }
          logSearchFailed(telemetry, {
            durationMs: Math.round(performance.now() - startedAt),
            error
          });
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(handle);
      clearSkeletonTimer();
    };
  }, [
    glossaryMode,
    projectAvailable,
    textSearchAvailable,
    glossarySearchAvailable,
    hasGlossaryAtoms,
    glossaryTerms,
    glossaryRelationMode,
    trimmedQuery,
    options.caseSensitive,
    options.wholeWord,
    options.useRegex
  ]);

  const toggleGlossaryMode = (): void => {
    // Glossary search is a distinct mode, not an add-on option: entering or
    // leaving it clears the text-mode options and resets the relation mode to
    // the `any` default (no auto-restore of prior state either way).
    setOptions(DEFAULT_SEARCH_OPTIONS);
    setGlossaryRelationMode("any");
    setMode((current) => (current === "glossary" ? "text" : "glossary"));
  };

  const switchTab = (tab: SearchPaneTab): void => {
    // #386: the replace tab has no glossary search — leaving glossary mode for
    // it drops to plain text search (the query is kept). The search tab keeps
    // whatever mode was active.
    if (tab === "replace" && mode === "glossary") {
      setMode("text");
      setOptions(DEFAULT_SEARCH_OPTIONS);
      setGlossaryRelationMode("any");
      setSelectedAtomIds([]);
    }
    setActiveTab(tab);
  };

  const handleReplaceInOpenDocuments = (): void => {
    if (replaceBlockedByInvalidRegex) {
      return;
    }
    // Hand the host the find / replace / options only. It opens the Replace
    // Preview Dialog immediately in a loading state and generates the
    // candidates itself, so a slow generation never looks like a dead click.
    onReplaceInOpenDocuments?.({
      findText: trimmedQuery,
      replaceText,
      searchOptions: {
        wholeWord: options.wholeWord,
        caseSensitive: options.caseSensitive,
        useRegex: options.useRegex
      }
    });
  };

  const handleReplaceInProject = (): void => {
    if (replaceBlockedByInvalidRegex) {
      return;
    }
    onReplaceInProject?.();
  };

  const toggleOption = (key: keyof SearchOptions): void => {
    setOptions((current) => {
      const next = !current[key];
      if (key === "useRegex") {
        // Regex and whole-word are mutually exclusive. Turning regex on forces
        // whole-word off; turning it off leaves whole-word off (no restore).
        return {
          ...current,
          useRegex: next,
          wholeWord: next ? false : current.wholeWord
        };
      }
      return { ...current, [key]: next };
    });
  };

  const handleRowClick = (
    relativePath: string,
    startOffset: number,
    endOffset: number
  ): void => {
    onOpenMatch?.(relativePath, startOffset, endOffset);
  };

  return (
    <aside
      className="workspaceSidebarPanel searchPane"
      aria-label={translate("search.sidebarTitle")}
    >
      <div
        className="sidebarHeader searchPaneTabs"
        role="tablist"
        aria-label={translate("search.sidebarTitle")}
      >
        <button
          type="button"
          role="tab"
          className="searchPaneTab"
          aria-selected={!replaceTab}
          data-active={!replaceTab ? "true" : undefined}
          onClick={() => switchTab("search")}
        >
          {translate("search.tab.search")}
        </button>
        <button
          type="button"
          role="tab"
          className="searchPaneTab"
          aria-selected={replaceTab}
          data-active={replaceTab ? "true" : undefined}
          onClick={() => switchTab("replace")}
        >
          {translate("search.tab.replace")}
        </button>
      </div>

      <div className="searchPaneControls">
        <div className="searchPaneInputRow">
          {glossaryMode ? (
            <GlossaryAtomSelect
              translate={translate}
              atoms={selectableAtoms}
              selectedAtomIds={selectedAtomIds}
              onChange={setSelectedAtomIds}
            />
          ) : (
            <input
              ref={searchInputRef}
              type="search"
              className="searchPaneInput"
              value={query}
              placeholder={translate("search.query.placeholder")}
              aria-label={translate("search.query.label")}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          )}
          <div
            className="searchPaneOptions"
            role="group"
            aria-label={translate("search.options.label")}
          >
            {replaceTab ? null : (
              <SearchOptionToggle
                icon={GLOSSARY_SEARCH_ICON}
                pressed={glossaryMode}
                label={translate("search.option.glossary")}
                hint={translate("search.option.glossary.hint")}
                onToggle={toggleGlossaryMode}
              />
            )}
            {glossaryMode ? (
              <GlossaryRelationSelect
                translate={translate}
                value={glossaryRelationMode}
                onChange={setGlossaryRelationMode}
              />
            ) : (
              <>
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
                  onToggle={() => toggleOption("wholeWord")}
                />
                <SearchOptionToggle
                  icon={CASE_SENSITIVE_ICON}
                  pressed={options.caseSensitive}
                  label={translate("search.option.caseSensitive")}
                  hint={translate("search.option.caseSensitive.hint")}
                  onToggle={() => toggleOption("caseSensitive")}
                />
                <SearchOptionToggle
                  icon={USE_REGEX_ICON}
                  pressed={options.useRegex}
                  label={translate("search.option.useRegex")}
                  hint={translate("search.option.useRegex.hint")}
                  onToggle={() => toggleOption("useRegex")}
                />
              </>
            )}
          </div>
        </div>

        {replaceTab ? (
          <div className="searchPaneReplace">
            <div className="searchPaneReplaceRow">
              <input
                type="text"
                className="searchPaneInput searchPaneReplaceInput"
                value={replaceText}
                placeholder={translate("search.replace.replaceWith")}
                aria-label={translate("search.replace.replaceWith")}
                spellCheck={false}
                autoComplete="off"
                onChange={(event) => setReplaceText(event.currentTarget.value)}
              />
            </div>
            <div className="searchPaneReplaceActions">
              <button
                type="button"
                className="searchPaneReplaceButton"
                disabled={replaceBlockedByInvalidRegex}
                onClick={handleReplaceInOpenDocuments}
              >
                {translate("search.replace.inOpenDocuments")}
              </button>
              <button
                type="button"
                className="searchPaneReplaceButton"
                disabled={replaceBlockedByInvalidRegex}
                onClick={handleReplaceInProject}
              >
                {translate("search.replace.inProject")}
              </button>
            </div>
            {replaceBlockedByInvalidRegex ? (
              <p className="searchPaneReplaceNotice" role="alert">
                {translate("search.replace.invalidRegex")}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="searchPaneBody">
        {glossaryMode ? (
          !hasGlossaryAtoms ? (
            <p className="workspacePlaceholder" role="status">
              {translate("search.glossary.noGlossary")}
            </p>
          ) : glossaryTerms.length === 0 ? (
            <p className="workspacePlaceholder" role="status">
              {translate("search.glossary.emptySelection")}
            </p>
          ) : searchState.kind === "results" &&
            searchState.result.totalMatches === 0 ? (
            <p className="workspacePlaceholder" role="status">
              {translate("search.noResults")}
            </p>
          ) : searchState.kind === "results" ? (
            <SearchResults
              translate={translate}
              result={searchState.result}
              onRowClick={handleRowClick}
            />
          ) : searchState.kind === "error" ? (
            <p className="workspacePlaceholder" role="status">
              {translate("search.error")}
            </p>
          ) : loadingSkeletonVisible ? (
            <SearchLoadingSkeleton translate={translate} />
          ) : (
            <p className="workspacePlaceholder" role="status">
              {translate("search.searching")}
            </p>
          )
        ) : searchState.kind === "invalidRegex" ? (
          <p className="workspacePlaceholder searchInvalidRegex" role="alert">
            {translate("search.invalidRegex")}
          </p>
        ) : searchState.kind === "idle" ? (
          <p className="workspacePlaceholder" role="status">
            {translate("search.emptyResults")}
          </p>
        ) : searchState.kind === "searching" ? (
          loadingSkeletonVisible ? (
            <SearchLoadingSkeleton translate={translate} />
          ) : (
            <p className="workspacePlaceholder" role="status">
              {translate("search.searching")}
            </p>
          )
        ) : searchState.kind === "error" ? (
          <p className="workspacePlaceholder" role="status">
            {translate("search.error")}
          </p>
        ) : searchState.result.totalMatches === 0 ? (
          <p className="workspacePlaceholder" role="status">
            {translate("search.noResults")}
          </p>
        ) : (
          <SearchResults
            translate={translate}
            result={searchState.result}
            onRowClick={handleRowClick}
          />
        )}
      </div>
    </aside>
  );
}
