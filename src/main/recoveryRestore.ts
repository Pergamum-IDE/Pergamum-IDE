/**
 * Phase 6-4-4: writing a Recovery candidate's stored body out to a NEW
 * `.recovered[-N].md` file.
 *
 * Contract (two-phase restore):
 *   - this module ONLY writes files. It NEVER deletes a Recovery row — the
 *     renderer opens the written file, and only then calls
 *     `finalizeRestoredCandidates` to delete the row.
 *   - the original file is never overwritten (fresh `.recovered` name),
 *   - an existing recovered file is never overwritten (`-2`, `-3`, … until
 *     a free name is found),
 *   - the write is atomic (temp → fsync → rename),
 *   - `payload_text` is written verbatim: #286 already stored it with the
 *     document's reconstructed line endings, BOM-less UTF-8. Line endings
 *     and encoding are therefore preserved as far as this phase can.
 *     A UTF-8 BOM is NOT restorable in this phase (never captured, and the
 *     write pipeline never emits one).
 */

import { promises as nodeFs } from "node:fs";
import path from "node:path";
import { writeFileAtomic } from "./atomicFileWrite";
import type {
  RecoveryRestoreItemResult,
  RecoveryRestoreItemStatus
} from "../shared/recoveryCandidate";
import type { RecoveryDocumentType } from "../shared/recoveryDocument";

/** A Recovery row reduced to what a restore write needs. */
export interface RecoveryRestoreRow {
  readonly recoveryId: string;
  readonly documentType: RecoveryDocumentType;
  readonly displayName: string;
  /** Stored absolute path (present for `markdown.file`, null for Untitled). */
  readonly filePath: string | null;
  readonly payloadText: string;
}

export interface RecoveryRestoreFileSystem {
  exists(targetPath: string): Promise<boolean>;
  writeFileAtomic(targetPath: string, data: string): Promise<void>;
}

const MAX_RECOVERED_NAME_ATTEMPTS = 10_000;

export const defaultRecoveryRestoreFileSystem: RecoveryRestoreFileSystem = {
  async exists(targetPath) {
    try {
      await nodeFs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  },
  writeFileAtomic: (targetPath, data) => writeFileAtomic(targetPath, data)
};

/**
 * The first free `.recovered` sibling of `idealPath`:
 * `chapter-03.md` → `chapter-03.recovered.md`, then
 * `chapter-03.recovered-2.md`, `-3`, …
 */
export async function resolveRecoveredPath(
  idealPath: string,
  exists: (targetPath: string) => Promise<boolean>
): Promise<string> {
  const dir = path.dirname(idealPath);
  const ext = path.extname(idealPath) || ".md";
  const stem = path.basename(idealPath, ext);

  for (let attempt = 1; attempt <= MAX_RECOVERED_NAME_ATTEMPTS; attempt += 1) {
    const name =
      attempt === 1
        ? `${stem}.recovered${ext}`
        : `${stem}.recovered-${attempt}${ext}`;
    const candidate = path.join(dir, name);

    if (!(await exists(candidate))) {
      return candidate;
    }
  }

  throw new Error(
    `Could not find a free .recovered name near ${path.basename(idealPath)}`
  );
}

function result(
  row: RecoveryRestoreRow,
  status: RecoveryRestoreItemStatus,
  writtenPath?: string
): RecoveryRestoreItemResult {
  return {
    recoveryId: row.recoveryId,
    status,
    displayName: row.displayName,
    documentType: row.documentType,
    ...(writtenPath ? { writtenPath } : {})
  };
}

/**
 * Write one Recovery row's body to a fresh `.recovered[-N].md` file.
 *
 * The "ideal" location is the stored `file_path` when present, otherwise the
 * caller-provided `targetPath` (which the renderer obtains from the
 * Save-location dialog for an Untitled row, OR for any row whose stored path
 * is missing). The actual write always goes to a fresh `.recovered[-N].md`
 * sibling — the ideal path itself is never overwritten.
 *
 * When no location can be resolved at all:
 *   - `markdown.untitled` → `"needs-destination"` (the renderer should have
 *     asked for one),
 *   - otherwise           → `"missing"`.
 */
export async function restoreRecoveryRow(
  row: RecoveryRestoreRow,
  options: {
    readonly targetPath?: string;
    readonly fileSystem?: RecoveryRestoreFileSystem;
  } = {}
): Promise<RecoveryRestoreItemResult> {
  const fileSystem = options.fileSystem ?? defaultRecoveryRestoreFileSystem;

  // Prefer the stored path; fall back to the caller's chosen save location
  // (a `markdown.file` row can have a null `file_path` — e.g. a stale row —
  // and the renderer still lets the user pick a destination).
  const idealPath = row.filePath ?? options.targetPath ?? null;

  if (!idealPath) {
    return result(
      row,
      row.documentType === "markdown.untitled" ? "needs-destination" : "missing"
    );
  }

  try {
    const recoveredPath = await resolveRecoveredPath(
      idealPath,
      fileSystem.exists
    );
    await fileSystem.writeFileAtomic(recoveredPath, row.payloadText);
    return result(row, "written", recoveredPath);
  } catch {
    return result(row, "failed");
  }
}
