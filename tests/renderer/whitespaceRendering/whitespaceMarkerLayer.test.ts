// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { Text } from "@codemirror/state";
import { Direction, type EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import type { ApplicationEditorWhitespaceSettings } from "../../../src/shared/settings";
import {
  collectWhitespaceMarkers,
  documentOrigin,
  whitespaceLayerMarkerBaseClassName,
  whitespaceLayerMarkerCategoryAttribute,
  whitespaceLayerMarkerCategoryClassName,
  WhitespaceLayerMarker,
  whitespaceMarkerLayer
} from "../../../src/renderer/whitespaceRendering/whitespaceMarkerLayer";

const ALL_OFF: ApplicationEditorWhitespaceSettings = {
  renderIdeographicSpace: false,
  renderAsciiSpace: false,
  renderTab: false,
  renderOtherUnicodeSpace: false
};

// #256 catalog defaults.
const DEFAULTS: ApplicationEditorWhitespaceSettings = {
  renderIdeographicSpace: true,
  renderAsciiSpace: false,
  renderTab: false,
  renderOtherUnicodeSpace: true
};

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface FakeViewOptions {
  doc: string;
  visibleRanges?: { from: number; to: number }[];
  coordsForChar?: (pos: number) => Rect | null;
  scroll?: {
    rectLeft?: number;
    rectRight?: number;
    rectTop?: number;
    clientWidth?: number;
    scrollLeft?: number;
    scrollTop?: number;
  };
  scaleX?: number;
  scaleY?: number;
}

interface FakeView {
  view: EditorView;
  coordsForCharCalls: number[];
}

function fakeView(options: FakeViewOptions): FakeView {
  const doc = Text.of(options.doc.split("\n"));
  const scroll = options.scroll ?? {};
  const coordsForCharCalls: number[] = [];

  const view = {
    state: { doc },
    visibleRanges: options.visibleRanges ?? [{ from: 0, to: options.doc.length }],
    textDirection: Direction.LTR,
    scaleX: options.scaleX ?? 1,
    scaleY: options.scaleY ?? 1,
    scrollDOM: {
      getBoundingClientRect: () => ({
        left: scroll.rectLeft ?? 0,
        right: scroll.rectRight ?? 1000,
        top: scroll.rectTop ?? 0
      }),
      clientWidth: scroll.clientWidth ?? 1000,
      scrollLeft: scroll.scrollLeft ?? 0,
      scrollTop: scroll.scrollTop ?? 0
    },
    coordsForChar: (pos: number): Rect | null => {
      coordsForCharCalls.push(pos);
      if (options.coordsForChar) {
        return options.coordsForChar(pos);
      }
      // Default: a 10px-wide, 20px-tall box at x = pos*10.
      return { left: pos * 10, right: pos * 10 + 10, top: 0, bottom: 20 };
    }
  } as unknown as EditorView;

  return { view, coordsForCharCalls };
}

describe("WhitespaceLayerMarker (#256 layer)", () => {
  const marker = (
    pos: number,
    category: WhitespaceLayerMarker["category"],
    geom: [number, number, number, number] = [1, 2, 3, 4]
  ) => new WhitespaceLayerMarker(pos, category, geom[0], geom[1], geom[2], geom[3]);

  it("eq() compares document position, category and geometry", () => {
    expect(marker(5, "ideographicSpace").eq(marker(5, "ideographicSpace"))).toBe(
      true
    );
    expect(marker(5, "ideographicSpace").eq(marker(6, "ideographicSpace"))).toBe(
      false
    );
    expect(marker(5, "ideographicSpace").eq(marker(5, "asciiSpace"))).toBe(false);
    expect(
      marker(5, "ideographicSpace", [1, 2, 3, 4]).eq(
        marker(5, "ideographicSpace", [1, 2, 3, 9])
      )
    ).toBe(false);
  });

  it("eq() tolerates sub-pixel geometry jitter", () => {
    expect(
      marker(5, "tab", [10, 20, 30, 40]).eq(
        marker(5, "tab", [10.004, 19.997, 30.002, 40.001])
      )
    ).toBe(true);
  });

  it("draw() builds a positioned <div> with base + category class and data attr", () => {
    const dom = marker(7, "otherUnicodeSpace", [12, 34, 5, 18]).draw();

    expect(dom.tagName).toBe("DIV");
    expect(dom.classList.contains(whitespaceLayerMarkerBaseClassName)).toBe(true);
    expect(
      dom.classList.contains(
        whitespaceLayerMarkerCategoryClassName.otherUnicodeSpace
      )
    ).toBe(true);
    expect(dom.getAttribute(whitespaceLayerMarkerCategoryAttribute)).toBe(
      "otherUnicodeSpace"
    );
    expect(dom.style.left).toBe("12px");
    expect(dom.style.top).toBe("34px");
    expect(dom.style.width).toBe("5px");
    expect(dom.style.height).toBe("18px");
    // Glyph sizing tracks the measured box height.
    expect(dom.style.fontSize).toBe("18px");
    // No text content — nothing that could land in the clipboard.
    expect(dom.textContent).toBe("");
    expect(dom.children).toHaveLength(0);
  });

  it("update() reuses the same node in place, even across a category change", () => {
    const dom = marker(1, "asciiSpace", [0, 0, 4, 16]).draw();
    const next = marker(1, "ideographicSpace", [40, 8, 12, 20]);

    const reused = next.update(dom, marker(1, "asciiSpace", [0, 0, 4, 16]));

    expect(reused).toBe(true);
    expect(
      dom.classList.contains(
        whitespaceLayerMarkerCategoryClassName.ideographicSpace
      )
    ).toBe(true);
    expect(
      dom.classList.contains(whitespaceLayerMarkerCategoryClassName.asciiSpace)
    ).toBe(false);
    expect(dom.style.left).toBe("40px");
    expect(dom.getAttribute(whitespaceLayerMarkerCategoryAttribute)).toBe(
      "ideographicSpace"
    );
  });
});

describe("documentOrigin (#256 layer)", () => {
  it("returns the screen coords of document (0,0), accounting for scroll and scale", () => {
    const { view } = fakeView({
      doc: "x",
      scroll: { rectLeft: 10, rectTop: 100, scrollLeft: 30, scrollTop: 45 }
    });

    expect(documentOrigin(view)).toEqual({ left: 10 - 30, top: 100 - 45 });
  });
});

describe("collectWhitespaceMarkers (#256 layer)", () => {
  it("with catalog defaults, marks only the ideographic and other-Unicode spaces", () => {
    // pos: a0 ' '1 b2 '　'3 c4 '\t'5 d6 ' '7 e8
    const { view } = fakeView({ doc: `a b${"　"}c${"\t"}d${" "}e` });

    const markers = collectWhitespaceMarkers(view, DEFAULTS);

    expect(markers.map((m) => [m.pos, m.category])).toEqual([
      [3, "ideographicSpace"],
      [7, "otherUnicodeSpace"]
    ]);
  });

  it("gates each category on its own setting, independently", () => {
    const doc = `${" "}${"　"}${"\t"}${" "}`;
    const { view } = fakeView({ doc });

    const only = (
      key: keyof ApplicationEditorWhitespaceSettings
    ): string[] =>
      collectWhitespaceMarkers(view, { ...ALL_OFF, [key]: true }).map(
        (m) => m.category
      );

    expect(only("renderAsciiSpace")).toEqual(["asciiSpace"]);
    expect(only("renderIdeographicSpace")).toEqual(["ideographicSpace"]);
    expect(only("renderTab")).toEqual(["tab"]);
    expect(only("renderOtherUnicodeSpace")).toEqual(["otherUnicodeSpace"]);
  });

  it("converts the character's screen rect to document-relative geometry", () => {
    const { view } = fakeView({
      doc: `${"　"}`,
      scroll: { rectLeft: 5, rectTop: 50, scrollLeft: 0, scrollTop: 20 },
      coordsForChar: () => ({ left: 200, right: 224, top: 80, bottom: 104 })
    });

    const [m] = collectWhitespaceMarkers(view, DEFAULTS);

    // origin = { left: 5, top: 30 }
    expect([m.left, m.top, m.width, m.height]).toEqual([195, 50, 24, 24]);
  });

  it("only scans view.visibleRanges — never the whole document", () => {
    // U+3000 at pos 0 and pos 2; only [0,1) is visible.
    const { view, coordsForCharCalls } = fakeView({
      doc: `${"　"}x${"　"}`,
      visibleRanges: [{ from: 0, to: 1 }]
    });

    const markers = collectWhitespaceMarkers(view, DEFAULTS);

    expect(markers.map((m) => m.pos)).toEqual([0]);
    expect(coordsForCharCalls).toEqual([0]);
    expect(coordsForCharCalls).not.toContain(2);
  });

  it("skips a character whose coordsForChar returns null (not currently rendered)", () => {
    const { view } = fakeView({
      doc: `${"　"}${"　"}`,
      coordsForChar: (pos) =>
        pos === 0 ? { left: 0, right: 12, top: 0, bottom: 16 } : null
    });

    expect(collectWhitespaceMarkers(view, DEFAULTS).map((m) => m.pos)).toEqual([
      0
    ]);
  });

  it("returns markers in ascending document-position order across visible ranges", () => {
    const { view } = fakeView({
      doc: `${"　"}a${"　"}b${"　"}`,
      visibleRanges: [
        { from: 0, to: 1 },
        { from: 2, to: 5 }
      ]
    });

    expect(collectWhitespaceMarkers(view, DEFAULTS).map((m) => m.pos)).toEqual([
      0, 2, 4
    ]);
  });

  it("produces nothing when every category is disabled", () => {
    const { view, coordsForCharCalls } = fakeView({ doc: `${"　"}${"\t"} ` });

    expect(collectWhitespaceMarkers(view, ALL_OFF)).toEqual([]);
    expect(coordsForCharCalls).toEqual([]);
  });
});

describe("whitespaceMarkerLayer (#256 layer)", () => {
  it("returns an empty extension when no category is enabled", () => {
    expect(whitespaceMarkerLayer(() => ALL_OFF)).toEqual([]);
  });

  it("returns a non-empty layer extension when a category is enabled", () => {
    const extension = whitespaceMarkerLayer(() => DEFAULTS);
    expect(extension).not.toEqual([]);
  });

  it("reads settings live via the getter (post-document-switch safety)", () => {
    let current = ALL_OFF;
    const getter = vi.fn(() => current);

    // All-off at build time -> empty extension.
    expect(whitespaceMarkerLayer(getter)).toEqual([]);

    current = DEFAULTS;
    expect(whitespaceMarkerLayer(getter)).not.toEqual([]);
    expect(getter).toHaveBeenCalled();
  });
});

describe("whitespaceMarkerLayer source-level guarantees (#256 layer)", () => {
  it("uses layer(), and never Decoration.mark / MatchDecorator / composition / DOM surgery", () => {
    const raw = readFileSync(
      "src/renderer/whitespaceRendering/whitespaceMarkerLayer.ts",
      "utf8"
    );
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    expect(code).toMatch(/\blayer\s*\(/);
    // The whole point of the revision: no contenteditable decorations.
    expect(code).not.toMatch(/Decoration|MatchDecorator/);
    // Pure measurement — never dispatches a transaction.
    expect(code).not.toMatch(/\.dispatch\s*\(/);
    // No composition-specific handling / timers / observers / DOM surgery.
    expect(code).not.toMatch(/composition/i);
    expect(code).not.toMatch(
      /MutationObserver|setTimeout|requestAnimationFrame/
    );
    expect(code).not.toMatch(
      /execCommand|innerHTML|replaceChild|\.cm-content|contentDOM/
    );
  });
});
