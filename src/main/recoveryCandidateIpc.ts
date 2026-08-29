/**
 * Phase 6-4-4: renderer → main IPC for the Recovery candidate dialog.
 *
 *   recovery:listCandidates              — list rows for the dialog
 *   recovery:restoreCandidates           — write `.recovered.md` files (atomic).
 *                                          NEVER deletes a Recovery row.
 *   recovery:finalizeRestoredCandidates  — delete rows the renderer opened
 *   recovery:discardCandidates           — delete rows after the destructive
 *                                          confirmation
 *   recovery:getReport                   — body-free Recovery report text
 *
 * Every handler is Recovery-owner-only: a non-owner / unavailable instance
 * returns a silent `{ ok: false, skipped }`, opens nothing, writes nothing,
 * logs nothing, and shows no UI. Logs carry an opaque `documentRef` only —
 * never `payload_text`, a body fragment, a preview snippet, or a raw path.
 */

import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import type { IpcMain } from "electron";
import { RECOVERY_CHANNELS } from "../shared/api";
import { defaultLanguage, isLanguage } from "../shared/i18n";
import type { RecoveryStoreStatus } from "../shared/recovery";
import {
  parseRecoveryDiscardRequest,
  parseRecoveryFinalizeRequest,
  parseRecoveryRestoreRequest,
  type RecoveryCandidateListResult,
  type RecoveryDiscardResult,
  type RecoveryFinalizeResult,
  type RecoveryHasRecoverableResult,
  type RecoveryReportResult,
  type RecoveryRestoreItemResult,
  type RecoveryRestoreResult
} from "../shared/recoveryCandidate";
import { getDebugLogger, type DebugLogger } from "./debugLogger";
import {
  deleteRecoveryRowsById,
  getRecoveryRestoreRows,
  hasRecoverableCandidates,
  listRecoveryCandidates
} from "./recoveryCandidateStore";
import { buildRecoveryReport } from "./recoveryReport";
import {
  restoreRecoveryRow,
  type RecoveryRestoreFileSystem
} from "./recoveryRestore";

type RecoveryCandidateIpcLogger = Pick<
  DebugLogger,
  "log" | "documentRefForKey"
>;

export interface RecoveryCandidateIpcDeps {
  readonly getStatus: () => RecoveryStoreStatus | null;
  readonly getOwnerDatabase: () => BetterSqliteDatabase | null;
  readonly appVersion: string;
  readonly instanceRunId: string;
  readonly logger?: RecoveryCandidateIpcLogger;
  readonly now?: () => Date;
  /** Test seam for restore writes. */
  readonly restoreFileSystem?: RecoveryRestoreFileSystem;
  /**
   * #287 follow-up: register a just-written recovered file as a document of
   * the currently open project and return its project-root-relative path
   * (or `null` when it is not inside the open project root). Wired to
   * `registerCurrentProjectDocumentPath`; when omitted, every restore opens
   * as a standalone file (the pre-follow-up behavior).
   */
  readonly registerRestoredProjectDocument?: (
    absolutePath: string
  ) => string | null;
}

type OwnerResolution =
  | { readonly kind: "owner"; readonly database: BetterSqliteDatabase; readonly status: RecoveryStoreStatus }
  | { readonly kind: "skip"; readonly skipped: "not-owner" | "unavailable" };

function resolveRecoveryOwner(deps: RecoveryCandidateIpcDeps): OwnerResolution {
  const status = deps.getStatus();

  if (status?.kind === "nonOwner") {
    return { kind: "skip", skipped: "not-owner" };
  }

  const database = deps.getOwnerDatabase();

  if (status?.kind !== "owner" || !database) {
    return { kind: "skip", skipped: "unavailable" };
  }

  return { kind: "owner", database, status };
}

