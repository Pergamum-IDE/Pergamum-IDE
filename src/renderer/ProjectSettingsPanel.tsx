import {
  useState,
  useEffect,
  type ChangeEvent,
  type FocusEvent
} from "react";
import type {
  ProjectSettings,
  UpdateProjectNameResult,
  UpdateProjectSettingsRequest
} from "../shared/api";
import { validateProjectName } from "../shared/projectName";
import type { Translate } from "../shared/i18n";
import type { SaveApplicationSettingsRequest } from "../shared/settings";
import {
  getCatalogDefaultValue,
  getCatalogEntry,
  validateCatalogValue,
  type SettingKey,
  type SettingScope
} from "../shared/settingsCatalog";
import {
  areDialogueDelimiterPairsEqual,
  defaultDocumentMapDialogueDelimiterPairs,
  type DocumentMapDialogueDelimiterPair
} from "../shared/documentMapSettings";
import {
  buildSettingSearchText,
  projectSpecificSettingCatalogItems,
  settingCatalogItems,
  settingCategoryCatalog,
  settingCategoryLabelKey,
  sortSettingCatalogItems,
  sortSettingCategoryCatalog,
  type I18nKey,
  type SettingCatalogItem,
  type SettingCategory,
  type SettingCategoryCatalogItem,
  type SettingControl
} from "../shared/settingsUiCatalog";
import searchIcon from "../../assets/icons/feather/global/search.svg?raw";
import { readSettingValue } from "./settingsValueByKey";
import { DialogueDelimiterPairsEditor } from "./DialogueDelimiterPairsEditor";
import {
  SaveDestinationDialog,
  SaveDestinationSettingControl
} from "./dialog/SaveDestinationDialog";

export function isProjectSettingsScope(scope: SettingScope): boolean {
  return scope === "applicationWithProjectOverride" || scope === "projectOnly";
}

export function isProjectOverrideEligibleScope(scope: SettingScope): boolean {
  return scope === "applicationWithProjectOverride";
}

export function isSupportedProjectSettingControl(
  control: SettingControl
): boolean {
  return (
    control.kind === "text" ||
    control.kind === "select" ||
    control.kind === "switch" ||
    control.kind === "number" ||
    control.kind === "custom"
  );
}

export const allProjectSettingCatalogItems: readonly SettingCatalogItem[] = [
  ...settingCatalogItems,
  ...projectSpecificSettingCatalogItems
];

export function getProjectSettingsUiItems(
  items: readonly SettingCatalogItem[] = allProjectSettingCatalogItems,
  categories: readonly SettingCategoryCatalogItem[] = settingCategoryCatalog
): readonly SettingCatalogItem[] {
  const eligible = items.filter((item) => {
    const entry = getCatalogEntry(item.key);
    // projectOnly belongs to Project scope conceptually, but does not have inheritance
    // semantics and must NOT flow into the current applicationWithProjectOverride presentation.
    return isProjectOverrideEligibleScope(entry.scope);
  });
  return sortSettingCatalogItems(eligible, categories);
}

export type ProjectSettingCategoryFilter = "all" | SettingCategory;

export interface ProjectSettingCategoryItem {
  readonly id: ProjectSettingCategoryFilter;
  readonly labelKey: string;
}

export function normalizeProjectSettingsSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function matchesProjectSettingSearch(
  item: SettingCatalogItem,
  normalizedQuery: string,
  translate: Translate,
  categories: readonly SettingCategoryCatalogItem[] = settingCategoryCatalog
): boolean {
  if (normalizedQuery.length === 0) {
    return true;
  }
  const searchText = buildSettingSearchText(
    item,
    (key) => translate(key as any),
    categories
  ).toLowerCase();
  return searchText.includes(normalizedQuery);
}

export function matchesProjectSettingCategory(
  item: SettingCatalogItem,
  categoryFilter: ProjectSettingCategoryFilter
): boolean {
  if (categoryFilter === "all") {
    return true;
  }
  return item.category === categoryFilter;
}

export function filterProjectSettingItems(
  items: readonly SettingCatalogItem[],
  categoryFilter: ProjectSettingCategoryFilter,
  searchQuery: string,
  translate: Translate,
  categories: readonly SettingCategoryCatalogItem[] = settingCategoryCatalog
): readonly SettingCatalogItem[] {
  const normalizedQuery = normalizeProjectSettingsSearchQuery(searchQuery);
  return items.filter((item) => {
    return (
      matchesProjectSettingCategory(item, categoryFilter) &&
      matchesProjectSettingSearch(item, normalizedQuery, translate, categories)
    );
  });
}

export function getEligibleProjectSettingCategories(
  eligibleItems: readonly SettingCatalogItem[],
  translate: Translate,
  categories: readonly SettingCategoryCatalogItem[] = settingCategoryCatalog,
  options?: { readonly includeProjectCategory?: boolean }
): readonly ProjectSettingCategoryItem[] {
  const categoryIds = new Set<SettingCategory>(
    eligibleItems.map((item) => item.category)
  );
  if (options?.includeProjectCategory) {
    categoryIds.add("project");
  }

  const sortedCategories = sortSettingCategoryCatalog(
    (key) => translate(key as any),
    categories
  );

  const matchingCategories: ProjectSettingCategoryItem[] = sortedCategories
    .filter((cat) => categoryIds.has(cat.id))
    .map((cat) => ({
      id: cat.id,
      labelKey: cat.labelKey
    }));

  return [
    { id: "all", labelKey: "settings.category.all.label" },
    ...matchingCategories
  ];
}

