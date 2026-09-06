// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDifferentialProjectSettingRequest,
  createProjectSettingResetRequest,
  createProjectSettingsFontOverrideRequest,
  validateProjectFontFamily,
  validateProjectSettingValue,
  getProjectSettingsUiItems,
  isProjectSettingsScope,
  isProjectOverrideEligibleScope,
  isSupportedProjectSettingControl,
  readProjectSettingValue,
  readInheritedSettingValue,
  readEffectiveProjectSettingValue,
  isProjectSettingModified,
  ProjectSettingField,
  ProjectSettingOverrideField,
  ProjectSettingsPanel,
  ProjectSettingsPanelView,
  type ProjectSettingsPanelViewProps
} from "../../src/renderer/ProjectSettingsPanel";
import type { Translate } from "../../src/shared/i18n";
import { enTranslations } from "../../src/shared/i18n/en";
import { jaTranslations } from "../../src/shared/i18n/ja";
import * as settingsCatalogModule from "../../src/shared/settingsCatalog";
import type { SettingCatalogItem } from "../../src/shared/settingsUiCatalog";

const translateJa: Translate = (key) =>
  jaTranslations[key] ?? enTranslations[key] ?? key;
const translateEn: Translate = (key) =>
  enTranslations[key] ?? jaTranslations[key] ?? key;

describe("ProjectSettingsPanel differential pure helpers (#396 Slice 5 revision)", () => {
  describe("createDifferentialProjectSettingRequest", () => {
    it("creates a set request when new value differs from inherited value", () => {
      const req = createDifferentialProjectSettingRequest(
        "editor.fontFamily",
        "Yu Mincho, serif",
        "Meiryo, sans-serif"
      );
      expect(req).toEqual({
        set: { "editor.fontFamily": "Yu Mincho, serif" }
      });
    });

    it("creates a remove request when new value equals inherited value", () => {
      const req = createDifferentialProjectSettingRequest(
        "editor.fontFamily",
        "Meiryo, sans-serif",
        "Meiryo, sans-serif"
      );
      expect(req).toEqual({
        remove: ["editor.fontFamily"]
      });
    });
  });

  describe("createProjectSettingResetRequest", () => {
    it("creates a remove request for the setting key", () => {
      const req = createProjectSettingResetRequest("preview.renderer");
      expect(req).toEqual({
        remove: ["preview.renderer"]
      });
    });
  });

  describe("isProjectSettingModified", () => {
    it("returns false when project override is absent", () => {
      expect(
        isProjectSettingModified("editor.fontFamily", undefined, {
          editor: { fontFamily: "Consolas" }
        })
      ).toBe(false);
    });

    it("returns true when project override differs from application settings", () => {
      expect(
        isProjectSettingModified(
          "editor.fontFamily",
          { editor: { fontFamily: "Yu Mincho" } },
          { editor: { fontFamily: "Consolas" } }
        )
      ).toBe(true);
    });

    it("normalizes same-value override as unchanged (false)", () => {
      expect(
        isProjectSettingModified(
          "editor.fontFamily",
          { editor: { fontFamily: "Consolas" } },
          { editor: { fontFamily: "Consolas" } }
        )
      ).toBe(false);
    });
  });

  describe("readEffectiveProjectSettingValue", () => {
    it("returns project value when project override exists", () => {
      expect(
        readEffectiveProjectSettingValue(
          "editor.fontFamily",
          { editor: { fontFamily: "Yu Mincho" } },
          { editor: { fontFamily: "Consolas" } }
        )
      ).toBe("Yu Mincho");
    });

    it("returns inherited value when project override is absent", () => {
      expect(
        readEffectiveProjectSettingValue(
          "editor.fontFamily",
          undefined,
          { editor: { fontFamily: "Consolas" } }
        )
      ).toBe("Consolas");
    });
  });

  describe("validateProjectFontFamily", () => {
    it("returns ok with undefined value when trimmed input equals current effective value", () => {
      const result = validateProjectFontFamily("  Consolas  ", "Consolas");
      expect(result).toEqual({ ok: true, value: undefined });
    });

    it("returns ok with trimmed value when input is a valid new font family", () => {
      const result = validateProjectFontFamily(
        "  Yu Mincho, serif  ",
        "Consolas"
      );
      expect(result).toEqual({ ok: true, value: "Yu Mincho, serif" });
    });

    it("returns error when input is empty string", () => {
      const result = validateProjectFontFamily("   ", "Consolas");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure).toBe("emptyString");
      }
    });

    it("returns error when input contains disallowed characters", () => {
      const result = validateProjectFontFamily("Font<script>", "Consolas");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure).toBe("disallowedCharacters");
      }
    });
  });
});

