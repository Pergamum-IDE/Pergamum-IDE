import { describe, expect, it } from "vitest";
import type { GlossaryTag } from "../../src/shared/glossary";
import {
  createGlossaryTagDraftFromTag,
  createNewGlossaryTagDraft,
  glossaryTagDraftCreateInput,
  glossaryTagDraftPreview,
  glossaryTagDraftUpdateInput,
  glossaryTagDraftValidity,
  randomizeGlossaryTagDraftColors
} from "../../src/renderer/glossaryTagDraft";
import { autoGlossaryTagForegroundRgb } from "../../src/shared/glossaryTagColor";

const tag: GlossaryTag = {
  id: "018f4b8c-7a2b-7c3d-8e4f-300000000001",
  label: "武将",
  description: "戦国期の武人",
  backgroundRgb: "#1f77b4",
  foregroundRgb: "#ffffff",
  sortOrder: 0,
  createdAt: "2026-09-02T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z"
};

describe("glossaryTagDraft (#375)", () => {
  it("createNewGlossaryTagDraft has no tagId, a random background, and a YIQ foreground", () => {
    const draft = createNewGlossaryTagDraft(() => 0.25);
    expect(draft.tagId).toBeNull();
    expect(draft.label).toBe("");
    expect(draft.backgroundRgb).toBe("#404040");
    expect(draft.foregroundRgb).toBe(
      autoGlossaryTagForegroundRgb("#404040")
    );
  });

  it("randomizeGlossaryTagDraftColors changes the background AND recomputes the foreground (YIQ)", () => {
    const base = createGlossaryTagDraftFromTag(tag);
    // random → 0.99 for every channel → a near-white background → #000000 fg.
    const next = randomizeGlossaryTagDraftColors(base, () => 0.99);

    expect(next.backgroundRgb).toMatch(/^#[0-9a-f]{6}$/);
    expect(next.backgroundRgb).not.toBe(base.backgroundRgb);
    expect(next.foregroundRgb).toBe(
      autoGlossaryTagForegroundRgb(next.backgroundRgb)
    );
    expect(next.foregroundRgb).toBe("#000000");
    // label / description are untouched.
    expect(next.label).toBe(base.label);
    expect(next.description).toBe(base.description);
  });

  it("createGlossaryTagDraftFromTag maps null description to ''", () => {
    expect(
      createGlossaryTagDraftFromTag({ ...tag, description: null }).description
    ).toBe("");
    expect(createGlossaryTagDraftFromTag(tag)).toMatchObject({
      tagId: tag.id,
      label: "武将",
      description: "戦国期の武人",
      backgroundRgb: "#1f77b4"
    });
  });

  it("validity flags an empty label, an over-32-char label, and malformed colors", () => {
    const base = createGlossaryTagDraftFromTag(tag);
    expect(glossaryTagDraftValidity(base)).toEqual({ ok: true });
    expect(
      glossaryTagDraftValidity({ ...base, label: "   " })
    ).toEqual({ ok: false, reason: "emptyLabel" });
    // Exactly 32 chars (trimmed) is still valid.
    expect(
      glossaryTagDraftValidity({ ...base, label: `  ${"あ".repeat(32)}  ` })
    ).toEqual({ ok: true });
    // 33 chars after trimming is rejected.
    expect(
      glossaryTagDraftValidity({ ...base, label: "あ".repeat(33) })
    ).toEqual({ ok: false, reason: "labelTooLong" });
    expect(
      glossaryTagDraftValidity({ ...base, backgroundRgb: "xyz" })
    ).toEqual({ ok: false, reason: "invalidBackground" });
    expect(
      glossaryTagDraftValidity({ ...base, foregroundRgb: "#12" })
    ).toEqual({ ok: false, reason: "invalidForeground" });
  });

  it("preview normalizes valid colors and falls back for invalid ones", () => {
    expect(
      glossaryTagDraftPreview({
        ...createGlossaryTagDraftFromTag(tag),
        backgroundRgb: "#ABC",
        foregroundRgb: "not-a-color"
      })
    ).toEqual({
      label: "武将",
      backgroundRgb: "#aabbcc",
      foregroundRgb: "#25313d"
    });
  });

  it("create input trims label, normalizes colors, and nulls a blank description", () => {
    expect(
      glossaryTagDraftCreateInput({
        tagId: null,
        label: "  地名 ",
        description: "   ",
        backgroundRgb: "#AABBCC",
        foregroundRgb: "#000"
      })
    ).toEqual({
      label: "地名",
      description: null,
      backgroundRgb: "#aabbcc",
      foregroundRgb: "#000000"
    });
  });

  it("update input requires a tagId", () => {
    expect(
      glossaryTagDraftUpdateInput(createGlossaryTagDraftFromTag(tag)).id
    ).toBe(tag.id);
    expect(() =>
      glossaryTagDraftUpdateInput(createNewGlossaryTagDraft(() => 0.5))
    ).toThrow(/unsaved tag draft/);
  });
});
