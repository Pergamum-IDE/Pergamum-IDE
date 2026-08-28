/**
 * #272 (review): the durable commit boundary for explicit Project Close.
 *
 * Contract enforced here:
 *
 *   Project Close SUCCESS  ⇒  the durable Session no longer contains the
 *                             Project (post-close Session state is durable)
 *
 * It is NOT "close always succeeds even if persistence failed". If the
 * post-close Session state cannot be made durable, the Project is left
 * open.
 *
 * Order:
 *   1. commit the *prospective* post-close Session snapshot and AWAIT its
 *      durability (`commitPostCloseSession`)
 *   2. only if that succeeded, run the main-process Project Close
 *      (`closeProjectInMain`)
 *   3. main close ok  → apply the same post-close state to the renderer
 *      main close fail → roll the durable Session back to its pre-close
 *      state (`rollbackSession`) and AWAIT it
 *
 * The lifecycle commit barrier is released on every non-success outcome
 * (the success path hands the barrier to the renderer-state reset, which
 * releases it after its own commit).
 *
 * This module is React-free and side-effect-free beyond the injected
 * callbacks, so the ordering / failure semantics are unit-testable without
 * rendering `App`.
 */

export type ExplicitProjectCloseCommitResult =
  | { readonly status: "closed" }
  | { readonly status: "sessionCommitFailed"; readonly error: unknown }
  | { readonly status: "mainCloseFailed"; readonly rolledBack: true }
  | {
      readonly status: "mainCloseFailed";
      readonly rolledBack: false;
      readonly rollbackError: unknown;
    };

export interface ExplicitProjectCloseCommitSteps {
  /**
   * Persist the prospective post-close Session snapshot as a durable commit
   * boundary. MUST reject if the write could not be made durable.
   */
  commitPostCloseSession(): Promise<void>;
  /**
   * Run the main-process Project Close. Resolves `true` on success, `false`
   * on a handled failure (it is expected to have surfaced its own status).
   */
  closeProjectInMain(): Promise<boolean>;
  /**
   * Re-commit the pre-close Session snapshot (Project still open) as a
   * durable commit boundary. MUST reject if it could not be made durable.
   */
  rollbackSession(): Promise<void>;
  /** Bring renderer state to the post-close state (Project removed). */
  applyRendererPostCloseState(): void;
  /** Release the lifecycle commit barrier for this close attempt. */
  exitCommitBarrier(): void;
}

export async function runExplicitProjectCloseCommit(
  steps: ExplicitProjectCloseCommitSteps
): Promise<ExplicitProjectCloseCommitResult> {
  try {
    await steps.commitPostCloseSession();
  } catch (error) {
    // Post-close Session state is not durable — do NOT close the Project.
    steps.exitCommitBarrier();
    return { status: "sessionCommitFailed", error };
  }

  if (await steps.closeProjectInMain()) {
    steps.applyRendererPostCloseState();
    return { status: "closed" };
  }

  // Main Project Close failed after the Session was made post-close: the
  // Project is still open, so the durable Session must go back to pre-close.
  try {
    await steps.rollbackSession();
  } catch (rollbackError) {
    steps.exitCommitBarrier();
    return { status: "mainCloseFailed", rolledBack: false, rollbackError };
  }

  steps.exitCommitBarrier();
  return { status: "mainCloseFailed", rolledBack: true };
}
