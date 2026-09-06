import {
  useState,
  useEffect,
  type ChangeEvent,
  type FocusEvent
} from "react";
import type { ProjectSettings, UpdateProjectSettingsRequest } from "../shared/api";
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
  categories: readonly SettingCategoryCatalogItem[] = settingCategoryCatalog
): readonly ProjectSettingCategoryItem[] {
  const categoryIds = new Set<SettingCategory>(
    eligibleItems.map((item) => item.category)
  );

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
  onSwitchChange?: (key: SettingKey, checked: boolean) => void;
  onDialoguePairsCommit?: (
    key: SettingKey,
    value: DocumentMapDialogueDelimiterPair[]
  ) => void;
}

function translateI18nKey(translate: Translate, key: string): string {
  return translate(key as any);
}

export function ProjectSettingsPanelView({
  translate,
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
  onSwitchChange,
  onDialoguePairsCommit
}: ProjectSettingsPanelViewProps): JSX.Element {
  const categoryGroups = groupProjectSettingItemsByCategory(items);

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
          {items.length === 0 ? (
            <p className="settingsSearchEmpty">
              {translate("settings.search.empty")}
            </p>
          ) : (
            categoryGroups.map((group) => (
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
            ))
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
  projectSettings: ProjectSettings | undefined;
  applicationSettings?: PartialApplicationSettings;
  /** @deprecated Kept for Slice 3/4 backward compatibility. Use applicationSettings instead. */
  inheritedFontFamily?: string;
  isReadOnly: boolean;
  onSaveSettings: (
    request: UpdateProjectSettingsRequest
  ) => Promise<ProjectSettings | undefined>;
  items?: readonly SettingCatalogItem[];
}

export function ProjectSettingsPanel({
  translate,
  projectSettings,
  applicationSettings,
  inheritedFontFamily,
  isReadOnly,
  onSaveSettings,
  items: propsItems
}: ProjectSettingsPanelProps): JSX.Element {
  const catalogItems = propsItems ?? defaultProjectSettingsUiItems;

  const [textDrafts, setTextDrafts] = useState<Record<string, string>>({});
  const [activeEditingKey, setActiveEditingKey] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategoryId, setSelectedCategoryId] =
    useState<ProjectSettingCategoryFilter>("all");

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

  const eligibleItems = catalogItems.filter((item) => {
    const entry = getCatalogEntry(item.key);
    return isProjectOverrideEligibleScope(entry.scope);
  });

  const categories = getEligibleProjectSettingCategories(
    eligibleItems,
    translate
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
    <ProjectSettingsPanelView
      translate={translate}
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
      onSelectChange={(key, value) => {
        void handleSelectChange(key, value);
      }}
      onSwitchChange={(key, checked) => {
        void handleSwitchChange(key, checked);
      }}
      onDialoguePairsCommit={(key, value) => {
        void handleDialoguePairsCommit(key, value);
      }}
    />
  );
}
