import { describe, expect, it, vi } from "vitest";
import {
  readColdStartRestoreSet,
  type ScheduleTimeout
} from "../../src/main/sessionRestoreRead";
import type {
  ColdStartRestoreSetReadResult,
  SessionStore
} from "../../src/main/sessionStore";
import {
  SESSION_MANIFEST_SCHEMA_VERSION,
  SESSION_SCHEMA_VERSION,
  type SessionManifest,
  type SessionRecord
} from "../../src/shared/session";
import { RUN_ID, sid } from "../shared/sessionTestFixtures";

function manifest(ids: string[]): SessionManifest {
  return {
    schemaVersion: SESSION_MANIFEST_SCHEMA_VERSION,
    sessions: ids,
    updatedAt: "2026-08-28T00:00:00.000Z"
  };
}

function record(label: string): SessionRecord {
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    sessionId: sid(label),
    instanceRunId: RUN_ID,
    updatedAt: "2026-08-28T00:00:00.000Z",
    projectContext: null,
    window: null,
    editors: [],
    activeEditor: null
  };
}

function storeReturning(
  result: ColdStartRestoreSetReadResult | Promise<ColdStartRestoreSetReadResult>
): Pick<SessionStore, "readRestoreSetForColdStart"> {
  return {
    readRestoreSetForColdStart: () => Promise.resolve(result)
  };
}

const immediateTimeout: ScheduleTimeout = () => ({ cancel: () => undefined });

describe("readColdStartRestoreSet (#274)", () => {
  it("normal read → ok with sessions + manifest count", async () => {
    const s1 = sid("s1");
    const result = await readColdStartRestoreSet({
      store: storeReturning({
        manifestOutcome: { kind: "usable", manifest: manifest([s1]) },
        sessions: [record("s1")],
        skipped: []
      }),
      scheduleTimeout: immediateTimeout
    });

    expect(result).toMatchObject({
      kind: "ok",
      manifestListedSessionCount: 1
    });
    expect(result.kind === "ok" && result.sessions[0].sessionId).toBe(s1);
  });

  it("missing manifest → empty", async () => {
    const result = await readColdStartRestoreSet({
      store: storeReturning({
        manifestOutcome: { kind: "empty" },
        sessions: [],
        skipped: []
      }),
      scheduleTimeout: immediateTimeout
    });
    expect(result).toEqual({ kind: "empty" });
  });

  it.each(["unreadable", "malformed", "unsupportedSchema"] as const)(
    "unavailable manifest (%s) → manifestUnavailable",
    async (reason) => {
      const result = await readColdStartRestoreSet({
        store: storeReturning({
          manifestOutcome: { kind: "unavailable", reason },
          sessions: [],
          skipped: []
        }),
        scheduleTimeout: immediateTimeout
      });
      expect(result).toEqual({ kind: "manifestUnavailable", reason });
    }
  );

  it("a slow read falls back to timedOut without blocking", async () => {
    let fire: () => void = () => undefined;
    const scheduleTimeout: ScheduleTimeout = (cb) => {
      fire = cb;
      return { cancel: vi.fn() };
    };

    const neverSettles = new Promise<ColdStartRestoreSetReadResult>(
      () => undefined
    );

    const promise = readColdStartRestoreSet({
      store: { readRestoreSetForColdStart: () => neverSettles },
      scheduleTimeout
    });

    fire();

    await expect(promise).resolves.toEqual({ kind: "timedOut" });
  });

  it("a late result after a timeout is ignored (no unhandled rejection)", async () => {
    let fire: () => void = () => undefined;
    const scheduleTimeout: ScheduleTimeout = (cb) => {
      fire = cb;
      return { cancel: () => undefined };
    };

    let rejectLate: (reason?: unknown) => void = () => undefined;
    const late = new Promise<ColdStartRestoreSetReadResult>((_res, rej) => {
      rejectLate = rej;
    });

    const promise = readColdStartRestoreSet({
      store: { readRestoreSetForColdStart: () => late },
      scheduleTimeout
    });

    fire();
    await expect(promise).resolves.toEqual({ kind: "timedOut" });

    // The read rejects only now — must not throw / warn.
    rejectLate(new Error("late I/O failure"));
    await Promise.resolve();
  });

  it("an unexpected reader rejection is treated as unreadable", async () => {
    const result = await readColdStartRestoreSet({
      store: {
        readRestoreSetForColdStart: () =>
          Promise.reject(new Error("boom"))
      },
      scheduleTimeout: immediateTimeout
    });
    expect(result).toEqual({
      kind: "manifestUnavailable",
      reason: "unreadable"
    });
  });
});
