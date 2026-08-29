import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRecoveryStoreDatabase } from "../../src/main/recoveryStoreDatabase";
import { upsertRecoveryDocument } from "../../src/main/recoveryDocumentStore";
import {
  deleteRecoveryRowsById,
  getRecoveryRestoreRows,
  listRecoveryCandidates,
  safeRecoveryDisplayName
} from "../../src/main/recoveryCandidateStore";
import { buildRecoveryReport } from "../../src/main/recoveryReport";
import type { RecoveryDocumentPayload } from "../../src/shared/recoveryDocument";

let workDir = "";
let handle: Awaited<ReturnType<typeof openRecoveryStoreDatabase>> | null = null;
let rowSeq = 0;

const BODY = "  第一章\r\n\r\n昨日はよく晴れていた。SECRET_MANUSCRIPT_BODY_CAND  ";

function ctx(now: string) {
  return {
    instanceRunId: "0198d95f-97d8-7000-8000-00000000run",
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

    const candidates = listRecoveryCandidates(db);

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
    expect(listRecoveryCandidates(handle!.database)).toEqual([]);
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

    const rows = getRecoveryRestoreRows(db, ["row-2", "row-1", "row-missing"]);
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

    expect(listRecoveryCandidates(db).map((c) => c.recoveryId)).toEqual([
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

    const candidates = listRecoveryCandidates(db);
    expect(candidates.map((c) => c.displayName).sort()).toEqual([
      "chapter-03.md",
      "chapter-04.md"
    ]);

    const report = buildRecoveryReport({
      statusKind: "owner",
      appVersion: "0.60.0",
      generatedAt: "2026-08-29T12:41:00.000Z",
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
