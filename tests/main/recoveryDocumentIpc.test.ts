import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECOVERY_CHANNELS } from "../../src/shared/api";
import { openRecoveryStoreDatabase } from "../../src/main/recoveryStoreDatabase";
import { registerRecoveryDocumentIpc } from "../../src/main/recoveryDocumentIpc";
import type { RecoveryStoreStatus } from "../../src/shared/recovery";
import type { RecoveryDocumentPayload } from "../../src/shared/recoveryDocument";

let workDir = "";
let handle: Awaited<ReturnType<typeof openRecoveryStoreDatabase>> | null = null;

// A stub satisfying IpcMainInvokeEvent's shape for handlers invoked directly
// in these tests — none of them read any property off the event.
const fakeIpcMainInvokeEvent = {} as IpcMainInvokeEvent;

type RegisteredIpcHandler = (
  event: IpcMainInvokeEvent,
  arg: unknown
) => unknown;

interface Harness {
  invoke: (channel: string, arg: unknown) => unknown;
  logEvents: Array<{ event: string; level: string; details?: Record<string, unknown> }>;
}

function buildHarness(options: {
  status: RecoveryStoreStatus | null;
  withDatabase: boolean;
}): Harness {
  const handlers = new Map<string, RegisteredIpcHandler>();
  const logEvents: Harness["logEvents"] = [];
  let docRefSeq = 0;

  registerRecoveryDocumentIpc(
    { handle: (channel, listener) => handlers.set(channel, listener) },
    {
      getStatus: () => options.status,
      getOwnerDatabase: () =>
        options.withDatabase && handle ? handle.database : null,
      instanceRunId: "0198d95f-97d8-7000-8000-00000000run",
      appVersion: "9.8.7-test",
      now: () => new Date("2026-08-29T08:21:00.000Z"),
      createRowId: () => "row-fixed",
      logger: {
        log: (entry) =>
          logEvents.push(
            entry as {
              event: string;
              level: string;
              details?: Record<string, unknown>;
            }
          ),
        documentRefForKey: () => `document:session:${++docRefSeq}`
      }
    }
  );

  return {
    invoke: (channel, arg) => {
      const listener = handlers.get(channel);
      if (!listener) throw new Error(`no handler for ${channel}`);
      return listener(fakeIpcMainInvokeEvent, arg);
    },
    logEvents
  };
}

const BODY = "# Chapter\nSECRET_MANUSCRIPT_BODY_ipc";

function filePayload(
  overrides: Partial<RecoveryDocumentPayload> = {}
): RecoveryDocumentPayload {
  return {
    documentKey: "file:C:/Novel/chapter.md",
    documentType: "markdown.file",
    sourceUri: "file://C:/Novel/chapter.md",
    displayName: "chapter.md",
    filePath: "C:/Novel/chapter.md",
    documentEncoding: "utf-8",
    documentLineend: "lf",
    baseMtimeMs: null,
    baseSize: 5,
    baseSha256: "a".repeat(64),
    payloadText: BODY,
    ...overrides
  };
}

function ownerStatus(): RecoveryStoreStatus {
  return {
    kind: "owner",
    recoveryDirectoryPath: "C:/u/Recovery",
    databasePath: "C:/u/Recovery/Recovery.db",
    lockDirectoryPath: "C:/u/Recovery/Recovery.lock",
    storeId: "0198d95f-97d8-7000-8000-0000000store"
  };
}

function dbRow(documentKey: string): Record<string, unknown> | undefined {
  return handle!.database
    .prepare("SELECT * FROM documents WHERE document_key = ?")
    .get(documentKey) as Record<string, unknown> | undefined;
}

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), "pergamum-recovery-ipc-"));
  handle = await openRecoveryStoreDatabase({
    databasePath: path.join(workDir, "Recovery.db"),
    appVersion: "9.8.7-test"
  });
});

afterEach(async () => {
  handle?.close();
  handle = null;
  vi.restoreAllMocks();
  await fs.rm(workDir, { recursive: true, force: true, maxRetries: 3 });
});

