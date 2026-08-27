/**
 * Settings Catalog Foundation (ADR-0006).
 *
 * This module is the single source of truth for cataloged setting
 * definitions: key naming, scope, default values, and validation metadata
 * (ADR-0006 S-9 / S-10 / S-11). It does not own settings file I/O, effective
 * (Project > Application > Default) resolution, or runtime application of
 * setting values — those remain main-process/store/runtime-coordination
 * responsibilities (ADR-0006 S-13).
 *
 * This module intentionally does not merge with the pre-ADR-0006 metadata
 * in src/shared/settings.ts (`settingsCatalog` / `SettingsCatalogKey` /
 * `SettingsCatalogEntry` / `SettingScope` there use different names and a
 * different scope enum, and have zero consumers beyond that file's own
 * re-export). That legacy metadata is left in place rather than merged or
 * removed here.
 */

// ---------------------------------------------------------------------------
// Setting scope (ADR-0006 S-11)
// ---------------------------------------------------------------------------

// Intentional public scope vocabulary — kept public with no current
// production consumer outside this module; it preserves the closed
// ADR-0006 S-11 scope vocabulary at the runtime/type boundary (the source
// SettingScope is derived from) rather than duplicating it as a bare type.
export const settingScopes = [
  "applicationOnly",
  "projectOnly",
  "applicationWithProjectOverride"
] as const;

export type SettingScope = (typeof settingScopes)[number];

// ---------------------------------------------------------------------------
// Setting area (ADR-0006 S-10 closed area set)
// ---------------------------------------------------------------------------

// Deferred public area vocabulary: the area value list depends on ADR-0006
// area closed-set/UI grouping decisions that have not been made yet. #215
// adds commandPalette only for its explicit Command Palette setting keys.
export const settingAreas = [
  "workbench",
  "editor",
  "preview",
  "commandPalette",
  "quickAccess",
  "files",
  "debug"
] as const;

export type SettingArea = (typeof settingAreas)[number];

// ---------------------------------------------------------------------------
// Validation metadata types
// ---------------------------------------------------------------------------

export type SettingValueType = "boolean" | "string" | "number" | "enum";

/**
 * `fontFamilyName` / `themeName` are allowlist policies (see the character
 * pattern constants below for the exact allowed character sets). `none` is
 * an explicit placeholder for a string setting with no character policy yet
 * — it still rejects non-string, empty (after trim), and over-length
 * values. The production catalog never uses `none`; it exists for fixture
 * catalog tests only.
 */
export type AllowedCharacterPolicy = "fontFamilyName" | "themeName" | "none";

export type SettingValidationFailure =
  | "typeMismatch"
  | "enumValue"
  | "numericRange"
  | "integer"
  | "maxLength"
  | "disallowedCharacters"
  | "emptyString";

export type SettingValidationResult =
  | { ok: true }
  | { ok: false; failure: SettingValidationFailure };

// ---------------------------------------------------------------------------
// Catalog entry shapes
// ---------------------------------------------------------------------------

interface CommonSettingFields<TKey extends string> {
  readonly key: TKey;
  readonly scope: SettingScope;
  readonly labelKey: string;
  readonly descriptionKey: string;
  readonly deprecatedAliases: readonly string[];
  readonly migrationNotes: readonly string[];
}

export interface StringSettingEntry<TKey extends string = string>
  extends CommonSettingFields<TKey> {
  readonly type: "string";
  readonly defaultValue: string;
  readonly maxLength: number;
  readonly allowedCharacters: AllowedCharacterPolicy;
}

export interface EnumSettingEntry<
  TKey extends string = string,
  TValues extends readonly [string, ...string[]] = readonly [
    string,
    ...string[]
  ]
> extends CommonSettingFields<TKey> {
  readonly type: "enum";
  readonly defaultValue: TValues[number];
  readonly enumValues: TValues;
}

export interface SettingNumericRange {
  readonly min: number;
  readonly max: number;
  readonly integer?: boolean;
}

