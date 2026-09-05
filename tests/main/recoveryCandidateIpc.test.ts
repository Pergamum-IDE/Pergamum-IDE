import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECOVERY_CHANNELS } from "../../src/shared/api";
import { openRecoveryStoreDatabase } from "../../src/main/recoveryStoreDatabase";
import { upsertRecoveryDocument } from "../../src/main/recoveryDocumentStore";
import { listRecoveryCandidates } from "../../src/main/recoveryCandidateStore";
import { registerRecoveryCandidateIpc } from "../../src/main/recoveryCandidateIpc";
import { readLastSeenRecoverySetSignature } from "../../src/main/recoveryCandidateSeenState";
import type { RecoveryStoreStatus } from "../../src/shared/recovery";
import type { RecoveryDocumentPayload } from "../../src/shared/recoveryDocument";
import type { RecoveryRestoreFileSystem } from "../../src/main/recoveryRestore";

let workDir = "";
let handle: Awaited<ReturnType<typeof openRecoveryStoreDatabase>> | null = null;
let rowSeq = 0;

const BODY_MARKER = "SECRET_MANUSCRIPT_BODY_IPC_287";

// A stub satisfying IpcMainInvokeEvent's shape for handlers invoked
// directly in these tests — none of them read any property off the event.
const fakeIpcMainInvokeEvent = {} as IpcMainInvokeEvent;

type RegisteredIpcHandler = (
  event: IpcMainInvokeEvent,
  arg: unknown
) => unknown;

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
  const handlers = new Map<string, RegisteredIpcHandler>();
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
      instanceRunId: HARNESS_RUN_ID,
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
      return listener(fakeIpcMainInvokeEvent, arg);
    },
    logEvents,
    writes
  };
}

// The instance run id the IPC harness runs as, and the id used to seed
// "previous run" rows (visible as recovery candidates). Seeding with
// HARNESS_RUN_ID instead marks a row as this run's own live backup, which
// the candidate/report layer must hide (#288).
const HARNESS_RUN_ID = "0198d95f-97d8-7000-8000-00000000run";
const PREVIOUS_RUN_ID = "0198d95f-97d8-7000-8000-000000000old";