describe("recovery document IPC — owner", () => {
  it("UPSERTs the dirty payload and logs an opaque, body-free event", () => {
    const h = buildHarness({ status: ownerStatus(), withDatabase: true });

    const result = h.invoke(RECOVERY_CHANNELS.upsertDocument, filePayload());
    expect(result).toEqual({ ok: true, mode: "inserted" });
    expect(dbRow("file:C:/Novel/chapter.md")?.payload_text).toBe(BODY);

    const persisted = h.logEvents.find(
      (e) => e.event === "recovery.document.persisted"
    );
    expect(persisted?.level).toBe("debug");
    expect(persisted?.details).toMatchObject({
      documentRef: expect.stringMatching(/^document:session:/),
      result: "succeeded",
      instanceRunId: "0198d95f-97d8-7000-8000-00000000run"
    });
    // Recovery persistence is not a save — the save-only detail is absent.
    expect(persisted?.details).not.toHaveProperty("saveTargetKind");
    expect(Object.keys(persisted?.details ?? {}).sort()).toEqual([
      "documentRef",
      "durationMs",
      "instanceRunId",
      "result"
    ]);
    // No body text, no raw key/path anywhere in the log.
    const serialized = JSON.stringify(h.logEvents);
    expect(serialized).not.toContain(BODY);
    expect(serialized).not.toContain("SECRET_MANUSCRIPT_BODY");
    expect(serialized).not.toContain("file:C:/Novel/chapter.md");
    expect(serialized).not.toContain("payload_text");
  });

  it("logs an Untitled persist without any save-flavoured detail", () => {
    const h = buildHarness({ status: ownerStatus(), withDatabase: true });
    h.invoke(RECOVERY_CHANNELS.upsertDocument, {
      documentKey: "untitled:0198-uuid",
      documentType: "markdown.untitled",
      sourceUri: "untitled://0198-uuid",
      displayName: "Untitled.md",
      documentEncoding: null,
      documentLineend: null,
      baseMtimeMs: null,
      baseSize: null,
      baseSha256: null,
      payloadText: "typed"
    });

    const persisted = h.logEvents.find(
      (e) => e.event === "recovery.document.persisted"
    );
    expect(persisted?.details).not.toHaveProperty("saveTargetKind");
    expect(JSON.stringify(h.logEvents)).not.toContain("unsupported");
  });

  it("updates the same row on a second flush (mode: updated)", () => {
    const h = buildHarness({ status: ownerStatus(), withDatabase: true });
    h.invoke(RECOVERY_CHANNELS.upsertDocument, filePayload());
    const again = h.invoke(
      RECOVERY_CHANNELS.upsertDocument,
      filePayload({ payloadText: `${BODY} more` })
    );
    expect(again).toEqual({ ok: true, mode: "updated" });
    expect(dbRow("file:C:/Novel/chapter.md")?.payload_text).toBe(`${BODY} more`);
  });

  it("deletes a row (mode: deleted) then reports noop", () => {
    const h = buildHarness({ status: ownerStatus(), withDatabase: true });
    h.invoke(RECOVERY_CHANNELS.upsertDocument, filePayload());

    expect(
      h.invoke(RECOVERY_CHANNELS.deleteDocument, {
        documentKey: "file:C:/Novel/chapter.md"
      })
    ).toEqual({ ok: true, mode: "deleted" });
    expect(dbRow("file:C:/Novel/chapter.md")).toBeUndefined();

    expect(
      h.invoke(RECOVERY_CHANNELS.deleteDocument, {
        documentKey: "file:C:/Novel/chapter.md"
      })
    ).toEqual({ ok: true, mode: "noop" });
  });

  it("rejects a malformed payload without logging body text", () => {
    const h = buildHarness({ status: ownerStatus(), withDatabase: true });
    expect(
      h.invoke(RECOVERY_CHANNELS.upsertDocument, { payloadText: BODY })
    ).toEqual({ ok: false, error: "invalid-payload" });
    expect(JSON.stringify(h.logEvents)).not.toContain(BODY);
  });
});

describe("recovery document IPC — non-owner / unavailable", () => {
  it("is a silent no-op for a Recovery non-owner (no write, no log)", () => {
    const h = buildHarness({
      status: {
        kind: "nonOwner",
        recoveryDirectoryPath: "C:/u/Recovery",
        lockDirectoryPath: "C:/u/Recovery/Recovery.lock",
        reason: "lockUnavailable"
      },
      withDatabase: false
    });

    expect(h.invoke(RECOVERY_CHANNELS.upsertDocument, filePayload())).toEqual({
      ok: false,
      skipped: "not-owner"
    });
    expect(
      h.invoke(RECOVERY_CHANNELS.deleteDocument, {
        documentKey: "file:C:/Novel/chapter.md"
      })
    ).toEqual({ ok: false, skipped: "not-owner" });

    expect(h.logEvents).toEqual([]);
    // The DB the harness happens to hold was never touched.
    expect(dbRow("file:C:/Novel/chapter.md")).toBeUndefined();
  });

  it("skips as unavailable when the store is not owned / no DB", () => {
    const h = buildHarness({
      status: {
        kind: "unavailable",
        recoveryDirectoryPath: "C:/u/Recovery",
        reason: "databaseUnavailable"
      },
      withDatabase: false
    });
    expect(h.invoke(RECOVERY_CHANNELS.upsertDocument, filePayload())).toEqual({
      ok: false,
      skipped: "unavailable"
    });
    expect(h.logEvents).toEqual([]);
  });

  it("skips as unavailable when status is null (init not finished)", () => {
    const h = buildHarness({ status: null, withDatabase: false });
    expect(h.invoke(RECOVERY_CHANNELS.upsertDocument, filePayload())).toEqual({
      ok: false,
      skipped: "unavailable"
    });
  });
});

describe("recovery document IPC — failure surfacing", () => {
  it("returns a body-free error and logs recovery.document.persist.failed when the write throws", () => {
    const h = buildHarness({ status: ownerStatus(), withDatabase: true });
    // Drop the table so the prepared statement throws.
    handle!.database.exec("DROP TABLE documents");

    const result = h.invoke(RECOVERY_CHANNELS.upsertDocument, filePayload());
    expect(result).toEqual({ ok: false, error: "persist-failed" });

    const failed = h.logEvents.find(
      (e) => e.event === "recovery.document.persist.failed"
    );
    expect(failed?.level).toBe("error");
    expect(failed?.details).toMatchObject({ result: "failed" });
    expect(JSON.stringify(h.logEvents)).not.toContain(BODY);
    expect(JSON.stringify(h.logEvents)).not.toContain("SECRET_MANUSCRIPT_BODY");
  });
});
