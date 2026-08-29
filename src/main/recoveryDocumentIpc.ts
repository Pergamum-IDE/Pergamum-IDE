/**
 * Phase 6-4-3: renderer → main IPC for dirty Markdown working-copy payload
 * persistence.
 *
 *   RECOVERY_CHANNELS.upsertDocument  — flush the full dirty body
 *   RECOVERY_CHANNELS.deleteDocument  — Save-success cleanup ONLY
 *
 * A Recovery non-owner / unavailable instance returns a silent
 * `{ ok: false, skipped }` — it opens nothing, writes nothing, logs
 * nothing, and never notifies the user. Only the owner touches
 * `Recovery.db`.
 *
 * Nothing here logs `payload_text` or any manuscript fragment; the debug
 * events carry an opaque `documentRef` only.
 */

import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import type { IpcMain } from "electron";
import { RECOVERY_CHANNELS } from "../shared/api";
import type { RecoveryStoreStatus } from "../shared/recovery";
import {
  parseRecoveryDocumentDeleteRequest,
  parseRecoveryDocumentPayload,
  type RecoveryDocumentWriteResult
} from "../shared/recoveryDocument";
import { getDebugLogger, type DebugLogger } from "./debugLogger";
import {
  deleteRecoveryDocument,
  upsertRecoveryDocument
} from "./recoveryDocumentStore";

type RecoveryDocumentIpcLogger = Pick<
  DebugLogger,
  "log" | "documentRefForKey"
>;

export interface RecoveryDocumentIpcDeps {
  readonly getStatus: () => RecoveryStoreStatus | null;
  readonly getOwnerDatabase: () => BetterSqliteDatabase | null;
  readonly instanceRunId: string;
  readonly appVersion: string;
  readonly logger?: RecoveryDocumentIpcLogger;
  readonly now?: () => Date;
  readonly createRowId?: () => string;
}

type OwnerGuard =
  | { readonly kind: "owner"; readonly database: BetterSqliteDatabase }
  | { readonly kind: "skip"; readonly result: RecoveryDocumentWriteResult };

function resolveOwner(deps: RecoveryDocumentIpcDeps): OwnerGuard {
  const status = deps.getStatus();

  if (status?.kind === "nonOwner") {
    return { kind: "skip", result: { ok: false, skipped: "not-owner" } };
  }

  const database = deps.getOwnerDatabase();

  if (status?.kind !== "owner" || !database) {
    return { kind: "skip", result: { ok: false, skipped: "unavailable" } };
  }

  return { kind: "owner", database };
}

export function registerRecoveryDocumentIpc(
  ipcMain: Pick<IpcMain, "handle">,
  deps: RecoveryDocumentIpcDeps
): void {
  const logger = deps.logger ?? getDebugLogger();
  const now = deps.now ?? (() => new Date());

  ipcMain.handle(
    RECOVERY_CHANNELS.upsertDocument,
    (_event, rawPayload: unknown): RecoveryDocumentWriteResult => {
      const payload = parseRecoveryDocumentPayload(rawPayload);

      if (!payload) {
        return { ok: false, error: "invalid-payload" };
      }

      const owner = resolveOwner(deps);

      if (owner.kind === "skip") {
        return owner.result;
      }

      const startedAt = Date.now();

      try {
        const mode = upsertRecoveryDocument(owner.database, payload, {
          instanceRunId: deps.instanceRunId,
          appVersion: deps.appVersion,
          now,
          ...(deps.createRowId ? { createRowId: deps.createRowId } : {})
        });

        logger.log({
          level: "debug",
          event: "recovery.document.persisted",
          details: {
            // Recovery persistence is NOT a save — `saveTargetKind` is
            // deliberately not reused here.
            documentRef: logger.documentRefForKey(payload.documentKey),
            result: "succeeded",
            instanceRunId: deps.instanceRunId,
            durationMs: Math.max(0, Date.now() - startedAt)
          }
        });

        return { ok: true, mode };
      } catch (error) {
        logger.log({
          level: "error",
          event: "recovery.document.persist.failed",
          details: {
            documentRef: logger.documentRefForKey(payload.documentKey),
            result: "failed",
            reason: "database_unavailable",
            instanceRunId: deps.instanceRunId,
            durationMs: Math.max(0, Date.now() - startedAt),
            error
          }
        });

        return { ok: false, error: "persist-failed" };
      }
    }
  );

  ipcMain.handle(
    RECOVERY_CHANNELS.deleteDocument,
    (_event, rawRequest: unknown): RecoveryDocumentWriteResult => {
      const request = parseRecoveryDocumentDeleteRequest(rawRequest);

      if (!request) {
        return { ok: false, error: "invalid-request" };
      }

      const owner = resolveOwner(deps);

      if (owner.kind === "skip") {
        return owner.result;
      }

      const startedAt = Date.now();

      try {
        const mode = deleteRecoveryDocument(
          owner.database,
          request.documentKey
        );

        logger.log({
          level: "debug",
          event: "recovery.document.deleted",
          details: {
            documentRef: logger.documentRefForKey(request.documentKey),
            result: mode === "deleted" ? "succeeded" : "ignored",
            instanceRunId: deps.instanceRunId,
            durationMs: Math.max(0, Date.now() - startedAt)
          }
        });

        return { ok: true, mode };
      } catch (error) {
        logger.log({
          level: "error",
          event: "recovery.document.delete.failed",
          details: {
            documentRef: logger.documentRefForKey(request.documentKey),
            result: "failed",
            reason: "database_unavailable",
            instanceRunId: deps.instanceRunId,
            durationMs: Math.max(0, Date.now() - startedAt),
            error
          }
        });

        return { ok: false, error: "delete-failed" };
      }
    }
  );
}
