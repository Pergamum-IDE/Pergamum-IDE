import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import { supportedLanguages } from "../../src/shared/i18n";
import {
  defineBooleanSetting,
  defineEnumSetting,
  defineNumberSetting,
  defineSettingsCatalog,
  defineStringSetting,
  getCatalogDefaultValue,
  getCatalogEntries,
  getCatalogEntriesByArea,
  getCatalogEntry,
  getSettingArea,
  resolveCatalogValue,
  resolvePrimarySettingKey,
  settingAreas,
  settingScopes,
  settingsCatalog,
  validateCatalogValue,
  type SettingKey
} from "../../src/shared/settingsCatalog";

describe("Settings Catalog Foundation (#150)", () => {
  describe("catalog integrity", () => {
    it("has no duplicate catalog keys (object keys are inherently unique)", () => {
      const keys = Object.keys(settingsCatalog);

      expect(new Set(keys).size).toBe(keys.length);
    });

    it("has no deprecated alias colliding with a primary key", () => {
      const primaryKeys = new Set(Object.keys(settingsCatalog));

      for (const entry of getCatalogEntries()) {
        for (const alias of entry.deprecatedAliases) {
          expect(primaryKeys.has(alias)).toBe(false);
        }
      }
    });

    it("has no deprecated alias claimed by two different primary keys", () => {
      const aliasOwners = new Map<string, string>();

      for (const entry of getCatalogEntries()) {
        for (const alias of entry.deprecatedAliases) {
          const existingOwner = aliasOwners.get(alias);

          expect(existingOwner === undefined || existingOwner === entry.key).toBe(
            true
          );
          aliasOwners.set(alias, entry.key);
        }
      }
    });

    it("every catalog key matches the dotted key pattern and starts with an allowed area", () => {
      const dottedPattern = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/;

      for (const entry of getCatalogEntries()) {
        expect(entry.key).toMatch(dottedPattern);

        const area = entry.key.slice(0, entry.key.indexOf("."));

        expect(settingAreas as readonly string[]).toContain(area);
      }
    });

    it("has no primary key using the app. prefix", () => {
      const keys = Object.keys(settingsCatalog);

      expect(keys.some((key) => key.startsWith("app."))).toBe(false);
    });

    it("has no primary key using the appearance. prefix", () => {
      const keys = Object.keys(settingsCatalog);

      expect(keys.some((key) => key.startsWith("appearance."))).toBe(false);
    });

    it("every catalog entry's defaultValue passes its own validation", () => {
      for (const entry of getCatalogEntries()) {
        const result = validateCatalogValue(
          entry.key as SettingKey,
          entry.defaultValue
        );

        expect(result).toEqual({ ok: true });
      }
    });

    it("throws when defineSettingsCatalog's object key does not match entry.key", () => {
      expect(() =>
        defineSettingsCatalog({
          "workbench.fontFamily": defineStringSetting({
            key: "workbench.mismatchedKey",
            scope: "applicationOnly",
            defaultValue: "system-ui",
            labelKey: "settings.x.label",
            descriptionKey: "settings.x.description",
            maxLength: 128,
            allowedCharacters: "fontFamilyName",
            deprecatedAliases: [],
            migrationNotes: []
          })
        })
      ).toThrow(/does not match its entry\.key/);
    });

    it("throws when a deprecated alias collides with an existing primary key", () => {
      expect(() =>
        defineSettingsCatalog({
          "workbench.fontFamily": defineStringSetting({
            key: "workbench.fontFamily",
            scope: "applicationOnly",
            defaultValue: "system-ui",
            labelKey: "settings.a.label",
            descriptionKey: "settings.a.description",
            maxLength: 128,
            allowedCharacters: "fontFamilyName",
            deprecatedAliases: [],
            migrationNotes: []
          }),
          "workbench.colorTheme": defineStringSetting({
            key: "workbench.colorTheme",
            scope: "applicationOnly",
            defaultValue: "Pergamum Light",
            labelKey: "settings.b.label",
            descriptionKey: "settings.b.description",
            maxLength: 80,
            allowedCharacters: "themeName",
            // Collides with the sibling primary key above.
            deprecatedAliases: ["workbench.fontFamily"],
            migrationNotes: []
          })
        })
      ).toThrow(/collides with an existing primary key/);
    });

    it("throws when two entries claim the same deprecated alias", () => {
      expect(() =>
        defineSettingsCatalog({
          "workbench.fontFamily": defineStringSetting({
            key: "workbench.fontFamily",
            scope: "applicationOnly",
            defaultValue: "system-ui",
            labelKey: "settings.a.label",
            descriptionKey: "settings.a.description",
            maxLength: 128,
            allowedCharacters: "fontFamilyName",
            deprecatedAliases: ["legacy.fontFamily"],
            migrationNotes: []
          }),
          "workbench.colorTheme": defineStringSetting({
            key: "workbench.colorTheme",
            scope: "applicationOnly",
            defaultValue: "Pergamum Light",
            labelKey: "settings.b.label",
            descriptionKey: "settings.b.description",
            maxLength: 80,
            allowedCharacters: "themeName",
            deprecatedAliases: ["legacy.fontFamily"],
            migrationNotes: []
          })
        })
      ).toThrow(/is claimed by both/);
    });

    it("throws when a key doesn't match the dotted pattern", () => {
      expect(() =>
        defineStringSetting({
          key: "workbenchFontFamily",
          scope: "applicationOnly",
          defaultValue: "system-ui",
          labelKey: "settings.x.label",
          descriptionKey: "settings.x.description",
          maxLength: 128,
          allowedCharacters: "fontFamilyName",
          deprecatedAliases: [],
          migrationNotes: []
        })
      ).toThrow(/does not match the dotted key pattern/);
    });

    it("throws when a key's area is outside the allowed area set", () => {
      expect(() =>
        defineStringSetting({
          key: "appearance.uiTheme",
          scope: "applicationOnly",
          defaultValue: "Pergamum Light",
          labelKey: "settings.x.label",
          descriptionKey: "settings.x.description",
          maxLength: 80,
          allowedCharacters: "themeName",
          deprecatedAliases: [],
          migrationNotes: []
        })
      ).toThrow(/outside the allowed area set/);
    });

    it("throws when app. is used as a key prefix", () => {
      expect(() =>
        defineStringSetting({
          key: "app.name",
          scope: "applicationOnly",
          defaultValue: "Pergamum",
          labelKey: "settings.x.label",
          descriptionKey: "settings.x.description",
          maxLength: 80,
          allowedCharacters: "none",
          deprecatedAliases: [],
          migrationNotes: []
        })
      ).toThrow(/outside the allowed area set/);
    });

    it("throws when an enum entry's defaultValue is not a member of enumValues (bypassing the type system, since the type-level test above already covers the compile-time case)", () => {
      expect(() =>
        defineEnumSetting({
          key: "preview.renderer",
          scope: "applicationWithProjectOverride",
          enumValues: ["markdown"],
          // Unsafe cast: TS would normally reject this at the call site
          // (defaultValue must be a member of enumValues) — this simulates
          // an external/unsafe-cast violation to exercise the runtime guard.
          defaultValue: "html" as unknown as "markdown",
          labelKey: "settings.preview.renderer.label",
          descriptionKey: "settings.preview.renderer.description",
          deprecatedAliases: [],
          migrationNotes: []
        })
      ).toThrow(/defaultValue that fails its own validation \(enumValue\)/);
    });

    it("throws when a string entry's defaultValue fails its own validation", () => {
      expect(() =>
        defineStringSetting({
          key: "editor.fontFamily",
          scope: "applicationWithProjectOverride",
          defaultValue: "",
          labelKey: "settings.editor.fontFamily.label",
          descriptionKey: "settings.editor.fontFamily.description",
          maxLength: 128,
          allowedCharacters: "fontFamilyName",
          deprecatedAliases: [],
          migrationNotes: []
        })
      ).toThrow(/defaultValue that fails its own validation \(emptyString\)/);
    });
  });

  describe("type safety", () => {
    it("infers literal/primitive value types from getCatalogDefaultValue", () => {
      expectTypeOf(getCatalogDefaultValue("preview.renderer")).toEqualTypeOf<
        "markdown"
      >();
      expectTypeOf(
        getCatalogDefaultValue("files.newFile.lineEnding")
      ).toEqualTypeOf<"lf" | "crlf">();
      expectTypeOf(
        getCatalogDefaultValue("files.newFile.encoding")
      ).toEqualTypeOf<"utf8">();
      expectTypeOf(getCatalogDefaultValue("editor.fontFamily")).toEqualTypeOf<
        string
      >();
      expectTypeOf(
        getCatalogDefaultValue("workbench.colorTheme")
      ).toEqualTypeOf<string>();
      expectTypeOf(
        getCatalogDefaultValue("workbench.sound.enabled")
      ).toEqualTypeOf<boolean>();
      expectTypeOf(
        getCatalogDefaultValue("commandPalette.description.marquee.delay")
      ).toEqualTypeOf<number>();
    });

    it("rejects an invalid/unknown key at the type level", () => {
      // Type-check only — deliberately never invoked, since the key is
      // invalid and calling it at runtime would throw.
      function typeCheckOnly() {
        // @ts-expect-error unknown key is not a SettingKey
        return getCatalogDefaultValue("not.a.real.key");
      }
      void typeCheckOnly;
    });

    it("does not include deprecated aliases in SettingKey", () => {
      // Type-check only — see typeCheckOnly note above.
      function typeCheckOnly() {
        // @ts-expect-error appearance.uiTheme is a deprecated alias, not a SettingKey
        return getCatalogDefaultValue("appearance.uiTheme");
      }
      void typeCheckOnly;
    });

    it("resolveCatalogValue's value type matches SettingValueOf, not unknown", () => {
      const result = resolveCatalogValue("preview.renderer", "markdown");

      expectTypeOf(result.value).toEqualTypeOf<"markdown">();
    });
  });

  describe("string validation (allowed character policies)", () => {
    const entry = getCatalogEntry("editor.fontFamily");

    it("accepts a plain font family", () => {
      expect(validateCatalogValue("editor.fontFamily", "monospace")).toEqual({
        ok: true
      });
    });

    it("accepts a comma-separated font family list", () => {
      expect(
        validateCatalogValue(
          "editor.fontFamily",
          "Cascadia Code, SFMono-Regular, Consolas, monospace"
        )
      ).toEqual({ ok: true });
    });

    it("rejects a non-string value", () => {
      expect(validateCatalogValue("editor.fontFamily", 42)).toEqual({
        ok: false,
        failure: "typeMismatch"
      });
    });

    it("rejects an empty string and a whitespace-only string", () => {
      expect(validateCatalogValue("editor.fontFamily", "")).toEqual({
        ok: false,
        failure: "emptyString"
      });
      expect(validateCatalogValue("editor.fontFamily", "   ")).toEqual({
        ok: false,
        failure: "emptyString"
      });
    });

    it("rejects a string longer than maxLength", () => {
      const tooLong = "a".repeat(entry.maxLength + 1);

      expect(validateCatalogValue("editor.fontFamily", tooLong)).toEqual({
        ok: false,
        failure: "maxLength"
      });
    });

    it("rejects control characters and newlines in a font family", () => {
      expect(
        validateCatalogValue("editor.fontFamily", "mono\u0000space")
      ).toEqual({ ok: false, failure: "disallowedCharacters" });
      expect(
        validateCatalogValue("editor.fontFamily", "mono\nspace")
      ).toEqual({ ok: false, failure: "disallowedCharacters" });
    });

    it("rejects quotes in a font family", () => {
      expect(validateCatalogValue("editor.fontFamily", '"mono"')).toEqual({
        ok: false,
        failure: "disallowedCharacters"
      });
      expect(validateCatalogValue("editor.fontFamily", "'mono'")).toEqual({
        ok: false,
        failure: "disallowedCharacters"
      });
    });

    it("rejects / and * in a font family", () => {
      expect(validateCatalogValue("editor.fontFamily", "mono/space")).toEqual({
        ok: false,
        failure: "disallowedCharacters"
      });
      expect(validateCatalogValue("editor.fontFamily", "mono*space")).toEqual({
        ok: false,
        failure: "disallowedCharacters"
      });
    });

    it("rejects backslash in a font family", () => {
      expect(
        validateCatalogValue("editor.fontFamily", "mono\\space")
      ).toEqual({ ok: false, failure: "disallowedCharacters" });
    });

    it("rejects braces, semicolon, and angle brackets in a font family", () => {
      for (const disallowed of ["{mono}", "mono;", "<mono>"]) {
        expect(validateCatalogValue("editor.fontFamily", disallowed)).toEqual({
          ok: false,
          failure: "disallowedCharacters"
        });
      }
    });

    it("rejects bidi control characters in a font family", () => {
      expect(
        validateCatalogValue("editor.fontFamily", "mono\u202Espace")
      ).toEqual({ ok: false, failure: "disallowedCharacters" });
    });

    it("rejects zero-width characters in a font family", () => {
      expect(
        validateCatalogValue("editor.fontFamily", "mono\u200Bspace")
      ).toEqual({ ok: false, failure: "disallowedCharacters" });
    });

    it("accepts a theme name containing spaces", () => {
      expect(
        validateCatalogValue("workbench.colorTheme", "Pergamum Light")
      ).toEqual({ ok: true });
    });

    it("rejects a comma in a theme name (unlike fontFamilyName)", () => {
      expect(
        validateCatalogValue("workbench.colorTheme", "Pergamum, Light")
      ).toEqual({ ok: false, failure: "disallowedCharacters" });
    });

    it("rejects a path separator in a theme name", () => {
      expect(
        validateCatalogValue("workbench.colorTheme", "themes/dark")
      ).toEqual({ ok: false, failure: "disallowedCharacters" });
    });

    it("rejects a path traversal sequence in a theme name", () => {
      expect(
        validateCatalogValue("workbench.colorTheme", "../../etc/passwd")
      ).toEqual({ ok: false, failure: "disallowedCharacters" });
    });

    it("rejects control characters in a theme name", () => {
      expect(
        validateCatalogValue("workbench.colorTheme", "Pergamum\u0007Light")
      ).toEqual({ ok: false, failure: "disallowedCharacters" });
    });
  });

  describe("enum validation", () => {
    it("accepts the only allowed preview.renderer value", () => {
      expect(validateCatalogValue("preview.renderer", "markdown")).toEqual({
        ok: true
      });
    });

    it("rejects a value outside the enum", () => {
      expect(validateCatalogValue("preview.renderer", "html")).toEqual({
        ok: false,
        failure: "enumValue"
      });
    });

    it("rejects a non-string value for an enum setting", () => {
      expect(validateCatalogValue("preview.renderer", 1)).toEqual({
        ok: false,
        failure: "typeMismatch"
      });
    });

    it("accepts both files.newFile.lineEnding values and rejects a third", () => {
      expect(
        validateCatalogValue("files.newFile.lineEnding", "lf")
      ).toEqual({ ok: true });
      expect(
        validateCatalogValue("files.newFile.lineEnding", "crlf")
      ).toEqual({ ok: true });
      expect(
        validateCatalogValue("files.newFile.lineEnding", "cr")
      ).toEqual({ ok: false, failure: "enumValue" });
    });

    it("rejects an encoding other than utf8", () => {
      expect(
        validateCatalogValue("files.newFile.encoding", "shift_jis")
      ).toEqual({ ok: false, failure: "enumValue" });
    });
  });

  describe("invalid value result shape", () => {
    it("returns a failure-carrying result, not a boolean", () => {
      const result = validateCatalogValue("preview.renderer", "html");

      expect(typeof result).toBe("object");
      expect(result).toHaveProperty("ok", false);
    });

    it("never includes the invalid value itself in the result", () => {
      const result = validateCatalogValue(
        "editor.fontFamily",
        "some\u0000invalid\u0000value"
      );

      expect(JSON.stringify(result)).not.toContain("invalid");
    });
  });

  describe("fixture catalog validation (types not used in the production catalog)", () => {
    const fixtureCatalog = defineSettingsCatalog({
      "debug.fixtureBoolean": defineBooleanSetting({
        key: "debug.fixtureBoolean",
        scope: "applicationOnly",
        defaultValue: true,
        labelKey: "settings.debug.fixtureBoolean.label",
        descriptionKey: "settings.debug.fixtureBoolean.description",
        deprecatedAliases: [],
        migrationNotes: []
      }),
      "debug.fixtureNumber": defineNumberSetting({
        key: "debug.fixtureNumber",
        scope: "applicationOnly",
        defaultValue: 10,
        numericRange: { min: 0, max: 100 },
        labelKey: "settings.debug.fixtureNumber.label",
        descriptionKey: "settings.debug.fixtureNumber.description",
        deprecatedAliases: [],
        migrationNotes: []
      }),
      "debug.fixtureInteger": defineNumberSetting({
        key: "debug.fixtureInteger",
        scope: "applicationOnly",
        defaultValue: 5,
        numericRange: { min: 0, max: 20, integer: true },
        labelKey: "settings.debug.fixtureInteger.label",
        descriptionKey: "settings.debug.fixtureInteger.description",
        deprecatedAliases: [],
        migrationNotes: []
      }),
      "debug.fixtureNoPolicy": defineStringSetting({
        key: "debug.fixtureNoPolicy",
        scope: "applicationOnly",
        defaultValue: "anything",
        labelKey: "settings.debug.fixtureNoPolicy.label",
        descriptionKey: "settings.debug.fixtureNoPolicy.description",
        maxLength: 32,
        allowedCharacters: "none",
        deprecatedAliases: [],
        migrationNotes: []
      })
    });

    function fixtureValidate(key: keyof typeof fixtureCatalog, value: unknown) {
      // Mirrors validateCatalogValue's dispatch, against the fixture catalog
      // rather than the production settingsCatalog.
      const entry = fixtureCatalog[key];

      switch (entry.type) {
        case "boolean":
          return typeof value === "boolean"
            ? { ok: true as const }
            : { ok: false as const, failure: "typeMismatch" as const };
        case "number": {
          if (typeof value !== "number" || !Number.isFinite(value)) {
            return { ok: false as const, failure: "typeMismatch" as const };
          }
          if (entry.numericRange.integer && !Number.isInteger(value)) {
            return { ok: false as const, failure: "integer" as const };
          }
          if (value < entry.numericRange.min || value > entry.numericRange.max) {
            return { ok: false as const, failure: "numericRange" as const };
          }
          return { ok: true as const };
        }
        case "string": {
          if (typeof value !== "string") {
            return { ok: false as const, failure: "typeMismatch" as const };
          }
          if (value.trim().length === 0) {
            return { ok: false as const, failure: "emptyString" as const };
          }
          if (value.length > entry.maxLength) {
            return { ok: false as const, failure: "maxLength" as const };
          }
          return { ok: true as const };
        }
        default:
          throw new Error("unexpected fixture entry type");
      }
    }

    it("validates boolean settings", () => {
      expect(fixtureValidate("debug.fixtureBoolean", true)).toEqual({
        ok: true
      });
      expect(fixtureValidate("debug.fixtureBoolean", "true")).toEqual({
        ok: false,
        failure: "typeMismatch"
      });
    });

    it("validates number range settings", () => {
      expect(fixtureValidate("debug.fixtureNumber", 50)).toEqual({ ok: true });
      expect(fixtureValidate("debug.fixtureNumber", 200)).toEqual({
        ok: false,
        failure: "numericRange"
      });
      expect(fixtureValidate("debug.fixtureNumber", -1)).toEqual({
        ok: false,
        failure: "numericRange"
      });
    });

    it("validates integer:true settings", () => {
      expect(fixtureValidate("debug.fixtureInteger", 10)).toEqual({
        ok: true
      });
      expect(fixtureValidate("debug.fixtureInteger", 10.5)).toEqual({
        ok: false,
        failure: "integer"
      });
    });

    it("validates allowedCharacters: none (no character policy, but still rejects empty/oversized/non-string)", () => {
      expect(fixtureValidate("debug.fixtureNoPolicy", "<<<anything>>>")).toEqual(
        { ok: true }
      );
      expect(fixtureValidate("debug.fixtureNoPolicy", "")).toEqual({
        ok: false,
        failure: "emptyString"
      });
      expect(fixtureValidate("debug.fixtureNoPolicy", "a".repeat(33))).toEqual({
        ok: false,
        failure: "maxLength"
      });
      expect(fixtureValidate("debug.fixtureNoPolicy", 1)).toEqual({
        ok: false,
        failure: "typeMismatch"
      });
    });

    it("uses number settings in production for Command Palette description marquee controls and the Preview update delay", () => {
      const productionTypes = new Set(
        getCatalogEntries().map((entry) => entry.type)
      );

      expect(productionTypes.has("number")).toBe(true);
      expect(
        getCatalogEntries()
          .filter((entry) => entry.type === "number")
          .map((entry) => entry.key)
      ).toEqual([
        "commandPalette.description.marquee.delay",
        "commandPalette.description.marquee.speed",
        "preview.updateDelayMs"
      ]);
      expect(
        getCatalogEntries().some((entry) => entry.key === "workbench.fontSize")
      ).toBe(false);
    });

    it("validates Command Palette description marquee delay as a finite integer from 0 to 10000", () => {
      const entry = getCatalogEntry("commandPalette.description.marquee.delay");

      expect(entry.type).toBe("number");
      if (entry.type !== "number") {
        throw new Error("Expected number setting.");
      }

      expect(entry.numericRange).toEqual({
        min: 0,
        max: 10000,
        integer: true
      });
      expect(
        validateCatalogValue("commandPalette.description.marquee.delay", 0)
      ).toEqual({ ok: true });
      expect(
        validateCatalogValue("commandPalette.description.marquee.delay", 10000)
      ).toEqual({ ok: true });
      expect(
        validateCatalogValue("commandPalette.description.marquee.delay", -1)
      ).toEqual({ ok: false, failure: "numericRange" });
      expect(
        validateCatalogValue("commandPalette.description.marquee.delay", 10001)
      ).toEqual({ ok: false, failure: "numericRange" });
      expect(
        validateCatalogValue("commandPalette.description.marquee.delay", 1.5)
      ).toEqual({ ok: false, failure: "integer" });
      expect(
        validateCatalogValue(
          "commandPalette.description.marquee.delay",
          Number.POSITIVE_INFINITY
        )
      ).toEqual({ ok: false, failure: "typeMismatch" });
    });

    it("validates Command Palette description marquee speed as a finite number from 1 to 1000", () => {
      const entry = getCatalogEntry("commandPalette.description.marquee.speed");

      expect(entry.type).toBe("number");
      if (entry.type !== "number") {
        throw new Error("Expected number setting.");
      }

      expect(entry.numericRange).toEqual({ min: 1, max: 1000 });
      expect(
        validateCatalogValue("commandPalette.description.marquee.speed", 1)
      ).toEqual({ ok: true });
      expect(
        validateCatalogValue("commandPalette.description.marquee.speed", 40.5)
      ).toEqual({ ok: true });
      expect(
        validateCatalogValue("commandPalette.description.marquee.speed", 1000)
      ).toEqual({ ok: true });
      expect(
        validateCatalogValue("commandPalette.description.marquee.speed", 0)
      ).toEqual({ ok: false, failure: "numericRange" });
      expect(
        validateCatalogValue("commandPalette.description.marquee.speed", 1000.1)
      ).toEqual({ ok: false, failure: "numericRange" });
      expect(
        validateCatalogValue(
          "commandPalette.description.marquee.speed",
          Number.NaN
        )
      ).toEqual({ ok: false, failure: "typeMismatch" });
    });

    it("validates preview.updateDelayMs as a finite integer from 0 to 600000, defaulting to 10000 (#250 follow-up)", () => {
      const entry = getCatalogEntry("preview.updateDelayMs");

      expect(entry.type).toBe("number");
      if (entry.type !== "number") {
        throw new Error("Expected number setting.");
      }

      expect(entry.defaultValue).toBe(10000);
      expect(entry.scope).toBe("applicationOnly");
      expect(entry.numericRange).toEqual({
        min: 0,
        max: 600000,
        integer: true
      });

      // 0 is a valid, explicit "don't intentionally wait" choice.
      expect(validateCatalogValue("preview.updateDelayMs", 0)).toEqual({
        ok: true
      });
      expect(validateCatalogValue("preview.updateDelayMs", 600000)).toEqual({
        ok: true
      });
      expect(validateCatalogValue("preview.updateDelayMs", 10000)).toEqual({
        ok: true
      });
      // The UI step (1000ms) is presentation-only metadata, not a
      // validation constraint — values that aren't a multiple of it are
      // still valid integers within range.
      expect(validateCatalogValue("preview.updateDelayMs", 333)).toEqual({
        ok: true
      });
      expect(validateCatalogValue("preview.updateDelayMs", 2500)).toEqual({
        ok: true
      });
      expect(validateCatalogValue("preview.updateDelayMs", -1)).toEqual({
        ok: false,
        failure: "numericRange"
      });
      expect(validateCatalogValue("preview.updateDelayMs", 600001)).toEqual({
        ok: false,
        failure: "numericRange"
      });
      // Not just the boundary — a value far past the max is rejected too.
      expect(validateCatalogValue("preview.updateDelayMs", 999999)).toEqual({
        ok: false,
        failure: "numericRange"
      });
      expect(validateCatalogValue("preview.updateDelayMs", 1.5)).toEqual({
        ok: false,
        failure: "integer"
      });
      expect(
        validateCatalogValue("preview.updateDelayMs", Number.POSITIVE_INFINITY)
      ).toEqual({ ok: false, failure: "typeMismatch" });
      expect(validateCatalogValue("preview.updateDelayMs", "10000")).toEqual({
        ok: false,
        failure: "typeMismatch"
      });
    });

    it("workbench.statusBar.visible (#174), sound feedback (#200), and command descriptions (#215) are the production boolean entries (#232: workbench.advancedSettings.enabled removed)", () => {
      const booleanEntries = getCatalogEntries().filter(
        (entry) => entry.type === "boolean"
      );

      expect(booleanEntries.map((entry) => entry.key)).toEqual([
        "workbench.statusBar.visible",
        "workbench.sound.enabled",
        "workbench.sound.dialog.enabled",
        "workbench.sound.newline.enabled",
        "workbench.sound.keypress.enabled",
        "commandPalette.description.enable"
      ]);
    });
  });

  describe("resolvePrimarySettingKey", () => {
    it("returns the same key when given a primary key", () => {
      expect(resolvePrimarySettingKey("workbench.colorTheme")).toBe(
        "workbench.colorTheme"
      );
    });

    it("resolves the deprecated alias appearance.uiTheme to workbench.colorTheme", () => {
      expect(resolvePrimarySettingKey("appearance.uiTheme")).toBe(
        "workbench.colorTheme"
      );
    });

    it("returns undefined for an unknown key rather than throwing", () => {
      expect(resolvePrimarySettingKey("nonexistent.key")).toBeUndefined();
    });

    it("does not resolve an unknown key to a catalog default", () => {
      const resolved = resolvePrimarySettingKey("totally.unknown.key");

      expect(resolved).toBeUndefined();
    });
  });

  describe("validateCatalogValue", () => {
    it("returns { ok: true } for a valid defined value", () => {
      expect(validateCatalogValue("preview.renderer", "markdown")).toEqual({
        ok: true
      });
    });

    it("returns { ok: false, failure } for an invalid defined value", () => {
      expect(validateCatalogValue("preview.renderer", "html")).toEqual({
        ok: false,
        failure: "enumValue"
      });
    });
  });

  describe("resolveCatalogValue", () => {
    it("returns the catalog default with source 'default' and ok:true when rawValue is undefined", () => {
      expect(resolveCatalogValue("preview.renderer", undefined)).toEqual({
        ok: true,
        value: "markdown",
        source: "default"
      });
    });

    it("returns the raw value with source 'raw' and ok:true when it validates", () => {
      expect(
        resolveCatalogValue("files.newFile.lineEnding", "crlf")
      ).toEqual({ ok: true, value: "crlf", source: "raw" });
    });

    it("returns the catalog default with source 'default', ok:false, and a failure when rawValue is invalid", () => {
      expect(resolveCatalogValue("preview.renderer", "html")).toEqual({
        ok: false,
        value: "markdown",
        source: "default",
        failure: "enumValue"
      });
    });

    it("does not call validateCatalogValue when rawValue is undefined (undefined short-circuits first)", () => {
      // Indirect proof: an intentionally-invalid catalog key access would
      // throw from validateCatalogValue's settingsCatalog[key] lookup if it
      // were reached; undefined must resolve without going through
      // validation at all, so this must not throw for any known key.
      expect(() =>
        resolveCatalogValue("workbench.colorTheme", undefined)
      ).not.toThrow();
    });
  });

  describe("scope", () => {
    it("assigns the documented scope to each initial catalog entry", () => {
      expect(getCatalogEntry("workbench.fontFamily").scope).toBe(
        "applicationOnly"
      );
      expect(getCatalogEntry("workbench.colorTheme").scope).toBe(
        "applicationOnly"
      );
      expect(getCatalogEntry("editor.fontFamily").scope).toBe(
        "applicationWithProjectOverride"
      );
      expect(getCatalogEntry("files.newFile.lineEnding").scope).toBe(
        "applicationOnly"
      );
      expect(getCatalogEntry("files.newFile.encoding").scope).toBe(
        "applicationOnly"
      );
      expect(getCatalogEntry("preview.renderer").scope).toBe(
        "applicationWithProjectOverride"
      );
      expect(getCatalogEntry("workbench.language").scope).toBe(
        "applicationOnly"
      );
      expect(getCatalogEntry("workbench.statusBar.visible").scope).toBe(
        "applicationOnly"
      );
      expect(getCatalogEntry("workbench.sound.enabled").scope).toBe(
        "applicationOnly"
      );
      expect(getCatalogEntry("commandPalette.description.enable").scope).toBe(
        "applicationOnly"
      );
      expect(
        getCatalogEntry("commandPalette.description.marquee.delay").scope
      ).toBe("applicationOnly");
      expect(
        getCatalogEntry("commandPalette.description.marquee.speed").scope
      ).toBe("applicationOnly");
      expect(getCatalogEntry("preview.updateDelayMs").scope).toBe(
        "applicationOnly"
      );
    });

    it("represents all three ADR-0006 S-11 scope values", () => {
      expect([...settingScopes]).toEqual([
        "applicationOnly",
        "projectOnly",
        "applicationWithProjectOverride"
      ]);
    });

    it("gets scope from catalog metadata, not from a key-prefix heuristic (two applicationOnly keys under different areas)", () => {
      expect(getCatalogEntry("workbench.fontFamily").scope).toBe(
        getCatalogEntry("files.newFile.lineEnding").scope
      );
    });
  });

  describe("area", () => {
    it("derives area from the key's first segment", () => {
      expect(getSettingArea("workbench.fontFamily")).toBe("workbench");
      expect(getSettingArea("editor.fontFamily")).toBe("editor");
      expect(getSettingArea("preview.renderer")).toBe("preview");
      expect(getSettingArea("commandPalette.description.enable")).toBe(
        "commandPalette"
      );
      expect(getSettingArea("files.newFile.lineEnding")).toBe("files");
    });

    it("getCatalogEntriesByArea returns only that area's entries", () => {
      const editorEntries = getCatalogEntriesByArea("editor");

      expect(editorEntries).toHaveLength(1);
      expect(editorEntries[0]?.key).toBe("editor.fontFamily");
    });

    it("has no free-form category field on catalog entries", () => {
      for (const entry of getCatalogEntries()) {
        expect(entry).not.toHaveProperty("category");
      }
    });
  });

  describe("deprecated alias", () => {
    it("workbench.colorTheme declares appearance.uiTheme as its only deprecated alias", () => {
      expect(getCatalogEntry("workbench.colorTheme").deprecatedAliases).toEqual([
        "appearance.uiTheme"
      ]);
    });

    it("appearance.uiTheme is not enumerated as a primary key", () => {
      expect(Object.keys(settingsCatalog)).not.toContain("appearance.uiTheme");
    });

    it("alias resolution does not add a new write key — resolvePrimarySettingKey only maps back to the primary key", () => {
      expect(resolvePrimarySettingKey("appearance.uiTheme")).toBe(
        "workbench.colorTheme"
      );
      expect(resolvePrimarySettingKey("appearance.uiTheme")).not.toBe(
        "appearance.uiTheme"
      );
    });
  });

  describe("initial catalog entries", () => {
    it("registers exactly the #150 entries, #174 entries, #200 sound feedback entries, #215 command description settings, and #250 preview.updateDelayMs (#232: workbench.advancedSettings.enabled removed)", () => {
      expect(Object.keys(settingsCatalog).sort()).toEqual(
        [
          "commandPalette.description.enable",
          "commandPalette.description.marquee.delay",
          "commandPalette.description.marquee.speed",
          "editor.fontFamily",
          "files.newFile.encoding",
          "files.newFile.lineEnding",
          "preview.renderer",
          "preview.updateDelayMs",
          "workbench.colorTheme",
          "workbench.fontFamily",
          "workbench.sound.enabled",
          "workbench.sound.dialog.enabled",
          "workbench.sound.newline.enabled",
          "workbench.sound.keypress.enabled",
          "workbench.language",
          "workbench.statusBar.visible"
        ].sort()
      );
    });

    it("no longer registers workbench.advancedSettings.enabled (#232)", () => {
      expect(Object.keys(settingsCatalog)).not.toContain(
        "workbench.advancedSettings.enabled"
      );
    });

    it("workbench.colorTheme's default value is 'Pergamum Light'", () => {
      expect(getCatalogDefaultValue("workbench.colorTheme")).toBe(
        "Pergamum Light"
      );
    });

    it("files.newFile.lineEnding's enum values are exactly ['lf', 'crlf']", () => {
      expect(getCatalogEntry("files.newFile.lineEnding").enumValues).toEqual([
        "lf",
        "crlf"
      ]);
    });

    it("files.newFile.encoding's enum values are exactly ['utf8']", () => {
      expect(getCatalogEntry("files.newFile.encoding").enumValues).toEqual([
        "utf8"
      ]);
    });

    it("preview.renderer's enum values are exactly ['markdown']", () => {
      expect(getCatalogEntry("preview.renderer").enumValues).toEqual([
        "markdown"
      ]);
    });

    it("does not include editor.fontSize, editor.lineHeight, editor.wordWrap, or workbench.fontSize", () => {
      const keys = Object.keys(settingsCatalog);

      expect(keys).not.toContain("editor.fontSize");
      expect(keys).not.toContain("editor.lineHeight");
      expect(keys).not.toContain("editor.wordWrap");
      expect(keys).not.toContain("workbench.fontSize");
    });
  });

  describe("workbench.sound.* (#200)", () => {
    it("registers applicationOnly boolean settings with the required defaults", () => {
      const expectedDefaults = {
        "workbench.sound.enabled": true,
        "workbench.sound.dialog.enabled": true,
        "workbench.sound.newline.enabled": false,
        "workbench.sound.keypress.enabled": false
      } as const;

      for (const [key, defaultValue] of Object.entries(expectedDefaults)) {
        const settingKey = key as keyof typeof expectedDefaults;
        const entry = getCatalogEntry(settingKey);

        expect(entry.scope).toBe("applicationOnly");
        expect(entry.type).toBe("boolean");
        expect(getCatalogDefaultValue(settingKey)).toBe(defaultValue);
      }
    });

    it("validates only boolean values for every sound feedback setting", () => {
      for (const key of [
        "workbench.sound.enabled",
        "workbench.sound.dialog.enabled",
        "workbench.sound.newline.enabled",
        "workbench.sound.keypress.enabled"
      ] as const) {
        expect(validateCatalogValue(key, true)).toEqual({ ok: true });
        expect(validateCatalogValue(key, false)).toEqual({ ok: true });
        expect(validateCatalogValue(key, "true")).toEqual({
          ok: false,
          failure: "typeMismatch"
        });
      }
    });
  });

  describe("workbench.language / workbench.statusBar.visible (#174)", () => {
    it("contains workbench.language", () => {
      expect(Object.keys(settingsCatalog)).toContain("workbench.language");
    });

    it("contains workbench.statusBar.visible", () => {
      expect(Object.keys(settingsCatalog)).toContain(
        "workbench.statusBar.visible"
      );
    });

    it("workbench.language is applicationOnly", () => {
      expect(getCatalogEntry("workbench.language").scope).toBe(
        "applicationOnly"
      );
    });

    it("workbench.statusBar.visible is applicationOnly", () => {
      expect(getCatalogEntry("workbench.statusBar.visible").scope).toBe(
        "applicationOnly"
      );
    });

    it("workbench.language's default matches the current built-in default language", () => {
      expect(getCatalogDefaultValue("workbench.language")).toBe("ja");
    });

    it("workbench.statusBar.visible's default matches the current built-in status bar visibility default (true)", () => {
      expect(getCatalogDefaultValue("workbench.statusBar.visible")).toBe(
        true
      );
    });

    it("workbench.language's enum values match the i18n-owned supported UI languages", () => {
      expect([...getCatalogEntry("workbench.language").enumValues]).toEqual([
        ...supportedLanguages
      ]);
    });

    it("workbench.language is an enum entry and workbench.statusBar.visible is a boolean entry", () => {
      expect(getCatalogEntry("workbench.language").type).toBe("enum");
      expect(getCatalogEntry("workbench.statusBar.visible").type).toBe(
        "boolean"
      );
    });

    it("validates workbench.language against ja/en and rejects anything else", () => {
      expect(validateCatalogValue("workbench.language", "ja")).toEqual({
        ok: true
      });
      expect(validateCatalogValue("workbench.language", "en")).toEqual({
        ok: true
      });
      expect(validateCatalogValue("workbench.language", "fr")).toEqual({
        ok: false,
        failure: "enumValue"
      });
      expect(validateCatalogValue("workbench.language", 1)).toEqual({
        ok: false,
        failure: "typeMismatch"
      });
    });

    it("validates workbench.statusBar.visible as a boolean", () => {
      expect(
        validateCatalogValue("workbench.statusBar.visible", true)
      ).toEqual({ ok: true });
      expect(
        validateCatalogValue("workbench.statusBar.visible", false)
      ).toEqual({ ok: true });
      expect(
        validateCatalogValue("workbench.statusBar.visible", "true")
      ).toEqual({ ok: false, failure: "typeMismatch" });
    });

    it("declares no deprecated aliases for either key — legacy top-level language/showStatusBar are not preserved as aliases", () => {
      expect(getCatalogEntry("workbench.language").deprecatedAliases).toEqual(
        []
      );
      expect(
        getCatalogEntry("workbench.statusBar.visible").deprecatedAliases
      ).toEqual([]);
    });
  });

  describe("existing implementation alignment: workbench.colorTheme (#150)", () => {
    // Investigation finding (see the #150 PR description): unlike
    // preview.renderer and editor.fontFamily, workbench.colorTheme /
    // appearance.uiTheme still has no runtime consumer in #195 — no
    // settings.json/pergamum.json read path, no CSS application, and no
    // theme-switching mechanism.
    it("workbench.colorTheme is registered in the catalog but no store file calls a catalog helper with it (no wired consumer)", () => {
      expect(Object.keys(settingsCatalog)).toContain("workbench.colorTheme");

      for (const path of [
        "src/main/settingsStore.ts",
        "src/main/projectConfigStore.ts",
        "src/shared/settings.ts"
      ]) {
        const source = readFileSync(path, "utf8");

        expect(source).not.toMatch(/CatalogValue\("workbench\.colorTheme"/);
        expect(source).not.toMatch(
          /CatalogDefaultValue\("workbench\.colorTheme"/
        );
      }
    });

    it("styles.css still has no workbench color theme CSS custom property application", () => {
      const stylesSource = readFileSync("src/renderer/styles.css", "utf8");

      expect(stylesSource).not.toContain("--workbench-color-theme");
    });
  });

  describe("existing implementation alignment: preview.renderer consumer replacement (#150)", () => {
    it("settingsStore.ts (application settings, unchanged by #170) still calls the catalog default/validate helper instead of a hand-rolled guard", () => {
      const settingsStoreSource = readFileSync(
        "src/main/settingsStore.ts",
        "utf8"
      );

      expect(settingsStoreSource).not.toContain("isPreviewRendererId");
      // Both the read path (readPreviewSettings) and the write path
      // (parsePreviewSettingsForWrite) resolve through resolveCatalogValue.
      expect(
        settingsStoreSource.match(/resolveCatalogValue\("preview\.renderer"/g)
      ).toHaveLength(3);
    });

    // #170 (ADR-0006 S-23 alignment) deliberately moves projectConfigStore.ts
    // off resolveCatalogValue for preview.renderer: resolveCatalogValue
    // substitutes the catalog default for an invalid/missing value, which is
    // exactly the reject-entry-to-default shortcut the project read path
    // must not take. projectConfigStore.ts now uses the catalog-backed
    // isPreviewRendererId guard (src/shared/settings.ts, itself delegating to
    // validateCatalogValue) purely to validate, and omits the entry entirely
    // on rejection so the existing Project > Application > Default
    // resolution chain (resolveEffectiveSettings) does the fallthrough.
    it("projectConfigStore.ts validates preview.renderer through the catalog-backed isPreviewRendererId guard and does not resolve a catalog default for a rejected/missing value", () => {
      const projectConfigStoreSource = readFileSync(
        "src/main/projectConfigStore.ts",
        "utf8"
      );

      expect(projectConfigStoreSource).toContain("isPreviewRendererId");
      expect(projectConfigStoreSource).not.toContain("resolveCatalogValue");
    });

    it("src/shared/settings.ts's isPreviewRendererId/defaultPreviewRenderer delegate to the catalog rather than duplicating validation/default logic", () => {
      const source = readFileSync("src/shared/settings.ts", "utf8");

      expect(source).toContain(
        'getCatalogDefaultValue("preview.renderer")'
      );
      expect(source).toContain(
        'validateCatalogValue("preview.renderer", value).ok'
      );
    });
  });

  describe("Application Settings core control wiring (#173, #195)", () => {
    it("settingsStore.ts and src/renderer/workbenchFontFamily.ts call catalog helpers with workbench.fontFamily (wired consumer)", () => {
      const settingsStoreSource = readFileSync(
        "src/main/settingsStore.ts",
        "utf8"
      );
      const rendererSource = readFileSync(
        "src/renderer/workbenchFontFamily.ts",
        "utf8"
      );

      expect(settingsStoreSource).toMatch(/CatalogValue\("workbench\.fontFamily"/);
      expect(rendererSource).toMatch(/CatalogValue\("workbench\.fontFamily"/);
      expect(rendererSource).toMatch(
        /CatalogDefaultValue\("workbench\.fontFamily"/
      );
    });

    it("styles.css consumes the workbench font custom property for UI chrome and the editor font custom property for editor body text", () => {
      const stylesSource = readFileSync("src/renderer/styles.css", "utf8");

      expect(stylesSource).toContain("--pergamum-workbench-font-family");
      expect(stylesSource).toContain("--pergamum-editor-font-family");
      // Regression guard for #173 D-1: the editor body does not consume the
      // workbench custom property, and preview code blocks keep their
      // hardcoded monospace stack.
      expect(stylesSource).not.toContain(
        ".editorHost .cm-scroller {\n  font-family: var(\n    --pergamum-workbench-font-family"
      );
      expect(stylesSource).toContain(
        ".editorHost .cm-scroller {\n  font-family: var(\n    --pergamum-editor-font-family"
      );
      expect(stylesSource).toContain(
        '.preview code {\n  border-radius: 4px;\n  background: #eef3f8;\n  font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace;'
      );
    });

    it("settingsStore.ts and shared settings now wire editor.fontFamily, files.newFile.*, and sound feedback for Application Settings (#232: workbench.advancedSettings.enabled removed)", () => {
      const settingsStoreSource = readFileSync(
        "src/main/settingsStore.ts",
        "utf8"
      );
      const settingsSource = readFileSync("src/shared/settings.ts", "utf8");
      const rendererSource = readFileSync(
        "src/renderer/workbenchFontFamily.ts",
        "utf8"
      );

      expect(settingsStoreSource).toMatch(/CatalogValue\("editor\.fontFamily"/);
      expect(settingsStoreSource).toContain("resolveCatalogValue");
      expect(settingsStoreSource).toContain('"files.newFile.lineEnding"');
      expect(settingsStoreSource).toContain('"files.newFile.encoding"');
      expect(settingsStoreSource).not.toContain(
        '"workbench.advancedSettings.enabled"'
      );
      expect(settingsStoreSource).toContain('"workbench.sound.enabled"');
      expect(settingsStoreSource).toContain('"workbench.sound.dialog.enabled"');
      expect(settingsStoreSource).toContain('"workbench.sound.newline.enabled"');
      expect(settingsStoreSource).toContain('"workbench.sound.keypress.enabled"');
      expect(settingsSource).toMatch(/CatalogDefaultValue\("editor\.fontFamily"/);
      expect(settingsSource).toContain(
        'getCatalogDefaultValue("files.newFile.lineEnding")'
      );
      expect(settingsSource).toContain(
        'getCatalogDefaultValue("files.newFile.encoding")'
      );
      expect(settingsSource).not.toContain(
        'getCatalogDefaultValue("workbench.advancedSettings.enabled")'
      );
      expect(settingsSource).toContain(
        'getCatalogDefaultValue("workbench.sound.enabled")'
      );
      expect(settingsSource).toContain(
        'getCatalogDefaultValue("workbench.sound.dialog.enabled")'
      );
      expect(settingsSource).toContain(
        'getCatalogDefaultValue("workbench.sound.newline.enabled")'
      );
      expect(settingsSource).toContain(
        'getCatalogDefaultValue("workbench.sound.keypress.enabled")'
      );
      expect(rendererSource).toMatch(/CatalogValue\("editor\.fontFamily"/);
      expect(rendererSource).toMatch(
        /CatalogDefaultValue\("editor\.fontFamily"/
      );
    });

    it("workbench.colorTheme remains unwired and #195 does not add Project Settings/pergamum.json consumers for Application Settings-only controls", () => {
      expect(Object.keys(settingsCatalog)).toEqual(
        expect.arrayContaining([
          "editor.fontFamily",
          "workbench.colorTheme",
          "files.newFile.lineEnding",
          "files.newFile.encoding",
          "workbench.sound.enabled",
          "workbench.sound.dialog.enabled",
          "workbench.sound.newline.enabled",
          "workbench.sound.keypress.enabled"
        ])
      );

      for (const path of [
        "src/main/projectConfigStore.ts",
        "src/shared/settings.ts"
      ]) {
        const source = readFileSync(path, "utf8");

        expect(source).not.toMatch(/CatalogValue\("workbench\.colorTheme"/);
        expect(source).not.toMatch(
          /CatalogDefaultValue\("workbench\.colorTheme"/
        );
      }

      const projectConfigStoreSource = readFileSync(
        "src/main/projectConfigStore.ts",
        "utf8"
      );

      for (const applicationSettingsOnlyKey of [
        "editor.fontFamily",
        "files.newFile.lineEnding",
        "files.newFile.encoding",
        "workbench.sound.enabled",
        "workbench.sound.dialog.enabled",
        "workbench.sound.newline.enabled",
        "workbench.sound.keypress.enabled"
      ]) {
        expect(projectConfigStoreSource).not.toContain(applicationSettingsOnlyKey);
      }
    });

    it("appearance.uiTheme alias runtime wiring is not added — resolvePrimarySettingKey is not called from settingsStore.ts/projectConfigStore.ts/settings.ts", () => {
      for (const path of [
        "src/main/settingsStore.ts",
        "src/main/projectConfigStore.ts",
        "src/shared/settings.ts"
      ]) {
        const source = readFileSync(path, "utf8");

        expect(source).not.toContain("resolvePrimarySettingKey");
      }
    });
  });
});
