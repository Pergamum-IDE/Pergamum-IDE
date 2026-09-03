// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GlossaryEntry } from "../../src/shared/glossary";
import type { Translate } from "../../src/shared/i18n";
import { TextMapPanel } from "../../src/renderer/TextMapPanel";

const translate: Translate = (key) => key;

function entry(id: string, value: string): GlossaryEntry {
  return {
    id,
    description: "",
    atoms: [
      {
        id: `${id}-atom`,
        entryId: id,
        sortOrder: 0,
        value,
        matchFlags: 0,
        createdAt: "2026-09-02T00:00:00.000Z",
        updatedAt: "2026-09-02T00:00:00.000Z"
      }
    ],
    tags: [],
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z"
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(
  props: Partial<React.ComponentProps<typeof TextMapPanel>>
): void {
  act(() => {
    root.render(
      React.createElement(TextMapPanel, {
        activeDocumentContent: null,
        glossaryEntries: [],
        editorWidth: 800,
        translate,
        ...props
      })
    );
  });
}

describe("TextMapPanel (#375, Phase 1)", () => {
  it("renders a Canvas panel for an active Markdown document", () => {
    render({
      activeDocumentContent: "Foo bar baz",
      glossaryEntries: [entry("e1", "Foo")]
    });

    expect(container.querySelector(".textMapPanel")).not.toBeNull();
    expect(
      container.querySelector("canvas.glossaryTextMapCanvas")
    ).not.toBeNull();
    expect(container.textContent).not.toContain("textMap.empty");
  });

  it("shows the empty state when there is no active Markdown document", () => {
    render({ activeDocumentContent: null, glossaryEntries: [] });
    expect(container.textContent).toContain("textMap.empty");
    expect(
      container.querySelector("canvas.glossaryTextMapCanvas")
    ).toBeNull();
  });

  it("shows the empty state for a whitespace-only document", () => {
    render({ activeDocumentContent: "   \n  \t" });
    expect(container.textContent).toContain("textMap.empty");
  });

  it("does not crash with no glossary entries or a null editor width", () => {
    expect(() =>
      render({
        activeDocumentContent: "plain text",
        glossaryEntries: [],
        editorWidth: null
      })
    ).not.toThrow();
    expect(
      container.querySelector("canvas.glossaryTextMapCanvas")
    ).not.toBeNull();
  });

  it("always renders the panel header", () => {
    render({ activeDocumentContent: null });
    expect(container.querySelector(".sidebarHeader")?.textContent).toBe(
      "textMap.title"
    );
  });
});

describe("TextMapPanel (#375) — vertical scroll + viewport overlay", () => {
  it("wraps the tall canvas in a scroll body separate from the header", () => {
    render({
      activeDocumentContent: "Foo\nbar\nbaz",
      glossaryEntries: []
    });

    const panel = container.querySelector(".textMapPanel")!;
    const header = panel.querySelector(".sidebarHeader");
    const body = panel.querySelector(".textMapBody");
    expect(header).not.toBeNull();
    expect(body).not.toBeNull();
    // Header is NOT inside the scroll body.
    expect(body!.contains(header!)).toBe(false);
    // The content host is sized to the map content (explicit px), not 100%.
    const host = body!.querySelector<HTMLElement>(
      ".glossaryTextMapCanvasHost"
    )!;
    expect(host.style.height).toMatch(/^\d+px$/);
    expect(host.style.width).toMatch(/^\d+px$/);
  });

  it("uses exactly one canvas (single tall canvas, not virtualized)", () => {
    render({ activeDocumentContent: "a\nb\nc\nd\ne", glossaryEntries: [] });
    expect(
      container.querySelectorAll("canvas.glossaryTextMapCanvas")
    ).toHaveLength(1);
  });

  it("draws no viewport overlay without a visible range", () => {
    render({ activeDocumentContent: "Foo\nbar", glossaryEntries: [] });
    expect(container.querySelector(".textMapViewport")).toBeNull();
  });

  it("draws a viewport overlay band positioned in content coordinates", () => {
    render({
      activeDocumentContent: "Foo\nbar\nbaz\nqux",
      glossaryEntries: [],
      editorVisibleRange: { from: 0, to: 7 }
    });

    const overlay = container.querySelector<HTMLElement>(".textMapViewport");
    expect(overlay).not.toBeNull();
    // Positioned by inline top / height in the scroll-content coordinate space
    // (pointer-events / border come from the .textMapViewport CSS rule).
    expect(overlay!.style.top).toMatch(/^\d+px$/);
    expect(overlay!.style.height).toMatch(/^\d+px$/);
    expect(overlay!.parentElement?.classList.contains(
      "glossaryTextMapCanvasHost"
    )).toBe(true);
  });

  it("moves the overlay when the visible range changes (editor scroll)", () => {
    render({
      activeDocumentContent: Array.from({ length: 40 }, (_, i) => `l${i}`).join(
        "\n"
      ),
      glossaryEntries: [],
      editorVisibleRange: { from: 0, to: 3 }
    });
    const firstTop = container.querySelector<HTMLElement>(
      ".textMapViewport"
    )!.style.top;

    render({
      activeDocumentContent: Array.from({ length: 40 }, (_, i) => `l${i}`).join(
        "\n"
      ),
      glossaryEntries: [],
      editorVisibleRange: { from: 90, to: 110 }
    });
    const secondTop = container.querySelector<HTMLElement>(
      ".textMapViewport"
    )!.style.top;

    expect(firstTop).not.toBe(secondTop);
  });

  it("drops the overlay when the range is cleared (non-Markdown surface)", () => {
    render({
      activeDocumentContent: "Foo\nbar",
      glossaryEntries: [],
      editorVisibleRange: { from: 0, to: 3 }
    });
    expect(container.querySelector(".textMapViewport")).not.toBeNull();

    render({
      activeDocumentContent: "Foo\nbar",
      glossaryEntries: [],
      editorVisibleRange: null
    });
    expect(container.querySelector(".textMapViewport")).toBeNull();
  });
});

describe("Text Map layout (#375) — CSS", () => {
  const css = readFileSync("src/renderer/styles.css", "utf8");

  it("makes only the Text Map body scroll, vertically", () => {
    const block = css.slice(
      css.indexOf(".textMapBody {"),
      css.indexOf("}", css.indexOf(".textMapBody {"))
    );
    expect(block).toContain("overflow-y: auto");
    expect(block).toContain("overflow-x: hidden");
    expect(block).toContain("flex: 1");
    expect(block).toContain("min-height: 0");
  });

  it("anchors the viewport overlay and keeps it non-interactive", () => {
    const block = css.slice(
      css.indexOf(".textMapViewport {"),
      css.indexOf("}", css.indexOf(".textMapViewport {"))
    );
    expect(block).toContain("position: absolute");
    expect(block).toContain("pointer-events: none");
    expect(block).toContain("border: 1px solid");
  });
});
