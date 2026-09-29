// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t, type Translate } from "../../src/shared/i18n";
import { defaultApplicationSettings } from "../../src/shared/settings";
import { getSettingCatalogItem } from "../../src/shared/settingsUiCatalog";
import { ColorThemeSettingControl } from "../../src/renderer/ColorThemeSettingControl";
import { SettingsPanelView } from "../../src/renderer/SettingsPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const translate: Translate = (key, values) => t("en", key, values);
const item = getSettingCatalogItem("workbench.colorTheme");
const options = item?.control.kind === "select" ? item.control.options : [];

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

function mountControl(
  onChange: (value: string) => void,
  value = "pergamum-light"
): void {
  act(() => {
    root.render(
      <>
        <span id="label">Color theme</span>
        <ColorThemeSettingControl
          id="ctl"
          labelId="label"
          value={value}
          options={options}
          translate={translate}
          onChange={onChange}
        />
      </>
    );
  });
}

const trigger = (): HTMLButtonElement =>
  container.querySelector<HTMLButtonElement>(".colorThemeDropdownTrigger")!;
const listbox = (): HTMLElement | null =>
  container.querySelector<HTMLElement>('[role="listbox"]');

function press(element: Element, key: string): void {
  act(() => {
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
    );
  });
}

describe("ColorThemeSettingControl (#623)", () => {
  it("is a collapsed dropdown showing only the selected theme with its swatch", () => {
    mountControl(vi.fn(), "night-dark");

    expect(trigger().getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(trigger().textContent).toBe("Night Dark");
    expect(listbox()).toBeNull();
    expect(container.querySelectorAll(".colorThemeSwatch")).toHaveLength(1);
    expect(
      (container.querySelector(".colorThemeSwatch") as HTMLElement).style
        .backgroundColor
    ).not.toBe("");
    // Not a radio group / segmented control.
    expect(container.querySelector('input[type="radio"]')).toBeNull();
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
  });

  it("opens to a listbox of every built-in theme, each with a swatch, marking the selected one", () => {
    mountControl(vi.fn(), "night-dark");

    act(() => trigger().click());

    const rows = [...container.querySelectorAll<HTMLElement>('[role="option"]')];

    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(rows.map((row) => row.dataset.themeId)).toEqual([
      "pergamum-light",
      "night-dark",
      "resistance-blue",
      "enlightened-green",
      "banana-yellow",
      "sakura-pink",
      "noble-purple",
      "sky-cyan"
    ]);
    expect(rows.map((row) => row.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
      "false",
      "false",
      "false",
      "false",
      "false",
      "false"
    ]);
    for (const row of rows) {
      expect(row.querySelector(".colorThemeSwatch")).not.toBeNull();
    }
    expect(rows[1]?.getAttribute("aria-label")).toBe(
      "Change color theme to Night Dark"
    );
  });

  it("paints the trigger and every option as a miniature of its own theme", () => {
    mountControl(vi.fn(), "night-dark");

    const previewOf = (element: HTMLElement) => ({
      background: element.style.getPropertyValue("--theme-preview-background"),
      foreground: element.style.getPropertyValue("--theme-preview-foreground")
    });

    // Collapsed: the trigger already wears the selected theme's colors.
    expect(previewOf(trigger())).toEqual({
      background: "#1a1e25",
      foreground: "#d7dde5"
    });

    act(() => trigger().click());

    const light = container.querySelector<HTMLElement>(
      '[data-theme-id="pergamum-light"]'
    )!;
    const night = container.querySelector<HTMLElement>(
      '[data-theme-id="night-dark"]'
    )!;
    const blue = container.querySelector<HTMLElement>(
      '[data-theme-id="resistance-blue"]'
    )!;
    const green = container.querySelector<HTMLElement>(
      '[data-theme-id="enlightened-green"]'
    )!;

    expect(previewOf(light)).toEqual({
      background: "#ffffff",
      foreground: "#1f2933"
    });
    expect(previewOf(night)).toEqual({
      background: "#1a1e25",
      foreground: "#d7dde5"
    });
    expect(previewOf(blue)).toEqual({
      background: "#e6eef7",
      foreground: "#162230"
    });
    expect(previewOf(green)).toEqual({
      background: "#e6f0e8",
      foreground: "#19261d"
    });
    const banana = container.querySelector<HTMLElement>(
      '[data-theme-id="banana-yellow"]'
    )!;
    const sakura = container.querySelector<HTMLElement>(
      '[data-theme-id="sakura-pink"]'
    )!;
    const purple = container.querySelector<HTMLElement>(
      '[data-theme-id="noble-purple"]'
    )!;
    const cyan = container.querySelector<HTMLElement>(
      '[data-theme-id="sky-cyan"]'
    )!;

    expect(previewOf(banana)).toEqual({
      background: "#f5f0e1",
      foreground: "#272318"
    });
    expect(previewOf(sakura)).toEqual({
      background: "#f2e4e8",
      foreground: "#26191d"
    });
    expect(previewOf(purple)).toEqual({
      background: "#eee8f6",
      foreground: "#211a2d"
    });
    expect(previewOf(cyan)).toEqual({
      background: "#e5f5fb",
      foreground: "#102a34"
    });
    expect(blue.style.getPropertyValue("--theme-preview-accent")).toBe(
      "#1b62b0"
    );
    expect(green.style.getPropertyValue("--theme-preview-accent")).toBe(
      "#23733e"
    );
    expect(purple.style.getPropertyValue("--theme-preview-accent")).toBe(
      "#6b46a1"
    );
    expect(cyan.style.getPropertyValue("--theme-preview-accent")).toBe(
      "#007a94"
    );
  });

  it("selecting an option calls onChange and closes the popup", () => {
    const onChange = vi.fn();
    mountControl(onChange);

    act(() => trigger().click());
    act(() =>
      container
        .querySelector<HTMLElement>('[data-theme-id="night-dark"]')!
        .click()
    );

    expect(onChange).toHaveBeenCalledExactlyOnceWith("night-dark");
    expect(listbox()).toBeNull();
  });

  it("ArrowDown opens from the trigger; Arrow keys move; Enter selects; Escape closes", () => {
    const onChange = vi.fn();
    mountControl(onChange);

    press(trigger(), "ArrowDown");
    expect(listbox()).not.toBeNull();

    press(listbox()!, "ArrowDown");
    expect(listbox()!.getAttribute("aria-activedescendant")).toBe(
      "ctl-option-night-dark"
    );

    press(listbox()!, "ArrowUp");
    expect(listbox()!.getAttribute("aria-activedescendant")).toBe(
      "ctl-option-pergamum-light"
    );

    press(listbox()!, "ArrowDown");
    press(listbox()!, "Enter");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("night-dark");
    expect(listbox()).toBeNull();

    press(trigger(), "ArrowDown");
    expect(listbox()).not.toBeNull();
    press(listbox()!, "Escape");
    expect(listbox()).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("Space selects the active option", () => {
    const onChange = vi.fn();
    mountControl(onChange);

    act(() => trigger().click());
    press(listbox()!, "End");
    press(listbox()!, " ");

    expect(onChange).toHaveBeenCalledExactlyOnceWith("sky-cyan");
  });

  it("an outside mouse-down closes the popup without changing the value", () => {
    const onChange = vi.fn();
    mountControl(onChange);

    act(() => trigger().click());
    act(() => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(listbox()).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not open while disabled", () => {
    mountControl(vi.fn());
    act(() => {
      root.render(
        <ColorThemeSettingControl
          id="ctl"
          labelId="label"
          value="pergamum-light"
          options={options}
          disabled
          translate={translate}
          onChange={vi.fn()}
        />
      );
    });

    act(() => trigger().click());

    expect(trigger().disabled).toBe(true);
    expect(listbox()).toBeNull();
  });
});

describe("Settings panel integration (#623)", () => {
  it("renders workbench.colorTheme as a dropdown and saves the chosen theme immediately", () => {
    const onChangeSettings = vi.fn();

    act(() => {
      root.render(
        <SettingsPanelView
          settings={defaultApplicationSettings}
          isLoading={false}
          error={null}
          translate={translate}
          onChangeSettings={onChangeSettings}
          selectedCategoryId="application"
          onSelectCategory={() => undefined}
          searchQuery="workbench.colorTheme"
          onSearchQueryChange={() => undefined}
        />
      );
    });

    const dropdownTrigger = container.querySelector<HTMLButtonElement>(
      "#settingControl-workbench\\.colorTheme .colorThemeDropdownTrigger"
    )!;

    expect(dropdownTrigger.textContent).toBe("Pergamum Light");
    expect(container.querySelector('input[type="radio"]')).toBeNull();

    act(() => dropdownTrigger.click());
    act(() =>
      container
        .querySelector<HTMLElement>('[data-theme-id="night-dark"]')!
        .click()
    );

    expect(onChangeSettings).toHaveBeenCalledTimes(1);
    expect(onChangeSettings.mock.calls[0]?.[0].workbench.colorTheme).toBe(
      "night-dark"
    );
  });
});
