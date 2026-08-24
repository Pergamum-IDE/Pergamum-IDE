import { useState } from "react";
import type {
  ApplicationSettings,
  NewFileEncoding,
  NewFileLineEnding,
  SaveApplicationSettingsRequest
} from "../shared/api";
import type { Language, Translate, TranslationKey } from "../shared/i18n";
import { getCatalogDefaultValue, type SettingKey } from "../shared/settingsCatalog";
import {
  buildSettingSearchText,
  settingCategoryCatalog,
  settingCategoryLabelKey,
  settingCatalogItems,
  sortSettingCatalogItems,
  sortSettingCategoryCatalog,
  type I18nKey,
  type SettingCatalogItem,
  type SettingCategory,
  type SettingSearchTranslate
} from "../shared/settingsUiCatalog";
import searchIcon from "../../assets/icons/feather/global/search.svg?raw";

interface SettingsPanelProps {
  settings: ApplicationSettings;
  isLoading: boolean;
  error: string | null;
  translate: Translate;
  onChangeSettings: (settings: SaveApplicationSettingsRequest) => void;
}

// The catalog's i18n keys are typed as the bare, decoupled `I18nKey` (see
// settingsUiCatalog.ts) rather than the closed `TranslationKey` union, so a
// single cast point resolves them through the real translate function.
function translateI18nKey(translate: Translate, key: I18nKey): string {
  return translate(key as TranslationKey);
}

function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// settings.json <-> catalog key bridge
//
// The catalog is display metadata only (ADR-0006 / #226 responsibility
// split) — it does not know how a dotted key maps into the nested
// ApplicationSettings/SaveApplicationSettingsRequest shape, and it must not:
// persistence stays this module's job. These two functions are that bridge.
// ---------------------------------------------------------------------------

// workbench.colorTheme has no ApplicationSettings field at all (#150: never
// wired to a store), and preview.renderer has no SaveApplicationSettingsRequest
// field (Application Settings cannot write it today). Wiring either up is a
// settings.json/store change outside this issue's scope, so both render
// read-only here rather than gaining new persistence wiring.
const unwiredKeys = new Set<SettingKey>([
  "workbench.colorTheme",
  "preview.renderer"
]);

const marqueeKeys = new Set<SettingKey>([
  "commandPalette.description.marquee.delay",
  "commandPalette.description.marquee.speed"
]);

const soundChildKeys = new Set<SettingKey>([
  "workbench.sound.dialog.enabled",
  "workbench.sound.newline.enabled",
  "workbench.sound.keypress.enabled"
]);

// Presentational only (unit suffix for a number control) — not part of the
// UI catalog schema, which has no `unit` field on SettingControl.
const numberUnitKeyByKey: Partial<Record<SettingKey, TranslationKey>> = {
  "commandPalette.description.marquee.delay": "settings.unit.ms",
  "commandPalette.description.marquee.speed": "settings.unit.pxPerSecond"
};

function readSettingValue(key: SettingKey, settings: ApplicationSettings): unknown {
  switch (key) {
    case "workbench.colorTheme":
      return getCatalogDefaultValue("workbench.colorTheme");
    case "workbench.fontFamily":
      return (
        settings.workbench.fontFamily ??
        getCatalogDefaultValue("workbench.fontFamily")
      );
    case "workbench.language":
      return settings.workbench.language;
    case "workbench.statusBar.visible":
      return settings.workbench.statusBar.visible;
    case "workbench.sound.enabled":
      return settings.workbench.sound.enabled;
    case "workbench.sound.dialog.enabled":
      return settings.workbench.sound.dialog.enabled;
    case "workbench.sound.newline.enabled":
      return settings.workbench.sound.newline.enabled;
    case "workbench.sound.keypress.enabled":
      return settings.workbench.sound.keypress.enabled;
    case "commandPalette.description.enable":
      return settings.commandPalette.description.enable;
    case "commandPalette.description.marquee.delay":
      return settings.commandPalette.description.marquee.delay;
    case "commandPalette.description.marquee.speed":
      return settings.commandPalette.description.marquee.speed;
    case "editor.fontFamily":
      return (
        settings.editor.fontFamily ?? getCatalogDefaultValue("editor.fontFamily")
      );
    case "files.newFile.lineEnding":
      return settings.files.newFile.lineEnding;
    case "files.newFile.encoding":
      return settings.files.newFile.encoding;
    case "preview.renderer":
      return settings.preview.renderer;
  }

  const exhaustiveCheck: never = key;
  throw new Error(`Unhandled setting key: ${String(exhaustiveCheck)}`);
}

