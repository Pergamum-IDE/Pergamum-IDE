import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRecoveryStoreDatabase } from "../../src/main/recoveryStoreDatabase";
import { upsertRecoveryDocument } from "../../src/main/recoveryDocumentStore";
import {
  deleteRecoveryRowsById,
  getRecoveryRestoreRows,
  hasRecoverableCandidates,
  listRecoveryCandidates,
  safeRecoveryDisplayName
} from "../../src/main/recoveryCandidateStore";
import { buildRecoveryReport } from "../../src/main/recoveryReport";
import type { RecoveryDocumentPayload } from "../../src/shared/recoveryDocument";

let workDir = "";
let handle: Awaited<ReturnType<typeof openRecoveryStoreDatabase>> | null = null;
let rowSeq = 0;

const BODY = "  第一章\r\n\r\n昨日はよく晴れていた。SECRET_MANUSCRIPT_BODY_CAND  ";

// The run id every `ctx()`-seeded row is written under, and a distinct
// "this process" id. Passing SEED_RUN as `currentInstanceRunId` hides the
// seeded rows (they look like current-run backups); passing OTHER_RUN
// treats them as previous-run candidates.
const SEED_RUN = "0198d95f-97d8-7000-8000-00000000run";
const OTHER_RUN = "0198d95f-97d8-7000-8000-0000000other";

function ctx(now: string, instanceRunId: string = SEED_RUN) {
  return {
    instanceRunId,
    appVersion: "9.8.7-test",
    now: () => new Date(now),
    createRowId: () => `row-${(rowSeq += 1)}`
  };
}

function filePayload(
  overrides: Partial<RecoveryDocumentPayload> = {}
): RecoveryDocumentPayload {
  return {
    documentKey: "file:C:/Novel/secret-dir/chapter-03.md",
    documentType: "markdown.file",
    sourceUri: "file://C:/Novel/secret-dir/chapter-03.md",
    displayName: "chapter-03.md",
    projectId: null,
    projectFilePath: "C:/Novel/secret-dir/Novel.pergamum",
    filePath: "C:/Novel/secret-dir/chapter-03.md",
    documentEncoding: "utf-8",
    documentLineend: "crlf",
    baseMtimeMs: null,
    baseSize: 5,
    baseSha256: "a".repeat(64),
    payloadText: BODY,
    ...overrides
  };
}

beforeEach(async () => {
  rowSeq = 0;
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), "pergamum-recovery-cand-"));
  handle = await openRecoveryStoreDatabase({
    databasePath: path.join(workDir, "Recovery.db"),
    appVersion: "9.8.7-test"
  });
});

afterEach(async () => {
  handle?.close();
  handle = null;
  await fs.rm(workDir, { recursive: true, force: true, maxRetries: 3 });
});

describe("listRecoveryCandidates", () => {
  it("maps rows to the DTO, most-recent first, with no raw body or path", () => {
    const db = handle!.database;
    upsertRecoveryDocument(db, filePayload(), ctx("2026-08-29T12:39:00.000Z"));
    upsertRecoveryDocument(
      db,
      {
        documentKey: "untitled:0198d95f-97d8-7000-8000-0000000unti",
        documentType: "markdown.untitled",
        sourceUri: "untitled://0198d95f-97d8-7000-8000-0000000unti",
        displayName: "Untitled.md",
        documentEncoding: null,
        documentLineend: null,
        baseMtimeMs: null,
        baseSize: null,
        baseSha256: null,
        payloadText: "typed"
      },
      ctx("2026-08-29T12:41:00.000Z")
    );

    const candidates = listRecoveryCandidates(db, OTHER_RUN);

    expect(candidates.map((c) => c.displayName)).toEqual([
      "Untitled.md",
      "chapter-03.md"
    ]);

    const fileCandidate = candidates[1];
    expect(fileCandidate).toEqual({
      recoveryId: "row-1",
      documentType: "markdown.file",
      displayName: "chapter-03.md",
      documentEncoding: "utf-8",
      documentLineend: "crlf",
      updatedAt: "2026-08-29T12:39:00.000Z",
      characterCount: Array.from(BODY).length,
      previewSnippet: "第一章 昨日はよく晴…",
      hasFilePath: true,
      hasProjectFilePath: true
    });

    // The DTO carries neither raw paths nor the body.
    const serialized = JSON.stringify(candidates);
    expect(serialized).not.toContain("SECRET_MANUSCRIPT_BODY_CAND");
    expect(serialized).not.toContain("C:/Novel");
    expect(serialized).not.toContain("secret-dir");
    expect(serialized).not.toContain("file://");

    const untitled = candidates[0];
    expect(untitled.hasFilePath).toBe(false);
    expect(untitled.hasProjectFilePath).toBe(false);
    expect(untitled.documentEncoding).toBeNull();
    expect(untitled.previewSnippet).toBe("typed");
  });

  it("returns an empty list when there are no rows", () => {
    expect(listRecoveryCandidates(handle!.database, OTHER_RUN)).toEqual([]);
  });
});

