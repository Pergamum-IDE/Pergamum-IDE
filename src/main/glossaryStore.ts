import {
  DEFAULT_GLOSSARY_FORM_MATCH_BOUNDARY,
  GlossaryValidationError,
  validateCreateGlossaryEntryInput,
  validateGlossaryEntry,
  validateGlossaryEntryId,
  validateGlossaryForm,
  validateGlossarySurfaceLookupInput,
  validateUpdateGlossaryEntryInput,
  type CreateGlossaryEntryInput,
  type GlossaryEntry,
  type GlossaryForm,
  type GlossarySurfaceLookupInput,
  type GlossarySurfaceLookupResult,
  type UpdateGlossaryEntryInput
} from "../shared/glossary";
import type {
  DebugLogDbEntityKind,
  DebugLogDbOperation
} from "../shared/debugLog";
import {
  dbOperationResult,
  logDbOperationSkipped,
  skipDbOperation,
  withDbOperationLog,
  type DbOperationLogger
} from "./dbOperationLog";
import { getDebugLogger } from "./debugLogger";
import { createUuidv7 } from "./ids";
import type { ProjectDatabase } from "./projectDatabase";

export type GlossaryStoreErrorCode = "GLOSSARY_ENTRY_NOT_FOUND";

export class GlossaryStoreError extends Error {
  readonly code: GlossaryStoreErrorCode;

  constructor(code: GlossaryStoreErrorCode, message: string) {
    super(message);
    this.name = "GlossaryStoreError";
    this.code = code;
  }
}

