import { promises as fs } from "node:fs";
import path from "node:path";
import Database, {
  type Database as BetterSqliteDatabase,
  type RunResult
} from "better-sqlite3";
import {
  dbOperationResult,
  withDbOperationLog,
  type DbOperationLogger
} from "./dbOperationLog";
import { getDebugLogger } from "./debugLogger";
import { createUuidv7 } from "./ids";
import { validateUuidv7 } from "../shared/glossary";

export const projectFileExtension = ".pergamum";
export const projectDatabaseFileName = "pergamum.db";
export const currentProjectDatabaseSchemaVersion = 1;

export type ProjectDatabaseErrorCode =
  | "PROJECT_DATABASE_PATH_ERROR"
  | "PROJECT_DATABASE_ALREADY_EXISTS"
  | "PROJECT_DATABASE_NOT_FOUND"
  | "PROJECT_DATABASE_OPEN_ERROR"
  | "PROJECT_DATABASE_SCHEMA_ERROR"
  | "PROJECT_DATABASE_SCHEMA_MISMATCH"
  | "PROJECT_DATABASE_QUERY_ERROR"
  | "PROJECT_DATABASE_TRANSACTION_ERROR"
  | "PROJECT_DATABASE_VALIDATION_ERROR";

export class ProjectDatabaseError extends Error {
  readonly code: ProjectDatabaseErrorCode;
  readonly cause?: unknown;

  constructor(
    code: ProjectDatabaseErrorCode,
    message: string,
    cause?: unknown
  ) {
    super(message);
    this.name = "ProjectDatabaseError";
    this.code = code;
    this.cause = cause;
  }
}

export type SqliteValue = string | number | bigint | Buffer | null;

export type SqliteParameters =
  | readonly SqliteValue[]
  | Record<string, SqliteValue>;

export interface SqliteRunResult {
  lastID: number;
  changes: number;
}

export interface ProjectMetadata {
  readonly projectId: string;
  readonly projectName: string;
  readonly schemaVersion: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdWithAppVersion?: string;
  readonly lastOpenedWithAppVersion?: string;
}

export interface CreateProjectDatabaseInput {
  readonly projectFilePath: string;
  readonly projectName: string;
  readonly appVersion?: string;
}

