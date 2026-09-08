import { describe, expect, it } from "vitest";
import {
  addSourcePaths,
  bulkTextImportDestinationLabel,
  bulkTextImportInputsKey,
  bulkTextImportInputsReady,
  createInitialBulkTextImportDialogState,
  isStaleDryRunResponse,
  removeSourcePath,
  textImportBomKindKey,
  textImportEncodingNameKey,
  textImportSkipReasonKey
} from "../../src/renderer/dialog/bulkTextImportDialogState";
import {
  TEXT_IMPORT_ENCODINGS,
  TEXT_IMPORT_SKIP_REASONS
} from "../../src/shared/textImport";

describe("bulkTextImportDialogState", () => {
  describe("createInitialBulkTextImportDialogState", () => {
    it("starts with no destination, no sources and an idle dry-run", () => {
      const state = createInitialBulkTextImportDialogState();
      expect(state.destinationFolderProjectRelativePath).toBeNull();
      expect(state.sourcePaths).toEqual([]);
      expect(state.dryRunStatus).toBe("idle");
      expect(state.dryRunResult).toBeUndefined();
      expect(state.dryRunRequestId).toBe(0);
    });

    it("returns a fresh array each call", () => {
      expect(createInitialBulkTextImportDialogState().sourcePaths).not.toBe(
        createInitialBulkTextImportDialogState().sourcePaths
      );
    });
  });

  describe("addSourcePaths", () => {
    it("appends new paths preserving add order", () => {
      expect(addSourcePaths(["/a"], ["/b", "/c"])).toEqual(["/a", "/b", "/c"]);
    });

    it("drops duplicates against the current list and within the batch", () => {
      expect(addSourcePaths(["/a"], ["/a", "/b", "/b"])).toEqual(["/a", "/b"]);
    });

    it("trims entries and ignores blanks", () => {
      expect(addSourcePaths([], ["  /a  ", "   ", ""])).toEqual(["/a"]);
    });

    it("returns the same reference when nothing is added", () => {
      const current = ["/a", "/b"];
      expect(addSourcePaths(current, ["/a"])).toBe(current);
      expect(addSourcePaths(current, [])).toBe(current);
    });
  });

  describe("removeSourcePath", () => {
    it("removes the matching entry", () => {
      expect(removeSourcePath(["/a", "/b", "/c"], "/b")).toEqual(["/a", "/c"]);
    });

    it("returns the same reference when the path is absent", () => {
      const current = ["/a", "/b"];
      expect(removeSourcePath(current, "/x")).toBe(current);
    });
  });

  describe("bulkTextImportInputsReady", () => {
    it("is false until a destination and at least one source exist", () => {
      expect(
        bulkTextImportInputsReady({
          destinationFolderProjectRelativePath: null,
          sourcePaths: ["/a"]
        })
      ).toBe(false);
      expect(
        bulkTextImportInputsReady({
          destinationFolderProjectRelativePath: "docs",
          sourcePaths: []
        })
      ).toBe(false);
    });

    it("treats the project root ('') as a valid destination", () => {
      expect(
        bulkTextImportInputsReady({
          destinationFolderProjectRelativePath: "",
          sourcePaths: ["/a"]
        })
      ).toBe(true);
    });
  });

  describe("bulkTextImportInputsKey", () => {
    it("changes when the destination changes", () => {
      const a = bulkTextImportInputsKey({
        destinationFolderProjectRelativePath: "docs",
        sourcePaths: ["/a"]
      });
      const b = bulkTextImportInputsKey({
        destinationFolderProjectRelativePath: "notes",
        sourcePaths: ["/a"]
      });
      expect(a).not.toBe(b);
    });

    it("changes when the source list changes", () => {
      const a = bulkTextImportInputsKey({
        destinationFolderProjectRelativePath: "docs",
        sourcePaths: ["/a"]
      });
      const b = bulkTextImportInputsKey({
        destinationFolderProjectRelativePath: "docs",
        sourcePaths: ["/a", "/b"]
      });
      expect(a).not.toBe(b);
    });

    it("distinguishes the unset destination from the project root", () => {
      expect(
        bulkTextImportInputsKey({
          destinationFolderProjectRelativePath: null,
          sourcePaths: []
        })
      ).not.toBe(
        bulkTextImportInputsKey({
          destinationFolderProjectRelativePath: "",
          sourcePaths: []
        })
      );
    });
  });

  describe("isStaleDryRunResponse", () => {
    it("is true for any id other than the current request id", () => {
      expect(isStaleDryRunResponse({ dryRunRequestId: 5 }, 4)).toBe(true);
      expect(isStaleDryRunResponse({ dryRunRequestId: 5 }, 6)).toBe(true);
    });

    it("is false for the current request id", () => {
      expect(isStaleDryRunResponse({ dryRunRequestId: 5 }, 5)).toBe(false);
    });
  });

  describe("label key helpers", () => {
    it("maps every skip reason to a defined translation key", () => {
      for (const reason of TEXT_IMPORT_SKIP_REASONS) {
        expect(textImportSkipReasonKey(reason)).toBe(
          `textImport.dialog.skipReason.${reason}`
        );
      }
    });

    it("maps every encoding to a defined translation key", () => {
      for (const encoding of TEXT_IMPORT_ENCODINGS) {
        expect(textImportEncodingNameKey(encoding)).toBe(
          `textImport.dialog.encodingName.${encoding}`
        );
      }
    });

    it("maps every BOM kind to a defined translation key", () => {
      for (const bomKind of ["none", "utf8", "utf16le", "utf16be"] as const) {
        expect(textImportBomKindKey(bomKind)).toBe(
          `textImport.dialog.bomKind.${bomKind}`
        );
      }
    });
  });

  describe("bulkTextImportDestinationLabel", () => {
    it("shows the root label for the empty path", () => {
      expect(bulkTextImportDestinationLabel("", "ROOT")).toBe("ROOT");
    });

    it("shows the relative path for a nested folder", () => {
      expect(bulkTextImportDestinationLabel("docs/ch", "ROOT")).toBe("docs/ch");
    });
  });
});
