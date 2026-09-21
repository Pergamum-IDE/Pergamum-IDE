// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jaTranslations } from "../../src/shared/i18n/ja";
import { EditorToolbar } from "../../src/renderer/components/EditorToolbar";

import type { TranslationValues } from "../../src/shared/i18n";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function mockTranslate(key: string, values?: TranslationValues): string {
  let text = (jaTranslations as any)[key] ?? key;
  if (values) {
    for (const [k, v] of Object.entries(values)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
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

describe("EditorToolbar", () => {
  it("renders disabled icon-only table button with aria-label and title when canInsertTable is false", () => {
    act(() => {
      root.render(
        <EditorToolbar
          canInsertTable={false}
          onInsertTable={vi.fn()}
          translate={mockTranslate}
        />
      );
    });

    const button = container.querySelector("button.editorToolbarButton") as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-label")).toBe("表を挿入");
    expect(button.getAttribute("title")).toBe("表を挿入");
    expect(container.querySelector(".editorToolbarButtonLabel")).toBeNull();
    expect(button.textContent?.trim()).toBe("");
  });

  it("opens popover when clicking enabled icon-only table button and selects size", () => {
    const onInsertTable = vi.fn();
    act(() => {
      root.render(
        <EditorToolbar
          canInsertTable={true}
          onInsertTable={onInsertTable}
          translate={mockTranslate}
        />
      );
    });

    const button = container.querySelector("button.editorToolbarButton") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-label")).toBe("表を挿入");
    expect(button.getAttribute("title")).toBe("表を挿入");
    expect(container.querySelector(".editorToolbarButtonLabel")).toBeNull();

    // Popover initially not present
    expect(container.querySelector(".tableSizePopover")).toBeNull();

    // Click button to open popover
    act(() => {
      button.click();
    });

    const popover = container.querySelector(".tableSizePopover");
    expect(popover).not.toBeNull();
    expect(container.querySelector(".tableSizePopoverLabel")?.textContent).toBe("1 x 1");

    // Click cell (3, 2)
    const cells = container.querySelectorAll(".tableSizePopoverCell");
    // Row 2, Col 3 is index (row-1)*6 + (col-1) = 1*6 + 2 = 8
    const cell3x2 = cells[8] as HTMLButtonElement;

    act(() => {
      cell3x2.click();
    });

    expect(onInsertTable).toHaveBeenCalledWith(3, 2);
    // Popover closes after selection
    expect(container.querySelector(".tableSizePopover")).toBeNull();
  });
});
