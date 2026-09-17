/**
 * #503 Preview Scroll Sync Foundation.
 *
 * Provides axis-driven preview scroll synchronization helpers supporting both
 * vertical (`scrollTop`) and horizontal (`scrollLeft`) scroll axes, as well as
 * CodeMirror source-position / block-level anchor-based scroll synchronization.
 */

export type PreviewScrollAxis = "vertical" | "horizontal";

export interface PreviewScrollTarget {
  scrollTop: number;
  scrollLeft: number;
  scrollHeight: number;
  scrollWidth: number;
  clientHeight: number;
  clientWidth: number;
}

export interface PreviewAnchor {
  /** 1-based source line number in Markdown document */
  line: number;
  /** Scroll offset of anchor element relative to preview scroll container */
  offset: number;
}

export interface EditorScrollSyncAdapter {
  readonly scroller: HTMLElement;
  /** Returns the 1-based source line currently at the top of the editor viewport. */
  getTopSourceLine(): number | null;
  /** Scrolls the editor to a 1-based source line number without moving caret/selection. */
  scrollToSourceLine(line: number): void;
}

export interface PreviewScrollSyncDebugDetails {
  editorScrollTop: number;
  editorMaxScrollTop: number;
  editorTopSourceLine: number | null;
  previewAnchorCount: number;
  firstPreviewAnchorLine: number | null;
  lastPreviewAnchorLine: number | null;
  selectedPrevAnchorLine: number | null;
  selectedNextAnchorLine: number | null;
  selectedPrevAnchorOffset: number | null;
  selectedNextAnchorOffset: number | null;
  rawComputedPreviewTargetOffset: number;
  clampedPreviewTargetOffset: number;
  computedPreviewTargetOffset: number;
  actualPreviewScrollTop: number;
  previousAnchorLine?: number | null;
  nextAnchorLine?: number | null;
  previousAnchorLiveOffset?: number | null;
  nextAnchorLiveOffset?: number | null;
  rawTargetOffset?: number;
  clampedTargetOffset?: number;
  usedLiveMeasurement?: boolean;
  usedCachedPixelOffset?: boolean;
  previousAnchorConnected?: boolean;
  nextAnchorConnected?: boolean;
  previousAnchorRectTop?: number | null;
  previewContainerRectTop?: number | null;
  previewContainerIsConnected?: boolean;
  blockMapBuildId?: number;
  blockMapReason?: string;
  measurementFailed?: boolean;
  skipReason?: string;
}

let lastDebugDetails: PreviewScrollSyncDebugDetails | null = null;

export function getLastPreviewScrollSyncDebugDetails(): PreviewScrollSyncDebugDetails | null {
  return lastDebugDetails;
}

/**
 * Returns the scroll offset along the specified axis.
 */
export function getScrollOffset(
  target: PreviewScrollTarget,
  axis: PreviewScrollAxis
): number {
  return axis === "vertical" ? target.scrollTop : target.scrollLeft;
}

/**
 * Sets the scroll offset along the specified axis without modifying the orthogonal axis.
 */
export function setScrollOffset(
  target: PreviewScrollTarget,
  axis: PreviewScrollAxis,
  value: number
): void {
  const safeValue = Math.max(0, Number.isNaN(value) ? 0 : value);
  if (axis === "vertical") {
    target.scrollTop = safeValue;
  } else {
    target.scrollLeft = safeValue;
  }
}

/**
 * Calculates the maximum scrollable range along the specified axis.
 */
export function getMaxScroll(
  target: PreviewScrollTarget,
  axis: PreviewScrollAxis
): number {
  const max =
    axis === "vertical"
      ? target.scrollHeight - target.clientHeight
      : target.scrollWidth - target.clientWidth;
  return Math.max(0, Number.isNaN(max) ? 0 : max);
}

/**
 * Returns the current scroll ratio (0.0 to 1.0) along the specified axis.
 */
export function getScrollRatio(
  target: PreviewScrollTarget,
  axis: PreviewScrollAxis
): number {
  const max = getMaxScroll(target, axis);
  if (max <= 0) {
    return 0;
  }
  const current = getScrollOffset(target, axis);
  const ratio = current / max;
  return Math.min(1, Math.max(0, Number.isNaN(ratio) ? 0 : ratio));
}

/**
 * Sets the scroll position on the target along the specified axis from a ratio (0.0 to 1.0).
 */
