// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultApplicationSettings } from "../../src/shared/settings";
import type { Translate } from "../../src/shared/i18n";
import { DocumentMapSettingsSection } from "../../src/renderer/DocumentMapSettingsSection";

const translate: Translate = (key) => key;

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
});

function render(
  props: Partial<React.ComponentProps<typeof DocumentMapSettingsSection>> = {}
) {
  const onChangeSettings = vi.fn();
  act(() => {
    root.render(
      React.createElement(DocumentMapSettingsSection, {
        settings: defaultApplicationSettings,
        isLoading: false,
        translate,
        onChangeSettings,
        ...props
      })
    );
  });
  return { onChangeSettings };
}

function q<T extends Element>(selector: string): T {
  const el = container.querySelector<T>(selector);
  if (!el) throw new Error(`no element for ${selector}`);
  return el;
}

function setInput(el: HTMLInputElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function lastDocumentMap(onChangeSettings: ReturnType<typeof vi.fn>) {
  return onChangeSettings.mock.calls.at(-1)![0].documentMap;
}

describe("DocumentMapSettingsSection (#375)", () => {
  it("names itself for a11y without rendering a visible heading (the Settings pane owns the title)", () => {
    render();
    const section = q<HTMLElement>("section.documentMapSettingsSection");
    // #375 fix: no duplicate "文書マップ" heading — the name is on aria-label,
    // and the section renders no heading element of its own.
    expect(section.getAttribute("aria-label")).toBe("settings.documentMap.title");
    expect(
      container.querySelectorAll("h1, h2, h3").length
    ).toBe(0);
  });

  it("renders the two colour fields with a text + colour input", () => {
    render();
    expect(container.textContent).toContain(
      "settings.documentMap.narrationColor.label"
    );
    expect(container.textContent).toContain(
      "settings.documentMap.glossaryFallbackColor.label"
    );
    // narration + fallback + one dialogue pair → 3 colour text + 3 colour pickers.
    expect(
      container.querySelectorAll(".documentMapSettingsColorText")
    ).toHaveLength(3);
    expect(container.querySelectorAll('input[type="color"]')).toHaveLength(3);
  });

  it("renders the viewport-lens opacity control at the TOP, with a range + text input showing 0.28", () => {
    render();
    const section = q<HTMLElement>("section.documentMapSettingsSection");
    const opacityField = q<HTMLElement>(".documentMapSettingsOpacityField");
    // First child of the section → it is above the colour fields.
    expect(section.firstElementChild).toBe(opacityField);

    expect(container.textContent).toContain(
      "settings.documentMap.viewportLensOpacity.label"
    );
    expect(
      q<HTMLInputElement>(".documentMapSettingsOpacityRange").type
    ).toBe("range");
    expect(
      q<HTMLInputElement>(".documentMapSettingsOpacityText").value
    ).toBe("0.28");
  });

  it("saves a valid viewport-lens opacity from the text input and rejects an out-of-range one", () => {
    const { onChangeSettings } = render();
    setInput(q<HTMLInputElement>(".documentMapSettingsOpacityText"), "0.5");
    expect(lastDocumentMap(onChangeSettings).viewportLensOpacity).toBe(0.5);

    onChangeSettings.mockClear();
    setInput(q<HTMLInputElement>(".documentMapSettingsOpacityText"), "0");
    expect(container.textContent).toContain(
      "settings.documentMap.viewportLensOpacity.invalid"
    );
    expect(onChangeSettings).not.toHaveBeenCalled();

    onChangeSettings.mockClear();
    setInput(q<HTMLInputElement>(".documentMapSettingsOpacityText"), "1");
    expect(onChangeSettings).not.toHaveBeenCalled();
  });

  it("saves the opacity when the range slider moves", () => {
    const { onChangeSettings } = render();
    setInput(q<HTMLInputElement>(".documentMapSettingsOpacityRange"), "0.7");
    expect(lastDocumentMap(onChangeSettings).viewportLensOpacity).toBe(0.7);
  });

  it("renders one dialogue-pair row per pair with a ⣿ handle", () => {
    render();
    const rows = container.querySelectorAll(
      ".documentMapSettingsDialoguePairRow"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector(".glossaryEntryTagAssignmentDragHandle")?.textContent).toBe(
      "⣿"
    );
    expect(
      rows[0]
        .querySelector(".glossaryEntryTagAssignmentDragHandle")
        ?.getAttribute("aria-label")
    ).toBe("settings.documentMap.dialogueDelimiterPairs.reorder");
  });

  it("saves the normalised narration colour when the text input changes", () => {
    const { onChangeSettings } = render();
    setInput(q<HTMLInputElement>(".documentMapSettingsColorText"), "#ABCDEF");
    expect(lastDocumentMap(onChangeSettings).narrationColor).toBe("#abcdef");
  });

  it("shows an error and does NOT save an invalid colour text", () => {
    const { onChangeSettings } = render();
    setInput(q<HTMLInputElement>(".documentMapSettingsColorText"), "nope");
    expect(container.textContent).toContain(
      "settings.documentMap.color.invalid"
    );
    expect(onChangeSettings).not.toHaveBeenCalled();
  });

  it("adds a dialogue pair at the end", () => {
    const { onChangeSettings } = render();
    act(() => q<HTMLButtonElement>(".documentMapSettingsAddPair").click());
    expect(lastDocumentMap(onChangeSettings).dialogueDelimiterPairs).toHaveLength(
      2
    );
    // Re-render with the saved settings and confirm the new row appears.
    render({
      settings: {
        ...defaultApplicationSettings,
        documentMap: lastDocumentMap(onChangeSettings)
      }
    });
    expect(
      container.querySelectorAll(".documentMapSettingsDialoguePairRow")
    ).toHaveLength(2);
  });

  it("deletes a dialogue pair", () => {
    const { onChangeSettings } = render({
      settings: {
        ...defaultApplicationSettings,
        documentMap: {
          ...defaultApplicationSettings.documentMap,
          dialogueDelimiterPairs: [
            { open: "「", close: "」", color: "#0000ff" },
            { open: "『", close: "』", color: "#7c3aed" }
          ]
        }
      }
    });
    act(() =>
      q<HTMLButtonElement>(".documentMapSettingsDialoguePairDelete").click()
    );
    expect(lastDocumentMap(onChangeSettings).dialogueDelimiterPairs).toEqual([
      { open: "『", close: "』", color: "#7c3aed" }
    ]);
  });

  it("reorders pairs via the Arrow Down keyboard fallback", () => {
    const { onChangeSettings } = render({
      settings: {
        ...defaultApplicationSettings,
        documentMap: {
          ...defaultApplicationSettings.documentMap,
          dialogueDelimiterPairs: [
            { open: "「", close: "」", color: "#0000ff" },
            { open: "『", close: "』", color: "#7c3aed" }
          ]
        }
      }
    });
    act(() => {
      container
        .querySelectorAll(".glossaryEntryTagAssignmentDragHandle")[0]
        .dispatchEvent(
          new window.KeyboardEvent("keydown", {
            key: "ArrowDown",
            bubbles: true
          })
        );
    });
    expect(
      lastDocumentMap(onChangeSettings).dialogueDelimiterPairs.map(
        (p: { open: string }) => p.open
      )
    ).toEqual(["『", "「"]);
  });

  it("renders the tag-colour adjustment control as the shared switch UI, checked by default", () => {
    render();
    const checkbox = q<HTMLInputElement>(
      ".documentMapSettingsAdjustTagColors"
    );
    expect(checkbox.type).toBe("checkbox");
    expect(checkbox.checked).toBe(true);
    // #375 fix: same switch styling / markup as the catalog boolean settings.
    expect(checkbox.classList.contains("settingsSwitchInput")).toBe(true);
    const header = checkbox.closest("label.settingsItemHeader");
    expect(header).not.toBeNull();
    expect(checkbox.getAttribute("aria-labelledby")).toBe(
      "documentMapSettingsAdjustTagColorsLabel"
    );
    expect(
      header?.querySelector("#documentMapSettingsAdjustTagColorsLabel")
        ?.textContent
    ).toBe("settings.documentMap.adjustTagColorsForVisibility.label");
    expect(container.textContent).toContain(
      "settings.documentMap.adjustTagColorsForVisibility.description"
    );
  });

  it("saves adjustTagColorsForVisibility=false when the checkbox is unchecked, then true again", () => {
    const { onChangeSettings } = render();
    const checkbox = q<HTMLInputElement>(
      ".documentMapSettingsAdjustTagColors"
    );

    act(() => checkbox.click());
    expect(lastDocumentMap(onChangeSettings).adjustTagColorsForVisibility).toBe(
      false
    );

    act(() => checkbox.click());
    expect(lastDocumentMap(onChangeSettings).adjustTagColorsForVisibility).toBe(
      true
    );
  });

  it("reflects an OFF setting from props", () => {
    render({
      settings: {
        ...defaultApplicationSettings,
        documentMap: {
          ...defaultApplicationSettings.documentMap,
          adjustTagColorsForVisibility: false
        }
      }
    });
    expect(
      q<HTMLInputElement>(".documentMapSettingsAdjustTagColors").checked
    ).toBe(false);
  });

  it("shows the settings.json key for every item, in order, as a code.settingsItemKey line", () => {
    render();
    const keys = Array.from(
      container.querySelectorAll("code.settingsItemKey")
    ).map((el) => el.textContent?.trim());
    expect(keys).toEqual([
      "documentMap.viewportLensOpacity",
      "documentMap.narrationColor",
      "documentMap.glossaryFallbackColor",
      "documentMap.adjustTagColorsForVisibility",
      "documentMap.dialogueDelimiterPairs"
    ]);
  });

  it("wraps each item in a `.settingsItemRow` (shared separator) — one per setting", () => {
    render();
    const section = q<HTMLElement>("section.documentMapSettingsSection");
    const rows = section.querySelectorAll(":scope > .settingsItemRow");
    expect(rows).toHaveLength(5);
    // Each row carries exactly one setting-key line.
    rows.forEach((row) => {
      expect(row.querySelectorAll("code.settingsItemKey")).toHaveLength(1);
    });
  });

  it("keeps the opacity control first even with the new key line", () => {
    render();
    const section = q<HTMLElement>("section.documentMapSettingsSection");
    expect(
      (section.firstElementChild as HTMLElement).classList.contains(
        "documentMapSettingsOpacityField"
      )
    ).toBe(true);
    expect(
      section.firstElementChild?.querySelector("code.settingsItemKey")
        ?.textContent?.trim()
    ).toBe("documentMap.viewportLensOpacity");
  });

  it("edits a pair's open / close / colour", () => {
    const { onChangeSettings } = render();
    const row = q(".documentMapSettingsDialoguePairRow");
    const [openInput, closeInput] = Array.from(
      row.querySelectorAll<HTMLInputElement>(
        ".documentMapSettingsDialogueDelimiter input"
      )
    );
    setInput(openInput, "<");
    expect(
      lastDocumentMap(onChangeSettings).dialogueDelimiterPairs[0].open
    ).toBe("<");
    setInput(closeInput, ">");
    expect(
      lastDocumentMap(onChangeSettings).dialogueDelimiterPairs[0].close
    ).toBe(">");
  });
});

describe("DocumentMapSettingsSection (#375) — CSS + wiring", () => {
  it("is rendered from the Document Map pane of SettingsPanelView", () => {
    const panelSource = readFileSync("src/renderer/SettingsPanel.tsx", "utf8");
    expect(panelSource).toContain("<DocumentMapSettingsSection");
    expect(panelSource).toContain('selectedCategoryId === "documentMap"');
  });

  it("has the drag-handle / row CSS", () => {
    const css = readFileSync("src/renderer/styles.css", "utf8");
    expect(css).toContain(".documentMapSettingsDialoguePairRow");
    expect(css).toContain(".documentMapSettingsAddPair");
  });

  it("reuses the shared Application-settings row + key styles (not a private copy)", () => {
    const css = readFileSync("src/renderer/styles.css", "utf8");
    // The section relies on these being defined once for the catalog rows.
    expect(css).toMatch(/\.settingsItemRow\s*\{[^}]*border-bottom/);
    expect(css).toContain(".settingsItemKey");
    const componentSource = readFileSync(
      "src/renderer/DocumentMapSettingsSection.tsx",
      "utf8"
    );
    expect(componentSource).toContain('className="settingsItemRow');
    expect(componentSource).toContain('className="settingsItemKey"');
  });
});
