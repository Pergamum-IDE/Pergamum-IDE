/**
 * #375 PoC: Glossary persistence over the four-table schema
 * (`glossary_entries` / `glossary_atoms` / `glossary_tags` /
 * `glossary_entry_tags`). No migration runner — the schema is recreated from
 * {@link src/main/projectDatabase.ts}.
 */

import {
  GlossaryValidationError,
  validateCreateGlossaryEntryInput,
  validateCreateGlossaryTagInput,
  validateDeleteGlossaryTagInput,
  validateGlossaryAtom,
  validateGlossaryEntry,
  validateGlossaryEntryId,
  validateGlossaryTag,
  validateGlossaryTagId,
  validateReorderGlossaryTagIds,
  validateUpdateGlossaryEntryInput,
  validateUpdateGlossaryTagInput,
  type CreateGlossaryEntryInput,
  type CreateGlossaryTagInput,
  type DeleteGlossaryTagInput,
  type GlossaryAtom,
  type GlossaryEntry,
  type GlossaryTag,
  type UpdateGlossaryEntryInput,
  type UpdateGlossaryTagInput
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

export type GlossaryStoreErrorCode =
  | "GLOSSARY_ENTRY_NOT_FOUND"
  | "GLOSSARY_TAG_NOT_FOUND"
  | "GLOSSARY_TAG_LABEL_CONFLICT"
  | "GLOSSARY_TAG_REORDER_MISMATCH";

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
  description: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface GlossaryAtomRow extends Record<string, unknown> {
  id: unknown;
  entry_id: unknown;
  sort_order: unknown;
  value: unknown;
  match_flags: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface GlossaryTagRow extends Record<string, unknown> {
  id: unknown;
  label: unknown;
  description: unknown;
  background_rgb: unknown;
  foreground_rgb: unknown;
  sort_order: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface EntryTagLinkRow extends Record<string, unknown> {
  entry_id: unknown;
  tag_id: unknown;
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
  return value === null ? null : stringColumn(value, column);
}

function integerColumn(value: unknown, column: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    invalidDatabaseRow(`${column} must be an integer.`);
  }

  return value;
}

function nowTimestamp(): string {
  return new Date().toISOString();
}

function entryNotFound(id: string): GlossaryStoreError {
  return new GlossaryStoreError(
    "GLOSSARY_ENTRY_NOT_FOUND",
    `Glossary entry not found: ${id}`
  );
}

function tagNotFound(id: string): GlossaryStoreError {
  return new GlossaryStoreError(
    "GLOSSARY_TAG_NOT_FOUND",
    `Glossary tag not found: ${id}`
  );
}

function tagLabelConflict(label: string): GlossaryStoreError {
  return new GlossaryStoreError(
    "GLOSSARY_TAG_LABEL_CONFLICT",
    `A glossary tag with the label "${label}" already exists.`
  );
}

function tagReorderMismatch(message: string): GlossaryStoreError {
  return new GlossaryStoreError("GLOSSARY_TAG_REORDER_MISMATCH", message);
}

/**
 * #375: `tagIdsInOrder` must be a permutation of the project's current tag ids
 * — same count, same members. Duplicates are already rejected by the shared
 * validator, so equal size + every id known ⟹ a true permutation. Raised
 * OUTSIDE any `database.transaction(...)` wrapper (which would collapse it to a
 * generic transaction error).
 */
function assertGlossaryTagReorderCoversEveryTag(
  currentTagIds: readonly string[],
  requestedTagIds: readonly string[]
): void {
  if (requestedTagIds.length !== currentTagIds.length) {
    throw tagReorderMismatch(
      `Glossary tag reorder must list every tag exactly once ` +
        `(have ${currentTagIds.length}, got ${requestedTagIds.length}).`
    );
  }

  const current = new Set(currentTagIds);
  const unknownId = requestedTagIds.find((id) => !current.has(id));

  if (unknownId !== undefined) {
    throw tagReorderMismatch(
      `Glossary tag reorder references an unknown tag: ${unknownId}`
    );
  }
}

/**
 * #375: reject a tag label already used by another tag. Trimmed, case
 * sensitive — the input is already trimmed by the shared validators, so this
 * is a plain equality check that the DB `glossary_tags_label_unique` index
 * also enforces. Raised OUTSIDE any `database.transaction(...)` wrapper (which
 * would re-wrap it as a transaction error).
 */
async function assertGlossaryTagLabelAvailable(
  database: ProjectDatabase,
  label: string,
  excludeTagId: string | null
): Promise<void> {
  const rows = await database.all<{ id: unknown }>(
    "SELECT id FROM glossary_tags WHERE label = ?",
    [label]
  );
  const conflict = rows
    .map((row) => stringColumn(row.id, "id"))
    .some((id) => id !== excludeTagId);

  if (conflict) {
    throw tagLabelConflict(label);
  }
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

// ---------------------------------------------------------------------------
// Row → domain
// ---------------------------------------------------------------------------

export function glossaryAtomFromDatabaseRow(row: GlossaryAtomRow): GlossaryAtom {
  return validateGlossaryAtom({
    id: stringColumn(row.id, "id"),
    entryId: stringColumn(row.entry_id, "entry_id"),
    sortOrder: integerColumn(row.sort_order, "sort_order"),
    value: stringColumn(row.value, "value"),
    matchFlags: integerColumn(row.match_flags, "match_flags"),
    createdAt: stringColumn(row.created_at, "created_at"),
    updatedAt: stringColumn(row.updated_at, "updated_at")
  });
}

export function glossaryTagFromDatabaseRow(row: GlossaryTagRow): GlossaryTag {
  return validateGlossaryTag({
    id: stringColumn(row.id, "id"),
    label: stringColumn(row.label, "label"),
    description: nullableStringColumn(row.description, "description"),
    backgroundRgb: stringColumn(row.background_rgb, "background_rgb"),
    foregroundRgb: stringColumn(row.foreground_rgb, "foreground_rgb"),
    sortOrder: integerColumn(row.sort_order, "sort_order"),
    createdAt: stringColumn(row.created_at, "created_at"),
    updatedAt: stringColumn(row.updated_at, "updated_at")
  });
}

export function glossaryEntryFromDatabaseRows(
  entryRow: GlossaryEntryRow,
  atomRows: GlossaryAtomRow[],
  tagRows: GlossaryTagRow[]
): GlossaryEntry {
  return validateGlossaryEntry({
    id: stringColumn(entryRow.id, "id"),
    description: stringColumn(entryRow.description, "description"),
    atoms: atomRows.map(glossaryAtomFromDatabaseRow),
    tags: tagRows.map(glossaryTagFromDatabaseRow),
    createdAt: stringColumn(entryRow.created_at, "created_at"),
    updatedAt: stringColumn(entryRow.updated_at, "updated_at")
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const ATOM_COLUMNS = `
  id,
  entry_id,
  sort_order,
  value,
  match_flags,
  created_at,
  updated_at
`;

const TAG_COLUMNS = `
  id,
  label,
  description,
  background_rgb,
  foreground_rgb,
  sort_order,
  created_at,
  updated_at
`;

async function atomsByEntryId(
  database: ProjectDatabase,
  entryIds: string[]
): Promise<Map<string, GlossaryAtomRow[]>> {
  const byEntryId = new Map<string, GlossaryAtomRow[]>();

  for (const entryId of entryIds) {
    byEntryId.set(entryId, []);
  }

  if (entryIds.length === 0) {
    return byEntryId;
  }

  const placeholders = entryIds.map(() => "?").join(", ");
  const rows = await database.all<GlossaryAtomRow>(
    `
      SELECT ${ATOM_COLUMNS}
      FROM glossary_atoms
      WHERE entry_id IN (${placeholders})
      ORDER BY entry_id, sort_order
    `,
    entryIds
  );

  for (const row of rows) {
    byEntryId.get(stringColumn(row.entry_id, "entry_id"))?.push(row);
  }

  return byEntryId;
}

async function tagsByEntryId(
  database: ProjectDatabase,
  entryIds: string[]
): Promise<Map<string, GlossaryTagRow[]>> {
  const byEntryId = new Map<string, GlossaryTagRow[]>();

  for (const entryId of entryIds) {
    byEntryId.set(entryId, []);
  }

  if (entryIds.length === 0) {
    return byEntryId;
  }

  const placeholders = entryIds.map(() => "?").join(", ");
  const rows = await database.all<GlossaryTagRow & { link_entry_id: unknown }>(
    `
      SELECT
        links.entry_id AS link_entry_id,
        tags.id AS id,
        tags.label AS label,
        tags.description AS description,
        tags.background_rgb AS background_rgb,
        tags.foreground_rgb AS foreground_rgb,
        tags.sort_order AS sort_order,
        tags.created_at AS created_at,
        tags.updated_at AS updated_at
      FROM glossary_entry_tags AS links
      JOIN glossary_tags AS tags ON tags.id = links.tag_id
      WHERE links.entry_id IN (${placeholders})
      -- #375: entry-local ASSIGNMENT order first (index 0 = primary tag). The
      -- project-wide tags.sort_order is only a same-value fallback (the
      -- assignment order is unique within an entry).
      ORDER BY links.entry_id, links.sort_order, tags.sort_order, tags.id
    `,
    entryIds
  );

  for (const row of rows) {
    byEntryId
      .get(stringColumn(row.link_entry_id, "link_entry_id"))
      ?.push(row);
  }

  return byEntryId;
}

async function readGlossaryEntryById(
  database: ProjectDatabase,
  id: string
): Promise<GlossaryEntry | null> {
  const entryRow = await database.get<GlossaryEntryRow>(
    `
      SELECT id, description, created_at, updated_at
      FROM glossary_entries
      WHERE id = ?
    `,
    [id]
  );

  if (!entryRow) {
    return null;
  }

  const [atomRows, tagRows] = await Promise.all([
    atomsByEntryId(database, [id]),
    tagsByEntryId(database, [id])
  ]);

  return glossaryEntryFromDatabaseRows(
    entryRow,
    atomRows.get(id) ?? [],
    tagRows.get(id) ?? []
  );
}

async function readGlossaryEntries(
  database: ProjectDatabase
): Promise<GlossaryEntry[]> {
  const entryRows = await database.all<GlossaryEntryRow>(`
    SELECT
      entries.id,
      entries.description,
      entries.created_at,
      entries.updated_at
    FROM glossary_entries AS entries
    LEFT JOIN glossary_atoms AS representative
      ON representative.entry_id = entries.id
      AND representative.sort_order = 0
    ORDER BY representative.value COLLATE NOCASE, entries.id
  `);
  const entryIds = entryRows.map((row) => stringColumn(row.id, "id"));
  const [atomRows, tagRows] = await Promise.all([
    atomsByEntryId(database, entryIds),
    tagsByEntryId(database, entryIds)
  ]);

  return entryRows.map((entryRow) => {
    const id = stringColumn(entryRow.id, "id");

    return glossaryEntryFromDatabaseRows(
      entryRow,
      atomRows.get(id) ?? [],
      tagRows.get(id) ?? []
    );
  });
}

// ---------------------------------------------------------------------------
// Writes — entries
// ---------------------------------------------------------------------------

async function assertReferencedTagsExist(
  database: ProjectDatabase,
  tagIds: string[]
): Promise<void> {
  if (tagIds.length === 0) {
    return;
  }

  const placeholders = tagIds.map(() => "?").join(", ");
  const rows = await database.all<{ id: unknown }>(
    `SELECT id FROM glossary_tags WHERE id IN (${placeholders})`,
    tagIds
  );
  const found = new Set(rows.map((row) => stringColumn(row.id, "id")));
  const missing = tagIds.find((tagId) => !found.has(tagId));

  if (missing) {
    skipDbOperation("not_found", tagNotFound(missing));
  }
}

async function writeEntryAtomsAndTags(
  database: ProjectDatabase,
  entryId: string,
  input: CreateGlossaryEntryInput | UpdateGlossaryEntryInput,
  timestamp: string
): Promise<void> {
  await database.run(`DELETE FROM glossary_atoms WHERE entry_id = ?`, [
    entryId
  ]);
  await database.run(`DELETE FROM glossary_entry_tags WHERE entry_id = ?`, [
    entryId
  ]);

  // Atoms are re-packed to sort_order 0..n-1 in the given order.
  for (let sortOrder = 0; sortOrder < input.atoms.length; sortOrder += 1) {
    const atom = input.atoms[sortOrder];

    await database.run(
      `
        INSERT INTO glossary_atoms (
          id, entry_id, sort_order, value, match_flags, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        atom.id ?? createUuidv7(),
        entryId,
        sortOrder,
        atom.value,
        atom.matchFlags,
        timestamp,
        timestamp
      ]
    );
  }

  // #375: tag assignments are re-packed to sort_order 0..n-1 in the given
  // tagIds order (index 0 is the entry's PRIMARY tag). This is the entry-local
  // assignment order — never `glossary_tags.sort_order` (the project-wide one).
  for (let sortOrder = 0; sortOrder < input.tagIds.length; sortOrder += 1) {
    await database.run(
      `
        INSERT INTO glossary_entry_tags (entry_id, tag_id, sort_order)
        VALUES (?, ?, ?)
      `,
      [entryId, input.tagIds[sortOrder], sortOrder]
    );
  }
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
  const timestamp = nowTimestamp();

  return withDbOperationLog(
    { logger, dbOperation: "create", dbEntityKind: "glossaryEntry" },
    async () => {
      await assertReferencedTagsExist(database, validatedInput.tagIds);

      const entry = await database.transaction(async () => {
        await database.run(
          `
            INSERT INTO glossary_entries (id, description, created_at, updated_at)
            VALUES (?, ?, ?, ?)
          `,
          [entryId, validatedInput.description, timestamp, timestamp]
        );

        await writeEntryAtomsAndTags(
          database,
          entryId,
          validatedInput,
          timestamp
        );

        const created = await readGlossaryEntryById(database, entryId);

        if (!created) {
          throw entryNotFound(entryId);
        }

        return created;
      });

      return dbOperationResult(entry, 1);
    }
  );
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
    { logger, dbOperation: "read", dbEntityKind: "glossaryEntry" },
    async () => {
      const entry = await readGlossaryEntryById(database, validatedId);

      return dbOperationResult(entry, entry ? 1 : 0);
    }
  );
}

export async function listGlossaryEntries(
  database: ProjectDatabase,
  logger: DbOperationLogger = getDebugLogger()
): Promise<GlossaryEntry[]> {
  return withDbOperationLog(
    { logger, dbOperation: "list", dbEntityKind: "glossaryEntry" },
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
  const validatedInput = validateOrLogDbSkipped(
    logger,
    "update",
    "glossaryEntry",
    () => validateUpdateGlossaryEntryInput(input)
  );
  const timestamp = nowTimestamp();

  return withDbOperationLog(
    { logger, dbOperation: "update", dbEntityKind: "glossaryEntry" },
    async () => {
      if (!(await readGlossaryEntryById(database, validatedInput.id))) {
        skipDbOperation("not_found", entryNotFound(validatedInput.id));
      }

      await assertReferencedTagsExist(database, validatedInput.tagIds);

      const updated = await database.transaction(async () => {
        const entryResult = await database.run(
          `
            UPDATE glossary_entries
            SET description = ?, updated_at = ?
            WHERE id = ?
          `,
          [validatedInput.description, timestamp, validatedInput.id]
        );

        if (entryResult.changes === 0) {
          throw entryNotFound(validatedInput.id);
        }

        await writeEntryAtomsAndTags(
          database,
          validatedInput.id,
          validatedInput,
          timestamp
        );

        const result = await readGlossaryEntryById(
          database,
          validatedInput.id
        );

        if (!result) {
          throw entryNotFound(validatedInput.id);
        }

        return result;
      });

      return dbOperationResult(updated, 1);
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
    { logger, dbOperation: "delete", dbEntityKind: "glossaryEntry" },
    async () => {
      const result = await database.run(
        "DELETE FROM glossary_entries WHERE id = ?",
        [validatedId]
      );

      if (result.changes === 0) {
        throw entryNotFound(validatedId);
      }

      return dbOperationResult(undefined, result.changes);
    }
  );
}

// ---------------------------------------------------------------------------
// Writes — tags
// ---------------------------------------------------------------------------

async function readGlossaryTagById(
  database: ProjectDatabase,
  id: string
): Promise<GlossaryTag | null> {
  const row = await database.get<GlossaryTagRow>(
    `SELECT ${TAG_COLUMNS} FROM glossary_tags WHERE id = ?`,
    [id]
  );

  return row ? glossaryTagFromDatabaseRow(row) : null;
}

export async function listGlossaryTags(
  database: ProjectDatabase,
  logger: DbOperationLogger = getDebugLogger()
): Promise<GlossaryTag[]> {
  return withDbOperationLog(
    { logger, dbOperation: "list", dbEntityKind: "glossaryTag" },
    async () => {
      const rows = await database.all<GlossaryTagRow>(`
        SELECT ${TAG_COLUMNS}
        FROM glossary_tags
        ORDER BY sort_order, id
      `);
      const tags = rows.map(glossaryTagFromDatabaseRow);

      return dbOperationResult(tags, tags.length);
    }
  );
}

export async function createGlossaryTag(
  database: ProjectDatabase,
  input: CreateGlossaryTagInput,
  logger: DbOperationLogger = getDebugLogger()
): Promise<GlossaryTag> {
  const validatedInput = validateOrLogDbSkipped(
    logger,
    "create",
    "glossaryTag",
    () => validateCreateGlossaryTagInput(input)
  );
  const tagId = createUuidv7();
  const timestamp = nowTimestamp();

  await assertGlossaryTagLabelAvailable(database, validatedInput.label, null);

  return withDbOperationLog(
    { logger, dbOperation: "create", dbEntityKind: "glossaryTag" },
    async () => {
      const tag = await database.transaction(async () => {
        const sortRow = await database.get<{ next_sort_order: unknown }>(
          `
            SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order
            FROM glossary_tags
          `
        );
        const sortOrder = integerColumn(
          sortRow?.next_sort_order ?? 0,
          "next_sort_order"
        );

        await database.run(
          `
            INSERT INTO glossary_tags (
              id, label, description, background_rgb, foreground_rgb,
              sort_order, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            tagId,
            validatedInput.label,
            validatedInput.description,
            validatedInput.backgroundRgb,
            validatedInput.foregroundRgb,
            sortOrder,
            timestamp,
            timestamp
          ]
        );

        const created = await readGlossaryTagById(database, tagId);

        if (!created) {
          throw tagNotFound(tagId);
        }

        return created;
      });

      return dbOperationResult(tag, 1);
    }
  );
}

export async function updateGlossaryTag(
  database: ProjectDatabase,
  input: UpdateGlossaryTagInput,
  logger: DbOperationLogger = getDebugLogger()
): Promise<GlossaryTag> {
  const validatedInput = validateOrLogDbSkipped(
    logger,
    "update",
    "glossaryTag",
    () => validateUpdateGlossaryTagInput(input)
  );
  const timestamp = nowTimestamp();

  await assertGlossaryTagLabelAvailable(
    database,
    validatedInput.label,
    validatedInput.id
  );

  return withDbOperationLog(
    { logger, dbOperation: "update", dbEntityKind: "glossaryTag" },
    async () => {
      const result = await database.run(
        `
          UPDATE glossary_tags
          SET label = ?, description = ?, background_rgb = ?,
              foreground_rgb = ?, updated_at = ?
          WHERE id = ?
        `,
        [
          validatedInput.label,
          validatedInput.description,
          validatedInput.backgroundRgb,
          validatedInput.foregroundRgb,
          timestamp,
          validatedInput.id
        ]
      );

      if (result.changes === 0) {
        skipDbOperation("not_found", tagNotFound(validatedInput.id));
      }

      const tag = await readGlossaryTagById(database, validatedInput.id);

      if (!tag) {
        throw tagNotFound(validatedInput.id);
      }

      return dbOperationResult(tag, 1);
    }
  );
}

/**
 * #375: persist a new tag order. `tagIdsInOrder` must list every project tag
 * exactly once; `sort_order` is re-packed to `0..n-1` in that order and the
 * re-sorted list is returned. Label / description / color and every
 * `glossary_entry_tags` link are untouched, and `updated_at` is deliberately
 * NOT bumped — a reorder is a positional change, and the Tag Manager surfaces
 * `updated_at` as the "last edited" date.
 */
export async function reorderGlossaryTags(
  database: ProjectDatabase,
  tagIdsInOrder: readonly string[],
  logger: DbOperationLogger = getDebugLogger()
): Promise<GlossaryTag[]> {
  const validatedIds = validateOrLogDbSkipped(
    logger,
    "update",
    "glossaryTag",
    () => validateReorderGlossaryTagIds(tagIdsInOrder)
  );

  // Outside the transaction so a meaningful mismatch error survives.
  const currentTagIds = (
    await database.all<{ id: unknown }>("SELECT id FROM glossary_tags")
  ).map((row) => stringColumn(row.id, "id"));

  assertGlossaryTagReorderCoversEveryTag(currentTagIds, validatedIds);

  return withDbOperationLog(
    { logger, dbOperation: "update", dbEntityKind: "glossaryTag" },
    async () => {
      const tags = await database.transaction(async () => {
        for (let index = 0; index < validatedIds.length; index += 1) {
          await database.run(
            "UPDATE glossary_tags SET sort_order = ? WHERE id = ?",
            [index, validatedIds[index]]
          );
        }

        const rows = await database.all<GlossaryTagRow>(`
          SELECT ${TAG_COLUMNS}
          FROM glossary_tags
          ORDER BY sort_order, id
        `);

        return rows.map(glossaryTagFromDatabaseRow);
      });

      return dbOperationResult(tags, tags.length);
    }
  );
}

export async function deleteGlossaryTag(
  database: ProjectDatabase,
  input: DeleteGlossaryTagInput,
  logger: DbOperationLogger = getDebugLogger()
): Promise<void> {
  const validatedInput = validateOrLogDbSkipped(
    logger,
    "delete",
    "glossaryTag",
    () => validateDeleteGlossaryTagInput(input)
  );

  await withDbOperationLog(
    { logger, dbOperation: "delete", dbEntityKind: "glossaryTag" },
    async () => {
      // Hard delete. The FK cascade removes `glossary_entry_tags` rows only —
      // entries and atoms are untouched, which may leave tag-less entries.
      const result = await database.run(
        "DELETE FROM glossary_tags WHERE id = ?",
        [validatedInput.id]
      );

      if (result.changes === 0) {
        throw tagNotFound(validatedInput.id);
      }

      return dbOperationResult(undefined, result.changes);
    }
  );
}
