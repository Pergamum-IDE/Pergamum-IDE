import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { USAGE_TOUR_TARGETS } from "../../../src/renderer/usageTour/usageTourTypes";

describe("Usage Tour surface targets (Editor / Preview area)", () => {
  const surface = readFileSync("src/renderer/EditorSurface.tsx", "utf8");

  it("registers stable target ids next to the existing ones", () => {
    expect(USAGE_TOUR_TARGETS.editorSurface).toBe("editor-surface");
    expect(USAGE_TOUR_TARGETS.previewSurface).toBe("preview-surface");
    // Existing ids are unchanged.
    expect(USAGE_TOUR_TARGETS.toolbarPreview).toBe("toolbar-preview");
    expect(USAGE_TOUR_TARGETS.activityFiles).toBe("activity-files");
  });

  it("marks the Editor pane (not the toolbar or tab bar) as the Editor target", () => {
    const editorPane = surface.slice(surface.indexOf('aria-label={translate("workspace.markdownEditor")}'));
    expect(editorPane.slice(0, 300)).toContain(
      "data-usage-tour-target={USAGE_TOUR_TARGETS.editorSurface}"
    );
  });

  it("marks the Preview pane (only rendered while Preview is visible) as the Preview target", () => {
    const previewPane = surface.slice(surface.indexOf('aria-label={translate("workspace.markdownPreview")}'));
    expect(previewPane.slice(0, 400)).toContain(
      "data-usage-tour-target={USAGE_TOUR_TARGETS.previewSurface}"
    );
    // The pane is conditionally rendered, so a hidden Preview has no target
    // and the tour falls back to its centered balloon (nothing is opened).
    expect(surface).toContain("{isPreviewAvailable ? (");
  });
});
