import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  defaultApplicationSettings,
  type ApplicationSettings
} from "../../src/shared/settings";
import { t, type Language, type Translate } from "../../src/shared/i18n";
import {
  settingCatalogItems,
  settingCategoryCatalog,
  type SettingCategory
} from "../../src/shared/settingsUiCatalog";
import {
  SettingsPanel,
  SettingsPanelView,
  getVisibleSettingCatalogItems
} from "../../src/renderer/SettingsPanel";

type ElementProps = Record<string, unknown> & {
  children?: React.ReactNode;
};

const settingsPanelSource = () =>
  readFileSync("src/renderer/SettingsPanel.tsx", "utf8");

const stylesSource = () => readFileSync("src/renderer/styles.css", "utf8");

function translateFor(language: Language): Translate {
  return (key, values) => t(language, key, values);
}

interface SettingsPanelViewOptions {
  settings?: ApplicationSettings;
  isLoading?: boolean;
  error?: string | null;
  onChangeSettings?: Parameters<typeof SettingsPanelView>[0]["onChangeSettings"];
  selectedCategoryId?: SettingCategory;
  onSelectCategory?: (id: SettingCategory) => void;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
}

function settingsPanelViewElement(
  currentUiLanguage: Language,
  options: SettingsPanelViewOptions = {}
): JSX.Element {
  return SettingsPanelView({
    settings: options.settings ?? defaultApplicationSettings,
    isLoading: options.isLoading ?? false,
    error: options.error ?? null,
    translate: translateFor(currentUiLanguage),
    onChangeSettings: options.onChangeSettings ?? (() => undefined),
    selectedCategoryId: options.selectedCategoryId ?? "application",
    onSelectCategory: options.onSelectCategory ?? (() => undefined),
    searchQuery: options.searchQuery ?? "",
    onSearchQueryChange: options.onSearchQueryChange ?? (() => undefined)
  });
}

function renderSettingsPanelView(
  currentUiLanguage: Language,
  options: SettingsPanelViewOptions = {}
): string {
  return renderToStaticMarkup(
    settingsPanelViewElement(currentUiLanguage, options)
  );
}

// A search query that isolates exactly one catalog item regardless of which
// category is currently selected — the setting key is unique, so this is a
// reliable way to reach a single item's control without tracking its
// category in every test.
function isolate(key: string): string {
  return key;
}

function collectElements(
  node: React.ReactNode,
  predicate: (element: React.ReactElement<ElementProps>) => boolean
): React.ReactElement<ElementProps>[] {
  const elements: React.ReactElement<ElementProps>[] = [];

  React.Children.forEach(node, (child) => {
    if (!React.isValidElement<ElementProps>(child)) {
      return;
    }

    // SettingsPanelView is composed of nested function components
    // (SettingItemRow, SettingControlInput, ...). Their rendered output
    // lives behind a function call, not in `props.children` — so expand
    // custom component elements by invoking them (they are all pure/
    // stateless, so a direct call is safe) and recurse into that output
    // instead of into their own (unrelated) children prop.
    if (typeof child.type === "function") {
      const rendered = (
        child.type as (props: ElementProps) => React.ReactNode
      )(child.props);

      elements.push(...collectElements(rendered, predicate));
      return;
    }

    if (predicate(child)) {
      elements.push(child);
    }

    elements.push(...collectElements(child.props.children, predicate));
  });

  return elements;
}

function elementById(
  node: React.ReactNode,
  id: string
): React.ReactElement<ElementProps> {
  const element = collectElements(node, (child) => child.props.id === id)[0];

  if (!element) {
    throw new Error(`Element not found: ${id}`);
  }

  return element;
}

function controlElement(
  node: React.ReactNode,
  key: string
): React.ReactElement<ElementProps> {
  return elementById(node, `settingControl-${key}`);
}

describe("SettingsPanelView catalog-driven rendering (#230)", () => {
  it("renders the localized label of every category that has registered items in the left pane", () => {
    const markup = renderSettingsPanelView("ja");

    for (const label of [
      "アプリケーション",
      "外観",
      "エディタ",
      "プレビュー",
      "ファイル",
      "コマンドパレット",
      "サウンド"
    ]) {
      expect(markup).toContain(label);
    }
  });

  it("does not show a category in the left pane when it has no registered catalog items (project, advanced)", () => {
    const element = settingsPanelViewElement("ja");
    const buttons = collectElements(
      element,
      (child) =>
        child.type === "button" &&
        typeof child.props.className === "string" &&
        child.props.className.includes("settingsCategoryButton")
    );
    const labels = buttons.map((button) =>
      React.Children.toArray(button.props.children).join("")
    );

    expect(labels).not.toContain("プロジェクト");
    expect(labels).not.toContain("詳細設定");
    expect(labels).toHaveLength(7);
  });

  it("shows only the selected category's settings in the right pane", () => {
    const element = settingsPanelViewElement("en", {
      selectedCategoryId: "editor"
    });

    expect(controlElement(element, "editor.fontFamily")).toBeDefined();
    expect(() => controlElement(element, "workbench.language")).toThrow();
    expect(() => controlElement(element, "files.newFile.lineEnding")).toThrow();
  });

  it("shows label, description, and the internal setting key for an item", () => {
    const markup = renderSettingsPanelView("en", {
      searchQuery: isolate("editor.fontFamily")
    });

    expect(markup).toContain("Editor font");
    expect(markup).toContain(
      "Font family used for Markdown editor body text. Enter an unquoted CSS font-family list."
    );
    expect(markup).toContain("<code");
    expect(markup).toContain("editor.fontFamily</code>");
  });

  it("shows the footer detail Command Palette setting text instead of command-description wording", () => {
    const markup = renderSettingsPanelView("en", {
      searchQuery: isolate("commandPalette.footerDetail.enable")
    });

    expect(markup).toContain("Show footer details");
    expect(markup).toContain(
      "Show descriptions or previews for the selected Command Palette candidate in the footer."
    );
    expect(markup).toContain("commandPalette.footerDetail.enable</code>");
    expect(markup).not.toContain("Show command descriptions");
  });

  it("does not hardcode any individual setting's label/description i18n key — those are read from the catalog item, not embedded per-field", () => {
    const source = settingsPanelSource();
    const perItemKeysThatMustNotBeHardcoded = [
      "settings.workbench.language.label",
      "settings.workbench.language.description",
      "settings.workbench.statusBar.visible.label",
      "settings.workbench.statusBar.characterCount.visible.label",
      "settings.workbench.sound.enabled.label",
      "settings.editor.characterCount.exclude.markdownSyntax.label",
      "settings.editor.whitespace.renderIdeographicSpace.label",
      "settings.editor.fontFamily.label",
      "settings.files.newFile.lineEnding.label",
      "settings.files.newFile.lineEnding.option.lf.label",
      "settings.commandPalette.footerDetail.marquee.delay.label",
      "settings.preview.renderer.label"
    ];

    for (const key of perItemKeysThatMustNotBeHardcoded) {
      expect(source).not.toContain(`"${key}"`);
    }

    // Rendering instead goes through the catalog objects.
    expect(source).toContain("settingCatalogItems");
    expect(source).toContain("settingCategoryCatalog");
    expect(source).toContain("item.labelKey");
    expect(source).toContain("item.descriptionKey");
  });

  it("mounts through the real hook-owning SettingsPanel entry point without crashing, defaulting to the first catalog category and an empty search", () => {
    const markup = renderToStaticMarkup(
      <SettingsPanel
        settings={defaultApplicationSettings}
        isLoading={false}
        error={null}
        translate={translateFor("en")}
        onChangeSettings={() => undefined}
      />
    );

    // "application" is the first category in settingCategoryCatalog order.
    expect(markup).toContain("Application");
    expect(markup).toContain("settingControl-workbench.language");
  });
});

