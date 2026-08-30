import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRecoveryStoreDatabase } from "../../src/main/recoveryStoreDatabase";
import { upsertRecoveryDocument } from "../../src/main/recoveryDocumentStore";
import { rekeyRecoveryDocumentPaths } from "../../src/main/recoveryDocumentPathRekey";
import type { RecoveryStoreStatus } from "../../src/shared/recovery";
import type { RecoveryDocumentPayload } from "../../src/shared/recoveryDocument";

let workDir = "";
let handle: Awaited<ReturnType<typeof openRecoveryStoreDatabase>> | null = null;
let rowSeq = 0;

const RUN_ID = "0198d95f-97d8-7000-8000-00000000run";
const PREVIOUS_RUN_ID = "0198d95f-97d8-7000-8000-000000000old";

function ownerStatus(): RecoveryStoreStatus {
  return {
    kind: "owner",
    recoveryDirectoryPath: "C:/u/Recovery",
    databasePath: "C:/u/Recovery/Recovery.db",
    lockDirectoryPath: "C:/u/Recovery/Recovery.lock",
    storeId: "0198d95f-97d8-7000-8000-0000000store"
  };
}

interface LogEntry {
  event: string;
  level: string;
  details?: Record<string, unknown>;
}

function deps(options: {
  status: RecoveryStoreStatus | null;
  withDatabase?: boolean;
}) {
  const logEvents: LogEntry[] = [];
  return {
    logEvents,
    value: {
      getStatus: () => options.status,
      getOwnerDatabase: () =>
        (options.withDatabase ?? true) && handle ? handle.database : null,
      instanceRunId: RUN_ID,
      logger: {
        log: (entry: unknown) => logEvents.push(entry as LogEntry),
        documentRefForKey: (key: string) => `document:ref:${key.length}`
      }
    }
  };
}

function filePayload(
  overrides: Partial<RecoveryDocumentPayload> = {}
): RecoveryDocumentPayload {
  return {
    documentKey: "file:C:/Novel/chapter.md",
    documentType: "markdown.file",
    sourceUri: "file://C:/Novel/chapter.md",
    displayName: "chapter.md",
    projectId: null,
    projectFilePath: null,
    filePath: "C:/Novel/chapter.md",
    documentEncoding: "utf-8",
    documentLineend: "lf",
    baseMtimeMs: null,
    baseSize: 12,
    baseSha256: "a".repeat(64),
    payloadText: "SECRET_MANUSCRIPT_BODY_320",
    ...overrides
  };
}

function seed(
  payload: RecoveryDocumentPayload,
  instanceRunId: string = PREVIOUS_RUN_ID
): void {
  upsertRecoveryDocument(handle!.database, payload, {
    instanceRunId,
    appVersion: "9.8.7-test",
    now: () => new Date("2026-08-29T08:21:00.000Z"),
    createRowId: () => `row-${(rowSeq += 1)}`
  });
}

function row(documentKey: string): Record<string, unknown> | undefined {
  return handle!.database
    .prepare("SELECT * FROM documents WHERE document_key = ?")
    .get(documentKey) as Record<string, unknown> | undefined;
}

beforeEach(async () => {
  rowSeq = 0;
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), "pergamum-recovery-rekey-"));
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

