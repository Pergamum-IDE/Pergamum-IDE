// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import path from "node:path";
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
  type ProjectSettingsPanelViewProps,
  normalizeProjectSettingsSearchQuery,
  matchesProjectSettingSearch,
  matchesProjectSettingCategory,
  filterProjectSettingItems,
  getEligibleProjectSettingCategories,
  type ProjectSettingCategoryFilter,
  type ProjectSettingCategoryItem
} from "../../src/renderer/ProjectSettingsPanel";
import type { Translate } from "../../src/shared/i18n";
import { enTranslations } from "../../src/shared/i18n/en";
import { jaTranslations } from "../../src/shared/i18n/ja";
import * as settingsCatalogModule from "../../src/shared/settingsCatalog";
import type { SettingCatalogItem } from "../../src/shared/settingsUiCatalog";
import {
  defaultDocumentMapSettings,
  DOCUMENT_MAP_DEFAULT_DIALOGUE_COLOR
} from "../../src/shared/documentMapSettings";
import type { ProjectSettings, UpdateProjectSettingsRequest } from "../../src/shared/api";

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

    // No checkbox, no badge, no reset button for editor font row
    const editorRow = container.querySelectorAll(".settingsItemRow")[0];
    expect(editorRow.querySelector('input[type="checkbox"]')).toBeNull();
    expect(editorRow.querySelector(".projectSettingModifiedBadge")).toBeNull();
    expect(editorRow.querySelector(".projectSettingResetButton")).toBeNull();
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

    const previewRow = Array.from(
      container.querySelectorAll(".settingsItemRow")
    ).find(
      (r) =>
        r.querySelector(".settingsItemKey")?.textContent === "preview.renderer"
    )!;
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
    expect(rows).toHaveLength(11);

    // Both should have modified badges
    const editorRow = Array.from(rows).find(
      (r) =>
        r.querySelector(".settingsItemKey")?.textContent === "editor.fontFamily"
    )!;
    const previewRow = Array.from(rows).find(
      (r) =>
        r.querySelector(".settingsItemKey")?.textContent === "preview.renderer"
    )!;
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
    expect(headings).toHaveLength(4);
    expect(headings[0].textContent).toBe("エディタ");
    expect(headings[1].textContent).toBe("プレビュー");
    expect(headings[2].textContent).toBe("文書マップ");
    expect(headings[3].textContent).toBe("ファイル");

    // Sections use existing .settingsItemPane class
    const panes = container.querySelectorAll(".settingsItemPane");
    expect(panes).toHaveLength(4);

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
    const previewRow = Array.from(
      container.querySelectorAll(".settingsItemRow")
    ).find(
      (r) =>
        r.querySelector(".settingsItemKey")?.textContent === "preview.renderer"
    )!;
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

