import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type MouseEvent
} from "react";
import {
  DOCUMENT_MAP_DEFAULT_VIEWPORT_LENS_OPACITY,
  isValidViewportLensOpacity,
  type DocumentMapSettings
} from "../shared/documentMapSettings";
import type { GlossaryEntry } from "../shared/glossary";
import type { EditorVisibleTextRange } from "./editorVisibleRange";
import {
  buildGlossaryTextMapPlan,
  buildTextMapViewportRect,
  drawGlossaryTextMap,
  resolveTextMapClickToLineIndex,
  resolveTextMapWrapColumns,
  type GlossaryTextMapRenderMode
} from "./glossaryTextMap";

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
  /**
   * #375 render-tag filter (the panel's "Render tags" multi-select). Empty /
   * omitted = draw every Glossary hit ("All"); non-empty = draw only Entries
   * carrying a selected tag. See {@link buildGlossaryTextMapPlan}.
   */
  selectedTagIds?: readonly string[];
  /**
   * #375: a click on the map resolves to a 0-based SOURCE document line and
   * calls this. Omitted → the map is not clickable. NAVIGATION only — the
   * handler must not touch the caret / selection / document.
   */
  onNavigateToLine?: (lineIndex: number) => void;
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
  onNavigateToLine,
  renderMode
}: GlossaryTextMinimapCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

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

  // #375: viewport-lens FILL alpha from settings (`0.1`..`0.9`); an
  // absent / out-of-range value falls back to the built-in default.
  const lensFillOpacity = isValidViewportLensOpacity(
    documentMapSettings?.viewportLensOpacity
  )
    ? documentMapSettings!.viewportLensOpacity
    : DOCUMENT_MAP_DEFAULT_VIEWPORT_LENS_OPACITY;

  // #375: click-to-navigate. The host is content-sized (1 CSS px = 1 logical
  // map px), so `clientY - hostRect.top` is the logical map Y directly. Resolve
  // it to a source line and hand it to the editor — no caret / selection / doc
  // change. An unresolvable click (above the map, empty layout) is a no-op.
  const handleClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (!onNavigateToLine) {
      return;
    }

    const host = hostRef.current;
    if (!host) {
      return;
    }

    const mapY = event.clientY - host.getBoundingClientRect().top;
    const lineIndex = resolveTextMapClickToLineIndex({
      mapY,
      cellSize: plan.cellSize,
      lines: plan.lines
    });

    if (lineIndex !== null) {
      onNavigateToLine(lineIndex);
    }
  };

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
      ref={hostRef}
      style={{ width: `${contentWidth}px`, height: `${contentHeight}px` }}
      data-navigable={onNavigateToLine ? true : undefined}
      onClick={onNavigateToLine ? handleClick : undefined}
    >
      <canvas
        className="glossaryTextMapCanvas"
        ref={canvasRef}
        aria-hidden="true"
      />
      {viewportRect ? (
        <div
          className="textMapViewport"
          aria-hidden="true"
          style={
            {
              top: `${viewportRect.y}px`,
              height: `${viewportRect.height}px`,
              // #375: the lens FILL alpha is settings-driven
              // (`documentMap.viewportLensOpacity`). Border / edge stay CSS.
              "--text-map-viewport-fill": `rgba(255, 255, 255, ${lensFillOpacity})`
            } as CSSProperties
          }
        />
      ) : null}
    </div>
  );
}
