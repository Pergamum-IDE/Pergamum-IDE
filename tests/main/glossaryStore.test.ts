import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGlossaryEntry,
  deleteGlossaryEntry,
  getGlossaryEntryById,
  glossaryEntryFromDatabaseRows,
  listGlossaryEntries,
  lookupGlossarySurface,
  updateGlossaryEntry,
  GlossaryStoreError
} from "../../src/main/glossaryStore";
import {
  openProjectDatabase,
  type ProjectDatabase
} from "../../src/main/projectDatabase";
import {
  GlossaryValidationError,
  type GlossaryEntry,
  type GlossaryForm
} from "../../src/shared/glossary";

const missingEntryId = "018f4b8c-7a2b-7c3d-8e4f-123456789abc";
const entryRowId = "018f4b8c-7a2b-7c3d-8e4f-123456789abd";
const formRowId = "018f4b8c-7a2b-7c3d-8e4f-123456789abe";

describe("glossary store", () => {
  let projectRootPath: string;
  let database: ProjectDatabase | null = null;

  beforeEach(async () => {
    projectRootPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "pergamum-glossary-")
    );
    database = await openProjectDatabase(projectRootPath);
  });

  afterEach(async () => {
    if (database) {
      await database.close();
      database = null;
    }

    await fs.rm(projectRootPath, {
      recursive: true,
      force: true
    });
  });

  it("lists an empty glossary from a new project database", async () => {
    await expect(listGlossaryEntries(database!)).resolves.toEqual([]);
  });

  it("logs empty glossary list as succeeded with count zero", async () => {
    const logger = debugLoggerMock();

    await expect(listGlossaryEntries(database!, logger)).resolves.toEqual([]);

    expect(dbLogEvents(logger).map((event) => event.event)).toEqual([
      "db.operation.started",
      "db.operation.succeeded"
    ]);
    expect(dbLogEvents(logger)[1]).toMatchObject({
      level: "debug",
      event: "db.operation.succeeded",
      details: {
        dbOperation: "list",
        dbEntityKind: "glossaryEntry",
        result: "succeeded",
        count: 0
      }
    });
    expect(JSON.stringify(dbLogEvents(logger))).not.toContain(
      "db.operation.skipped"
    );
  });

  it("logs missing glossary entry reads as succeeded with count zero", async () => {
    const logger = debugLoggerMock();

    await expect(
      getGlossaryEntryById(database!, missingEntryId, logger)
    ).resolves.toBeNull();

    expect(dbLogEvents(logger).map((event) => event.event)).toEqual([
      "db.operation.started",
      "db.operation.succeeded"
    ]);
    expect(dbLogEvents(logger)[1]).toMatchObject({
      event: "db.operation.succeeded",
      details: {
        dbOperation: "read",
        dbEntityKind: "glossaryEntry",
        result: "succeeded",
        count: 0
      }
    });
    expect(JSON.stringify(dbLogEvents(logger))).not.toContain(
      "db.operation.skipped"
    );
  });

  it("logs glossary create without surface or description content", async () => {
    const logger = debugLoggerMock();

    await createGlossaryEntry(
      database!,
      {
        kind: "person",
        canonicalSurface: "エリシア・フォン・アルセリア",
        description: "アルセリア王国の第三皇女"
      },
      logger
    );

    expect(dbLogEvents(logger).map((event) => event.event)).toEqual([
      "db.operation.started",
      "db.operation.succeeded"
    ]);
    expect(dbLogEvents(logger)[1]).toMatchObject({
      event: "db.operation.succeeded",
      details: {
        dbOperation: "create",
        dbEntityKind: "glossaryEntry",
        result: "succeeded",
        count: 1
      }
    });
    expect(JSON.stringify(dbLogEvents(logger))).not.toContain("エリシア");
    expect(JSON.stringify(dbLogEvents(logger))).not.toContain("第三皇女");
  });

  it("creates an entry and its canonical form transactionally", async () => {
    const entry = await createGlossaryEntry(database!, {
      kind: "person",
      canonicalSurface: "エリシア・フォン・アルセリア",
      description: "アルセリア王国の第三皇女"
    });

    expect(entry.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(entry.kind).toBe("person");
    expect(entry.description).toBe("アルセリア王国の第三皇女");
    expect(entry.forms).toHaveLength(1);
    const canonicalForm = canonicalFormOf(entry);

    expect(canonicalForm).toMatchObject({
      entryId: entry.id,
      surface: "エリシア・フォン・アルセリア",
      relation: null,
      warningPolicy: null,
      matchBoundaryStart: "auto",
      matchBoundaryEnd: "auto",
      allowSingleCharacterMatch: false,
      isCanonical: true
    });
    expect(Date.parse(entry.createdAt)).not.toBeNaN();
    expect(Date.parse(entry.updatedAt)).not.toBeNaN();
    expect(Date.parse(canonicalForm.createdAt)).not.toBeNaN();
    expect(Date.parse(canonicalForm.updatedAt)).not.toBeNaN();

    await expect(getGlossaryEntryById(database!, entry.id)).resolves.toEqual(
      entry
    );
  });

  it("creates an entry with explicit canonical match boundaries", async () => {
    const entry = await createGlossaryEntry(database!, {
      kind: "person",
      canonicalSurface: "オーダ",
      description: "千年領主制度",
      matchBoundaryStart: "strict",
      matchBoundaryEnd: "none"
    });

    expect(canonicalFormOf(entry)).toMatchObject({
      surface: "オーダ",
      matchBoundaryStart: "strict",
      matchBoundaryEnd: "none"
    });
    await expect(getGlossaryEntryById(database!, entry.id)).resolves.toEqual(
      entry
    );
  });

  it("lists glossary entries ordered by canonical surface", async () => {
    const secondEntry = await createGlossaryEntry(database!, {
      kind: "item",
      canonicalSurface: "魔導炉",
      description: "魔力を生成する設備"
    });
    const firstEntry = await createGlossaryEntry(database!, {
      kind: "place",
      canonicalSurface: "王都アルセリア",
      description: "王国の首都"
    });

    await expect(listGlossaryEntries(database!)).resolves.toEqual([
      firstEntry,
      secondEntry
    ]);
  });

  it("updates glossary entry fields while preserving canonical surface", async () => {
    const entry = await createGlossaryEntry(database!, {
      kind: "term",
      canonicalSurface: "魔導炉",
      description: "旧式の説明",
      matchBoundaryStart: "strict",
      matchBoundaryEnd: "none"
    });
    const updatedEntry = await updateGlossaryEntry(database!, {
      id: entry.id,
      kind: "concept",
      description: "魔力を大量生成する技術",
      canonicalSurface: "魔導炉",
      forms: []
    });

    expect(updatedEntry).toMatchObject({
      id: entry.id,
      kind: "concept",
      description: "魔力を大量生成する技術",
      createdAt: entry.createdAt
    });
    expect(canonicalFormOf(updatedEntry)).toMatchObject({
      surface: "魔導炉",
      relation: null,
      warningPolicy: null,
      matchBoundaryStart: "strict",
      matchBoundaryEnd: "none",
      isCanonical: true
    });
    expect(Date.parse(updatedEntry.updatedAt)).not.toBeNaN();

    await expect(getGlossaryEntryById(database!, entry.id)).resolves.toEqual(
      updatedEntry
    );
  });

  it("updates the canonical match boundaries when explicitly provided", async () => {
    const entry = await createGlossaryEntry(database!, {
      kind: "term",
      canonicalSurface: "メイド",
      description: "使用人",
      matchBoundaryStart: "auto",
      matchBoundaryEnd: "auto"
    });
    const updatedEntry = await updateGlossaryEntry(database!, {
      id: entry.id,
      kind: "term",
      description: "使用人",
      canonicalSurface: "メイド",
      matchBoundaryStart: "none",
      matchBoundaryEnd: "auto",
      forms: []
    });

    expect(canonicalFormOf(updatedEntry)).toMatchObject({
      surface: "メイド",
      matchBoundaryStart: "none",
      matchBoundaryEnd: "auto"
    });

    await expect(getGlossaryEntryById(database!, entry.id)).resolves.toEqual(
      updatedEntry
    );
  });

  it("persists allowSingleCharacterMatch on create, update, and read (#365)", async () => {
    // create: canonical form defaults to false when not provided
    const created = await createGlossaryEntry(database!, {
      kind: "term",
      canonicalSurface: "蝕",
      description: ""
    });
    expect(canonicalFormOf(created).allowSingleCharacterMatch).toBe(false);

    // create with the opt-in on the canonical form
    const createdOptIn = await createGlossaryEntry(database!, {
      kind: "term",
      canonicalSurface: "牙",
      description: "",
      allowSingleCharacterMatch: true
    });
    expect(canonicalFormOf(createdOptIn).allowSingleCharacterMatch).toBe(true);

    // update: flip the canonical form on and add a non-canonical form with it on
    const updated = await updateGlossaryEntry(database!, {
      id: created.id,
      kind: "term",
      description: "",
      canonicalSurface: "蝕",
      allowSingleCharacterMatch: true,
      forms: [
        {
          surface: "喰",
          relation: "alias",
          warningPolicy: "default",
          matchBoundaryStart: "auto",
          matchBoundaryEnd: "auto",
          allowSingleCharacterMatch: true
        },
        {
          surface: "蝕変",
          relation: "variant",
          warningPolicy: "default",
          matchBoundaryStart: "auto",
          matchBoundaryEnd: "auto"
        }
      ]
    });
    expect(canonicalFormOf(updated).allowSingleCharacterMatch).toBe(true);
    const aliasForm = updated.forms.find((form) => form.surface === "喰");
    const variantForm = updated.forms.find((form) => form.surface === "蝕変");
    expect(aliasForm?.allowSingleCharacterMatch).toBe(true);
    // missing on input ⇒ false
    expect(variantForm?.allowSingleCharacterMatch).toBe(false);

    // read back after reopen equals the in-memory result
    await expect(getGlossaryEntryById(database!, created.id)).resolves.toEqual(
      updated
    );
  });

  it("deletes a glossary entry", async () => {
    const entry = await createGlossaryEntry(database!, {
      kind: "organization",
      canonicalSurface: "帝国",
      description: "北方の大国"
    });

    await deleteGlossaryEntry(database!, entry.id);

    await expect(getGlossaryEntryById(database!, entry.id)).resolves.toBeNull();
    await expect(listGlossaryEntries(database!)).resolves.toEqual([]);
  });

  it("persists glossary entries after closing and reopening the project database", async () => {
    const entry = await createGlossaryEntry(database!, {
      kind: "place",
      canonicalSurface: "王都アルセリア",
      description: "王国の首都"
    });

    await database!.close();
    database = await openProjectDatabase(projectRootPath);

    await expect(getGlossaryEntryById(database!, entry.id)).resolves.toEqual(
      entry
    );
  });

  it("rejects missing entries on update and delete", async () => {
    await expect(
      updateGlossaryEntry(database!, {
        id: missingEntryId,
        kind: "term",
        description: "更新できない",
        canonicalSurface: "存在しない用語",
        forms: []
      })
    ).rejects.toBeInstanceOf(GlossaryStoreError);

    await expect(
      deleteGlossaryEntry(database!, missingEntryId)
    ).rejects.toBeInstanceOf(GlossaryStoreError);
  });

  it("logs update precondition misses as skipped before running update", async () => {
    const logger = debugLoggerMock();

    await expect(
      updateGlossaryEntry(
        database!,
        {
          id: missingEntryId,
          kind: "term",
          description: "更新できない",
          canonicalSurface: "存在しない用語",
          forms: []
        },
        logger
      )
    ).rejects.toBeInstanceOf(GlossaryStoreError);

    const events = dbLogEvents(logger);

    expect(events.map((event) => event.event)).toEqual([
      "db.operation.started",
      "db.operation.skipped"
    ]);
    expect(events[1].details.dbOperationId).toBe(
      events[0].details.dbOperationId
    );
    expect(events[1]).toMatchObject({
      level: "debug",
      event: "db.operation.skipped",
      details: {
        dbOperation: "update",
        dbEntityKind: "glossaryEntry",
        result: "ignored",
        reason: "not_found",
        durationMs: expect.any(Number)
      }
    });
  });

  it("logs create validation failures as skipped without content details", async () => {
    const logger = debugLoggerMock();

    await expect(
      createGlossaryEntry(
        database!,
        {
          kind: "term",
          canonicalSurface: " ",
          description: "invalid"
        },
        logger
      )
    ).rejects.toBeInstanceOf(GlossaryValidationError);

    expect(dbLogEvents(logger)).toEqual([
      {
        level: "debug",
        event: "db.operation.skipped",
        details: {
          dbOperationId: expect.any(String),
          dbOperation: "create",
          dbEntityKind: "glossaryEntry",
          result: "ignored",
          reason: "validation_failed",
          durationMs: expect.any(Number)
        }
      }
    ]);
    expect(JSON.stringify(dbLogEvents(logger))).not.toContain("invalid");
  });

  it("logs update validation failures as skipped without DB access", async () => {
    const logger = debugLoggerMock();

    await expect(
      updateGlossaryEntry(
        database!,
        {
          id: missingEntryId,
          kind: "term",
          canonicalSurface: " ",
          description: "invalid update text",
          forms: []
        },
        logger
      )
    ).rejects.toBeInstanceOf(GlossaryValidationError);

    expect(dbLogEvents(logger)).toEqual([
      {
        level: "debug",
        event: "db.operation.skipped",
        details: {
          dbOperationId: expect.any(String),
          dbOperation: "update",
          dbEntityKind: "glossaryEntry",
          result: "ignored",
          reason: "validation_failed",
          durationMs: expect.any(Number)
        }
      }
    ]);
    expect(JSON.stringify(dbLogEvents(logger))).not.toContain(
      "invalid update text"
    );
  });

  it("logs update precondition read failures as failed without unsafe details", async () => {
    const logger = debugLoggerMock();
    const unsafeSurface = "禁書庫";
    const unsafeDescription = "読者入力の説明";
    const readError = Object.assign(
      new Error(
        `SELECT * FROM glossary_entries parameters ${missingEntryId} ${unsafeSurface} ${unsafeDescription} C:\\Users\\technerd\\novel.md row data`
      ),
      {
        code: "SQLITE_IOERR",
        stack: `raw stack ${unsafeDescription}`
      }
    );

    await expect(
      updateGlossaryEntry(
        databaseWithFailingGet(database!, readError),
        {
          id: missingEntryId,
          kind: "term",
          canonicalSurface: unsafeSurface,
          description: unsafeDescription,
          forms: []
        },
        logger
      )
    ).rejects.toBe(readError);

    const events = dbLogEvents(logger);

    expect(events.map((event) => event.event)).toEqual([
      "db.operation.started",
      "db.operation.failed"
    ]);
    expect(events[1].details.dbOperationId).toBe(
      events[0].details.dbOperationId
    );
    expect(events[1]).toMatchObject({
      level: "error",
      event: "db.operation.failed",
      details: {
        dbOperation: "update",
        dbEntityKind: "glossaryEntry",
        result: "failed",
        durationMs: expect.any(Number),
        error: {
          name: "Error",
          code: "SQLITE_IOERR",
          category: "database"
        }
      }
    });

    const serializedEvents = JSON.stringify(events);

    expect(serializedEvents).not.toContain("SELECT * FROM glossary_entries");
    expect(serializedEvents).not.toContain("parameters");
    expect(serializedEvents).not.toContain(missingEntryId);
    expect(serializedEvents).not.toContain(unsafeSurface);
    expect(serializedEvents).not.toContain(unsafeDescription);
    expect(serializedEvents).not.toContain("novel.md");
    expect(serializedEvents).not.toContain("row data");
    expect(serializedEvents).not.toContain("raw stack");
  });

  it("rejects invalid glossary input", async () => {
    await expect(
      createGlossaryEntry(database!, {
        kind: "term",
        canonicalSurface: " ",
        description: "invalid"
      })
    ).rejects.toBeInstanceOf(GlossaryValidationError);

    await expect(
      createGlossaryEntry(database!, {
        kind: "term",
        canonicalSurface: "魔導炉",
        description: "invalid",
        matchBoundaryStart: "word" as never
      })
    ).rejects.toBeInstanceOf(GlossaryValidationError);

    const entry = await createGlossaryEntry(database!, {
      kind: "term",
      canonicalSurface: "魔導炉",
      description: "valid"
    });

    await expect(
      updateGlossaryEntry(database!, {
        id: entry.id,
        kind: "term",
        description: "invalid",
        canonicalSurface: "魔導炉",
        forms: [
          {
            surface: "魔力炉",
            relation: "alias",
            warningPolicy: "default",
            matchBoundaryStart: "word" as never,
            matchBoundaryEnd: "auto"
          }
        ]
      })
    ).rejects.toBeInstanceOf(GlossaryValidationError);
  });

  it("updates canonical, alias, variant, and warning policy forms", async () => {
    const entry = await createGlossaryEntry(database!, {
      kind: "term",
      canonicalSurface: "魔導炉",
      description: "旧式の説明"
    });
    const updatedEntry = await updateGlossaryEntry(database!, {
      id: entry.id,
      kind: "concept",
      description: "魔力を大量生成する設備",
      canonicalSurface: "新型魔導炉",
      forms: [
        {
          surface: "魔力炉",
          relation: "alias",
          warningPolicy: "warn",
          matchBoundaryStart: "strict",
          matchBoundaryEnd: "none"
        },
        {
          surface: "Magic Reactor",
          relation: "variant",
          warningPolicy: "ignore",
          matchBoundaryStart: "none",
          matchBoundaryEnd: "auto"
        }
      ]
    });

    expect(canonicalFormOf(updatedEntry)).toMatchObject({
      surface: "新型魔導炉",
      relation: null,
      warningPolicy: null,
      isCanonical: true
    });
    expect(nonCanonicalFormsOf(updatedEntry)).toHaveLength(2);
    expect(nonCanonicalFormsOf(updatedEntry)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          surface: "Magic Reactor",
          relation: "variant",
          warningPolicy: "ignore",
          matchBoundaryStart: "none",
          matchBoundaryEnd: "auto",
          isCanonical: false
        }),
        expect.objectContaining({
          surface: "魔力炉",
          relation: "alias",
          warningPolicy: "warn",
          matchBoundaryStart: "strict",
          matchBoundaryEnd: "none",
          isCanonical: false
        })
      ])
    );

    await expect(getGlossaryEntryById(database!, entry.id)).resolves.toEqual(
      updatedEntry
    );
  });

  it("rebuilds non-canonical forms without auto-aliasing the old canonical surface", async () => {
    const entry = await createGlossaryEntry(database!, {
      kind: "person",
      canonicalSurface: "アルベルト",
      description: "王国の騎士"
    });
    const firstUpdate = await updateGlossaryEntry(database!, {
      id: entry.id,
      kind: "person",
      description: "王国の騎士",
      canonicalSurface: "アルベルト",
      forms: [
        {
          surface: "アル",
          relation: "alias",
          warningPolicy: "default",
          matchBoundaryStart: "strict",
          matchBoundaryEnd: "none"
        },
        {
          surface: "Albert",
          relation: "variant",
          warningPolicy: "warn",
          matchBoundaryStart: "none",
          matchBoundaryEnd: "strict"
        }
      ]
    });
    const savedAlias = nonCanonicalFormsOf(firstUpdate).find(
      (form) => form.surface === "アル"
    );

    expect(savedAlias).toBeDefined();

    const secondUpdate = await updateGlossaryEntry(database!, {
      id: entry.id,
      kind: "person",
      description: "王国の騎士",
      canonicalSurface: "アルバート",
      forms: [
        {
          id: savedAlias?.id,
          surface: "アル",
          relation: "alias",
          warningPolicy: "ignore",
          matchBoundaryStart: savedAlias?.matchBoundaryStart ?? "strict",
          matchBoundaryEnd: savedAlias?.matchBoundaryEnd ?? "none"
        }
      ]
    });

    expect(canonicalFormOf(secondUpdate).surface).toBe("アルバート");
    expect(secondUpdate.forms.map((form) => form.surface)).not.toContain(
      "アルベルト"
    );
    expect(nonCanonicalFormsOf(secondUpdate)).toEqual([
      expect.objectContaining({
        surface: "アル",
        relation: "alias",
        warningPolicy: "ignore",
        matchBoundaryStart: "strict",
        matchBoundaryEnd: "none"
      })
    ]);
    expect(canonicalFormOf(secondUpdate)).toBeTruthy();
  });

  it("rolls back entry and forms when a form insert fails inside update", async () => {
    const entry = await createGlossaryEntry(database!, {
      kind: "term",
      canonicalSurface: "魔導炉",
      description: "旧式の説明"
    });
    const duplicateFormId = "018f4b8c-7a2b-7c3d-8e4f-623456789abc";

    await expect(
      updateGlossaryEntry(database!, {
        id: entry.id,
        kind: "concept",
        description: "途中で失敗する説明",
        canonicalSurface: "新型魔導炉",
        forms: [
          {
            id: duplicateFormId,
            surface: "魔力炉",
            relation: "alias",
            warningPolicy: "default",
            matchBoundaryStart: "auto",
            matchBoundaryEnd: "auto"
          },
          {
            id: duplicateFormId,
            surface: "Magic Reactor",
            relation: "variant",
            warningPolicy: "warn",
            matchBoundaryStart: "auto",
            matchBoundaryEnd: "auto"
          }
        ]
      })
    ).rejects.toThrow();

    await expect(getGlossaryEntryById(database!, entry.id)).resolves.toEqual(
      entry
    );
  });

  it("allows exact surface lookup with none, unique, and ambiguous results", async () => {
    await expect(
      lookupGlossarySurface(database!, {
        surface: "帝国"
      })
    ).resolves.toEqual({
      status: "none",
      surface: "帝国"
    });

    const firstEntry = await createGlossaryEntry(database!, {
      kind: "organization",
      canonicalSurface: "帝国",
      description: "北方の大国"
    });

    await expect(
      lookupGlossarySurface(database!, {
        surface: "帝国"
      })
    ).resolves.toEqual({
      status: "unique",
      surface: "帝国",
      match: {
        entry: firstEntry,
        form: canonicalFormOf(firstEntry)
      }
    });

    const secondEntry = await createGlossaryEntry(database!, {
      kind: "organization",
      canonicalSurface: "帝国",
      description: "南方の大国"
    });
    const lookupResult = await lookupGlossarySurface(database!, {
      surface: "帝国"
    });

    expect(lookupResult).toEqual({
      status: "ambiguous",
      surface: "帝国",
      matches: [
        {
          entry: firstEntry,
          form: canonicalFormOf(firstEntry)
        },
        {
          entry: secondEntry,
          form: canonicalFormOf(secondEntry)
        }
      ]
    });
  });

  it("logs zero-row glossary surface lookup as succeeded with count zero", async () => {
    const logger = debugLoggerMock();

    await expect(
      lookupGlossarySurface(
        database!,
        {
          surface: "帝国"
        },
        logger
      )
    ).resolves.toEqual({
      status: "none",
      surface: "帝国"
    });

    expect(dbLogEvents(logger).map((event) => event.event)).toEqual([
      "db.operation.started",
      "db.operation.succeeded"
    ]);
    expect(dbLogEvents(logger)[1]).toMatchObject({
      event: "db.operation.succeeded",
      details: {
        dbOperation: "read",
        dbEntityKind: "glossaryForm",
        result: "succeeded",
        count: 0
      }
    });
    expect(JSON.stringify(dbLogEvents(logger))).not.toContain(
      "db.operation.skipped"
    );
    expect(JSON.stringify(dbLogEvents(logger))).not.toContain("帝国");
  });

  it("rejects invalid database rows during domain conversion", () => {
    expect(() =>
      glossaryEntryFromDatabaseRows(
        {
          id: entryRowId,
          kind: "chapter",
          description: "invalid row",
          created_at: "2026-08-11T12:00:00.000Z",
          updated_at: "2026-08-11T12:00:00.000Z"
        },
        [
          {
            id: formRowId,
            entry_id: entryRowId,
            surface: "王都アルセリア",
            relation: null,
            warning_policy: null,
            match_boundary_start: "auto",
            match_boundary_end: "auto",
            is_canonical: 1,
            created_at: "2026-08-11T12:00:00.000Z",
            updated_at: "2026-08-11T12:00:00.000Z"
          }
        ]
      )
    ).toThrow(GlossaryValidationError);
  });
});

function canonicalFormOf(entry: GlossaryEntry): GlossaryForm {
  const canonicalForms = entry.forms.filter((form) => form.isCanonical);

  expect(canonicalForms).toHaveLength(1);

  return canonicalForms[0];
}

function nonCanonicalFormsOf(entry: GlossaryEntry): GlossaryForm[] {
  return entry.forms.filter((form) => !form.isCanonical);
}

function debugLoggerMock(): { log: ReturnType<typeof vi.fn> } {
  return {
    log: vi.fn()
  };
}

function dbLogEvents(logger: { log: ReturnType<typeof vi.fn> }) {
  return logger.log.mock.calls.map((call) => call[0]);
}

function databaseWithFailingGet(
  database: ProjectDatabase,
  error: unknown
): ProjectDatabase {
  const get: ProjectDatabase["get"] = async () => {
    throw error;
  };

  return {
    databasePath: database.databasePath,
    run: database.run.bind(database),
    get,
    all: database.all.bind(database),
    exec: database.exec.bind(database),
    transaction: database.transaction.bind(database),
    close: database.close.bind(database)
  };
}
