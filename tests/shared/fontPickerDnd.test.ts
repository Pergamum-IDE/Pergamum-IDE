import { describe, expect, it } from "vitest";
import {
  insertSelectedFont,
  moveSelectedFont,
  removeSelectedFontAt
} from "../../src/shared/fontPickerDnd";
import type { FontFamilySetting } from "../../src/shared/fontSettings";

const A: FontFamilySetting = { family: "Cascadia Code", displayName: "Cascadia Code" };
const B: FontFamilySetting = { family: "BIZ UD Gothic", displayName: "BIZ UD Gothic" };
const C: FontFamilySetting = { family: "Yu Gothic", displayName: "Yu Gothic" };

describe("fontPickerDnd (#494)", () => {
  describe("moveSelectedFont", () => {
    it("moves an item from a lower index to a higher index", () => {
      expect(moveSelectedFont([A, B, C], 0, 2)).toEqual([B, C, A]);
    });

    it("moves an item from a higher index to a lower index", () => {
      expect(moveSelectedFont([A, B, C], 2, 1)).toEqual([A, C, B]);
    });

    it("moving an item to its own index is a no-op", () => {
      const list = [A, B, C];
      expect(moveSelectedFont(list, 1, 1)).toEqual(list);
    });

    it("treats an out-of-range source index as a no-op", () => {
      const list = [A, B, C];
      expect(moveSelectedFont(list, 5, 0)).toEqual(list);
      expect(moveSelectedFont(list, -1, 0)).toEqual(list);
    });

    it("treats an out-of-range target index as a no-op", () => {
      const list = [A, B, C];
      expect(moveSelectedFont(list, 0, -1)).toEqual(list);
      expect(moveSelectedFont(list, 0, 4)).toEqual(list);
    });

    it("reorders a selected font that is missing from the cache the same way as any other", () => {
      const missing: FontFamilySetting = { family: "NonExistentFont", displayName: "NonExistentFont" };
      expect(moveSelectedFont([A, missing, C], 1, 0)).toEqual([missing, A, C]);
    });

    it("does not mutate the original array", () => {
      const list = [A, B, C];
      const snapshot = [...list];
      moveSelectedFont(list, 0, 2);
      expect(list).toEqual(snapshot);
    });
  });

  describe("insertSelectedFont", () => {
    it("inserts an available font at a specific selected index", () => {
      expect(insertSelectedFont([A, B], C, 1)).toEqual([A, C, B]);
    });

    it("appends on an empty-space drop (index defaults to the end)", () => {
      expect(insertSelectedFont([A, B], C)).toEqual([A, B, C]);
      expect(insertSelectedFont([A, B], C, 99)).toEqual([A, B, C]);
    });

    it("rejects a duplicate adopt as a no-op", () => {
      const list = [A, B];
      expect(insertSelectedFont(list, A, 0)).toEqual(list);
      // Case-insensitive family match also counts as a duplicate.
      expect(
        insertSelectedFont(list, { family: "cascadia code", displayName: "Cascadia" }, 0)
      ).toEqual(list);
    });

    it("rejects a generic fallback family as a no-op", () => {
      const list = [A];
      expect(insertSelectedFont(list, { family: "sans-serif" }, 0)).toEqual(list);
      expect(insertSelectedFont(list, { family: "Monospace" }, 0)).toEqual(list);
    });

    it("does not mutate the original array", () => {
      const list = [A, B];
      const snapshot = [...list];
      insertSelectedFont(list, C, 1);
      expect(list).toEqual(snapshot);
    });
  });

  describe("removeSelectedFontAt", () => {
    it("removes the selected font at the given index", () => {
      expect(removeSelectedFontAt([A, B, C], 1)).toEqual([A, C]);
    });

    it("treats an out-of-range index as a no-op", () => {
      const list = [A, B];
      expect(removeSelectedFontAt(list, 5)).toEqual(list);
      expect(removeSelectedFontAt(list, -1)).toEqual(list);
    });

    it("does not mutate the original array", () => {
      const list = [A, B, C];
      const snapshot = [...list];
      removeSelectedFontAt(list, 1);
      expect(list).toEqual(snapshot);
    });
  });
});
