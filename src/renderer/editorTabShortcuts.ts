import { useEffect, useRef } from "react";
import type { DocumentTab } from "./openDocuments";
import {
  orderedWorkspaceTabs,
  workspaceTabIdEquals,
  workspaceTabIdForTab,
  type SpecialWorkspaceTab,
  type WorkspaceTab,
  type WorkspaceTabId
} from "./workspaceTabs";

/**
 * #480: checks whether an event target is an editable text input element (e.g.
 * input, textarea, select, or contenteditable) that should suppress global tab
 * switching shortcuts, while explicitly allowing CodeMirror editor content.
 */
export function isEditableTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toUpperCase();
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }

  if (target.isContentEditable) {
    // CodeMirror content area is contenteditable, but tab switching should work
    // when focused in the editor body.
    if (target.closest(".cm-editor") || target.classList.contains("cm-content")) {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * #480: checks whether an active modal overlay or popup dialog is currently active.
 * Targeted strictly to active modal overlays / elements to avoid false-positives
 * when focus is on non-dialog workspace content.
 */
export function isModalOrDialogActive(target: EventTarget | null): boolean {
  if (target instanceof HTMLElement && target.closest("[role='dialog'], .modalOverlay, .modalContainer, .modal")) {
    return true;
  }
  if (typeof document !== "undefined") {
    if (document.querySelector(".modalOverlay, .modalContainer, [aria-modal='true']")) {
      return true;
    }
  }
  return false;
}

export type TabSwitchDirection = "previous" | "next";

/**
 * #480: finds the adjacent workspace tab in the visible rendering order.
 * Returns `null` when at boundary (first tab + previous / last tab + next) or
 * when active tab is not found in the list.
 */
export function findAdjacentWorkspaceTab(
  tabs: readonly WorkspaceTab[],
  activeTabId: WorkspaceTabId | undefined,
  direction: TabSwitchDirection
): WorkspaceTab | null {
  if (!activeTabId || tabs.length <= 1) {
    return null;
  }

  const currentIndex = tabs.findIndex((tab) =>
    workspaceTabIdEquals(workspaceTabIdForTab(tab), activeTabId)
  );

  if (currentIndex === -1) {
    return null;
  }

  const targetIndex =
    direction === "previous" ? currentIndex - 1 : currentIndex + 1;

  if (targetIndex < 0 || targetIndex >= tabs.length) {
    return null;
  }

  return tabs[targetIndex];
}

/**
 * #480: determines whether a keydown event corresponds to a valid Alt+Left / Alt+Right
 * tab switch request and returns the direction, or `null` if it should be ignored.
 */
export function shouldHandleTabSwitchShortcut(
  event: {
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    key: string;
    target: EventTarget | null;
    isComposing?: boolean;
    defaultPrevented?: boolean;
  },
  isModalActive: boolean = isModalOrDialogActive(event.target)
): TabSwitchDirection | null {
  if (event.defaultPrevented || event.isComposing) {
    return null;
  }

  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return null;
  }

  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
    return null;
  }

  if (isEditableTextInputTarget(event.target)) {
    return null;
  }

  if (isModalActive) {
    return null;
  }

  return event.key === "ArrowLeft" ? "previous" : "next";
}

export interface UseTabSwitchShortcutsOptions {
  readonly tabs: readonly DocumentTab[];
  readonly specialTabs: readonly SpecialWorkspaceTab[];
  readonly workspaceTabOrder: readonly WorkspaceTabId[];
  readonly activeWorkspaceTabId: WorkspaceTabId | undefined;
  readonly onActivateWorkspaceTab: (tab: WorkspaceTab) => void;
}

/**
 * #480: React hook that attaches the global capture-phase window keydown listener
 * for Alt+Left and Alt+Right workspace tab switching shortcuts. Always reads
 * current props from optionsRef to eliminate stale closure risks.
 */
export function useTabSwitchShortcuts({
  tabs,
  specialTabs,
  workspaceTabOrder,
  activeWorkspaceTabId,
  onActivateWorkspaceTab
}: UseTabSwitchShortcutsOptions): void {
  const optionsRef = useRef({
    tabs,
    specialTabs,
    workspaceTabOrder,
    activeWorkspaceTabId,
    onActivateWorkspaceTab
  });

  optionsRef.current = {
    tabs,
    specialTabs,
    workspaceTabOrder,
    activeWorkspaceTabId,
    onActivateWorkspaceTab
  };

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const direction = shouldHandleTabSwitchShortcut(event);
      if (!direction) {
        return;
      }

      const {
        tabs,
        specialTabs,
        workspaceTabOrder,
        activeWorkspaceTabId,
        onActivateWorkspaceTab
      } = optionsRef.current;

      const renderedTabs = orderedWorkspaceTabs(
        tabs,
        specialTabs,
        workspaceTabOrder
      );

      const targetTab = findAdjacentWorkspaceTab(
        renderedTabs,
        activeWorkspaceTabId,
        direction
      );

      if (!targetTab) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onActivateWorkspaceTab(targetTab);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);
}
