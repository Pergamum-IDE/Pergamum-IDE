import { useState } from "react";
import type {
  ApplicationSettings,
  ExpectedLineEnding,
  FencedCodeIndentUnit,
  LineEndingMarkerGlyph,
  NewFileEncoding,
  NewFileLineEnding,
  SaveApplicationSettingsRequest,
  SearchNearbyUnit,
  SelectionHighlightMode
} from "../shared/api";
import type { Language, Translate, TranslationKey } from "../shared/i18n";
import type { SettingKey } from "../shared/settingsCatalog";
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
import { DocumentMapSettingsSection } from "./DocumentMapSettingsSection";
import { readSettingValue } from "./settingsValueByKey";
import {
  SaveDestinationDialog,
  SaveDestinationSettingControl
} from "./dialog/SaveDestinationDialog";
import { FontFamilyListSettingControl } from "./FontFamilyListSettingControl";
import { FontPickerDialog } from "./dialog/FontPickerDialog";
import type { FontFamilySetting, FontSlot } from "../shared/fontSettings";

interface SettingsPanelProps {
  settings: ApplicationSettings;
  isLoading: boolean;
  error: string | null;
  translate: Translate;
  /** #496: the app's current UI language — threaded down to the font
   * picker's local-font scan so it resolves localized display names. */
  displayLanguage?: Language;
  onChangeSettings: (settings: SaveApplicationSettingsRequest) => void;
  /**
   * #394 Step 2 follow-up: fires when any settings-item control gains focus.
   * The caller uses this to snapshot settings for a later restart-required
   * diff — it must never itself trigger the restart dialog (see
   * onSettingFieldBlur). Optional so tests/usages that don't care about the
   * restart flow can omit it.
   */
  onSettingFieldFocus?: () => void;
  /**
   * #394 Step 2 follow-up: fires when a settings-item control loses focus —
   * the ONE point where the caller should check for a requiresRestart change
   * and, if found, offer the shared restart dialog. Deliberately decoupled
   * from `onChangeSettings`, which fires on every keystroke: checking on
   * every change would show the dialog repeatedly while the user is still
   * typing (e.g. a number field's digits landing one at a time).
   */
  onSettingFieldBlur?: () => void;
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

const footerDetailMarqueeKeys = new Set<SettingKey>([
  "commandPalette.footerDetail.marquee.delay",
  "commandPalette.footerDetail.marquee.speed"
]);

const soundChildKeys = new Set<SettingKey>([
  "workbench.sound.dialog.enabled",
  "workbench.sound.newline.enabled",
  "workbench.sound.keypress.enabled"
]);

const characterCountExcludeKeys = new Set<SettingKey>([
  "editor.characterCount.exclude.whitespace",
  "editor.characterCount.exclude.lineBreaks",
  "editor.characterCount.exclude.headings",
  "editor.characterCount.exclude.markdownSyntax",
  "editor.characterCount.exclude.markdownComments"
]);

// Presentational only (unit suffix for a number control) — not part of the
// UI catalog schema, which has no `unit` field on SettingControl.
const numberUnitKeyByKey: Partial<Record<SettingKey, TranslationKey>> = {
  "commandPalette.footerDetail.marquee.delay": "settings.unit.ms",
  "commandPalette.footerDetail.marquee.speed": "settings.unit.pxPerSecond",
  "preview.updateDelayMs": "settings.unit.ms",
  "workbench.notification.durationMs": "settings.unit.ms"
};

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
  const request: SaveApplicationSettingsRequest = {
    preview: overrides.preview ?? settings.preview,
    workbench: overrides.workbench ?? settings.workbench,
    commandPalette: overrides.commandPalette ?? settings.commandPalette,
    editor: overrides.editor ?? settings.editor,
    search: overrides.search ?? settings.search,
    files: overrides.files ?? settings.files,
    imageAttachment: overrides.imageAttachment ?? settings.imageAttachment,
    documentMap: overrides.documentMap ?? settings.documentMap
  };
  const notification = overrides.notification ?? settings.notification;

  if (notification !== undefined) {
    request.notification = notification;
  }

