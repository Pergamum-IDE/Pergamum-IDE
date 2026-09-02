import { useEffect, useRef, useState } from "react";
import type {
  CreateGlossaryEntryInput,
  GlossaryEntry,
  GlossaryEntryId,
  GlossaryTagId
} from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import { findGlossaryEntryOccurrences } from "./glossaryOccurrenceNavigation";
import {
  GLOSSARY_TAG_FILTER_ALL,
  GLOSSARY_TAG_FILTER_NONE,
  filterGlossaryEntriesByTag,
  filterGlossaryEntriesForNavigator,
  glossaryTagFilterForTagId,
  type GlossaryTagFilter
} from "./glossaryNavigatorSearch";
import { GlossaryTagChip } from "./GlossaryTagChip";
import {
  createErrorGlossarySidebarState,
  createLoadedGlossarySidebarState,
  createLoadingGlossarySidebarState,
  createNoProjectGlossarySidebarState,
  loadGlossary,
  preserveGlossaryTagFilter,
  representativeGlossarySurface,
  shouldApplyGlossaryLoadResult,
  type GlossarySidebarState
} from "./glossarySidebarState";

interface GlossarySidebarProps {
  projectRootPath: string | null;
  readOnly?: boolean;
  highlightedEntryId: GlossaryEntryId | null;
  refreshToken: number;
  translate: Translate;
  /** Active Markdown document body for occurrence hit counts, or null. */
  activeDocumentContent: string | null;
  onActivateEntry: (entryId: GlossaryEntryId) => void;
  onCreateEntry: (input: CreateGlossaryEntryInput) => Promise<boolean>;
  onNavigateOccurrence: (
    entry: GlossaryEntry,
    direction: "previous" | "next"
  ) => void;
}

interface GlossaryCreateFormState {
  isOpen: boolean;
  representativeValue: string;
  tagIds: GlossaryTagId[];
  isSubmitting: boolean;
  error: string | null;
}

const INITIAL_CREATE_FORM: GlossaryCreateFormState = {
  isOpen: false,
  representativeValue: "",
  tagIds: [],
  isSubmitting: false,
  error: null
};

function entryHitCount(
  entry: GlossaryEntry,
  activeDocumentContent: string | null
): number {
  if (activeDocumentContent === null) {
    return 0;
  }

  return findGlossaryEntryOccurrences(activeDocumentContent, entry).length;
}

/** `<option>` value for the "no tags" pseudo-filter (never a real tag id). */
const TAG_FILTER_NONE_OPTION = "__none__";

function tagFilterToOptionValue(filter: GlossaryTagFilter): string {
  switch (filter.kind) {
    case "all":
      return "";
    case "none":
      return TAG_FILTER_NONE_OPTION;
    case "tag":
      return filter.tagId;
  }
}

function optionValueToTagFilter(value: string): GlossaryTagFilter {
  if (value === "") {
    return GLOSSARY_TAG_FILTER_ALL;
  }

  if (value === TAG_FILTER_NONE_OPTION) {
    return GLOSSARY_TAG_FILTER_NONE;
  }

  return glossaryTagFilterForTagId(value);
}

