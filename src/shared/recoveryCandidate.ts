/**
 * Phase 6-4-4: the shared contract for the Recovery candidate list UI —
 * listing, restoring (to `.recovered.md`), discarding, and a body-free
 * Recovery report.
 *
 * Safety rules carried by this module:
 *   - the renderer never receives raw absolute paths; it gets
 *     `hasFilePath` / `hasProjectFilePath` booleans instead. Restore /
 *     discard / report are keyed by `recoveryId` and resolved main-side.
 *   - `payload_text` is never sent to the renderer. The only derived text
 *     that crosses the boundary is `previewSnippet`, and it is allowed
 *     ONLY inside the Recovery candidate dialog — never in a log, never in
 *     the report, never in the Session Store or project DB.
 */

import type {
  RecoveryDocumentEncoding,
  RecoveryDocumentLineEnd,
  RecoveryDocumentType
} from "./recoveryDocument";

/** How many user-visible code points the preview snippet shows before `…`. */
export const RECOVERY_PREVIEW_SNIPPET_LENGTH = 10;

/**
 * One Recovery row as the candidate dialog sees it. Contains no raw
 * filesystem path and no full body.
 */
export interface RecoveryCandidate {
  /** `documents.id` (UUIDv7) — the stable selection / sort / action key. */
  readonly recoveryId: string;
  readonly documentType: RecoveryDocumentType;
  /**
   * Always a bare file name (the schema guarantees this). This is the only
   * human-readable identifier the renderer gets — `document_key` /
   * `source_uri` / `file_path` (all of which carry the raw absolute path)
   * are deliberately NOT sent.
   */
  readonly displayName: string;
  readonly documentEncoding: RecoveryDocumentEncoding | null;
  readonly documentLineend: RecoveryDocumentLineEnd | null;
  readonly updatedAt: string;
  /** `Array.from(payload_text).length` — code points, computed main-side. */
  readonly characterCount: number;
  /**
   * Display-only first-~10-code-point preview built from `payload_text`
   * (whitespace collapsed, trimmed, `…` when longer). Empty string when the
   * payload is blank; the dialog renders a localized placeholder then.
   */
  readonly previewSnippet: string;
  readonly hasFilePath: boolean;
  readonly hasProjectFilePath: boolean;
}

export type RecoveryCandidateListResult =
  | { readonly ok: true; readonly candidates: readonly RecoveryCandidate[] }
  | { readonly ok: false; readonly skipped: "not-owner" | "unavailable" };

/**
 * #288 follow-up: whether at least one *previous-run* Recovery row exists
 * (a row whose `origin_instance_run_id` differs from this app instance's
 * `instanceRunId`). Drives the `recovery.hasRecoverableCandidates` command
 * context key. A non-owner / unavailable instance resolves to
 * `{ ok: false, skipped }`, which the renderer treats as "no candidates".
 */
export type RecoveryHasRecoverableResult =
  | { readonly ok: true; readonly hasRecoverable: boolean }
  | { readonly ok: false; readonly skipped: "not-owner" | "unavailable" };

export type RecoveryStartupPresentation =
  | { readonly kind: "none"; readonly candidateCount: 0 }
  | {
      readonly kind: "autoShow";
      readonly candidateCount: number;
      readonly signature: string;
      readonly candidates: readonly RecoveryCandidate[];
    }
  | {
      readonly kind: "reminder";
      readonly candidateCount: number;
      readonly signature: string;
    };

/**
 * #300: one-shot startup presentation decision for *previous-run* Recovery
 * candidates. Main owns both the candidate query and the seen-signature
 * metadata read/write so non-owner instances stay silent and the renderer
 * never receives raw path/body fields.
 */
export type RecoveryStartupPresentationResult =
  | { readonly ok: true; readonly presentation: RecoveryStartupPresentation }
  | { readonly ok: false; readonly skipped: "not-owner" | "unavailable" };

/**
 * #300: mark the currently visible previous-run candidate set as seen.
 * The renderer supplies no signature; main computes and persists it from
 * the store's current previous-run candidates.
 */
export type RecoveryMarkCandidatesSeenResult =
  | {
      readonly ok: true;
      readonly candidateCount: number;
      readonly signature: string | null;
    }
  | { readonly ok: false; readonly skipped: "not-owner" | "unavailable" };