export function readProjectSettingValue(
  key: SettingKey,
  settings: ProjectSettings | undefined
): unknown {
  if (!settings) {
    return undefined;
  }
  switch (key) {
    case "editor.fontFamily":
      return settings.editor?.fontFamily;
    case "preview.renderer":
      return settings.preview?.renderer;
    case "editor.paragraphIndent.excludeLeadingCharacters":
      return settings.editor?.paragraphIndent?.excludeLeadingCharacters;
    case "editor.characterCount.exclude.whitespace":
      return settings.editor?.characterCount?.exclude?.whitespace;
    case "editor.characterCount.exclude.lineBreaks":
      return settings.editor?.characterCount?.exclude?.lineBreaks;
    case "editor.characterCount.exclude.headings":
      return settings.editor?.characterCount?.exclude?.headings;
    case "editor.characterCount.exclude.markdownSyntax":
      return settings.editor?.characterCount?.exclude?.markdownSyntax;
    case "editor.characterCount.exclude.markdownComments":
      return settings.editor?.characterCount?.exclude?.markdownComments;
    case "editor.lineEnding.expected":
      return settings.editor?.lineEnding?.expected;
    case "files.newFile.lineEnding":
      return settings.files?.newFile?.lineEnding;
    case "documentMap.dialogueDelimiterPairs":
      return settings.documentMap?.dialogueDelimiterPairs;
    case "imageAttachment.saveDirectory":
      return settings.imageAttachment?.saveDirectory;
    case "imageAttachment.insertMarkdownLink":
      return settings.imageAttachment?.insertMarkdownLink;
    case "search.nearby.unit":
      return settings.search?.nearby?.unit;
    case "search.nearby.characterDistance":
      return settings.search?.nearby?.characterDistance;
    case "search.nearby.paragraphDistance":
      return settings.search?.nearby?.paragraphDistance;
    default:
      return undefined;
  }
}

export type PartialApplicationSettings = {
  [K in keyof SaveApplicationSettingsRequest]?: Partial<SaveApplicationSettingsRequest[K]>;
};

export function readInheritedSettingValue(
  key: SettingKey,
  applicationSettings?: PartialApplicationSettings,
  legacyFontFallback?: string
): unknown {
  if (key === "editor.fontFamily") {
    if (applicationSettings?.editor?.fontFamily !== undefined) {
      return applicationSettings.editor.fontFamily;
    }
    if (legacyFontFallback !== undefined) {
      return legacyFontFallback;
    }
  } else if (key === "preview.renderer") {
    if (applicationSettings?.preview?.renderer !== undefined) {
      return applicationSettings.preview.renderer;
    }
  } else if (key === "documentMap.dialogueDelimiterPairs") {
    if (applicationSettings?.documentMap?.dialogueDelimiterPairs !== undefined) {
      return applicationSettings.documentMap.dialogueDelimiterPairs;
    }
    return defaultDocumentMapDialogueDelimiterPairs();
  } else if (applicationSettings) {
    try {
      return readSettingValue(
        key,
        applicationSettings as SaveApplicationSettingsRequest
      );
    } catch {
      // Fall through to catalog default
    }
  }
  return getCatalogDefaultValue(key);
}

export function readEffectiveProjectSettingValue(
  key: SettingKey,
  projectSettings: ProjectSettings | undefined,
  applicationSettings?: PartialApplicationSettings,
  legacyFontFallback?: string
): unknown {
  const projectValue = readProjectSettingValue(key, projectSettings);
  if (projectValue !== undefined) {
    return projectValue;
  }
  return readInheritedSettingValue(key, applicationSettings, legacyFontFallback);
}

export function isProjectSettingModified(
  key: SettingKey,
  projectSettings: ProjectSettings | undefined,
  applicationSettings?: PartialApplicationSettings,
  legacyFontFallback?: string
): boolean {
  const projectVal = readProjectSettingValue(key, projectSettings);
  if (projectVal === undefined) {
    return false;
  }
  const inheritedVal = readInheritedSettingValue(
    key,
    applicationSettings,
    legacyFontFallback
  );
  if (key === "documentMap.dialogueDelimiterPairs") {
    return !areDialogueDelimiterPairsEqual(
      projectVal as readonly DocumentMapDialogueDelimiterPair[] | undefined,
      inheritedVal as readonly DocumentMapDialogueDelimiterPair[] | undefined
    );
  }
  // If the persisted override equals the inherited value, normalize presentation as unchanged.
  return projectVal !== inheritedVal;
}

export function createDifferentialProjectSettingRequest(
  key: SettingKey,
  newValue: unknown,
  inheritedValue: unknown
): UpdateProjectSettingsRequest {
  if (key === "documentMap.dialogueDelimiterPairs") {
    if (
      areDialogueDelimiterPairsEqual(
        newValue as readonly DocumentMapDialogueDelimiterPair[] | undefined,
        inheritedValue as readonly DocumentMapDialogueDelimiterPair[] | undefined
      )
    ) {
      return { remove: [key] };
    }
    return { set: { [key]: newValue } };
  }
  if (newValue === inheritedValue) {
    return { remove: [key] };
  }
  return { set: { [key]: newValue } };
}

export function createProjectSettingResetRequest(
  key: SettingKey
): UpdateProjectSettingsRequest {
  return { remove: [key] };
}

// Slice 3/4/5 backward compatibility alias
export function createProjectSettingOverrideRequest(
  key: SettingKey,
  isCurrentlyOverridden: boolean,
  inheritedValue: unknown
): UpdateProjectSettingsRequest {
  if (isCurrentlyOverridden) {
    return { remove: [key] };
  }
  return { set: { [key]: inheritedValue } };
}

// Slice 3/4 backward compatibility alias
export function createProjectSettingsFontOverrideRequest(
  isCurrentlyOverridden: boolean,
  inheritedFontFamily: string
): UpdateProjectSettingsRequest {
  return createProjectSettingOverrideRequest(
    "editor.fontFamily",
    isCurrentlyOverridden,
    inheritedFontFamily
  );
}