export interface NumberSettingEntry<TKey extends string = string>
  extends CommonSettingFields<TKey> {
  readonly type: "number";
  readonly defaultValue: number;
  readonly numericRange: SettingNumericRange;
}

export interface BooleanSettingEntry<TKey extends string = string>
  extends CommonSettingFields<TKey> {
  readonly type: "boolean";
  readonly defaultValue: boolean;
}

export type SettingCatalogEntry =
  | StringSettingEntry
  | EnumSettingEntry
  | NumberSettingEntry
  | BooleanSettingEntry;

// ---------------------------------------------------------------------------
// Cross-module type imports
// ---------------------------------------------------------------------------

// #186: workbench.language's selectable values are owned by i18n, while the
// catalog remains the owner of the setting's default and metadata.
import { defaultLanguage, supportedLanguages, type Language } from "./i18n";

// ---------------------------------------------------------------------------
// Key pattern / area validation (ADR-0006 S-10)
// ---------------------------------------------------------------------------

// Dotted segments: {area}.{...}.{property}, at least one dot. Each segment
// starts with a lowercase letter followed by letters/digits (camelCase),
// e.g. "workbench.colorTheme" or "files.newFile.lineEnding". No fixed
// maximum segment count: ADR-0006 S-11's own worked example
// ("editor.decorations.lineEndingMarkers.enabled") has more than three
// segments, so this pattern does not impose an unsupported depth cap.
const settingKeyPattern = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/;

function assertValidSettingKey(key: string): void {
  if (!settingKeyPattern.test(key)) {
    throw new Error(
      `Settings catalog key "${key}" does not match the dotted key pattern.`
    );
  }

  const area = key.slice(0, key.indexOf("."));

  if (!(settingAreas as readonly string[]).includes(area)) {
    throw new Error(
      `Settings catalog key "${key}" uses area "${area}", which is outside the allowed area set.`
    );
  }
}

// ---------------------------------------------------------------------------
// Allowed character policies
// ---------------------------------------------------------------------------

// Unicode letters (\p{L}), Unicode digits (\p{N}), space, - _ . , ( ).
// Comma is allowed: fontFamilyName values are CSS font-family lists, not a
// single font name. Bidi control characters and zero-width characters are
// Unicode category Cf (format characters) and are not \p{L}/\p{N}, so this
// allowlist rejects them without a separate denylist.
const fontFamilyNamePattern = /^[\p{L}\p{N} \-_.,()]*$/u;

// Same as fontFamilyName but without comma: a theme name is a single
// selection, not a fallback list.
const themeNamePattern = /^[\p{L}\p{N} \-_.()]*$/u;

function satisfiesAllowedCharacterPolicy(
  value: string,
  policy: AllowedCharacterPolicy
): boolean {
  switch (policy) {
    case "fontFamilyName":
      return fontFamilyNamePattern.test(value);
    case "themeName":
      return themeNamePattern.test(value);
    case "none":
      return true;
  }
}

// ---------------------------------------------------------------------------
// Per-type validation (defined value only — see validateCatalogValue below)
// ---------------------------------------------------------------------------

function validateStringValue(
  entry: StringSettingEntry,
  value: unknown
): SettingValidationResult {
  if (typeof value !== "string") {
    return { ok: false, failure: "typeMismatch" };
  }

  if (value.trim().length === 0) {
    return { ok: false, failure: "emptyString" };
  }

  if (value.length > entry.maxLength) {
    return { ok: false, failure: "maxLength" };
  }

  if (!satisfiesAllowedCharacterPolicy(value, entry.allowedCharacters)) {
    return { ok: false, failure: "disallowedCharacters" };
  }

  return { ok: true };
}

function validateEnumValue(
  entry: EnumSettingEntry,
  value: unknown
): SettingValidationResult {
  if (typeof value !== "string") {
    return { ok: false, failure: "typeMismatch" };
  }

  if (!(entry.enumValues as readonly string[]).includes(value)) {
    return { ok: false, failure: "enumValue" };
  }

  return { ok: true };
}

