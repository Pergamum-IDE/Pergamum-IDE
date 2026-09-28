// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TableSizePopover } from "../../src/renderer/components/TableSizePopover";
import { jaTranslations } from "../../src/shared/i18n/ja";
import type { TranslationValues } from "../../src/shared/i18n";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function mockTranslate(key: string, values?: TranslationValues): string {
  const template = jaTranslations[key as keyof typeof jaTranslations] ?? key;
  if (!values) return template;
  return template.replace(
    /\{(\w+)\}/g,
    (_, name) => String(values[name] ?? "")
  );
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const nativeValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set;
  nativeValueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

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
  vi.clearAllMocks();
});

describe("TableSizePopover (#603)", () => {
  const onSelectTableSize = vi.fn();
  const onClose = vi.fn();

  function renderPopover() {
    act(() => {
      root.render(
        <TableSizePopover
          onSelectTableSize={onSelectTableSize}
          onClose={onClose}
          translate={mockTranslate}
        />
      );
    });
  }

  it("renders rows input, columns input, grid, and apply button", () => {
    renderPopover();

    expect(container.querySelector(".tableSizePopover")).not.toBeNull();
    expect(container.querySelector(".tableSizePopoverLabel")?.textContent).toBe("1 x 1");

    const inputs = container.querySelectorAll<HTMLInputElement>(".tableSizePopoverInput");
    expect(inputs.length).toBe(2);
    expect(inputs[0].getAttribute("aria-label")).toBe("本体行:");
    expect(inputs[1].getAttribute("aria-label")).toBe("列:");

    const hint = container.querySelector(".tableSizePopoverHint");
    expect(hint?.textContent).toBe("ヘッダ行を含めない本体行数を指定してください。");

    const applyBtn = container.querySelector<HTMLButtonElement>(".tableSizePopoverApplyButton");
    expect(applyBtn).not.toBeNull();
    expect(applyBtn?.textContent).toBe("適用");
  });

  it("inserts table on grid cell click (grid click existing behavior)", () => {
    renderPopover();

    const cells = container.querySelectorAll<HTMLButtonElement>(".tableSizePopoverCell");
    // Row 2, Col 3 -> index 1*6 + 2 = 8
    const cell3x2 = cells[8];

    act(() => {
      cell3x2.click();
    });

    expect(onSelectTableSize).toHaveBeenCalledWith(3, 2);
  });

  it("syncs rows/cols input and label on grid cell mouseEnter", () => {
    renderPopover();

    const cells = container.querySelectorAll<HTMLButtonElement>(".tableSizePopoverCell");
    // Row 4, Col 5 -> index 3*6 + 4 = 22
    const cell5x4 = cells[22];

    act(() => {
      cell5x4.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      cell5x4.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    });

    expect(container.querySelector(".tableSizePopoverLabel")?.textContent).toBe("5 x 4");
    const inputs = container.querySelectorAll<HTMLInputElement>(".tableSizePopoverInput");
    expect(inputs[0].value).toBe("4");
    expect(inputs[1].value).toBe("5");
  });

  it("inserts 10 x 10 table when rows = 10, columns = 10 and Apply is clicked (#603)", () => {
    renderPopover();

    const inputs = container.querySelectorAll<HTMLInputElement>(".tableSizePopoverInput");
    const rowsInput = inputs[0];
    const colsInput = inputs[1];

    act(() => {
      setInputValue(rowsInput, "10");
      setInputValue(colsInput, "10");
    });

    expect(container.querySelector(".tableSizePopoverLabel")?.textContent).toBe("10 x 10");

    const applyBtn = container.querySelector<HTMLButtonElement>(".tableSizePopoverApplyButton")!;
    expect(applyBtn.disabled).toBe(false);

    act(() => {
      applyBtn.click();
    });

    expect(onSelectTableSize).toHaveBeenCalledWith(10, 10);
  });

  it("inserts 10 x 10 table when rows = 10, columns = 10 and Enter is pressed (#603)", () => {
    renderPopover();

    const inputs = container.querySelectorAll<HTMLInputElement>(".tableSizePopoverInput");
    const rowsInput = inputs[0];
    const colsInput = inputs[1];

    act(() => {
      setInputValue(rowsInput, "10");
      setInputValue(colsInput, "10");
    });

    act(() => {
      rowsInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });

    expect(onSelectTableSize).toHaveBeenCalledWith(10, 10);
  });

  it("supports dimensions exceeding grid max size (6x6) up to validation limit 99 (#603)", () => {
    renderPopover();

    const inputs = container.querySelectorAll<HTMLInputElement>(".tableSizePopoverInput");
    const rowsInput = inputs[0];
    const colsInput = inputs[1];

    act(() => {
      setInputValue(rowsInput, "50");
      setInputValue(colsInput, "25");
    });

    expect(container.querySelector(".tableSizePopoverLabel")?.textContent).toBe("25 x 50");

    const applyBtn = container.querySelector<HTMLButtonElement>(".tableSizePopoverApplyButton")!;
    expect(applyBtn.disabled).toBe(false);

    act(() => {
      applyBtn.click();
    });

    expect(onSelectTableSize).toHaveBeenCalledWith(25, 50);
  });

  it("disables Apply button and ignores Enter on invalid input (0, negative, float, non-digit, empty, > 99)", () => {
    renderPopover();

    const inputs = container.querySelectorAll<HTMLInputElement>(".tableSizePopoverInput");
    const rowsInput = inputs[0];
    const applyBtn = container.querySelector<HTMLButtonElement>(".tableSizePopoverApplyButton")!;

    const invalidValues = ["0", "-3", "2.5", "abc", "", "100"];

    for (const val of invalidValues) {
      act(() => {
        setInputValue(rowsInput, val);
      });

      expect(applyBtn.disabled).toBe(true);

      act(() => {
        rowsInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      });

      expect(onSelectTableSize).not.toHaveBeenCalled();
    }
  });

  it("closes popover on Escape key", () => {
    renderPopover();

    const popover = container.querySelector<HTMLDivElement>(".tableSizePopover")!;
    act(() => {
      popover.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
