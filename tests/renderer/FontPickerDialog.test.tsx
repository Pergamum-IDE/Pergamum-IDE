// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { FontPickerDialog } from "../../src/renderer/dialog/FontPickerDialog";
import type { Language, Translate, TranslationKey } from "../../src/shared/i18n";
import { enTranslations } from "../../src/shared/i18n/en";
import { jaTranslations } from "../../src/shared/i18n/ja";
import type { FontFamilySetting, FontSlot } from "../../src/shared/fontSettings";
import type { FontFixedWidthStatus } from "../../src/shared/fontCache";

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

// #494 drag-and-drop test helpers. The dialog carries its drag payload in
// React state (not `DataTransfer` — see FontPickerDialog's `DragSource`
// comment), so these dispatch plain native events; happy-dom's `DragEvent`
// constructor works but leaves `dataTransfer` undefined, which the
// component already tolerates via try/catch and optional chaining.
function mousedown(el: Element | null | undefined): void {
  el?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
}

function mouseup(el: Element | null | undefined): void {
  el?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
}

function dragStart(el: Element | null | undefined): void {
  el?.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true }));
}

function dragOver(el: Element | null | undefined, clientY = 0): void {
  el?.dispatchEvent(
    new DragEvent("dragover", { bubbles: true, cancelable: true, clientY })
  );
}

function drop(el: Element | null | undefined, clientY = 0): void {
  el?.dispatchEvent(
    new DragEvent("drop", { bubbles: true, cancelable: true, clientY })
  );
}

function dragEnd(el: Element | null | undefined): void {
  el?.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true }));
}

function gripOf(row: Element | null | undefined): HTMLButtonElement | null | undefined {
  return row?.querySelector<HTMLButtonElement>(".fontPickerRowGrip");
}

function rowLiOf(button: Element | null | undefined): HTMLLIElement | null {
  return (button?.closest("li") as HTMLLIElement | null) ?? null;
}

/** Runs one drag-event dispatch per `act()`, matching this file's existing
 * "one interaction per act()" convention so each step sees freshly
 * committed React state/closures before the next fires. */
async function step(fn: () => void): Promise<void> {
  await act(async () => {
    fn();
  });
}

async function setSearchValue(
  input: HTMLInputElement | null,
  value: string
): Promise<void> {
  await step(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    setter?.call(input, value);
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Full gripper-driven drag sequence: mousedown-arm -> dragstart -> dragover
 * -> drop -> dragend, each its own `step()`. `sourceLi`/`targetEl` are the
 * `<li>` / drop-target elements themselves. */
async function performDrag(
  sourceLi: Element | null | undefined,
  targetEl: Element | null | undefined,
  clientY = 0
): Promise<void> {
  const grip = gripOf(sourceLi);
  await step(() => mousedown(grip));
  await step(() => dragStart(sourceLi));
  await step(() => dragOver(targetEl, clientY));
  await step(() => drop(targetEl, clientY));
  await step(() => dragEnd(sourceLi));
}

function selectedRowButtons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      ".fontPickerPane-selected .fontPickerRowButton"
    )
  );
}

function availableRowButtons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      ".fontPickerPane-available .fontPickerRowButton"
    )
  );
}

function names(buttons: HTMLButtonElement[]): (string | null)[] {
  return buttons.map((b) => b.textContent);
}

type TestCachedFontFamily = {
  family: string;
  displayName: string;
  fixedWidth?: FontFixedWidthStatus;
  blob?: () => unknown;
};

