/**
 * Preview generation and date formatting helpers for Resume Hub (#538).
 */

/**
 * Generates a maximum 20-character preview from document text.
 * - Leading blank lines are excluded.
 * - Line breaks are converted to spaces.
 * - Consecutive whitespace is collapsed into a single space.
 * - First 20 characters are returned; if over 20 characters, appends `…`.
 * - If empty, returns `"本文なし"`.
 */
export function generateDocumentPreview(content: string): string {
  const strippedLeadingNewlines = content.replace(/^[\r\n]+/, "");
  const singleLine = strippedLeadingNewlines.replace(/[\r\n]+/g, " ");
  const collapsedSpaces = singleLine.replace(/\s+/g, " ").trim();

  if (collapsedSpaces.length === 0) {
    return "本文なし";
  }

  const chars = Array.from(collapsedSpaces);
  if (chars.length > 20) {
    return chars.slice(0, 20).join("") + "…";
  }

  return collapsedSpaces;
}

export interface FormatResumeHubDateTimeOptions {
  /**
   * Optional IANA time zone identifier (e.g. `"UTC"`, `"Asia/Tokyo"`).
   * When omitted, local time is used.
   */
  readonly timeZone?: string;
}

/**
 * Formats a Date/timestamp into `yyyy-MM-dd HH:mm` for Resume Hub display.
 * Defaults to local time unless `options.timeZone` is specified.
 */
export function formatResumeHubDateTime(
  dateInput: Date | number | string,
  options?: FormatResumeHubDateTimeOptions
): string {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  if (options?.timeZone) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: options.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    });
    const parts = formatter.formatToParts(date);
    const partMap: Record<string, string> = {};
    for (const part of parts) {
      partMap[part.type] = part.value;
    }
    return `${partMap.year}-${partMap.month}-${partMap.day} ${partMap.hour}:${partMap.minute}`;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export const formatLocalDateTime = formatResumeHubDateTime;
