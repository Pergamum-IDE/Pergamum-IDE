// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GlossaryEntry, GlossaryTag } from "../../src/shared/glossary";
import { defaultDocumentMapSettings } from "../../src/shared/documentMapSettings";
import type { Translate } from "../../src/shared/i18n";
import { DocumentMapPanel } from "../../src/renderer/DocumentMapPanel";

const translate: Translate = (key) => key;

function tag(id: string, label: string, backgroundRgb = "#1f77b4"): GlossaryTag {
  return {
    id,
    label,
    description: null,
    backgroundRgb,
    foregroundRgb: "#ffffff",
    sortOrder: 0,
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z"
  };
}

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
  props: Partial<React.ComponentProps<typeof DocumentMapPanel>>
): void {
  act(() => {
    root.render(
      React.createElement(DocumentMapPanel, {
        activeDocumentContent: null,
        glossaryEntries: [],
        editorWidth: 800,
        translate,
        ...props
      })
    );
  });
}

describe("DocumentMapPanel (#375, Phase 1)", () => {
  it("renders a Canvas panel for an active Markdown document", () => {
    render({
      activeDocumentContent: "Foo bar baz",
      glossaryEntries: [entry("e1", "Foo")]
    });

    expect(container.querySelector(".documentMapPanel")).not.toBeNull();
    expect(
      container.querySelector("canvas.glossaryDocumentMapCanvas")
    ).not.toBeNull();
    expect(container.textContent).not.toContain("documentMap.empty");
  });

  it("shows the empty state when there is no active Markdown document", () => {
    render({ activeDocumentContent: null, glossaryEntries: [] });
    expect(container.textContent).toContain("documentMap.empty");
    expect(
      container.querySelector("canvas.glossaryDocumentMapCanvas")
    ).toBeNull();
  });

  it("shows the empty state for a whitespace-only document", () => {
    render({ activeDocumentContent: "   \n  \t" });
    expect(container.textContent).toContain("documentMap.empty");
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
      container.querySelector("canvas.glossaryDocumentMapCanvas")
    ).not.toBeNull();
  });

  it("always renders the panel header", () => {
    render({ activeDocumentContent: null });
    expect(container.querySelector(".sidebarHeader")?.textContent).toBe(
      "documentMap.title"
    );
  });
});

