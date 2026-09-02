import { describe, expect, it } from "vitest";
import type { GlossaryEntry, GlossaryTag } from "../../src/shared/glossary";
import {
  createLoadedGlossarySidebarState,
  preserveGlossarySelection,
  preserveGlossaryTagFilter,
  shouldApplyGlossaryLoadResult
} from "../../src/renderer/glossarySidebarState";
import {
  GLOSSARY_TAG_FILTER_ALL,
  GLOSSARY_TAG_FILTER_NONE,
  glossaryTagFilterForTagId
} from "../../src/renderer/glossaryNavigatorSearch";

const ts = "2026-09-02T00:00:00.000Z";

function entry(id: string, value: string): GlossaryEntry {
  return {
    id,
    description: "",
    atoms: [
      {
        id: `${id}-atom`,
        entryId: id,
        sortOrder: 0,
        value,
        matchFlags: 0,
        createdAt: ts,
        updatedAt: ts
      }
    ],
    tags: [],
    createdAt: ts,
    updatedAt: ts
  };
}

function tag(id: string, label: string): GlossaryTag {
  return {
    id,
    label,
    description: null,
    backgroundRgb: "#123456",
    foregroundRgb: "#ffffff",
    sortOrder: 0,
    createdAt: ts,
    updatedAt: ts
  };
}

const existingEntry = entry("018f4b8c-7a2b-7c3d-8e4f-123456789abc", "王都");
const newlyCreatedEntry = entry(
  "018f4b8c-7a2b-7c3d-8e4f-223456789abd",
  "アルセリア"
);
const tagA = tag("018f4b8c-7a2b-7c3d-8e4f-300000000001", "地名");

describe("GlossarySidebarState reload behavior (#375)", () => {
  it("keeps the current selection when it still exists after a reload", () => {
    const state = createLoadedGlossarySidebarState(
      [existingEntry, newlyCreatedEntry],
      [tagA],
      existingEntry.id
    );

    expect(state.status).toBe("loaded");
    expect(state.entries).toEqual([existingEntry, newlyCreatedEntry]);
    expect(state.tags).toEqual([tagA]);
    expect(state.selectedEntryId).toBe(existingEntry.id);
  });

  it("clears the selection once the selected entry disappears from a reload", () => {
    expect(
      preserveGlossarySelection([newlyCreatedEntry], existingEntry.id)
    ).toBeNull();
  });

  it("drops a `tag` filter whose tag is gone, but keeps `all` / `none`", () => {
    const tagFilter = glossaryTagFilterForTagId(tagA.id);

    expect(preserveGlossaryTagFilter([tagA], tagFilter)).toBe(tagFilter);
    expect(preserveGlossaryTagFilter([], tagFilter)).toEqual(
      GLOSSARY_TAG_FILTER_ALL
    );
    expect(
      preserveGlossaryTagFilter([], GLOSSARY_TAG_FILTER_ALL)
    ).toEqual(GLOSSARY_TAG_FILTER_ALL);
    expect(
      preserveGlossaryTagFilter([], GLOSSARY_TAG_FILTER_NONE)
    ).toEqual(GLOSSARY_TAG_FILTER_NONE);
  });

  it("only applies the most recent of overlapping reload requests", () => {
    expect(shouldApplyGlossaryLoadResult(2, 1)).toBe(false);
    expect(shouldApplyGlossaryLoadResult(2, 2)).toBe(true);
  });
});