  return request;
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
    case "editor.paragraphIndent.excludeLeadingCharacters":
      return saveRequest(settings, {
        editor: {
          ...settings.editor,
          paragraphIndent: {
            ...settings.editor.paragraphIndent,
            excludeLeadingCharacters: String(rawValue)
          }
        }
      });
    case "editor.lineEnding.expected":
      return saveRequest(settings, {
        editor: {
          ...settings.editor,
          lineEnding: {
            ...settings.editor.lineEnding,
            expected: rawValue as ExpectedLineEnding
          }
        }
      });
    case "editor.lineEnding.markerGlyph":
      return saveRequest(settings, {
        editor: {
          ...settings.editor,
          lineEnding: {
            ...settings.editor.lineEnding,
            markerGlyph: rawValue as LineEndingMarkerGlyph
          }
        }
      });
    case "workbench.language":
      return saveRequest(settings, {
        workbench: { ...settings.workbench, language: rawValue as Language }
      });
    case "workbench.statusBar.visible":
      return saveRequest(settings, {
        workbench: {
          ...settings.workbench,
          statusBar: {
            ...settings.workbench.statusBar,
            visible: Boolean(rawValue)
          }
        }
      });
    case "workbench.statusBar.characterCount.visible":
      return saveRequest(settings, {
        workbench: {
          ...settings.workbench,
          statusBar: {
            ...settings.workbench.statusBar,
            characterCount: { visible: Boolean(rawValue) }
          }
        }
      });
    case "notification.output.enabled":
      return saveRequest(settings, {
        notification: { output: { enabled: Boolean(rawValue) } }
      });
    case "editor.whitespace.renderIdeographicSpace":
      return saveRequest(settings, {
        editor: {
          ...settings.editor,
          whitespace: {
            ...settings.editor.whitespace,
            renderIdeographicSpace: Boolean(rawValue)
          }
        }
      });
    case "editor.whitespace.renderAsciiSpace":
      return saveRequest(settings, {
        editor: {
          ...settings.editor,
          whitespace: {
            ...settings.editor.whitespace,
            renderAsciiSpace: Boolean(rawValue)
          }
        }
      });
    case "editor.whitespace.renderTab":
      return saveRequest(settings, {
        editor: {
          ...settings.editor,
          whitespace: {
            ...settings.editor.whitespace,
            renderTab: Boolean(rawValue)
          }
        }
      });
    case "editor.whitespace.renderOtherUnicodeSpace":
      return saveRequest(settings, {
        editor: {
          ...settings.editor,
          whitespace: {
            ...settings.editor.whitespace,
            renderOtherUnicodeSpace: Boolean(rawValue)
          }
        }
      });
    case "workbench.notification.durationMs":
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
        return null;
      }

      return saveRequest(settings, {
        workbench: {
          ...settings.workbench,
          notification: { durationMs: rawValue }
        }
      });
    case "workbench.normalizeUnicodeToNfc":
      return saveRequest(settings, {
        workbench: {
          ...settings.workbench,
          normalizeUnicodeToNfc: Boolean(rawValue)
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
    case "commandPalette.footerDetail.enable":
      return saveRequest(settings, {
        commandPalette: {
          ...settings.commandPalette,
          footerDetail: {
            ...settings.commandPalette.footerDetail,
            enable: Boolean(rawValue)
          }
        }
      });
    case "commandPalette.footerDetail.marquee.delay":
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
        return null;
      }

      return saveRequest(settings, {
        commandPalette: {
          ...settings.commandPalette,
          footerDetail: {
            ...settings.commandPalette.footerDetail,
            marquee: {
              ...settings.commandPalette.footerDetail.marquee,
              delay: rawValue
            }
          }
        }
      });
    case "commandPalette.footerDetail.marquee.speed":
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
        return null;
      }

      return saveRequest(settings, {
        commandPalette: {
          ...settings.commandPalette,
          footerDetail: {
            ...settings.commandPalette.footerDetail,
            marquee: {
              ...settings.commandPalette.footerDetail.marquee,
              speed: rawValue
            }
          }
        }
      });
    case "editor.characterCount.exclude.whitespace":
      return saveRequest(settings, {
        editor: {
          ...settings.editor,
          characterCount: {
            ...settings.editor.characterCount,
            exclude: {
              ...settings.editor.characterCount.exclude,
              whitespace: Boolean(rawValue)
            }
          }
        }
      });
    case "editor.characterCount.exclude.lineBreaks":
      return saveRequest(settings, {
        editor: {
          ...settings.editor,
          characterCount: {
            ...settings.editor.characterCount,
            exclude: {
              ...settings.editor.characterCount.exclude,
              lineBreaks: Boolean(rawValue)
            }
          }
        }
      });
    case "editor.characterCount.exclude.headings":
      return saveRequest(settings, {
        editor: {
          ...settings.editor,
          characterCount: {
            ...settings.editor.characterCount,
            exclude: {
              ...settings.editor.characterCount.exclude,
              headings: Boolean(rawValue)
            }
          }
        }
      });
    case "editor.characterCount.exclude.markdownSyntax":
      return saveRequest(settings, {
        editor: {
          ...settings.editor,
          characterCount: {
            ...settings.editor.characterCount,
            exclude: {
              ...settings.editor.characterCount.exclude,
              markdownSyntax: Boolean(rawValue)
            }
          }
        }
      });
    case "editor.characterCount.exclude.markdownComments":
      return saveRequest(settings, {
        editor: {
          ...settings.editor,
          characterCount: {
            ...settings.editor.characterCount,
            exclude: {
              ...settings.editor.characterCount.exclude,
              markdownComments: Boolean(rawValue)
            }
          }
        }
      });
    case "editor.undoHistoryMinDepth":
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
        return null;
      }

      return saveRequest(settings, {
        editor: { ...settings.editor, undoHistoryMinDepth: rawValue }
      });
    case "editor.selectionHighlightMode":
      return saveRequest(settings, {
        editor: {
          ...settings.editor,
          selectionHighlightMode: rawValue as SelectionHighlightMode
        }
      });
    case "editor.findGutterMarkers":
      return saveRequest(settings, {
        editor: {
          ...settings.editor,
          findGutterMarkers: Boolean(rawValue)
        }
      });
    case "editor.captureTabInEditor":
      return saveRequest(settings, {
        editor: {
          ...settings.editor,
          captureTabInEditor: Boolean(rawValue)
        }
      });
    case "editor.fencedCodeIndentUnit":
      return saveRequest(settings, {
        editor: {
          ...settings.editor,
          fencedCodeIndentUnit: rawValue as FencedCodeIndentUnit
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
    case "preview.updateDelayMs":
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
        return null;
      }

      return saveRequest(settings, {
        preview: { ...settings.preview, updateDelayMs: rawValue }
      });
    case "documentMap.dialogueDelimiterPairs":
      if (!Array.isArray(rawValue)) {
        return null;
      }

      return saveRequest(settings, {
        documentMap: {
          ...settings.documentMap,
          dialogueDelimiterPairs: rawValue as any
        }
      });
    case "imageAttachment.saveDirectory":
      if (
        typeof rawValue === "object" &&
        rawValue !== null &&
        "saveDirectory" in rawValue
      ) {
        const payload = rawValue as {
          saveDirectory: string;
          insertMarkdownLink?: boolean;
        };
        return saveRequest(settings, {
          imageAttachment: {
            ...settings.imageAttachment,
            saveDirectory: String(payload.saveDirectory),
            ...(typeof payload.insertMarkdownLink === "boolean"
              ? { insertMarkdownLink: payload.insertMarkdownLink }
              : {})
          }
        });
      }
      return saveRequest(settings, {
        imageAttachment: {
          ...settings.imageAttachment,
          saveDirectory: String(rawValue)
        }
      });
    case "imageAttachment.insertMarkdownLink":
      return saveRequest(settings, {
        imageAttachment: {
          ...settings.imageAttachment,
          insertMarkdownLink: Boolean(rawValue)
        }
      });
    // #424 Slice 7: glossary nearby search range (applicationWithProjectOverride).
    case "search.nearby.unit":
      return saveRequest(settings, {
        search: {
          nearby: {
            ...settings.search.nearby,
            unit: rawValue as SearchNearbyUnit
          }
        }
      });
    case "search.nearby.characterDistance":
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
        return null;
      }
      return saveRequest(settings, {
        search: {
          nearby: {
            ...settings.search.nearby,
            characterDistance: rawValue
          }
        }
      });
    case "search.nearby.paragraphDistance":
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
        return null;
      }
      return saveRequest(settings, {
        search: {
          nearby: {
            ...settings.search.nearby,
            paragraphDistance: rawValue
          }
        }
      });
    case "editor.emphasisMark.rule":
      if (typeof rawValue !== "string") {
        return null;
      }
      return saveRequest(settings, {
        editor: {
          ...settings.editor,
          emphasisMark: {
            rule: rawValue as any,
            aozoraMark: settings.editor.emphasisMark?.aozoraMark ?? "whiteSesame",
            narouMarkText: settings.editor.emphasisMark?.narouMarkText ?? "・"
          }
        }
      });
    case "editor.emphasisMark.aozoraMark":
      if (typeof rawValue !== "string") {
        return null;
      }
      return saveRequest(settings, {
        editor: {
          ...settings.editor,
          emphasisMark: {
            rule: settings.editor.emphasisMark?.rule ?? "aozora",
            aozoraMark: rawValue as any,
            narouMarkText: settings.editor.emphasisMark?.narouMarkText ?? "・"
          }
        }
      });
    case "editor.emphasisMark.narouMarkText":
      if (typeof rawValue !== "string") {
        return null;
      }
      return saveRequest(settings, {
        editor: {
          ...settings.editor,
          emphasisMark: {
            rule: settings.editor.emphasisMark?.rule ?? "aozora",
            aozoraMark: settings.editor.emphasisMark?.aozoraMark ?? "whiteSesame",
            narouMarkText: rawValue
          }
        }
      });
    case "editor.ruby.rule":
      if (typeof rawValue !== "string") {
        return null;
      }
      return saveRequest(settings, {
        editor: {
          ...settings.editor,
          ruby: {
            rule: rawValue as any
          }
        }
      });
    case "workbench.uiFontFamilyList":
      if (!Array.isArray(rawValue)) {
        return null;
      }
      return saveRequest(settings, {
        workbench: {
          ...settings.workbench,
          uiFontFamilyList: rawValue as any
        }
      });
    case "editor.fontFamilyList":
      if (!Array.isArray(rawValue)) {
        return null;
      }
      return saveRequest(settings, {
        editor: {
          ...settings.editor,
          fontFamilyList: rawValue as any
        }
      });
    case "preview.fontFamilyList":
      if (!Array.isArray(rawValue)) {
        return null;
      }
      return saveRequest(settings, {
        preview: {
          ...settings.preview,
          fontFamilyList: rawValue as any
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

  if (
    footerDetailMarqueeKeys.has(item.key) &&
    !settings.commandPalette.footerDetail.enable
  ) {
    return true;
  }

  if (soundChildKeys.has(item.key) && !settings.workbench.sound.enabled) {
    return true;
  }

  if (
    characterCountExcludeKeys.has(item.key) &&
    !settings.workbench.statusBar.characterCount.visible
  ) {
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
  displayLanguage?: Language;
  onChange: (rawValue: unknown) => void;
  onOpenSaveDestinationDialog?: (opener?: Element | null) => void;
  onOpenFontPickerDialog?: (slot: FontSlot, opener?: Element | null) => void;
}

function SettingControlInput({
  item,
  value,
  disabled,
  labelId,
  translate,
  displayLanguage,
  onChange,
  onOpenSaveDestinationDialog,
  onOpenFontPickerDialog
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
          className={
            item.key === "editor.lineEnding.markerGlyph"
              ? "settingsSelect settingsSelect-editorFont"
              : "settingsSelect"
          }
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
    case "custom":
      if (control.customKind === "imageAttachment.saveDirectory") {
        return (
          <SaveDestinationSettingControl
            id={controlId}
            value={typeof value === "string" ? value : ""}
            disabled={disabled}
            translate={translate}
            onOpenDialog={onOpenSaveDestinationDialog}
          />
        );
      }
      if (control.customKind === "fontFamilyList") {
        return (
          <FontFamilyListSettingControl
            id={controlId}
            slot={item.key as FontSlot}
            value={Array.isArray(value) ? (value as FontFamilySetting[]) : undefined}
            disabled={disabled}
            translate={translate}
            uiLanguage={displayLanguage}
            onOpenDialog={(slot, opener) => onOpenFontPickerDialog?.(slot, opener)}
          />
        );
      }
      return <div id={controlId} className="settingsCustomControlPlaceholder" />;
  }
}

interface SettingItemRowProps {
  item: SettingCatalogItem;
  settings: ApplicationSettings;
  isLoading: boolean;
  translate: Translate;
  displayLanguage?: Language;
  onChange: (item: SettingCatalogItem, rawValue: unknown) => void;
  onFieldFocus?: () => void;
  onFieldBlur?: () => void;
  onOpenSaveDestinationDialog?: (opener?: Element | null) => void;
  onOpenFontPickerDialog?: (slot: FontSlot, opener?: Element | null) => void;
}

function SettingItemRow({
  item,
  settings,
  isLoading,
  translate,
  displayLanguage,
  onChange,
  onFieldFocus,
  onFieldBlur,
  onOpenSaveDestinationDialog,
  onOpenFontPickerDialog
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
        {/* #394 Step 2 follow-up: onFocus/onBlur bubble up from the actual
            <input>/<select> rendered by SettingControlInput below, so every
            control kind gets restart-required focus tracking for free,
            without SettingControlInput needing to know about it. */}
        <div
          className="settingsItemControl"
          onFocus={onFieldFocus}
          onBlur={onFieldBlur}
        >
          <SettingControlInput
            item={item}
            value={value}
            disabled={disabled}
            labelId={labelId}
            translate={translate}
            displayLanguage={displayLanguage}
            onChange={(rawValue) => onChange(item, rawValue)}
            onOpenSaveDestinationDialog={onOpenSaveDestinationDialog}
            onOpenFontPickerDialog={onOpenFontPickerDialog}
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
      {unwiredKeys.has(item.key) ? (
        <p className="settingsDescription">
          {translate("settings.unwiredSettingNotice")}
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
  onOpenSaveDestinationDialog?: (opener?: Element | null) => void;
  onOpenFontPickerDialog?: (slot: FontSlot, opener?: Element | null) => void;
}

export function SettingsPanelView({
  settings,
  isLoading,
  error,
  translate,
  displayLanguage,
  onChangeSettings,
  onSettingFieldFocus,
  onSettingFieldBlur,
  selectedCategoryId,
  onSelectCategory,
  searchQuery,
  onSearchQueryChange,
  onOpenSaveDestinationDialog,
  onOpenFontPickerDialog
}: SettingsPanelViewProps): JSX.Element {
  // Only categories that currently have at least one registered catalog
  // item are shown in the left pane — settingCategoryCatalog itself keeps
  // every category (e.g. "project" has none registered yet), this is
  // purely a display-time filter for the pane. "documentMap" is the
  // exception: it has no scalar catalog items but owns a bespoke section
  // (#375 Task Q), so it is always kept.
  const categories = sortSettingCategoryCatalog((key) =>
    translateI18nKey(translate, key)
  ).filter(
    (category) =>
      category.id === "documentMap" ||
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
                  displayLanguage={displayLanguage}
                  onChange={handleChange}
                  onFieldFocus={onSettingFieldFocus}
                  onFieldBlur={onSettingFieldBlur}
                  onOpenSaveDestinationDialog={onOpenSaveDestinationDialog}
                  onOpenFontPickerDialog={onOpenFontPickerDialog}
                />
              ))}
            </div>
          )}

          {/* #375: the Document Map section is its own Settings category. It
              is not a catalog item — its dialogue-pair list / colour editors
              don't fit the generic control kinds. */}
          {!isSearching && selectedCategoryId === "documentMap" ? (
            <DocumentMapSettingsSection
              settings={settings}
              isLoading={isLoading}
              translate={translate}
              onChangeSettings={onChangeSettings}
            />
          ) : null}
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
  const [isDestinationDialogOpen, setIsDestinationDialogOpen] = useState(false);
  const [dialogOpener, setDialogOpener] = useState<Element | null>(null);

  const [fontPickerState, setFontPickerState] = useState<{
    slot: FontSlot;
    opener?: Element | null;
  } | null>(null);

  return (
    <>
      <SettingsPanelView
        {...props}
        selectedCategoryId={selectedCategoryId}
        onSelectCategory={(id) => {
          setSelectedCategoryId(id);
          setSearchQuery("");
        }}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onOpenSaveDestinationDialog={(opener) => {
          setDialogOpener(opener ?? null);
          setIsDestinationDialogOpen(true);
        }}
        onOpenFontPickerDialog={(slot, opener) => {
          setFontPickerState({ slot, opener });
        }}
      />
      <SaveDestinationDialog
        isOpen={isDestinationDialogOpen}
        initialSaveDirectory={props.settings.imageAttachment.saveDirectory}
        initialInsertMarkdownLink={
          props.settings.imageAttachment.insertMarkdownLink
        }
        mode="settings"
        translate={props.translate}
        opener={dialogOpener}
        onSave={(result) => {
          setIsDestinationDialogOpen(false);
          const nextSettings = buildNextSettings(
            "imageAttachment.saveDirectory",
            result,
            props.settings
          );
          if (nextSettings) {
            props.onChangeSettings(nextSettings);
          }
        }}
        onDismiss={() => setIsDestinationDialogOpen(false)}
      />
      <FontPickerDialog
        isOpen={fontPickerState !== null}
        slot={fontPickerState?.slot ?? "workbench.uiFontFamilyList"}
        initialValue={
          fontPickerState
            ? (readSettingValue(
                fontPickerState.slot,
                props.settings
              ) as FontFamilySetting[])
            : []
        }
        translate={props.translate}
        uiLanguage={props.displayLanguage}
        opener={fontPickerState?.opener}
        onSave={(selectedFonts) => {
          if (fontPickerState) {
            const nextSettings = buildNextSettings(
              fontPickerState.slot,
              selectedFonts,
              props.settings
            );
            if (nextSettings) {
              props.onChangeSettings(nextSettings);
            }
          }
        }}
        onClose={() => setFontPickerState(null)}
      />
    </>
  );
}
