import { describe, expect, it } from "vitest";
import {
  addSourcePaths,
  appendSourceBatch,
  applyBulkManualSkip,
  applyBulkPreviewResponse,
  applyBulkSelectedEncoding,
  collectBulkEncodingApplyRowIds,
  getExternalParentFolderPath,
  getExternalPathBaseName,
  groupBulkTextImportFileRows,
  isExternalPathSameOrDescendant,
  normalizeExternalPathForGrouping,
  resolveBulkEncodingControlValue,
  resolveSourceBatchIdForPath,
  textImportBatchHeadingKey,
  type TextImportSourceBatch,
  applyManualSkip,
  applyPreviewFailure,
  applyPreviewSuccess,
  applySelectedEncoding,
  applyTextImportExecutionStart,
  buildExecuteTextImportFileRequests,
  buildFileRowViewStates,
  bulkTextImportCanExecute,
  bulkTextImportDestinationLabel,
  bulkTextImportInputsKey,
  bulkTextImportInputsReady,
  collectImportableTextImportRows,
  createFileRowViewState,
  createInitialBulkTextImportDialogState,
  isStaleDryRunResponse,
  isStalePreviewResponse,
  isStaleTextImportExecutionResponse,
  isTextImportEncodingEditable,
  isTextImportPreviewFailureReason,
  isTextImportRowImportable,
  removeSourcePath,
  resetTextImportExecutionState,
  textImportBomKindKey,
  textImportEncodingNameKey,
  textImportExecutionSummaryKey,
  textImportExecutionSummaryKind,
  textImportPreviewFailureReasonKey,
  textImportSkipReasonKey,
  type BulkTextImportDialogState,
  type BulkTextImportFileRowViewState
} from "../../src/renderer/dialog/bulkTextImportDialogState";
import {
  TEXT_IMPORT_ENCODINGS,
  TEXT_IMPORT_SKIP_REASONS,
  type ExecuteTextImportResult,
  type PreviewTextImportFilesResult,
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
      expect(state.executionStatus).toBe("idle");
      expect(state.executionRequestId).toBe(0);
      expect(state.executionResult).toBeUndefined();
      expect(state.executionErrorMessage).toBeUndefined();
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
      expect(r.manualSkipped).toBe(false);
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

    it("is true for a manually skipped row so it can be restored", () => {
      expect(
        isTextImportEncodingEditable(
          row({ manualSkipped: true, selectedEncoding: "shiftJis" })
        )
      ).toBe(true);
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
    it("updates the encoding, clears manual skip and moves the row into loading", () => {
      const rows = [row({ id: "f1", selectedEncoding: "shiftJis" })];
      const next = applySelectedEncoding(rows, "f1", "eucJp", 7);
      expect(next).not.toBe(rows);
      expect(next[0].manualSkipped).toBe(false);
      expect(next[0].selectedEncoding).toBe("eucJp");
      expect(next[0].previewStatus).toBe("loading");
      expect(next[0].previewRequestId).toBe(7);
      expect(next[0].previewErrorReason).toBeUndefined();
    });

    it("clears manual skip and previews even when the encoding value is unchanged", () => {
      const rows = [
        row({
          id: "f1",
          manualSkipped: true,
          selectedEncoding: "shiftJis",
          previewStatus: "idle"
        })
      ];
      const next = applySelectedEncoding(rows, "f1", "shiftJis", 8);
      expect(next).not.toBe(rows);
      expect(next[0].manualSkipped).toBe(false);
      expect(next[0].selectedEncoding).toBe("shiftJis");
      expect(next[0].previewStatus).toBe("loading");
      expect(next[0].previewRequestId).toBe(8);
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

  describe("applyManualSkip", () => {
    it("marks one row manually skipped and invalidates an in-flight preview", () => {
      const rows = [
        row({
          id: "f1",
          previewStatus: "loading",
          previewErrorReason: "decodeFailed",
          previewRequestId: 12
        })
      ];
      const next = applyManualSkip(rows, "f1");
      expect(next).not.toBe(rows);
      expect(next[0].manualSkipped).toBe(true);
      expect(next[0].previewStatus).toBe("idle");
      expect(next[0].previewErrorReason).toBeUndefined();
      expect(next[0].previewRequestId).toBeUndefined();
    });

    it("returns the same reference when the row is missing, unchanged or not editable", () => {
      const rows = [
        row({ id: "manual", manualSkipped: true }),
        row({ id: "skip", skipped: true, skipReason: "targetExists" })
      ];
      expect(applyManualSkip(rows, "missing")).toBe(rows);
      expect(applyManualSkip(rows, "manual")).toBe(rows);
      expect(applyManualSkip(rows, "skip")).toBe(rows);
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

  // -------------------------------------------------------------------------
  // #420 Step 5: importable rows + execute request + result summary
  // -------------------------------------------------------------------------

  function readyState(
    overrides: Partial<BulkTextImportDialogState> = {}
  ): BulkTextImportDialogState {
    return {
      ...createInitialBulkTextImportDialogState(),
      destinationFolderProjectRelativePath: "docs",
      sourcePaths: ["/ext/a.txt"],
      dryRunStatus: "ready",
      fileRows: [row({ id: "f1" })],
      ...overrides
    };
  }

  describe("isTextImportRowImportable", () => {
    it("accepts a normal row with a source and target, preview idle or ready", () => {
      expect(isTextImportRowImportable(row({ previewStatus: "idle" }))).toBe(
        true
      );
      expect(isTextImportRowImportable(row({ previewStatus: "ready" }))).toBe(
        true
      );
    });

    it("accepts a decodeFailed row only once recovered with a ready preview", () => {
      expect(
        isTextImportRowImportable(
          row({
            skipped: true,
            skipReason: "decodeFailed",
            decodeRecovered: true,
            previewStatus: "ready"
          })
        )
      ).toBe(true);
      expect(
        isTextImportRowImportable(
          row({ skipped: true, skipReason: "decodeFailed", decodeRecovered: false })
        )
      ).toBe(false);
    });

    it("rejects preview loading / failed rows", () => {
      expect(
        isTextImportRowImportable(row({ previewStatus: "loading" }))
      ).toBe(false);
      expect(
        isTextImportRowImportable(row({ previewStatus: "failed" }))
      ).toBe(false);
    });

    it("rejects a row manually skipped from the dropdown", () => {
      expect(isTextImportRowImportable(row({ manualSkipped: true }))).toBe(
        false
      );
    });

    it("rejects rows with no source or no target path", () => {
      expect(isTextImportRowImportable(row({ sourcePath: "" }))).toBe(false);
      expect(
        isTextImportRowImportable(row({ targetProjectRelativePath: "" }))
      ).toBe(false);
    });

    it("rejects every non-decode skip reason", () => {
      for (const reason of [
        "targetExists",
        "notTextFile",
        "invalidProjectPath",
        "sourceMissing",
        "sourceUnreadable",
        "unsupportedSource"
      ] as const) {
        expect(
          isTextImportRowImportable(row({ skipped: true, skipReason: reason }))
        ).toBe(false);
      }
    });
  });

  describe("buildExecuteTextImportFileRequests", () => {
    it("keeps only importable rows and uses the row-local selected encoding", () => {
      const rows = [
        row({
          id: "ok",
          sourcePath: "/ext/ok.txt",
          targetProjectRelativePath: "docs/ok.md",
          selectedEncoding: "eucJp"
        }),
        row({
          id: "skip",
          sourcePath: "/ext/skip.txt",
          targetProjectRelativePath: "docs/skip.md",
          manualSkipped: true
        }),
        row({
          id: "dry-skip",
          sourcePath: "/ext/dry-skip.txt",
          targetProjectRelativePath: "docs/dry-skip.md",
          skipped: true,
          skipReason: "targetExists"
        }),
        row({
          id: "recovered",
          sourcePath: "/ext/rec.txt",
          targetProjectRelativePath: "docs/rec.md",
          skipped: true,
          skipReason: "decodeFailed",
          decodeRecovered: true,
          previewStatus: "ready",
          selectedEncoding: "utf16le"
        })
      ];
      expect(buildExecuteTextImportFileRequests(rows)).toEqual([
        {
          sourcePath: "/ext/ok.txt",
          targetProjectRelativePath: "docs/ok.md",
          encoding: "eucJp"
        },
        {
          sourcePath: "/ext/rec.txt",
          targetProjectRelativePath: "docs/rec.md",
          encoding: "utf16le"
        }
      ]);
    });

    it("never sets skipped / skipReason on an included row", () => {
      const [entry] = buildExecuteTextImportFileRequests([
        row({
          skipped: true,
          skipReason: "decodeFailed",
          decodeRecovered: true,
          previewStatus: "ready"
        })
      ]);
      expect(entry).not.toHaveProperty("skipped");
      expect(entry).not.toHaveProperty("skipReason");
    });
  });

  describe("collectImportableTextImportRows", () => {
    it("preserves display order", () => {
      const rows = [
        row({ id: "a" }),
        row({ id: "b", manualSkipped: true }),
        row({ id: "c" })
      ];
      expect(
        collectImportableTextImportRows(rows).map((r) => r.id)
      ).toEqual(["a", "c"]);
    });
  });

  describe("bulkTextImportCanExecute", () => {
    it("is true for a ready dry-run with an importable row and no preview loading", () => {
      expect(bulkTextImportCanExecute(readyState())).toBe(true);
    });

    it("is false without a destination / before dry-run ready", () => {
      expect(
        bulkTextImportCanExecute(
          readyState({ destinationFolderProjectRelativePath: null })
        )
      ).toBe(false);
      expect(
        bulkTextImportCanExecute(readyState({ dryRunStatus: "loading" }))
      ).toBe(false);
    });

    it("is false when no row is importable", () => {
      expect(
        bulkTextImportCanExecute(
          readyState({
            fileRows: [
              row({ skipped: true, skipReason: "targetExists" })
            ]
          })
        )
      ).toBe(false);
    });

    it("is false when every row is manually skipped", () => {
      expect(
        bulkTextImportCanExecute(
          readyState({
            fileRows: [row({ manualSkipped: true })]
          })
        )
      ).toBe(false);
    });

    it("is false while any preview is updating", () => {
      expect(
        bulkTextImportCanExecute(
          readyState({
            fileRows: [row({ id: "a" }), row({ id: "b", previewStatus: "loading" })]
          })
        )
      ).toBe(false);
    });

    it("is false while importing and after a completed run", () => {
      expect(
        bulkTextImportCanExecute(readyState({ executionStatus: "importing" }))
      ).toBe(false);
      expect(
        bulkTextImportCanExecute(readyState({ executionStatus: "completed" }))
      ).toBe(false);
    });

    it("is true again after a failed run (retry allowed)", () => {
      expect(
        bulkTextImportCanExecute(readyState({ executionStatus: "failed" }))
      ).toBe(true);
    });
  });

  describe("applyTextImportExecutionStart / isStaleTextImportExecutionResponse", () => {
    it("moves to importing tagged with the request id and clears old results", () => {
      const started = applyTextImportExecutionStart(
        readyState({
          executionStatus: "failed",
          executionErrorMessage: "old",
          executionResult: { ok: false, reason: "x" }
        }),
        7
      );
      expect(started.executionStatus).toBe("importing");
      expect(started.executionRequestId).toBe(7);
      expect(started.executionResult).toBeUndefined();
      expect(started.executionErrorMessage).toBeUndefined();
    });

    it("flags any response id other than the current one as stale", () => {
      expect(isStaleTextImportExecutionResponse({ executionRequestId: 7 }, 6)).toBe(
        true
      );
      expect(isStaleTextImportExecutionResponse({ executionRequestId: 7 }, 7)).toBe(
        false
      );
    });
  });

  describe("resetTextImportExecutionState", () => {
    it("clears a finished result but keeps the monotonic request id", () => {
      const reset = resetTextImportExecutionState(
        readyState({
          executionStatus: "completed",
          executionRequestId: 3,
          executionResult: { ok: true, imported: [], skipped: [], failed: [] }
        })
      );
      expect(reset.executionStatus).toBe("idle");
      expect(reset.executionResult).toBeUndefined();
      expect(reset.executionRequestId).toBe(3);
    });

    it("returns the same reference when already idle", () => {
      const s = readyState();
      expect(resetTextImportExecutionState(s)).toBe(s);
    });
  });

  describe("textImportExecutionSummaryKind", () => {
    const okResult = (
      imported: number,
      skipped: number,
      failed: number
    ): ExecuteTextImportResult => ({
      ok: true,
      imported: Array.from({ length: imported }, (_, i) => ({
        sourcePath: `/ext/i${i}.txt`,
        targetProjectRelativePath: `docs/i${i}.md`
      })),
      skipped: Array.from({ length: skipped }, (_, i) => ({
        sourcePath: `/ext/s${i}.txt`,
        reason: "targetExists" as const
      })),
      failed: Array.from({ length: failed }, (_, i) => ({
        sourcePath: `/ext/f${i}.txt`,
        reason: "sourceUnreadable" as const
      }))
    });

    it("is completed only when every file imported", () => {
      expect(textImportExecutionSummaryKind(okResult(3, 0, 0))).toBe("completed");
    });

    it("is partial when some imported and some did not", () => {
      expect(textImportExecutionSummaryKind(okResult(2, 1, 0))).toBe("partial");
      expect(textImportExecutionSummaryKind(okResult(2, 0, 1))).toBe("partial");
    });

    it("is failed for a top-level failure or an ok result with nothing imported", () => {
      expect(
        textImportExecutionSummaryKind({ ok: false, reason: "noProject" })
      ).toBe("failed");
      expect(textImportExecutionSummaryKind(okResult(0, 2, 1))).toBe("failed");
    });

    it("maps each kind to a translation key", () => {
      expect(textImportExecutionSummaryKey("completed")).toBe(
        "textImport.dialog.importCompleted"
      );
      expect(textImportExecutionSummaryKey("partial")).toBe(
        "textImport.dialog.importPartialFailure"
      );
      expect(textImportExecutionSummaryKey("failed")).toBe(
        "textImport.dialog.importFailed"
      );
    });
  });
});

// ---------------------------------------------------------------------------
// #420 Step 8: source batches, folder grouping, bulk encoding control
// ---------------------------------------------------------------------------

describe("bulkTextImportDialogState — #420 Step 8", () => {
  function step8Row(
    overrides: Partial<BulkTextImportFileRowViewState> = {}
  ): BulkTextImportFileRowViewState {
    return {
      id: "f1",
      sourcePath: "/ext/A/a1.txt",
      sourceDisplayPath: "a1.txt",
      targetProjectRelativePath: "docs/A/a1.md",
      renamed: false,
      skipped: false,
      skipReason: undefined,
      manualSkipped: false,
      selectedEncoding: "utf8",
      bomKind: "none",
      previewHead: "head",
      previewTail: "tail",
      previewStatus: "idle",
      previewErrorReason: undefined,
      previewRequestId: undefined,
      decodeRecovered: false,
      sourceBatchId: "text-import-batch-1",
      sourceFolderGroupKey: "text-import-batch-1\u0000/ext/A",
      ...overrides
    };
  }

  describe("path string helpers", () => {
    it("normalizes both separators and trims a trailing slash", () => {
      expect(normalizeExternalPathForGrouping("C:\\works\\input\\A\\")).toBe(
        "C:/works/input/A"
      );
      expect(normalizeExternalPathForGrouping("  /ext/A/  ")).toBe("/ext/A");
      expect(normalizeExternalPathForGrouping("/")).toBe("/");
    });

    it("returns the parent folder for Windows and POSIX paths", () => {
      expect(getExternalParentFolderPath("C:\\works\\input\\A\\a1.txt")).toBe(
        "C:/works/input/A"
      );
      expect(getExternalParentFolderPath("/ext/A/a1.txt")).toBe("/ext/A");
      expect(getExternalParentFolderPath("/a.txt")).toBe("/");
      expect(getExternalParentFolderPath("bare.txt")).toBe("");
    });

    it("detects same-or-descendant across separators", () => {
      expect(
        isExternalPathSameOrDescendant("C:\\a\\b\\c.txt", "C:/a/b")
      ).toBe(true);
      expect(isExternalPathSameOrDescendant("/ext/A", "/ext/A")).toBe(true);
      expect(isExternalPathSameOrDescendant("/ext/AB/x.txt", "/ext/A")).toBe(
        false
      );
      expect(isExternalPathSameOrDescendant("/ext/A/x.txt", "")).toBe(false);
    });

    it("returns the trailing file name for a grouped row", () => {
      expect(
        getExternalPathBaseName("C:\\works\\Pergamum\\euc-jp.txt")
      ).toBe("euc-jp.txt");
      expect(getExternalPathBaseName("/ext/input/A/a1.txt")).toBe("a1.txt");
      expect(getExternalPathBaseName("plain.txt")).toBe("plain.txt");
      expect(getExternalPathBaseName("/ext/dir/")).toBe("dir");
    });
  });

  describe("appendSourceBatch", () => {
    it("creates exactly one batch for a drop of new paths", () => {
      const state = createInitialBulkTextImportDialogState();
      const next = appendSourceBatch(state, "drop", ["/ext/A", "/ext/B"]);
      expect(next.sourceBatches).toHaveLength(1);
      expect(next.sourceBatches[0]).toMatchObject({
        kind: "drop",
        createdOrder: 1,
        sourcePaths: ["/ext/A", "/ext/B"]
      });
      expect(next.sourcePaths).toEqual(["/ext/A", "/ext/B"]);
    });

    it("assigns kind per operation and keeps add order", () => {
      let state = createInitialBulkTextImportDialogState();
      state = appendSourceBatch(state, "drop", ["/ext/A"]);
      state = appendSourceBatch(state, "filePicker", ["/ext/x.txt"]);
      state = appendSourceBatch(state, "folderPicker", ["/ext/C"]);
      expect(state.sourceBatches.map((b) => b.kind)).toEqual([
        "drop",
        "filePicker",
        "folderPicker"
      ]);
      expect(state.sourceBatches.map((b) => b.createdOrder)).toEqual([1, 2, 3]);
      expect(state.sourcePaths).toEqual(["/ext/A", "/ext/x.txt", "/ext/C"]);
    });

    it("does not create a batch for a duplicate-only or cancelled add", () => {
      let state = createInitialBulkTextImportDialogState();
      state = appendSourceBatch(state, "drop", ["/ext/A"]);
      expect(appendSourceBatch(state, "drop", ["/ext/A"])).toBe(state);
      expect(appendSourceBatch(state, "filePicker", [])).toBe(state);
      expect(state.sourceBatches).toHaveLength(1);
    });

    it("keeps only the genuinely new paths in a batch", () => {
      let state = createInitialBulkTextImportDialogState();
      state = appendSourceBatch(state, "drop", ["/ext/A"]);
      state = appendSourceBatch(state, "drop", ["/ext/A", "/ext/B"]);
      expect(state.sourceBatches[1].sourcePaths).toEqual(["/ext/B"]);
      const flatFromBatches = state.sourceBatches.flatMap((b) => b.sourcePaths);
      expect(flatFromBatches).toEqual(state.sourcePaths);
    });
  });

  describe("resolveSourceBatchIdForPath + buildFileRowViewStates", () => {
    const batches: TextImportSourceBatch[] = [
      {
        id: "text-import-batch-1",
        kind: "folderPicker",
        sourcePaths: ["C:\\works\\input\\A"],
        createdOrder: 1
      },
      {
        id: "text-import-batch-2",
        kind: "filePicker",
        sourcePaths: ["/ext/misc/single.txt"],
        createdOrder: 2
      }
    ];

    it("matches a file under a folder batch (Windows separators)", () => {
      expect(
        resolveSourceBatchIdForPath("C:/works/input/A/a1.txt", batches)
      ).toBe("text-import-batch-1");
    });

    it("matches an exact file path in a picker batch", () => {
      expect(
        resolveSourceBatchIdForPath("/ext/misc/single.txt", batches)
      ).toBe("text-import-batch-2");
    });

    it("falls back to the most recent batch when nothing matches", () => {
      expect(resolveSourceBatchIdForPath("/ext/orphan.txt", batches)).toBe(
        "text-import-batch-2"
      );
    });

    it("returns '' when there are no batches", () => {
      expect(resolveSourceBatchIdForPath("/ext/a.txt", [])).toBe("");
    });

    it("tags dry-run rows with a batch id and a folder group key", () => {
      const result: TextImportDryRunResult = {
        ok: true,
        files: [
          {
            id: "a1",
            sourcePath: "C:/works/input/A/a1.txt",
            sourceDisplayPath: "a1.txt",
            targetProjectRelativePath: "docs/A/a1.md",
            originalTargetProjectRelativePath: "docs/A/a1.md",
            selectedEncoding: "utf8",
            bomKind: "none",
            renamed: false,
            skipped: false,
            previewHead: "",
            previewTail: ""
          }
        ],
        folders: []
      };
      const [r] = buildFileRowViewStates(result, batches);
      expect(r.sourceBatchId).toBe("text-import-batch-1");
      expect(r.sourceFolderGroupKey).toBe(
        "text-import-batch-1\u0000C:/works/input/A"
      );
    });
  });

  describe("groupBulkTextImportFileRows", () => {
    const batches: TextImportSourceBatch[] = [
      {
        id: "b1",
        kind: "drop",
        sourcePaths: ["/ext/A", "/ext/B"],
        createdOrder: 1
      },
      {
        id: "b2",
        kind: "filePicker",
        sourcePaths: ["/ext/misc/one.txt"],
        createdOrder: 2
      }
    ];

    const rows = [
      step8Row({
        id: "a1",
        sourcePath: "/ext/A/a1.txt",
        sourceBatchId: "b1",
        sourceFolderGroupKey: "b1\u0000/ext/A"
      }),
      step8Row({
        id: "a2",
        sourcePath: "/ext/A/a2.txt",
        sourceBatchId: "b1",
        sourceFolderGroupKey: "b1\u0000/ext/A"
      }),
      step8Row({
        id: "b1f1",
        sourcePath: "/ext/B/b1.txt",
        sourceBatchId: "b1",
        sourceFolderGroupKey: "b1\u0000/ext/B"
      }),
      step8Row({
        id: "one",
        sourcePath: "/ext/misc/one.txt",
        sourceBatchId: "b2",
        sourceFolderGroupKey: "b2\u0000/ext/misc"
      })
    ];

    it("groups by batch then by source folder, with counts and ordinals", () => {
      const { batchGroups, ungroupedRows } = groupBulkTextImportFileRows(
        rows,
        batches
      );
      expect(ungroupedRows).toEqual([]);
      expect(batchGroups.map((g) => g.batch.id)).toEqual(["b1", "b2"]);
      expect(batchGroups[0].kindOrdinal).toBe(1);
      expect(batchGroups[1].kindOrdinal).toBe(1);
      expect(batchGroups[0].rows).toHaveLength(3);
      expect(
        batchGroups[0].folderGroups.map((f) => [
          f.sourceFolderPath,
          f.rows.length
        ])
      ).toEqual([
        ["/ext/A", 2],
        ["/ext/B", 1]
      ]);
      expect(batchGroups[1].folderGroups[0].sourceFolderPath).toBe("/ext/misc");
    });

    it("increments kindOrdinal per batch kind", () => {
      const twoDrops: TextImportSourceBatch[] = [
        { id: "d1", kind: "drop", sourcePaths: ["/x"], createdOrder: 1 },
        { id: "d2", kind: "drop", sourcePaths: ["/y"], createdOrder: 2 }
      ];
      const dropRows = [
        step8Row({
          id: "x",
          sourcePath: "/x/a.txt",
          sourceBatchId: "d1",
          sourceFolderGroupKey: "d1\u0000/x"
        }),
        step8Row({
          id: "y",
          sourcePath: "/y/b.txt",
          sourceBatchId: "d2",
          sourceFolderGroupKey: "d2\u0000/y"
        })
      ];
      const { batchGroups } = groupBulkTextImportFileRows(dropRows, twoDrops);
      expect(batchGroups.map((g) => g.kindOrdinal)).toEqual([1, 2]);
    });

    it("returns rows with an unknown batch id as ungrouped", () => {
      const orphan = [step8Row({ id: "z", sourceBatchId: "gone" })];
      const { batchGroups, ungroupedRows } = groupBulkTextImportFileRows(
        orphan,
        batches
      );
      expect(batchGroups).toEqual([]);
      expect(ungroupedRows.map((r) => r.id)).toEqual(["z"]);
    });
  });

  describe("resolveBulkEncodingControlValue", () => {
    it("returns the shared encoding when every editable row agrees", () => {
      expect(
        resolveBulkEncodingControlValue([
          step8Row({ id: "a", selectedEncoding: "shiftJis" }),
          step8Row({ id: "b", selectedEncoding: "shiftJis" })
        ])
      ).toBe("shiftJis");
    });

    it("returns 'skip' when every editable row is manually skipped", () => {
      expect(
        resolveBulkEncodingControlValue([
          step8Row({ id: "a", manualSkipped: true }),
          step8Row({ id: "b", manualSkipped: true })
        ])
      ).toBe("skip");
    });

    it("returns 'mixed' for mixed encodings or a skip/non-skip mix", () => {
      expect(
        resolveBulkEncodingControlValue([
          step8Row({ id: "a", selectedEncoding: "shiftJis" }),
          step8Row({ id: "b", selectedEncoding: "eucJp" })
        ])
      ).toBe("mixed");
      expect(
        resolveBulkEncodingControlValue([
          step8Row({ id: "a", manualSkipped: true }),
          step8Row({ id: "b", selectedEncoding: "utf8" })
        ])
      ).toBe("mixed");
    });

    it("returns 'mixed' when no row is encoding-editable", () => {
      expect(
        resolveBulkEncodingControlValue([
          step8Row({ id: "a", skipped: true, skipReason: "targetExists" })
        ])
      ).toBe("mixed");
    });
  });

  describe("collectBulkEncodingApplyRowIds", () => {
    it("keeps normal / decodeFailed / manualSkipped rows and drops the rest", () => {
      const ids = collectBulkEncodingApplyRowIds([
        step8Row({ id: "normal" }),
        step8Row({
          id: "decode",
          skipped: true,
          skipReason: "decodeFailed"
        }),
        step8Row({ id: "manual", manualSkipped: true }),
        step8Row({ id: "exists", skipped: true, skipReason: "targetExists" }),
        step8Row({ id: "nottext", skipped: true, skipReason: "notTextFile" }),
        step8Row({ id: "nosrc", sourcePath: "" })
      ]);
      expect(ids).toEqual(["normal", "decode", "manual"]);
    });
  });

  describe("applyBulkSelectedEncoding / applyBulkManualSkip", () => {
    it("applies an encoding to the targeted rows only, clearing manual skip", () => {
      const rows = [
        step8Row({ id: "a", selectedEncoding: "utf8", manualSkipped: true }),
        step8Row({ id: "b", selectedEncoding: "utf8" }),
        step8Row({ id: "c", selectedEncoding: "utf8" })
      ];
      const next = applyBulkSelectedEncoding(rows, ["a", "b"], "eucJp", 9);
      expect(next[0]).toMatchObject({
        selectedEncoding: "eucJp",
        manualSkipped: false,
        previewStatus: "loading",
        previewRequestId: 9
      });
      expect(next[1].selectedEncoding).toBe("eucJp");
      expect(next[2].selectedEncoding).toBe("utf8");
      expect(next[2].previewStatus).toBe("idle");
    });

    it("returns the same reference for an empty id list", () => {
      const rows = [step8Row()];
      expect(applyBulkSelectedEncoding(rows, [], "eucJp", 1)).toBe(rows);
      expect(applyBulkManualSkip(rows, [])).toBe(rows);
    });

    it("marks the targeted rows manually skipped, ignoring non-decode skips", () => {
      const rows = [
        step8Row({ id: "a" }),
        step8Row({ id: "b", skipped: true, skipReason: "targetExists" })
      ];
      const next = applyBulkManualSkip(rows, ["a", "b"]);
      expect(next[0].manualSkipped).toBe(true);
      expect(next[1].manualSkipped).toBe(false);
    });
  });

  describe("applyBulkPreviewResponse", () => {
    function loadingRows(): BulkTextImportFileRowViewState[] {
      return [
        step8Row({ id: "a", previewStatus: "loading", previewRequestId: 5 }),
        step8Row({ id: "b", previewStatus: "loading", previewRequestId: 5 })
      ];
    }

    it("applies per-file success and failure by id", () => {
      const response: PreviewTextImportFilesResult = {
        ok: true,
        files: [
          {
            ok: true,
            id: "a",
            sourcePath: "/ext/A/a1.txt",
            encoding: "eucJp",
            bomKind: "none",
            previewHead: "H",
            previewTail: "T"
          },
          {
            ok: false,
            id: "b",
            sourcePath: "/ext/A/a2.txt",
            encoding: "eucJp",
            reason: "decodeFailed"
          }
        ]
      };
      const next = applyBulkPreviewResponse(loadingRows(), 5, response, [
        "a",
        "b"
      ]);
      expect(next[0]).toMatchObject({ previewStatus: "ready", previewHead: "H" });
      expect(next[1]).toMatchObject({
        previewStatus: "failed",
        previewErrorReason: "decodeFailed"
      });
    });

    it("fails every requested row on a top-level failure", () => {
      const next = applyBulkPreviewResponse(loadingRows(), 5, { ok: false }, [
        "a",
        "b"
      ]);
      expect(next.map((r) => r.previewStatus)).toEqual(["failed", "failed"]);
      expect(next.every((r) => r.previewErrorReason === "updateFailed")).toBe(
        true
      );
    });

    it("fails a requested row missing from the response", () => {
      const response: PreviewTextImportFilesResult = {
        ok: true,
        files: [
          {
            ok: true,
            id: "a",
            sourcePath: "/ext/A/a1.txt",
            encoding: "eucJp",
            bomKind: "none",
            previewHead: "H",
            previewTail: "T"
          }
        ]
      };
      const next = applyBulkPreviewResponse(loadingRows(), 5, response, [
        "a",
        "b"
      ]);
      expect(next[1]).toMatchObject({
        previewStatus: "failed",
        previewErrorReason: "updateFailed"
      });
    });

    it("ignores rows no longer waiting on the request id (stale)", () => {
      const rows = [
        step8Row({ id: "a", previewStatus: "loading", previewRequestId: 7 })
      ];
      const response: PreviewTextImportFilesResult = {
        ok: true,
        files: [
          {
            ok: true,
            id: "a",
            sourcePath: "/ext/A/a1.txt",
            encoding: "eucJp",
            bomKind: "none",
            previewHead: "STALE",
            previewTail: "T"
          }
        ]
      };
      expect(applyBulkPreviewResponse(rows, 5, response, ["a"])).toBe(rows);
    });
  });

  describe("textImportBatchHeadingKey", () => {
    it("maps each batch kind to its heading key", () => {
      expect(textImportBatchHeadingKey("drop")).toBe(
        "textImport.dialog.batchHeading.drop"
      );
      expect(textImportBatchHeadingKey("filePicker")).toBe(
        "textImport.dialog.batchHeading.files"
      );
      expect(textImportBatchHeadingKey("folderPicker")).toBe(
        "textImport.dialog.batchHeading.folders"
      );
    });
  });
});