describe("FontPickerDialog (#494 D&D-only remediation)", () => {
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

  const loadedCache = (
    families: TestCachedFontFamily[],
    uiLanguage: Language = "ja"
  ) => ({
    fontCache: {
      load: vi.fn().mockResolvedValue({
        status: "loaded",
        cache: {
          version: 1,
          scannedAt: "2026-09-16T12:00:00Z",
          uiLanguage,
          families: families.map((f) => ({ ...f, fixedWidth: f.fixedWidth ?? "fixed" }))
        }
      })
    }
  });

  async function renderDialog(props: {
    initialValue?: FontFamilySetting[];
    cache?: TestCachedFontFamily[] | "notScanned" | { status: "error"; message: string };
    slot?: FontSlot;
    cacheUiLanguage?: Language;
    uiLanguage?: Language;
    onSave?: (selectedFonts: FontFamilySetting[]) => void;
    onClose?: () => void;
    isOpen?: boolean;
  }): Promise<void> {
    const {
      initialValue = [],
      cache = [],
      slot = "editor.fontFamilyList",
      cacheUiLanguage = "ja",
      uiLanguage = "ja",
      onSave = vi.fn(),
      onClose = vi.fn(),
      isOpen = true
    } = props;
    if (cache === "notScanned") {
      (window as any).pergamum = { fontCache: { load: vi.fn().mockResolvedValue({ status: "notScanned" }) } };
    } else if (Array.isArray(cache)) {
      (window as any).pergamum = loadedCache(cache, cacheUiLanguage);
    } else {
      (window as any).pergamum = { fontCache: { load: vi.fn().mockResolvedValue(cache) } };
    }

    await act(async () => {
      root.render(
        <FontPickerDialog
          isOpen={isOpen}
          slot={slot}
          initialValue={initialValue}
          translate={translateJa}
          uiLanguage={uiLanguage}
          onSave={onSave}
          onClose={onClose}
        />
      );
    });
  }

  describe("dialog layout", () => {
    it("renders selected and available panes with fonts in the correct pane", async () => {
      await renderDialog({
        initialValue: [{ family: "Cascadia Code", displayName: "Cascadia Code" }],
        cache: [
          { family: "Yu Gothic", displayName: "Yu Gothic" },
          { family: "BIZ UD Gothic", displayName: "BIZ UD Gothic" },
          { family: "sans-serif", displayName: "sans-serif" }
        ]
      });

      const selectedPane = container.querySelector(".fontPickerPane-selected");
      const availablePane = container.querySelector(".fontPickerPane-available");
      expect(selectedPane).toBeTruthy();
      expect(availablePane).toBeTruthy();

      expect(selectedRowButtons(container).length).toBe(1);
      expect(selectedRowButtons(container)[0].textContent).toContain("Cascadia Code");

      const availableNames = names(availableRowButtons(container));
      expect(availableNames.some((t) => t?.includes("Yu Gothic"))).toBe(true);
      expect(availableNames.some((t) => t?.includes("BIZ UD Gothic"))).toBe(true);
      expect(availableNames.some((t) => t?.includes("Cascadia Code"))).toBe(false);
      expect(availableNames.some((t) => t?.includes("sans-serif"))).toBe(false);
    });

    it("renders a bounded scroll container for the available pane with 100+ fonts", async () => {
      await renderDialog({
        cache: Array.from({ length: 120 }, (_, i) => ({
          family: `Font ${i}`,
          displayName: `Font ${i}`
        }))
      });

      const box = container.querySelector<HTMLElement>(".fontPickerAvailableListBox");
      expect(box).toBeTruthy();
      expect(box!.querySelectorAll(".fontPickerRowButton").length).toBe(120);
    });

    it("renders the top-to-bottom priority explanation in the selected pane", async () => {
      await renderDialog({ cache: "notScanned" });
      const note = container.querySelector(".fontPickerPriorityNote");
      expect(note?.textContent).toBe(translateJa("fontPicker.label.priorityExplanation"));
    });
  });

  describe("available font ordering", () => {
    const availableIdentityNames = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          ".fontPickerPane-available .fontPickerRowName"
        )
      ).map((el) => el.textContent);

    it("sorts available fonts by family so sibling fonts stay adjacent", async () => {
      await renderDialog({
        cache: [
          { family: "Yu Mincho", displayName: "游明朝" },
          { family: "Meiryo UI", displayName: "Meiryo UI" },
          { family: "Yu Gothic UI", displayName: "Yu Gothic UI" },
          { family: "Arial", displayName: "Arial" },
          { family: "Meiryo", displayName: "メイリオ" },
          { family: "Yu Gothic", displayName: "游ゴシック" }
        ]
      });

      const rowNames = availableIdentityNames();
      expect(rowNames).toEqual([
        "Arial",
        "Meiryo / メイリオ",
        "Meiryo UI",
        "Yu Gothic / 游ゴシック",
        "Yu Gothic UI",
        "Yu Mincho / 游明朝"
      ]);
      expect(rowNames.indexOf("Meiryo UI")).toBe(
        rowNames.indexOf("Meiryo / メイリオ") + 1
      );
      expect(rowNames.indexOf("Yu Gothic UI")).toBe(
        rowNames.indexOf("Yu Gothic / 游ゴシック") + 1
      );
    });

    it("uses case-insensitive numeric English-family ordering and preserves source order for equal comparisons", async () => {
      await renderDialog({
        cache: [
          { family: "Font ver10", displayName: "Font ver10" },
          { family: "biz UDGothic", displayName: "biz UDGothic" },
          { family: "Font ver3", displayName: "Font ver3" },
          { family: "BIZ udgothic", displayName: "BIZ udgothic" },
          { family: "Bahnschrift", displayName: "Bahnschrift" }
        ]
      });

      expect(availableIdentityNames()).toEqual([
        "Bahnschrift",
        "biz UDGothic",
        "BIZ udgothic",
        "Font ver3",
        "Font ver10"
      ]);
    });

    it("keeps the same family ordering after search filtering", async () => {
      await renderDialog({
        cache: [
          { family: "Yu Mincho", displayName: "游明朝" },
          { family: "Yu Gothic UI", displayName: "Yu Gothic UI" },
          { family: "Yu Gothic", displayName: "游ゴシック" },
          { family: "Arial", displayName: "Arial" }
        ]
      });

      await setSearchValue(
        container.querySelector<HTMLInputElement>(".fontPickerSearchInput"),
        "Yu"
      );

      expect(availableIdentityNames()).toEqual([
        "Yu Gothic / 游ゴシック",
        "Yu Gothic UI",
        "Yu Mincho / 游明朝"
      ]);
    });

    it("does not sort the selected font list; it preserves the user's ordered list", async () => {
      await renderDialog({
        initialValue: [
          { family: "Yu Gothic UI", displayName: "Yu Gothic UI" },
          { family: "Meiryo", displayName: "メイリオ" }
        ],
        cache: [
          { family: "Arial", displayName: "Arial" },
          { family: "Yu Gothic", displayName: "游ゴシック" }
        ]
      });

      const selectedNames = Array.from(
        container.querySelectorAll<HTMLElement>(
          ".fontPickerPane-selected .fontPickerRowName"
        )
      ).map((el) => el.textContent);
      expect(selectedNames).toEqual(["1.Yu Gothic UI", "2.Meiryo / メイリオ"]);
    });
  });

  describe("fixed-width-only available-font filter", () => {
    const toggle = () =>
      container.querySelector<HTMLInputElement>(".fontPickerFixedWidthToggleInput");

    it("renders the fixed-width-only toggle in the available-font filter row", async () => {
      await renderDialog({ cache: "notScanned" });

      const filterRow = container.querySelector(".fontPickerFilterRow");
      const searchInput = container.querySelector(".fontPickerSearchInput");
      const fixedWidthToggle = toggle();
      const toggleLabel = container.querySelector(".fontPickerFixedWidthToggle");

      expect(filterRow).toBeTruthy();
      expect(filterRow?.contains(searchInput)).toBe(true);
      expect(filterRow?.contains(fixedWidthToggle)).toBe(true);
      expect(fixedWidthToggle?.type).toBe("checkbox");
      expect(fixedWidthToggle?.getAttribute("role")).toBe("switch");
      expect(fixedWidthToggle?.getAttribute("aria-checked")).toBe("true");
      expect(
        toggleLabel?.querySelector(".fontPickerFixedWidthToggleSwitch")
      ).not.toBeNull();
      expect(
        toggleLabel?.querySelector(".fontPickerFixedWidthToggleTrack")
      ).not.toBeNull();
      expect(
        toggleLabel?.querySelector(".fontPickerFixedWidthToggleThumb")
      ).not.toBeNull();
      expect(toggleLabel?.textContent).toContain(
        translateJa("fontPicker.label.fixedWidthOnly")
      );
    });

    it("initializes the filter ON for the editor font picker", async () => {
      await renderDialog({ slot: "editor.fontFamilyList", cache: "notScanned" });

      expect(toggle()?.checked).toBe(true);
    });

    it("initializes the filter OFF for the app UI font picker", async () => {
      await renderDialog({
        slot: "workbench.uiFontFamilyList",
        cache: "notScanned"
      });

      expect(toggle()?.checked).toBe(false);
    });

    it("initializes the filter OFF for the preview font picker", async () => {
      await renderDialog({ slot: "preview.fontFamilyList", cache: "notScanned" });

      expect(toggle()?.checked).toBe(false);
    });

    it("when ON, shows only fonts confidently classified as fixed-width", async () => {
      await renderDialog({
        cache: [
          { family: "Cascadia Code", displayName: "Cascadia Code", fixedWidth: "fixed" },
          { family: "Arial", displayName: "Arial", fixedWidth: "proportional" },
          { family: "Mystery Font", displayName: "Mystery Font", fixedWidth: "unknown" }
        ]
      });

      const availableNames = names(availableRowButtons(container));
      expect(toggle()?.checked).toBe(true);
      expect(availableNames).toHaveLength(1);
      expect(availableNames[0]).toContain("Cascadia Code");
      expect(availableNames.some((name) => name?.includes("Arial"))).toBe(false);
      expect(availableNames.some((name) => name?.includes("Mystery Font"))).toBe(false);
    });

    it("when OFF, fixed/proportional/unknown candidates can all be shown", async () => {
      await renderDialog({
        cache: [
          { family: "Cascadia Code", displayName: "Cascadia Code", fixedWidth: "fixed" },
          { family: "Arial", displayName: "Arial", fixedWidth: "proportional" },
          { family: "Mystery Font", displayName: "Mystery Font", fixedWidth: "unknown" }
        ]
      });

      await step(() => toggle()?.click());

      const availableNames = names(availableRowButtons(container));
      expect(toggle()?.checked).toBe(false);
      expect(toggle()?.getAttribute("aria-checked")).toBe("false");
      expect(availableNames.some((name) => name?.includes("Cascadia Code"))).toBe(true);
      expect(availableNames.some((name) => name?.includes("Arial"))).toBe(true);
      expect(availableNames.some((name) => name?.includes("Mystery Font"))).toBe(true);
    });

    it("combines search and fixed-width filtering with AND semantics", async () => {
      await renderDialog({
        cache: [
          { family: "Cascadia Code", displayName: "Cascadia Code", fixedWidth: "fixed" },
          { family: "Fira Mono", displayName: "Fira Mono", fixedWidth: "fixed" },
          { family: "Code Pro", displayName: "Code Pro", fixedWidth: "proportional" },
          { family: "Code Mystery", displayName: "Code Mystery", fixedWidth: "unknown" }
        ]
      });

      await setSearchValue(
        container.querySelector<HTMLInputElement>(".fontPickerSearchInput"),
        "Code"
      );

      const availableNames = names(availableRowButtons(container));
      expect(toggle()?.checked).toBe(true);
      expect(availableNames).toHaveLength(1);
      expect(availableNames[0]).toContain("Cascadia Code");
      expect(availableNames.some((name) => name?.includes("Fira Mono"))).toBe(false);
      expect(availableNames.some((name) => name?.includes("Code Pro"))).toBe(false);
      expect(availableNames.some((name) => name?.includes("Code Mystery"))).toBe(false);
    });

    it("shows a calm fixed-width empty state when the filter excludes every available font", async () => {
      await renderDialog({
        cache: [
          { family: "Arial", displayName: "Arial", fixedWidth: "proportional" },
          { family: "Mystery Font", displayName: "Mystery Font", fixedWidth: "unknown" }
        ]
      });

      expect(availableRowButtons(container)).toHaveLength(0);
      expect(
        container.querySelector(
          ".fontPickerPane-available .fontPickerEmptyNotice"
        )?.textContent
      ).toBe(translateJa("fontPicker.emptyFixedWidthAvailable"));
    });

    it("reinitializes the dialog-local toggle from the slot each time the dialog opens", async () => {
      const onSave = vi.fn();
      const onClose = vi.fn();
      const cache = [
        { family: "Cascadia Code", displayName: "Cascadia Code", fixedWidth: "fixed" as const }
      ];
      let isOpen = true;
      let slot: FontSlot = "editor.fontFamilyList";

      const render = async () => {
        (window as any).pergamum = loadedCache(cache);
        await act(async () => {
          root.render(
            <FontPickerDialog
              isOpen={isOpen}
              slot={slot}
              initialValue={[]}
              translate={translateJa}
              onSave={onSave}
              onClose={onClose}
            />
          );
        });
      };

      await render();
      expect(toggle()?.checked).toBe(true);
      await step(() => toggle()?.click());
      expect(toggle()?.checked).toBe(false);

      isOpen = false;
      await render();
      isOpen = true;
      await render();
      expect(toggle()?.checked).toBe(true);

      isOpen = false;
      await render();
      slot = "preview.fontFamilyList";
      isOpen = true;
      await render();
      expect(toggle()?.checked).toBe(false);
    });

    it("toggling the filter does not scan fonts, call FontData.blob(), or save the cache", async () => {
      const queryLocalFontsMock = vi.fn();
      const blobMock = vi.fn();
      (window as any).queryLocalFonts = queryLocalFontsMock;
      await renderDialog({
        cache: [
          {
            family: "Cascadia Code",
            displayName: "Cascadia Code",
            fixedWidth: "fixed",
            blob: blobMock
          }
        ]
      });
      const loadMock = (window as any).pergamum.fontCache.load;

      await step(() => toggle()?.click());
      await step(() => toggle()?.click());

      expect(queryLocalFontsMock).not.toHaveBeenCalled();
      expect(blobMock).not.toHaveBeenCalled();
      expect(loadMock).toHaveBeenCalledTimes(1);
      expect((window as any).pergamum.fontCache).not.toHaveProperty("save");
    });

    it("keeps the filter row CSS compact without changing font row height semantics", () => {
      const styles = readFileSync("src/renderer/styles.css", "utf8");

      expect(styles).toContain(".fontPickerFilterRow {\n  display: grid;");
      expect(styles).toContain("grid-template-columns: minmax(0, 1fr) auto;");
      expect(styles).toContain(".fontPickerFixedWidthToggleInput");
      expect(styles).toContain(".fontPickerFixedWidthToggleTrack");
      expect(styles).toContain(".fontPickerFixedWidthToggleThumb");
      expect(styles).toContain(".fontPickerRowButton {\n  display: flex;");
      expect(styles).toContain("min-height: 48px;");
      expect(styles).not.toContain(".fontPickerRowButton {\n  height: 32px;");
    });
  });

  describe("font entity rendering", () => {
    it("keeps the two-line row CSS auto-height, ellipsis-capable, and focus-visible", () => {
      const styles = readFileSync("src/renderer/styles.css", "utf8");

      expect(styles).toContain(".fontPickerRowButton {\n  display: flex;");
      expect(styles).toContain("min-height: 48px;");
      expect(styles).toContain("height: auto;");
      expect(styles).not.toContain(".fontPickerRowButton {\n  height: 32px;");
      expect(styles).toContain(".fontPickerRowButton:focus-visible");
      expect(styles).toContain(".fontPickerRowName {\n  font-family: inherit;");
    });

    it("renders each selected/available font as one stable entity: identity in the normal UI font, mini sample in the represented font, no overlap, no dangerous HTML", async () => {
      await renderDialog({
        initialValue: [{ family: "Cascadia Code", displayName: "Cascadia Code" }],
        cache: [{ family: "Yu Gothic", displayName: "Yu Gothic" }]
      });

      const selectedRow = container.querySelector<HTMLButtonElement>(
        ".fontPickerPane-selected .fontPickerRowButton"
      );
      const selectedName = selectedRow?.querySelector<HTMLElement>(".fontPickerRowName");
      const selectedSample = selectedRow?.querySelector<HTMLElement>(".fontPickerRowSample");
      // Identity is the normal UI font: no represented-font style leaks onto
      // the button or the identity line itself.
      expect(selectedRow?.style.fontFamily).toBe("");
      expect(selectedName?.style.fontFamily).toBe("");
      // Only the mini sample line carries the represented font + slot
      // generic fallback.
      expect(selectedSample?.style.fontFamily).toContain("Cascadia Code");
      expect(selectedSample?.style.fontFamily).toContain("monospace");
      expect(selectedName?.textContent).toContain("Cascadia Code");
      // Identity and mini sample are two distinct elements (no overlap).
      expect(selectedName).not.toBe(selectedSample);
      expect(selectedSample?.textContent).toBe("Aa あア亜 123");

      const availableRow = container.querySelector<HTMLButtonElement>(
        ".fontPickerPane-available .fontPickerRowButton"
      );
      const availableName = availableRow?.querySelector<HTMLElement>(".fontPickerRowName");
      const availableSample = availableRow?.querySelector<HTMLElement>(".fontPickerRowSample");
      expect(availableRow?.style.fontFamily).toBe("");
      expect(availableName?.style.fontFamily).toBe("");
      expect(availableSample?.style.fontFamily).toContain("Yu Gothic");
      expect(availableSample?.style.fontFamily).toContain("monospace");

      expect(container.innerHTML).not.toContain("dangerouslySetInnerHTML");
    });

    it("renders each font row within a structured grip-column + body-column entity that can ellipsize", async () => {
      const longName = "A".repeat(120);
      await renderDialog({
        initialValue: [{ family: longName, displayName: longName }],
        cache: [{ family: "Yu Gothic", displayName: "Yu Gothic" }]
      });

      const li = container.querySelector<HTMLLIElement>(".fontPickerPane-selected li");
      expect(li).toBeTruthy();
      // Structured entity: grip + body button as two sibling children.
      expect(li!.children.length).toBe(2);
      expect(li!.children[0].classList.contains("fontPickerRowGrip")).toBe(true);
      expect(li!.children[1].classList.contains("fontPickerRowButton")).toBe(true);

      // Text renders in full in the DOM (CSS ellipsizes visually); no crash
      // on an extreme-length name.
      const nameEl = li!.querySelector(".fontPickerRowName");
      expect(nameEl?.textContent).toContain(longName);
    });

    it("does not make a symbol font's readable identity unreadable", async () => {
      await renderDialog({ cache: [{ family: "Wingdings", displayName: "Wingdings" }] });
      const name = container.querySelector<HTMLElement>(
        ".fontPickerPane-available .fontPickerRowName"
      );
      // The identity line has no font-family override, so it always renders
      // in the normal UI font regardless of how exotic the represented
      // family is.
      expect(name?.style.fontFamily).toBe("");
      expect(name?.textContent).toBe("Wingdings");
    });
  });

  describe("D&D-only controls (no Add/Remove/Up/Down buttons)", () => {
    it("does not render Add, Remove, Up, or Down buttons", async () => {
      await renderDialog({
        initialValue: [{ family: "Cascadia Code", displayName: "Cascadia Code" }],
        cache: [{ family: "Yu Gothic", displayName: "Yu Gothic" }]
      });

      const buttonTexts = Array.from(container.querySelectorAll("button")).map(
        (b) => b.textContent?.trim()
      );
      expect(buttonTexts).not.toContain("上へ");
      expect(buttonTexts).not.toContain("下へ");
      expect(buttonTexts).not.toContain("削除");
      expect(buttonTexts).not.toContain("追加");
      expect(container.querySelector(".fontPickerPaneActions")).toBeNull();
    });

    it("renders the localized D&D operation caption", async () => {
      await renderDialog({ cache: "notScanned" });
      const caption = container.querySelector(".fontPickerDndCaption");
      expect(caption).toBeTruthy();
      expect(caption?.textContent).toBe(translateJa("fontPicker.label.dndCaption"));
      expect(caption?.textContent).toBe(
        "フォントをドラッグアンドドロップで採用、入れ替えができます。"
      );
    });
  });

  describe("gripper handle", () => {
    it("renders on selected rows", async () => {
      await renderDialog({
        initialValue: [{ family: "Cascadia Code", displayName: "Cascadia Code" }]
      });
      expect(
        container.querySelectorAll(".fontPickerPane-selected .fontPickerRowGrip").length
      ).toBe(1);
    });

    it("renders on available rows", async () => {
      await renderDialog({ cache: [{ family: "Yu Gothic", displayName: "Yu Gothic" }] });
      expect(
        container.querySelectorAll(".fontPickerPane-available .fontPickerRowGrip").length
      ).toBe(1);
    });

    it("renders the assets/icons/codicons/dialog/gripper.svg asset", async () => {
      await renderDialog({ cache: [{ family: "Yu Gothic", displayName: "Yu Gothic" }] });
      const grip = container.querySelector(".fontPickerRowGrip");
      // A path-data fragment unique to gripper.svg's six-dot glyph.
      expect(grip?.innerHTML).toContain("M7 4C7 4.552");
      expect(grip?.querySelector("svg")).toBeTruthy();
    });

    it("has an accessible name", async () => {
      await renderDialog({
        initialValue: [{ family: "Cascadia Code", displayName: "Cascadia Code" }],
        cache: [{ family: "Yu Gothic", displayName: "Yu Gothic" }]
      });
      const grips = container.querySelectorAll<HTMLButtonElement>(".fontPickerRowGrip");
      expect(grips.length).toBeGreaterThan(0);
      for (const grip of Array.from(grips)) {
        expect(grip.getAttribute("aria-label")).toBe(
          translateJa("fontPicker.label.dragHandle")
        );
      }
    });

    it("row body click still previews the font and does not arm dragging", async () => {
      await renderDialog({
        initialValue: [{ family: "Cascadia Code", displayName: "Cascadia Code" }],
        cache: [{ family: "Yu Gothic", displayName: "Yu Gothic" }]
      });
      const availableRowButton = availableRowButtons(container)[0];
      await step(() => availableRowButton?.click());

      const preview = container.querySelector<HTMLElement>(".fontPickerSamplePreview");
      expect(preview?.style.fontFamily).toContain("Yu Gothic");

      const li = rowLiOf(availableRowButton);
      expect(li?.getAttribute("draggable")).not.toBe("true");
    });

    it("mousedown on the gripper arms the row for dragging", async () => {
      await renderDialog({
        initialValue: [{ family: "Cascadia Code", displayName: "Cascadia Code" }]
      });
      const grip = container.querySelector<HTMLButtonElement>(
        ".fontPickerPane-selected .fontPickerRowGrip"
      );
      const li = rowLiOf(grip);
      expect(li?.getAttribute("draggable")).not.toBe("true");

      await step(() => mousedown(grip));
      expect(li?.getAttribute("draggable")).toBe("true");
    });

    it("clicking/dragging the gripper handle does not trigger click-to-preview", async () => {
      await renderDialog({
        initialValue: [{ family: "Cascadia Code", displayName: "Cascadia Code" }],
        cache: [{ family: "Yu Gothic", displayName: "Yu Gothic" }]
      });
      const grip = container.querySelector<HTMLButtonElement>(
        ".fontPickerPane-available .fontPickerRowGrip"
      );
      const previewBefore = container.querySelector<HTMLElement>(
        ".fontPickerSamplePreview"
      )?.style.fontFamily;

      await step(() => mousedown(grip));
      await step(() => grip?.click());
      await step(() => mouseup(grip));

      const previewAfter = container.querySelector<HTMLElement>(
        ".fontPickerSamplePreview"
      )?.style.fontFamily;
      expect(previewAfter).toBe(previewBefore);
      expect(previewAfter).toContain("Cascadia Code");
    });

    it("search input and sample textarea never carry a draggable attribute", async () => {
      await renderDialog({
        initialValue: [{ family: "Cascadia Code", displayName: "Cascadia Code" }],
        cache: [{ family: "Yu Gothic", displayName: "Yu Gothic" }]
      });
      const searchInput = container.querySelector(".fontPickerSearchInput");
      const sampleInput = container.querySelector(".fontPickerSampleInput");
      expect(searchInput?.getAttribute("draggable")).toBeNull();
      expect(sampleInput?.getAttribute("draggable")).toBeNull();
    });

    it("Apply and Cancel buttons never carry a draggable attribute", async () => {
      await renderDialog({
        initialValue: [{ family: "Cascadia Code", displayName: "Cascadia Code" }]
      });
      const applyBtn = container.querySelector(".appDialogButton-primary");
      const cancelBtn = container.querySelector(".appDialogButton-cancel");
      expect(applyBtn?.getAttribute("draggable")).toBeNull();
      expect(cancelBtn?.getAttribute("draggable")).toBeNull();
    });
  });

  describe("drag and drop behavior", () => {
    it("right-to-left drag adopts an available font (append on empty-space drop), and it disappears from the available pane", async () => {
      const onSaveMock = vi.fn();
      await renderDialog({
        initialValue: [{ family: "Cascadia Code", displayName: "Cascadia Code" }],
        cache: [{ family: "Yu Gothic", displayName: "Yu Gothic" }],
        onSave: onSaveMock
      });

      const availableLi = rowLiOf(availableRowButtons(container)[0]);
      const selectedBox = container.querySelector<HTMLElement>(".fontPickerSelectedListBox");
      await performDrag(availableLi, selectedBox);

      const selectedNames = names(selectedRowButtons(container));
      expect(selectedNames.length).toBe(2);
      expect(selectedNames[0]).toContain("Cascadia Code");
      expect(selectedNames[1]).toContain("Yu Gothic");
      expect(names(availableRowButtons(container)).some((t) => t?.includes("Yu Gothic"))).toBe(
        false
      );
      expect(onSaveMock).not.toHaveBeenCalled();
    });

    it("right-to-left drag onto a specific selected row inserts it at that position", async () => {
      await renderDialog({
        initialValue: [
          { family: "Cascadia Code", displayName: "Cascadia Code" },
          { family: "BIZ UD Gothic", displayName: "BIZ UD Gothic" }
        ],
        cache: [{ family: "Yu Gothic", displayName: "Yu Gothic" }]
      });

      const availableLi = rowLiOf(availableRowButtons(container)[0]);
      const firstSelectedLi = container.querySelector<HTMLLIElement>(
        ".fontPickerPane-selected li[data-row-index='0']"
      );
      await performDrag(availableLi, firstSelectedLi, 0);

      const selectedNames = names(selectedRowButtons(container));
      expect(selectedNames.length).toBe(3);
      expect(selectedNames[0]).toContain("Yu Gothic");
      expect(selectedNames[1]).toContain("Cascadia Code");
      expect(selectedNames[2]).toContain("BIZ UD Gothic");
    });

    it("left-to-right drag unadopts a selected font, which reappears in the available pane if still cached", async () => {
      const onSaveMock = vi.fn();
      await renderDialog({
        initialValue: [
          { family: "Cascadia Code", displayName: "Cascadia Code" },
          { family: "Yu Gothic", displayName: "Yu Gothic" }
        ],
        cache: [{ family: "Yu Gothic", displayName: "Yu Gothic" }],
        onSave: onSaveMock
      });

      const targetLi = rowLiOf(selectedRowButtons(container)[1]);
      const availableBox = container.querySelector<HTMLElement>(".fontPickerAvailableListBox");
      await performDrag(targetLi, availableBox);

      const selectedNames = names(selectedRowButtons(container));
      expect(selectedNames.length).toBe(1);
      expect(selectedNames[0]).toContain("Cascadia Code");
      expect(names(availableRowButtons(container)).some((t) => t?.includes("Yu Gothic"))).toBe(
        true
      );
      expect(onSaveMock).not.toHaveBeenCalled();
    });

    it("left-to-right drag unadopts a font missing from the cache without crashing, and it does not reappear on the right", async () => {
      await renderDialog({
        initialValue: [
          { family: "Cascadia Code", displayName: "Cascadia Code" },
          { family: "NonExistentFont", displayName: "NonExistentFont" }
        ],
        cache: []
      });

      const targetLi = rowLiOf(selectedRowButtons(container)[1]);
      const availableBox = container.querySelector<HTMLElement>(".fontPickerAvailableListBox");
      await performDrag(targetLi, availableBox);

      const selectedNames = names(selectedRowButtons(container));
      expect(selectedNames.length).toBe(1);
      expect(selectedNames[0]).toContain("Cascadia Code");
      expect(
        names(availableRowButtons(container)).some((t) => t?.includes("NonExistentFont"))
      ).toBe(false);
    });

    it("left-pane internal drag reorders selected fonts", async () => {
      await renderDialog({
        initialValue: [
          { family: "Cascadia Code", displayName: "Cascadia Code" },
          { family: "BIZ UD Gothic", displayName: "BIZ UD Gothic" },
          { family: "Yu Gothic", displayName: "Yu Gothic" }
        ]
      });

      const draggedLi = rowLiOf(selectedRowButtons(container)[2]); // Yu Gothic
      const targetLi = container.querySelector<HTMLLIElement>(
        ".fontPickerPane-selected li[data-row-index='1']"
      ); // BIZ UD Gothic
      await performDrag(draggedLi, targetLi, 0);

      const namesAfter = names(selectedRowButtons(container));
      expect(namesAfter[0]).toContain("Cascadia Code");
      expect(namesAfter[1]).toContain("Yu Gothic");
      expect(namesAfter[2]).toContain("BIZ UD Gothic");
    });

    it("a missing-from-cache selected font can be reordered within the left pane", async () => {
      await renderDialog({
        initialValue: [
          { family: "Cascadia Code", displayName: "Cascadia Code" },
          { family: "NonExistentFont", displayName: "NonExistentFont" }
        ]
      });

      const draggedLi = rowLiOf(selectedRowButtons(container)[1]); // NonExistentFont
      const targetLi = container.querySelector<HTMLLIElement>(
        ".fontPickerPane-selected li[data-row-index='0']"
      );
      await performDrag(draggedLi, targetLi, 0);

      const namesAfter = names(selectedRowButtons(container));
      expect(namesAfter[0]).toContain("NonExistentFont");
      expect(namesAfter[1]).toContain("Cascadia Code");
    });

    it("prevents a duplicate adopt: an already-selected family is excluded from the available pane entirely", async () => {
      await renderDialog({
        initialValue: [{ family: "Cascadia Code", displayName: "Cascadia Code" }],
        cache: [{ family: "Cascadia Code", displayName: "Cascadia Code" }]
      });
      expect(
        names(availableRowButtons(container)).some((t) => t?.includes("Cascadia Code"))
      ).toBe(false);
    });

    it("an invalid drop (no drag in progress) leaves the selected order unchanged", async () => {
      await renderDialog({
        initialValue: [
          { family: "Cascadia Code", displayName: "Cascadia Code" },
          { family: "BIZ UD Gothic", displayName: "BIZ UD Gothic" }
        ]
      });
      const before = names(selectedRowButtons(container));
      const selectedBox = container.querySelector<HTMLElement>(".fontPickerSelectedListBox");
      await step(() => drop(selectedBox));
      expect(names(selectedRowButtons(container))).toEqual(before);
    });

    it("a drag cancelled outside both panes (dragend with no drop) leaves the selected order unchanged", async () => {
      await renderDialog({
        initialValue: [
          { family: "Cascadia Code", displayName: "Cascadia Code" },
          { family: "BIZ UD Gothic", displayName: "BIZ UD Gothic" }
        ]
      });
      const before = names(selectedRowButtons(container));
      const li = rowLiOf(selectedRowButtons(container)[0]);
      const grip = gripOf(li);

      await step(() => mousedown(grip));
      await step(() => dragStart(li));
      await step(() => dragEnd(li));

      expect(names(selectedRowButtons(container))).toEqual(before);
      expect(li?.getAttribute("draggable")).not.toBe("true");
    });

    it("Apply saves the drag-reordered/adopted/unadopted list as a structured array; Cancel discards it", async () => {
      const onSaveMock = vi.fn();
      const onCloseMock = vi.fn();
      await renderDialog({
        initialValue: [
          { family: "Cascadia Code", displayName: "Cascadia Code" },
          { family: "BIZ UD Gothic", displayName: "BIZ UD Gothic" }
        ],
        onSave: onSaveMock,
        onClose: onCloseMock
      });

      const draggedLi = rowLiOf(selectedRowButtons(container)[1]); // BIZ UD Gothic
      const targetLi = container.querySelector<HTMLLIElement>(
        ".fontPickerPane-selected li[data-row-index='0']"
      );
      await performDrag(draggedLi, targetLi, 0);

      const cancelBtn = container.querySelector<HTMLButtonElement>(".appDialogButton-cancel");
      await step(() => cancelBtn?.click());
      expect(onSaveMock).not.toHaveBeenCalled();
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it("Apply persists the drag-reordered list", async () => {
      const onSaveMock = vi.fn();
      await renderDialog({
        initialValue: [
          { family: "Cascadia Code", displayName: "Cascadia Code" },
          { family: "BIZ UD Gothic", displayName: "BIZ UD Gothic" }
        ],
        onSave: onSaveMock
      });

      const draggedLi = rowLiOf(selectedRowButtons(container)[1]); // BIZ UD Gothic
      const targetLi = container.querySelector<HTMLLIElement>(
        ".fontPickerPane-selected li[data-row-index='0']"
      );
      await performDrag(draggedLi, targetLi, 0);

      const applyBtn = container.querySelector<HTMLButtonElement>(".appDialogButton-primary");
      await step(() => applyBtn?.click());

      expect(onSaveMock).toHaveBeenCalledWith([
        { family: "BIZ UD Gothic", displayName: "BIZ UD Gothic" },
        { family: "Cascadia Code", displayName: "Cascadia Code" }
      ]);
    });

    it("allows an empty selected list (no drags performed) to be applied", async () => {
      const onSaveMock = vi.fn();
      await renderDialog({ initialValue: [], onSave: onSaveMock });
      const applyBtn = container.querySelector<HTMLButtonElement>(".appDialogButton-primary");
      await step(() => applyBtn?.click());
      expect(onSaveMock).toHaveBeenCalledWith([]);
    });

    it("filters the available list by search query", async () => {
      await renderDialog({
        cache: [
          { family: "Cascadia Code", displayName: "Cascadia Code" },
          { family: "Yu Gothic", displayName: "Yu Gothic" },
          { family: "BIZ UD Gothic", displayName: "BIZ UD Gothic" }
        ]
      });
      const searchInput = container.querySelector<HTMLInputElement>(".fontPickerSearchInput");
      await step(() => {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        )?.set;
        nativeInputValueSetter?.call(searchInput, "BIZ");
        searchInput!.dispatchEvent(new Event("input", { bubbles: true }));
      });
      const availableNames = names(availableRowButtons(container));
      expect(availableNames.length).toBe(1);
      expect(availableNames[0]).toContain("BIZ UD Gothic");
    });

    it("does NOT invoke onSave when Cancel is clicked", async () => {
      const onSaveMock = vi.fn();
      const onCloseMock = vi.fn();
      await renderDialog({ cache: "notScanned", onSave: onSaveMock, onClose: onCloseMock });
      const cancelBtn = container.querySelector<HTMLButtonElement>(".appDialogButton-cancel");
      await step(() => cancelBtn?.click());
      expect(onSaveMock).not.toHaveBeenCalled();
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("click-to-preview", () => {
    it("clicking an available font row previews it without adopting it", async () => {
      await renderDialog({
        initialValue: [{ family: "Cascadia Code", displayName: "Cascadia Code" }],
        cache: [{ family: "Yu Gothic", displayName: "Yu Gothic" }]
      });
      await step(() => availableRowButtons(container)[0]?.click());

      const preview = container.querySelector<HTMLElement>(".fontPickerSamplePreview");
      expect(preview?.style.fontFamily).toContain("Yu Gothic");
      expect(preview?.style.fontFamily).not.toContain("Cascadia Code");
      expect(selectedRowButtons(container).length).toBe(1);
      expect(selectedRowButtons(container)[0].textContent).toContain("Cascadia Code");
    });

    it("clicking a selected font row previews it without reordering/removing it or saving", async () => {
      const onSaveMock = vi.fn();
      const onCloseMock = vi.fn();
      const initialValue = [
        { family: "Cascadia Code", displayName: "Cascadia Code" },
        { family: "BIZ UD Gothic", displayName: "BIZ UD Gothic" }
      ];
      await renderDialog({ initialValue, onSave: onSaveMock, onClose: onCloseMock });

      await step(() => selectedRowButtons(container)[1]?.click());

      const preview = container.querySelector<HTMLElement>(".fontPickerSamplePreview");
      expect(preview?.style.fontFamily).toContain("BIZ UD Gothic");
      expect(preview?.style.fontFamily).not.toContain("Cascadia Code");

      const rowsAfter = names(selectedRowButtons(container));
      expect(rowsAfter.length).toBe(2);
      expect(rowsAfter[0]).toContain("Cascadia Code");
      expect(rowsAfter[1]).toContain("BIZ UD Gothic");
      expect(onSaveMock).not.toHaveBeenCalled();
      expect(onCloseMock).not.toHaveBeenCalled();

      const applyBtn = container.querySelector<HTMLButtonElement>(".appDialogButton-primary");
      await step(() => applyBtn?.click());
      expect(onSaveMock).toHaveBeenCalledWith(initialValue);
    });

    it("does not call onSave when clicking rows", async () => {
      const onSaveMock = vi.fn();
      await renderDialog({
        initialValue: [{ family: "Cascadia Code", displayName: "Cascadia Code" }],
        cache: [{ family: "Yu Gothic", displayName: "Yu Gothic" }],
        onSave: onSaveMock
      });
      await step(() => {
        availableRowButtons(container)[0]?.click();
        selectedRowButtons(container)[0]?.click();
      });
      expect(onSaveMock).not.toHaveBeenCalled();
    });

    it("the selected-list preview mode control still shows the full selected list, and resets after a drag", async () => {
      await renderDialog({
        initialValue: [{ family: "Cascadia Code", displayName: "Cascadia Code" }],
        cache: [{ family: "Yu Gothic", displayName: "Yu Gothic" }]
      });

      let preview = container.querySelector<HTMLElement>(".fontPickerSamplePreview");
      expect(preview?.style.fontFamily).toContain("Cascadia Code");

      await step(() => availableRowButtons(container)[0]?.click());
      preview = container.querySelector<HTMLElement>(".fontPickerSamplePreview");
      expect(preview?.style.fontFamily).toContain("Yu Gothic");
      expect(preview?.style.fontFamily).not.toContain("Cascadia Code");

      const availableLi = rowLiOf(availableRowButtons(container)[0]);
      const selectedBox = container.querySelector<HTMLElement>(".fontPickerSelectedListBox");
      await performDrag(availableLi, selectedBox);

      preview = container.querySelector<HTMLElement>(".fontPickerSamplePreview");
      expect(preview?.style.fontFamily).toContain("Cascadia Code");
      expect(preview?.style.fontFamily).toContain("Yu Gothic");

      const previewBtn = container.querySelector<HTMLButtonElement>(
        ".fontPickerPreviewModeButton"
      );
      expect(previewBtn?.getAttribute("aria-pressed")).toBe("true");
    });
  });

  describe("editable sample text", () => {
    it("renders default sample text and updates preview text on edit; sample text is not saved", async () => {
      const onSaveMock = vi.fn();
      await renderDialog({
        initialValue: [{ family: "Cascadia Code", displayName: "Cascadia Code" }],
        cache: "notScanned",
        onSave: onSaveMock
      });

      const textarea = container.querySelector<HTMLTextAreaElement>(".fontPickerSampleInput");
      expect(textarea?.value).toBe(translateJa("fontPicker.sampleText"));

      await step(() => {
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
      await step(() => applyBtn?.click());

      expect(onSaveMock).toHaveBeenCalledWith([
        { family: "Cascadia Code", displayName: "Cascadia Code" }
      ]);
      expect(JSON.stringify(onSaveMock.mock.calls[0][0])).not.toContain("カスタム見本文");
    });

    it("editable sample text is dialog-local: editing then closing via Cancel never saves it, and reopening resets to the default", async () => {
      const onSaveMock = vi.fn();
      let onCloseCalls = 0;
      let isOpen = true;

      const doRender = async () => {
        (window as any).pergamum = { fontCache: { load: vi.fn().mockResolvedValue({ status: "notScanned" }) } };
        await act(async () => {
          root.render(
            <FontPickerDialog
              isOpen={isOpen}
              slot="editor.fontFamilyList"
              initialValue={[{ family: "Cascadia Code", displayName: "Cascadia Code" }]}
              translate={translateJa}
              onSave={onSaveMock}
              onClose={() => {
                onCloseCalls += 1;
                isOpen = false;
              }}
            />
          );
        });
      };
      const textarea = () =>
        container.querySelector<HTMLTextAreaElement>(".fontPickerSampleInput");

      await doRender();
      expect(textarea()?.value).toBe(translateJa("fontPicker.sampleText"));

      await step(() => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value"
        )?.set;
        nativeSetter?.call(textarea(), "破棄されるべきテキスト");
        textarea()!.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(textarea()?.value).toBe("破棄されるべきテキスト");

      const cancelBtn = container.querySelector<HTMLButtonElement>(".appDialogButton-cancel");
      await step(() => cancelBtn?.click());
      expect(onCloseCalls).toBe(1);
      expect(onSaveMock).not.toHaveBeenCalled();
      await doRender(); // isOpen is now false.

      isOpen = true;
      await doRender();
      expect(textarea()?.value).toBe(translateJa("fontPicker.sampleText"));
      expect(textarea()?.value).not.toBe("破棄されるべきテキスト");
    });
  });

  describe("full-width sample area", () => {
    it("renders the sample input and preview below both panes, not nested inside either", async () => {
      await renderDialog({ cache: "notScanned" });

      const content = container.querySelector(".fontPickerContent");
      const panes = content?.querySelector(":scope > .fontPickerPanes");
      const sampleSection = content?.querySelector(":scope > .fontPickerSampleSection");
      expect(panes).toBeTruthy();
      expect(sampleSection).toBeTruthy();

      // Sibling of `.fontPickerPanes`, not a descendant of either pane.
      expect(
        container.querySelector(".fontPickerPane-selected .fontPickerSampleSection")
      ).toBeNull();
      expect(
        container.querySelector(".fontPickerPane-available .fontPickerSampleSection")
      ).toBeNull();

      // DOM order: panes come before the sample section.
      const position = panes!.compareDocumentPosition(sampleSection!);
      expect(Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);

      const textarea = sampleSection?.querySelector(".fontPickerSampleInput");
      const preview = sampleSection?.querySelector(".fontPickerSamplePreview");
      expect(textarea).toBeTruthy();
      expect(preview).toBeTruthy();
    });

    it("sample preview updates on sample text edit and on click-to-preview font changes", async () => {
      await renderDialog({
        initialValue: [{ family: "Cascadia Code", displayName: "Cascadia Code" }],
        cache: [{ family: "Yu Gothic", displayName: "Yu Gothic" }]
      });

      const textarea = container.querySelector<HTMLTextAreaElement>(".fontPickerSampleInput");
      await step(() => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value"
        )?.set;
        nativeSetter?.call(textarea, "編集テキスト");
        textarea!.dispatchEvent(new Event("input", { bubbles: true }));
      });
      let preview = container.querySelector<HTMLElement>(".fontPickerSamplePreview");
      expect(preview?.textContent).toBe("編集テキスト");

      await step(() => availableRowButtons(container)[0]?.click());
      preview = container.querySelector<HTMLElement>(".fontPickerSamplePreview");
      expect(preview?.textContent).toBe("編集テキスト");
      expect(preview?.style.fontFamily).toContain("Yu Gothic");
    });

    it("sample text is not persisted across reopen", async () => {
      let isOpen = true;
      const doRender = async () => {
        (window as any).pergamum = { fontCache: { load: vi.fn().mockResolvedValue({ status: "notScanned" }) } };
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
      const textarea = () =>
        container.querySelector<HTMLTextAreaElement>(".fontPickerSampleInput");

      await doRender();
      await step(() => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value"
        )?.set;
        nativeSetter?.call(textarea(), "一時テキスト");
        textarea()!.dispatchEvent(new Event("input", { bubbles: true }));
      });

      isOpen = false;
      await doRender();
      isOpen = true;
      await doRender();

      expect(textarea()?.value).toBe(translateJa("fontPicker.sampleText"));
    });
  });

  describe("cache state", () => {
    it("does NOT call queryLocalFonts automatically on dialog open, and shows the not-scanned notice", async () => {
      const queryLocalFontsMock = vi.fn();
      (window as any).queryLocalFonts = queryLocalFontsMock;
      await renderDialog({
        initialValue: [{ family: "Cascadia Code", displayName: "Cascadia Code" }],
        cache: "notScanned"
      });
      expect(queryLocalFontsMock).not.toHaveBeenCalled();
      const notice = container.querySelector(".fontPickerNotice-warning");
      expect(notice?.textContent).toBe(translateJa("fontPicker.cacheNotScanned"));
    });

    it("shows the error state safely without crashing", async () => {
      await renderDialog({ cache: { status: "error", message: "boom" } });
      const notice = container.querySelector(".fontPickerNotice-error");
      expect(notice?.textContent).toBe("boom");
    });

    it("does not show the language mismatch warning when cache uiLanguage matches the current UI language", async () => {
      await renderDialog({
        cache: [{ family: "Yu Gothic", displayName: "游ゴシック" }],
        cacheUiLanguage: "ja",
        uiLanguage: "ja"
      });

      expect(container.querySelector(".fontPickerCacheLanguageWarning")).toBeNull();
    });

    it("shows the language mismatch warning without scanning, saving, or blocking loaded cache use", async () => {
      const queryLocalFontsMock = vi.fn();
      const onSaveMock = vi.fn();
      (window as any).queryLocalFonts = queryLocalFontsMock;
      await renderDialog({
        cache: [{ family: "Yu Gothic", displayName: "游ゴシック" }],
        cacheUiLanguage: "en",
        uiLanguage: "ja",
        onSave: onSaveMock
      });

      const warning = container.querySelector(".fontPickerCacheLanguageWarning");
      expect(warning?.textContent).toBe(
        translateJa("fontCache.warning.languageMismatch")
      );
      expect(availableRowButtons(container).length).toBe(1);
      expect(availableRowButtons(container)[0].textContent).toContain(
        "Yu Gothic / 游ゴシック"
      );
      expect(queryLocalFontsMock).not.toHaveBeenCalled();
      expect((window as any).pergamum.fontCache).not.toHaveProperty("save");
      expect(onSaveMock).not.toHaveBeenCalled();
    });

    it("does not render the local font family count in the dialog", async () => {
      await renderDialog({
        cache: [
          { family: "Yu Gothic", displayName: "游ゴシック" },
          { family: "Cascadia Code", displayName: "Cascadia Code" }
        ]
      });

      expect(container.textContent).not.toContain("2 ファミリー");
      expect(container.textContent).not.toContain("2 families");
      expect(container.textContent).not.toContain("ローカルフォント:");
      expect(container.textContent).not.toContain("Local fonts:");
    });

    it("clicking font rows does not call queryLocalFonts", async () => {
      const queryLocalFontsMock = vi.fn();
      (window as any).queryLocalFonts = queryLocalFontsMock;
      await renderDialog({
        initialValue: [{ family: "Cascadia Code", displayName: "Cascadia Code" }],
        cache: [{ family: "Yu Gothic", displayName: "Yu Gothic" }]
      });
      await step(() => {
        availableRowButtons(container)[0]?.click();
        selectedRowButtons(container)[0]?.click();
      });
      expect(queryLocalFontsMock).not.toHaveBeenCalled();
    });

    it("dragging/dropping rows does not call queryLocalFonts, write the font cache, or log the full font list", async () => {
      const queryLocalFontsMock = vi.fn();
      (window as any).queryLocalFonts = queryLocalFontsMock;
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await renderDialog({
        initialValue: [{ family: "Cascadia Code", displayName: "Cascadia Code" }],
        cache: [{ family: "Yu Gothic", displayName: "Yu Gothic" }]
      });

      const availableLi = rowLiOf(availableRowButtons(container)[0]);
      const selectedBox = container.querySelector<HTMLElement>(".fontPickerSelectedListBox");
      await performDrag(availableLi, selectedBox);

      expect(queryLocalFontsMock).not.toHaveBeenCalled();
      expect((window as any).pergamum.fontCache).not.toHaveProperty("save");
      for (const call of logSpy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain("Yu Gothic");
      }
      expect(container.querySelector('[class*="missingFont"]')).toBeNull();
      logSpy.mockRestore();
    });
  });

  describe("#496 localized displayName", () => {
    it("available row identity shows \"family / displayName\" when they differ", async () => {
      await renderDialog({
        initialValue: [],
        cache: [{ family: "Yu Gothic", displayName: "游ゴシック" }]
      });

      const availableRow = availableRowButtons(container)[0];
      const name = availableRow.querySelector<HTMLElement>(".fontPickerRowName");
      const sample = availableRow.querySelector<HTMLElement>(".fontPickerRowSample");
      expect(name?.textContent).toBe("Yu Gothic / 游ゴシック");
      // Identity line: normal UI font, no represented-font style.
      expect(name?.style.fontFamily).toBe("");
      // Mini sample CSS uses the CSS-facing `family`, never the localized
      // displayName.
      expect(sample?.style.fontFamily).toContain("Yu Gothic");
      expect(sample?.style.fontFamily).not.toContain("游ゴシック");

      await step(() => availableRow.click());
      const preview = container.querySelector<HTMLElement>(".fontPickerSamplePreview");
      expect(preview?.style.fontFamily).toContain("Yu Gothic");
      expect(preview?.style.fontFamily).not.toContain("游ゴシック");
    });

    it("row identity shows only one name when family === displayName (no duplication)", async () => {
      await renderDialog({
        cache: [{ family: "Cascadia Code", displayName: "Cascadia Code" }]
      });
      const name = availableRowButtons(container)[0].querySelector<HTMLElement>(
        ".fontPickerRowName"
      );
      expect(name?.textContent).toBe("Cascadia Code");
      expect(name?.textContent).not.toContain("/");
    });

    it("selected row identity also shows \"family / displayName\" (index prefix retained), and only one name when equal", async () => {
      await renderDialog({
        initialValue: [
          { family: "Yu Gothic", displayName: "游ゴシック" },
          { family: "Cascadia Code", displayName: "Cascadia Code" }
        ]
      });
      const rows = selectedRowButtons(container);
      const name0 = rows[0].querySelector<HTMLElement>(".fontPickerRowName");
      const name1 = rows[1].querySelector<HTMLElement>(".fontPickerRowName");
      expect(name0?.textContent).toBe("1.Yu Gothic / 游ゴシック");
      expect(name0?.style.fontFamily).toBe("");
      expect(name1?.textContent).toBe("2.Cascadia Code");
      expect(name1?.textContent).not.toContain("/");
    });

    it("does not append a localized name for a TTC sibling that has no localized family name", async () => {
      await renderDialog({
        cache: [
          { family: "Yu Gothic", displayName: "游ゴシック" },
          { family: "Yu Gothic UI", displayName: "Yu Gothic UI" }
        ]
      });
      const rowNames = availableRowButtons(container).map(
        (b) => b.querySelector(".fontPickerRowName")?.textContent
      );
      expect(rowNames).toContain("Yu Gothic / 游ゴシック");
      expect(rowNames).toContain("Yu Gothic UI");
      expect(rowNames).not.toContain("Yu Gothic UI / 游ゴシック");
      expect(new Set(rowNames).size).toBe(2);
    });

    it("row structure keeps identity and mini sample as two non-overlapping lines with a stable, ellipsis-capable class structure", async () => {
      const longFamily = "A".repeat(60);
      const longDisplayName = "ロング".repeat(30);
      await renderDialog({
        initialValue: [{ family: longFamily, displayName: longDisplayName }],
        cache: [{ family: "Yu Gothic", displayName: "游ゴシック" }]
      });

      for (const button of [
        ...selectedRowButtons(container),
        ...availableRowButtons(container)
      ]) {
        const name = button.querySelector<HTMLElement>(".fontPickerRowName");
        const sample = button.querySelector<HTMLElement>(".fontPickerRowSample");
        expect(name).toBeTruthy();
        expect(sample).toBeTruthy();
        // Two distinct elements — identity and sample never share a node.
        expect(name).not.toBe(sample);
        expect(name?.contains(sample!)).toBe(false);
        expect(sample?.contains(name!)).toBe(false);
      }

      // Full (unellipsized-in-the-DOM) text survives even for extreme
      // lengths — truncation is a CSS (ellipsis) concern, not a data-loss one.
      const selectedName = selectedRowButtons(container)[0].querySelector(
        ".fontPickerRowName"
      );
      expect(selectedName?.textContent).toContain(longFamily);
      expect(selectedName?.textContent).toContain(longDisplayName);
    });

    it("each font row is one stable entity container (.fontPickerRow) with a grip and a body, and the body contains both lines — identical structure in both panes", async () => {
      await renderDialog({
        initialValue: [{ family: "Cascadia Code", displayName: "Cascadia Code" }],
        cache: [{ family: "Yu Gothic", displayName: "游ゴシック" }]
      });

      const selectedRow = container.querySelector(
        ".fontPickerPane-selected .fontPickerRow"
      );
      const availableRow = container.querySelector(
        ".fontPickerPane-available .fontPickerRow"
      );
      expect(selectedRow).toBeTruthy();
      expect(availableRow).toBeTruthy();

      for (const row of [selectedRow, availableRow]) {
        // Entity container: exactly the grip and the body, as direct
        // children — nothing absolutely positioned floating outside it.
        const children = Array.from(row!.children);
        expect(children.length).toBe(2);
        expect(children[0].classList.contains("fontPickerRowGrip")).toBe(true);
        expect(children[1].classList.contains("fontPickerRowButton")).toBe(true);

        // The body is the single containing element for both lines.
        const body = children[1];
        const name = body.querySelector(".fontPickerRowName");
        const sample = body.querySelector(".fontPickerRowSample");
        expect(name).toBeTruthy();
        expect(sample).toBeTruthy();
        expect(body.contains(name)).toBe(true);
        expect(body.contains(sample)).toBe(true);
        // Neither line lives outside the body (no loose siblings, no
        // absolutely-positioned overlay elements elsewhere in the row).
        expect(row!.querySelectorAll(".fontPickerRowName").length).toBe(1);
        expect(row!.querySelectorAll(".fontPickerRowSample").length).toBe(1);
      }

      expect(container.innerHTML).not.toContain("dangerouslySetInnerHTML");
    });

    it("adopting via D&D preserves { family, displayName } exactly as cached, ready to be saved by Apply", async () => {
      const onSaveMock = vi.fn();
      await renderDialog({
        initialValue: [],
        cache: [{ family: "Yu Gothic", displayName: "游ゴシック" }],
        onSave: onSaveMock
      });

      const availableLi = rowLiOf(availableRowButtons(container)[0]);
      const selectedBox = container.querySelector<HTMLElement>(".fontPickerSelectedListBox");
      await performDrag(availableLi, selectedBox);

      const applyBtn = container.querySelector<HTMLButtonElement>(".appDialogButton-primary");
      await step(() => applyBtn?.click());

      expect(onSaveMock).toHaveBeenCalledWith([
        { family: "Yu Gothic", displayName: "游ゴシック" }
      ]);
    });

    it("search matches the localized displayName", async () => {
      await renderDialog({
        cache: [
          { family: "Yu Gothic", displayName: "游ゴシック" },
          { family: "Cascadia Code", displayName: "Cascadia Code" }
        ]
      });
      const searchInput = container.querySelector<HTMLInputElement>(".fontPickerSearchInput");
      await step(() => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        )?.set;
        setter?.call(searchInput, "ゴシック");
        searchInput!.dispatchEvent(new Event("input", { bubbles: true }));
      });
      const availableNames = names(availableRowButtons(container));
      expect(availableNames.length).toBe(1);
      expect(availableNames[0]).toContain("游ゴシック");
    });

    it("search still matches family even when displayName is localized and unrelated-looking", async () => {
      await renderDialog({
        cache: [{ family: "Yu Gothic", displayName: "游ゴシック" }]
      });
      const searchInput = container.querySelector<HTMLInputElement>(".fontPickerSearchInput");
      await step(() => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        )?.set;
        setter?.call(searchInput, "Yu Gothic");
        searchInput!.dispatchEvent(new Event("input", { bubbles: true }));
      });
      const availableNames = names(availableRowButtons(container));
      expect(availableNames.length).toBe(1);
      expect(availableNames[0]).toContain("游ゴシック");
    });
  });
});
