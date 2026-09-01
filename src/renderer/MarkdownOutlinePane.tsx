import type { CSSProperties } from "react";
import type { Translate } from "../shared/i18n";
import type {
  MarkdownOutlineItem,
  MarkdownOutlineParseResult
} from "../shared/markdownOutline";

/**
 * #352: the Markdown Outline pane — the ACTIVE document's ATX-heading tree,
 * built from working text (dirty edits included), independent of the Preview.
 * A heading click jumps the editor to that heading (offset jump, via the
 * host's `onHeadingClick`).
 *
 * Items with children carry a collapse/expand chevron; the chevron toggles
 * child visibility only and never triggers a heading jump, while the heading
 * button jumps and never toggles. This component is CONTROLLED: the collapsed
 * set (`collapsedItemIds`, keyed by `item.id`) lives in `WorkbenchFilesSidebar`
 * so it survives the pane body unmounting when the Outline pane itself is
 * collapsed. The host clears it when the active document changes; heading ids
 * are line + slug derived, so following collapsed state across edits within a
 * document is out of scope for v1, as is any restart persistence.
 */
export interface MarkdownOutlinePaneProps {
  readonly outline: MarkdownOutlineParseResult | null;
  readonly activeEditorIsMarkdown: boolean;
  readonly collapsedItemIds: ReadonlySet<string>;
  readonly onToggleItemCollapsed: (itemId: string) => void;
  readonly translate: Translate;
  readonly onHeadingClick: (item: MarkdownOutlineItem) => void;
}

export function MarkdownOutlinePane({
  outline,
  activeEditorIsMarkdown,
  collapsedItemIds,
  onToggleItemCollapsed,
  translate,
  onHeadingClick
}: MarkdownOutlinePaneProps): JSX.Element {
  if (!activeEditorIsMarkdown) {
    return (
      <p className="markdownOutlinePaneEmpty" role="status">
        {translate("outline.empty.notMarkdown")}
      </p>
    );
  }

  if (!outline || outline.tree.length === 0) {
    return (
      <p className="markdownOutlinePaneEmpty" role="status">
        {translate("outline.empty.noHeadings")}
      </p>
    );
  }

  const renderItem = (item: MarkdownOutlineItem, depth: number): JSX.Element => {
    const label =
      item.text === ""
        ? translate("outline.heading.empty")
        : translate("outline.heading.jumpLabel", { text: item.text });
    const hasChildren = item.children.length > 0;
    const isCollapsed = collapsedItemIds.has(item.id);

    return (
      <li
        key={item.id}
        role="treeitem"
        aria-level={item.level}
        aria-expanded={hasChildren ? !isCollapsed : undefined}
        className="markdownOutlineTreeItem"
      >
        <div
          className="markdownOutlineTreeRow"
          style={
            {
              "--markdown-outline-depth": depth
            } as CSSProperties
          }
        >
          {hasChildren ? (
            <button
              type="button"
              className="markdownOutlineTreeChevron"
              aria-label={translate(
                isCollapsed ? "outline.item.expand" : "outline.item.collapse"
              )}
              aria-expanded={!isCollapsed}
              onClick={() => onToggleItemCollapsed(item.id)}
            >
              {isCollapsed ? "▸" : "▾"}
            </button>
          ) : (
            <span
              className="markdownOutlineTreeChevronPlaceholder"
              aria-hidden="true"
            />
          )}
          <button
            type="button"
            className="markdownOutlineHeading"
            data-outline-level={item.level}
            aria-label={label}
            title={item.text || label}
            onClick={() => onHeadingClick(item)}
          >
            {item.text === "" ? (
              <span className="markdownOutlineHeadingEmpty">
                {translate("outline.heading.empty")}
              </span>
            ) : (
              item.text
            )}
          </button>
        </div>
        {hasChildren && !isCollapsed ? (
          <ul role="group" className="markdownOutlineTreeGroup">
            {item.children.map((child) => renderItem(child, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <ul
      className="markdownOutlineTree"
      role="tree"
      aria-label={translate("outline.title")}
    >
      {outline.tree.map((item) => renderItem(item, 0))}
    </ul>
  );
}
