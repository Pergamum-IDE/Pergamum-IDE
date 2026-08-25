// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  lineEndMarkerFeature,
  lineEndMarkerText
} from "../../../src/renderer/editorVisibility/lineEndMarkerFeature";

describe("visibility markers are hidden from assistive technology (#248 blocker 3)", () => {
  it("marks the rendered marker element as aria-hidden", () => {
    const decoration = lineEndMarkerFeature.createDecoration({ position: 0 });
    const widget = (decoration.spec as { widget: { toDOM(): HTMLElement } })
      .widget;

    const dom = widget.toDOM();

    expect(dom.getAttribute("aria-hidden")).toBe("true");
    expect(dom.textContent).toBe(lineEndMarkerText);
  });
});
