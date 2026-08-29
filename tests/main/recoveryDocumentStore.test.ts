import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRecoveryStoreDatabase } from "../../src/main/recoveryStoreDatabase";
import {
  deleteRecoveryDocument,
  upsertRecoveryDocument,
  type UpsertRecoveryDocumentContext
} from "../../src/main/recoveryDocumentStore";
import type { RecoveryDocumentPayload } from "../../src/shared/recoveryDocument";

let workDir = "";
let handle: Awaited<ReturnType<typeof openRecoveryStoreDatabase>> | null = null;

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

let rowSeq = 0;

function context(
  overrides: Partial<UpsertRecoveryDocumentContext> = {}
): UpsertRecoveryDocumentContext {
  return {
    instanceRunId: "0198d95f-97d8-7000-8000-00000000run",
    appVersion: "9.8.7-test",
    now: () => new Date("2026-08-29T08:21:00.000Z"),
    createRowId: () => `row-${(rowSeq += 1)}`,
    ...overrides
  };
}

function filePayload(
  overrides: Partial<RecoveryDocumentPayload> = {}
): RecoveryDocumentPayload {
  return {
    documentKey: "file:C:/Novel/chapter.md",
    documentType: "markdown.file",
    sourceUri: "file://C:/Novel/chapter.md",
    displayName: "chapter.md",
    projectId: null,
    projectFilePath: null,
    filePath: "C:/Novel/chapter.md",
    documentEncoding: "utf-8",
    documentLineend: "lf",
    baseMtimeMs: null,
    baseSize: 10,
    baseSha256: SHA_A,
    payloadText: "# Chapter\nSECRET_MANUSCRIPT_BODY_v1",
    ...overrides
  };
}

function row(dbHandle: NonNullable<typeof handle>, documentKey: string) {
  return dbHandle.database
    .prepare("SELECT * FROM documents WHERE document_key = ?")
    .get(documentKey) as Record<string, unknown> | undefined;
}

beforeEach(async () => {
  rowSeq = 0;
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), "pergamum-recovery-doc-"));
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

