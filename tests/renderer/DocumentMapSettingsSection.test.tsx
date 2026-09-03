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
});
