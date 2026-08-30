/**
 * #320: best-effort re-key of Recovery `documents` rows after a file was
 * renamed / moved on disk.
 *
 * `document_key` is the only identity that decides sameness for a Recovery
 * row, and it is `file:<normalized absolute path>` (project documents
 * included — there is no project-scoped Recovery identity yet). A Rename /
 * Move changes that path, so without this the row is stranded on the old
 * path: the candidate lists under the stale name and restore writes its
 * `.recovered.md` next to where the file used to be.
 *
 * Contract:
 *   - owner-only. A non-owner / unavailable store returns
 *     `{ ok: false, skipped }` and the caller's filesystem operation still
 *     succeeds.
 *   - never throws. A normalisation failure or a DB error for one pair is
 *     counted, logged, and the remaining pairs are still attempted.
 *   - a pre-existing row under the new `document_key` (UNIQUE) is a
 *     `collision`: both rows are left intact and it is logged. Recovery
 *     identity is never silently merged.
 *   - takes a pair LIST so a future batch / subtree Move can pass every
 *     successfully-moved path to the same helper.
 *
 * Nothing here logs a raw path or `payload_text`; events carry an opaque
 * `documentRef` derived from the old `document_key`.
 */

import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import { createFileEditorIdForPath } from "../shared/editorId";
import type { RecoveryStoreStatus } from "../shared/recovery";
import {
  recoveryFileDocumentKey,
  recoveryFileSourceUri,
  type RecoveryDocumentPathPair,
  type RecoveryPathRekeyOutcome,
  type RecoveryPathRekeyResult
} from "../shared/recoveryDocument";
import { getDebugLogger, type DebugLogger } from "./debugLogger";
import { rekeyRecoveryDocumentPath } from "./recoveryDocumentStore";

type RecoveryPathRekeyLogger = Pick<DebugLogger, "log" | "documentRefForKey">;

export interface RecoveryDocumentPathRekeyDeps {
  readonly getStatus: () => RecoveryStoreStatus | null;
  readonly getOwnerDatabase: () => BetterSqliteDatabase | null;
  readonly instanceRunId: string;
  readonly logger?: RecoveryPathRekeyLogger;
}

interface OwnerResolution {
  readonly database: BetterSqliteDatabase | null;
  readonly skipped: "not-owner" | "unavailable" | null;
}

function resolveOwner(deps: RecoveryDocumentPathRekeyDeps): OwnerResolution {
  const status = deps.getStatus();

  if (status?.kind === "nonOwner") {
    return { database: null, skipped: "not-owner" };
  }

  const database = deps.getOwnerDatabase();

  if (status?.kind !== "owner" || !database) {
    return { database: null, skipped: "unavailable" };
  }

  return { database, skipped: null };
}

interface NormalizedRecoveryFileKey {
  readonly documentKey: string;
  readonly sourceUri: string;
  readonly filePath: string;
  readonly displayName: string;
}

/**
 * The `document_key` / `source_uri` / `file_path` / `display_name` a capture
 * of `absolutePath` would write — same normalisation the renderer uses
 * (`createFileEditorIdForPath`). `null` when the path cannot be normalised.
 */
function normalizedRecoveryFileKey(
  absolutePath: string
): NormalizedRecoveryFileKey | null {
  try {
    const editorId = createFileEditorIdForPath(absolutePath);

    if (editorId.kind !== "file") {
      return null;
    }

    const normalized = editorId.path;

    return {
      documentKey: recoveryFileDocumentKey(normalized),
      sourceUri: recoveryFileSourceUri(normalized),
      filePath: normalized,
      displayName: normalized.slice(normalized.lastIndexOf("/") + 1)
    };
  } catch {
    return null;
  }
}

export function rekeyRecoveryDocumentPaths(
  deps: RecoveryDocumentPathRekeyDeps,
  pairs: readonly RecoveryDocumentPathPair[]
): RecoveryPathRekeyResult {
  const logger = deps.logger ?? getDebugLogger();
  const owner = resolveOwner(deps);

  if (owner.skipped !== null || !owner.database) {
    return { ok: false, skipped: owner.skipped ?? "unavailable" };
  }

  const database = owner.database;
  const outcomes: RecoveryPathRekeyOutcome[] = [];
  let rekeyed = 0;
  let noRow = 0;
  let collisions = 0;
  let errors = 0;

  for (const pair of pairs) {
    const oldKey = normalizedRecoveryFileKey(pair.oldAbsolutePath);
    const newKey = normalizedRecoveryFileKey(pair.newAbsolutePath);

    if (!oldKey || !newKey) {
      errors += 1;
      outcomes.push({
        oldAbsolutePath: pair.oldAbsolutePath,
        newAbsolutePath: pair.newAbsolutePath,
        status: "error"
      });
      logger.log({
        level: "error",
        event: "recovery.document.rekey.failed",
        details: {
          result: "failed",
          reason: "invalidPath",
          instanceRunId: deps.instanceRunId
        }
      });
      continue;
    }

    try {
      const status = rekeyRecoveryDocumentPath(database, {
        oldDocumentKey: oldKey.documentKey,
        newDocumentKey: newKey.documentKey,
        newSourceUri: newKey.sourceUri,
        newFilePath: newKey.filePath,
        newDisplayName: newKey.displayName
      });

      outcomes.push({
        oldAbsolutePath: pair.oldAbsolutePath,
        newAbsolutePath: pair.newAbsolutePath,
        status
      });

      if (status === "rekeyed") {
        rekeyed += 1;
        logger.log({
          level: "debug",
          event: "recovery.document.rekeyed",
          details: {
            documentRef: logger.documentRefForKey(oldKey.documentKey),
            result: "succeeded",
            instanceRunId: deps.instanceRunId
          }
        });
      } else if (status === "collision") {
        collisions += 1;
        logger.log({
          level: "info",
          event: "recovery.document.rekey.collision",
          details: {
            documentRef: logger.documentRefForKey(oldKey.documentKey),
            result: "ignored",
            instanceRunId: deps.instanceRunId
          }
        });
      } else {
        noRow += 1;
      }
    } catch (error) {
      errors += 1;
      outcomes.push({
        oldAbsolutePath: pair.oldAbsolutePath,
        newAbsolutePath: pair.newAbsolutePath,
        status: "error"
      });
      logger.log({
        level: "error",
        event: "recovery.document.rekey.failed",
        details: {
          documentRef: logger.documentRefForKey(oldKey.documentKey),
          result: "failed",
          reason: "database_unavailable",
          instanceRunId: deps.instanceRunId,
          error
        }
      });
    }
  }

  return { ok: true, rekeyed, noRow, collisions, errors, outcomes };
}