export function setScrollRatio(
  target: PreviewScrollTarget,
  axis: PreviewScrollAxis,
  ratio: number
): void {
  const safeRatio = Math.min(1, Math.max(0, Number.isNaN(ratio) ? 0 : ratio));
  const max = getMaxScroll(target, axis);
  const targetOffset = safeRatio * max;
  setScrollOffset(target, axis, targetOffset);
}

export type ScrollSyncSide = "editor" | "preview";

export interface SyncPreviewScrollOptions {
  source: PreviewScrollTarget;
  sourceAxis: PreviewScrollAxis;
  target: PreviewScrollTarget;
  targetAxis: PreviewScrollAxis;
  guard?: ScrollSyncGuard;
  targetSide?: ScrollSyncSide;
}

/**
 * Synchronizes the scroll position from `source` along `sourceAxis` to `target` along `targetAxis`.
 */
export function syncPreviewScroll(options: SyncPreviewScrollOptions): void {
  const ratio = getScrollRatio(options.source, options.sourceAxis);
  const targetMax = getMaxScroll(options.target, options.targetAxis);
  const targetOffset = ratio * targetMax;
  if (options.guard && options.targetSide) {
    options.guard.runProgrammaticScroll(
      options.targetSide,
      options.target,
      options.targetAxis,
      targetOffset
    );
  } else {
    setScrollRatio(options.target, options.targetAxis, ratio);
  }
}

/**
 * Collects block-level source-line anchors from a preview container element.
 * Called once after preview DOM rendering/updates — NEVER per scroll event.
 */
export function collectPreviewAnchors(
  container: HTMLElement,
  axis: PreviewScrollAxis
): PreviewAnchor[] {
  const nodes = container.querySelectorAll("[data-source-line]");
  const anchors: PreviewAnchor[] = [];

  const containerRect = container.getBoundingClientRect();
  const currentScrollOffset = getScrollOffset(container, axis);

  for (let i = 0; i < nodes.length; i += 1) {
    const el = nodes[i] as HTMLElement;
    const lineAttr = el.getAttribute("data-source-line");
    if (!lineAttr) {
      continue;
    }
    const line = parseInt(lineAttr, 10);
    if (Number.isNaN(line) || line < 1) {
      continue;
    }

    const elRect = el.getBoundingClientRect();
    const relativeOffset =
      axis === "vertical"
        ? elRect.top - containerRect.top + currentScrollOffset
        : elRect.left - containerRect.left + currentScrollOffset;

    anchors.push({
      line,
      offset: Math.max(0, relativeOffset)
    });
  }

  anchors.sort((a, b) => (a.line !== b.line ? a.line - b.line : a.offset - b.offset));

  return anchors;
}

/**
 * Performs a binary search over a sorted array of `PreviewAnchor` items
 * to locate the immediate previous and next surrounding anchors for `targetValue`.
 */
export interface PreviewBlockRef {
  /** 1-based source line number in Markdown document */
  line: number;
  /** Live DOM Element reference */
  element: Element;
}

/**
 * Builds a structural block map caching DOM element references only.
 * Rebuilt only when preview HTML regenerates or preview container remounts.
 * NEVER stores pixel offsets, bounding rects, or scrollTop-derived positions.
 */
export type BlockMapBuildReason =
  | "initialRender"
  | "htmlRegenerated"
  | "remount"
  | "staleRefDetected";

let globalBlockMapBuildId = 0;

export interface PreviewBlockMapResult {
  blocks: PreviewBlockRef[];
  buildId: number;
  reason: BlockMapBuildReason;
}

export function getCurrentBlockMapBuildId(): number {
  return globalBlockMapBuildId;
}

/**
 * Builds a structural block map caching DOM element references only.
 * Rebuilt only when preview HTML regenerates or preview container remounts.
 * NEVER stores pixel offsets, bounding rects, or scrollTop-derived positions.
 */
export function collectPreviewBlockRefs(
  container: HTMLElement,
  reason: BlockMapBuildReason = "initialRender"
): PreviewBlockMapResult {
  globalBlockMapBuildId += 1;
  const buildId = globalBlockMapBuildId;
  const nodes = container.querySelectorAll("[data-source-line]");
  const blocks: PreviewBlockRef[] = [];

  for (let i = 0; i < nodes.length; i += 1) {
    const el = nodes[i];
    const lineAttr = el.getAttribute("data-source-line");
    if (!lineAttr) {
      continue;
    }
    const line = parseInt(lineAttr, 10);
    if (Number.isNaN(line) || line < 1) {
      continue;
    }

    blocks.push({ line, element: el });
  }

  blocks.sort((a, b) => a.line - b.line);

  return { blocks, buildId, reason };
}