describe("ProjectSettingField (#396 Slice 5 revision)", () => {
  it("renders unmodified state without badge, without reset button, and with editable child", () => {
    const onReset = vi.fn();
    const element = React.createElement(
      ProjectSettingField,
      {
        label: "Editor font",
        description: "Font family for the editor",
        settingKey: "editor.fontFamily",
        isModified: false,
        isReadOnly: false,
        resetLabel: "Match Application Settings",
        modifiedLabel: "Modified",
        onReset
      },
      React.createElement("input", { type: "text", defaultValue: "Consolas" })
    );

    const rendered = renderToStaticMarkup(element);
    expect(rendered).toContain("Editor font");
    expect(rendered).toContain("Font family for the editor");
    expect(rendered).toContain("editor.fontFamily");
    expect(rendered).not.toContain("Modified");
    expect(rendered).not.toContain("↺");
    expect(rendered).not.toContain('type="checkbox"');
  });

  it("renders modified state with badge and reset button", () => {
    const onReset = vi.fn();
    const element = React.createElement(
      ProjectSettingField,
      {
        label: "Editor font",
        settingKey: "editor.fontFamily",
        isModified: true,
        isReadOnly: false,
        resetLabel: "Match Application Settings",
        modifiedLabel: "Modified",
        onReset
      },
      React.createElement("input", { type: "text", defaultValue: "Yu Mincho" })
    );

    const rendered = renderToStaticMarkup(element);
    expect(rendered).toContain("Modified");
    expect(rendered).toContain("projectSettingModifiedBadge");
    expect(rendered).toContain("↺");
    expect(rendered).toContain("projectSettingResetButton");
    expect(rendered).toContain('title="Match Application Settings"');
    expect(rendered).toContain('aria-label="Match Application Settings"');
  });

  it("disables reset button in read-only mode while keeping badge visible", () => {
    const element = React.createElement(
      ProjectSettingField,
      {
        label: "Editor font",
        settingKey: "editor.fontFamily",
        isModified: true,
        isReadOnly: true,
        resetLabel: "Match Application Settings",
        modifiedLabel: "Modified",
        onReset: vi.fn()
      },
      React.createElement("input", { type: "text", defaultValue: "Yu Mincho" })
    );

    const rendered = renderToStaticMarkup(element);
    expect(rendered).toContain("Modified");
    expect(rendered).toContain("disabled=\"\"");
    expect(rendered).toContain("↺");
  });
});

