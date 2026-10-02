/**
 * #683/#685: the shared two-column content of a renderer context menu item —
 * label on the start side, shortcut at the end. The shortcut is supplementary
 * (aria-hidden) so it does not become part of the item's accessible name.
 */
export function ContextMenuItemContent({
  label,
  shortcut
}: {
  readonly label: string;
  readonly shortcut?: string;
}): JSX.Element {
  return (
    <>
      <span className="contextMenuItemLabel">{label}</span>
      {shortcut ? (
        <span className="contextMenuItemShortcut" aria-hidden="true">
          {shortcut}
        </span>
      ) : null}
    </>
  );
}