function ctx(now: string, instanceRunId: string = PREVIOUS_RUN_ID) {
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

  it("startup evaluates an unseen previous-run candidate set as auto-show without leaking body/path", () => {
    seedTwoRows();
    const h = buildHarness({ status: ownerStatus(), withDatabase: true });

    const result = h.invoke(RECOVERY_CHANNELS.evaluateStartupCandidates) as {
      ok: true;
      presentation: {
        kind: string;
        candidateCount: number;
        signature?: string;
        candidates?: Array<{ recoveryId: string }>;
      };
    };

    expect(result.ok).toBe(true);
    expect(result.presentation.kind).toBe("autoShow");
    expect(result.presentation.candidateCount).toBe(2);
    expect(result.presentation.signature).toMatch(/^[a-f0-9]{64}$/);
    expect(result.presentation.candidates?.map((c) => c.recoveryId).sort()).toEqual([
      "row-1",
      "row-2"
    ]);
    expect(readLastSeenRecoverySetSignature(handle!.database)).toBeNull();
    const serialized = JSON.stringify(result) + JSON.stringify(h.logEvents);
    expect(serialized).not.toContain(BODY_MARKER);
    expect(serialized).not.toContain("/novel/chapter-03.md");
  });

  it("startup requests only a reminder for an already-seen candidate set", () => {
    seedTwoRows();
    const h = buildHarness({ status: ownerStatus(), withDatabase: true });

    const first = h.invoke(RECOVERY_CHANNELS.markCandidatesSeen) as {
      ok: true;
      signature: string | null;
    };
    const second = h.invoke(RECOVERY_CHANNELS.evaluateStartupCandidates) as {
      ok: true;
      presentation: { kind: string; candidateCount: number; signature?: string };
    };

    expect(second.presentation).toEqual({
      kind: "reminder",
      candidateCount: 2,
      signature: first.signature
    });
  });

  it("manual display markCandidatesSeen saves the current previous-run signature", () => {
    seedTwoRows();
    const h = buildHarness({ status: ownerStatus(), withDatabase: true });

    expect(readLastSeenRecoverySetSignature(handle!.database)).toBeNull();

    const result = h.invoke(RECOVERY_CHANNELS.markCandidatesSeen) as {
      ok: true;
      candidateCount: number;
      signature: string | null;
    };

    expect(result.candidateCount).toBe(2);
    expect(result.signature).toMatch(/^[a-f0-9]{64}$/);
    expect(readLastSeenRecoverySetSignature(handle!.database)).toBe(
      result.signature
    );
  });

  it("startup ignores current-run rows for auto-show/signature/reminder", () => {
    seedCurrentRunRow();
    const h = buildHarness({ status: ownerStatus(), withDatabase: true });

    expect(h.invoke(RECOVERY_CHANNELS.evaluateStartupCandidates)).toEqual({
      ok: true,
      presentation: { kind: "none", candidateCount: 0 }
    });
    expect(readLastSeenRecoverySetSignature(handle!.database)).toBeNull();
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
        listRecoveryCandidates(handle!.database, HARNESS_RUN_ID).map((c) => c.recoveryId).sort()
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
    const handlers = new Map<string, RegisteredIpcHandler>();
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
      handlers.get(RECOVERY_CHANNELS.restoreCandidates)!(
        fakeIpcMainInvokeEvent,
        {
          items: [{ recoveryId: "row-1" }]
        }
      ) as Promise<{ results: Array<{ status: string }> }>
    ).then((result) => {
      expect(result.results[0].status).toBe("failed");
      expect(logEvents.some((e) => e.event === "recovery.document.restore.failed")).toBe(
        true
      );
      expect(
        listRecoveryCandidates(handle!.database, HARNESS_RUN_ID).map((c) => c.recoveryId)
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
      listRecoveryCandidates(handle!.database, HARNESS_RUN_ID).map((c) => c.recoveryId)
    ).toEqual(["row-2"]);
    expect(
      h.logEvents.some((e) => e.event === "recovery.document.deleted")
    ).toBe(true);
  });

  it("discardCandidates deletes selected rows and logs a body-free count", () => {
    seedTwoRows();
    const h = buildHarness({ status: ownerStatus(), withDatabase: true });
    h.invoke(RECOVERY_CHANNELS.evaluateStartupCandidates);

    const result = h.invoke(RECOVERY_CHANNELS.discardCandidates, {
      recoveryIds: ["row-2"]
    }) as { ok: true; deleted: string[]; failed: string[] };
    expect(result.deleted).toEqual(["row-2"]);
    expect(result.failed).toEqual([]);
    expect(
      listRecoveryCandidates(handle!.database, HARNESS_RUN_ID).map((c) => c.recoveryId)
    ).toEqual(["row-1"]);
    expect(
      h.logEvents.find((e) => e.event === "recovery.document.discarded")?.details
    ).toMatchObject({ count: 1 });

    const nextStartup = h.invoke(
      RECOVERY_CHANNELS.evaluateStartupCandidates
    ) as {
      ok: true;
      presentation: { kind: string; candidateCount: number };
    };
    expect(nextStartup.presentation.kind).toBe("reminder");
    expect(nextStartup.presentation.candidateCount).toBe(1);
  });

  it("getReport returns a body-free report and does not mutate rows", () => {
    seedTwoRows();
    const h = buildHarness({ status: ownerStatus(), withDatabase: true });
    const before = listRecoveryCandidates(handle!.database, HARNESS_RUN_ID).length;

    const result = h.invoke(RECOVERY_CHANNELS.getReport, "en") as {
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
    expect(listRecoveryCandidates(handle!.database, HARNESS_RUN_ID).length).toBe(before);
  });

  it("getReport emits the heading/disclaimer in the requested UI language only", () => {
    seedTwoRows();
    const h = buildHarness({ status: ownerStatus(), withDatabase: true });

    const ja = h.invoke(RECOVERY_CHANNELS.getReport, "ja") as {
      ok: true;
      report: string;
    };
    expect(ja.report).toContain("Pergamum 復旧レポート");
    expect(ja.report).toContain(
      "前回終了または障害の原因を特定するものではありません。"
    );
    expect(ja.report).not.toContain(
      "It does not identify the cause of the previous shutdown or failure."
    );

    const en = h.invoke(RECOVERY_CHANNELS.getReport, "en") as {
      ok: true;
      report: string;
    };
    expect(en.report).toContain("Pergamum Recovery Report");
    expect(en.report).toContain(
      "It does not identify the cause of the previous shutdown or failure."
    );
    expect(en.report).not.toContain(
      "前回終了または障害の原因を特定するものではありません。"
    );

    // An unknown / missing language falls back to the default (ja) rather
    // than emitting both languages.
    const fallback = h.invoke(RECOVERY_CHANNELS.getReport, "fr") as {
      ok: true;
      report: string;
    };
    expect(fallback.report).toContain("Pergamum 復旧レポート");
    expect(fallback.report).not.toContain("Pergamum Recovery Report");
  });

  // -----------------------------------------------------------------------
  // #288 follow-up: previous-run vs current-run candidate semantics.
  // -----------------------------------------------------------------------

  function seedCurrentRunRow(displayName = "live.md"): void {
    upsertRecoveryDocument(
      handle!.database,
      filePayload({
        documentKey: `file:/novel/${displayName}`,
        sourceUri: `file:///novel/${displayName}`,
        filePath: `/novel/${displayName}`,
        displayName
      }),
      ctx("2026-08-29T12:50:00.000Z", HARNESS_RUN_ID)
    );
  }

  it("hasRecoverableCandidates is true only when a previous-run row exists", () => {
    const h = buildHarness({ status: ownerStatus(), withDatabase: true });

    // zero rows
    expect(
      h.invoke(RECOVERY_CHANNELS.hasRecoverableCandidates)
    ).toEqual({ ok: true, hasRecoverable: false });

    // only this run's own live backup
    seedCurrentRunRow();
    expect(
      h.invoke(RECOVERY_CHANNELS.hasRecoverableCandidates)
    ).toEqual({ ok: true, hasRecoverable: false });

    // a previous-run row appears
    seedTwoRows();
    expect(
      h.invoke(RECOVERY_CHANNELS.hasRecoverableCandidates)
    ).toEqual({ ok: true, hasRecoverable: true });
  });

  it("listCandidates hides current-run rows and keeps them in Recovery.db", () => {
    seedCurrentRunRow("live-a.md");
    seedCurrentRunRow("live-b.md");
    const h = buildHarness({ status: ownerStatus(), withDatabase: true });

    const listed = h.invoke(RECOVERY_CHANNELS.listCandidates) as {
      ok: true;
      candidates: Array<{ displayName: string }>;
    };
    expect(listed.candidates).toEqual([]);

    // Both current-run rows are still stored (visible to a future run).
    expect(
      (
        handle!.database
          .prepare("SELECT COUNT(*) AS n FROM documents")
          .get() as { n: number }
      ).n
    ).toBe(2);
  });

  it("listCandidates / getReport expose only previous-run rows from a mixed store", () => {
    seedTwoRows(); // row-1, row-2 — previous run
    seedCurrentRunRow("live.md"); // row-3 — this run
    const h = buildHarness({ status: ownerStatus(), withDatabase: true });

    const listed = h.invoke(RECOVERY_CHANNELS.listCandidates) as {
      ok: true;
      candidates: Array<{ recoveryId: string; displayName: string }>;
    };
    expect(listed.candidates.map((c) => c.recoveryId).sort()).toEqual([
      "row-1",
      "row-2"
    ]);
    expect(listed.candidates.map((c) => c.displayName)).not.toContain(
      "live.md"
    );

    const report = (
      h.invoke(RECOVERY_CHANNELS.getReport, "en") as {
        ok: true;
        report: string;
      }
    ).report;
    expect(report).toContain("candidates: 2");
    expect(report).not.toContain("live.md");
    expect(report).not.toContain(BODY_MARKER);
    expect(report).not.toContain("/novel/chapter-03.md");
    expect(report).not.toContain("document_key");
    expect(report).not.toContain("source_uri");
  });

  it("getReport reports candidates: 0 when only current-run rows exist", () => {
    seedCurrentRunRow();
    const h = buildHarness({ status: ownerStatus(), withDatabase: true });

    const report = (
      h.invoke(RECOVERY_CHANNELS.getReport, "en") as {
        ok: true;
        report: string;
      }
    ).report;
    expect(report).toContain("candidates: 0");
  });

  it("restoreCandidates refuses a hidden current-run row id", async () => {
    seedCurrentRunRow("live.md"); // row-1, current run
    const h = buildHarness({ status: ownerStatus(), withDatabase: true });

    const result = (await h.invoke(RECOVERY_CHANNELS.restoreCandidates, {
      items: [{ recoveryId: "row-1" }]
    })) as { ok: true; results: unknown[] };

    // No restore row was resolved → nothing written, row untouched.
    expect(result.results).toEqual([]);
    expect(h.writes).toEqual([]);
    expect(
      (
        handle!.database
          .prepare("SELECT COUNT(*) AS n FROM documents")
          .get() as { n: number }
      ).n
    ).toBe(1);
  });

  it("finalizing previous-run rows never deletes unrelated current-run rows", () => {
    seedTwoRows(); // row-1, row-2 — previous run
    seedCurrentRunRow("live.md"); // row-3 — this run
    const h = buildHarness({ status: ownerStatus(), withDatabase: true });

    const result = h.invoke(RECOVERY_CHANNELS.finalizeRestoredCandidates, {
      recoveryIds: ["row-1", "row-2"]
    }) as { ok: true; deleted: string[] };
    expect(result.deleted.sort()).toEqual(["row-1", "row-2"]);

    const remaining = handle!.database
      .prepare("SELECT id FROM documents")
      .all() as Array<{ id: string }>;
    expect(remaining.map((r) => r.id)).toEqual(["row-3"]);
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
      expect(h.invoke(RECOVERY_CHANNELS.evaluateStartupCandidates)).toEqual({
        ok: false,
        skipped: expectedSkip
      });
      expect(h.invoke(RECOVERY_CHANNELS.markCandidatesSeen)).toEqual({
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
      expect(
        h.invoke(RECOVERY_CHANNELS.hasRecoverableCandidates)
      ).toEqual({ ok: false, skipped: expectedSkip });

      expect(h.logEvents).toEqual([]);
      expect(h.writes).toEqual([]);
    });
  }
});
