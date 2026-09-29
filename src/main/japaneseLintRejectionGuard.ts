/**
 * #625: containment for rejections that leak out of textlint.
 *
 * textlint runs rules whose internal promise chains (e.g. kuromoji's
 * dictionary loading) are not always awaited by the kernel, so a failure can
 * surface as an `unhandledRejection` even though `lintText()` itself already
 * rejected and was handled. main.ts terminates the process on any
 * unhandledRejection, so such a leak would take the whole app down for a
 * failed *hint* feature.
 *
 * Lint work is wrapped in {@link withJapaneseLintRejectionGuard}; while it runs
 * (and for a short grace period afterwards, because a leaked rejection is
 * reported on a later tick) {@link isJapaneseLintRejectionWindow} is true and
 * main.ts logs the rejection instead of exiting. Rejections outside that
 * window keep the existing fail-fast behavior.
 */

export const JAPANESE_LINT_REJECTION_GRACE_MS = 3000;

let running = 0;
let graceUntil = 0;

export async function withJapaneseLintRejectionGuard<T>(
  task: () => Promise<T>,
  now: () => number = Date.now
): Promise<T> {
  running += 1;

  try {
    return await task();
  } finally {
    running -= 1;
    graceUntil = now() + JAPANESE_LINT_REJECTION_GRACE_MS;
  }
}

export function isJapaneseLintRejectionWindow(
  now: number = Date.now()
): boolean {
  return running > 0 || now < graceUntil;
}

/** Test helper: forget any previous lint activity. */
export function resetJapaneseLintRejectionGuard(): void {
  running = 0;
  graceUntil = 0;
}