describe("SettingsPanelView category behavior (#230)", () => {
  it("renders categories in catalog order", () => {
    const element = settingsPanelViewElement("en");
    const buttons = collectElements(
      element,
      (child) =>
        child.type === "button" &&
        typeof child.props.className === "string" &&
        child.props.className.includes("settingsCategoryButton")
    );

    // Static rendering resolves children to plain text at this point, so
    // read the translated label back out of each button's children.
    const labels = buttons.map((button) =>
      React.Children.toArray(button.props.children).join("")
    );

    expect(labels).toEqual([
      "Application",
      "Appearance",
      "Editor",
      "Preview",
      "Files",
      "Command Palette",
      "Sound"
    ]);
  });

  it("marks only the selected category's button as current", () => {
    const element = settingsPanelViewElement("en", {
      selectedCategoryId: "files"
    });
    const buttons = collectElements(
      element,
      (child) =>
        child.type === "button" &&
        typeof child.props.className === "string" &&
        child.props.className.includes("settingsCategoryButton")
    );
    const current = buttons.filter((button) => button.props["aria-current"]);

    expect(current).toHaveLength(1);
    expect(
      React.Children.toArray(current[0]?.props.children).join("")
    ).toBe("Files");
  });

  it("clicking a category button invokes onSelectCategory with that category's id", () => {
    const onSelectCategory = vi.fn();
    const element = settingsPanelViewElement("en", { onSelectCategory });
    const buttons = collectElements(
      element,
      (child) =>
        child.type === "button" &&
        typeof child.props.className === "string" &&
        child.props.className.includes("settingsCategoryButton")
    );
    const filesButton = buttons.find(
      (button) =>
        React.Children.toArray(button.props.children).join("") === "Files"
    );

    expect(filesButton).toBeDefined();
    (filesButton?.props.onClick as () => void)();

    expect(onSelectCategory).toHaveBeenCalledWith("files");
  });

  it("orders items within the selected category by catalog order (application category)", () => {
    const element = settingsPanelViewElement("en", {
      selectedCategoryId: "application"
    });
    const keyElements = collectElements(
      element,
      (child) =>
        child.type === "code" &&
        typeof child.props.className === "string" &&
        child.props.className.includes("settingsItemKey")
    );

    expect(keyElements.map((el) => el.props.children)).toEqual([
      "workbench.language",
      "workbench.statusBar.visible",
      "notification.output.enabled",
      "workbench.notification.durationMs"
    ]);
  });

  it("orders character count settings together within the selected editor category (#259 taxonomy)", () => {
    const element = settingsPanelViewElement("en", {
      selectedCategoryId: "editor"
    });
    const keyElements = collectElements(
      element,
      (child) =>
        child.type === "code" &&
        typeof child.props.className === "string" &&
        child.props.className.includes("settingsItemKey")
    );

    expect(keyElements.map((el) => el.props.children)).toEqual([
      "editor.fontFamily",
      "editor.paragraphIndent.excludeLeadingCharacters",
      "editor.lineEnding.expected",
      "editor.lineEnding.markerGlyph",
      "editor.whitespace.renderIdeographicSpace",
      "editor.whitespace.renderAsciiSpace",
      "editor.whitespace.renderTab",
      "editor.whitespace.renderOtherUnicodeSpace",
      "workbench.statusBar.characterCount.visible",
      "editor.characterCount.exclude.whitespace",
      "editor.characterCount.exclude.lineBreaks",
      "editor.characterCount.exclude.headings",
      "editor.characterCount.exclude.markdownSyntax",
      "editor.characterCount.exclude.markdownComments"
    ]);
  });

  it("orders items within the selected category by catalog order (sound category)", () => {
    const element = settingsPanelViewElement("en", {
      selectedCategoryId: "sound"
    });
    const keyElements = collectElements(
      element,
      (child) =>
        child.type === "code" &&
        typeof child.props.className === "string" &&
        child.props.className.includes("settingsItemKey")
    );

    expect(keyElements.map((el) => el.props.children)).toEqual([
      "workbench.sound.enabled",
      "workbench.sound.dialog.enabled",
      "workbench.sound.newline.enabled",
      "workbench.sound.keypress.enabled"
    ]);
  });

  it("orders items within the selected category by catalog order (files category)", () => {
    const element = settingsPanelViewElement("en", {
      selectedCategoryId: "files"
    });
    const keyElements = collectElements(
      element,
      (child) =>
        child.type === "code" &&
        typeof child.props.className === "string" &&
        child.props.className.includes("settingsItemKey")
    );

    expect(keyElements.map((el) => el.props.children)).toEqual([
      "files.newFile.lineEnding",
      "files.newFile.encoding"
    ]);
  });

  it("does not show any empty-category message during normal category browsing, even for a category with no registered items (e.g. project, reached directly by prop)", () => {
    const markup = renderSettingsPanelView("en", {
      selectedCategoryId: "project"
    });

    expect(markup).not.toContain("this category");
    expect(markup).not.toContain("No settings match your search.");
  });

  it("places the Sound category after Command Palette in catalog order", () => {
    const soundCategory = settingCategoryCatalog.find((c) => c.id === "sound");
    const commandsCategory = settingCategoryCatalog.find(
      (c) => c.id === "commands"
    );

    expect(soundCategory).toBeDefined();
    expect(commandsCategory).toBeDefined();
    expect(soundCategory!.order).toBeGreaterThan(commandsCategory!.order);
  });

  it("no longer has an 'advanced' category (#232: the legacy Advanced Settings gate is retired, and no replacement category is introduced)", () => {
    const categoryIds: readonly string[] = settingCategoryCatalog.map(
      (category) => category.id
    );

    expect(categoryIds).not.toContain("advanced");
  });
});

