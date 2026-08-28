import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createSessionStore,
  createSessionStoreFileSystemWithAtomicWrite,
  isFinishedSessionDataFileName,
  SESSION_MANIFEST_LOCK_DIRECTORY_NAME,
  type SessionStore,
  type SessionStoreFileSystem
} from "../../src/main/sessionStore";
import { createFsSessionManifestLock } from "../../src/main/sessionManifestLock";
import {
  SESSION_MANIFEST_FILE_NAME,
  SESSION_SCHEMA_VERSION,
  type SessionRecord
} from "../../src/shared/session";
import { sid, RUN_ID } from "../shared/sessionTestFixtures";

let base = "";
let sessionsDir = "";
let store: SessionStore;

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), "pergamum-session-"));
  sessionsDir = path.join(base, "sessions");
  store = createSessionStore({ baseDirectory: sessionsDir });
});

afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true });
});

function record(
  sessionId: string,
  overrides: Partial<SessionRecord> = {}
): SessionRecord {
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    sessionId,
    instanceRunId: RUN_ID,
    updatedAt: "2026-08-28T00:00:00.000Z",
    projectContext: null,
    window: null,
    editors: [],
    activeEditor: null,
    ...overrides
  };
}

const manifestPath = () => path.join(sessionsDir, SESSION_MANIFEST_FILE_NAME);
const dataFilePath = (id: string) =>
  path.join(sessionsDir, "data", `${id}.json`);

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

