import editIcon from "../../assets/icons/feather/global/edit-2.svg?raw";

export interface DocumentTabDirtyIndicatorProps {
  tooltip: string;
}

/**
 * Isolated on purpose (#184): the unsaved-changes glyph is expected to
 * change (dot vs. pencil vs. something else) without touching
 * `DocumentTabBar`'s layout/behavior — swap the icon import here only.
 * Non-interactive and outside the tab-order by construction: a `<span>`
 * with no `tabIndex`/click handler is neither focusable nor clickable.
 */
export function DocumentTabDirtyIndicator({
  tooltip
}: DocumentTabDirtyIndicatorProps): JSX.Element {
  return (
    <span
      className="documentTabDirtyIndicator"
      role="img"
      aria-label={tooltip}
      title={tooltip}
      dangerouslySetInnerHTML={{ __html: editIcon }}
    />
  );
}
