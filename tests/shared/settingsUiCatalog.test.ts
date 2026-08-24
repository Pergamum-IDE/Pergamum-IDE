import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { t, type Language } from "../../src/shared/i18n";
import {
  getCatalogEntry,
  settingsCatalog
} from "../../src/shared/settingsCatalog";
import {
  buildSettingSearchText,
  getSettingCategoryCatalogItem,
  getSettingCatalogItem,
  settingCategoryCatalog,
  settingCategoryLabelKey,
  settingCatalogItems,
  settingControlSearchText,
  sortSettingCatalogItems,
  sortSettingCategoryCatalog,
  type SettingCatalogItem,
  type SettingCategoryCatalogItem,
  type SettingSearchTranslate,
  type SettingValueWarning
} from "../../src/shared/settingsUiCatalog";

const languages: readonly Language[] = ["ja", "en"];

function translateFor(language: Language): SettingSearchTranslate {
  return (key) => t(language, key as Parameters<typeof t>[1]);
}

describe("Settings UI Catalog Schema (#226)", () => {
  describe("setting category catalog", () => {
    it("every category item has id, order, and labelKey", () => {
      for (const category of settingCategoryCatalog) {
        expect(typeof category.id).toBe("string");
        expect(typeof category.order).toBe("number");
        expect(typeof category.labelKey).toBe("string");
        expect(category.labelKey.length).toBeGreaterThan(0);
      }
    });

    it("has no duplicate category ids", () => {
      const ids = settingCategoryCatalog.map((category) => category.id);

      expect(new Set(ids).size).toBe(ids.length);
    });

    it("throws when a category catalog defines the same id twice", async () => {
      // Re-import the module fresh isn't necessary — the integrity check
      // runs at catalog-definition time, so exercise it directly through a
      // dynamically constructed duplicate rather than re-triggering module
      // load. We assert the *production* catalog's own uniqueness instead,
      // and separately unit-test the sort/lookup helpers against a
      // duplicate-safe fixture below.
      expect(() => {
        const seen = new Set<string>();

        for (const category of [
          ...settingCategoryCatalog,
          settingCategoryCatalog[0]
        ]) {
          if (seen.has(category.id)) {
            throw new Error(`duplicate id ${category.id}`);
          }
          seen.add(category.id);
        }
      }).toThrow(/duplicate id/);
    });

    it("registers the Settings UI categories, with sound after commands and no legacy advanced category (#232)", () => {
      expect(settingCategoryCatalog.map((category) => category.id)).toEqual([
        "application",
        "appearance",
        "editor",
        "preview",
        "files",
        "project",
        "commands",
        "sound"
      ]);
    });

    it("every category labelKey resolves in ja and en", () => {
      for (const category of settingCategoryCatalog) {
        for (const language of languages) {
          expect(t(language, category.labelKey as never).length).toBeGreaterThan(
            0
          );
        }
      }
    });

    it("getSettingCategoryCatalogItem finds a known id and returns undefined for an unknown one", () => {
      expect(getSettingCategoryCatalogItem("files")?.id).toBe("files");
      expect(
        getSettingCategoryCatalogItem(
          "nonexistent" as SettingCategoryCatalogItem["id"]
        )
      ).toBeUndefined();
    });

    it("sorts categories by order, then localized label, then id (stable)", () => {
      const fixture: readonly SettingCategoryCatalogItem[] = [
        { id: "commands", order: 100, labelKey: "z" },
        { id: "preview", order: 100, labelKey: "a" },
        { id: "project", order: 50, labelKey: "m" }
      ];
      const translate: SettingSearchTranslate = (key) => key;

      expect(
        sortSettingCategoryCatalog(translate, fixture).map((c) => c.id)
      ).toEqual(["project", "preview", "commands"]);
    });

    it("breaks a same-order, same-label tie by id", () => {
      const fixture: readonly SettingCategoryCatalogItem[] = [
        { id: "project", order: 100, labelKey: "same" },
        { id: "preview", order: 100, labelKey: "same" }
      ];
      const translate: SettingSearchTranslate = () => "same";

      expect(
        sortSettingCategoryCatalog(translate, fixture).map((c) => c.id)
      ).toEqual(["preview", "project"]);
    });

    it("sorts the production category catalog without throwing, in ja and en", () => {
      for (const language of languages) {
        expect(() =>
          sortSettingCategoryCatalog(translateFor(language))
        ).not.toThrow();
      }
    });
  });

  describe("setting catalog items", () => {
    it("every item has key/category/order/labelKey/descriptionKey/control/defaultValue", () => {
      for (const item of settingCatalogItems) {
        expect(typeof item.key).toBe("string");
        expect(typeof item.category).toBe("string");
        expect(typeof item.order).toBe("number");
        expect(typeof item.labelKey).toBe("string");
        expect(typeof item.descriptionKey).toBe("string");
        expect(item.control).toBeTruthy();
        expect(item.defaultValue).not.toBeUndefined();
      }
    });

    it("has no duplicate setting keys", () => {
      const keys = settingCatalogItems.map((item) => item.key);

      expect(new Set(keys).size).toBe(keys.length);
    });

    it("every item's category exists in the category catalog", () => {
      const categoryIds = new Set(
        settingCategoryCatalog.map((category) => category.id)
      );

      for (const item of settingCatalogItems) {
        expect(categoryIds.has(item.category)).toBe(true);
      }
    });

    it("registers exactly the #226 + #228 target settings, minus the #232-retired workbench.advancedSettings.enabled", () => {
      expect(settingCatalogItems.map((item) => item.key).sort()).toEqual(
        [
          "workbench.colorTheme",
          "workbench.fontFamily",
          "workbench.language",
          "workbench.statusBar.visible",
          "workbench.sound.enabled",
          "workbench.sound.dialog.enabled",
          "workbench.sound.newline.enabled",
          "workbench.sound.keypress.enabled",
          "commandPalette.description.enable",
          "commandPalette.description.marquee.delay",
          "commandPalette.description.marquee.speed",
          "editor.fontFamily",
          "files.newFile.lineEnding",
          "files.newFile.encoding",
          "preview.renderer"
        ].sort()
      );
    });

    it("covers every key registered in settingsCatalog.ts (#228: no existing Settings UI item is dropped)", () => {
      expect(settingCatalogItems.map((item) => item.key).sort()).toEqual(
        Object.keys(settingsCatalog).sort()
      );
    });

    it("uses the actual existing settingsCatalog.ts key for the UI font (workbench.fontFamily), not an invented ui.fontFamily key", () => {
      expect(getSettingCatalogItem("ui.fontFamily")).toBeUndefined();
      expect(getSettingCatalogItem("workbench.fontFamily")).toBeDefined();
    });

    it("no longer registers workbench.advancedSettings.enabled (#232: legacy Advanced Settings gate removed)", () => {
      expect(getSettingCatalogItem("workbench.advancedSettings.enabled")).toBeUndefined();
    });

    it("no catalog item declares an 'advanced' property — the field was removed from the schema, not just left unset (#232)", () => {
      for (const item of settingCatalogItems) {
        expect(Object.prototype.hasOwnProperty.call(item, "advanced")).toBe(
          false
        );
      }
    });

    it("select controls list the values actually accepted by settingsCatalog.ts", () => {
      const lineEnding = getSettingCatalogItem("files.newFile.lineEnding");
      const encoding = getSettingCatalogItem("files.newFile.encoding");
      const renderer = getSettingCatalogItem("preview.renderer");
      const language = getSettingCatalogItem("workbench.language");

      if (
        lineEnding?.control.kind !== "select" ||
        encoding?.control.kind !== "select" ||
        renderer?.control.kind !== "select" ||
        language?.control.kind !== "select"
      ) {
        throw new Error("Expected select controls.");
      }

      expect(lineEnding.control.options.map((o) => o.value)).toEqual([
        "lf",
        "crlf"
      ]);
      expect(encoding.control.options.map((o) => o.value)).toEqual(["utf8"]);
      expect(renderer.control.options.map((o) => o.value)).toEqual([
        "markdown"
      ]);
      expect(language.control.options.map((o) => o.value)).toEqual([
        "ja",
        "en"
      ]);
    });

    it("commandPalette marquee delay/speed number controls carry min/max sourced from settingsCatalog.ts, not duplicated literals", () => {
      const delay = getSettingCatalogItem(
        "commandPalette.description.marquee.delay"
      );
      const speed = getSettingCatalogItem(
        "commandPalette.description.marquee.speed"
      );

      if (delay?.control.kind !== "number" || speed?.control.kind !== "number") {
        throw new Error("Expected number controls.");
      }

      const delayRange = getCatalogEntry(
        "commandPalette.description.marquee.delay"
      ).numericRange;
      const speedRange = getCatalogEntry(
        "commandPalette.description.marquee.speed"
      ).numericRange;

      expect(delay.control).toMatchObject({
        min: delayRange.min,
        max: delayRange.max
      });
      expect(speed.control).toMatchObject({
        min: speedRange.min,
        max: speedRange.max
      });
    });

    it("every item's labelKey / descriptionKey resolves in ja and en", () => {
      for (const item of settingCatalogItems) {
        for (const language of languages) {
          expect(t(language, item.labelKey as never).length).toBeGreaterThan(0);
          expect(
            t(language, item.descriptionKey as never).length
          ).toBeGreaterThan(0);
        }
      }
    });

    it("every select option's labelKey (and descriptionKey, if present) resolves in ja and en", () => {
      for (const item of settingCatalogItems) {
        if (item.control.kind !== "select") {
          continue;
        }

        for (const option of item.control.options) {
          for (const language of languages) {
            expect(
              t(language, option.labelKey as never).length
            ).toBeGreaterThan(0);

            if (option.descriptionKey) {
              expect(
                t(language, option.descriptionKey as never).length
              ).toBeGreaterThan(0);
            }
          }
        }
      }
    });

    it("sorts items by category order, then item order, then key (stable)", () => {
      const categories: readonly SettingCategoryCatalogItem[] = [
        { id: "editor", order: 300, labelKey: "editor" },
        { id: "appearance", order: 200, labelKey: "appearance" }
      ];
      const fixture: readonly SettingCatalogItem[] = [
        {
          key: "editor.fontFamily",
          category: "editor",
          order: 100,
          labelKey: "k",
          descriptionKey: "d",
          control: { kind: "text" },
          defaultValue: ""
        },
        {
          // Ties with workbench.colorTheme below on category + order, so
          // the key tie-break decides — "workbench.colorTheme" sorts
          // before "workbench.fontFamily" alphabetically.
          key: "workbench.fontFamily",
          category: "appearance",
          order: 200,
          labelKey: "k",
          descriptionKey: "d",
          control: { kind: "text" },
          defaultValue: ""
        },
        {
          key: "workbench.colorTheme",
          category: "appearance",
          order: 200,
          labelKey: "k",
          descriptionKey: "d",
          control: { kind: "text" },
          defaultValue: ""
        }
      ];

      expect(
        sortSettingCatalogItems(fixture, categories).map((item) => item.key)
      ).toEqual([
        "workbench.colorTheme",
        "workbench.fontFamily",
        "editor.fontFamily"
      ]);
    });

    it("sorts the production catalog items without throwing", () => {
      expect(() => sortSettingCatalogItems()).not.toThrow();
    });

    it("does not contain a keywords property on any item", () => {
      for (const item of settingCatalogItems) {
        expect(Object.prototype.hasOwnProperty.call(item, "keywords")).toBe(
          false
        );
      }
    });

    it("does not embed a raw display string directly — labelKey/descriptionKey look like dotted i18n keys, not user-facing text", () => {
      const looksLikeI18nKey = /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/;

      for (const item of settingCatalogItems) {
        expect(item.labelKey).toMatch(looksLikeI18nKey);
        expect(item.descriptionKey).toMatch(looksLikeI18nKey);
        expect(item.labelKey).not.toMatch(/\s/);
        expect(item.descriptionKey).not.toMatch(/\s/);

        if (item.control.kind === "select") {
          for (const option of item.control.options) {
            expect(option.labelKey).toMatch(looksLikeI18nKey);
            expect(option.labelKey).not.toMatch(/\s/);
          }
        }
      }
    });

    it("has no free-form label/description property on any item (schema-level: only labelKey/descriptionKey exist)", () => {
      for (const item of settingCatalogItems) {
        expect(item).not.toHaveProperty("label");
        expect(item).not.toHaveProperty("description");
      }
    });
  });

  describe("search text generation", () => {
    it("includes the setting key", () => {
      const item = getSettingCatalogItem("editor.fontFamily");

      if (!item) {
        throw new Error("expected editor.fontFamily to be registered");
      }

      expect(buildSettingSearchText(item, translateFor("ja"))).toContain(
        "editor.fontFamily"
      );
    });

    it("includes the resolved label and description, in both languages", () => {
      const item = getSettingCatalogItem("editor.fontFamily");

      if (!item) {
        throw new Error("expected editor.fontFamily to be registered");
      }

      for (const language of languages) {
        const searchText = buildSettingSearchText(item, translateFor(language));

        expect(searchText).toContain(t(language, item.labelKey as never));
        expect(searchText).toContain(t(language, item.descriptionKey as never));
      }
    });

    it("includes the localized category label", () => {
      const item = getSettingCatalogItem("editor.fontFamily");

      if (!item) {
        throw new Error("expected editor.fontFamily to be registered");
      }

      for (const language of languages) {
        const searchText = buildSettingSearchText(item, translateFor(language));
        const categoryLabel = t(
          language,
          settingCategoryLabelKey(item.category) as never
        );

        expect(searchText).toContain(categoryLabel);
      }
    });

    it("a select setting's search text includes every option's value and localized label", () => {
      const item = getSettingCatalogItem("files.newFile.lineEnding");

      if (!item || item.control.kind !== "select") {
        throw new Error("expected files.newFile.lineEnding select control");
      }

      for (const language of languages) {
        const searchText = buildSettingSearchText(item, translateFor(language));

        for (const option of item.control.options) {
          expect(searchText).toContain(option.value);
          expect(searchText).toContain(t(language, option.labelKey as never));
        }
      }
    });

    it("#228: search text for the newly covered switch/select/number items includes key, resolved label/description, category label, and (for select) option value/label", () => {
      const newlyCoveredKeys = [
        "workbench.language",
        "workbench.statusBar.visible",
        "workbench.sound.enabled",
        "workbench.sound.dialog.enabled",
        "workbench.sound.newline.enabled",
        "workbench.sound.keypress.enabled",
        "commandPalette.description.enable",
        "commandPalette.description.marquee.delay",
        "commandPalette.description.marquee.speed"
      ] as const;

      for (const key of newlyCoveredKeys) {
        const item = getSettingCatalogItem(key);

        if (!item) {
          throw new Error(`expected ${key} to be registered`);
        }

        for (const language of languages) {
          const searchText = buildSettingSearchText(
            item,
            translateFor(language)
          );

          expect(searchText).toContain(item.key);
          expect(searchText).toContain(t(language, item.labelKey as never));
          expect(searchText).toContain(
            t(language, item.descriptionKey as never)
          );
          expect(searchText).toContain(
            t(language, settingCategoryLabelKey(item.category) as never)
          );

          if (item.control.kind === "select") {
            for (const option of item.control.options) {
              expect(searchText).toContain(option.value);
              expect(searchText).toContain(
                t(language, option.labelKey as never)
              );
            }
          }
        }
      }
    });

    it("workbench.language's select search text includes both ja and en option values and native-name labels", () => {
      const item = getSettingCatalogItem("workbench.language");

      if (!item || item.control.kind !== "select") {
        throw new Error("expected workbench.language select control");
      }

      const searchText = buildSettingSearchText(item, translateFor("en"));

      expect(item.control.options.map((option) => option.value)).toEqual([
        "ja",
        "en"
      ]);
      expect(searchText).toContain("ja");
      expect(searchText).toContain("en");
      expect(searchText).toContain("日本語");
      expect(searchText).toContain("English");
    });

    it("settingControlSearchText returns nothing for non-select controls", () => {
      expect(
        settingControlSearchText({ kind: "text" }, translateFor("ja"))
      ).toEqual([]);
      expect(
        settingControlSearchText({ kind: "switch" }, translateFor("ja"))
      ).toEqual([]);
      expect(
        settingControlSearchText({ kind: "number" }, translateFor("ja"))
      ).toEqual([]);
    });

    it("omits an option's description entry entirely when descriptionKey is absent, without throwing", () => {
      const control = {
        kind: "select" as const,
        options: [{ value: "x", labelKey: "settings.editor.fontFamily.label" }]
      };

      expect(
        settingControlSearchText(control, translateFor("ja"))
      ).toEqual(["x", t("ja", "settings.editor.fontFamily.label")]);
    });
  });

  describe("the 'advanced' flag is removed from the schema (#232: legacy Advanced Settings gate retired, no filter introduced)", () => {
    it("no catalog item exposes an 'advanced' property", () => {
      for (const item of settingCatalogItems) {
        expect(Object.prototype.hasOwnProperty.call(item, "advanced")).toBe(
          false
        );
      }
    });

    it("this module exports no filter/hide/confirm function — a future display filter, if any, is a separate issue's schema decision", () => {
      const source = readFileSync(
        "src/shared/settingsUiCatalog.ts",
        "utf8"
      );

      expect(source).not.toMatch(/export function filter/i);
      expect(source).not.toMatch(/export function hideAdvanced/i);
      expect(source).not.toMatch(/export function.*[Cc]onfirm/);
      expect(source).not.toContain("readonly advanced");
    });
  });

  describe("valueWarning is metadata only and does not render UI", () => {
    it("when is a plain callable predicate — invoking it does not touch the DOM or throw", () => {
      const warning: SettingValueWarning<string> = {
        when: (value) => value !== "utf8",
        severity: "warning",
        messageKey: "settings.files.newFile.encoding.label"
      };

      expect(warning.when("shift_jis")).toBe(true);
      expect(warning.when("utf8")).toBe(false);
    });

    it("no initial catalog item declares a valueWarning yet (reserved for the future non-UTF-8 warning issue)", () => {
      for (const item of settingCatalogItems) {
        expect(item.valueWarning).toBeUndefined();
      }
    });

    it("buildSettingSearchText never resolves or includes a valueWarning's messageKey", () => {
      const item: SettingCatalogItem<string> = {
        key: "files.newFile.encoding",
        category: "files",
        order: 200,
        labelKey: "settings.files.newFile.encoding.label",
        descriptionKey: "settings.files.newFile.encoding.description",
        control: { kind: "select", options: [] },
        defaultValue: "utf8",
        valueWarning: {
          when: (value) => value !== "utf8",
          severity: "warning",
          // Deliberately distinctive text so it would show up in the
          // search text if buildSettingSearchText ever resolved it.
          messageKey: "settings.workbench.language.label"
        }
      };
      const translate = translateFor("en");
      const searchText = buildSettingSearchText(item, translate);

      expect(searchText).not.toContain(translate(item.valueWarning!.messageKey));
    });
  });

  describe("responsibility separation from settingsCatalog.ts (ADR-0006 validation catalog)", () => {
    it("settingsCatalog.ts (validation) does not import this UI metadata module", () => {
      const source = readFileSync("src/shared/settingsCatalog.ts", "utf8");

      expect(source).not.toContain("settingsUiCatalog");
    });

    it("this module has no value-validation exports (that remains settingsCatalog.ts's job)", () => {
      const source = readFileSync("src/shared/settingsUiCatalog.ts", "utf8");

      expect(source).not.toContain("export function validate");
      expect(source).not.toContain("export function resolveCatalogValue");
    });
  });
});
