/**
 * #375 Text Map / 文書マップ — Phase 1, line-aware / wrap-aware mapping.
 *
 * The Text Map is a left-pane panel that rasterises the ACTIVE Markdown
 * document onto a Canvas: normal text BLACK (`#000000`), Glossary Atom
 * occurrences WHITE (`#ffffff`), transparent background, white painted last so
 * an occurrence always overwrites the plain text underneath.
 *
 * Mapping is LINE-AWARE, not a one-dimensional `offset % width` raster:
 *   - the text is split on REAL newlines; each line keeps its `startOffset`,
 *   - `wrapColumns` is estimated from the ACTIVE EDITOR width
 *     (`floor(editorWidth / estimatedCharWidthPx)`), NOT used as a pixel
 *     raster width,
 *   - a long line is virtually wrapped every `wrapColumns` columns into
 *     several visual rows; an empty line still occupies one visual row,
 *   - `visualColumn = columnIndex % wrapColumns`,
 *     `visualRow = line.baseVisualRow + floor(columnIndex / wrapColumns)`,
 *   - the logical grid (`wrapColumns` × `totalVisualRows`) is then scaled into
 *     the left-pane canvas.
 *
 * So empty lines, paragraph lengths, long-line blocks and the occurrence
 * distribution stay legible instead of collapsing into a barcode.
 *
 * Every function here is pure so it can be unit-tested without a Canvas.
 * Occurrence detection reuses the shared glossary surface matcher
 * (`matchGlossarySurfacesInText`) — the SAME path as the Sidebar occurrence
 * jump — so `matchFlags`, the single-character opt-in and the boundary
 * policies are all honoured. No ad-hoc `String.prototype.includes` matching.
 *
 * #375: a Glossary hit is painted in the render tag's colour. With the panel's
 * "Render tags" filter active (`selectedTagIds`, default = every project tag),
 * an Entry is drawn only when it carries a selected tag, coloured by the FIRST
 * such tag in the Entry's own assignment order (`entry.tags`); tagless Entries
 * and an empty selection draw nothing. When `selectedTagIds` is OMITTED the
 * legacy "All" behaviour applies (primary tag colour, tagless → fallback). No
 * multi-tag mixing / tag lane.
 *
 * Phase 2+ (NOT here): a `タグなし` pseudo-option, marker hover / click jump,
 * PNG export, and a true CodeMirror wrap reproduction. `renderMode` is accepted
 * now so the call sites do not change later.
 */

import {
  defaultDocumentMapDialogueDelimiterPairs,
  type DocumentMapDialogueDelimiterPair
} from "../shared/documentMapSettings";
import { buildDocumentMapTagColorCache } from "../shared/documentMapTagColor";
import type { GlossaryEntry, GlossaryTag } from "../shared/glossary";
import { primaryGlossaryTag } from "../shared/glossary";
import {
  buildGlossarySurfaceIndex,
  matchGlossarySurfacesInText,
  type GlossarySurfaceIndex
} from "../shared/glossarySurfaceMatching";
import type { EditorVisibleTextRange } from "./editorVisibleRange";
import type { GlossaryOccurrenceRange } from "./glossaryOccurrenceNavigation";

/**
 * Built-in narration colour — used when `buildGlossaryTextMapPlan` is called
 * without a `documentMap.narrationColor`. Kept in sync with
 * `DOCUMENT_MAP_DEFAULT_NARRATION_COLOR` (#375 Task Q): a dark grey, not pure
 * black.
 */
export const GLOSSARY_TEXT_MAP_NORMAL_COLOR = "#3c3c3c";
/**
 * FALLBACK colour for a Glossary hit whose Entry has no assigned tag. A hit
 * whose Entry HAS a primary tag is drawn in that tag's `backgroundRgb`
 * instead (see {@link resolveGlossaryTextMapHitColor}).
 */
export const GLOSSARY_TEXT_MAP_HIT_COLOR = "#ff0000";
/**
 * Built-in colour for the default `「…」` dialogue pair — used when
 * `buildGlossaryTextMapPlan` is called without `documentMap.dialogueDelimiterPairs`.
 * Kept in sync with `DOCUMENT_MAP_DEFAULT_DIALOGUE_COLOR` (#375 Task Q): a mid
 * grey. A Glossary hit is still drawn on top of it.
 */
export const GLOSSARY_TEXT_MAP_DIALOGUE_COLOR = "#909090";

/**
 * Side length, in logical pixels, of ONE character cell. `1x1` was too fine to
 * read for Japanese prose, so a logical `(visualColumn, visualRow)` cell is
 * drawn as a `2x2` square. Used by both the draw-plan builder and the renderer;
 * the logical canvas size is `wrapColumns * cellSize` × `totalVisualRows *
 * cellSize`. (Cell sizes other than 2 are out of scope — this is a single knob,
 * not a setting.)
 */
export const GLOSSARY_TEXT_MAP_CELL_SIZE = 2;