describe("getVisibleSettingCatalogItems search behavior (#230)", () => {
  const translate = translateFor("ja");

  it("finds a setting by its internal key", () => {
    const items = getVisibleSettingCatalogItems(
      "files.newFile.lineEnding",
      "application",
      translate
    );

    expect(items.map((item) => item.key)).toEqual(["files.newFile.lineEnding"]);
  });

  it("finds a setting by its localized label", () => {
    const items = getVisibleSettingCatalogItems(
      "ステータスバー",
      "editor",
      translate
    );

    expect(items.map((item) => item.key)).toEqual([
      "workbench.statusBar.visible",
      "workbench.statusBar.characterCount.visible"
    ]);
  });

  it("finds a setting by its localized description", () => {
    const items = getVisibleSettingCatalogItems(
      "打鍵",
      "editor",
      translate
    );

    expect(items.map((item) => item.key)).toEqual([
      "workbench.sound.keypress.enabled"
    ]);
  });

  it("finds a select setting by option value", () => {
    const items = getVisibleSettingCatalogItems("crlf", "application", translate);

    // #252 added editor.lineEnding.expected, which also has a "crlf" option
    // value — both settings legitimately match this query now.
    expect(items.map((item) => item.key).sort()).toEqual(
      ["editor.lineEnding.expected", "files.newFile.lineEnding"].sort()
    );
  });

  it("finds a select setting by localized option label", () => {
    const items = getVisibleSettingCatalogItems(
      "UTF-8",
      "application",
      translate
    );

    expect(items.map((item) => item.key)).toContain("files.newFile.encoding");
  });

  it("trims whitespace and matches case-insensitively", () => {
    const items = getVisibleSettingCatalogItems(
      "  WORKBENCH.LANGUAGE  ",
      "files",
      translate
    );

    expect(items.map((item) => item.key)).toEqual(["workbench.language"]);
  });

  it("returns the selected category's items, in catalog order, for an empty query", () => {
    const items = getVisibleSettingCatalogItems("", "files", translate);

    expect(items.map((item) => item.key)).toEqual([
      "files.newFile.lineEnding",
      "files.newFile.encoding"
    ]);
  });

  it("returns an empty list for a query that matches nothing", () => {
    const items = getVisibleSettingCatalogItems(
      "zzz_no_such_setting",
      "application",
      translate
    );

    expect(items).toEqual([]);
  });
});

describe("SettingsPanelView search UI (#230)", () => {
  it("renders a search input wired to searchQuery / onSearchQueryChange", () => {
    const onSearchQueryChange = vi.fn();
    const element = settingsPanelViewElement("en", {
      searchQuery: "font",
      onSearchQueryChange
    });
    const input = elementById(element, "settingsSearchInput");

    expect(input.props.value).toBe("font");

    (input.props.onChange as (event: { target: { value: string } }) => void)({
      target: { value: "sound" }
    });

    expect(onSearchQueryChange).toHaveBeenCalledWith("sound");
  });

  it("shows the search results heading and flattens matches across categories while searching", () => {
    const markup = renderSettingsPanelView("en", {
      selectedCategoryId: "editor",
      searchQuery: "sound"
    });

    expect(markup).toContain("Search results");
    expect(markup).toContain("settingControl-workbench.sound.enabled");
  });

  it("shows the search empty state for a query with no matches", () => {
    const markup = renderSettingsPanelView("en", {
      searchQuery: "zzz_no_such_setting"
    });

    expect(markup).toContain("No settings match your search.");
  });

  it("falls back to the normal category view once the query is cleared", () => {
    const markup = renderSettingsPanelView("en", {
      selectedCategoryId: "editor",
      searchQuery: ""
    });

    expect(markup).toContain("settingControl-editor.fontFamily");
    expect(markup).not.toContain("settingControl-workbench.language");
  });
});

describe("SettingsPanelView search input polish (#234)", () => {
  it("renders the updated localized placeholder in ja and en", () => {
    expect(renderSettingsPanelView("ja")).toContain(
      "検索語句を入力（例：エディタ、sound）"
    );
    expect(renderSettingsPanelView("en")).toContain(
      "Enter search terms (e.g. editor, sound)"
    );
  });

  it("keeps its accessible label distinct from the placeholder and the decorative icon", () => {
    const element = settingsPanelViewElement("en");
    const input = elementById(element, "settingsSearchInput");

    expect(input.props["aria-label"]).toBe("Search settings");
    expect(input.props.placeholder).toBe(
      "Enter search terms (e.g. editor, sound)"
    );
  });

  it("renders a decorative search icon that does not carry its own accessible name", () => {
    const element = settingsPanelViewElement("en");
    const icon = collectElements(
      element,
      (child) =>
        typeof child.props.className === "string" &&
        child.props.className === "settingsSearchIcon"
    )[0];

    expect(icon).toBeDefined();
    expect(icon.props["aria-hidden"]).toBe("true");
    expect(icon.props["aria-label"]).toBeUndefined();
    expect(icon.props.title).toBeUndefined();
  });

  it("references the feather search icon asset content", () => {
    const element = settingsPanelViewElement("en");
    const icon = collectElements(
      element,
      (child) =>
        typeof child.props.className === "string" &&
        child.props.className === "settingsSearchIcon"
    )[0];
    const html = (
      icon.props as unknown as {
        dangerouslySetInnerHTML: { __html: string };
      }
    ).dangerouslySetInnerHTML.__html;

    expect(html).toContain("feather-search");

    const source = settingsPanelSource();

    expect(source).toContain(
      'from "../../assets/icons/feather/global/search.svg?raw"'
    );
  });

  it("does not change existing search matching behavior (trim + case-insensitive substring, no fuzzy/kana normalization)", () => {
    const translate = translateFor("ja");

    expect(
      getVisibleSettingCatalogItems(
        "  WORKBENCH.LANGUAGE  ",
        "files",
        translate
      ).map((item) => item.key)
    ).toEqual(["workbench.language"]);
    expect(
      getVisibleSettingCatalogItems("zzz_no_such_setting", "application", translate)
    ).toEqual([]);
  });
});

