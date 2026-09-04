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
  type SelectableGlossaryAtom
} from "./glossaryAtomSearch";
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
 * - `glossary`: the query box becomes a GlossaryAtom multi-select; the picked
 *   atoms' exact values are OR-searched. `Ab` / `Aa` / `.*` do not apply and
 *   are forced off + disabled while this mode is active (turning the mode off
 *   does not restore them). No search runs until at least one atom is picked.
 *
 * The host supplies `runSearch` (text) / `runGlossarySearch` (glossary) — both
 * read a dirty editor buffer first, the disk file otherwise — and `onOpenMatch`
 * (open the file + select the match). Stale results are discarded by a
 * generation counter.
 */

/** `'text'` = query-box search; `'glossary'` = GlossaryAtom OR search. */
export type SearchMode = "text" | "glossary";

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
                      <span
                        className="searchResultRowAtom"
                        title={`${match.glossaryAtomValue}\n${match.glossaryEntryLabel}`}
                      >
                        {match.glossaryAtomValue}
                      </span>
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
  /** #384 Glossary Atom Search: every project glossary entry, for the picker. */
  readonly glossaryEntries?: readonly GlossaryEntry[];
  /** #384 Glossary Atom Search: OR-search the selected atoms' values. */
  readonly runGlossarySearch?: (
    terms: readonly GlossaryAtomSearchTerm[],
    isCancelled: () => boolean
  ) => Promise<ProjectTextSearchResult>;
  /** Open the file and select the match range. */
  readonly onOpenMatch?: (
    relativePath: string,
    startOffset: number,
    endOffset: number
  ) => void;
}

export function SearchSidebar({
  translate,
  projectAvailable = false,
  runSearch,
  glossaryEntries = NO_GLOSSARY_ENTRIES,
  runGlossarySearch,
  onOpenMatch
}: SearchSidebarProps): JSX.Element {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("text");
  const [options, setOptions] = useState<SearchOptions>(DEFAULT_SEARCH_OPTIONS);
  const [selectedAtomIds, setSelectedAtomIds] = useState<string[]>([]);
  const [searchState, setSearchState] = useState<SearchState>(IDLE_STATE);

  const runSearchRef = useRef(runSearch);
  runSearchRef.current = runSearch;
  const runGlossaryRef = useRef(runGlossarySearch);
  runGlossaryRef.current = runGlossarySearch;
  const generationRef = useRef(0);

  // Any in-flight search that resolves after unmount must not set state.
  useEffect(
    () => () => {
      generationRef.current += 1;
    },
    []
  );

  const trimmedQuery = query.trim();
  const glossaryMode = mode === "glossary";
  const textSearchAvailable = runSearch !== undefined;
  const glossarySearchAvailable = runGlossarySearch !== undefined;

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
        void run(
          glossaryTerms,
          () => generationRef.current !== generation
        )
          .then((result) => {
            if (generationRef.current === generation) {
              setSearchState({ kind: "results", result });
            }
          })
          .catch(() => {
            if (generationRef.current === generation) {
              setSearchState({ kind: "error" });
            }
          });
      }, SEARCH_DEBOUNCE_MS);

      return () => window.clearTimeout(handle);
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
          if (generationRef.current === generation) {
            setSearchState({ kind: "results", result });
          }
        })
        .catch(() => {
          if (generationRef.current === generation) {
            setSearchState({ kind: "error" });
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [
    glossaryMode,
    projectAvailable,
    textSearchAvailable,
    glossarySearchAvailable,
    hasGlossaryAtoms,
    glossaryTerms,
    trimmedQuery,
    options.caseSensitive,
    options.wholeWord,
    options.useRegex
  ]);

  const toggleGlossaryMode = (): void => {
    // Glossary search is a distinct mode, not an add-on option: entering or
    // leaving it clears the text-mode options (no auto-restore).
    setOptions(DEFAULT_SEARCH_OPTIONS);
    setMode((current) => (current === "glossary" ? "text" : "glossary"));
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

  const optionDisabledHint = translate("search.optionUnavailableWithGlossary");

  return (
    <aside
      className="workspaceSidebarPanel searchPane"
      aria-label={translate("search.sidebarTitle")}
    >
      <div className="sidebarHeader">{translate("search.sidebarTitle")}</div>

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
            <SearchOptionToggle
              icon={GLOSSARY_SEARCH_ICON}
              pressed={glossaryMode}
              label={translate("search.option.glossary")}
              hint={translate("search.option.glossary.hint")}
              onToggle={toggleGlossaryMode}
            />
            <SearchOptionToggle
              icon={WHOLE_WORD_ICON}
              pressed={options.wholeWord}
              disabled={glossaryMode || options.useRegex}
              label={translate("search.option.wholeWord")}
              hint={
                glossaryMode
                  ? optionDisabledHint
                  : options.useRegex
                    ? translate("search.wholeWordUnavailableWithRegex")
                    : translate("search.option.wholeWord.hint")
              }
              onToggle={() => toggleOption("wholeWord")}
            />
            <SearchOptionToggle
              icon={CASE_SENSITIVE_ICON}
              pressed={options.caseSensitive}
              disabled={glossaryMode}
              label={translate("search.option.caseSensitive")}
              hint={
                glossaryMode
                  ? optionDisabledHint
                  : translate("search.option.caseSensitive.hint")
              }
              onToggle={() => toggleOption("caseSensitive")}
            />
            <SearchOptionToggle
              icon={USE_REGEX_ICON}
              pressed={options.useRegex}
              disabled={glossaryMode}
              label={translate("search.option.useRegex")}
              hint={
                glossaryMode
                  ? optionDisabledHint
                  : translate("search.option.useRegex.hint")
              }
              onToggle={() => toggleOption("useRegex")}
            />
          </div>
        </div>
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
          <p className="workspacePlaceholder" role="status">
            {translate("search.searching")}
          </p>
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
