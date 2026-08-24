/**
 * Settings UI Catalog Schema (#226).
 *
 * Foundation for the future 2-pane Settings Page: category grouping, display
 * order, i18n-keyed labels/descriptions, per-item control kind, and search
 * text generation.
 *
 * Responsibility split from src/shared/settingsCatalog.ts (ADR-0006):
 * - settingsCatalog.ts owns setting *validation* — key naming, scope,
 *   default values, and value-shape validation. It has no concept of
 *   display, grouping, or search.
 * - This module owns setting *presentation metadata* for the Settings UI —
 *   category, order, control kind, and search text. It never validates a
 *   value and never stores a display string directly; every user-facing
 *   string is referenced through an i18n key (`labelKey` / `descriptionKey`)
 *   and resolved by a caller-supplied translate function.
 *
 * This module does not implement the Settings Page UI, the 2-pane layout,
 * the search box, the advanced-settings display filter, or valueWarning
 * rendering. Those are later issues; this module only defines the schema
 * and data they will read.
 */

import {
  getCatalogDefaultValue,
  getCatalogEntry,
  type SettingKey
} from "./settingsCatalog";
import { supportedLanguages, type Language } from "./i18n";

// ---------------------------------------------------------------------------
// i18n key alias
// ---------------------------------------------------------------------------

/**
 * A translation dictionary key. Kept as a bare string (not the closed
 * `TranslationKey` union from src/shared/i18n) so this module stays
 * decoupled from the exact i18n implementation type — callers resolve these
 * keys through their own translate function, and catalog-consistency tests
 * verify each key actually resolves in both locales.
 */
export type I18nKey = string;

/** Minimal translate shape this module needs — see the I18nKey note above. */
export type SettingSearchTranslate = (key: I18nKey) => string;

// ---------------------------------------------------------------------------
// Setting category (left-pane grouping)
// ---------------------------------------------------------------------------

export type SettingCategory =
  | "application"
  | "appearance"
  | "editor"
  | "preview"
  | "files"
  | "project"
  | "commands"
  | "sound";

export interface SettingCategoryCatalogItem {
  readonly id: SettingCategory;
  readonly order: number;
  readonly labelKey: I18nKey;
  readonly descriptionKey?: I18nKey;
}

function defineSettingCategoryCatalog<
  const TItems extends readonly SettingCategoryCatalogItem[]
>(items: TItems): TItems {
  const seenIds = new Set<SettingCategory>();

  for (const item of items) {
    if (seenIds.has(item.id)) {
      throw new Error(
        `Settings category catalog id "${item.id}" is defined more than once.`
      );
    }

    seenIds.add(item.id);
  }

  return items;
}

// Intentional public category catalog data — kept public for future
// Settings Page consumers; category order/labels are the left-pane source
// of truth (#226).
export const settingCategoryCatalog = defineSettingCategoryCatalog([
  {
    id: "application",
    order: 100,
    labelKey: "settings.category.application.label"
  },
  {
    id: "appearance",
    order: 200,
    labelKey: "settings.category.appearance.label"
  },
  {
    id: "editor",
    order: 300,
    labelKey: "settings.category.editor.label"
  },
  {
    id: "preview",
    order: 400,
    labelKey: "settings.category.preview.label"
  },
  {
    id: "files",
    order: 500,
    labelKey: "settings.category.files.label"
  },
  {
    id: "project",
    order: 600,
    labelKey: "settings.category.project.label"
  },
  {
    id: "commands",
    order: 700,
    // Labeled "Command Palette" / "コマンドパレット", not the broader
    // "Commands" — only commandPalette.* settings are registered here so
    // far. Revisit if outline/glossary palette settings are added later.
    labelKey: "settings.category.commands.label"
  },
  {
    id: "sound",
    order: 800,
    labelKey: "settings.category.sound.label"
  }
] satisfies readonly SettingCategoryCatalogItem[]);

export function getSettingCategoryCatalogItem(
  id: SettingCategory,
  categories: readonly SettingCategoryCatalogItem[] = settingCategoryCatalog
): SettingCategoryCatalogItem | undefined {
  return categories.find((category) => category.id === id);
}

export function settingCategoryLabelKey(
  category: SettingCategory,
  categories: readonly SettingCategoryCatalogItem[] = settingCategoryCatalog
): I18nKey {
  const found = getSettingCategoryCatalogItem(category, categories);

  if (!found) {
    throw new Error(`Unknown setting category "${category}".`);
  }

  return found.labelKey;
}

