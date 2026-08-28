/**
 * Shared #272 test helpers. Session identities MUST be UUIDv7 now (review
 * Blocker 1), so tests can no longer use `"session-1"` — `sid(label)` maps a
 * readable label to a deterministic valid UUIDv7 for the current test file.
 */

const assigned = new Map<string, string>();
let counter = 0;

export function sid(label: string): string {
  const existing = assigned.get(label);

  if (existing) {
    return existing;
  }

  counter += 1;
  const tail = counter.toString(16).padStart(12, "0");
  const id = `0190a000-0000-7000-8000-${tail}`;
  assigned.set(label, id);

  return id;
}

/** A few pre-named valid UUIDv7 Session identities. */
export const SID_A = "0190a000-0000-7000-8000-00000000aaa1";
export const SID_B = "0190a000-0000-7000-8000-00000000bbb2";
export const SID_C = "0190a000-0000-7000-8000-00000000ccc3";

/** A valid UUIDv7 instanceRunId / projectId for fixtures (#272 review:
 *  both must be real UUIDv7, no more `"run-1"` / `"pid-1"`). */
export const RUN_ID = "0190a000-0000-7000-8000-00000000f001";
export const PROJECT_ID = "0190a000-0000-7000-8000-00000000f002";

export function runId(label: string): string {
  return sid(`run:${label}`);
}
export function projectId(label: string): string {
  return sid(`project:${label}`);
}

export const VALID_SHA256 = "a".repeat(64);
