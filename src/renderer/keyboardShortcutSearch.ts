/**
 * #646: search over the Keyboard Shortcuts rows. Pure; simple case-insensitive
 * partial matching (no fuzzy search).
 */

import type { TranslationKey } from "../shared/i18n";
import { jaTranslations } from "../shared/i18n/ja";
import {
  isReadonlyCommandGroup,
  isModifiedCommandGroup,
  isUnassignedCommandGroup,
  type KeyboardShortcutCommandGroup,
  type KeyboardShortcutOriginKind,
  type KeyboardShortcutRow
} from "../shared/keybindings";

/** The user-visible source label: Pergamum / Native / 標準機能. */
export type KeyboardShortcutSourceLabel = (
  source: KeyboardShortcutRow["source"]
) => string;

/**
 * Rows whose title, commandId, key label, raw key, category, scope, when or
 * source label contains `query` (trimmed, case-insensitive). An empty query
 * returns every row in its existing order.
 */
/** The localized category label (the internal value is searched too). */
export type KeyboardShortcutCategoryLabel = (category: string) => string;

/** The description shown for a command (localized when a translation exists). */
export type KeyboardShortcutDescriptionLabel = (commandId: string, description: string) => string;

export type KeyboardShortcutOriginLabel = (origin: KeyboardShortcutOriginKind) => string;

export function filterKeyboardShortcutRows(
  rows: readonly KeyboardShortcutRow[],
  query: string,
  sourceLabel: KeyboardShortcutSourceLabel,
  originLabel?: KeyboardShortcutOriginLabel,
  categoryLabel?: KeyboardShortcutCategoryLabel,
  descriptionLabel?: KeyboardShortcutDescriptionLabel
): KeyboardShortcutRow[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return [...rows];
  }
  return rows.filter((row) =>
    [
      row.title,
      row.commandId,
      row.keyLabel,
      row.key,
      row.category,
      row.description,
      descriptionLabel === undefined ? null : descriptionLabel(row.commandId, row.description),
      categoryLabel === undefined ? null : categoryLabel(row.category),
      row.scope,
      row.when,
      sourceLabel(row.source),
      row.originKind === null || originLabel === undefined
        ? null
        : originLabel(row.originKind)
    ].some(
      (field) => field !== null && field.toLowerCase().includes(needle)
    )
  );
}

/**
 * #648: groups with at least one matching binding row. A match on one row
 * shows the whole group, so a command's other keys stay visible. An empty
 * query returns every group.
 */
export function filterKeyboardShortcutGroups(
  groups: readonly KeyboardShortcutCommandGroup[],
  query: string,
  sourceLabel: KeyboardShortcutSourceLabel,
  originLabel?: KeyboardShortcutOriginLabel,
  categoryLabel?: KeyboardShortcutCategoryLabel,
  descriptionLabel?: KeyboardShortcutDescriptionLabel
): KeyboardShortcutCommandGroup[] {
  if (query.trim() === "") {
    return [...groups];
  }
  return groups.filter(
    (group) =>
      filterKeyboardShortcutRows(
        group.bindings,
        query,
        sourceLabel,
        originLabel,
        categoryLabel,
        descriptionLabel
      ).length > 0
  );
}

/**
 * #649: how a category is shown. The internal value stays as it is in the
 * catalog ("Edit" is the native clipboard group, "Editor" the editor
 * commands); only the label differs, so the two are not confused.
 */
export const KEYBOARD_SHORTCUT_CATEGORY_LABEL_KEYS: Readonly<Record<string, TranslationKey>> = {
  "Application": "keyboardShortcuts.category.application",
  "Command Palette": "keyboardShortcuts.category.commandPalette",
  "Developer": "keyboardShortcuts.category.developer",
  "Edit": "keyboardShortcuts.category.edit",
  "Editor": "keyboardShortcuts.category.editor",
  "File": "keyboardShortcuts.category.file",
  "File Explorer": "keyboardShortcuts.category.fileExplorer",
  "Glossary": "keyboardShortcuts.category.glossary",
  "Markdown": "keyboardShortcuts.category.markdown",
  "Search": "keyboardShortcuts.category.search",
  "View": "keyboardShortcuts.category.view",
  "Window": "keyboardShortcuts.category.window"
};

