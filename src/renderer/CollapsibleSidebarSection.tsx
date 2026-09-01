import type { CSSProperties, ReactNode } from "react";

/**
 * #352: a collapsible section for stacking a secondary pane (the Markdown
 * Outline) under the File Explorer in the Files sidebar. Fully controlled —
 * the parent (`WorkbenchFilesSidebar`) owns the collapsed flag and the body
 * height so it can also drive a resize handle. Header is always rendered;
 * the body only when expanded.
 */
interface CollapsibleSidebarSectionProps {
  readonly title: string;
  /** Accessible name for the toggle button. */
  readonly toggleLabel: string;
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
  /** Applied to the body wrapper (e.g. a drag-controlled `height`). */
  readonly bodyStyle?: CSSProperties;
  readonly children: ReactNode;
}

export function CollapsibleSidebarSection({
  title,
  toggleLabel,
  collapsed,
  onToggleCollapsed,
  bodyStyle,
  children
}: CollapsibleSidebarSectionProps): JSX.Element {
  return (
    <section
      className="collapsibleSidebarSection"
      data-collapsed={collapsed ? "true" : undefined}
    >
      <button
        type="button"
        className="collapsibleSidebarSectionHeader"
        aria-expanded={!collapsed}
        aria-label={toggleLabel}
        onClick={onToggleCollapsed}
      >
        <span className="collapsibleSidebarSectionChevron" aria-hidden="true">
          {collapsed ? "▸" : "▾"}
        </span>
        <span className="collapsibleSidebarSectionTitle">{title}</span>
      </button>
      {collapsed ? null : (
        <div className="collapsibleSidebarSectionBody" style={bodyStyle}>
          {children}
        </div>
      )}
    </section>
  );
}