export interface ProjectDatabase {
  readonly databasePath: string;
  run(sql: string, parameters?: SqliteParameters): Promise<SqliteRunResult>;
  get<T extends Record<string, unknown>>(
    sql: string,
    parameters?: SqliteParameters
  ): Promise<T | undefined>;
  all<T extends Record<string, unknown>>(
    sql: string,
    parameters?: SqliteParameters
  ): Promise<T[]>;
  exec(sql: string): Promise<void>;
  transaction<T>(operation: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

interface TableColumnRow extends Record<string, unknown> {
  name: unknown;
  type: unknown;
  pk: unknown;
}

interface IndexListRow extends Record<string, unknown> {
  name: unknown;
  unique: unknown;
  partial: unknown;
}

interface MetadataRow extends Record<string, unknown> {
  id: unknown;
  project_id: unknown;
  project_name: unknown;
  schema_version: unknown;
  created_at: unknown;
  updated_at: unknown;
  created_with_app_version: unknown;
  last_opened_with_app_version: unknown;
}

interface CreatedFileIdentity {
  dev: number | bigint;
  ino: number | bigint;
  birthtimeMs: number | bigint;
}

function queryError(): ProjectDatabaseError {
  return new ProjectDatabaseError(
    "PROJECT_DATABASE_QUERY_ERROR",
    "Project database query failed."
  );
}

export function resolveProjectFilePath(filePath: string): string {
  if (typeof filePath !== "string" || filePath.trim().length === 0) {
    throw new ProjectDatabaseError(
      "PROJECT_DATABASE_PATH_ERROR",
      "Project file path must be a non-empty string."
    );
  }

  const resolvedPath = path.resolve(filePath);

  if (path.extname(resolvedPath).toLowerCase() !== projectFileExtension) {
    throw new ProjectDatabaseError(
      "PROJECT_DATABASE_PATH_ERROR",
      `Project file path must end with ${projectFileExtension}.`
    );
  }

  return resolvedPath;
}

export function resolveProjectRoot(projectFilePath: string): string {
  const resolvedPath = resolveProjectFilePath(projectFilePath);
  return path.dirname(resolvedPath);
}

export function resolveProjectDatabasePath(targetPath: string): string {
  if (typeof targetPath !== "string" || targetPath.trim().length === 0) {
    throw new ProjectDatabaseError(
      "PROJECT_DATABASE_PATH_ERROR",
      "Project target path must be a non-empty string."
    );
  }

  const resolved = path.resolve(targetPath);

  if (path.extname(resolved).toLowerCase() === projectFileExtension) {
    return resolved;
  }

  if (path.basename(resolved).toLowerCase() === projectDatabaseFileName) {
    return resolved;
  }

  const databasePath = path.resolve(resolved, projectDatabaseFileName);
  const relativeDatabasePath = path.relative(resolved, databasePath);

  if (
    relativeDatabasePath.startsWith("..") ||
    path.isAbsolute(relativeDatabasePath)
  ) {
    throw new ProjectDatabaseError(
      "PROJECT_DATABASE_PATH_ERROR",
      "Project database path is outside the project root."
    );
  }

  return databasePath;
}

class SqliteProjectDatabase implements ProjectDatabase {
  constructor(
    readonly databasePath: string,
    private readonly database: BetterSqliteDatabase
  ) {}

  run(
    sql: string,
    parameters: SqliteParameters = []
  ): Promise<SqliteRunResult> {
    try {
      const result = runStatement(this.database, sql, parameters);
      return Promise.resolve({
        lastID: Number(result.lastInsertRowid),
        changes: result.changes
      });
    } catch {
      return Promise.reject(queryError());
    }
  }

  get<T extends Record<string, unknown>>(
    sql: string,
    parameters: SqliteParameters = []
  ): Promise<T | undefined> {
    try {
      return Promise.resolve(getStatement<T>(this.database, sql, parameters));
    } catch {
      return Promise.reject(queryError());
    }
  }

  all<T extends Record<string, unknown>>(
    sql: string,
    parameters: SqliteParameters = []
  ): Promise<T[]> {
    try {
      return Promise.resolve(allStatement<T>(this.database, sql, parameters));
    } catch {
      return Promise.reject(queryError());
    }
  }

  exec(sql: string): Promise<void> {
    try {
      this.database.exec(sql);
      return Promise.resolve();
    } catch {
      return Promise.reject(queryError());
    }
  }

  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    await this.exec("BEGIN");

    try {
      const result = await operation();
      await this.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        await this.exec("ROLLBACK");
      } catch {
        throw new ProjectDatabaseError(
          "PROJECT_DATABASE_TRANSACTION_ERROR",
          "Project database transaction rollback failed."
        );
      }

      throw new ProjectDatabaseError(
        "PROJECT_DATABASE_TRANSACTION_ERROR",
        "Project database transaction failed."
      );
    }
  }

  close(): Promise<void> {
    try {
      this.database.close();
      return Promise.resolve();
    } catch {
      return Promise.reject(queryError());
    }
  }
}

function runStatement(
  database: BetterSqliteDatabase,
  sql: string,
  parameters: SqliteParameters
): RunResult {
  const statement = database.prepare(sql);

  return Array.isArray(parameters)
    ? statement.run(...parameters)
    : statement.run(parameters);
}

function getStatement<T extends Record<string, unknown>>(
  database: BetterSqliteDatabase,
  sql: string,
  parameters: SqliteParameters
): T | undefined {
  const statement = database.prepare(sql);
  const row = Array.isArray(parameters)
    ? statement.get(...parameters)
    : statement.get(parameters);

  return row as T | undefined;
}

function allStatement<T extends Record<string, unknown>>(
  database: BetterSqliteDatabase,
  sql: string,
  parameters: SqliteParameters
): T[] {
  const statement = database.prepare(sql);
  const rows = Array.isArray(parameters)
    ? statement.all(...parameters)
    : statement.all(parameters);

  return rows as T[];
}