/** Rough average glyph advance used to turn an editor pixel width into a
 *  column count. A deliberate approximation — no font metrics, no full-width
 *  handling, no CodeMirror wrap reproduction. */
export const GLOSSARY_TEXT_MAP_ESTIMATED_CHAR_WIDTH_PX = 8;

/** Used when the active editor rectangle cannot be measured yet. */
export const GLOSSARY_TEXT_MAP_FALLBACK_WRAP_COLUMNS = 80;

/** Phase 2 hook — Phase 1 always behaves as `"black-white"`. */
export type GlossaryTextMapRenderMode = "black-white" | "tag-color";

export interface ResolveTextMapWrapColumnsInput {
  /**
   * The active editor's rendered rectangle (e.g. from `getBoundingClientRect`)
   * or `null` when it cannot be measured yet.
   */
  editorRect: { width: number } | null;
  /** Defaults to {@link GLOSSARY_TEXT_MAP_ESTIMATED_CHAR_WIDTH_PX}. */
  estimatedCharWidthPx?: number;
  /** Defaults to {@link GLOSSARY_TEXT_MAP_FALLBACK_WRAP_COLUMNS}. */
  fallbackWrapColumns?: number;
}

/**
 * Estimate how many character columns the editor shows per line from its pixel
 * width — `floor(width / estimatedCharWidthPx)`. NEVER pass a pixel width
 * straight through as a raster width. Falls back when the rect is missing or
 * unusable.
 */
export function resolveTextMapWrapColumns(
  input: ResolveTextMapWrapColumnsInput
): number {
  const fallback = Math.max(
    1,
    Math.floor(
      input.fallbackWrapColumns ?? GLOSSARY_TEXT_MAP_FALLBACK_WRAP_COLUMNS
    )
  );
  const charWidth = Math.max(
    1,
    input.estimatedCharWidthPx ?? GLOSSARY_TEXT_MAP_ESTIMATED_CHAR_WIDTH_PX
  );
  const width = input.editorRect ? input.editorRect.width : Number.NaN;

  if (!Number.isFinite(width) || width < charWidth) {
    return fallback;
  }

  return Math.max(1, Math.floor(width / charWidth));
}

export interface TextMapLine {
  lineIndex: number;
  /** UTF-16 offset of the line's first character in the FULL text. */
  startOffset: number;
  /** Character length EXCLUDING the line terminator. */
  length: number;
  /** Visual rows this line occupies after virtual wrap (always `>= 1`). */
  visualRowCount: number;
  /** Absolute visual row of this line's first (unwrapped) row. */
  baseVisualRow: number;
}

export interface TextMapLineLayout {
  lines: TextMapLine[];
  /** Sum of every line's `visualRowCount`. */
  totalVisualRows: number;
}

export interface TextMapVisualPosition {
  offset: number;
  lineIndex: number;
  /** 0-based column within the (unwrapped) line. */
  columnIndex: number;
  visualRow: number;
  visualColumn: number;
}

