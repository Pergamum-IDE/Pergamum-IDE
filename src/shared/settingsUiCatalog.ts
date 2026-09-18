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
  | "searchReplace"
  | "imageAttachment"
  | "preview"
  | "documentMap"
  | "markdownFiles"
  | "textFiles"
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
    id: "project",
    order: 250,
    labelKey: "settings.category.project.label"
  },
  {
    id: "editor",
    order: 300,
    labelKey: "settings.category.editor.label"
  },
  {
    // #424 Slice 7: Search & Replace sits after Editor — a document-authoring
    // concern shared by the active Find panel and (later) project-wide search.
    id: "searchReplace",
    order: 340,
    labelKey: "settings.category.searchReplace.label"
  },
  {
    // #407: clipboard image attachment settings sit directly after Editor —
    // the feature is an editor-adjacent authoring convenience.
    id: "imageAttachment",
    order: 350,
    labelKey: "settings.category.imageAttachment.label"
  },
  {
    id: "preview",
    order: 400,
    labelKey: "settings.category.preview.label"
  },
  {
    // Document Map is not a pure "appearance" tweak — it interprets and draws
    // document structure — so it is its own category rather than a section
    // under Appearance (#375 Task Q). It has no scalar catalog items; the
    // Settings panel force-keeps it visible and renders a bespoke section.
    id: "documentMap",
    order: 450,
    labelKey: "settings.category.documentMap.label"
  },
  {
    id: "markdownFiles",
    order: 500,
    labelKey: "settings.category.markdownFiles.label"
  },
  {
    id: "textFiles",
    order: 510,
    labelKey: "settings.category.textFiles.label"
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
    }
  | {
      readonly kind: "custom";
      readonly customKind?: string;
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
   * textFiles.encoding). Warning UI is implemented in a later issue.
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

