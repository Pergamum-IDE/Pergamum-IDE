/**
 * #375 PoC: Glossary domain model.
 *
 * Breaking rewrite. `kind` is gone (an entry carries `0..n` tags instead of a
 * single classification). `GlossaryForm` (surface / relation / boundary
 * columns) is replaced by `GlossaryAtom` — an ordered value with an integer
 * `matchFlags` bitmask. Tags are a project-owned, many-to-many semantic layer
 * with hard delete only (no archive / system / soft-delete).
 *
 * No migration runner: this is a pre-0.9x PoC and the project DB schema is
 * recreated from {@link src/main/glossaryStore.ts}.
 */

import {
  GLOSSARY_ATOM_FLAGS_MASK,
  normalizeGlossaryAtomMatchFlags
} from "./glossaryAtomFlags";

export type GlossaryEntryId = string;
export type GlossaryAtomId = string;
export type GlossaryTagId = string;

/**
 * One authored value for an entry. `sortOrder` is `0..n-1`; the `sortOrder = 0`
 * atom is the entry's REPRESENTATIVE atom (the Glossary list's primary label).
 */
export interface GlossaryAtom {
  id: GlossaryAtomId;
  entryId: GlossaryEntryId;
  sortOrder: number;
  /** Non-empty, trimmed. */
  value: string;
  /** Integer bitmask — see `GlossaryAtomFlags`. */
  matchFlags: number;
  createdAt: string;
  updatedAt: string;
}

/** A project-owned semantic classification. Renameable, hard-deletable. */
export interface GlossaryTag {
  id: GlossaryTagId;
  /** Non-empty, trimmed. */
  label: string;
  description: string | null;
  /** Normalized lowercase `#rrggbb`. */
  backgroundRgb: string;
  /** Normalized lowercase `#rrggbb`. */
  foregroundRgb: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** `glossary_entry_tags` junction row. */
export interface GlossaryEntryTag {
  entryId: GlossaryEntryId;
  tagId: GlossaryTagId;
}

export interface GlossaryEntry {
  id: GlossaryEntryId;
  description: string;
  /** `1..n`, ordered by `sortOrder` ascending (index 0 is representative). */
  atoms: GlossaryAtom[];
  /** `0..n`, ordered by the tag's own `sortOrder`. */
  tags: GlossaryTag[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface GlossaryAtomInput {
  /** Present to keep an existing atom's identity across an update. */
  id?: GlossaryAtomId;
  value: string;
  matchFlags: number;
}

export interface CreateGlossaryEntryInput {
  description: string;
  /** `>= 1`; array order becomes `sortOrder`. */
  atoms: GlossaryAtomInput[];
  /** `0..n` existing tag ids. */
  tagIds: GlossaryTagId[];
}

export interface UpdateGlossaryEntryInput {
  id: GlossaryEntryId;
  description: string;
  /** `>= 1`; array order becomes `sortOrder` (re-packed `0..n-1` on save). */
  atoms: GlossaryAtomInput[];
  tagIds: GlossaryTagId[];
}

export interface CreateGlossaryTagInput {
  label: string;
  description: string | null;
  backgroundRgb: string;
  foregroundRgb: string;
}

export interface UpdateGlossaryTagInput {
  id: GlossaryTagId;
  label: string;
  description: string | null;
  backgroundRgb: string;
  foregroundRgb: string;
}

export interface DeleteGlossaryTagInput {
  id: GlossaryTagId;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export class GlossaryValidationError extends Error {
  readonly code = "GLOSSARY_VALIDATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "GlossaryValidationError";
  }
}

const uuidv7Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const rgbHexPattern = /^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

function invalidGlossary(message: string): never {
  throw new GlossaryValidationError(message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    invalidGlossary(`${path} must be a non-empty string.`);
  }

  return value;
}

function validateString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    invalidGlossary(`${path} must be a string.`);
  }

  return value;
}

function validateTimestamp(value: unknown, path: string): string {
  const timestamp = validateNonEmptyString(value, path);

  if (Number.isNaN(Date.parse(timestamp))) {
    invalidGlossary(`${path} must be a valid timestamp.`);
  }

  return timestamp;
}

function validateInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    invalidGlossary(`${path} must be a safe integer.`);
  }

  return value;
}