function isEnoentError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "ENOENT"
  );
}

function isExistError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "EEXIST"
  );
}

function createdFileIdentityFromStats(
  stats: Awaited<ReturnType<fs.FileHandle["stat"]>>
): CreatedFileIdentity {
  return {
    dev: stats.dev,
    ino: stats.ino,
    birthtimeMs: stats.birthtimeMs
  };
}

function isSameCreatedFile(
  current: Awaited<ReturnType<typeof fs.stat>>,
  created: CreatedFileIdentity
): boolean {
  return (
    current.dev === created.dev &&
    current.ino === created.ino &&
    current.birthtimeMs === created.birthtimeMs
  );
}

async function cleanupCreatedProjectFile(
  filePath: string,
  createdIdentity: CreatedFileIdentity
): Promise<void> {
  try {
    const current = await fs.stat(filePath);

    if (isSameCreatedFile(current, createdIdentity)) {
      await fs.unlink(filePath);
    }
  } catch {
    // Ignore cleanup errors to preserve the primary initialization error.
  }
}

function openSqliteDatabase(
  databasePath: string,
  options?: Database.Options
): Promise<BetterSqliteDatabase> {
  try {
    return Promise.resolve(new Database(databasePath, options));
  } catch {
    return Promise.reject(
      new ProjectDatabaseError(
        "PROJECT_DATABASE_OPEN_ERROR",
        "Could not open project database."
      )
    );
  }
}

async function readSchemaVersion(
  database: ProjectDatabase
): Promise<number> {
  const row = await database.get<{ user_version: unknown }>(
    "PRAGMA user_version"
  );

  if (!row || typeof row.user_version !== "number") {
    throw new ProjectDatabaseError(
      "PROJECT_DATABASE_SCHEMA_ERROR",
      "Could not read project database schema version."
    );
  }

  return row.user_version;
}

export async function createSchemaVersionOne(
  database: ProjectDatabase
): Promise<void> {
  await database.exec(`
    CREATE TABLE metadata (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      project_id TEXT NOT NULL,
      project_name TEXT NOT NULL CHECK (length(trim(project_name)) > 0),
      schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_with_app_version TEXT,
      last_opened_with_app_version TEXT
    ) STRICT;

    CREATE TABLE glossary_entries (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      -- #375: the entry's project-wide display order (0 = first). Distinct from
      -- glossary_atoms.sort_order (Atom order within an entry),
      -- glossary_tags.sort_order (project-wide Tag order) and
      -- glossary_entry_tags.sort_order (Tag assignment order within an entry).
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE glossary_atoms (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL
        REFERENCES glossary_entries(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      value TEXT NOT NULL CHECK (length(trim(value)) > 0),
      match_flags INTEGER NOT NULL DEFAULT 0 CHECK (match_flags >= 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(entry_id, sort_order)
    ) STRICT;

    CREATE TABLE glossary_tags (
      id TEXT PRIMARY KEY,
      -- #375: a tag label is 1..32 characters after trimming (labels only —
      -- Atom values / the representative term stay unbounded).
      label TEXT NOT NULL
        CHECK (length(trim(label)) > 0 AND length(trim(label)) <= 32),
      description TEXT,
      background_rgb TEXT NOT NULL,
      foreground_rgb TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE glossary_entry_tags (
      entry_id TEXT NOT NULL
        REFERENCES glossary_entries(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL
        REFERENCES glossary_tags(id) ON DELETE CASCADE,
      -- #375: the tag's ASSIGNMENT order WITHIN this entry (0 = the primary
      -- tag). Distinct from glossary_tags.sort_order (the project-wide order).
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      PRIMARY KEY (entry_id, tag_id)
    ) STRICT;

    CREATE INDEX glossary_atoms_value_idx
      ON glossary_atoms(value);

    CREATE INDEX glossary_atoms_entry_id_idx
      ON glossary_atoms(entry_id);

    -- #375: an atom value is unique within its entry (trimmed, case-sensitive
    -- — stored values are always pre-trimmed by the shared validators).
    CREATE UNIQUE INDEX glossary_atoms_entry_value_unique
      ON glossary_atoms(entry_id, value);

    -- #375: a glossary tag label is unique project-wide (trimmed,
    -- case-sensitive).
    CREATE UNIQUE INDEX glossary_tags_label_unique
      ON glossary_tags(label);

    CREATE INDEX glossary_entry_tags_tag_id_idx
      ON glossary_entry_tags(tag_id);

    -- #375: a tag's assignment order is unique within its entry (mirrors
    -- glossary_atoms_entry_value_unique).
    CREATE UNIQUE INDEX glossary_entry_tags_entry_sort_unique
      ON glossary_entry_tags(entry_id, sort_order);
  `);
}

