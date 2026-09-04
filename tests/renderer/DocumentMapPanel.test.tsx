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
