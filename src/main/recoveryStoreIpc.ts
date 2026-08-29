/**
 * Phase 6-4-2: the single, read-only Recovery Store IPC endpoint.
 *
 * `getStoreStatus` just returns the main process's already-resolved
 * `RecoveryStoreStatus` (owner / nonOwner / unavailable). It never opens
 * `Recovery.db` and never mutates anything — a non-owner instance can call
 * it and simply learns that it is a non-owner.
 */

import type { IpcMain } from "electron";
import { RECOVERY_CHANNELS } from "../shared/api";
import type { RecoveryStoreStatus } from "../shared/recovery";

export function registerRecoveryStoreIpc(
  ipcMain: Pick<IpcMain, "handle">,
  getStoreStatus: () => RecoveryStoreStatus | null
): void {
  ipcMain.handle(RECOVERY_CHANNELS.getStoreStatus, () => getStoreStatus());
}
