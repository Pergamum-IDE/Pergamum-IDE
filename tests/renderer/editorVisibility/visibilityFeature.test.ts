import { EditorState } from "@codemirror/state";
import type { DecorationSet } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import {
  computeViewportVisibilityDecorations,
  createTextMarkerDecoration,
  createVisibilityExtension,
  type VisibilityDetectionContext,
  type VisibilityFeature,
  type VisibilityMarker,
  type VisibilityViewportSource
} from "../../../src/renderer/editorVisibility/visibilityFeature";

function markerCount(decorations: DecorationSet): number {
  return decorations.size;
}

function fakeViewportSource(
  doc: string,
  ranges: readonly { from: number; to: number }[]
): VisibilityViewportSource {
  return {
    state: EditorState.create({ doc }),
    visibleRanges: ranges
  };
}

/** Minimal stand-in for a future visibility feature, used to prove the
 * foundation can host more than one feature and doesn't need to know
 * anything about what a feature detects. */
function createFixedPositionFeature(
  id: string,
  position: number,
  variant?: string
): VisibilityFeature {
  return {
    id,
    detect: (): readonly VisibilityMarker[] => [{ position, variant }],
    createDecoration: () => createTextMarkerDecoration("*", `test-${id}`)
  };
}

describe("visibility foundation: enable/disable", () => {
  it("produces no decorations when no feature is supplied (disabled)", () => {
    const decorations = computeViewportVisibilityDecorations(
      fakeViewportSource("line one\nline two\nline three", [
        { from: 0, to: 27 }
      ]),
      []
    );

    expect(markerCount(decorations)).toBe(0);
  });

  it("produces decorations for each detected marker when a feature is enabled", () => {
    const feature = createFixedPositionFeature("start", 0);
    const decorations = computeViewportVisibilityDecorations(
      fakeViewportSource("abc", [{ from: 0, to: 3 }]),
      [feature]
    );

    expect(markerCount(decorations)).toBe(1);
  });

  it("createVisibilityExtension with an empty feature list disables the extension entirely", () => {
    expect(createVisibilityExtension([])).toEqual([]);
    expect(createVisibilityExtension()).toEqual([]);
  });
});

describe("visibility foundation: viewport-bounded decoration", () => {
  it("only detects within the given visible ranges, not the whole document", () => {
    const seenRanges: { from: number; to: number }[] = [];
    const feature: VisibilityFeature = {
      id: "rangeEcho",
      detect: (context: VisibilityDetectionContext) => {
        seenRanges.push({ from: context.from, to: context.to });
        return [{ position: context.from }];
      },
      createDecoration: () => createTextMarkerDecoration("*", "test-range")
    };

    const doc = Array.from({ length: 1000 }, (_, i) => `line ${i}`).join("\n");
    const decorations = computeViewportVisibilityDecorations(
      fakeViewportSource(doc, [{ from: 500, to: 520 }]),
      [feature]
    );

    expect(seenRanges).toEqual([{ from: 500, to: 520 }]);
    expect(markerCount(decorations)).toBe(1);
  });

  it("calls detect once per disjoint visible range, and combines the results", () => {
    const seenRanges: { from: number; to: number }[] = [];
    const feature: VisibilityFeature = {
      id: "rangeEcho",
      detect: (context: VisibilityDetectionContext) => {
        seenRanges.push({ from: context.from, to: context.to });
        return [{ position: context.from }];
      },
      createDecoration: () => createTextMarkerDecoration("*", "test-range")
    };

    const doc = "abcdefghijklmnopqrst";
    const decorations = computeViewportVisibilityDecorations(
      fakeViewportSource(doc, [
        { from: 0, to: 5 },
        { from: 10, to: 15 }
      ]),
      [feature]
    );

    expect(seenRanges).toEqual([
      { from: 0, to: 5 },
      { from: 10, to: 15 }
    ]);
    expect(markerCount(decorations)).toBe(2);
  });

  it("produces the same decoration count from repeated recomputation of an unchanged viewport", () => {
    const feature = createFixedPositionFeature("start", 0);
    const source = fakeViewportSource("a\nb\nc\nd", [{ from: 0, to: 7 }]);

    const first = markerCount(computeViewportVisibilityDecorations(source, [feature]));
    const second = markerCount(computeViewportVisibilityDecorations(source, [feature]));
    const third = markerCount(computeViewportVisibilityDecorations(source, [feature]));

    expect([first, second, third]).toEqual([1, 1, 1]);
  });
});

