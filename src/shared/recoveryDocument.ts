/**
 * Phase 6-4-3: the shared contract for a dirty Markdown working-copy
 * payload sent renderer → main and UPSERT'd into
 * `<app userData>/Recovery/Recovery.db` `documents`.
 *
 * The ONLY intended durable location for unsaved manuscript body text is
 * `documents.payload_text`. It is never placed in the Session Store, the
 * project DB, or the debug log.
 *
 * This module is pure: types, the `document_key` / `source_uri` string
 * formats, and an untrusted-input parser. Absolute-path normalisation lives
 * in the renderer (see `renderer/recovery/recoveryDocumentPayload.ts`) so
 * that this file stays dependency-light.
 */

/** `documents.document_type`. */
export type RecoveryDocumentType = "markdown.file" | "markdown.untitled";

/** `documents.document_encoding` — the attribute DETECTED from the source
 *  file, so a later restore can save it back the same way. `null` for
 *  Untitled (no source file — never defaulted to "utf-8"). */
export type RecoveryDocumentEncoding = "utf-8" | "utf-8-bom" | "unknown";

/** `documents.document_lineend` — DETECTED from the source file. `null` for
 *  Untitled (never defaulted to "lf"). "mixed" / "none" collapse to
 *  "unknown". */
export type RecoveryDocumentLineEnd = "lf" | "crlf" | "cr" | "unknown";

export interface RecoveryDocumentPayload {
  /** Canonical document identity. `file:<normalized absolute path>` or
   *  `untitled:<uuidv7>`. Nothing else decides sameness. */
  readonly documentKey: string;
  readonly documentType: RecoveryDocumentType;
  readonly sourceUri: string;
  readonly displayName: string;

  readonly projectId?: string | null;
  readonly projectFilePath?: string | null;
  readonly filePath?: string | null;

  readonly documentEncoding?: RecoveryDocumentEncoding | null;
  readonly documentLineend?: RecoveryDocumentLineEnd | null;

  /**
   * Base fingerprint — the persisted state this working copy diverged from.
   * Captured ONLY at document load and at Save success, never recomputed on
   * a dirty edit. `baseMtimeMs` is left `null` in Phase 6-4-3 (mtime needs
   * an `fs.stat` in the read/write IPC — a follow-up); `baseSize` /
   * `baseSha256` are the UTF-8 byte length / SHA-256 of the canonical
   * (line-ending-reconstructed) saved baseline. All `null` for Untitled.
   */
  readonly baseMtimeMs?: number | null;
  readonly baseSize?: number | null;
  readonly baseSha256?: string | null;

  /** The FULL dirty working-copy body (no diff / incremental encoding). */
  readonly payloadText: string;
}

const DOCUMENT_KEY_MAX = 8_192;
const DISPLAY_NAME_MAX = 4_096;
const SHA256_HEX = /^[0-9a-f]{64}$/;

export function recoveryFileDocumentKey(normalizedAbsolutePath: string): string {
  return `file:${normalizedAbsolutePath}`;
}

export function recoveryUntitledDocumentKey(untitledId: string): string {
  return `untitled:${untitledId}`;
}

export function recoveryFileSourceUri(normalizedAbsolutePath: string): string {
  return `file://${normalizedAbsolutePath}`;
}

export function recoveryUntitledSourceUri(untitledId: string): string {
  return `untitled://${untitledId}`;
}

export function isRecoveryDocumentType(
  value: unknown
): value is RecoveryDocumentType {
  return value === "markdown.file" || value === "markdown.untitled";
}

export function isRecoveryDocumentEncoding(
  value: unknown
): value is RecoveryDocumentEncoding {
  return (
    value === "utf-8" || value === "utf-8-bom" || value === "unknown"
  );
}

export function isRecoveryDocumentLineEnd(
  value: unknown
): value is RecoveryDocumentLineEnd {
  return (
    value === "lf" || value === "crlf" || value === "cr" || value === "unknown"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyBoundedString(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max
    ? value
    : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optionalNonNegativeInt(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    Number.isSafeInteger(value)
    ? value
    : null;
}

/**
 * Validate an untrusted renderer payload. Returns a normalised
 * `RecoveryDocumentPayload` (optional fields explicitly `null` when absent
 * / malformed) or `null` when a required field is missing or unusable.
 * `payloadText` is accepted verbatim, any length — it is the manuscript
 * body and must never be truncated or transformed here.
 */
export function parseRecoveryDocumentPayload(
  value: unknown
): RecoveryDocumentPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const documentKey = nonEmptyBoundedString(value.documentKey, DOCUMENT_KEY_MAX);
  const sourceUri = nonEmptyBoundedString(value.sourceUri, DOCUMENT_KEY_MAX);
  const displayName = nonEmptyBoundedString(
    value.displayName,
    DISPLAY_NAME_MAX
  );

  if (
    !documentKey ||
    !sourceUri ||
    !displayName ||
    !isRecoveryDocumentType(value.documentType) ||
    typeof value.payloadText !== "string"
  ) {
    return null;
  }

  const documentType = value.documentType;

  // The key prefix and the type must agree — a mismatch means the caller
  // built an inconsistent identity.
  const expectedPrefix =
    documentType === "markdown.untitled" ? "untitled:" : "file:";

  if (!documentKey.startsWith(expectedPrefix)) {
    return null;
  }

  const baseSha256 =
    typeof value.baseSha256 === "string" && SHA256_HEX.test(value.baseSha256)
      ? value.baseSha256
      : null;

  return {
    documentKey,
    documentType,
    sourceUri,
    displayName,
    projectId: optionalString(value.projectId),
    projectFilePath: optionalString(value.projectFilePath),
    filePath: optionalString(value.filePath),
    documentEncoding: isRecoveryDocumentEncoding(value.documentEncoding)
      ? value.documentEncoding
      : null,
    documentLineend: isRecoveryDocumentLineEnd(value.documentLineend)
      ? value.documentLineend
      : null,
    // Phase 6-4-3: always null (see the field doc).
    baseMtimeMs: optionalNonNegativeInt(value.baseMtimeMs),
    baseSize: optionalNonNegativeInt(value.baseSize),
    baseSha256,
    payloadText: value.payloadText
  };
}

/** A renderer → main delete request: Save-success cleanup only. */
export interface RecoveryDocumentDeleteRequest {
  readonly documentKey: string;
}

export function parseRecoveryDocumentDeleteRequest(
  value: unknown
): RecoveryDocumentDeleteRequest | null {
  if (!isRecord(value)) {
    return null;
  }

  const documentKey = nonEmptyBoundedString(value.documentKey, DOCUMENT_KEY_MAX);

  return documentKey ? { documentKey } : null;
}

export type RecoveryDocumentWriteMode =
  | "inserted"
  | "updated"
  | "deleted"
  | "noop";

/**
 * The renderer-visible result of an UPSERT / DELETE. `skipped` is a silent,
 * expected outcome for a Recovery non-owner or an unavailable store — never
 * surfaced to the user in this phase.
 */
export type RecoveryDocumentWriteResult =
  | { readonly ok: true; readonly mode: RecoveryDocumentWriteMode }
  | { readonly ok: false; readonly skipped: "not-owner" | "unavailable" }
  | { readonly ok: false; readonly error: string };
