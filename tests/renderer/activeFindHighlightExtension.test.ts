// @vitest-environment happy-dom
import { EditorState } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import {
  activeFindHighlightField,
  clearActiveFindHighlightsEffect,
  hasActiveFindHighlights,
  setActiveFindHighlightsEffect
} from "../../src/renderer/find/activeFindHighlightExtension";

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

function createView(doc: string): EditorView {
  view = new EditorView({
    parent: document.body,
    state: EditorState.create({ doc, extensions: [activeFindHighlightField] })
  });
  return view;
}

function decorations(state: EditorState): Array<{
  from: number;
  to: number;
  cls: string;
}> {
  const set: DecorationSet = state.field(activeFindHighlightField);
  const out: Array<{ from: number; to: number; cls: string }> = [];
  set.between(0, state.doc.length, (from, to, value) => {
    out.push({ from, to, cls: (value.spec as { class: string }).class });
  });
  return out;
}

describe("activeFindHighlightField (#424 Slice 2)", () => {
  it("starts empty (inert until the first effect)", () => {
    const testView = createView("foo foo foo");
    expect(testView.state.field(activeFindHighlightField)).toBe(Decoration.none);
    expect(hasActiveFindHighlights(testView.state)).toBe(false);
  });

  it("marks all supplied ranges and gives the active one an extra class", () => {
    const testView = createView("foo foo foo");
    testView.dispatch({
      effects: setActiveFindHighlightsEffect.of({
        matches: [
          { from: 0, to: 3 },
          { from: 4, to: 7 },
          { from: 8, to: 11 }
        ],
        activeIndex: 1
      })
    });

    const decos = decorations(testView.state);
    expect(decos.map((d) => [d.from, d.to])).toEqual([
      [0, 3],
      [4, 7],
      [8, 11]
    ]);
    expect(decos[0].cls).toBe("cm-pergamum-findMatch");
    expect(decos[1].cls).toBe(
      "cm-pergamum-findMatch cm-pergamum-findMatch-active"
    );
    expect(decos[2].cls).toBe("cm-pergamum-findMatch");
  });

  it("supports a null active index (no -active decoration)", () => {
    const testView = createView("foo foo");
    testView.dispatch({
      effects: setActiveFindHighlightsEffect.of({
        matches: [
          { from: 0, to: 3 },
          { from: 4, to: 7 }
        ],
        activeIndex: null
      })
    });
    expect(
      decorations(testView.state).every(
        (d) => d.cls === "cm-pergamum-findMatch"
      )
    ).toBe(true);
  });

  it("clears every highlight on the clear effect", () => {
    const testView = createView("foo foo");
    testView.dispatch({
      effects: setActiveFindHighlightsEffect.of({
        matches: [{ from: 0, to: 3 }],
        activeIndex: 0
      })
    });
    expect(hasActiveFindHighlights(testView.state)).toBe(true);

    testView.dispatch({ effects: clearActiveFindHighlightsEffect.of(null) });
    expect(hasActiveFindHighlights(testView.state)).toBe(false);
  });

  it("replaces the whole set on a new set effect (empty set = cleared)", () => {
    const testView = createView("foo foo");
    testView.dispatch({
      effects: setActiveFindHighlightsEffect.of({
        matches: [
          { from: 0, to: 3 },
          { from: 4, to: 7 }
        ],
        activeIndex: 0
      })
    });
    testView.dispatch({
      effects: setActiveFindHighlightsEffect.of({ matches: [], activeIndex: null })
    });
    expect(hasActiveFindHighlights(testView.state)).toBe(false);
  });

  it("maps existing highlights through a document edit so they never point at stale offsets", () => {
    const testView = createView("foo foo");
    testView.dispatch({
      effects: setActiveFindHighlightsEffect.of({
        matches: [{ from: 4, to: 7 }],
        activeIndex: 0
      })
    });
    // insert 3 chars at the start
    testView.dispatch({ changes: { from: 0, insert: "XYZ" } });
    expect(decorations(testView.state)).toEqual([
      { from: 7, to: 10, cls: "cm-pergamum-findMatch cm-pergamum-findMatch-active" }
    ]);
  });

  it("skips out-of-range / overlapping ranges instead of throwing", () => {
    const testView = createView("short");
    expect(() =>
      testView.dispatch({
        effects: setActiveFindHighlightsEffect.of({
          matches: [
            { from: 0, to: 3 },
            { from: 2, to: 4 }, // overlaps the previous — skipped
            { from: 10, to: 20 } // past doc end — clamped to empty, skipped
          ],
          activeIndex: 0
        })
      })
    ).not.toThrow();
    expect(decorations(testView.state)).toEqual([
      { from: 0, to: 3, cls: "cm-pergamum-findMatch cm-pergamum-findMatch-active" }
    ]);
  });
});
