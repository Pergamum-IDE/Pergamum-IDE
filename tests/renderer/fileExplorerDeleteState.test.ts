import { describe, expect, it } from "vitest";
import type { FileExplorerDeleteTarget } from "../../src/shared/fileExplorerDelete";
import {
  abortPendingFileExplorerDeleteRows,
  initFileExplorerDeleteRows,
  isFileExplorerDeleteRowResolved,
  resetFileExplorerDeleteRowsForRerun,
  setFileExplorerDeleteRowStatus,
  summarizeFileExplorerDeleteRun
} from "../../src/renderer/fileExplorerDeleteState";

function target(relativePath: string): FileExplorerDeleteTarget {
  return {
    kind: "file",
    relativePath,
    name: relativePath,
    parentRelativePath: "",
    lastModifiedIso: null,
    sizeBytes: 0,
    previewHead: "",
    previewTail: "",
    previewUnavailable: false
  };
}

describe("fileExplorerDeleteState (#351)", () => {
  it("initializes every row as pending", () => {
    const rows = initFileExplorerDeleteRows([target("a.md"), target("b.md")]);
    expect(rows.map((r) => r.status)).toEqual(["pending", "pending"]);
    expect(rows.every((r) => r.failureReason === null)).toBe(true);
  });

  it("sets one row's status / failure reason without touching others", () => {
    let rows = initFileExplorerDeleteRows([target("a.md"), target("b.md")]);
    rows = setFileExplorerDeleteRowStatus(rows, "a.md", "deleting");
    rows = setFileExplorerDeleteRowStatus(
      rows,
      "b.md",
      "failed",
      "permission-denied"
    );
    expect(rows[0]).toMatchObject({ status: "deleting", failureReason: null });
    expect(rows[1]).toMatchObject({
      status: "failed",
      failureReason: "permission-denied"
    });
  });

  it("abort turns only still-pending rows into aborted (not a rollback)", () => {
    let rows = initFileExplorerDeleteRows([
      target("a.md"),
      target("b.md"),
      target("c.md")
    ]);
    rows = setFileExplorerDeleteRowStatus(rows, "a.md", "deleted");
    rows = setFileExplorerDeleteRowStatus(rows, "b.md", "failed", "not-empty");
    rows = abortPendingFileExplorerDeleteRows(rows);
    expect(rows.map((r) => r.status)).toEqual([
      "deleted",
      "failed",
      "aborted"
    ]);
  });

  it("summarizes deleted / failed / aborted counts and settled-ness", () => {
    let rows = initFileExplorerDeleteRows([
      target("a.md"),
      target("b.md"),
      target("c.md"),
      target("d.md")
    ]);
    expect(summarizeFileExplorerDeleteRun(rows)).toMatchObject({
      total: 4,
      settled: false,
      retryable: 4,
      allResolved: false
    });

    rows = setFileExplorerDeleteRowStatus(rows, "a.md", "deleted");
    rows = setFileExplorerDeleteRowStatus(rows, "b.md", "deleted");
    rows = setFileExplorerDeleteRowStatus(rows, "c.md", "failed", "busy");
    rows = setFileExplorerDeleteRowStatus(rows, "d.md", "aborted");

    expect(summarizeFileExplorerDeleteRun(rows)).toEqual({
      total: 4,
      deleted: 2,
      alreadyAbsent: 0,
      failed: 1,
      aborted: 1,
      pending: 0,
      resolved: 2,
      retryable: 2,
      allResolved: false,
      settled: true
    });
  });

  it("treats deleted and already-absent as resolved; failed / aborted / pending as retryable", () => {
    let rows = initFileExplorerDeleteRows([
      target("a.md"),
      target("b.md"),
      target("c.md"),
      target("d.md")
    ]);
    rows = setFileExplorerDeleteRowStatus(rows, "a.md", "deleted");
    rows = setFileExplorerDeleteRowStatus(rows, "b.md", "already-absent");
    rows = setFileExplorerDeleteRowStatus(rows, "c.md", "failed", "busy");
    rows = setFileExplorerDeleteRowStatus(rows, "d.md", "aborted");

    expect(rows.map((r) => isFileExplorerDeleteRowResolved(r))).toEqual([
      true,
      true,
      false,
      false
    ]);

    const summary = summarizeFileExplorerDeleteRun(rows);
    expect(summary).toMatchObject({
      resolved: 2,
      alreadyAbsent: 1,
      retryable: 2,
      allResolved: false
    });
  });

  it("reports allResolved once every row is deleted / already-absent", () => {
    let rows = initFileExplorerDeleteRows([target("a.md"), target("b.md")]);
    rows = setFileExplorerDeleteRowStatus(rows, "a.md", "deleted");
    rows = setFileExplorerDeleteRowStatus(rows, "b.md", "already-absent");
    expect(summarizeFileExplorerDeleteRun(rows).allResolved).toBe(true);
  });

  it("resetFileExplorerDeleteRowsForRerun keeps resolved rows, re-pends the rest", () => {
    let rows = initFileExplorerDeleteRows([
      target("a.md"),
      target("b.md"),
      target("c.md"),
      target("d.md")
    ]);
    rows = setFileExplorerDeleteRowStatus(rows, "a.md", "deleted");
    rows = setFileExplorerDeleteRowStatus(rows, "b.md", "already-absent");
    rows = setFileExplorerDeleteRowStatus(rows, "c.md", "failed", "permission-denied");
    rows = setFileExplorerDeleteRowStatus(rows, "d.md", "aborted");

    const reset = resetFileExplorerDeleteRowsForRerun(rows);
    expect(reset.map((r) => r.status)).toEqual([
      "deleted",
      "already-absent",
      "pending",
      "pending"
    ]);
    // the previously failed row's reason is cleared for the retry
    expect(reset[2].failureReason).toBeNull();
  });
});
