import { describe, expect, it } from "vitest";
import { t } from "../../src/shared/i18n";
import {
  JapaneseLintSettingsError,
  areJapaneseLintSettingsEqual,
  defaultJapaneseLintSettings,
  enabledJapaneseLintRules,
  japaneseLintRuleCatalog,
  japaneseLintRuleCategories,
  japaneseLintRuleDisplayPath,
  japaneseLintRuleIds,
  parseJapaneseLintSettingsForWrite,
  resolveJapaneseLintSettings
} from "../../src/shared/japaneseLintRules";

describe("japanese lint rule catalog (#625)", () => {
  it("has the 12 textlint-rule-preset-japanese rules in a stable order", () => {
    expect(japaneseLintRuleCatalog.map((rule) => rule.id)).toEqual([
      "max-ten",
      "no-doubled-conjunctive-particle-ga",
      "no-doubled-conjunction",
      "no-double-negative-ja",
      "no-doubled-joshi",
      "sentence-length",
      "no-dropping-the-ra",
      "no-mix-dearu-desumasu",
      "no-nfd",
      "no-invalid-control-character",
      "no-zero-width-spaces",
      "no-kangxi-radicals"
    ]);
    expect(japaneseLintRuleCatalog.map((rule) => rule.id)).toEqual([
      ...japaneseLintRuleIds
    ]);
  });

  it("groups the first 8 as style and the last 4 as characters", () => {
    expect(japaneseLintRuleCatalog.map((rule) => rule.category).join(",")).toBe(
      "style,style,style,style,style,style,style,style,characters,characters,characters,characters"
    );
    expect(japaneseLintRuleCategories.map((category) => category.id)).toEqual([
      "style",
      "characters"
    ]);
  });

  it("is default ON for every rule except sentence-length", () => {
    for (const rule of japaneseLintRuleCatalog) {
      expect(rule.defaultEnabled, rule.id).toBe(rule.id !== "sentence-length");
    }
  });

  it("gives max-ten and sentence-length (only) a numeric threshold with the specified range", () => {
    const withOptions = japaneseLintRuleCatalog.filter((rule) => rule.options);

    expect(withOptions.map((rule) => rule.id)).toEqual([
      "max-ten",
      "sentence-length"
    ]);
    expect(
      japaneseLintRuleCatalog.find((rule) => rule.id === "max-ten")?.options
    ).toMatchObject([{ key: "max", defaultValue: 5, min: 1, max: 50 }]);
    expect(
      japaneseLintRuleCatalog.find((rule) => rule.id === "sentence-length")
        ?.options
    ).toMatchObject([{ key: "max", defaultValue: 100, min: 20, max: 1000 }]);
  });

  it("resolves every label, description and option label in both languages", () => {
    const keys = [
      ...japaneseLintRuleCategories.map((category) => category.labelKey),
      ...japaneseLintRuleCatalog.flatMap((rule) => [
        rule.labelKey,
        rule.descriptionKey,
        ...(rule.options ?? []).flatMap((option) => [
          option.labelKey,
          option.descriptionKey
        ])
      ])
    ];

    for (const language of ["ja", "en"] as const) {
      for (const key of keys) {
        const text = t(language, key as never);

        expect(text, `${language} ${key}`).not.toBe(key);
        expect(text.length, `${language} ${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("uses the specified Japanese names (and keeps the Kangxi term out of the label)", () => {
    const labels = japaneseLintRuleCatalog.map((rule) =>
      t("ja", rule.labelKey as never)
    );

    expect(labels).toEqual([
      "読点が多い文をチェック",
      "「が」の連続をチェック",
      "同じ接続詞の連続をチェック",
      "二重否定をチェック",
      "助詞の重なりをチェック",
      "長すぎる文をチェック",
      "ら抜き言葉をチェック",
      "文体の混在をチェック",
      "分離した濁点・半濁点をチェック",
      "制御文字をチェック",
      "ゼロ幅スペースをチェック",
      "紛らわしい部首文字をチェック"
    ]);
    expect(labels.join("")).not.toContain("康熙");
    expect(t("ja", "japaneseLint.rule.noKangxiRadicals.description")).toContain(
      "康熙部首"
    );
  });
});

describe("japaneseLintRuleDisplayPath (#625)", () => {
  it("prefixes JapaneseLinter. for display and leaves the rule id untouched", () => {
    for (const rule of japaneseLintRuleCatalog) {
      expect(japaneseLintRuleDisplayPath(rule.id)).toBe(
        "JapaneseLinter." + rule.id
      );
      expect(rule.id.startsWith("JapaneseLinter")).toBe(false);
    }
  });

  it("does not change the stored settings shape (keys stay the plain rule ids)", () => {
    expect(Object.keys(defaultJapaneseLintSettings().rules)).toEqual([
      ...japaneseLintRuleIds
    ]);
  });
});

describe("resolveJapaneseLintSettings (#625)", () => {
  it("returns the defaults when nothing is stored", () => {
    for (const raw of [undefined, null, {}, [], "x", 5, { rules: null }]) {
      const resolved = resolveJapaneseLintSettings(raw);

      expect(resolved).toEqual(defaultJapaneseLintSettings());
      expect(resolved.rules["max-ten"]).toEqual({
        enabled: true,
        options: { max: 5 }
      });
      expect(resolved.rules["sentence-length"]).toEqual({
        enabled: false,
        options: { max: 100 }
      });
      expect(resolved.rules["no-doubled-joshi"]).toEqual({ enabled: true });
    }
  });

  it("ignores unknown rule ids and fills missing rules with defaults", () => {
    const resolved = resolveJapaneseLintSettings({
      rules: {
        "no-such-rule": { enabled: false },
        "no-nfd": { enabled: false }
      }
    });

    expect(Object.keys(resolved.rules)).toEqual([...japaneseLintRuleIds]);
    expect(resolved.rules["no-nfd"].enabled).toBe(false);
    expect(resolved.rules["no-zero-width-spaces"].enabled).toBe(true);
  });

  it("falls back to the default for an invalid enabled", () => {
    const resolved = resolveJapaneseLintSettings({
      rules: {
        "sentence-length": { enabled: "yes" },
        "no-nfd": { enabled: 0 }
      }
    });

    expect(resolved.rules["sentence-length"].enabled).toBe(false);
    expect(resolved.rules["no-nfd"].enabled).toBe(true);
  });

  it("clamps numeric options into [min, max] and rounds them", () => {
    const at = (max: unknown) =>
      resolveJapaneseLintSettings({
        rules: {
          "max-ten": { options: { max } },
          "sentence-length": { options: { max } }
        }
      }).rules;

    expect(at(0)["max-ten"].options).toEqual({ max: 1 });
    expect(at(9999)["max-ten"].options).toEqual({ max: 50 });
    expect(at(0)["sentence-length"].options).toEqual({ max: 20 });
    expect(at(9999)["sentence-length"].options).toEqual({ max: 1000 });
    expect(at(7.6)["max-ten"].options).toEqual({ max: 8 });
    expect(at(-5)["max-ten"].options).toEqual({ max: 1 });
  });

  it("falls back to the default for a non-number option", () => {
    for (const bad of ["7", null, undefined, NaN, Infinity, {}, [3]]) {
      const rules = resolveJapaneseLintSettings({
        rules: { "max-ten": { options: { max: bad } } }
      }).rules;

      expect(rules["max-ten"].options, String(bad)).toEqual({ max: 5 });
    }
  });

  it("does not let a stray option key through", () => {
    const rules = resolveJapaneseLintSettings({
      rules: { "max-ten": { options: { max: 4, evil: 1 } } }
    }).rules;

    expect(rules["max-ten"].options).toEqual({ max: 4 });
  });
});

describe("parseJapaneseLintSettingsForWrite (#625)", () => {
  it("accepts a valid value and returns it fully resolved", () => {
    const parsed = parseJapaneseLintSettingsForWrite({
      rules: {
        "sentence-length": { enabled: true, options: { max: 60 } }
      }
    });

    expect(parsed.rules["sentence-length"]).toEqual({
      enabled: true,
      options: { max: 60 }
    });
    expect(parsed.rules["max-ten"].options).toEqual({ max: 5 });
  });

  it("accepts an empty section as the defaults", () => {
    expect(parseJapaneseLintSettingsForWrite({})).toEqual(
      defaultJapaneseLintSettings()
    );
    expect(parseJapaneseLintSettingsForWrite({ rules: {} })).toEqual(
      defaultJapaneseLintSettings()
    );
  });

  it("rejects unknown ids, keys and bad values instead of guessing", () => {
    for (const bad of [
      null,
      "x",
      [],
      { rules: [] },
      { extra: true },
      { rules: { "no-such-rule": { enabled: true } } },
      { rules: { "no-nfd": { enabled: "true" } } },
      { rules: { "no-nfd": { surprise: 1 } } },
      { rules: { "no-nfd": null } },
      { rules: { "max-ten": { options: { max: 0 } } } },
      { rules: { "max-ten": { options: { max: 51 } } } },
      { rules: { "max-ten": { options: { max: 2.5 } } } },
      { rules: { "max-ten": { options: { max: "3" } } } },
      { rules: { "max-ten": { options: { other: 3 } } } },
      { rules: { "no-nfd": { options: { max: 3 } } } }
    ]) {
      expect(
        () => parseJapaneseLintSettingsForWrite(bad),
        JSON.stringify(bad)
      ).toThrow(JapaneseLintSettingsError);
    }
  });
});

describe("enabledJapaneseLintRules (#625)", () => {
  it("lists the default-ON rules in catalog order, without sentence-length", () => {
    const ids = enabledJapaneseLintRules(undefined).map((rule) => rule.id);

    expect(ids).toHaveLength(11);
    expect(ids).not.toContain("sentence-length");
    expect(ids[0]).toBe("max-ten");
  });

  it("carries numeric options (and empty options for the rest)", () => {
    const rules = enabledJapaneseLintRules({
      rules: {
        "sentence-length": { enabled: true, options: { max: 40 } },
        "max-ten": { options: { max: 2 } }
      }
    });

    expect(rules.find((rule) => rule.id === "max-ten")?.options).toEqual({
      max: 2
    });
    expect(
      rules.find((rule) => rule.id === "sentence-length")?.options
    ).toEqual({ max: 40 });
    expect(rules.find((rule) => rule.id === "no-nfd")?.options).toEqual({});
  });

  it("is empty when every rule is off", () => {
    const allOff = {
      rules: Object.fromEntries(
        japaneseLintRuleIds.map((id) => [id, { enabled: false }])
      )
    };

    expect(enabledJapaneseLintRules(allOff)).toEqual([]);
  });

  it("compares settings structurally", () => {
    expect(
      areJapaneseLintSettingsEqual(
        defaultJapaneseLintSettings(),
        resolveJapaneseLintSettings({})
      )
    ).toBe(true);
    expect(
      areJapaneseLintSettingsEqual(
        defaultJapaneseLintSettings(),
        resolveJapaneseLintSettings({
          rules: { "no-nfd": { enabled: false } }
        })
      )
    ).toBe(false);
  });
});
