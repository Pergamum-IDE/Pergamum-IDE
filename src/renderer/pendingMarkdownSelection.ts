import type { GlossaryOccurrenceRange } from "./glossaryOccurrenceNavigation";

/**
 * #352: how the jump target should sit in the editor viewport after a
 * pending-selection jump.
 *
 * `"nearest"` (the default, and the only behavior before #352) scrolls the
 * minimum amount needed to bring the target on screen — used by Go to Line,
 * glossary occurrence navigation, and session-restore selection.
 *
 * `"center"` places the target line near the middle of the visible area —
 * used ONLY by an Outline pane heading click, where the surrounding context
 * matters more than minimal scrolling.
 */
export type PendingMarkdownSelectionScrollY = "nearest" | "center";

export interface PendingMarkdownSelection extends GlossaryOccurrenceRange {
  readonly scrollY?: PendingMarkdownSelectionScrollY;
}