describe("SettingsPanelView switch control polish (#234)", () => {
  it("still renders a real <input type=\"checkbox\"> for switch controls", () => {
    const element = settingsPanelViewElement("en", {
      searchQuery: isolate("workbench.statusBar.visible")
    });
    const input = controlElement(element, "workbench.statusBar.visible");

    expect(input.type).toBe("input");
    expect(input.props.type).toBe("checkbox");
    expect(input.props.className).toBe("settingsSwitchInput");
  });

  it("gives the switch input a stable, key-derived id", () => {
    const element = settingsPanelViewElement("en", {
      searchQuery: isolate("workbench.statusBar.visible")
    });
    const input = controlElement(element, "workbench.statusBar.visible");

    expect(input.props.id).toBe("settingControl-workbench.statusBar.visible");
  });

  it("associates the visible setting label with the switch input via aria-labelledby", () => {
    const element = settingsPanelViewElement("en", {
      searchQuery: isolate("workbench.statusBar.visible")
    });
    const input = controlElement(element, "workbench.statusBar.visible");
    const label = elementById(
      element,
      "settingLabel-workbench.statusBar.visible"
    );

    expect(input.props["aria-labelledby"]).toBe(label.props.id);
    expect(label.props.children).toBe("Status bar");
  });

  it("wraps the visible label and the switch input in a single <label>, so clicking either toggles it (structural support for label-click)", () => {
    const markup = renderSettingsPanelView("en", {
      searchQuery: isolate("workbench.statusBar.visible")
    });
    const labelOpenIndex = markup.indexOf('<label class="settingsItemHeader">');
    const labelCloseIndex = markup.indexOf("</label>", labelOpenIndex);
    const visibleLabelIndex = markup.indexOf(
      'id="settingLabel-workbench.statusBar.visible"'
    );
    const switchInputIndex = markup.indexOf(
      'id="settingControl-workbench.statusBar.visible"'
    );

    expect(labelOpenIndex).toBeGreaterThan(-1);
    expect(labelCloseIndex).toBeGreaterThan(labelOpenIndex);
    expect(visibleLabelIndex).toBeGreaterThan(labelOpenIndex);
    expect(visibleLabelIndex).toBeLessThan(labelCloseIndex);
    expect(switchInputIndex).toBeGreaterThan(labelOpenIndex);
    expect(switchInputIndex).toBeLessThan(labelCloseIndex);
  });

  it("does not wrap non-switch controls in a <label> (only the switch kind changes structurally)", () => {
    const markup = renderSettingsPanelView("en", {
      searchQuery: isolate("editor.fontFamily")
    });

    expect(markup).toContain('<div class="settingsItemHeader">');
    expect(markup).not.toContain('<label class="settingsItemHeader">');
  });

  it("still calls onChangeSettings immediately when the switch is toggled (no Apply/OK/Cancel)", () => {
    const onChangeSettings = vi.fn();
    const element = settingsPanelViewElement("en", {
      searchQuery: isolate("workbench.statusBar.visible"),
      onChangeSettings
    });
    const input = controlElement(element, "workbench.statusBar.visible");
    const onChange = input.props.onChange as (event: {
      target: { checked: boolean };
    }) => void;

    onChange({ target: { checked: false } });

    expect(onChangeSettings).toHaveBeenCalledTimes(1);
  });

  it("keeps a disabled switch control disabled (sound child gating unaffected by the style change)", () => {
    const settings: ApplicationSettings = {
      ...defaultApplicationSettings,
      workbench: {
        ...defaultApplicationSettings.workbench,
        sound: {
          enabled: false,
          dialog: { enabled: true },
          newline: { enabled: true },
          keypress: { enabled: false }
        }
      }
    };
    const element = settingsPanelViewElement("en", {
      settings,
      searchQuery: isolate("workbench.sound.dialog.enabled")
    });
    const input = controlElement(element, "workbench.sound.dialog.enabled");

    expect(input.props.disabled).toBe(true);
  });

  it("disables switch controls while isLoading", () => {
    const element = settingsPanelViewElement("en", {
      isLoading: true,
      searchQuery: isolate("workbench.statusBar.visible")
    });
    const input = controlElement(element, "workbench.statusBar.visible");

    expect(input.props.disabled).toBe(true);
  });
});