function columnDetail(row: TableColumnRow): [string, string, number] {
  if (
    typeof row.name !== "string" ||
    typeof row.type !== "string" ||
    typeof row.pk !== "number"
  ) {
    throw new ProjectDatabaseError(
      "PROJECT_DATABASE_SCHEMA_ERROR",
      "Could not read project database table schema."
    );
  }

  return [row.name, row.type, row.pk];
}

async function assertTableSchema(
  database: ProjectDatabase,
  tableName:
    | "metadata"
    | "glossary_entries"
    | "glossary_atoms"
    | "glossary_tags"
    | "glossary_entry_tags",
  expectedColumns: readonly [string, string, number][]
): Promise<void> {
  const columns = await database.all<TableColumnRow>(
    `PRAGMA table_info(${tableName})`
  );
  const actualColumns = columns.map(columnDetail);

  if (JSON.stringify(actualColumns) !== JSON.stringify(expectedColumns)) {
    throw new ProjectDatabaseError(
      "PROJECT_DATABASE_SCHEMA_ERROR",
      `Project database schema is incompatible with finalized schema version 1. The ${tableName} table does not match the expected structure; prototype development databases must be recreated.`
    );
  }
}

function readIndexFlag(value: unknown, column: string): number {
  if (typeof value !== "number") {
    throw new ProjectDatabaseError(
      "PROJECT_DATABASE_SCHEMA_ERROR",
      `Could not read project database index ${column} flag.`
    );
  }

  return value;
}

async function assertTableIndex(
  database: ProjectDatabase,
  tableName: string,
  indexName: string,
  expectedUnique: number,
  expectedPartial: number
): Promise<void> {
  const indexes = await database.all<IndexListRow>(
    `PRAGMA index_list(${tableName})`
  );
  const index = indexes.find((row) => row.name === indexName);

  if (!index) {
    throw new ProjectDatabaseError(
      "PROJECT_DATABASE_SCHEMA_ERROR",
      `Project database schema is missing required index ${indexName}.`
    );
  }

  if (
    readIndexFlag(index.unique, "unique") !== expectedUnique ||
    readIndexFlag(index.partial, "partial") !== expectedPartial
  ) {
    throw new ProjectDatabaseError(
      "PROJECT_DATABASE_SCHEMA_ERROR",
      `Project database index ${indexName} does not match the expected structure.`
    );
  }
}

