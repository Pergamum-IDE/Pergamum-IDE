import { describe, expect, it } from "vitest";
import {
  EDITOR_AREA_MIN_HEIGHT,
  MARKDOWN_EDITOR_MIN_WIDTH,
  MARKDOWN_PREVIEW_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  UTILITY_WINDOW_DEFAULT_HEIGHT,
  UTILITY_WINDOW_MIN_HEIGHT,
  clampMarkdownEditorPreviewRatio,
  clampSidebarWidth,
  clampUtilityWindowHeight,
  defaultUtilityWindowTab,
  resolveActiveActivityMode,
  resolveSidebarToggle,
  resolveUtilityWindowOpenState,
  type WorkbenchUtilityWindowLayoutState
} from "../../src/renderer/workbenchLayout";

function utilityWindowState(
  overrides: Partial<WorkbenchUtilityWindowLayoutState> = {}
): WorkbenchUtilityWindowLayoutState {
  return {
    open: false,
    activeTab: defaultUtilityWindowTab,
    height: UTILITY_WINDOW_DEFAULT_HEIGHT,
    ...overrides
  };
}

describe("clampSidebarWidth", () => {
  it("clamps below the minimum up to SIDEBAR_MIN_WIDTH", () => {
    expect(clampSidebarWidth(50)).toBe(SIDEBAR_MIN_WIDTH);
  });

  it("clamps above the maximum down to SIDEBAR_MAX_WIDTH", () => {
    expect(clampSidebarWidth(900)).toBe(SIDEBAR_MAX_WIDTH);
  });

  it("passes values already within range through unchanged", () => {
    expect(clampSidebarWidth(300)).toBe(300);
  });

  it("caps the width so the editor area keeps a minimum share of a narrow window", () => {
    const clamped = clampSidebarWidth(400, 500);

    expect(clamped).toBeLessThan(400);
    expect(clamped).toBeGreaterThanOrEqual(SIDEBAR_MIN_WIDTH);
  });

  it("never drops below SIDEBAR_MIN_WIDTH even for a very narrow window", () => {
    expect(clampSidebarWidth(300, 200)).toBe(SIDEBAR_MIN_WIDTH);
  });

  it("does not restrict the width when availableWidth is generous", () => {
    expect(clampSidebarWidth(300, 2000)).toBe(300);
  });
});

describe("clampMarkdownEditorPreviewRatio", () => {
  it("clamps below 0 up to 0", () => {
    expect(clampMarkdownEditorPreviewRatio(-1)).toBe(0);
  });

  it("clamps above 1 down to 1", () => {
    expect(clampMarkdownEditorPreviewRatio(2)).toBe(1);
  });

  it("passes values already within range through unchanged when no container width is given", () => {
    expect(clampMarkdownEditorPreviewRatio(0.3)).toBe(0.3);
  });

  it("enforces the editor minimum width against a container", () => {
    const containerWidth = 1000;
    const tinyRatio = 0.05;
    const clamped = clampMarkdownEditorPreviewRatio(tinyRatio, containerWidth);

    expect(clamped * containerWidth).toBeGreaterThanOrEqual(
      MARKDOWN_EDITOR_MIN_WIDTH - 1e-9
    );
  });

  it("enforces the preview minimum width against a container", () => {
    const containerWidth = 1000;
    const hugeRatio = 0.95;
    const clamped = clampMarkdownEditorPreviewRatio(hugeRatio, containerWidth);

    expect((1 - clamped) * containerWidth).toBeGreaterThanOrEqual(
      MARKDOWN_PREVIEW_MIN_WIDTH - 1e-9
    );
  });

  it("prioritizes the minimum widths over the stored ratio when the container is too narrow for both", () => {
    const containerWidth =
      MARKDOWN_EDITOR_MIN_WIDTH + MARKDOWN_PREVIEW_MIN_WIDTH - 100;
    const clamped = clampMarkdownEditorPreviewRatio(0.5, containerWidth);

    expect(clamped).toBeCloseTo(
      MARKDOWN_EDITOR_MIN_WIDTH /
        (MARKDOWN_EDITOR_MIN_WIDTH + MARKDOWN_PREVIEW_MIN_WIDTH)
    );
  });

  it("ignores a non-positive container width", () => {
    expect(clampMarkdownEditorPreviewRatio(0.5, 0)).toBe(0.5);
  });
});

describe("resolveSidebarToggle", () => {
  it("toggles the File Explorer pane when clicking the File Explorer Activity Bar item", () => {
    const hidden = resolveSidebarToggle("files", "files", false);
    const shownAgain = resolveSidebarToggle(hidden.mode, "files", hidden.collapsed);

    expect(hidden).toEqual({
      collapsed: true,
      mode: "files"
    });
    expect(shownAgain).toEqual({
      collapsed: false,
      mode: "files"
    });
  });

  it("collapses when clicking the currently active, expanded mode", () => {
    expect(resolveSidebarToggle("files", "files", false)).toEqual({
      collapsed: true,
      mode: "files"
    });
  });

  it("restores when clicking the currently active, collapsed mode", () => {
    expect(resolveSidebarToggle("files", "files", true)).toEqual({
      collapsed: false,
      mode: "files"
    });
  });

  it("restores and switches mode when clicking a different mode while collapsed", () => {
    expect(resolveSidebarToggle("files", "glossary", true)).toEqual({
      collapsed: false,
      mode: "glossary"
    });
  });

  it("switches mode without collapsing when clicking a different mode while expanded", () => {
    expect(resolveSidebarToggle("files", "search", false)).toEqual({
      collapsed: false,
      mode: "search"
    });
  });
});