describe("SessionStore — reading (#272)", () => {
  it("a missing store is a legal empty restore set", async () => {
    const result = await store.readRestoreSet();

    expect(result.sessions).toEqual([]);
    expect(result.manifest.sessions).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it("reads one persisted session", async () => {
    const s1 = sid("s1");
    await store.persistSession(record(s1));

    const result = await store.readRestoreSet();
    expect(result.manifest.sessions).toEqual([s1]);
    expect(result.sessions.map((s) => s.sessionId)).toEqual([s1]);
  });

  it("reads multiple independent sessions in manifest order", async () => {
    const ids = [sid("s1"), sid("s2"), sid("s3")];
    for (const id of ids) {
      await store.persistSession(record(id));
    }

    const result = await store.readRestoreSet();
    expect(result.sessions.map((s) => s.sessionId)).toEqual(ids);
  });

  it("does NOT treat an orphan session file (not in the manifest) as a restore target", async () => {
    const s1 = sid("s1");
    const orphan = sid("orphan");
    await store.persistSession(record(s1));
    await fs.writeFile(
      dataFilePath(orphan),
      JSON.stringify(record(orphan)),
      "utf8"
    );

    const result = await store.readRestoreSet();
    expect(result.manifest.sessions).toEqual([s1]);
    expect(result.sessions.map((s) => s.sessionId)).toEqual([s1]);
  });

  it("isolates a corrupt individual session — the others still load", async () => {
    const [g1, bad, g2] = [sid("g1"), sid("bad"), sid("g2")];
    await store.persistSession(record(g1));
    await store.persistSession(record(bad));
    await store.persistSession(record(g2));

    await fs.writeFile(dataFilePath(bad), "{ not json", "utf8");

    const result = await store.readRestoreSet();
    expect(result.sessions.map((s) => s.sessionId)).toEqual([g1, g2]);
    expect(result.skipped).toEqual([
      { sessionId: bad, reason: "malformedJson" }
    ]);
  });

  it("skips a manifest-listed session whose file is missing", async () => {
    const [s1, s2] = [sid("s1"), sid("s2")];
    await store.persistSession(record(s1));
    await store.persistSession(record(s2));
    await fs.rm(dataFilePath(s1));

    const result = await store.readRestoreSet();
    expect(result.sessions.map((s) => s.sessionId)).toEqual([s2]);
    expect(result.skipped).toEqual([{ sessionId: s1, reason: "fileMissing" }]);
  });

  it("skips a session whose file carries an unsupported schemaVersion", async () => {
    const s1 = sid("s1");
    await store.persistSession(record(s1));
    await fs.writeFile(
      dataFilePath(s1),
      JSON.stringify({ ...record(s1), schemaVersion: 9 }),
      "utf8"
    );

    const result = await store.readRestoreSet();
    expect(result.sessions).toEqual([]);
    expect(result.skipped).toEqual([{ sessionId: s1, reason: "invalidRecord" }]);
  });

  it("treats a malformed manifest as an empty restore set without touching the data files", async () => {
    const s1 = sid("s1");
    await store.persistSession(record(s1));
    await fs.writeFile(manifestPath(), "totally broken", "utf8");

    const result = await store.readRestoreSet();
    expect(result.sessions).toEqual([]);
    expect(await readJson(dataFilePath(s1))).toMatchObject({ sessionId: s1 });
  });
});

describe("SessionStore — mutation vs restore-read of the manifest (#272 review Blocker 3)", () => {
  it("missing manifest → a first-run add still works", async () => {
    const s1 = sid("s1");
    await expect(store.persistSession(record(s1))).resolves.toBeUndefined();
    expect((await store.readRestoreSet()).manifest.sessions).toEqual([s1]);
  });

  it("malformed manifest → mutation REJECTS and the manifest bytes are unchanged", async () => {
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(manifestPath(), "{ not json", "utf8");

    await expect(store.persistSession(record(sid("s1")))).rejects.toThrow(
      /manifest cannot be mutated safely/i
    );
    expect(await fs.readFile(manifestPath(), "utf8")).toBe("{ not json");

    await expect(
      store.removeSessionFromRestoreSet(sid("s1"))
    ).rejects.toThrow(/manifest cannot be mutated safely/i);
    expect(await fs.readFile(manifestPath(), "utf8")).toBe("{ not json");
  });

  it("unsupported future schemaVersion → mutation REJECTS, bytes unchanged (never downgraded to v1)", async () => {
    const future = JSON.stringify({
      schemaVersion: 2,
      sessions: [sid("kept-by-future")],
      updatedAt: "2099-01-01T00:00:00.000Z"
    });
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(manifestPath(), future, "utf8");

    await expect(store.persistSession(record(sid("s1")))).rejects.toThrow(
      /unsupportedSchema|mutated safely/i
    );
    expect(await fs.readFile(manifestPath(), "utf8")).toBe(future);
  });

  it("structurally malformed manifest (schemaVersion ok, sessions not an array) → mutation REJECTS", async () => {
    const bad = JSON.stringify({ schemaVersion: 1, sessions: "nope" });
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(manifestPath(), bad, "utf8");

    await expect(store.persistSession(record(sid("s1")))).rejects.toThrow(
      /mutated safely/i
    );
    expect(await fs.readFile(manifestPath(), "utf8")).toBe(bad);
  });

  it("v1 manifest with an invalid membership entry ([valid, \"evil\", valid]) → mutation REJECTS, bytes unchanged (review follow-up 6)", async () => {
    const a = sid("keep-a");
    const b = sid("keep-b");
    const bad = JSON.stringify({
      schemaVersion: 1,
      sessions: [a, "evil", b],
      updatedAt: "2026-08-28T00:00:00.000Z"
    });
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(manifestPath(), bad, "utf8");

    // The strict mutation parser does NOT silently drop "evil" and rewrite —
    // it refuses, leaving the file exactly as-is.
    await expect(store.persistSession(record(sid("s1")))).rejects.toThrow(
      /mutated safely/i
    );
    expect(await fs.readFile(manifestPath(), "utf8")).toBe(bad);

    // The restore-read path stays lenient — it salvages the valid members.
    const restore = await store.readRestoreSet();
    expect(restore.manifest.sessions.slice().sort()).toEqual(
      [a, b].slice().sort()
    );
  });

  it("v1 manifest with a duplicate membership entry → mutation REJECTS (review follow-up 6)", async () => {
    const a = sid("dup");
    const bad = JSON.stringify({ schemaVersion: 1, sessions: [a, a] });
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(manifestPath(), bad, "utf8");

    await expect(store.persistSession(record(sid("s1")))).rejects.toThrow(
      /mutated safely/i
    );
    expect(await fs.readFile(manifestPath(), "utf8")).toBe(bad);
  });

  it("unreadable manifest → mutation REJECTS", async () => {
    const unreadableFs: SessionStoreFileSystem = {
      readFile: (p) =>
        path.basename(p) === SESSION_MANIFEST_FILE_NAME
          ? Promise.reject(
              Object.assign(new Error("EACCES"), { code: "EACCES" })
            )
          : fs.readFile(p, "utf8"),
      writeFileAtomic: async (p, data) => {
        await fs.mkdir(path.dirname(p), { recursive: true });
        await fs.writeFile(p, data, "utf8");
      },
      remove: (p) => fs.rm(p, { force: true })
    };
    const unreadableStore = createSessionStore({
      baseDirectory: sessionsDir,
      fileSystem: unreadableFs
    });

    await expect(
      unreadableStore.persistSession(record(sid("s1")))
    ).rejects.toThrow(/mutated safely/i);
  });

  it("restore read of the SAME malformed / unsupported manifest still safe-falls-back to empty", async () => {
    await fs.mkdir(sessionsDir, { recursive: true });
    for (const bytes of [
      "{ not json",
      JSON.stringify({ schemaVersion: 2, sessions: [sid("x")] }),
      JSON.stringify({ schemaVersion: 1, sessions: "nope" })
    ]) {
      await fs.writeFile(manifestPath(), bytes, "utf8");
      const result = await store.readRestoreSet();
      expect(result.sessions).toEqual([]);
      expect(result.manifest.sessions).toEqual([]);
    }
  });

  it("a rejected mutation never deletes an existing data file", async () => {
    // Seed a data file directly (orphan) then break the manifest.
    const s1 = sid("s1");
    await fs.mkdir(path.join(sessionsDir, "data"), { recursive: true });
    await fs.writeFile(
      dataFilePath(s1),
      JSON.stringify(record(s1)),
      "utf8"
    );
    await fs.writeFile(manifestPath(), "{ broken", "utf8");

    await expect(
      store.removeSessionFromRestoreSet(s1)
    ).rejects.toThrow(/mutated safely/i);

    expect(await readJson(dataFilePath(s1))).toMatchObject({ sessionId: s1 });
  });
});

describe("SessionStore — membership (#272)", () => {
  it("persistSession writes the data file BEFORE adding manifest membership", async () => {
    const writeOrder: string[] = [];
    const orderedFs: SessionStoreFileSystem = {
      readFile: (p) => fs.readFile(p, "utf8"),
      writeFileAtomic: async (p, data) => {
        writeOrder.push(path.basename(p));
        await fs.mkdir(path.dirname(p), { recursive: true });
        await fs.writeFile(p, data, "utf8");
      },
      remove: (p) => fs.rm(p, { force: true })
    };
    const orderedStore = createSessionStore({
      baseDirectory: sessionsDir,
      fileSystem: orderedFs
    });

    const s1 = sid("s1");
    await orderedStore.persistSession(record(s1));

    expect(writeOrder).toEqual([`${s1}.json`, SESSION_MANIFEST_FILE_NAME]);
  });

  it("adding the same session again does not duplicate its membership", async () => {
    const s1 = sid("s1");
    await store.persistSession(record(s1));
    await store.persistSession(record(s1, { updatedAt: "later" }));

    const result = await store.readRestoreSet();
    expect(result.manifest.sessions).toEqual([s1]);
    expect(result.sessions[0].updatedAt).toBe("later");
  });

  it("removeSessionFromRestoreSet drops membership first, then best-effort deletes the file", async () => {
    const [s1, s2] = [sid("s1"), sid("s2")];
    await store.persistSession(record(s1));
    await store.persistSession(record(s2));

    await store.removeSessionFromRestoreSet(s1);

    const result = await store.readRestoreSet();
    expect(result.manifest.sessions).toEqual([s2]);
    expect(result.sessions.map((s) => s.sessionId)).toEqual([s2]);
    await expect(fs.access(dataFilePath(s1))).rejects.toThrow();
  });

  it("a failed file cleanup during removal is not a restore-set correctness problem", async () => {
    const stubbornFs: SessionStoreFileSystem = {
      readFile: (p) => fs.readFile(p, "utf8"),
      writeFileAtomic: async (p, data) => {
        await fs.mkdir(path.dirname(p), { recursive: true });
        await fs.writeFile(p, data, "utf8");
      },
      remove: () => Promise.reject(new Error("cannot unlink"))
    };
    const stubbornStore = createSessionStore({
      baseDirectory: sessionsDir,
      fileSystem: stubbornFs
    });

    const s1 = sid("s1");
    await stubbornStore.persistSession(record(s1));
    await expect(
      stubbornStore.removeSessionFromRestoreSet(s1)
    ).resolves.toBeUndefined();

    const result = await stubbornStore.readRestoreSet();
    expect(result.manifest.sessions).toEqual([]);
    expect(await readJson(dataFilePath(s1))).toMatchObject({ sessionId: s1 });
  });

  it("removing an unknown / non-UUIDv7 session is a no-op", async () => {
    const s1 = sid("s1");
    await store.persistSession(record(s1));
    await store.removeSessionFromRestoreSet(sid("never-added"));
    await store.removeSessionFromRestoreSet("../evil");

    expect((await store.readRestoreSet()).manifest.sessions).toEqual([s1]);
  });
});

describe("SessionStore — write failure isolation (#272)", () => {
  it("a failed individual session write leaves the previously good snapshot intact", async () => {
    const s1 = sid("s1");
    const runA = sid("run-A");
    const runB = sid("run-B");
    await store.persistSession(record(s1, { instanceRunId: runA }));

    let failNext = true;
    const flakyFs: SessionStoreFileSystem = {
      readFile: (p) => fs.readFile(p, "utf8"),
      writeFileAtomic: async (p, data) => {
        if (failNext && path.basename(p) === `${s1}.json`) {
          failNext = false;
          throw new Error("disk full");
        }
        await fs.mkdir(path.dirname(p), { recursive: true });
        await fs.writeFile(p, data, "utf8");
      },
      remove: (p) => fs.rm(p, { force: true })
    };
    const flakyStore = createSessionStore({
      baseDirectory: sessionsDir,
      fileSystem: flakyFs
    });

    await expect(
      flakyStore.persistSession(record(s1, { instanceRunId: runB }))
    ).rejects.toThrow("disk full");

    const result = await store.readRestoreSet();
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].instanceRunId).toBe(runA);
  });

  it("a manifest update failure does not destroy the individual session file", async () => {
    const s1 = sid("s1");
    const manifestFailFs: SessionStoreFileSystem = {
      readFile: (p) => fs.readFile(p, "utf8"),
      writeFileAtomic: async (p, data) => {
        if (path.basename(p) === SESSION_MANIFEST_FILE_NAME) {
          throw new Error("manifest write failed");
        }
        await fs.mkdir(path.dirname(p), { recursive: true });
        await fs.writeFile(p, data, "utf8");
      },
      remove: (p) => fs.rm(p, { force: true })
    };
    const manifestFailStore = createSessionStore({
      baseDirectory: sessionsDir,
      fileSystem: manifestFailFs
    });

    await expect(
      manifestFailStore.persistSession(record(s1))
    ).rejects.toThrow("manifest write failed");

    expect(await readJson(dataFilePath(s1))).toMatchObject({ sessionId: s1 });
    expect((await store.readRestoreSet()).manifest.sessions).toEqual([]);
  });

  it("createSessionStoreFileSystemWithAtomicWrite injects a deterministic temp suffix", async () => {
    const injectedStore = createSessionStore({
      baseDirectory: sessionsDir,
      fileSystem: createSessionStoreFileSystemWithAtomicWrite({
        tempSuffix: () => "det"
      })
    });

    const s1 = sid("s1");
    await injectedStore.persistSession(record(s1));
    expect((await injectedStore.readRestoreSet()).sessions[0].sessionId).toBe(
      s1
    );
  });
});

