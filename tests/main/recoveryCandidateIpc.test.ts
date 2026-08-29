import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECOVERY_CHANNELS } from "../../src/shared/api";
import { openRecoveryStoreDatabase } from "../../src/main/recoveryStoreDatabase";
import { upsertRecoveryDocument } from "../../src/main/recoveryDocumentStore";
import { listRecoveryCandidates } from "../../src/main/recoveryCandidateStore";
import { registerRecoveryCandidateIpc } from "../../src/main/recoveryCandidateIpc";
import type { RecoveryStoreStatus } from "../../src/shared/recovery";
import type { RecoveryDocumentPayload } from "../../src/shared/recoveryDocument";
import type { RecoveryRestoreFileSystem } from "../../src/main/recoveryRestore";

let workDir = "";
let handle: Awaited<ReturnType<typeof openRecoveryStoreDatabase>> | null = null;
let rowSeq = 0;

const BODY_MARKER = "SECRET_MANUSCRIPT_BODY_IPC_287";

interface Harness {
  invoke: (channel: string, arg?: unknown) => unknown;
  logEvents: Array<{ event: string; level: string; details?: Record<string, unknown> }>;
  writes: Array<{ path: string; data: string }>;
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

function buildHarness(options: {
  status: RecoveryStoreStatus | null;
  withDatabase: boolean;
  existing?: Set<string>;
  registerRestoredProjectDocument?: (absolutePath: string) => string | null;
}): Harness {
  const handlers = new Map<string, (event: unknown, arg: unknown) => unknown>();
  const logEvents: Harness["logEvents"] = [];
  const writes: Harness["writes"] = [];
  let docRefSeq = 0;
  const taken = options.existing ?? new Set<string>();
  const restoreFileSystem: RecoveryRestoreFileSystem = {
    exists: (target) => Promise.resolve(taken.has(target)),
    writeFileAtomic: (target, data) => {
      writes.push({ path: target, data });
      taken.add(target);
      return Promise.resolve();
    }
  };

  registerRecoveryCandidateIpc(
    { handle: (channel, listener) => handlers.set(channel, listener) },
    {
      getStatus: () => options.status,
      getOwnerDatabase: () =>
        options.withDatabase && handle ? handle.database : null,
      appVersion: "9.8.7-test",
      instanceRunId: "0198d95f-97d8-7000-8000-00000000run",
      now: () => new Date("2026-08-29T12:41:00.000Z"),
      restoreFileSystem,
      ...(options.registerRestoredProjectDocument
        ? {
            registerRestoredProjectDocument:
              options.registerRestoredProjectDocument
          }
        : {}),
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
      return listener({}, arg);
    },
    logEvents,
    writes
  };
}

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
    documentKey: "file:/novel/chapter-03.md",
    documentType: "markdown.file",
    sourceUri: "file:///novel/chapter-03.md",
    displayName: "chapter-03.md",
    projectId: null,
    projectFilePath: "/novel/Novel.pergamum",
    filePath: "/novel/chapter-03.md",
    documentEncoding: "utf-8",
    documentLineend: "lf",
    baseMtimeMs: null,
    baseSize: 5,
    baseSha256: "a".repeat(64),
    payloadText: `# Chapter\n${BODY_MARKER}`,
    ...overrides
  };
}

function seedTwoRows(): void {
  const db = handle!.database;
  upsertRecoveryDocument(db, filePayload(), ctx("2026-08-29T12:39:00.000Z"));
  upsertRecoveryDocument(
    db,
    filePayload({
      documentKey: "file:/novel/chapter-04.md",
      sourceUri: "file:///novel/chapter-04.md",
      filePath: "/novel/chapter-04.md",
      displayName: "chapter-04.md",
      payloadText: `# Ch4\n${BODY_MARKER}`
    }),
    ctx("2026-08-29T12:40:00.000Z")
  );
}

beforeEach(async () => {
  rowSeq = 0;
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), "pergamum-recovery-cand-ipc-"));
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