function validateNonNegativeInteger(value: unknown, path: string): number {
  const integer = validateInteger(value, path);

  if (integer < 0) {
    invalidGlossary(`${path} must be a non-negative integer.`);
  }

  return integer;
}

export function validateUuidv7(value: unknown, path = "id"): string {
  if (typeof value !== "string" || !uuidv7Pattern.test(value)) {
    invalidGlossary(`${path} must be a lowercase UUIDv7 string.`);
  }

  return value;
}

export function validateGlossaryEntryId(
  value: unknown,
  path = "id"
): GlossaryEntryId {
  return validateUuidv7(value, path);
}

export function validateGlossaryAtomId(
  value: unknown,
  path = "id"
): GlossaryAtomId {
  return validateUuidv7(value, path);
}

export function validateGlossaryTagId(
  value: unknown,
  path = "id"
): GlossaryTagId {
  return validateUuidv7(value, path);
}

/**
 * `matchFlags` on the wire / from the DB: a non-negative safe integer with
 * every bit outside the known layout dropped (see
 * {@link normalizeGlossaryAtomMatchFlags}). NaN / negative / fractional folds
 * to `0`.
 */
export function validateGlossaryMatchFlags(
  value: unknown,
  path = "matchFlags"
): number {
  if (typeof value !== "number") {
    invalidGlossary(`${path} must be a number.`);
  }

  return normalizeGlossaryAtomMatchFlags(value);
}

