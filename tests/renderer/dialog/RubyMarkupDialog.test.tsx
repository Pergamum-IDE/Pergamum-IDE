// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jaTranslations } from "../../../src/shared/i18n/ja";
import {
  RubyMarkupDialog,
  type RubyMarkupDialogProps
} from "../../../src/renderer/dialog/RubyMarkupDialog";

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

function renderDialog(props: Partial<RubyMarkupDialogProps> = {}): void {
  const fullProps: RubyMarkupDialogProps = {
    isOpen: true,
    selectedText: "漢字",
    initialRule: "aozora",
    translate: mockTranslate,
    onApply: vi.fn(),
    onClose: vi.fn(),
    ...props
  };
  act(() => {
    root.render(React.createElement(RubyMarkupDialog, fullProps));
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

describe("RubyMarkupDialog", () => {
  it("renders null when isOpen is false", () => {
    renderDialog({ isOpen: false });
    expect(container.firstElementChild).toBeNull();
  });

  it("renders dialog when isOpen is true with selected text and initial rule", () => {
    renderDialog({ isOpen: true, selectedText: "漢字" });
    expect(container.textContent).toContain("選択範囲にルビ");
    expect(container.textContent).toContain("漢字");
    expect(container.textContent).toContain("0 / 50");
  });

  it("disables insert button when ruby text is empty", () => {
    renderDialog({ isOpen: true, selectedText: "漢字" });
    const confirmButton = container.querySelector<HTMLButtonElement>(".appDialogButton-confirm")!;
    expect(confirmButton.disabled).toBe(true);
  });

  it("enables insert button and shows previews when valid ruby text is entered", () => {
    renderDialog({ isOpen: true, selectedText: "漢字" });
    const textInput = container.querySelector<HTMLInputElement>("input[type='text']")!;
    setInputValue(textInput, "かんじ");

    expect(container.textContent).toContain("3 / 50");
    expect(container.textContent).toContain("｜漢字《かんじ》");

    const rubyEl = container.querySelector("ruby");
    expect(rubyEl).not.toBeNull();
    expect(rubyEl?.querySelector("rt")?.textContent).toBe("かんじ");

    const confirmButton = container.querySelector<HTMLButtonElement>(".appDialogButton-confirm")!;
    expect(confirmButton.disabled).toBe(false);
  });

  it("shows error note and disables insert button on invalid ruby text (e.g. contains forbidden char)", () => {
    renderDialog({ isOpen: true, selectedText: "漢字" });
    const textInput = container.querySelector<HTMLInputElement>("input[type='text']")!;
    setInputValue(textInput, "かん《じ");

    expect(container.textContent).toContain("ルビは改行・《・》・｜を含まない1〜50文字で入力してください。");
    const confirmButton = container.querySelector<HTMLButtonElement>(".appDialogButton-confirm")!;
    expect(confirmButton.disabled).toBe(true);
  });

  it("calls onApply and onClose when form is submitted with valid ruby text", () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    renderDialog({ isOpen: true, selectedText: "漢字", onApply, onClose });

    const textInput = container.querySelector<HTMLInputElement>("input[type='text']")!;
    setInputValue(textInput, "かんじ");

    const confirmButton = container.querySelector<HTMLButtonElement>(".appDialogButton-confirm")!;
    act(() => {
      confirmButton.click();
    });

    expect(onApply).toHaveBeenCalledWith("｜漢字《かんじ》");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when cancel button is clicked", () => {
    const onClose = vi.fn();
    renderDialog({ isOpen: true, selectedText: "漢字", onClose });

    const cancelButton = container.querySelector<HTMLButtonElement>(".appDialogButton-cancel")!;
    act(() => {
      cancelButton.click();
    });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("supports denden rule selection and generates {text|rubyText} syntax", () => {
    const onApply = vi.fn();
    renderDialog({ isOpen: true, selectedText: "電子出版", initialRule: "denden", onApply });

    const ruleSelect = container.querySelector<HTMLSelectElement>("select")!;
    expect(ruleSelect.value).toBe("denden");

    const textInput = container.querySelector<HTMLInputElement>("input[type='text']")!;
    setInputValue(textInput, "でんししゅっぱん");

    expect(container.textContent).toContain("{電子出版|でんししゅっぱん}");

    const confirmButton = container.querySelector<HTMLButtonElement>(".appDialogButton-confirm")!;
    act(() => {
      confirmButton.click();
    });

    expect(onApply).toHaveBeenCalledWith("{電子出版|でんししゅっぱん}");
  });

  it("normalizes full-width ｜ to half-width | on denden ruby insertion", () => {
    const onApply = vi.fn();
    renderDialog({ isOpen: true, selectedText: "漢字", initialRule: "denden", onApply });

    const textInput = container.querySelector<HTMLInputElement>("input[type='text']")!;
    setInputValue(textInput, "かん｜じ");

    expect(container.textContent).toContain("{漢字|かん|じ}");

    const confirmButton = container.querySelector<HTMLButtonElement>(".appDialogButton-confirm")!;
    act(() => {
      confirmButton.click();
    });

    expect(onApply).toHaveBeenCalledWith("{漢字|かん|じ}");
  });

  it("shows denden footer note only when rule is denden", () => {
    renderDialog({ isOpen: true, selectedText: "漢字", initialRule: "aozora" });
    expect(container.textContent).not.toContain("全角の「｜」は半角の「|」に変換して挿入します。");

    const ruleSelect = container.querySelector<HTMLSelectElement>("select")!;
    act(() => {
      ruleSelect.value = "denden";
      ruleSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("全角の「｜」は半角の「|」に変換して挿入します。");
  });
});