export function GlossarySidebar({
  projectRootPath,
  readOnly = false,
  highlightedEntryId,
  refreshToken,
  translate,
  activeDocumentContent,
  onActivateEntry,
  onCreateEntry,
  onNavigateOccurrence
}: GlossarySidebarProps): JSX.Element {
  const [state, setState] = useState<GlossarySidebarState>(() =>
    projectRootPath
      ? createLoadingGlossarySidebarState(null)
      : createNoProjectGlossarySidebarState()
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<GlossaryTagFilter>(
    GLOSSARY_TAG_FILTER_ALL
  );
  const [expandedEntryIds, setExpandedEntryIds] = useState<
    ReadonlySet<GlossaryEntryId>
  >(new Set());
  const [createForm, setCreateForm] =
    useState<GlossaryCreateFormState>(INITIAL_CREATE_FORM);
  const projectRootPathRef = useRef<string | null>(projectRootPath);
  const loadRequestIdRef = useRef(0);

  useEffect(() => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;

    const didProjectChange = projectRootPathRef.current !== projectRootPath;
    projectRootPathRef.current = projectRootPath;

    if (!projectRootPath) {
      setState(createNoProjectGlossarySidebarState());
      return;
    }

    setState((current) =>
      createLoadingGlossarySidebarState(
        didProjectChange ? null : current.selectedEntryId
      )
    );

    let isActive = true;

    void loadGlossary()
      .then(({ entries, tags }) => {
        if (
          !isActive ||
          !shouldApplyGlossaryLoadResult(loadRequestIdRef.current, requestId)
        ) {
          return;
        }

        setState((current) =>
          createLoadedGlossarySidebarState(
            entries,
            tags,
            didProjectChange ? null : current.selectedEntryId
          )
        );
        setTagFilter((current) =>
          didProjectChange
            ? GLOSSARY_TAG_FILTER_ALL
            : preserveGlossaryTagFilter(tags, current)
        );
      })
      .catch(() => {
        if (
          !isActive ||
          !shouldApplyGlossaryLoadResult(loadRequestIdRef.current, requestId)
        ) {
          return;
        }

        setState((current) =>
          createErrorGlossarySidebarState(
            didProjectChange ? null : current.selectedEntryId
          )
        );
      });

    return () => {
      isActive = false;
    };
  }, [projectRootPath, refreshToken]);

  async function submitCreateForm(): Promise<void> {
    const value = createForm.representativeValue.trim();

    if (readOnly || value.length === 0 || createForm.isSubmitting) {
      return;
    }

    setCreateForm((form) => ({ ...form, isSubmitting: true, error: null }));

    try {
      const didOpen = await onCreateEntry({
        description: "",
        atoms: [{ value, matchFlags: 0 }],
        tagIds: [...createForm.tagIds]
      });

      setCreateForm(
        didOpen
          ? INITIAL_CREATE_FORM
          : {
              ...createForm,
              isSubmitting: false,
              error: translate("glossary.create.error")
            }
      );
    } catch {
      setCreateForm((form) => ({
        ...form,
        isSubmitting: false,
        error: translate("glossary.create.error")
      }));
    }
  }

  const visibleEntries =
    state.status === "loaded"
      ? filterGlossaryEntriesForNavigator(
          filterGlossaryEntriesByTag(state.entries, tagFilter),
          searchQuery
        )
      : [];

  return (
    <aside
      className="workspaceSidebarPanel glossarySidebar"
      aria-label={translate("glossary.sidebarTitle")}
    >
      <div className="sidebarHeader">{translate("glossary.sidebarTitle")}</div>

      {state.status === "loaded" ? (
        <div className="glossarySidebarControls">
          <label className="glossarySidebarTagFilter">
            <span>{translate("glossary.tagFilter")}</span>
            <select
              value={tagFilterToOptionValue(tagFilter)}
              onChange={(event) =>
                setTagFilter(optionValueToTagFilter(event.target.value))
              }
            >
              <option value="">{translate("glossary.tagFilter.all")}</option>
              <option value={TAG_FILTER_NONE_OPTION}>
                {translate("glossary.tagFilter.none")}
              </option>
              {state.tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.label}
                </option>
              ))}
            </select>
          </label>
          <input
            type="search"
            className="glossarySidebarSearch"
            value={searchQuery}
            aria-label={translate("glossaryNavigator.search")}
            placeholder={translate("glossaryNavigator.searchPlaceholder")}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
      ) : null}

      <div className="workspacePlaceholderList">
        {state.status === "noProject" ? (
          <div className="workspacePlaceholder">
            {translate("glossary.noProject")}
          </div>
        ) : state.status === "loading" ? (
          <div className="workspacePlaceholder" role="status">
            {translate("glossary.loading")}
          </div>
        ) : state.status === "error" ? (
          <div className="workspacePlaceholder" role="alert">
            {translate("glossary.loadError")}
          </div>
        ) : state.entries.length === 0 ? (
          <div className="workspacePlaceholder">
            {translate("glossary.empty")}
          </div>
        ) : visibleEntries.length === 0 ? (
          <div className="workspacePlaceholder">
            {translate("glossaryNavigator.emptySearchResult")}
          </div>
        ) : (
          <ul
            className="glossarySidebarEntries"
            aria-label={translate("glossary.entries")}
          >
            {visibleEntries.map((entry) => {
              const label = representativeGlossarySurface(entry);
              const expanded = expandedEntryIds.has(entry.id);
              const hitCount = entryHitCount(entry, activeDocumentContent);
              // #375: occurrence jump targets the ACTIVE Markdown document
              // only. No active Markdown body, or no hits for this entry ⇒
              // the ◀ / ▶ buttons are disabled.
              const occurrenceNavDisabled =
                activeDocumentContent === null || hitCount === 0;

              return (
                <li
                  key={entry.id}
                  className={[
                    "glossarySidebarEntryRow",
                    highlightedEntryId === entry.id ? "isActive" : null
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-current={
                    highlightedEntryId === entry.id ? "page" : undefined
                  }
                >
                  <div className="glossarySidebarEntryHeader">
                    <button
                      type="button"
                      className="glossarySidebarOccurrenceButton"
                      aria-label={translate("glossary.previousOccurrence")}
                      title={translate("glossary.previousOccurrence")}
                      disabled={occurrenceNavDisabled}
                      onClick={() =>
                        onNavigateOccurrence(entry, "previous")
                      }
                    >
                      ◀
                    </button>
                    <button
                      type="button"
                      className="glossarySidebarExpandButton"
                      aria-expanded={expanded}
                      aria-label={translate(
                        expanded
                          ? "glossary.collapseEntry"
                          : "glossary.expandEntry"
                      )}
                      onClick={() =>
                        setExpandedEntryIds((current) => {
                          const next = new Set(current);
                          if (next.has(entry.id)) {
                            next.delete(entry.id);
                          } else {
                            next.add(entry.id);
                          }
                          return next;
                        })
                      }
                    >
                      {expanded ? "∨" : "＞"}
                    </button>
                    <span
                      className="glossarySidebarEntryLabel"
                      title={label}
                    >
                      {label}
                    </span>
                    <button
                      type="button"
                      className="glossarySidebarOccurrenceButton"
                      aria-label={translate("glossary.nextOccurrence")}
                      title={translate("glossary.nextOccurrence")}
                      disabled={occurrenceNavDisabled}
                      onClick={() => onNavigateOccurrence(entry, "next")}
                    >
                      ▶
                    </button>
                  </div>

                  {expanded ? (
                    <div className="glossarySidebarEntryDetail">
                      {entry.tags.length > 0 ? (
                        <div className="glossarySidebarEntryTags">
                          {entry.tags.map((tag) => (
                            <GlossaryTagChip key={tag.id} tag={tag} />
                          ))}
                        </div>
                      ) : (
                        <div className="glossarySidebarEntryTags">
                          <span className="glossarySidebarNoTagsChip">
                            {translate("glossary.noTags")}
                          </span>
                        </div>
                      )}
                      <div className="glossarySidebarEntryFooter">
                        <span className="glossarySidebarHitCount">
                          {translate("glossary.hitCount", {
                            count: hitCount
                          })}
                        </span>
                        <button
                          type="button"
                          className="glossarySidebarEditButton"
                          aria-label={translate("glossary.editEntry")}
                          title={translate("glossary.editEntry")}
                          onClick={() => onActivateEntry(entry.id)}
                        >
                          …
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {createForm.isOpen ? (
        <form
          className="glossaryCreateForm"
          aria-label={translate("glossary.create.title")}
          onSubmit={(event) => {
            event.preventDefault();
            if (!readOnly) {
              void submitCreateForm();
            }
          }}
        >
          <label className="glossaryCreateFormField">
            <span>{translate("glossary.create.surfaceLabel")}</span>
            <input
              type="text"
              value={createForm.representativeValue}
              disabled={createForm.isSubmitting || readOnly}
              onChange={(event) =>
                setCreateForm((form) => ({
                  ...form,
                  representativeValue: event.target.value
                }))
              }
            />
          </label>
          {state.status === "loaded" && state.tags.length > 0 ? (
            <div className="glossaryCreateFormTags">
              {state.tags.map((tag) => {
                const attached = createForm.tagIds.includes(tag.id);
                return (
                  <button
                    type="button"
                    key={tag.id}
                    aria-pressed={attached}
                    className="glossaryCreateFormTagToggle"
                    onClick={() =>
                      setCreateForm((form) => ({
                        ...form,
                        tagIds: attached
                          ? form.tagIds.filter((id) => id !== tag.id)
                          : [...form.tagIds, tag.id]
                      }))
                    }
                  >
                    <GlossaryTagChip tag={tag} muted={!attached} />
                  </button>
                );
              })}
            </div>
          ) : null}
          {createForm.error ? (
            <p className="glossaryCreateFormError" role="alert">
              {createForm.error}
            </p>
          ) : null}
          <div className="glossaryCreateFormActions">
            <button
              type="button"
              disabled={createForm.isSubmitting}
              onClick={() => setCreateForm(INITIAL_CREATE_FORM)}
            >
              {translate("glossary.create.cancel")}
            </button>
            <button
              type="submit"
              disabled={
                createForm.isSubmitting ||
                readOnly ||
                createForm.representativeValue.trim().length === 0
              }
            >
              {translate("glossary.create.submit")}
            </button>
          </div>
        </form>
      ) : null}

      <div className="workspaceSidebarActions glossarySidebarActions">
        <button
          type="button"
          className="workspaceSidebarButton"
          disabled={projectRootPath === null || readOnly}
          onClick={() =>
            setCreateForm((form) =>
              form.isOpen
                ? INITIAL_CREATE_FORM
                : { ...INITIAL_CREATE_FORM, isOpen: true }
            )
          }
        >
          {translate("glossary.add")}
        </button>
      </div>
    </aside>
  );
}