export async function validateSchemaVersionOne(
  database: ProjectDatabase
): Promise<void> {
  await assertTableSchema(database, "metadata", [
    ["id", "INTEGER", 1],
    ["project_id", "TEXT", 0],
    ["project_name", "TEXT", 0],
    ["schema_version", "INTEGER", 0],
    ["created_at", "TEXT", 0],
    ["updated_at", "TEXT", 0],
    ["created_with_app_version", "TEXT", 0],
    ["last_opened_with_app_version", "TEXT", 0]
  ]);
  await assertTableSchema(database, "glossary_entries", [
    ["id", "TEXT", 1],
    ["description", "TEXT", 0],
    ["sort_order", "INTEGER", 0],
    ["created_at", "TEXT", 0],
    ["updated_at", "TEXT", 0]
  ]);
  await assertTableSchema(database, "glossary_atoms", [
    ["id", "TEXT", 1],
    ["entry_id", "TEXT", 0],
    ["sort_order", "INTEGER", 0],
    ["value", "TEXT", 0],
    ["match_flags", "INTEGER", 0],
    ["created_at", "TEXT", 0],
    ["updated_at", "TEXT", 0]
  ]);
  await assertTableSchema(database, "glossary_tags", [
    ["id", "TEXT", 1],
    ["label", "TEXT", 0],
    ["description", "TEXT", 0],
    ["background_rgb", "TEXT", 0],
    ["foreground_rgb", "TEXT", 0],
    ["sort_order", "INTEGER", 0],
    ["created_at", "TEXT", 0],
    ["updated_at", "TEXT", 0]
  ]);
  await assertTableSchema(database, "glossary_entry_tags", [
    ["entry_id", "TEXT", 1],
    ["tag_id", "TEXT", 2],
    ["sort_order", "INTEGER", 0]
  ]);
  await assertTableIndex(
    database,
    "glossary_atoms",
    "glossary_atoms_value_idx",
    0,
    0
  );
  await assertTableIndex(
    database,
    "glossary_atoms",
    "glossary_atoms_entry_id_idx",
    0,
    0
  );
  await assertTableIndex(
    database,
    "glossary_atoms",
    "glossary_atoms_entry_value_unique",
    1,
    0
  );
  await assertTableIndex(
    database,
    "glossary_tags",
    "glossary_tags_label_unique",
    1,
    0
  );
  await assertTableIndex(
    database,
    "glossary_entry_tags",
    "glossary_entry_tags_tag_id_idx",
    0,
    0
  );
  await assertTableIndex(
    database,
    "glossary_entry_tags",
    "glossary_entry_tags_entry_sort_unique",
    1,
    0
  );
}

export async function readProjectMetadata(
  database: ProjectDatabase
): Promise<ProjectMetadata> {
  let row: MetadataRow | undefined;
  try {
    row = await database.get<MetadataRow>(
      "SELECT id, project_id, project_name, schema_version, created_at, updated_at, created_with_app_version, last_opened_with_app_version FROM metadata WHERE id = 1"
    );
  } catch {
    throw new ProjectDatabaseError(
      "PROJECT_DATABASE_SCHEMA_ERROR",
      "Failed to read project metadata table."
    );
  }

  if (!row) {
    throw new ProjectDatabaseError(
      "PROJECT_DATABASE_SCHEMA_ERROR",
      "Project metadata table is missing or empty."
    );
  }

  if (
    typeof row.project_id !== "string" ||
    typeof row.project_name !== "string" ||
    typeof row.schema_version !== "number" ||
    typeof row.created_at !== "string" ||
    typeof row.updated_at !== "string"
  ) {
    throw new ProjectDatabaseError(
      "PROJECT_DATABASE_SCHEMA_ERROR",
      "Project metadata table contains invalid column types."
    );
  }

  try {
    validateUuidv7(row.project_id);
  } catch {
    throw new ProjectDatabaseError(
      "PROJECT_DATABASE_SCHEMA_ERROR",
      "Project metadata project_id is not a valid UUIDv7."
    );
  }

  if (row.project_name.trim().length === 0) {
    throw new ProjectDatabaseError(
      "PROJECT_DATABASE_SCHEMA_ERROR",
      "Project metadata project_name must not be empty."
    );
  }

  return {
    projectId: row.project_id,
    projectName: row.project_name,
    schemaVersion: row.schema_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdWithAppVersion:
      typeof row.created_with_app_version === "string"
        ? row.created_with_app_version
        : undefined,
    lastOpenedWithAppVersion:
      typeof row.last_opened_with_app_version === "string"
        ? row.last_opened_with_app_version
        : undefined
  };
}

