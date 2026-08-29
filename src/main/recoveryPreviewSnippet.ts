/**
 * Phase 6-4-4: the display-only preview snippet for a Recovery candidate.
 *
 * Built from `payload_text`, NEVER from the source file. It is allowed only
 * inside the Recovery candidate dialog — it must not reach a debug log, the
 * copied Recovery report, the Session Store, or the project DB. It never
 * mutates `payload_text`.
 */

import { RECOVERY_PREVIEW_SNIPPET_LENGTH } from "../shared/recoveryCandidate";

/**
 * Collapse every run of whitespace (including line breaks) to a single
 * space, trim, and return roughly the first `RECOVERY_PREVIEW_SNIPPET_LENGTH`
 * user-visible code points, with a trailing `…` when there is more text.
 * A blank / whitespace-only payload yields `""` — the dialog renders a
 * localized placeholder for that case.
 */
export function buildRecoveryPreviewSnippet(payloadText: string): string {
  const collapsed = payloadText.replace(/\s+/g, " ").trim();

  if (collapsed.length === 0) {
    return "";
  }

  const codePoints = Array.from(collapsed);

  if (codePoints.length <= RECOVERY_PREVIEW_SNIPPET_LENGTH) {
    return codePoints.join("");
  }

  return `${codePoints
    .slice(0, RECOVERY_PREVIEW_SNIPPET_LENGTH)
    .join("")}…`;
}
