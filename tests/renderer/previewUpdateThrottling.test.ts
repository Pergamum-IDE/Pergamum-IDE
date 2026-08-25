// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useDebouncedPreviewContent,
  useMemoizedPreviewRender
} from "../../src/renderer/EditorSurface";
import { markdownPreviewRenderer } from "../../src/renderer/preview/markdownPreviewRenderer";

/**
 * #250: on a long document, running markdown-it once per keystroke (as the
 * editor previously did, synchronously, on the same critical path as the
 * next keystroke) is what made typing feel laggy.
 *
 * These tests exercise `useMemoizedPreviewRender` — the exact hook
 * `MarkdownEditorSurface` uses in production — rather than a
 * reimplementation local to the test. Spying on the real
 * `markdownPreviewRenderer.render` and counting calls is what proves the
 * *production* wiring is memoized, not just a test harness.
 */

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
  vi.restoreAllMocks();
});

function mount(initialContent: string): {
  rerender: (content: string) => void;
} {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  function Harness({ content }: { content: string }): null {
    useMemoizedPreviewRender(content);
    return null;
  }

  act(() => {
    root!.render(React.createElement(Harness, { content: initialContent }));
  });

  return {
    rerender: (content) => {
      act(() => {
        root!.render(React.createElement(Harness, { content }));
      });
    }
  };
}

describe("useMemoizedPreviewRender (#250 follow-up): production markdown-it call is memoized, not just the test harness", () => {
  it("does not call markdown-it again when rerendered with the same previewSourceContent", () => {
    const renderSpy = vi.spyOn(markdownPreviewRenderer, "render");

    const harness = mount("# hello");
    expect(renderSpy).toHaveBeenCalledTimes(1);

    // Component rerenders (as MarkdownEditorSurface does on every
    // keystroke), but the memoized dependency (previewSourceContent) is
    // unchanged.
    harness.rerender("# hello");
    harness.rerender("# hello");
    harness.rerender("# hello");

    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  it("calls markdown-it again only when previewSourceContent actually changes", () => {
    const renderSpy = vi.spyOn(markdownPreviewRenderer, "render");

    const harness = mount("# hello");
    expect(renderSpy).toHaveBeenCalledTimes(1);

    harness.rerender("# hello");
    expect(renderSpy).toHaveBeenCalledTimes(1);

    harness.rerender("# hello world");
    expect(renderSpy).toHaveBeenCalledTimes(2);

    harness.rerender("# hello world");
    expect(renderSpy).toHaveBeenCalledTimes(2);
  });
});

describe("preview updates during a long-document edit burst (#250)", () => {
  it("invokes the production markdown-it wiring far fewer times than the number of keystrokes in a fast burst, and the final render reflects the final document", () => {
    const longDocument = "これは長文性能確認用の行です。\n".repeat(20_000);
    const renderSpy = vi.spyOn(markdownPreviewRenderer, "render");

    let lastRenderedHtml = "";

    // Combines both production pieces together, the same way
    // MarkdownEditorSurface does: debounce first, then the memoized render
    // hook on the debounced value.
    function Harness({ content }: { content: string }): null {
      const debounced = useDebouncedPreviewContent("doc-long", content, 100);
      const { html } = useMemoizedPreviewRender(debounced);
      lastRenderedHtml = html;
      return null;
    }

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(React.createElement(Harness, { content: longDocument }));
    });
    expect(renderSpy).toHaveBeenCalledTimes(1); // initial render always renders once

    const keystrokeCount = 60;
    let content = longDocument;

    for (let i = 0; i < keystrokeCount; i++) {
      content += "x";
      act(() => {
        root!.render(React.createElement(Harness, { content }));
        // Faster than the debounce window: simulates fast typing where the
        // next keystroke always arrives before the preview would have
        // updated for the previous one.
        vi.advanceTimersByTime(10);
      });
    }

    // A 1:1 renderer would have called markdown-it 61 times (1 initial +
    // 60 keystrokes). It should instead be collapsed to a small handful.
    expect(renderSpy.mock.calls.length).toBeLessThan(10);

    act(() => {
      vi.runAllTimers();
    });

    // Eventually converges: after the burst settles, the final render
    // reflects the fully-typed content (the trailing run of "x"s), not a
    // stale intermediate value from partway through the burst.
    expect(lastRenderedHtml).toContain("x".repeat(keystrokeCount));
  });
});
