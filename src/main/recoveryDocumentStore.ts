/**
 * Phase 6-4-3: UPSERT / DELETE of a dirty Markdown working-copy row in the
 * Recovery Store's `documents` table. Only the Recovery *owner* instance
 * calls this (the IPC layer enforces that).
 *
 * Invariants:
 *   - identity is `document_key` and nothing else,
 *   - `payload_text` holds the FULL body — no diff / incremental encoding,
 *   - the base fingerprint (`base_mtime_ms` / `base_size` / `base_sha256`)
 *     is written ONLY when the row is first inserted; a dirty-update UPSERT
 *     MUST NOT touch it (`ON CONFLICT ... DO UPDATE` deliberately omits
 *     those columns), so an external change to the source file after the
 *     working copy diverged stays detectable,
 *   - `DELETE` here is Save-success cleanup ONLY — never wired to tab
 *     close, discard UI, or any user action (that is Phase 6-4-4).
 */

import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import { createUuidv7 } from "./ids";
import {
  type RecoveryDocumentPayload,
  type RecoveryDocumentWriteMode
} from "../shared/recoveryDocument";

export interface UpsertRecoveryDocumentContext {
  readonly instanceRunId: string;
  readonly appVersion: string;
  readonly now: () => Date;
  /** Injectable so tests get a deterministic row `id`. */
  readonly createRowId?: () => string;
}

/**
 * Insert a new Recovery row for `payload.documentKey`, or update the
 * existing one. The base fingerprint columns are written on INSERT only.
 * Returns `"inserted"` / `"updated"`.
 */
export function upsertRecoveryDocument(
  database: BetterSqliteDatabase,
  payload: RecoveryDocumentPayload,
  context: UpsertRecoveryDocumentContext
): RecoveryDocumentWriteMode {
  const createRowId = context.createRowId ?? createUuidv7;
  const nowIso = context.now().toISOString();
  const existing = database
    .prepare("SELECT id FROM documents WHERE document_key = ?")
    .get(payload.documentKey) as { id: string } | undefined;

  database
    .prepare(
      `INSERT INTO documents (
        id,
        document_key,
        document_type,
        source_uri,
        display_name,
        project_id,
        project_file_path,
        file_path,
        document_encoding,
        document_lineend,
        base_mtime_ms,
        base_size,
        base_sha256,
        payload_text,
        origin_instance_run_id,
        created_at,
        updated_at,
        app_version
      ) VALUES (
        @id, @documentKey, @documentType, @sourceUri, @displayName,
        @projectId, @projectFilePath, @filePath,
        @documentEncoding, @documentLineend,
        @baseMtimeMs, @baseSize, @baseSha256,
        @payloadText, @originInstanceRunId,
        @createdAt, @updatedAt, @appVersion
      )
      ON CONFLICT(document_key) DO UPDATE SET
        document_type = excluded.document_type,
        source_uri = excluded.source_uri,
        display_name = excluded.display_name,
        project_id = excluded.project_id,
        project_file_path = excluded.project_file_path,
        file_path = excluded.file_path,
        document_encoding = excluded.document_encoding,
        document_lineend = excluded.document_lineend,
        payload_text = excluded.payload_text,
        origin_instance_run_id = excluded.origin_instance_run_id,
        updated_at = excluded.updated_at,
        app_version = excluded.app_version`
    )
    .run({
      id: createRowId(),
      documentKey: payload.documentKey,
      documentType: payload.documentType,
      sourceUri: payload.sourceUri,
      displayName: payload.displayName,
      projectId: payload.projectId ?? null,
      projectFilePath: payload.projectFilePath ?? null,
      filePath: payload.filePath ?? null,
      documentEncoding: payload.documentEncoding ?? null,
      documentLineend: payload.documentLineend ?? null,
      // Phase 6-4-3: mtime is not captured yet.
      baseMtimeMs: payload.baseMtimeMs ?? null,
      baseSize: payload.baseSize ?? null,
      baseSha256: payload.baseSha256 ?? null,
      payloadText: payload.payloadText,
      originInstanceRunId: context.instanceRunId,
      createdAt: nowIso,
      updatedAt: nowIso,
      appVersion: context.appVersion
    });

  return existing ? "updated" : "inserted";
}

/**
 * Remove the Recovery row for `documentKey`. Returns `"deleted"` when a row
 * was removed, `"noop"` when there was none.
 */
export function deleteRecoveryDocument(
  database: BetterSqliteDatabase,
  documentKey: string
): RecoveryDocumentWriteMode {
  const result = database
    .prepare("DELETE FROM documents WHERE document_key = ?")
    .run(documentKey);

  return result.changes > 0 ? "deleted" : "noop";
}
