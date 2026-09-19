import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createSessionStore,
  type SessionStore
} from "../../src/main/sessionStore";
import {
  SESSION_SCHEMA_VERSION,
  type SessionRecord
} from "../../src/shared/session";
import { sid, RUN_ID } from "../shared/sessionTestFixtures";

let base = "";
let sessionsDir = "";
let store: SessionStore;

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), "pergamum-session-519-"));
  sessionsDir = path.join(base, "sessions");
  store = createSessionStore({ baseDirectory: sessionsDir });
});

afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe("#519 Session restore and flush cycle for 2 .txt files", () => {
  it("persists a restored session with 2 .txt editors without throwing manifestNotMutable or storage error", async () => {
    const s1 = sid("s1");
    const initialRecord: SessionRecord = {
      schemaVersion: SESSION_SCHEMA_VERSION,
      sessionId: s1,
      instanceRunId: RUN_ID,
      updatedAt: "2026-08-28T00:00:00.000Z",
      projectContext: null,
      window: null,
      editors: [
        {
          kind: "standaloneMarkdown",
          order: 0,
          filePath: "C:\\works\\吾輩は猫である.txt",
          viewState: null
        },
        {
          kind: "standaloneMarkdown",
          order: 1,
          filePath: "C:\\works\\山椒大夫.txt",
          viewState: null
        }
      ],
      activeEditor: {
        kind: "standaloneMarkdown",
        filePath: "C:\\works\\吾輩は猫である.txt"
      }
    };

    // 1. Initial persist (before restart)
    await store.persistSession(initialRecord);

    // 2. Read for cold start (app restart)
    const coldStartResult = await store.readRestoreSetForColdStart();
    expect(coldStartResult.manifestOutcome.kind).toBe("usable");
    expect(coldStartResult.sessions).toHaveLength(1);
    expect(coldStartResult.sessions[0].editors).toHaveLength(2);

    // 3. Renderer updates inputs and flushes (after restore)
    const updatedRecord: SessionRecord = {
      ...initialRecord,
      updatedAt: new Date().toISOString()
    };

    await expect(store.persistSession(updatedRecord)).resolves.toBeUndefined();

    // 4. Verify readRestoreSet
    const finalResult = await store.readRestoreSet();
    expect(finalResult.sessions).toHaveLength(1);
    expect(finalResult.sessions[0].editors).toHaveLength(2);
  });
});
