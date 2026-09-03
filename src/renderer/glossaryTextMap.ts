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
 * Phase 2+ (NOT here): a tag selector, tag-colour rendering, multi-tag
 * selection, marker hover / click jump, PNG export, and a true CodeMirror wrap
 * reproduction. `selectedTagIds` / `renderMode` are accepted now so the call
 * sites do not change later.
 */

import type { GlossaryEntry } from "../shared/glossary";
import {
  buildGlossarySurfaceIndex,
  matchGlossarySurfacesInText,
  type GlossarySurfaceIndex
} from "../shared/glossarySurfaceMatching";
import type { EditorVisibleTextRange } from "./editorVisibleRange";
import type { GlossaryOccurrenceRange } from "./glossaryOccurrenceNavigation";

/** Phase 1 palette. */
export const GLOSSARY_TEXT_MAP_NORMAL_COLOR = "#000000";
export const GLOSSARY_TEXT_MAP_HIT_COLOR = "#ff0000";
/**
 * Rough Japanese-dialogue highlight (PoC). Characters inside `「…」` (the
 * brackets included) are painted blue, UNDER a Glossary hit. Fixed value — no
 * settings, no other delimiter pairs.
 */
export const GLOSSARY_TEXT_MAP_DIALOGUE_COLOR = "#0000ff";

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
  /** The occurrence ranges the plan was built from (sorted by `start`). */
  occurrences: GlossaryOccurrenceRange[];
  /** The `「…」` dialogue ranges the plan was built from (PoC). */
  dialogues: TextMapRange[];
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
  /** Phase 2 hook — accepted, unused in Phase 1. */
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
 * #375 Text Map viewport overlay: turn the editor's on-screen document range
 * into a logical-pixel rectangle over the map. Full width for now (`x = 0`,
 * `width = logicalPixelWidth`); the y-band spans the visual rows of `from`..
 * `to`. Endpoints are clamped into `[0, text length]`. Returns `null` for no
 * range or an empty / inverted range (`to <= from`).
 */
export function buildTextMapViewportRect(
  plan: Pick<
    GlossaryTextMapPlan,
    "lines" | "wrapColumns" | "cellSize" | "logicalPixelWidth"
  >,
  visibleRange: EditorVisibleTextRange | null,
  textLength: number
): TextMapViewportRect | null {
  if (!visibleRange) {
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
  const y = Math.min(topRow, bottomRow) * plan.cellSize;
  const height = Math.max(
    plan.cellSize,
    (Math.abs(bottomRow - topRow) + 1) * plan.cellSize
  );

  return { x: 0, y, width: plan.logicalPixelWidth, height };
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
 * Every Glossary Atom occurrence in `text`, across ALL entries / atoms (Phase 1
 * has no tag filter). Delegates to the shared surface matcher, so `matchFlags`
 * / boundary policy / single-character opt-in behave exactly as they do for the
 * Sidebar jump. Ranges are `{ start, end }` UTF-16 offsets, `end` exclusive,
 * sorted by `start`.
 */
export function collectGlossaryTextMapOccurrences(
  text: string,
  entries: readonly GlossaryEntry[]
): GlossaryOccurrenceRange[] {
  return occurrencesFromSurfaceIndex(text, buildGlossarySurfaceIndex(entries));
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
 * #375 Text Map dialogue highlight (PoC): every `「…」` span in `text`, the
 * brackets INCLUDED. `「` opens a range, the next `」` closes it (inclusive).
 * No nesting, no `『』`, no `" "` — an unclosed `「` runs to the end of the
 * text. Offsets are UTF-16 units, matching the editor / occurrence unit.
 */
export function collectJapaneseDialogueRanges(text: string): TextMapRange[] {
  const ranges: TextMapRange[] = [];
  let startOffset: number | null = null;

  for (let offset = 0; offset < text.length; offset += 1) {
    const character = text[offset];

    if (character === "「" && startOffset === null) {
      startOffset = offset;
      continue;
    }

    if (character === "」" && startOffset !== null) {
      ranges.push({ startOffset, endOffset: offset + 1 });
      startOffset = null;
    }
  }

  if (startOffset !== null) {
    ranges.push({ startOffset, endOffset: text.length });
  }

  return ranges;
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

  const { lines, totalVisualRows } = buildTextMapLineLayout(text, wrapColumns);
  const occurrences = input.surfaceIndex
    ? occurrencesFromSurfaceIndex(text, input.surfaceIndex)
    : collectGlossaryTextMapOccurrences(text, input.entries);
  const dialogues = collectJapaneseDialogueRanges(text);

  const pixels: GlossaryTextMapPixel[] = [];

  for (const line of lines) {
    for (let columnIndex = 0; columnIndex < line.length; columnIndex += 1) {
      const offset = line.startOffset + columnIndex;
      const visualColumn = columnIndex % wrapColumns;
      const visualRow =
        line.baseVisualRow + Math.floor(columnIndex / wrapColumns);
      const hit = isOffsetInGlossaryTextMapOccurrence(offset, occurrences);
      const dialogue = isOffsetInTextMapRange(offset, dialogues);
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
        // Precedence: Glossary hit > dialogue > normal.
        color: hit
          ? GLOSSARY_TEXT_MAP_HIT_COLOR
          : dialogue
            ? GLOSSARY_TEXT_MAP_DIALOGUE_COLOR
            : GLOSSARY_TEXT_MAP_NORMAL_COLOR
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
    dialogues
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

/**
 * Paint `plan` onto `context` in LOGICAL pixel space
 * (`plan.logicalPixelWidth` × `plan.logicalPixelHeight`). After disabling image
 * smoothing and clearing to transparent, cells are drawn in three passes so the
 * later ones overwrite the earlier ones:
 *   1. NORMAL characters  — black,
 *   2. DIALOGUE characters (`「…」`, not a Glossary hit) — blue,
 *   3. Glossary HIT characters — the hit colour, frontmost.
 * Every cell is a `cellSize x cellSize` square. Overlapping ranges need no
 * special handling — precedence is hit > dialogue > normal.
 */
export function drawGlossaryTextMap(
  context: GlossaryTextMapDrawContext,
  plan: GlossaryTextMapPlan
): void {
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, plan.logicalPixelWidth, plan.logicalPixelHeight);

  context.fillStyle = GLOSSARY_TEXT_MAP_NORMAL_COLOR;
  for (const pixel of plan.pixels) {
    if (!pixel.hit && !pixel.dialogue) {
      context.fillRect(pixel.x, pixel.y, pixel.width, pixel.height);
    }
  }

  context.fillStyle = GLOSSARY_TEXT_MAP_DIALOGUE_COLOR;
  for (const pixel of plan.pixels) {
    if (pixel.dialogue && !pixel.hit) {
      context.fillRect(pixel.x, pixel.y, pixel.width, pixel.height);
    }
  }

  context.fillStyle = GLOSSARY_TEXT_MAP_HIT_COLOR;
  for (const pixel of plan.pixels) {
    if (pixel.hit) {
      context.fillRect(pixel.x, pixel.y, pixel.width, pixel.height);
    }
  }
}