export interface TextMapCellRect {
  /** Top-left, in LOGICAL pixels (cell grid, `cellSize` applied). */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The logical draw rectangle for a `(visualColumn, visualRow)` cell:
 * `x = visualColumn * cellSize`, `y = visualRow * cellSize`, sized
 * `cellSize x cellSize`. The logical `(visualColumn, visualRow)` meaning is
 * unchanged — only the pixel footprint of each cell.
 */
export function resolveTextMapCellRect(
  visualColumn: number,
  visualRow: number,
  cellSize: number = GLOSSARY_TEXT_MAP_CELL_SIZE
): TextMapCellRect {
  const size = Math.max(1, Math.floor(cellSize));

  return {
    x: Math.floor(visualColumn) * size,
    y: Math.floor(visualRow) * size,
    width: size,
    height: size
  };
}

/** A half-open `[startOffset, endOffset)` span in the FULL text. */
export interface TextMapRange {
  startOffset: number;
  endOffset: number;
}

/**
 * A dialogue span (a `documentMap.dialogueDelimiterPairs` pair's `open`..
 * `close`, brackets included), tagged with the pair's `color` and its index in
 * the pairs array. On an overlap the HIGHER `pairIndex` wins (a later pair is
 * drawn later).
 */
export interface DocumentMapDialogueRange {
  startOffset: number;
  endOffset: number;
  color: string;
  pairIndex: number;
}

/**
 * A Glossary Atom occurrence, tagged with the OWNING Entry and the colour to
 * paint it — the Entry's primary (first-assigned) tag `backgroundRgb`, or the
 * fixed fallback when the Entry has no assigned tag / an unusable colour. The
 * colour is decided per ENTRY, never per Atom.
 */
export interface GlossaryTextMapOccurrence {
  entryId: string;
  startOffset: number;
  endOffset: number;
  color: string;
}

const HIT_COLOR_HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * The colour a Glossary hit drawn for `tag` gets — `tag`'s `backgroundRgb`
 * (or its visibility-adjusted colour from `tagColorCache`), else
 * `fallbackColor` (the `documentMap.glossaryFallbackColor` setting / built-in
 * red). `tag = null` (a tagless Entry, or no selected tag matched) also falls
 * back, and a missing / non-`#rrggbb` value never breaks the Canvas.
 */
function hitColorForTag(
  tag: Pick<GlossaryTag, "id" | "backgroundRgb"> | null,
  fallbackColor: string,
  tagColorCache?: ReadonlyMap<string, string>
): string {
  if (tag) {
    const raw = tagColorCache?.get(tag.id) ?? tag.backgroundRgb;
    if (raw && HIT_COLOR_HEX_PATTERN.test(raw)) {
      return raw;
    }
  }
  return HIT_COLOR_HEX_PATTERN.test(fallbackColor)
    ? fallbackColor
    : GLOSSARY_TEXT_MAP_HIT_COLOR;
}

/**
 * #375: the colour a Glossary hit for `entry` is drawn in when NO render-tag
 * filter is active — the Entry's PRIMARY tag colour (`entry.tags[0]`), else
 * `fallbackColor`. See {@link hitColorForTag} for the cache / fallback rules.
 */
export function resolveGlossaryTextMapHitColor(
  entry: Pick<GlossaryEntry, "tags">,
  fallbackColor: string = GLOSSARY_TEXT_MAP_HIT_COLOR,
  tagColorCache?: ReadonlyMap<string, string>
): string {
  return hitColorForTag(primaryGlossaryTag(entry), fallbackColor, tagColorCache);
}

export interface GlossaryTextMapPixel {
  /** UTF-16 offset of the source character — the editor / occurrence unit. */
  offset: number;
  visualRow: number;
  visualColumn: number;
  /** Cell top-left, in LOGICAL pixels (`visual* * cellSize`). */
  x: number;
  y: number;
  /** `cellSize` — every cell is a `cellSize x cellSize` square. */
  width: number;
  height: number;
  /** Inside a `「…」` dialogue range (PoC). */
  dialogue: boolean;
  /** Inside a Glossary Atom occurrence — takes precedence over `dialogue`. */
  hit: boolean;
  /** Final colour after precedence: hit > dialogue > normal. */
  color: string;
}

export interface GlossaryTextMapPlan {
  /** Logical width = editor-derived wrap columns. */
  wrapColumns: number;
  /** Logical height = total visual rows after wrap. */
  totalVisualRows: number;
  /** Side length of one character cell, in logical pixels. */
  cellSize: number;
  /** `wrapColumns * cellSize` — the logical canvas width in pixels. */
  logicalPixelWidth: number;
  /** `max(1, totalVisualRows) * cellSize` — the logical canvas height. */
  logicalPixelHeight: number;
  lines: TextMapLine[];
  /** One entry per drawn character, in source-offset order (newlines skipped). */
  pixels: GlossaryTextMapPixel[];
  /**
   * The Glossary occurrences the plan was built from — each with its owning
   * `entryId` and resolved primary-tag colour, sorted by `startOffset`.
   */
  occurrences: GlossaryTextMapOccurrence[];
  /**
   * The dialogue ranges the plan was built from — one per pair per `open`..
   * `close` span, carrying the pair's `color` and `pairIndex`.
   */
  dialogues: DocumentMapDialogueRange[];
  /**
   * #375 `tagId -> colour` for every tag on `entries` — the visibility-adjusted
   * colour when `adjustTagColorsForVisibility` is on, else the raw
   * `backgroundRgb`. Built ONCE (per unique tag) and read by the hit-colour
   * resolution; the draw side never converts a colour per pixel.
   */
  tagColorCache: Map<string, string>;
}

/**
 * The editor-viewport "you are here" rectangle, in LOGICAL pixel space (the
 * same space as `plan.pixels`). Drawn AFTER the text / dialogue / hit cells.
 */
export interface TextMapViewportRect {
  /** Always `0` for now — a full-width band. */
  x: number;
  y: number;
  /** `plan.logicalPixelWidth`. */
  width: number;
  /** At least `plan.cellSize`, so a single-row viewport is still visible. */
  height: number;
}

export interface BuildGlossaryTextMapPlanInput {
  text: string;
  entries: readonly GlossaryEntry[];
  /** Editor-derived — see {@link resolveTextMapWrapColumns}. */
  wrapColumns: number;
  /** Defaults to {@link GLOSSARY_TEXT_MAP_CELL_SIZE}. */
  cellSize?: number;
  /**
   * #375 `documentMap.narrationColor` — plain-text / narration colour.
   * Defaults to {@link GLOSSARY_TEXT_MAP_NORMAL_COLOR}.
   */
  narrationColor?: string;
  /**
   * #375 `documentMap.glossaryFallbackColor` — the Glossary-hit colour for an
   * Entry with no primary tag. Defaults to {@link GLOSSARY_TEXT_MAP_HIT_COLOR}.
   */
  glossaryFallbackColor?: string;
  /**
   * #375 `documentMap.dialogueDelimiterPairs`, IN ARRAY ORDER (= draw order; a
   * later pair wins an overlap). Defaults to the single `「…」` blue pair.
   */
  dialogueDelimiterPairs?: readonly DocumentMapDialogueDelimiterPair[];
  /**
   * #375 `documentMap.adjustTagColorsForVisibility` — when `true`, each Glossary
   * tag is drawn in a visibility-adjusted colour (same hue / lightness, fixed
   * saturation), computed ONCE PER TAG into `plan.tagColorCache`. Defaults to
   * `false` here (the caller passes the real setting; omitting it keeps raw tag
   * colours, matching pre-#375 behaviour).
   */
  adjustTagColorsForVisibility?: boolean;
  /**
   * #375 render-tag filter (Document Map "Render tags" multi-select). A PROVIDED
   * array (even `[]`) turns the filter on: only Entries carrying a selected tag
   * are drawn, coloured by the FIRST tag in the Entry's OWN assignment order
   * that is selected; tagless Entries and an empty selection draw nothing.
   * OMITTING it keeps the legacy "All" behaviour. Not persisted anywhere.
   */
  selectedTagIds?: readonly string[];
  /** Phase 2 hook — accepted, unused in Phase 1. */
  renderMode?: GlossaryTextMapRenderMode;
  /** Optional pre-built surface index, to skip rebuilding it per render. */
  surfaceIndex?: GlossarySurfaceIndex;
}

interface LineSpan {
  startOffset: number;
  length: number;
}

/**
 * Split `text` on real line terminators (`\n`, `\r\n`, `\r`), keeping each
 * line's `startOffset` and its length EXCLUDING the terminator. A trailing
 * terminator yields a final empty line; `""` yields a single empty line.
 */
export function splitTextIntoLineSpans(text: string): LineSpan[] {
  const spans: LineSpan[] = [];
  let lineStart = 0;
  let cursor = 0;

  while (cursor < text.length) {
    const character = text[cursor];

    if (character === "\n") {
      spans.push({ startOffset: lineStart, length: cursor - lineStart });
      cursor += 1;
      lineStart = cursor;
    } else if (character === "\r") {
      spans.push({ startOffset: lineStart, length: cursor - lineStart });
      cursor += text[cursor + 1] === "\n" ? 2 : 1;
      lineStart = cursor;
    } else {
      cursor += 1;
    }
  }

  spans.push({ startOffset: lineStart, length: text.length - lineStart });

  return spans;
}

/**
 * Line model with virtual wrap: each line occupies
 * `max(1, ceil(length / wrapColumns))` visual rows, accumulated into
 * `baseVisualRow` / `totalVisualRows`.
 */
export function buildTextMapLineLayout(
  text: string,
  wrapColumns: number
): TextMapLineLayout {
  const safeWrap = Math.max(1, Math.floor(wrapColumns));
  const spans = splitTextIntoLineSpans(text);

  let baseVisualRow = 0;
  const lines: TextMapLine[] = spans.map((span, lineIndex) => {
    const visualRowCount = Math.max(
      1,
      Math.ceil(span.length / safeWrap)
    );
    const line: TextMapLine = {
      lineIndex,
      startOffset: span.startOffset,
      length: span.length,
      visualRowCount,
      baseVisualRow
    };
    baseVisualRow += visualRowCount;
    return line;
  });

  return { lines, totalVisualRows: baseVisualRow };
}

/**
 * Where the character at `offset` lands in the wrapped visual grid, or `null`
 * when `offset` is a line terminator / out of range (terminators are not
 * drawn).
 */
export function mapTextOffsetToVisualPosition(
  offset: number,
  lines: readonly TextMapLine[],
  wrapColumns: number
): TextMapVisualPosition | null {
  const safeWrap = Math.max(1, Math.floor(wrapColumns));

  for (const line of lines) {
    const columnIndex = offset - line.startOffset;

    if (columnIndex < 0 || columnIndex >= line.length) {
      continue;
    }

    return {
      offset,
      lineIndex: line.lineIndex,
      columnIndex,
      visualRow: line.baseVisualRow + Math.floor(columnIndex / safeWrap),
      visualColumn: columnIndex % safeWrap
    };
  }

  return null;
}

/**
 * The absolute visual row that `offset` falls on, clamped into the document.
 * Unlike {@link mapTextOffsetToVisualPosition} this never returns `null` — a
 * line terminator or an out-of-range offset resolves to the nearest real row —
 * so it is safe for the editor-viewport rectangle endpoints.
 */
export function visualRowForOffset(
  offset: number,
  lines: readonly TextMapLine[],
  wrapColumns: number
): number {
  if (lines.length === 0) {
    return 0;
  }

  const safeWrap = Math.max(1, Math.floor(wrapColumns));
  const lastLine = lines[lines.length - 1]!;

  if (offset <= 0) {
    return 0;
  }

  for (const line of lines) {
    const lineEnd = line.startOffset + line.length;

    if (offset <= lineEnd || line === lastLine) {
      const column = Math.max(0, offset - line.startOffset);
      const rowWithinLine = Math.min(
        line.visualRowCount - 1,
        Math.floor(column / safeWrap)
      );
      return line.baseVisualRow + rowWithinLine;
    }
  }

  return lastLine.baseVisualRow + (lastLine.visualRowCount - 1);
}

/**
 * #375 Text Map viewport LENS: turn the editor's on-screen document range into
 * a logical-pixel rectangle over the map (the renderer paints it as a
 * translucent lens with a border). Full width for now (`x = 0`,
 * `width = logicalPixelWidth`); the y-band spans the visual rows of `from`..
 * `to`. Endpoints are clamped into `[0, text length]`, and the resulting
 * rectangle is CLAMPED into the map's own bounds
 * (`0 <= y`, `y + height <= max(cellSize, logicalPixelHeight)`), so a viewport
 * larger than the whole document just covers the whole map. Returns `null` for
 * no range or an empty / inverted range (`to <= from`).
 */
export function buildTextMapViewportRect(
  plan: Pick<
    GlossaryTextMapPlan,
    | "lines"
    | "wrapColumns"
    | "cellSize"
    | "logicalPixelWidth"
    | "logicalPixelHeight"
  >,
  visibleRange: EditorVisibleTextRange | null,
  textLength: number
): TextMapViewportRect | null {
  if (
    !visibleRange ||
    !Number.isFinite(visibleRange.from) ||
    !Number.isFinite(visibleRange.to)
  ) {
    return null;
  }

  const maxOffset = Math.max(0, Math.floor(textLength));
  const from = Math.max(0, Math.min(Math.floor(visibleRange.from), maxOffset));
  const to = Math.max(0, Math.min(Math.floor(visibleRange.to), maxOffset));

  if (to <= from) {
    return null;
  }

  const topRow = visualRowForOffset(from, plan.lines, plan.wrapColumns);
  const bottomRow = visualRowForOffset(
    Math.max(from, to - 1),
    plan.lines,
    plan.wrapColumns
  );

  const mapHeight = Math.max(plan.cellSize, plan.logicalPixelHeight);
  const rawY = Math.min(topRow, bottomRow) * plan.cellSize;
  const rawHeight = Math.max(
    plan.cellSize,
    (Math.abs(bottomRow - topRow) + 1) * plan.cellSize
  );

  // Clamp the lens into the map so it never draws past the top / bottom edge.
  const y = Math.max(0, Math.min(rawY, mapHeight - plan.cellSize));
  const height = Math.max(plan.cellSize, Math.min(rawHeight, mapHeight - y));

  return { x: 0, y, width: plan.logicalPixelWidth, height };
}

/**
 * #375 Document Map click navigation — the INVERSE of the layout: the 0-based
 * SOURCE document line a map visual row belongs to.
 *
 *   - Every visual row of a wrapped source line resolves to that SAME line
 *     (`line.baseVisualRow <= row < line.baseVisualRow + line.visualRowCount`).
 *   - A row past the last visual row clamps to the LAST line (a click in the
 *     sliver below the final wrapped row still navigates somewhere sensible).
 *   - A negative row, or an empty layout, returns `null` (the caller no-ops).
 */
export function resolveTextMapVisualRowToLineIndex(
  visualRow: number,
  lines: readonly TextMapLine[]
): number | null {
  if (lines.length === 0 || !Number.isFinite(visualRow)) {
    return null;
  }

  const row = Math.floor(visualRow);
  if (row < 0) {
    return null;
  }

  for (const line of lines) {
    if (row < line.baseVisualRow + line.visualRowCount) {
      return line.lineIndex;
    }
  }

  return lines[lines.length - 1]!.lineIndex;
}

/**
 * #375 Document Map click navigation — turn a click's Y (in LOGICAL map pixels,
 * i.e. relative to the content-sized canvas host) into a 0-based source line.
 * `mapY / cellSize` is the visual row; `cellSize` MUST be the plan's cell size
 * ({@link GLOSSARY_TEXT_MAP_CELL_SIZE}), not a magic number. Returns `null` for
 * a click above the map / an empty layout / a non-finite input.
 */
export function resolveTextMapClickToLineIndex(params: {
  mapY: number;
  cellSize: number;
  lines: readonly TextMapLine[];
}): number | null {
  const cell = Math.max(1, Math.floor(params.cellSize));

  if (!Number.isFinite(params.mapY) || params.mapY < 0) {
    return null;
  }

  return resolveTextMapVisualRowToLineIndex(
    Math.floor(params.mapY / cell),
    params.lines
  );
}

function occurrencesFromSurfaceIndex(
  text: string,
  index: GlossarySurfaceIndex
): GlossaryOccurrenceRange[] {
  if (text.length === 0) {
    return [];
  }

  return matchGlossarySurfacesInText(text, index)
    .map((match) => ({ start: match.range.start, end: match.range.end }))
    .sort((left, right) => left.start - right.start);
}

/**
 * Every Glossary Atom occurrence range in `text` (`{ start, end }`, `end`
 * exclusive, sorted). Delegates to the shared surface matcher — `matchFlags` /
 * boundary policy / single-character opt-in behave exactly as for the Sidebar
 * jump. No ad-hoc `includes()`.
 */
export function collectGlossaryTextMapOccurrences(
  text: string,
  entries: readonly GlossaryEntry[]
): GlossaryOccurrenceRange[] {
  return occurrencesFromSurfaceIndex(text, buildGlossarySurfaceIndex(entries));
}

/**
 * Every Glossary Atom occurrence in `text`, tagged with its owning Entry and
 * the colour to paint it. When a span matches more than one Entry the first
 * candidate (a deterministic `entryId` / `atomId` sort from the shared matcher)
 * decides the Entry.
 *
 * #375 render-tag filter (`selectedTagIds`):
 *   - `undefined` → legacy "All": every occurrence is kept; a tagged Entry
 *     uses its PRIMARY tag colour, a tagless Entry the `fallbackColor`. (Not
 *     used by the panel any more — kept for callers that pass no filter.)
 *   - a Set (INCLUDING an empty one) → the "Render tags" filter is active:
 *     only occurrences whose Entry has a tag in the Set are kept — coloured by
 *     the FIRST tag in the ENTRY'S OWN assignment order (`entry.tags`) that is
 *     selected, never the selection order. A tagless Entry, an Entry with no
 *     selected tag, and (when the Set is empty) EVERY Entry is dropped. The
 *     `fallbackColor` is not used in this mode.
 */
export function collectGlossaryTextMapGlossaryOccurrences(
  text: string,
  entries: readonly GlossaryEntry[],
  surfaceIndex?: GlossarySurfaceIndex,
  fallbackColor: string = GLOSSARY_TEXT_MAP_HIT_COLOR,
  tagColorCache?: ReadonlyMap<string, string>,
  selectedTagIds?: ReadonlySet<string>
): GlossaryTextMapOccurrence[] {
  if (text.length === 0) {
    return [];
  }

  const index = surfaceIndex ?? buildGlossarySurfaceIndex(entries);
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  // The PRESENCE of the Set (even empty) means the filter is on — an empty
  // selection then draws nothing.
  const filtering = selectedTagIds !== undefined;

  return matchGlossarySurfacesInText(text, index)
    .flatMap((match) => {
      const entryId = match.candidates[0]?.entryId ?? "";
      const entry = entryById.get(entryId);
      const base = {
        entryId,
        startOffset: match.range.start,
        endOffset: match.range.end
      };

      if (!entry) {
        // Defensive: an occurrence with no resolvable Entry only draws in the
        // legacy "All" mode (as a plain fallback hit); the filter drops it.
        return filtering ? [] : [{ ...base, color: fallbackColor }];
      }

      if (filtering) {
        const renderTag = entry.tags.find((tag) =>
          selectedTagIds.has(tag.id)
        );
        if (!renderTag) {
          return [];
        }
        return [
          { ...base, color: hitColorForTag(renderTag, fallbackColor, tagColorCache) }
        ];
      }

      return [
        {
          ...base,
          color: resolveGlossaryTextMapHitColor(
            entry,
            fallbackColor,
            tagColorCache
          )
        }
      ];
    })
    .sort((left, right) => left.startOffset - right.startOffset);
}

/** `true` when `offset` sits inside one of `occurrences` (`start <= o < end`). */
export function isOffsetInGlossaryTextMapOccurrence(
  offset: number,
  occurrences: readonly GlossaryOccurrenceRange[]
): boolean {
  return occurrences.some(
    (range) => offset >= range.start && offset < range.end
  );
}

/**
 * The hit colour for `offset` — the `color` of the (first) occurrence that
 * contains it (`startOffset <= offset < endOffset`), or `null` when `offset`
 * is not a Glossary hit. The shared matcher produces non-overlapping ranges,
 * so "first" is unambiguous.
 */
export function glossaryTextMapHitColorAtOffset(
  offset: number,
  occurrences: readonly GlossaryTextMapOccurrence[]
): string | null {
  const hit = occurrences.find(
    (range) => offset >= range.startOffset && offset < range.endOffset
  );

  return hit ? hit.color : null;
}

/**
 * #375 Text Map dialogue highlight: every `open`..`close` span for ONE
 * delimiter pair, the delimiters INCLUDED. `open` opens a range, the next
 * `close` closes it (inclusive). No nesting; an unclosed `open` runs to the
 * end of the text. `open` / `close` may be multi-character (matched with
 * `startsWith`). Offsets are UTF-16 units. Empty `open` / `close` yields no
 * ranges (guards against an infinite scan).
 */
function collectDocumentMapDialogueRangesForPair(
  text: string,
  pair: DocumentMapDialogueDelimiterPair,
  pairIndex: number
): DocumentMapDialogueRange[] {
  if (pair.open.length === 0 || pair.close.length === 0) {
    return [];
  }

  const ranges: DocumentMapDialogueRange[] = [];
  let startOffset: number | null = null;
  let offset = 0;

  while (offset < text.length) {
    if (startOffset === null) {
      if (text.startsWith(pair.open, offset)) {
        startOffset = offset;
        offset += pair.open.length;
        continue;
      }
      offset += 1;
      continue;
    }

    if (text.startsWith(pair.close, offset)) {
      ranges.push({
        startOffset,
        endOffset: offset + pair.close.length,
        color: pair.color,
        pairIndex
      });
      startOffset = null;
      offset += pair.close.length;
      continue;
    }
    offset += 1;
  }

  if (startOffset !== null) {
    ranges.push({
      startOffset,
      endOffset: text.length,
      color: pair.color,
      pairIndex
    });
  }

  return ranges;
}

/**
 * #375: dialogue ranges for EVERY pair in `pairs`, IN ARRAY ORDER (each range
 * carries its `pairIndex`). Concatenated, not merged — the draw side resolves
 * overlaps with {@link documentMapDialogueColorAtOffset} (higher `pairIndex`
 * wins). An empty `pairs` list yields `[]`.
 */
export function collectDocumentMapDialogueRanges(
  text: string,
  pairs: readonly DocumentMapDialogueDelimiterPair[]
): DocumentMapDialogueRange[] {
  return pairs.flatMap((pair, pairIndex) =>
    collectDocumentMapDialogueRangesForPair(text, pair, pairIndex)
  );
}

/**
 * The colour for `offset` among `ranges` — the `color` of the containing range
 * with the HIGHEST `pairIndex` (a later dialogue pair wins), or `null` when
 * `offset` is not inside any dialogue range.
 */
export function documentMapDialogueColorAtOffset(
  offset: number,
  ranges: readonly DocumentMapDialogueRange[]
): string | null {
  let winner: DocumentMapDialogueRange | null = null;
  for (const range of ranges) {
    if (
      offset >= range.startOffset &&
      offset < range.endOffset &&
      (winner === null || range.pairIndex >= winner.pairIndex)
    ) {
      winner = range;
    }
  }
  return winner ? winner.color : null;
}

/**
 * Back-compat: the default single `「…」` pair's ranges as bare
 * `{ startOffset, endOffset }` spans.
 */
export function collectJapaneseDialogueRanges(text: string): TextMapRange[] {
  return collectDocumentMapDialogueRanges(
    text,
    defaultDocumentMapDialogueDelimiterPairs()
  ).map((range) => ({
    startOffset: range.startOffset,
    endOffset: range.endOffset
  }));
}

/** `true` when `offset` sits inside one of `ranges` (`start <= o < end`). */
export function isOffsetInTextMapRange(
  offset: number,
  ranges: readonly TextMapRange[]
): boolean {
  return ranges.some(
    (range) => offset >= range.startOffset && offset < range.endOffset
  );
}

/**
 * Build the full draw plan. Walks every line, then every column of that line
 * (line terminators are skipped, so `offset` stays aligned with the editor /
 * occurrence unit), placing each character in the wrapped visual grid. Each
 * logical `(visualColumn, visualRow)` cell becomes a `cellSize x cellSize`
 * square in LOGICAL pixel space (`wrapColumns * cellSize` ×
 * `totalVisualRows * cellSize`); the renderer scales that logical canvas into
 * the left pane.
 */
export function buildGlossaryTextMapPlan(
  input: BuildGlossaryTextMapPlanInput
): GlossaryTextMapPlan {
  const wrapColumns = Math.max(1, Math.floor(input.wrapColumns));
  const cellSize = Math.max(
    1,
    Math.floor(input.cellSize ?? GLOSSARY_TEXT_MAP_CELL_SIZE)
  );
  const { text } = input;

  // #375: narration / dialogue-pair / untagged-fallback colours are the
  // "document structure" layer — designed by brightness — and are used AS-IS.
  // Only the Glossary tag colour (the "meaning" layer) is saturation-adjusted,
  // via `tagColorCache` below.
  const narrationColor =
    input.narrationColor ?? GLOSSARY_TEXT_MAP_NORMAL_COLOR;
  const glossaryFallbackColor =
    input.glossaryFallbackColor ?? GLOSSARY_TEXT_MAP_HIT_COLOR;
  const dialoguePairs =
    input.dialogueDelimiterPairs ??
    defaultDocumentMapDialogueDelimiterPairs();

  // #375: one colour per UNIQUE tag on the entries — the visibility adjustment
  // (HSL) happens here, NOT per pixel. `entry.tags[0]` is the primary tag.
  const distinctTags = new Map<string, { id: string; backgroundRgb: string }>();
  for (const entry of input.entries) {
    for (const tag of entry.tags) {
      if (!distinctTags.has(tag.id)) {
        distinctTags.set(tag.id, {
          id: tag.id,
          backgroundRgb: tag.backgroundRgb
        });
      }
    }
  }
  const tagColorCache = buildDocumentMapTagColorCache({
    tags: [...distinctTags.values()],
    adjustTagColorsForVisibility: input.adjustTagColorsForVisibility ?? false
  });

  // #375 render-tag filter. A PROVIDED array (even `[]`) turns the filter on —
  // an empty selection then draws no Glossary hits. Only an OMITTED
  // `selectedTagIds` keeps the legacy "All" behaviour.
  const selectedTagIds =
    input.selectedTagIds === undefined
      ? undefined
      : new Set(input.selectedTagIds);

  const { lines, totalVisualRows } = buildTextMapLineLayout(text, wrapColumns);
  const occurrences = collectGlossaryTextMapGlossaryOccurrences(
    text,
    input.entries,
    input.surfaceIndex,
    glossaryFallbackColor,
    tagColorCache,
    selectedTagIds
  );
  const dialogues = collectDocumentMapDialogueRanges(text, dialoguePairs);

  const pixels: GlossaryTextMapPixel[] = [];

  for (const line of lines) {
    for (let columnIndex = 0; columnIndex < line.length; columnIndex += 1) {
      const offset = line.startOffset + columnIndex;
      const visualColumn = columnIndex % wrapColumns;
      const visualRow =
        line.baseVisualRow + Math.floor(columnIndex / wrapColumns);
      const hitColor = glossaryTextMapHitColorAtOffset(offset, occurrences);
      const hit = hitColor !== null;
      const dialogueColor = documentMapDialogueColorAtOffset(offset, dialogues);
      const dialogue = dialogueColor !== null;
      const rect = resolveTextMapCellRect(visualColumn, visualRow, cellSize);

      pixels.push({
        offset,
        visualRow,
        visualColumn,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        dialogue,
        hit,
        // Precedence: Glossary hit (primary-tag colour / fallback) > dialogue
        // (the winning pair's colour) > narration.
        color: hit
          ? hitColor
          : dialogueColor !== null
            ? dialogueColor
            : narrationColor
      });
    }
  }

  return {
    wrapColumns,
    totalVisualRows,
    cellSize,
    logicalPixelWidth: wrapColumns * cellSize,
    logicalPixelHeight: Math.max(1, totalVisualRows) * cellSize,
    lines,
    pixels,
    occurrences,
    dialogues,
    tagColorCache
  };
}

/** Minimal 2D-context surface the renderer needs — keeps drawing testable. */
export interface GlossaryTextMapDrawContext {
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillStyle: string | CanvasGradient | CanvasPattern;
  /** Disabled by {@link drawGlossaryTextMap} so scaled cells stay crisp. */
  imageSmoothingEnabled?: boolean;
}

function fillPixelsGroupedByColor(
  context: GlossaryTextMapDrawContext,
  pixels: readonly GlossaryTextMapPixel[]
): void {
  const byColor = new Map<string, GlossaryTextMapPixel[]>();
  for (const pixel of pixels) {
    const bucket = byColor.get(pixel.color);
    if (bucket) {
      bucket.push(pixel);
    } else {
      byColor.set(pixel.color, [pixel]);
    }
  }
  for (const [color, group] of byColor) {
    context.fillStyle = color;
    for (const pixel of group) {
      context.fillRect(pixel.x, pixel.y, pixel.width, pixel.height);
    }
  }
}

/**
 * Paint `plan` onto `context` in LOGICAL pixel space
 * (`plan.logicalPixelWidth` × `plan.logicalPixelHeight`). After disabling image
 * smoothing and clearing to transparent, cells are drawn in three passes so the
 * later ones overwrite the earlier ones:
 *   1. NARRATION characters — `documentMap.narrationColor`,
 *   2. DIALOGUE characters (not a Glossary hit) — the winning pair's colour
 *      (a later `dialogueDelimiterPairs` entry wins an overlap),
 *   3. Glossary HIT characters — each in its Entry's primary-tag colour (or
 *      `documentMap.glossaryFallbackColor`), frontmost.
 * Each pass groups its pixels by colour to minimise `fillStyle` churn (dialogue
 * / hit overlaps are already resolved per pixel in `pixel.color`). Every cell
 * is a `cellSize x cellSize` square. Precedence is hit > dialogue > narration.
 * The editor-viewport rectangle is a separate DOM overlay the renderer stacks
 * ON TOP of this canvas, so it always reads last.
 */
export function drawGlossaryTextMap(
  context: GlossaryTextMapDrawContext,
  plan: GlossaryTextMapPlan
): void {
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, plan.logicalPixelWidth, plan.logicalPixelHeight);

  fillPixelsGroupedByColor(
    context,
    plan.pixels.filter((pixel) => !pixel.hit && !pixel.dialogue)
  );
  fillPixelsGroupedByColor(
    context,
    plan.pixels.filter((pixel) => pixel.dialogue && !pixel.hit)
  );
  fillPixelsGroupedByColor(
    context,
    plan.pixels.filter((pixel) => pixel.hit)
  );
}
