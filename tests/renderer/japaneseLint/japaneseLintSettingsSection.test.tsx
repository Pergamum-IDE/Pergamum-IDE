// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t, type Translate } from "../../../src/shared/i18n";
import {
  defaultApplicationSettings,
  type ApplicationSettings,
  type SaveApplicationSettingsRequest
} from "../../../src/shared/settings";
import {
  JapaneseLintSettingsSection,
  parseThresholdInput
} from "../../../src/renderer/JapaneseLintSettingsSection";
import { SettingsPanelView } from "../../../src/renderer/SettingsPanel";
import { resolveJapaneseLintSettings } from "../../../src/shared/japaneseLintRules";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const translateJa: Translate = (key, values) => t("ja", key, values);
const translateEn: Translate = (key, values) => t("en", key, values);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mountSection(
  onChangeSettings: (request: SaveApplicationSettingsRequest) => void,
  settings: ApplicationSettings = defaultApplicationSettings,
  translate: Translate = translateJa
): void {
  act(() => {
    root.render(
      <JapaneseLintSettingsSection
        settings={settings}
        isLoading={false}
        translate={translate}
        onChangeSettings={onChangeSettings}
      />
    );
  });
}

const ruleRows = (): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>("[data-japanese-lint-rule]")
];
const rowFor = (id: string): HTMLElement =>
  container.querySelector<HTMLElement>(`[data-japanese-lint-rule="${id}"]`)!;
const checkboxFor = (id: string): HTMLInputElement =>
  rowFor(id).querySelector<HTMLInputElement>('input[type="checkbox"]')!;
const numberFor = (id: string): HTMLInputElement =>
  rowFor(id).querySelector<HTMLInputElement>("input.settingsNumberInput")!;

function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )!.set!;

  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function blur(input: HTMLInputElement): void {
  act(() => {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    input.blur();
  });
}

