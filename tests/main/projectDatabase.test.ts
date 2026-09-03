import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProjectDatabase,
  currentProjectDatabaseSchemaVersion,
  openProjectDatabase,
  projectDatabaseFileName,
  readProjectMetadata,
  resolveProjectDatabasePath,
  resolveProjectFilePath,
  resolveProjectRoot,
  type ProjectDatabase
} from "../../src/main/projectDatabase";

const entryId = "018f4b8c-7a2b-7c3d-8e4f-123456789abc";
const otherEntryId = "018f4b8c-7a2b-7c3d-8e4f-123456789abd";
const atomId = "018f4b8c-7a2b-7c3d-8e4f-123456789abe";
const otherAtomId = "018f4b8c-7a2b-7c3d-8e4f-123456789abf";
const tagId = "018f4b8c-7a2b-7c3d-8e4f-123456789ac0";
const timestamp = "2026-08-11T12:00:00.000Z";

describe("project database", () => {
  let projectRootPath: string;
  let database: ProjectDatabase | null = null;

  beforeEach(async () => {
    projectRootPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "pergamum-project-db-")
    );
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

  describe("path resolution", () => {
    it("resolves valid .pergamum file paths", () => {
      const filePath = path.join(projectRootPath, "novel.pergamum");
      expect(resolveProjectFilePath(filePath)).toBe(path.resolve(filePath));
    });

    it("rejects non-string or empty project file paths", () => {
      expect(() => resolveProjectFilePath("")).toThrowError(
        expect.objectContaining({ code: "PROJECT_DATABASE_PATH_ERROR" })
      );
      expect(() => resolveProjectFilePath("   ")).toThrowError(
        expect.objectContaining({ code: "PROJECT_DATABASE_PATH_ERROR" })
      );
    });

    it("rejects file paths without .pergamum extension", () => {
      expect(() =>
        resolveProjectFilePath(path.join(projectRootPath, "novel.db"))
      ).toThrowError(
        expect.objectContaining({ code: "PROJECT_DATABASE_PATH_ERROR" })
      );
      expect(() =>
        resolveProjectFilePath(path.join(projectRootPath, "novel.txt"))
      ).toThrowError(
        expect.objectContaining({ code: "PROJECT_DATABASE_PATH_ERROR" })
      );
    });

    it("resolves project root from project file path", () => {
      const filePath = path.join(projectRootPath, "novels", "my-story.pergamum");
      expect(resolveProjectRoot(filePath)).toBe(
        path.resolve(projectRootPath, "novels")
      );
    });

    it("resolves pergamum.db inside directory when targetPath is not .pergamum", () => {
      expect(resolveProjectDatabasePath(projectRootPath)).toBe(
        path.resolve(projectRootPath, projectDatabaseFileName)
      );
    });

    it("resolves explicit legacy pergamum.db paths directly in resolveProjectDatabasePath", () => {
      const legacyDatabasePath = path.join(
        projectRootPath,
        projectDatabaseFileName
      );

      expect(resolveProjectDatabasePath(legacyDatabasePath)).toBe(
        path.resolve(legacyDatabasePath)
      );
    });

    it("resolves explicit .pergamum path directly in resolveProjectDatabasePath", () => {
      const explicitPath = path.join(projectRootPath, "novel.pergamum");
      expect(resolveProjectDatabasePath(explicitPath)).toBe(
        path.resolve(explicitPath)
      );
    });
  });

  describe("createProjectDatabase", () => {
    it("creates a new .pergamum database with metadata and finalized schema version 1", async () => {
      const projectFilePath = path.join(
        projectRootPath,
        "Chronicles of Pergamum.pergamum"
      );
      const logger = debugLoggerMock();

      database = await createProjectDatabase(
        {
          projectFilePath,
          projectName: "Chronicles of Pergamum",
          appVersion: "1.0.0"
        },
        logger
      );

      await expect(fs.access(projectFilePath)).resolves.toBeUndefined();

      const version = await database.get<{ user_version: number }>(
        "PRAGMA user_version"
      );
      expect(version?.user_version).toBe(currentProjectDatabaseSchemaVersion);

      const metadata = await readProjectMetadata(database);
      expect(metadata).toEqual({
        projectId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        ),
        projectName: "Chronicles of Pergamum",
        schemaVersion: 1,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        createdWithAppVersion: "1.0.0",
        lastOpenedWithAppVersion: "1.0.0"
      });

      const metadataColumns = await database.all<{ name: string; type: string }>(
        "PRAGMA table_info(metadata)"
      );
      expect(metadataColumns.map((col) => [col.name, col.type])).toEqual([
        ["id", "INTEGER"],
        ["project_id", "TEXT"],
        ["project_name", "TEXT"],
        ["schema_version", "INTEGER"],
        ["created_at", "TEXT"],
        ["updated_at", "TEXT"],
        ["created_with_app_version", "TEXT"],
        ["last_opened_with_app_version", "TEXT"]
      ]);

      const schemaRows = await database.all<{ sql: string | null }>(
        `
          SELECT sql
          FROM sqlite_master
          WHERE type = 'table'
            AND name IN (
              'metadata', 'glossary_entries', 'glossary_atoms',
              'glossary_tags', 'glossary_entry_tags'
            )
        `
      );
      const schemaSql = schemaRows.map((row) => row.sql ?? "").join("\n");

      expect(schemaSql).not.toContain("GLOB");
      expect(schemaSql).not.toContain("lower(");

      expect(dbLogEvents(logger).map((e) => e.event)).toEqual([
        "db.operation.started",
        "db.operation.succeeded"
      ]);
      expect(JSON.stringify(dbLogEvents(logger))).not.toContain(projectFilePath);
      expect(JSON.stringify(dbLogEvents(logger))).not.toContain(
        "Chronicles of Pergamum"
      );
    });

    it("rejects empty or whitespace-only project name", async () => {
      const projectFilePath = path.join(projectRootPath, "test.pergamum");

      await expect(
        createProjectDatabase({
          projectFilePath,
          projectName: "   "
        })
      ).rejects.toMatchObject({
        code: "PROJECT_DATABASE_VALIDATION_ERROR"
      });
    });

    it("refuses to overwrite an existing .pergamum file", async () => {
      const projectFilePath = path.join(projectRootPath, "existing.pergamum");
      await fs.writeFile(projectFilePath, "dummy content", "utf8");

      await expect(
        createProjectDatabase({
          projectFilePath,
          projectName: "Existing Project"
        })
      ).rejects.toMatchObject({
        code: "PROJECT_DATABASE_ALREADY_EXISTS"
      });

      // Verify the existing file was not modified, truncated, or removed
      const content = await fs.readFile(projectFilePath, "utf8");
      expect(content).toBe("dummy content");
    });

    it("cleans up newly created .pergamum file if initialization fails", async () => {
      const projectFilePath = path.join(projectRootPath, "failing.pergamum");
      const projectName = "Failing Secret Project";
      const logger = debugLoggerMock();

      const originalPrepare = Database.prototype.prepare;
      const spy = vi
        .spyOn(Database.prototype, "prepare")
        .mockImplementation(function (this: Database.Database, sql: string) {
          if (sql.includes("INSERT INTO metadata")) {
            throw new Error(
              `SQLITE_CONSTRAINT ${projectFilePath} ${projectName}`
            );
          }
          return originalPrepare.call(this, sql);
        });

      try {
        const error = await createProjectDatabase(
          {
            projectFilePath,
            projectName
          },
          logger
        ).catch((e) => e);

        expect(error).toMatchObject({
          code: "PROJECT_DATABASE_TRANSACTION_ERROR"
        });
        expect(error.message).not.toContain("SQLITE_CONSTRAINT");
        expect(error.message).not.toContain(projectFilePath);
        expect(error.message).not.toContain(projectName);
        expect(error.cause).toBeUndefined();

        const serializedEvents = JSON.stringify(dbLogEvents(logger));
        expect(serializedEvents).not.toContain("SQLITE_CONSTRAINT");
        expect(serializedEvents).not.toContain(projectFilePath);
        expect(serializedEvents).not.toContain(projectName);

        // The newly created file should have been cleaned up (unlinked)
        await expect(fs.access(projectFilePath)).rejects.toMatchObject({
          code: "ENOENT"
        });
      } finally {
        spy.mockRestore();
      }
    });

    it("does not clean up a .pergamum path if the created file identity no longer matches", async () => {
      const projectFilePath = path.join(projectRootPath, "replaced.pergamum");

      const originalPrepare = Database.prototype.prepare;
      const prepareSpy = vi
        .spyOn(Database.prototype, "prepare")
        .mockImplementation(function (this: Database.Database, sql: string) {
          if (sql.includes("INSERT INTO metadata")) {
            throw new Error("SQLITE_CONSTRAINT replaced file");
          }
          return originalPrepare.call(this, sql);
        });
      const statSpy = vi.spyOn(fs, "stat").mockResolvedValueOnce({
        dev: -1,
        ino: -1,
        birthtimeMs: -1
      } as Awaited<ReturnType<typeof fs.stat>>);

      try {
        await expect(
          createProjectDatabase({
            projectFilePath,
            projectName: "Replaced File Test"
          })
        ).rejects.toMatchObject({
          code: "PROJECT_DATABASE_TRANSACTION_ERROR"
        });

        await expect(fs.access(projectFilePath)).resolves.toBeUndefined();
      } finally {
        prepareSpy.mockRestore();
        statSpy.mockRestore();
      }
    });

    it("differentiates non-EEXIST errors during exclusive creation without leaking raw path in cause", async () => {
      const projectFilePath = path.join(projectRootPath, "perm.pergamum");

      const openSpy = vi.spyOn(fs, "open").mockRejectedValueOnce({
        code: "EACCES",
        path: "C:\\secret\\path\\perm.pergamum",
        message: "EACCES: permission denied, open 'C:\\secret\\path\\perm.pergamum'"
      });

      try {
        const error = await createProjectDatabase({
          projectFilePath,
          projectName: "Permission Test"
        }).catch((e) => e);

        expect(error).toMatchObject({
          code: "PROJECT_DATABASE_PATH_ERROR"
        });
        // Ensure cause does not leak the raw fs error object
        expect(error.cause).toBeUndefined();
      } finally {
        openSpy.mockRestore();
      }
    });
  });

  describe("openProjectDatabase with .pergamum file (strictly non-mutating validation)", () => {
    it("opens an existing valid .pergamum database and reads metadata", async () => {
      const projectFilePath = path.join(projectRootPath, "novel.pergamum");

      const created = await createProjectDatabase({
        projectFilePath,
        projectName: "My Novel"
      });
      await created.close();

      database = await openProjectDatabase(projectFilePath);
      const metadata = await readProjectMetadata(database);

      expect(metadata.projectName).toBe("My Novel");
      expect(metadata.schemaVersion).toBe(1);
    });

    it("rejects opening a non-existent .pergamum file with PROJECT_DATABASE_NOT_FOUND without raw fs cause", async () => {
      const nonExistentPath = path.join(projectRootPath, "does-not-exist.pergamum");

      const error = await openProjectDatabase(nonExistentPath).catch((e) => e);

      expect(error).toMatchObject({
        code: "PROJECT_DATABASE_NOT_FOUND"
      });
      expect(error.cause).toBeUndefined();
    });

    it("differentiates non-ENOENT access errors when opening .pergamum file", async () => {
      const projectFilePath = path.join(projectRootPath, "locked.pergamum");

      const accessSpy = vi.spyOn(fs, "access").mockRejectedValueOnce({
        code: "EBUSY",
        path: "C:\\secret\\path\\locked.pergamum",
        message: "EBUSY: resource busy or locked"
      });

      try {
        const error = await openProjectDatabase(projectFilePath).catch((e) => e);

        expect(error).toMatchObject({
          code: "PROJECT_DATABASE_PATH_ERROR"
        });
        expect(error.cause).toBeUndefined();
      } finally {
        accessSpy.mockRestore();
      }
    });

    it("rejects an empty user_version 0 database without modifying the file", async () => {
      const projectFilePath = path.join(projectRootPath, "empty.pergamum");
      const emptyDb = new Database(projectFilePath);
      emptyDb.close();

      await expect(openProjectDatabase(projectFilePath)).rejects.toMatchObject({
        code: "PROJECT_DATABASE_SCHEMA_MISMATCH"
      });

      // Verify the file was not modified (user_version remains 0, no tables created)
      const verifyDb = new Database(projectFilePath);
      const version = verifyDb.pragma("user_version", { simple: true });
      const tables = verifyDb
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all();
      verifyDb.close();

      expect(version).toBe(0);
      expect(tables).toEqual([]);
    });

    it("rejects database when metadata table is missing without modifying or repairing it", async () => {
      const projectFilePath = path.join(projectRootPath, "no-meta-table.pergamum");
      const rawDb = new Database(projectFilePath);
      rawDb.exec(`
        CREATE TABLE glossary_entries (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          description TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        PRAGMA user_version = 1;
      `);
      rawDb.close();

      await expect(openProjectDatabase(projectFilePath)).rejects.toMatchObject({
        code: "PROJECT_DATABASE_SCHEMA_ERROR"
      });

      const verifyDb = new Database(projectFilePath);
      const version = verifyDb.pragma("user_version", { simple: true });
      const tables = verifyDb
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
        )
        .all() as { name: string }[];
      verifyDb.close();

      expect(version).toBe(1);
      expect(tables.map((row) => row.name)).toEqual(["glossary_entries"]);
    });

    it("rejects database when metadata row is missing (empty metadata table)", async () => {
      const projectFilePath = path.join(projectRootPath, "missing-meta-row.pergamum");

      const created = await createProjectDatabase({
        projectFilePath,
        projectName: "Missing Meta Row Test"
      });
      await created.run("DELETE FROM metadata WHERE id = 1");
      await created.close();

      await expect(openProjectDatabase(projectFilePath)).rejects.toMatchObject({
        code: "PROJECT_DATABASE_SCHEMA_ERROR"
      });

      const verifyDb = new Database(projectFilePath);
      const metadataCount = verifyDb
        .prepare("SELECT COUNT(*) AS count FROM metadata")
        .get() as { count: number };
      verifyDb.close();

      expect(metadataCount.count).toBe(0);
    });

    it("rejects database when PRAGMA user_version does not match metadata.schema_version", async () => {
      const projectFilePath = path.join(projectRootPath, "mismatch.pergamum");

      const created = await createProjectDatabase({
        projectFilePath,
        projectName: "Mismatch Test"
      });
      // Force mismatch: metadata.schema_version becomes 2 while PRAGMA user_version remains 1
      await created.run(
        "UPDATE metadata SET schema_version = 2 WHERE id = 1"
      );
      await created.close();

      await expect(openProjectDatabase(projectFilePath)).rejects.toMatchObject({
        code: "PROJECT_DATABASE_SCHEMA_MISMATCH"
      });

      const verifyDb = new Database(projectFilePath);
      const userVersion = verifyDb.pragma("user_version", { simple: true });
      const metadataVersion = verifyDb
        .prepare("SELECT schema_version FROM metadata WHERE id = 1")
        .get() as { schema_version: number };
      verifyDb.close();

      expect(userVersion).toBe(1);
      expect(metadataVersion.schema_version).toBe(2);
    });

    it("rejects database when metadata table has invalid project_id UUID format", async () => {
      const projectFilePath = path.join(projectRootPath, "invalid-uuid.pergamum");

      const created = await createProjectDatabase({
        projectFilePath,
        projectName: "Invalid UUID Test"
      });
      await created.run("UPDATE metadata SET project_id = 'not-a-uuid' WHERE id = 1");
      await created.close();

      await expect(openProjectDatabase(projectFilePath)).rejects.toMatchObject({
        code: "PROJECT_DATABASE_SCHEMA_ERROR"
      });
    });

    it("rejects database when a required glossary index is missing without recreating it", async () => {
      const projectFilePath = path.join(projectRootPath, "missing-index.pergamum");

      const created = await createProjectDatabase({
        projectFilePath,
        projectName: "Missing Index Test"
      });
      await created.exec("DROP INDEX glossary_atoms_value_idx");
      await created.close();

      await expect(openProjectDatabase(projectFilePath)).rejects.toMatchObject({
        code: "PROJECT_DATABASE_SCHEMA_ERROR"
      });

      const verifyDb = new Database(projectFilePath);
      const indexes = verifyDb
        .prepare("PRAGMA index_list(glossary_atoms)")
        .all() as { name: string }[];
      verifyDb.close();

      expect(indexes.map((row) => row.name)).not.toContain(
        "glossary_atoms_value_idx"
      );
    });

    it("rejects corrupt/prototype database without repairing it", async () => {
      const projectFilePath = path.join(projectRootPath, "corrupt.pergamum");
      const rawDb = new Database(projectFilePath);
      rawDb.exec(`
        CREATE TABLE metadata (
          id INTEGER PRIMARY KEY,
          project_id TEXT,
          project_name TEXT
        );
        PRAGMA user_version = 1;
      `);
      rawDb.close();

      await expect(openProjectDatabase(projectFilePath)).rejects.toMatchObject({
        code: "PROJECT_DATABASE_SCHEMA_ERROR"
      });

      const verifyDb = new Database(projectFilePath);
      const tables = verifyDb
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
        )
        .all() as { name: string }[];
      const metadataColumns = verifyDb
        .prepare("PRAGMA table_info(metadata)")
        .all() as { name: string; type: string }[];
      verifyDb.close();

      expect(tables.map((row) => row.name)).toEqual(["metadata"]);
      expect(metadataColumns.map((row) => [row.name, row.type])).toEqual([
        ["id", "INTEGER"],
        ["project_id", "TEXT"],
        ["project_name", "TEXT"]
      ]);
    });
  });

  describe("directory-based openProjectDatabase legacy compatibility", () => {
    it("initializes a missing pergamum.db with finalized schema version 1 and default metadata", async () => {
      database = await openProjectDatabase(projectRootPath);

      await expect(
        fs.access(path.join(projectRootPath, projectDatabaseFileName))
      ).resolves.toBeUndefined();

      const version = await database.get<{ user_version: number }>(
        "PRAGMA user_version"
      );
      expect(version?.user_version).toBe(currentProjectDatabaseSchemaVersion);

      const metadata = await readProjectMetadata(database);
      expect(metadata.projectName).toBe("Untitled Project");
      expect(metadata.schemaVersion).toBe(currentProjectDatabaseSchemaVersion);

      const entryColumns = await database.all<{ name: string; type: string }>(
        "PRAGMA table_info(glossary_entries)"
      );
      const atomColumns = await database.all<{ name: string; type: string }>(
        "PRAGMA table_info(glossary_atoms)"
      );
      const tagColumns = await database.all<{ name: string; type: string }>(
        "PRAGMA table_info(glossary_tags)"
      );
      const entryTagColumns = await database.all<{
        name: string;
        type: string;
      }>("PRAGMA table_info(glossary_entry_tags)");
      const atomIndexes = await database.all<{
        name: string;
        unique: number;
        partial: number;
      }>("PRAGMA index_list(glossary_atoms)");

      expect(entryColumns.map((column) => [column.name, column.type])).toEqual([
        ["id", "TEXT"],
        ["description", "TEXT"],
        // #375: project-wide glossary entry display order.
        ["sort_order", "INTEGER"],
        ["created_at", "TEXT"],
        ["updated_at", "TEXT"]
      ]);
      expect(atomColumns.map((column) => [column.name, column.type])).toEqual([
        ["id", "TEXT"],
        ["entry_id", "TEXT"],
        ["sort_order", "INTEGER"],
        ["value", "TEXT"],
        ["match_flags", "INTEGER"],
        ["created_at", "TEXT"],
        ["updated_at", "TEXT"]
      ]);
      expect(tagColumns.map((column) => [column.name, column.type])).toEqual([
        ["id", "TEXT"],
        ["label", "TEXT"],
        ["description", "TEXT"],
        ["background_rgb", "TEXT"],
        ["foreground_rgb", "TEXT"],
        ["sort_order", "INTEGER"],
        ["created_at", "TEXT"],
        ["updated_at", "TEXT"]
      ]);
      expect(
        entryTagColumns.map((column) => [column.name, column.type])
      ).toEqual([
        ["entry_id", "TEXT"],
        ["tag_id", "TEXT"],
        // #375: entry-local tag ASSIGNMENT order (0 = primary tag).
        ["sort_order", "INTEGER"]
      ]);
      expect(atomIndexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "glossary_atoms_value_idx",
            unique: 0,
            partial: 0
          }),
          expect.objectContaining({
            name: "glossary_atoms_entry_id_idx",
            unique: 0,
            partial: 0
          })
        ])
      );
    });

    it("opens a legacy pergamum.db file path directly for active project file compatibility", async () => {
      const legacyDatabasePath = path.join(
        projectRootPath,
        projectDatabaseFileName
      );

      database = await openProjectDatabase(legacyDatabasePath);

      expect(database.databasePath).toBe(path.resolve(legacyDatabasePath));
      await expect(fs.access(legacyDatabasePath)).resolves.toBeUndefined();
    });

    it("logs database initialization without count or project path", async () => {
      const logger = debugLoggerMock();

      database = await openProjectDatabase(projectRootPath, logger);

      expect(dbLogEvents(logger).map((event) => event.event)).toEqual([
        "db.operation.started",
        "db.operation.succeeded"
      ]);
      expect(dbLogEvents(logger)[0]).toMatchObject({
        level: "debug",
        event: "db.operation.started",
        details: {
          dbOperationId: expect.any(String),
          dbOperation: "initialize",
          dbEntityKind: "database"
        }
      });
      expect(dbLogEvents(logger)[1]).toMatchObject({
        level: "debug",
        event: "db.operation.succeeded",
        details: {
          dbOperationId: dbLogEvents(logger)[0].details?.dbOperationId,
          dbOperation: "initialize",
          dbEntityKind: "database",
          result: "succeeded",
          durationMs: expect.any(Number)
        }
      });
      expect(dbLogEvents(logger)[1].details).not.toHaveProperty("count");
      expect(JSON.stringify(dbLogEvents(logger))).not.toContain(projectRootPath);
      expect(JSON.stringify(dbLogEvents(logger))).not.toContain(
        projectDatabaseFileName
      );
    });

    it("enforces foreign keys for each opened connection", async () => {
      database = await openProjectDatabase(projectRootPath);

      const foreignKeys = await database.get<{ foreign_keys: number }>(
        "PRAGMA foreign_keys"
      );

      expect(foreignKeys?.foreign_keys).toBe(1);
    });

    it("rejects newer schema versions", async () => {
      database = await openProjectDatabase(projectRootPath);
      await database.exec("PRAGMA user_version = 999");
      await database.close();
      database = null;
      const logger = debugLoggerMock();

      await expect(
        openProjectDatabase(projectRootPath, logger)
      ).rejects.toMatchObject({
        code: "PROJECT_DATABASE_SCHEMA_ERROR"
      });
      expect(dbLogEvents(logger).map((event) => event.event)).toEqual([
        "db.operation.started",
        "db.operation.failed"
      ]);
      expect(dbLogEvents(logger)[1]).toMatchObject({
        level: "error",
        event: "db.operation.failed",
        details: {
          dbOperation: "initialize",
          dbEntityKind: "database",
          result: "failed",
          durationMs: expect.any(Number),
          error: {
            name: "ProjectDatabaseError",
            code: "PROJECT_DATABASE_SCHEMA_ERROR",
            category: "database"
          }
        }
      });
      expect(JSON.stringify(dbLogEvents(logger))).not.toContain(projectRootPath);
    });

    it("rejects an incompatible prototype version 1 schema", async () => {
      const sqliteDatabase = new Database(
        path.join(projectRootPath, projectDatabaseFileName)
      );

      sqliteDatabase.exec(`
        CREATE TABLE glossary_entries (
          id INTEGER PRIMARY KEY,
          term TEXT NOT NULL CHECK (length(trim(term)) > 0),
          description TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
        PRAGMA user_version = 1;
      `);
      sqliteDatabase.close();

      await expect(openProjectDatabase(projectRootPath)).rejects.toMatchObject({
        code: "PROJECT_DATABASE_SCHEMA_ERROR",
        message: expect.stringContaining("prototype development databases")
      });
    });
  });

  describe("glossary invariants and operations (#375)", () => {
    it("does not encode UUIDv7 format validation as SQLite CHECK constraints", async () => {
      database = await openProjectDatabase(projectRootPath);

      const schemaRows = await database.all<{ sql: string | null }>(
        `
          SELECT sql
          FROM sqlite_master
          WHERE type = 'table'
            AND name IN (
              'glossary_entries', 'glossary_atoms',
              'glossary_tags', 'glossary_entry_tags'
            )
        `
      );
      const schemaSql = schemaRows.map((row) => row.sql ?? "").join("\n");

      expect(schemaSql).not.toContain("GLOB");
      expect(schemaSql).not.toContain("lower(");
    });

    it("rejects a blank atom value and a negative match_flags / sort_order", async () => {
      database = await openProjectDatabase(projectRootPath);
      await insertEntry(database, entryId);

      await expect(insertAtom(database, atomId, entryId, 0, "  ")).rejects.toMatchObject(
        { code: "PROJECT_DATABASE_QUERY_ERROR" }
      );
      await expect(
        insertAtom(database, atomId, entryId, 0, "値", -1)
      ).rejects.toMatchObject({ code: "PROJECT_DATABASE_QUERY_ERROR" });
      await expect(
        insertAtom(database, atomId, entryId, -1, "値")
      ).rejects.toMatchObject({ code: "PROJECT_DATABASE_QUERY_ERROR" });
    });

    it("enforces one atom per (entry_id, sort_order)", async () => {
      database = await openProjectDatabase(projectRootPath);
      await insertEntry(database, entryId);
      await insertAtom(database, atomId, entryId, 0, "織田信長");

      await expect(
        insertAtom(database, otherAtomId, entryId, 0, "第六天魔王")
      ).rejects.toMatchObject({ code: "PROJECT_DATABASE_QUERY_ERROR" });
    });

    it("cascades atom and entry_tag deletion when an entry is deleted", async () => {
      database = await openProjectDatabase(projectRootPath);
      await insertEntry(database, entryId);
      await insertAtom(database, atomId, entryId, 0, "織田信長");
      await insertTag(database, tagId, "武将");
      await database.run(
        "INSERT INTO glossary_entry_tags (entry_id, tag_id, sort_order) VALUES (?, ?, 0)",
        [entryId, tagId]
      );

      await database.run("DELETE FROM glossary_entries WHERE id = ?", [entryId]);

      expect(
        (
          await database.get<{ count: number }>(
            "SELECT COUNT(*) AS count FROM glossary_atoms WHERE entry_id = ?",
            [entryId]
          )
        )?.count
      ).toBe(0);
      expect(
        (
          await database.get<{ count: number }>(
            "SELECT COUNT(*) AS count FROM glossary_entry_tags WHERE entry_id = ?",
            [entryId]
          )
        )?.count
      ).toBe(0);
      // The tag itself survives.
      expect(
        (
          await database.get<{ count: number }>(
            "SELECT COUNT(*) AS count FROM glossary_tags WHERE id = ?",
            [tagId]
          )
        )?.count
      ).toBe(1);
    });

    it("hard-deleting a tag cascades to entry_tags only, never to entries or atoms", async () => {
      database = await openProjectDatabase(projectRootPath);
      await insertEntry(database, entryId);
      await insertAtom(database, atomId, entryId, 0, "織田信長");
      await insertTag(database, tagId, "武将");
      await database.run(
        "INSERT INTO glossary_entry_tags (entry_id, tag_id, sort_order) VALUES (?, ?, 0)",
        [entryId, tagId]
      );

      await database.run("DELETE FROM glossary_tags WHERE id = ?", [tagId]);

      expect(
        (
          await database.get<{ count: number }>(
            "SELECT COUNT(*) AS count FROM glossary_entry_tags WHERE tag_id = ?",
            [tagId]
          )
        )?.count
      ).toBe(0);
      expect(
        (
          await database.get<{ count: number }>(
            "SELECT COUNT(*) AS count FROM glossary_atoms WHERE entry_id = ?",
            [entryId]
          )
        )?.count
      ).toBe(1);
      expect(
        (
          await database.get<{ count: number }>(
            "SELECT COUNT(*) AS count FROM glossary_entries WHERE id = ?",
            [entryId]
          )
        )?.count
      ).toBe(1);
    });

    it("rejects a blank tag label", async () => {
      database = await openProjectDatabase(projectRootPath);

      await expect(insertTag(database, tagId, "   ")).rejects.toMatchObject({
        code: "PROJECT_DATABASE_QUERY_ERROR"
      });
    });

    it("allows the same atom value on different entries", async () => {
      database = await openProjectDatabase(projectRootPath);
      await insertEntry(database, entryId);
      await insertEntry(database, otherEntryId, 1);
      await insertAtom(database, atomId, entryId, 0, "帝国");

      await expect(
        insertAtom(database, otherAtomId, otherEntryId, 0, "帝国")
      ).resolves.toBeDefined();
    });

    it("rolls back a failed transaction", async () => {
      database = await openProjectDatabase(projectRootPath);

      await expect(
        database.transaction(async () => {
          await insertEntry(database!, entryId);
          await insertAtom(database!, atomId, entryId, 0, " ");
        })
      ).rejects.toMatchObject({
        code: "PROJECT_DATABASE_TRANSACTION_ERROR"
      });

      const row = await database.get<{ count: number }>(
        "SELECT COUNT(*) AS count FROM glossary_entries WHERE id = ?",
        [entryId]
      );

      expect(row?.count).toBe(0);
    });
  });
});

