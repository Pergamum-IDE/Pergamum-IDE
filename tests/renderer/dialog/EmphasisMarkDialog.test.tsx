// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jaTranslations } from "../../../src/shared/i18n/ja";
import {
  EmphasisMarkDialog,
  type EmphasisMarkDialogProps
} from "../../../src/renderer/dialog/EmphasisMarkDialog";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function mockTranslate(key: string): string {
  return (jaTranslations as any)[key] ?? key;
}

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
  vi.restoreAllMocks();
});

function renderDialog(props: Partial<EmphasisMarkDialogProps> = {}): void {
  const fullProps: EmphasisMarkDialogProps = {
    isOpen: true,
    selectedText: "選択範囲",
    initialRule: "aozora",
    initialAozoraMark: "sesame",
    initialNarouMarkText: "・",
    translate: mockTranslate,
    onApply: vi.fn(),
    onClose: vi.fn(),
    ...props
  };
  act(() => {
    root.render(React.createElement(EmphasisMarkDialog, fullProps));
  });
}

function setInputValue(input: HTMLInputElement, value: string): void {
  act(() => {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    nativeSetter?.call(input, value);
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("EmphasisMarkDialog", () => {
  it("renders null when isOpen is false", () => {
    renderDialog({ isOpen: false });
    expect(container.firstElementChild).toBeNull();
  });

  it("renders dialog when isOpen is true and shows Aozora preview by default", () => {
    renderDialog({ isOpen: true, selectedText: "選択範囲" });
    expect(container.textContent).toContain("選択範囲に傍点");
    expect(container.textContent).toContain("選択範囲［＃「選択範囲」に傍点］");
  });

  it("updates preview when changing rule to kakuyomu", () => {
    renderDialog({ isOpen: true, selectedText: "選択範囲" });

    const ruleSelect = container.querySelector<HTMLSelectElement>("select")!;
    act(() => {
      ruleSelect.value = "kakuyomu";
      ruleSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("《《選択範囲》》");
    expect(container.textContent).toContain("カクヨム記法では傍点記号を指定できません。");
  });

  it("validates narou mark text and disables insert button on invalid input", () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    renderDialog({
      isOpen: true,
      selectedText: "選択範囲",
      initialRule: "narou",
      initialNarouMarkText: "・",
      onApply,
      onClose
    });

    expect(container.textContent).toContain("｜選《・》｜択《・》｜範《・》｜囲《・》");

    const textInput = container.querySelector<HTMLInputElement>("input[type='text']")!;
    setInputValue(textInput, "《》");

    const confirmButton = container.querySelector<HTMLButtonElement>(
      ".appDialogButton-confirm"
    )!;
    expect(confirmButton.disabled).toBe(true);
    expect(container.textContent).toContain(
      "なろう傍点記号は改行・《・》・｜を含まない1〜8文字で入力してください。"
    );

    setInputValue(textInput, "★");
    expect(confirmButton.disabled).toBe(false);

    act(() => {
      confirmButton.click();
    });

    expect(onApply).toHaveBeenCalledWith("｜選《★》｜択《★》｜範《★》｜囲《★》");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders Aozora dropdown options with symbols and updates preview on sesame and whiteSesame selection", () => {
    const onApply = vi.fn();
    renderDialog({ isOpen: true, selectedText: "用語集", onApply });

    const markSelect = container.querySelectorAll<HTMLSelectElement>("select")[1]!;
    const optionTexts = Array.from(markSelect.options).map((opt) => opt.text);
    expect(optionTexts).toEqual([
      "﹅ 傍点",
      "﹆ 白ゴマ傍点",
      "● 丸傍点",
      "○ 白丸傍点",
      "▲ 黒三角傍点",
      "△ 白三角傍点",
      "◎ 二重丸傍点",
      "◉ 蛇の目傍点",
      "× ばつ傍点"
    ]);

    act(() => {
      markSelect.value = "sesame";
      markSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("用語集［＃「用語集」に傍点］");
    expect(container.textContent).not.toContain("用語集［＃「用語集」にゴマ傍点］");

    act(() => {
      markSelect.value = "circle";
      markSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("用語集［＃「用語集」に丸傍点］");
    expect(container.textContent).not.toContain("黒丸傍点");

    act(() => {
      markSelect.value = "fisheye";
      markSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("用語集［＃「用語集」に蛇の目傍点］");

    act(() => {
      markSelect.value = "saltire";
      markSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("用語集［＃「用語集」にばつ傍点］");

    act(() => {
      markSelect.value = "whiteSesame";
      markSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("用語集［＃「用語集」に白ゴマ傍点］");

    const confirmButton = container.querySelector<HTMLButtonElement>(
      ".appDialogButton-confirm"
    )!;
    act(() => {
      confirmButton.click();
    });

    expect(onApply).toHaveBeenCalledWith("用語集［＃「用語集」に白ゴマ傍点］");
  });

  it("calls onClose when clicking Cancel button", () => {
    const onClose = vi.fn();
    renderDialog({ isOpen: true, onClose });

    const cancelButton = container.querySelector<HTMLButtonElement>(
      ".appDialogButton-cancel"
    )!;
    act(() => {
      cancelButton.click();
    });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
