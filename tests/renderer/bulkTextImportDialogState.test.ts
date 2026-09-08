import { describe, expect, it } from "vitest";
import {
  addSourcePaths,
  applyPreviewFailure,
  applyPreviewSuccess,
  applySelectedEncoding,
  buildFileRowViewStates,
  bulkTextImportDestinationLabel,
  bulkTextImportInputsKey,
  bulkTextImportInputsReady,
  createFileRowViewState,
  createInitialBulkTextImportDialogState,
  isStaleDryRunResponse,
  isStalePreviewResponse,
  isTextImportEncodingEditable,
  isTextImportPreviewFailureReason,
  removeSourcePath,
  textImportBomKindKey,
  textImportEncodingNameKey,
  textImportPreviewFailureReasonKey,
  textImportSkipReasonKey,
  type BulkTextImportFileRowViewState
} from "../../src/renderer/dialog/bulkTextImportDialogState";
import {
  TEXT_IMPORT_ENCODINGS,
  TEXT_IMPORT_SKIP_REASONS,
  type TextImportDryRunResult
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
      expect(state.fileRows).toEqual([]);
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

  // -------------------------------------------------------------------------
  // #420 Step 4: per-file encoding + preview row state
  // -------------------------------------------------------------------------

  function dryFile(
    overrides: Partial<{
      id: string;
      sourcePath: string;
      sourceDisplayPath: string;
      targetProjectRelativePath: string;
      selectedEncoding: (typeof TEXT_IMPORT_ENCODINGS)[number];
      bomKind: "none" | "utf8" | "utf16le" | "utf16be";
      renamed: boolean;
      skipped: boolean;
      skipReason?: (typeof TEXT_IMPORT_SKIP_REASONS)[number];
      previewHead: string;
      previewTail: string;
    }> = {}
  ) {
    return {
      id: overrides.id ?? "f1",
      sourcePath: overrides.sourcePath ?? "/ext/a.txt",
      sourceDisplayPath: overrides.sourceDisplayPath ?? "a.txt",
      targetProjectRelativePath:
        overrides.targetProjectRelativePath ?? "docs/a.md",
      originalTargetProjectRelativePath:
        overrides.targetProjectRelativePath ?? "docs/a.md",
      selectedEncoding: overrides.selectedEncoding ?? "shiftJis",
      bomKind: overrides.bomKind ?? "none",
      renamed: overrides.renamed ?? false,
      skipped: overrides.skipped ?? false,
      skipReason: overrides.skipReason,
      previewHead: overrides.previewHead ?? "head",
      previewTail: overrides.previewTail ?? "tail"
    };
  }

  function row(
    overrides: Partial<BulkTextImportFileRowViewState> = {}
  ): BulkTextImportFileRowViewState {
    return { ...createFileRowViewState(dryFile()), ...overrides };
  }

  describe("createFileRowViewState", () => {
    it("carries the dry-run fields and starts preview idle", () => {
      const r = createFileRowViewState(
        dryFile({ id: "x", selectedEncoding: "eucJp", previewHead: "H" })
      );
      expect(r.id).toBe("x");
      expect(r.selectedEncoding).toBe("eucJp");
      expect(r.previewHead).toBe("H");
      expect(r.previewStatus).toBe("idle");
      expect(r.previewRequestId).toBeUndefined();
      expect(r.decodeRecovered).toBe(false);
    });
  });

  describe("buildFileRowViewStates", () => {
    it("returns [] for an undefined or failed dry-run result", () => {
      expect(buildFileRowViewStates(undefined)).toEqual([]);
      expect(
        buildFileRowViewStates({ ok: false, reason: "noProject" })
      ).toEqual([]);
    });

    it("builds one row per file from an ok result", () => {
      const result: TextImportDryRunResult = {
        ok: true,
        files: [dryFile({ id: "a" }), dryFile({ id: "b" })],
        folders: []
      };
      const rows = buildFileRowViewStates(result);
      expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
      expect(rows.every((r) => r.previewStatus === "idle")).toBe(true);
      expect(rows.every((r) => r.previewRequestId === undefined)).toBe(true);
    });
  });

  describe("isTextImportEncodingEditable", () => {
    it("is true for a normal (non-skipped) row", () => {
      expect(isTextImportEncodingEditable(row({ skipped: false }))).toBe(true);
    });

    it("is true for a decodeFailed row that still has a source path", () => {
      expect(
        isTextImportEncodingEditable(
          row({ skipped: true, skipReason: "decodeFailed" })
        )
      ).toBe(true);
    });

    it("is false for skip reasons an encoding change cannot fix", () => {
      for (const reason of [
        "notTextFile",
        "invalidProjectPath",
        "targetExists",
        "sourceMissing",
        "sourceUnreadable",
        "unsupportedSource"
      ] as const) {
        expect(
          isTextImportEncodingEditable(row({ skipped: true, skipReason: reason }))
        ).toBe(false);
      }
    });

    it("is false when the row has no source path", () => {
      expect(
        isTextImportEncodingEditable(
          row({ sourcePath: "", skipped: true, skipReason: "decodeFailed" })
        )
      ).toBe(false);
    });
  });

  describe("applySelectedEncoding", () => {
    it("updates the encoding and moves the row into loading, tagged with the request id", () => {
      const rows = [row({ id: "f1", selectedEncoding: "shiftJis" })];
      const next = applySelectedEncoding(rows, "f1", "eucJp", 7);
      expect(next).not.toBe(rows);
      expect(next[0].selectedEncoding).toBe("eucJp");
      expect(next[0].previewStatus).toBe("loading");
      expect(next[0].previewRequestId).toBe(7);
      expect(next[0].previewErrorReason).toBeUndefined();
    });

    it("returns the same reference when the row is missing / not editable / unchanged", () => {
      const rows = [
        row({ id: "f1", selectedEncoding: "shiftJis" }),
        row({
          id: "skip",
          skipped: true,
          skipReason: "targetExists",
          selectedEncoding: "shiftJis"
        })
      ];
      expect(applySelectedEncoding(rows, "missing", "eucJp", 1)).toBe(rows);
      expect(applySelectedEncoding(rows, "skip", "eucJp", 1)).toBe(rows);
      expect(applySelectedEncoding(rows, "f1", "shiftJis", 1)).toBe(rows);
    });
  });

  describe("isStalePreviewResponse", () => {
    it("is true for a missing row or a mismatched request id", () => {
      expect(isStalePreviewResponse(undefined, 1)).toBe(true);
      expect(isStalePreviewResponse({ previewRequestId: 2 }, 1)).toBe(true);
      expect(isStalePreviewResponse({ previewRequestId: undefined }, 1)).toBe(
        true
      );
    });

    it("is false only for the exact request id the row is waiting on", () => {
      expect(isStalePreviewResponse({ previewRequestId: 3 }, 3)).toBe(false);
    });
  });

  describe("applyPreviewSuccess", () => {
    it("applies head / tail / bom and marks the row ready for the matching request id", () => {
      const rows = applySelectedEncoding(
        [row({ id: "f1" })],
        "f1",
        "eucJp",
        4
      );
      const next = applyPreviewSuccess(rows, "f1", 4, {
        previewHead: "H2",
        previewTail: "T2",
        bomKind: "utf16le"
      });
      expect(next[0].previewStatus).toBe("ready");
      expect(next[0].previewHead).toBe("H2");
      expect(next[0].previewTail).toBe("T2");
      expect(next[0].bomKind).toBe("utf16le");
    });

    it("marks a decodeFailed row as decodeRecovered on success", () => {
      const rows = applySelectedEncoding(
        [row({ id: "f1", skipped: true, skipReason: "decodeFailed" })],
        "f1",
        "eucJp",
        5
      );
      const next = applyPreviewSuccess(rows, "f1", 5, {
        previewHead: "H",
        previewTail: "T",
        bomKind: "none"
      });
      expect(next[0].decodeRecovered).toBe(true);
    });

    it("ignores a stale request id", () => {
      const rows = applySelectedEncoding([row({ id: "f1" })], "f1", "eucJp", 6);
      expect(
        applyPreviewSuccess(rows, "f1", 5, {
          previewHead: "H",
          previewTail: "T",
          bomKind: "none"
        })
      ).toBe(rows);
    });
  });

  describe("applyPreviewFailure", () => {
    it("moves the row to failed with the given reason for the matching request id", () => {
      const rows = applySelectedEncoding([row({ id: "f1" })], "f1", "eucJp", 8);
      const next = applyPreviewFailure(rows, "f1", 8, "decodeFailed");
      expect(next[0].previewStatus).toBe("failed");
      expect(next[0].previewErrorReason).toBe("decodeFailed");
    });

    it("supports the batch-level updateFailed marker", () => {
      const rows = applySelectedEncoding([row({ id: "f1" })], "f1", "eucJp", 9);
      const next = applyPreviewFailure(rows, "f1", 9, "updateFailed");
      expect(next[0].previewErrorReason).toBe("updateFailed");
    });

    it("ignores a stale request id", () => {
      const rows = applySelectedEncoding([row({ id: "f1" })], "f1", "eucJp", 10);
      expect(applyPreviewFailure(rows, "f1", 9, "decodeFailed")).toBe(rows);
    });
  });

  describe("preview failure reason helpers", () => {
    it("isTextImportPreviewFailureReason accepts only concrete per-file reasons", () => {
      expect(isTextImportPreviewFailureReason("decodeFailed")).toBe(true);
      expect(isTextImportPreviewFailureReason("sourceMissing")).toBe(true);
      expect(isTextImportPreviewFailureReason("sourceUnreadable")).toBe(true);
      expect(isTextImportPreviewFailureReason("updateFailed")).toBe(false);
      expect(isTextImportPreviewFailureReason(undefined)).toBe(false);
    });

    it("textImportPreviewFailureReasonKey maps to the shared skip-reason keys", () => {
      expect(textImportPreviewFailureReasonKey("decodeFailed")).toBe(
        "textImport.dialog.skipReason.decodeFailed"
      );
      expect(textImportPreviewFailureReasonKey("sourceMissing")).toBe(
        "textImport.dialog.skipReason.sourceMissing"
      );
    });
  });
});
