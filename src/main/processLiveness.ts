/**
 * #293: a minimal, conservative OS-process liveness probe.
 *
 * Used ONLY by the Recovery Store lock's stale-`Recovery.lock` reclamation
 * path (`recoveryStoreLock.ts`). It never terminates anything — it sends
 * signal `0`, which is a pure existence/permission check.
 *
 * The decision it feeds is deliberately biased so that only a *provably*
 * dead owner can lose its lock:
 *
 *   - `"dead"`    — `process.kill(pid, 0)` reported `ESRCH` (no such
 *                   process). The one and only value that permits a
 *                   stale-lock takeover upstream.
 *   - `"alive"`   — the call succeeded, OR reported `EPERM` (the process
 *                   exists but belongs to another user / is elevated).
 *   - `"unknown"` — the pid is unusable (non-positive, non-integer, or our
 *                   own), or the call failed in any other way. Treated
 *                   upstream exactly like `"alive"`: no takeover.
 *
 * PID reuse can only ever make this *more* conservative: a recycled pid
 * held by an unrelated live process reads as `"alive"`, so a stale lock is
 * simply left in place for that run rather than being wrongly broken.
 */

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code: unknown }).code);
  }

  return undefined;
}

export type ProcessLiveness = "alive" | "dead" | "unknown";

export interface ProcessLivenessProbeDeps {
  /** Injected `process.kill` (signal is always `0`). */
  readonly kill: (pid: number, signal: 0) => void;
  /** This process's own pid — never judged. */
  readonly selfPid: number;
}

const defaultDeps: ProcessLivenessProbeDeps = {
  kill: (pid, signal) => {
    process.kill(pid, signal);
  },
  selfPid: process.pid
};

export function probeProcessLivenessWith(
  pid: number,
  deps: ProcessLivenessProbeDeps
): ProcessLiveness {
  if (!Number.isInteger(pid) || pid <= 0) {
    return "unknown";
  }

  if (pid === deps.selfPid) {
    return "unknown";
  }

  try {
    deps.kill(pid, 0);
    return "alive";
  } catch (error) {
    const code = nodeErrorCode(error);

    if (code === "ESRCH") {
      return "dead";
    }

    if (code === "EPERM") {
      // Exists, but we may not signal it (different user / elevated).
      return "alive";
    }

    return "unknown";
  }
}

/**
 * `"dead"` only when the OS says the pid does not exist. Every other
 * outcome — success, `EPERM`, an unusable pid, or an unexpected error — is
 * `"alive"` / `"unknown"`, and callers must refuse to break the lock.
 */
export function probeProcessLiveness(pid: number): ProcessLiveness {
  return probeProcessLivenessWith(pid, defaultDeps);
}
