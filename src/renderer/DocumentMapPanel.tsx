import { useEffect, useMemo, useRef, useState } from "react";
import type { DocumentMapSettings } from "../shared/documentMapSettings";
import type { GlossaryEntry, GlossaryTag } from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import type { EditorVisibleTextRange } from "./editorVisibleRange";
import type { EditorScrollAlign } from "./editorScrollAlign";
import { GlossaryTextMinimapCanvas } from "./GlossaryTextMinimapCanvas";
import { DocumentMapTagFilter } from "./DocumentMapTagFilter";

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
  translate: Translate;
}

/**
 * #375 Document Map / 文書マップ — the left-pane panel. Header (fixed) + a
 * "Render tags" multi-select + a vertically scrolling body holding ONE tall
 * {@link GlossaryTextMinimapCanvas}.
 *
 * The tag selection is LOCAL state (never persisted) and DEFAULTS to every
 * project tag. On a tag refresh: deleted tags are dropped, brand-new tags are
 * added to the selection. An empty selection means "draw no Glossary hits"
 * (it is NOT read as "All"). Tagless Entries are never drawn while the filter
 * is active.
 */
export function DocumentMapPanel({
  activeDocumentContent,
  glossaryEntries,
  glossaryTags = [],
  editorWidth,
  editorVisibleRange = null,
  documentMapSettings,
  onNavigateToLine,
  translate
}: DocumentMapPanelProps): JSX.Element {
  const hasContent =
    activeDocumentContent !== null && activeDocumentContent.trim().length > 0;

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

  return (
    <aside
      className="workspaceSidebarPanel documentMapPanel"
      aria-label={translate("documentMap.title")}
    >
      <div className="sidebarHeader">{translate("documentMap.title")}</div>

      <div className="documentMapControls">
        <DocumentMapTagFilter
          tags={glossaryTags}
          selectedTagIds={validSelectedTagIds}
          translate={translate}
          onChange={setSelectedTagIds}
        />
      </div>

      {hasContent ? (
        <div className="documentMapBody">
          <GlossaryTextMinimapCanvas
            text={activeDocumentContent as string}
            entries={glossaryEntries}
            editorWidth={editorWidth}
            visibleRange={editorVisibleRange}
            documentMapSettings={documentMapSettings}
            selectedTagIds={validSelectedTagIds}
            onNavigateToLine={onNavigateToLine}
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