describe("visibility foundation: follows document and viewport updates", () => {
  it("recomputes decorations when the document changes", () => {
    const perLineFeature: VisibilityFeature = {
      id: "perLine",
      detect: (context) => {
        const markers: VisibilityMarker[] = [];
        const firstLine = context.doc.lineAt(context.from).number;
        const lastLine = context.doc.lineAt(context.to).number;
        for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber++) {
          markers.push({ position: context.doc.line(lineNumber).to });
        }
        return markers;
      },
      createDecoration: () => createTextMarkerDecoration("*", "test-perLine")
    };

    const before = computeViewportVisibilityDecorations(
      fakeViewportSource("a\nb", [{ from: 0, to: 3 }]),
      [perLineFeature]
    );
    const after = computeViewportVisibilityDecorations(
      fakeViewportSource("a\nb\nc", [{ from: 0, to: 5 }]),
      [perLineFeature]
    );

    expect(markerCount(before)).toBe(2);
    expect(markerCount(after)).toBe(3);
  });

  it("recomputes decorations when only the visible range changes (no doc change)", () => {
    const feature = createFixedPositionFeature("cursorEcho", 0);
    const doc = "a\nb\nc\nd\ne\nf\ng\nh";

    const scrolledToTop = computeViewportVisibilityDecorations(
      fakeViewportSource(doc, [{ from: 0, to: 4 }]),
      [feature]
    );
    const scrolledDown = computeViewportVisibilityDecorations(
      fakeViewportSource(doc, [{ from: 8, to: 12 }]),
      [feature]
    );

    expect(markerCount(scrolledToTop)).toBe(1);
    expect(markerCount(scrolledDown)).toBe(1);
  });

  it("never changes the document while computing decorations", () => {
    const feature = createFixedPositionFeature("start", 0);
    const source = fakeViewportSource("hello\nworld", [{ from: 0, to: 11 }]);
    const originalText = source.state.doc.toString();

    computeViewportVisibilityDecorations(source, [feature]);
    computeViewportVisibilityDecorations(source, [feature]);

    expect(source.state.doc.toString()).toBe(originalText);
  });
});

describe("visibility foundation: variant / presentation extension point", () => {
  it("lets a feature vary its decoration based on the marker's variant", () => {
    const variantFeature: VisibilityFeature = {
      id: "variantDemo",
      detect: (): readonly VisibilityMarker[] => [
        { position: 0, variant: "normal" },
        { position: 1, variant: "warning" }
      ],
      createDecoration: (marker) =>
        createTextMarkerDecoration(
          "*",
          marker.variant === "warning" ? "test-warning" : "test-normal"
        )
    };

    const decorations = computeViewportVisibilityDecorations(
      fakeViewportSource("ab", [{ from: 0, to: 2 }]),
      [variantFeature]
    );

    const classNames: string[] = [];
    decorations.between(0, 2, (_from, _to, decoration) => {
      const widget = (
        decoration.spec as { widget: { className: string } }
      ).widget;
      classNames.push(widget.className);
    });

    expect(classNames.sort()).toEqual(["test-normal", "test-warning"]);
  });
});

describe("visibility foundation: multiple features can coexist", () => {
  it("combines decorations from more than one feature, including ones sharing a position", () => {
    const featureA = createFixedPositionFeature("a", 2);
    const featureB = createFixedPositionFeature("b", 2);
    const featureC = createFixedPositionFeature("c", 0);

    const decorations = computeViewportVisibilityDecorations(
      fakeViewportSource("abcdef", [{ from: 0, to: 6 }]),
      [featureA, featureB, featureC]
    );

    expect(markerCount(decorations)).toBe(3);
  });

  it("lets each feature's detection stay independent of the others", () => {
    const calls: string[] = [];
    const featureA: VisibilityFeature = {
      id: "a",
      detect: () => {
        calls.push("a");
        return [{ position: 0 }];
      },
      createDecoration: () => createTextMarkerDecoration("*", "test-a")
    };
    const featureB: VisibilityFeature = {
      id: "b",
      detect: () => {
        calls.push("b");
        return [];
      },
      createDecoration: () => createTextMarkerDecoration("*", "test-b")
    };

    computeViewportVisibilityDecorations(
      fakeViewportSource("abc", [{ from: 0, to: 3 }]),
      [featureA, featureB]
    );

    expect(calls).toEqual(["a", "b"]);
  });
});
