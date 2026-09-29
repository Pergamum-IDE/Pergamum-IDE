/**
 * #625: Japanese lint rule catalog + settings (`settings.json` -> `japaneseLint`).
 *
 * One source of truth for which textlint-rule-preset-japanese rules exist, in
 * what order and grouping they are shown, their user-facing labels, defaults
 * (which are on, and the thresholds), and how a stored setting is resolved.
 * The instant check (toolbar) and the future formal check (file context menu)
 * both resolve their rule set through {@link resolveJapaneseLintSettings} and
 * {@link enabledJapaneseLintRules}, so they can never disagree.
 *
 * This module owns shape + validation only. Persistence lives in the main
 * settings store, presentation in the Settings panel, execution in
 * src/main/textlint.
 *
 * Catalog order is the display order (Settings UI and, later, the formal
 * check's summary table).
 */

export const japaneseLintRuleIds = [
  "max-ten",
  "no-doubled-conjunctive-particle-ga",
  "no-doubled-conjunction",
  "no-double-negative-ja",
  "no-doubled-joshi",
  "sentence-length",
  "no-dropping-the-ra",
  "no-mix-dearu-desumasu",
  "no-nfd",
  "no-invalid-control-character",
  "no-zero-width-spaces",
  "no-kangxi-radicals"
] as const;

export type JapaneseLintRuleId = (typeof japaneseLintRuleIds)[number];

export type JapaneseLintRuleCategory = "style" | "characters";

