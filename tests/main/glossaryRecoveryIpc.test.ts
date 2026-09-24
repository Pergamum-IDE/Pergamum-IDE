import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RECOVERY_CHANNELS } from "../../src/shared/api";
import { openRecoveryStoreDatabase } from "../../src/main/recoveryStoreDatabase";
import { upsertRecoveryDocument } from "../../src/main/recoveryDocumentStore";
import { registerRecoveryCandidateIpc } from "../../src/main/recoveryCandidateIpc";
import { restoreRecoveryRow } from "../../src/main/recoveryRestore";
import type { RecoveryStoreStatus } from "../../src/shared/recovery";
import {
  parseRecoveryDocumentPayload,
  recoveryGlossaryDocumentKey,
  type RecoveryDocumentPayload
} from "../../src/shared/recoveryDocument";
import {
  serializeGlossaryRecoveryDraft,
  type GlossaryRecoveryDraft
} from "../../src/shared/glossaryRecoveryDraft";

// #573 Slice 9: glossary Description Recovery rows in the main process.

const HARNESS_RUN_ID = "0198d95f-97d8-7000-8000-00000000run";
const PREVIOUS_RUN_ID = "0198d95f-97d8-7000-8000-000000000old";
const PROJECT_FILE = "/novel/Novel.pergamum";
const ENTRY_ID = "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f00a1";
const LOCAL_ID = "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f00c3";
const DESCRIPTION = "王都の説明 SECRET_GLOSSARY_BODY";

let workDir = "";
let handle: Awaited<ReturnType<typeof openRecoveryStoreDatabase>> | null = null;
let rowSeq = 0;

function ownerStatus(): RecoveryStoreStatus {
  return {
    kind: "owner",
    recoveryDirectoryPath: "C:/u/Recovery",
    databasePath: "C:/u/Recovery/Recovery.db",
    lockDirectoryPath: "C:/u/Recovery/Recovery.lock",
    storeId: "0198d95f-97d8-7000-8000-0000000store"
  };
}

function draft(overrides: Partial<GlossaryRecoveryDraft> = {}): GlossaryRecoveryDraft {
  return {
    version: 1,
    entryId: ENTRY_ID,
    localId: null,
    baseUpdatedAt: "2026-09-24T00:00:00.000Z",
    description: DESCRIPTION,
    atoms: [{ id: "atom-1", value: "王都", matchFlags: 0 }],
    tagIds: ["tag-1"],
    ...overrides
  };
}

function glossaryPayload(
  overrides: Partial<RecoveryDocumentPayload> = {},
  draftOverrides: Partial<GlossaryRecoveryDraft> = {}
): RecoveryDocumentPayload {
  const isNew = draftOverrides.entryId === null;

  return {
    documentKey: recoveryGlossaryDocumentKey(PROJECT_FILE, {
      kind: isNew ? "new" : "entry",
      id: isNew ? LOCAL_ID : ENTRY_ID
    }),
    documentType: "glossary.description",
    sourceUri: `glossary://entry/${ENTRY_ID}`,
    displayName: "王都",
    projectId: null,
    projectFilePath: PROJECT_FILE,
    filePath: null,
    documentEncoding: null,
    documentLineend: null,
    baseMtimeMs: null,
    baseSize: null,
    baseSha256: null,
    payloadText: serializeGlossaryRecoveryDraft(draft(draftOverrides)),
    ...overrides
  };
}

function seed(payload: RecoveryDocumentPayload, runId = PREVIOUS_RUN_ID): string {
  const id = `row-${(rowSeq += 1)}`;
  upsertRecoveryDocument(handle!.database, payload, {
    instanceRunId: runId,
    appVersion: "9.8.7-test",
    now: () => new Date("2026-09-24T01:00:00.000Z"),
    createRowId: () => id
  });
  return id;
}

function harness(currentProjectFilePath: string | null = PROJECT_FILE) {
  const handlers = new Map<
    string,
    (event: IpcMainInvokeEvent, arg: unknown) => unknown
  >();
  const logs: string[] = [];

  registerRecoveryCandidateIpc(
    { handle: (channel, listener) => handlers.set(channel, listener) },
    {
      getStatus: () => ownerStatus(),
      getOwnerDatabase: () => handle!.database,
      appVersion: "9.8.7-test",
      instanceRunId: HARNESS_RUN_ID,
      getCurrentProjectFilePath: () => currentProjectFilePath,
      logger: {
        log: (entry) => logs.push(JSON.stringify(entry)),
        documentRefForKey: () => "document:ref"
      }
    }
  );

  return {
    logs,
    invoke: (channel: string, arg?: unknown) =>
      handlers.get(channel)!({} as IpcMainInvokeEvent, arg)
  };
}

beforeEach(async () => {
  rowSeq = 0;
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), "pergamum-glossary-recovery-"));
  handle = await openRecoveryStoreDatabase({
    databasePath: path.join(workDir, "Recovery.db"),
    appVersion: "9.8.7-test"
  });
});