/** #649: the display filters of the Keyboard Shortcuts screen (not persisted). */
export type KeyboardShortcutView = "all" | "modified" | "unassigned";

export interface KeyboardShortcutFilterState {
  readonly query: string;
  readonly category: string | "all";
  readonly view: KeyboardShortcutView;
  readonly showReadonly: boolean;
}

export const DEFAULT_KEYBOARD_SHORTCUT_FILTER: KeyboardShortcutFilterState = {
  query: "",
  category: "all",
  view: "all",
  showReadonly: false
};

export function isDefaultKeyboardShortcutFilter(
  filter: KeyboardShortcutFilterState
): boolean {
  return (
    filter.query === DEFAULT_KEYBOARD_SHORTCUT_FILTER.query &&
    filter.category === DEFAULT_KEYBOARD_SHORTCUT_FILTER.category &&
    filter.view === DEFAULT_KEYBOARD_SHORTCUT_FILTER.view &&
    filter.showReadonly === DEFAULT_KEYBOARD_SHORTCUT_FILTER.showReadonly
  );
}

/**
 * #649: categories offered by the dropdown, in order of first appearance.
 * They follow only `showReadonly` (never the query or the view), so a
 * category does not vanish while typing.
 */
export function deriveKeyboardShortcutCategories(
  groups: readonly KeyboardShortcutCommandGroup[],
  showReadonly: boolean
): string[] {
  const categories: string[] = [];
  for (const group of groups) {
    if (
      (showReadonly || !isReadonlyCommandGroup(group)) &&
      !categories.includes(group.category)
    ) {
      categories.push(group.category);
    }
  }
  return categories;
}

/**
 * #649: the filter after `showReadonly` (or the groups) changed: a
 * selected category that is no longer offered falls back to `all`.
 */
export function normalizeKeyboardShortcutFilter(
  filter: KeyboardShortcutFilterState,
  groups: readonly KeyboardShortcutCommandGroup[]
): KeyboardShortcutFilterState {
  if (
    filter.category !== "all" &&
    !deriveKeyboardShortcutCategories(groups, filter.showReadonly).includes(
      filter.category
    )
  ) {
    return { ...filter, category: "all" };
  }
  return filter;
}

/**
 * #649: every active condition is ANDed: assignable (unless
 * `showReadonly`), category, view, then the text query. A group that
 * passes is returned whole, with all of its bindings.
 */
export function applyKeyboardShortcutFilter(
  groups: readonly KeyboardShortcutCommandGroup[],
  filter: KeyboardShortcutFilterState,
  sourceLabel: KeyboardShortcutSourceLabel,
  originLabel?: KeyboardShortcutOriginLabel,
  categoryLabel?: KeyboardShortcutCategoryLabel,
  descriptionLabel?: KeyboardShortcutDescriptionLabel
): KeyboardShortcutCommandGroup[] {
  const narrowed = groups.filter(
    (group) =>
      (filter.showReadonly || !isReadonlyCommandGroup(group)) &&
      (filter.category === "all" || group.category === filter.category) &&
      (filter.view === "all" ||
        (filter.view === "modified"
          ? isModifiedCommandGroup(group)
          : isUnassignedCommandGroup(group)))
  );
  return filterKeyboardShortcutGroups(
    narrowed,
    filter.query,
    sourceLabel,
    originLabel,
    categoryLabel,
    descriptionLabel
  );
}

/**
 * #649: the key of a command's localized description, or null when there is
 * none (the catalog's English `description` is then the fallback).
 */
export function commandDescriptionKey(commandId: string): TranslationKey | null {
  const key = `keyboardShortcuts.commandDescription.${commandId}`;
  return key in jaTranslations ? (key as TranslationKey) : null;
}

/**
 * #649: the description SHOWN for a command. A localized description is
 * always preferred; when there is none, the English catalog text is shown in
 * the English UI only. The Japanese UI shows nothing rather than English.
 * (Search still looks at the raw catalog text in every language.)
 */
export function displayCommandDescription(
  commandId: string,
  rawDescription: string,
  translate: (key: TranslationKey) => string,
  language: "ja" | "en"
): string {
  const key = commandDescriptionKey(commandId);
  if (key !== null) {
    return translate(key);
  }
  return language === "en" ? rawDescription : "";
}