describe("DocumentMapPanel (#375) — Render tags multi-select", () => {
  it("renders the Render tags control above the scrolling map body", () => {
    render({
      activeDocumentContent: "Foo bar",
      glossaryEntries: [entry("e1", "Foo")],
      glossaryTags: [tag("t1", "人名"), tag("t2", "地名")]
    });

    const controls = container.querySelector(".documentMapControls");
    expect(controls).not.toBeNull();
    expect(
      controls!.querySelector(".documentMapTagFilterLabel")?.textContent
    ).toBe("documentMap.renderTags.label");
    const body = container.querySelector(".documentMapBody");
    // The control is not inside the scroll body.
    expect(body?.contains(controls)).toBe(false);
  });

  it("defaults to every project tag selected (trigger shows the 'Show all' status)", () => {
    const person = tag("t-person", "人名", "#11aa11");
    const place = tag("t-place", "地名", "#1111aa");
    render({
      activeDocumentContent: "Foo",
      glossaryEntries: [],
      glossaryTags: [person, place]
    });

    const trigger = container.querySelector(".documentMapTagFilterTrigger")!;
    // Not the empty "No render tags" placeholder — every tag is selected.
    expect(trigger.querySelector(".documentMapTagFilterNoSelection")).toBeNull();
    expect(
      trigger.querySelector(".documentMapTagFilterAllSelected")?.textContent
    ).toBe("documentMap.renderTags.showAll");
    // Every option is pressed.
    act(() => (trigger as HTMLButtonElement).click());
    expect(
      Array.from(
        container.querySelectorAll(".documentMapTagFilterOption")
      ).map((el) => el.getAttribute("aria-pressed"))
    ).toEqual(["true", "true"]);
  });

  it("disables the trigger and shows 'No tags available' when the project has no tags", () => {
    render({ activeDocumentContent: "Foo", glossaryEntries: [], glossaryTags: [] });
    const trigger = container.querySelector<HTMLButtonElement>(
      ".documentMapTagFilterTrigger"
    )!;
    expect(trigger.disabled).toBe(true);
    expect(trigger.textContent).toContain("documentMap.renderTags.noTags");
  });

  it("de-selecting a tag narrows the trigger's selected chips", () => {
    const person = tag("t-person", "人名", "#11aa11");
    const place = tag("t-place", "地名", "#1111aa");
    const entries: GlossaryEntry[] = [
      { ...entry("e-aoi", "Aoi"), tags: [person] },
      { ...entry("e-kyoto", "Kyoto"), tags: [place] }
    ];

    render({
      activeDocumentContent: "Aoi Kyoto",
      glossaryEntries: entries,
      glossaryTags: [person, place]
    });

    // Both tags on by default → "Show all" status.
    let trigger = container.querySelector(".documentMapTagFilterTrigger")!;
    expect(
      trigger.querySelector(".documentMapTagFilterAllSelected")
    ).not.toBeNull();

    // Open the dropdown and click the 人名 option row to turn it OFF.
    act(() =>
      container
        .querySelector<HTMLButtonElement>(".documentMapTagFilterTrigger")!
        .click()
    );
    act(() =>
      container.querySelectorAll<HTMLButtonElement>(
        ".documentMapTagFilterOption"
      )[0].click()
    );

    // Now a partial selection → the single remaining chip is shown.
    trigger = container.querySelector(".documentMapTagFilterTrigger")!;
    expect(trigger.querySelector(".documentMapTagFilterAllSelected")).toBeNull();
    expect(
      Array.from(
        trigger.querySelectorAll(".documentMapTagFilterChips .glossaryTagChip")
      ).map((el) => el.textContent)
    ).toEqual(["地名"]);
  });

  it("keeps a de-selection across a tag-list refresh and auto-selects only brand-new tags", () => {
    const person = tag("t-person", "人名", "#11aa11");
    const place = tag("t-place", "地名", "#1111aa");
    const camp = tag("t-camp", "陣営", "#118811");

    render({
      activeDocumentContent: "Foo",
      glossaryEntries: [],
      glossaryTags: [person, place]
    });

    // Turn 地名 OFF (a tag that will SURVIVE the refresh).
    act(() =>
      container
        .querySelector<HTMLButtonElement>(".documentMapTagFilterTrigger")!
        .click()
    );
    act(() =>
      container.querySelectorAll<HTMLButtonElement>(
        ".documentMapTagFilterOption"
      )[1].click()
    );

    // Tag list refreshes: 人名 + 地名 stay, 陣営 is brand new. (The popup is
    // still open from above.)
    render({
      activeDocumentContent: "Foo",
      glossaryEntries: [],
      glossaryTags: [person, place, camp]
    });

    const state = Array.from(
      container.querySelectorAll(".documentMapTagFilterOption")
    ).map((el) => [
      el.querySelector(".glossaryTagChip")?.textContent,
      el.getAttribute("aria-pressed")
    ]);
    expect(state).toEqual([
      ["人名", "true"], // still selected
      ["地名", "false"], // de-selection preserved, NOT re-added
      ["陣営", "true"] // brand new → auto-selected
    ]);
  });
});

describe("DocumentMapPanel (#375) — click-to-scroll navigation", () => {
  function clickHostAt(clientY: number): void {
    const host = container.querySelector<HTMLElement>(
      ".glossaryDocumentMapCanvasHost"
    )!;
    act(() => {
      host.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, clientY })
      );
    });
  }

  it("resolves a click on the map to a 0-based source line and reports it", () => {
    const onNavigateToLine = vi.fn();
    render({
      // 6 source lines; cellSize 2 → row R spans clientY [2R, 2R+2).
      activeDocumentContent: "l0\nl1\nl2\nl3\nl4\nl5",
      glossaryEntries: [],
      onNavigateToLine
    });

    clickHostAt(0); // row 0 → line 0
    clickHostAt(7); // row 3 → line 3 (happy-dom rect top = 0)

    // Phase 5: click-to-scroll navigates with `align: "center"`.
    expect(onNavigateToLine.mock.calls).toEqual([
      [0, { align: "center" }],
      [3, { align: "center" }]
    ]);
  });

  it("marks the host navigable and clamps a click past the end to the last line", () => {
    const onNavigateToLine = vi.fn();
    render({
      activeDocumentContent: "a\nb\nc",
      glossaryEntries: [],
      onNavigateToLine
    });

    expect(
      container
        .querySelector(".glossaryDocumentMapCanvasHost")
        ?.getAttribute("data-navigable")
    ).toBe("true");

    clickHostAt(100_000);
    expect(onNavigateToLine).toHaveBeenLastCalledWith(2, { align: "center" });
  });

  it("is not clickable when onNavigateToLine is omitted", () => {
    render({ activeDocumentContent: "a\nb", glossaryEntries: [] });
    const host = container.querySelector(".glossaryDocumentMapCanvasHost")!;
    expect(host.getAttribute("data-navigable")).toBeNull();
    // No throw when clicked.
    expect(() =>
      act(() => host.dispatchEvent(new window.MouseEvent("click", { bubbles: true })))
    ).not.toThrow();
  });
});