describe("previous-run vs current-run filtering (#288)", () => {
  function countRows(): number {
    return (
      handle!.database
        .prepare("SELECT COUNT(*) AS n FROM documents")
        .get() as { n: number }
    ).n;
  }

  it("hides a current-run-only row from the list and the availability check", () => {
    const db = handle!.database;
    upsertRecoveryDocument(
      db,
      filePayload(),
      ctx("2026-08-29T12:39:00.000Z", SEED_RUN)
    );

    // SEED_RUN is "this process" → its own live backup must not surface.
    expect(listRecoveryCandidates(db, SEED_RUN)).toEqual([]);
    expect(hasRecoverableCandidates(db, SEED_RUN)).toBe(false);
    // …but the row is still stored for a future run.
    expect(countRows()).toBe(1);
  });

  it("shows a previous-run row and reports it as available", () => {
    const db = handle!.database;
    upsertRecoveryDocument(
      db,
      filePayload(),
      ctx("2026-08-29T12:39:00.000Z", "0198d95f-97d8-7000-8000-000000prev")
    );

    const candidates = listRecoveryCandidates(db, SEED_RUN);
    expect(candidates.map((c) => c.recoveryId)).toEqual(["row-1"]);
    expect(hasRecoverableCandidates(db, SEED_RUN)).toBe(true);
  });

  it("returns only previous-run rows from a mixed store, keeping current-run rows on disk", () => {
    const db = handle!.database;
    upsertRecoveryDocument(
      db,
      filePayload({
        documentKey: "file:C:/Novel/secret-dir/previous.md",
        sourceUri: "file://C:/Novel/secret-dir/previous.md",
        filePath: "C:/Novel/secret-dir/previous.md",
        displayName: "previous.md"
      }),
      ctx("2026-08-29T12:39:00.000Z", "0198d95f-97d8-7000-8000-000000prev")
    );
    upsertRecoveryDocument(
      db,
      filePayload({
        documentKey: "file:C:/Novel/secret-dir/current.md",
        sourceUri: "file://C:/Novel/secret-dir/current.md",
        filePath: "C:/Novel/secret-dir/current.md",
        displayName: "current.md"
      }),
      ctx("2026-08-29T12:40:00.000Z", SEED_RUN)
    );

    const candidates = listRecoveryCandidates(db, SEED_RUN);
    expect(candidates.map((c) => c.displayName)).toEqual(["previous.md"]);
    expect(hasRecoverableCandidates(db, SEED_RUN)).toBe(true);
    // The current-run row (row-2) is still in Recovery.db.
    expect(countRows()).toBe(2);
    expect(
      db
        .prepare(
          "SELECT origin_instance_run_id AS r FROM documents WHERE id = 'row-2'"
        )
        .get()
    ).toEqual({ r: SEED_RUN });
  });

  it("never returns a current-run row from getRecoveryRestoreRows even if its id is passed", () => {
    const db = handle!.database;
    upsertRecoveryDocument(
      db,
      filePayload({
        documentKey: "file:C:/Novel/secret-dir/previous.md",
        sourceUri: "file://C:/Novel/secret-dir/previous.md",
        filePath: "C:/Novel/secret-dir/previous.md",
        displayName: "previous.md"
      }),
      ctx("2026-08-29T12:39:00.000Z", "0198d95f-97d8-7000-8000-000000prev")
    );
    upsertRecoveryDocument(
      db,
      filePayload({
        documentKey: "file:C:/Novel/secret-dir/current.md",
        sourceUri: "file://C:/Novel/secret-dir/current.md",
        filePath: "C:/Novel/secret-dir/current.md",
        displayName: "current.md"
      }),
      ctx("2026-08-29T12:40:00.000Z", SEED_RUN)
    );

    const rows = getRecoveryRestoreRows(db, ["row-1", "row-2"], SEED_RUN);
    expect(rows.map((r) => r.displayName)).toEqual(["previous.md"]);
  });
});