/**
 * Performs binary search over sorted `PreviewBlockRef` items by source line.
 */
export function findSurroundingBlockRefs(
  blocks: readonly PreviewBlockRef[],
  targetLine: number
): { prev: PreviewBlockRef | null; next: PreviewBlockRef | null } {
  if (blocks.length === 0) {
    return { prev: null, next: null };
  }

  let low = 0;
  let high = blocks.length - 1;

  if (targetLine < blocks[0].line) {
    return { prev: null, next: blocks[0] };
  }
  if (targetLine > blocks[high].line) {
    return { prev: blocks[high], next: null };
  }

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const midLine = blocks[mid].line;

    if (midLine === targetLine) {
      return { prev: blocks[mid], next: blocks[mid] };
    } else if (midLine < targetLine) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return {
    prev: high >= 0 ? blocks[high] : null,
    next: low < blocks.length ? blocks[low] : null
  };
}

/**
 * Live-measures a block element's current scroll offset relative to `container`
 * using getBoundingClientRect() at sync time.
 */
export function getLiveElementOffset(
  element: Element,
  container: HTMLElement,
  axis: PreviewScrollAxis = "vertical"
): number {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  const currentScroll = getScrollOffset(container, axis);
  const relativeOffset =
    axis === "vertical"
      ? elementRect.top - containerRect.top + currentScroll
      : elementRect.left - containerRect.left + currentScroll;

  return Math.max(0, relativeOffset);
}

export interface SyncPreviewScrollWithBlocksOptions {
  source: PreviewScrollTarget;
  sourceAxis: PreviewScrollAxis;
  sourcePosition: { line?: number | null; offset?: number };
  target: HTMLElement;
  targetAxis: PreviewScrollAxis;
  blocks: readonly PreviewBlockRef[];
  guard?: ScrollSyncGuard;
  targetSide?: ScrollSyncSide;
  isEditorAtEnd?: boolean;
  onBlockMapRebuilt?: (result: PreviewBlockMapResult) => void;
}

/**
 * Synchronizes scroll position using live-measured block element offsets,
 * binary search, and linear interpolation between surrounding anchors.
 */
