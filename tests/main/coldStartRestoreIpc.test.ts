import { describe, expect, it } from "vitest";
import {
  coldStartRestorePayload,
  NEUTRAL_COLD_START_RESTORE_PAYLOAD,
  registerColdStartRestoreIpc
} from "../../src/main/coldStartRestoreIpc";
import { SESSION_CHANNELS, type ColdStartRestorePayload } from "../../src/shared/api";
import type { ColdStartRestoreRead } from "../../src/main/sessionRestoreRead";
import {
  SESSION_SCHEMA_VERSION,
  type SessionRecord
} from "../../src/shared/session";
import { RUN_ID, sid } from "../shared/sessionTestFixtures";

function fakeIpcMain() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener);
    },
    invoke: (channel: string, senderId: number | undefined) =>
      handlers.get(channel)!({ sender: { id: senderId } })
  };
}

const record: SessionRecord = {
  schemaVersion: SESSION_SCHEMA_VERSION,
  sessionId: sid("cs"),
  instanceRunId: RUN_ID,
  updatedAt: "2026-08-28T00:00:00.000Z",
  projectContext: null,
  window: null,
  editors: [],
  activeEditor: null
};

const okRead: ColdStartRestoreRead = {
  kind: "ok",
  sessions: [record],
  skipped: [],
  manifestListedSessionCount: 1
};

describe("registerColdStartRestoreIpc (#274 BLOCKER 2)", () => {
  it("serves the real payload ONLY to the initial cold-start webContents", () => {
    const ipc = fakeIpcMain();
    const payload: ColdStartRestorePayload = coldStartRestorePayload(okRead, {
      kind: "pergamum",
      filePath: "/w/C/C.pergamum"
    });

    let coldStartWebContentsId: number | null = null;
    registerColdStartRestoreIpc(ipc, {
      getColdStartPayload: () => payload,
      getColdStartWebContentsId: () => coldStartWebContentsId
    });

    // Before the initial window exists: nobody gets the real payload.
    expect(ipc.invoke(SESSION_CHANNELS.getColdStartRestore, 1)).toEqual(
      NEUTRAL_COLD_START_RESTORE_PAYLOAD
    );

    // Initial cold-start window registers its webContents id.
    coldStartWebContentsId = 7;
    expect(ipc.invoke(SESSION_CHANNELS.getColdStartRestore, 7)).toBe(payload);
  });

  it("a later app.activate window (different webContents) gets the neutral payload", () => {
    const ipc = fakeIpcMain();
    const payload = coldStartRestorePayload(okRead, {
      kind: "markdown",
      filePath: "/w/x/a.md"
    });

    registerColdStartRestoreIpc(ipc, {
      getColdStartPayload: () => payload,
      getColdStartWebContentsId: () => 7
    });

    const activateWindowPayload = ipc.invoke(
      SESSION_CHANNELS.getColdStartRestore,
      42
    ) as ColdStartRestorePayload;

    expect(activateWindowPayload).toEqual(NEUTRAL_COLD_START_RESTORE_PAYLOAD);
    expect(activateWindowPayload.read.kind).toBe("empty");
    expect(activateWindowPayload.launchTarget).toBeNull();
  });

  it("a sender with no resolvable webContents id gets the neutral payload", () => {
    const ipc = fakeIpcMain();
    registerColdStartRestoreIpc(ipc, {
      getColdStartPayload: () => coldStartRestorePayload(okRead, null),
      getColdStartWebContentsId: () => 7
    });

    expect(ipc.invoke(SESSION_CHANNELS.getColdStartRestore, undefined)).toEqual(
      NEUTRAL_COLD_START_RESTORE_PAYLOAD
    );
  });
});