describe("rekeyRecoveryDocumentPaths (#320)", () => {
  it("re-keys a previous-run candidate row: document_key / file_path / display_name", () => {
    seed(filePayload());
    const { value } = deps({ status: ownerStatus() });

    const result = rekeyRecoveryDocumentPaths(value, [
      {
        oldAbsolutePath: "C:/Novel/chapter.md",
        newAbsolutePath: "C:/Novel/Drafts/final.md"
      }
    ]);

    expect(result).toMatchObject({ ok: true, rekeyed: 1, collisions: 0, errors: 0 });
    expect(row("file:C:/Novel/chapter.md")).toBeUndefined();
    expect(row("file:C:/Novel/Drafts/final.md")).toMatchObject({
      document_key: "file:C:/Novel/Drafts/final.md",
      source_uri: "file://C:/Novel/Drafts/final.md",
      file_path: "C:/Novel/Drafts/final.md",
      display_name: "final.md",
      payload_text: "SECRET_MANUSCRIPT_BODY_320",
      origin_instance_run_id: PREVIOUS_RUN_ID
    });
  });

  it("also re-keys a current-run row", () => {
    seed(filePayload(), RUN_ID);
    const { value } = deps({ status: ownerStatus() });

    rekeyRecoveryDocumentPaths(value, [
      {
        oldAbsolutePath: "C:/Novel/chapter.md",
        newAbsolutePath: "C:/Novel/final.md"
      }
    ]);

    expect(row("file:C:/Novel/final.md")?.origin_instance_run_id).toBe(RUN_ID);
  });

  it("normalizes both paths the same way capture does (drive case, separators)", () => {
    seed(filePayload());
    const { value } = deps({ status: ownerStatus() });

    const result = rekeyRecoveryDocumentPaths(value, [
      {
        oldAbsolutePath: "c:\\Novel\\chapter.md",
        newAbsolutePath: "c:\\Novel\\renamed.md"
      }
    ]);

    expect(result).toMatchObject({ ok: true, rekeyed: 1 });
    expect(row("file:C:/Novel/renamed.md")).toBeDefined();
  });

  it("on a UNIQUE collision keeps both rows and logs recovery.document.rekey.collision", () => {
    seed(filePayload({ payloadText: "OLD" }));
    seed(
      filePayload({
        documentKey: "file:C:/Novel/final.md",
        sourceUri: "file://C:/Novel/final.md",
        filePath: "C:/Novel/final.md",
        displayName: "final.md",
        payloadText: "NEW"
      })
    );
    const { value, logEvents } = deps({ status: ownerStatus() });

    const result = rekeyRecoveryDocumentPaths(value, [
      {
        oldAbsolutePath: "C:/Novel/chapter.md",
        newAbsolutePath: "C:/Novel/final.md"
      }
    ]);

    expect(result).toMatchObject({ ok: true, rekeyed: 0, collisions: 1 });
    expect(row("file:C:/Novel/chapter.md")).toMatchObject({ payload_text: "OLD" });
    expect(row("file:C:/Novel/final.md")).toMatchObject({ payload_text: "NEW" });
    expect(
      logEvents.some((e) => e.event === "recovery.document.rekey.collision")
    ).toBe(true);
  });

  it("counts a no-row pair without writing anything", () => {
    seed(filePayload({
      documentKey: "file:C:/Novel/unrelated.md",
      sourceUri: "file://C:/Novel/unrelated.md",
      filePath: "C:/Novel/unrelated.md"
    }));
    const { value } = deps({ status: ownerStatus() });

    const result = rekeyRecoveryDocumentPaths(value, [
      {
        oldAbsolutePath: "C:/Novel/chapter.md",
        newAbsolutePath: "C:/Novel/final.md"
      }
    ]);

    expect(result).toMatchObject({ ok: true, rekeyed: 0, noRow: 1, errors: 0 });
    expect(row("file:C:/Novel/final.md")).toBeUndefined();
  });

  it("logs and counts an unnormalizable path as an error, still returns ok", () => {
    seed(filePayload());
    const { value, logEvents } = deps({ status: ownerStatus() });

    const result = rekeyRecoveryDocumentPaths(value, [
      { oldAbsolutePath: "not-absolute", newAbsolutePath: "also/not/absolute" }
    ]);

    expect(result).toMatchObject({ ok: true, errors: 1 });
    expect(
      logEvents.some((e) => e.event === "recovery.document.rekey.failed")
    ).toBe(true);
    // The seeded row is untouched.
    expect(row("file:C:/Novel/chapter.md")).toBeDefined();
  });

  it("skips (non-owner) without touching the store", () => {
    seed(filePayload());
    const { value } = deps({
      status: {
        kind: "nonOwner",
        recoveryDirectoryPath: "C:/u/Recovery",
        lockDirectoryPath: "C:/u/Recovery/Recovery.lock",
        reason: "lockUnavailable"
      }
    });

    const result = rekeyRecoveryDocumentPaths(value, [
      {
        oldAbsolutePath: "C:/Novel/chapter.md",
        newAbsolutePath: "C:/Novel/final.md"
      }
    ]);

    expect(result).toEqual({ ok: false, skipped: "not-owner" });
    expect(row("file:C:/Novel/chapter.md")).toBeDefined();
    expect(row("file:C:/Novel/final.md")).toBeUndefined();
  });

  it("skips (unavailable) when there is no owner database", () => {
    const { value } = deps({ status: null, withDatabase: false });

    const result = rekeyRecoveryDocumentPaths(value, [
      {
        oldAbsolutePath: "C:/Novel/chapter.md",
        newAbsolutePath: "C:/Novel/final.md"
      }
    ]);

    expect(result).toEqual({ ok: false, skipped: "unavailable" });
  });

  it("processes every pair even when one in the middle collides", () => {
    seed(filePayload({
      documentKey: "file:C:/Novel/a.md",
      sourceUri: "file://C:/Novel/a.md",
      filePath: "C:/Novel/a.md"
    }));
    seed(filePayload({
      documentKey: "file:C:/Novel/b.md",
      sourceUri: "file://C:/Novel/b.md",
      filePath: "C:/Novel/b.md"
    }));
    seed(filePayload({
      documentKey: "file:C:/Novel/c-existing.md",
      sourceUri: "file://C:/Novel/c-existing.md",
      filePath: "C:/Novel/c-existing.md"
    }));
    const { value } = deps({ status: ownerStatus() });

    const result = rekeyRecoveryDocumentPaths(value, [
      { oldAbsolutePath: "C:/Novel/a.md", newAbsolutePath: "C:/Novel/a2.md" },
      {
        oldAbsolutePath: "C:/Novel/b.md",
        newAbsolutePath: "C:/Novel/c-existing.md"
      },
      { oldAbsolutePath: "C:/Novel/x.md", newAbsolutePath: "C:/Novel/x2.md" }
    ]);

    expect(result).toMatchObject({
      ok: true,
      rekeyed: 1,
      collisions: 1,
      noRow: 1
    });
    expect(row("file:C:/Novel/a2.md")).toBeDefined();
    expect(row("file:C:/Novel/b.md")).toBeDefined();
  });
});