function validateNumberValue(
  entry: NumberSettingEntry,
  value: unknown
): SettingValidationResult {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, failure: "typeMismatch" };
  }

  if (entry.numericRange.integer === true && !Number.isInteger(value)) {
    return { ok: false, failure: "integer" };
  }

  if (value < entry.numericRange.min || value > entry.numericRange.max) {
    return { ok: false, failure: "numericRange" };
  }

  return { ok: true };
}

function validateBooleanValue(value: unknown): SettingValidationResult {
  return typeof value === "boolean"
    ? { ok: true }
    : { ok: false, failure: "typeMismatch" };
}

function validateEntryValue(
  entry: SettingCatalogEntry,
  value: unknown
): SettingValidationResult {
  switch (entry.type) {
    case "string":
      return validateStringValue(entry, value);
    case "enum":
      return validateEnumValue(entry, value);
    case "number":
      return validateNumberValue(entry, value);
    case "boolean":
      return validateBooleanValue(value);
  }
}

// ---------------------------------------------------------------------------
// Define helpers
// ---------------------------------------------------------------------------

interface CommonDefineInput<TKey extends string> {
  key: TKey;
  scope: SettingScope;
  labelKey: string;
  descriptionKey: string;
  deprecatedAliases: readonly string[];
  migrationNotes: readonly string[];
}

/**
 * Validates the entry's key (pattern + allowed area) and confirms its
 * defaultValue passes the entry's own validation, per the acceptance
 * criterion "全 catalog entry の defaultValue が、自身の validation を通る".
 * Shared by every defineXSetting helper below.
 */
function finalizeEntry<TEntry extends SettingCatalogEntry>(entry: TEntry): TEntry {
  assertValidSettingKey(entry.key);

  const defaultValueValidation = validateEntryValue(entry, entry.defaultValue);

  if (!defaultValueValidation.ok) {
    throw new Error(
      `Settings catalog entry "${entry.key}" has a defaultValue that fails its own validation (${defaultValueValidation.failure}).`
    );
  }

  return entry;
}

export interface DefineStringSettingInput<TKey extends string>
  extends CommonDefineInput<TKey> {
  defaultValue: string;
  maxLength: number;
  allowedCharacters: AllowedCharacterPolicy;
}

// Intentional public catalog DSL helper (ADR-0006 S-9 typed string setting
// metadata) — kept public as the authoring surface for string catalog
// entries, not because of an external production consumer; only
// settingsCatalog.ts's own catalog entries below currently call it.
export function defineStringSetting<TKey extends string>(
  input: DefineStringSettingInput<TKey>
): StringSettingEntry<TKey> {
  return finalizeEntry({ type: "string", ...input });
}

export interface DefineEnumSettingInput<
  TKey extends string,
  TValues extends readonly [string, ...string[]]
> extends CommonDefineInput<TKey> {
  enumValues: TValues;
  defaultValue: TValues[number];
}

// Intentional public catalog DSL helper (ADR-0006 S-9 typed enum setting
// metadata) — kept public as the authoring surface for enum catalog
// entries, not because of an external production consumer; only
// settingsCatalog.ts's own catalog entries below currently call it.
export function defineEnumSetting<
  TKey extends string,
  const TValues extends readonly [string, ...string[]]
>(
  input: DefineEnumSettingInput<TKey, TValues>
): EnumSettingEntry<TKey, TValues> {
  return finalizeEntry({ type: "enum", ...input });
}

export interface DefineNumberSettingInput<TKey extends string>
  extends CommonDefineInput<TKey> {
  defaultValue: number;
  numericRange: SettingNumericRange;
}

// Intentional public catalog DSL helper (ADR-0006 S-9 numeric setting
// metadata) — kept public as the authoring surface for numeric catalog
// entries, even though no current production catalog entry is a number
// setting yet and this helper has no current call site at all.
export function defineNumberSetting<TKey extends string>(
  input: DefineNumberSettingInput<TKey>
): NumberSettingEntry<TKey> {
  return finalizeEntry({ type: "number", ...input });
}