interface GlossaryEntryRow extends Record<string, unknown> {
  id: unknown;
  kind: unknown;
  description: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface GlossaryFormRow extends Record<string, unknown> {
  id: unknown;
  entry_id: unknown;
  surface: unknown;
  relation: unknown;
  warning_policy: unknown;
  match_boundary_start: unknown;
  match_boundary_end: unknown;
  allow_single_character_match: unknown;
  is_canonical: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface GlossarySurfaceMatchRow extends Record<string, unknown> {
  entry_id: unknown;
  entry_kind: unknown;
  entry_description: unknown;
  entry_created_at: unknown;
  entry_updated_at: unknown;
  form_id: unknown;
  form_entry_id: unknown;
  form_surface: unknown;
  form_relation: unknown;
  form_warning_policy: unknown;
  form_match_boundary_start: unknown;
  form_match_boundary_end: unknown;
  form_allow_single_character_match: unknown;
  form_is_canonical: unknown;
  form_created_at: unknown;
  form_updated_at: unknown;
}

function invalidDatabaseRow(message: string): never {
  throw new GlossaryValidationError(`Invalid glossary database row: ${message}`);
}

function stringColumn(value: unknown, column: string): string {
  if (typeof value !== "string") {
    invalidDatabaseRow(`${column} must be a string.`);
  }

  return value;
}

function nullableStringColumn(value: unknown, column: string): string | null {
  if (value === null) {
    return null;
  }

  return stringColumn(value, column);
}

function booleanColumn(value: unknown, column: string): boolean {
  if (value !== 0 && value !== 1) {
    invalidDatabaseRow(`${column} must be 0 or 1.`);
  }

  return value === 1;
}

function nowTimestamp(): string {
  return new Date().toISOString();
}

function notFound(id: string): GlossaryStoreError {
  return new GlossaryStoreError(
    "GLOSSARY_ENTRY_NOT_FOUND",
    `Glossary entry not found: ${id}`
  );
}

function validateOrLogDbSkipped<T>(
  logger: DbOperationLogger,
  dbOperation: DebugLogDbOperation,
  dbEntityKind: DebugLogDbEntityKind,
  validate: () => T
): T {
  try {
    return validate();
  } catch (error) {
    logDbOperationSkipped({
      logger,
      dbOperation,
      dbEntityKind,
      reason: "validation_failed"
    });
    throw error;
  }
}

export function glossaryFormFromDatabaseRow(
  row: GlossaryFormRow
): GlossaryForm {
  return validateGlossaryForm({
    id: stringColumn(row.id, "id"),
    entryId: stringColumn(row.entry_id, "entry_id"),
    surface: stringColumn(row.surface, "surface"),
    relation: nullableStringColumn(row.relation, "relation"),
    warningPolicy: nullableStringColumn(
      row.warning_policy,
      "warning_policy"
    ),
    matchBoundaryStart: stringColumn(
      row.match_boundary_start,
      "match_boundary_start"
    ),
    matchBoundaryEnd: stringColumn(
      row.match_boundary_end,
      "match_boundary_end"
    ),
    allowSingleCharacterMatch: booleanColumn(
      row.allow_single_character_match,
      "allow_single_character_match"
    ),
    isCanonical: booleanColumn(row.is_canonical, "is_canonical"),
    createdAt: stringColumn(row.created_at, "created_at"),
    updatedAt: stringColumn(row.updated_at, "updated_at")
  });
}

export function glossaryEntryFromDatabaseRows(
  entryRow: GlossaryEntryRow,
  formRows: GlossaryFormRow[]
): GlossaryEntry {
  const id = stringColumn(entryRow.id, "id");
  const forms = formRows.map(glossaryFormFromDatabaseRow);

  return validateGlossaryEntry({
    id,
    kind: stringColumn(entryRow.kind, "kind"),
    description: stringColumn(entryRow.description, "description"),
    forms,
    createdAt: stringColumn(entryRow.created_at, "created_at"),
    updatedAt: stringColumn(entryRow.updated_at, "updated_at")
  });
}

async function listFormsForEntry(
  database: ProjectDatabase,
  entryId: string
): Promise<GlossaryFormRow[]> {
  return database.all<GlossaryFormRow>(
    `
      SELECT
        id,
        entry_id,
        surface,
        relation,
        warning_policy,
        match_boundary_start,
        match_boundary_end,
        allow_single_character_match,
        is_canonical,
        created_at,
        updated_at
      FROM glossary_forms
      WHERE entry_id = ?
      ORDER BY is_canonical DESC, surface COLLATE NOCASE, id
    `,
    [entryId]
  );
}

async function listFormsForEntries(
  database: ProjectDatabase,
  entryIds: string[]
): Promise<Map<string, GlossaryFormRow[]>> {
  const formsByEntryId = new Map<string, GlossaryFormRow[]>();

  for (const entryId of entryIds) {
    formsByEntryId.set(entryId, []);
  }

  if (entryIds.length === 0) {
    return formsByEntryId;
  }

  const placeholders = entryIds.map(() => "?").join(", ");
  const rows = await database.all<GlossaryFormRow>(
    `
      SELECT
        id,
        entry_id,
        surface,
        relation,
        warning_policy,
        match_boundary_start,
        match_boundary_end,
        allow_single_character_match,
        is_canonical,
        created_at,
        updated_at
      FROM glossary_forms
      WHERE entry_id IN (${placeholders})
      ORDER BY is_canonical DESC, surface COLLATE NOCASE, id
    `,
    entryIds
  );

  for (const row of rows) {
    const entryId = stringColumn(row.entry_id, "entry_id");
    formsByEntryId.get(entryId)?.push(row);
  }

  return formsByEntryId;
}

function entryRowFromSurfaceMatchRow(
  row: GlossarySurfaceMatchRow
): GlossaryEntryRow {
  return {
    id: row.entry_id,
    kind: row.entry_kind,
    description: row.entry_description,
    created_at: row.entry_created_at,
    updated_at: row.entry_updated_at
  };
}

function formRowFromSurfaceMatchRow(
  row: GlossarySurfaceMatchRow
): GlossaryFormRow {
  return {
    id: row.form_id,
    entry_id: row.form_entry_id,
    surface: row.form_surface,
    relation: row.form_relation,
    warning_policy: row.form_warning_policy,
    match_boundary_start: row.form_match_boundary_start,
    match_boundary_end: row.form_match_boundary_end,
    allow_single_character_match: row.form_allow_single_character_match,
    is_canonical: row.form_is_canonical,
    created_at: row.form_created_at,
    updated_at: row.form_updated_at
  };
}

async function listSurfaceMatchRows(
  database: ProjectDatabase,
  surface: string
): Promise<GlossarySurfaceMatchRow[]> {
  return database.all<GlossarySurfaceMatchRow>(
    `
      SELECT
        entries.id AS entry_id,
        entries.kind AS entry_kind,
        entries.description AS entry_description,
        entries.created_at AS entry_created_at,
        entries.updated_at AS entry_updated_at,
        forms.id AS form_id,
        forms.entry_id AS form_entry_id,
        forms.surface AS form_surface,
        forms.relation AS form_relation,
        forms.warning_policy AS form_warning_policy,
        forms.match_boundary_start AS form_match_boundary_start,
        forms.match_boundary_end AS form_match_boundary_end,
        forms.allow_single_character_match AS form_allow_single_character_match,
        forms.is_canonical AS form_is_canonical,
        forms.created_at AS form_created_at,
        forms.updated_at AS form_updated_at
      FROM glossary_forms AS forms
      JOIN glossary_entries AS entries
        ON entries.id = forms.entry_id
      WHERE forms.surface = ?
      ORDER BY forms.entry_id, forms.id
    `,
    [surface]
  );
}

export async function createGlossaryEntry(
  database: ProjectDatabase,
  input: CreateGlossaryEntryInput,
  logger: DbOperationLogger = getDebugLogger()
): Promise<GlossaryEntry> {
  const validatedInput = validateOrLogDbSkipped(
    logger,
    "create",
    "glossaryEntry",
    () => validateCreateGlossaryEntryInput(input)
  );
  const entryId = createUuidv7();
  const canonicalFormId = createUuidv7();
  const timestamp = nowTimestamp();

  return withDbOperationLog(
    {
      logger,
      dbOperation: "create",
      dbEntityKind: "glossaryEntry"
    },
    async () => {
      const entry = await database.transaction(async () => {
        await database.run(
          `
            INSERT INTO glossary_entries (
              id,
              kind,
              description,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?)
          `,
          [
            entryId,
            validatedInput.kind,
            validatedInput.description,
            timestamp,
            timestamp
          ]
        );
        await database.run(
          `
            INSERT INTO glossary_forms (
              id,
              entry_id,
              surface,
              relation,
              warning_policy,
              match_boundary_start,
              match_boundary_end,
              allow_single_character_match,
              is_canonical,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, 1, ?, ?)
          `,
          [
            canonicalFormId,
            entryId,
            validatedInput.canonicalSurface,
            validatedInput.matchBoundaryStart ??
              DEFAULT_GLOSSARY_FORM_MATCH_BOUNDARY,
            validatedInput.matchBoundaryEnd ??
              DEFAULT_GLOSSARY_FORM_MATCH_BOUNDARY,
            validatedInput.allowSingleCharacterMatch ? 1 : 0,
            timestamp,
            timestamp
          ]
        );

        const createdEntry = await readGlossaryEntryById(database, entryId);

        if (!createdEntry) {
          throw notFound(entryId);
        }

        return createdEntry;
      });

      return dbOperationResult(entry, 1);
    }
  );
}

async function readGlossaryEntryById(
  database: ProjectDatabase,
  id: string
): Promise<GlossaryEntry | null> {
  const row = await database.get<GlossaryEntryRow>(
    `
      SELECT
        id,
        kind,
        description,
        created_at,
        updated_at
      FROM glossary_entries
      WHERE id = ?
    `,
    [id]
  );

  if (!row) {
    return null;
  }

  const formRows = await listFormsForEntry(database, id);
  return glossaryEntryFromDatabaseRows(row, formRows);
}

export async function getGlossaryEntryById(
  database: ProjectDatabase,
  id: string,
  logger: DbOperationLogger = getDebugLogger()
): Promise<GlossaryEntry | null> {
  const validatedId = validateOrLogDbSkipped(
    logger,
    "read",
    "glossaryEntry",
    () => validateGlossaryEntryId(id)
  );

  return withDbOperationLog(
    {
      logger,
      dbOperation: "read",
      dbEntityKind: "glossaryEntry"
    },
    async () => {
      const entry = await readGlossaryEntryById(database, validatedId);

      return dbOperationResult(entry, entry ? 1 : 0);
    }
  );
}

async function readGlossaryEntries(
  database: ProjectDatabase
): Promise<GlossaryEntry[]> {
  const rows = await database.all<GlossaryEntryRow>(`
    SELECT
      entries.id,
      entries.kind,
      entries.description,
      entries.created_at,
      entries.updated_at
    FROM glossary_entries AS entries
    LEFT JOIN glossary_forms AS canonical_forms
      ON canonical_forms.entry_id = entries.id
      AND canonical_forms.is_canonical = 1
    ORDER BY canonical_forms.surface COLLATE NOCASE, entries.id
  `);
  const formsByEntryId = await listFormsForEntries(
    database,
    rows.map((row) => stringColumn(row.id, "id"))
  );

  return rows.map((row) =>
    glossaryEntryFromDatabaseRows(
      row,
      formsByEntryId.get(stringColumn(row.id, "id")) ?? []
    )
  );
}

export async function listGlossaryEntries(
  database: ProjectDatabase,
  logger: DbOperationLogger = getDebugLogger()
): Promise<GlossaryEntry[]> {
  return withDbOperationLog(
    {
      logger,
      dbOperation: "list",
      dbEntityKind: "glossaryEntry"
    },
    async () => {
      const entries = await readGlossaryEntries(database);

      return dbOperationResult(entries, entries.length);
    }
  );
}

export async function updateGlossaryEntry(
  database: ProjectDatabase,
  input: UpdateGlossaryEntryInput,
  logger: DbOperationLogger = getDebugLogger()
): Promise<GlossaryEntry> {
  const entry = validateOrLogDbSkipped(
    logger,
    "update",
    "glossaryEntry",
    () => validateUpdateGlossaryEntryInput(input)
  );
  const timestamp = nowTimestamp();

  return withDbOperationLog(
    {
      logger,
      dbOperation: "update",
      dbEntityKind: "glossaryEntry"
    },
    async () => {
      if (!(await readGlossaryEntryById(database, entry.id))) {
        skipDbOperation("not_found", notFound(entry.id));
      }

      const updatedEntry = await database.transaction(async () => {
        const entryResult = await database.run(
          `
            UPDATE glossary_entries
            SET
              kind = ?,
              description = ?,
              updated_at = ?
            WHERE id = ?
          `,
          [entry.kind, entry.description, timestamp, entry.id]
        );

        if (entryResult.changes === 0) {
          throw notFound(entry.id);
        }

        await database.run(
          `
            DELETE FROM glossary_forms
            WHERE entry_id = ?
              AND is_canonical = 0
          `,
          [entry.id]
        );

        const canonicalResult = await database.run(
          `
            UPDATE glossary_forms
            SET
              surface = ?,
              match_boundary_start = COALESCE(?, match_boundary_start),
              match_boundary_end = COALESCE(?, match_boundary_end),
              allow_single_character_match =
                COALESCE(?, allow_single_character_match),
              updated_at = ?
            WHERE entry_id = ?
              AND is_canonical = 1
          `,
          [
            entry.canonicalSurface,
            entry.matchBoundaryStart ?? null,
            entry.matchBoundaryEnd ?? null,
            entry.allowSingleCharacterMatch === undefined
              ? null
              : entry.allowSingleCharacterMatch
                ? 1
                : 0,
            timestamp,
            entry.id
          ]
        );

        if (canonicalResult.changes !== 1) {
          throw new GlossaryValidationError(
            "Glossary entry must contain exactly one canonical form."
          );
        }

        for (const form of entry.forms) {
          await database.run(
            `
              INSERT INTO glossary_forms (
                id,
                entry_id,
                surface,
                relation,
                warning_policy,
                match_boundary_start,
                match_boundary_end,
                allow_single_character_match,
                is_canonical,
                created_at,
                updated_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
            `,
            [
              form.id ?? createUuidv7(),
              entry.id,
              form.surface,
              form.relation,
              form.warningPolicy,
              form.matchBoundaryStart,
              form.matchBoundaryEnd,
              form.allowSingleCharacterMatch ? 1 : 0,
              timestamp,
              timestamp
            ]
          );
        }

        const updatedEntryResult = await readGlossaryEntryById(
          database,
          entry.id
        );

        if (!updatedEntryResult) {
          throw notFound(entry.id);
        }

        return updatedEntryResult;
      });

      return dbOperationResult(updatedEntry, 1);
    }
  );
}

export async function deleteGlossaryEntry(
  database: ProjectDatabase,
  id: string,
  logger: DbOperationLogger = getDebugLogger()
): Promise<void> {
  const validatedId = validateOrLogDbSkipped(
    logger,
    "delete",
    "glossaryEntry",
    () => validateGlossaryEntryId(id)
  );

  await withDbOperationLog(
    {
      logger,
      dbOperation: "delete",
      dbEntityKind: "glossaryEntry"
    },
    async () => {
      const result = await database.run(
        "DELETE FROM glossary_entries WHERE id = ?",
        [validatedId]
      );

      if (result.changes === 0) {
        throw notFound(validatedId);
      }

      return dbOperationResult(undefined, result.changes);
    }
  );
}

export async function lookupGlossarySurface(
  database: ProjectDatabase,
  input: GlossarySurfaceLookupInput,
  logger: DbOperationLogger = getDebugLogger()
): Promise<GlossarySurfaceLookupResult> {
  const { surface } = validateOrLogDbSkipped(
    logger,
    "read",
    "glossaryForm",
    () => validateGlossarySurfaceLookupInput(input)
  );

  return withDbOperationLog<GlossarySurfaceLookupResult>(
    {
      logger,
      dbOperation: "read",
      dbEntityKind: "glossaryForm"
    },
    async () => {
      const matchRows = await listSurfaceMatchRows(database, surface);

      if (matchRows.length === 0) {
        return dbOperationResult(
          {
            status: "none",
            surface
          },
          0
        );
      }

      const entryIds = Array.from(
        new Set(matchRows.map((row) => stringColumn(row.entry_id, "entry_id")))
      );
      const formsByEntryId = await listFormsForEntries(database, entryIds);
      const matches = matchRows.map((row) => {
        const entryId = stringColumn(row.entry_id, "entry_id");

        return {
          entry: glossaryEntryFromDatabaseRows(
            entryRowFromSurfaceMatchRow(row),
            formsByEntryId.get(entryId) ?? []
          ),
          form: glossaryFormFromDatabaseRow(formRowFromSurfaceMatchRow(row))
        };
      });

      if (matches.length === 1) {
        return dbOperationResult(
          {
            status: "unique",
            surface,
            match: matches[0]
          },
          matchRows.length
        );
      }

      return dbOperationResult(
        {
          status: "ambiguous",
          surface,
          matches
        },
        matchRows.length
      );
    }
  );
}
