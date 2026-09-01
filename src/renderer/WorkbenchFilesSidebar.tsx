import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Translate } from "../shared/i18n";
import type {
  MarkdownOutlineItem,
  MarkdownOutlineParseResult
} from "../shared/markdownOutline";
import { CollapsibleSidebarSection } from "./CollapsibleSidebarSection";
import { MarkdownOutlinePane } from "./MarkdownOutlinePane";
import { useVerticalDrag } from "./useVerticalDrag";

/**
 * #352: the Files sidebar's vertical stack — File Explorer above, a resizable
 * Markdown Outline pane below, with a pointer-drag handle between them.
 *
 * v1 scope: collapse + height resize only. No width change (that's the
 * existing sidebar-width handle, untouched), no Document Properties pane, no
 * persistence across restarts, no generic n-pane splitter. The Outline height
 * is kept while collapsed so re-expanding restores it.
 *
 * This component also owns the Outline TREE ITEM collapsed set
 * (`collapsedOutlineItemIds`) so it survives the Outline pane body unmounting
 * when the pane itself is collapsed. It is cleared whenever the active
 * document changes (`activeOutlineDocumentKey`), not on every keystroke —
 * `markdownOutline` identity changes on the typing debounce, so keying the
 * clear on the document instead keeps collapsed headings stable while editing.
 */
const OUTLINE_MIN_HEIGHT = 96;
const OUTLINE_MAX_HEIGHT = 480;
const OUTLINE_DEFAULT_HEIGHT = 200;
/** Keep at least this much of the File Explorer visible while resizing. */
const FILE_EXPLORER_MIN_VISIBLE = 120;

export interface WorkbenchFilesSidebarProps {
  /** The already-constructed `<FileExplorer>` element. */
  readonly fileExplorer: ReactNode;
  readonly translate: Translate;
  readonly markdownOutline: MarkdownOutlineParseResult | null;
  readonly activeEditorIsMarkdown: boolean;
  /** #352: serialized identity of the active document. When it changes the
   *  outline tree item collapsed set is cleared (heading ids are not stable
   *  across documents). `null` when there is no active document. */
  readonly activeOutlineDocumentKey: string | null;
  readonly onOutlineHeadingClick: (item: MarkdownOutlineItem) => void;
}

export function WorkbenchFilesSidebar({
  fileExplorer,
  translate,
  markdownOutline,
  activeEditorIsMarkdown,
  activeOutlineDocumentKey,
  onOutlineHeadingClick
}: WorkbenchFilesSidebarProps): JSX.Element {
  const [outlineCollapsed, setOutlineCollapsed] = useState(true);
  const [outlineHeight, setOutlineHeight] = useState(OUTLINE_DEFAULT_HEIGHT);
  const [collapsedOutlineItemIds, setCollapsedOutlineItemIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const heightAtDragStartRef = useRef(outlineHeight);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Drop the per-item collapsed state when the active document changes. Keyed
  // on the document identity, NOT on `markdownOutline` identity, so a typing
  // re-parse does not keep wiping the user's collapsed headings.
  useEffect(() => {
    setCollapsedOutlineItemIds((current) =>
      current.size === 0 ? current : new Set()
    );
  }, [activeOutlineDocumentKey]);

  const handleToggleOutlineItemCollapsed = (itemId: string): void => {
    setCollapsedOutlineItemIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const clampOutlineHeight = (candidate: number): number => {
    const containerHeight = containerRef.current?.clientHeight ?? 0;
    const upperBound =
      containerHeight > 0
        ? Math.min(
            OUTLINE_MAX_HEIGHT,
            Math.max(
              OUTLINE_MIN_HEIGHT,
              containerHeight - FILE_EXPLORER_MIN_VISIBLE
            )
          )
        : OUTLINE_MAX_HEIGHT;
    return Math.max(OUTLINE_MIN_HEIGHT, Math.min(candidate, upperBound));
  };

  const outlineResizeDrag = useVerticalDrag({
    onDragStart: () => {
      heightAtDragStartRef.current = outlineHeight;
    },
    onDragMove: (deltaY) => {
      // The handle sits ABOVE the Outline section: dragging up grows the
      // Outline pane, dragging down shrinks it.
      setOutlineHeight(
        clampOutlineHeight(heightAtDragStartRef.current - deltaY)
      );
    }
  });

  return (
    <div ref={containerRef} className="workbenchFilesSidebar">
      {fileExplorer}
      {outlineCollapsed ? null : (
        <div
          className="workbenchFilesSidebarResizeHandle"
          role="separator"
          aria-orientation="horizontal"
          aria-label={translate("outline.resizeHandle")}
          onPointerDown={outlineResizeDrag.onPointerDown}
          onPointerMove={outlineResizeDrag.onPointerMove}
          onPointerUp={outlineResizeDrag.onPointerUp}
          onPointerCancel={outlineResizeDrag.onPointerCancel}
        />
      )}
      <CollapsibleSidebarSection
        title={translate("outline.title")}
        toggleLabel={translate("outline.section.toggle")}
        collapsed={outlineCollapsed}
        onToggleCollapsed={() => setOutlineCollapsed((current) => !current)}
        bodyStyle={
          outlineCollapsed ? undefined : { height: `${outlineHeight}px` }
        }
      >
        <MarkdownOutlinePane
          outline={markdownOutline}
          activeEditorIsMarkdown={activeEditorIsMarkdown}
          collapsedItemIds={collapsedOutlineItemIds}
          onToggleItemCollapsed={handleToggleOutlineItemCollapsed}
          translate={translate}
          onHeadingClick={onOutlineHeadingClick}
        />
      </CollapsibleSidebarSection>
    </div>
  );
}
