import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRecoveryStoreDatabase } from "../../src/main/recoveryStoreDatabase";
import { upsertRecoveryDocument } from "../../src/main/recoveryDocumentStore";
import {
  buildRecoveryCandidateSetSignature,
  evaluateStartupRecoveryPresentation,
  markCurrentRecoveryCandidateSetSeen,
  readLastSeenRecoverySetSignature,
  recoveryCandidateSetSnapshot
} from "../../src/main/recoveryCandidateSeenState";
import { recoveryStoreMetadataKeys } from "../../src/shared/recovery";
import type { RecoveryCandidate } from "../../src/shared/recoveryCandidate";
import type { RecoveryDocumentPayload } from "../../src/shared/recoveryDocument";

const CURRENT_RUN_ID = "0198d95f-97d8-7000-8000-00000000run";
const PREVIOUS_RUN_ID = "0198d95f-97d8-7000-8000-00000000old";
const BODY_MARKER = "SECRET_MANUSCRIPT_SIGNATURE_BODY_300";
const PATH_MARKER = "C:/Secret/Novel/chapter-03.md";

let workDir = "";
let handle: Awaited<ReturnType<typeof openRecoveryStoreDatabase>> | null = null;
let rowSeq = 0;

function candidate(
  overrides: Partial<RecoveryCandidate> = {}
): RecoveryCandidate {
  return {
    recoveryId: "row-1",
    documentType: "markdown.file",
    displayName: "chapter-03.md",
    documentEncoding: "utf-8",
    documentLineend: "lf",
    updatedAt: "2026-08-29T12:41:00.000Z",
    characterCount: 42,
    previewSnippet: "preview",
    hasFilePath: true,
    hasProjectFilePath: false,
    ...overrides
  };
}

function ctx(now: string, instanceRunId = PREVIOUS_RUN_ID) {
  return {
    instanceRunId,
    appVersion: "9.8.7-test",
    now: () => new Date(now),
    createRowId: () => `row-${(rowSeq += 1)}`
  };
}

function filePayload(
  overrides: Partial<RecoveryDocumentPayload> = {}
): RecoveryDocumentPayload {
  return {
    documentKey: "file:C:/Secret/Novel/chapter-03.md",
    documentType: "markdown.file",
    sourceUri: "file:///C:/Secret/Novel/chapter-03.md",
    displayName: "chapter-03.md",
    projectId: null,
    projectFilePath: "C:/Secret/Novel/Novel.pergamum",
    filePath: PATH_MARKER,
    documentEncoding: "utf-8",
    documentLineend: "lf",
    baseMtimeMs: null,
    baseSize: 5,
    baseSha256: "a".repeat(64),
    payloadText: BODY_MARKER,
    ...overrides
  };
}

beforeEach(async () => {
  rowSeq = 0;
  workDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "pergamum-recovery-seen-")
  );
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

describe("buildRecoveryCandidateSetSignature", () => {
  it("builds a stable SHA-256 signature independent of candidate order", () => {
    const left = [
      candidate({ recoveryId: "row-b", updatedAt: "2026-08-29T12:42:00.000Z" }),
      candidate({ recoveryId: "row-a", updatedAt: "2026-08-29T12:41:00.000Z" })
    ];
    const right = [...left].reverse();

    const signature = buildRecoveryCandidateSetSignature(left);

    expect(signature).toMatch(/^[a-f0-9]{64}$/);
    expect(buildRecoveryCandidateSetSignature(right)).toBe(signature);
  });

  it("changes when recoveryId, updatedAt, or characterCount changes", () => {
    const base = buildRecoveryCandidateSetSignature([candidate()]);

    expect(
      buildRecoveryCandidateSetSignature([
        candidate({ recoveryId: "row-2" })
      ])
    ).not.toBe(base);
    expect(
      buildRecoveryCandidateSetSignature([
        candidate({ updatedAt: "2026-08-29T13:00:00.000Z" })
      ])
    ).not.toBe(base);
    expect(
      buildRecoveryCandidateSetSignature([candidate({ characterCount: 43 })])
    ).not.toBe(base);
  });

  it("ignores body, snippet, display name, paths, document key, source uri, origin run id, and app version", () => {
    const base = candidate();
    const withSensitiveFields = {
      ...base,
      displayName: PATH_MARKER,
      previewSnippet: BODY_MARKER,
      payload_text: BODY_MARKER,
      body: BODY_MARKER,
      snippet: BODY_MARKER,
      file_path: PATH_MARKER,
      source_uri: `file:///${PATH_MARKER}`,
      document_key: `file:${PATH_MARKER}`,
      origin_instance_run_id: PREVIOUS_RUN_ID,
      appVersion: "9.9.9-test"
    } as RecoveryCandidate;

    expect(buildRecoveryCandidateSetSignature([withSensitiveFields])).toBe(
      buildRecoveryCandidateSetSignature([base])
    );
  });

  it("returns null for an empty previous-run candidate set", () => {
    expect(buildRecoveryCandidateSetSignature([])).toBeNull();
  });
});