export function syncPreviewScrollWithBlocks(
  options: SyncPreviewScrollWithBlocksOptions
): void {
  const {
    source,
    sourceAxis,
    sourcePosition,
    target,
    targetAxis,
    guard,
    targetSide,
    isEditorAtEnd,
    onBlockMapRebuilt
  } = options;
  let blocks = options.blocks;

  const applyTargetOffset = (offset: number) => {
    if (guard && targetSide) {
      guard.runProgrammaticScroll(targetSide, target, targetAxis, offset);
    } else {
      setScrollOffset(target, targetAxis, offset);
    }
  };

  const targetMax = getMaxScroll(target, targetAxis);

  if (!target.isConnected) {
    lastDebugDetails = {
      editorScrollTop: getScrollOffset(source, sourceAxis),
      editorMaxScrollTop: getMaxScroll(source, sourceAxis),
      editorTopSourceLine: sourcePosition.line ?? null,
      previewAnchorCount: blocks.length,
      firstPreviewAnchorLine: blocks[0]?.line ?? null,
      lastPreviewAnchorLine: blocks[blocks.length - 1]?.line ?? null,
      selectedPrevAnchorLine: null,
      selectedNextAnchorLine: null,
      selectedPrevAnchorOffset: null,
      selectedNextAnchorOffset: null,
      previousAnchorLine: null,
      nextAnchorLine: null,
      previousAnchorLiveOffset: null,
      nextAnchorLiveOffset: null,
      previousAnchorConnected: false,
      nextAnchorConnected: false,
      previousAnchorRectTop: null,
      previewContainerRectTop: null,
      previewContainerIsConnected: false,
      blockMapBuildId: globalBlockMapBuildId,
      rawComputedPreviewTargetOffset: 0,
      clampedPreviewTargetOffset: 0,
      rawTargetOffset: 0,
      clampedTargetOffset: 0,
      computedPreviewTargetOffset: 0,
      actualPreviewScrollTop: getScrollOffset(target, targetAxis),
      usedLiveMeasurement: false,
      usedCachedPixelOffset: false,
      measurementFailed: true,
      skipReason: "container_not_connected"
    };
    return;
  }

  if (blocks.length === 0) {
    const nodes = target.querySelectorAll("[data-source-line]");
    if (nodes.length > 0) {
      const rebuilt = collectPreviewBlockRefs(target, "staleRefDetected");
      onBlockMapRebuilt?.(rebuilt);
      blocks = rebuilt.blocks;
    }
  }

  if (blocks.length === 0) {
    syncPreviewScroll({ source, sourceAxis, target, targetAxis, guard, targetSide });
    lastDebugDetails = null;
    return;
  }

  if (targetMax <= 0) {
    applyTargetOffset(0);
    lastDebugDetails = null;
    return;
  }

  // Requirement 5: Explicit max scroll when editor is at end
  if (isEditorAtEnd) {
    applyTargetOffset(targetMax);
    const containerRectTop = target.getBoundingClientRect().top;
    lastDebugDetails = {
      editorScrollTop: getScrollOffset(source, sourceAxis),
      editorMaxScrollTop: getMaxScroll(source, sourceAxis),
      editorTopSourceLine: sourcePosition.line ?? null,
      previewAnchorCount: blocks.length,
      firstPreviewAnchorLine: blocks[0]?.line ?? null,
      lastPreviewAnchorLine: blocks[blocks.length - 1]?.line ?? null,
      selectedPrevAnchorLine: blocks[blocks.length - 1]?.line ?? null,
      selectedNextAnchorLine: null,
      selectedPrevAnchorOffset: targetMax,
      selectedNextAnchorOffset: null,
      previousAnchorLine: blocks[blocks.length - 1]?.line ?? null,
      nextAnchorLine: null,
      previousAnchorLiveOffset: targetMax,
      nextAnchorLiveOffset: null,
      previousAnchorConnected: blocks[blocks.length - 1]?.element.isConnected ?? true,
      nextAnchorConnected: true,
      previousAnchorRectTop: null,
      previewContainerRectTop: containerRectTop,
      previewContainerIsConnected: target.isConnected,
      blockMapBuildId: globalBlockMapBuildId,
      rawComputedPreviewTargetOffset: targetMax,
      clampedPreviewTargetOffset: targetMax,
      rawTargetOffset: targetMax,
      clampedTargetOffset: targetMax,
      computedPreviewTargetOffset: targetMax,
      actualPreviewScrollTop: getScrollOffset(target, targetAxis),
      usedLiveMeasurement: true,
      usedCachedPixelOffset: false,
      measurementFailed: false
    };
    return;
  }

  let rawOffset = 0;
  let selectedPrev: PreviewBlockRef | null = null;
  let selectedNext: PreviewBlockRef | null = null;
  let prevLiveOffset: number | null = null;
  let nextLiveOffset: number | null = null;

  if (typeof sourcePosition.line === "number" && !Number.isNaN(sourcePosition.line)) {
    const targetLine = sourcePosition.line;
    let { prev, next } = findSurroundingBlockRefs(blocks, targetLine);

    const isStale =
      (prev !== null && !prev.element.isConnected) ||
      (next !== null && !next.element.isConnected);

    if (isStale) {
      const rebuilt = collectPreviewBlockRefs(target, "staleRefDetected");
      onBlockMapRebuilt?.(rebuilt);
      blocks = rebuilt.blocks;
      const retried = findSurroundingBlockRefs(blocks, targetLine);
      prev = retried.prev;
      next = retried.next;
    }

    selectedPrev = prev;
    selectedNext = next;

    const prevConnected = prev ? prev.element.isConnected : true;
    const nextConnected = next ? next.element.isConnected : true;
    const prevRectTop = prev ? prev.element.getBoundingClientRect().top : null;
    const containerRectTop = target.getBoundingClientRect().top;

    const measurementFailed =
      (prev !== null && !prevConnected) ||
      (next !== null && !nextConnected);

    if (measurementFailed) {
      lastDebugDetails = {
        editorScrollTop: getScrollOffset(source, sourceAxis),
        editorMaxScrollTop: getMaxScroll(source, sourceAxis),
        editorTopSourceLine: targetLine,
        previewAnchorCount: blocks.length,
        firstPreviewAnchorLine: blocks[0]?.line ?? null,
        lastPreviewAnchorLine: blocks[blocks.length - 1]?.line ?? null,
        selectedPrevAnchorLine: selectedPrev?.line ?? null,
        selectedNextAnchorLine: selectedNext?.line ?? null,
        selectedPrevAnchorOffset: null,
        selectedNextAnchorOffset: null,
        previousAnchorLine: selectedPrev?.line ?? null,
        nextAnchorLine: selectedNext?.line ?? null,
        previousAnchorLiveOffset: null,
        nextAnchorLiveOffset: null,
        previousAnchorConnected: prevConnected,
        nextAnchorConnected: nextConnected,
        previousAnchorRectTop: prevRectTop,
        previewContainerRectTop: containerRectTop,
        previewContainerIsConnected: target.isConnected,
        blockMapBuildId: globalBlockMapBuildId,
        rawComputedPreviewTargetOffset: 0,
        clampedPreviewTargetOffset: 0,
        rawTargetOffset: 0,
        clampedTargetOffset: 0,
        computedPreviewTargetOffset: 0,
        actualPreviewScrollTop: getScrollOffset(target, targetAxis),
        usedLiveMeasurement: false,
        usedCachedPixelOffset: false,
        measurementFailed: true,
        skipReason: "stale_anchor_ref_disconnected"
      };
      return;
    }

    if (prev && next) {
      prevLiveOffset = getLiveElementOffset(prev.element, target, targetAxis);
      if (prev === next || prev.line === next.line) {
        nextLiveOffset = prevLiveOffset;
        rawOffset = prevLiveOffset;
      } else {
        nextLiveOffset = getLiveElementOffset(next.element, target, targetAxis);
        const fraction = (targetLine - prev.line) / (next.line - prev.line);
        rawOffset = prevLiveOffset + fraction * (nextLiveOffset - prevLiveOffset);
      }
    } else if (prev && !next) {
      prevLiveOffset = getLiveElementOffset(prev.element, target, targetAxis);
      rawOffset = targetMax;
    } else {
      if (next) {
        nextLiveOffset = getLiveElementOffset(next.element, target, targetAxis);
      }
      rawOffset = 0;
    }

    const clampedOffset = Math.min(targetMax, Math.max(0, rawOffset));
    applyTargetOffset(clampedOffset);

    lastDebugDetails = {
      editorScrollTop: getScrollOffset(source, sourceAxis),
      editorMaxScrollTop: getMaxScroll(source, sourceAxis),
      editorTopSourceLine: targetLine,
      previewAnchorCount: blocks.length,
      firstPreviewAnchorLine: blocks[0]?.line ?? null,
      lastPreviewAnchorLine: blocks[blocks.length - 1]?.line ?? null,
      selectedPrevAnchorLine: selectedPrev?.line ?? null,
      selectedNextAnchorLine: selectedNext?.line ?? null,
      selectedPrevAnchorOffset: prevLiveOffset,
      selectedNextAnchorOffset: nextLiveOffset,
      previousAnchorLine: selectedPrev?.line ?? null,
      nextAnchorLine: selectedNext?.line ?? null,
      previousAnchorLiveOffset: prevLiveOffset,
      nextAnchorLiveOffset: nextLiveOffset,
      previousAnchorConnected: prevConnected,
      nextAnchorConnected: nextConnected,
      previousAnchorRectTop: prevRectTop,
      previewContainerRectTop: containerRectTop,
      previewContainerIsConnected: target.isConnected,
      blockMapBuildId: globalBlockMapBuildId,
      rawComputedPreviewTargetOffset: rawOffset,
      clampedPreviewTargetOffset: clampedOffset,
      rawTargetOffset: rawOffset,
      clampedTargetOffset: clampedOffset,
      computedPreviewTargetOffset: clampedOffset,
      actualPreviewScrollTop: getScrollOffset(target, targetAxis),
      usedLiveMeasurement: true,
      usedCachedPixelOffset: false,
      measurementFailed: false
    };
  }
}