export interface DefineBooleanSettingInput<TKey extends string>
  extends CommonDefineInput<TKey> {
  defaultValue: boolean;
}

// Intentional public catalog DSL helper (ADR-0006 S-9 boolean setting
// metadata) — kept public as the authoring surface for boolean catalog
// entries, even though no current production catalog entry is a boolean
// setting yet and this helper has no current call site at all.
export function defineBooleanSetting<TKey extends string>(
  input: DefineBooleanSettingInput<TKey>
): BooleanSettingEntry<TKey> {
  return finalizeEntry({ type: "boolean", ...input });
}

/**
 * Wraps a catalog entries object, performing the cross-entry integrity
 * checks that a single defineXSetting call can't perform on its own:
 * object-key/entry.key consistency, and deprecated-alias collisions (alias
 * vs. primary key, alias vs. alias). Per-entry checks (key pattern/area,
 * defaultValue self-validation) already happened in finalizeEntry above.
 */
// Intentional public catalog DSL entry point (ADR-0006 S-9 typed catalog
// definition) — kept public as the authoring surface that assembles
// individual defineXSetting entries into the catalog, not because of an
// external production consumer; only this module's own initial catalog
// entries below currently call it.
export function defineSettingsCatalog<
  const TEntries extends Record<string, SettingCatalogEntry>