describe("SessionStore — cross-process manifest coordination (#272 review Blocker 2)", () => {
  it("two independent Store instances adding to the same manifest both survive", async () => {
    // Separate instances = separate in-process queues. Only the shared
    // filesystem lock (default, rooted at <sessions>/manifest.lock) keeps
    // their read-modify-write from clobbering each other.
    const storeA = createSessionStore({ baseDirectory: sessionsDir });
    const storeB = createSessionStore({ baseDirectory: sessionsDir });
    const a = sid("a");
    const b = sid("b");

    await Promise.all([
      storeA.persistSession(record(a)),
      storeB.persistSession(record(b))
    ]);

    const members = (await store.readRestoreSet()).manifest.sessions;
    expect(members.slice().sort()).toEqual([a, b].slice().sort());
  });

  it("concurrent add / remove across instances leaves a consistent manifest", async () => {
    const a = sid("a");
    const b = sid("b");
    await store.persistSession(record(a));
    await store.persistSession(record(b));

    const storeA = createSessionStore({ baseDirectory: sessionsDir });
    const storeB = createSessionStore({ baseDirectory: sessionsDir });
    const c = sid("c");

    await Promise.all([
      storeA.persistSession(record(c)),
      storeB.removeSessionFromRestoreSet(a)
    ]);

    const members = (await store.readRestoreSet()).manifest.sessions;
    expect(members.slice().sort()).toEqual([b, c].slice().sort());
  });

  it("a process-local queue alone loses an update — the shared lock prevents it", async () => {
    // Force a read/modify/write interleave by delaying the manifest read.
    function delayingFs(): SessionStoreFileSystem {
      return {
        readFile: async (p) => {
          if (path.basename(p) === SESSION_MANIFEST_FILE_NAME) {
            await new Promise((r) => setTimeout(r, 15));
          }
          return fs.readFile(p, "utf8");
        },
        writeFileAtomic: async (p, data) => {
          await fs.mkdir(path.dirname(p), { recursive: true });
          await fs.writeFile(p, data, "utf8");
        },
        remove: (p) => fs.rm(p, { force: true })
      };
    }

    // WITHOUT a shared lock (each instance gets a no-op lock): lost update.
    const noLock = { run: <T,>(op: () => Promise<T>) => op() };
    const rawA = createSessionStore({
      baseDirectory: sessionsDir,
      fileSystem: delayingFs(),
      manifestLock: noLock
    });
    const rawB = createSessionStore({
      baseDirectory: sessionsDir,
      fileSystem: delayingFs(),
      manifestLock: noLock
    });
    await Promise.all([
      rawA.persistSession(record(sid("x"))),
      rawB.persistSession(record(sid("y")))
    ]);
    expect(
      (await store.readRestoreSet()).manifest.sessions.length
    ).toBe(1); // one write clobbered the other

    // WITH the real shared filesystem lock: both land.
    await fs.rm(manifestPath(), { force: true });
    const lockedA = createSessionStore({
      baseDirectory: sessionsDir,
      fileSystem: delayingFs()
    });
    const lockedB = createSessionStore({
      baseDirectory: sessionsDir,
      fileSystem: delayingFs()
    });
    const p = sid("p");
    const q = sid("q");
    await Promise.all([
      lockedA.persistSession(record(p)),
      lockedB.persistSession(record(q))
    ]);
    expect(
      (await store.readRestoreSet()).manifest.sessions.slice().sort()
    ).toEqual([p, q].slice().sort());
  });

  it("a lock that cannot be acquired leaves the manifest completely untouched", async () => {
    const rejectingLock = {
      run: () => Promise.reject(new Error("lock unavailable"))
    };
    const lockedOutStore = createSessionStore({
      baseDirectory: sessionsDir,
      manifestLock: rejectingLock
    });
    const s1 = sid("s1");

    await expect(
      lockedOutStore.persistSession(record(s1))
    ).rejects.toThrow("lock unavailable");

    // The data file was written (step 1) — a legal orphan — but the manifest
    // was never touched.
    expect(await readJson(dataFilePath(s1))).toMatchObject({ sessionId: s1 });
    const result = await store.readRestoreSet();
    expect(result.manifest.sessions).toEqual([]);
  });

  it("a held lock is NEVER force-broken — persistSession fails (→ SUSPENDED upstream), lock untouched", async () => {
    const lockDir = path.join(sessionsDir, SESSION_MANIFEST_LOCK_DIRECTORY_NAME);
    await fs.mkdir(lockDir, { recursive: true });
    await fs.writeFile(
      path.join(lockDir, "owner.cafecafe-0000-7000-8000-000000000000.json"),
      JSON.stringify({
        token: "cafecafe-0000-7000-8000-000000000000",
        pid: 4242,
        hostname: "any-machine"
      }),
      "utf8"
    );

    const contender = createSessionStore({
      baseDirectory: sessionsDir,
      manifestLock: createFsSessionManifestLock({
        lockFilePath: lockDir,
        acquireTimeoutMs: 50,
        retryDelayMs: 5
      })
    });

    await expect(
      contender.persistSession(record(sid("s1")))
    ).rejects.toMatchObject({ code: "PERGAMUM_SESSION_STORAGE_FAILURE" });

    // The lock was left completely untouched.
    expect(
      (await fs.readdir(lockDir)).filter((e) => e.startsWith("owner."))
    ).toHaveLength(1);
  });

  it("times out (rather than hanging) when a fresh lock is held and never released", async () => {
    const lockDir = path.join(sessionsDir, SESSION_MANIFEST_LOCK_DIRECTORY_NAME);
    const held = createFsSessionManifestLock({
      lockFilePath: lockDir,
      acquireTimeoutMs: 40,
      retryDelayMs: 5
    });

    let releaseHeld: (() => void) | null = null;
    const holding = held.run(
      () =>
        new Promise<void>((resolve) => {
          releaseHeld = resolve;
        })
    );
    for (let i = 0; i < 50 && releaseHeld === null; i += 1) {
      await new Promise((r) => setTimeout(r, 5));
    }
    await fs.stat(lockDir);

    const contender = createSessionStore({
      baseDirectory: sessionsDir,
      manifestLock: createFsSessionManifestLock({
        lockFilePath: lockDir,
        acquireTimeoutMs: 40,
        retryDelayMs: 5
      })
    });
    await expect(
      contender.persistSession(record(sid("s1")))
    ).rejects.toMatchObject({ code: "PERGAMUM_SESSION_STORAGE_FAILURE" });

    releaseHeld?.();
    await holding;
  });
});

