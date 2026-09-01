export const glossaryEntryKinds = [
  "term",
  "person",
  "place",
  "organization",
  "item",
  "concept"
] as const;

export const glossaryFormRelations = ["variant", "alias"] as const;

export const glossaryWarningPolicies = [
  "default",
  "ignore",
  "warn"
] as const;

export const glossaryFormMatchBoundaries = [
  "auto",
  "strict",
  "none"
] as const;

// auto is a dispatcher input for the future boundary resolver.
// It is not a third boundary checking algorithm.
export const DEFAULT_GLOSSARY_FORM_MATCH_BOUNDARY = "auto" as const;

export type GlossaryEntryKind = (typeof glossaryEntryKinds)[number];
export type GlossaryFormRelation = (typeof glossaryFormRelations)[number];
export type GlossaryWarningPolicy =
  (typeof glossaryWarningPolicies)[number];
export type GlossaryFormMatchBoundary =
  (typeof glossaryFormMatchBoundaries)[number];

export type GlossaryEntryId = string;
export type GlossaryFormId = string;

interface BaseGlossaryForm {
  id: GlossaryFormId;
  entryId: GlossaryEntryId;
  surface: string;
  matchBoundaryStart: GlossaryFormMatchBoundary;
  matchBoundaryEnd: GlossaryFormMatchBoundary;
  /**
   * #365: opt-in for this form only. When `false` (the default), a trimmed
   * surface that is a single Unicode code point is never indexed/matched
   * (false-positive guard). When `true`, this form is matched even at
   * one code point long. `matchBoundaryStart` / `matchBoundaryEnd` remain
   * boundary-only and are not used to express this opt-in.
   */
  allowSingleCharacterMatch: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GlossaryCanonicalForm extends BaseGlossaryForm {
  relation: null;
  warningPolicy: null;
  isCanonical: true;
}

export interface GlossaryNonCanonicalForm extends BaseGlossaryForm {
  relation: GlossaryFormRelation;
  warningPolicy: GlossaryWarningPolicy;
  isCanonical: false;
}

export type GlossaryForm =
  | GlossaryCanonicalForm
  | GlossaryNonCanonicalForm;

export interface GlossaryEntry {
  id: GlossaryEntryId;
  kind: GlossaryEntryKind;
  description: string;
  forms: GlossaryForm[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateGlossaryEntryInput {
  kind: GlossaryEntryKind;
  canonicalSurface: string;
  description: string;
  matchBoundaryStart?: GlossaryFormMatchBoundary;
  matchBoundaryEnd?: GlossaryFormMatchBoundary;
  /** #365: canonical form opt-in; absent ⇒ `false`. */
  allowSingleCharacterMatch?: boolean;
}

export interface GlossaryFormInput {
  id?: GlossaryFormId;
  surface: string;
  relation: GlossaryFormRelation;
  warningPolicy: GlossaryWarningPolicy;
  matchBoundaryStart: GlossaryFormMatchBoundary;
  matchBoundaryEnd: GlossaryFormMatchBoundary;
  /** #365: absent ⇒ `false`. */
  allowSingleCharacterMatch?: boolean;
}

export interface UpdateGlossaryEntryInput {
  id: GlossaryEntryId;
  kind: GlossaryEntryKind;
  description: string;
  canonicalSurface: string;
  matchBoundaryStart?: GlossaryFormMatchBoundary;
  matchBoundaryEnd?: GlossaryFormMatchBoundary;
  /** #365: canonical form opt-in; absent ⇒ leave unchanged. */
  allowSingleCharacterMatch?: boolean;
  forms: GlossaryFormInput[];
}

export interface GlossarySurfaceLookupInput {
  surface: string;
}

export interface GlossarySurfaceMatch {
  entry: GlossaryEntry;
  form: GlossaryForm;
}

export interface NoGlossarySurfaceMatch {
  status: "none";
  surface: string;
}

export interface UniqueGlossarySurfaceMatch {
  status: "unique";
  surface: string;
  match: GlossarySurfaceMatch;
}

export interface AmbiguousGlossarySurfaceMatch {
  status: "ambiguous";
  surface: string;
  matches: GlossarySurfaceMatch[];
}

export type GlossarySurfaceLookupResult =
  | NoGlossarySurfaceMatch
  | UniqueGlossarySurfaceMatch
  | AmbiguousGlossarySurfaceMatch;

export class GlossaryValidationError extends Error {
  readonly code = "GLOSSARY_VALIDATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "GlossaryValidationError";
  }
}

const uuidv7Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function invalidGlossary(message: string): never {
  throw new GlossaryValidationError(message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateEnum<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
  path: string
): T {
  if (
    typeof value !== "string" ||
    !allowedValues.includes(value as T)
  ) {
    invalidGlossary(
      `${path} must be one of: ${allowedValues.join(", ")}.`
    );
  }

  return value as T;
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

function validateBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    invalidGlossary(`${path} must be a boolean.`);
  }

  return value;
}

/**
 * #365: `allowSingleCharacterMatch` is optional on the wire and in older /
 * partial payloads. Absent (`undefined`) folds to `false`; anything else must
 * be a real boolean.
 */
function validateOptionalBooleanDefaultFalse(
  value: unknown,
  path: string
): boolean {
  if (value === undefined) {
    return false;
  }

  return validateBoolean(value, path);
}

function validateTimestamp(value: unknown, path: string): string {
  const timestamp = validateNonEmptyString(value, path);

  if (Number.isNaN(Date.parse(timestamp))) {
    invalidGlossary(`${path} must be a valid timestamp.`);
  }

  return timestamp;
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

export function validateGlossaryFormId(
  value: unknown,
  path = "id"
): GlossaryFormId {
  return validateUuidv7(value, path);
}

function validateOptionalGlossaryFormId(
  value: unknown,
  path: string
): GlossaryFormId | undefined {
  if (value === undefined) {
    return undefined;
  }

  return validateGlossaryFormId(value, path);
}

export function validateGlossaryEntryKind(
  value: unknown,
  path = "kind"
): GlossaryEntryKind {
  return validateEnum(value, glossaryEntryKinds, path);
}

export function validateGlossaryFormRelation(
  value: unknown,
  path = "relation"
): GlossaryFormRelation {
  return validateEnum(value, glossaryFormRelations, path);
}

export function validateGlossaryWarningPolicy(
  value: unknown,
  path = "warningPolicy"
): GlossaryWarningPolicy {
  return validateEnum(value, glossaryWarningPolicies, path);
}

export function validateGlossaryFormMatchBoundary(
  value: unknown,
  path = "matchBoundary"
): GlossaryFormMatchBoundary {
  return validateEnum(value, glossaryFormMatchBoundaries, path);
}

function validateGlossaryFormMatchBoundaryOrDefault(
  value: unknown,
  path: string
): GlossaryFormMatchBoundary {
  if (value === undefined) {
    return DEFAULT_GLOSSARY_FORM_MATCH_BOUNDARY;
  }

  return validateGlossaryFormMatchBoundary(value, path);
}

function validateOptionalGlossaryFormMatchBoundary(
  value: unknown,
  path: string
): GlossaryFormMatchBoundary | undefined {
  if (value === undefined) {
    return undefined;
  }

  return validateGlossaryFormMatchBoundary(value, path);
}

export function validateGlossaryForm(
  value: unknown,
  path = "form"
): GlossaryForm {
  if (!isObject(value)) {
    invalidGlossary(`${path} must be an object.`);
  }

  const isCanonical = validateBoolean(
    value.isCanonical,
    `${path}.isCanonical`
  );
  const base = {
    id: validateGlossaryFormId(value.id, `${path}.id`),
    entryId: validateGlossaryEntryId(value.entryId, `${path}.entryId`),
    surface: validateNonEmptyString(value.surface, `${path}.surface`),
    matchBoundaryStart: validateGlossaryFormMatchBoundary(
      value.matchBoundaryStart,
      `${path}.matchBoundaryStart`
    ),
    matchBoundaryEnd: validateGlossaryFormMatchBoundary(
      value.matchBoundaryEnd,
      `${path}.matchBoundaryEnd`
    ),
    allowSingleCharacterMatch: validateOptionalBooleanDefaultFalse(
      value.allowSingleCharacterMatch,
      `${path}.allowSingleCharacterMatch`
    ),
    createdAt: validateTimestamp(value.createdAt, `${path}.createdAt`),
    updatedAt: validateTimestamp(value.updatedAt, `${path}.updatedAt`)
  };

  if (isCanonical) {
    if (value.relation !== null) {
      invalidGlossary(`${path}.relation must be null for canonical forms.`);
    }

    if (value.warningPolicy !== null) {
      invalidGlossary(
        `${path}.warningPolicy must be null for canonical forms.`
      );
    }

    return {
      ...base,
      relation: null,
      warningPolicy: null,
      isCanonical: true
    };
  }

  return {
    ...base,
    relation: validateGlossaryFormRelation(
      value.relation,
      `${path}.relation`
    ),
    warningPolicy: validateGlossaryWarningPolicy(
      value.warningPolicy,
      `${path}.warningPolicy`
    ),
    isCanonical: false
  };
}

function validateGlossarySurface(value: unknown, path: string): string {
  return validateNonEmptyString(value, path).trim();
}

function validateGlossaryFormInput(
  value: unknown,
  path: string
): GlossaryFormInput {
  if (!isObject(value)) {
    invalidGlossary(`${path} must be an object.`);
  }

  const id = validateOptionalGlossaryFormId(value.id, `${path}.id`);
  const formInput = {
    surface: validateGlossarySurface(value.surface, `${path}.surface`),
    relation: validateGlossaryFormRelation(
      value.relation,
      `${path}.relation`
    ),
    warningPolicy: validateGlossaryWarningPolicy(
      value.warningPolicy,
      `${path}.warningPolicy`
    ),
    matchBoundaryStart: validateGlossaryFormMatchBoundary(
      value.matchBoundaryStart,
      `${path}.matchBoundaryStart`
    ),
    matchBoundaryEnd: validateGlossaryFormMatchBoundary(
      value.matchBoundaryEnd,
      `${path}.matchBoundaryEnd`
    ),
    allowSingleCharacterMatch: validateOptionalBooleanDefaultFalse(
      value.allowSingleCharacterMatch,
      `${path}.allowSingleCharacterMatch`
    )
  };

  return id === undefined ? formInput : { ...formInput, id };
}

function assertNoDuplicateGlossarySurfaces(
  canonicalSurface: string,
  forms: GlossaryFormInput[]
): void {
  const seenSurfaces = new Set<string>();
  const surfaces = [
    { path: "canonicalSurface", surface: canonicalSurface },
    ...forms.map((form, index) => ({
      path: `forms[${index}].surface`,
      surface: form.surface
    }))
  ];

  for (const { path, surface } of surfaces) {
    const normalizedSurface = surface.trim();

    if (seenSurfaces.has(normalizedSurface)) {
      invalidGlossary(
        `${path} duplicates another surface in the same glossary entry.`
      );
    }

    seenSurfaces.add(normalizedSurface);
  }
}

export function validateGlossaryEntry(
  value: unknown,
  path = "entry"
): GlossaryEntry {
  if (!isObject(value)) {
    invalidGlossary(`${path} must be an object.`);
  }

  if (!Array.isArray(value.forms)) {
    invalidGlossary(`${path}.forms must be an array.`);
  }

  const id = validateGlossaryEntryId(value.id, `${path}.id`);
  const forms = value.forms.map((form, index) =>
    validateGlossaryForm(form, `${path}.forms[${index}]`)
  );

  if (forms.length === 0) {
    invalidGlossary(`${path}.forms must contain a canonical form.`);
  }

  for (const form of forms) {
    if (form.entryId !== id) {
      invalidGlossary(`${path}.forms must belong to ${path}.id.`);
    }
  }

  const canonicalForms = forms.filter((form) => form.isCanonical);

  if (canonicalForms.length !== 1) {
    invalidGlossary(`${path}.forms must contain exactly one canonical form.`);
  }

  return {
    id,
    kind: validateGlossaryEntryKind(value.kind, `${path}.kind`),
    description: validateString(value.description, `${path}.description`),
    forms,
    createdAt: validateTimestamp(value.createdAt, `${path}.createdAt`),
    updatedAt: validateTimestamp(value.updatedAt, `${path}.updatedAt`)
  };
}

export function validateCreateGlossaryEntryInput(
  value: unknown
): CreateGlossaryEntryInput {
  if (!isObject(value)) {
    invalidGlossary("Glossary entry input must be an object.");
  }

  return {
    kind: validateGlossaryEntryKind(value.kind, "kind"),
    canonicalSurface: validateGlossarySurface(
      value.canonicalSurface,
      "canonicalSurface"
    ),
    description: validateString(value.description, "description"),
    matchBoundaryStart: validateGlossaryFormMatchBoundaryOrDefault(
      value.matchBoundaryStart,
      "matchBoundaryStart"
    ),
    matchBoundaryEnd: validateGlossaryFormMatchBoundaryOrDefault(
      value.matchBoundaryEnd,
      "matchBoundaryEnd"
    ),
    allowSingleCharacterMatch: validateOptionalBooleanDefaultFalse(
      value.allowSingleCharacterMatch,
      "allowSingleCharacterMatch"
    )
  };
}

export function validateUpdateGlossaryEntryInput(
  value: unknown
): UpdateGlossaryEntryInput {
  if (!isObject(value)) {
    invalidGlossary("Glossary entry input must be an object.");
  }

  if (!Array.isArray(value.forms)) {
    invalidGlossary("forms must be an array.");
  }

  const canonicalSurface = validateGlossarySurface(
    value.canonicalSurface,
    "canonicalSurface"
  );
  const forms = value.forms.map((form, index) =>
    validateGlossaryFormInput(form, `forms[${index}]`)
  );

  assertNoDuplicateGlossarySurfaces(canonicalSurface, forms);

  const matchBoundaryStart = validateOptionalGlossaryFormMatchBoundary(
    value.matchBoundaryStart,
    "matchBoundaryStart"
  );
  const matchBoundaryEnd = validateOptionalGlossaryFormMatchBoundary(
    value.matchBoundaryEnd,
    "matchBoundaryEnd"
  );
  const allowSingleCharacterMatch =
    value.allowSingleCharacterMatch === undefined
      ? undefined
      : validateBoolean(
          value.allowSingleCharacterMatch,
          "allowSingleCharacterMatch"
        );

  return {
    id: validateGlossaryEntryId(value.id, "id"),
    kind: validateGlossaryEntryKind(value.kind, "kind"),
    description: validateString(value.description, "description"),
    canonicalSurface,
    ...(matchBoundaryStart === undefined ? {} : { matchBoundaryStart }),
    ...(matchBoundaryEnd === undefined ? {} : { matchBoundaryEnd }),
    ...(allowSingleCharacterMatch === undefined
      ? {}
      : { allowSingleCharacterMatch }),
    forms
  };
}

export function validateGlossarySurfaceLookupInput(
  value: unknown
): GlossarySurfaceLookupInput {
  if (!isObject(value)) {
    invalidGlossary("Glossary surface lookup input must be an object.");
  }

  return {
    surface: validateGlossarySurface(value.surface, "surface")
  };
}