describe("recovery candidate IPC — owner", () => {
  it("lists candidates and logs a body-free count event", () => {
    seedTwoRows();
    const h = buildHarness({ status: ownerStatus(), withDatabase: true });

    const result = h.invoke(RECOVERY_CHANNELS.listCandidates) as {
      ok: true;
      candidates: Array<{ displayName: string }>;
    };
    expect(result.ok).toBe(true);
    expect(result.candidates.map((c) => c.displayName)).toEqual([
      "chapter-04.md",
      "chapter-03.md"
    ]);

    const listed = h.logEvents.find(
      (e) => e.event === "recovery.candidates.listed"
    );
    expect(listed?.details).toMatchObject({ count: 2 });
    const serialized = JSON.stringify(h.logEvents) + JSON.stringify(result);
    expect(serialized).not.toContain(BODY_MARKER);
    expect(serialized).not.toContain("/novel/chapter-03.md");
  });

  it("restoreCandidates writes .recovered files atomically and does NOT delete rows", () => {
    seedTwoRows();
    const h = buildHarness({ status: ownerStatus(), withDatabase: true });

    return (
      h.invoke(RECOVERY_CHANNELS.restoreCandidates, {
        items: [{ recoveryId: "row-1" }, { recoveryId: "row-2" }]
      }) as Promise<{ ok: true; results: Array<{ status: string; writtenPath?: string }> }>
    ).then((result) => {
      expect(result.results.map((r) => r.status)).toEqual([
        "written",
        "written"
      ]);
      expect(h.writes.map((w) => w.path).sort()).toEqual([
        path.join("/novel", "chapter-03.recovered.md"),
        path.join("/novel", "chapter-04.recovered.md")
      ]);
      expect(h.writes[0].data).toContain(BODY_MARKER);

      // Rows are still present (two-phase restore).
      expect(
        listRecoveryCandidates(handle!.database).map((c) => c.recoveryId).sort()
      ).toEqual(["row-1", "row-2"]);

      const restored = h.logEvents.filter(
        (e) => e.event === "recovery.document.restored"
      );
      expect(restored).toHaveLength(2);
      expect(restored[0].details).toMatchObject({
        documentRef: expect.stringMatching(/^document:session:/),
        result: "succeeded"
      });
      // No body / raw path in the logs.
      expect(JSON.stringify(h.logEvents)).not.toContain(BODY_MARKER);
      expect(JSON.stringify(h.logEvents)).not.toContain("/novel/chapter-03.md");
    });
  });

  it("tags a written file inside the open project root with its project-relative path", () => {
    seedTwoRows();
    const registered: string[] = [];
    const h = buildHarness({
      status: ownerStatus(),
      withDatabase: true,
      // Only chapter-03's recovered sibling is "inside" the open project.
      registerRestoredProjectDocument: (absolutePath) => {
        registered.push(absolutePath);
        return absolutePath === path.join("/novel", "chapter-03.recovered.md")
          ? "chapter-03.recovered.md"
          : null;
      }
    });

    return (
      h.invoke(RECOVERY_CHANNELS.restoreCandidates, {
        items: [{ recoveryId: "row-1" }, { recoveryId: "row-2" }]
      }) as Promise<{
        ok: true;
        results: Array<{
          recoveryId: string;
          status: string;
          writtenPath?: string;
          projectRelativePath?: string;
        }>;
      }>
    ).then((result) => {
      const byId = new Map(result.results.map((r) => [r.recoveryId, r]));
      expect(byId.get("row-1")).toMatchObject({
        status: "written",
        projectRelativePath: "chapter-03.recovered.md"
      });
      // Outside the project root → no project-relative path, opens standalone.
      expect(byId.get("row-2")?.projectRelativePath).toBeUndefined();

      // Registration is attempted with the absolute written path only.
      expect(registered).toEqual([
        path.join("/novel", "chapter-03.recovered.md"),
        path.join("/novel", "chapter-04.recovered.md")
      ]);

      // The project-relative path is never written to a log line.
      expect(JSON.stringify(h.logEvents)).not.toContain(
        "chapter-03.recovered.md"
      );
    });
  });

  it("restoreCandidates reports 'failed' when the write throws, keeping the row", () => {
    seedTwoRows();
    const handlers = new Map<string, (e: unknown, a: unknown) => unknown>();
    const logEvents: Array<{ event: string }> = [];
    registerRecoveryCandidateIpc(
      { handle: (c, l) => handlers.set(c, l) },
      {
        getStatus: () => ownerStatus(),
        getOwnerDatabase: () => handle!.database,
        appVersion: "9.8.7-test",
        instanceRunId: "run",
        now: () => new Date("2026-08-29T12:41:00.000Z"),
        restoreFileSystem: {
          exists: () => Promise.resolve(false),
          writeFileAtomic: () => Promise.reject(new Error("disk full"))
        },
        logger: {
          log: (e) => logEvents.push(e as { event: string }),
          documentRefForKey: () => "document:session:1"
        }
      }
    );

    return (
      handlers.get(RECOVERY_CHANNELS.restoreCandidates)!({}, {
        items: [{ recoveryId: "row-1" }]
      }) as Promise<{ results: Array<{ status: string }> }>
    ).then((result) => {
      expect(result.results[0].status).toBe("failed");
      expect(logEvents.some((e) => e.event === "recovery.document.restore.failed")).toBe(
        true
      );
      expect(
        listRecoveryCandidates(handle!.database).map((c) => c.recoveryId)
      ).toContain("row-1");
    });
  });

  it("finalizeRestoredCandidates deletes only the given ids", () => {
    seedTwoRows();
    const h = buildHarness({ status: ownerStatus(), withDatabase: true });

    const result = h.invoke(RECOVERY_CHANNELS.finalizeRestoredCandidates, {
      recoveryIds: ["row-1"]
    }) as { ok: true; deleted: string[] };
    expect(result.deleted).toEqual(["row-1"]);
    expect(
      listRecoveryCandidates(handle!.database).map((c) => c.recoveryId)
    ).toEqual(["row-2"]);
    expect(
      h.logEvents.some((e) => e.event === "recovery.document.deleted")
    ).toBe(true);
  });

  it("discardCandidates deletes selected rows and logs a body-free count", () => {
    seedTwoRows();
    const h = buildHarness({ status: ownerStatus(), withDatabase: true });

    const result = h.invoke(RECOVERY_CHANNELS.discardCandidates, {
      recoveryIds: ["row-2"]
    }) as { ok: true; deleted: string[]; failed: string[] };
    expect(result.deleted).toEqual(["row-2"]);
    expect(result.failed).toEqual([]);
    expect(
      listRecoveryCandidates(handle!.database).map((c) => c.recoveryId)
    ).toEqual(["row-1"]);
    expect(
      h.logEvents.find((e) => e.event === "recovery.document.discarded")?.details
    ).toMatchObject({ count: 1 });
  });

  it("getReport returns a body-free report and does not mutate rows", () => {
    seedTwoRows();
    const h = buildHarness({ status: ownerStatus(), withDatabase: true });
    const before = listRecoveryCandidates(handle!.database).length;

    const result = h.invoke(RECOVERY_CHANNELS.getReport) as {
      ok: true;
      report: string;
    };
    expect(result.ok).toBe(true);
    expect(result.report).toContain("candidates: 2");
    expect(result.report).toContain(
      "It does not identify the cause of the previous shutdown or failure."
    );
    expect(result.report).not.toContain(BODY_MARKER);
    expect(result.report).not.toContain("/novel/chapter-03.md");
    expect(listRecoveryCandidates(handle!.database).length).toBe(before);
  });
});

