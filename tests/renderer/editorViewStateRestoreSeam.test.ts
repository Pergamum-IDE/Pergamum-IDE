import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * #274: MarkdownEditor gained a one-shot apply seam for a persisted #273
 * View State. The digest gate / mismatch-reset behavior itself is covered
 * by #273's `applyEditorViewState` unit tests; this guards the wiring:
 *   - `applyEditorViewState` is invoked from the restore seam
 *   - it is a one-shot per document key (guarded by a ref)
 *   - a failure there never rejects out of the effect
 *   - it does not run on the per-keystroke path
 */
describe("MarkdownEditor #273 View State restore seam (#274)", () => {
  const source = readFileSync("src/renderer/MarkdownEditor.tsx", "utf8");

  it("applies a pending restore View State via applyEditorViewState, once", () => {
    expect(source).toContain("restoreViewState");
    expect(source).toContain("appliedRestoreViewStateKeyRef");
    expect(source).toMatch(
      /appliedRestoreViewStateKeyRef\.current === restoreViewState\.key/
    );
    const applyIndex = source.indexOf(
      "applyEditorViewState(view, restoreViewState.viewState)"
    );
    expect(applyIndex).toBeGreaterThan(-1);
    // wrapped in try/catch so a restore failure never fails the open
    expect(source.slice(applyIndex - 60, applyIndex)).toContain("try {");
    expect(source.slice(applyIndex, applyIndex + 200)).toContain("onRestoreViewStateApplied");
  });

  it("the restore-apply effect is keyed on documentKey / restoreViewState, not on content", () => {
    const effectTail = source.slice(
      source.indexOf("applyEditorViewState(view, restoreViewState.viewState)")
    );
    const depsMatch = effectTail.match(
      /\},\s*\[restoreViewState, documentKey, onRestoreViewStateApplied\]\)/
    );
    expect(depsMatch).not.toBeNull();
    expect(effectTail).not.toContain("[value,");
  });

  it("EditorSurface forwards the seam to the Markdown editor", () => {
    const surface = readFileSync("src/renderer/EditorSurface.tsx", "utf8");
    expect(surface).toContain("restoreActiveEditorViewState");
    expect(surface).toContain(
      "restoreViewState={restoreActiveEditorViewState}"
    );
    expect(surface).toContain("onRestoreViewStateApplied");
  });
});
