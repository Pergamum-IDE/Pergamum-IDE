import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import type { Translate } from "../shared/i18n";
import {
  DOCUMENT_MAP_DEFAULT_VIEWPORT_LENS_OPACITY,
  isValidViewportLensOpacity,
  type DocumentMapSettings
} from "../shared/documentMapSettings";
import type { GlossaryEntry } from "../shared/glossary";
import {
  DOCUMENT_MAP_LENS_DRAG_IDLE,
  advanceDocumentMapLensDrag,
  beginDocumentMapLensDrag,
  endDocumentMapLensDrag,
  hitTestViewportLens,
  resolveDocumentMapLensDragTarget,
  resolveDocumentMapPoint,
  shouldRequestDocumentMapLensDragScroll,
  type DocumentMapLensDragState
} from "./documentMapLensDrag";
import type { EditorVisibleTextRange } from "./editorVisibleRange";
import type { EditorScrollAlign } from "./editorScrollAlign";
import {
  GLOSSARY_DOCUMENT_MAP_CELL_SIZE,
  buildDocumentMapLineLayout,
  buildDocumentMapViewportRect,
  buildGlossaryDocumentMapPlan,
  drawGlossaryDocumentMap,
  resolveDocumentMapClickToLineIndex,
  resolveDocumentMapVisualRowToLineIndex,
  resolveDocumentMapWrapColumns,
  waitForBrowserPaint,
  type DocumentMapPage,
  type GlossaryDocumentMapPlan,
  type GlossaryDocumentMapRenderMode
} from "./glossaryDocumentMap";

function arePlanKeysEqual(
  a: readonly unknown[],
  b: readonly unknown[]
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) {
      return false;
    }
  }
  return true;
}

/**
 * Issue #403 Phase 1 & 2: single-canvas / paged rendering.
 * Natural height is preserved without vertical scale reduction or fit-to-cap.
 * The scroll container (.documentMapBody) handles height overflow.
 */

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
   * carrying a selected tag. See {@link buildGlossaryDocumentMapPlan}.
   */
  selectedTagIds?: readonly string[];
  /**
   * #375: the map resolved a 0-based SOURCE document line and calls this — from
   * a click (`options.align` defaults to `"center"`) or a viewport-lens drag
   * (`{ align: "start" }`). Omitted → the map is neither clickable nor
   * draggable. NAVIGATION only — the handler must not touch the caret /
   * selection / document.
   */
  onNavigateToLine?: (
    lineIndex: number,
    options?: { align?: EditorScrollAlign }
  ) => void;
  /**
   * #403 Phase 2: the currently displayed physical Document Map page.
   * Omitted -> single-page mode (page 0 with full plan height).
   */
  page?: DocumentMapPage;
  /** Phase 2 hook — accepted, unused in Phase 1. */
  renderMode?: GlossaryDocumentMapRenderMode;
  translate: Translate;
}