afterEach(async () => {
  handle?.close();
  handle = null;
  await fs.rm(workDir, { recursive: true, force: true, maxRetries: 3 });
});

describe("glossary Recovery payload contract (#573 Slice 9)", () => {
  it("accepts a glossary row only with a glossary: key", () => {
    expect(parseRecoveryDocumentPayload(glossaryPayload())).toMatchObject({
      documentType: "glossary.description",
      projectFilePath: PROJECT_FILE,
      filePath: null
    });
    expect(
      parseRecoveryDocumentPayload(
        glossaryPayload({ documentKey: "file:/novel/x.md" })
      )
    ).toBeNull();
  });
});

describe("glossary Recovery candidates (#573 Slice 9)", () => {
  it("lists a glossary row with a Description preview / count — never the JSON or body", () => {
    seed(glossaryPayload());
    seed(glossaryPayload({}, { entryId: null, localId: LOCAL_ID }));
    const h = harness();

    const result = h.invoke(RECOVERY_CHANNELS.listCandidates) as {
      ok: true;
      candidates: Array<Record<string, unknown>>;
    };

    expect(result.candidates).toHaveLength(2);
    for (const candidate of result.candidates) {
      expect(candidate).toMatchObject({
        documentType: "glossary.description",
        displayName: "王都",
        characterCount: Array.from(DESCRIPTION).length,
        hasFilePath: false,
        hasProjectFilePath: true
      });
      expect(String(candidate.previewSnippet)).not.toContain("{");
    }
    expect(
      result.candidates.map((candidate) => candidate.glossaryEntryIsNew).sort()
    ).toEqual([false, true]);
    expect(JSON.stringify(result)).not.toContain("SECRET_GLOSSARY_BODY");
    expect(JSON.stringify(result)).not.toContain("tag-1");
  });
});

describe("recovery:readGlossaryCandidateDraft (#573 Slice 9)", () => {
  it("returns the validated draft for the open project", () => {
    const id = seed(glossaryPayload());
    const h = harness();

    expect(
      h.invoke(RECOVERY_CHANNELS.readGlossaryCandidateDraft, { recoveryId: id })
    ).toEqual({
      ok: true,
      result: { kind: "draft", recoveryId: id, draft: draft() }
    });
    // Logs stay body-free.
    expect(h.logs.join("\n")).not.toContain("SECRET_GLOSSARY_BODY");
  });

  it("refuses another project's (or no project's) row, keeping it", () => {
    const id = seed(glossaryPayload());

    expect(
      harness("/other/Other.pergamum").invoke(
        RECOVERY_CHANNELS.readGlossaryCandidateDraft,
        { recoveryId: id }
      )
    ).toEqual({ ok: true, result: { kind: "differentProject", recoveryId: id } });
    expect(
      harness(null).invoke(RECOVERY_CHANNELS.readGlossaryCandidateDraft, {
        recoveryId: id
      })
    ).toEqual({ ok: true, result: { kind: "differentProject", recoveryId: id } });
  });

  it("reports an unparsable payload as invalid (→ .recovered.md fallback)", () => {
    const id = seed(glossaryPayload({ payloadText: "not json" }));

    expect(
      harness().invoke(RECOVERY_CHANNELS.readGlossaryCandidateDraft, {
        recoveryId: id
      })
    ).toEqual({ ok: true, result: { kind: "invalid", recoveryId: id } });
  });

  it("never returns a Markdown row or this run's own live row", () => {
    const markdownId = seed({
      ...glossaryPayload(),
      documentKey: "file:/novel/a.md",
      documentType: "markdown.file",
      filePath: "/novel/a.md",
      payloadText: "body"
    });
    const liveId = seed(
      glossaryPayload({}, { entryId: null, localId: LOCAL_ID }),
      HARNESS_RUN_ID
    );
    const h = harness();

    for (const recoveryId of [markdownId, liveId, "nope"]) {
      expect(
        h.invoke(RECOVERY_CHANNELS.readGlossaryCandidateDraft, { recoveryId })
      ).toEqual({ ok: true, result: { kind: "missing", recoveryId } });
    }
  });
});

describe("glossary .recovered.md fallback (#573 Slice 9)", () => {
  it("writes the Description only, and needs a destination", async () => {
    const row = {
      recoveryId: "row-x",
      documentType: "glossary.description" as const,
      displayName: "王都",
      filePath: null,
      payloadText: serializeGlossaryRecoveryDraft(draft())
    };
    const writes: Array<{ path: string; data: string }> = [];
    const fileSystem = {
      exists: () => Promise.resolve(false),
      writeFileAtomic: (target: string, data: string) => {
        writes.push({ path: target, data });
        return Promise.resolve();
      }
    };

    await expect(restoreRecoveryRow(row, { fileSystem })).resolves.toMatchObject({
      status: "needs-destination"
    });

    const written = await restoreRecoveryRow(row, {
      targetPath: "/novel/王都.md",
      fileSystem
    });
    expect(written.status).toBe("written");
    expect(writes).toEqual([
      { path: path.join("/novel", "王都.recovered.md"), data: DESCRIPTION }
    ]);
  });
});