describe("getRecoveryRestoreRows", () => {
  it("returns raw path + body for the requested ids, in request order", () => {
    const db = handle!.database;
    upsertRecoveryDocument(db, filePayload(), ctx("2026-08-29T12:39:00.000Z"));
    upsertRecoveryDocument(
      db,
      filePayload({
        documentKey: "file:C:/Novel/secret-dir/chapter-04.md",
        sourceUri: "file://C:/Novel/secret-dir/chapter-04.md",
        filePath: "C:/Novel/secret-dir/chapter-04.md",
        displayName: "chapter-04.md"
      }),
      ctx("2026-08-29T12:40:00.000Z")
    );

    const rows = getRecoveryRestoreRows(db, ["row-2", "row-1", "row-missing"], OTHER_RUN);
    expect(rows.map((r) => r.displayName)).toEqual([
      "chapter-04.md",
      "chapter-03.md"
    ]);
    expect(rows[1]).toMatchObject({
      recoveryId: "row-1",
      documentType: "markdown.file",
      filePath: "C:/Novel/secret-dir/chapter-03.md",
      payloadText: BODY
    });
  });
});

describe("deleteRecoveryRowsById", () => {
  it("deletes exactly the given ids and leaves the rest", () => {
    const db = handle!.database;
    upsertRecoveryDocument(db, filePayload(), ctx("2026-08-29T12:39:00.000Z"));
    upsertRecoveryDocument(
      db,
      filePayload({
        documentKey: "file:C:/Novel/secret-dir/chapter-04.md",
        sourceUri: "file://C:/Novel/secret-dir/chapter-04.md",
        filePath: "C:/Novel/secret-dir/chapter-04.md",
        displayName: "chapter-04.md"
      }),
      ctx("2026-08-29T12:40:00.000Z")
    );

    const { deleted, missing, failed } = deleteRecoveryRowsById(db, [
      "row-1",
      "row-unknown"
    ]);
    // Only an actually-removed row counts as deleted.
    expect(deleted).toEqual(["row-1"]);
    expect(missing).toEqual(["row-unknown"]);
    expect(failed).toEqual([]);

    expect(listRecoveryCandidates(db, OTHER_RUN).map((c) => c.recoveryId)).toEqual([
      "row-2"
    ]);
  });
});

describe("safeRecoveryDisplayName + report basename safety", () => {
  it("reduces a stored path-like display_name to its final segment", () => {
    expect(
      safeRecoveryDisplayName("C:/Novel/secret-dir/chapter-03.md")
    ).toBe("chapter-03.md");
    expect(
      safeRecoveryDisplayName("C:\\Novel\\secret-dir\\chapter-03.md")
    ).toBe("chapter-03.md");
    expect(safeRecoveryDisplayName("chapter-03.md")).toBe("chapter-03.md");
    expect(safeRecoveryDisplayName("/proj/sub/")).toBe("sub");
  });

  it("falls back to a neutral default for a blank / separator-only name", () => {
    expect(safeRecoveryDisplayName("")).toBe("recovered.md");
    expect(safeRecoveryDisplayName("   ")).toBe("recovered.md");
    expect(safeRecoveryDisplayName("///")).toBe("recovered.md");
    expect(safeRecoveryDisplayName("\\\\")).toBe("recovered.md");
  });

  it("the candidate DTO and the report only ever show the basename, never the path", () => {
    const db = handle!.database;
    upsertRecoveryDocument(
      db,
      filePayload({
        displayName: "C:/Novel/secret-dir/chapter-03.md"
      }),
      ctx("2026-08-29T12:39:00.000Z")
    );
    upsertRecoveryDocument(
      db,
      filePayload({
        documentKey: "file:C:/Novel/secret-dir/chapter-04.md",
        sourceUri: "file://C:/Novel/secret-dir/chapter-04.md",
        filePath: "C:/Novel/secret-dir/chapter-04.md",
        displayName: "C:\\Novel\\secret-dir\\chapter-04.md"
      }),
      ctx("2026-08-29T12:40:00.000Z")
    );

    const candidates = listRecoveryCandidates(db, OTHER_RUN);
    expect(candidates.map((c) => c.displayName).sort()).toEqual([
      "chapter-03.md",
      "chapter-04.md"
    ]);

    const report = buildRecoveryReport({
      statusKind: "owner",
      appVersion: "0.60.0",
      generatedAt: "2026-08-29T12:41:00.000Z",
      language: "en",
      candidates
    });

    expect(report).toContain("name: chapter-03.md");
    expect(report).toContain("name: chapter-04.md");
    for (const surface of [JSON.stringify(candidates), report]) {
      expect(surface).not.toContain("C:/Novel");
      expect(surface).not.toContain("C:\\Novel");
      expect(surface).not.toContain("secret-dir");
    }
  });
});
