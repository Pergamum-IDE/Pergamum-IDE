// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  PREVIEW_JUMP_IGNORED_TARGET_SELECTOR,
  clampPreviewJumpLine,
  isPreviewJumpModifierHeld,
  resolvePreviewJumpTarget
} from "../../src/renderer/previewJumpToSource";

function buildPreview(html: string): HTMLElement {
  const container = document.createElement("article");
  container.className = "preview";
  container.innerHTML = html;
  return container;
}

describe("Preview double-click jump-to-source (#504)", () => {
  it("declares the ignored-target selector list from decision D5", () => {
    expect(PREVIEW_JUMP_IGNORED_TARGET_SELECTOR).toBe(
      'a, img, button, input, textarea, select, label, summary, video, audio, [contenteditable], [role="button"], [role="link"]'
    );
  });

  describe("resolvePreviewJumpTarget", () => {
    it("resolves a plain block to its 1-based source line", () => {
      const container = buildPreview('<p data-source-line="3">First paragraph.</p>');
      const p = container.querySelector("p")!;

      const resolution = resolvePreviewJumpTarget(p, container);

      expect(resolution).toEqual({ kind: "line", sourceLine: 3 });
    });

    it("uses the innermost [data-source-line] ancestor for a <p> nested in an <li>", () => {
      const container = buildPreview(
        '<ul data-source-line="1"><li data-source-line="1"><p data-source-line="2">Nested paragraph.</p></li></ul>'
      );
      const p = container.querySelector("p")!;

      const resolution = resolvePreviewJumpTarget(p, container);

      expect(resolution).toEqual({ kind: "line", sourceLine: 2 });
    });

    it("reports noSourceLine when the event target is a bare text node, not an Element", () => {
      const container = buildPreview('<p data-source-line="2">text</p>');
      const textNode = container.querySelector("p")!.firstChild!;

      const resolution = resolvePreviewJumpTarget(textNode as unknown as EventTarget, container);

      expect(resolution).toEqual({ kind: "noSourceLine" });
    });

    it("jumps from inside a code block", () => {
      const container = buildPreview(
        '<pre data-source-line="4"><code>const x = 1;</code></pre>'
      );
      const code = container.querySelector("code")!;

      const resolution = resolvePreviewJumpTarget(code, container);

      expect(resolution).toEqual({ kind: "line", sourceLine: 4 });
    });

    it("reports noSourceLine when no ancestor carries data-source-line", () => {
      const container = buildPreview('<div class="empty">no anchors here</div>');
      const div = container.querySelector("div")!;

      const resolution = resolvePreviewJumpTarget(div, container);

      expect(resolution).toEqual({ kind: "noSourceLine" });
    });

    it("reports invalidLine for a non-numeric data-source-line", () => {
      const container = buildPreview('<p data-source-line="not-a-number">Text</p>');
      const p = container.querySelector("p")!;

      const resolution = resolvePreviewJumpTarget(p, container);

      expect(resolution).toEqual({ kind: "invalidLine", rawValue: "not-a-number" });
    });

    it("reports invalidLine for a zero or negative data-source-line", () => {
      const container = buildPreview('<p data-source-line="0">Text</p>');
      const p = container.querySelector("p")!;

      const resolution = resolvePreviewJumpTarget(p, container);

      expect(resolution).toEqual({ kind: "invalidLine", rawValue: "0" });
    });

    it("ignores a link nested inside a source-lined paragraph", () => {
      const container = buildPreview(
        '<p data-source-line="5">See <a href="https://example.com">this link</a>.</p>'
      );
      const a = container.querySelector("a")!;

      const resolution = resolvePreviewJumpTarget(a, container);

      expect(resolution).toEqual({ kind: "ignoredTarget" });
    });

    it("ignores an image target", () => {
      const container = buildPreview(
        '<p data-source-line="5"><img src="foo.png" alt="" /></p>'
      );
      const img = container.querySelector("img")!;

      const resolution = resolvePreviewJumpTarget(img, container);

      expect(resolution).toEqual({ kind: "ignoredTarget" });
    });

    it("ignores a contenteditable target", () => {
      const container = buildPreview(
        '<div data-source-line="5"><span contenteditable="true">edit me</span></div>'
      );
      const span = container.querySelector("span")!;

      const resolution = resolvePreviewJumpTarget(span, container);

      expect(resolution).toEqual({ kind: "ignoredTarget" });
    });

    it("does not resolve to an ancestor outside the given container", () => {
      const outer = document.createElement("div");
      outer.setAttribute("data-source-line", "99");
      const container = document.createElement("article");
      outer.appendChild(container);
      const inner = document.createElement("span");
      container.appendChild(inner);

      const resolution = resolvePreviewJumpTarget(inner, container);

      expect(resolution).toEqual({ kind: "noSourceLine" });
    });
  });

  describe("isPreviewJumpModifierHeld", () => {
    const base = { ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };

    it("is false for a plain double-click", () => {
      expect(isPreviewJumpModifierHeld(base)).toBe(false);
    });

    it("is true when any single modifier key is held", () => {
      expect(isPreviewJumpModifierHeld({ ...base, ctrlKey: true })).toBe(true);
      expect(isPreviewJumpModifierHeld({ ...base, metaKey: true })).toBe(true);
      expect(isPreviewJumpModifierHeld({ ...base, shiftKey: true })).toBe(true);
      expect(isPreviewJumpModifierHeld({ ...base, altKey: true })).toBe(true);
    });
  });

  describe("clampPreviewJumpLine", () => {
    it("passes through a line within range unclamped", () => {
      expect(clampPreviewJumpLine(3, 10)).toEqual({ targetLine: 3, clamped: false });
    });

    it("clamps a line beyond the document's line count to the last line", () => {
      expect(clampPreviewJumpLine(50, 10)).toEqual({ targetLine: 10, clamped: true });
    });

    it("passes through a line exactly at the document's line count unclamped", () => {
      expect(clampPreviewJumpLine(10, 10)).toEqual({ targetLine: 10, clamped: false });
    });
  });
});