describe("JapaneseLintSettingsSection (#625)", () => {
  it("shows the two groups and all 12 rules in catalog order", () => {
    mountSection(vi.fn());

    const headings = [
      ...container.querySelectorAll(".japaneseLintRuleGroupHeading")
    ].map((heading) => heading.textContent);

    expect(headings).toEqual([
      "文章表現",
      "見えない文字・紛らわしい文字",
      "動作設定"
    ]);
    expect(ruleRows().map((row) => row.dataset.japaneseLintRule)).toEqual([
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
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(12);
  });

  it("shows each rule's auxiliary path as JapaneseLinter.<ruleId>", () => {
    mountSection(vi.fn());

    const paths = [...container.querySelectorAll(".settingsItemKey")].map(
      (code) => code.textContent
    );

    expect(paths).toEqual([
      "JapaneseLinter.max-ten",
      "JapaneseLinter.no-doubled-conjunctive-particle-ga",
      "JapaneseLinter.no-doubled-conjunction",
      "JapaneseLinter.no-double-negative-ja",
      "JapaneseLinter.no-doubled-joshi",
      "JapaneseLinter.sentence-length",
      "JapaneseLinter.no-dropping-the-ra",
      "JapaneseLinter.no-mix-dearu-desumasu",
      "JapaneseLinter.no-nfd",
      "JapaneseLinter.no-invalid-control-character",
      "JapaneseLinter.no-zero-width-spaces",
      "JapaneseLinter.no-kangxi-radicals",
      // runtime options follow the 12 rules
      "JapaneseLinter.debounceMs",
      "JapaneseLinter.lineCacheLimit",
      "JapaneseLinter.workerRestartAttempts"
    ]);
    // The displayed path never leaks into the ids that are actually used.
    for (const row of ruleRows()) {
      expect(row.dataset.japaneseLintRule).not.toContain("JapaneseLinter");
    }
  });

  it("describes the section for the Japanese style check in general, not only the toolbar", () => {
    mountSection(vi.fn());

    expect(
      container.querySelector(".japaneseLintSettings > .settingsDescription")
        ?.textContent
    ).toBe(
      "日本語表現チェックで使用する項目を選びます。各項目は個別にオン・オフできます。"
    );
  });

  it("shows the specified Japanese label and description for each rule", () => {
    mountSection(vi.fn());

    expect(rowFor("max-ten").textContent).toContain("読点が多い文をチェック");
    expect(rowFor("max-ten").textContent).toContain(
      "一文の中で「、」が多すぎる文を検出します。"
    );
    expect(rowFor("no-kangxi-radicals").textContent).toContain(
      "紛らわしい部首文字をチェック"
    );
    expect(rowFor("no-kangxi-radicals").textContent).toContain("康熙部首");
  });

  it("has an English UI too", () => {
    mountSection(vi.fn(), defaultApplicationSettings, translateEn);

    const headings = [
      ...container.querySelectorAll(".japaneseLintRuleGroupHeading")
    ].map((heading) => heading.textContent);

    expect(headings).toEqual([
      "Style",
      "Invisible or Confusable Characters",
      "Behavior"
    ]);
    expect(rowFor("no-nfd").textContent).toContain(
      "Check separated dakuten/handakuten marks"
    );
  });

  it("starts with every rule ON except sentence-length", () => {
    mountSection(vi.fn());

    for (const row of ruleRows()) {
      const id = row.dataset.japaneseLintRule!;

      expect(checkboxFor(id).checked, id).toBe(id !== "sentence-length");
    }
  });

  it("shows the two thresholds with their defaults (5 commas, 100 characters)", () => {
    mountSection(vi.fn());

    // 2 rule thresholds + 3 runtime options.
    expect(container.querySelectorAll("input.settingsNumberInput")).toHaveLength(5);
    expect(numberFor("max-ten").value).toBe("5");
    expect(numberFor("sentence-length").value).toBe("100");
    expect(rowFor("max-ten").textContent).toContain("一文あたりの読点数");
    expect(rowFor("sentence-length").textContent).toContain("一文あたりの文字数");
    expect(rowFor("max-ten").textContent).toContain("1〜50");
    expect(rowFor("sentence-length").textContent).toContain("20〜1000");
    expect(rowFor("no-nfd").querySelector("input.settingsNumberInput")).toBeNull();
  });

  it("keeps the threshold editable while its rule is OFF", () => {
    mountSection(vi.fn());

    expect(checkboxFor("sentence-length").checked).toBe(false);
    expect(numberFor("sentence-length").disabled).toBe(false);
  });

  it("toggling a rule saves a full request with the whole resolved japaneseLint", () => {
    const onChange = vi.fn();

    mountSection(onChange);
    act(() => checkboxFor("sentence-length").click());

    expect(onChange).toHaveBeenCalledTimes(1);

    const request = onChange.mock.calls[0]?.[0] as SaveApplicationSettingsRequest;

    expect(request.japaneseLint?.rules["sentence-length"]).toEqual({
      enabled: true,
      options: { max: 100 }
    });
    expect(request.japaneseLint?.rules["no-doubled-joshi"]).toEqual({
      enabled: true
    });
    // The rest of the settings travel unchanged.
    expect(request.documentMap).toBe(defaultApplicationSettings.documentMap);
    expect(request.workbench).toBe(defaultApplicationSettings.workbench);
    expect("recentProjects" in request).toBe(false);
  });

  it("turning a rule OFF saves enabled:false and keeps the others", () => {
    const onChange = vi.fn();

    mountSection(onChange);
    act(() => checkboxFor("no-doubled-joshi").click());

    const request = onChange.mock.calls[0]?.[0] as SaveApplicationSettingsRequest;

    expect(request.japaneseLint?.rules["no-doubled-joshi"].enabled).toBe(false);
    expect(request.japaneseLint?.rules["max-ten"].enabled).toBe(true);
  });

  it("reflects stored settings", () => {
    mountSection(vi.fn(), {
      ...defaultApplicationSettings,
      japaneseLint: {
        ...resolveJapaneseLintSettings(undefined),
        rules: {
          ...resolveJapaneseLintSettings(undefined).rules,
          "sentence-length": { enabled: true, options: { max: 60 } },
          "no-nfd": { enabled: false }
        }
      }
    });

    expect(checkboxFor("sentence-length").checked).toBe(true);
    expect(numberFor("sentence-length").value).toBe("60");
    expect(checkboxFor("no-nfd").checked).toBe(false);
  });

  it("commits a threshold on blur, clamped into range", () => {
    const onChange = vi.fn();

    mountSection(onChange);
    typeInto(numberFor("max-ten"), "9999");
    blur(numberFor("max-ten"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(
      (onChange.mock.calls[0]?.[0] as SaveApplicationSettingsRequest).japaneseLint
        ?.rules["max-ten"].options
    ).toEqual({ max: 50 });
    expect(numberFor("max-ten").value).toBe("50");
  });

  it("does not clamp while typing (1 on the way to 100 stays 1 until commit)", () => {
    const onChange = vi.fn();

    mountSection(onChange);
    typeInto(numberFor("sentence-length"), "1");

    expect(numberFor("sentence-length").value).toBe("1");
    expect(onChange).not.toHaveBeenCalled();

    typeInto(numberFor("sentence-length"), "150");
    blur(numberFor("sentence-length"));

    expect(
      (onChange.mock.calls[0]?.[0] as SaveApplicationSettingsRequest).japaneseLint
        ?.rules["sentence-length"].options
    ).toEqual({ max: 150 });
  });

  it("saves a threshold change made while the rule is OFF (without turning it ON)", () => {
    const onChange = vi.fn();

    mountSection(onChange);
    typeInto(numberFor("sentence-length"), "80");
    blur(numberFor("sentence-length"));

    expect(
      (onChange.mock.calls[0]?.[0] as SaveApplicationSettingsRequest).japaneseLint
        ?.rules["sentence-length"]
    ).toEqual({ enabled: false, options: { max: 80 } });
  });

  it("reverts a non-numeric entry and does not save", () => {
    const onChange = vi.fn();

    mountSection(onChange);
    typeInto(numberFor("max-ten"), "abc");
    blur(numberFor("max-ten"));

    expect(onChange).not.toHaveBeenCalled();
    expect(numberFor("max-ten").value).toBe("5");
  });

  it("does not save when the committed value equals the current one", () => {
    const onChange = vi.fn();

    mountSection(onChange);
    typeInto(numberFor("max-ten"), "5");
    blur(numberFor("max-ten"));

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("JapaneseLintSettingsSection runtime options (#625 worker foundation)", () => {
  const runtimeInput = (key: string): HTMLInputElement =>
    container.querySelector<HTMLInputElement>(
      `[data-japanese-lint-runtime="${key}"] input.settingsNumberInput`
    )!;
  const runtimeText = (key: string): string =>
    container.querySelector(`[data-japanese-lint-runtime="${key}"]`)
      ?.textContent ?? "";

  it("shows the three runtime options with their labels, defaults, ranges and units", () => {
    mountSection(vi.fn());

    const rows = [
      ...container.querySelectorAll<HTMLElement>("[data-japanese-lint-runtime]")
    ];

    expect(rows.map((row) => row.dataset.japaneseLintRuntime)).toEqual([
      "debounceMs",
      "lineCacheLimit",
      "workerRestartAttempts"
    ]);
    expect(runtimeInput("debounceMs").value).toBe("800");
    expect(runtimeInput("lineCacheLimit").value).toBe("5000");
    expect(runtimeInput("workerRestartAttempts").value).toBe("3");

    expect(runtimeText("debounceMs")).toContain("デバウンス時間");
    expect(runtimeText("debounceMs")).toContain(
      "入力が止まってから日本語表現チェックを実行するまでの待ち時間です。"
    );
    expect(runtimeText("debounceMs")).toContain("300〜3000 ms");
    expect(runtimeText("lineCacheLimit")).toContain("行キャッシュ上限");
    expect(runtimeText("lineCacheLimit")).toContain("500〜50000 件");
    expect(runtimeText("workerRestartAttempts")).toContain(
      "Worker再起動試行回数"
    );
    expect(runtimeText("workerRestartAttempts")).toContain("2〜10 回");
  });

  it("saves a committed runtime value while keeping the rules", () => {
    const onChange = vi.fn();

    mountSection(onChange);
    typeInto(runtimeInput("debounceMs"), "1500");
    blur(runtimeInput("debounceMs"));

    const request = onChange.mock.calls[0]?.[0] as SaveApplicationSettingsRequest;

    expect(request.japaneseLint?.debounceMs).toBe(1500);
    expect(request.japaneseLint?.lineCacheLimit).toBe(5000);
    expect(request.japaneseLint?.rules["max-ten"].options).toEqual({ max: 5 });
  });

  it("clamps a runtime value into its range on commit", () => {
    const onChange = vi.fn();

    mountSection(onChange);
    typeInto(runtimeInput("workerRestartAttempts"), "99");
    blur(runtimeInput("workerRestartAttempts"));

    expect(
      (onChange.mock.calls[0]?.[0] as SaveApplicationSettingsRequest)
        .japaneseLint?.workerRestartAttempts
    ).toBe(10);
    expect(runtimeInput("workerRestartAttempts").value).toBe("10");
  });

  it("a rule change keeps the runtime options as they are", () => {
    const onChange = vi.fn();

    mountSection(onChange, {
      ...defaultApplicationSettings,
      japaneseLint: {
        ...resolveJapaneseLintSettings(undefined),
        debounceMs: 1700
      }
    });
    act(() => checkboxFor("no-nfd").click());

    expect(
      (onChange.mock.calls[0]?.[0] as SaveApplicationSettingsRequest)
        .japaneseLint?.debounceMs
    ).toBe(1700);
  });
});

describe("parseThresholdInput (#625)", () => {
  it("accepts whole numbers and rejects everything else", () => {
    expect(parseThresholdInput("5")).toBe(5);
    expect(parseThresholdInput(" 120 ")).toBe(120);
    for (const bad of ["", "abc", "1.5", "-3", "1e3", "５"]) {
      expect(parseThresholdInput(bad), bad).toBeNull();
    }
  });
});

describe("Settings panel integration (#625)", () => {
  it("lists 日本語表現チェック as a category and renders the section when selected", () => {
    act(() => {
      root.render(
        <SettingsPanelView
          settings={defaultApplicationSettings}
          isLoading={false}
          error={null}
          translate={translateJa}
          onChangeSettings={() => undefined}
          selectedCategoryId="japaneseLint"
          onSelectCategory={() => undefined}
          searchQuery=""
          onSearchQueryChange={() => undefined}
        />
      );
    });

    const categories = [
      ...container.querySelectorAll(".settingsCategoryButton")
    ].map((button) => button.textContent);

    expect(categories).toContain("日本語表現チェック");
    expect(container.querySelector(".japaneseLintSettings")).not.toBeNull();
    expect(container.querySelectorAll("[data-japanese-lint-rule]")).toHaveLength(12);
  });

  it("does not render the section for other categories", () => {
    act(() => {
      root.render(
        <SettingsPanelView
          settings={defaultApplicationSettings}
          isLoading={false}
          error={null}
          translate={translateJa}
          onChangeSettings={() => undefined}
          selectedCategoryId="application"
          onSelectCategory={() => undefined}
          searchQuery=""
          onSearchQueryChange={() => undefined}
        />
      );
    });

    expect(container.querySelector(".japaneseLintSettings")).toBeNull();
  });
});

describe("instant check picks up settings changes (#625)", () => {
  it("re-lints the open document when the rule settings change", () => {
    const editor = readFileSync("src/renderer/MarkdownEditor.tsx", "utf8");
    const app = readFileSync("src/renderer/App.tsx", "utf8");

    // App fingerprints the resolved rules and hands it to the editor...
    expect(app).toContain("resolveJapaneseLintSettings(settings.japaneseLint)");
    expect(app).toContain(
      "japaneseLintSettingsRevision={" +
        String.fromCharCode(10) +
        "                          japaneseLintSettingsRevision"
    );
    // ...whose effect re-runs the lint when it changes.
    expect(editor).toContain(
      "[japaneseLintSourceKey, japaneseLintSettingsRevision]"
    );
    expect(editor).toContain("refreshJapaneseLint(viewRef.current)");
  });

  it("the main process reads the stored settings for every request", () => {
    const ipc = readFileSync("src/main/japaneseLintIpc.ts", "utf8");

    expect(ipc).toContain("(await loadSettings()).japaneseLint");
    expect(ipc).toContain("buildJapaneseLintWorkerConfig(latestStored)");
  });
});