describe("recovery candidate IPC — non-owner / unavailable", () => {
  for (const status of [
    {
      kind: "nonOwner",
      recoveryDirectoryPath: "C:/u/Recovery",
      lockDirectoryPath: "C:/u/Recovery/Recovery.lock",
      reason: "lockUnavailable"
    } as RecoveryStoreStatus,
    {
      kind: "unavailable",
      recoveryDirectoryPath: "C:/u/Recovery",
      reason: "databaseUnavailable"
    } as RecoveryStoreStatus,
    null
  ]) {
    it(`is a silent skip for status=${status?.kind ?? "null"}`, async () => {
      const h = buildHarness({ status, withDatabase: false });
      const expectedSkip =
        status?.kind === "nonOwner" ? "not-owner" : "unavailable";

      expect(h.invoke(RECOVERY_CHANNELS.listCandidates)).toEqual({
        ok: false,
        skipped: expectedSkip
      });
      expect(
        await (h.invoke(RECOVERY_CHANNELS.restoreCandidates, {
          items: [{ recoveryId: "row-1" }]
        }) as Promise<unknown>)
      ).toEqual({ ok: false, skipped: expectedSkip });
      expect(
        h.invoke(RECOVERY_CHANNELS.finalizeRestoredCandidates, {
          recoveryIds: ["row-1"]
        })
      ).toEqual({ ok: false, skipped: expectedSkip });
      expect(
        h.invoke(RECOVERY_CHANNELS.discardCandidates, { recoveryIds: ["row-1"] })
      ).toEqual({ ok: false, skipped: expectedSkip });
      expect(h.invoke(RECOVERY_CHANNELS.getReport)).toEqual({
        ok: false,
        skipped: expectedSkip
      });

      expect(h.logEvents).toEqual([]);
      expect(h.writes).toEqual([]);
    });
  }
});
