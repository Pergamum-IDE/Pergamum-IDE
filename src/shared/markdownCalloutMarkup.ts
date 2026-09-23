/**
 * #568 / #570: GitHub Alert-style callout vocabulary shared by callout
 * rendering (`src/renderer/preview/markdownCallout.ts`) and the toolbar
 * insertion command (#570), plus the pure text-transform helper for the
 * latter.
 */

export const markdownCalloutTypes = [
  "note",
  "tip",
  "important",
  "warning",
  "caution"
] as const;

export type MarkdownCalloutType = (typeof markdownCalloutTypes)[number];

/** The marker text inserted into Markdown — always uppercase (`NOTE`). */
export function markdownCalloutMarker(type: MarkdownCalloutType): string {
  return type.toUpperCase();
}

export interface MarkdownCalloutBlockResult {
  readonly text: string;
  /** Offset, from the start of `text`, where the collapsed cursor should
   *  land after the change is applied. */
  readonly selectionOffsetFromInsertStart: number;
}

/**
 * #570: builds `> [!TYPE]` followed by every `bodyLines` entry quoted with
 * `> ` (a blank line becomes `> `). Existing `>` markers are quoted again
 * as-is — no blockquote-to-callout upgrade. With no body lines, a single
 * empty `> ` body line is produced so the author can start typing there.
 * The cursor always lands at the end of the block (after the empty body
 * line's `> `, or after the last wrapped line).
 */
export function buildMarkdownCalloutBlock(
  type: MarkdownCalloutType,
  bodyLines: readonly string[]
): MarkdownCalloutBlockResult {
  const lines = bodyLines.length > 0 ? bodyLines : [""];
  const text = [
    `> [!${markdownCalloutMarker(type)}]`,
    ...lines.map((line) => `> ${line}`)
  ].join("\n");

  return { text, selectionOffsetFromInsertStart: text.length };
}
