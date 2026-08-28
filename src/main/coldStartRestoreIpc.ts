/**
 * #274: main-side assembly + delivery of the cold-start restore payload.
 *
 * At startup, `main.ts` runs the bounded restore-set read once (before the
 * window is created, so Window state can be applied) and extracts the
 * launch target from argv. The renderer fetches the combined payload once
 * via `SESSION_CHANNELS.getColdStartRestore`.
 *
 * This module only shapes and serves that payload — it never writes,
 * repairs, or deletes anything.
 */

import { SESSION_CHANNELS, type ColdStartRestorePayload } from "../shared/api";
import type { ColdStartLaunchTarget } from "../shared/sessionRestore";
import type { ColdStartRestoreRead } from "./sessionRestoreRead";

type IpcMainLike = {
  handle(
    channel: string,
    listener: (...args: unknown[]) => unknown
  ): void;
};

/**
 * #274: the payload handed to any renderer that is NOT the initial
 * cold-start window (BLOCKER 2). It restores nothing and carries no launch
 * target / Window placement, so a later `app.activate` window (macOS: last
 * window closed → dock re-activate) cannot replay the original startup
 * Session snapshot.
 */
export const NEUTRAL_COLD_START_RESTORE_PAYLOAD: ColdStartRestorePayload = {
  read: { kind: "empty" },
  launchTarget: null
};

function senderWebContentsId(event: unknown): number | undefined {
  if (typeof event !== "object" || event === null || !("sender" in event)) {
    return undefined;
  }

  const sender = (event as { sender?: { id?: unknown } }).sender;

  return sender && typeof sender.id === "number" ? sender.id : undefined;
}

export function coldStartRestorePayload(
  read: ColdStartRestoreRead,
  launchTarget: ColdStartLaunchTarget | null
): ColdStartRestorePayload {
  switch (read.kind) {
    case "ok":
      return {
        read: {
          kind: "ok",
          sessions: [...read.sessions],
          manifestListedSessionCount: read.manifestListedSessionCount,
          skippedSessionCount: read.skipped.length
        },
        launchTarget
      };
    case "empty":
      return { read: { kind: "empty" }, launchTarget };
    case "manifestUnavailable":
      return {
        read: { kind: "manifestUnavailable", reason: read.reason },
        launchTarget
      };
    case "timedOut":
      return { read: { kind: "timedOut" }, launchTarget };
  }
}

export interface ColdStartRestoreIpcOptions {
  /** The full cold-start payload — served ONLY to the initial cold-start
   *  window's webContents. */
  readonly getColdStartPayload: () => ColdStartRestorePayload;
  /** The initial cold-start window's `webContents.id`, or `null` until it
   *  exists. Any other sender gets `NEUTRAL_COLD_START_RESTORE_PAYLOAD`. */
  readonly getColdStartWebContentsId: () => number | null;
}

export function registerColdStartRestoreIpc(
  ipcMain: IpcMainLike,
  options: ColdStartRestoreIpcOptions
): void {
  ipcMain.handle(SESSION_CHANNELS.getColdStartRestore, (event: unknown) => {
    const coldStartId = options.getColdStartWebContentsId();

    return coldStartId !== null &&
      senderWebContentsId(event) === coldStartId
      ? options.getColdStartPayload()
      : NEUTRAL_COLD_START_RESTORE_PAYLOAD;
  });
}