const commandPaletteFooterDetailMarqueeDelayRange = getCatalogEntry(
  "commandPalette.footerDetail.marquee.delay"
).numericRange;
const commandPaletteFooterDetailMarqueeSpeedRange = getCatalogEntry(
  "commandPalette.footerDetail.marquee.speed"
).numericRange;
const previewUpdateDelayRange = getCatalogEntry(
  "preview.updateDelayMs"
).numericRange;
const undoHistoryMinDepthRange = getCatalogEntry(
  "editor.undoHistoryMinDepth"
).numericRange;
const nearbyCharacterDistanceRange = getCatalogEntry(
  "search.nearby.characterDistance"
).numericRange;
const nearbyParagraphDistanceRange = getCatalogEntry(
  "search.nearby.paragraphDistance"
).numericRange;
const notificationDurationRange = getCatalogEntry(
  "workbench.notification.durationMs"
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
    key: "workbench.uiFontFamilyList",
    category: "appearance",
    order: 250,
    labelKey: "settings.workbench.uiFontFamilyList.label",
    descriptionKey: "settings.workbench.uiFontFamilyList.description",
    control: { kind: "custom", customKind: "fontFamilyList" },
    defaultValue: getCatalogDefaultValue("workbench.uiFontFamilyList")
  },
  {
    key: "editor.fontFamilyList",
    category: "editor",
    order: 105,
    labelKey: "settings.editor.fontFamilyList.label",
    descriptionKey: "settings.editor.fontFamilyList.description",
    control: { kind: "custom", customKind: "fontFamilyList" },
    defaultValue: getCatalogDefaultValue("editor.fontFamilyList")
  },
  {
    key: "editor.undoHistoryMinDepth",
    category: "editor",
    order: 120,
    labelKey: "settings.editor.undoHistoryMinDepth.label",
    descriptionKey: "settings.editor.undoHistoryMinDepth.description",
    control: {
      kind: "number",
      min: undoHistoryMinDepthRange.min,
      max: undoHistoryMinDepthRange.max,
      step: 100
    },
    defaultValue: getCatalogDefaultValue("editor.undoHistoryMinDepth")
  },
  {
    key: "editor.selectionHighlightMode",
    category: "editor",
    order: 130,
    labelKey: "settings.editor.selectionHighlightMode.label",
    descriptionKey: "settings.editor.selectionHighlightMode.description",
    control: {
      kind: "select",
      options: [
        {
          value: "off",
          labelKey: "settings.editor.selectionHighlightMode.option.off.label"
        },
        {
          value: "default",
          labelKey: "settings.editor.selectionHighlightMode.option.default.label"
        },
        {
          value: "smart",
          labelKey: "settings.editor.selectionHighlightMode.option.smart.label",
          descriptionKey:
            "settings.editor.selectionHighlightMode.option.smart.description"
        }
      ]
    },
    defaultValue: getCatalogDefaultValue("editor.selectionHighlightMode")
  },
  {
    key: "editor.findGutterMarkers",
    category: "editor",
    order: 140,
    labelKey: "settings.editor.findGutterMarkers.label",
    descriptionKey: "settings.editor.findGutterMarkers.description",
    control: { kind: "switch" },
    defaultValue: getCatalogDefaultValue("editor.findGutterMarkers")
  },
  {
    key: "editor.captureTabInEditor",
    category: "editor",
    order: 150,
    labelKey: "settings.editor.captureTabInEditor.label",
    descriptionKey: "settings.editor.captureTabInEditor.description",
    control: { kind: "switch" },
    defaultValue: getCatalogDefaultValue("editor.captureTabInEditor")
  },
  {
    key: "editor.fencedCodeIndentUnit",
    category: "editor",
    order: 155,
    labelKey: "settings.editor.fencedCodeIndentUnit.label",
    descriptionKey: "settings.editor.fencedCodeIndentUnit.description",
    control: {
      kind: "select",
      options: [
        {
          value: "spaces2",
          labelKey: "settings.editor.fencedCodeIndentUnit.option.spaces2.label"
        },
        {
          value: "spaces4",
          labelKey: "settings.editor.fencedCodeIndentUnit.option.spaces4.label"
        },
        {
          value: "spaces6",
          labelKey: "settings.editor.fencedCodeIndentUnit.option.spaces6.label"
        },
        {
          value: "spaces8",
          labelKey: "settings.editor.fencedCodeIndentUnit.option.spaces8.label"
        },
        {
          value: "tab",
          labelKey: "settings.editor.fencedCodeIndentUnit.option.tab.label"
        }
      ]
    },
    defaultValue: getCatalogDefaultValue("editor.fencedCodeIndentUnit")
  },
  {
    // #424 Slice 7: glossary "近傍" (Nearby) search range.
    key: "search.nearby.unit",
    category: "searchReplace",
    order: 100,
    labelKey: "settings.search.nearby.unit.label",
    descriptionKey: "settings.search.nearby.unit.description",
    control: {
      kind: "select",
      options: [
        {
          value: "characters",
          labelKey: "settings.search.nearby.unit.option.characters.label"
        },
        {
          value: "paragraphs",
          labelKey: "settings.search.nearby.unit.option.paragraphs.label"
        }
      ]
    },
    defaultValue: getCatalogDefaultValue("search.nearby.unit")
  },
  {
    key: "search.nearby.characterDistance",
    category: "searchReplace",
    order: 200,
    labelKey: "settings.search.nearby.characterDistance.label",
    descriptionKey: "settings.search.nearby.characterDistance.description",
    control: {
      kind: "number",
      min: nearbyCharacterDistanceRange.min,
      max: nearbyCharacterDistanceRange.max,
      step: 50
    },
    defaultValue: getCatalogDefaultValue("search.nearby.characterDistance")
  },
  {
    key: "search.nearby.paragraphDistance",
    category: "searchReplace",
    order: 300,
    labelKey: "settings.search.nearby.paragraphDistance.label",
    descriptionKey: "settings.search.nearby.paragraphDistance.description",
    control: {
      kind: "number",
      min: nearbyParagraphDistanceRange.min,
      max: nearbyParagraphDistanceRange.max,
      step: 1
    },
    defaultValue: getCatalogDefaultValue("search.nearby.paragraphDistance")
  },
  {
    key: "editor.paragraphIndent.excludeLeadingCharacters",
    category: "editor",
    order: 150,
    labelKey: "settings.editor.paragraphIndent.excludeLeadingCharacters.label",
    descriptionKey:
      "settings.editor.paragraphIndent.excludeLeadingCharacters.description",
    control: { kind: "text" },
    defaultValue: getCatalogDefaultValue(
      "editor.paragraphIndent.excludeLeadingCharacters"
    )
  },
  {
    key: "editor.emphasisMark.rule",
    category: "editor",
    order: 160,
    labelKey: "settings.editor.emphasisMark.rule.label",
    descriptionKey: "settings.editor.emphasisMark.rule.description",
    control: {
      kind: "select",
      options: [
        {
          value: "aozora",
          labelKey: "settings.editor.emphasisMark.rule.option.aozora.label"
        },
        {
          value: "kakuyomu",
          labelKey: "settings.editor.emphasisMark.rule.option.kakuyomu.label"
        },
        {
          value: "narou",
          labelKey: "settings.editor.emphasisMark.rule.option.narou.label"
        }
      ]
    },
    defaultValue: getCatalogDefaultValue("editor.emphasisMark.rule")
  },
  {
    key: "editor.emphasisMark.aozoraMark",
    category: "editor",
    order: 170,
    labelKey: "settings.editor.emphasisMark.aozoraMark.label",
    descriptionKey: "settings.editor.emphasisMark.aozoraMark.description",
    control: {
      kind: "select",
      options: [
        {
          value: "sesame",
          labelKey: "settings.editor.emphasisMark.aozoraMark.option.sesame.label"
        },
        {
          value: "whiteSesame",
          labelKey: "settings.editor.emphasisMark.aozoraMark.option.whiteSesame.label"
        },
        {
          value: "circle",
          labelKey: "settings.editor.emphasisMark.aozoraMark.option.circle.label"
        },
        {
          value: "whiteCircle",
          labelKey: "settings.editor.emphasisMark.aozoraMark.option.whiteCircle.label"
        },
        {
          value: "blackTriangle",
          labelKey: "settings.editor.emphasisMark.aozoraMark.option.blackTriangle.label"
        },
        {
          value: "whiteTriangle",
          labelKey: "settings.editor.emphasisMark.aozoraMark.option.whiteTriangle.label"
        },
        {
          value: "doubleCircle",
          labelKey: "settings.editor.emphasisMark.aozoraMark.option.doubleCircle.label"
        },
        {
          value: "fisheye",
          labelKey: "settings.editor.emphasisMark.aozoraMark.option.fisheye.label"
        },
        {
          value: "saltire",
          labelKey: "settings.editor.emphasisMark.aozoraMark.option.saltire.label"
        }
      ]
    },
    defaultValue: getCatalogDefaultValue("editor.emphasisMark.aozoraMark")
  },
  {
    key: "editor.emphasisMark.narouMarkText",
    category: "editor",
    order: 180,
    labelKey: "settings.editor.emphasisMark.narouMarkText.label",
    descriptionKey: "settings.editor.emphasisMark.narouMarkText.description",
    control: { kind: "text" },
    defaultValue: getCatalogDefaultValue("editor.emphasisMark.narouMarkText")
  },
  {
    key: "editor.ruby.rule",
    category: "editor",
    order: 190,
    labelKey: "settings.editor.ruby.rule.label",
    descriptionKey: "settings.editor.ruby.rule.description",
    control: {
      kind: "select",
      options: [
        {
          value: "aozora",
          labelKey: "settings.editor.ruby.rule.option.aozora.label"
        }
      ]
    },
    defaultValue: getCatalogDefaultValue("editor.ruby.rule")
  },
  {
    // #407: a plain path text field for B1 — the "[path] [Edit]" bespoke
    // control + save-destination dialog is a later slice. applicationWith-
    // ProjectOverride, so it also appears as a Project Settings override row.
    key: "imageAttachment.saveDirectory",
    category: "imageAttachment",
    order: 100,
    labelKey: "settings.imageAttachment.saveDirectory.label",
    descriptionKey: "settings.imageAttachment.saveDirectory.description",
    control: {
      kind: "custom",
      customKind: "imageAttachment.saveDirectory"
    },
    defaultValue: getCatalogDefaultValue("imageAttachment.saveDirectory")
  },
  {
    key: "imageAttachment.insertMarkdownLink",
    category: "imageAttachment",
    order: 200,
    labelKey: "settings.imageAttachment.insertMarkdownLink.label",
    descriptionKey: "settings.imageAttachment.insertMarkdownLink.description",
    control: { kind: "switch" },
    defaultValue: getCatalogDefaultValue("imageAttachment.insertMarkdownLink")
  },
  {
    key: "editor.lineEnding.expected",
    category: "editor",
    order: 200,
    labelKey: "settings.editor.lineEnding.expected.label",
    descriptionKey: "settings.editor.lineEnding.expected.description",
    control: {
      kind: "select",
      options: [
        {
          value: "lf",
          labelKey: "settings.editor.lineEnding.expected.option.lf.label"
        },
        {
          value: "crlf",
          labelKey: "settings.editor.lineEnding.expected.option.crlf.label"
        },
        {
          value: "cr",
          labelKey: "settings.editor.lineEnding.expected.option.cr.label"
        }
      ]
    },
    defaultValue: getCatalogDefaultValue("editor.lineEnding.expected")
  },
  {
    key: "editor.lineEnding.markerGlyph",
    category: "editor",
    order: 300,
    labelKey: "settings.editor.lineEnding.markerGlyph.label",
    // #252 issue text: font coverage for ⏎/↵/↓ varies, so the description
    // must warn that the glyph may not render depending on the user's font.
    descriptionKey: "settings.editor.lineEnding.markerGlyph.description",
    control: {
      kind: "select",
      options: [
        {
          value: "none",
          labelKey: "settings.editor.lineEnding.markerGlyph.option.none.label"
        },
        {
          value: "⏎",
          labelKey: "settings.editor.lineEnding.markerGlyph.option.returnSymbol.label"
        },
        {
          value: "↵",
          labelKey: "settings.editor.lineEnding.markerGlyph.option.downLeftArrow.label"
        },
        {
          value: "↓",
          labelKey: "settings.editor.lineEnding.markerGlyph.option.downArrow.label"
        }
      ]
    },
    defaultValue: getCatalogDefaultValue("editor.lineEnding.markerGlyph")
  },
  {
    key: "editor.whitespace.renderIdeographicSpace",
    category: "editor",
    order: 320,
    labelKey: "settings.editor.whitespace.renderIdeographicSpace.label",
    descriptionKey:
      "settings.editor.whitespace.renderIdeographicSpace.description",
    control: { kind: "switch" },
    defaultValue: getCatalogDefaultValue(
      "editor.whitespace.renderIdeographicSpace"
    )
  },
  {
    key: "editor.whitespace.renderAsciiSpace",
    category: "editor",
    order: 330,
    labelKey: "settings.editor.whitespace.renderAsciiSpace.label",
    descriptionKey: "settings.editor.whitespace.renderAsciiSpace.description",
    control: { kind: "switch" },
    defaultValue: getCatalogDefaultValue("editor.whitespace.renderAsciiSpace")
  },
  {
    key: "editor.whitespace.renderTab",
    category: "editor",
    order: 340,
    labelKey: "settings.editor.whitespace.renderTab.label",
    descriptionKey: "settings.editor.whitespace.renderTab.description",
    control: { kind: "switch" },
    defaultValue: getCatalogDefaultValue("editor.whitespace.renderTab")
  },
  {
    key: "editor.whitespace.renderOtherUnicodeSpace",
    category: "editor",
    order: 350,
    labelKey: "settings.editor.whitespace.renderOtherUnicodeSpace.label",
    descriptionKey:
      "settings.editor.whitespace.renderOtherUnicodeSpace.description",
    control: { kind: "switch" },
    defaultValue: getCatalogDefaultValue(
      "editor.whitespace.renderOtherUnicodeSpace"
    )
  },
  {
    key: "workbench.statusBar.characterCount.visible",
    category: "editor",
    order: 400,
    labelKey: "settings.workbench.statusBar.characterCount.visible.label",
    descriptionKey:
      "settings.workbench.statusBar.characterCount.visible.description",
    control: { kind: "switch" },
    defaultValue: getCatalogDefaultValue(
      "workbench.statusBar.characterCount.visible"
    )
  },
  {
    key: "editor.characterCount.exclude.whitespace",
    category: "editor",
    order: 410,
    labelKey: "settings.editor.characterCount.exclude.whitespace.label",
    descriptionKey:
      "settings.editor.characterCount.exclude.whitespace.description",
    control: { kind: "switch" },
    defaultValue: getCatalogDefaultValue(
      "editor.characterCount.exclude.whitespace"
    )
  },
  {
    key: "editor.characterCount.exclude.lineBreaks",
    category: "editor",
    order: 420,
    labelKey: "settings.editor.characterCount.exclude.lineBreaks.label",
    descriptionKey:
      "settings.editor.characterCount.exclude.lineBreaks.description",
    control: { kind: "switch" },
    defaultValue: getCatalogDefaultValue(
      "editor.characterCount.exclude.lineBreaks"
    )
  },
  {
    key: "editor.characterCount.exclude.headings",
    category: "editor",
    order: 430,
    labelKey: "settings.editor.characterCount.exclude.headings.label",
    descriptionKey: "settings.editor.characterCount.exclude.headings.description",
    control: { kind: "switch" },
    defaultValue: getCatalogDefaultValue(
      "editor.characterCount.exclude.headings"
    )
  },
  {
    key: "editor.characterCount.exclude.markdownSyntax",
    category: "editor",
    order: 440,
    labelKey: "settings.editor.characterCount.exclude.markdownSyntax.label",
    descriptionKey:
      "settings.editor.characterCount.exclude.markdownSyntax.description",
    control: { kind: "switch" },
    defaultValue: getCatalogDefaultValue(
      "editor.characterCount.exclude.markdownSyntax"
    )
  },
  {
    key: "editor.characterCount.exclude.markdownComments",
    category: "editor",
    order: 450,
    labelKey: "settings.editor.characterCount.exclude.markdownComments.label",
    descriptionKey:
      "settings.editor.characterCount.exclude.markdownComments.description",
    control: { kind: "switch" },
    defaultValue: getCatalogDefaultValue(
      "editor.characterCount.exclude.markdownComments"
    )
  },
  {
    key: "markdownFiles.encoding",
    category: "markdownFiles",
    order: 100,
    labelKey: "settings.markdownFiles.encoding.label",
    descriptionKey: "settings.markdownFiles.encoding.description",
    control: {
      kind: "select",
      options: [
        {
          value: "utf8",
          labelKey: "settings.markdownFiles.encoding.option.utf8.label"
        }
      ]
    },
    defaultValue: getCatalogDefaultValue("markdownFiles.encoding")
  },
  {
    key: "markdownFiles.lineEnding",
    category: "markdownFiles",
    order: 200,
    labelKey: "settings.markdownFiles.lineEnding.label",
    descriptionKey: "settings.markdownFiles.lineEnding.description",
    control: {
      kind: "select",
      options: [
        {
          value: "lf",
          labelKey: "settings.markdownFiles.lineEnding.option.lf.label"
        },
        {
          value: "crlf",
          labelKey: "settings.markdownFiles.lineEnding.option.crlf.label"
        }
      ]
    },
    defaultValue: getCatalogDefaultValue("markdownFiles.lineEnding")
  },
  {
    key: "textFiles.enablePlainTextDocuments",
    category: "textFiles",
    order: 100,
    labelKey: "settings.textFiles.enablePlainTextDocuments.label",
    descriptionKey: "settings.textFiles.enablePlainTextDocuments.description",
    control: { kind: "switch" },
    defaultValue: getCatalogDefaultValue("textFiles.enablePlainTextDocuments")
  },
  {
    key: "textFiles.encoding",
    category: "textFiles",
    order: 200,
    labelKey: "settings.textFiles.encoding.label",
    descriptionKey: "settings.textFiles.encoding.description",
    control: {
      kind: "select",
      options: [
        {
          value: "utf8",
          labelKey: "settings.textFiles.encoding.option.utf8.label"
        },
        {
          value: "utf8Bom",
          labelKey: "settings.textFiles.encoding.option.utf8Bom.label"
        },
        {
          value: "shiftJis",
          labelKey: "settings.textFiles.encoding.option.shiftJis.label"
        },
        {
          value: "eucJp",
          labelKey: "settings.textFiles.encoding.option.eucJp.label"
        },
        {
          value: "iso2022Jp",
          labelKey: "settings.textFiles.encoding.option.iso2022Jp.label"
        },
        {
          value: "utf16le",
          labelKey: "settings.textFiles.encoding.option.utf16le.label"
        },
        {
          value: "utf16leBom",
          labelKey: "settings.textFiles.encoding.option.utf16leBom.label"
        },
        {
          value: "utf16be",
          labelKey: "settings.textFiles.encoding.option.utf16be.label"
        },
        {
          value: "utf16beBom",
          labelKey: "settings.textFiles.encoding.option.utf16beBom.label"
        }
      ]
    },
    defaultValue: getCatalogDefaultValue("textFiles.encoding"),
    valueWarning: {
      when: (value) => value !== "utf8",
      severity: "warning",
      messageKey: "settings.textFiles.encoding.warning.nonUtf8"
    }
  },
  {
    key: "textFiles.lineEnding",
    category: "textFiles",
    order: 300,
    labelKey: "settings.textFiles.lineEnding.label",
    descriptionKey: "settings.textFiles.lineEnding.description",
    control: {
      kind: "select",
      options: [
        {
          value: "lf",
          labelKey: "settings.textFiles.lineEnding.option.lf.label"
        },
        {
          value: "crlf",
          labelKey: "settings.textFiles.lineEnding.option.crlf.label"
        }
      ]
    },
    defaultValue: getCatalogDefaultValue("textFiles.lineEnding")
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
        },
        {
          value: "narouHorizontal",
          labelKey: "settings.preview.renderer.option.narouHorizontal.label"
        },
        {
          value: "kakuyomuHorizontal",
          labelKey: "settings.preview.renderer.option.kakuyomuHorizontal.label"
        },
        {
          value: "aozoraHorizontal",
          labelKey: "settings.preview.renderer.option.aozoraHorizontal.label"
        }
      ]
    },
    defaultValue: getCatalogDefaultValue("preview.renderer")
  },
  {
    key: "preview.fontFamilyList",
    category: "preview",
    order: 105,
    labelKey: "settings.preview.fontFamilyList.label",
    descriptionKey: "settings.preview.fontFamilyList.description",
    control: { kind: "custom", customKind: "fontFamilyList" },
    defaultValue: getCatalogDefaultValue("preview.fontFamilyList")
  },
  {
    key: "preview.updateDelayMs",
    category: "preview",
    order: 200,
    labelKey: "settings.preview.updateDelayMs.label",
    descriptionKey: "settings.preview.updateDelayMs.description",
    control: {
      kind: "number",
      min: previewUpdateDelayRange.min,
      max: previewUpdateDelayRange.max,
      step: 1000
    },
    defaultValue: getCatalogDefaultValue("preview.updateDelayMs")
  },
  {
    key: "preview.syncScrollEditorToPreview",
    category: "preview",
    order: 300,
    labelKey: "settings.preview.syncScrollEditorToPreview.label",
    descriptionKey: "settings.preview.syncScrollEditorToPreview.description",
    control: { kind: "switch" },
    defaultValue: getCatalogDefaultValue("preview.syncScrollEditorToPreview")
  },
  {
    key: "preview.syncScrollPreviewToEditor",
    category: "preview",
    order: 310,
    labelKey: "settings.preview.syncScrollPreviewToEditor.label",
    descriptionKey: "settings.preview.syncScrollPreviewToEditor.description",
    control: { kind: "switch" },
    defaultValue: getCatalogDefaultValue("preview.syncScrollPreviewToEditor")
  },
  {
    key: "preview.doubleClickJumpToEditor",
    category: "preview",
    order: 320,
    labelKey: "settings.preview.doubleClickJumpToEditor.label",
    descriptionKey: "settings.preview.doubleClickJumpToEditor.description",
    control: { kind: "switch" },
    defaultValue: getCatalogDefaultValue("preview.doubleClickJumpToEditor")
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
    key: "workbench.normalizeUnicodeToNfc",
    category: "application",
    order: 350,
    labelKey: "settings.workbench.normalizeUnicodeToNfc.label",
    descriptionKey: "settings.workbench.normalizeUnicodeToNfc.description",
    control: { kind: "switch" },
    defaultValue: getCatalogDefaultValue("workbench.normalizeUnicodeToNfc")
  },
  {
    key: "workbench.notification.durationMs",
    category: "application",
    order: 400,
    labelKey: "settings.workbench.notification.durationMs.label",
    descriptionKey:
      "settings.workbench.notification.durationMs.description",
    control: {
      kind: "number",
      min: notificationDurationRange.min,
      max: notificationDurationRange.max,
      step: 1000
    },
    defaultValue: getCatalogDefaultValue(
      "workbench.notification.durationMs"
    )
  },
  {
    key: "notification.output.enabled",
    category: "application",
    order: 390,
    labelKey: "settings.notification.output.enabled.label",
    descriptionKey: "settings.notification.output.enabled.description",
    control: { kind: "switch" },
    defaultValue: getCatalogDefaultValue("notification.output.enabled")
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
    key: "commandPalette.footerDetail.enable",
    category: "commands",
    order: 100,
    labelKey: "settings.commandPalette.footerDetail.enable.label",
    descriptionKey: "settings.commandPalette.footerDetail.enable.description",
    control: { kind: "switch" },
    defaultValue: getCatalogDefaultValue("commandPalette.footerDetail.enable")
  },
  {
    key: "commandPalette.footerDetail.marquee.delay",
    category: "commands",
    order: 200,
    labelKey: "settings.commandPalette.footerDetail.marquee.delay.label",
    descriptionKey:
      "settings.commandPalette.footerDetail.marquee.delay.description",
    control: {
      kind: "number",
      min: commandPaletteFooterDetailMarqueeDelayRange.min,
      max: commandPaletteFooterDetailMarqueeDelayRange.max
    },
    defaultValue: getCatalogDefaultValue(
      "commandPalette.footerDetail.marquee.delay"
    )
  },
  {
    key: "commandPalette.footerDetail.marquee.speed",
    category: "commands",
    order: 300,
    labelKey: "settings.commandPalette.footerDetail.marquee.speed.label",
    descriptionKey:
      "settings.commandPalette.footerDetail.marquee.speed.description",
    control: {
      kind: "number",
      min: commandPaletteFooterDetailMarqueeSpeedRange.min,
      max: commandPaletteFooterDetailMarqueeSpeedRange.max
    },
    defaultValue: getCatalogDefaultValue(
      "commandPalette.footerDetail.marquee.speed"
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

/**
 * Setting catalog items that are specific to Project Settings UI discovery
 * (e.g. composite/bespoke editors that are managed directly by bespoke sections
 * in Application Settings and must not be duplicated into Application Settings'
 * generic setting rows).
 */
export const projectSpecificSettingCatalogItems: readonly SettingCatalogItem[] = [
  {
    key: "documentMap.dialogueDelimiterPairs",
    category: "documentMap",
    order: 100,
    labelKey: "settings.documentMap.dialogueDelimiterPairs.label",
    descriptionKey: "settings.documentMap.dialogueDelimiterPairs.description",
    control: {
      kind: "custom",
      customKind: "documentMap.dialogueDelimiterPairs"
    },
    defaultValue: getCatalogDefaultValue("documentMap.dialogueDelimiterPairs")
  }
];
