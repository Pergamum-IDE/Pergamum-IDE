// @vitest-environment happy-dom
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfPageNumberSettingsDialog } from "../../src/renderer/dialog/PdfPageNumberSettingsDialog";
import { t, type Translate } from "../../src/shared/i18n";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const translate: Translate = (key, params) => t("ja", key, params);

describe("PdfPageNumberSettingsDialog", () => {
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
        root?.unmount();
      });
    }
    container?.remove();
    container = null;
    root = null;
  });

  it("does not render dialog content when isOpen is false", () => {
    act(() => {
      root?.render(
        <PdfPageNumberSettingsDialog
          isOpen={false}
          translate={translate}
          onApply={vi.fn()}
          onClose={vi.fn()}
        />
      );
    });

    expect(container?.querySelector(".pdfPageNumberSettingsDialog")).toBeNull();
  });

  it("renders dropdowns correctly when isOpen is true", () => {
    act(() => {
      root?.render(
        <PdfPageNumberSettingsDialog
          isOpen={true}
          translate={translate}
          onApply={vi.fn()}
          onClose={vi.fn()}
        />
      );
    });

    const positionSelect = container?.querySelector(
      "select[id$='-position']"
    ) as HTMLSelectElement;
    const formatSelect = container?.querySelector(
      "select[id$='-format']"
    ) as HTMLSelectElement;

    expect(positionSelect).not.toBeNull();
    expect(formatSelect).not.toBeNull();
    expect(positionSelect.value).toBe("none");
    expect(formatSelect.value).toBe("none");
    expect(formatSelect.disabled).toBe(true);
  });

  it("enables format select and defaults to dash when position changes to top-left", () => {
    act(() => {
      root?.render(
        <PdfPageNumberSettingsDialog
          isOpen={true}
          translate={translate}
          onApply={vi.fn()}
          onClose={vi.fn()}
        />
      );
    });

    const positionSelect = container?.querySelector(
      "select[id$='-position']"
    ) as HTMLSelectElement;
    const formatSelect = container?.querySelector(
      "select[id$='-format']"
    ) as HTMLSelectElement;

    act(() => {
      positionSelect.value = "top-left";
      positionSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(positionSelect.value).toBe("top-left");
    expect(formatSelect.disabled).toBe(false);
    expect(formatSelect.value).toBe("dash");
  });

  it("resets format to none when position is changed back to none", () => {
    act(() => {
      root?.render(
        <PdfPageNumberSettingsDialog
          isOpen={true}
          initialSettings={{ position: "bottom-center", format: "p" }}
          translate={translate}
          onApply={vi.fn()}
          onClose={vi.fn()}
        />
      );
    });

    const positionSelect = container?.querySelector(
      "select[id$='-position']"
    ) as HTMLSelectElement;
    const formatSelect = container?.querySelector(
      "select[id$='-format']"
    ) as HTMLSelectElement;

    expect(positionSelect.value).toBe("bottom-center");
    expect(formatSelect.value).toBe("p");

    act(() => {
      positionSelect.value = "none";
      positionSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(positionSelect.value).toBe("none");
    expect(formatSelect.value).toBe("none");
    expect(formatSelect.disabled).toBe(true);
  });

  it("calls onApply with normalized settings when Apply button is clicked", () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    act(() => {
      root?.render(
        <PdfPageNumberSettingsDialog
          isOpen={true}
          translate={translate}
          onApply={onApply}
          onClose={onClose}
        />
      );
    });

    const positionSelect = container?.querySelector(
      "select[id$='-position']"
    ) as HTMLSelectElement;

    act(() => {
      positionSelect.value = "bottom-right";
      positionSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const applyButton = Array.from(
      container?.querySelectorAll<HTMLButtonElement>("button") ?? []
    ).find((b) => b.textContent === "適用");

    expect(applyButton).not.toBeUndefined();

    act(() => {
      applyButton?.click();
    });

    expect(onApply).toHaveBeenCalledWith({
      position: "bottom-right",
      format: "dash"
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose without onApply when Cancel button is clicked", () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    act(() => {
      root?.render(
        <PdfPageNumberSettingsDialog
          isOpen={true}
          translate={translate}
          onApply={onApply}
          onClose={onClose}
        />
      );
    });

    const cancelButton = Array.from(
      container?.querySelectorAll<HTMLButtonElement>("button") ?? []
    ).find((b) => b.textContent === "キャンセル");

    expect(cancelButton).not.toBeUndefined();

    act(() => {
      cancelButton?.click();
    });

    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