describe("clampUtilityWindowHeight", () => {
  it("clamps below the minimum up to UTILITY_WINDOW_MIN_HEIGHT", () => {
    expect(clampUtilityWindowHeight(50)).toBe(UTILITY_WINDOW_MIN_HEIGHT);
  });

  it("passes values already within range through unchanged when no available height is given", () => {
    expect(clampUtilityWindowHeight(300)).toBe(300);
  });

  it("caps the height so the editor area keeps its minimum height", () => {
    const availableHeight = 500;
    const clamped = clampUtilityWindowHeight(1000, availableHeight);

    expect(clamped).toBe(availableHeight - EDITOR_AREA_MIN_HEIGHT);
  });

  it("keeps the requested height when there is ample available height", () => {
    expect(clampUtilityWindowHeight(300, 2000)).toBe(300);
  });

  it("prioritizes the editor area minimum height over the Utility Window's own minimum when the window is short", () => {
    const availableHeight = EDITOR_AREA_MIN_HEIGHT + 60;
    const clamped = clampUtilityWindowHeight(300, availableHeight);

    expect(clamped).toBe(60);
    expect(clamped).toBeLessThan(UTILITY_WINDOW_MIN_HEIGHT);
  });

  it("never produces a negative height even when available height cannot fit the editor area minimum", () => {
    const availableHeight = EDITOR_AREA_MIN_HEIGHT - 50;
    const clamped = clampUtilityWindowHeight(300, availableHeight);

    expect(clamped).toBe(0);
  });
});

describe("resolveUtilityWindowOpenState", () => {
  it("clamps the remembered height against the current available height when opening", () => {
    const state = utilityWindowState({ open: false, height: 1000 });
    const availableHeight = 500;

    const next = resolveUtilityWindowOpenState(state, true, availableHeight);

    expect(next.open).toBe(true);
    expect(next.height).toBe(availableHeight - EDITOR_AREA_MIN_HEIGHT);
  });

  it("clamps up to the minimum height when opening with a small remembered height", () => {
    const state = utilityWindowState({ open: false, height: 10 });

    const next = resolveUtilityWindowOpenState(state, true, 2000);

    expect(next.open).toBe(true);
    expect(next.height).toBe(UTILITY_WINDOW_MIN_HEIGHT);
  });

  it("leaves an already-clamped height unchanged when opening", () => {
    const state = utilityWindowState({ open: false, height: 300 });

    const next = resolveUtilityWindowOpenState(state, true, 2000);

    expect(next.height).toBe(300);
  });

  it("re-clamps on toggle from closed to open", () => {
    const state = utilityWindowState({ open: false, height: 1000 });
    const availableHeight = 500;

    const next = resolveUtilityWindowOpenState(
      state,
      !state.open,
      availableHeight
    );

    expect(next.open).toBe(true);
    expect(next.height).toBe(availableHeight - EDITOR_AREA_MIN_HEIGHT);
  });

  it("keeps the remembered height untouched when closing", () => {
    const state = utilityWindowState({ open: true, height: 1000 });

    const next = resolveUtilityWindowOpenState(state, false, 500);

    expect(next.open).toBe(false);
    expect(next.height).toBe(1000);
  });

  it("keeps the remembered height untouched when closing without an available height", () => {
    const state = utilityWindowState({ open: true, height: 260 });

    const next = resolveUtilityWindowOpenState(state, false);

    expect(next.open).toBe(false);
    expect(next.height).toBe(260);
  });

  it("preserves the active tab across open/close transitions", () => {
    const state = utilityWindowState({ open: false, activeTab: "occurrences" });

    const opened = resolveUtilityWindowOpenState(state, true, 2000);
    const closed = resolveUtilityWindowOpenState(opened, false);

    expect(opened.activeTab).toBe("occurrences");
    expect(closed.activeTab).toBe("occurrences");
  });

  it("allows the Debug Log tab to be the active Utility Window tab", () => {
    const state = utilityWindowState({ open: false, activeTab: "debugLog" });

    const opened = resolveUtilityWindowOpenState(state, true, 2000);
    const closed = resolveUtilityWindowOpenState(opened, false);

    expect(opened.activeTab).toBe("debugLog");
    expect(closed.activeTab).toBe("debugLog");
  });
});

describe("resolveActiveActivityMode", () => {
  it("shows the current mode as active when a project is open and the Sidebar is expanded", () => {
    expect(resolveActiveActivityMode("glossary", false, true)).toBe(
      "glossary"
    );
  });

  it("shows no active mode while the Sidebar is collapsed", () => {
    expect(resolveActiveActivityMode("glossary", true, true)).toBeNull();
  });

  it("shows no active mode when no project is open", () => {
    expect(resolveActiveActivityMode("files", false, false)).toBeNull();
  });

  it("shows no active mode when collapsed and no project is open", () => {
    expect(resolveActiveActivityMode("files", true, false)).toBeNull();
  });
});
