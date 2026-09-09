import { describe, expect, it } from "vitest";
import {
  createDefaultApplicationSettings,
  resolveEffectiveSettings
} from "../../src/shared/settings";
import {
  getCatalogDefaultValue,
  getCatalogEntry
} from "../../src/shared/settingsCatalog";
import {
  getSettingCatalogItem,
  getSettingCategoryCatalogItem
} from "../../src/shared/settingsUiCatalog";

describe("#424 Slice 7: Search & Replace settings category", () => {
  it("registers the searchReplace category between Editor and Image Attachment", () => {
    const category = getSettingCategoryCatalogItem("searchReplace");
    expect(category).toBeDefined();
    expect(category!.order).toBeGreaterThan(
      getSettingCategoryCatalogItem("editor")!.order
    );
    expect(category!.order).toBeLessThan(
      getSettingCategoryCatalogItem("imageAttachment")!.order
    );
    expect(category!.labelKey).toBe("settings.category.searchReplace.label");
  });

  it("puts all three nearby settings under the searchReplace category", () => {
    for (const key of [
      "search.nearby.unit",
      "search.nearby.characterDistance",
      "search.nearby.paragraphDistance"
    ] as const) {
      expect(getSettingCatalogItem(key)?.category).toBe("searchReplace");
    }
  });
});

describe("#424 Slice 7: search.nearby.* catalog entries", () => {
  it("unit is an enum of characters | paragraphs, default paragraphs", () => {
    const entry = getCatalogEntry("search.nearby.unit");
    expect(entry.type).toBe("enum");
    if (entry.type === "enum") {
      expect([...entry.enumValues]).toEqual(["characters", "paragraphs"]);
    }
    expect(getCatalogDefaultValue("search.nearby.unit")).toBe("paragraphs");
  });

  it("characterDistance is 50..10000, default 500", () => {
    const entry = getCatalogEntry("search.nearby.characterDistance");
    expect(entry.type).toBe("number");
    if (entry.type === "number") {
      expect(entry.numericRange.min).toBe(50);
      expect(entry.numericRange.max).toBe(10000);
      expect(entry.numericRange.integer).toBe(true);
    }
    expect(getCatalogDefaultValue("search.nearby.characterDistance")).toBe(500);
  });

  it("paragraphDistance is 0..20, default 2", () => {
    const entry = getCatalogEntry("search.nearby.paragraphDistance");
    expect(entry.type).toBe("number");
    if (entry.type === "number") {
      expect(entry.numericRange.min).toBe(0);
      expect(entry.numericRange.max).toBe(20);
    }
    expect(getCatalogDefaultValue("search.nearby.paragraphDistance")).toBe(2);
  });

  it("all three are applicationWithProjectOverride and NOT restart-required", () => {
    for (const key of [
      "search.nearby.unit",
      "search.nearby.characterDistance",
      "search.nearby.paragraphDistance"
    ] as const) {
      const entry = getCatalogEntry(key);
      expect(entry.scope).toBe("applicationWithProjectOverride");
      expect(entry.requiresRestart).not.toBe(true);
    }
  });
});

describe("#424 Slice 7: nearby settings project override behavior", () => {
  const application = createDefaultApplicationSettings();

  it("no project override → inherits the application (catalog default) values", () => {
    const effective = resolveEffectiveSettings(application, undefined);
    expect(effective.search.nearby).toEqual({
      unit: "paragraphs",
      characterDistance: 500,
      paragraphDistance: 2
    });
  });

  it("a sparse project override wins per key; unset keys still inherit", () => {
    const effective = resolveEffectiveSettings(application, {
      search: { nearby: { unit: "characters", characterDistance: 1200 } }
    });
    expect(effective.search.nearby).toEqual({
      unit: "characters",
      characterDistance: 1200,
      // not overridden → inherited from application
      paragraphDistance: 2
    });
  });

  it("an application-level change flows through when the project does not override", () => {
    const customApp = {
      ...application,
      search: {
        nearby: { unit: "characters" as const, characterDistance: 900, paragraphDistance: 5 }
      }
    };
    const effective = resolveEffectiveSettings(customApp, {
      search: { nearby: { paragraphDistance: 1 } }
    });
    expect(effective.search.nearby).toEqual({
      unit: "characters",
      characterDistance: 900,
      paragraphDistance: 1
    });
  });

  it("removing the project override (empty project settings) returns to the application value", () => {
    const effective = resolveEffectiveSettings(application, {});
    expect(effective.search.nearby).toEqual(application.search.nearby);
  });
});