export async function createProjectDatabase(
  input: CreateProjectDatabaseInput,
  logger: DbOperationLogger = getDebugLogger()
): Promise<ProjectDatabase> {
  const resolvedPath = resolveProjectFilePath(input.projectFilePath);
  const trimmedName =
    typeof input.projectName === "string" ? input.projectName.trim() : "";

  if (trimmedName.length === 0) {
    throw new ProjectDatabaseError(
      "PROJECT_DATABASE_VALIDATION_ERROR",
      "Project name must be a non-empty string."
    );
  }

  const projectRoot = path.dirname(resolvedPath);
  try {
    await fs.mkdir(projectRoot, { recursive: true });
  } catch {
    throw new ProjectDatabaseError(
      "PROJECT_DATABASE_PATH_ERROR",
      "Could not create project root directory."
    );
  }

  // TOCTOU mitigation: Acquire exclusive creation right via "wx" flag
  let createdFileIdentity: CreatedFileIdentity | null = null;
  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(resolvedPath, "wx");
    createdFileIdentity = createdFileIdentityFromStats(await handle.stat());
  } catch (error) {
    if (isExistError(error)) {
      throw new ProjectDatabaseError(
        "PROJECT_DATABASE_ALREADY_EXISTS",
        "Project database file already exists."
      );
    }
    throw new ProjectDatabaseError(
      "PROJECT_DATABASE_PATH_ERROR",
      "Could not inspect project database path."
    );
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {
        // Ignore file handle close error
      }
    }
  }

  const projectId = createUuidv7();
  const now = new Date().toISOString();

  return withDbOperationLog(
    {
      logger,
      dbOperation: "initialize",
      dbEntityKind: "database"
    },
    async () => {
      let sqliteDatabase: BetterSqliteDatabase | null = null;
      let database: ProjectDatabase | null = null;

      try {
        sqliteDatabase = await openSqliteDatabase(resolvedPath);
        database = new SqliteProjectDatabase(resolvedPath, sqliteDatabase);

        await database.exec("PRAGMA foreign_keys = ON");
        await database.transaction(async () => {
          await createSchemaVersionOne(database!);
          await database!.run(
            `INSERT INTO metadata (
              id,
              project_id,
              project_name,
              schema_version,
              created_at,
              updated_at,
              created_with_app_version,
              last_opened_with_app_version
            ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
            [
              projectId,
              trimmedName,
              currentProjectDatabaseSchemaVersion,
              now,
              now,
              input.appVersion ?? null,
              input.appVersion ?? null
            ]
          );
          await database!.exec(
            `PRAGMA user_version = ${currentProjectDatabaseSchemaVersion}`
          );
        });

        await validateSchemaVersionOne(database);
        return dbOperationResult(database);
      } catch (error) {
        if (database) {
          try {
            await database.close();
          } catch {
            // Ignore close errors during failure cleanup
          }
        } else if (sqliteDatabase) {
          try {
            sqliteDatabase.close();
          } catch {
            // Ignore close errors during failure cleanup
          }
        }

        // Clean up only if this invocation exclusively created the file
        if (createdFileIdentity) {
          await cleanupCreatedProjectFile(resolvedPath, createdFileIdentity);
        }

        throw error instanceof ProjectDatabaseError
          ? error
          : new ProjectDatabaseError(
              "PROJECT_DATABASE_OPEN_ERROR",
              "Could not initialize project database."
            );
      }
    }
  );
}

/**
 * Validates and opens an existing .pergamum project file.
 * This is strictly non-mutating: it never creates tables, never inserts metadata,
 * and never modifies the database file if validation fails.
 */
async function openExplicitProjectFile(
  projectFilePath: string,
  logger: DbOperationLogger
): Promise<ProjectDatabase> {
  try {
    await fs.access(projectFilePath);
  } catch (error) {
    if (isEnoentError(error)) {
      throw new ProjectDatabaseError(
        "PROJECT_DATABASE_NOT_FOUND",
        "Project database file does not exist."
      );
    }
    throw new ProjectDatabaseError(
      "PROJECT_DATABASE_PATH_ERROR",
      "Could not inspect project database path."
    );
  }

  return withDbOperationLog(
    {
      logger,
      dbOperation: "initialize",
      dbEntityKind: "database"
    },
    async () => {
      await validateExplicitProjectFile(projectFilePath);

      const sqliteDatabase = await openSqliteDatabase(projectFilePath, {
        fileMustExist: true
      });
      const database = new SqliteProjectDatabase(projectFilePath, sqliteDatabase);

      try {
        await database.exec("PRAGMA foreign_keys = ON");
        return dbOperationResult(database);
      } catch (error) {
        await database.close();
        throw error;
      }
    }
  );
}

async function validateExplicitProjectFile(
  projectFilePath: string
): Promise<void> {
  const sqliteDatabase = await openSqliteDatabase(projectFilePath, {
    readonly: true,
    fileMustExist: true
  });
  const database = new SqliteProjectDatabase(projectFilePath, sqliteDatabase);

  try {
    const userVersion = await readSchemaVersion(database);
    if (userVersion !== currentProjectDatabaseSchemaVersion) {
      throw new ProjectDatabaseError(
        "PROJECT_DATABASE_SCHEMA_MISMATCH",
        `Project database schema version ${userVersion} does not match supported version ${currentProjectDatabaseSchemaVersion}.`
      );
    }

    await validateSchemaVersionOne(database);

    const metadata = await readProjectMetadata(database);
    if (metadata.schemaVersion !== userVersion) {
      throw new ProjectDatabaseError(
        "PROJECT_DATABASE_SCHEMA_MISMATCH",
        `Project metadata schema version ${metadata.schemaVersion} does not match database user_version ${userVersion}.`
      );
    }
  } finally {
    try {
      await database.close();
    } catch {
      // Ignore close errors after validation; they must not mask schema errors.
    }
  }
}

/**
 * Legacy compatibility branch for directory-based database opening (pergamum.db).
 * Slice 2 will move IPC callers to explicit .pergamum paths.
 */
async function openLegacyProjectDatabase(
  legacyTargetPath: string,
  logger: DbOperationLogger
): Promise<ProjectDatabase> {
  const databasePath = resolveProjectDatabasePath(legacyTargetPath);

  return withDbOperationLog(
    {
      logger,
      dbOperation: "initialize",
      dbEntityKind: "database"
    },
    async () => {
      const sqliteDatabase = await openSqliteDatabase(databasePath);
      const database = new SqliteProjectDatabase(databasePath, sqliteDatabase);

      try {
        await database.exec("PRAGMA foreign_keys = ON");

        const userVersion = await readSchemaVersion(database);
        if (userVersion === 0) {
          await database.transaction(async () => {
            await createSchemaVersionOne(database);
            const defaultId = createUuidv7();
            const now = new Date().toISOString();
            await database.run(
              `INSERT INTO metadata (
                id, project_id, project_name, schema_version, created_at, updated_at
              ) VALUES (1, ?, ?, ?, ?, ?)`,
              [
                defaultId,
                "Untitled Project",
                currentProjectDatabaseSchemaVersion,
                now,
                now
              ]
            );
            await database.exec(
              `PRAGMA user_version = ${currentProjectDatabaseSchemaVersion}`
            );
          });
        } else if (userVersion !== currentProjectDatabaseSchemaVersion) {
          throw new ProjectDatabaseError(
            "PROJECT_DATABASE_SCHEMA_ERROR",
            `Project database schema version ${userVersion} does not match supported version ${currentProjectDatabaseSchemaVersion}.`
          );
        }

        await validateSchemaVersionOne(database);
        return dbOperationResult(database);
      } catch (error) {
        await database.close();
        throw error;
      }
    }
  );
}

export async function openProjectDatabase(
  targetPath: string,
  logger: DbOperationLogger = getDebugLogger()
): Promise<ProjectDatabase> {
  const databasePath = resolveProjectDatabasePath(targetPath);
  const isExplicitProjectFile =
    path.extname(databasePath).toLowerCase() === projectFileExtension;

  if (isExplicitProjectFile) {
    return openExplicitProjectFile(databasePath, logger);
  }

  return openLegacyProjectDatabase(targetPath, logger);
}