/** A numeric threshold handed to the textlint rule as `options[key]`. */
export interface JapaneseLintRuleOptionDefinition {
  /** The textlint rule's own option name (e.g. "max"). */
  readonly key: string;
  readonly type: "number";
  readonly labelKey: string;
  readonly descriptionKey: string;
  readonly defaultValue: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export interface JapaneseLintRuleDefinition {
  readonly id: JapaneseLintRuleId;
  readonly labelKey: string;
  readonly descriptionKey: string;
  readonly category: JapaneseLintRuleCategory;
  readonly defaultEnabled: boolean;
  readonly options?: readonly JapaneseLintRuleOptionDefinition[];
}

export const japaneseLintRuleCategories: readonly {
  readonly id: JapaneseLintRuleCategory;
  readonly labelKey: string;
}[] = [
  { id: "style", labelKey: "japaneseLint.category.style" },
  { id: "characters", labelKey: "japaneseLint.category.characters" }
];

function rule(
  id: JapaneseLintRuleId,
  i18nName: string,
  category: JapaneseLintRuleCategory,
  defaultEnabled: boolean,
  options?: readonly JapaneseLintRuleOptionDefinition[]
): JapaneseLintRuleDefinition {
  return {
    id,
    labelKey: `japaneseLint.rule.${i18nName}.label`,
    descriptionKey: `japaneseLint.rule.${i18nName}.description`,
    category,
    defaultEnabled,
    ...(options ? { options } : {})
  };
}

export const japaneseLintRuleCatalog: readonly JapaneseLintRuleDefinition[] = [
  rule("max-ten", "maxTen", "style", true, [
    {
      key: "max",
      type: "number",
      labelKey: "japaneseLint.rule.maxTen.option.max.label",
      descriptionKey: "japaneseLint.rule.maxTen.option.max.description",
      defaultValue: 5,
      min: 1,
      max: 50,
      step: 1
    }
  ]),
  rule(
    "no-doubled-conjunctive-particle-ga",
    "noDoubledConjunctiveParticleGa",
    "style",
    true
  ),
  rule("no-doubled-conjunction", "noDoubledConjunction", "style", true),
  rule("no-double-negative-ja", "noDoubleNegativeJa", "style", true),
  rule("no-doubled-joshi", "noDoubledJoshi", "style", true),
  // Off by default: sentences over 100 characters are natural in fiction, and
  // a wall of warnings on first use would spoil the writing experience.
  rule("sentence-length", "sentenceLength", "style", false, [
    {
      key: "max",
      type: "number",
      labelKey: "japaneseLint.rule.sentenceLength.option.max.label",
      descriptionKey: "japaneseLint.rule.sentenceLength.option.max.description",
      defaultValue: 100,
      min: 20,
      max: 1000,
      step: 1
    }
  ]),
  rule("no-dropping-the-ra", "noDroppingTheRa", "style", true),
  rule("no-mix-dearu-desumasu", "noMixDearuDesumasu", "style", true),
  rule("no-nfd", "noNfd", "characters", true),
  rule("no-invalid-control-character", "noInvalidControlCharacter", "characters", true),
  rule("no-zero-width-spaces", "noZeroWidthSpaces", "characters", true),
  rule("no-kangxi-radicals", "noKangxiRadicals", "characters", true)
];

export function getJapaneseLintRuleDefinition(
  id: JapaneseLintRuleId
): JapaneseLintRuleDefinition {
  const definition = japaneseLintRuleCatalog.find((entry) => entry.id === id);

  if (definition === undefined) {
    throw new Error(`Unknown Japanese lint rule: ${id}`);
  }

  return definition;
}

/**
 * The short name of a rule for results (the wizard's summary and the Markdown
 * report), e.g. "読点が多い文" rather than the Settings switch text
 * "読点が多い文をチェック".
 */
export function japaneseLintRuleResultLabelKey(id: JapaneseLintRuleId): string {
  return getJapaneseLintRuleDefinition(id).labelKey.replace(
    /\.label$/,
    ".resultLabel"
  );
}

/**
 * The auxiliary path shown under a rule in the Settings UI, matching the
 * command / settings path notation used elsewhere ("JapaneseLinter.<ruleId>").
 * Display only: the textlint rule id, the catalog id and the stored settings
 * shape are unchanged.
 */
export function japaneseLintRuleDisplayPath(id: JapaneseLintRuleId): string {
  return `JapaneseLinter.${id}`;
}

export function isJapaneseLintRuleId(value: unknown): value is JapaneseLintRuleId {
  return (
    typeof value === "string" &&
    (japaneseLintRuleIds as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Runtime options (how the checker runs, as opposed to which rules run)
// ---------------------------------------------------------------------------

export const japaneseLintRuntimeOptionKeys = [
  "debounceMs",
  "lineCacheLimit",
  "workerRestartAttempts"
] as const;

export type JapaneseLintRuntimeOptionKey =
  (typeof japaneseLintRuntimeOptionKeys)[number];

export interface JapaneseLintRuntimeOptionDefinition {
  readonly key: JapaneseLintRuntimeOptionKey;
  readonly labelKey: string;
  readonly descriptionKey: string;
  readonly unitKey: string;
  readonly defaultValue: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

/**
 * Runtime settings shared by the instant check and the Linter Worker
 * (utilityProcess). Order is the display order in Settings.
 *   - debounceMs: quiet time after typing stops before a check runs.
 *   - lineCacheLimit: entries of the per-line result cache reused by the
 *     always-on check.
 *   - workerRestartAttempts: how often a crashed Linter Worker is restarted.
 */
export const japaneseLintRuntimeOptionCatalog: readonly JapaneseLintRuntimeOptionDefinition[] =
  [
    {
      key: "debounceMs",
      labelKey: "japaneseLint.runtime.debounceMs.label",
      descriptionKey: "japaneseLint.runtime.debounceMs.description",
      unitKey: "japaneseLint.runtime.unit.ms",
      defaultValue: 800,
      min: 300,
      max: 3000,
      step: 1
    },
    {
      key: "lineCacheLimit",
      labelKey: "japaneseLint.runtime.lineCacheLimit.label",
      descriptionKey: "japaneseLint.runtime.lineCacheLimit.description",
      unitKey: "japaneseLint.runtime.unit.entries",
      defaultValue: 5000,
      min: 500,
      max: 50000,
      step: 1
    },
    {
      key: "workerRestartAttempts",
      labelKey: "japaneseLint.runtime.workerRestartAttempts.label",
      descriptionKey: "japaneseLint.runtime.workerRestartAttempts.description",
      unitKey: "japaneseLint.runtime.unit.count",
      defaultValue: 3,
      min: 2,
      max: 10,
      step: 1
    }
  ];

export type JapaneseLintRuntimeSettings = Readonly<
  Record<JapaneseLintRuntimeOptionKey, number>
>;

export function getJapaneseLintRuntimeOptionDefinition(
  key: JapaneseLintRuntimeOptionKey
): JapaneseLintRuntimeOptionDefinition {
  const definition = japaneseLintRuntimeOptionCatalog.find(
    (entry) => entry.key === key
  );

  if (definition === undefined) {
    throw new Error(`Unknown Japanese lint runtime option: ${key}`);
  }

  return definition;
}

// ---------------------------------------------------------------------------
// Settings shape
// ---------------------------------------------------------------------------

export interface JapaneseLintRuleSetting {
  readonly enabled: boolean;
  /** Present only for rules with numeric options; keyed by the option key. */
  readonly options?: Readonly<Record<string, number>>;
}

/**
 * The settings, always fully resolved: every catalog rule is present with a
 * concrete `enabled` (and concrete option values where the rule has options).
 */
export interface JapaneseLintSettings extends JapaneseLintRuntimeSettings {
  readonly rules: Readonly<Record<JapaneseLintRuleId, JapaneseLintRuleSetting>>;
}

export function defaultJapaneseLintSettings(): JapaneseLintSettings {
  return resolveJapaneseLintSettings(undefined);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampOption(
  definition: Pick<
    JapaneseLintRuleOptionDefinition,
    "defaultValue" | "min" | "max" | "step"
  >,
  value: unknown
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return definition.defaultValue;
  }

  const stepped = Math.round(value / definition.step) * definition.step;

  return Math.min(definition.max, Math.max(definition.min, stepped));
}

/**
 * Tolerant resolution of a stored / partial value (used when reading and when
 * running a lint). The runtime options (debounceMs, lineCacheLimit,
 * workerRestartAttempts) sit beside `rules` and follow the same policy as a
 * numeric rule option - rounded to their step, clamped to [min, max], a
 * non-number falling back to the default:
 *   - missing / non-object input -> catalog defaults
 *   - unknown rule ids are ignored; catalog rules missing from the input get
 *     their defaults
 *   - a non-boolean `enabled` -> the rule's default
 *   - a numeric option is rounded to its step and clamped to [min, max]; a
 *     non-number falls back to the default
 */
export function resolveJapaneseLintSettings(raw: unknown): JapaneseLintSettings {
  const rawRules = isRecord(raw) && isRecord(raw.rules) ? raw.rules : {};
  const rules = {} as Record<JapaneseLintRuleId, JapaneseLintRuleSetting>;

  for (const definition of japaneseLintRuleCatalog) {
    const entry = rawRules[definition.id];
    const rawEntry = isRecord(entry) ? entry : {};
    const enabled =
      typeof rawEntry.enabled === "boolean"
        ? rawEntry.enabled
        : definition.defaultEnabled;

    if (definition.options === undefined) {
      rules[definition.id] = { enabled };
      continue;
    }

    const rawOptions = isRecord(rawEntry.options) ? rawEntry.options : {};
    const options: Record<string, number> = {};

    for (const option of definition.options) {
      options[option.key] = clampOption(option, rawOptions[option.key]);
    }

    rules[definition.id] = { enabled, options };
  }

  const rawSection = isRecord(raw) ? raw : {};
  const runtime = {} as Record<JapaneseLintRuntimeOptionKey, number>;

  for (const option of japaneseLintRuntimeOptionCatalog) {
    runtime[option.key] = clampOption(option, rawSection[option.key]);
  }

  return { rules, ...runtime };
}

export class JapaneseLintSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JapaneseLintSettingsError";
  }
}

/**
 * Strict validation for a value being SAVED (the Renderer is untrusted): an
 * unknown rule id / key, a non-boolean `enabled`, or a non-integer or
 * out-of-range option rejects the whole save. Anything omitted is filled from
 * the defaults, so the result is always fully resolved.
 */
export function parseJapaneseLintSettingsForWrite(
  raw: unknown
): JapaneseLintSettings {
  const allowedTopLevelKeys: readonly string[] = [
    "rules",
    ...japaneseLintRuntimeOptionKeys
  ];

  if (
    !isRecord(raw) ||
    Object.keys(raw).some((key) => !allowedTopLevelKeys.includes(key))
  ) {
    throw new JapaneseLintSettingsError(
      "japaneseLint must contain only rules and the runtime options."
    );
  }

  for (const option of japaneseLintRuntimeOptionCatalog) {
    const value = raw[option.key];

    if (
      value !== undefined &&
      (typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < option.min ||
        value > option.max)
    ) {
      throw new JapaneseLintSettingsError(`${option.key} is invalid.`);
    }
  }

  if (raw.rules !== undefined && !isRecord(raw.rules)) {
    throw new JapaneseLintSettingsError("japaneseLint.rules must be an object.");
  }

  for (const [id, entry] of Object.entries(raw.rules ?? {})) {
    const definition = japaneseLintRuleCatalog.find((rule) => rule.id === id);

    if (definition === undefined) {
      throw new JapaneseLintSettingsError(`Unknown Japanese lint rule: ${id}.`);
    }

    if (
      !isRecord(entry) ||
      Object.keys(entry).some((key) => key !== "enabled" && key !== "options")
    ) {
      throw new JapaneseLintSettingsError(`Invalid setting for rule ${id}.`);
    }

    if (entry.enabled !== undefined && typeof entry.enabled !== "boolean") {
      throw new JapaneseLintSettingsError(`${id}.enabled must be a boolean.`);
    }

    if (entry.options !== undefined) {
      if (!isRecord(entry.options)) {
        throw new JapaneseLintSettingsError(`${id}.options must be an object.`);
      }

      for (const [key, value] of Object.entries(entry.options)) {
        const option = definition.options?.find((candidate) => candidate.key === key);

        if (
          option === undefined ||
          typeof value !== "number" ||
          !Number.isInteger(value) ||
          value < option.min ||
          value > option.max
        ) {
          throw new JapaneseLintSettingsError(
            `${id}.options.${key} is invalid.`
          );
        }
      }
    }
  }

  return resolveJapaneseLintSettings(raw);
}

export function areJapaneseLintSettingsEqual(
  a: JapaneseLintSettings,
  b: JapaneseLintSettings
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------------------------
// What to run
// ---------------------------------------------------------------------------

export interface EnabledJapaneseLintRule {
  readonly id: JapaneseLintRuleId;
  /** Numeric options to pass to the textlint rule (empty for most rules). */
  readonly options: Readonly<Record<string, number>>;
}

/**
 * The rules to run, in catalog order, from (possibly unresolved) settings.
 * An empty array means "run nothing" - the engine must not start textlint.
 */
export function enabledJapaneseLintRules(
  settings: unknown
): readonly EnabledJapaneseLintRule[] {
  const resolved = resolveJapaneseLintSettings(settings);

  return japaneseLintRuleCatalog.flatMap((definition) => {
    const setting = resolved.rules[definition.id];

    return setting.enabled
      ? [{ id: definition.id, options: { ...(setting.options ?? {}) } }]
      : [];
  });
}

/**
 * The quiet time before an instant check runs, from a stored / partial
 * `japaneseLint` value: rounded and clamped to the catalog range, the default
 * for anything unusable. Safe to call with untrusted input.
 */
export function resolveJapaneseLintDebounceMs(storedSettings: unknown): number {
  return resolveJapaneseLintSettings(storedSettings).debounceMs;
}