describe("ProjectSettingsPanel integration and differential behaviors (#396 Slice 5 revision)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  // 1. Unchanged text setting
  it("renders unchanged text setting as editable without difference UI (requirement 1)", () => {
    act(() => {
      root.render(
        React.createElement(ProjectSettingsPanel, {
          translate: translateJa,
          projectSettings: undefined,
          applicationSettings: {
            editor: { fontFamily: "Consolas" }
          },
          isReadOnly: false,
          onSaveSettings: async () => undefined
        })
      );
    });

    const textInput = container.querySelector<HTMLInputElement>('input[type="text"]')!;
    expect(textInput).not.toBeNull();
    expect(textInput.value).toBe("Consolas");
    expect(textInput.disabled).toBe(false);

    // No checkbox, no badge, no reset button
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(container.querySelector(".projectSettingModifiedBadge")).toBeNull();
    expect(container.querySelector(".projectSettingResetButton")).toBeNull();
  });

  // 2. Modified text setting
  it("renders modified text setting with value, badge, and reset button (requirement 2)", () => {
    act(() => {
      root.render(
        React.createElement(ProjectSettingsPanel, {
          translate: translateJa,
          projectSettings: {
            editor: { fontFamily: "Yu Mincho" }
          },
          applicationSettings: {
            editor: { fontFamily: "Consolas" }
          },
          isReadOnly: false,
          onSaveSettings: async () => undefined
        })
      );
    });

    const textInput = container.querySelector<HTMLInputElement>('input[type="text"]')!;
    expect(textInput.value).toBe("Yu Mincho");
    expect(textInput.disabled).toBe(false);

    const badge = container.querySelector(".projectSettingModifiedBadge");
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe("変更中");

    const resetBtn = container.querySelector(".projectSettingResetButton");
    expect(resetBtn).not.toBeNull();
    expect(resetBtn?.getAttribute("aria-label")).toBe("アプリケーション設定に合わせる");
  });

  // 3. Editing inherited value to different value
  it("persists project override on blur when edited to a different value (requirement 3)", async () => {
    const onSaveSettings = vi.fn(async () => undefined);

    act(() => {
      root.render(
        React.createElement(ProjectSettingsPanel, {
          translate: translateJa,
          projectSettings: undefined,
          applicationSettings: {
            editor: { fontFamily: "Consolas" }
          },
          isReadOnly: false,
          onSaveSettings
        })
      );
    });

    const textInput = container.querySelector<HTMLInputElement>('input[type="text"]')!;

    act(() => {
      textInput.focus();
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;
      nativeSetter?.call(textInput, "Yu Mincho");
      textInput.dispatchEvent(new Event("input", { bubbles: true }));
      textInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(onSaveSettings).not.toHaveBeenCalled();

    await act(async () => {
      textInput.blur();
    });

    expect(onSaveSettings).toHaveBeenCalledTimes(1);
    expect(onSaveSettings).toHaveBeenCalledWith({
      set: { "editor.fontFamily": "Yu Mincho" }
    });
  });

  // 4. Editing modified value back to Application value
  it("emits remove request instead of set when edited back to application value (requirement 4)", async () => {
    const onSaveSettings = vi.fn(async () => undefined);

    act(() => {
      root.render(
        React.createElement(ProjectSettingsPanel, {
          translate: translateJa,
          projectSettings: {
            editor: { fontFamily: "Yu Mincho" }
          },
          applicationSettings: {
            editor: { fontFamily: "Consolas" }
          },
          isReadOnly: false,
          onSaveSettings
        })
      );
    });

    const textInput = container.querySelector<HTMLInputElement>('input[type="text"]')!;

    act(() => {
      textInput.focus();
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;
      nativeSetter?.call(textInput, "Consolas");
      textInput.dispatchEvent(new Event("input", { bubbles: true }));
      textInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      textInput.blur();
    });

    expect(onSaveSettings).toHaveBeenCalledTimes(1);
    expect(onSaveSettings).toHaveBeenCalledWith({
      remove: ["editor.fontFamily"]
    });
  });

  // 5. Reset button
  it("emits remove request when reset button is clicked (requirement 5)", async () => {
    const onSaveSettings = vi.fn(async () => undefined);

    act(() => {
      root.render(
        React.createElement(ProjectSettingsPanel, {
          translate: translateJa,
          projectSettings: {
            editor: { fontFamily: "Yu Mincho" }
          },
          applicationSettings: {
            editor: { fontFamily: "Consolas" }
          },
          isReadOnly: false,
          onSaveSettings
        })
      );
    });

    const resetBtn = container.querySelector<HTMLButtonElement>(".projectSettingResetButton")!;
    expect(resetBtn).not.toBeNull();

    await act(async () => {
      resetBtn.click();
    });

    expect(onSaveSettings).toHaveBeenCalledTimes(1);
    expect(onSaveSettings).toHaveBeenCalledWith({
      remove: ["editor.fontFamily"]
    });
  });

  // 6. Select unchanged
  it("renders select unchanged as enabled without difference UI (requirement 6)", () => {
    act(() => {
      root.render(
        React.createElement(ProjectSettingsPanel, {
          translate: translateJa,
          projectSettings: undefined,
          applicationSettings: {
            preview: { renderer: "markdown" }
          },
          isReadOnly: false,
          onSaveSettings: async () => undefined
        })
      );
    });

    const rows = container.querySelectorAll(".settingsItemRow");
    const previewRow = rows[1];
    const select = previewRow.querySelector<HTMLSelectElement>("select")!;

    expect(select).not.toBeNull();
    expect(select.value).toBe("markdown");
    expect(select.disabled).toBe(false);
    expect(previewRow.querySelector(".projectSettingModifiedBadge")).toBeNull();
    expect(previewRow.querySelector(".projectSettingResetButton")).toBeNull();
  });

  // 7. Select different value (requirement 7)
  it("persists project override immediately on change when select differs from application setting (requirement 7)", async () => {
    const onSaveSettings = vi.fn(async () => undefined);

    const originalValidate = settingsCatalogModule.validateCatalogValue;
    const spy = vi
      .spyOn(settingsCatalogModule, "validateCatalogValue")
      .mockImplementation((key, val) => {
        if (key === "preview.renderer" && val === "vertical") {
          return { ok: true, value: "vertical" as any };
        }
        return originalValidate(key, val);
      });

    const testItems: readonly SettingCatalogItem[] = [
      {
        key: "editor.fontFamily",
        category: "editor",
        order: 100,
        labelKey: "settings.editor.fontFamily.label",
        descriptionKey: "settings.editor.fontFamily.description",
        control: { kind: "text" },
        defaultValue: "Consolas"
      },
      {
        key: "preview.renderer",
        category: "preview",
        order: 100,
        labelKey: "settings.preview.renderer.label",
        descriptionKey: "settings.preview.renderer.description",
        control: {
          kind: "select",
          options: [
            {
              value: "markdown",
              labelKey: "settings.preview.renderer.option.markdown.label"
            },
            {
              value: "vertical",
              labelKey: "settings.preview.renderer.option.markdown.label"
            }
          ]
        },
        defaultValue: "markdown"
      }
    ];

    try {
      act(() => {
        root.render(
          React.createElement(ProjectSettingsPanel, {
            translate: translateJa,
            projectSettings: undefined,
            applicationSettings: {
              preview: { renderer: "markdown" }
            },
            isReadOnly: false,
            onSaveSettings,
            items: testItems
          })
        );
      });

      const rows = container.querySelectorAll(".settingsItemRow");
      const previewRow = rows[1];
      const select = previewRow.querySelector<HTMLSelectElement>("select")!;

      await act(async () => {
        select.value = "vertical";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });

      expect(onSaveSettings).toHaveBeenCalledTimes(1);
      expect(onSaveSettings).toHaveBeenCalledWith({
        set: { "preview.renderer": "vertical" }
      });
    } finally {
      spy.mockRestore();
    }
  });

  // 8. Select back to Application value (requirement 8)
  it("emits remove request when select is changed back to match application setting (requirement 8)", async () => {
    const onSaveSettings = vi.fn(async () => undefined);

    const testItems: readonly SettingCatalogItem[] = [
      {
        key: "editor.fontFamily",
        category: "editor",
        order: 100,
        labelKey: "settings.editor.fontFamily.label",
        descriptionKey: "settings.editor.fontFamily.description",
        control: { kind: "text" },
        defaultValue: "Consolas"
      },
      {
        key: "preview.renderer",
        category: "preview",
        order: 100,
        labelKey: "settings.preview.renderer.label",
        descriptionKey: "settings.preview.renderer.description",
        control: {
          kind: "select",
          options: [
            {
              value: "markdown",
              labelKey: "settings.preview.renderer.option.markdown.label"
            },
            {
              value: "vertical",
              labelKey: "settings.preview.renderer.option.markdown.label"
            }
          ]
        },
        defaultValue: "markdown"
      }
    ];

    act(() => {
      root.render(
        React.createElement(ProjectSettingsPanel, {
          translate: translateJa,
          projectSettings: {
            preview: { renderer: "vertical" as any }
          },
          applicationSettings: {
            preview: { renderer: "markdown" }
          },
          isReadOnly: false,
          onSaveSettings,
          items: testItems
        })
      );
    });

    const rows = container.querySelectorAll(".settingsItemRow");
    const previewRow = rows[1];
    const select = previewRow.querySelector<HTMLSelectElement>("select")!;

    await act(async () => {
      select.value = "markdown";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(onSaveSettings).toHaveBeenCalledTimes(1);
    expect(onSaveSettings).toHaveBeenCalledWith({
      remove: ["preview.renderer"]
    });
  });

  // 12. Multiple overrides coexistence and isolated reset (requirement 12)
  it("keeps other overrides intact when one setting is reset (requirement 12)", async () => {
    const onSaveSettings = vi.fn(async () => undefined);

    act(() => {
      root.render(
        React.createElement(ProjectSettingsPanel, {
          translate: translateJa,
          projectSettings: {
            editor: { fontFamily: "Yu Mincho" },
            preview: { renderer: "vertical" as any }
          },
          applicationSettings: {
            editor: { fontFamily: "Consolas" },
            preview: { renderer: "markdown" }
          },
          isReadOnly: false,
          onSaveSettings
        })
      );
    });

    const rows = container.querySelectorAll(".settingsItemRow");
    expect(rows).toHaveLength(2);

    // Both should have modified badges
    const editorRow = rows[0];
    const previewRow = rows[1];
    expect(editorRow.querySelector(".projectSettingModifiedBadge")).not.toBeNull();
    expect(previewRow.querySelector(".projectSettingModifiedBadge")).not.toBeNull();

    // Reset only preview.renderer
    const previewResetBtn = previewRow.querySelector<HTMLButtonElement>(".projectSettingResetButton")!;
    expect(previewResetBtn).not.toBeNull();

    await act(async () => {
      previewResetBtn.click();
    });

    expect(onSaveSettings).toHaveBeenCalledTimes(1);
    expect(onSaveSettings).toHaveBeenCalledWith({
      remove: ["preview.renderer"]
    });
  });

  // 9. Read-only unchanged
  it("disables control and shows no difference UI in read-only mode when unchanged (requirement 9)", () => {
    act(() => {
      root.render(
        React.createElement(ProjectSettingsPanel, {
          translate: translateJa,
          projectSettings: undefined,
          applicationSettings: {
            editor: { fontFamily: "Consolas" }
          },
          isReadOnly: true,
          onSaveSettings: async () => undefined
        })
      );
    });

    const textInput = container.querySelector<HTMLInputElement>('input[type="text"]')!;
    expect(textInput.disabled).toBe(true);
    expect(container.querySelector(".projectSettingModifiedBadge")).toBeNull();
    expect(container.querySelector(".projectSettingResetButton")).toBeNull();
  });

  // 10. Read-only modified
  it("keeps badge and disabled reset button visible in read-only mode when modified (requirement 10)", () => {
    act(() => {
      root.render(
        React.createElement(ProjectSettingsPanel, {
          translate: translateJa,
          projectSettings: {
            editor: { fontFamily: "Yu Mincho" }
          },
          applicationSettings: {
            editor: { fontFamily: "Consolas" }
          },
          isReadOnly: true,
          onSaveSettings: async () => undefined
        })
      );
    });

    const textInput = container.querySelector<HTMLInputElement>('input[type="text"]')!;
    expect(textInput.disabled).toBe(true);
    expect(textInput.value).toBe("Yu Mincho");

    const badge = container.querySelector(".projectSettingModifiedBadge");
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe("変更中");

    const resetBtn = container.querySelector<HTMLButtonElement>(".projectSettingResetButton")!;
    expect(resetBtn).not.toBeNull();
    expect(resetBtn.disabled).toBe(true);
  });

  // 11. Save failure behavior
  it("restores committed previous value and displays error on blur save failure (requirement 11)", async () => {
    const onSaveSettings = vi.fn(async () => {
      throw new Error("Disk error on save");
    });

    act(() => {
      root.render(
        React.createElement(ProjectSettingsPanel, {
          translate: translateJa,
          projectSettings: {
            editor: { fontFamily: "Yu Mincho" }
          },
          applicationSettings: {
            editor: { fontFamily: "Consolas" }
          },
          isReadOnly: false,
          onSaveSettings
        })
      );
    });

    const textInput = container.querySelector<HTMLInputElement>('input[type="text"]')!;

    act(() => {
      textInput.focus();
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;
      nativeSetter?.call(textInput, "Faulty Font");
      textInput.dispatchEvent(new Event("input", { bubbles: true }));
      textInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      textInput.blur();
    });

    expect(onSaveSettings).toHaveBeenCalledTimes(1);
    expect(textInput.value).toBe("Yu Mincho");

    const errorEl = container.querySelector(".settingsError");
    expect(errorEl).not.toBeNull();
    expect(errorEl?.textContent).toBe("Disk error on save");
  });

  // 13. Application changes while unchanged
  it("automatically follows application setting changes when project is unchanged (requirement 13)", () => {
    act(() => {
      root.render(
        React.createElement(ProjectSettingsPanel, {
          translate: translateJa,
          projectSettings: undefined,
          applicationSettings: {
            editor: { fontFamily: "Initial Font" }
          },
          isReadOnly: false,
          onSaveSettings: async () => undefined
        })
      );
    });

    expect(container.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe("Initial Font");

    // Application settings change from Initial Font to Updated Font
    act(() => {
      root.render(
        React.createElement(ProjectSettingsPanel, {
          translate: translateJa,
          projectSettings: undefined,
          applicationSettings: {
            editor: { fontFamily: "Updated Font" }
          },
          isReadOnly: false,
          onSaveSettings: async () => undefined
        })
      );
    });

    expect(container.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe("Updated Font");
    expect(container.querySelector(".projectSettingModifiedBadge")).toBeNull();
  });

  // 14. Application changes while modified
  it("retains project value and modified badge when application setting changes (requirement 14)", () => {
    act(() => {
      root.render(
        React.createElement(ProjectSettingsPanel, {
          translate: translateJa,
          projectSettings: {
            editor: { fontFamily: "Project Custom Font" }
          },
          applicationSettings: {
            editor: { fontFamily: "Font A" }
          },
          isReadOnly: false,
          onSaveSettings: async () => undefined
        })
      );
    });

    expect(container.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe("Project Custom Font");
    expect(container.querySelector(".projectSettingModifiedBadge")).not.toBeNull();

    // Application settings change to Font B
    act(() => {
      root.render(
        React.createElement(ProjectSettingsPanel, {
          translate: translateJa,
          projectSettings: {
            editor: { fontFamily: "Project Custom Font" }
          },
          applicationSettings: {
            editor: { fontFamily: "Font B" }
          },
          isReadOnly: false,
          onSaveSettings: async () => undefined
        })
      );
    });

    expect(container.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe("Project Custom Font");
    expect(container.querySelector(".projectSettingModifiedBadge")).not.toBeNull();
  });

  // 15. projectOnly boundary
  it("does not route non-override items (applicationOnly or future projectOnly) to the differential UI (requirement 15)", () => {
    act(() => {
      root.render(
        React.createElement(ProjectSettingsPanel, {
          translate: translateJa,
          projectSettings: undefined,
          applicationSettings: undefined,
          isReadOnly: false,
          onSaveSettings: async () => undefined,
          items: [
            {
              key: "editor.fontFamily",
              category: "editor",
              order: 100,
              labelKey: "settings.editor.fontFamily.label",
              descriptionKey: "settings.editor.fontFamily.description",
              control: { kind: "text" },
              defaultValue: "monospace"
            },
            {
              key: "workbench.colorTheme",
              category: "appearance",
              order: 10,
              labelKey: "settings.workbench.colorTheme.label",
              descriptionKey: "settings.workbench.colorTheme.description",
              control: { kind: "select", options: [] },
              defaultValue: "default"
            }
          ]
        })
      );
    });

    const rows = container.querySelectorAll(".settingsItemRow");
    // workbench.colorTheme is not applicationWithProjectOverride, so it must be filtered out
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("エディタフォント");
  });

  // 16. Layout structure aligned with Application Settings
  it("renders category headings (settingsItemPaneHeading) and matches Application Settings DOM structure", () => {
    act(() => {
      root.render(
        React.createElement(ProjectSettingsPanel, {
          translate: translateJa,
          projectSettings: {
            editor: { fontFamily: "Yu Mincho" }
          },
          applicationSettings: {
            editor: { fontFamily: "Consolas" },
            preview: { renderer: "markdown" }
          },
          isReadOnly: false,
          onSaveSettings: async () => undefined
        })
      );
    });

    // Category headings
    const headings = container.querySelectorAll<HTMLHeadingElement>(
      "h2.settingsItemPaneHeading"
    );
    expect(headings).toHaveLength(2);
    expect(headings[0].textContent).toBe("エディタ");
    expect(headings[1].textContent).toBe("プレビュー");

    // Sections use existing .settingsItemPane class
    const panes = container.querySelectorAll(".settingsItemPane");
    expect(panes).toHaveLength(2);

    // Verify exact sequence of elements inside row:
    // 1. header (label + inline actions) -> 2. control -> 3. description -> 4. key
    const editorRow = container.querySelectorAll(".settingsItemRow")[0];
    const childTags = Array.from(editorRow.children).map((el) => ({
      tag: el.tagName.toLowerCase(),
      className: el.className
    }));
    expect(childTags).toEqual([
      { tag: "div", className: "settingsItemHeader" },
      { tag: "input", className: "settingsTextInput" },
      { tag: "p", className: "settingsDescription" },
      { tag: "code", className: "settingsItemKey" }
    ]);

    // 1. Setting label + inline actions in header
    const header = editorRow.querySelector(".settingsItemHeader")!;
    expect(header).not.toBeNull();
    const label = header.querySelector(".settingsItemLabel")!;
    expect(label.textContent).toBe("エディタフォント");
    const actions = header.querySelector(".projectSettingHeaderActions")!;
    expect(actions).not.toBeNull();
    expect(actions.querySelector(".projectSettingResetButton")).not.toBeNull();
    expect(actions.querySelector(".projectSettingModifiedBadge")?.textContent).toBe("変更中");

    // 2. Control directly with .settingsTextInput (no custom wrapper)
    const textInput = editorRow.querySelector<HTMLInputElement>("input.settingsTextInput");
    expect(textInput).not.toBeNull();
    expect(textInput?.parentElement?.classList.contains("projectSettingsInputRow")).toBe(false);

    // 3. Description
    const desc = editorRow.querySelector("p.settingsDescription");
    expect(desc).not.toBeNull();

    // 4. Setting key
    const keyEl = editorRow.querySelector("code.settingsItemKey");
    expect(keyEl?.textContent).toBe("editor.fontFamily");

    // Preview row control directly with .settingsSelect and same sequence
    const previewRow = container.querySelectorAll(".settingsItemRow")[1];
    const previewChildTags = Array.from(previewRow.children).map((el) => ({
      tag: el.tagName.toLowerCase(),
      className: el.className
    }));
    expect(previewChildTags).toEqual([
      { tag: "div", className: "settingsItemHeader" },
      { tag: "select", className: "settingsSelect" },
      { tag: "p", className: "settingsDescription" },
      { tag: "code", className: "settingsItemKey" }
    ]);
  });
});