describe("Recovery seen candidate state", () => {
  it("stores lastSeenRecoverySetSignature as optional metadata", () => {
    const db = handle!.database;
    expect(readLastSeenRecoverySetSignature(db)).toBeNull();

    upsertRecoveryDocument(
      db,
      filePayload(),
      ctx("2026-08-29T12:41:00.000Z")
    );
    const snapshot = markCurrentRecoveryCandidateSetSeen(db, CURRENT_RUN_ID);

    expect(snapshot.signature).toMatch(/^[a-f0-9]{64}$/);
    expect(readLastSeenRecoverySetSignature(db)).toBe(snapshot.signature);
    expect(
      (
        db
          .prepare("SELECT value FROM metadata WHERE key = ?")
          .get(recoveryStoreMetadataKeys.lastSeenRecoverySetSignature) as {
          value: string;
        }
      ).value
    ).toBe(snapshot.signature);
  });

  it("does not include current-run rows in the snapshot signature", () => {
    const db = handle!.database;
    upsertRecoveryDocument(
      db,
      filePayload(),
      ctx("2026-08-29T12:41:00.000Z", PREVIOUS_RUN_ID)
    );
    const snapshotBeforeCurrentRun = recoveryCandidateSetSnapshot(
      db,
      CURRENT_RUN_ID
    );

    upsertRecoveryDocument(
      db,
      filePayload({
        documentKey: "file:C:/Secret/Novel/current.md",
        sourceUri: "file:///C:/Secret/Novel/current.md",
        displayName: "current.md",
        filePath: "C:/Secret/Novel/current.md",
        payloadText: `${BODY_MARKER}\ncurrent run changed`
      }),
      ctx("2026-08-29T12:50:00.000Z", CURRENT_RUN_ID)
    );

    const snapshotAfterCurrentRun = recoveryCandidateSetSnapshot(
      db,
      CURRENT_RUN_ID
    );

    expect(snapshotAfterCurrentRun.candidateCount).toBe(1);
    expect(snapshotAfterCurrentRun.signature).toBe(
      snapshotBeforeCurrentRun.signature
    );
  });

  it("auto-shows unseen startup candidates, then returns reminder after the set is marked seen", () => {
    const db = handle!.database;
    upsertRecoveryDocument(
      db,
      filePayload(),
      ctx("2026-08-29T12:41:00.000Z")
    );

    const first = evaluateStartupRecoveryPresentation(db, CURRENT_RUN_ID);

    expect(first.kind).toBe("autoShow");
    if (first.kind !== "autoShow") return;
    expect(first.candidateCount).toBe(1);
    expect(first.candidates.map((row) => row.recoveryId)).toEqual(["row-1"]);
    expect(readLastSeenRecoverySetSignature(db)).toBeNull();

    const marked = markCurrentRecoveryCandidateSetSeen(db, CURRENT_RUN_ID);
    expect(marked.signature).toBe(first.signature);
    expect(readLastSeenRecoverySetSignature(db)).toBe(first.signature);

    const second = evaluateStartupRecoveryPresentation(db, CURRENT_RUN_ID);

    expect(second).toEqual({
      kind: "reminder",
      candidateCount: 1,
      signature: first.signature
    });
  });

  it("does nothing for startup when there are no previous-run candidates", () => {
    expect(
      evaluateStartupRecoveryPresentation(handle!.database, CURRENT_RUN_ID)
    ).toEqual({ kind: "none", candidateCount: 0 });
    expect(readLastSeenRecoverySetSignature(handle!.database)).toBeNull();
  });
});
