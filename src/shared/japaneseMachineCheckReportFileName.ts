/**
 * #688: the Save dialog's suggested file name for the report of a glossary
 * Description check.
 *
 * A glossary Description has no source file, so its report is named after the
 * target's `displayName` (the entry's representative Atom). An Atom value is
 * vocabulary data, not a file name - it may hold `/`, `:`, `?` and so on - so
 * only the SUGGESTED file name is made safe here. The `displayName` itself is
 * never changed (the report and the summary show it as is).
 */

const REPORT_FILE_SUFFIX = ".lint.md";
/** Code points kept of the display name (a Save dialog suggestion only). */
export const REPORT_FILE_BASE_NAME_MAX_CODE_POINTS = 120;
/** Used when nothing usable is left of the display name. */
export const REPORT_FILE_BASE_NAME_FALLBACK = "Glossary Description";

const WINDOWS_RESERVED_DEVICE_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
// eslint-disable-next-line no-control-regex
const UNSAFE_FILE_NAME_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;

function trimTrailingDotsAndSpaces(value: string): string {
  return value.replace(/[. ]+$/, "");
}

/** A file name stem that is safe on Windows, macOS and Linux. */
export function sanitizeReportBaseName(displayName: string): string {
  let base = displayName.replace(UNSAFE_FILE_NAME_CHARACTERS, "_");

  // Cut by code points so a surrogate pair is never split.
  base = [...base]
    .slice(0, REPORT_FILE_BASE_NAME_MAX_CODE_POINTS)
    .join("");
  base = trimTrailingDotsAndSpaces(base);

  if (base.length === 0) {
    return REPORT_FILE_BASE_NAME_FALLBACK;
  }

  // Windows reserves a device name whatever follows the first dot
  // ("CON.lint.md" is still CON).
  const stem = trimTrailingDotsAndSpaces(base.split(".")[0] ?? "");

  return WINDOWS_RESERVED_DEVICE_NAME.test(stem) ? `_${base}` : base;
}

/** `<safe base name>.lint.md`, for the Save dialog's default path. */
export function glossaryDescriptionReportFileName(
  displayName: string
): string {
  return `${sanitizeReportBaseName(displayName)}${REPORT_FILE_SUFFIX}`;
}