describe("DocumentMapPanel (#375) — vertical scroll + viewport overlay", () => {
  it("wraps the tall canvas in a scroll body separate from the header", () => {
    render({
      activeDocumentContent: "Foo\nbar\nbaz",
      glossaryEntries: []
    });

    const panel = container.querySelector(".documentMapPanel")!;
    const header = panel.querySelector(".sidebarHeader");
    const body = panel.querySelector(".documentMapBody");
    expect(header).not.toBeNull();
    expect(body).not.toBeNull();
    // Header is NOT inside the scroll body.
    expect(body!.contains(header!)).toBe(false);
    // The content host is sized to the map content (explicit px), not 100%.
    const host = body!.querySelector<HTMLElement>(
      ".glossaryDocumentMapCanvasHost"
    )!;
    expect(host.style.height).toMatch(/^\d+px$/);
    expect(host.style.width).toMatch(/^\d+px$/);
  });

  it("uses exactly one canvas (single tall canvas, not virtualized)", () => {
    render({ activeDocumentContent: "a\nb\nc\nd\ne", glossaryEntries: [] });
    expect(
      container.querySelectorAll("canvas.glossaryDocumentMapCanvas")
    ).toHaveLength(1);
  });

  it("draws no viewport overlay without a visible range", () => {
    render({ activeDocumentContent: "Foo\nbar", glossaryEntries: [] });
    expect(container.querySelector(".documentMapViewport")).toBeNull();
  });

  it("draws a viewport overlay band positioned in content coordinates", () => {
    render({
      activeDocumentContent: "Foo\nbar\nbaz\nqux",
      glossaryEntries: [],
      editorVisibleRange: { from: 0, to: 7 }
    });

    const overlay = container.querySelector<HTMLElement>(".documentMapViewport");
    expect(overlay).not.toBeNull();
    // Positioned by inline top / height in the scroll-content coordinate space
    // (pointer-events / border come from the .documentMapViewport CSS rule).
    expect(overlay!.style.top).toMatch(/^\d+px$/);
    expect(overlay!.style.height).toMatch(/^\d+px$/);
    expect(overlay!.parentElement?.classList.contains(
      "glossaryDocumentMapCanvasHost"
    )).toBe(true);
  });

  it("carries the settings-driven viewport-lens fill opacity as an inline CSS custom property", () => {
    render({
      activeDocumentContent: "Foo\nbar\nbaz",
      glossaryEntries: [],
      editorVisibleRange: { from: 0, to: 7 },
      documentMapSettings: {
        ...defaultDocumentMapSettings(),
        viewportLensOpacity: 0.6
      }
    });
    const overlay = container.querySelector<HTMLElement>(".documentMapViewport")!;
    expect(
      overlay.style.getPropertyValue("--document-map-viewport-fill")
    ).toBe("rgba(255, 255, 255, 0.6)");
  });

  it("falls back to the default lens opacity (0.28) when documentMapSettings is omitted", () => {
    render({
      activeDocumentContent: "Foo\nbar",
      glossaryEntries: [],
      editorVisibleRange: { from: 0, to: 3 }
    });
    const overlay = container.querySelector<HTMLElement>(".documentMapViewport")!;
    expect(
      overlay.style.getPropertyValue("--document-map-viewport-fill")
    ).toBe("rgba(255, 255, 255, 0.28)");
  });

  it("clamps an out-of-range settings opacity back into the default before painting", () => {
    render({
      activeDocumentContent: "Foo\nbar",
      glossaryEntries: [],
      editorVisibleRange: { from: 0, to: 3 },
      documentMapSettings: {
        ...defaultDocumentMapSettings(),
        viewportLensOpacity: 5 as number
      }
    });
    const overlay = container.querySelector<HTMLElement>(".documentMapViewport")!;
    // 5 is not a valid lens opacity → the canvas uses the built-in default.
    expect(
      overlay.style.getPropertyValue("--document-map-viewport-fill")
    ).toBe("rgba(255, 255, 255, 0.28)");
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
      ".documentMapViewport"
    )!.style.top;

    render({
      activeDocumentContent: Array.from({ length: 40 }, (_, i) => `l${i}`).join(
        "\n"
      ),
      glossaryEntries: [],
      editorVisibleRange: { from: 90, to: 110 }
    });
    const secondTop = container.querySelector<HTMLElement>(
      ".documentMapViewport"
    )!.style.top;

    expect(firstTop).not.toBe(secondTop);
  });

  it("drops the overlay when the range is cleared (non-Markdown surface)", () => {
    render({
      activeDocumentContent: "Foo\nbar",
      glossaryEntries: [],
      editorVisibleRange: { from: 0, to: 3 }
    });
    expect(container.querySelector(".documentMapViewport")).not.toBeNull();

    render({
      activeDocumentContent: "Foo\nbar",
      glossaryEntries: [],
      editorVisibleRange: null
    });
    expect(container.querySelector(".documentMapViewport")).toBeNull();
  });
});