>(entries: TEntries): TEntries {
  for (const [objectKey, entry] of Object.entries(entries)) {
    if (entry.key !== objectKey) {
      throw new Error(
        `Settings catalog entry object key "${objectKey}" does not match its entry.key "${entry.key}".`
      );
    }
  }

  const primaryKeys = new Set(Object.keys(entries));
  const aliasOwners = new Map<string, string>();

  for (const [primaryKey, entry] of Object.entries(entries)) {
    for (const alias of entry.deprecatedAliases) {
      if (primaryKeys.has(alias)) {
        throw new Error(
          `Deprecated alias "${alias}" declared on "${primaryKey}" collides with an existing primary key.`
        );
      }

      const existingOwner = aliasOwners.get(alias);

      if (existingOwner && existingOwner !== primaryKey) {
        throw new Error(
          `Deprecated alias "${alias}" is claimed by both "${existingOwner}" and "${primaryKey}".`
        );
      }

      aliasOwners.set(alias, primaryKey);
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Initial catalog entries
// ---------------------------------------------------------------------------

// Intentional public catalog data (core ADR-0006 catalog source) — kept
// public for future catalog readers, not because of a current external
// production consumer; production code currently reads through the accessor
// helpers below (getCatalogEntry, getCatalogDefaultValue, validateCatalogValue,
// resolveCatalogValue) rather than importing this object directly.
export const settingsCatalog = defineSettingsCatalog({
  "workbench.fontFamily": defineStringSetting({
    key: "workbench.fontFamily",
    scope: "applicationOnly",
    defaultValue: "system-ui",
    labelKey: "settings.workbench.fontFamily.label",
    descriptionKey: "settings.workbench.fontFamily.description",
    maxLength: 128,
    allowedCharacters: "fontFamilyName",
    deprecatedAliases: [],
    migrationNotes: []
  }),
  "workbench.colorTheme": defineStringSetting({
    key: "workbench.colorTheme",
    scope: "applicationOnly",
    defaultValue: "Pergamum Light",
    labelKey: "settings.workbench.colorTheme.label",
    descriptionKey: "settings.workbench.colorTheme.description",
    maxLength: 80,
    allowedCharacters: "themeName",
    deprecatedAliases: ["appearance.uiTheme"],
    migrationNotes: [
      "appearance.uiTheme is accepted as a deprecated read alias for workbench.colorTheme."
    ]
  }),
  // #174: moved from the legacy top-level ApplicationSettings.language field
  // under the ADR-0006 catalog. No deprecated alias for the old top-level
  // key — #174 does not preserve or migrate legacy top-level `language`.
  "workbench.language": defineEnumSetting({
    key: "workbench.language",
    scope: "applicationOnly",
    enumValues: supportedLanguages,
    defaultValue: defaultLanguage,
    labelKey: "settings.workbench.language.label",
    descriptionKey: "settings.workbench.language.description",
    deprecatedAliases: [],
    migrationNotes: []
  }),
  // #174: moved from the legacy top-level ApplicationSettings.showStatusBar
  // field. No deprecated alias for the old top-level key.
  "workbench.statusBar.visible": defineBooleanSetting({
    key: "workbench.statusBar.visible",
    scope: "applicationOnly",
    defaultValue: true,
    labelKey: "settings.workbench.statusBar.visible.label",
    descriptionKey: "settings.workbench.statusBar.visible.description",
    deprecatedAliases: [],
    migrationNotes: []
  }),
  "workbench.statusBar.characterCount.visible": defineBooleanSetting({
    key: "workbench.statusBar.characterCount.visible",
    scope: "applicationOnly",
    defaultValue: true,
    labelKey: "settings.workbench.statusBar.characterCount.visible.label",
    descriptionKey:
      "settings.workbench.statusBar.characterCount.visible.description",
    deprecatedAliases: [],
    migrationNotes: []
  }),
  "workbench.sound.enabled": defineBooleanSetting({
    key: "workbench.sound.enabled",
    scope: "applicationOnly",
    defaultValue: true,
    labelKey: "settings.workbench.sound.enabled.label",
    descriptionKey: "settings.workbench.sound.enabled.description",
    deprecatedAliases: [],
    migrationNotes: []
  }),
  "workbench.sound.dialog.enabled": defineBooleanSetting({
    key: "workbench.sound.dialog.enabled",
    scope: "applicationOnly",
    defaultValue: true,
    labelKey: "settings.workbench.sound.dialog.enabled.label",
    descriptionKey: "settings.workbench.sound.dialog.enabled.description",
    deprecatedAliases: [],
    migrationNotes: []
  }),
  "workbench.sound.newline.enabled": defineBooleanSetting({
    key: "workbench.sound.newline.enabled",
    scope: "applicationOnly",
    defaultValue: false,
    labelKey: "settings.workbench.sound.newline.enabled.label",
    descriptionKey: "settings.workbench.sound.newline.enabled.description",
    deprecatedAliases: [],
    migrationNotes: []
  }),
  "workbench.sound.keypress.enabled": defineBooleanSetting({
    key: "workbench.sound.keypress.enabled",
    scope: "applicationOnly",
    defaultValue: false,
    labelKey: "settings.workbench.sound.keypress.enabled.label",
    descriptionKey: "settings.workbench.sound.keypress.enabled.description",
    deprecatedAliases: [],
    migrationNotes: []
  }),
  "commandPalette.description.enable": defineBooleanSetting({
    key: "commandPalette.description.enable",
    scope: "applicationOnly",
    defaultValue: true,
    labelKey: "settings.commandPalette.description.enable.label",
    descriptionKey: "settings.commandPalette.description.enable.description",
    deprecatedAliases: [],
    migrationNotes: []
  }),
  "commandPalette.description.marquee.delay": defineNumberSetting({
    key: "commandPalette.description.marquee.delay",
    scope: "applicationOnly",
    defaultValue: 2000,
    labelKey: "settings.commandPalette.description.marquee.delay.label",
    descriptionKey:
      "settings.commandPalette.description.marquee.delay.description",
    numericRange: { min: 0, max: 10000, integer: true },
    deprecatedAliases: [],
    migrationNotes: []
  }),
  "commandPalette.description.marquee.speed": defineNumberSetting({
    key: "commandPalette.description.marquee.speed",
    scope: "applicationOnly",
    defaultValue: 40,
    labelKey: "settings.commandPalette.description.marquee.speed.label",
    descriptionKey:
      "settings.commandPalette.description.marquee.speed.description",
    numericRange: { min: 1, max: 1000 },
    deprecatedAliases: [],
    migrationNotes: []
  }),
  "editor.fontFamily": defineStringSetting({
    key: "editor.fontFamily",
    scope: "applicationWithProjectOverride",
    defaultValue: "monospace",
    labelKey: "settings.editor.fontFamily.label",
    descriptionKey: "settings.editor.fontFamily.description",
    maxLength: 128,
    allowedCharacters: "fontFamilyName",
    deprecatedAliases: [],
    migrationNotes: []
  }),
  // #252: diagnostic-only setting for the line-ending marker/distribution
  // UI — never used to decide an existing break's kind, a new break's
  // inherited kind, or a save-time conversion. Kept fully separate from
  // files.newFile.lineEnding below (#253's new-break fallback).
  "editor.lineEnding.expected": defineEnumSetting({
    key: "editor.lineEnding.expected",
    scope: "applicationOnly",
    enumValues: ["lf", "crlf", "cr"],
    defaultValue: "lf",
    labelKey: "settings.editor.lineEnding.expected.label",
    descriptionKey: "settings.editor.lineEnding.expected.description",
    deprecatedAliases: [],
    migrationNotes: []
  }),
  // #252: one glyph used for every line-ending kind — expected/unexpected
  // is shown via marker variant/styling, not by picking a different glyph
  // per kind. #252 follow-up: "none" is an explicit, first-class value (not
  // an empty string / null) meaning "draw no inline marker at all" — #253's
  // tracking and the Line Ending Distribution query/dialog are unaffected
  // by this value; see createLineEndingVisibilityFeatures.
  "editor.lineEnding.markerGlyph": defineEnumSetting({
    key: "editor.lineEnding.markerGlyph",
    scope: "applicationOnly",
    enumValues: ["none", "⏎", "↵", "↓"],
    defaultValue: "none",
    labelKey: "settings.editor.lineEnding.markerGlyph.label",
    descriptionKey: "settings.editor.lineEnding.markerGlyph.description",
    deprecatedAliases: [],
    migrationNotes: []
  }),
  "editor.characterCount.exclude.whitespace": defineBooleanSetting({
    key: "editor.characterCount.exclude.whitespace",
    scope: "applicationOnly",
    defaultValue: true,
    labelKey: "settings.editor.characterCount.exclude.whitespace.label",
    descriptionKey:
      "settings.editor.characterCount.exclude.whitespace.description",
    deprecatedAliases: [],
    migrationNotes: []
  }),
  "editor.characterCount.exclude.lineBreaks": defineBooleanSetting({
    key: "editor.characterCount.exclude.lineBreaks",
    scope: "applicationOnly",
    defaultValue: true,
    labelKey: "settings.editor.characterCount.exclude.lineBreaks.label",
    descriptionKey:
      "settings.editor.characterCount.exclude.lineBreaks.description",
    deprecatedAliases: [],
    migrationNotes: []
  }),
  "editor.characterCount.exclude.headings": defineBooleanSetting({
    key: "editor.characterCount.exclude.headings",
    scope: "applicationOnly",
    defaultValue: false,
    labelKey: "settings.editor.characterCount.exclude.headings.label",
    descriptionKey:
      "settings.editor.characterCount.exclude.headings.description",
    deprecatedAliases: [],
    migrationNotes: []
  }),
  "editor.characterCount.exclude.markdownSyntax": defineBooleanSetting({
    key: "editor.characterCount.exclude.markdownSyntax",
    scope: "applicationOnly",
    defaultValue: true,
    labelKey: "settings.editor.characterCount.exclude.markdownSyntax.label",
    descriptionKey:
      "settings.editor.characterCount.exclude.markdownSyntax.description",
    deprecatedAliases: [],
    migrationNotes: []
  }),
  "editor.characterCount.exclude.markdownComments": defineBooleanSetting({
    key: "editor.characterCount.exclude.markdownComments",
    scope: "applicationOnly",
    defaultValue: true,
    labelKey: "settings.editor.characterCount.exclude.markdownComments.label",
    descriptionKey:
      "settings.editor.characterCount.exclude.markdownComments.description",
    deprecatedAliases: [],
    migrationNotes: []
  }),
  "files.newFile.lineEnding": defineEnumSetting({
    key: "files.newFile.lineEnding",
    scope: "applicationOnly",
    enumValues: ["lf", "crlf"],
    defaultValue: "lf",
    labelKey: "settings.files.newFile.lineEnding.label",
    descriptionKey: "settings.files.newFile.lineEnding.description",
    deprecatedAliases: [],
    migrationNotes: []
  }),
  "files.newFile.encoding": defineEnumSetting({
    key: "files.newFile.encoding",
    scope: "applicationOnly",
    enumValues: ["utf8"],
    defaultValue: "utf8",
    labelKey: "settings.files.newFile.encoding.label",
    descriptionKey: "settings.files.newFile.encoding.description",
    deprecatedAliases: [],
    migrationNotes: []
  }),
  "preview.renderer": defineEnumSetting({
    key: "preview.renderer",
    scope: "applicationWithProjectOverride",
    enumValues: ["markdown"],
    defaultValue: "markdown",
    labelKey: "settings.preview.renderer.label",
    descriptionKey: "settings.preview.renderer.description",
    deprecatedAliases: [],
    migrationNotes: []
  }),
  // #250 follow-up: how long the preview waits, after editing stops, before
  // re-rendering. A user-scope (applicationOnly, like the Command Palette
  // marquee timings above) tuning knob for how often Preview
  // layout/paint is allowed to interrupt editor input — not a "make preview
  // faster" setting. 0 is a valid, explicit choice (no intentional wait).
  "preview.updateDelayMs": defineNumberSetting({
    key: "preview.updateDelayMs",
    scope: "applicationOnly",
    defaultValue: 10000,
    labelKey: "settings.preview.updateDelayMs.label",
    descriptionKey: "settings.preview.updateDelayMs.description",
    numericRange: { min: 0, max: 600000, integer: true },
    deprecatedAliases: [],
    migrationNotes: []
  })
});

// ---------------------------------------------------------------------------
// Key / value types derived from the catalog
// ---------------------------------------------------------------------------

/** Primary keys only — deprecated aliases are never part of this type. */
export type SettingKey = keyof typeof settingsCatalog;

export type SettingValueOf<K extends SettingKey> =
  (typeof settingsCatalog)[K] extends EnumSettingEntry<string, infer TValues>
    ? TValues[number]
    : (typeof settingsCatalog)[K] extends StringSettingEntry
      ? string
      : (typeof settingsCatalog)[K] extends NumberSettingEntry
        ? number
        : (typeof settingsCatalog)[K] extends BooleanSettingEntry
          ? boolean
          : never;

// #186: compile-time guard that workbench.language's catalog enum values
// stay exactly in sync with the Language type. The catalog enum values now
// come from supportedLanguages, so this also catches drift between the i18n
// selectable values and Language.
type AssertExact<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : never
  : never;
const _workbenchLanguageMatchesLanguageType: AssertExact<
  SettingValueOf<"workbench.language">,
  Language
> = true;
void _workbenchLanguageMatchesLanguageType;

// ---------------------------------------------------------------------------
// Resolution result type
// ---------------------------------------------------------------------------

export type CatalogResolution<T> =
  | { ok: true; value: T; source: "raw" | "default" }
  | {
      ok: false;
      value: T;
      source: "default";
      failure: SettingValidationFailure;
    };

// ---------------------------------------------------------------------------
// Deprecated alias index (built once from the finished catalog)
// ---------------------------------------------------------------------------

const deprecatedAliasIndex: ReadonlyMap<string, SettingKey> = (() => {
  const index = new Map<string, SettingKey>();

  for (const [primaryKey, entry] of Object.entries(settingsCatalog)) {
    for (const alias of entry.deprecatedAliases) {
      index.set(alias, primaryKey as SettingKey);
    }
  }

  return index;
})();

function isSettingKey(value: string): value is SettingKey {
  return Object.prototype.hasOwnProperty.call(settingsCatalog, value);
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Resolves a raw string key (from on-disk settings or user-editable JSON)
 * to its primary `SettingKey`, following deprecated aliases. Returns
 * `undefined` for an unknown key rather than throwing — an unknown key is a
 * normal, expected occurrence for on-disk input (ADR-0006 S-19/S-20) and
 * must not be silently resolved to a catalog default.
 *
 * Intentional public alias/deprecation resolution helper — kept public with
 * no current production consumer; it is the intended entry point for
 * deprecated-alias resolution (e.g. S-18's appearance.uiTheme ->
 * workbench.colorTheme) once a settings reader wires alias-aware key lookup.
 */
export function resolvePrimarySettingKey(
  keyOrAlias: string
): SettingKey | undefined {
  if (isSettingKey(keyOrAlias)) {
    return keyOrAlias;
  }

  return deprecatedAliasIndex.get(keyOrAlias);
}

// Intentional catalog access boundary — kept public with no current
// production consumer, distinct from indexing `settingsCatalog` directly,
// for future Store/UI/wiring work.
export function getCatalogEntry<K extends SettingKey>(
  key: K
): (typeof settingsCatalog)[K] {
  return settingsCatalog[key];
}

// Intentional catalog enumeration helper and access boundary — kept public
// with no current production consumer, so future Store/UI/wiring call sites
// can enumerate catalog entries without traversing the `settingsCatalog`
// object directly.
export function getCatalogEntries(): readonly SettingCatalogEntry[] {
  return Object.values(settingsCatalog);
}

// Deferred public area helper: area grouping depends on ADR-0006 area
// closed-set/UI grouping decisions not yet made. Do not add consumers or
// change behavior until that decision lands.
export function getSettingArea<K extends SettingKey>(key: K): SettingArea {
  return key.slice(0, key.indexOf(".")) as SettingArea;
}

// Deferred public area helper: same area-grouping decision dependency as
// getSettingArea above.
export function getCatalogEntriesByArea(
  area: SettingArea
): readonly SettingCatalogEntry[] {
  return getCatalogEntries().filter(
    (entry) => getSettingArea(entry.key as SettingKey) === area
  );
}

export function getCatalogDefaultValue<K extends SettingKey>(
  key: K
): SettingValueOf<K> {
  return settingsCatalog[key].defaultValue as SettingValueOf<K>;
}

/**
 * Validates a *defined* value against a cataloged setting. Does not fall
 * back to the default, does not merge scopes, and does not log a rejection
 * — see resolveCatalogValue for the `undefined` (unset) case. `settings.rejected`
 * logging (ADR-0006 S-21/S-22) is the resolution layer's responsibility, not
 * this module's.
 */
export function validateCatalogValue<K extends SettingKey>(
  key: K,
  value: unknown
): SettingValidationResult {
  return validateEntryValue(settingsCatalog[key], value);
}

/**
 * Resolves a single raw source's value against the catalog: `undefined`
 * (unset) becomes the catalog default; a valid value passes through; an
 * invalid value falls back to the catalog default while preserving the
 * validation failure. This is a single-source helper — it does not perform
 * the Project > Application > Default effective-resolution chain (ADR-0006
 * S-12), which is a separate resolution-layer responsibility.
 */
export function resolveCatalogValue<K extends SettingKey>(
  key: K,
  rawValue: unknown
): CatalogResolution<SettingValueOf<K>> {
  const defaultValue = getCatalogDefaultValue(key);

  if (rawValue === undefined) {
    return { ok: true, value: defaultValue, source: "default" };
  }

  const validation = validateCatalogValue(key, rawValue);

  if (validation.ok) {
    return { ok: true, value: rawValue as SettingValueOf<K>, source: "raw" };
  }

  return {
    ok: false,
    value: defaultValue,
    source: "default",
    failure: validation.failure
  };
}