describe("SettingsPanelView edit/save behavior (#230)", () => {
  it("saves immediately when a switch setting changes, with no Apply/OK/Cancel step", () => {
    const onChangeSettings = vi.fn();
    const element = settingsPanelViewElement("en", {
      searchQuery: isolate("workbench.statusBar.visible"),
      onChangeSettings
    });
    const input = controlElement(element, "workbench.statusBar.visible");
    const onChange = input.props.onChange as (event: {
      target: { checked: boolean };
    }) => void;

    onChange({ target: { checked: false } });

    expect(onChangeSettings).toHaveBeenCalledWith({
      preview: defaultApplicationSettings.preview,
      workbench: {
        ...defaultApplicationSettings.workbench,
        statusBar: {
          ...defaultApplicationSettings.workbench.statusBar,
          visible: false
        }
      },
      commandPalette: defaultApplicationSettings.commandPalette,
      editor: defaultApplicationSettings.editor,
      files: defaultApplicationSettings.files
    });
  });

  it("saves immediately when the status-bar character count visibility switch changes (#259)", () => {
    const onChangeSettings = vi.fn();
    const element = settingsPanelViewElement("en", {
      searchQuery: isolate("workbench.statusBar.characterCount.visible"),
      onChangeSettings
    });
    const input = controlElement(
      element,
      "workbench.statusBar.characterCount.visible"
    );
    const onChange = input.props.onChange as (event: {
      target: { checked: boolean };
    }) => void;

    onChange({ target: { checked: false } });

    expect(onChangeSettings).toHaveBeenCalledWith({
      preview: defaultApplicationSettings.preview,
      workbench: {
        ...defaultApplicationSettings.workbench,
        statusBar: {
          ...defaultApplicationSettings.workbench.statusBar,
          characterCount: { visible: false }
        }
      },
      commandPalette: defaultApplicationSettings.commandPalette,
      editor: defaultApplicationSettings.editor,
      files: defaultApplicationSettings.files
    });
  });

  it("saves immediately when the notification output switch changes (#298)", () => {
    const onChangeSettings = vi.fn();
    const element = settingsPanelViewElement("en", {
      searchQuery: isolate("notification.output.enabled"),
      onChangeSettings
    });
    const input = controlElement(element, "notification.output.enabled");
    const onChange = input.props.onChange as (event: {
      target: { checked: boolean };
    }) => void;

    onChange({ target: { checked: false } });

    expect(onChangeSettings).toHaveBeenCalledWith({
      preview: defaultApplicationSettings.preview,
      notification: { output: { enabled: false } },
      workbench: defaultApplicationSettings.workbench,
      commandPalette: defaultApplicationSettings.commandPalette,
      editor: defaultApplicationSettings.editor,
      files: defaultApplicationSettings.files
    });
  });

  it("saves immediately when a character-count exclusion switch changes (#259)", () => {
    const onChangeSettings = vi.fn();
    const element = settingsPanelViewElement("en", {
      searchQuery: isolate("editor.characterCount.exclude.markdownSyntax"),
      onChangeSettings
    });
    const input = controlElement(
      element,
      "editor.characterCount.exclude.markdownSyntax"
    );
    const onChange = input.props.onChange as (event: {
      target: { checked: boolean };
    }) => void;

    onChange({ target: { checked: false } });

    expect(onChangeSettings).toHaveBeenCalledWith({
      preview: defaultApplicationSettings.preview,
      workbench: defaultApplicationSettings.workbench,
      commandPalette: defaultApplicationSettings.commandPalette,
      editor: {
        ...defaultApplicationSettings.editor,
        characterCount: {
          ...defaultApplicationSettings.editor.characterCount,
          exclude: {
            ...defaultApplicationSettings.editor.characterCount.exclude,
            markdownSyntax: false
          }
        }
      },
      files: defaultApplicationSettings.files
    });
  });

  it("saves immediately when a whitespace rendering switch changes (#256)", () => {
    const settings: ApplicationSettings = defaultApplicationSettings;
    const onChangeSettings = vi.fn();
    const element = settingsPanelViewElement("en", {
      settings,
      searchQuery: isolate("editor.whitespace.renderAsciiSpace"),
      onChangeSettings
    });
    const input = controlElement(
      element,
      "editor.whitespace.renderAsciiSpace"
    );
    const onChange = input.props.onChange as (event: {
      target: { checked: boolean };
    }) => void;

    onChange({ target: { checked: true } });

    expect(onChangeSettings).toHaveBeenCalledWith({
      preview: settings.preview,
      workbench: settings.workbench,
      commandPalette: settings.commandPalette,
      editor: {
        ...settings.editor,
        whitespace: {
          ...settings.editor.whitespace,
          renderAsciiSpace: true
        }
      },
      files: settings.files
    });
  });

  it("saves immediately when a select setting changes (files.newFile.lineEnding is directly editable, no advanced gate — #232)", () => {
    const settings: ApplicationSettings = defaultApplicationSettings;
    const onChangeSettings = vi.fn();
    const element = settingsPanelViewElement("en", {
      settings,
      searchQuery: isolate("files.newFile.lineEnding"),
      onChangeSettings
    });
    const select = controlElement(element, "files.newFile.lineEnding");
    const onChange = select.props.onChange as (event: {
      target: { value: string };
    }) => void;

    onChange({ target: { value: "crlf" } });

    expect(onChangeSettings).toHaveBeenCalledWith({
      preview: settings.preview,
      workbench: settings.workbench,
      commandPalette: settings.commandPalette,
      editor: settings.editor,
      files: {
        ...settings.files,
        newFile: { ...settings.files.newFile, lineEnding: "crlf" }
      }
    });
  });

  it("saves immediately when a text setting changes, omitting an empty fontFamily rather than sending an empty string", () => {
    const settings: ApplicationSettings = {
      ...defaultApplicationSettings,
      editor: {
        ...defaultApplicationSettings.editor,
        fontFamily: "Fira Code",
        lineEnding: defaultApplicationSettings.editor.lineEnding
      }
    };
    const onChangeSettings = vi.fn();
    const element = settingsPanelViewElement("en", {
      settings,
      searchQuery: isolate("editor.fontFamily"),
      onChangeSettings
    });
    const input = controlElement(element, "editor.fontFamily");
    const onChange = input.props.onChange as (event: {
      target: { value: string };
    }) => void;

    onChange({ target: { value: "   " } });

    expect(onChangeSettings).toHaveBeenCalledWith({
      preview: settings.preview,
      workbench: settings.workbench,
      commandPalette: settings.commandPalette,
      editor: {
        lineEnding: settings.editor.lineEnding,
        whitespace: settings.editor.whitespace,
        paragraphIndent: settings.editor.paragraphIndent,
        characterCount: settings.editor.characterCount
      },
      files: settings.files
    });
  });

  it("saves paragraph indent excluded leading characters as a free-form text setting, including an empty string", () => {
    const settings: ApplicationSettings = {
      ...defaultApplicationSettings,
      editor: {
        ...defaultApplicationSettings.editor,
        paragraphIndent: { excludeLeadingCharacters: "「『" }
      }
    };
    const onChangeSettings = vi.fn();
    const element = settingsPanelViewElement("en", {
      settings,
      searchQuery: isolate("editor.paragraphIndent.excludeLeadingCharacters"),
      onChangeSettings
    });
    const input = controlElement(
      element,
      "editor.paragraphIndent.excludeLeadingCharacters"
    );
    const onChange = input.props.onChange as (event: {
      target: { value: string };
    }) => void;

    onChange({ target: { value: "" } });

    expect(onChangeSettings).toHaveBeenLastCalledWith({
      preview: settings.preview,
      workbench: settings.workbench,
      commandPalette: settings.commandPalette,
      editor: {
        ...settings.editor,
        paragraphIndent: { excludeLeadingCharacters: "" }
      },
      files: settings.files
    });

    onChange({ target: { value: "「『（〖" } });

    expect(onChangeSettings).toHaveBeenLastCalledWith({
      preview: settings.preview,
      workbench: settings.workbench,
      commandPalette: settings.commandPalette,
      editor: {
        ...settings.editor,
        paragraphIndent: { excludeLeadingCharacters: "「『（〖" }
      },
      files: settings.files
    });
  });

  it("saves immediately when a number setting changes (commandPalette.footerDetail.marquee.delay is directly editable, no advanced gate — #232)", () => {
    const settings: ApplicationSettings = defaultApplicationSettings;
    const onChangeSettings = vi.fn();
    const element = settingsPanelViewElement("en", {
      settings,
      searchQuery: isolate("commandPalette.footerDetail.marquee.delay"),
      onChangeSettings
    });
    const input = controlElement(
      element,
      "commandPalette.footerDetail.marquee.delay"
    );
    const onChange = input.props.onChange as (event: {
      target: { valueAsNumber: number };
    }) => void;

    onChange({ target: { valueAsNumber: 2500 } });

    expect(onChangeSettings).toHaveBeenCalledWith({
      preview: settings.preview,
      workbench: settings.workbench,
      commandPalette: {
        ...settings.commandPalette,
        footerDetail: {
          ...settings.commandPalette.footerDetail,
          marquee: {
            ...settings.commandPalette.footerDetail.marquee,
            delay: 2500
          }
        }
      },
      editor: settings.editor,
      files: settings.files
    });
  });

  it("ignores a non-finite number value instead of saving it", () => {
    const settings: ApplicationSettings = defaultApplicationSettings;
    const onChangeSettings = vi.fn();
    const element = settingsPanelViewElement("en", {
      settings,
      searchQuery: isolate("commandPalette.footerDetail.marquee.speed"),
      onChangeSettings
    });
    const input = controlElement(
      element,
      "commandPalette.footerDetail.marquee.speed"
    );
    const onChange = input.props.onChange as (event: {
      target: { valueAsNumber: number };
    }) => void;

    onChange({ target: { valueAsNumber: Number.NaN } });

    expect(onChangeSettings).not.toHaveBeenCalled();
  });

  it("preserves the save-failure display: the error prop still renders as a settingsError message", () => {
    const markup = renderSettingsPanelView("en", {
      error: "Settings save failed: disk full"
    });

    expect(markup).toContain("settingsError");
    expect(markup).toContain("Settings save failed: disk full");
  });

  it("does not introduce Apply / OK / Cancel or a dirty-state concept", () => {
    const source = settingsPanelSource();

    expect(source).not.toMatch(/\bdirty\b/i);
    expect(source).not.toContain("Apply");
    expect(source).not.toContain("onApply");
    expect(source).not.toContain("onCancel");
  });
});

