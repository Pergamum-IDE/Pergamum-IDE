// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { t, type Language } from "../../src/shared/i18n";
import {
  SaveDestinationDialog,
  SaveDestinationSettingControl,
  type SaveDestinationDialogProps
} from "../../src/renderer/dialog/SaveDestinationDialog";

describe("SaveDestinationDialog and SaveDestinationSettingControl (#407 B2)", () => {
  let container: HTMLDivElement;
  let root: Root;

  const translate = (key: any, values?: any) => t("ja", key, values);

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

  function renderDialog(props: Partial<SaveDestinationDialogProps> = {}) {
    const defaultProps: SaveDestinationDialogProps = {
      isOpen: true,
      initialSaveDirectory: "",
      initialInsertMarkdownLink: true,
      mode: "settings",
      translate,
      onSave: vi.fn(),
      onDismiss: vi.fn(),
      ...props
    };

    act(() => {
      root.render(<SaveDestinationDialog {...defaultProps} />);
    });

    return defaultProps;
  }

  it("returns null when isOpen is false", () => {
    renderDialog({ isOpen: false });
    expect(container.innerHTML).toBe("");
  });

  it("renders dialog title in normal settings mode without paste prompt notice", () => {
    renderDialog({ mode: "settings" });

    expect(container.textContent).toContain("文書添付画像の保存先を指定してください");
    expect(container.querySelector(".saveDestinationDialogNotice")).toBeNull();
  });

  it("renders advisory notice in pastePrompt mode", () => {
    renderDialog({ mode: "pastePrompt" });

    const notice = container.querySelector(".saveDestinationDialogNotice");
    expect(notice).not.toBeNull();
    expect(notice?.textContent).toContain("添付画像の保存先が未指定です");
  });

  it("displays initial values for path input and checkbox", () => {
    renderDialog({
      initialSaveDirectory: "assets/images",
      initialInsertMarkdownLink: false
    });

    const input = container.querySelector<HTMLInputElement>(".saveDestinationDialogInput")!;
    const checkbox = container.querySelector<HTMLInputElement>(".saveDestinationDialogCheckbox")!;

    expect(input.value).toBe("assets/images");
    expect(checkbox.checked).toBe(false);
  });

  it("enables Save button for empty path in settings mode and saves empty string", () => {
    const onSave = vi.fn();
    renderDialog({ mode: "settings", initialSaveDirectory: "   ", onSave });

    const saveButton = container.querySelector<HTMLButtonElement>(".saveDestinationDialogSaveButton")!;
    expect(saveButton.disabled).toBe(false);

    act(() => {
      saveButton.click();
    });

    expect(onSave).toHaveBeenCalledWith({
      saveDirectory: "",
      insertMarkdownLink: true
    });
  });

  it("disables Save button for empty path in pastePrompt mode", () => {
    renderDialog({ mode: "pastePrompt", initialSaveDirectory: "" });

    const saveButton = container.querySelector<HTMLButtonElement>(".saveDestinationDialogSaveButton")!;
    expect(saveButton.disabled).toBe(true);
  });

  it("displays validation error and disables Save button for absolute paths", () => {
    renderDialog({ initialSaveDirectory: "/absolute/path" });

    const saveButton = container.querySelector<HTMLButtonElement>(".saveDestinationDialogSaveButton")!;
    expect(saveButton.disabled).toBe(true);

    const error = container.querySelector(".saveDestinationDialogError");
    expect(error?.textContent).toContain("絶対パスは指定できません");
  });

  it("displays validation error and disables Save button for parent directory traversal", () => {
    renderDialog({ initialSaveDirectory: "../outside" });

    const saveButton = container.querySelector<HTMLButtonElement>(".saveDestinationDialogSaveButton")!;
    expect(saveButton.disabled).toBe(true);

    const error = container.querySelector(".saveDestinationDialogError");
    expect(error?.textContent).toContain("プロジェクト外を指すパスは指定できません");
  });

  it("displays validation error and disables Save button for invalid characters and reserved names", () => {
    renderDialog({ initialSaveDirectory: "assets/foo*bar" });

    const saveButton = container.querySelector<HTMLButtonElement>(".saveDestinationDialogSaveButton")!;
    expect(saveButton.disabled).toBe(true);

    const error = container.querySelector(".saveDestinationDialogError");
    expect(error?.textContent).toContain("使用できない文字");
  });

  it("displays advisory notice when path contains risky Markdown characters, but keeps Save enabled if valid", () => {
    renderDialog({ initialSaveDirectory: "my attachments/images" });

    const saveButton = container.querySelector<HTMLButtonElement>(".saveDestinationDialogSaveButton")!;
    expect(saveButton.disabled).toBe(false);

    const warning = container.querySelector(".saveDestinationDialogRiskyNotice");
    expect(warning).not.toBeNull();
    expect(warning?.textContent).toContain("パスに空白や特殊文字が含まれているため");
  });

  it("submits normalized path and checkbox state on Save click", () => {
    const onSave = vi.fn();
    renderDialog({
      initialSaveDirectory: "assets\\images",
      initialInsertMarkdownLink: true,
      onSave
    });

    const saveButton = container.querySelector<HTMLButtonElement>(".saveDestinationDialogSaveButton")!;
    expect(saveButton.disabled).toBe(false);

    act(() => {
      saveButton.click();
    });

    expect(onSave).toHaveBeenCalledWith({
      saveDirectory: "assets/images",
      insertMarkdownLink: true
    });
  });

  it("toggles markdown link insertion checkbox", () => {
    const onSave = vi.fn();
    renderDialog({
      initialSaveDirectory: "assets",
      initialInsertMarkdownLink: true,
      onSave
    });

    const checkbox = container.querySelector<HTMLInputElement>(".saveDestinationDialogCheckbox")!;
    act(() => {
      checkbox.click();
    });

    const saveButton = container.querySelector<HTMLButtonElement>(".saveDestinationDialogSaveButton")!;
    act(() => {
      saveButton.click();
    });

    expect(onSave).toHaveBeenCalledWith({
      saveDirectory: "assets",
      insertMarkdownLink: false
    });
  });

  it("calls onDismiss when Cancel button is clicked", () => {
    const onDismiss = vi.fn();
    renderDialog({ onDismiss });

    const cancelButton = container.querySelector<HTMLButtonElement>(".saveDestinationDialogCancelButton")!;
    act(() => {
      cancelButton.click();
    });

    expect(onDismiss).toHaveBeenCalled();
  });

  it("submits via form submit event when valid", () => {
    const onSave = vi.fn();
    renderDialog({
      initialSaveDirectory: "valid/dir",
      onSave
    });

    const form = container.querySelector<HTMLFormElement>(".saveDestinationDialogForm")!;
    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(onSave).toHaveBeenCalledWith({
      saveDirectory: "valid/dir",
      insertMarkdownLink: true
    });
  });

  it("blocks form submit event when invalid in pastePrompt mode", () => {
    const onSave = vi.fn();
    renderDialog({
      mode: "pastePrompt",
      initialSaveDirectory: "",
      onSave
    });

    const form = container.querySelector<HTMLFormElement>(".saveDestinationDialogForm")!;
    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(onSave).not.toHaveBeenCalled();
    const error = container.querySelector(".saveDestinationDialogError");
    expect(error?.textContent).toContain("保存先フォルダを入力してください");
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

  it("preserves typed value when parent updates initialSaveDirectory while dialog stays open (P2-5)", () => {
    renderDialog({
      isOpen: true,
      initialSaveDirectory: "initial"
    });

    const input = container.querySelector<HTMLInputElement>(".saveDestinationDialogInput")!;
    expect(input.value).toBe("initial");

    // User types something new
    act(() => {
      changeInputValue(input, "user/typed/path");
    });

    // Parent re-renders with new props while isOpen remains true
    renderDialog({
      isOpen: true,
      initialSaveDirectory: "updated-from-parent"
    });

    // The user's input must NOT be clobbered
    expect(input.value).toBe("user/typed/path");

    // But closing and re-opening resets to latest initial value
    renderDialog({
      isOpen: false,
      initialSaveDirectory: "updated-from-parent"
    });

    renderDialog({
      isOpen: true,
      initialSaveDirectory: "updated-from-parent"
    });

    const newInput = container.querySelector<HTMLInputElement>(".saveDestinationDialogInput")!;
    expect(newInput.value).toBe("updated-from-parent");
  });

  describe("SaveDestinationSettingControl", () => {
    it("renders unconfigured placeholder when value is empty", () => {
      act(() => {
        root.render(
          <SaveDestinationSettingControl
            value=""
            disabled={false}
            translate={translate}
          />
        );
      });

      expect(container.textContent).toContain("(未設定)");
      expect(container.querySelector(".settingsSaveDestinationPath-unconfigured")).not.toBeNull();
    });

    it("renders configured value when present", () => {
      act(() => {
        root.render(
          <SaveDestinationSettingControl
            value="assets/images"
            disabled={false}
            translate={translate}
          />
        );
      });

      expect(container.textContent).toContain("assets/images");
      expect(container.querySelector(".settingsSaveDestinationPath-unconfigured")).toBeNull();
    });

    it("invokes onOpenDialog with button element when [編集] is clicked", () => {
      const onOpenDialog = vi.fn();
      act(() => {
        root.render(
          <SaveDestinationSettingControl
            value="assets/images"
            disabled={false}
            translate={translate}
            onOpenDialog={onOpenDialog}
          />
        );
      });

      const editButton = container.querySelector<HTMLButtonElement>(".settingsSaveDestinationEditButton")!;
      act(() => {
        editButton.click();
      });

      expect(onOpenDialog).toHaveBeenCalledWith(editButton);
    });

    it("disables edit button when disabled is true", () => {
      act(() => {
        root.render(
          <SaveDestinationSettingControl
            value="assets/images"
            disabled={true}
            translate={translate}
          />
        );
      });

      const editButton = container.querySelector<HTMLButtonElement>(".settingsSaveDestinationEditButton")!;
      expect(editButton.disabled).toBe(true);
    });
  });
});