describe("ProjectSettingsPanel Slice 6 - Search and Category Filtering (#396)", () => {
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

  describe("pure helpers", () => {
    describe("getEligibleProjectSettingCategories", () => {
      it("returns 'all' first followed by categories of eligible items in catalog sort order", () => {
        const eligibleItems = getProjectSettingsUiItems();
        const categories = getEligibleProjectSettingCategories(
          eligibleItems,
          translateJa
        );
        expect(categories).toEqual([
          { id: "all", labelKey: "settings.category.all.label" },
          { id: "editor", labelKey: "settings.category.editor.label" },
          { id: "preview", labelKey: "settings.category.preview.label" },
          { id: "documentMap", labelKey: "settings.category.documentMap.label" },
          { id: "files", labelKey: "settings.category.files.label" }
        ]);
      });

      it("returns only 'all' when eligible items list is empty", () => {
        const categories = getEligibleProjectSettingCategories([], translateJa);
        expect(categories).toEqual([
          { id: "all", labelKey: "settings.category.all.label" }
        ]);
      });

      it("preserves stable category order even if input items are reversed", () => {
        const eligibleItems = [...getProjectSettingsUiItems()].reverse();
        const categories = getEligibleProjectSettingCategories(
          eligibleItems,
          translateJa
        );
        expect(categories.map((c) => c.id)).toEqual([
          "all",
          "editor",
          "preview",
          "documentMap",
          "files"
        ]);
      });
    });

    describe("normalizeProjectSettingsSearchQuery", () => {
      it("trims whitespace and converts to lower case", () => {
        expect(normalizeProjectSettingsSearchQuery("   Editor.FontFamily   ")).toBe(
          "editor.fontfamily"
        );
        expect(normalizeProjectSettingsSearchQuery("  フォント  ")).toBe(
          "フォント"
        );
        expect(normalizeProjectSettingsSearchQuery("   ")).toBe("");
      });
    });

    describe("matchesProjectSettingSearch", () => {
      const eligibleItems = getProjectSettingsUiItems();
      const editorItem = eligibleItems.find((i) => i.key === "editor.fontFamily")!;
      const previewItem = eligibleItems.find((i) => i.key === "preview.renderer")!;

      it("matches empty query for any item", () => {
        expect(matchesProjectSettingSearch(editorItem, "", translateJa)).toBe(true);
        expect(matchesProjectSettingSearch(previewItem, "", translateJa)).toBe(true);
      });

      it("matches by key substring (case-insensitive)", () => {
        expect(
          matchesProjectSettingSearch(editorItem, "fontfamily", translateJa)
        ).toBe(true);
        expect(
          matchesProjectSettingSearch(editorItem, "editor.", translateJa)
        ).toBe(true);
        expect(
          matchesProjectSettingSearch(previewItem, "renderer", translateJa)
        ).toBe(true);
        expect(
          matchesProjectSettingSearch(previewItem, "fontfamily", translateJa)
        ).toBe(false);
      });

      it("matches by translated label", () => {
        expect(
          matchesProjectSettingSearch(editorItem, "エディタフォント", translateJa)
        ).toBe(true);
        expect(
          matchesProjectSettingSearch(previewItem, "レンダラー", translateJa)
        ).toBe(true);
      });

      it("matches by translated description", () => {
        expect(
          matchesProjectSettingSearch(editorItem, "フォントファミリー", translateJa)
        ).toBe(true);
      });

      it("matches by category name", () => {
        expect(
          matchesProjectSettingSearch(editorItem, "エディタ", translateJa)
        ).toBe(true);
        expect(
          matchesProjectSettingSearch(previewItem, "プレビュー", translateJa)
        ).toBe(true);
      });

      it("matches by select control option value and label", () => {
        expect(
          matchesProjectSettingSearch(previewItem, "markdown", translateJa)
        ).toBe(true);
        expect(
          matchesProjectSettingSearch(editorItem, "レンダラー", translateJa)
        ).toBe(false);
      });
    });

    describe("matchesProjectSettingCategory", () => {
      const eligibleItems = getProjectSettingsUiItems();
      const editorItem = eligibleItems.find((i) => i.key === "editor.fontFamily")!;
      const previewItem = eligibleItems.find((i) => i.key === "preview.renderer")!;

      it("matches 'all' for any item", () => {
        expect(matchesProjectSettingCategory(editorItem, "all")).toBe(true);
        expect(matchesProjectSettingCategory(previewItem, "all")).toBe(true);
      });

      it("matches specific category filter correctly", () => {
        expect(matchesProjectSettingCategory(editorItem, "editor")).toBe(true);
        expect(matchesProjectSettingCategory(editorItem, "preview")).toBe(false);
        expect(matchesProjectSettingCategory(previewItem, "preview")).toBe(true);
        expect(matchesProjectSettingCategory(previewItem, "editor")).toBe(false);
      });
    });

    describe("filterProjectSettingItems", () => {
      const eligibleItems = getProjectSettingsUiItems();

      it("returns all eligible items when filter is 'all' and query is empty", () => {
        const result = filterProjectSettingItems(
          eligibleItems,
          "all",
          "",
          translateJa
        );
        expect(result.map((i) => i.key)).toEqual([
          "editor.fontFamily",
          "editor.paragraphIndent.excludeLeadingCharacters",
          "editor.lineEnding.expected",
          "editor.characterCount.exclude.whitespace",
          "editor.characterCount.exclude.lineBreaks",
          "editor.characterCount.exclude.headings",
          "editor.characterCount.exclude.markdownSyntax",
          "editor.characterCount.exclude.markdownComments",
          "preview.renderer",
          "documentMap.dialogueDelimiterPairs",
          "files.newFile.lineEnding"
        ]);
      });

      it("filters by category alone", () => {
        const editorOnly = filterProjectSettingItems(
          eligibleItems,
          "editor",
          "",
          translateJa
        );
        expect(editorOnly.map((i) => i.key)).toEqual([
          "editor.fontFamily",
          "editor.paragraphIndent.excludeLeadingCharacters",
          "editor.lineEnding.expected",
          "editor.characterCount.exclude.whitespace",
          "editor.characterCount.exclude.lineBreaks",
          "editor.characterCount.exclude.headings",
          "editor.characterCount.exclude.markdownSyntax",
          "editor.characterCount.exclude.markdownComments"
        ]);

        const previewOnly = filterProjectSettingItems(
          eligibleItems,
          "preview",
          "",
          translateJa
        );
        expect(previewOnly.map((i) => i.key)).toEqual(["preview.renderer"]);

        const filesOnly = filterProjectSettingItems(
          eligibleItems,
          "files",
          "",
          translateJa
        );
        expect(filesOnly.map((i) => i.key)).toEqual(["files.newFile.lineEnding"]);
      });

      it("filters by search query alone when category is 'all'", () => {
        const fontMatches = filterProjectSettingItems(
          eligibleItems,
          "all",
          "font",
          translateJa
        );
        expect(fontMatches.map((i) => i.key)).toEqual(["editor.fontFamily"]);
      });

      it("combines category and query using AND logic", () => {
        expect(
          filterProjectSettingItems(
            eligibleItems,
            "editor",
            "font",
            translateJa
          ).map((i) => i.key)
        ).toEqual(["editor.fontFamily"]);

        expect(
          filterProjectSettingItems(
            eligibleItems,
            "preview",
            "font",
            translateJa
          )
        ).toEqual([]);
      });
    });

    describe("scope boundaries preservation", () => {
      it("preserves applicationWithProjectOverride and projectOnly in isProjectSettingsScope", () => {
        expect(isProjectSettingsScope("applicationWithProjectOverride")).toBe(true);
        expect(isProjectSettingsScope("projectOnly")).toBe(true);
        expect(isProjectSettingsScope("applicationOnly")).toBe(false);
      });

      it("limits isProjectOverrideEligibleScope strictly to applicationWithProjectOverride", () => {
        expect(
          isProjectOverrideEligibleScope("applicationWithProjectOverride")
        ).toBe(true);
        expect(isProjectOverrideEligibleScope("projectOnly")).toBe(false);
        expect(isProjectOverrideEligibleScope("applicationOnly")).toBe(false);
      });
    });
  });

  function changeInputValue(input: HTMLInputElement, value: string): void {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    nativeSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  describe("UI integration and interactions", () => {
    it("renders search box and category list in initial state", () => {
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={undefined}
            applicationSettings={{ editor: { fontFamily: "Consolas" } }}
            isReadOnly={false}
            onSaveSettings={vi.fn()}
          />
        );
      });

      const searchInput = container.querySelector<HTMLInputElement>(
        "input.settingsSearchInput"
      );
      expect(searchInput).not.toBeNull();
      expect(searchInput?.placeholder).toBe(
        translateJa("settings.search.placeholder")
      );
      expect(searchInput?.getAttribute("aria-label")).toBe(
        translateJa("settings.search.label")
      );

      const searchIconEl = container.querySelector(".settingsSearchIcon");
      expect(searchIconEl).not.toBeNull();

      const categoryButtons = Array.from(
        container.querySelectorAll<HTMLButtonElement>("button.settingsCategoryButton")
      );
      expect(categoryButtons).toHaveLength(5);
      expect(categoryButtons[0].textContent).toBe("すべて");
      expect(categoryButtons[1].textContent).toBe("エディタ");
      expect(categoryButtons[2].textContent).toBe("プレビュー");
      expect(categoryButtons[3].textContent).toBe("文書マップ");
      expect(categoryButtons[4].textContent).toBe("ファイル");

      expect(
        categoryButtons[0].classList.contains("settingsCategoryButtonSelected")
      ).toBe(true);
      expect(categoryButtons[0].getAttribute("aria-current")).toBe("true");
      expect(
        categoryButtons[1].classList.contains("settingsCategoryButtonSelected")
      ).toBe(false);

      const headings = Array.from(
        container.querySelectorAll(".settingsItemPaneHeading")
      ).map((h) => h.textContent);
      expect(headings).toEqual([
        "エディタ",
        "プレビュー",
        "文書マップ",
        "ファイル"
      ]);

      const itemKeys = Array.from(
        container.querySelectorAll(".settingsItemKey")
      ).map((k) => k.textContent);
      expect(itemKeys).toEqual([
        "editor.fontFamily",
        "editor.paragraphIndent.excludeLeadingCharacters",
        "editor.lineEnding.expected",
        "editor.characterCount.exclude.whitespace",
        "editor.characterCount.exclude.lineBreaks",
        "editor.characterCount.exclude.headings",
        "editor.characterCount.exclude.markdownSyntax",
        "editor.characterCount.exclude.markdownComments",
        "preview.renderer",
        "documentMap.dialogueDelimiterPairs",
        "files.newFile.lineEnding"
      ]);
    });

    it("filters items when clicking a category button", () => {
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={undefined}
            applicationSettings={{ editor: { fontFamily: "Consolas" } }}
            isReadOnly={false}
            onSaveSettings={vi.fn()}
          />
        );
      });

      const categoryButtons = Array.from(
        container.querySelectorAll<HTMLButtonElement>("button.settingsCategoryButton")
      );

      // Click "エディタ"
      act(() => {
        categoryButtons[1].click();
      });

      expect(
        categoryButtons[1].classList.contains("settingsCategoryButtonSelected")
      ).toBe(true);
      expect(
        categoryButtons[0].classList.contains("settingsCategoryButtonSelected")
      ).toBe(false);

      let itemKeys = Array.from(
        container.querySelectorAll(".settingsItemKey")
      ).map((k) => k.textContent);
      expect(itemKeys).toEqual([
        "editor.fontFamily",
        "editor.paragraphIndent.excludeLeadingCharacters",
        "editor.lineEnding.expected",
        "editor.characterCount.exclude.whitespace",
        "editor.characterCount.exclude.lineBreaks",
        "editor.characterCount.exclude.headings",
        "editor.characterCount.exclude.markdownSyntax",
        "editor.characterCount.exclude.markdownComments"
      ]);

      // Click "プレビュー"
      act(() => {
        categoryButtons[2].click();
      });

      expect(
        categoryButtons[2].classList.contains("settingsCategoryButtonSelected")
      ).toBe(true);
      itemKeys = Array.from(
        container.querySelectorAll(".settingsItemKey")
      ).map((k) => k.textContent);
      expect(itemKeys).toEqual(["preview.renderer"]);

      // Click "文書マップ"
      act(() => {
        categoryButtons[3].click();
      });

      expect(
        categoryButtons[3].classList.contains("settingsCategoryButtonSelected")
      ).toBe(true);
      itemKeys = Array.from(
        container.querySelectorAll(".settingsItemKey")
      ).map((k) => k.textContent);
      expect(itemKeys).toEqual(["documentMap.dialogueDelimiterPairs"]);

      // Click "ファイル"
      act(() => {
        categoryButtons[4].click();
      });

      expect(
        categoryButtons[4].classList.contains("settingsCategoryButtonSelected")
      ).toBe(true);
      itemKeys = Array.from(
        container.querySelectorAll(".settingsItemKey")
      ).map((k) => k.textContent);
      expect(itemKeys).toEqual(["files.newFile.lineEnding"]);

      // Click "すべて"
      act(() => {
        categoryButtons[0].click();
      });

      expect(
        categoryButtons[0].classList.contains("settingsCategoryButtonSelected")
      ).toBe(true);
      itemKeys = Array.from(
        container.querySelectorAll(".settingsItemKey")
      ).map((k) => k.textContent);
      expect(itemKeys).toEqual([
        "editor.fontFamily",
        "editor.paragraphIndent.excludeLeadingCharacters",
        "editor.lineEnding.expected",
        "editor.characterCount.exclude.whitespace",
        "editor.characterCount.exclude.lineBreaks",
        "editor.characterCount.exclude.headings",
        "editor.characterCount.exclude.markdownSyntax",
        "editor.characterCount.exclude.markdownComments",
        "preview.renderer",
        "documentMap.dialogueDelimiterPairs",
        "files.newFile.lineEnding"
      ]);
    });

    it("filters items when typing in the search input", () => {
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={undefined}
            applicationSettings={{ editor: { fontFamily: "Consolas" } }}
            isReadOnly={false}
            onSaveSettings={vi.fn()}
          />
        );
      });

      const searchInput = container.querySelector<HTMLInputElement>(
        "input.settingsSearchInput"
      )!;

      // Type "font"
      act(() => {
        changeInputValue(searchInput, "font");
      });

      let itemKeys = Array.from(
        container.querySelectorAll(".settingsItemKey")
      ).map((k) => k.textContent);
      expect(itemKeys).toEqual(["editor.fontFamily"]);

      // Type "renderer"
      act(() => {
        changeInputValue(searchInput, "renderer");
      });

      itemKeys = Array.from(
        container.querySelectorAll(".settingsItemKey")
      ).map((k) => k.textContent);
      expect(itemKeys).toEqual(["preview.renderer"]);

      // Type nonexistent query
      act(() => {
        changeInputValue(searchInput, "nonexistent_query");
      });

      itemKeys = Array.from(
        container.querySelectorAll(".settingsItemKey")
      ).map((k) => k.textContent);
      expect(itemKeys).toEqual([]);

      const emptyNotice = container.querySelector(".settingsSearchEmpty");
      expect(emptyNotice).not.toBeNull();
      expect(emptyNotice?.textContent).toBe(
        translateJa("settings.search.empty")
      );

      // Clear search input
      act(() => {
        changeInputValue(searchInput, "");
      });

      itemKeys = Array.from(
        container.querySelectorAll(".settingsItemKey")
      ).map((k) => k.textContent);
      expect(itemKeys).toEqual([
        "editor.fontFamily",
        "editor.paragraphIndent.excludeLeadingCharacters",
        "editor.lineEnding.expected",
        "editor.characterCount.exclude.whitespace",
        "editor.characterCount.exclude.lineBreaks",
        "editor.characterCount.exclude.headings",
        "editor.characterCount.exclude.markdownSyntax",
        "editor.characterCount.exclude.markdownComments",
        "preview.renderer",
        "documentMap.dialogueDelimiterPairs",
        "files.newFile.lineEnding"
      ]);
    });

    it("combines category selection and search query with AND logic", () => {
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={undefined}
            applicationSettings={{ editor: { fontFamily: "Consolas" } }}
            isReadOnly={false}
            onSaveSettings={vi.fn()}
          />
        );
      });

      const searchInput = container.querySelector<HTMLInputElement>(
        "input.settingsSearchInput"
      )!;
      const categoryButtons = Array.from(
        container.querySelectorAll<HTMLButtonElement>("button.settingsCategoryButton")
      );

      // Select "プレビュー" category
      act(() => {
        categoryButtons[2].click();
      });

      // Type "font" into search
      act(() => {
        changeInputValue(searchInput, "font");
      });

      expect(container.querySelectorAll(".settingsItemKey")).toHaveLength(0);
      expect(container.querySelector(".settingsSearchEmpty")?.textContent).toBe(
        translateJa("settings.search.empty")
      );

      // Switch to "エディタ" category while search remains "font"
      act(() => {
        categoryButtons[1].click();
      });

      const itemKeys = Array.from(
        container.querySelectorAll(".settingsItemKey")
      ).map((k) => k.textContent);
      expect(itemKeys).toEqual(["editor.fontFamily"]);
      expect(container.querySelector(".settingsSearchEmpty")).toBeNull();
    });

    it("keeps search input and category buttons enabled in read-only mode", () => {
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={undefined}
            applicationSettings={{ editor: { fontFamily: "Consolas" } }}
            isReadOnly={true}
            onSaveSettings={vi.fn()}
          />
        );
      });

      const searchInput = container.querySelector<HTMLInputElement>(
        "input.settingsSearchInput"
      )!;
      expect(searchInput.disabled).toBe(false);

      const categoryButtons = Array.from(
        container.querySelectorAll<HTMLButtonElement>("button.settingsCategoryButton")
      );
      categoryButtons.forEach((btn) => {
        expect(btn.disabled).toBe(false);
      });

      act(() => {
        categoryButtons[1].click();
      });
      expect(container.querySelectorAll(".settingsItemKey")).toHaveLength(8);

      const settingInput = container.querySelector<HTMLInputElement>(
        "input.settingsTextInput"
      )!;
      expect(settingInput.disabled).toBe(true);
    });

    it("disables search input and category buttons when isSaving is true", () => {
      act(() => {
        root.render(
          <ProjectSettingsPanelView
            translate={translateJa}
            items={[]}
            categories={getEligibleProjectSettingCategories([], translateJa)}
            selectedCategoryId="all"
            onSelectCategory={vi.fn()}
            searchQuery=""
            onSearchQueryChange={vi.fn()}
            isReadOnly={false}
            isSaving={true}
            error={null}
            onReset={vi.fn()}
          />
        );
      });

      const searchInput = container.querySelector<HTMLInputElement>(
        "input.settingsSearchInput"
      )!;
      expect(searchInput.disabled).toBe(true);

      const categoryButtons = Array.from(
        container.querySelectorAll<HTMLButtonElement>("button.settingsCategoryButton")
      );
      categoryButtons.forEach((btn) => {
        expect(btn.disabled).toBe(true);
      });
    });

    it("preserves modified badge and reset capability across filtering operations", () => {
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={{ editor: { fontFamily: "Yu Mincho" } }}
            applicationSettings={{ editor: { fontFamily: "Consolas" } }}
            isReadOnly={false}
            onSaveSettings={vi.fn()}
          />
        );
      });

      expect(
        container.querySelector(".projectSettingModifiedBadge")?.textContent
      ).toBe("変更中");

      const categoryButtons = Array.from(
        container.querySelectorAll<HTMLButtonElement>("button.settingsCategoryButton")
      );

      // Switch to "プレビュー" category (hiding editor setting)
      act(() => {
        categoryButtons[2].click();
      });
      expect(container.querySelectorAll(".projectSettingModifiedBadge")).toHaveLength(0);

      // Switch back to "エディタ" category
      act(() => {
        categoryButtons[1].click();
      });
      expect(
        container.querySelector(".projectSettingModifiedBadge")?.textContent
      ).toBe("変更中");
      expect(container.querySelector(".projectSettingResetButton")).not.toBeNull();
    });

    it("does not invoke onSaveSettings when searching or switching categories", () => {
      const onSaveSettings = vi.fn();
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={undefined}
            applicationSettings={{ editor: { fontFamily: "Consolas" } }}
            isReadOnly={false}
            onSaveSettings={onSaveSettings}
          />
        );
      });

      const searchInput = container.querySelector<HTMLInputElement>(
        "input.settingsSearchInput"
      )!;
      const categoryButtons = Array.from(
        container.querySelectorAll<HTMLButtonElement>("button.settingsCategoryButton")
      );

      act(() => {
        changeInputValue(searchInput, "test");
      });

      act(() => {
        categoryButtons[1].click();
      });

      expect(onSaveSettings).not.toHaveBeenCalled();
    });

    it("saves draft via blur-save when filtering out the edited item (M1 regression)", async () => {
      const onSaveSettings = vi.fn(async () => undefined);
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={undefined}
            applicationSettings={{ editor: { fontFamily: "Consolas" } }}
            isReadOnly={false}
            onSaveSettings={onSaveSettings}
          />
        );
      });

      const textInput = container.querySelector<HTMLInputElement>(
        'input[type="text"]'
      )!;

      // 1. Focus input
      act(() => {
        textInput.focus();
      });

      // 2. Change draft value
      act(() => {
        changeInputValue(textInput, "Yu Mincho");
      });

      expect(onSaveSettings).not.toHaveBeenCalled();

      // 3. User clicks Preview category: focus leaves input (blur) and Editor item is filtered out
      const categoryButtons = Array.from(
        container.querySelectorAll<HTMLButtonElement>("button.settingsCategoryButton")
      );
      const previewButton = categoryButtons[2];

      await act(async () => {
        textInput.blur();
        previewButton.click();
      });

      // 4. Blur-save successfully triggers and persists the draft value
      expect(onSaveSettings).toHaveBeenCalledTimes(1);
      expect(onSaveSettings).toHaveBeenCalledWith({
        set: { "editor.fontFamily": "Yu Mincho" }
      });

      // Confirm the editor item is filtered out and only preview item is visible
      const itemKeys = Array.from(
        container.querySelectorAll(".settingsItemKey")
      ).map((k) => k.textContent);
      expect(itemKeys).toEqual(["preview.renderer"]);
    });
  });
});

