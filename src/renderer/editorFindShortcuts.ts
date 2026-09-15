import { useEffect, useRef } from "react";
import { isModalOrDialogActive } from "./editorTabShortcuts";

export type ActiveFindShortcutDirection = "previous" | "next";

/**
 * #482: checks whether an event target is an editable input element that should suppress
 * Active Find shortcuts (F3 / Shift+F3), while explicitly ALLOWING CodeMirror editor body
 * and Active Find panel inputs.
 */
export function isExcludedInputTargetForActiveFind(
  target: EventTarget | null
): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  // Active Find panel inputs & CodeMirror content area are allowed targets.
  if (
    target.closest(".activeFindPanel, .cm-editor") ||
    target.classList.contains("cm-content")
  ) {
    return false;
  }

  const tagName = target.tagName.toUpperCase();
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }

  if (target.isContentEditable) {
    return true;
  }

  return false;
}

/**
 * #482: determines whether a keydown event corresponds to an F3 / Shift+F3 local search match
 * navigation request, and returns the direction or `null` if ignored.
 */
export function shouldHandleActiveFindShortcut(
  event: {
    key: string;
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
    target: EventTarget | null;
    isComposing?: boolean;
    defaultPrevented?: boolean;
  },
  isModalActive: boolean = isModalOrDialogActive(event.target)
): ActiveFindShortcutDirection | null {
  if (event.defaultPrevented || event.isComposing) {
    return null;
  }

  if (event.ctrlKey || event.altKey || event.metaKey) {
    return null;
  }

  if (event.key !== "F3") {
    return null;
  }

  if (isModalActive) {
    return null;
  }

  if (isExcludedInputTargetForActiveFind(event.target)) {
    return null;
  }

  return event.shiftKey ? "previous" : "next";
}

export interface UseActiveFindShortcutsOptions {
  /** True when the containing EditorSurface is active. */
  readonly active: boolean;
  /** Count of current local matches. Shortcut is no-op when matches count <= 0. */
  readonly findMatchesCount: number;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
}

/**
 * #482: React hook that attaches a window capture-phase keydown listener for F3 / Shift+F3
 * Active Find match navigation shortcuts in active document context.
 */
export function useActiveFindShortcuts({
  active,
  findMatchesCount,
  onNext,
  onPrevious
}: UseActiveFindShortcutsOptions): void {
  const optionsRef = useRef({ active, findMatchesCount, onNext, onPrevious });
  optionsRef.current = { active, findMatchesCount, onNext, onPrevious };

  useEffect(() => {
    if (!active) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      const {
        active: isActive,
        findMatchesCount: count,
        onNext: handleNext,
        onPrevious: handlePrev
      } = optionsRef.current;

      if (!isActive) {
        return;
      }

      const direction = shouldHandleActiveFindShortcut(event);
      if (direction === null) {
        return;
      }

      // No query or no matches: no-op (do not call preventDefault/stopPropagation)
      if (count <= 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (direction === "next") {
        handleNext();
      } else {
        handlePrev();
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [active]);
}
