import type { CSSProperties } from "react";
import type { GlossaryTag } from "../shared/glossary";

interface GlossaryTagChipProps {
  tag: Pick<GlossaryTag, "label" | "backgroundRgb" | "foregroundRgb">;
  /** Render dimmed (e.g. an available-but-not-attached tag in the picker). */
  muted?: boolean;
}

/**
 * #375: a GitHub-label-style tag chip. Colors come straight from the tag's
 * stored `#rrggbb` values.
 */
export function GlossaryTagChip({
  tag,
  muted = false
}: GlossaryTagChipProps): JSX.Element {
  const style: CSSProperties = {
    backgroundColor: tag.backgroundRgb,
    color: tag.foregroundRgb,
    opacity: muted ? 0.55 : 1
  };

  return (
    <span className="glossaryTagChip" style={style} data-muted={muted}>
      {tag.label}
    </span>
  );
}
