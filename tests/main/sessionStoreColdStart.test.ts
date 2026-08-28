import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createSessionStore,
  type SessionStore
} from "../../src/main/sessionStore";
import {
  SESSION_MANIFEST_FILE_NAME,
  SESSION_SCHEMA_VERSION,
  type SessionRecord
} from "../../src/shared/session";
import { PROJECT_ID, RUN_ID, sid } from "../shared/sessionTestFixtures";

let base = "";
let sessionsDir = "";
let store: SessionStore;

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), "pergamum-coldstart-"));
  sessionsDir = path.join(base, "sessions");
  store = createSessionStore({ baseDirectory: sessionsDir });
});

afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true });
});

function record(sessionId: string): SessionRecord {
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    sessionId,
    instanceRunId: RUN_ID,
    updatedAt: "2026-08-28T00:00:00.000Z",
    projectContext: null,
    window: null,
    editors: [],
    activeEditor: null
  };
}

const manifestPath = () => path.join(sessionsDir, SESSION_MANIFEST_FILE_NAME);
const dataFilePath = (id: string) =>
  path.join(sessionsDir, "data", `${id}.json`);

describe("readRestoreSetForColdStart (#274)", () => {
  it("a missing manifest is `empty` (first run), not `unavailable`", async () => {
    const result = await store.readRestoreSetForColdStart();
    expect(result.manifestOutcome).toEqual({ kind: "empty" });
    expect(result.sessions).toEqual([]);
  });

  it("a valid current-schema session is returned as a candidate", async () => {
    const s1 = sid("s1");
    await store.persistSession(record(s1));

    const result = await store.readRestoreSetForColdStart();
    expect(result.manifestOutcome.kind).toBe("usable");
    expect(result.sessions.map((s) => s.sessionId)).toEqual([s1]);
  });

  it("malformed manifest JSON → `unavailable` (malformed), file untouched", async () => {
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(manifestPath(), "{ not json", "utf8");

    const result = await store.readRestoreSetForColdStart();
    expect(result.manifestOutcome).toEqual({
      kind: "unavailable",
      reason: "malformed"
    });
    expect(await fs.readFile(manifestPath(), "utf8")).toBe("{ not json");
  });

  it("structurally invalid manifest → `unavailable` (malformed)", async () => {
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(
      manifestPath(),
      JSON.stringify({ schemaVersion: 1, sessions: "nope" }),
      "utf8"
    );

    const result = await store.readRestoreSetForColdStart();
    expect(result.manifestOutcome).toEqual({
      kind: "unavailable",
      reason: "malformed"
    });
  });

  it("unsupported future manifest schema → `unavailable` (unsupportedSchema)", async () => {
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(
      manifestPath(),
      JSON.stringify({ schemaVersion: 999, sessions: [] }),
      "utf8"
    );

    const result = await store.readRestoreSetForColdStart();
    expect(result.manifestOutcome).toEqual({
      kind: "unavailable",
      reason: "unsupportedSchema"
    });
  });

  it("old-schema / malformed session files are skipped, never repaired or deleted", async () => {
    const good = sid("good");
    const bad = sid("bad");
    await store.persistSession(record(good));
    await store.persistSession(record(bad));
    await fs.writeFile(
      dataFilePath(bad),
      JSON.stringify({ ...record(bad), schemaVersion: 0 }),
      "utf8"
    );
    const badBytesBefore = await fs.readFile(dataFilePath(bad), "utf8");

    const result = await store.readRestoreSetForColdStart();

    expect(result.sessions.map((s) => s.sessionId)).toEqual([good]);
    expect(result.skipped).toEqual([
      { sessionId: bad, reason: "invalidRecord" }
    ]);
    expect(await fs.readFile(dataFilePath(bad), "utf8")).toBe(badBytesBefore);
  });

  it("an orphan session file (not in the manifest) is ignored and untouched", async () => {
    const listed = sid("listed");
    const orphan = sid("orphan");
    await store.persistSession(record(listed));
    await fs.writeFile(
      dataFilePath(orphan),
      JSON.stringify(record(orphan)),
      "utf8"
    );

    const result = await store.readRestoreSetForColdStart();
    expect(result.sessions.map((s) => s.sessionId)).toEqual([listed]);
    await expect(fs.readFile(dataFilePath(orphan), "utf8")).resolves.toContain(
      orphan
    );
  });

  // -------------------------------------------------------------------------
  // #274 FIX-1: STRICT Session core validation for restore candidates.
  // A structurally invalid core sub-part ⇒ the whole Session is skipped
  // (never partially salvaged). A malformed Editor View State is tolerated.
  // -------------------------------------------------------------------------

  function richRecord(id: string): SessionRecord {
    return {
      schemaVersion: SESSION_SCHEMA_VERSION,
      sessionId: id,
      instanceRunId: RUN_ID,
      updatedAt: "2026-08-28T00:00:00.000Z",
      projectContext: {
        projectId: PROJECT_ID,
        projectFilePath: "/w/Book/Book.pergamum",
        rootPath: "/w/Book"
      },
      window: {
        normalBounds: { x: 0, y: 0, width: 800, height: 600 },
        mode: "normal"
      },
      editors: [
        {
          kind: "standaloneMarkdown",
          order: 0,
          filePath: "/w/x/a.md",
          viewState: null
        }
      ],
      activeEditor: { kind: "standaloneMarkdown", filePath: "/w/x/a.md" }
    };
  }

  async function coldStartResultFor(
    onDiskRecordJson: unknown
  ): Promise<{
    sessions: readonly string[];
    skipped: readonly string[];
    bytesUnchanged: boolean;
  }> {
    const good = sid("cs-good");
    const bad = sid("cs-bad");
    await store.persistSession(record(good));
    await store.persistSession(record(bad));
    await fs.writeFile(
      dataFilePath(bad),
      JSON.stringify(onDiskRecordJson),
      "utf8"
    );
    const bytesBefore = await fs.readFile(dataFilePath(bad), "utf8");

    const result = await store.readRestoreSetForColdStart();
    const bytesAfter = await fs.readFile(dataFilePath(bad), "utf8");

    return {
      sessions: result.sessions.map((s) => s.sessionId),
      skipped: result.skipped.map((s) => s.sessionId),
      bytesUnchanged: bytesAfter === bytesBefore
    };
  }

  it("malformed Project Context core → whole Session skipped, file untouched", async () => {
    const bad = sid("cs-bad");
    const r = await coldStartResultFor({
      ...richRecord(bad),
      projectContext: { projectId: "not-a-uuid", projectFilePath: "/p", rootPath: "/p" }
    });
    expect(r.sessions).toEqual([sid("cs-good")]);
    expect(r.skipped).toEqual([bad]);
    expect(r.bytesUnchanged).toBe(true);
  });

  it("malformed editor core → whole Session skipped, file untouched", async () => {
    const bad = sid("cs-bad");
    const r = await coldStartResultFor({
      ...richRecord(bad),
      editors: [{ kind: "projectMarkdown", order: 0, viewState: null }] // no relativePath
    });
    expect(r.sessions).toEqual([sid("cs-good")]);
    expect(r.skipped).toEqual([bad]);
    expect(r.bytesUnchanged).toBe(true);
  });

  it("malformed active editor identity core → whole Session skipped, file untouched", async () => {
    const bad = sid("cs-bad");
    const r = await coldStartResultFor({
      ...richRecord(bad),
      activeEditor: { kind: "standaloneMarkdown" } // no filePath
    });
    expect(r.sessions).toEqual([sid("cs-good")]);
    expect(r.skipped).toEqual([bad]);
    expect(r.bytesUnchanged).toBe(true);
  });

  it("malformed Window state core → whole Session skipped, file untouched", async () => {
    const bad = sid("cs-bad");
    const r = await coldStartResultFor({
      ...richRecord(bad),
      window: { normalBounds: { x: 0, y: 0, width: -1, height: 0 }, mode: "weird" }
    });
    expect(r.sessions).toEqual([sid("cs-good")]);
    expect(r.skipped).toEqual([bad]);
    expect(r.bytesUnchanged).toBe(true);
  });

  it("malformed Editor View State ONLY → Session remains a valid restore candidate", async () => {
    const bad = sid("cs-bad");
    await store.persistSession(record(sid("cs-good")));
    await store.persistSession(record(bad));
    await fs.writeFile(
      dataFilePath(bad),
      JSON.stringify({
        ...richRecord(bad),
        editors: [
          {
            kind: "standaloneMarkdown",
            order: 0,
            filePath: "/w/x/a.md",
            viewState: { contentDigest: { algorithm: "md5", digest: "zz" }, selection: 1 }
          }
        ]
      }),
      "utf8"
    );

    const result = await store.readRestoreSetForColdStart();
    const restored = result.sessions.find((s) => s.sessionId === bad);

    expect(restored).toBeDefined();
    expect(restored?.editors).toHaveLength(1);
    expect(restored?.editors[0].viewState).toBeNull();
    expect(result.skipped).toEqual([]);
  });

  it("a MISSING projectContext / window / activeEditor key → whole Session skipped, file untouched", async () => {
    for (const key of ["projectContext", "window", "activeEditor"] as const) {
      const bad = sid("cs-bad");
      const { [key]: _omit, ...withoutKey } = richRecord(bad);
      const r = await coldStartResultFor(withoutKey);
      expect(r.skipped, `missing ${key}`).toEqual([bad]);
      expect(r.sessions).toEqual([sid("cs-good")]);
      expect(r.bytesUnchanged).toBe(true);
    }
  });

  it("a missing / non-canonical updatedAt → whole Session skipped, file untouched", async () => {
    const bad = sid("cs-bad");
    const { updatedAt: _u, ...noTimestamp } = richRecord(bad);
    const missing = await coldStartResultFor(noTimestamp);
    expect(missing.skipped).toEqual([bad]);
    expect(missing.bytesUnchanged).toBe(true);

    const badFormat = await coldStartResultFor({
      ...richRecord(bad),
      updatedAt: "2026-08-28"
    });
    expect(badFormat.skipped).toEqual([bad]);
    expect(badFormat.bytesUnchanged).toBe(true);
  });

  it("duplicate editor identity → whole Session skipped (no dedupe), file untouched", async () => {
    const bad = sid("cs-bad");
    const r = await coldStartResultFor({
      ...richRecord(bad),
      editors: [
        { kind: "standaloneMarkdown", order: 0, filePath: "/w/x/dup.md", viewState: null },
        { kind: "standaloneMarkdown", order: 1, filePath: "/w/x/dup.md", viewState: null }
      ],
      activeEditor: null
    });
    expect(r.skipped).toEqual([bad]);
    expect(r.bytesUnchanged).toBe(true);
  });

  it("gapped / out-of-order editor order → whole Session skipped (no sort / renumber), file untouched", async () => {
    const bad = sid("cs-bad");
    const gapped = await coldStartResultFor({
      ...richRecord(bad),
      editors: [
        { kind: "standaloneMarkdown", order: 0, filePath: "/w/x/a.md", viewState: null },
        { kind: "standaloneMarkdown", order: 2, filePath: "/w/x/b.md", viewState: null }
      ],
      activeEditor: null
    });
    expect(gapped.skipped).toEqual([bad]);
    expect(gapped.bytesUnchanged).toBe(true);

    const outOfOrder = await coldStartResultFor({
      ...richRecord(bad),
      editors: [
        { kind: "standaloneMarkdown", order: 1, filePath: "/w/x/a.md", viewState: null },
        { kind: "standaloneMarkdown", order: 0, filePath: "/w/x/b.md", viewState: null }
      ],
      activeEditor: null
    });
    expect(outOfOrder.skipped).toEqual([bad]);
    expect(outOfOrder.bytesUnchanged).toBe(true);
  });

  it("the #272 fail-soft readRestoreSet path is unchanged (still salvages sub-parts)", async () => {
    const s = sid("failsoft");
    await store.persistSession(record(s));
    await fs.writeFile(
      dataFilePath(s),
      JSON.stringify({
        ...richRecord(s),
        window: { normalBounds: { x: 0, y: 0, width: 0, height: 0 }, mode: "x" }
      }),
      "utf8"
    );

    const failSoft = await store.readRestoreSet();
    expect(failSoft.sessions.map((r) => r.sessionId)).toEqual([s]);
    expect(failSoft.sessions[0].window).toBeNull();

    const strict = await store.readRestoreSetForColdStart();
    expect(strict.sessions).toEqual([]);
    expect(strict.skipped.map((r) => r.sessionId)).toEqual([s]);
  });
});
