// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DialogueDelimiterPairsEditor } from "../../src/renderer/DialogueDelimiterPairsEditor";
import { DialogueDelimiterPairDialog } from "../../src/renderer/DialogueDelimiterPairDialog";
import type { DocumentMapDialogueDelimiterPair } from "../../src/shared/documentMapSettings";
import { jaTranslations } from "../../src/shared/i18n/ja";
import { enTranslations } from "../../src/shared/i18n/en";

const translateJa = (key: string): string =>
  jaTranslations[key as keyof typeof jaTranslations] ??
  enTranslations[key as keyof typeof enTranslations] ??
  key;
const translateEn = (key: string): string =>
  enTranslations[key as keyof typeof enTranslations] ??
  jaTranslations[key as keyof typeof jaTranslations] ??
  key;

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

function changeInputValue(input: HTMLInputElement, value: string): void {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("DialogueDelimiterPairsEditor (#396 Final dogfood)", () => {
  describe("Presentation", () => {
    it("renders completed pairs as sample sentences with actual open/close delimiters and configured color", () => {
      const pairs: DocumentMapDialogueDelimiterPair[] = [
        { open: "「", close: "」", color: "#61afef" },
        { open: "『", close: "』", color: "#c678dd" }
      ];

      act(() => {
        root.render(
          <DialogueDelimiterPairsEditor
            pairs={pairs}
            translate={translateJa}
            onChange={vi.fn()}
          />
        );
      });

      const rows = container.querySelectorAll(
        ".documentMapSettingsDialoguePairRow"
      );
      expect(rows).toHaveLength(2);

      const preview0 = rows[0].querySelector(
        ".documentMapSettingsDialoguePairPreview"
      ) as HTMLElement;
      expect(preview0.textContent).toBe("「これが会話文です」");
      expect(preview0.style.color).toBe("#61afef");

      const preview1 = rows[1].querySelector(
        ".documentMapSettingsDialoguePairPreview"
      ) as HTMLElement;
      expect(preview1.textContent).toBe("『これが会話文です』");
      expect(preview1.style.color).toBe("#c678dd");
    });

    it("localizes sample text in English", () => {
      const pairs: DocumentMapDialogueDelimiterPair[] = [
        { open: "“", close: "”", color: "#98c379" }
      ];

      act(() => {
        root.render(
          <DialogueDelimiterPairsEditor
            pairs={pairs}
            translate={translateEn}
            onChange={vi.fn()}
          />
        );
      });

      const preview = container.querySelector(
        ".documentMapSettingsDialoguePairPreview"
      );
      expect(preview?.textContent).toBe("“This is dialogue.”");
    });

    it("renders empty array cleanly without rows", () => {
      act(() => {
        root.render(
          <DialogueDelimiterPairsEditor
            pairs={[]}
            translate={translateJa}
            onChange={vi.fn()}
          />
        );
      });

      expect(
        container.querySelectorAll(".documentMapSettingsDialoguePairRow")
      ).toHaveLength(0);
      expect(
        container.querySelector(".documentMapSettingsAddPair")
      ).not.toBeNull();
    });
  });

  describe("Create mode via dialog", () => {
    it("opens Add dialog, validates non-empty open/close and color, and appends valid pair", async () => {
      const onChange = vi.fn();
      const pairs: DocumentMapDialogueDelimiterPair[] = [
        { open: "「", close: "」", color: "#61afef" }
      ];

      act(() => {
        root.render(
          <DialogueDelimiterPairsEditor
            pairs={pairs}
            translate={translateJa}
            onChange={onChange}
          />
        );
      });

      // Click Add
      act(() => {
        container
          .querySelector<HTMLButtonElement>(".documentMapSettingsAddPair")
          ?.click();
      });

      const dialog = container.querySelector(".dialogueDelimiterPairDialog");
      expect(dialog).not.toBeNull();

      const inputs = container.querySelectorAll<HTMLInputElement>(
        ".dialogueDelimiterPairDialogInput"
      );
      const openInput = inputs[0];
      const closeInput = inputs[1];
      const colorInput = container.querySelector<HTMLInputElement>(
        ".dialogueDelimiterPairDialogColorText"
      )!;

      // 1. Incomplete open/close -> save fails
      act(() => {
        changeInputValue(openInput, "");
        changeInputValue(closeInput, "）");
      });

      await act(async () => {
        container
          .querySelector<HTMLButtonElement>(
            ".dialogueDelimiterPairDialog .appDialogButton-confirm"
          )
          ?.click();
      });

      expect(onChange).not.toHaveBeenCalled();
      const errorEl = container.querySelector(
        ".dialogueDelimiterPairDialog .settingsError"
      );
      expect(errorEl?.textContent).toBe(
        translateJa(
          "settings.documentMap.dialogueDelimiterPairs.errorEmptyDelimiter"
        )
      );

      // 2. Invalid color -> save fails
      act(() => {
        changeInputValue(openInput, "（");
        changeInputValue(colorInput, "invalid-color");
      });

      await act(async () => {
        container
          .querySelector<HTMLButtonElement>(
            ".dialogueDelimiterPairDialog .appDialogButton-confirm"
          )
          ?.click();
      });

      expect(onChange).not.toHaveBeenCalled();
      expect(
        container.querySelector(".dialogueDelimiterPairDialog .settingsError")
          ?.textContent
      ).toBe(
        translateJa(
          "settings.documentMap.dialogueDelimiterPairs.errorInvalidColor"
        )
      );

      // 3. Valid input -> appends pair
      act(() => {
        changeInputValue(colorInput, "#ff5500");
      });

      await act(async () => {
        container
          .querySelector<HTMLButtonElement>(
            ".dialogueDelimiterPairDialog .appDialogButton-confirm"
          )
          ?.click();
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith([
        { open: "「", close: "」", color: "#61afef" },
        { open: "（", close: "）", color: "#ff5500" }
      ]);
      expect(container.querySelector(".dialogueDelimiterPairDialog")).toBeNull();
    });

    it("Cancel discards new pair without calling onChange", () => {
      const onChange = vi.fn();
      act(() => {
        root.render(
          <DialogueDelimiterPairsEditor
            pairs={[{ open: "「", close: "」", color: "#61afef" }]}
            translate={translateJa}
            onChange={onChange}
          />
        );
      });

      act(() => {
        container
          .querySelector<HTMLButtonElement>(".documentMapSettingsAddPair")
          ?.click();
      });

      const inputs = container.querySelectorAll<HTMLInputElement>(
        ".dialogueDelimiterPairDialogInput"
      );
      act(() => {
        changeInputValue(inputs[0], "『");
        changeInputValue(inputs[1], "』");
      });

      act(() => {
        container
          .querySelector<HTMLButtonElement>(
            ".dialogueDelimiterPairDialog .appDialogButton-cancel"
          )
          ?.click();
      });

      expect(onChange).not.toHaveBeenCalled();
      expect(container.querySelector(".dialogueDelimiterPairDialog")).toBeNull();
    });
  });

  describe("Edit mode via dialog", () => {
    it("preloads existing values, modifies and saves replacement", async () => {
      const onChange = vi.fn();
      const pairs: DocumentMapDialogueDelimiterPair[] = [
        { open: "「", close: "」", color: "#61afef" },
        { open: "『", close: "』", color: "#c678dd" }
      ];

      act(() => {
        root.render(
          <DialogueDelimiterPairsEditor
            pairs={pairs}
            translate={translateJa}
            onChange={onChange}
          />
        );
      });

      // Click Edit on index 1
      const editBtns = container.querySelectorAll<HTMLButtonElement>(
        ".documentMapSettingsDialoguePairEdit"
      );
      act(() => {
        editBtns[1].click();
      });

      const inputs = container.querySelectorAll<HTMLInputElement>(
        ".dialogueDelimiterPairDialogInput"
      );
      expect(inputs[0].value).toBe("『");
      expect(inputs[1].value).toBe("』");
      const colorInput = container.querySelector<HTMLInputElement>(
        ".dialogueDelimiterPairDialogColorText"
      )!;
      expect(colorInput.value).toBe("#c678dd");

      // Modify open and color
      act(() => {
        changeInputValue(inputs[0], "“");
        changeInputValue(inputs[1], "”");
        changeInputValue(colorInput, "#00ff00");
      });

      await act(async () => {
        container
          .querySelector<HTMLButtonElement>(
            ".dialogueDelimiterPairDialog .appDialogButton-confirm"
          )
          ?.click();
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith([
        { open: "「", close: "」", color: "#61afef" },
        { open: "“", close: "”", color: "#00ff00" }
      ]);
    });

    it("Cancel preserves original pair", () => {
      const onChange = vi.fn();
      act(() => {
        root.render(
          <DialogueDelimiterPairsEditor
            pairs={[{ open: "「", close: "」", color: "#61afef" }]}
            translate={translateJa}
            onChange={onChange}
          />
        );
      });

      act(() => {
        container
          .querySelector<HTMLButtonElement>(
            ".documentMapSettingsDialoguePairEdit"
          )
          ?.click();
      });

      const inputs = container.querySelectorAll<HTMLInputElement>(
        ".dialogueDelimiterPairDialogInput"
      );
      act(() => {
        changeInputValue(inputs[0], "<");
      });

      act(() => {
        container
          .querySelector<HTMLButtonElement>(
            ".dialogueDelimiterPairDialog .appDialogButton-cancel"
          )
          ?.click();
      });

      expect(onChange).not.toHaveBeenCalled();
      expect(container.querySelector(".dialogueDelimiterPairDialog")).toBeNull();
    });
  });

  describe("Delete", () => {
    it("removes specified pair from array", () => {
      const onChange = vi.fn();
      const pairs: DocumentMapDialogueDelimiterPair[] = [
        { open: "「", close: "」", color: "#61afef" },
        { open: "『", close: "』", color: "#c678dd" }
      ];

      act(() => {
        root.render(
          <DialogueDelimiterPairsEditor
            pairs={pairs}
            translate={translateJa}
            onChange={onChange}
          />
        );
      });

      const deleteBtns = container.querySelectorAll<HTMLButtonElement>(
        ".documentMapSettingsDialoguePairDelete"
      );
      act(() => {
        deleteBtns[0].click();
      });

      expect(onChange).toHaveBeenCalledWith([
        { open: "『", close: "』", color: "#c678dd" }
      ]);
    });

    it("deleting last pair results in empty array []", () => {
      const onChange = vi.fn();
      act(() => {
        root.render(
          <DialogueDelimiterPairsEditor
            pairs={[{ open: "「", close: "」", color: "#61afef" }]}
            translate={translateJa}
            onChange={onChange}
          />
        );
      });

      act(() => {
        container
          .querySelector<HTMLButtonElement>(
            ".documentMapSettingsDialoguePairDelete"
          )
          ?.click();
      });

      expect(onChange).toHaveBeenCalledWith([]);
    });
  });

  describe("Reorder", () => {
    it("reorders via ArrowDown keyboard interaction", () => {
      const onChange = vi.fn();
      const pairs: DocumentMapDialogueDelimiterPair[] = [
        { open: "「", close: "」", color: "#61afef" },
        { open: "『", close: "』", color: "#c678dd" }
      ];

      act(() => {
        root.render(
          <DialogueDelimiterPairsEditor
            pairs={pairs}
            translate={translateJa}
            onChange={onChange}
          />
        );
      });

      const handles = container.querySelectorAll<HTMLButtonElement>(
        ".glossaryEntryTagAssignmentDragHandle"
      );
      act(() => {
        handles[0].dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
        );
      });

      expect(onChange).toHaveBeenCalledWith([
        { open: "『", close: "』", color: "#c678dd" },
        { open: "「", close: "」", color: "#61afef" }
      ]);
    });
  });

  describe("No partial persistence", () => {
    it("never calls onChange while dialog has in-progress / invalid draft", () => {
      const onChange = vi.fn();
      act(() => {
        root.render(
          <DialogueDelimiterPairsEditor
            pairs={[{ open: "「", close: "」", color: "#61afef" }]}
            translate={translateJa}
            onChange={onChange}
          />
        );
      });

      act(() => {
        container
          .querySelector<HTMLButtonElement>(".documentMapSettingsAddPair")
          ?.click();
      });

      const inputs = container.querySelectorAll<HTMLInputElement>(
        ".dialogueDelimiterPairDialogInput"
      );
      const colorInput = container.querySelector<HTMLInputElement>(
        ".dialogueDelimiterPairDialogColorText"
      )!;

      // Type partially
      act(() => {
        changeInputValue(inputs[0], "«");
        changeInputValue(inputs[1], "");
        changeInputValue(colorInput, "#1");
      });

      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