/**
 * Stable sort: category `order`, then localized label, then `id`.
 */
export function sortSettingCategoryCatalog(
  translate: SettingSearchTranslate,
  categories: readonly SettingCategoryCatalogItem[] = settingCategoryCatalog
): readonly SettingCategoryCatalogItem[] {
  return [...categories].sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }

    const labelCompare = translate(a.labelKey).localeCompare(
      translate(b.labelKey)
    );

    if (labelCompare !== 0) {
      return labelCompare;
    }

    return a.id.localeCompare(b.id);
  });
}

// ---------------------------------------------------------------------------
// Setting control schema
// ---------------------------------------------------------------------------

export interface SettingSelectOption {
  readonly value: string;
  readonly labelKey: I18nKey;
  readonly descriptionKey?: I18nKey;
}

export type SettingControl =
  | {
      readonly kind: "switch";
    }
  | {
      readonly kind: "select";
      readonly options: readonly SettingSelectOption[];
    }
  | {
      readonly kind: "text";
      readonly placeholderKey?: I18nKey;
    }
  | {
      readonly kind: "number";
      readonly min?: number;
      readonly max?: number;
      readonly step?: number;
    };

// ---------------------------------------------------------------------------
// Value warning schema
// ---------------------------------------------------------------------------

/**
 * Metadata only — this Issue does not implement warning UI. `when` must stay
 * a pure predicate over the value; nothing in this module calls it except
 * catalog-consistency tests.
 */
export interface SettingValueWarning<TValue> {
  readonly when: (value: TValue) => boolean;
  readonly severity: "info" | "warning" | "danger";
  readonly messageKey: I18nKey;
}

// ---------------------------------------------------------------------------
// Setting catalog item schema
// ---------------------------------------------------------------------------

export interface SettingCatalogItem<TValue = unknown> {
  /**
   * settings.json / internal config key. Also searchable from Settings UI.
   * Typed as `SettingKey` (src/shared/settingsCatalog.ts) so a UI catalog
   * item can only reference a key already registered in the validation
   * catalog — this module cannot invent a setting even by typo.
   */
  readonly key: SettingKey;

  /** Category shown in the Settings left pane. Must exist in settingCategoryCatalog. */
  readonly category: SettingCategory;

  /** Sort order inside the category. Smaller numbers appear earlier. */
  readonly order: number;

  /**
   * i18n key for the stable setting title.
   *
   * For boolean settings, this label must not change between enabled and
   * disabled — the title names the setting, not its current state. The
   * current value is shown by the switch itself and by a separate,
   * explicit state label (see docs/adr — this Issue documents the
   * boolean display convention but does not implement it):
   *
   *   [Setting name]                 [switch] [state]
   *   [description]
   *   [internal key name]
   */
  readonly labelKey: I18nKey;

  /** i18n key for the short explanation shown under the setting title. */
  readonly descriptionKey: I18nKey;

  /** UI control used to edit the value. */
  readonly control: SettingControl;

  /** Default value. */
  readonly defaultValue: TValue;

  /**
   * Optional warning tied to specific values (e.g. a non-UTF-8
   * files.newFile.encoding). Warning UI is implemented in a later issue.
   */
  readonly valueWarning?: SettingValueWarning<TValue>;
}

function defineSettingCatalog<
  const TItems extends readonly SettingCatalogItem[]
