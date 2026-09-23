import { useEffect, useMemo, useRef, useState } from "react";
import type { DocumentMapSettings } from "../shared/documentMapSettings";
import type { GlossaryEntry, GlossaryTag } from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import type { EditorVisibleTextRange } from "./editorVisibleRange";
import type { EditorScrollAlign } from "./editorScrollAlign";
import { GlossaryTextMinimapCanvas } from "./GlossaryTextMinimapCanvas";
import { DocumentMapTagFilter } from "./DocumentMapTagFilter";
import { DocumentMapPaginator } from "./DocumentMapPaginator";
import {
  GLOSSARY_DOCUMENT_MAP_CELL_SIZE,
  buildDocumentMapLineLayout,
  computeDocumentMapPages,
  resolveDocumentMapWrapColumns
} from "./glossaryDocumentMap";
import { deriveDefaultDocumentMapPngBaseFileName } from "./documentMapPngExportPlan";
import type { DocumentMapPngExportSnapshot } from "./dialog/DocumentMapPngExportDialog";
import saveIconRaw from "../../assets/icons/codicons/documentMap/save.svg?raw";

interface DocumentMapPanelProps {
  /**
   * The active Markdown document's working text, or `null` when the active
   * surface is not a Markdown editor. An empty / whitespace-only string is
   * treated the same as `null` (nothing to map).
   */
  activeDocumentContent: string | null;
  /** All project glossary entries (the occurrence scan). */
  glossaryEntries: readonly GlossaryEntry[];
  /**
   * #375: project-wide tags in `glossary_tags.sort_order` order — drives the
   * "Render tags" multi-select. Omitted / empty → the selector is disabled.
   */
  glossaryTags?: readonly GlossaryTag[];
  /**
   * The ACTIVE EDITOR's rendered width in CSS pixels. Drives the Document Map's
   * logical wrap width — NOT the left pane width. `null` uses a safe fallback.
   */
  editorWidth: number | null;
  /**
   * The active Markdown editor's on-screen document range. Drawn as a 1px
   * "you are here" rectangle over the map. `null` → no overlay.
   */
  editorVisibleRange?: EditorVisibleTextRange | null;
  /** #375 `documentMap` settings — draw colours + dialogue delimiter pairs. */
  documentMapSettings?: DocumentMapSettings;
  /** Existing workbench.normalizeUnicodeToNfc setting for Glossary occurrence detection. */
  normalizeUnicodeToNfc?: boolean;
  /**
   * #375: the map resolved a 0-based SOURCE line (from a click or a
   * viewport-lens drag) — scroll the active Markdown editor there (navigation
   * only). `options.align` is `"center"` for click-to-scroll, `"start"` for
   * lens drag. Omitted → the map is neither clickable nor draggable.
   */
  onNavigateToLine?: (
    lineIndex: number,
    options?: { align?: EditorScrollAlign }
  ) => void;
  /**
   * #537: the active document's display name (e.g. `"chapter01.md"`), used
   * only to derive the PNG export dialog's default base filename. `null` /
   * omitted falls back to a safe generic default.
   */
  activeDocumentName?: string | null;
  /**
   * #537: opens the Document Map PNG export dialog with a frozen snapshot of
   * everything needed to render every page — the current document text,
   * glossary entries, the CURRENT "Render tags" selection, layout, and
   * settings. Omitted → the export icon is not shown.
   */
  onExportDocumentMapPng?: (snapshot: DocumentMapPngExportSnapshot) => void;
  translate: Translate;
}

/**
 * #375 / #403 Document Map / 文書マップ — the left-pane panel. Header (fixed) +
 * an optional physical Document Map paginator (#403 Phase 2) + "Render tags"
 * multi-select + a vertically scrolling body holding ONE physical-page Canvas.
 *
 * The tag selection is LOCAL state (never persisted) and DEFAULTS to every
 * project tag. On a tag refresh: deleted tags are dropped, brand-new tags are
 * added to the selection. An empty selection means "draw no Glossary hits"
 * (it is NOT read as "All"). Tagless Entries are never drawn while the filter
 * is active.
 *
 * Page selection is also transient UI state. The paginator only renders when
 * `pageCount >= 2`. Normal documents look exactly as before without pagination.
 */