export function findSurroundingAnchors(
  anchors: readonly PreviewAnchor[],
  targetValue: number,
  key: "line" | "offset"
): { prev: PreviewAnchor | null; next: PreviewAnchor | null } {
  if (anchors.length === 0) {
    return { prev: null, next: null };
  }

  let low = 0;
  let high = anchors.length - 1;

  if (targetValue < anchors[0][key]) {
    return { prev: null, next: anchors[0] };
  }
  if (targetValue > anchors[high][key]) {
    return { prev: anchors[high], next: null };
  }

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const midValue = anchors[mid][key];

    if (midValue === targetValue) {
      return { prev: anchors[mid], next: anchors[mid] };
    } else if (midValue < targetValue) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return {
    prev: high >= 0 ? anchors[high] : null,
    next: low < anchors.length ? anchors[low] : null
  };
}

export interface SyncPreviewScrollWithAnchorsOptions {
  source: PreviewScrollTarget;
  sourceAxis: PreviewScrollAxis;
  sourcePosition: { line?: number | null; offset?: number };
  target: PreviewScrollTarget;
  targetAxis: PreviewScrollAxis;
  anchors: readonly PreviewAnchor[];
  guard?: ScrollSyncGuard;
  targetSide?: ScrollSyncSide;
}

/**
 * Synchronizes scroll position using cached anchor metadata when available,
 * with binary search lookup and linear interpolation, falling back to ratio sync.
 */
