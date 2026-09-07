/**
 * #407: shape validation for the configured "attached image save directory"
 * (Issue #407 §17).
 *
 * This is a PURE STRING check on a project-root-relative directory path. It
 * is run:
 *   - in the renderer, before the save-destination setting is persisted and
 *     before an attachment IPC round trip, and
 *   - again in the main process, as the first gate before `path.resolve` +
 *     realpath containment (Issue #407 §18) — this module is NOT the
 *     security boundary on its own.
 *
 * It rejects: absolute paths, Windows drive-relative paths, any `..` that
 * would climb above the project root, NUL / control characters, the
 * Windows-invalid set `< > : " | ? *`, Windows reserved device names, and
 * segments ending in a dot or space. It never touches the filesystem.
 */

export type SaveDestinationRejectionReason =
  | "empty" // "" (or all-`.`/`..`) — treated by callers as "not configured"
  | "absolute" // "/x", "\\x", "C:\\x", "//server/share"
  | "driveRelative" // "C:x" (relative to the CWD of drive C:)
  | "escapesProjectRoot" // a ".." climbs above depth 0
  | "invalidCharacter" // NUL / control char, or one of < > : " | ? *
  | "reservedName" // CON, PRN, AUX, NUL, COM1-9, LPT1-9 (any segment)
  | "trailingDotOrSpace"; // a segment ends with "." or " " (Windows silently strips)

export type SaveDestinationValidationResult =
  | {
      readonly ok: true;
      /** `/`-joined, `.`-segment-free canonical form to persist. */
      readonly normalized: string;
      /** The canonical form split into directory segments (no `.` / no empty). */
      readonly segments: readonly string[];
    }
  | { readonly ok: false; readonly reason: SaveDestinationRejectionReason };

const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;
// Characters invalid in a Windows path component. `/` and `\` are handled as
// separators before this check; `:` here also catches a stray drive letter
// that slipped past the absolute/drive-relative checks.
const WINDOWS_INVALID_CHAR_PATTERN = /[<>:"|?*]/;
const WINDOWS_ABSOLUTE_PATTERN = /^[A-Za-z]:[\\/]/;
const WINDOWS_DRIVE_RELATIVE_PATTERN = /^[A-Za-z]:(?![\\/])/;
const RESERVED_DEVICE_NAME_PATTERN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function isReservedDeviceSegment(segment: string): boolean {
  // Windows treats "CON", "CON.txt", "con " etc. as the device. Compare the
  // base name (before the first dot), trimmed of a trailing space.
  const base = segment.split(".", 1)[0].replace(/ +$/, "");
  return RESERVED_DEVICE_NAME_PATTERN.test(base);
}

/**
 * Validate a configured save-directory string. On success returns the
 * canonical `/`-joined form (leading/trailing whitespace trimmed, `.`
 * segments and redundant separators removed) to store as the setting value.
 */
export function validateAttachedImageSaveDestination(
  raw: string
): SaveDestinationValidationResult {
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return { ok: false, reason: "empty" };
  }

  if (CONTROL_CHAR_PATTERN.test(trimmed)) {
    return { ok: false, reason: "invalidCharacter" };
  }

  if (trimmed.startsWith("/") || trimmed.startsWith("\\")) {
    // POSIX-absolute, Windows root-relative ("\foo"), or a UNC prefix.
    return { ok: false, reason: "absolute" };
  }
  if (WINDOWS_ABSOLUTE_PATTERN.test(trimmed)) {
    return { ok: false, reason: "absolute" };
  }
  if (WINDOWS_DRIVE_RELATIVE_PATTERN.test(trimmed)) {
    return { ok: false, reason: "driveRelative" };
  }

  const rawSegments = trimmed
    .split(/[\\/]+/)
    .filter((segment) => segment.length > 0 && segment !== ".");

  const canonical: string[] = [];
  for (const segment of rawSegments) {
    if (segment === "..") {
      if (canonical.length === 0) {
        return { ok: false, reason: "escapesProjectRoot" };
      }
      canonical.pop();
      continue;
    }

    if (WINDOWS_INVALID_CHAR_PATTERN.test(segment)) {
      return { ok: false, reason: "invalidCharacter" };
    }
    if (/[. ]$/.test(segment)) {
      return { ok: false, reason: "trailingDotOrSpace" };
    }
    if (isReservedDeviceSegment(segment)) {
      return { ok: false, reason: "reservedName" };
    }

    canonical.push(segment);
  }

  if (canonical.length === 0) {
    // e.g. "a/.." collapsed to the project root — not a usable sub-directory.
    return { ok: false, reason: "empty" };
  }

  return { ok: true, normalized: canonical.join("/"), segments: canonical };
}

/** Convenience boolean form of {@link validateAttachedImageSaveDestination}. */
export function isAcceptableAttachedImageSaveDestination(raw: string): boolean {
  return validateAttachedImageSaveDestination(raw).ok;
}
