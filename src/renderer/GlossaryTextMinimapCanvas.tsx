import { useEffect, useMemo, useRef } from "react";
import type { DocumentMapSettings } from "../shared/documentMapSettings";
import type { GlossaryEntry } from "../shared/glossary";
import type { EditorVisibleTextRange } from "./editorVisibleRange";
import {
  buildGlossaryTextMapPlan,
  buildTextMapViewportRect,
  drawGlossaryTextMap,
  resolveTextMapWrapColumns,
  type GlossaryTextMapRenderMode
} from "./glossaryTextMap";

/** Fixed 1px-stroke colour for the editor-viewport rectangle. */
const TEXT_MAP_VIEWPORT_STROKE_COLOR = "#666666";

/**
 * Upper bound on the Canvas BACKING STORE side (px). Real prose stays well
 * under this; only a pathologically long document trips it, and only then is
 * the map uniformly shrunk to fit (still scrollable).
 */
const MAX_CANVAS_BACKING_SIDE = 16384;

interface GlossaryTextMinimapCanvasProps {
  /** The active Markdown document's working text (already known non-empty). */
  text: string;
  /** All project glossary entries — Phase 1 has no tag filter. */
  entries: readonly GlossaryEntry[];
  /**
   * The ACTIVE EDITOR's rendered width, in CSS pixels. Used to ESTIMATE how
   * many character columns a line wraps at — NOT as a pixel raster width.
   * `null` falls back to a safe column count.
   */
  editorWidth: number | null;
  /**
   * The active Markdown editor's on-screen document range → a 1px "you are
   * here" rectangle drawn over the map. `null` → no overlay.
   */
  visibleRange?: EditorVisibleTextRange | null;
  /**
   * #375 `documentMap` settings — narration / glossary-fallback colours and
   * the ordered dialogue delimiter pairs. Omitted → built-in defaults.
   */
  documentMapSettings?: DocumentMapSettings;
  /** Phase 2 hook — accepted, unused in Phase 1. */
  selectedTagIds?: readonly string[];
  /** Phase 2 hook — accepted, unused in Phase 1. */
  renderMode?: GlossaryTextMapRenderMode;
}

/**
 * #375 Text Map — line-aware / wrap-aware Canvas. ONE tall canvas whose size is
 * the content size (`logicalPixelWidth` × `totalVisualRows * cellSize`); the
 * parent `.textMapBody` scrolls it vertically (no virtualization, no partial
 * redraw). A `pointer-events: none` overlay div marks the editor's current
 * viewport; it lives in the scroll content, so it scrolls with the map and
 * only its `top` / `height` change as the editor scrolls.
 */
export function GlossaryTextMinimapCanvas({
  text,
  entries,
  editorWidth,
  visibleRange = null,
  documentMapSettings,
  selectedTagIds,
  renderMode
}: GlossaryTextMinimapCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const wrapColumns = useMemo(
    () =>
      resolveTextMapWrapColumns({
        editorRect: editorWidth === null ? null : { width: editorWidth }
      }),
    [editorWidth]
  );

  // Line-aware / wrap-aware plan in LOGICAL pixel space
  // (`wrapColumns * cellSize` × `totalVisualRows * cellSize`).
  const plan = useMemo(
    () =>
      buildGlossaryTextMapPlan({
        text,
        entries,
        wrapColumns,
        narrationColor: documentMapSettings?.narrationColor,
        glossaryFallbackColor: documentMapSettings?.glossaryFallbackColor,
        dialogueDelimiterPairs: documentMapSettings?.dialogueDelimiterPairs,
        adjustTagColorsForVisibility:
          documentMapSettings?.adjustTagColorsForVisibility,
        selectedTagIds,
        renderMode
      }),
    [
      text,
      entries,
      wrapColumns,
      documentMapSettings,
      selectedTagIds,
      renderMode
    ]
  );

  // Editor-viewport rectangle over the map. Recomputed on scroll WITHOUT
  // touching the canvas (the plan is unchanged).
  const viewportRect = useMemo(
    () => buildTextMapViewportRect(plan, visibleRange, text.length),
    [plan, visibleRange, text.length]
  );

  const contentWidth = plan.logicalPixelWidth;
  const contentHeight = plan.logicalPixelHeight;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const pixelRatio =
      typeof window !== "undefined" && window.devicePixelRatio > 0
        ? window.devicePixelRatio
        : 1;
    // Content height is preserved (the scroll container handles overflow); only
    // a pathologically tall document is uniformly downscaled to fit the cap.
    const fit = Math.min(
      1,
      MAX_CANVAS_BACKING_SIDE / Math.max(1, contentWidth * pixelRatio),
      MAX_CANVAS_BACKING_SIDE / Math.max(1, contentHeight * pixelRatio)
    );
    const scale = pixelRatio * fit;

    canvas.width = Math.max(1, Math.round(contentWidth * scale));
    canvas.height = Math.max(1, Math.round(contentHeight * scale));

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.imageSmoothingEnabled = false;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    drawGlossaryTextMap(context, plan);
  }, [plan, contentWidth, contentHeight]);

  return (
    <div
      className="glossaryTextMapCanvasHost"
      style={{ width: `${contentWidth}px`, height: `${contentHeight}px` }}
    >
      <canvas
        className="glossaryTextMapCanvas"
        ref={canvasRef}
        aria-hidden="true"
      />
      {viewportRect ? (
        <div
          className="textMapViewport"
          style={{
            top: `${viewportRect.y}px`,
            height: `${viewportRect.height}px`,
            borderColor: TEXT_MAP_VIEWPORT_STROKE_COLOR
          }}
        />
      ) : null}
    </div>
  );
}