/** Normalize a `#RGB` / `#RRGGBB` (with or without `#`) to lowercase `#rrggbb`. */
export function normalizeGlossaryRgbHex(
  value: unknown,
  path = "color"
): string {
  if (typeof value !== "string" || !rgbHexPattern.test(value.trim())) {
    invalidGlossary(`${path} must be a #RRGGBB or #RGB hex color.`);
  }

  const hex = value.trim().replace(/^#/, "").toLowerCase();
  const expanded =
    hex.length === 3
      ? hex
          .split("")
          .map((character) => character + character)
          .join("")
      : hex;

  return `#${expanded}`;
}

export function validateGlossaryAtom(
  value: unknown,
  path = "atom"
): GlossaryAtom {
  if (!isObject(value)) {
    invalidGlossary(`${path} must be an object.`);
  }

  return {
    id: validateGlossaryAtomId(value.id, `${path}.id`),
    entryId: validateGlossaryEntryId(value.entryId, `${path}.entryId`),
    sortOrder: validateNonNegativeInteger(
      value.sortOrder,
      `${path}.sortOrder`
    ),
    value: validateGlossaryAtomValue(value.value, `${path}.value`),
    matchFlags: validateGlossaryMatchFlags(
      value.matchFlags,
      `${path}.matchFlags`
    ),
    createdAt: validateTimestamp(value.createdAt, `${path}.createdAt`),
    updatedAt: validateTimestamp(value.updatedAt, `${path}.updatedAt`)
  };
}

function validateGlossaryAtomValue(value: unknown, path: string): string {
  const trimmed = validateNonEmptyString(value, path).trim();

  if (trimmed.length === 0) {
    invalidGlossary(`${path} must not be blank.`);
  }

  return trimmed;
}

function validateGlossaryTagDescription(
  value: unknown,
  path: string
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const description = validateString(value, path);

  return description.trim().length === 0 ? null : description;
}

export function validateGlossaryTag(
  value: unknown,
  path = "tag"
): GlossaryTag {
  if (!isObject(value)) {
    invalidGlossary(`${path} must be an object.`);
  }

  return {
    id: validateGlossaryTagId(value.id, `${path}.id`),
    label: validateNonEmptyString(value.label, `${path}.label`).trim(),
    description: validateGlossaryTagDescription(
      value.description,
      `${path}.description`
    ),
    backgroundRgb: normalizeGlossaryRgbHex(
      value.backgroundRgb,
      `${path}.backgroundRgb`
    ),
    foregroundRgb: normalizeGlossaryRgbHex(
      value.foregroundRgb,
      `${path}.foregroundRgb`
    ),
    sortOrder: validateInteger(value.sortOrder, `${path}.sortOrder`),
    createdAt: validateTimestamp(value.createdAt, `${path}.createdAt`),
    updatedAt: validateTimestamp(value.updatedAt, `${path}.updatedAt`)
  };
}

function assertRepresentativeAtomOrdering(
  atoms: readonly GlossaryAtom[],
  path: string
): void {
  if (atoms.length === 0) {
    invalidGlossary(`${path} must contain at least one atom.`);
  }

  atoms.forEach((atom, index) => {
    if (atom.sortOrder !== index) {
      invalidGlossary(
        `${path}[${index}].sortOrder must be ${index} (atoms are packed 0..n-1).`
      );
    }
  });
}

function assertNoDuplicateAtomValues(
  values: readonly { path: string; value: string }[]
): void {
  const seen = new Set<string>();

  for (const { path, value } of values) {
    const key = value.trim();

    if (seen.has(key)) {
      invalidGlossary(`${path} duplicates another atom value in the entry.`);
    }

    seen.add(key);
  }
}

export function validateGlossaryEntry(
  value: unknown,
  path = "entry"
): GlossaryEntry {
  if (!isObject(value)) {
    invalidGlossary(`${path} must be an object.`);
  }

  if (!Array.isArray(value.atoms)) {
    invalidGlossary(`${path}.atoms must be an array.`);
  }

  if (!Array.isArray(value.tags)) {
    invalidGlossary(`${path}.tags must be an array.`);
  }

  const id = validateGlossaryEntryId(value.id, `${path}.id`);
  const atoms = value.atoms.map((atom, index) =>
    validateGlossaryAtom(atom, `${path}.atoms[${index}]`)
  );

  assertRepresentativeAtomOrdering(atoms, `${path}.atoms`);

  for (const atom of atoms) {
    if (atom.entryId !== id) {
      invalidGlossary(`${path}.atoms must belong to ${path}.id.`);
    }
  }

  assertNoDuplicateAtomValues(
    atoms.map((atom, index) => ({
      path: `${path}.atoms[${index}].value`,
      value: atom.value
    }))
  );

  const tags = value.tags.map((tag, index) =>
    validateGlossaryTag(tag, `${path}.tags[${index}]`)
  );

  return {
    id,
    description: validateString(value.description, `${path}.description`),
    atoms,
    tags,
    createdAt: validateTimestamp(value.createdAt, `${path}.createdAt`),
    updatedAt: validateTimestamp(value.updatedAt, `${path}.updatedAt`)
  };
}

function validateGlossaryAtomInput(
  value: unknown,
  path: string
): GlossaryAtomInput {
  if (!isObject(value)) {
    invalidGlossary(`${path} must be an object.`);
  }

  const atomValue = validateGlossaryAtomValue(value.value, `${path}.value`);
  const matchFlags = validateGlossaryMatchFlags(
    value.matchFlags,
    `${path}.matchFlags`
  );

  if (value.id === undefined) {
    return { value: atomValue, matchFlags };
  }

  return {
    id: validateGlossaryAtomId(value.id, `${path}.id`),
    value: atomValue,
    matchFlags
  };
}

function validateGlossaryAtomInputs(
  value: readonly unknown[],
  path: string
): GlossaryAtomInput[] {
  const atoms = value.map((atom, index) =>
    validateGlossaryAtomInput(atom, `${path}[${index}]`)
  );

  if (atoms.length === 0) {
    invalidGlossary(`${path} must contain at least one atom.`);
  }

  assertNoDuplicateAtomValues(
    atoms.map((atom, index) => ({
      path: `${path}[${index}].value`,
      value: atom.value
    }))
  );

  return atoms;
}

function validateGlossaryTagIds(
  value: readonly unknown[],
  path: string
): GlossaryTagId[] {
  const tagIds = value.map((tagId, index) =>
    validateGlossaryTagId(tagId, `${path}[${index}]`)
  );
  const seen = new Set<string>();

  for (const tagId of tagIds) {
    if (seen.has(tagId)) {
      invalidGlossary(`${path} contains a duplicate tag id.`);
    }

    seen.add(tagId);
  }

  return tagIds;
}

export function validateCreateGlossaryEntryInput(
  value: unknown
): CreateGlossaryEntryInput {
  if (!isObject(value)) {
    invalidGlossary("Glossary entry input must be an object.");
  }

  if (!Array.isArray(value.atoms)) {
    invalidGlossary("atoms must be an array.");
  }

  if (!Array.isArray(value.tagIds)) {
    invalidGlossary("tagIds must be an array.");
  }

  return {
    description: validateString(value.description, "description"),
    atoms: validateGlossaryAtomInputs(value.atoms, "atoms"),
    tagIds: validateGlossaryTagIds(value.tagIds, "tagIds")
  };
}

export function validateUpdateGlossaryEntryInput(
  value: unknown
): UpdateGlossaryEntryInput {
  if (!isObject(value)) {
    invalidGlossary("Glossary entry input must be an object.");
  }

  if (!Array.isArray(value.atoms)) {
    invalidGlossary("atoms must be an array.");
  }

  if (!Array.isArray(value.tagIds)) {
    invalidGlossary("tagIds must be an array.");
  }

  return {
    id: validateGlossaryEntryId(value.id, "id"),
    description: validateString(value.description, "description"),
    atoms: validateGlossaryAtomInputs(value.atoms, "atoms"),
    tagIds: validateGlossaryTagIds(value.tagIds, "tagIds")
  };
}

export function validateCreateGlossaryTagInput(
  value: unknown
): CreateGlossaryTagInput {
  if (!isObject(value)) {
    invalidGlossary("Glossary tag input must be an object.");
  }

  return {
    label: validateNonEmptyString(value.label, "label").trim(),
    description: validateGlossaryTagDescription(
      value.description,
      "description"
    ),
    backgroundRgb: normalizeGlossaryRgbHex(
      value.backgroundRgb,
      "backgroundRgb"
    ),
    foregroundRgb: normalizeGlossaryRgbHex(
      value.foregroundRgb,
      "foregroundRgb"
    )
  };
}

export function validateUpdateGlossaryTagInput(
  value: unknown
): UpdateGlossaryTagInput {
  if (!isObject(value)) {
    invalidGlossary("Glossary tag input must be an object.");
  }

  return {
    id: validateGlossaryTagId(value.id, "id"),
    label: validateNonEmptyString(value.label, "label").trim(),
    description: validateGlossaryTagDescription(
      value.description,
      "description"
    ),
    backgroundRgb: normalizeGlossaryRgbHex(
      value.backgroundRgb,
      "backgroundRgb"
    ),
    foregroundRgb: normalizeGlossaryRgbHex(
      value.foregroundRgb,
      "foregroundRgb"
    )
  };
}

export function validateDeleteGlossaryTagInput(
  value: unknown
): DeleteGlossaryTagInput {
  if (!isObject(value)) {
    invalidGlossary("Glossary tag delete input must be an object.");
  }

  return {
    id: validateGlossaryTagId(value.id, "id")
  };
}

/**
 * #375: the ordered tag-id list for `reorderGlossaryTags`. Every entry must be
 * a well-formed tag id and no id may repeat. Whether the list covers exactly
 * the project's current tag set (no missing / unknown / extra ids) is checked
 * by the store, which needs the database.
 */
export function validateReorderGlossaryTagIds(
  value: unknown
): GlossaryTagId[] {
  if (!Array.isArray(value)) {
    invalidGlossary("tagIdsInOrder must be an array of tag ids.");
  }

  return validateGlossaryTagIds(value, "tagIdsInOrder");
}

// ---------------------------------------------------------------------------
// Derivations
// ---------------------------------------------------------------------------

/** The `sortOrder = 0` atom — the entry's primary label in the Glossary list. */
export function representativeGlossaryAtom(
  entry: Pick<GlossaryEntry, "atoms">
): GlossaryAtom | null {
  return (
    entry.atoms.find((atom) => atom.sortOrder === 0) ?? entry.atoms[0] ?? null
  );
}

/** The non-representative atoms, in `sortOrder` order. */
export function nonRepresentativeGlossaryAtoms(
  entry: Pick<GlossaryEntry, "atoms">
): GlossaryAtom[] {
  const representative = representativeGlossaryAtom(entry);

  return entry.atoms.filter((atom) => atom !== representative);
}

export const GLOSSARY_ATOM_MATCH_FLAGS_MASK = GLOSSARY_ATOM_FLAGS_MASK;