describe("SettingsPanelView: legacy Advanced Settings gate removed (#232)", () => {
  it("files.newFile.lineEnding and files.newFile.encoding are directly editable — no advanced gate", () => {
    const element = settingsPanelViewElement("en", {
      selectedCategoryId: "files"
    });

    expect(
      controlElement(element, "files.newFile.lineEnding").props.disabled
    ).toBe(false);
    expect(
      controlElement(element, "files.newFile.encoding").props.disabled
    ).toBe(false);
  });

  it("commandPalette.footerDetail.enable is directly editable — no advanced gate", () => {
    const element = settingsPanelViewElement("en", {
      selectedCategoryId: "commands"
    });

    expect(
      controlElement(element, "commandPalette.footerDetail.enable").props
        .disabled
    ).toBe(false);
  });

  it("marquee number controls are disabled only when footer details are disabled, not by any advanced gate", () => {
    const settings: ApplicationSettings = {
      ...defaultApplicationSettings,
      commandPalette: {
        footerDetail: { enable: false, marquee: { delay: 3456, speed: 78.5 } }
      }
    };
    const element = settingsPanelViewElement("en", {
      settings,
      selectedCategoryId: "commands"
    });

    expect(
      controlElement(element, "commandPalette.footerDetail.enable").props
        .disabled
    ).toBe(false);
    expect(
      controlElement(element, "commandPalette.footerDetail.marquee.delay")
        .props.disabled
    ).toBe(true);
    expect(
      controlElement(element, "commandPalette.footerDetail.marquee.delay")
        .props.value
    ).toBe(3456);
  });

  it("marquee number controls are enabled when footer details are enabled (the default)", () => {
    const element = settingsPanelViewElement("en", {
      selectedCategoryId: "commands"
    });

    expect(
      controlElement(element, "commandPalette.footerDetail.marquee.delay")
        .props.disabled
    ).toBe(false);
    expect(
      controlElement(element, "commandPalette.footerDetail.marquee.speed")
        .props.disabled
    ).toBe(false);
  });

  it("disables child sound controls when the parent sound toggle is off, while preserving their stored values (sound gating is unrelated to advanced and remains)", () => {
    const settings: ApplicationSettings = {
      ...defaultApplicationSettings,
      workbench: {
        ...defaultApplicationSettings.workbench,
        sound: {
          enabled: false,
          dialog: { enabled: true },
          newline: { enabled: true },
          keypress: { enabled: false }
        }
      }
    };
    const element = settingsPanelViewElement("en", {
      settings,
      selectedCategoryId: "sound"
    });

    expect(
      controlElement(element, "workbench.sound.dialog.enabled").props.disabled
    ).toBe(true);
    expect(
      controlElement(element, "workbench.sound.dialog.enabled").props.checked
    ).toBe(true);
    expect(
      controlElement(element, "workbench.sound.keypress.enabled").props
        .disabled
    ).toBe(true);
  });

  it("disables character-count exclude controls when the status-bar character count toggle is off, preserving their stored values (#259)", () => {
    const settings: ApplicationSettings = {
      ...defaultApplicationSettings,
      workbench: {
        ...defaultApplicationSettings.workbench,
        statusBar: {
          ...defaultApplicationSettings.workbench.statusBar,
          characterCount: { visible: false }
        }
      },
      editor: {
        ...defaultApplicationSettings.editor,
        characterCount: {
          exclude: {
            ...defaultApplicationSettings.editor.characterCount.exclude,
            whitespace: false,
            markdownSyntax: true
          }
        }
      }
    };
    const element = settingsPanelViewElement("en", {
      settings,
      selectedCategoryId: "editor"
    });

    expect(
      controlElement(element, "editor.characterCount.exclude.whitespace").props
        .disabled
    ).toBe(true);
    expect(
      controlElement(element, "editor.characterCount.exclude.whitespace").props
        .checked
    ).toBe(false);
    expect(
      controlElement(element, "editor.characterCount.exclude.markdownSyntax")
        .props.disabled
    ).toBe(true);
  });

  it("enables character-count exclude controls when the status-bar character count toggle is on (#259)", () => {
    const element = settingsPanelViewElement("en", {
      selectedCategoryId: "editor"
    });

    expect(
      controlElement(element, "editor.characterCount.exclude.whitespace").props
        .disabled
    ).toBe(false);
    expect(
      controlElement(element, "editor.characterCount.exclude.markdownComments")
        .props.disabled
    ).toBe(false);
  });

  it("renders the four #256 whitespace checkboxes independently in Settings > Editor", () => {
    const settings: ApplicationSettings = {
      ...defaultApplicationSettings,
      editor: {
        ...defaultApplicationSettings.editor,
        whitespace: {
          renderIdeographicSpace: true,
          renderAsciiSpace: false,
          renderTab: false,
          renderOtherUnicodeSpace: true
        }
      }
    };
    const element = settingsPanelViewElement("en", {
      settings,
      selectedCategoryId: "editor"
    });

    expect(
      controlElement(element, "editor.whitespace.renderIdeographicSpace").props
        .checked
    ).toBe(true);
    expect(
      controlElement(element, "editor.whitespace.renderAsciiSpace").props
        .checked
    ).toBe(false);
    expect(
      controlElement(element, "editor.whitespace.renderTab").props.checked
    ).toBe(false);
    expect(
      controlElement(element, "editor.whitespace.renderOtherUnicodeSpace").props
        .checked
    ).toBe(true);
    expect(
      controlElement(element, "editor.whitespace.renderAsciiSpace").props
        .disabled
    ).toBe(false);
  });

  it("does not render workbench.advancedSettings.enabled as a setting item anywhere in the catalog-driven view", () => {
    const markup = renderSettingsPanelView("en", { searchQuery: "advanced" });

    expect(markup).not.toContain("workbench.advancedSettings.enabled");
    expect(markup).not.toContain("Advanced settings");
    expect(markup).not.toContain("達人向け設定");
  });

  it("does not show an Advanced settings confirmation dialog anywhere in the settings panel source", () => {
    const source = settingsPanelSource();

    expect(source).not.toContain("onConfirmEnableAdvancedSettings");
    expect(source).not.toContain("advancedSettings");
    expect(source).not.toContain("enableConfirm");
  });

  it("no longer accepts an onConfirmEnableAdvancedSettings prop on SettingsPanel", () => {
    const source = settingsPanelSource();

    expect(source).not.toContain("onConfirmEnableAdvancedSettings:");
  });
});