/**
 * One restore request item.
 *
 * `targetPath` is set by the renderer when the candidate has no usable
 * stored source path:
 *
 *   - an Untitled candidate, or
 *   - a file/project candidate whose stored `file_path` is missing.
 *
 * For a normal file/project candidate with a stored path, the renderer
 * omits `targetPath` and main restores next to the stored path. If both are
 * present, main prefers the stored path. In all cases, restore writes a
 * fresh `.recovered[-N].md` sibling and never overwrites the ideal path
 * itself.
 */
export interface RecoveryRestoreItem {
  readonly recoveryId: string;
  readonly targetPath?: string;
}

export type RecoveryRestoreItemStatus =
  | "written"
  | "failed"
  | "missing"
  | "needs-destination";

export interface RecoveryRestoreItemResult {
  readonly recoveryId: string;
  readonly status: RecoveryRestoreItemStatus;
  /** Absolute path actually written, present only for `"written"`. */
  readonly writtenPath?: string;
  /**
   * #287 follow-up: set only when the written file is inside the currently
   * open project root — its project-root-relative path (forward-slash
   * separated). The renderer then opens it as a project-owned Markdown
   * document instead of a standalone external file. Absent for an
   * outside-project or Untitled restore. Never a raw absolute path; never
   * logged.
   */
  readonly projectRelativePath?: string;
  readonly displayName: string;
  readonly documentType: RecoveryDocumentType;
}

export type RecoveryRestoreResult =
  | {
      readonly ok: true;
      readonly results: readonly RecoveryRestoreItemResult[];
    }
  | { readonly ok: false; readonly skipped: "not-owner" | "unavailable" };

export interface RecoveryRestoreRequest {
  readonly items: readonly RecoveryRestoreItem[];
}

export interface RecoveryFinalizeRequest {
  /** Rows the renderer confirmed it opened as new tabs. */
  readonly recoveryIds: readonly string[];
}

export type RecoveryFinalizeResult =
  | { readonly ok: true; readonly deleted: readonly string[] }
  | { readonly ok: false; readonly skipped: "not-owner" | "unavailable" };

export interface RecoveryDiscardRequest {
  readonly recoveryIds: readonly string[];
}

export type RecoveryDiscardResult =
  | {
      readonly ok: true;
      readonly deleted: readonly string[];
      readonly failed: readonly string[];
    }
  | { readonly ok: false; readonly skipped: "not-owner" | "unavailable" };

export type RecoveryReportResult =
  | { readonly ok: true; readonly report: string }
  | { readonly ok: false; readonly skipped: "not-owner" | "unavailable" };

// ---------------------------------------------------------------------------
// Untrusted-request parsers (main side)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function toIdList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const ids: string[] = [];

  for (const entry of value) {
    if (!nonEmptyString(entry) || entry.length > 512) {
      return null;
    }
    ids.push(entry);
  }

  return ids;
}

export function parseRecoveryRestoreRequest(
  value: unknown
): RecoveryRestoreRequest | null {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return null;
  }

  const items: RecoveryRestoreItem[] = [];

  for (const entry of value.items) {
    if (!isRecord(entry) || !nonEmptyString(entry.recoveryId)) {
      return null;
    }

    if (
      entry.targetPath !== undefined &&
      !(nonEmptyString(entry.targetPath) && entry.targetPath.length <= 4096)
    ) {
      return null;
    }

    items.push(
      nonEmptyString(entry.targetPath)
        ? { recoveryId: entry.recoveryId, targetPath: entry.targetPath }
        : { recoveryId: entry.recoveryId }
    );
  }

  return { items };
}

export function parseRecoveryFinalizeRequest(
  value: unknown
): RecoveryFinalizeRequest | null {
  if (!isRecord(value)) {
    return null;
  }

  const recoveryIds = toIdList(value.recoveryIds);

  return recoveryIds ? { recoveryIds } : null;
}

export function parseRecoveryDiscardRequest(
  value: unknown
): RecoveryDiscardRequest | null {
  if (!isRecord(value)) {
    return null;
  }

  const recoveryIds = toIdList(value.recoveryIds);

  return recoveryIds ? { recoveryIds } : null;
}
