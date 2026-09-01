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
 */
export interface MarkdownOutlinePaneProps {
  readonly outline: MarkdownOutlineParseResult | null;
  readonly activeEditorIsMarkdown: boolean;
  readonly translate: Translate;
  readonly onHeadingClick: (item: MarkdownOutlineItem) => void;
}

export function MarkdownOutlinePane({
  outline,
  activeEditorIsMarkdown,
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

    return (
      <li
        key={item.id}
        role="treeitem"
        aria-level={item.level}
        className="markdownOutlineTreeItem"
      >
        <button
          type="button"
          className="markdownOutlineHeading"
          data-outline-level={item.level}
          style={{ "--markdown-outline-depth": depth } as CSSProperties}
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
        {item.children.length > 0 ? (
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