describe("SettingsPanelView preview.updateDelayMs (#250 follow-up)", () => {
  it("appears in the preview category, editable (unlike preview.renderer)", () => {
    const element = settingsPanelViewElement("en", {
      selectedCategoryId: "preview"
    });

    const control = controlElement(element, "preview.updateDelayMs");

    expect(control).toBeDefined();
    expect(control.props.disabled).toBe(false);
  });

  it("resolves a non-empty label and description in ja and en", () => {
    for (const language of ["en", "ja"] as const) {
      const markup = renderSettingsPanelView(language, {
        searchQuery: isolate("preview.updateDelayMs")
      });

      expect(markup).toContain(
        t(language, "settings.preview.updateDelayMs.label")
      );
      expect(markup).toContain(
        t(language, "settings.preview.updateDelayMs.description")
      );
    }
  });

  it("does not show the unwired-setting notice — it's a real, saveable user setting", () => {
    const markup = renderSettingsPanelView("en", {
      searchQuery: isolate("preview.updateDelayMs")
    });

    expect(markup).not.toContain(t("en", "settings.unwiredSettingNotice"));
  });

  it("shows the stored value and the ms unit, with min/max/step wired from the catalog", () => {
    const settings: ApplicationSettings = {
      ...defaultApplicationSettings,
      preview: { renderer: "markdown", updateDelayMs: 10000 }
    };
    const element = settingsPanelViewElement("en", {
      settings,
      selectedCategoryId: "preview"
    });

    const control = controlElement(element, "preview.updateDelayMs");

    expect(control.props.value).toBe(10000);
    expect(control.props.min).toBe(0);
    expect(control.props.max).toBe(600000);
    expect(control.props.step).toBe(1000);
  });

  it("saves immediately when changed, carrying the rest of preview settings through unchanged", () => {
    const settings: ApplicationSettings = defaultApplicationSettings;
    const onChangeSettings = vi.fn();
    const element = settingsPanelViewElement("en", {
      settings,
      searchQuery: isolate("preview.updateDelayMs"),
      onChangeSettings
    });
    const input = controlElement(element, "preview.updateDelayMs");
    const onChange = input.props.onChange as (event: {
      target: { valueAsNumber: number };
    }) => void;

    onChange({ target: { valueAsNumber: 10000 } });

    expect(onChangeSettings).toHaveBeenCalledWith({
      preview: { ...settings.preview, updateDelayMs: 10000 },
      workbench: settings.workbench,
      commandPalette: settings.commandPalette,
      editor: settings.editor,
      files: settings.files
    });
  });
});

describe("SettingsPanelView language options (#230: catalog-driven, not languageDefinitions.nativeName)", () => {
  it("renders workbench.language's options from the catalog's select control, resolved through i18n, in ja", () => {
    const markup = renderSettingsPanelView("ja", {
      searchQuery: isolate("workbench.language")
    });

    expect(markup).toContain("日本語");
    expect(markup).toContain("English");
  });

  it("renders the same native option labels regardless of the current UI language", () => {
    const markup = renderSettingsPanelView("en", {
      searchQuery: isolate("workbench.language")
    });

    expect(markup).toContain("日本語");
    expect(markup).toContain("English");
  });

  it("shows the restart-required notice under the language control", () => {
    const markupEn = renderSettingsPanelView("en", {
      searchQuery: isolate("workbench.language")
    });
    const markupJa = renderSettingsPanelView("ja", {
      searchQuery: isolate("workbench.language")
    });

    expect(markupEn).toContain(t("en", "settings.languageRestartRequired"));
    expect(markupJa).toContain(t("ja", "settings.languageRestartRequired"));
  });

  it("does not read language options from languageDefinitions.nativeName directly — that now lives in the catalog (#228)", () => {
    const source = settingsPanelSource();

    expect(source).not.toContain("languageDefinitions");
    expect(source).not.toContain("supportedLanguages");
  });
});

