// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectSettingsPanel } from "../../src/renderer/ProjectSettingsPanel";
import type { Translate } from "../../src/shared/i18n";
import { enTranslations } from "../../src/shared/i18n/en";
import { jaTranslations } from "../../src/shared/i18n/ja";
import { defaultApplicationSettings } from "../../src/shared/settings";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const translateJa: Translate = (key) =>
  jaTranslations[key] ?? enTranslations[key] ?? key;
const translateEn: Translate = (key) =>
  enTranslations[key] ?? jaTranslations[key] ?? key;

function changeInputValue(input: HTMLInputElement, value: string): void {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("ProjectSettingsPanel project name editing (#422)", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
      root = null;
    }

    if (container) {
      container.remove();
      container = null;
    }
  });

  it("shows 'プロジェクト全般' (JA) and 'General' (EN) category button when projectName is provided", () => {
    act(() => {
      root!.render(
        <ProjectSettingsPanel
          translate={translateJa}
          projectName="吾輩は猫である"
          isReadOnly={false}
          projectSettings={{}}
          applicationSettings={defaultApplicationSettings}
          onSaveSettings={vi.fn()}
        />
      );
    });

    const categories = Array.from(
      container!.querySelectorAll(".settingsCategoryButton")
    ).map((btn) => btn.textContent);
    expect(categories).toContain("プロジェクト全般");

    act(() => {
      root!.render(
        <ProjectSettingsPanel
          translate={translateEn}
          projectName="I Am a Cat"
          isReadOnly={false}
          projectSettings={{}}
          applicationSettings={defaultApplicationSettings}
          onSaveSettings={vi.fn()}
        />
      );
    });

    const categoriesEn = Array.from(
      container!.querySelectorAll(".settingsCategoryButton")
    ).map((btn) => btn.textContent);
    expect(categoriesEn).toContain("General");
  });

  it("displays current project name in Project Name input", () => {
    act(() => {
      root!.render(
        <ProjectSettingsPanel
          translate={translateJa}
          projectName="迷子たちと千年領主"
          isReadOnly={false}
          projectSettings={{}}
          applicationSettings={defaultApplicationSettings}
          onSaveSettings={vi.fn()}
        />
      );
    });

    const nameInput = container!.querySelector<HTMLInputElement>(
      "#projectNameInput"
    );
    expect(nameInput).not.toBeNull();
    expect(nameInput!.value).toBe("迷子たちと千年領主");
  });

  it("allows filename-invalid characters and commits on blur or Enter", async () => {
    const onUpdateProjectName = vi.fn(async (newName: string) => ({
      ok: true as const,
      project: {
        name: newName
      } as any
    }));

    act(() => {
      root!.render(
        <ProjectSettingsPanel
          translate={translateJa}
          projectName="Original Name"
          isReadOnly={false}
          projectSettings={{}}
          applicationSettings={defaultApplicationSettings}
          onSaveSettings={vi.fn()}
          onUpdateProjectName={onUpdateProjectName}
        />
      );
    });

    const nameInput = container!.querySelector<HTMLInputElement>(
      "#projectNameInput"
    );
    expect(nameInput).not.toBeNull();

    const complexName = "第一部：迷子たちと千年領主 / Chapter: 1 <Final> ?!";

    // Focus and change
    act(() => {
      nameInput!.focus();
      changeInputValue(nameInput!, complexName);
    });

    // Blur to commit
    await act(async () => {
      nameInput!.blur();
    });

    expect(onUpdateProjectName).toHaveBeenCalledTimes(1);
    expect(onUpdateProjectName).toHaveBeenCalledWith(complexName);
  });

  it("shows validation error for empty or invalid input and does not submit", async () => {
    const onUpdateProjectName = vi.fn(async () => ({
      ok: true as const,
      project: {} as any
    }));

    act(() => {
      root!.render(
        <ProjectSettingsPanel
          translate={translateJa}
          projectName="Original Name"
          isReadOnly={false}
          projectSettings={{}}
          applicationSettings={defaultApplicationSettings}
          onSaveSettings={vi.fn()}
          onUpdateProjectName={onUpdateProjectName}
        />
      );
    });

    const nameInput = container!.querySelector<HTMLInputElement>(
      "#projectNameInput"
    );

    // Focus and type empty input
    act(() => {
      nameInput!.focus();
      changeInputValue(nameInput!, "   ");
    });

    const errorAlert = container!.querySelector(".settingsFieldError");
    expect(errorAlert).not.toBeNull();
    expect(errorAlert!.textContent).toContain("プロジェクト名を入力してください");

    // Attempt blur save
    await act(async () => {
      nameInput!.blur();
    });

    expect(onUpdateProjectName).not.toHaveBeenCalled();
  });

  it("disables project name input when project is read-only", () => {
    act(() => {
      root!.render(
        <ProjectSettingsPanel
          translate={translateJa}
          projectName="Read Only Novel"
          isReadOnly={true}
          projectSettings={{}}
          applicationSettings={defaultApplicationSettings}
          onSaveSettings={vi.fn()}
        />
      );
    });

    const nameInput = container!.querySelector<HTMLInputElement>(
      "#projectNameInput"
    );
    expect(nameInput).not.toBeNull();
    expect(nameInput!.disabled).toBe(true);
  });

  it("displays server error message when rename fails", async () => {
    const onUpdateProjectName = vi.fn(async () => ({
      ok: false as const,
      reason: "updateFailed" as const,
      message: "Database lock contention."
    }));

    act(() => {
      root!.render(
        <ProjectSettingsPanel
          translate={translateJa}
          projectName="Original Name"
          isReadOnly={false}
          projectSettings={{}}
          applicationSettings={defaultApplicationSettings}
          onSaveSettings={vi.fn()}
          onUpdateProjectName={onUpdateProjectName}
        />
      );
    });

    const nameInput = container!.querySelector<HTMLInputElement>(
      "#projectNameInput"
    );

    act(() => {
      nameInput!.focus();
      changeInputValue(nameInput!, "New Target Name");
    });

    await act(async () => {
      nameInput!.blur();
    });

    expect(onUpdateProjectName).toHaveBeenCalledTimes(1);

    const errorAlert = container!.querySelector(".settingsFieldError");
    expect(errorAlert).not.toBeNull();
    expect(errorAlert!.textContent).toContain("Database lock contention.");
  });
});
