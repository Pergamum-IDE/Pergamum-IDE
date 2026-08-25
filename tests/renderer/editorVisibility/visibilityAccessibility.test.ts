// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createLineEndingMarkerFeature } from "../../../src/renderer/editorVisibility/lineEndMarkerFeature";
import { createLineEndingTrackingExtension } from "../../../src/renderer/editorLineEndingField";

describe("visibility markers are hidden from assistive technology (#248 blocker 3, #252)", () => {
  it("marks the rendered marker element as aria-hidden", () => {
    const { field } = createLineEndingTrackingExtension(
      [{ position: 0, kind: "lf" }],
      () => "lf"
    );
    const feature = createLineEndingMarkerFeature(
      field,
      () => "lf",
      () => "⏎"
    );

    const decoration = feature.createDecoration({
      position: 0,
      variant: "expected"
    });
    const widget = (decoration.spec as { widget: { toDOM(): HTMLElement } })
      .widget;

    const dom = widget.toDOM();

    expect(dom.getAttribute("aria-hidden")).toBe("true");
    expect(dom.textContent).toBe("⏎");
  });

  it("keeps the unexpected-variant marker aria-hidden too", () => {
    const { field } = createLineEndingTrackingExtension(
      [{ position: 0, kind: "crlf" }],
      () => "lf"
    );
    const feature = createLineEndingMarkerFeature(
      field,
      () => "lf",
      () => "⏎"
    );

    const decoration = feature.createDecoration({
      position: 0,
      variant: "unexpected"
    });
    const widget = (decoration.spec as { widget: { toDOM(): HTMLElement } })
      .widget;

    const dom = widget.toDOM();

    expect(dom.getAttribute("aria-hidden")).toBe("true");
  });
});
