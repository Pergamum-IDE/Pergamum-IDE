import type { SidebarMode } from "./sidebarMode";

export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 420;
export const SIDEBAR_DEFAULT_WIDTH = 260;

export const MARKDOWN_EDITOR_MIN_WIDTH = 320;
export const MARKDOWN_PREVIEW_MIN_WIDTH = 280;
export const MARKDOWN_EDITOR_PREVIEW_DEFAULT_RATIO = 0.5;

const MIN_EDITOR_AREA_WIDTH = 240;

export const UTILITY_WINDOW_MIN_HEIGHT = 140;
export const UTILITY_WINDOW_DEFAULT_HEIGHT = 220;
export const EDITOR_AREA_MIN_HEIGHT = 240;

// #377: the Debug Log moved out of the Utility Window to a debug-only special
// tab, leaving "occurrences" as the sole Utility Window tab for now.
export type UtilityWindowTabId = "occurrences";

export const defaultUtilityWindowTab: UtilityWindowTabId = "occurrences";

export interface WorkbenchSidebarLayoutState {
  collapsed: boolean;
  width: number;
}

export interface WorkbenchMarkdownEditorPreviewLayoutState {
  ratio: number;
}

export interface WorkbenchUtilityWindowLayoutState {
  open: boolean;
  activeTab: UtilityWindowTabId;
  height: number;
}

export interface WorkbenchLayoutState {
  sidebar: WorkbenchSidebarLayoutState;
  markdownEditorPreview: WorkbenchMarkdownEditorPreviewLayoutState;
  utilityWindow: WorkbenchUtilityWindowLayoutState;
}

export function createInitialWorkbenchLayoutState(): WorkbenchLayoutState {
  return {
    sidebar: {
      collapsed: false,
      width: SIDEBAR_DEFAULT_WIDTH
    },
    markdownEditorPreview: {
      ratio: MARKDOWN_EDITOR_PREVIEW_DEFAULT_RATIO
    },
    utilityWindow: {
      open: false,
      activeTab: defaultUtilityWindowTab,
      height: UTILITY_WINDOW_DEFAULT_HEIGHT
    }
  };
}

/**
 * Clamps a candidate Sidebar width to [SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH].
 * When `availableWidth` (the width of the row containing the Sidebar and the
 * editor area) is provided, the result is additionally capped so the editor
 * area retains at least MIN_EDITOR_AREA_WIDTH, without ever going below
 * SIDEBAR_MIN_WIDTH.
 */
export function clampSidebarWidth(
  width: number,
  availableWidth?: number
): number {
  const hardClamped = Math.min(
    SIDEBAR_MAX_WIDTH,
    Math.max(SIDEBAR_MIN_WIDTH, width)
  );

  if (availableWidth === undefined) {
    return hardClamped;
  }

  const upperBoundForAvailableWidth = Math.max(
    SIDEBAR_MIN_WIDTH,
    availableWidth - MIN_EDITOR_AREA_WIDTH
  );

  return Math.min(hardClamped, upperBoundForAvailableWidth);
}

/**
 * Clamps a candidate Editor/Preview ratio (Editor share, 0..1). When
 * `containerWidth` is provided, the ratio is adjusted so neither pane goes
 * below its minimum width. If the container is too narrow to satisfy both
 * minimums at once, the ratio falls back to splitting space proportionally
 * to the two minimum widths, prioritizing the minimums over the stored
 * ratio.
 */
export function clampMarkdownEditorPreviewRatio(
  ratio: number,
  containerWidth?: number
): number {
  const hardClamped = Math.min(1, Math.max(0, ratio));

  if (containerWidth === undefined || containerWidth <= 0) {
    return hardClamped;
  }

  const minRatio = MARKDOWN_EDITOR_MIN_WIDTH / containerWidth;
  const maxRatio = 1 - MARKDOWN_PREVIEW_MIN_WIDTH / containerWidth;

  if (minRatio > maxRatio) {
    return (
      MARKDOWN_EDITOR_MIN_WIDTH /
      (MARKDOWN_EDITOR_MIN_WIDTH + MARKDOWN_PREVIEW_MIN_WIDTH)
    );
  }

  return Math.min(maxRatio, Math.max(minRatio, hardClamped));
}

/**
 * Clamps a candidate Utility Window height to at least
 * UTILITY_WINDOW_MIN_HEIGHT. When `availableHeight` (the height of the
 * column containing the EditorSurface, the resize handle, and the Utility
 * Window) is provided, the result is additionally capped so the EditorSurface
 * retains at least EDITOR_AREA_MIN_HEIGHT. If the window is too short to
 * satisfy both the Utility Window's own minimum and the editor area's
 * minimum at once, the editor area's minimum wins and the Utility Window
 * shrinks below its stated minimum rather than invading it.
 */
export function clampUtilityWindowHeight(
  height: number,
  availableHeight?: number
): number {
  if (availableHeight === undefined) {
    return Math.max(UTILITY_WINDOW_MIN_HEIGHT, height);
  }

  const upperBound = Math.max(0, availableHeight - EDITOR_AREA_MIN_HEIGHT);
  const lowerBound = Math.min(UTILITY_WINDOW_MIN_HEIGHT, upperBound);

  return Math.min(Math.max(height, lowerBound), upperBound);
}

/**
 * Resolves the Utility Window's layout state after an open/toggle command.
 * Opening (including toggling closed -> open) re-clamps the remembered
 * height against the current available height, so a height held from a
 * larger window or a large drag never invades the Editor/Preview minimum
 * height the moment the Utility Window reappears. Closing leaves the
 * remembered height untouched, since it stays internal state while closed.
 */
export function resolveUtilityWindowOpenState(
  utilityWindow: WorkbenchUtilityWindowLayoutState,
  open: boolean,
  availableHeight?: number
): WorkbenchUtilityWindowLayoutState {
  if (!open) {
    return utilityWindow.open ? { ...utilityWindow, open: false } : utilityWindow;
  }

  return {
    ...utilityWindow,
    open: true,
    height: clampUtilityWindowHeight(utilityWindow.height, availableHeight)
  };
}

export interface SidebarToggleResult {
  collapsed: boolean;
  mode: SidebarMode;
}

/**
 * Resolves the effect of clicking an Activity Bar mode icon on Sidebar
 * collapse/restore state:
 *  - clicking the already-active mode toggles collapsed on/off
 *  - clicking a different mode always restores (uncollapses) and switches
 */
export function resolveSidebarToggle(
  currentMode: SidebarMode,
  clickedMode: SidebarMode,
  collapsed: boolean
): SidebarToggleResult {
  if (clickedMode === currentMode) {
    return { collapsed: !collapsed, mode: currentMode };
  }

  return { collapsed: false, mode: clickedMode };
}

/**
 * Derives the Activity Bar's active mode display, kept separate from the
 * internally-retained Sidebar mode so it can be restored later. No icon is
 * shown as active while the Sidebar is collapsed or no project is open.
 */
export function resolveActiveActivityMode(
  mode: SidebarMode,
  collapsed: boolean,
  hasProject: boolean
): SidebarMode | null {
  return hasProject && !collapsed ? mode : null;
}