describe("SessionStore — storage failures are classified (#272 PO decision)", () => {
  function storeWith(fs: SessionStoreFileSystem): SessionStore {
    return createSessionStore({ baseDirectory: sessionsDir, fileSystem: fs });
  }

  it("ENOSPC on the Session data write → SessionStorageFailureError(diskFull)", async () => {
    const store = storeWith({
      readFile: () => Promise.reject(Object.assign(new Error(), { code: "ENOENT" })),
      writeFileAtomic: () =>
        Promise.reject(Object.assign(new Error("no space"), { code: "ENOSPC" })),
      remove: () => Promise.resolve()
    });

    await expect(store.persistSession(record(sid("s1")))).rejects.toMatchObject({
      code: "PERGAMUM_SESSION_STORAGE_FAILURE",
      reason: "diskFull"
    });
  });

  it("an fsync failure inside the atomic write → SessionStorageFailureError", async () => {
    // Real atomic write, but the temp fsync fails.
    const realFs = (await import("node:fs")).promises;
    const store = createSessionStore({
      baseDirectory: sessionsDir,
      fileSystem: createSessionStoreFileSystemWithAtomicWrite({
        fileSystem: {
          mkdir: (p, o) => realFs.mkdir(p, o),
          writeFile: (p, d, o) => realFs.writeFile(p, d, o),
          rename: (a, b) => realFs.rename(a, b),
          rm: (p, o) => realFs.rm(p, o),
          open: async (p, f) => {
            const h = await realFs.open(p, f);
            return {
              sync: () => Promise.reject(new Error("fsync failed")),
              close: () => h.close()
            };
          }
        }
      })
    });

    await expect(
      store.persistSession(record(sid("s1")))
    ).rejects.toMatchObject({ code: "PERGAMUM_SESSION_STORAGE_FAILURE" });
  });

  it("a manifest write failure → SessionStorageFailureError", async () => {
    const store = storeWith({
      readFile: (p) =>
        path.basename(p) === SESSION_MANIFEST_FILE_NAME
          ? Promise.reject(Object.assign(new Error(), { code: "ENOENT" }))
          : Promise.reject(Object.assign(new Error(), { code: "ENOENT" })),
      writeFileAtomic: async (p, data) => {
        if (path.basename(p) === SESSION_MANIFEST_FILE_NAME) {
          throw Object.assign(new Error("EIO"), { code: "EIO" });
        }
        await fs.mkdir(path.dirname(p), { recursive: true });
        await fs.writeFile(p, data, "utf8");
      },
      remove: (p) => fs.rm(p, { force: true })
    });

    await expect(store.persistSession(record(sid("s1")))).rejects.toMatchObject({
      code: "PERGAMUM_SESSION_STORAGE_FAILURE",
      reason: "ioError"
    });
  });

  it("a manifest lock acquisition failure → SessionStorageFailureError(lockUnavailable)", async () => {
    const store = createSessionStore({
      baseDirectory: sessionsDir,
      manifestLock: {
        run: () => Promise.reject(new Error("lock timeout"))
      }
    });

    // Data file write succeeds; the lock step fails.
    await expect(store.persistSession(record(sid("s1")))).rejects.toMatchObject({
      code: "PERGAMUM_SESSION_STORAGE_FAILURE"
    });
  });

  it("a permission error (EROFS) → SessionStorageFailureError(permissionDenied)", async () => {
    const store = storeWith({
      readFile: () => Promise.reject(Object.assign(new Error(), { code: "ENOENT" })),
      writeFileAtomic: () =>
        Promise.reject(Object.assign(new Error("read only"), { code: "EROFS" })),
      remove: () => Promise.resolve()
    });

    await expect(store.persistSession(record(sid("s1")))).rejects.toMatchObject({
      reason: "permissionDenied"
    });
  });

  it("removeSessionFromRestoreSet also classifies a manifest failure", async () => {
    await store.persistSession(record(sid("s1")));
    const s1 = sid("s1");

    const brokenStore = createSessionStore({
      baseDirectory: sessionsDir,
      fileSystem: {
        readFile: (p) => fs.readFile(p, "utf8"),
        writeFileAtomic: () =>
          Promise.reject(Object.assign(new Error("EIO"), { code: "EIO" })),
        remove: (p) => fs.rm(p, { force: true })
      }
    });

    await expect(
      brokenStore.removeSessionFromRestoreSet(s1)
    ).rejects.toMatchObject({ code: "PERGAMUM_SESSION_STORAGE_FAILURE" });
  });
});

describe("isFinishedSessionDataFileName (#272)", () => {
  it("accepts a plain .json, rejects an in-progress temp", () => {
    expect(isFinishedSessionDataFileName("abc.json")).toBe(true);
    expect(
      isFinishedSessionDataFileName("abc.json.pergamum-tmp-xyz")
    ).toBe(false);
  });
});
