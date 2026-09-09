/**
 * #422: Validation and normalization helpers for logical project names.
 *
 * A project name is purely a display name stored in project database metadata
 * (and historical configuration). It is NOT a filesystem path or directory
 * name, so characters invalid in OS file paths (: / \ * ? " < > |) are
 * explicitly allowed.
 */

export const PROJECT_NAME_MIN_LENGTH = 1;
export const PROJECT_NAME_MAX_LENGTH = 120;

export type ProjectNameValidationError =
  | "empty"
  | "tooLong"
  | "controlCharacters";

export type ProjectNameValidationResult =
  | { readonly ok: true; readonly normalizedName: string }
  | { readonly ok: false; readonly error: ProjectNameValidationError };

/**
 * Normalise a user-entered project name by trimming leading and trailing
 * whitespace.
 */
export function normalizeProjectName(input: string): string {
  return input.trim();
}

/**
 * Validate a logical project name:
 * - Must be a string
 * - 1 to 120 characters after trim
 * - Must not contain control characters (U+0000–U+001F, U+007F, including \r, \n, \t)
 * - Allows characters forbidden in filenames (e.g. :, /, \, *, ?, ", <, >, |)
 */
export function validateProjectName(
  input: unknown
): ProjectNameValidationResult {
  if (typeof input !== "string") {
    return { ok: false, error: "empty" };
  }

  const normalized = normalizeProjectName(input);
  if (normalized.length === 0) {
    return { ok: false, error: "empty" };
  }

  if (normalized.length > PROJECT_NAME_MAX_LENGTH) {
    return { ok: false, error: "tooLong" };
  }

  // Reject control characters: ASCII 0x00–0x1F and 0x7F (del)
  if (/[\u0000-\u001f\u007f]/.test(normalized)) {
    return { ok: false, error: "controlCharacters" };
  }

  return { ok: true, normalizedName: normalized };
}