describe("Document Map layout (#375) — CSS", () => {
  const css = readFileSync("src/renderer/styles.css", "utf8");

  it("makes only the Document Map body scroll, vertically", () => {
    const block = css.slice(
      css.indexOf(".documentMapBody {"),
      css.indexOf("}", css.indexOf(".documentMapBody {"))
    );
    expect(block).toContain("overflow-y: auto");
    expect(block).toContain("overflow-x: hidden");
    expect(block).toContain("flex: 1");
    expect(block).toContain("min-height: 0");
  });

  // Everything from `.documentMapViewport {` up to the end of the dark-scheme
  // override block — covers the base rule, the ::before/::after edges and the
  // @media (prefers-color-scheme: dark) fallbacks.
  const lensCss = css.slice(
    css.indexOf(".documentMapViewport {"),
    css.indexOf("@media (forced-colors: active)")
  );

  it("anchors the viewport lens, keeps it non-interactive, and gives it a translucent ACHROMATIC fill + border", () => {
    const block = css.slice(
      css.indexOf(".documentMapViewport {"),
      css.indexOf("}", css.indexOf(".documentMapViewport {"))
    );
    expect(block).toContain("position: absolute");
    expect(block).toContain("pointer-events: none");
    expect(block).toContain("border: 1px solid");
    // #375: translucent fill (not `transparent`), white glass.
    expect(block).toMatch(/background:\s*var\(--document-map-viewport-fill/);
    expect(block).not.toMatch(/background:\s*transparent/);
    expect(block).toMatch(
      /--document-map-viewport-fill,\s*rgba\(255,\s*255,\s*255,/
    );
    expect(block).toMatch(/--document-map-viewport-border,\s*rgba\(0,\s*0,\s*0,/);
  });

  it("uses NO blue / accent / selection colour anywhere in the lens (light or dark)", () => {
    // The known accent-blue channel triples the design must not use.
    for (const forbidden of [
      /rgba?\(\s*0\s*,\s*120\s*,\s*215/,
      /rgba?\(\s*59\s*,\s*130\s*,\s*246/,
      /rgba?\(\s*37\s*,\s*99\s*,\s*235/
    ]) {
      expect(lensCss).not.toMatch(forbidden);
    }
    // Every rgba() in the lens block is achromatic: R === G === B.
    const rgbas = lensCss.match(/rgba?\([^)]*\)/g) ?? [];
    expect(rgbas.length).toBeGreaterThan(0);
    for (const rgba of rgbas) {
      const [r, g, b] = rgba
        .replace(/rgba?\(|\)/g, "")
        .split(",")
        .slice(0, 3)
        .map((n: string) => Number(n.trim()));
      expect(r).toBe(g);
      expect(g).toBe(b);
    }
  });

  it("draws stronger top / bottom edges on the viewport lens", () => {
    expect(css).toContain(".documentMapViewport::before,");
    expect(css).toContain(".documentMapViewport::after");
    const edgeBlock = css.slice(
      css.indexOf(".documentMapViewport::before,"),
      css.indexOf(
        "}",
        css.indexOf(".documentMapViewport::after")
      )
    );
    expect(edgeBlock).toMatch(/background:\s*var\(--document-map-viewport-edge/);
    expect(edgeBlock).toContain("pointer-events: none");
  });

  it("keeps a viewport-lens fallback for dark colour schemes and forced colours", () => {
    expect(css).toMatch(
      /@media \(prefers-color-scheme: dark\)[\s\S]*\.documentMapViewport/
    );
    expect(css).toMatch(
      /@media \(forced-colors: active\)[\s\S]*\.documentMapViewport/
    );
  });
});

describe("Document Map large-document single-canvas natural height (#403 Phase 1)", () => {
  it("renders a natural-height Canvas host taller than the sidebar pane without clamping to pane height", () => {
    // Generate a synthetic document of 1,000 lines.
    // In Document Map, cellSize = 2px, so 1,000 lines -> at least 2,000px natural height.
    const longText = Array.from({ length: 1000 }, (_, i) => `Line ${i}: some Japanese novel prose.`).join("\n");
    render({
      activeDocumentContent: longText,
      glossaryEntries: []
    });

    const body = container.querySelector(".documentMapBody");
    expect(body).not.toBeNull();

    const host = container.querySelector<HTMLDivElement>(".glossaryDocumentMapCanvasHost");
    expect(host).not.toBeNull();

    // Natural height: 1,000 visual rows * 2px = 2,000px.
    // The host element must receive the full natural height in inline style, not clamped to pane height (e.g. 800px).
    expect(host?.style.height).toBe("2000px");

    // The canvas element inside must be present.
    const canvas = container.querySelector<HTMLCanvasElement>("canvas.glossaryDocumentMapCanvas");
    expect(canvas).not.toBeNull();
    // Backing height must be natural height * pixelRatio (in happy-dom, window.devicePixelRatio is 1).
    expect(canvas?.height).toBe(2000);
  });

  it("preserves natural scale without fit-to-cap scale reduction for multi-thousand line documents", () => {
    // 2,500 lines -> 5,000px natural height
    const longText = Array.from({ length: 2500 }, (_, i) => `Line ${i}`).join("\n");
    render({
      activeDocumentContent: longText,
      glossaryEntries: []
    });

    const host = container.querySelector<HTMLDivElement>(".glossaryDocumentMapCanvasHost");
    const canvas = container.querySelector<HTMLCanvasElement>("canvas.glossaryDocumentMapCanvas");

    expect(host?.style.height).toBe("5000px");
    expect(canvas?.height).toBe(5000);
  });

  it("verifies scroll container CSS preserves vertical scrolling without height clamping", () => {
    const css = readFileSync("src/renderer/styles.css", "utf8");
    const bodyBlock = css.slice(
      css.indexOf(".documentMapBody {"),
      css.indexOf("}", css.indexOf(".documentMapBody {"))
    );

    // .documentMapBody is the vertically scrollable container
    expect(bodyBlock).toContain("overflow-y: auto");
    expect(bodyBlock).toContain("overflow-x: hidden");
    expect(bodyBlock).toContain("flex: 1");
    // min-height: 0 allows flex child to shrink below content size so overflow-y activates
    expect(bodyBlock).toContain("min-height: 0");
    // Does not clamp max-height
    expect(bodyBlock).not.toContain("max-height");
  });
});

describe("Document Map paged physical Canvas rendering (#403 Phase 2)", () => {
  function clickHostAt(clientY: number): void {
    const host = container.querySelector<HTMLElement>(
      ".glossaryDocumentMapCanvasHost"
    )!;
    act(() => {
      host.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, clientY })
      );
    });
  }

  it("does not render paginator when document fits in a single page", () => {
    // 500 lines * 2px = 1,000px < 32,768px safe backing limit
    const text = Array.from({ length: 500 }, (_, i) => `Line ${i}`).join("\n");
    render({
      activeDocumentContent: text,
      glossaryEntries: []
    });

    expect(container.querySelector(".documentMapPaginator")).toBeNull();
    const host = container.querySelector<HTMLDivElement>(".glossaryDocumentMapCanvasHost");
    expect(host?.style.height).toBe("1000px");
    const canvas = container.querySelector<HTMLCanvasElement>("canvas.glossaryDocumentMapCanvas");
    expect(canvas?.height).toBe(1000);
  });

  it("renders paginator and partitions into pages when document exceeds safe backing height", () => {
    // 17,000 lines > 16,384 rows per page -> 2 pages
    const text = Array.from({ length: 17000 }, (_, i) => `Line ${i}`).join("\n");
    render({
      activeDocumentContent: text,
      glossaryEntries: []
    });

    const paginator = container.querySelector(".documentMapPaginator");
    expect(paginator).not.toBeNull();

    // On initial render: Page 1 of 2 (index 0)
    const prevButton = paginator?.querySelector<HTMLButtonElement>(
      "button[aria-label='documentMap.page.previous']"
    );
    const nextButton = paginator?.querySelector<HTMLButtonElement>(
      "button[aria-label='documentMap.page.next']"
    );
    const select = paginator?.querySelector<HTMLSelectElement>(
      "select.documentMapPageSelect"
    );

    expect(prevButton).not.toBeNull();
    expect(nextButton).not.toBeNull();
    expect(select).not.toBeNull();

    // Previous is disabled on first page; Next is enabled
    expect(prevButton?.disabled).toBe(true);
    expect(nextButton?.disabled).toBe(false);
    expect(select?.value).toBe("0");

    // Check options count
    const options = select?.querySelectorAll("option");
    expect(options).toHaveLength(2);

    // Initial page 0 height = 16,384 * 2 = 32,768px
    const host = container.querySelector<HTMLDivElement>(".glossaryDocumentMapCanvasHost");
    const canvas = container.querySelector<HTMLCanvasElement>("canvas.glossaryDocumentMapCanvas");
    expect(host?.style.height).toBe("32768px");
    expect(canvas?.height).toBe(32768);
  });

  it("navigates pages via Next / Previous buttons and does not scroll editor", () => {
    const onNavigateToLine = vi.fn();
    const text = Array.from({ length: 17000 }, (_, i) => `Line ${i}`).join("\n");
    render({
      activeDocumentContent: text,
      glossaryEntries: [],
      onNavigateToLine
    });

    const paginator = container.querySelector(".documentMapPaginator")!;
    const prevButton = paginator.querySelector<HTMLButtonElement>(
      "button[aria-label='documentMap.page.previous']"
    )!;
    const nextButton = paginator.querySelector<HTMLButtonElement>(
      "button[aria-label='documentMap.page.next']"
    )!;
    const select = paginator.querySelector<HTMLSelectElement>(
      "select.documentMapPageSelect"
    )!;

    // Click next -> advances to page 1
    act(() => {
      nextButton.click();
    });

    // Editor navigation must NOT be triggered
    expect(onNavigateToLine).not.toHaveBeenCalled();

    // Paginator state on page 2 (index 1)
    expect(prevButton.disabled).toBe(false);
    expect(nextButton.disabled).toBe(true);
    expect(select.value).toBe("1");

    // Page 1 has natural remainder: (17000 - 16384) * 2 = 616 * 2 = 1232px
    const host = container.querySelector<HTMLDivElement>(".glossaryDocumentMapCanvasHost");
    const canvas = container.querySelector<HTMLCanvasElement>("canvas.glossaryDocumentMapCanvas");
    expect(host?.style.height).toBe("1232px");
    expect(canvas?.height).toBe(1232);

    // Click previous -> returns to page 0
    act(() => {
      prevButton.click();
    });

    expect(onNavigateToLine).not.toHaveBeenCalled();
    expect(prevButton.disabled).toBe(true);
    expect(nextButton.disabled).toBe(false);
    expect(select.value).toBe("0");
    expect(host?.style.height).toBe("32768px");
    expect(canvas?.height).toBe(32768);
  });

  it("navigates pages via dropdown select and resets documentMapBody scrollTop to 0", () => {
    const onNavigateToLine = vi.fn();
    const text = Array.from({ length: 35000 }, (_, i) => `Line ${i}`).join("\n");
    render({
      activeDocumentContent: text,
      glossaryEntries: [],
      onNavigateToLine
    });

    const body = container.querySelector<HTMLDivElement>(".documentMapBody")!;
    body.scrollTop = 500;

    const select = container.querySelector<HTMLSelectElement>(
      "select.documentMapPageSelect"
    )!;
    expect(select.options).toHaveLength(3);

    act(() => {
      select.value = "2";
      select.dispatchEvent(new window.Event("change", { bubbles: true }));
    });

    expect(onNavigateToLine).not.toHaveBeenCalled();
    expect(select.value).toBe("2");
    expect(body.scrollTop).toBe(0);
  });

  it("resolves click navigation in global coordinates across multiple pages", () => {
    const onNavigateToLine = vi.fn();
    const text = Array.from({ length: 17000 }, (_, i) => `Line ${i}`).join("\n");
    render({
      activeDocumentContent: text,
      glossaryEntries: [],
      onNavigateToLine
    });

    // On Page 0: click at clientY = 200 (row 100) -> Line 100
    clickHostAt(200);
    expect(onNavigateToLine).toHaveBeenLastCalledWith(100, { align: "center" });

    // Advance to Page 1 (startLogicalY = 32768)
    const nextButton = container.querySelector<HTMLButtonElement>(
      "button[aria-label='documentMap.page.next']"
    )!;
    act(() => {
      nextButton.click();
    });

    // On Page 1: click at clientY = 200
    // Global map Y = 200 + 32768 = 32968 -> row 16484 -> Line 16484
    clickHostAt(200);
    expect(onNavigateToLine).toHaveBeenLastCalledWith(16484, { align: "center" });
  });

  it("shows viewport lens only when editor visible range intersects the active page", () => {
    // 17,000 lines. Page 0 covers lines 0..16383, Page 1 covers lines 16384..16999
    // In our lines layout, each line is "Line X", offset ranges can be targeted.
    const lines = Array.from({ length: 17000 }, (_, i) => `Line ${i}`);
    const text = lines.join("\n");

    let line10Offset = 0;
    for (let i = 0; i < 10; i++) {
      line10Offset += lines[i].length + 1;
    }

    let line16500Offset = 0;
    for (let i = 0; i < 16500; i++) {
      line16500Offset += lines[i].length + 1;
    }

    // Viewport on line 10 (Page 0)
    render({
      activeDocumentContent: text,
      glossaryEntries: [],
      editorVisibleRange: { from: line10Offset, to: line10Offset + 50 }
    });

    // On Page 0: lens should be present
    expect(container.querySelector(".documentMapViewport")).not.toBeNull();

    // Switch to Page 1
    const nextButton = container.querySelector<HTMLButtonElement>(
      "button[aria-label='documentMap.page.next']"
    )!;
    act(() => {
      nextButton.click();
    });

    // On Page 1: lens should be absent (since line 10 is on Page 0)
    expect(container.querySelector(".documentMapViewport")).toBeNull();

    // Now update editorVisibleRange to line 16500 (Page 1)
    render({
      activeDocumentContent: text,
      glossaryEntries: [],
      editorVisibleRange: { from: line16500Offset, to: line16500Offset + 50 }
    });

    // On Page 1: lens should now be present
    expect(container.querySelector(".documentMapViewport")).not.toBeNull();
  });
});

describe("Document Map render skeleton / paint-before-blocking (#403 Dogfood remediation)", () => {
  it("renders visible skeleton immediately on initial open while render is pending", () => {
    const text = Array.from({ length: 100 }, (_, i) => `Line ${i}`).join("\n");
    render({
      activeDocumentContent: text,
      glossaryEntries: []
    });

    const skeleton = container.querySelector(".documentMapSkeleton");
    expect(skeleton).not.toBeNull();
    expect(skeleton?.getAttribute("aria-busy")).toBe("true");

    const lines = skeleton?.querySelectorAll(".documentMapSkeletonLine");
    expect(lines?.length).toBeGreaterThan(0);

    const textEl = skeleton?.querySelector(".documentMapSkeletonText");
    expect(textEl?.textContent).toContain("documentMap.rendering");

    // Canvas host immediately sized to exact page content height (100 * 2 = 200px)
    const host = container.querySelector<HTMLDivElement>(".glossaryDocumentMapCanvasHost");
    expect(host?.style.height).toBe("200px");
  });

  it("removes skeleton once deferred rendering settles without changing host dimensions", async () => {
    const text = Array.from({ length: 50 }, (_, i) => `Line ${i}`).join("\n");
    render({
      activeDocumentContent: text,
      glossaryEntries: []
    });

    const host = container.querySelector<HTMLDivElement>(".glossaryDocumentMapCanvasHost");
    expect(host?.style.height).toBe("100px");
    expect(container.querySelector(".documentMapSkeleton")).not.toBeNull();

    // Wait for deferred paint and render execution
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(container.querySelector(".documentMapSkeleton")).toBeNull();
    expect(host?.style.height).toBe("100px");
    expect(container.querySelector("canvas.glossaryDocumentMapCanvas")).not.toBeNull();
  });

  it("shows paginator immediately for multi-page documents while skeleton is displayed", () => {
    const text = Array.from({ length: 17000 }, (_, i) => `Line ${i}`).join("\n");
    render({
      activeDocumentContent: text,
      glossaryEntries: []
    });

    // Paginator must be visible immediately
    const paginator = container.querySelector(".documentMapPaginator");
    expect(paginator).not.toBeNull();

    const select = paginator?.querySelector<HTMLSelectElement>("select.documentMapPageSelect");
    expect(select?.value).toBe("0");
    expect(select?.options).toHaveLength(2);

    // Skeleton is active
    expect(container.querySelector(".documentMapSkeleton")).not.toBeNull();

    // Host has initial page 0 height (16,384 * 2 = 32,768px)
    const host = container.querySelector<HTMLDivElement>(".glossaryDocumentMapCanvasHost");
    expect(host?.style.height).toBe("32768px");
  });

  it("shows skeleton when switching pages and maintains new page dimensions", async () => {
    const text = Array.from({ length: 17000 }, (_, i) => `Line ${i}`).join("\n");
    render({
      activeDocumentContent: text,
      glossaryEntries: []
    });

    // Wait for page 0 to finish rendering
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(container.querySelector(".documentMapSkeleton")).toBeNull();

    // Switch to page 1
    const nextButton = container.querySelector<HTMLButtonElement>(
      "button[aria-label='documentMap.page.next']"
    )!;
    act(() => {
      nextButton.click();
    });

    // Skeleton should appear for page 1 while pending
    expect(container.querySelector(".documentMapSkeleton")).not.toBeNull();

    // Host is immediately sized to page 1 remainder height: (17000 - 16384) * 2 = 1232px
    const host = container.querySelector<HTMLDivElement>(".glossaryDocumentMapCanvasHost");
    expect(host?.style.height).toBe("1232px");

    // Wait for page 1 to finish rendering
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(container.querySelector(".documentMapSkeleton")).toBeNull();
    expect(host?.style.height).toBe("1232px");
  });

  it("cancels stale deferred page renders when switching pages rapidly", async () => {
    const text = Array.from({ length: 35000 }, (_, i) => `Line ${i}`).join("\n");
    render({
      activeDocumentContent: text,
      glossaryEntries: []
    });

    const nextButton = container.querySelector<HTMLButtonElement>(
      "button[aria-label='documentMap.page.next']"
    )!;

    // Rapid page switching: page 0 -> page 1 -> page 2 before page 1 deferred render settles
    act(() => {
      nextButton.click();
    });
    act(() => {
      nextButton.click();
    });

    const select = container.querySelector<HTMLSelectElement>(
      "select.documentMapPageSelect"
    )!;
    expect(select.value).toBe("2");

    // Host size is page 2 height: (35000 - 32768) * 2 = 4464px
    const host = container.querySelector<HTMLDivElement>(".glossaryDocumentMapCanvasHost");
    expect(host?.style.height).toBe("4464px");

    // Settle all deferred work
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(container.querySelector(".documentMapSkeleton")).toBeNull();
    expect(select.value).toBe("2");
    expect(host?.style.height).toBe("4464px");
  });
});