export function syncPreviewScrollWithAnchors(
  options: SyncPreviewScrollWithAnchorsOptions
): void {
  const { source, sourceAxis, sourcePosition, target, targetAxis, anchors, guard, targetSide } = options;

  const applyTargetOffset = (offset: number) => {
    if (guard && targetSide) {
      guard.runProgrammaticScroll(targetSide, target, targetAxis, offset);
    } else {
      setScrollOffset(target, targetAxis, offset);
    }
  };

  if (anchors.length === 0) {
    syncPreviewScroll({ source, sourceAxis, target, targetAxis, guard, targetSide });
    lastDebugDetails = null;
    return;
  }

  const targetMax = getMaxScroll(target, targetAxis);
  if (targetMax <= 0) {
    applyTargetOffset(0);
    lastDebugDetails = null;
    return;
  }

  let computedOffset = 0;
  let selectedPrev: PreviewAnchor | null = null;
  let selectedNext: PreviewAnchor | null = null;

  // 1. Line-based lookup (e.g. Editor -> Preview)
  if (typeof sourcePosition.line === "number" && !Number.isNaN(sourcePosition.line)) {
    const targetLine = sourcePosition.line;
    const { prev, next } = findSurroundingAnchors(anchors, targetLine, "line");
    selectedPrev = prev;
    selectedNext = next;

    if (prev && next) {
      if (prev === next || prev.line === next.line) {
        computedOffset = prev.offset;
      } else {
        const fraction = (targetLine - prev.line) / (next.line - prev.line);
        computedOffset = prev.offset + fraction * (next.offset - prev.offset);
      }
    } else if (prev && !next) {
      computedOffset = targetMax;
    } else {
      computedOffset = 0;
    }

    const clampedOffset = Math.min(targetMax, Math.max(0, computedOffset));
    applyTargetOffset(clampedOffset);

    lastDebugDetails = {
      editorScrollTop: getScrollOffset(source, sourceAxis),
      editorMaxScrollTop: getMaxScroll(source, sourceAxis),
      editorTopSourceLine: targetLine,
      previewAnchorCount: anchors.length,
      firstPreviewAnchorLine: anchors[0]?.line ?? null,
      lastPreviewAnchorLine: anchors[anchors.length - 1]?.line ?? null,
      selectedPrevAnchorLine: selectedPrev?.line ?? null,
      selectedNextAnchorLine: selectedNext?.line ?? null,
      selectedPrevAnchorOffset: selectedPrev?.offset ?? null,
      selectedNextAnchorOffset: selectedNext?.offset ?? null,
      rawComputedPreviewTargetOffset: computedOffset,
      clampedPreviewTargetOffset: clampedOffset,
      computedPreviewTargetOffset: clampedOffset,
      actualPreviewScrollTop: getScrollOffset(target, targetAxis)
    };
    return;
  }

  // 2. Offset-based lookup (e.g. Preview -> Editor or source offset)
  const sourceOffset =
    typeof sourcePosition.offset === "number"
      ? sourcePosition.offset
      : getScrollOffset(source, sourceAxis);

  const { prev, next } = findSurroundingAnchors(anchors, sourceOffset, "offset");
  selectedPrev = prev;
  selectedNext = next;

  if (prev && next) {
    if (prev === next || prev.offset === next.offset) {
      computedOffset = prev.offset;
    } else {
      const fraction = (sourceOffset - prev.offset) / (next.offset - prev.offset);
      computedOffset = prev.offset + fraction * (next.offset - prev.offset);
    }
  } else if (prev && !next) {
    computedOffset = targetMax;
  } else {
    computedOffset = 0;
  }

  const clampedOffset = Math.min(targetMax, Math.max(0, computedOffset));
  applyTargetOffset(clampedOffset);

  lastDebugDetails = {
    editorScrollTop: getScrollOffset(source, sourceAxis),
    editorMaxScrollTop: getMaxScroll(source, sourceAxis),
    editorTopSourceLine: null,
    previewAnchorCount: anchors.length,
    firstPreviewAnchorLine: anchors[0]?.line ?? null,
    lastPreviewAnchorLine: anchors[anchors.length - 1]?.line ?? null,
    selectedPrevAnchorLine: selectedPrev?.line ?? null,
    selectedNextAnchorLine: selectedNext?.line ?? null,
    selectedPrevAnchorOffset: selectedPrev?.offset ?? null,
    selectedNextAnchorOffset: selectedNext?.offset ?? null,
    rawComputedPreviewTargetOffset: computedOffset,
    clampedPreviewTargetOffset: clampedOffset,
    computedPreviewTargetOffset: clampedOffset,
    actualPreviewScrollTop: getScrollOffset(target, targetAxis)
  };
}