function fontFamilyValue(value: string): string | undefined {
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

function withFontFamily<T extends { fontFamily?: string }>(
  settings: T,
  fontFamily: string | undefined
): T {
  const nextSettings = { ...settings };

  if (fontFamily === undefined) {
    delete nextSettings.fontFamily;
  } else {
    nextSettings.fontFamily = fontFamily;
  }

  return nextSettings;
}

function saveRequest(
  settings: ApplicationSettings,
  overrides: Partial<SaveApplicationSettingsRequest>
): SaveApplicationSettingsRequest {
  return {
    workbench: overrides.workbench ?? settings.workbench,
    commandPalette: overrides.commandPalette ?? settings.commandPalette,
    editor: overrides.editor ?? settings.editor,
    files: overrides.files ?? settings.files
  };
}

// Builds the next immediate-save request for a single control edit. Returns
// null when the key isn't writable yet (unwiredKeys) or the raw value fails
// a basic shape guard (non-finite number) — the caller then skips saving,
// matching the pre-#230 per-field guards.
function buildNextSettings(
  key: SettingKey,
  rawValue: unknown,
  settings: ApplicationSettings
): SaveApplicationSettingsRequest | null {
  switch (key) {
    case "workbench.colorTheme":
    case "preview.renderer":
      return null;
    case "workbench.fontFamily":
      return saveRequest(settings, {
        workbench: withFontFamily(
          settings.workbench,
          fontFamilyValue(String(rawValue))
        )
      });
    case "editor.fontFamily":
      return saveRequest(settings, {
        editor: withFontFamily(settings.editor, fontFamilyValue(String(rawValue)))
      });
    case "workbench.language":
      return saveRequest(settings, {
        workbench: { ...settings.workbench, language: rawValue as Language }
      });
    case "workbench.statusBar.visible":
      return saveRequest(settings, {
        workbench: {
          ...settings.workbench,
          statusBar: { visible: Boolean(rawValue) }
        }
      });
    case "workbench.sound.enabled":
      return saveRequest(settings, {
        workbench: {
          ...settings.workbench,
          sound: { ...settings.workbench.sound, enabled: Boolean(rawValue) }
        }
      });
    case "workbench.sound.dialog.enabled":
      return saveRequest(settings, {
        workbench: {
          ...settings.workbench,
          sound: {
            ...settings.workbench.sound,
            dialog: { enabled: Boolean(rawValue) }
          }
        }
      });
    case "workbench.sound.newline.enabled":
      return saveRequest(settings, {
        workbench: {
          ...settings.workbench,
          sound: {
            ...settings.workbench.sound,
            newline: { enabled: Boolean(rawValue) }
          }
        }
      });
    case "workbench.sound.keypress.enabled":
      return saveRequest(settings, {
        workbench: {
          ...settings.workbench,
          sound: {
            ...settings.workbench.sound,
            keypress: { enabled: Boolean(rawValue) }
          }
        }
      });
    case "commandPalette.description.enable":
      return saveRequest(settings, {
        commandPalette: {
          ...settings.commandPalette,
          description: {
            ...settings.commandPalette.description,
            enable: Boolean(rawValue)
          }
        }
      });
    case "commandPalette.description.marquee.delay":
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
        return null;
      }

      return saveRequest(settings, {
        commandPalette: {
          ...settings.commandPalette,
          description: {
            ...settings.commandPalette.description,
            marquee: {
              ...settings.commandPalette.description.marquee,
              delay: rawValue
            }
          }
        }
      });
    case "commandPalette.description.marquee.speed":
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
        return null;
      }

      return saveRequest(settings, {
        commandPalette: {
          ...settings.commandPalette,
          description: {
            ...settings.commandPalette.description,
            marquee: {
              ...settings.commandPalette.description.marquee,
              speed: rawValue
            }
          }
        }
      });
    case "files.newFile.lineEnding":
      return saveRequest(settings, {
        files: {
          ...settings.files,
          newFile: {
            ...settings.files.newFile,
            lineEnding: rawValue as NewFileLineEnding
          }
        }
      });
    case "files.newFile.encoding":
      return saveRequest(settings, {
        files: {
          ...settings.files,
          newFile: {
            ...settings.files.newFile,
            encoding: rawValue as NewFileEncoding
          }
        }
      });
  }

  const exhaustiveCheck: never = key;
  throw new Error(`Unhandled setting key: ${String(exhaustiveCheck)}`);
}

