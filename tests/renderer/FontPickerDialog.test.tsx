// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { FontPickerDialog } from "../../src/renderer/dialog/FontPickerDialog";
import type { Translate, TranslationKey } from "../../src/shared/i18n";
import { enTranslations } from "../../src/shared/i18n/en";
import { jaTranslations } from "../../src/shared/i18n/ja";
import type { FontFamilySetting } from "../../src/shared/fontSettings";

const translateJa: Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>
) => {
  let template: string =
    (jaTranslations as Record<string, string>)[key] ??
    (enTranslations as Record<string, string>)[key] ??
    key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      template = template.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return template;
};

describe("FontPickerDialog (#492)", () => {
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
    vi.restoreAllMocks();
    delete (window as any).queryLocalFonts;
    delete (window as any).pergamum;
  });

  it("does NOT call queryLocalFonts automatically on dialog open", async () => {
    const queryLocalFontsMock = vi.fn();
    (window as any).queryLocalFonts = queryLocalFontsMock;
    (window as any).pergamum = {
      fontCache: {
        load: vi.fn().mockResolvedValue({ status: "notScanned" })
      }
    };

    await act(async () => {
      root.render(
        <FontPickerDialog
          isOpen={true}
          slot="editor.fontFamilyList"
          initialValue={[{ family: "Cascadia Code", displayName: "Cascadia Code" }]}
          translate={translateJa}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />
      );
    });

    expect(queryLocalFontsMock).not.toHaveBeenCalled();
    const notice = container.querySelector(".fontPickerNotice-warning");
    expect(notice?.textContent).toBe(translateJa("fontPicker.cacheNotScanned"));
  });

  it("renders selected fonts and candidate fonts from cache", async () => {
    (window as any).pergamum = {
      fontCache: {
        load: vi.fn().mockResolvedValue({
          status: "loaded",
          cache: {
            version: 1,
            scannedAt: "2026-09-16T12:00:00Z",
            uiLanguage: "ja",
            families: [
              { family: "Cascadia Code", displayName: "Cascadia Code", fixedWidth: "unknown" },
              { family: "Yu Gothic", displayName: "Yu Gothic", fixedWidth: "unknown" },
              { family: "BIZ UD Gothic", displayName: "BIZ UD Gothic", fixedWidth: "unknown" },
              { family: "sans-serif", displayName: "sans-serif", fixedWidth: "unknown" }
            ]
          }
        })
      }
    };

    const initialFonts: FontFamilySetting[] = [
      { family: "Cascadia Code", displayName: "Cascadia Code" }
    ];

    await act(async () => {
      root.render(
        <FontPickerDialog
          isOpen={true}
          slot="editor.fontFamilyList"
          initialValue={initialFonts}
          translate={translateJa}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />
      );
    });

    // Check selected list contains Cascadia Code
    const selectedItems = container.querySelectorAll(".fontPickerListItem");
    expect(selectedItems.length).toBe(1);
    expect(selectedItems[0].textContent).toContain("Cascadia Code");

    // Candidates should contain Yu Gothic and BIZ UD Gothic, but NOT Cascadia Code (already selected) nor sans-serif (generic fallback)
    const candidateButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".fontPickerCandidateItem")
    );
    const candidateNames = candidateButtons.map((b) => b.textContent);
    expect(candidateNames).toContain("Yu Gothic");
    expect(candidateNames).toContain("BIZ UD Gothic");
    expect(candidateNames).not.toContain("Cascadia Code");
    expect(candidateNames).not.toContain("sans-serif");
  });

  it("preserves selected fonts missing from cache", async () => {
    (window as any).pergamum = {
      fontCache: {
        load: vi.fn().mockResolvedValue({
          status: "loaded",
          cache: {
            version: 1,
            scannedAt: "2026-09-16T12:00:00Z",
            uiLanguage: "ja",
            families: [
              { family: "Yu Gothic", displayName: "Yu Gothic", fixedWidth: "unknown" }
            ]
          }
        })
      }
    };

    const initialFonts: FontFamilySetting[] = [
      { family: "NonExistentFont", displayName: "NonExistentFont" }
    ];

    await act(async () => {
      root.render(
        <FontPickerDialog
          isOpen={true}
          slot="editor.fontFamilyList"
          initialValue={initialFonts}
          translate={translateJa}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />
      );
    });

    const selectedItems = container.querySelectorAll(".fontPickerListItem");
    expect(selectedItems.length).toBe(1);
    expect(selectedItems[0].textContent).toContain("NonExistentFont");
  });

  it("supports adding candidate, reordering, removing, and applying", async () => {
    (window as any).pergamum = {
      fontCache: {
        load: vi.fn().mockResolvedValue({
          status: "loaded",
          cache: {
            version: 1,
            scannedAt: "2026-09-16T12:00:00Z",
            uiLanguage: "ja",
            families: [
              { family: "Cascadia Code", displayName: "Cascadia Code", fixedWidth: "unknown" },
              { family: "BIZ UD Gothic", displayName: "BIZ UD Gothic", fixedWidth: "unknown" }
            ]
          }
        })
      }
    };

    const onSaveMock = vi.fn();
    const onCloseMock = vi.fn();

    await act(async () => {
      root.render(
        <FontPickerDialog
          isOpen={true}
          slot="editor.fontFamilyList"
          initialValue={[{ family: "Cascadia Code", displayName: "Cascadia Code" }]}
          translate={translateJa}
          onSave={onSaveMock}
          onClose={onCloseMock}
        />
      );
    });

    // Add candidate "BIZ UD Gothic"
    const candButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".fontPickerCandidateItem")
    ).find((b) => b.textContent === "BIZ UD Gothic");
    expect(candButton).toBeDefined();

    await act(async () => {
      candButton?.click();
    });

    let items = container.querySelectorAll(".fontPickerListItem");
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain("Cascadia Code");
    expect(items[1].textContent).toContain("BIZ UD Gothic");

    // Select second item (BIZ UD Gothic) and move up
    await act(async () => {
      (items[1] as HTMLButtonElement).click();
    });

    const buttons = container.querySelectorAll<HTMLButtonElement>(".fontPickerSelectedActions button");
    const moveUpBtn = Array.from(buttons).find((b) => b.textContent === translateJa("fontPicker.button.moveUp"));
    expect(moveUpBtn).toBeDefined();
    expect(moveUpBtn?.disabled).toBe(false);

    await act(async () => {
      moveUpBtn?.click();
    });

    items = container.querySelectorAll(".fontPickerListItem");
    expect(items[0].textContent).toContain("BIZ UD Gothic");
    expect(items[1].textContent).toContain("Cascadia Code");

    // Apply
    const applyBtn = container.querySelector<HTMLButtonElement>(".appDialogButton-primary");
    await act(async () => {
      applyBtn?.click();
    });

    expect(onSaveMock).toHaveBeenCalledWith([
      { family: "BIZ UD Gothic", displayName: "BIZ UD Gothic" },
      { family: "Cascadia Code", displayName: "Cascadia Code" }
    ]);
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it("filters candidate list by search query", async () => {
    (window as any).pergamum = {
      fontCache: {
        load: vi.fn().mockResolvedValue({
          status: "loaded",
          cache: {
            version: 1,
            scannedAt: "2026-09-16T12:00:00Z",
            uiLanguage: "ja",
            families: [
              { family: "Cascadia Code", displayName: "Cascadia Code", fixedWidth: "unknown" },
              { family: "Yu Gothic", displayName: "Yu Gothic", fixedWidth: "unknown" },
              { family: "BIZ UD Gothic", displayName: "BIZ UD Gothic", fixedWidth: "unknown" }
            ]
          }
        })
      }
    };

    await act(async () => {
      root.render(
        <FontPickerDialog
          isOpen={true}
          slot="editor.fontFamilyList"
          initialValue={[]}
          translate={translateJa}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />
      );
    });

    const searchInput = container.querySelector<HTMLInputElement>(".fontPickerSearchInput");
    expect(searchInput).toBeDefined();

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;
      nativeInputValueSetter?.call(searchInput, "BIZ");
      searchInput!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const candidateButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".fontPickerCandidateItem")
    );
    expect(candidateButtons.length).toBe(1);
    expect(candidateButtons[0].textContent).toBe("BIZ UD Gothic");
  });

  it("does NOT invoke onSave when Cancel button is clicked", async () => {
    (window as any).pergamum = {
      fontCache: {
        load: vi.fn().mockResolvedValue({ status: "notScanned" })
      }
    };

    const onSaveMock = vi.fn();
    const onCloseMock = vi.fn();

    await act(async () => {
      root.render(
        <FontPickerDialog
          isOpen={true}
          slot="editor.fontFamilyList"
          initialValue={[]}
          translate={translateJa}
          onSave={onSaveMock}
          onClose={onCloseMock}
        />
      );
    });

    const cancelBtn = container.querySelector<HTMLButtonElement>(".appDialogButton-cancel");
    await act(async () => {
      cancelBtn?.click();
    });

    expect(onSaveMock).not.toHaveBeenCalled();
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });
});
