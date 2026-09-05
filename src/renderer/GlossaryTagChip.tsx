import type { CSSProperties } from "react";
import type { GlossaryTag } from "../shared/glossary";
import flagIcon from "../../assets/icons/feather/tag/flag.svg?raw";

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
  /**
   * #400: the entry's first-assigned tag (`sort_order = 0`). Shown with a
   * flag glyph inside the chip and a subtle shadow instead of a separate
   * "Primary Tag" text label. Every screen that shows an entry's tags in
   * assignment order passes this through instead of rendering its own
   * flag/badge markup.
   */
  isPrimary?: boolean;
  /**
   * Localized "Primary tag" wording. Only used (for the chip's accessible
   * name and tooltip) when `isPrimary` is set — the visible chip label never
   * shows it, since the flag glyph already carries that meaning visually.
   */
  primaryLabel?: string;
}

/**
 * #375: a GitHub-label-style tag chip. Colors come straight from the tag's
 * stored `#rrggbb` values.
 */
export function GlossaryTagChip({
  tag,
  muted = false,
  compact = false,
  isPrimary = false,
  primaryLabel
}: GlossaryTagChipProps): JSX.Element {
  const style: CSSProperties = {
    backgroundColor: tag.backgroundRgb,
    color: tag.foregroundRgb,
    opacity: muted ? 0.55 : 1
  };
  // The flag's own accessible meaning ("this tag is primary") is folded into
  // the chip's accessible name/tooltip instead, so the flag glyph itself
  // stays purely decorative (aria-hidden).
  const accessibleLabel =
    isPrimary && primaryLabel ? `${primaryLabel}: ${tag.label}` : undefined;

  return (
    <span
      className="glossaryTagChip"
      style={style}
      data-muted={muted}
      data-compact={compact || undefined}
      data-primary={isPrimary || undefined}
      title={accessibleLabel ?? tag.label}
      aria-label={accessibleLabel}
    >
      {isPrimary ? (
        <span
          className="glossaryTagChipFlag"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: flagIcon }}
        />
      ) : null}
      <span className="glossaryTagChipLabel">{tag.label}</span>
    </span>
  );
}