describe("SettingsPanelView unwired settings clarity (#236)", () => {
  it("keeps workbench.colorTheme and preview.renderer visible and rendered", () => {
    for (const key of ["workbench.colorTheme", "preview.renderer"] as const) {
      const element = settingsPanelViewElement("en", {
        searchQuery: isolate(key)
      });

      expect(controlElement(element, key)).toBeDefined();
    }
  });

  it("keeps workbench.colorTheme and preview.renderer controls disabled", () => {
    for (const key of ["workbench.colorTheme", "preview.renderer"] as const) {
      const element = settingsPanelViewElement("en", {
        searchQuery: isolate(key)
      });

      expect(controlElement(element, key).props.disabled).toBe(true);
    }
  });

  it("shows the localized planned-for-future-version notice for unwired items, in ja and en", () => {
    for (const key of ["workbench.colorTheme", "preview.renderer"] as const) {
      const markupEn = renderSettingsPanelView("en", {
        searchQuery: isolate(key)
      });
      const markupJa = renderSettingsPanelView("ja", {
        searchQuery: isolate(key)
      });

      expect(markupEn).toContain(t("en", "settings.unwiredSettingNotice"));
      expect(markupJa).toContain(t("ja", "settings.unwiredSettingNotice"));
    }
  });

  it("does not show the unwired notice for a normal wired item", () => {
    const markup = renderSettingsPanelView("en", {
      searchQuery: isolate("editor.fontFamily")
    });

    expect(markup).not.toContain(t("en", "settings.unwiredSettingNotice"));
  });

  it("search still finds workbench.colorTheme and preview.renderer by key, from any selected category", () => {
    const translate = translateFor("en");

    expect(
      getVisibleSettingCatalogItems(
        "workbench.colorTheme",
        "commands",
        translate
      ).map((item) => item.key)
    ).toEqual(["workbench.colorTheme"]);
    expect(
      getVisibleSettingCatalogItems(
        "preview.renderer",
        "commands",
        translate
      ).map((item) => item.key)
    ).toEqual(["preview.renderer"]);
  });

  it("does not introduce save behavior for unwired settings even if a change handler were invoked", () => {
    for (const key of ["workbench.colorTheme", "preview.renderer"] as const) {
      const onChangeSettings = vi.fn();
      const element = settingsPanelViewElement("en", {
        searchQuery: isolate(key),
        onChangeSettings
      });
      const input = controlElement(element, key);
      const onChange = input.props.onChange as
        | ((event: { target: { value: string; checked: boolean } }) => void)
        | undefined;

      onChange?.({ target: { value: "something-else", checked: true } });

      expect(onChangeSettings).not.toHaveBeenCalled();
    }
  });
});

describe("SettingsPanelView non-goals guard (#230)", () => {
  it("does not implement an advanced-settings display filter — advanced items remain listed regardless of the advanced toggle", () => {
    const element = settingsPanelViewElement("en", {
      selectedCategoryId: "files"
    });
    const keyElements = collectElements(
      element,
      (child) =>
        child.type === "code" &&
        typeof child.props.className === "string" &&
        child.props.className.includes("settingsItemKey")
    );

    expect(keyElements.map((el) => el.props.children)).toContain(
      "files.newFile.lineEnding"
    );
    expect(keyElements.map((el) => el.props.children)).toContain(
      "files.newFile.encoding"
    );
  });

  it("does not implement reset-to-default", () => {
    const source = settingsPanelSource();

    expect(source).not.toMatch(/reset.?to.?default/i);
  });

  it("does not render valueWarning UI", () => {
    const source = settingsPanelSource();

    expect(source).not.toContain("valueWarning");
    expect(source).not.toContain("SettingValueWarning");
  });

  it("does not reference project settings expansion", () => {
    const source = settingsPanelSource();

    expect(source).not.toContain("ProjectSettings");
    expect(source).not.toContain("pergamum.json");
  });
});

describe("line-ending marker glyph select renders in the editor font (#252 follow-up)", () => {
  it("applies the editor-font class to editor.lineEnding.markerGlyph's select, so the glyph previews in the same font as the editor", () => {
    const element = settingsPanelViewElement("en", {
      searchQuery: isolate("editor.lineEnding.markerGlyph")
    });
    const select = controlElement(element, "editor.lineEnding.markerGlyph");

    expect(select.props.className).toContain("settingsSelect-editorFont");
  });

  it("does not apply the editor-font class to an unrelated select control", () => {
    const element = settingsPanelViewElement("en", {
      searchQuery: isolate("files.newFile.lineEnding")
    });
    const select = controlElement(element, "files.newFile.lineEnding");

    expect(select.props.className).not.toContain("settingsSelect-editorFont");
  });
});

describe("Settings number control right-alignment (common style)", () => {
  const numberKeys = settingCatalogItems
    .filter((item) => item.control.kind === "number")
    .map((item) => item.key);
  const nonNumberKeys = settingCatalogItems
    .filter((item) => item.control.kind !== "number")
    .map((item) => item.key);

  it("covers every number control that must be right-aligned (#266 + the pre-existing ones)", () => {
    // Guards against a catalog change silently dropping one of these from
    // the number-control set the common style targets.
    expect([...numberKeys].sort()).toEqual(
      [
        "commandPalette.footerDetail.marquee.delay",
        "commandPalette.footerDetail.marquee.speed",
        "preview.updateDelayMs",
        "workbench.notification.durationMs"
      ].sort()
    );
  });

  it("renders every number control with the shared settingsNumberInput class (no per-key styling)", () => {
    for (const key of numberKeys) {
      const control = controlElement(
        settingsPanelViewElement("en", { searchQuery: isolate(key) }),
        key
      );

      expect(control.props.type).toBe("number");
      expect(String(control.props.className).split(/\s+/)).toContain(
        "settingsNumberInput"
      );
    }
  });

  it("never puts the settingsNumberInput class on a text / select / switch control", () => {
    for (const key of nonNumberKeys) {
      const control = controlElement(
        settingsPanelViewElement("en", { searchQuery: isolate(key) }),
        key
      );

      expect(String(control.props.className)).not.toContain(
        "settingsNumberInput"
      );
    }
  });

  it("right-aligns via the dedicated .settingsNumberInput rule in styles.css, not via a shared or per-key rule", () => {
    const css = stylesSource();

    // The number-only rule block — the one that also narrows its width —
    // carries the alignment. Anchored on that width so it can't be confused
    // with the shared `.settingsSelect, .settingsTextInput, .settingsNumberInput`
    // box rule or the responsive override.
    const anchor = ".settingsNumberInput {\n  width: min(100%, 160px);";
    const start = css.indexOf(anchor);
    expect(start).toBeGreaterThan(-1);
    const numberRule = css.slice(start, css.indexOf("}", start));

    expect(numberRule).toMatch(/text-align:\s*(end|right)\b/);

    // The shared box rule for select/text/number must NOT itself set
    // text-align (that would drag select/text along).
    const sharedSelector =
      ".settingsSelect,\n.settingsTextInput,\n.settingsNumberInput {";
    const sharedStart = css.indexOf(sharedSelector);
    expect(sharedStart).toBeGreaterThan(-1);
    const sharedRule = css.slice(
      sharedStart,
      css.indexOf("}", sharedStart)
    );
    expect(sharedRule).not.toMatch(/text-align/);

    // No standalone .settingsTextInput / .settingsSelect rule sets text-align,
    // and there is no per-setting number-input alignment rule.
    expect(css).not.toMatch(/\.settingsTextInput\s*\{[^}]*text-align/);
    expect(css).not.toMatch(/\.settingsSelect\s*\{[^}]*text-align/);
    expect(css).not.toMatch(/settingControl-[\w.]+/);
  });
});