>(
  items: TItems,
  categories: readonly SettingCategoryCatalogItem[] = settingCategoryCatalog
): TItems {
  const categoryIds = new Set(categories.map((category) => category.id));
  const seenKeys = new Set<string>();

  for (const item of items) {
    if (seenKeys.has(item.key)) {
      throw new Error(
        `Settings UI catalog key "${item.key}" is defined more than once.`
      );
    }

    seenKeys.add(item.key);

    if (!categoryIds.has(item.category)) {
      throw new Error(
        `Settings UI catalog item "${item.key}" references unknown category "${item.category}".`
      );
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Initial catalog items
// ---------------------------------------------------------------------------

// `getCatalogDefaultValue` (src/shared/settingsCatalog.ts) is the single
// source of truth for each default value below — this module never
// duplicates a literal default, and getCatalogDefaultValue's `SettingKey`
// argument type means an invented key (one not registered in
// settingsCatalog.ts) fails to compile.

// workbench.language's selectable values are owned by i18n
// (supportedLanguages), not this module — build the select options from
// that list rather than hardcoding "ja"/"en" a second time. Each option's
// labelKey resolves to the language's own native name (e.g. "日本語"),
// which — like a proper noun — does not change with the current UI
// language, so the en/ja translations for these keys are identical text.
const languageOptionLabelKeys: Record<Language, I18nKey> = {
  ja: "settings.workbench.language.option.ja.label",
  en: "settings.workbench.language.option.en.label"
};

const workbenchLanguageOptions: readonly SettingSelectOption[] =
  supportedLanguages.map((language) => ({
    value: language,
    labelKey: languageOptionLabelKeys[language]
  }));

const commandPaletteMarqueeDelayRange = getCatalogEntry(
  "commandPalette.description.marquee.delay"
).numericRange;
const commandPaletteMarqueeSpeedRange = getCatalogEntry(
  "commandPalette.description.marquee.speed"
).numericRange;

// Intentional public UI catalog data — kept public for future Settings Page
// consumers (#226). Registers only settings that already exist in
// src/shared/settingsCatalog.ts.
export const settingCatalogItems = defineSettingCatalog([
  {
    key: "workbench.colorTheme",
    category: "appearance",
    order: 100,
    labelKey: "settings.workbench.colorTheme.label",
    descriptionKey: "settings.workbench.colorTheme.description",
    control: { kind: "text" },
    defaultValue: getCatalogDefaultValue("workbench.colorTheme")
  },
  {
    key: "workbench.fontFamily",
    category: "appearance",
    order: 200,
    labelKey: "settings.workbench.fontFamily.label",
    descriptionKey: "settings.workbench.fontFamily.description",
    control: { kind: "text" },
    defaultValue: getCatalogDefaultValue("workbench.fontFamily")
  },
  {
    key: "editor.fontFamily",
    category: "editor",
    order: 100,
    labelKey: "settings.editor.fontFamily.label",
    descriptionKey: "settings.editor.fontFamily.description",
    control: { kind: "text" },
    defaultValue: getCatalogDefaultValue("editor.fontFamily")
  },
  {
    key: "files.newFile.lineEnding",
    category: "files",
    order: 100,
    labelKey: "settings.files.newFile.lineEnding.label",
    descriptionKey: "settings.files.newFile.lineEnding.description",
    control: {
      kind: "select",
      options: [
        {
          value: "lf",
          labelKey: "settings.files.newFile.lineEnding.option.lf.label"
        },
        {
          value: "crlf",
          labelKey: "settings.files.newFile.lineEnding.option.crlf.label"
        }
      ]
    },
    defaultValue: getCatalogDefaultValue("files.newFile.lineEnding")
  },
  {
    key: "files.newFile.encoding",
    category: "files",
    order: 200,
    labelKey: "settings.files.newFile.encoding.label",
    descriptionKey: "settings.files.newFile.encoding.description",
    control: {
      kind: "select",
      options: [
        {
          value: "utf8",
          labelKey: "settings.files.newFile.encoding.option.utf8.label"
        }
      ]
    },
    defaultValue: getCatalogDefaultValue("files.newFile.encoding")
  },
  {
    key: "preview.renderer",
    category: "preview",
    order: 100,
    labelKey: "settings.preview.renderer.label",
    descriptionKey: "settings.preview.renderer.description",
    control: {
      kind: "select",
      options: [
        {
          value: "markdown",
          labelKey: "settings.preview.renderer.option.markdown.label"
        }
      ]
    },
    defaultValue: getCatalogDefaultValue("preview.renderer")
  },
  {
    key: "workbench.language",
    category: "application",
    order: 200,
    labelKey: "settings.workbench.language.label",
    descriptionKey: "settings.workbench.language.description",
    control: {
      kind: "select",
      options: workbenchLanguageOptions
    },
    defaultValue: getCatalogDefaultValue("workbench.language")
  },
  {
    key: "workbench.statusBar.visible",
    category: "application",
    order: 300,
    labelKey: "settings.workbench.statusBar.visible.label",
    descriptionKey: "settings.workbench.statusBar.visible.description",
    control: { kind: "switch" },
    defaultValue: getCatalogDefaultValue("workbench.statusBar.visible")
  },
  {
    key: "workbench.sound.enabled",
    category: "sound",
    order: 100,
    labelKey: "settings.workbench.sound.enabled.label",
    descriptionKey: "settings.workbench.sound.enabled.description",
    control: { kind: "switch" },
    defaultValue: getCatalogDefaultValue("workbench.sound.enabled")
  },
  {
    key: "workbench.sound.dialog.enabled",
    category: "sound",
    order: 200,
    labelKey: "settings.workbench.sound.dialog.enabled.label",
    descriptionKey: "settings.workbench.sound.dialog.enabled.description",
    control: { kind: "switch" },
    defaultValue: getCatalogDefaultValue("workbench.sound.dialog.enabled")
  },
  {
    key: "workbench.sound.newline.enabled",
    category: "sound",
    order: 300,
    labelKey: "settings.workbench.sound.newline.enabled.label",
    descriptionKey: "settings.workbench.sound.newline.enabled.description",
    control: { kind: "switch" },
    defaultValue: getCatalogDefaultValue("workbench.sound.newline.enabled")
  },
  {
    key: "workbench.sound.keypress.enabled",
    category: "sound",
    order: 400,
    labelKey: "settings.workbench.sound.keypress.enabled.label",
    descriptionKey: "settings.workbench.sound.keypress.enabled.description",
    control: { kind: "switch" },
    defaultValue: getCatalogDefaultValue("workbench.sound.keypress.enabled")
  },
  {
    key: "commandPalette.description.enable",
    category: "commands",
    order: 100,
    labelKey: "settings.commandPalette.description.enable.label",
    descriptionKey: "settings.commandPalette.description.enable.description",
    control: { kind: "switch" },
    defaultValue: getCatalogDefaultValue("commandPalette.description.enable")
  },
  {
    key: "commandPalette.description.marquee.delay",
    category: "commands",
    order: 200,
    labelKey: "settings.commandPalette.description.marquee.delay.label",
    descriptionKey:
      "settings.commandPalette.description.marquee.delay.description",
    control: {
      kind: "number",
      min: commandPaletteMarqueeDelayRange.min,
      max: commandPaletteMarqueeDelayRange.max
    },
    defaultValue: getCatalogDefaultValue(
      "commandPalette.description.marquee.delay"
    )
  },
  {
    key: "commandPalette.description.marquee.speed",
    category: "commands",
    order: 300,
    labelKey: "settings.commandPalette.description.marquee.speed.label",
    descriptionKey:
      "settings.commandPalette.description.marquee.speed.description",
    control: {
      kind: "number",
      min: commandPaletteMarqueeSpeedRange.min,
      max: commandPaletteMarqueeSpeedRange.max
    },
    defaultValue: getCatalogDefaultValue(
      "commandPalette.description.marquee.speed"
    )
  }
] satisfies readonly SettingCatalogItem[]);

export function getSettingCatalogItem(
  key: string,
  items: readonly SettingCatalogItem[] = settingCatalogItems
): SettingCatalogItem | undefined {
  return items.find((item) => item.key === key);
}

/**
 * Stable sort: the item's category `order`, then the item's own `order`,
 * then `key` as a final deterministic tie-break.
 */
export function sortSettingCatalogItems(
  items: readonly SettingCatalogItem[] = settingCatalogItems,
  categories: readonly SettingCategoryCatalogItem[] = settingCategoryCatalog
): readonly SettingCatalogItem[] {
  const categoryOrder = new Map(
    categories.map((category) => [category.id, category.order])
  );

  return [...items].sort((a, b) => {
    const orderA = categoryOrder.get(a.category) ?? Number.POSITIVE_INFINITY;
    const orderB = categoryOrder.get(b.category) ?? Number.POSITIVE_INFINITY;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    if (a.order !== b.order) {
      return a.order - b.order;
    }

    return a.key.localeCompare(b.key);
  });
}

// ---------------------------------------------------------------------------
// Settings search text generation
// ---------------------------------------------------------------------------

/**
 * `keywords` is deliberately not part of this schema (#226): label /
 * description / key / option text already covers search, keywords are hard
 * to keep translated, and a free-text tuning field invites catalog bloat. A
 * future i18n-keyed `searchKeywordsKey` is a separate Issue's decision.
 */
export function settingControlSearchText(
  control: SettingControl,
  translate: SettingSearchTranslate
): readonly string[] {
  if (control.kind !== "select") {
    return [];
  }

  return control.options.flatMap((option) => [
    option.value,
    translate(option.labelKey),
    ...(option.descriptionKey ? [translate(option.descriptionKey)] : [])
  ]);
}

export function buildSettingSearchText(
  item: SettingCatalogItem,
  translate: SettingSearchTranslate,
  categories: readonly SettingCategoryCatalogItem[] = settingCategoryCatalog
): string {
  return [
    item.key,
    translate(settingCategoryLabelKey(item.category, categories)),
    translate(item.labelKey),
    translate(item.descriptionKey),
    ...settingControlSearchText(item.control, translate)
  ].join(" ");
}
