import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFsSessionManifestLock,
  SessionManifestLockUnavailableError,
  type ManifestLockFileSystem
} from "../../src/main/sessionManifestLock";

let dir = "";
let lockDir = "";

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "pergamum-manifest-lock-"));
  lockDir = path.join(dir, "sessions", "manifest.lock");
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

function lock(
  overrides: Partial<Parameters<typeof createFsSessionManifestLock>[0]> = {}
) {
  return createFsSessionManifestLock({
    lockFilePath: lockDir,
    retryDelayMs: 3,
    acquireTimeoutMs: 300,
    hostname: () => "test-host",
    ...overrides
  });
}

async function markerFiles(): Promise<string[]> {
  try {
    return (await fs.readdir(lockDir)).filter((e) => /^owner\./.test(e));
  } catch {
    return [];
  }
}

async function readMarkerToken(): Promise<string | null> {
  const files = await markerFiles();
  if (files.length === 0) {
    return null;
  }
  const raw = await fs.readFile(path.join(lockDir, files[0]), "utf8");
  return (JSON.parse(raw) as { token: string }).token;
}

async function plantMarker(marker: Record<string, unknown>): Promise<void> {
  await fs.mkdir(lockDir, { recursive: true });
  await fs.writeFile(
    path.join(lockDir, "owner.aaaaaaaa-0000-7000-8000-000000000000.json"),
    JSON.stringify(marker),
    "utf8"
  );
}