export function validateProjectSettingValue(
  key: SettingKey,
  value: unknown,
  committedValue: unknown
): { ok: true; value: unknown | undefined } | { ok: false; failure: string } {
  if (key === "documentMap.dialogueDelimiterPairs") {
    const validation = validateCatalogValue(key, value);
    if (!validation.ok) {
      return { ok: false, failure: validation.failure };
    }
    const normalizedValue =
      validation.value !== undefined ? validation.value : value;
    if (
      areDialogueDelimiterPairsEqual(
        normalizedValue as readonly DocumentMapDialogueDelimiterPair[] | undefined,
        committedValue as readonly DocumentMapDialogueDelimiterPair[] | undefined
      )
    ) {
      return { ok: true, value: undefined };
    }
    return { ok: true, value: normalizedValue };
  }

  if (typeof value === "string") {
    const processedValue = key === "editor.fontFamily" ? value.trim() : value;
    const committedStr =
      typeof committedValue === "string"
        ? (key === "editor.fontFamily" ? committedValue.trim() : committedValue)
        : undefined;
    if (committedStr !== undefined && processedValue === committedStr) {
      return { ok: true, value: undefined };
    }
    const validation = validateCatalogValue(key, processedValue);
    if (!validation.ok) {
      return { ok: false, failure: validation.failure };
    }
    return { ok: true, value: processedValue };
  }

  if (value === committedValue) {
    return { ok: true, value: undefined };
  }

  const validation = validateCatalogValue(key, value);
  if (!validation.ok) {
    return { ok: false, failure: validation.failure };
  }
  return { ok: true, value };
}

// Slice 3/4 backward compatibility alias
export function validateProjectFontFamily(
  value: string,
  committedValue: string | undefined
): { ok: true; value: string | undefined } | { ok: false; failure: string } {
  return validateProjectSettingValue(
    "editor.fontFamily",
    value,
    committedValue ?? ""
  ) as { ok: true; value: string | undefined } | { ok: false; failure: string };
}

export interface ProjectSettingFieldProps {
  label: string;
  description?: string;
  settingKey: string;
  isModified: boolean;
  isReadOnly: boolean;
  isSaving?: boolean;
  resetLabel: string;
  modifiedLabel: string;
  onReset: () => void;
  children?: React.ReactNode;
}

export function ProjectSettingField({
  label,
  description,
  settingKey,
  isModified,
  isReadOnly,
  isSaving = false,
  resetLabel,
  modifiedLabel,
  onReset,
  children
}: ProjectSettingFieldProps): JSX.Element {
  const labelId = `${settingKey.replace(/\./g, "-")}-label`;
  return (
    <div className="settingsItemRow projectSettingField">
      <div className="settingsItemHeader">
        <span id={labelId} className="settingsItemLabel">
          {label}
        </span>
        {isModified ? (
          <span className="projectSettingHeaderActions">
            <button
              type="button"
              className="projectSettingResetButton"
              disabled={isReadOnly || isSaving}
              onClick={onReset}
              title={resetLabel}
              aria-label={resetLabel}
            >
              ↺
            </button>
            <span className="projectSettingModifiedBadge" role="status">
              {modifiedLabel}
            </span>
          </span>
        ) : null}
      </div>
      {children}
      {description ? (
        <p className="settingsDescription">{description}</p>
      ) : null}
      <code className="settingsItemKey">{settingKey}</code>
    </div>
  );
}

// Backwards-compatible alias for ProjectSettingOverrideField
export const ProjectSettingOverrideField = ProjectSettingField;

export interface ProjectSettingItemViewState {
  item: SettingCatalogItem;
  isModified: boolean;
  displayValue: string;
  effectiveValue: unknown;
}

export interface ProjectSettingsCategoryGroup {
  category: SettingCategory;
  categoryLabelKey: I18nKey;
  items: ProjectSettingItemViewState[];
}

export function groupProjectSettingItemsByCategory(
  items: readonly ProjectSettingItemViewState[]
): readonly ProjectSettingsCategoryGroup[] {
  const groups: ProjectSettingsCategoryGroup[] = [];
  for (const viewItem of items) {
    let group = groups.find((g) => g.category === viewItem.item.category);
    if (!group) {
      group = {
        category: viewItem.item.category,
        categoryLabelKey: settingCategoryLabelKey(viewItem.item.category),
        items: []
      };
      groups.push(group);
    }
    group.items.push(viewItem);
  }
  return groups;
}

export interface ProjectSettingsPanelViewProps {
  translate: Translate;
  projectName?: string;
  projectNameDraft?: string;
  isProjectNameDirty?: boolean;
  projectNameError?: string | null;
  isSavingProjectName?: boolean;
  onProjectNameChange?: (value: string) => void;
  onProjectNameFocus?: () => void;
  onProjectNameBlur?: () => void;
  items: readonly ProjectSettingItemViewState[];
  categories: readonly ProjectSettingCategoryItem[];
  selectedCategoryId: ProjectSettingCategoryFilter;
  onSelectCategory: (category: ProjectSettingCategoryFilter) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  isReadOnly: boolean;
  isSaving: boolean;
  error: string | null;
  onReset: (key: SettingKey) => void;
  onTextChange?: (key: SettingKey, value: string) => void;
  onTextFocus?: (key: SettingKey) => void;
  onTextBlur?: (key: SettingKey) => void;
  onSelectChange?: (key: SettingKey, value: string) => void;
  onNumberChange?: (key: SettingKey, value: number) => void;
  onSwitchChange?: (key: SettingKey, checked: boolean) => void;
  onDialoguePairsCommit?: (
    key: SettingKey,
    value: DocumentMapDialogueDelimiterPair[]
  ) => void;
  onOpenImageAttachmentDialog?: (opener?: Element | null) => void;
}