describe("ProjectSettingsPanel Slice 7 - Remaining Project Settings scope wiring (#396)", () => {
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

  function changeInputValue(input: HTMLInputElement, value: string): void {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    nativeSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  describe("pure helpers and validation", () => {
    it("validateProjectSettingValue trims editor.fontFamily but preserves spaces and full-width space for editor.paragraphIndent.excludeLeadingCharacters", () => {
      // editor.fontFamily trims
      const fontResult = validateProjectSettingValue(
        "editor.fontFamily",
        "  Yu Mincho  ",
        "Consolas"
      );
      expect(fontResult).toEqual({ ok: true, value: "Yu Mincho" });

      // editor.paragraphIndent.excludeLeadingCharacters preserves full-width space and does NOT trim
      const indentResult = validateProjectSettingValue(
        "editor.paragraphIndent.excludeLeadingCharacters",
        "　「『",
        "「『"
      );
      expect(indentResult).toEqual({ ok: true, value: "　「『" });

      // editor.paragraphIndent.excludeLeadingCharacters accepts empty string ""
      const emptyResult = validateProjectSettingValue(
        "editor.paragraphIndent.excludeLeadingCharacters",
        "",
        "「『"
      );
      expect(emptyResult).toEqual({ ok: true, value: "" });

      // editor.fontFamily rejects empty string
      const emptyFont = validateProjectSettingValue(
        "editor.fontFamily",
        "   ",
        "Consolas"
      );
      expect(emptyFont).toEqual({ ok: false, failure: "emptyString" });
    });

    it("validateProjectSettingValue handles boolean switch values correctly", () => {
      // Same as committed -> undefined (no-op)
      expect(
        validateProjectSettingValue(
          "editor.characterCount.exclude.whitespace",
          true,
          true
        )
      ).toEqual({ ok: true, value: undefined });

      // Different from committed -> returns the boolean value
      expect(
        validateProjectSettingValue(
          "editor.characterCount.exclude.whitespace",
          false,
          true
        )
      ).toEqual({ ok: true, value: false });

      expect(
        validateProjectSettingValue(
          "editor.characterCount.exclude.whitespace",
          true,
          false
        )
      ).toEqual({ ok: true, value: true });
    });

    it("validateProjectSettingValue handles enum values correctly", () => {
      expect(
        validateProjectSettingValue(
          "files.newFile.lineEnding",
          "crlf",
          "lf"
        )
      ).toEqual({ ok: true, value: "crlf" });

      expect(
        validateProjectSettingValue(
          "files.newFile.lineEnding",
          "invalid_ending",
          "lf"
        )
      ).toEqual({ ok: false, failure: "enumValue" });
    });
  });

  describe("switch controls UI and differential behavior", () => {
    it("renders switch control with settingsItemControl wrapper and settingsSwitchInput", () => {
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={undefined}
            applicationSettings={{
              editor: {
                characterCount: {
                  exclude: {
                    whitespace: true,
                    lineBreaks: false,
                    headings: false,
                    markdownSyntax: false,
                    markdownComments: false
                  }
                }
              }
            }}
            isReadOnly={false}
            onSaveSettings={vi.fn()}
          />
        );
      });

      const whitespaceRow = Array.from(
        container.querySelectorAll(".settingsItemRow")
      ).find(
        (r) =>
          r.querySelector(".settingsItemKey")?.textContent ===
          "editor.characterCount.exclude.whitespace"
      )!;
      expect(whitespaceRow).not.toBeNull();

      const switchWrapper = whitespaceRow.querySelector(".settingsItemControl");
      expect(switchWrapper).not.toBeNull();

      const switchInput = switchWrapper?.querySelector<HTMLInputElement>(
        'input.settingsSwitchInput[type="checkbox"]'
      );
      expect(switchInput).not.toBeNull();
      expect(switchInput?.checked).toBe(true);
      expect(switchInput?.disabled).toBe(false);

      // Unmodified row has no modified badge and no reset button
      expect(
        whitespaceRow.querySelector(".projectSettingModifiedBadge")
      ).toBeNull();
      expect(
        whitespaceRow.querySelector(".projectSettingResetButton")
      ).toBeNull();
    });

    it("saves project override as false when inherited value is true (falsy override test)", async () => {
      const onSaveSettings = vi.fn(async () => undefined);
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={undefined}
            applicationSettings={{
              editor: {
                characterCount: {
                  exclude: {
                    whitespace: true,
                    lineBreaks: false,
                    headings: false,
                    markdownSyntax: false,
                    markdownComments: false
                  }
                }
              }
            }}
            isReadOnly={false}
            onSaveSettings={onSaveSettings}
          />
        );
      });

      const whitespaceRow = Array.from(
        container.querySelectorAll(".settingsItemRow")
      ).find(
        (r) =>
          r.querySelector(".settingsItemKey")?.textContent ===
          "editor.characterCount.exclude.whitespace"
      )!;
      const switchInput = whitespaceRow.querySelector<HTMLInputElement>(
        'input.settingsSwitchInput[type="checkbox"]'
      )!;

      await act(async () => {
        switchInput.click();
      });

      expect(onSaveSettings).toHaveBeenCalledTimes(1);
      expect(onSaveSettings).toHaveBeenCalledWith({
        set: { "editor.characterCount.exclude.whitespace": false }
      });
    });

    it("removes project override when switch is toggled back to match application settings", async () => {
      const onSaveSettings = vi.fn(async () => undefined);
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={{
              editor: {
                characterCount: {
                  exclude: {
                    whitespace: false
                  }
                }
              }
            }}
            applicationSettings={{
              editor: {
                characterCount: {
                  exclude: {
                    whitespace: true,
                    lineBreaks: false,
                    headings: false,
                    markdownSyntax: false,
                    markdownComments: false
                  }
                }
              }
            }}
            isReadOnly={false}
            onSaveSettings={onSaveSettings}
          />
        );
      });

      const whitespaceRow = Array.from(
        container.querySelectorAll(".settingsItemRow")
      ).find(
        (r) =>
          r.querySelector(".settingsItemKey")?.textContent ===
          "editor.characterCount.exclude.whitespace"
      )!;

      // Modified badge and reset button are visible
      expect(
        whitespaceRow.querySelector(".projectSettingModifiedBadge")
      ).not.toBeNull();
      const resetBtn = whitespaceRow.querySelector<HTMLButtonElement>(
        ".projectSettingResetButton"
      )!;
      expect(resetBtn).not.toBeNull();

      const switchInput = whitespaceRow.querySelector<HTMLInputElement>(
        'input.settingsSwitchInput[type="checkbox"]'
      )!;
      expect(switchInput.checked).toBe(false);

      // Toggle switch back to true (matching application settings)
      await act(async () => {
        switchInput.click();
      });

      expect(onSaveSettings).toHaveBeenCalledTimes(1);
      expect(onSaveSettings).toHaveBeenCalledWith({
        remove: ["editor.characterCount.exclude.whitespace"]
      });
    });

    it("resets switch override when reset button is clicked", async () => {
      const onSaveSettings = vi.fn(async () => undefined);
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={{
              editor: {
                characterCount: {
                  exclude: {
                    whitespace: false
                  }
                }
              }
            }}
            applicationSettings={{
              editor: {
                characterCount: {
                  exclude: {
                    whitespace: true,
                    lineBreaks: false,
                    headings: false,
                    markdownSyntax: false,
                    markdownComments: false
                  }
                }
              }
            }}
            isReadOnly={false}
            onSaveSettings={onSaveSettings}
          />
        );
      });

      const whitespaceRow = Array.from(
        container.querySelectorAll(".settingsItemRow")
      ).find(
        (r) =>
          r.querySelector(".settingsItemKey")?.textContent ===
          "editor.characterCount.exclude.whitespace"
      )!;
      const resetBtn = whitespaceRow.querySelector<HTMLButtonElement>(
        ".projectSettingResetButton"
      )!;

      await act(async () => {
        resetBtn.click();
      });

      expect(onSaveSettings).toHaveBeenCalledTimes(1);
      expect(onSaveSettings).toHaveBeenCalledWith({
        remove: ["editor.characterCount.exclude.whitespace"]
      });
    });

    it("disables switch control and reset button in read-only mode", () => {
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={{
              editor: {
                characterCount: {
                  exclude: {
                    whitespace: false
                  }
                }
              }
            }}
            applicationSettings={{
              editor: {
                characterCount: {
                  exclude: {
                    whitespace: true,
                    lineBreaks: false,
                    headings: false,
                    markdownSyntax: false,
                    markdownComments: false
                  }
                }
              }
            }}
            isReadOnly={true}
            onSaveSettings={vi.fn()}
          />
        );
      });

      const whitespaceRow = Array.from(
        container.querySelectorAll(".settingsItemRow")
      ).find(
        (r) =>
          r.querySelector(".settingsItemKey")?.textContent ===
          "editor.characterCount.exclude.whitespace"
      )!;

      const switchInput = whitespaceRow.querySelector<HTMLInputElement>(
        'input.settingsSwitchInput[type="checkbox"]'
      )!;
      expect(switchInput.disabled).toBe(true);

      const resetBtn = whitespaceRow.querySelector<HTMLButtonElement>(
        ".projectSettingResetButton"
      )!;
      expect(resetBtn.disabled).toBe(true);
      expect(
        whitespaceRow.querySelector(".projectSettingModifiedBadge")
      ).not.toBeNull();
    });
  });

  describe("paragraph indent excludeLeadingCharacters UI and differential behavior", () => {
    it("allows overriding non-empty application value with empty string '' and preserves full-width spaces", async () => {
      const onSaveSettings = vi.fn(async () => undefined);
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={undefined}
            applicationSettings={{
              editor: {
                paragraphIndent: {
                  excludeLeadingCharacters: "「『（【"
                }
              }
            }}
            isReadOnly={false}
            onSaveSettings={onSaveSettings}
          />
        );
      });

      const indentRow = Array.from(
        container.querySelectorAll(".settingsItemRow")
      ).find(
        (r) =>
          r.querySelector(".settingsItemKey")?.textContent ===
          "editor.paragraphIndent.excludeLeadingCharacters"
      )!;
      const textInput = indentRow.querySelector<HTMLInputElement>(
        "input.settingsTextInput"
      )!;
      expect(textInput.value).toBe("「『（【");

      // Edit to empty string ""
      act(() => {
        textInput.focus();
        changeInputValue(textInput, "");
      });

      await act(async () => {
        textInput.blur();
      });

      expect(onSaveSettings).toHaveBeenCalledTimes(1);
      expect(onSaveSettings).toHaveBeenCalledWith({
        set: { "editor.paragraphIndent.excludeLeadingCharacters": "" }
      });
    });

    it("preserves full-width space without trimming when saving editor.paragraphIndent.excludeLeadingCharacters", async () => {
      const onSaveSettings = vi.fn(async () => undefined);
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={undefined}
            applicationSettings={{
              editor: {
                paragraphIndent: {
                  excludeLeadingCharacters: ""
                }
              }
            }}
            isReadOnly={false}
            onSaveSettings={onSaveSettings}
          />
        );
      });

      const indentRow = Array.from(
        container.querySelectorAll(".settingsItemRow")
      ).find(
        (r) =>
          r.querySelector(".settingsItemKey")?.textContent ===
          "editor.paragraphIndent.excludeLeadingCharacters"
      )!;
      const textInput = indentRow.querySelector<HTMLInputElement>(
        "input.settingsTextInput"
      )!;

      // Type full-width space with brackets
      act(() => {
        textInput.focus();
        changeInputValue(textInput, "　「『");
      });

      await act(async () => {
        textInput.blur();
      });

      expect(onSaveSettings).toHaveBeenCalledTimes(1);
      expect(onSaveSettings).toHaveBeenCalledWith({
        set: { "editor.paragraphIndent.excludeLeadingCharacters": "　「『" }
      });
    });
  });

  describe("line ending select controls and category filtering", () => {
    it("handles files.newFile.lineEnding select change and differential reset", async () => {
      const onSaveSettings = vi.fn(async () => undefined);
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={undefined}
            applicationSettings={{
              files: {
                newFile: {
                  lineEnding: "lf",
                  encoding: "utf8"
                }
              }
            }}
            isReadOnly={false}
            onSaveSettings={onSaveSettings}
          />
        );
      });

      const filesRow = Array.from(
        container.querySelectorAll(".settingsItemRow")
      ).find(
        (r) =>
          r.querySelector(".settingsItemKey")?.textContent ===
          "files.newFile.lineEnding"
      )!;
      const select = filesRow.querySelector<HTMLSelectElement>("select.settingsSelect")!;
      expect(select.value).toBe("lf");

      // Change to crlf
      await act(async () => {
        select.value = "crlf";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });

      expect(onSaveSettings).toHaveBeenCalledTimes(1);
      expect(onSaveSettings).toHaveBeenCalledWith({
        set: { "files.newFile.lineEnding": "crlf" }
      });
    });

    it("filters to 'files' category and displays only files.newFile.lineEnding", () => {
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={undefined}
            applicationSettings={{
              files: {
                newFile: {
                  lineEnding: "lf",
                  encoding: "utf8"
                }
              }
            }}
            isReadOnly={false}
            onSaveSettings={vi.fn()}
          />
        );
      });

      const categoryButtons = Array.from(
        container.querySelectorAll<HTMLButtonElement>("button.settingsCategoryButton")
      );
      const filesButton = categoryButtons.find(
        (b) => b.textContent === "ファイル"
      )!;
      expect(filesButton).not.toBeNull();

      act(() => {
        filesButton.click();
      });

      const visibleKeys = Array.from(
        container.querySelectorAll(".settingsItemKey")
      ).map((k) => k.textContent);
      expect(visibleKeys).toEqual(["files.newFile.lineEnding"]);
    });
  });

  describe("documentMap.dialogueDelimiterPairs UI and differential behavior (#396 Slice 7 Addendum)", () => {
    it("renders DialogueDelimiterPairsEditor with inherited application pairs when no project override exists", () => {
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={undefined}
            applicationSettings={{
              documentMap: {
                ...defaultDocumentMapSettings(),
                dialogueDelimiterPairs: [
                  { open: "「", close: "」", color: "#e06c75" }
                ]
              }
            }}
            isReadOnly={false}
            onSaveSettings={vi.fn()}
          />
        );
      });

      const docMapRow = Array.from(
        container.querySelectorAll(".settingsItemRow")
      ).find(
        (r) =>
          r.querySelector(".settingsItemKey")?.textContent ===
          "documentMap.dialogueDelimiterPairs"
      )!;
      expect(docMapRow).not.toBeNull();

      // No modified badge or reset button initially:
      expect(
        docMapRow.querySelector(".projectSettingModifiedBadge")
      ).toBeNull();
      expect(
        docMapRow.querySelector(".projectSettingResetButton")
      ).toBeNull();

      // Editor component rendered with 1 pair
      const pairRows = docMapRow.querySelectorAll(
        ".documentMapSettingsDialoguePairRow"
      );
      expect(pairRows).toHaveLength(1);
      const preview = pairRows[0].querySelector(
        ".documentMapSettingsDialoguePairPreview"
      );
      expect(preview?.textContent).toBe("「これが会話文です」");
    });

    it("displays [↺] [変更中] when project dialogue pairs differ from application settings", () => {
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={{
              documentMap: {
                dialogueDelimiterPairs: [
                  { open: "“", close: "”", color: "#61afef" }
                ]
              }
            }}
            applicationSettings={{
              documentMap: {
                ...defaultDocumentMapSettings(),
                dialogueDelimiterPairs: [
                  { open: "「", close: "」", color: "#e06c75" }
                ]
              }
            }}
            isReadOnly={false}
            onSaveSettings={vi.fn()}
          />
        );
      });

      const docMapRow = Array.from(
        container.querySelectorAll(".settingsItemRow")
      ).find(
        (r) =>
          r.querySelector(".settingsItemKey")?.textContent ===
          "documentMap.dialogueDelimiterPairs"
      )!;

      expect(
        docMapRow.querySelector(".projectSettingModifiedBadge")
      ).not.toBeNull();
      expect(
        docMapRow.querySelector(".projectSettingResetButton")
      ).not.toBeNull();
    });

    it("saves modified pairs via onSaveSettings with set request", async () => {
      const onSaveSettings = vi.fn(async () => undefined);
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={undefined}
            applicationSettings={{
              documentMap: {
                ...defaultDocumentMapSettings(),
                dialogueDelimiterPairs: [
                  { open: "「", close: "」", color: "#e06c75" }
                ]
              }
            }}
            isReadOnly={false}
            onSaveSettings={onSaveSettings}
          />
        );
      });

      const docMapRow = Array.from(
        container.querySelectorAll(".settingsItemRow")
      ).find(
        (r) =>
          r.querySelector(".settingsItemKey")?.textContent ===
          "documentMap.dialogueDelimiterPairs"
      )!;

      // Click "Add dialogue pair" button
      const addBtn = docMapRow.querySelector<HTMLButtonElement>(
        ".documentMapSettingsAddPair"
      )!;
      act(() => {
        addBtn.click();
      });

      const inputs = container.querySelectorAll<HTMLInputElement>(
        ".dialogueDelimiterPairDialogInput"
      );
      expect(inputs).toHaveLength(2);
      changeInputValue(inputs[0], "『");
      changeInputValue(inputs[1], "』");

      await act(async () => {
        container
          .querySelector<HTMLButtonElement>(
            ".dialogueDelimiterPairDialog .appDialogButton-confirm"
          )
          ?.click();
      });

      expect(onSaveSettings).toHaveBeenCalledTimes(1);
      expect(onSaveSettings).toHaveBeenCalledWith({
        set: {
          "documentMap.dialogueDelimiterPairs": [
            { open: "「", close: "」", color: "#e06c75" },
            {
              open: "『",
              close: "』",
              color: DOCUMENT_MAP_DEFAULT_DIALOGUE_COLOR
            }
          ]
        }
      });
    });

    it("sends remove request when reset button is clicked", async () => {
      const onSaveSettings = vi.fn(async () => undefined);
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={{
              documentMap: {
                dialogueDelimiterPairs: [
                  { open: "“", close: "”", color: "#61afef" }
                ]
              }
            }}
            applicationSettings={{
              documentMap: {
                ...defaultDocumentMapSettings(),
                dialogueDelimiterPairs: [
                  { open: "「", close: "」", color: "#e06c75" }
                ]
              }
            }}
            isReadOnly={false}
            onSaveSettings={onSaveSettings}
          />
        );
      });

      const docMapRow = Array.from(
        container.querySelectorAll(".settingsItemRow")
      ).find(
        (r) =>
          r.querySelector(".settingsItemKey")?.textContent ===
          "documentMap.dialogueDelimiterPairs"
      )!;

      const resetBtn = docMapRow.querySelector<HTMLButtonElement>(
        ".projectSettingResetButton"
      )!;
      await act(async () => {
        resetBtn.click();
      });

      expect(onSaveSettings).toHaveBeenCalledTimes(1);
      expect(onSaveSettings).toHaveBeenCalledWith({
        remove: ["documentMap.dialogueDelimiterPairs"]
      });
    });

    it("disables dialogue pairs editor and reset button when isReadOnly is true", () => {
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={{
              documentMap: {
                dialogueDelimiterPairs: [
                  { open: "“", close: "”", color: "#61afef" }
                ]
              }
            }}
            applicationSettings={{
              documentMap: {
                ...defaultDocumentMapSettings(),
                dialogueDelimiterPairs: [
                  { open: "「", close: "」", color: "#e06c75" }
                ]
              }
            }}
            isReadOnly={true}
            onSaveSettings={vi.fn()}
          />
        );
      });

      const docMapRow = Array.from(
        container.querySelectorAll(".settingsItemRow")
      ).find(
        (r) =>
          r.querySelector(".settingsItemKey")?.textContent ===
          "documentMap.dialogueDelimiterPairs"
      )!;

      const resetBtn = docMapRow.querySelector<HTMLButtonElement>(
        ".projectSettingResetButton"
      )!;
      expect(resetBtn.disabled).toBe(true);

      const addBtn = docMapRow.querySelector<HTMLButtonElement>(
        ".documentMapSettingsAddPair"
      )!;
      expect(addBtn.disabled).toBe(true);

      const editBtns = docMapRow.querySelectorAll<HTMLButtonElement>(
        ".documentMapSettingsDialoguePairEdit"
      );
      editBtns.forEach((btn) => {
        expect(btn.disabled).toBe(true);
      });

      const deleteBtns = docMapRow.querySelectorAll<HTMLButtonElement>(
        ".documentMapSettingsDialoguePairDelete"
      );
      deleteBtns.forEach((btn) => {
        expect(btn.disabled).toBe(true);
      });

      const dragHandles = docMapRow.querySelectorAll<HTMLButtonElement>(
        ".glossaryEntryTagAssignmentDragHandle"
      );
      dragHandles.forEach((btn) => {
        expect(btn.disabled).toBe(true);
      });
    });

    it("dialog editing does not trigger save until valid Save button is clicked", async () => {
      const onSaveSettings = vi.fn(async () => undefined);
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={undefined}
            applicationSettings={{
              documentMap: {
                ...defaultDocumentMapSettings(),
                dialogueDelimiterPairs: [
                  { open: "「", close: "」", color: "#e06c75" }
                ]
              }
            }}
            isReadOnly={false}
            onSaveSettings={onSaveSettings}
          />
        );
      });

      const docMapRow = Array.from(
        container.querySelectorAll(".settingsItemRow")
      ).find(
        (r) =>
          r.querySelector(".settingsItemKey")?.textContent ===
          "documentMap.dialogueDelimiterPairs"
      )!;

      const editBtn = docMapRow.querySelector<HTMLButtonElement>(
        ".documentMapSettingsDialoguePairEdit"
      )!;

      act(() => {
        editBtn.click();
      });

      const inputs = container.querySelectorAll<HTMLInputElement>(
        ".dialogueDelimiterPairDialogInput"
      );
      const openInput = inputs[0];

      act(() => {
        changeInputValue(openInput, "“");
      });

      expect(onSaveSettings).not.toHaveBeenCalled();
      expect(openInput.value).toBe("“");

      await act(async () => {
        container
          .querySelector<HTMLButtonElement>(
            ".dialogueDelimiterPairDialog .appDialogButton-confirm"
          )
          ?.click();
      });

      expect(onSaveSettings).toHaveBeenCalledTimes(1);
      expect(onSaveSettings).toHaveBeenCalledWith({
        set: {
          "documentMap.dialogueDelimiterPairs": [
            { open: "“", close: "」", color: "#e06c75" }
          ]
        }
      });
    });

    it("invalid dialog inputs do not save, retain input value, and display error inside dialog until fixed", async () => {
      const onSaveSettings = vi.fn(async () => undefined);
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={undefined}
            applicationSettings={{
              documentMap: {
                ...defaultDocumentMapSettings(),
                dialogueDelimiterPairs: [
                  { open: "「", close: "」", color: "#e06c75" }
                ]
              }
            }}
            isReadOnly={false}
            onSaveSettings={onSaveSettings}
          />
        );
      });

      const docMapRow = Array.from(
        container.querySelectorAll(".settingsItemRow")
      ).find(
        (r) =>
          r.querySelector(".settingsItemKey")?.textContent ===
          "documentMap.dialogueDelimiterPairs"
      )!;

      const editBtn = docMapRow.querySelector<HTMLButtonElement>(
        ".documentMapSettingsDialoguePairEdit"
      )!;

      act(() => {
        editBtn.click();
      });

      const colorInput = container.querySelector<HTMLInputElement>(
        ".dialogueDelimiterPairDialogColorText"
      )!;

      // Type partial invalid hex
      act(() => {
        changeInputValue(colorInput, "#6");
      });

      // Click save with invalid color
      await act(async () => {
        container
          .querySelector<HTMLButtonElement>(
            ".dialogueDelimiterPairDialog .appDialogButton-confirm"
          )
          ?.click();
      });

      expect(onSaveSettings).not.toHaveBeenCalled();
      expect(colorInput.value).toBe("#6");
      const alertEl = container.querySelector<HTMLElement>(
        ".dialogueDelimiterPairDialog .settingsError[role='alert']"
      );
      expect(alertEl).not.toBeNull();
      expect(alertEl?.textContent).toBe(
        translateJa(
          "settings.documentMap.dialogueDelimiterPairs.errorInvalidColor"
        )
      );

      // Fix to valid hex and save
      act(() => {
        changeInputValue(colorInput, "#61afef");
      });

      await act(async () => {
        container
          .querySelector<HTMLButtonElement>(
            ".dialogueDelimiterPairDialog .appDialogButton-confirm"
          )
          ?.click();
      });

      expect(onSaveSettings).toHaveBeenCalledTimes(1);
      expect(onSaveSettings).toHaveBeenCalledWith({
        set: {
          "documentMap.dialogueDelimiterPairs": [
            { open: "「", close: "」", color: "#61afef" }
          ]
        }
      });
      expect(container.querySelector(".dialogueDelimiterPairDialog")).toBeNull();
    });

    it("normalizes color to canonical lowercase 6-digit hex on dialog save", async () => {
      const onSaveSettings = vi.fn(async () => undefined);
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={undefined}
            applicationSettings={{
              documentMap: {
                ...defaultDocumentMapSettings(),
                dialogueDelimiterPairs: [
                  { open: "「", close: "」", color: "#e06c75" }
                ]
              }
            }}
            isReadOnly={false}
            onSaveSettings={onSaveSettings}
          />
        );
      });

      const docMapRow = Array.from(
        container.querySelectorAll(".settingsItemRow")
      ).find(
        (r) =>
          r.querySelector(".settingsItemKey")?.textContent ===
          "documentMap.dialogueDelimiterPairs"
      )!;

      const editBtn = docMapRow.querySelector<HTMLButtonElement>(
        ".documentMapSettingsDialoguePairEdit"
      )!;

      act(() => {
        editBtn.click();
      });

      const colorInput = container.querySelector<HTMLInputElement>(
        ".dialogueDelimiterPairDialogColorText"
      )!;

      act(() => {
        changeInputValue(colorInput, "#FFF");
      });

      await act(async () => {
        container
          .querySelector<HTMLButtonElement>(
            ".dialogueDelimiterPairDialog .appDialogButton-confirm"
          )
          ?.click();
      });

      expect(onSaveSettings).toHaveBeenCalledTimes(1);
      expect(onSaveSettings).toHaveBeenCalledWith({
        set: {
          "documentMap.dialogueDelimiterPairs": [
            { open: "「", close: "」", color: "#ffffff" }
          ]
        }
      });
    });

    it("color swatch change in dialog updates color text input", async () => {
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={undefined}
            applicationSettings={{
              documentMap: {
                ...defaultDocumentMapSettings(),
                dialogueDelimiterPairs: [
                  { open: "「", close: "」", color: "#e06c75" }
                ]
              }
            }}
            isReadOnly={false}
            onSaveSettings={vi.fn()}
          />
        );
      });

      const docMapRow = Array.from(
        container.querySelectorAll(".settingsItemRow")
      ).find(
        (r) =>
          r.querySelector(".settingsItemKey")?.textContent ===
          "documentMap.dialogueDelimiterPairs"
      )!;

      act(() => {
        docMapRow
          .querySelector<HTMLButtonElement>(
            ".documentMapSettingsDialoguePairEdit"
          )
          ?.click();
      });

      const swatchInput = container.querySelector<HTMLInputElement>(
        ".dialogueDelimiterPairDialogColorSwatch"
      )!;
      const colorTextInput = container.querySelector<HTMLInputElement>(
        ".dialogueDelimiterPairDialogColorText"
      )!;

      act(() => {
        changeInputValue(swatchInput, "#98c379");
      });

      expect(colorTextInput.value).toBe("#98c379");
    });

    it("reordering pairs commits immediately and preserves order", async () => {
      const onSaveSettings = vi.fn(async () => undefined);
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={undefined}
            applicationSettings={{
              documentMap: {
                ...defaultDocumentMapSettings(),
                dialogueDelimiterPairs: [
                  { open: "「", close: "」", color: "#e06c75" },
                  { open: "『", close: "』", color: "#61afef" }
                ]
              }
            }}
            isReadOnly={false}
            onSaveSettings={onSaveSettings}
          />
        );
      });

      const docMapRow = Array.from(
        container.querySelectorAll(".settingsItemRow")
      ).find(
        (r) =>
          r.querySelector(".settingsItemKey")?.textContent ===
          "documentMap.dialogueDelimiterPairs"
      )!;

      const dragHandles = docMapRow.querySelectorAll<HTMLButtonElement>(
        ".glossaryEntryTagAssignmentDragHandle"
      );
      expect(dragHandles).toHaveLength(2);

      await act(async () => {
        dragHandles[0].dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
        );
      });

      expect(onSaveSettings).toHaveBeenCalledTimes(1);
      expect(onSaveSettings).toHaveBeenCalledWith({
        set: {
          "documentMap.dialogueDelimiterPairs": [
            { open: "『", close: "』", color: "#61afef" },
            { open: "「", close: "」", color: "#e06c75" }
          ]
        }
      });
    });

    it("operations while save is in flight are disabled until save completes", async () => {
      let resolveFirstSave!: () => void;
      const deferredSave = new Promise<void>((resolve) => {
        resolveFirstSave = resolve;
      });
      const onSaveSettings = vi
        .fn()
        .mockImplementationOnce(() => deferredSave)
        .mockImplementationOnce(() => Promise.resolve());

      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={undefined}
            applicationSettings={{
              documentMap: {
                ...defaultDocumentMapSettings(),
                dialogueDelimiterPairs: [
                  { open: "「", close: "」", color: "#e06c75" },
                  { open: "『", close: "』", color: "#61afef" },
                  { open: "“", close: "”", color: "#98c379" }
                ]
              }
            }}
            isReadOnly={false}
            onSaveSettings={onSaveSettings}
          />
        );
      });

      const docMapRow = Array.from(
        container.querySelectorAll(".settingsItemRow")
      ).find(
        (r) =>
          r.querySelector(".settingsItemKey")?.textContent ===
          "documentMap.dialogueDelimiterPairs"
      )!;

      const deleteBtns = docMapRow.querySelectorAll<HTMLButtonElement>(
        ".documentMapSettingsDialoguePairDelete"
      );

      // Click delete first time
      await act(async () => {
        deleteBtns[0].click();
      });

      expect(onSaveSettings).toHaveBeenCalledTimes(1);

      // Controls are disabled while save is in flight
      expect(deleteBtns[1].disabled).toBe(true);

      // Resolve first save
      await act(async () => {
        resolveFirstSave();
      });

      // Controls re-enabled after save completes
      expect(deleteBtns[1].disabled).toBe(false);
    });

    it("empty array [] round-trip: deleting all pairs saves empty array override", async () => {
      const onSaveSettings = vi.fn(async () => undefined);
      act(() => {
        root.render(
          <ProjectSettingsPanel
            translate={translateJa}
            projectSettings={undefined}
            applicationSettings={{
              documentMap: {
                ...defaultDocumentMapSettings(),
                dialogueDelimiterPairs: [
                  { open: "「", close: "」", color: "#e06c75" }
                ]
              }
            }}
            isReadOnly={false}
            onSaveSettings={onSaveSettings}
          />
        );
      });

      const docMapRow = Array.from(
        container.querySelectorAll(".settingsItemRow")
      ).find(
        (r) =>
          r.querySelector(".settingsItemKey")?.textContent ===
          "documentMap.dialogueDelimiterPairs"
      )!;

      const deleteBtn = docMapRow.querySelector<HTMLButtonElement>(
        ".documentMapSettingsDialoguePairDelete"
      )!;

      await act(async () => {
        deleteBtn.click();
      });

      expect(onSaveSettings).toHaveBeenCalledTimes(1);
      expect(onSaveSettings).toHaveBeenCalledWith({
        set: {
          "documentMap.dialogueDelimiterPairs": []
        }
      });
    });

    it("Test 1: same-Project save completion does not overwrite open dialog draft", async () => {
      let currentProjectSettings: ProjectSettings | undefined = undefined;
      const onSaveSettings = vi.fn(async () => undefined);

      const renderPanel = () => {
        root.render(
          <ProjectSettingsPanel
            key="project-a"
            translate={translateJa}
            projectSettings={currentProjectSettings}
            applicationSettings={{
              documentMap: {
                ...defaultDocumentMapSettings(),
                dialogueDelimiterPairs: [
                  { open: "「", close: "」", color: "#e06c75" }
                ]
              }
            }}
            isReadOnly={false}
            onSaveSettings={onSaveSettings}
          />
        );
      };

      // 1. Initial mount
      act(() => {
        renderPanel();
      });

      const getDocMapRow = () =>
        Array.from(container.querySelectorAll(".settingsItemRow")).find(
          (r) =>
            r.querySelector(".settingsItemKey")?.textContent ===
            "documentMap.dialogueDelimiterPairs"
        )!;

      // 2. User opens edit dialog on first pair and types -> draft B
      const editBtn = getDocMapRow().querySelector<HTMLButtonElement>(
        ".documentMapSettingsDialoguePairEdit"
      )!;
      act(() => {
        editBtn.click();
      });

      const inputs = container.querySelectorAll<HTMLInputElement>(
        ".dialogueDelimiterPairDialogInput"
      );
      const openInput = inputs[0];

      act(() => {
        changeInputValue(openInput, "“");
      });
      expect(openInput.value).toBe("“");

      // 3. Parent updates unrelated projectSettings props and rerenders
      currentProjectSettings = {
        editor: {
          fontFamily: "Courier"
        }
      } as any;
      act(() => {
        renderPanel();
      });

      // 4. Confirm draft B remains in dialog
      const refreshedInputs = container.querySelectorAll<HTMLInputElement>(
        ".dialogueDelimiterPairDialogInput"
      );
      expect(refreshedInputs[0].value).toBe("“");

      // 5. Save commits draft B
      await act(async () => {
        container
          .querySelector<HTMLButtonElement>(
            ".dialogueDelimiterPairDialog .appDialogButton-confirm"
          )
          ?.click();
      });

      expect(onSaveSettings).toHaveBeenCalledTimes(1);
      expect(onSaveSettings).toHaveBeenLastCalledWith({
        set: {
          "documentMap.dialogueDelimiterPairs": [
            { open: "“", close: "」", color: "#e06c75" }
          ]
        }
      });
    });

    it("Test 2: dialog uncommitted draft does not leak on Cancel", async () => {
      const onSaveSettings = vi.fn(async () => undefined);

      act(() => {
        root.render(
          <ProjectSettingsPanel
            key="project-a"
            translate={translateJa}
            projectSettings={undefined}
            applicationSettings={{
              documentMap: {
                ...defaultDocumentMapSettings(),
                dialogueDelimiterPairs: [
                  { open: "「", close: "」", color: "#e06c75" }
                ]
              }
            }}
            isReadOnly={false}
            onSaveSettings={onSaveSettings}
          />
        );
      });

      const docMapRow = Array.from(
        container.querySelectorAll(".settingsItemRow")
      ).find(
        (r) =>
          r.querySelector(".settingsItemKey")?.textContent ===
          "documentMap.dialogueDelimiterPairs"
      )!;

      const editBtn = docMapRow.querySelector<HTMLButtonElement>(
        ".documentMapSettingsDialoguePairEdit"
      )!;

      // 1. Open edit dialog
      act(() => {
        editBtn.click();
      });

      const inputs = container.querySelectorAll<HTMLInputElement>(
        ".dialogueDelimiterPairDialogInput"
      );
      expect(inputs[0].value).toBe("「");

      // 2. Type change
      act(() => {
        changeInputValue(inputs[0], "“");
      });
      expect(inputs[0].value).toBe("“");

      // 3. Cancel dialog
      act(() => {
        container
          .querySelector<HTMLButtonElement>(
            ".dialogueDelimiterPairDialog .appDialogButton-cancel"
          )
          ?.click();
      });

      // 4. No save occurred, dialog closed, original preview preserved
      expect(onSaveSettings).not.toHaveBeenCalled();
      expect(container.querySelector(".dialogueDelimiterPairDialog")).toBeNull();
      const preview = docMapRow.querySelector(
        ".documentMapSettingsDialoguePairPreview"
      );
      expect(preview?.textContent).toBe("「これが会話文です」");
    });

    it("Test 3: Project switch clears old draft and avoids cross-project save contamination", async () => {
      interface ProjectFixture {
        activeProjectFilePath: string;
        settings?: any;
      }

      const projectA: ProjectFixture = {
        activeProjectFilePath: "/workspace/proj-a/pergamum.json",
        settings: {
          documentMap: {
            dialogueDelimiterPairs: [
              { open: "“", close: "”", color: "#e06c75" }
            ]
          }
        }
      };

      const projectB: ProjectFixture = {
        activeProjectFilePath: "/workspace/proj-b/pergamum.json",
        settings: {
          documentMap: {
            dialogueDelimiterPairs: [
              { open: "「", close: "」", color: "#98c379" }
            ]
          }
        }
      };

      const onSaveSettings = vi.fn(async () => undefined);

      function ProjectHarness({ project }: { project: ProjectFixture }) {
        return (
          <ProjectSettingsPanel
            key={project.activeProjectFilePath}
            translate={translateJa}
            projectSettings={project.settings}
            applicationSettings={{
              documentMap: {
                ...defaultDocumentMapSettings(),
                dialogueDelimiterPairs: [
                  { open: "（", close: "）", color: "#61afef" }
                ]
              }
            }}
            isReadOnly={false}
            onSaveSettings={onSaveSettings}
          />
        );
      }

      const getDocMapRow = () =>
        Array.from(container.querySelectorAll(".settingsItemRow")).find(
          (r) =>
            r.querySelector(".settingsItemKey")?.textContent ===
            "documentMap.dialogueDelimiterPairs"
        )!;

      // 1. Mount Project A
      act(() => {
        root.render(<ProjectHarness project={projectA} />);
      });

      let preview = getDocMapRow().querySelector(
        ".documentMapSettingsDialoguePairPreview"
      );
      expect(preview?.textContent).toBe("“これが会話文です”");

      // 2. Open dialog and type in Project A to create an uncommitted draft
      act(() => {
        getDocMapRow()
          .querySelector<HTMLButtonElement>(
            ".documentMapSettingsDialoguePairEdit"
          )
          ?.click();
      });
      const openInput = container.querySelector<HTMLInputElement>(
        ".dialogueDelimiterPairDialogInput"
      )!;
      act(() => {
        changeInputValue(openInput, "«");
      });
      expect(openInput.value).toBe("«");

      // 3. Switch to Project B while dialog is open in Project A
      act(() => {
        root.render(<ProjectHarness project={projectB} />);
      });

      // 4. In Project B, Project A's draft dialog must NOT be open; Project B's committed pairs must be shown
      expect(container.querySelector(".dialogueDelimiterPairDialog")).toBeNull();
      preview = getDocMapRow().querySelector(
        ".documentMapSettingsDialoguePairPreview"
      );
      expect(preview?.textContent).toBe("「これが会話文です」");

      expect(onSaveSettings).not.toHaveBeenCalled();
    });

    it("Test 4: App.tsx renders ProjectSettingsPanel keyed by project activeProjectFilePath", () => {
      const appTsxPath = path.resolve(__dirname, "../../src/renderer/App.tsx");
      const appTsxContent = readFileSync(appTsxPath, "utf8");

      expect(appTsxContent).toMatch(
        /<ProjectSettingsPanel\s+key=\{project\?\.activeProjectFilePath\s*\?\?\s*["']no-project["']\}/
      );
    });
  });
});
