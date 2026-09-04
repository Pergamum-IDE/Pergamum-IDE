import { useEffect, useRef, useState } from "react";
import type { Translate } from "../shared/i18n";
import { compileSearchRegex, type TextSearchOptions } from "../shared/textSearch";
import type { ProjectTextSearchResult } from "./projectTextSearch";
import glossarySearchIconRaw from "../../assets/icons/svgrepo/search/vocabulary-svgrepo-com.svg?raw";
import wholeWordIconRaw from "../../assets/icons/Pergamum/search/word.svg?raw";
import caseSensitiveIconRaw from "../../assets/icons/svgrepo/search/case-sensitive-svgrepo-com.svg?raw";
import useRegexIconRaw from "../../assets/icons/svgrepo/search/regex-svgrepo-com.svg?raw";

/**
 * #384 — the Search pane.
 *
 * Phase 1 built the input row + the four option toggles (glossary next to the
 * box, then whole-word, match-case, and the advanced regex toggle last).
 *
 * Phase 2 wires a debounced project-wide search: the host supplies `runSearch`
 * (which reads a dirty editor buffer first, the disk file otherwise) and
 * `onOpenMatch` (open the file + select the match). Stale results are
 * discarded by a generation counter.
 *
 * The `.*` toggle switches the query to a JavaScript regular expression.
 * Regex and whole-word are mutually exclusive: turning `.*` on forces the
 * whole-word toggle off and disables it (turning `.*` back off does not
 * restore it). An invalid pattern shows a validation message and runs no
 * search. The glossary toggle is still inert — turning it on shows a "not
 * implemented" notice and runs nothing.
 */

/** `'text'` = ordinary query; `'glossary'` = search the glossary (later phase). */
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

/** Debounce between the last keystroke and running the project search. */
const SEARCH_DEBOUNCE_MS = 250;

type SearchState =
  | { readonly kind: "idle" }
  | { readonly kind: "searching" }
  | { readonly kind: "results"; readonly result: ProjectTextSearchResult }
  | { readonly kind: "invalidRegex" }
  | { readonly kind: "error" };

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

interface SearchSidebarProps {
  readonly translate: Translate;
  /** Whether a project is open (nothing to search without one). */
  readonly projectAvailable?: boolean;
  /**
   * Runs the project-wide plain-text search. `isCancelled` flips `true` once
   * a newer search has started; the implementation should stop early.
   */
  readonly runSearch?: (
    query: string,
    options: TextSearchOptions,
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
  onOpenMatch
}: SearchSidebarProps): JSX.Element {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("text");
  const [options, setOptions] = useState<SearchOptions>(DEFAULT_SEARCH_OPTIONS);
  const [searchState, setSearchState] = useState<SearchState>({ kind: "idle" });

  const runSearchRef = useRef(runSearch);
  runSearchRef.current = runSearch;
  const generationRef = useRef(0);

  // Any in-flight search that resolves after unmount must not set state.
  useEffect(
    () => () => {
      generationRef.current += 1;
    },
    []
  );

  const trimmedQuery = query.trim();
  const glossaryPending = mode === "glossary";
  const searchEnabled =
    trimmedQuery.length > 0 &&
    projectAvailable &&
    !glossaryPending &&
    runSearch !== undefined;

  useEffect(() => {
    if (!searchEnabled) {
      setSearchState({ kind: "idle" });
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
    searchEnabled,
    trimmedQuery,
    options.caseSensitive,
    options.wholeWord,
    options.useRegex
  ]);

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
      <div className="sidebarHeader">{translate("search.sidebarTitle")}</div>

      <div className="searchPaneControls">
        <div className="searchPaneInputRow">
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
          <div
            className="searchPaneOptions"
            role="group"
            aria-label={translate("search.options.label")}
          >
            <SearchOptionToggle
              icon={GLOSSARY_SEARCH_ICON}
              pressed={mode === "glossary"}
              label={translate("search.option.glossary")}
              hint={translate("search.option.glossary.hint")}
              onToggle={() =>
                setMode((current) =>
                  current === "glossary" ? "text" : "glossary"
                )
              }
            />
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
          </div>
        </div>
      </div>

      <div className="searchPaneBody">
        {glossaryPending ? (
          <div className="searchPaneNotices">
            <p className="workspacePlaceholder" role="status">
              {translate("search.notImplemented.glossary")}
            </p>
          </div>
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
          <>
            <p className="searchResultsSummary" role="status">
              {translate("search.summary", {
                matchCount: searchState.result.totalMatches,
                fileCount: searchState.result.fileCount
              })}
            </p>
            {searchState.result.truncated ? (
              <p className="searchResultsNote">
                {translate("search.truncated")}
              </p>
            ) : null}
            {searchState.result.skippedFileCount > 0 ? (
              <p className="searchResultsNote">
                {translate("search.skipped", {
                  count: searchState.result.skippedFileCount
                })}
              </p>
            ) : null}
            <ul className="searchResultGroups">
              {searchState.result.files.map((file) => (
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
                            handleRowClick(
                              file.relativePath,
                              match.startOffset,
                              match.endOffset
                            )
                          }
                        >
                          <span className="searchResultRowLocation">
                            {match.line}:{match.column}
                          </span>
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
        )}
      </div>
    </aside>
  );
}
