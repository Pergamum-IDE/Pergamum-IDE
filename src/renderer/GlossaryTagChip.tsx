import type { CSSProperties } from "react";
import type { GlossaryTag } from "../shared/glossary";

interface GlossaryTagChipProps {
  tag: Pick<GlossaryTag, "label" | "backgroundRgb" | "foregroundRgb">;
  /** Render dimmed (e.g. an available-but-not-attached tag in the picker). */
  muted?: boolean;
  /**
   * #360: a tighter chip for dense left-pane tables (Document Metrics tag
   * counts) — smaller padding / font, otherwise identical. Colours and the
   * `title` tooltip are unchanged.
   */
  compact?: boolean;
}

/**
 * #375: a GitHub-label-style tag chip. Colors come straight from the tag's
 * stored `#rrggbb` values.
 */
export function GlossaryTagChip({
  tag,
  muted = false,
  compact = false
}: GlossaryTagChipProps): JSX.Element {
  const style: CSSProperties = {
    backgroundColor: tag.backgroundRgb,
    color: tag.foregroundRgb,
    opacity: muted ? 0.55 : 1
  };

  return (
    <span
      className="glossaryTagChip"
      style={style}
      data-muted={muted}
      data-compact={compact || undefined}
      title={tag.label}
    >
      {tag.label}
    </span>
  );
}