function translateI18nKey(translate: Translate, key: string): string {
  return translate(key as any);
}

export function ProjectSettingsPanelView({
  translate,
  projectName,
  projectNameDraft = projectName ?? "",
  isProjectNameDirty = false,
  projectNameError = null,
  isSavingProjectName = false,
  onProjectNameChange,
  onProjectNameFocus,
  onProjectNameBlur,
  items,
  categories,
  selectedCategoryId,
  onSelectCategory,
  searchQuery,
  onSearchQueryChange,
  isReadOnly,
  isSaving,
  error,
  onReset,
  onTextChange,
  onTextFocus,
  onTextBlur,
  onSelectChange,
  onNumberChange,
  onSwitchChange,
  onDialoguePairsCommit,
  onOpenImageAttachmentDialog
}: ProjectSettingsPanelViewProps): JSX.Element {
  const categoryGroups = groupProjectSettingItemsByCategory(items);

  const normalizedSearch = normalizeProjectSettingsSearchQuery(searchQuery);
  const isProjectCategorySelected =
    (selectedCategoryId === "all" || selectedCategoryId === "project") &&
    projectName !== undefined;
  const matchesProjectNameSearch =
    normalizedSearch.length === 0 ||
    "プロジェクト名".toLowerCase().includes(normalizedSearch) ||
    "project name".toLowerCase().includes(normalizedSearch) ||
    "プロジェクト全般".toLowerCase().includes(normalizedSearch) ||
    "general".toLowerCase().includes(normalizedSearch) ||
    "project".toLowerCase().includes(normalizedSearch) ||
    translate("settings.project.name.label").toLowerCase().includes(normalizedSearch) ||
    translate("settings.category.project.label").toLowerCase().includes(normalizedSearch) ||
    translate("settings.project.name.description").toLowerCase().includes(normalizedSearch);

  const shouldShowProjectGeneralPane =
    isProjectCategorySelected && matchesProjectNameSearch;

  return (
    <section
      className="settingsPanel projectSettingsPanel"
      aria-labelledby="projectSettingsTitle"
    >
      <header className="settingsPanelHeader">
        <h1 id="projectSettingsTitle">
          {translate("settings.project.title")}
        </h1>
        <p>{translate("settings.project.description")}</p>
        {isReadOnly ? (
          <div className="projectSettingsNotice" role="status">
            {translate("settings.project.readOnlyNotice")}
          </div>
        ) : null}
        {error ? (
          <div className="settingsError" role="alert">
            {error}
          </div>
        ) : null}
      </header>

      <div className="settingsSearch">
        <span
          className="settingsSearchIcon"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: searchIcon }}
        />
        <input
          id="projectSettingsSearchInput"
          className="settingsSearchInput"
          type="search"
          value={searchQuery}
          disabled={isSaving}
          placeholder={translate("settings.search.placeholder")}
          aria-label={translate("settings.search.label")}
          onChange={(event) => onSearchQueryChange(event.target.value)}
        />
      </div>

      <div className="settingsBody">
        <nav
          className="settingsCategoryPane"
          aria-label={translate("settings.category.paneLabel")}
        >
          <ul className="settingsCategoryList">
            {categories.map((category) => {
              const isSelected = category.id === selectedCategoryId;

              return (
                <li key={category.id}>
                  <button
                    type="button"
                    className={
                      isSelected
                        ? "settingsCategoryButton settingsCategoryButtonSelected"
                        : "settingsCategoryButton"
                    }
                    aria-current={isSelected ? "true" : undefined}
                    disabled={isSaving}
                    onClick={() => onSelectCategory(category.id)}
                  >
                    {translateI18nKey(translate, category.labelKey)}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="projectSettingsContent">
          {!shouldShowProjectGeneralPane && items.length === 0 ? (
            <p className="settingsSearchEmpty">
              {translate("settings.search.empty")}
            </p>
          ) : (
            <>
              {shouldShowProjectGeneralPane ? (
                <div
                  key="project"
                  className="settingsItemPane"
                  data-settings-category="project"
                >
                  <h2 className="settingsItemPaneHeading">
                    {translate("settings.category.project.label")}
                  </h2>
                  <div className="settingsItemList">
                    <div
                      className="settingsItemRow projectSettingField"
                      data-project-setting="name"
                    >
                      <div className="settingsItemHeader">
                        <label
                          htmlFor="projectNameInput"
                          className="settingsItemLabel"
                        >
                          {translate("settings.project.name.label")}
                        </label>
                        {isSavingProjectName ? (
                          <span
                            className="projectSettingSavingBadge"
                            role="status"
                          >
                            {translate("settings.project.name.saving")}
                          </span>
                        ) : isProjectNameDirty ? (
                          <span
                            className="projectSettingModifiedBadge"
                            role="status"
                          >
                            {translate("settings.project.modified")}
                          </span>
                        ) : null}
                      </div>
                      <div className="projectSettingInputWrapper">
                        <input
                          id="projectNameInput"
                          type="text"
                          className={`settingsTextInput${projectNameError ? " isError" : ""}`}
                          value={projectNameDraft}
                          disabled={
                            isReadOnly || isSavingProjectName || !projectName
                          }
                          onChange={(e) => onProjectNameChange?.(e.target.value)}
                          onFocus={() => onProjectNameFocus?.()}
                          onBlur={() => onProjectNameBlur?.()}
                          aria-label={translate("settings.project.name.label")}
                          aria-invalid={projectNameError ? "true" : undefined}
                          aria-describedby={
                            projectNameError
                              ? "projectNameError projectNameDescription"
                              : "projectNameDescription"
                          }
                        />
                      </div>
                      {projectNameError ? (
                        <p
                          id="projectNameError"
                          className="settingsFieldError"
                          role="alert"
                        >
                          {projectNameError}
                        </p>
                      ) : null}
                      <p
                        id="projectNameDescription"
                        className="settingsDescription"
                      >
                        {translate("settings.project.name.description")}
                      </p>
                      <code className="settingsItemKey">project.name</code>
                    </div>
                  </div>
                </div>
              ) : null}
              {categoryGroups.map((group) => (
                <div key={group.category} className="settingsItemPane">
                <h2 className="settingsItemPaneHeading">
                  {translateI18nKey(translate, group.categoryLabelKey)}
                </h2>
                <div className="settingsItemList">
                  {group.items.map(
                    ({ item, isModified, displayValue, effectiveValue }) => {
                      const labelId = `${item.key.replace(/\./g, "-")}-label`;

                      let controlElement: JSX.Element | null = null;
                      if (item.control.kind === "text") {
                        controlElement = (
                          <input
                            type="text"
                            className="settingsTextInput"
                            value={displayValue}
                            disabled={isReadOnly || isSaving}
                            onChange={(e) => {
                              onTextChange?.(item.key, e.target.value);
                            }}
                            onFocus={() => {
                              onTextFocus?.(item.key);
                            }}
                            onBlur={() => {
                              onTextBlur?.(item.key);
                            }}
                            aria-labelledby={labelId}
                          />
                        );
                      } else if (item.control.kind === "select") {
                        controlElement = (
                          <select
                            className="settingsSelect"
                            value={displayValue}
                            disabled={isReadOnly || isSaving}
                            onChange={(e) => {
                              onSelectChange?.(item.key, e.target.value);
                            }}
                            aria-labelledby={labelId}
                          >
                            {item.control.options.map((option) => (
                              <option key={option.value} value={option.value}>
                                {translateI18nKey(translate, option.labelKey)}
                              </option>
                            ))}
                          </select>
                        );
                      } else if (item.control.kind === "number") {
                        controlElement = (
                          <input
                            type="number"
                            className="settingsNumberInput"
                            value={displayValue}
                            min={item.control.min}
                            max={item.control.max}
                            step={item.control.step}
                            disabled={isReadOnly || isSaving}
                            onChange={(e) => {
                              const next = e.target.valueAsNumber;
                              if (Number.isFinite(next)) {
                                onNumberChange?.(item.key, next);
                              }
                            }}
                            aria-labelledby={labelId}
                          />
                        );
                      } else if (item.control.kind === "switch") {
                        controlElement = (
                          <div className="settingsItemControl">
                            <input
                              id={`settingControl-${item.key}`}
                              type="checkbox"
                              className="settingsSwitchInput"
                              checked={displayValue === "true"}
                              disabled={isReadOnly || isSaving}
                              onChange={(e) => {
                                onSwitchChange?.(item.key, e.target.checked);
                              }}
                              aria-labelledby={labelId}
                            />
                          </div>
                        );
                      } else if (item.control.kind === "custom") {
                        if (
                          item.control.customKind ===
                          "documentMap.dialogueDelimiterPairs"
                        ) {
                          const pairs = Array.isArray(effectiveValue)
                            ? (effectiveValue as DocumentMapDialogueDelimiterPair[])
                            : defaultDocumentMapDialogueDelimiterPairs();
                          controlElement = (
                            <DialogueDelimiterPairsEditor
                              pairs={pairs}
                              disabled={isReadOnly || isSaving}
                              translate={translate}
                              onChange={(nextPairs) => {
                                onDialoguePairsCommit?.(item.key, nextPairs);
                              }}
                            />
                          );
                        } else if (
                          item.control.customKind ===
                          "imageAttachment.saveDirectory"
                        ) {
                          controlElement = (
                            <SaveDestinationSettingControl
                              id={`projectSettingControl-${item.key}`}
                              value={displayValue}
                              disabled={isReadOnly || isSaving}
                              translate={translate}
                              onOpenDialog={onOpenImageAttachmentDialog}
                            />
                          );
                        } else {
                          throw new Error(
                            `Unsupported custom Project Settings control kind: "${item.control.customKind}" for key "${item.key}".`
                          );
                        }
                      } else {
                        throw new Error(
                          `Unsupported Project Settings control kind: "${(item.control as SettingControl).kind}" for key "${item.key}".`
                        );
                      }

                    return (
                      <ProjectSettingField
                        key={item.key}
                        label={translateI18nKey(translate, item.labelKey)}
                        description={translateI18nKey(translate, item.descriptionKey)}
                        settingKey={item.key}
                        isModified={isModified}
                        isReadOnly={isReadOnly}
                        isSaving={isSaving}
                        resetLabel={translate("settings.project.matchApplicationSettings")}
                        modifiedLabel={translate("settings.project.modified")}
                        onReset={() => onReset(item.key)}
                      >
                        {controlElement}
                      </ProjectSettingField>
                    );
                  })}
                </div>
              </div>
            ))}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

const defaultProjectSettingsUiItems: readonly SettingCatalogItem[] =
  getProjectSettingsUiItems();

export interface ProjectSettingsPanelProps {
  translate: Translate;
  projectName?: string;
  projectSettings: ProjectSettings | undefined;
  applicationSettings?: PartialApplicationSettings;
  /** @deprecated Kept for Slice 3/4 backward compatibility. Use applicationSettings instead. */
  inheritedFontFamily?: string;
  isReadOnly: boolean;
  onSaveSettings: (
    request: UpdateProjectSettingsRequest
  ) => Promise<ProjectSettings | undefined>;
  onUpdateProjectName?: (
    name: string
  ) => Promise<UpdateProjectNameResult>;
  items?: readonly SettingCatalogItem[];
}

export function ProjectSettingsPanel({
  translate,
  projectName,
  projectSettings,
  applicationSettings,
  inheritedFontFamily,
  isReadOnly,
  onSaveSettings,
  onUpdateProjectName,
  items: propsItems
}: ProjectSettingsPanelProps): JSX.Element {
  const catalogItems = propsItems ?? defaultProjectSettingsUiItems;

  const [projectNameDraft, setProjectNameDraft] = useState<string>(
    projectName ?? ""
  );
  const [isProjectNameFocused, setIsProjectNameFocused] = useState(false);
  const [projectNameError, setProjectNameError] = useState<string | null>(null);
  const [isSavingProjectName, setIsSavingProjectName] = useState(false);

  useEffect(() => {
    if (!isProjectNameFocused) {
      setProjectNameDraft(projectName ?? "");
      setProjectNameError(null);
    }
  }, [projectName]);

  const isProjectNameDirty =
    projectNameDraft.trim() !== (projectName ?? "").trim();

  const handleProjectNameChange = (val: string): void => {
    setProjectNameDraft(val);
    const validation = validateProjectName(val);
    if (!validation.ok) {
      if (validation.error === "empty") {
        setProjectNameError(translate("settings.project.name.error.empty"));
      } else if (validation.error === "tooLong") {
        setProjectNameError(translate("settings.project.name.error.tooLong"));
      } else if (validation.error === "controlCharacters") {
        setProjectNameError(
          translate("settings.project.name.error.controlCharacters")
        );
      } else {
        setProjectNameError(translate("settings.project.name.error.invalid"));
      }
    } else {
      setProjectNameError(null);
    }
  };

  const handleProjectNameCommit = async (): Promise<void> => {
    if (
      isReadOnly ||
      isSavingProjectName ||
      !onUpdateProjectName ||
      !projectName
    ) {
      return;
    }

    if (!isProjectNameDirty) {
      setProjectNameDraft(projectName);
      setProjectNameError(null);
      return;
    }

    const validation = validateProjectName(projectNameDraft);
    if (!validation.ok) {
      if (validation.error === "empty") {
        setProjectNameError(translate("settings.project.name.error.empty"));
      } else if (validation.error === "tooLong") {
        setProjectNameError(translate("settings.project.name.error.tooLong"));
      } else if (validation.error === "controlCharacters") {
        setProjectNameError(
          translate("settings.project.name.error.controlCharacters")
        );
      } else {
        setProjectNameError(translate("settings.project.name.error.invalid"));
      }
      return;
    }

    setIsSavingProjectName(true);
    try {
      const result = await onUpdateProjectName(validation.normalizedName);
      if (result.ok) {
        setProjectNameDraft(result.project.name);
        setProjectNameError(null);
      } else {
        if (result.reason === "invalidName") {
          setProjectNameError(
            result.message ?? translate("settings.project.name.error.invalid")
          );
        } else if (result.reason === "readOnlyProject") {
          setProjectNameError(translate("settings.project.readOnlyNotice"));
        } else {
          setProjectNameError(
            result.message ??
              translate("status.commandFailed", { message: result.reason })
          );
        }
      }
    } catch (err) {
      setProjectNameError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSavingProjectName(false);
    }
  };

  const [textDrafts, setTextDrafts] = useState<Record<string, string>>({});
  const [activeEditingKey, setActiveEditingKey] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategoryId, setSelectedCategoryId] =
    useState<ProjectSettingCategoryFilter>("all");
  const [isDestinationDialogOpen, setIsDestinationDialogOpen] =
    useState<boolean>(false);
  const [dialogOpener, setDialogOpener] = useState<Element | null>(null);

  // Clear drafts for keys that are not actively being edited when external props change
  useEffect(() => {
    setTextDrafts((prev) => {
      const next: Record<string, string> = {};
      for (const item of catalogItems) {
        if (item.control.kind === "text" && item.key === activeEditingKey) {
          next[item.key] = prev[item.key] ?? "";
        }
      }
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) {
        return next;
      }
      for (const k of prevKeys) {
        if (prev[k] !== next[k]) {
          return next;
        }
      }
      return prev;
    });
  }, [catalogItems, activeEditingKey, projectSettings, applicationSettings]);

  const handleReset = async (key: SettingKey): Promise<void> => {
    if (isReadOnly || isSaving) {
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      const request = createProjectSettingResetRequest(key);
      await onSaveSettings(request);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleTextChange = (key: SettingKey, value: string): void => {
    setTextDrafts((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  const handleTextFocus = (key: SettingKey): void => {
    setActiveEditingKey(key);
  };

  const handleTextBlur = async (key: SettingKey): Promise<void> => {
    setActiveEditingKey(null);
    if (isReadOnly || isSaving) {
      return;
    }

    const currentEffective = readEffectiveProjectSettingValue(
      key,
      projectSettings,
      applicationSettings,
      inheritedFontFamily
    );
    const draftValue = textDrafts[key] ?? String(currentEffective ?? "");

    const validation = validateProjectSettingValue(
      key,
      draftValue,
      currentEffective
    );

    if (!validation.ok) {
      setError(
        validation.failure === "emptyString"
          ? key === "editor.fontFamily"
            ? "Font family cannot be empty."
            : "Value cannot be empty."
          : `Invalid setting value (${validation.failure}).`
      );
      setTextDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    if (validation.value === undefined) {
      setTextDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    const inheritedValue = readInheritedSettingValue(
      key,
      applicationSettings,
      inheritedFontFamily
    );
    const request = createDifferentialProjectSettingRequest(
      key,
      validation.value,
      inheritedValue
    );

    // If already absent and request is remove, no persistence is needed
    const committedProjectValue = readProjectSettingValue(key, projectSettings);
    if (committedProjectValue === undefined && "remove" in request) {
      setTextDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    setIsSaving(true);
    try {
      await onSaveSettings(request);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setTextDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectChange = async (
    key: SettingKey,
    value: string
  ): Promise<void> => {
    if (isReadOnly || isSaving) {
      return;
    }

    const currentEffective = readEffectiveProjectSettingValue(
      key,
      projectSettings,
      applicationSettings,
      inheritedFontFamily
    );
    const validation = validateProjectSettingValue(
      key,
      value,
      currentEffective
    );
    if (!validation.ok || validation.value === undefined) {
      return;
    }

    const inheritedValue = readInheritedSettingValue(
      key,
      applicationSettings,
      inheritedFontFamily
    );
    const request = createDifferentialProjectSettingRequest(
      key,
      validation.value,
      inheritedValue
    );

    const committedProjectValue = readProjectSettingValue(key, projectSettings);
    if (committedProjectValue === undefined && "remove" in request) {
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await onSaveSettings(request);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  // #424 Slice 7: number override rows (search.nearby.*) — same differential
  // set/remove flow as select, with the value already coerced to a number.
  const handleNumberChange = async (
    key: SettingKey,
    value: number
  ): Promise<void> => {
    if (isReadOnly || isSaving) {
      return;
    }

    const currentEffective = readEffectiveProjectSettingValue(
      key,
      projectSettings,
      applicationSettings,
      inheritedFontFamily
    );
    const validation = validateProjectSettingValue(
      key,
      value,
      currentEffective
    );
    if (!validation.ok || validation.value === undefined) {
      return;
    }

    const inheritedValue = readInheritedSettingValue(
      key,
      applicationSettings,
      inheritedFontFamily
    );
    const request = createDifferentialProjectSettingRequest(
      key,
      validation.value,
      inheritedValue
    );

    const committedProjectValue = readProjectSettingValue(key, projectSettings);
    if (committedProjectValue === undefined && "remove" in request) {
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await onSaveSettings(request);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSwitchChange = async (
    key: SettingKey,
    checked: boolean
  ): Promise<void> => {
    if (isReadOnly || isSaving) {
      return;
    }

    const currentEffective = readEffectiveProjectSettingValue(
      key,
      projectSettings,
      applicationSettings,
      inheritedFontFamily
    );
    const validation = validateProjectSettingValue(
      key,
      checked,
      currentEffective
    );

    if (!validation.ok || validation.value === undefined) {
      return;
    }

    const inheritedValue = readInheritedSettingValue(
      key,
      applicationSettings,
      inheritedFontFamily
    );
    const request = createDifferentialProjectSettingRequest(
      key,
      validation.value,
      inheritedValue
    );

    const committedProjectValue = readProjectSettingValue(key, projectSettings);
    if (committedProjectValue === undefined && "remove" in request) {
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await onSaveSettings(request);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDialoguePairsCommit = async (
    key: SettingKey,
    nextPairs: DocumentMapDialogueDelimiterPair[]
  ): Promise<void> => {
    if (isReadOnly || isSaving) {
      return;
    }

    const currentEffective = readEffectiveProjectSettingValue(
      key,
      projectSettings,
      applicationSettings,
      inheritedFontFamily
    );
    const validation = validateProjectSettingValue(
      key,
      nextPairs,
      currentEffective
    );

    if (!validation.ok) {
      setError("Invalid dialogue delimiter pairs.");
      return;
    }

    setError(null);

    if (validation.value === undefined) {
      return;
    }

    const inheritedValue = readInheritedSettingValue(
      key,
      applicationSettings,
      inheritedFontFamily
    );
    const request = createDifferentialProjectSettingRequest(
      key,
      validation.value,
      inheritedValue
    );

    const committedProjectValue = readProjectSettingValue(key, projectSettings);
    if (committedProjectValue === undefined && "remove" in request) {
      return;
    }

    setIsSaving(true);
    try {
      await onSaveSettings(request);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageAttachmentSave = async (result: {
    readonly saveDirectory: string;
    readonly insertMarkdownLink: boolean;
  }): Promise<void> => {
    if (isReadOnly || isSaving) {
      return;
    }

    const currentSaveDirEffective = readEffectiveProjectSettingValue(
      "imageAttachment.saveDirectory",
      projectSettings,
      applicationSettings,
      inheritedFontFamily
    );
    const currentInsertLinkEffective = readEffectiveProjectSettingValue(
      "imageAttachment.insertMarkdownLink",
      projectSettings,
      applicationSettings,
      inheritedFontFamily
    );

    const saveDirValidation = validateProjectSettingValue(
      "imageAttachment.saveDirectory",
      result.saveDirectory,
      currentSaveDirEffective
    );
    const insertLinkValidation = validateProjectSettingValue(
      "imageAttachment.insertMarkdownLink",
      result.insertMarkdownLink,
      currentInsertLinkEffective
    );

    if (!saveDirValidation.ok || !insertLinkValidation.ok) {
      return;
    }

    const inheritedSaveDir = readInheritedSettingValue(
      "imageAttachment.saveDirectory",
      applicationSettings,
      inheritedFontFamily
    );
    const inheritedInsertLink = readInheritedSettingValue(
      "imageAttachment.insertMarkdownLink",
      applicationSettings,
      inheritedFontFamily
    );

    const setObj: Record<string, unknown> = {};
    const removeArr: string[] = [];

    if (saveDirValidation.value === inheritedSaveDir) {
      removeArr.push("imageAttachment.saveDirectory");
    } else if (saveDirValidation.value !== undefined) {
      setObj["imageAttachment.saveDirectory"] = saveDirValidation.value;
    }

    if (insertLinkValidation.value === inheritedInsertLink) {
      removeArr.push("imageAttachment.insertMarkdownLink");
    } else if (insertLinkValidation.value !== undefined) {
      setObj["imageAttachment.insertMarkdownLink"] = insertLinkValidation.value;
    }

    const committedSaveDir = readProjectSettingValue(
      "imageAttachment.saveDirectory",
      projectSettings
    );
    const committedInsertLink = readProjectSettingValue(
      "imageAttachment.insertMarkdownLink",
      projectSettings
    );

    const actualRemoves = removeArr.filter((k) => {
      if (k === "imageAttachment.saveDirectory")
        return committedSaveDir !== undefined;
      if (k === "imageAttachment.insertMarkdownLink")
        return committedInsertLink !== undefined;
      return true;
    });

    const actualSetObj: Record<string, unknown> = {};
    if (
      setObj["imageAttachment.saveDirectory"] !== undefined &&
      setObj["imageAttachment.saveDirectory"] !== committedSaveDir
    ) {
      actualSetObj["imageAttachment.saveDirectory"] =
        setObj["imageAttachment.saveDirectory"];
    }
    if (
      setObj["imageAttachment.insertMarkdownLink"] !== undefined &&
      setObj["imageAttachment.insertMarkdownLink"] !== committedInsertLink
    ) {
      actualSetObj["imageAttachment.insertMarkdownLink"] =
        setObj["imageAttachment.insertMarkdownLink"];
    }

    if (Object.keys(actualSetObj).length === 0 && actualRemoves.length === 0) {
      return;
    }

    const request: UpdateProjectSettingsRequest = {
      ...(Object.keys(actualSetObj).length > 0 ? { set: actualSetObj } : {}),
      ...(actualRemoves.length > 0 ? { remove: actualRemoves } : {})
    };

    setIsSaving(true);
    try {
      await onSaveSettings(request);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const eligibleItems = catalogItems.filter((item) => {
    const entry = getCatalogEntry(item.key);
    return isProjectOverrideEligibleScope(entry.scope);
  });

  const categories = getEligibleProjectSettingCategories(
    eligibleItems,
    translate,
    settingCategoryCatalog,
    { includeProjectCategory: projectName !== undefined }
  );

  const filteredItems = filterProjectSettingItems(
    eligibleItems,
    selectedCategoryId,
    searchQuery,
    translate
  );

  const viewItems: ProjectSettingItemViewState[] = filteredItems.map((item) => {
    const isModified = isProjectSettingModified(
      item.key,
      projectSettings,
      applicationSettings,
      inheritedFontFamily
    );
    const effectiveValue = readEffectiveProjectSettingValue(
      item.key,
      projectSettings,
      applicationSettings,
      inheritedFontFamily
    );

    let displayValue: string;
    let resolvedEffectiveValue: unknown = effectiveValue;

    if (item.control.kind === "text") {
      if (item.key === activeEditingKey && textDrafts[item.key] !== undefined) {
        displayValue = textDrafts[item.key];
      } else {
        displayValue = String(effectiveValue ?? "");
      }
    } else if (item.control.kind === "custom") {
      displayValue = String(effectiveValue ?? "");
    } else {
      displayValue = String(effectiveValue ?? "");
    }

    return {
      item,
      isModified,
      displayValue,
      effectiveValue: resolvedEffectiveValue
    };
  });

  return (
    <>
      <ProjectSettingsPanelView
        translate={translate}
        projectName={projectName}
        projectNameDraft={projectNameDraft}
        isProjectNameDirty={isProjectNameDirty}
        projectNameError={projectNameError}
        isSavingProjectName={isSavingProjectName}
        onProjectNameChange={handleProjectNameChange}
        onProjectNameFocus={() => setIsProjectNameFocused(true)}
        onProjectNameBlur={() => {
          setIsProjectNameFocused(false);
          void handleProjectNameCommit();
        }}
        items={viewItems}
        categories={categories}
        selectedCategoryId={selectedCategoryId}
        onSelectCategory={setSelectedCategoryId}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        isReadOnly={isReadOnly}
        isSaving={isSaving}
        error={error}
        onReset={(key) => {
          void handleReset(key);
        }}
        onTextChange={handleTextChange}
        onTextFocus={handleTextFocus}
        onTextBlur={(key) => {
          void handleTextBlur(key);
        }}
        onNumberChange={(key, value) => {
          void handleNumberChange(key, value);
        }}
        onSelectChange={(key, value) => {
          void handleSelectChange(key, value);
        }}
        onSwitchChange={(key, checked) => {
          void handleSwitchChange(key, checked);
        }}
        onDialoguePairsCommit={(key, value) => {
          void handleDialoguePairsCommit(key, value);
        }}
        onOpenImageAttachmentDialog={(opener) => {
          setDialogOpener(opener ?? null);
          setIsDestinationDialogOpen(true);
        }}
      />
      <SaveDestinationDialog
        isOpen={isDestinationDialogOpen}
        initialSaveDirectory={
          String(
            readEffectiveProjectSettingValue(
              "imageAttachment.saveDirectory",
              projectSettings,
              applicationSettings,
              inheritedFontFamily
            ) ?? ""
          )
        }
        initialInsertMarkdownLink={
          Boolean(
            readEffectiveProjectSettingValue(
              "imageAttachment.insertMarkdownLink",
              projectSettings,
              applicationSettings,
              inheritedFontFamily
            ) ?? true
          )
        }
        mode="settings"
        translate={translate}
        opener={dialogOpener}
        onSave={(result) => {
          setIsDestinationDialogOpen(false);
          void handleImageAttachmentSave(result);
        }}
        onDismiss={() => setIsDestinationDialogOpen(false)}
      />
    </>
  );
}