/**
 * #375 Document Map — line-aware / wrap-aware Canvas. ONE tall canvas whose size is
 * the content size (`logicalPixelWidth` × `totalVisualRows * cellSize`); the
 * parent `.documentMapBody` scrolls it vertically (no virtualization, no partial
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
  page,
  renderMode,
  translate
}: GlossaryTextMinimapCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  // #375 viewport-lens drag. The drag state, the "swallow the next click" flag,
  // and the last line a drag scrolled to all live in refs so a drag never
  // re-renders the map; only the cursor affordance is React state.
  const dragStateRef = useRef<DocumentMapLensDragState>(
    DOCUMENT_MAP_LENS_DRAG_IDLE
  );
  const suppressNextClickRef = useRef(false);
  // Phase 2/3: the source line the current drag has already scrolled the editor
  // to, so a high-frequency pointermove that lands on the SAME line does not
  // re-dispatch the scroll. Reset at the start / end of every drag and on any
  // layout change.
  const lastDragLineRef = useRef<number | null>(null);
  // Phase 3: pointermove fires far faster than the display refreshes, so the
  // drag scroll is coalesced into one call per animation frame. `pendingDrag`
  // holds the latest resolved line waiting for the frame; `dragFrame` is the
  // scheduled `requestAnimationFrame` handle (or `null`).
  const pendingDragLineRef = useRef<number | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const [lensCursor, setLensCursor] = useState<"none" | "grab" | "grabbing">(
    "none"
  );

  const wrapColumns = useMemo(
    () =>
      resolveDocumentMapWrapColumns({
        editorRect: editorWidth === null ? null : { width: editorWidth }
      }),
    [editorWidth]
  );

  // Fast line model: calculates total visual rows and line spans without rasterization.
  const lineLayout = useMemo(
    () => buildDocumentMapLineLayout(text, wrapColumns),
    [text, wrapColumns]
  );

  const contentWidth = wrapColumns * GLOSSARY_DOCUMENT_MAP_CELL_SIZE;
  const contentHeight =
    Math.max(1, lineLayout.totalVisualRows) * GLOSSARY_DOCUMENT_MAP_CELL_SIZE;

  // #403 Phase 2: active physical page (or single full-document page if omitted)
  const activePage: DocumentMapPage = page ?? {
    index: 0,
    startVisualRow: 0,
    endVisualRow: lineLayout.totalVisualRows,
    startLogicalY: 0,
    height: contentHeight
  };

  // Immediate layout-based plan for navigation and viewport lens.
  const layoutPlan = useMemo(
    () => ({
      lines: lineLayout.lines,
      wrapColumns,
      cellSize: GLOSSARY_DOCUMENT_MAP_CELL_SIZE,
      logicalPixelWidth: contentWidth,
      logicalPixelHeight: contentHeight
    }),
    [lineLayout.lines, wrapColumns, contentWidth, contentHeight]
  );

  // Editor-viewport rectangle over the map in canonical global space.
  // Recomputed on scroll WITHOUT touching the canvas (the plan is unchanged).
  const viewportRect = useMemo(
    () => buildDocumentMapViewportRect(layoutPlan, visibleRange, text.length),
    [layoutPlan, visibleRange, text.length]
  );

  // #403 Phase 2: page-local viewport lens rectangle.
  // When the global viewport intersects the active page, compute the local
  // intersection; if the lens is entirely on another page, return null.
  const pageLocalViewportRect = useMemo(() => {
    if (!viewportRect) {
      return null;
    }
    const pageTop = activePage.startLogicalY;
    const pageBottom = activePage.startLogicalY + activePage.height;
    const lensTop = Math.max(viewportRect.y, pageTop);
    const lensBottom = Math.min(
      viewportRect.y + viewportRect.height,
      pageBottom
    );

    if (lensBottom <= lensTop) {
      return null;
    }
    return {
      x: 0,
      y: lensTop - pageTop,
      width: layoutPlan.logicalPixelWidth,
      height: lensBottom - lensTop
    };
  }, [
    viewportRect,
    activePage.startLogicalY,
    activePage.height,
    layoutPlan.logicalPixelWidth
  ]);

  const currentRenderKey = useMemo(
    () =>
      [
        text,
        wrapColumns,
        activePage.index,
        activePage.startVisualRow,
        activePage.endVisualRow,
        activePage.startLogicalY,
        activePage.height,
        documentMapSettings?.narrationColor ?? "",
        documentMapSettings?.glossaryFallbackColor ?? "",
        documentMapSettings?.adjustTagColorsForVisibility ?? false,
        (selectedTagIds ?? []).join(","),
        renderMode ?? "",
        entries
      ] as const,
    [
      text,
      wrapColumns,
      activePage.index,
      activePage.startVisualRow,
      activePage.endVisualRow,
      activePage.startLogicalY,
      activePage.height,
      documentMapSettings,
      selectedTagIds,
      renderMode,
      entries
    ]
  );

  const [renderedKey, setRenderedKey] = useState<readonly unknown[] | null>(null);
  const isPending = !renderedKey || !arePlanKeysEqual(renderedKey, currentRenderKey);

  const planCacheRef = useRef<{
    planKey: readonly unknown[];
    plan: GlossaryDocumentMapPlan;
  } | null>(null);

  const renderGenerationRef = useRef(0);

  // #375: viewport-lens FILL alpha from settings (`0.1`..`0.9`); an
  // absent / out-of-range value falls back to the built-in default.
  const lensFillOpacity = isValidViewportLensOpacity(
    documentMapSettings?.viewportLensOpacity
  )
    ? documentMapSettings!.viewportLensOpacity
    : DOCUMENT_MAP_DEFAULT_VIEWPORT_LENS_OPACITY;

  // The host is content-sized (1 CSS px = 1 logical map px) and lives in a
  // scroll container, so `getBoundingClientRect()` already accounts for the
  // container's scrollTop. `resolveDocumentMapPoint` is the ONE conversion
  // shared by click-to-scroll and lens drag; it returns `null` (never throws)
  // for a detached / unlaid-out host.
  const mapPointFor = (
    event: { clientX: number; clientY: number }
  ): { mapX: number; mapY: number } | null => {
    const host = hostRef.current;
    if (!host) {
      return null;
    }
    return resolveDocumentMapPoint({
      clientX: event.clientX,
      clientY: event.clientY,
      hostRect: host.getBoundingClientRect()
    });
  };

  // #375 / #403: click-to-navigate. Resolve the page-local click's map Y +
  // activePage.startLogicalY into canonical global map Y, then map to source line.
  const handleClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }

    if (!onNavigateToLine) {
      return;
    }

    const point = mapPointFor(event);
    if (!point) {
      return;
    }

    const globalMapY = point.mapY + activePage.startLogicalY;
    const lineIndex = resolveDocumentMapClickToLineIndex({
      mapY: globalMapY,
      cellSize: GLOSSARY_DOCUMENT_MAP_CELL_SIZE,
      lines: layoutPlan.lines
    });

    if (lineIndex !== null) {
      // Click-to-scroll: centre the pointed-at line (unchanged behaviour).
      onNavigateToLine(lineIndex, { align: "center" });
    }
  };

  // #375 / #403: hover detection for the page-local lens.
  const pointerOverLens = (event: {
    clientX: number;
    clientY: number;
  }): boolean => {
    if (!pageLocalViewportRect) {
      return false;
    }
    const point = mapPointFor(event);
    return point
      ? hitTestViewportLens({ ...point, rect: pageLocalViewportRect })
      : false;
  };

  // Phase 3: drop any animation frame the drag has queued and forget the line
  // it was going to scroll to. Safe to call when nothing is pending.
  const cancelPendingDragScroll = (): void => {
    if (
      dragFrameRef.current !== null &&
      typeof cancelAnimationFrame === "function"
    ) {
      cancelAnimationFrame(dragFrameRef.current);
    }
    dragFrameRef.current = null;
    pendingDragLineRef.current = null;
  };

  // Phase 3: run the queued drag scroll. Guarded so a frame that survives the
  // end of a drag (or a layout change) can never scroll: only fires while a
  // `dragging` state is live, and never repeats the last line. Phase 5: the
  // lens top marks the wanted viewport top, so this scroll aligns to `"start"`,
  // NOT `"center"` like click-to-scroll — centring drifts near the doc edges.
  const commitDragScroll = (): void => {
    dragFrameRef.current = null;
    const lineIndex = pendingDragLineRef.current;
    pendingDragLineRef.current = null;

    if (
      lineIndex === null ||
      dragStateRef.current.kind !== "dragging" ||
      lineIndex === lastDragLineRef.current
    ) {
      return;
    }

    lastDragLineRef.current = lineIndex;
    onNavigateToLine?.(lineIndex, { align: "start" });
  };

  // Phase 3: remember the line to scroll to and, if no frame is already
  // pending, schedule one. Successive moves within a frame just overwrite the
  // pending line, so the editor moves at most once per frame. Without
  // `requestAnimationFrame` (SSR / exotic env) fall back to a direct call.
  const scheduleDragScroll = (lineIndex: number): void => {
    pendingDragLineRef.current = lineIndex;

    if (typeof requestAnimationFrame !== "function") {
      commitDragScroll();
      return;
    }
    if (dragFrameRef.current !== null) {
      return;
    }
    dragFrameRef.current = requestAnimationFrame(commitDragScroll);
  };

  // Phase 2/3: translate a `dragging` pointer position into an editor scroll.
  // `grabOffsetY` keeps the grabbed spot under the pointer; the next lens Y is
  // clamped into the map, turned into a visual row, then a 0-based source line.
  // A no-op when the map is not navigable, the layout is not ready, the row
  // does not resolve to a line, or that line was already the drag's target.
  // The actual scroll is coalesced through `scheduleDragScroll`.
  const applyLensDragScroll = (
    grabOffsetY: number,
    event: { clientX: number; clientY: number }
  ): void => {
    if (!onNavigateToLine || !viewportRect) {
      return;
    }

    const point = mapPointFor(event);
    if (!point) {
      return;
    }

    const globalPointerMapY = point.mapY + activePage.startLogicalY;
    const target = resolveDocumentMapLensDragTarget({
      pointerMapY: globalPointerMapY,
      grabOffsetY,
      lensHeight: viewportRect.height,
      mapHeight: layoutPlan.logicalPixelHeight,
      cellSize: layoutPlan.cellSize
    });
    if (!target) {
      return;
    }

    const lineIndex = resolveDocumentMapVisualRowToLineIndex(
      target.targetVisualRow,
      layoutPlan.lines
    );
    if (
      lineIndex === null ||
      !shouldRequestDocumentMapLensDragScroll(lineIndex, lastDragLineRef.current)
    ) {
      return;
    }

    scheduleDragScroll(lineIndex);
  };

  // Phase 3: single teardown path for a drag — from pointerup / pointercancel /
  // lostpointercapture, and from unmount / layout invalidation. Leaves no drag
  // state, no queued frame, no stale target line, and no dangling pointer
  // capture. Never throws.
  const cleanupDrag = (): void => {
    const drag = dragStateRef.current;

    cancelPendingDragScroll();
    lastDragLineRef.current = null;
    dragStateRef.current = DOCUMENT_MAP_LENS_DRAG_IDLE;

    if (drag.kind !== "idle") {
      const host = hostRef.current;
      try {
        if (host?.hasPointerCapture(drag.pointerId)) {
          host.releasePointerCapture(drag.pointerId);
        }
      } catch {
        // Already released / unsupported — nothing to do.
      }
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    // A fresh press starts a fresh interaction — drop any stale suppression.
    suppressNextClickRef.current = false;

    if (event.button !== 0 || !pageLocalViewportRect) {
      return;
    }

    const point = mapPointFor(event);
    if (
      !point ||
      !hitTestViewportLens({ ...point, rect: pageLocalViewportRect })
    ) {
      return;
    }

    dragStateRef.current = beginDocumentMapLensDrag({
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      mapY: point.mapY,
      lensRectY: pageLocalViewportRect.y
    });
    // Fresh gesture: forget the previous drag's target line and any frame that
    // somehow outlived it.
    cancelPendingDragScroll();
    lastDragLineRef.current = null;
    setLensCursor("grabbing");

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A missing / unsupported capture must never break the drag.
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragStateRef.current;

    if (drag.kind === "idle") {
      // Not dragging → just keep the hover cursor in sync.
      setLensCursor(pointerOverLens(event) ? "grab" : "none");
      return;
    }

    if (drag.pointerId !== event.pointerId) {
      return; // ignore a second pointer
    }

    const next = advanceDocumentMapLensDrag(drag, {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY
    });
    dragStateRef.current = next;
    setLensCursor("grabbing");

    // Once past the threshold, every move drives the editor scroll.
    if (next.kind === "dragging") {
      applyLensDragScroll(next.grabOffsetY, event);
    }
  };

  // pointerup / pointercancel. A gesture that began on the lens swallows the
  // browser's follow-up click (`suppressClick`), then `cleanupDrag` tears
  // everything down.
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragStateRef.current;
    if (drag.kind === "idle" || drag.pointerId !== event.pointerId) {
      return;
    }

    const { suppressClick } = endDocumentMapLensDrag(drag, event.pointerId);
    if (suppressClick) {
      suppressNextClickRef.current = true;
    }

    cleanupDrag();
    setLensCursor(pointerOverLens(event) ? "grab" : "none");
  };

  // Capture vanished without a pointerup — an OS gesture, devtools, a tab
  // blur. (`releasePointerCapture` in `cleanupDrag` also fires this, but by
  // then the state is already idle and this no-ops.) Tear the drag down so
  // nothing lingers.
  const handleLostPointerCapture = (
    event: ReactPointerEvent<HTMLDivElement>
  ): void => {
    const drag = dragStateRef.current;
    if (drag.kind === "idle" || drag.pointerId !== event.pointerId) {
      return;
    }

    // Any gesture that began on the lens swallows the browser's follow-up
    // click — same rule as `endDrag`, applied here too so a capture lost
    // mid-`candidate` can't leak a click-to-scroll.
    suppressNextClickRef.current = true;
    cleanupDrag();
    setLensCursor("none");
  };

  const handlePointerLeave = (): void => {
    if (dragStateRef.current.kind === "idle") {
      setLensCursor("none");
    }
  };

  // Unmount: drop any queued drag frame so its callback never runs against a
  // torn-down component. (`*Ref`s are stable, so the first render's closure is
  // fine here.)
  useEffect(() => {
    return () => cancelPendingDragScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The document changed under an in-flight drag (switch / edit) or the map
  // reflowed to a new height (rewrap): the grab offsets and row math no longer
  // match. Abandon the drag and everything queued so a stale frame cannot
  // scroll the fresh document, and drop any pending click-suppression so the
  // first click on the new document is not swallowed. Both deps are primitives
  // and are invariant under editor scroll, so a scroll-only re-render never
  // trips this.
  useEffect(() => {
    suppressNextClickRef.current = false;
    if (dragStateRef.current.kind !== "idle" || dragFrameRef.current !== null) {
      cleanupDrag();
      setLensCursor("none");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, activePage.startLogicalY, activePage.height]);

  useEffect(() => {
    let isCancelled = false;
    renderGenerationRef.current += 1;
    const myGeneration = renderGenerationRef.current;

    async function runRender(): Promise<void> {
      // 1. Yield execution to ensure the committed skeleton placeholder is painted to display
      await waitForBrowserPaint();

      if (isCancelled || myGeneration !== renderGenerationRef.current) {
        return;
      }

      // 2. Obtain full plan (reusing cached plan across pages if plan-level inputs are identical)
      const currentPlanKey = [
        text,
        wrapColumns,
        documentMapSettings?.narrationColor ?? "",
        documentMapSettings?.glossaryFallbackColor ?? "",
        documentMapSettings?.dialogueDelimiterPairs,
        documentMapSettings?.adjustTagColorsForVisibility ?? false,
        (selectedTagIds ?? []).join(","),
        renderMode,
        entries
      ] as const;

      let plan: GlossaryDocumentMapPlan;
      if (
        planCacheRef.current &&
        arePlanKeysEqual(planCacheRef.current.planKey, currentPlanKey)
      ) {
        plan = planCacheRef.current.plan;
      } else {
        plan = buildGlossaryDocumentMapPlan({
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
        });
        planCacheRef.current = { planKey: currentPlanKey, plan };
      }

      if (isCancelled || myGeneration !== renderGenerationRef.current) {
        return;
      }

      // 3. Draw page pixels to Canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const pixelRatio =
          typeof window !== "undefined" && window.devicePixelRatio > 0
            ? window.devicePixelRatio
            : 1;
        const scale = pixelRatio;

        canvas.width = Math.max(1, Math.round(contentWidth * scale));
        canvas.height = Math.max(1, Math.round(activePage.height * scale));

        const context = canvas.getContext("2d");
        if (context) {
          context.imageSmoothingEnabled = false;
          context.setTransform(scale, 0, 0, scale, 0, 0);
          drawGlossaryDocumentMap(context, plan, activePage);
        }
      }

      if (isCancelled || myGeneration !== renderGenerationRef.current) {
        return;
      }

      // 4. Mark active page as rendered, replacing skeleton with Canvas
      setRenderedKey(currentRenderKey);
    }

    runRender();

    return () => {
      isCancelled = true;
    };
  }, [
    currentRenderKey,
    contentWidth,
    activePage,
    text,
    entries,
    wrapColumns,
    documentMapSettings,
    selectedTagIds,
    renderMode
  ]);

  const pixelRatio =
    typeof window !== "undefined" && window.devicePixelRatio > 0
      ? window.devicePixelRatio
      : 1;
  const scale = pixelRatio;

  return (
    <div
      className="glossaryDocumentMapCanvasHost"
      ref={hostRef}
      style={{ width: `${contentWidth}px`, height: `${activePage.height}px` }}
      data-navigable={onNavigateToLine ? true : undefined}
      data-lens-drag={
        lensCursor === "grabbing"
          ? "dragging"
          : lensCursor === "grab"
            ? "hover"
            : undefined
      }
      onClick={onNavigateToLine ? handleClick : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={handleLostPointerCapture}
      onPointerLeave={handlePointerLeave}
    >
      <canvas
        className="glossaryDocumentMapCanvas"
        ref={canvasRef}
        width={Math.max(1, Math.round(contentWidth * scale))}
        height={Math.max(1, Math.round(activePage.height * scale))}
        aria-hidden="true"
      />
      {isPending ? (
        <div className="documentMapSkeleton" aria-busy="true">
          <div className="documentMapSkeletonLines" aria-hidden="true">
            <span className="documentMapSkeletonLine" style={{ inlineSize: "60%" }} />
            <span className="documentMapSkeletonLine" style={{ inlineSize: "85%" }} />
            <span className="documentMapSkeletonLine" style={{ inlineSize: "45%" }} />
            <span className="documentMapSkeletonLine" style={{ inlineSize: "70%" }} />
            <span className="documentMapSkeletonLine" style={{ inlineSize: "55%" }} />
            <span className="documentMapSkeletonLine" style={{ inlineSize: "90%" }} />
            <span className="documentMapSkeletonLine" style={{ inlineSize: "35%" }} />
            <span className="documentMapSkeletonLine" style={{ inlineSize: "80%" }} />
          </div>
          <div className="documentMapSkeletonText">
            {translate("documentMap.rendering")}
          </div>
        </div>
      ) : null}
      {pageLocalViewportRect ? (
        <div
          className="documentMapViewport"
          aria-hidden="true"
          style={
            {
              top: `${pageLocalViewportRect.y}px`,
              height: `${pageLocalViewportRect.height}px`,
              // #375: the lens FILL alpha is settings-driven
              // (`documentMap.viewportLensOpacity`). Border / edge stay CSS.
              "--document-map-viewport-fill": `rgba(255, 255, 255, ${lensFillOpacity})`
            } as CSSProperties
          }
        />
      ) : null}
    </div>
  );
}