export function registerRecoveryCandidateIpc(
  ipcMain: Pick<IpcMain, "handle">,
  deps: RecoveryCandidateIpcDeps
): void {
  const logger = deps.logger ?? getDebugLogger();
  const now = deps.now ?? (() => new Date());

  ipcMain.handle(
    RECOVERY_CHANNELS.listCandidates,
    (): RecoveryCandidateListResult => {
      const owner = resolveRecoveryOwner(deps);

      if (owner.kind === "skip") {
        return { ok: false, skipped: owner.skipped };
      }

      const candidates = listRecoveryCandidates(
        owner.database,
        deps.instanceRunId
      );

      logger.log({
        level: "debug",
        event: "recovery.candidates.listed",
        details: {
          count: candidates.length,
          instanceRunId: deps.instanceRunId
        }
      });

      return { ok: true, candidates };
    }
  );

  ipcMain.handle(
    RECOVERY_CHANNELS.hasRecoverableCandidates,
    (): RecoveryHasRecoverableResult => {
      const owner = resolveRecoveryOwner(deps);

      if (owner.kind === "skip") {
        return { ok: false, skipped: owner.skipped };
      }

      return {
        ok: true,
        hasRecoverable: hasRecoverableCandidates(
          owner.database,
          deps.instanceRunId
        )
      };
    }
  );

  ipcMain.handle(
    RECOVERY_CHANNELS.restoreCandidates,
    async (_event, rawRequest: unknown): Promise<RecoveryRestoreResult> => {
      const request = parseRecoveryRestoreRequest(rawRequest);

      if (!request) {
        return { ok: true, results: [] };
      }

      const owner = resolveRecoveryOwner(deps);

      if (owner.kind === "skip") {
        return { ok: false, skipped: owner.skipped };
      }

      const targetById = new Map(
        request.items.map((item) => [item.recoveryId, item.targetPath])
      );
      const rows = getRecoveryRestoreRows(
        owner.database,
        request.items.map((item) => item.recoveryId),
        deps.instanceRunId
      );
      const results: RecoveryRestoreItemResult[] = [];

      for (const row of rows) {
        const restored = await restoreRecoveryRow(row, {
          ...(targetById.get(row.recoveryId)
            ? { targetPath: targetById.get(row.recoveryId) }
            : {}),
          ...(deps.restoreFileSystem
            ? { fileSystem: deps.restoreFileSystem }
            : {})
        });

        // #287 follow-up: if the file landed inside the open project root,
        // register it so the renderer can open it as a project-owned
        // document. `projectRelativePath` is a project-root-relative path
        // (never an absolute path) and is never logged.
        const projectRelativePath =
          restored.status === "written" &&
          restored.writtenPath &&
          deps.registerRestoredProjectDocument
            ? deps.registerRestoredProjectDocument(restored.writtenPath)
            : null;

        const result: RecoveryRestoreItemResult = projectRelativePath
          ? { ...restored, projectRelativePath }
          : restored;

        results.push(result);

        if (result.status === "written") {
          logger.log({
            level: "info",
            event: "recovery.document.restored",
            details: {
              documentRef: logger.documentRefForKey(row.recoveryId),
              result: "succeeded",
              instanceRunId: deps.instanceRunId
            }
          });
        } else {
          logger.log({
            level: "error",
            event: "recovery.document.restore.failed",
            details: {
              documentRef: logger.documentRefForKey(row.recoveryId),
              result: "failed",
              reason:
                result.status === "needs-destination"
                  ? "no_save_target"
                  : "unknown",
              instanceRunId: deps.instanceRunId
            }
          });
        }
      }

      // Two-phase restore: rows are deleted only by
      // `finalizeRestoredCandidates`, after the renderer opens the files.
      return { ok: true, results };
    }
  );

  ipcMain.handle(
    RECOVERY_CHANNELS.finalizeRestoredCandidates,
    (_event, rawRequest: unknown): RecoveryFinalizeResult => {
      const request = parseRecoveryFinalizeRequest(rawRequest);

      if (!request || request.recoveryIds.length === 0) {
        return { ok: true, deleted: [] };
      }

      const owner = resolveRecoveryOwner(deps);

      if (owner.kind === "skip") {
        return { ok: false, skipped: owner.skipped };
      }

      const { deleted } = deleteRecoveryRowsById(
        owner.database,
        request.recoveryIds
      );

      for (const recoveryId of deleted) {
        logger.log({
          level: "debug",
          event: "recovery.document.deleted",
          details: {
            documentRef: logger.documentRefForKey(recoveryId),
            result: "succeeded",
            instanceRunId: deps.instanceRunId
          }
        });
      }

      return { ok: true, deleted };
    }
  );

  ipcMain.handle(
    RECOVERY_CHANNELS.discardCandidates,
    (_event, rawRequest: unknown): RecoveryDiscardResult => {
      const request = parseRecoveryDiscardRequest(rawRequest);

      if (!request || request.recoveryIds.length === 0) {
        return { ok: true, deleted: [], failed: [] };
      }

      const owner = resolveRecoveryOwner(deps);

      if (owner.kind === "skip") {
        return { ok: false, skipped: owner.skipped };
      }

      const { deleted, failed } = deleteRecoveryRowsById(
        owner.database,
        request.recoveryIds
      );

      logger.log({
        level: "info",
        event: "recovery.document.discarded",
        details: {
          count: deleted.length,
          instanceRunId: deps.instanceRunId
        }
      });

      for (const recoveryId of failed) {
        logger.log({
          level: "error",
          event: "recovery.document.discard.failed",
          details: {
            documentRef: logger.documentRefForKey(recoveryId),
            result: "failed",
            reason: "database_unavailable",
            instanceRunId: deps.instanceRunId
          }
        });
      }

      return { ok: true, deleted, failed };
    }
  );

  ipcMain.handle(
    RECOVERY_CHANNELS.getReport,
    (_event, rawLanguage: unknown): RecoveryReportResult => {
      const owner = resolveRecoveryOwner(deps);

      if (owner.kind === "skip") {
        return { ok: false, skipped: owner.skipped };
      }

      const report = buildRecoveryReport({
        statusKind: owner.status.kind,
        appVersion: deps.appVersion,
        generatedAt: now().toISOString(),
        candidates: listRecoveryCandidates(
          owner.database,
          deps.instanceRunId
        ),
        language: isLanguage(rawLanguage) ? rawLanguage : defaultLanguage
      });

      return { ok: true, report };
    }
  );
}