async function insertEntry(
  database: ProjectDatabase,
  id: string,
  sortOrder = 0
): Promise<void> {
  await database.run(
    `
      INSERT INTO glossary_entries (
        id, description, sort_order, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    [id, "説明", sortOrder, timestamp, timestamp]
  );
}

async function insertAtom(
  database: ProjectDatabase,
  id: string,
  entryId: string,
  sortOrder: number,
  value: string,
  matchFlags = 0
) {
  return database.run(
    `
      INSERT INTO glossary_atoms (
        id, entry_id, sort_order, value, match_flags, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [id, entryId, sortOrder, value, matchFlags, timestamp, timestamp]
  );
}

async function insertTag(
  database: ProjectDatabase,
  id: string,
  label: string
) {
  return database.run(
    `
      INSERT INTO glossary_tags (
        id, label, description, background_rgb, foreground_rgb,
        sort_order, created_at, updated_at
      )
      VALUES (?, ?, NULL, '#123456', '#ffffff', 0, ?, ?)
    `,
    [id, label, timestamp, timestamp]
  );
}

function debugLoggerMock(): { log: ReturnType<typeof vi.fn> } {
  return {
    log: vi.fn()
  };
}

function dbLogEvents(logger: { log: ReturnType<typeof vi.fn> }) {
  return logger.log.mock.calls.map((call) => call[0]);
}