export interface ScrollSyncGuard {
  shouldIgnoreScroll(side: ScrollSyncSide): boolean;
  runProgrammaticScroll(
    targetSide: ScrollSyncSide,
    target: PreviewScrollTarget,
    axis: PreviewScrollAxis,
    newOffset: number
  ): void;
  setSuppressed(side: ScrollSyncSide, suppressed: boolean): void;
  isSuppressed(side: ScrollSyncSide): boolean;
  reset(): void;
  isSyncing(): boolean;
  runGuarded(fn: () => void): void;
}

/**
 * Creates a guard to prevent recursive scroll event loops when programmatic scrolling occurs.
 */
export function createScrollSyncGuard(): ScrollSyncGuard {
  const suppressed = {
    editor: false,
    preview: false
  };
  const clearTimeouts = {
    editor: null as ReturnType<typeof setTimeout> | null,
    preview: null as ReturnType<typeof setTimeout> | null
  };
  let syncing = false;

  function clearPendingTimeout(side: ScrollSyncSide) {
    if (clearTimeouts[side] !== null) {
      clearTimeout(clearTimeouts[side]!);
      clearTimeouts[side] = null;
    }
  }

  return {
    shouldIgnoreScroll(side: ScrollSyncSide): boolean {
      if (suppressed[side]) {
        suppressed[side] = false;
        clearPendingTimeout(side);
        return true;
      }
      return false;
    },

    runProgrammaticScroll(
      targetSide: ScrollSyncSide,
      target: PreviewScrollTarget,
      axis: PreviewScrollAxis,
      newOffset: number
    ): void {
      const currentOffset = getScrollOffset(target, axis);
      const willChange = Math.abs(currentOffset - newOffset) >= 0.5;

      if (willChange) {
        suppressed[targetSide] = true;
        clearPendingTimeout(targetSide);
        clearTimeouts[targetSide] = setTimeout(() => {
          suppressed[targetSide] = false;
          clearTimeouts[targetSide] = null;
        }, 150);
      }

      setScrollOffset(target, axis, newOffset);
    },

    setSuppressed(side: ScrollSyncSide, value: boolean): void {
      suppressed[side] = value;
      if (!value) {
        clearPendingTimeout(side);
      }
    },

    isSuppressed(side: ScrollSyncSide): boolean {
      return suppressed[side];
    },

    reset(): void {
      suppressed.editor = false;
      suppressed.preview = false;
      clearPendingTimeout("editor");
      clearPendingTimeout("preview");
      syncing = false;
    },

    isSyncing: () => syncing,

    runGuarded: (fn: () => void) => {
      if (syncing) {
        return;
      }
      try {
        syncing = true;
        fn();
      } finally {
        syncing = false;
      }
    }
  };
}
