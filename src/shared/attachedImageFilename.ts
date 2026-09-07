/**
 * #407: deterministic, human-readable filenames for clipboard image
 * attachments (Issue #407 §20 / §21).
 *
 *   - base name:  yyyy-MM-dd-HHmmssSSS.ext   (local time, millisecond
 *     precision) — e.g. `2026-09-07-095213042.png`
 *   - on collision: append `-1`, `-2`, ... before the extension.
 *
 * No content hashing: the attachment folder is meant to be browsed
 * directly, so a time-ordered name is preferred (§21). The exclusive-create
 * retry loop that actually reserves a name lives in the main process
 * ({@link ../main/imageAttachmentSave}); these helpers only shape strings.
 */

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/**
 * `yyyy-MM-dd-HHmmssSSS` for `date` in LOCAL time. Separate from the
 * extension so callers can reason about the stem independently.
 */
export function formatAttachedImageTimestampStem(date: Date): string {
  const year = pad(date.getFullYear(), 4);
  const month = pad(date.getMonth() + 1, 2);
  const day = pad(date.getDate(), 2);
  const hours = pad(date.getHours(), 2);
  const minutes = pad(date.getMinutes(), 2);
  const seconds = pad(date.getSeconds(), 2);
  const millis = pad(date.getMilliseconds(), 3);
  return `${year}-${month}-${day}-${hours}${minutes}${seconds}${millis}`;
}

/**
 * The un-suffixed candidate filename, `<timestamp><extension>`. `extension`
 * must include the leading dot (`".png"`), matching
 * `imageAttachmentExtension`.
 */
export function attachedImageBaseFileName(
  date: Date,
  extension: string
): string {
  return `${formatAttachedImageTimestampStem(date)}${extension}`;
}

/**
 * The filename to try on collision `attempt` `n`:
 *   - n === 0 -> `<stem><ext>`
 *   - n >= 1  -> `<stem>-<n><ext>`
 *
 * `attempt` must be a non-negative integer.
 */
export function attachedImageFileNameForAttempt(
  date: Date,
  extension: string,
  attempt: number
): string {
  if (!Number.isInteger(attempt) || attempt < 0) {
    throw new Error(`attempt must be a non-negative integer, got ${attempt}`);
  }
  const stem = formatAttachedImageTimestampStem(date);
  return attempt === 0
    ? `${stem}${extension}`
    : `${stem}-${attempt}${extension}`;
}
