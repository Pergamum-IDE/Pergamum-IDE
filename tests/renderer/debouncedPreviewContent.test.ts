// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedPreviewContent } from "../../src/renderer/EditorSurface";

/**
 * #250: the Markdown preview must never sit on the editor's critical path.
 * `useDebouncedPreviewContent` is what decouples the two — these tests
 * drive it directly (rather than the full EditorSurface tree, which would
 * mean asserting on unrelated DOM structure) with fake timers, so the
 * debounce/collapse/stale-update behavior is verified deterministically
 * instead of via wall-clock timing.
 *
 * The delay itself (`updateDelayMs`) is a user setting (#250 follow-up,
 * `preview.updateDelayMs`) rather than a hardcoded constant, so these
 * tests pass an explicit delay per render instead of importing one fixed
 * value from production code.
 */

const DELAY = 120;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
  vi.useRealTimers();
});

function mountHook(
  initialDocumentKey: string,
  initialContent: string,
  initialDelayMs: number = DELAY
): {
  rerender: (documentKey: string, content: string, delayMs?: number) => void;
  renderedValues: () => readonly string[];
  latest: () => string;
} {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  const renderedValues: string[] = [];

  function Harness({
    documentKey,
    content,
    delayMs
  }: {
    documentKey: string;
    content: string;
    delayMs: number;
  }): JSX.Element {
    const value = useDebouncedPreviewContent(documentKey, content, delayMs);
    renderedValues.push(value);
    return React.createElement("output", null, value);
  }

  act(() => {
    root!.render(
      React.createElement(Harness, {
        documentKey: initialDocumentKey,
        content: initialContent,
        delayMs: initialDelayMs
      })
    );
  });

  return {
    rerender: (documentKey, content, delayMs = DELAY) => {
      act(() => {
        root!.render(
          React.createElement(Harness, { documentKey, content, delayMs })
        );
      });
    },
    renderedValues: () => renderedValues,
    latest: () => container!.querySelector("output")!.textContent!
  };
}

describe("useDebouncedPreviewContent (#250)", () => {
  it("does not adopt a new content value until the debounce window elapses", () => {
    const harness = mountHook("doc-a", "hello");

    harness.rerender("doc-a", "hello world");
    expect(harness.latest()).toBe("hello");

    act(() => {
      vi.advanceTimersByTime(DELAY - 1);
    });
    expect(harness.latest()).toBe("hello");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(harness.latest()).toBe("hello world");
  });

  it("collapses a burst of rapid edits into a single trailing update — intermediate values are never adopted", () => {
    const harness = mountHook("doc-a", "");

    for (const next of ["h", "he", "hel", "hell", "hello"]) {
      harness.rerender("doc-a", next);
      act(() => {
        vi.advanceTimersByTime(DELAY / 2);
      });
    }

    // None of the intermediate keystroke values were ever adopted — the
    // rendered/returned value stayed at the initial "" throughout the burst.
    expect(harness.renderedValues().every((value) => value === "")).toBe(
      true
    );

    act(() => {
      vi.advanceTimersByTime(DELAY);
    });

    // Only once things settle does the *latest* content get adopted.
    expect(harness.latest()).toBe("hello");
  });

  it("adopts a different document's content immediately on a document switch, without waiting for the debounce", () => {
    const harness = mountHook("doc-a", "document A content");

    harness.rerender("doc-b", "document B content");

    // No timer advance at all — must already reflect the new document.
    expect(harness.latest()).toBe("document B content");
  });

  it("never applies a stale pending update from the previous document after switching away from it", () => {
    const harness = mountHook("doc-a", "A initial");

    // Schedule a debounced update for doc A, but switch documents before it
    // fires.
    harness.rerender("doc-a", "A edited, update in flight");
    act(() => {
      vi.advanceTimersByTime(DELAY / 2);
    });

    harness.rerender("doc-b", "B initial");
    expect(harness.latest()).toBe("B initial");

    // Advance well past when doc A's pending update would have fired.
    act(() => {
      vi.advanceTimersByTime(DELAY * 2);
    });

    // Still doc B's content — the stale doc-A update never overwrote it.
    expect(harness.latest()).toBe("B initial");
  });

  it("eventually converges on the latest content for the active document", () => {
    const harness = mountHook("doc-a", "v1");

    harness.rerender("doc-a", "v2");
    harness.rerender("doc-a", "v3");
    harness.rerender("doc-a", "v4");

    act(() => {
      vi.advanceTimersByTime(DELAY * 2);
    });

    expect(harness.latest()).toBe("v4");
  });

  describe("preview.updateDelayMs as a live setting (#250 follow-up)", () => {
    it("uses whatever delay is passed in, not a hardcoded value", () => {
      const shortHarness = mountHook("doc-a", "hello", 50);
      shortHarness.rerender("doc-a", "hello world", 50);
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(shortHarness.latest()).toBe("hello world");

      const longHarness = mountHook("doc-b", "hello", 500);
      longHarness.rerender("doc-b", "hello world", 500);
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(longHarness.latest()).toBe("hello"); // not yet — delay is 500ms
      act(() => {
        vi.advanceTimersByTime(450);
      });
      expect(longHarness.latest()).toBe("hello world");
    });

    it("changing the delay while an update is pending cancels the stale-delay timer and reschedules with the new delay, never applying at the old delay", () => {
      const harness = mountHook("doc-a", "before", 1000);

      // Same content, but the delay setting changes mid-flight (e.g. the
      // user opened Settings and lowered it) — reschedule from now with the
      // new delay.
      harness.rerender("doc-a", "after", 100);

      act(() => {
        vi.advanceTimersByTime(99);
      });
      expect(harness.latest()).toBe("before");

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(harness.latest()).toBe("after");
    });

    it("does not leave a stale old-delay timer that fires later and overwrites a further edit", () => {
      const harness = mountHook("doc-a", "v1", 1000);

      // A long-delay update gets scheduled, then the delay is shortened and
      // a new edit lands before the original 1000ms would have elapsed.
      harness.rerender("doc-a", "v2", 100);
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(harness.latest()).toBe("v2");

      harness.rerender("doc-a", "v3", 100);
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(harness.latest()).toBe("v3");

      // If the original 1000ms timer had survived, it would still be
      // pending here and could fire later with stale content. Advancing
      // well past it must not change anything.
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(harness.latest()).toBe("v3");
    });

    it("0ms is a valid, working delay — it still defers via a timer rather than updating synchronously, but requires no special-case branch", () => {
      const harness = mountHook("doc-a", "hello", 0);

      harness.rerender("doc-a", "hello world", 0);

      // Not synchronous: still requires the timer queue to flush.
      expect(harness.latest()).toBe("hello");

      act(() => {
        vi.advanceTimersByTime(0);
      });

      expect(harness.latest()).toBe("hello world");
    });
  });
});
