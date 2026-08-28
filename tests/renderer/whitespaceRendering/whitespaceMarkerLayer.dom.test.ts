// @vitest-environment happy-dom
import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { history, undo, undoDepth } from "@codemirror/commands";
import { afterEach, describe, expect, it } from "vitest";
import type { ApplicationEditorWhitespaceSettings } from "../../../src/shared/settings";
import {
  whitespaceLayerClassName,
  whitespaceLayerMarkerBaseClassName,
  whitespaceMarkerLayer
} from "../../../src/renderer/whitespaceRendering/whitespaceMarkerLayer";

/**
 * happy-dom has no layout, so `view.coordsForChar` returns null and no
 * marker elements are produced. These tests therefore assert the
 * *structural* guarantees that hold regardless of layout: the marker DOM
 * is a `cm-layer` sibling of `.cm-content` (never inside the
 * contenteditable), toggling categories is a pure compartment reconfigure
 * (no document / undo / selection effect), and read-only is unaffected.
 * Real marker geometry and IME stability are verified by manual dogfood.
 */

const ALL_OFF: ApplicationEditorWhitespaceSettings = {
  renderIdeographicSpace: false,
  renderAsciiSpace: false,
  renderTab: false,
  renderOtherUnicodeSpace: false
};

const IDEOGRAPHIC_ON: ApplicationEditorWhitespaceSettings = {
  ...ALL_OFF,
  renderIdeographicSpace: true
};

const SAMPLE = `alpha${"　"}beta${"　"}${"　"}gamma`;

const views: EditorView[] = [];

function mount(
  doc: string,
  marker: Compartment | ApplicationEditorWhitespaceSettings,
  options: { readOnly?: boolean } = {}
): { view: EditorView; compartment: Compartment | null } {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const readOnly = options.readOnly ?? false;

  let compartment: Compartment | null = null;
  const markerExtension =
    marker instanceof Compartment
      ? ((compartment = marker),
        marker.of(whitespaceMarkerLayer(() => IDEOGRAPHIC_ON)))
      : whitespaceMarkerLayer(() => marker);

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        history(),
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        markerExtension
      ]
    })
  });

  views.push(view);
  return { view, compartment };
}

function layerWrapper(view: EditorView): HTMLElement | null {
  return view.scrollDOM.querySelector<HTMLElement>(`.${whitespaceLayerClassName}`);
}

afterEach(() => {
  while (views.length > 0) {
    views.pop()?.destroy();
  }
});

describe("whitespace marker layer — DOM structure (#256)", () => {
  it("renders the markers on a cm-layer that is a sibling of .cm-content, not inside it", () => {
    const { view } = mount(SAMPLE, IDEOGRAPHIC_ON);

    const wrapper = layerWrapper(view);
    expect(wrapper).not.toBeNull();
    expect(wrapper!.classList.contains("cm-layer")).toBe(true);
    // Sits under .cm-scroller, alongside .cm-content — never within it.
    expect(wrapper!.parentElement).toBe(view.scrollDOM);
    expect(view.contentDOM.contains(wrapper!)).toBe(false);
    expect(wrapper!.getAttribute("aria-hidden")).toBe("true");
  });

  it("puts no whitespace marker (and no marker class) inside the contenteditable", () => {
    const { view } = mount(SAMPLE, IDEOGRAPHIC_ON);

    expect(
      view.contentDOM.querySelectorAll(`.${whitespaceLayerMarkerBaseClassName}`)
    ).toHaveLength(0);
    expect(
      view.contentDOM.querySelectorAll("[data-pergamum-whitespace]")
    ).toHaveLength(0);
    // The old Decoration.mark class is gone entirely.
    expect(view.dom.querySelectorAll(".pergamum-whitespace-marker")).toHaveLength(
      0
    );
  });

  it("does not change the rendered document text", () => {
    const { view } = mount(SAMPLE, IDEOGRAPHIC_ON);

    expect(view.state.doc.toString()).toBe(SAMPLE);
    expect(view.contentDOM.textContent).toBe(SAMPLE);
  });

  it("installs no layer at all when every category is off", () => {
    const { view } = mount(SAMPLE, ALL_OFF);
    expect(layerWrapper(view)).toBeNull();
  });

  it("appears / disappears on a compartment reconfigure with no document, undo, or selection effect", () => {
    const compartment = new Compartment();
    const { view } = mount(SAMPLE, compartment);

    view.dispatch({ selection: EditorSelection.single(3, 8) });
    const docBefore = view.state.doc.toString();
    const selectionBefore = view.state.selection.toJSON();

    // ON -> OFF
    view.dispatch({
      effects: compartment.reconfigure(whitespaceMarkerLayer(() => ALL_OFF))
    });
    expect(layerWrapper(view)).toBeNull();

    // OFF -> ON, same view
    view.dispatch({
      effects: compartment.reconfigure(
        whitespaceMarkerLayer(() => IDEOGRAPHIC_ON)
      )
    });
    expect(layerWrapper(view)).not.toBeNull();

    expect(view.state.doc.toString()).toBe(docBefore);
    expect(view.state.selection.toJSON()).toEqual(selectionBefore);
    expect(undoDepth(view.state)).toBe(0);
  });

  it("still renders the layer in a read-only editor", () => {
    const { view } = mount(SAMPLE, IDEOGRAPHIC_ON, { readOnly: true });

    expect(view.state.readOnly).toBe(true);
    expect(layerWrapper(view)).not.toBeNull();
  });

  it("keeps the document clean across an edit (marker layer adds no undo entry)", () => {
    const { view } = mount(SAMPLE, IDEOGRAPHIC_ON);

    view.dispatch({
      changes: { from: view.state.doc.length, insert: `${"　"}delta` }
    });
    expect(undoDepth(view.state)).toBe(1);

    undo(view);
    expect(view.state.doc.toString()).toBe(SAMPLE);
    expect(undoDepth(view.state)).toBe(0);
  });
});
