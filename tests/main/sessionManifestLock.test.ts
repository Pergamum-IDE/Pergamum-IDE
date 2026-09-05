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

  // --- The lock is NEVER inspected, judged, or force-broken -------------

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

  it("marker-less lock dir → FAIL; dir never force-deleted", async () => {
    await fs.mkdir(lockDir, { recursive: true });

    await expect(
      lock({ acquireTimeoutMs: 50, retryDelayMs: 5 }).run(async () => undefined)
    ).rejects.toBeInstanceOf(SessionManifestLockUnavailableError);

    await expect(fs.stat(lockDir)).resolves.toBeDefined();
  });

  it("broken / unreadable marker → FAIL; marker untouched", async () => {
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

  it("old-looking marker (any age) → FAIL; never treated as reclaimable residue", async () => {
    await plantMarker({
      token: "aaaaaaaa-0000-7000-8000-000000000000",
      pid: 999_999,
      hostname: "some-machine-that-crashed-long-ago"
    });
    // Backdate the whole lock dir far into the past.
    const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await fs.utimes(lockDir, longAgo, longAgo);

    await expect(
      lock({ acquireTimeoutMs: 50, retryDelayMs: 5 }).run(async () => undefined)
    ).rejects.toBeInstanceOf(SessionManifestLockUnavailableError);

    expect((await markerFiles()).length).toBe(1);
    await expect(fs.stat(lockDir)).resolves.toBeDefined();
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

  it("propagates a non-EEXIST filesystem error from acquire", async () => {
    const brokenFs: ManifestLockFileSystem = {
      mkdir: (_p, opts) => {
        if (opts?.recursive) return Promise.resolve(undefined);
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
  });
});
