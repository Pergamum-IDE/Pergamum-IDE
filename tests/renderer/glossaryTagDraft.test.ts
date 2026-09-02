import { describe, expect, it } from "vitest";
import type { GlossaryTag } from "../../src/shared/glossary";
import {
  createGlossaryTagDraftFromTag,
  createNewGlossaryTagDraft,
  glossaryTagDraftCreateInput,
  glossaryTagDraftPreview,
  glossaryTagDraftUpdateInput,
  glossaryTagDraftValidity
} from "../../src/renderer/glossaryTagDraft";

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
  it("createNewGlossaryTagDraft has no tagId and a random background", () => {
    const draft = createNewGlossaryTagDraft(() => 0.25);
    expect(draft.tagId).toBeNull();
    expect(draft.label).toBe("");
    expect(draft.backgroundRgb).toBe("#404040");
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

  it("validity flags an empty label and malformed colors", () => {
    const base = createGlossaryTagDraftFromTag(tag);
    expect(glossaryTagDraftValidity(base)).toEqual({ ok: true });
    expect(
      glossaryTagDraftValidity({ ...base, label: "   " })
    ).toEqual({ ok: false, reason: "emptyLabel" });
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
