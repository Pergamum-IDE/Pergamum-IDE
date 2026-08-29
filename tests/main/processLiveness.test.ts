import { describe, expect, it } from "vitest";
import {
  probeProcessLiveness,
  probeProcessLivenessWith
} from "../../src/main/processLiveness";

function killThrowing(code: string): (pid: number, signal: 0) => void {
  return () => {
    throw Object.assign(new Error(code), { code });
  };
}

describe("probeProcessLivenessWith (#293)", () => {
  const seam = { kill: () => undefined, selfPid: 999_999 };

  it("returns 'alive' when process.kill(pid, 0) succeeds", () => {
    expect(probeProcessLivenessWith(4242, seam)).toBe("alive");
  });

  it("returns 'dead' on ESRCH (no such process)", () => {
    expect(
      probeProcessLivenessWith(4242, { ...seam, kill: killThrowing("ESRCH") })
    ).toBe("dead");
  });

  it("returns 'alive' on EPERM (exists but not signalable)", () => {
    expect(
      probeProcessLivenessWith(4242, { ...seam, kill: killThrowing("EPERM") })
    ).toBe("alive");
  });

  it("returns 'unknown' on any other error", () => {
    expect(
      probeProcessLivenessWith(4242, { ...seam, kill: killThrowing("EINVAL") })
    ).toBe("unknown");
    expect(
      probeProcessLivenessWith(4242, {
        ...seam,
        kill: () => {
          throw new Error("no code");
        }
      })
    ).toBe("unknown");
  });

  it("returns 'unknown' for an invalid or non-positive or non-integer pid", () => {
    for (const pid of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(probeProcessLivenessWith(pid, seam)).toBe("unknown");
    }
  });

  it("returns 'unknown' for our own pid (never judge ourselves)", () => {
    expect(probeProcessLivenessWith(4242, { ...seam, selfPid: 4242 })).toBe(
      "unknown"
    );
  });
});

describe("probeProcessLiveness (default)", () => {
  it("says the current test process is alive", () => {
    // process.pid is our own → guarded to "unknown"; a made-up high pid is
    // almost certainly free → "dead". Use a neighbouring real pid instead:
    // the parent process id is live for the duration of this test run.
    expect(probeProcessLiveness(process.ppid)).toBe("alive");
  });

  it("reports a very high, unallocated pid as dead", () => {
    expect(probeProcessLiveness(2_147_483_646)).toBe("dead");
  });

  it("guards its own pid", () => {
    expect(probeProcessLiveness(process.pid)).toBe("unknown");
  });
});