function handleSettingChange(
  item: SettingCatalogItem,
  rawValue: unknown,
  settings: ApplicationSettings,
  onChangeSettings: (settings: SaveApplicationSettingsRequest) => void
): void {
  const nextSettings = buildNextSettings(item.key, rawValue, settings);

  if (nextSettings) {
    onChangeSettings(nextSettings);
  }
}

function isSettingDisabled(
  item: SettingCatalogItem,
  settings: ApplicationSettings,
  isLoading: boolean
): boolean {
  if (isLoading) {
    return true;
  }

  if (unwiredKeys.has(item.key)) {
    return true;
  }

  if (marqueeKeys.has(item.key) && !settings.commandPalette.description.enable) {
    return true;
  }

  if (soundChildKeys.has(item.key) && !settings.workbench.sound.enabled) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

// Exported for direct unit testing (trim + case-insensitive substring
// matching against buildSettingSearchText, per catalog key / localized
// label / description / select option value / label). Empty query returns
// the selected category's items in catalog order, unfiltered.
export function getVisibleSettingCatalogItems(
  searchQuery: string,
  selectedCategoryId: SettingCategory,
  translate: Translate,
  items: readonly SettingCatalogItem[] = settingCatalogItems
): readonly SettingCatalogItem[] {
  const normalizedQuery = normalizeSearchQuery(searchQuery);
  const sortedItems = sortSettingCatalogItems(items);

  if (normalizedQuery.length === 0) {
    return sortedItems.filter((item) => item.category === selectedCategoryId);
  }

  const searchTranslate: SettingSearchTranslate = (key) =>
    translateI18nKey(translate, key);

  return sortedItems.filter((item) =>
    buildSettingSearchText(item, searchTranslate)
      .toLowerCase()
      .includes(normalizedQuery)
  );
}

// ---------------------------------------------------------------------------
// Control rendering
// ---------------------------------------------------------------------------

interface SettingControlInputProps {
  item: SettingCatalogItem;
  value: unknown;
  disabled: boolean;
  labelId: string;
  translate: Translate;
  onChange: (rawValue: unknown) => void;
}

function SettingControlInput({
  item,
  value,
  disabled,
  labelId,
  translate,
  onChange
}: SettingControlInputProps): JSX.Element {
  const control = item.control;
  const controlId = `settingControl-${item.key}`;

  switch (control.kind) {
    case "switch":
      return (
        <input
          id={controlId}
          className="settingsSwitchInput"
          type="checkbox"
          checked={Boolean(value)}
          disabled={disabled}
          aria-labelledby={labelId}
          onChange={(event) => onChange(event.target.checked)}
        />
      );
    case "select":
      return (
        <select
          id={controlId}
          className="settingsSelect"
          value={String(value)}
          disabled={disabled}
          aria-labelledby={labelId}
          onChange={(event) => onChange(event.target.value)}
        >
          {control.options.map((option) => (
            <option key={option.value} value={option.value}>
              {translateI18nKey(translate, option.labelKey)}
            </option>
          ))}
        </select>
      );
    case "text":
      return (
        <input
          id={controlId}
          className="settingsTextInput"
          type="text"
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          aria-labelledby={labelId}
          placeholder={
            control.placeholderKey
              ? translateI18nKey(translate, control.placeholderKey)
              : undefined
          }
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "number": {
      const unitKey = numberUnitKeyByKey[item.key];

      return (
        <div className="settingsNumberInputGroup">
          <input
            id={controlId}
            className="settingsNumberInput"
            type="number"
            min={control.min}
            max={control.max}
            step={control.step ?? "any"}
            value={typeof value === "number" ? value : 0}
            disabled={disabled}
            aria-labelledby={labelId}
            onChange={(event) => onChange(event.target.valueAsNumber)}
          />
          {unitKey ? <span className="settingsUnit">{translate(unitKey)}</span> : null}
        </div>
      );
    }
  }
}

interface SettingItemRowProps {
  item: SettingCatalogItem;
  settings: ApplicationSettings;
  isLoading: boolean;
  translate: Translate;
  onChange: (item: SettingCatalogItem, rawValue: unknown) => void;
}

function SettingItemRow({
  item,
  settings,
  isLoading,
  translate,
  onChange
}: SettingItemRowProps): JSX.Element {
  const value = readSettingValue(item.key, settings);
  const disabled = isSettingDisabled(item, settings, isLoading);
  const labelId = `settingLabel-${item.key}`;
  // Switch controls wrap the visible label and the checkbox in a single
  // <label> so clicking either the label text or the switch itself toggles
  // it (native <label> click-forwarding) — not changed for other control
  // kinds, which keep the plain aria-labelledby association.
  const HeaderTag = item.control.kind === "switch" ? "label" : "div";

  return (
    <div className="settingsItemRow">
      <HeaderTag className="settingsItemHeader">
        <span id={labelId} className="settingsItemLabel">
          {translateI18nKey(translate, item.labelKey)}
        </span>
        <div className="settingsItemControl">
          <SettingControlInput
            item={item}
            value={value}
            disabled={disabled}
            labelId={labelId}
            translate={translate}
            onChange={(rawValue) => onChange(item, rawValue)}
          />
        </div>
      </HeaderTag>
      <p className="settingsDescription">
        {translateI18nKey(translate, item.descriptionKey)}
      </p>
      {item.key === "workbench.language" ? (
        <p className="settingsDescription">
          {translate("settings.languageRestartRequired")}
        </p>
      ) : null}
      <code className="settingsItemKey">{item.key}</code>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Two-pane view (pure — controlled entirely by props, no internal state)
// ---------------------------------------------------------------------------

interface SettingsPanelViewProps extends SettingsPanelProps {
  selectedCategoryId: SettingCategory;
  onSelectCategory: (id: SettingCategory) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
}

export function SettingsPanelView({
  settings,
  isLoading,
  error,
  translate,
  onChangeSettings,
  selectedCategoryId,
  onSelectCategory,
  searchQuery,
  onSearchQueryChange
}: SettingsPanelViewProps): JSX.Element {
  // Only categories that currently have at least one registered catalog
  // item are shown in the left pane — settingCategoryCatalog itself keeps
  // every category (e.g. "project" has none registered yet), this is
  // purely a display-time filter for the pane.
  const categories = sortSettingCategoryCatalog((key) =>
    translateI18nKey(translate, key)
  ).filter((category) =>
    settingCatalogItems.some((item) => item.category === category.id)
  );
  const isSearching = normalizeSearchQuery(searchQuery).length > 0;
  const visibleItems = getVisibleSettingCatalogItems(
    searchQuery,
    selectedCategoryId,
    translate
  );

  function handleChange(item: SettingCatalogItem, rawValue: unknown): void {
    handleSettingChange(item, rawValue, settings, onChangeSettings);
  }

  return (
    <section
      className="settingsPanel"
      aria-labelledby="applicationSettingsTitle"
    >
      <header className="settingsPanelHeader">
        <h1 id="applicationSettingsTitle">
          {translate("settings.application.title")}
        </h1>
        <p>{translate("settings.application.description")}</p>
      </header>

      {error ? <div className="settingsError">{error}</div> : null}

      <div className="settingsSearch">
        <span
          className="settingsSearchIcon"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: searchIcon }}
        />
        <input
          id="settingsSearchInput"
          className="settingsSearchInput"
          type="search"
          value={searchQuery}
          disabled={isLoading}
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
              const isSelected = !isSearching && category.id === selectedCategoryId;

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
                    disabled={isLoading}
                    onClick={() => onSelectCategory(category.id)}
                  >
                    {translateI18nKey(translate, category.labelKey)}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="settingsItemPane">
          <h2 className="settingsItemPaneHeading">
            {isSearching
              ? translate("settings.search.resultsHeading")
              : translateI18nKey(
                  translate,
                  settingCategoryLabelKey(selectedCategoryId)
                )}
          </h2>

          {visibleItems.length === 0 ? (
            isSearching ? (
              <p className="settingsSearchEmpty">
                {translate("settings.search.empty")}
              </p>
            ) : null
          ) : (
            <div className="settingsItemList">
              {visibleItems.map((item) => (
                <SettingItemRow
                  key={item.key}
                  item={item}
                  settings={settings}
                  isLoading={isLoading}
                  translate={translate}
                  onChange={handleChange}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Stateful entry point — owns the ephemeral (non-persisted) selected
// category / search query UI state and delegates all rendering to the pure
// SettingsPanelView above.
// ---------------------------------------------------------------------------

export function SettingsPanel(props: SettingsPanelProps): JSX.Element {
  const [selectedCategoryId, setSelectedCategoryId] = useState<SettingCategory>(
    settingCategoryCatalog[0].id
  );
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <SettingsPanelView
      {...props}
      selectedCategoryId={selectedCategoryId}
      onSelectCategory={(id) => {
        setSelectedCategoryId(id);
        setSearchQuery("");
      }}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
    />
  );
}
