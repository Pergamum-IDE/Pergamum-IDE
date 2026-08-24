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
  type SettingKey
} from "./settingsCatalog";

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
  | "advanced";

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
    labelKey: "settings.category.commands.label"
  },
  {
    id: "advanced",
    order: 900,
    labelKey: "settings.category.advanced.label"
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
   * Marks this item as a future "Show advanced settings" filter target.
   * Filtering behavior is implemented in a later issue.
   *
   * `advanced` means only: eligible for that future display filter. It does
   * NOT mean dangerous, expert-only, or requiring confirmation — those are
   * different concerns and must not be inferred from this flag.
   *
   * Future invariant (to be enforced by the filter's implementation, not
   * here): an advanced setting whose value has been changed from its
   * default must remain visible even when the advanced filter is off. The
   * Settings screen must not lie about the current configuration by hiding
   * a non-default value.
   */
  readonly advanced?: boolean;

  /**
   * Optional warning tied to specific values (e.g. a non-UTF-8
   * files.newFile.encoding). Separate from `advanced` — `advanced` is
   * display-filter metadata, `valueWarning` is a risk carried by a
   * particular value. Warning UI is implemented in a later issue.
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
    defaultValue: getCatalogDefaultValue("files.newFile.lineEnding"),
    advanced: true
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
    defaultValue: getCatalogDefaultValue("files.newFile.encoding"),
    advanced: true
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