describe("upsertRecoveryDocument", () => {
  it("inserts a new row with the full payload and the base fingerprint", () => {
    const db = handle!;
    expect(upsertRecoveryDocument(db.database, filePayload(), context())).toBe(
      "inserted"
    );

    const inserted = row(db, "file:C:/Novel/chapter.md")!;
    expect(inserted).toMatchObject({
      id: "row-1",
      document_key: "file:C:/Novel/chapter.md",
      document_type: "markdown.file",
      source_uri: "file://C:/Novel/chapter.md",
      display_name: "chapter.md",
      file_path: "C:/Novel/chapter.md",
      document_encoding: "utf-8",
      document_lineend: "lf",
      base_mtime_ms: null,
      base_size: 10,
      base_sha256: SHA_A,
      payload_text: "# Chapter\nSECRET_MANUSCRIPT_BODY_v1",
      origin_instance_run_id: "0198d95f-97d8-7000-8000-00000000run",
      created_at: "2026-08-29T08:21:00.000Z",
      updated_at: "2026-08-29T08:21:00.000Z",
      app_version: "9.8.7-test"
    });
  });

  it("updates the same row on a repeat dirty flush and NEVER moves the base fingerprint", () => {
    const db = handle!;
    upsertRecoveryDocument(db.database, filePayload(), context());

    // A dirty-update flush: new body, a (deliberately) different base
    // fingerprint in the payload, later timestamp, new run id.
    const mode = upsertRecoveryDocument(
      db.database,
      filePayload({
        payloadText: "# Chapter\nSECRET_MANUSCRIPT_BODY_v2_longer",
        baseSize: 999,
        baseSha256: SHA_B,
        displayName: "chapter (edited).md"
      }),
      context({
        instanceRunId: "0198d95f-97d8-7000-8000-00000000ru2",
        now: () => new Date("2026-08-29T08:25:00.000Z")
      })
    );

    expect(mode).toBe("updated");
    const updated = row(db, "file:C:/Novel/chapter.md")!;
    expect(updated.id).toBe("row-1"); // same row
    expect(updated.payload_text).toBe(
      "# Chapter\nSECRET_MANUSCRIPT_BODY_v2_longer"
    );
    expect(updated.display_name).toBe("chapter (edited).md");
    expect(updated.origin_instance_run_id).toBe(
      "0198d95f-97d8-7000-8000-00000000ru2"
    );
    expect(updated.updated_at).toBe("2026-08-29T08:25:00.000Z");
    // Base fingerprint frozen at insert.
    expect(updated.base_size).toBe(10);
    expect(updated.base_sha256).toBe(SHA_A);
    expect(updated.base_mtime_ms).toBeNull();
    expect(updated.created_at).toBe("2026-08-29T08:21:00.000Z");
    expect(
      db.database
        .prepare("SELECT COUNT(*) AS c FROM documents")
        .get() as { c: number }
    ).toEqual({ c: 1 });
  });

  it("stores project columns for a project document keyed as a file", () => {
    const db = handle!;
    upsertRecoveryDocument(
      db.database,
      filePayload({
        documentKey: "file:C:/Proj/root/ch/01.md",
        sourceUri: "file://C:/Proj/root/ch/01.md",
        filePath: "C:/Proj/root/ch/01.md",
        projectId: "0198d95f-97d8-7000-8000-0000000proj",
        projectFilePath: "C:/Proj/root/Proj.pergamum"
      }),
      context()
    );

    expect(row(db, "file:C:/Proj/root/ch/01.md")).toMatchObject({
      project_id: "0198d95f-97d8-7000-8000-0000000proj",
      project_file_path: "C:/Proj/root/Proj.pergamum",
      document_type: "markdown.file"
    });
  });

  it("stores an Untitled row with null base fingerprint + null attributes", () => {
    const db = handle!;
    upsertRecoveryDocument(
      db.database,
      {
        documentKey: "untitled:0198d95f-97d8-7000-8000-0000000unti",
        documentType: "markdown.untitled",
        sourceUri: "untitled://0198d95f-97d8-7000-8000-0000000unti",
        displayName: "Untitled.md",
        documentEncoding: null,
        documentLineend: null,
        baseMtimeMs: null,
        baseSize: null,
        baseSha256: null,
        payloadText: "typed but never saved"
      },
      context()
    );

    expect(row(db, "untitled:0198d95f-97d8-7000-8000-0000000unti")).toMatchObject(
      {
        document_type: "markdown.untitled",
        document_encoding: null,
        document_lineend: null,
        base_mtime_ms: null,
        base_size: null,
        base_sha256: null,
        payload_text: "typed but never saved"
      }
    );
  });
});

describe("deleteRecoveryDocument", () => {
  it("removes the row for a document key and reports deleted / noop", () => {
    const db = handle!;
    upsertRecoveryDocument(db.database, filePayload(), context());

    expect(
      deleteRecoveryDocument(db.database, "file:C:/Novel/chapter.md")
    ).toBe("deleted");
    expect(row(db, "file:C:/Novel/chapter.md")).toBeUndefined();

    expect(
      deleteRecoveryDocument(db.database, "file:C:/Novel/chapter.md")
    ).toBe("noop");
  });

  it("only deletes the exact key it is given", () => {
    const db = handle!;
    upsertRecoveryDocument(db.database, filePayload(), context());
    upsertRecoveryDocument(
      db.database,
      filePayload({
        documentKey: "file:C:/Novel/other.md",
        sourceUri: "file://C:/Novel/other.md",
        filePath: "C:/Novel/other.md"
      }),
      context()
    );

    deleteRecoveryDocument(db.database, "file:C:/Novel/chapter.md");

    expect(row(db, "file:C:/Novel/chapter.md")).toBeUndefined();
    expect(row(db, "file:C:/Novel/other.md")).toBeDefined();
  });
});
