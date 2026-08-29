/**
 * Phase 6-4-4: read side of the Recovery candidate dialog.
 *
 * `listRecoveryCandidates` maps `documents` rows to the renderer-facing
 * `RecoveryCandidate` DTO. It deliberately does NOT expose `payload_text`
 * or any raw filesystem path — the only derived text that leaves is the
 * display-only `previewSnippet`, and paths are reduced to
 * `hasFilePath` / `hasProjectFilePath` booleans. Restore reads the raw
 * path through `getRecoveryRestoreRows`, which stays main-side.
 *
 * #288 follow-up: Recovery is for dirty working copies left behind by a
 * *previous* run / abnormal termination — never a UI for the current
 * process's own live dirty documents. Every read here filters out rows
 * whose `origin_instance_run_id` equals the current app `instanceRunId`,
 * so a clean run that has merely persisted its own Recovery backups shows
 * nothing. Those current-run rows stay in `Recovery.db`; if this process
 * is later hard-killed they become visible to the next run (which has a
 * different `instanceRunId`). This filter is enforced main-side, not by
 * renderer hiding.
 */

import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import {
  isRecoveryDocumentEncoding,
  isRecoveryDocumentLineEnd,
  isRecoveryDocumentType,
  type RecoveryDocumentEncoding,
  type RecoveryDocumentLineEnd,
  type RecoveryDocumentType
} from "../shared/recoveryDocument";
import type { RecoveryCandidate } from "../shared/recoveryCandidate";
import type { RecoveryRestoreRow } from "./recoveryRestore";
import { buildRecoveryPreviewSnippet } from "./recoveryPreviewSnippet";

interface DocumentRow {
  readonly id: string;
  readonly document_type: string;
  readonly display_name: string;
  readonly project_file_path: string | null;
  readonly file_path: string | null;
  readonly document_encoding: string | null;
  readonly document_lineend: string | null;
  readonly payload_text: string;
  readonly updated_at: string;
}

function encodingOrNull(value: string | null): RecoveryDocumentEncoding | null {
  return value !== null && isRecoveryDocumentEncoding(value) ? value : null;
}

function lineEndOrNull(value: string | null): RecoveryDocumentLineEnd | null {
  return value !== null && isRecoveryDocumentLineEnd(value) ? value : null;
}

function typeOrDefault(value: string): RecoveryDocumentType {
  return isRecoveryDocumentType(value) ? value : "markdown.file";
}

function hasPath(value: string | null): boolean {
  return typeof value === "string" && value.length > 0;
}

/** Neutral fallback when a stored `display_name` normalizes to nothing. */
export const RECOVERY_DEFAULT_DISPLAY_NAME = "recovered.md";

/**
 * `documents.display_name` is written by the renderer at capture time and is
 * NOT schema-guaranteed to be a bare file name. Normalize it to a basename
 * (both separators, final non-empty trimmed segment) before it crosses to
 * the renderer / into the report, so a full path can never leak here.
 */
export function safeRecoveryDisplayName(rawDisplayName: string): string {
  const segments = rawDisplayName
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  const last = segments[segments.length - 1];

  return last && last.length > 0 ? last : RECOVERY_DEFAULT_DISPLAY_NAME;
}

function toCandidate(row: DocumentRow): RecoveryCandidate {
  return {
    recoveryId: row.id,
    documentType: typeOrDefault(row.document_type),
    displayName: safeRecoveryDisplayName(row.display_name),
    documentEncoding: encodingOrNull(row.document_encoding),
    documentLineend: lineEndOrNull(row.document_lineend),
    updatedAt: row.updated_at,
    characterCount: Array.from(row.payload_text).length,
    previewSnippet: buildRecoveryPreviewSnippet(row.payload_text),
    hasFilePath: hasPath(row.file_path),
    hasProjectFilePath: hasPath(row.project_file_path)
  };
}

/**
 * Every *previous-run* Recovery row as a candidate, most-recently-updated
 * first. Rows whose `origin_instance_run_id` equals `currentInstanceRunId`
 * (this process's own live dirty backups) are excluded — see the file
 * header.
 */
export function listRecoveryCandidates(
  database: BetterSqliteDatabase,
  currentInstanceRunId: string
): RecoveryCandidate[] {
  const rows = database
    .prepare(
      `SELECT id, document_type, display_name,
              project_file_path, file_path, document_encoding, document_lineend,
              payload_text, updated_at
       FROM documents
       WHERE origin_instance_run_id <> @currentInstanceRunId
       ORDER BY updated_at DESC, id DESC`
    )
    .all({ currentInstanceRunId }) as DocumentRow[];

  return rows.map(toCandidate);
}

/**
 * `true` when at least one previous-run Recovery row exists (i.e. there is
 * something the Recovery dialog could actually show). Drives the
 * `recovery.hasRecoverableCandidates` command context key. Current-run
 * rows never count.
 */
export function hasRecoverableCandidates(
  database: BetterSqliteDatabase,
  currentInstanceRunId: string
): boolean {
  const row = database
    .prepare(
      `SELECT 1 FROM documents
       WHERE origin_instance_run_id <> @currentInstanceRunId
       LIMIT 1`
    )
    .get({ currentInstanceRunId });

  return row !== undefined;
}

/**
 * The raw rows (including `file_path` and `payload_text`) needed to write a
 * restore. Returned in the same order as `recoveryIds`, skipping ids with
 * no matching row.
 *
 * #288 follow-up: a current-run row (`origin_instance_run_id ===
 * currentInstanceRunId`) is never returned even if its id is passed
 * explicitly, so a hidden live dirty document can't be restored through
 * the normal dialog flow.
 */
export function getRecoveryRestoreRows(
  database: BetterSqliteDatabase,
  recoveryIds: readonly string[],
  currentInstanceRunId: string
): RecoveryRestoreRow[] {
  const select = database.prepare(
    `SELECT id, document_type, display_name, file_path, payload_text
     FROM documents
     WHERE id = @id AND origin_instance_run_id <> @currentInstanceRunId`
  );
  const rows: RecoveryRestoreRow[] = [];

  for (const recoveryId of recoveryIds) {
    const row = select.get({ id: recoveryId, currentInstanceRunId }) as
      | {
          id: string;
          document_type: string;
          display_name: string;
          file_path: string | null;
          payload_text: string;
        }
      | undefined;

    if (!row) {
      continue;
    }

    rows.push({
      recoveryId: row.id,
      documentType: typeOrDefault(row.document_type),
      displayName: safeRecoveryDisplayName(row.display_name),
      filePath: hasPath(row.file_path) ? row.file_path : null,
      payloadText: row.payload_text
    });
  }

  return rows;
}

/**
 * Delete Recovery rows by `documents.id`.
 *
 *   - `deleted` — ids whose row was actually removed (`changes > 0`).
 *   - `missing` — ids with no matching row (already gone; not a failure).
 *   - `failed`  — ids whose DELETE threw; the row is left in place.
 */
export function deleteRecoveryRowsById(
  database: BetterSqliteDatabase,
  recoveryIds: readonly string[]
): { deleted: string[]; missing: string[]; failed: string[] } {
  const del = database.prepare("DELETE FROM documents WHERE id = ?");
  const deleted: string[] = [];
  const missing: string[] = [];
  const failed: string[] = [];

  for (const recoveryId of recoveryIds) {
    try {
      const result = del.run(recoveryId);
      if (result.changes > 0) {
        deleted.push(recoveryId);
      } else {
        missing.push(recoveryId);
      }
    } catch {
      failed.push(recoveryId);
    }
  }

  return { deleted, missing, failed };
}