describe("createFsSessionManifestLock — degradation over takeover (#272 PO decision)", () => {
  it("normal serialization: two live holders never interleave", async () => {
    const a = lock();
    const b = lock();
    const events: string[] = [];

    await Promise.all([
      a.run(async () => {
        events.push("a-enter");
        await new Promise((r) => setTimeout(r, 20));
        events.push("a-exit");
      }),
      b.run(async () => {
        events.push("b-enter");
        await new Promise((r) => setTimeout(r, 20));
        events.push("b-exit");
      })
    ]);

    expect(events).toHaveLength(4);
    const firstExit = events[0] === "a-enter" ? "a-exit" : "b-exit";
    expect(events[1]).toBe(firstExit);
  });

  it("a normal release lets the next contender acquire and continue", async () => {
    const holder = lock();
    const releaseBox: { current: (() => void) | null } = { current: null };
    const holding = holder.run(
      () => new Promise<void>((resolve) => (releaseBox.current = resolve))
    );
    for (let i = 0; i < 50 && releaseBox.current === null; i += 1) {
      await new Promise((r) => setTimeout(r, 3));
    }

    let acquired = false;
    const contender = lock({ acquireTimeoutMs: 500 }).run(async () => {
      acquired = true;
    });

    // Not yet — still held.
    await new Promise((r) => setTimeout(r, 15));
    expect(acquired).toBe(false);

    releaseBox.current?.();
    await holding;
    await contender;
    expect(acquired).toBe(true);
  });

  it("releases the lock (own marker + empty dir) on success and on failure", async () => {
    await lock().run(async () => undefined);
    expect(await markerFiles()).toEqual([]);
    await expect(fs.access(lockDir)).rejects.toThrow();

    await expect(
      lock().run(async () => {
        throw new Error("op failed");
      })
    ).rejects.toThrow("op failed");
    expect(await markerFiles()).toEqual([]);
    await expect(fs.access(lockDir)).rejects.toThrow();
  });

  // --- Fresh locks are preserved and not force-broken -------------

  it("held lock → bounded wait → FAIL; owner's lock left completely untouched", async () => {
    await plantMarker({
      token: "aaaaaaaa-0000-7000-8000-000000000000",
      pid: 4242,
      hostname: "test-host"
    });
    const before = await readMarkerToken();

    await expect(
      lock({ acquireTimeoutMs: 50, retryDelayMs: 5 }).run(async () => undefined)
    ).rejects.toBeInstanceOf(SessionManifestLockUnavailableError);

    expect(await readMarkerToken()).toBe(before);
    expect((await markerFiles()).length).toBe(1);
  });

  it("fresh marker-less lock dir → FAIL; dir preserved when not stale", async () => {
    await fs.mkdir(lockDir, { recursive: true });

    await expect(
      lock({ acquireTimeoutMs: 50, retryDelayMs: 5 }).run(async () => undefined)
    ).rejects.toBeInstanceOf(SessionManifestLockUnavailableError);

    await expect(fs.stat(lockDir)).resolves.toBeDefined();
  });

  it("fresh broken / unreadable marker → FAIL; marker untouched when not stale", async () => {
    await fs.mkdir(lockDir, { recursive: true });
    await fs.writeFile(
      path.join(lockDir, "owner.bbbbbbbb-0000-7000-8000-000000000000.json"),
      "not json at all",
      "utf8"
    );

    await expect(
      lock({ acquireTimeoutMs: 50, retryDelayMs: 5 }).run(async () => undefined)
    ).rejects.toBeInstanceOf(SessionManifestLockUnavailableError);

    expect((await markerFiles()).length).toBe(1);
    expect(
      await fs.readFile(
        path.join(lockDir, "owner.bbbbbbbb-0000-7000-8000-000000000000.json"),
        "utf8"
      )
    ).toBe("not json at all");
  });

  it("reclaims a stale lock with an old acquiredAt timestamp and acquires successfully", async () => {
    const debugEvents: Array<{ event: string; details: Record<string, unknown> }> = [];
    const nowMs = 1_000_000_000;
    const staleAcquiredAt = nowMs - 40_000; // 40 seconds ago > 30s default staleAfterMs

    await plantMarker({
      token: "aaaaaaaa-0000-7000-8000-000000000000",
      pid: 999_999,
      hostname: "some-machine-that-crashed-long-ago",
      acquiredAt: staleAcquiredAt
    });

    const result = await lock({
      now: () => nowMs,
      staleAfterMs: 30_000,
      acquireTimeoutMs: 100,
      retryDelayMs: 5,
      logDebug: (event, details) => debugEvents.push({ event, details })
    }).run(async () => "reclaimed");

    expect(result).toBe("reclaimed");
    expect(debugEvents).toHaveLength(1);
    expect(debugEvents[0].event).toBe("session.manifestLock.reclaimed");
  });

  it("does NOT reclaim a lock with a recent acquiredAt timestamp", async () => {
    const startMs = 1_000_000_000;
    const recentAcquiredAt = startMs - 5_000; // 5 seconds ago < 30s staleAfterMs

    await plantMarker({
      token: "aaaaaaaa-0000-7000-8000-000000000000",
      pid: 4242,
      hostname: "live-host",
      acquiredAt: recentAcquiredAt
    });

    let currentNow = startMs;
    await expect(
      lock({
        now: () => {
          currentNow += 10;
          return currentNow;
        },
        staleAfterMs: 30_000,
        acquireTimeoutMs: 50,
        retryDelayMs: 5
      }).run(async () => undefined)
    ).rejects.toBeInstanceOf(SessionManifestLockUnavailableError);

    expect((await markerFiles()).length).toBe(1);
  });

  it("reclaims a legacy marker (no acquiredAt) when lock dir mtime is older than staleAfterMs", async () => {
    const nowMs = 1_000_000_000;
    await plantMarker({
      token: "aaaaaaaa-0000-7000-8000-000000000000",
      pid: 1234,
      hostname: "crashed-host"
    });

    // Set lockDir mtime to 60s ago
    const longAgo = new Date(nowMs - 60_000);
    await fs.utimes(lockDir, longAgo, longAgo);

    const result = await lock({
      now: () => nowMs,
      staleAfterMs: 30_000,
      acquireTimeoutMs: 100,
      retryDelayMs: 5
    }).run(async () => "legacy-reclaimed");

    expect(result).toBe("legacy-reclaimed");
  });

  it("does NOT reclaim a legacy marker when lock dir mtime is recent", async () => {
    const startMs = Date.now();
    await plantMarker({
      token: "aaaaaaaa-0000-7000-8000-000000000000",
      pid: 1234,
      hostname: "live-host"
    });

    let currentNow = startMs;
    await expect(
      lock({
        now: () => {
          currentNow += 10;
          return currentNow;
        },
        staleAfterMs: 30_000,
        acquireTimeoutMs: 50,
        retryDelayMs: 5
      }).run(async () => undefined)
    ).rejects.toBeInstanceOf(SessionManifestLockUnavailableError);
  });

  it("reclaims an unreadable marker file when lock dir mtime is older than staleAfterMs", async () => {
    const nowMs = 1_000_000_000;
    await fs.mkdir(lockDir, { recursive: true });
    await fs.writeFile(
      path.join(lockDir, "owner.bbbbbbbb-0000-7000-8000-000000000000.json"),
      "broken json",
      "utf8"
    );

    const longAgo = new Date(nowMs - 60_000);
    await fs.utimes(lockDir, longAgo, longAgo);

    const result = await lock({
      now: () => nowMs,
      staleAfterMs: 30_000,
      acquireTimeoutMs: 100,
      retryDelayMs: 5
    }).run(async () => "broken-reclaimed");

    expect(result).toBe("broken-reclaimed");
  });

  it("does NOT reclaim if multiple markers are present and at least one is recent", async () => {
    const startMs = 1_000_000_000;
    await fs.mkdir(lockDir, { recursive: true });

    // Old marker
    await fs.writeFile(
      path.join(lockDir, "owner.aaaaaaaa-0000-7000-8000-000000000000.json"),
      JSON.stringify({ token: "aaaaaaaa-0000-7000-8000-000000000000", acquiredAt: startMs - 100_000 }),
      "utf8"
    );
    // Recent marker
    await fs.writeFile(
      path.join(lockDir, "owner.bbbbbbbb-0000-7000-8000-000000000000.json"),
      JSON.stringify({ token: "bbbbbbbb-0000-7000-8000-000000000000", acquiredAt: startMs - 5_000 }),
      "utf8"
    );

    let currentNow = startMs;
    await expect(
      lock({
        now: () => {
          currentNow += 10;
          return currentNow;
        },
        staleAfterMs: 30_000,
        acquireTimeoutMs: 50,
        retryDelayMs: 5
      }).run(async () => undefined)
    ).rejects.toBeInstanceOf(SessionManifestLockUnavailableError);
  });

  it("a fresh, actively held lock → contender times out (does not steal it)", async () => {
    const holder = lock();
    const releaseBox: { current: (() => void) | null } = { current: null };
    const holding = holder.run(
      () => new Promise<void>((resolve) => (releaseBox.current = resolve))
    );
    for (let i = 0; i < 50 && releaseBox.current === null; i += 1) {
      await new Promise((r) => setTimeout(r, 3));
    }

    await expect(
      lock({ acquireTimeoutMs: 25 }).run(async () => undefined)
    ).rejects.toBeInstanceOf(SessionManifestLockUnavailableError);

    releaseBox.current?.();
    await holding;
  });

  // --- Release only ever removes OUR OWN marker, by name ----------------

  it("releasing a foreign token removes only that marker file, never a newer owner's", async () => {
    // Two markers present in one dir (only possible transiently, but the
    // guarantee must hold): releasing token A must not disturb token B.
    await fs.mkdir(lockDir, { recursive: true });
    const tokenA = "aaaaaaaa-0000-7000-8000-000000000000";
    const tokenB = "bbbbbbbb-0000-7000-8000-000000000000";
    await fs.writeFile(
      path.join(lockDir, `owner.${tokenA}.json`),
      JSON.stringify({ token: tokenA }),
      "utf8"
    );
    await fs.writeFile(
      path.join(lockDir, `owner.${tokenB}.json`),
      JSON.stringify({ token: tokenB }),
      "utf8"
    );

    // Structural emulation of release(tokenA): rm own marker by name, then
    // rmdir only if empty (ENOTEMPTY ignored).
    await fs.rm(path.join(lockDir, `owner.${tokenA}.json`), { force: true });
    await fs.rmdir(lockDir).catch(() => undefined);

    expect(await readMarkerToken()).toBe(tokenB);
    await expect(fs.stat(lockDir)).resolves.toBeDefined();
  });

  it("propagates a non-EEXIST/EPERM filesystem error from acquire (EACCES is NOT retried)", async () => {
    let mkdirCalls = 0;
    const brokenFs: ManifestLockFileSystem = {
      mkdir: (_p, opts) => {
        if (opts?.recursive) return Promise.resolve(undefined);
        mkdirCalls += 1;
        return Promise.reject(
          Object.assign(new Error("EACCES"), { code: "EACCES" })
        );
      },
      writeFile: () => Promise.resolve(),
      rm: () => Promise.resolve(),
      rmdir: () => Promise.resolve()
    };

    await expect(
      createFsSessionManifestLock({
        lockFilePath: lockDir,
        fileSystem: brokenFs
      }).run(async () => undefined)
    ).rejects.toThrow("EACCES");
    // Failed fast on the first attempt — no bounded-wait retry loop.
    expect(mkdirCalls).toBe(1);
  });

  it("retries a transient EPERM from mkdir (Windows contention) and then acquires", async () => {
    let mkdirCalls = 0;
    const flakyFs: ManifestLockFileSystem = {
      mkdir: (_p, opts) => {
        if (opts?.recursive) return Promise.resolve(undefined);
        mkdirCalls += 1;
        if (mkdirCalls <= 2) {
          return Promise.reject(
            Object.assign(new Error("EPERM"), { code: "EPERM" })
          );
        }
        return Promise.resolve(undefined);
      },
      writeFile: () => Promise.resolve(),
      rm: () => Promise.resolve(),
      rmdir: () => Promise.resolve()
    };

    await expect(
      createFsSessionManifestLock({
        lockFilePath: lockDir,
        fileSystem: flakyFs,
        retryDelayMs: 1,
        acquireTimeoutMs: 300
      }).run(async () => "ok")
    ).resolves.toBe("ok");
    expect(mkdirCalls).toBe(3);
  });

  it("a lingering EPERM that outlasts the acquire window is thrown raw (→ permissionDenied upstream)", async () => {
    const stuckFs: ManifestLockFileSystem = {
      mkdir: (_p, opts) =>
        opts?.recursive
          ? Promise.resolve(undefined)
          : Promise.reject(
              Object.assign(new Error("EPERM"), { code: "EPERM" })
            ),
      writeFile: () => Promise.resolve(),
      rm: () => Promise.resolve(),
      rmdir: () => Promise.resolve()
    };

    const error = await createFsSessionManifestLock({
      lockFilePath: lockDir,
      fileSystem: stuckFs,
      retryDelayMs: 1,
      acquireTimeoutMs: 20
    })
      .run(async () => undefined)
      .catch((caught: unknown) => caught);

    // NOT collapsed to SessionManifestLockUnavailableError — the raw error
    // carries the permission code so it classifies as `permissionDenied`.
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(SessionManifestLockUnavailableError);
    expect((error as Error).message).toContain("EPERM");
  });
});