export function DocumentMapPanel({
  activeDocumentContent,
  glossaryEntries,
  glossaryTags = [],
  editorWidth,
  editorVisibleRange = null,
  documentMapSettings,
  normalizeUnicodeToNfc = false,
  onNavigateToLine,
  activeDocumentName = null,
  onExportDocumentMapPng,
  translate
}: DocumentMapPanelProps): JSX.Element {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [selectedPageIndex, setSelectedPageIndex] = useState(0);

  const hasContent =
    activeDocumentContent !== null && activeDocumentContent.trim().length > 0;

  const wrapColumns = useMemo(
    () =>
      resolveDocumentMapWrapColumns({
        editorRect: editorWidth === null ? null : { width: editorWidth }
      }),
    [editorWidth]
  );

  const totalVisualRows = useMemo(() => {
    if (!hasContent) {
      return 0;
    }
    return buildDocumentMapLineLayout(
      activeDocumentContent as string,
      wrapColumns
    ).totalVisualRows;
  }, [hasContent, activeDocumentContent, wrapColumns]);

  const pixelRatio =
    typeof window !== "undefined" && window.devicePixelRatio > 0
      ? window.devicePixelRatio
      : 1;

  const pages = useMemo(
    () =>
      computeDocumentMapPages({
        totalVisualRows,
        pixelRatio
      }),
    [totalVisualRows, pixelRatio]
  );

  const pageCount = pages.length;
  const effectivePageIndex = Math.max(
    0,
    Math.min(selectedPageIndex, pageCount - 1)
  );
  const currentPage = pages[effectivePageIndex];

  // Keep page index within valid bounds on document changes.
  useEffect(() => {
    if (selectedPageIndex >= pageCount) {
      setSelectedPageIndex(Math.max(0, pageCount - 1));
    }
  }, [pageCount, selectedPageIndex]);

  const handleSelectPage = (nextIndex: number): void => {
    const clamped = Math.max(0, Math.min(nextIndex, pageCount - 1));
    setSelectedPageIndex(clamped);
    if (bodyRef.current) {
      bodyRef.current.scrollTop = 0;
    }
  };

  const allTagIds = useMemo(
    () => glossaryTags.map((tag) => tag.id),
    [glossaryTags]
  );

  // Default = every project tag selected.
  const [selectedTagIds, setSelectedTagIds] = useState<readonly string[]>(
    () => allTagIds
  );
  const knownTagIdsRef = useRef<ReadonlySet<string>>(new Set(allTagIds));

  const tagIdKey = allTagIds.join(" ");
  useEffect(() => {
    setSelectedTagIds((current) => {
      const currentSet = new Set(allTagIds);
      const known = knownTagIdsRef.current;
      knownTagIdsRef.current = currentSet;

      // Keep still-existing selections; auto-select tags that are brand new
      // (were not in the previous tag list).
      const kept = current.filter((id) => currentSet.has(id));
      const keptSet = new Set(kept);
      const added = allTagIds.filter(
        (id) => !known.has(id) && !keptSet.has(id)
      );

      const next = added.length === 0 ? kept : [...kept, ...added];
      // Preserve identity when nothing changed (avoids a needless redraw).
      return next.length === current.length &&
        next.every((id, index) => id === current[index])
        ? current
        : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagIdKey]);

  // Defensive: never hand the canvas an id that no longer exists.
  const validSelectedTagIds = useMemo(() => {
    const known = new Set(allTagIds);
    return selectedTagIds.filter((id) => known.has(id));
  }, [selectedTagIds, allTagIds]);

  // #537: snapshot everything the export dialog needs at the moment the
  // button is clicked — NOT re-derived reactively while the dialog is open,
  // so later edits to the document / tag filter / settings can never change
  // an in-progress export.
  function handleExportDocumentMapPngClick(): void {
    if (!hasContent || !onExportDocumentMapPng) {
      return;
    }

    onExportDocumentMapPng({
      text: activeDocumentContent as string,
      entries: glossaryEntries,
      selectedTagIds: validSelectedTagIds,
      wrapColumns,
      contentWidth: wrapColumns * GLOSSARY_DOCUMENT_MAP_CELL_SIZE,
      documentMapSettings,
      normalizeUnicodeToNfc,
      pages,
      pixelRatio,
      defaultBaseFileName:
        deriveDefaultDocumentMapPngBaseFileName(activeDocumentName)
    });
  }

  return (
    <aside
      className="workspaceSidebarPanel documentMapPanel"
      aria-label={translate("documentMap.title")}
    >
      <div className="sidebarHeader">{translate("documentMap.title")}</div>

      {hasContent && pageCount >= 2 ? (
        <DocumentMapPaginator
          currentPage={effectivePageIndex}
          pageCount={pageCount}
          translate={translate}
          onSelectPage={handleSelectPage}
        />
      ) : null}

      <div className="documentMapControls">
        <DocumentMapTagFilter
          tags={glossaryTags}
          selectedTagIds={validSelectedTagIds}
          translate={translate}
          onChange={setSelectedTagIds}
        />
        {onExportDocumentMapPng ? (
          <button
            type="button"
            className="documentMapExportButton"
            disabled={!hasContent}
            aria-label={translate("documentMap.export.openButtonLabel")}
            title={translate("documentMap.export.openButtonLabel")}
            onClick={handleExportDocumentMapPngClick}
          >
            <span
              className="documentMapExportButtonIcon"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: saveIconRaw }}
            />
          </button>
        ) : null}
      </div>

      {hasContent ? (
        <div className="documentMapBody" ref={bodyRef}>
          <GlossaryTextMinimapCanvas
            text={activeDocumentContent as string}
            entries={glossaryEntries}
            editorWidth={editorWidth}
            visibleRange={editorVisibleRange}
            documentMapSettings={documentMapSettings}
            selectedTagIds={validSelectedTagIds}
            onNavigateToLine={onNavigateToLine}
            page={currentPage}
            normalizeUnicodeToNfc={normalizeUnicodeToNfc}
            translate={translate}
          />
        </div>
      ) : (
        <div className="workspacePlaceholderList">
          <div className="workspacePlaceholder">
            {translate("documentMap.empty")}
          </div>
        </div>
      )}
    </aside>
  );
}
