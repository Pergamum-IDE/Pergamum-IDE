// @vitest-environment happy-dom
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import {
  activeFindGutterMarkerField,
  clearActiveFindGutterMarkersEffect,
  createActiveFindGutterMarkerExtension,
  hasActiveFindGutterMarkers,
  setActiveFindGutterMarkersEffect
} from "../../src/renderer/find/activeFindGutterMarkerExtension";

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

function createView(doc: string, enabled = true): EditorView {
  view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      extensions: [createActiveFindGutterMarkerExtension(enabled)]
    })
  });
  return view;
}

function markerPositions(state: EditorState): number[] {
  const markers = state.field(activeFindGutterMarkerField);
  const positions: number[] = [];

  markers.between(0, state.doc.length, (from) => {
    positions.push(from);
  });

  return positions;
}

describe("active Find gutter markers (#425)", () => {
  it("is absent when the setting disables the extension", () => {
    const testView = createView("foo\nbar", false);

    expect(testView.state.field(activeFindGutterMarkerField, false)).toBe(
      undefined
    );
  });

  it("sets one marker per matched line and deduplicates multiple matches on the same line", () => {
    const testView = createView("foo foo\nbar\nfoo");

    testView.dispatch({
      effects: setActiveFindGutterMarkersEffect.of({
        matches: [
          { from: 0, to: 3 },
          { from: 4, to: 7 },
          { from: 12, to: 15 }
        ]
      })
    });

    expect(markerPositions(testView.state)).toEqual([0, 12]);
    expect(hasActiveFindGutterMarkers(testView.state)).toBe(true);
  });

  it("marks every line touched by a multiline match", () => {
    const testView = createView("first\nsecond\nthird");

    testView.dispatch({
      effects: setActiveFindGutterMarkersEffect.of({
        matches: [{ from: 3, to: 12 }]
      })
    });

    expect(markerPositions(testView.state)).toEqual([0, 6]);
  });

  it("clears markers on the clear effect and ignores invalid ranges", () => {
    const testView = createView("foo\nbar");

    testView.dispatch({
      effects: setActiveFindGutterMarkersEffect.of({
        matches: [
          { from: 0, to: 3 },
          { from: 99, to: 100 }
        ]
      })
    });
    expect(markerPositions(testView.state)).toEqual([0]);

    testView.dispatch({ effects: clearActiveFindGutterMarkersEffect.of(null) });
    expect(markerPositions(testView.state)).toEqual([]);
    expect(hasActiveFindGutterMarkers(testView.state)).toBe(false);
  });

  it("renders the binocular marker DOM without replacing line numbers", () => {
    view = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: "foo\nbar",
        extensions: [lineNumbers(), createActiveFindGutterMarkerExtension(true)]
      })
    });
    const testView = view;

    testView.dispatch({
      effects: setActiveFindGutterMarkersEffect.of({
        matches: [{ from: 0, to: 3 }]
      })
    });

    expect(
      testView.dom.querySelector(".cm-pergamum-findGutterMarker svg")
    ).toBeTruthy();
    expect(testView.dom.querySelector(".cm-lineNumbers")).toBeTruthy();
  });
});
