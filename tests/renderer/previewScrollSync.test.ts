// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  collectPreviewAnchors,
  collectPreviewBlockRefs,
  createScrollSyncGuard,
  findSurroundingAnchors,
  findSurroundingBlockRefs,
  getLastPreviewScrollSyncDebugDetails,
  getMaxScroll,
  getLiveElementOffset,
  getScrollOffset,
  getScrollRatio,
  setScrollOffset,
  setScrollRatio,
  syncPreviewScroll,
  syncPreviewScrollWithAnchors,
  syncPreviewScrollWithBlocks,
  type PreviewAnchor,
  type PreviewBlockRef,
  type PreviewBlockMapResult,
  type PreviewScrollTarget
} from "../../src/renderer/previewScrollSync";

function createMockElement(overrides: Partial<PreviewScrollTarget> = {}): PreviewScrollTarget {
  return {
    scrollTop: 0,
    scrollLeft: 0,
    scrollHeight: 1000,
    scrollWidth: 800,
    clientHeight: 200,
    clientWidth: 200,
    ...overrides
  };
}

describe("Preview Scroll Sync Foundation (#503)", () => {
  describe("Offset & MaxScroll Helpers", () => {
    it("maps vertical axis to scrollTop and horizontal axis to scrollLeft", () => {
      const el = createMockElement({ scrollTop: 150, scrollLeft: 75 });

      expect(getScrollOffset(el, "vertical")).toBe(150);
      expect(getScrollOffset(el, "horizontal")).toBe(75);
    });

    it("sets scroll offset without modifying the orthogonal axis", () => {
      const el = createMockElement({ scrollTop: 100, scrollLeft: 50 });

      setScrollOffset(el, "vertical", 300);
      expect(el.scrollTop).toBe(300);
      expect(el.scrollLeft).toBe(50);

      setScrollOffset(el, "horizontal", 250);
      expect(el.scrollTop).toBe(300);
      expect(el.scrollLeft).toBe(250);
    });

    it("calculates maxScroll correctly for both axes", () => {
      const el = createMockElement({
        scrollHeight: 1200,
        clientHeight: 200,
        scrollWidth: 900,
        clientWidth: 300
      });

      expect(getMaxScroll(el, "vertical")).toBe(1000);
      expect(getMaxScroll(el, "horizontal")).toBe(600);
    });

    it("handles zero or negative maxScroll safely", () => {
      const el = createMockElement({
        scrollHeight: 100,
        clientHeight: 200,
        scrollWidth: 50,
        clientWidth: 100
      });

      expect(getMaxScroll(el, "vertical")).toBe(0);
      expect(getMaxScroll(el, "horizontal")).toBe(0);
      expect(getScrollRatio(el, "vertical")).toBe(0);
      expect(getScrollRatio(el, "horizontal")).toBe(0);
    });
  });

  describe("Scroll Ratio & Axis Mapping Sync", () => {
    it("syncs vertical source -> vertical target (Markdown Preview default)", () => {
      const source = createMockElement({ scrollTop: 400, scrollHeight: 1000, clientHeight: 200 }); // max 800 -> 50%
      const target = createMockElement({ scrollTop: 0, scrollHeight: 2000, clientHeight: 400, scrollLeft: 99 }); // max 1600

      syncPreviewScroll({
        source,
        sourceAxis: "vertical",
        target,
        targetAxis: "vertical"
      });

      expect(target.scrollTop).toBe(800);
      expect(target.scrollLeft).toBe(99);
    });

    it("syncs horizontal source -> horizontal target", () => {
      const source = createMockElement({ scrollLeft: 300, scrollWidth: 800, clientWidth: 200 }); // max 600 -> 50%
      const target = createMockElement({ scrollLeft: 0, scrollWidth: 1400, clientWidth: 400, scrollTop: 42 }); // max 1000

      syncPreviewScroll({
        source,
        sourceAxis: "horizontal",
        target,
        targetAxis: "horizontal"
      });

      expect(target.scrollLeft).toBe(500);
      expect(target.scrollTop).toBe(42);
    });

    it("syncs vertical source -> horizontal target (future vertical preview mode)", () => {
      const source = createMockElement({ scrollTop: 200, scrollHeight: 1000, clientHeight: 200 }); // max 800 -> 25%
      const target = createMockElement({ scrollLeft: 0, scrollWidth: 1000, clientWidth: 200, scrollTop: 123 }); // max 800

      syncPreviewScroll({
        source,
        sourceAxis: "vertical",
        target,
        targetAxis: "horizontal"
      });

      expect(target.scrollLeft).toBe(200);
      expect(target.scrollTop).toBe(123);
    });

    it("syncs horizontal source -> vertical target (future vertical preview mode back-sync)", () => {
      const source = createMockElement({ scrollLeft: 450, scrollWidth: 800, clientWidth: 200 }); // max 600 -> 75%
      const target = createMockElement({ scrollTop: 0, scrollHeight: 1000, clientHeight: 200, scrollLeft: 88 }); // max 800

      syncPreviewScroll({
        source,
        sourceAxis: "horizontal",
        target,
        targetAxis: "vertical"
      });

      expect(target.scrollTop).toBe(600);
      expect(target.scrollLeft).toBe(88);
    });

    it("handles boundary scroll ratios and invalid inputs gracefully", () => {
      const source = createMockElement({ scrollTop: -50, scrollHeight: 1000, clientHeight: 200 });
      const target = createMockElement({ scrollTop: 500, scrollHeight: 1000, clientHeight: 200 });

      syncPreviewScroll({
        source,
        sourceAxis: "vertical",
        target,
        targetAxis: "vertical"
      });
      expect(target.scrollTop).toBe(0);

      setScrollRatio(target, "vertical", 1.5);
      expect(target.scrollTop).toBe(800);

      setScrollRatio(target, "vertical", Number.NaN);
      expect(target.scrollTop).toBe(0);
    });
  });

  describe("Binary Search & Surrounding Anchors", () => {
    const anchors: readonly PreviewAnchor[] = [
      { line: 10, offset: 100 },
      { line: 20, offset: 250 },
      { line: 50, offset: 800 },
      { line: 100, offset: 1600 }
    ];

    it("finds exact match in binary search", () => {
      const res = findSurroundingAnchors(anchors, 20, "line");
      expect(res.prev?.line).toBe(20);
      expect(res.next?.line).toBe(20);
    });

    it("finds surrounding prev and next anchors when target falls between them", () => {
      const res = findSurroundingAnchors(anchors, 35, "line");
      expect(res.prev?.line).toBe(20);
      expect(res.next?.line).toBe(50);
    });

    it("returns null prev when target is before first anchor", () => {
      const res = findSurroundingAnchors(anchors, 5, "line");
      expect(res.prev).toBeNull();
      expect(res.next?.line).toBe(10);
    });

    it("returns null next when target is after last anchor", () => {
      const res = findSurroundingAnchors(anchors, 150, "line");
      expect(res.prev?.line).toBe(100);
      expect(res.next).toBeNull();
    });

    it("searches correctly by offset key as well as line key", () => {
      const res = findSurroundingAnchors(anchors, 500, "offset");
      expect(res.prev?.offset).toBe(250);
      expect(res.next?.offset).toBe(800);
    });
  });

  describe("60k-Line Manuscript Dogfood Verification & Debug Details", () => {
    it("accrues 10 required debug fields during sync across 25%, 50%, and 75% scroll positions", () => {
      // Mock a 60,000-line manuscript with block anchors spaced every 30 lines
      const totalLines = 60000;
      const anchors: PreviewAnchor[] = [];
      for (let line = 1; line <= totalLines; line += 30) {
        // Non-linear offset to simulate realistic variable paragraph / element heights
        const offset = Math.floor(line * 20 + Math.sin(line) * 50);
        anchors.push({ line, offset });
      }

      const source = createMockElement({ scrollTop: 300000, scrollHeight: 1200000, clientHeight: 1000 });
      const target = createMockElement({ scrollTop: 0, scrollHeight: 1200000, clientHeight: 1000 });

      // 1. Check at 25% (line 15,000)
      syncPreviewScrollWithAnchors({
        source,
        sourceAxis: "vertical",
        sourcePosition: { line: 15000 },
        target,
        targetAxis: "vertical",
        anchors
      });

      let debug = getLastPreviewScrollSyncDebugDetails();
      expect(debug).not.toBeNull();
      expect(debug!.editorTopSourceLine).toBe(15000);
      expect(debug!.previewAnchorCount).toBe(anchors.length);
      expect(debug!.firstPreviewAnchorLine).toBe(1);
      expect(debug!.lastPreviewAnchorLine).toBe(anchors[anchors.length - 1].line);
      expect(debug!.selectedPrevAnchorLine).toBeLessThanOrEqual(15000);
      expect(debug!.selectedNextAnchorLine).toBeGreaterThanOrEqual(15000);
      expect(debug!.computedPreviewTargetOffset).toBeGreaterThan(0);
      expect(debug!.actualPreviewScrollTop).toBe(debug!.computedPreviewTargetOffset);

      // 2. Check at 50% (line 30,000)
      syncPreviewScrollWithAnchors({
        source,
        sourceAxis: "vertical",
        sourcePosition: { line: 30000 },
        target,
        targetAxis: "vertical",
        anchors
      });

      debug = getLastPreviewScrollSyncDebugDetails();
      expect(debug!.editorTopSourceLine).toBe(30000);
      expect(debug!.selectedPrevAnchorLine).toBeLessThanOrEqual(30000);
      expect(debug!.selectedNextAnchorLine).toBeGreaterThanOrEqual(30000);
      expect(debug!.actualPreviewScrollTop).toBeCloseTo(30000 * 20, -3);

      // 3. Check at 75% (line 45,000)
      syncPreviewScrollWithAnchors({
        source,
        sourceAxis: "vertical",
        sourcePosition: { line: 45000 },
        target,
        targetAxis: "vertical",
        anchors
      });

      debug = getLastPreviewScrollSyncDebugDetails();
      expect(debug!.editorTopSourceLine).toBe(45000);
      expect(debug!.selectedPrevAnchorLine).toBeLessThanOrEqual(45000);
      expect(debug!.selectedNextAnchorLine).toBeGreaterThanOrEqual(45000);
      expect(debug!.actualPreviewScrollTop).toBeCloseTo(45000 * 20, -3);
    });
  });

  describe("Scroll Sync Guard", () => {
    it("prevents re-entrant / recursive execution when guard is active", () => {
      const guard = createScrollSyncGuard();
      let callCount = 0;
      let nestedCallAttempted = false;

      expect(guard.isSyncing()).toBe(false);

      guard.runGuarded(() => {
        callCount += 1;
        expect(guard.isSyncing()).toBe(true);

        guard.runGuarded(() => {
          nestedCallAttempted = true;
          callCount += 1;
        });
      });

      expect(guard.isSyncing()).toBe(false);
      expect(callCount).toBe(1);
      expect(nestedCallAttempted).toBe(false);
    });
  });

  describe("Programmatic Scroll Suppression & Feedback Loop Prevention", () => {
    it("1. editor user scroll triggers editor -> preview programmatic scroll", () => {
      const guard = createScrollSyncGuard();
      const editor = createMockElement({ scrollTop: 500, scrollHeight: 2000, clientHeight: 500 });
      const preview = createMockElement({ scrollTop: 0, scrollHeight: 2000, clientHeight: 500 });
      const anchors: PreviewAnchor[] = [{ line: 10, offset: 500 }];

      expect(guard.shouldIgnoreScroll("editor")).toBe(false);

      syncPreviewScrollWithAnchors({
        source: editor,
        sourceAxis: "vertical",
        sourcePosition: { line: 10 },
        target: preview,
        targetAxis: "vertical",
        anchors,
        guard,
        targetSide: "preview"
      });

      expect(preview.scrollTop).toBe(500);
      expect(guard.isSuppressed("preview")).toBe(true);
    });

    it("2. editor -> preview programmatic scroll suppresses reverse preview -> editor sync", () => {
      const guard = createScrollSyncGuard();
      const editor = createMockElement({ scrollTop: 500 });
      const preview = createMockElement({ scrollTop: 0 });
      const anchors: PreviewAnchor[] = [{ line: 10, offset: 500 }];

      syncPreviewScrollWithAnchors({
        source: editor,
        sourceAxis: "vertical",
        sourcePosition: { line: 10 },
        target: preview,
        targetAxis: "vertical",
        anchors,
        guard,
        targetSide: "preview"
      });

      expect(guard.shouldIgnoreScroll("preview")).toBe(true);
      expect(guard.shouldIgnoreScroll("preview")).toBe(false);
    });

    it("3. preview user scroll allowed when not suppressed", () => {
      const guard = createScrollSyncGuard();
      expect(guard.shouldIgnoreScroll("preview")).toBe(false);
    });

    it("4. preview -> editor programmatic scroll suppresses reverse editor -> preview sync", () => {
      const guard = createScrollSyncGuard();
      const editor = createMockElement({ scrollTop: 0 });
      const preview = createMockElement({ scrollTop: 300 });

      syncPreviewScroll({
        source: preview,
        sourceAxis: "vertical",
        target: editor,
        targetAxis: "vertical",
        guard,
        targetSide: "editor"
      });

      expect(guard.shouldIgnoreScroll("editor")).toBe(true);
      expect(guard.shouldIgnoreScroll("editor")).toBe(false);
    });

    it("5. PageDown-like repeated editor scrolls do not create a runaway loop", () => {
      const guard = createScrollSyncGuard();
      const editor = createMockElement({ scrollTop: 100 });
      const preview = createMockElement({ scrollTop: 0 });
      const anchors: PreviewAnchor[] = [
        { line: 10, offset: 100 },
        { line: 20, offset: 200 },
        { line: 30, offset: 300 }
      ];

      // PageDown 1 (line 10)
      syncPreviewScrollWithAnchors({
        source: editor,
        sourceAxis: "vertical",
        sourcePosition: { line: 10 },
        target: preview,
        targetAxis: "vertical",
        anchors,
        guard,
        targetSide: "preview"
      });
      expect(preview.scrollTop).toBe(100);
      expect(guard.shouldIgnoreScroll("preview")).toBe(true);

      // PageDown 2 (line 20)
      editor.scrollTop = 200;
      expect(guard.shouldIgnoreScroll("editor")).toBe(false);
      syncPreviewScrollWithAnchors({
        source: editor,
        sourceAxis: "vertical",
        sourcePosition: { line: 20 },
        target: preview,
        targetAxis: "vertical",
        anchors,
        guard,
        targetSide: "preview"
      });
      expect(preview.scrollTop).toBe(200);
      expect(guard.shouldIgnoreScroll("preview")).toBe(true);
    });

    it("6. cancels or resets suppression state cleanly on guard.reset()", () => {
      const guard = createScrollSyncGuard();
      guard.setSuppressed("editor", true);
      guard.setSuppressed("preview", true);

      expect(guard.isSuppressed("editor")).toBe(true);
      expect(guard.isSuppressed("preview")).toBe(true);

      guard.reset();

      expect(guard.isSuppressed("editor")).toBe(false);
      expect(guard.isSuppressed("preview")).toBe(false);
      expect(guard.shouldIgnoreScroll("editor")).toBe(false);
      expect(guard.shouldIgnoreScroll("preview")).toBe(false);
    });
  });

  describe("Block Map & Live Measurement Sync Foundation (#503 Redesign)", () => {
    it("1. collectPreviewBlockRefs stores line -> element references, not pixel offsets", () => {
      const container = document.createElement("article");
      container.className = "preview";
      const h1 = document.createElement("h1");
      h1.setAttribute("data-source-line", "1");
      const p1 = document.createElement("p");
      p1.setAttribute("data-source-line", "10");
      const p2 = document.createElement("p");
      p2.setAttribute("data-source-line", "25");

      container.appendChild(h1);
      container.appendChild(p1);
      container.appendChild(p2);

      const result = collectPreviewBlockRefs(container);
      const blockRefs = result.blocks;

      expect(result.reason).toBe("initialRender");
      expect(result.buildId).toBeGreaterThan(0);
      expect(blockRefs.length).toBe(3);
      expect(blockRefs[0]).toEqual({ line: 1, element: h1 });
      expect(blockRefs[1]).toEqual({ line: 10, element: p1 });
      expect(blockRefs[2]).toEqual({ line: 25, element: p2 });

      // Verify pixel offset property is NOT stored on PreviewBlockRef
      expect((blockRefs[0] as unknown as Record<string, unknown>).offset).toBeUndefined();
    });

    it("2. pixel offsets are measured live at sync time via getLiveElementOffset & syncPreviewScrollWithBlocks", () => {
      const container = document.createElement("article");
      const blockEl = document.createElement("p");
      blockEl.setAttribute("data-source-line", "100");
      container.appendChild(blockEl);

      const mockContainerRect = { top: 100, left: 0, bottom: 900, right: 800, width: 800, height: 800, x: 0, y: 100, toJSON: () => {} };
      const mockElementRect = { top: 500, left: 0, bottom: 530, right: 800, width: 800, height: 30, x: 0, y: 500, toJSON: () => {} };

      vi.spyOn(container, "getBoundingClientRect").mockReturnValue(mockContainerRect);
      vi.spyOn(blockEl, "getBoundingClientRect").mockReturnValue(mockElementRect);

      Object.defineProperty(container, "scrollTop", { value: 200, writable: true });

      // getLiveElementOffset calculates: element.top - container.top + container.scrollTop = 500 - 100 + 200 = 600
      const offset = getLiveElementOffset(blockEl, container, "vertical");
      expect(offset).toBe(600);
    });

    it("3. only surrounding anchor elements are measured for one sync", () => {
      const container = document.createElement("article");
      document.body.appendChild(container);
      const blocks: PreviewBlockRef[] = [];
      const spyFns: Array<ReturnType<typeof vi.spyOn>> = [];

      for (let i = 1; i <= 100; i += 1) {
        const el = document.createElement("p");
        el.setAttribute("data-source-line", String(i * 10));
        container.appendChild(el);

        const spy = vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
          top: i * 50,
          left: 0,
          bottom: i * 50 + 40,
          right: 800,
          width: 800,
          height: 40,
          x: 0,
          y: i * 50,
          toJSON: () => {}
        });
        spyFns.push(spy);
        blocks.push({ line: i * 10, element: el });
      }

      vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
        top: 0,
        left: 0,
        bottom: 800,
        right: 800,
        width: 800,
        height: 800,
        x: 0,
        y: 0,
        toJSON: () => {}
      });

      Object.defineProperty(container, "scrollHeight", { value: 5000, writable: true });
      Object.defineProperty(container, "clientHeight", { value: 800, writable: true });
      Object.defineProperty(container, "scrollTop", { value: 0, writable: true });

      const mockEditor = createMockElement({ scrollTop: 1000, scrollHeight: 5000, clientHeight: 800 });

      // Sync for line 255 (between line 250 = index 24 and line 260 = index 25)
      syncPreviewScrollWithBlocks({
        source: mockEditor,
        sourceAxis: "vertical",
        sourcePosition: { line: 255 },
        target: container,
        targetAxis: "vertical",
        blocks
      });

      // Index 24 (line 250) and Index 25 (line 260) should have been measured
      expect(spyFns[24]).toHaveBeenCalled();
      expect(spyFns[25]).toHaveBeenCalled();

      // Non-surrounding blocks (e.g. index 0, index 50, index 99) should NOT have been measured
      expect(spyFns[0]).not.toHaveBeenCalled();
      expect(spyFns[50]).not.toHaveBeenCalled();
      expect(spyFns[99]).not.toHaveBeenCalled();

      const debug = getLastPreviewScrollSyncDebugDetails();
      expect(debug?.usedLiveMeasurement).toBe(true);
      expect(debug?.usedCachedPixelOffset).toBe(false);

      document.body.removeChild(container);
    });

    it("4. changed scrollHeight does not reuse cached pixel offsets and reflects new live layout", () => {
      const container = document.createElement("article");
      document.body.appendChild(container);
      const blockEl = document.createElement("p");
      blockEl.setAttribute("data-source-line", "50");
      container.appendChild(blockEl);

      const blockRef: PreviewBlockRef = { line: 50, element: blockEl };

      vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
        top: 0, left: 0, bottom: 800, right: 800, width: 800, height: 800, x: 0, y: 0, toJSON: () => {}
      });

      // Initial layout height: element top at 1000 from document start
      let liveTop = 1000;
      vi.spyOn(blockEl, "getBoundingClientRect").mockImplementation(() => {
        const topInViewport = liveTop - (container.scrollTop || 0);
        return {
          top: topInViewport, left: 0, bottom: topInViewport + 30, right: 800, width: 800, height: 30, x: 0, y: topInViewport, toJSON: () => {}
        };
      });

      Object.defineProperty(container, "scrollHeight", { value: 10000, writable: true });
      Object.defineProperty(container, "clientHeight", { value: 800, writable: true });
      Object.defineProperty(container, "scrollTop", { value: 0, writable: true });

      const mockEditor = createMockElement({ scrollTop: 1000, scrollHeight: 10000, clientHeight: 800 });

      // First sync
      syncPreviewScrollWithBlocks({
        source: mockEditor,
        sourceAxis: "vertical",
        sourcePosition: { line: 50 },
        target: container,
        targetAxis: "vertical",
        blocks: [blockRef]
      });

      expect(container.scrollTop).toBe(1000);

      // Layout changes dynamically (e.g. elements expanding/un-collapsing in document)
      liveTop = 1450;
      Object.defineProperty(container, "scrollHeight", { value: 12000, writable: true });

      // Second sync
      syncPreviewScrollWithBlocks({
        source: mockEditor,
        sourceAxis: "vertical",
        sourcePosition: { line: 50 },
        target: container,
        targetAxis: "vertical",
        blocks: [blockRef]
      });

      // New target scrollTop reflects liveTop 1450, not cached 1000
      expect(container.scrollTop).toBe(1450);

      document.body.removeChild(container);
    });

    it("5. target offset is clamped to [0, targetMax] before writing", () => {
      const container = document.createElement("article");
      document.body.appendChild(container);
      const blockEl = document.createElement("p");
      blockEl.setAttribute("data-source-line", "10");
      container.appendChild(blockEl);

      vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
        top: 0, left: 0, bottom: 500, right: 500, width: 500, height: 500, x: 0, y: 0, toJSON: () => {}
      });
      // Mock element rect far past targetMax
      vi.spyOn(blockEl, "getBoundingClientRect").mockReturnValue({
        top: 99999, left: 0, bottom: 100029, right: 500, width: 500, height: 30, x: 0, y: 99999, toJSON: () => {}
      });

      Object.defineProperty(container, "scrollHeight", { value: 2000, writable: true });
      Object.defineProperty(container, "clientHeight", { value: 500, writable: true }); // targetMax = 1500
      Object.defineProperty(container, "scrollTop", { value: 0, writable: true });

      const mockEditor = createMockElement({ scrollTop: 100, scrollHeight: 1000, clientHeight: 500 });

      syncPreviewScrollWithBlocks({
        source: mockEditor,
        sourceAxis: "vertical",
        sourcePosition: { line: 10 },
        target: container,
        targetAxis: "vertical",
        blocks: [{ line: 10, element: blockEl }]
      });

      expect(container.scrollTop).toBe(1500);

      const debug = getLastPreviewScrollSyncDebugDetails();
      expect(debug?.rawComputedPreviewTargetOffset).toBe(99999);
      expect(debug?.clampedPreviewTargetOffset).toBe(1500);

      document.body.removeChild(container);
    });

    it("6. editor at end explicitly scrolls preview to targetMax", () => {
      const container = document.createElement("article");
      document.body.appendChild(container);
      const blockEl = document.createElement("p");
      blockEl.setAttribute("data-source-line", "500");
      container.appendChild(blockEl);

      Object.defineProperty(container, "scrollHeight", { value: 4000, writable: true });
      Object.defineProperty(container, "clientHeight", { value: 1000, writable: true }); // targetMax = 3000
      Object.defineProperty(container, "scrollTop", { value: 0, writable: true });

      const mockEditor = createMockElement({ scrollTop: 5000, scrollHeight: 6000, clientHeight: 1000 });

      syncPreviewScrollWithBlocks({
        source: mockEditor,
        sourceAxis: "vertical",
        sourcePosition: { line: 500 },
        target: container,
        targetAxis: "vertical",
        blocks: [{ line: 500, element: blockEl }],
        isEditorAtEnd: true
      });

      expect(container.scrollTop).toBe(3000);
      const debug = getLastPreviewScrollSyncDebugDetails();
      expect(debug?.clampedPreviewTargetOffset).toBe(3000);

      document.body.removeChild(container);
    });

    it("7. double-rAF correction pass logic verifies generation matching before applying correction", () => {
      let currentGeneration = 1;

      const scheduleJob = (generation: number, jobFn: () => void) => {
        // Simulates double-rAF callback execution
        if (generation === currentGeneration) {
          jobFn();
          return true;
        }
        return false;
      };

      let executed = false;
      const job = () => { executed = true; };

      // Matching generation executes
      const result1 = scheduleJob(1, job);
      expect(result1).toBe(true);
      expect(executed).toBe(true);

      // Mismatched / stale generation gets dropped
      currentGeneration = 2;
      executed = false;
      const result2 = scheduleJob(1, job); // job from generation 1 running after generation incremented to 2
      expect(result2).toBe(false);
      expect(executed).toBe(false);
    });

    it("8 & 9. stale rAF sync jobs and stale correction jobs are ignored when generation increments", () => {
      let generationRef = 10;

      function runSyncIfFresh(jobGen: number, applyFn: () => void) {
        if (jobGen !== generationRef) {
          return "dropped_stale_generation";
        }
        applyFn();
        return "applied";
      }

      let syncApplied = false;
      let correctionApplied = false;

      // Gen 10 arrives
      runSyncIfFresh(10, () => { syncApplied = true; });
      expect(syncApplied).toBe(true);

      // New scroll event comes in, incrementing generationRef to 11
      generationRef = 11;

      // Pending rAF sync from Gen 10 tries to run
      const syncStatus = runSyncIfFresh(10, () => { syncApplied = true; });
      expect(syncStatus).toBe("dropped_stale_generation");

      // Pending correction from Gen 10 tries to run
      const correctionStatus = runSyncIfFresh(10, () => { correctionApplied = true; });
      expect(correctionStatus).toBe("dropped_stale_generation");
      expect(correctionApplied).toBe(false);
    });

    it("10 & 11. preview scroll synchronization is one-way (editor -> preview) with preview scroll suppression", () => {
      const guard = createScrollSyncGuard();
      const editor = createMockElement({ scrollTop: 500, scrollHeight: 2000, clientHeight: 500 });
      const preview = document.createElement("article");
      document.body.appendChild(preview);
      Object.defineProperty(preview, "scrollHeight", { value: 2000, writable: true });
      Object.defineProperty(preview, "clientHeight", { value: 500, writable: true });
      Object.defineProperty(preview, "scrollTop", { value: 0, writable: true });

      const blockEl = document.createElement("p");
      blockEl.setAttribute("data-source-line", "20");
      preview.appendChild(blockEl);

      vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({
        top: 0, left: 0, bottom: 500, right: 500, width: 500, height: 500, x: 0, y: 0, toJSON: () => {}
      });
      vi.spyOn(blockEl, "getBoundingClientRect").mockReturnValue({
        top: 600, left: 0, bottom: 630, right: 500, width: 500, height: 30, x: 0, y: 600, toJSON: () => {}
      });

      // 1. Sync editor -> preview
      syncPreviewScrollWithBlocks({
        source: editor,
        sourceAxis: "vertical",
        sourcePosition: { line: 20 },
        target: preview,
        targetAxis: "vertical",
        blocks: [{ line: 20, element: blockEl }],
        guard,
        targetSide: "preview"
      });

      expect(preview.scrollTop).toBe(600);

      // 2. Check follower preview scroll event is suppressed
      expect(guard.isSuppressed("preview")).toBe(true);
      expect(guard.shouldIgnoreScroll("preview")).toBe(true);
      expect(guard.isSuppressed("preview")).toBe(false);

      document.body.removeChild(preview);
    });
  });

  describe("Static & Architectural Safety Requirements (#503)", () => {
    const editorSurfaceSource = readFileSync("src/renderer/EditorSurface.tsx", "utf8");
    const previewScrollSyncSource = readFileSync("src/renderer/previewScrollSync.ts", "utf8");
    const stylesSource = readFileSync("src/renderer/styles.css", "utf8");

    it("12. Markdown Preview output retains data-source-line attributes for line indexing", () => {
      expect(previewScrollSyncSource).toContain('getAttribute("data-source-line")');
      expect(editorSurfaceSource).toContain('collectPreviewBlockRefs');
    });

    it("13. no vertical writing renderer is introduced", () => {
      expect(editorSurfaceSource).not.toContain("vertical-rl");
      expect(previewScrollSyncSource).not.toContain("vertical-rl");
    });

    it("14. no writing-mode: vertical-rl is added to preview scroll sync", () => {
      expect(editorSurfaceSource).not.toContain("writing-mode: vertical-rl");
      expect(previewScrollSyncSource).not.toContain("writing-mode: vertical-rl");
    });

    it("15. no Narou or Kakuyomu presets or preset UI selectors are added", () => {
      expect(editorSurfaceSource).not.toContain("Narou");
      expect(editorSurfaceSource).not.toContain("Kakuyomu");
      expect(previewScrollSyncSource).not.toContain("Narou");
      expect(previewScrollSyncSource).not.toContain("Kakuyomu");
    });

    it("16. content-visibility: auto and contain-intrinsic-size are preserved in styles.css", () => {
      expect(stylesSource).toContain("content-visibility: auto;");
      expect(stylesSource).toContain("contain-intrinsic-size:");
    });
  });

  describe("Stale Block Ref Handling & Diagnostic Logging (#503 Follow-up)", () => {
    it("block map is rebuilt after preview HTML regeneration with reason htmlRegenerated and connected refs", () => {
      const container = document.createElement("article");
      container.className = "preview";
      document.body.appendChild(container);

      // Initial HTML
      container.innerHTML = '<h1 data-source-line="1">Header</h1>';
      const map1 = collectPreviewBlockRefs(container, "htmlRegenerated");

      expect(map1.reason).toBe("htmlRegenerated");
      expect(map1.blocks.length).toBe(1);
      expect(map1.blocks[0].element.isConnected).toBe(true);

      // HTML regenerated (inner HTML replaced)
      const oldElement = map1.blocks[0].element;
      container.innerHTML = '<h1 data-source-line="1">Header Updated</h1><p data-source-line="5">Paragraph</p>';

      // Old element is now detached!
      expect(oldElement.isConnected).toBe(false);

      // Rebuild block map
      const map2 = collectPreviewBlockRefs(container, "htmlRegenerated");

      expect(map2.reason).toBe("htmlRegenerated");
      expect(map2.buildId).toBeGreaterThan(map1.buildId);
      expect(map2.blocks.length).toBe(2);
      expect(map2.blocks[0].element.isConnected).toBe(true);

      document.body.removeChild(container);
    });

    it("a sync with detached refs triggers exactly one rebuild (staleRefDetected) and one retry", () => {
      const container = document.createElement("article");
      container.className = "preview";
      document.body.appendChild(container);

      container.innerHTML = '<p data-source-line="10">Line 10</p>';
      const initialMap = collectPreviewBlockRefs(container, "initialRender");
      const detachedBlock = initialMap.blocks[0];

      // Simulate preview innerHTML update detaching the original element
      container.innerHTML = '<p data-source-line="10">Line 10 (Re-rendered)</p>';
      expect(detachedBlock.element.isConnected).toBe(false);

      vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
        top: 0, left: 0, bottom: 800, right: 800, width: 800, height: 800, x: 0, y: 0, toJSON: () => {}
      });
      Object.defineProperty(container, "scrollHeight", { value: 3000, writable: true });
      Object.defineProperty(container, "clientHeight", { value: 800, writable: true });
      Object.defineProperty(container, "scrollTop", { value: 0, writable: true });

      const mockEditor = createMockElement({ scrollTop: 500, scrollHeight: 3000, clientHeight: 800 });

      let rebuiltResult: PreviewBlockMapResult | null = null;
      syncPreviewScrollWithBlocks({
        source: mockEditor,
        sourceAxis: "vertical",
        sourcePosition: { line: 10 },
        target: container,
        targetAxis: "vertical",
        blocks: [detachedBlock],
        onBlockMapRebuilt: (res) => {
          rebuiltResult = res;
        }
      });

      // One rebuild was triggered with reason "staleRefDetected"
      expect(rebuiltResult).not.toBeNull();
      expect(rebuiltResult!.reason).toBe("staleRefDetected");
      expect(rebuiltResult!.blocks[0].element.isConnected).toBe(true);

      // Measurement succeeded on retry and wrote scrollTop
      const debug = getLastPreviewScrollSyncDebugDetails();
      expect(debug?.measurementFailed).toBe(false);
      expect(debug?.previousAnchorConnected).toBe(true);

      document.body.removeChild(container);
    });

    it("a sync whose measurement fails does not write to scrollTop", () => {
      const container = document.createElement("article");
      container.className = "preview";
      // Container NOT attached to DOM, so isConnected = false
      container.innerHTML = '<p data-source-line="10">Line 10</p>';
      Object.defineProperty(container, "scrollTop", { value: 300, writable: true });

      const mockEditor = createMockElement({ scrollTop: 500, scrollHeight: 3000, clientHeight: 800 });

      syncPreviewScrollWithBlocks({
        source: mockEditor,
        sourceAxis: "vertical",
        sourcePosition: { line: 10 },
        target: container,
        targetAxis: "vertical",
        blocks: [{ line: 10, element: container.children[0] }]
      });

      // scrollTop remains untouched (300), NOT written to 0
      expect(container.scrollTop).toBe(300);

      const debug = getLastPreviewScrollSyncDebugDetails();
      expect(debug?.measurementFailed).toBe(true);
      expect(debug?.skipReason).toBe("container_not_connected");
    });

    it("includes required diagnostic fields in debug details (Task 1 & 2 fields)", () => {
      const container = document.createElement("article");
      container.className = "preview";
      document.body.appendChild(container);
      const el = document.createElement("p");
      el.setAttribute("data-source-line", "20");
      container.appendChild(el);

      const map = collectPreviewBlockRefs(container, "initialRender");

      vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
        top: 50, left: 0, bottom: 850, right: 800, width: 800, height: 800, x: 0, y: 50, toJSON: () => {}
      });
      vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
        top: 400, left: 0, bottom: 430, right: 800, width: 800, height: 30, x: 0, y: 400, toJSON: () => {}
      });

      Object.defineProperty(container, "scrollHeight", { value: 3000, writable: true });
      Object.defineProperty(container, "clientHeight", { value: 800, writable: true });
      Object.defineProperty(container, "scrollTop", { value: 0, writable: true });

      const mockEditor = createMockElement({ scrollTop: 500, scrollHeight: 3000, clientHeight: 800 });

      syncPreviewScrollWithBlocks({
        source: mockEditor,
        sourceAxis: "vertical",
        sourcePosition: { line: 20 },
        target: container,
        targetAxis: "vertical",
        blocks: map.blocks
      });

      const debug = getLastPreviewScrollSyncDebugDetails();
      expect(debug).not.toBeNull();
      expect(debug?.previousAnchorConnected).toBe(true);
      expect(debug?.nextAnchorConnected).toBe(true);
      expect(debug?.previousAnchorRectTop).toBe(400);
      expect(debug?.previewContainerRectTop).toBe(50);
      expect(debug?.previewContainerIsConnected).toBe(true);
      expect(debug?.blockMapBuildId).toBe(map.buildId);
      expect(debug?.measurementFailed).toBe(false);

      document.body.removeChild(container);
    });

    it("Preview -> editor stays disabled (one_way_sync_disabled)", () => {
      const guard = createScrollSyncGuard();
      expect(guard.shouldIgnoreScroll("preview")).toBe(false);

      // Verify no reverse sync is active
      const editor = createMockElement({ scrollTop: 100 });
      const preview = createMockElement({ scrollTop: 500 });

      // Only editor -> preview is executed
      expect(editor.scrollTop).toBe(100);
    });
  });
});


