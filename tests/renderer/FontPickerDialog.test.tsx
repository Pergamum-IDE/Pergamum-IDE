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

function findButtonByText(
  root: HTMLElement,
  selector: string,
  text: string
): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>(selector)).find(
    (b) => b.textContent?.includes(text)
  );
}

describe("FontPickerDialog (#493 two-pane UX)", () => {
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

  const loadedCache = (families: { family: string; displayName: string }[]) => ({
    fontCache: {
      load: vi.fn().mockResolvedValue({
        status: "loaded",
        cache: {
          version: 1,
          scannedAt: "2026-09-16T12:00:00Z",
          uiLanguage: "ja",
          families: families.map((f) => ({ ...f, fixedWidth: "unknown" }))
        }
      })
    }
  });

  describe("dialog layout", () => {
    it("renders selected and available panes with fonts in the correct pane", async () => {
      (window as any).pergamum = loadedCache([
        { family: "Cascadia Code", displayName: "Cascadia Code" },
        { family: "Yu Gothic", displayName: "Yu Gothic" },
        { family: "BIZ UD Gothic", displayName: "BIZ UD Gothic" },
        { family: "sans-serif", displayName: "sans-serif" }
      ]);

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

      const selectedPane = container.querySelector(".fontPickerPane-selected");
      const availablePane = container.querySelector(".fontPickerPane-available");
      expect(selectedPane).toBeTruthy();
      expect(availablePane).toBeTruthy();

      const selectedItems = selectedPane!.querySelectorAll(".fontPickerRowButton");
      expect(selectedItems.length).toBe(1);
      expect(selectedItems[0].textContent).toContain("Cascadia Code");

      const availableItems = Array.from(
        availablePane!.querySelectorAll<HTMLButtonElement>(".fontPickerRowButton")
      );
      const availableNames = availableItems.map((b) => b.textContent);
      expect(availableNames.some((t) => t?.includes("Yu Gothic"))).toBe(true);
      expect(availableNames.some((t) => t?.includes("BIZ UD Gothic"))).toBe(true);
      expect(availableNames.some((t) => t?.includes("Cascadia Code"))).toBe(false);
      expect(availableNames.some((t) => t?.includes("sans-serif"))).toBe(false);
    });

    it("renders a bounded scroll container for the available pane", async () => {
      (window as any).pergamum = loadedCache(
        Array.from({ length: 120 }, (_, i) => ({
          family: `Font ${i}`,
          displayName: `Font ${i}`
        }))
      );

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

      const box = container.querySelector<HTMLElement>(".fontPickerAvailableListBox");
      expect(box).toBeTruthy();
      const items = box!.querySelectorAll(".fontPickerRowButton");
      expect(items.length).toBe(120);
    });

    it("renders the top-to-bottom priority explanation in the selected pane", async () => {
      (window as any).pergamum = { fontCache: { load: vi.fn().mockResolvedValue({ status: "notScanned" }) } };

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

      const note = container.querySelector(".fontPickerPriorityNote");
      expect(note?.textContent).toBe(translateJa("fontPicker.label.priorityExplanation"));
    });
  });

  describe("row font rendering", () => {
    // #493 remediation: symbol fonts make their own name unreadable if the
    // whole row is rendered in the represented font. The identity line must
    // stay in the normal UI font; only the mini sample line renders in the
    // represented family (+ generic fallback).
    it("keeps the identity line in the normal UI font and applies the represented font-family only to the mini sample, for both panes, without dangerous HTML", async () => {
      (window as any).pergamum = loadedCache([
        { family: "Yu Gothic", displayName: "Yu Gothic" }
      ]);

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

      const selectedRow = container.querySelector<HTMLButtonElement>(
        ".fontPickerPane-selected .fontPickerRowButton"
      );
      const selectedName = selectedRow?.querySelector<HTMLElement>(".fontPickerRowName");
      const selectedSample = selectedRow?.querySelector<HTMLElement>(".fontPickerRowSample");
      expect(selectedRow?.style.fontFamily).toBe("");
      expect(selectedName?.style.fontFamily).toBe("");
      expect(selectedSample?.style.fontFamily).toContain("Cascadia Code");
      expect(selectedSample?.style.fontFamily).toContain("monospace");
      expect(selectedName?.textContent).toContain("Cascadia Code");

      const availableRow = container.querySelector<HTMLButtonElement>(
        ".fontPickerPane-available .fontPickerRowButton"
      );
      const availableName = availableRow?.querySelector<HTMLElement>(".fontPickerRowName");
      const availableSample = availableRow?.querySelector<HTMLElement>(".fontPickerRowSample");
      expect(availableRow?.style.fontFamily).toBe("");
      expect(availableName?.style.fontFamily).toBe("");
      expect(availableSample?.style.fontFamily).toContain("Yu Gothic");
      expect(availableSample?.style.fontFamily).toContain("monospace");
      expect(availableName?.textContent).toContain("Yu Gothic");

      // No dangerouslySetInnerHTML anywhere in the dialog markup.
      expect(container.innerHTML).not.toContain("dangerouslySetInnerHTML");
    });
  });

  describe("click-to-preview", () => {
    it("clicking an available font changes the sample preview font without adding it", async () => {
      (window as any).pergamum = loadedCache([
        { family: "Yu Gothic", displayName: "Yu Gothic" }
      ]);

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

      const availableRow = container.querySelector<HTMLButtonElement>(
        ".fontPickerPane-available .fontPickerRowButton"
      );
      await act(async () => {
        availableRow?.click();
      });

      const preview = container.querySelector<HTMLElement>(".fontPickerSamplePreview");
      expect(preview?.style.fontFamily).toContain("Yu Gothic");
      expect(preview?.style.fontFamily).not.toContain("Cascadia Code");

      // Selected list is unchanged.
      const selectedItems = container.querySelectorAll(
        ".fontPickerPane-selected .fontPickerRowButton"
      );
      expect(selectedItems.length).toBe(1);
      expect(selectedItems[0].textContent).toContain("Cascadia Code");
    });

    it("clicking a selected font row previews it without reordering/removing it, without saving, and Apply later persists the unchanged original list", async () => {
      (window as any).pergamum = loadedCache([]);
      const onSaveMock = vi.fn();
      const onCloseMock = vi.fn();
      const initialValue = [
        { family: "Cascadia Code", displayName: "Cascadia Code" },
        { family: "BIZ UD Gothic", displayName: "BIZ UD Gothic" }
      ];

      await act(async () => {
        root.render(
          <FontPickerDialog
            isOpen={true}
            slot="editor.fontFamilyList"
            initialValue={initialValue}
            translate={translateJa}
            onSave={onSaveMock}
            onClose={onCloseMock}
          />
        );
      });

      const rows = container.querySelectorAll<HTMLButtonElement>(
        ".fontPickerPane-selected .fontPickerRowButton"
      );
      await act(async () => {
        rows[1].click();
      });

      // Preview switches to the clicked font alone.
      const preview = container.querySelector<HTMLElement>(".fontPickerSamplePreview");
      expect(preview?.style.fontFamily).toContain("BIZ UD Gothic");
      expect(preview?.style.fontFamily).not.toContain("Cascadia Code");

      // The selected list itself is untouched: same length, same order, same
      // content as the initial value.
      const rowsAfter = container.querySelectorAll(
        ".fontPickerPane-selected .fontPickerRowButton"
      );
      expect(rowsAfter.length).toBe(2);
      expect(rowsAfter[0].textContent).toContain("Cascadia Code");
      expect(rowsAfter[1].textContent).toContain("BIZ UD Gothic");

      // No apply/save (or close) side effect from the click alone.
      expect(onSaveMock).not.toHaveBeenCalled();
      expect(onCloseMock).not.toHaveBeenCalled();

      // Applying afterwards proves no silent mutation happened: the saved
      // value is exactly the original, unchanged list.
      const applyBtn = container.querySelector<HTMLButtonElement>(".appDialogButton-primary");
      await act(async () => {
        applyBtn?.click();
      });
      expect(onSaveMock).toHaveBeenCalledWith(initialValue);
    });

    it("does not call onSave when clicking rows", async () => {
      (window as any).pergamum = loadedCache([
        { family: "Yu Gothic", displayName: "Yu Gothic" }
      ]);
      const onSaveMock = vi.fn();

      await act(async () => {
        root.render(
          <FontPickerDialog
            isOpen={true}
            slot="editor.fontFamilyList"
            initialValue={[{ family: "Cascadia Code", displayName: "Cascadia Code" }]}
            translate={translateJa}
            onSave={onSaveMock}
            onClose={vi.fn()}
          />
        );
      });

      const availableRow = container.querySelector<HTMLButtonElement>(
        ".fontPickerPane-available .fontPickerRowButton"
      );
      const selectedRow = container.querySelector<HTMLButtonElement>(
        ".fontPickerPane-selected .fontPickerRowButton"
      );

      await act(async () => {
        availableRow?.click();
        selectedRow?.click();
      });

      expect(onSaveMock).not.toHaveBeenCalled();
    });

    it("previews the full selected list via the selected-list preview control, and Add/Remove/Up/Down reset to it", async () => {
      (window as any).pergamum = loadedCache([
        { family: "Yu Gothic", displayName: "Yu Gothic" }
      ]);

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

      // Default preview mode is selectedList already.
      let preview = container.querySelector<HTMLElement>(".fontPickerSamplePreview");
      expect(preview?.style.fontFamily).toContain("Cascadia Code");

      const availableRow = container.querySelector<HTMLButtonElement>(
        ".fontPickerPane-available .fontPickerRowButton"
      );
      await act(async () => {
        availableRow?.click(); // highlight + single-family preview
      });
      preview = container.querySelector<HTMLElement>(".fontPickerSamplePreview");
      expect(preview?.style.fontFamily).toContain("Yu Gothic");
      expect(preview?.style.fontFamily).not.toContain("Cascadia Code");

      const addBtn = findButtonByText(
        container,
        ".fontPickerPane-available .fontPickerPaneActions button",
        translateJa("fontPicker.button.add")
      );
      await act(async () => {
        addBtn?.click();
      });

      // After Add, preview mode resets to the full selected list.
      preview = container.querySelector<HTMLElement>(".fontPickerSamplePreview");
      expect(preview?.style.fontFamily).toContain("Cascadia Code");
      expect(preview?.style.fontFamily).toContain("Yu Gothic");
    });
  });

  describe("editable sample text", () => {
    it("renders default sample text and updates preview text on edit; sample text is not saved and resets on reopen", async () => {
      (window as any).pergamum = { fontCache: { load: vi.fn().mockResolvedValue({ status: "notScanned" }) } };
      const onSaveMock = vi.fn();

      await act(async () => {
        root.render(
          <FontPickerDialog
            isOpen={true}
            slot="editor.fontFamilyList"
            initialValue={[{ family: "Cascadia Code", displayName: "Cascadia Code" }]}
            translate={translateJa}
            onSave={onSaveMock}
            onClose={vi.fn()}
          />
        );
      });

      const textarea = container.querySelector<HTMLTextAreaElement>(".fontPickerSampleInput");
      expect(textarea?.value).toBe(translateJa("fontPicker.sampleText"));

      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value"
        )?.set;
        nativeSetter?.call(textarea, "カスタム見本文");
        textarea!.dispatchEvent(new Event("input", { bubbles: true }));
      });

      const preview = container.querySelector<HTMLElement>(".fontPickerSamplePreview");
      expect(preview?.textContent).toBe("カスタム見本文");

      const applyBtn = container.querySelector<HTMLButtonElement>(".appDialogButton-primary");
      await act(async () => {
        applyBtn?.click();
      });

      expect(onSaveMock).toHaveBeenCalledWith([
        { family: "Cascadia Code", displayName: "Cascadia Code" }
      ]);
      // Sample text must not leak into the saved value.
      const savedArg = onSaveMock.mock.calls[0][0];
      expect(JSON.stringify(savedArg)).not.toContain("カスタム見本文");
    });

    it("resets sample text to default when the dialog is reopened", async () => {
      (window as any).pergamum = { fontCache: { load: vi.fn().mockResolvedValue({ status: "notScanned" }) } };

      const renderDialog = async (isOpen: boolean) => {
        await act(async () => {
          root.render(
            <FontPickerDialog
              isOpen={isOpen}
              slot="editor.fontFamilyList"
              initialValue={[]}
              translate={translateJa}
              onSave={vi.fn()}
              onClose={vi.fn()}
            />
          );
        });
      };

      await renderDialog(true);
      const textarea = () =>
        container.querySelector<HTMLTextAreaElement>(".fontPickerSampleInput");

      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value"
        )?.set;
        nativeSetter?.call(textarea(), "編集済みテキスト");
        textarea()!.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(textarea()?.value).toBe("編集済みテキスト");

      await renderDialog(false);
      await renderDialog(true);

      expect(textarea()?.value).toBe(translateJa("fontPicker.sampleText"));
    });

    it("editable sample text is dialog-local: editing then closing via Cancel never saves it, and reopening resets to the default localized sample text", async () => {
      (window as any).pergamum = { fontCache: { load: vi.fn().mockResolvedValue({ status: "notScanned" }) } };
      const onSaveMock = vi.fn();
      const onCloseMock = vi.fn();
      let isOpen = true;

      const renderDialog = async () => {
        await act(async () => {
          root.render(
            <FontPickerDialog
              isOpen={isOpen}
              slot="editor.fontFamilyList"
              initialValue={[{ family: "Cascadia Code", displayName: "Cascadia Code" }]}
              translate={translateJa}
              onSave={onSaveMock}
              onClose={() => {
                onCloseMock();
                isOpen = false;
              }}
            />
          );
        });
      };
      const textarea = () =>
        container.querySelector<HTMLTextAreaElement>(".fontPickerSampleInput");

      // 1. Open the dialog.
      await renderDialog();
      expect(textarea()?.value).toBe(translateJa("fontPicker.sampleText"));

      // 2. Edit the sample text.
      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value"
        )?.set;
        nativeSetter?.call(textarea(), "破棄されるべきテキスト");
        textarea()!.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(textarea()?.value).toBe("破棄されるべきテキスト");

      // 3. Close via the actual Cancel button — never Apply.
      const cancelBtn = container.querySelector<HTMLButtonElement>(".appDialogButton-cancel");
      await act(async () => {
        cancelBtn?.click();
      });
      expect(onCloseMock).toHaveBeenCalledTimes(1);
      expect(onSaveMock).not.toHaveBeenCalled();
      await renderDialog(); // isOpen is now false, reflecting the close.

      // 4. Reopen the dialog.
      isOpen = true;
      await renderDialog();

      // 5. Sample text is back to the default, not the discarded edit.
      expect(textarea()?.value).toBe(translateJa("fontPicker.sampleText"));
      expect(textarea()?.value).not.toBe("破棄されるべきテキスト");
    });
  });

  describe("existing behavior regression", () => {
    it("preserves selected fonts missing from cache", async () => {
      (window as any).pergamum = loadedCache([
        { family: "Yu Gothic", displayName: "Yu Gothic" }
      ]);

      await act(async () => {
        root.render(
          <FontPickerDialog
            isOpen={true}
            slot="editor.fontFamilyList"
            initialValue={[{ family: "NonExistentFont", displayName: "NonExistentFont" }]}
            translate={translateJa}
            onSave={vi.fn()}
            onClose={vi.fn()}
          />
        );
      });

      const selectedItems = container.querySelectorAll(".fontPickerPane-selected .fontPickerRowButton");
      expect(selectedItems.length).toBe(1);
      expect(selectedItems[0].textContent).toContain("NonExistentFont");
    });

    it("supports adding candidate via the explicit Add button, reordering, removing, and applying", async () => {
      (window as any).pergamum = loadedCache([
        { family: "Cascadia Code", displayName: "Cascadia Code" },
        { family: "BIZ UD Gothic", displayName: "BIZ UD Gothic" }
      ]);

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

      // Clicking the available row previews only; it must not add by itself.
      const availRow = findButtonByText(
        container,
        ".fontPickerPane-available .fontPickerRowButton",
        "BIZ UD Gothic"
      );
      await act(async () => {
        availRow?.click();
      });
      expect(
        container.querySelectorAll(".fontPickerPane-selected .fontPickerRowButton").length
      ).toBe(1);

      const addBtn = findButtonByText(
        container,
        ".fontPickerPane-available .fontPickerPaneActions button",
        translateJa("fontPicker.button.add")
      );
      await act(async () => {
        addBtn?.click();
      });

      let items = container.querySelectorAll(".fontPickerPane-selected .fontPickerRowButton");
      expect(items.length).toBe(2);
      expect(items[0].textContent).toContain("Cascadia Code");
      expect(items[1].textContent).toContain("BIZ UD Gothic");

      // Select second item (BIZ UD Gothic) and move up.
      await act(async () => {
        (items[1] as HTMLButtonElement).click();
      });

      const moveUpBtn = findButtonByText(
        container,
        ".fontPickerPane-selected .fontPickerPaneActions button",
        translateJa("fontPicker.button.moveUp")
      );
      expect(moveUpBtn?.disabled).toBe(false);

      await act(async () => {
        moveUpBtn?.click();
      });

      items = container.querySelectorAll(".fontPickerPane-selected .fontPickerRowButton");
      expect(items[0].textContent).toContain("BIZ UD Gothic");
      expect(items[1].textContent).toContain("Cascadia Code");

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

    it("prevents adding a duplicate family and never stores generic fallback families", async () => {
      (window as any).pergamum = loadedCache([
        { family: "Cascadia Code", displayName: "Cascadia Code" }
      ]);
      const onSaveMock = vi.fn();

      await act(async () => {
        root.render(
          <FontPickerDialog
            isOpen={true}
            slot="editor.fontFamilyList"
            initialValue={[{ family: "Cascadia Code", displayName: "Cascadia Code" }]}
            translate={translateJa}
            onSave={onSaveMock}
            onClose={vi.fn()}
          />
        );
      });

      // Cascadia Code is already selected, so it is excluded from the
      // available pane entirely — there is nothing to add a duplicate of.
      const availableNames = Array.from(
        container.querySelectorAll<HTMLButtonElement>(
          ".fontPickerPane-available .fontPickerRowButton"
        )
      ).map((b) => b.textContent);
      expect(availableNames.some((t) => t?.includes("Cascadia Code"))).toBe(false);

      const applyBtn = container.querySelector<HTMLButtonElement>(".appDialogButton-primary");
      await act(async () => {
        applyBtn?.click();
      });

      expect(onSaveMock).toHaveBeenCalledWith([
        { family: "Cascadia Code", displayName: "Cascadia Code" }
      ]);
    });

    it("allows an empty selected list to be applied", async () => {
      (window as any).pergamum = loadedCache([]);
      const onSaveMock = vi.fn();

      await act(async () => {
        root.render(
          <FontPickerDialog
            isOpen={true}
            slot="editor.fontFamilyList"
            initialValue={[]}
            translate={translateJa}
            onSave={onSaveMock}
            onClose={vi.fn()}
          />
        );
      });

      const applyBtn = container.querySelector<HTMLButtonElement>(".appDialogButton-primary");
      await act(async () => {
        applyBtn?.click();
      });

      expect(onSaveMock).toHaveBeenCalledWith([]);
    });

    it("filters the available list by search query", async () => {
      (window as any).pergamum = loadedCache([
        { family: "Cascadia Code", displayName: "Cascadia Code" },
        { family: "Yu Gothic", displayName: "Yu Gothic" },
        { family: "BIZ UD Gothic", displayName: "BIZ UD Gothic" }
      ]);

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

      const availableItems = container.querySelectorAll(
        ".fontPickerPane-available .fontPickerRowButton"
      );
      expect(availableItems.length).toBe(1);
      expect(availableItems[0].textContent).toContain("BIZ UD Gothic");
    });

    it("does NOT invoke onSave when Cancel button is clicked", async () => {
      (window as any).pergamum = { fontCache: { load: vi.fn().mockResolvedValue({ status: "notScanned" }) } };

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

  describe("cache state", () => {
    it("loadedCache([]) fixture resolves to a valid loaded cache with an empty families array", async () => {
      const fixture = loadedCache([]);
      const resolved = await fixture.fontCache.load();
      expect(resolved.status).toBe("loaded");
      expect(resolved.cache.families).toEqual([]);
    });

    it("does NOT call queryLocalFonts automatically on dialog open, and shows the not-scanned notice", async () => {
      const queryLocalFontsMock = vi.fn();
      (window as any).queryLocalFonts = queryLocalFontsMock;
      (window as any).pergamum = { fontCache: { load: vi.fn().mockResolvedValue({ status: "notScanned" }) } };

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

    it("shows the error state safely without crashing", async () => {
      (window as any).pergamum = {
        fontCache: {
          load: vi.fn().mockResolvedValue({ status: "error", message: "boom" })
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

      const notice = container.querySelector(".fontPickerNotice-error");
      expect(notice?.textContent).toBe("boom");
    });

    it("clicking font rows does not call queryLocalFonts", async () => {
      const queryLocalFontsMock = vi.fn();
      (window as any).queryLocalFonts = queryLocalFontsMock;
      (window as any).pergamum = loadedCache([
        { family: "Yu Gothic", displayName: "Yu Gothic" }
      ]);

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

      const availableRow = container.querySelector<HTMLButtonElement>(
        ".fontPickerPane-available .fontPickerRowButton"
      );
      const selectedRow = container.querySelector<HTMLButtonElement>(
        ".fontPickerPane-selected .fontPickerRowButton"
      );
      await act(async () => {
        availableRow?.click();
        selectedRow?.click();
      });

      expect(queryLocalFontsMock).not.toHaveBeenCalled();
    });
  });
});
