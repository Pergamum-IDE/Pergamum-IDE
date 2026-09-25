// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GlossaryAtom, GlossaryEntry, GlossaryTag } from "../../../src/shared/glossary";
import type { Translate } from "../../../src/shared/i18n";
import { jaTranslations } from "../../../src/shared/i18n/ja";
import {
  GlossaryExportWizardDialog,
  type OccurrenceCountValue
} from "../../../src/renderer/dialog/GlossaryExportWizardDialog";

const translate: Translate = (key, params) => {
  if (key === "glossaryExportWizard.selectedCount" && params) {
    return `Export targets: ${params.selectedCount} / ${params.totalCount}`;
  }
  return key;
};

function atom(entryId: string, sortOrder: number, value: string): GlossaryAtom {
  return {
    id: `atom-${entryId}-${sortOrder}`,
    entryId,
    sortOrder,
    value,
    matchFlags: 0,
    createdAt: "2026-09-03T01:02:03.000Z",
    updatedAt: "2026-09-03T01:02:03.000Z"
  };
}

function tag(id: string, label: string): GlossaryTag {
  return {
    id,
    label,
    description: null,
    backgroundRgb: "#1f77b4",
    foregroundRgb: "#ffffff",
    sortOrder: 0,
    createdAt: "2026-09-03T01:02:03.000Z",
    updatedAt: "2026-09-03T01:02:03.000Z"
  };
}

function entry(id: string, surfaces: string[], tags: GlossaryTag[] = []): GlossaryEntry {
  return {
    id,
    description: "",
    atoms: surfaces.map((val, idx) => atom(id, idx, val)),
    tags,
    createdAt: "2026-09-03T01:02:03.000Z",
    updatedAt: "2026-09-05T05:06:07.000Z"
  };
}

const entryA = entry("e1", ["織田信長"], [tag("t1", "武将")]);
const entryB = entry("e2", ["桶狭間"]);
const entryC = entry("e3", ["徳川家康"]);

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

function renderDialog(props: Partial<React.ComponentProps<typeof GlossaryExportWizardDialog>> = {}) {
  const onClose = vi.fn();
  const occurrenceCountsByEntryId = new Map<string, OccurrenceCountValue>([
    ["e1", 12],
    ["e2", 5],
    ["e3", 0]
  ]);

  act(() => {
    root.render(
      React.createElement(GlossaryExportWizardDialog, {
        isOpen: true,
        entries: [entryA, entryB, entryC],
        occurrenceCountsByEntryId,
        translate,
        onClose,
        ...props
      })
    );
  });

  return { onClose };
}

describe("GlossaryExportWizardDialog (#581 Slice 1 blocker fix)", () => {
  it("renders Step 1 with default HTML format and all entries enabled", () => {
    renderDialog();

    expect(container.textContent).toContain("glossaryExportWizard.dialogTitle");
    expect(container.textContent).toContain("glossaryExportWizard.step1Title");
    expect(container.textContent).toContain("glossaryExportWizard.htmlNote");

    // HTML image asset folder input
    const imgFolderInput = container.querySelector(
      "input.glossaryExportWizardTextInput"
    ) as HTMLInputElement;
    expect(imgFolderInput).not.toBeNull();
    expect(imgFolderInput.value).toBe("exports.assets");

    // Table rows
    expect(container.textContent).toContain("織田信長");
    expect(container.textContent).toContain("桶狭間");
    expect(container.textContent).toContain("徳川家康");

    // Occurrence counts
    expect(container.textContent).toContain("12");
    expect(container.textContent).toContain("5");
    expect(container.textContent).toContain("0");

    // Selected count summary: 3 / 3
    expect(container.textContent).toContain("Export targets: 3 / 3");
  });

  it("renders immediately with empty occurrence count map showing fallback '-'", () => {
    renderDialog({ occurrenceCountsByEntryId: new Map() });

    expect(container.textContent).toContain("織田信長");
    expect(container.textContent).toContain("桶狭間");
    expect(container.textContent).toContain("徳川家康");
    expect(container.textContent).toContain("Export targets: 3 / 3");
  });

  it("renders without crashing even if tags or atoms are undefined or missing", () => {
    const malformedEntry = {
      id: "e-malformed",
      description: "",
      atoms: undefined as any,
      tags: undefined as any,
      createdAt: "",
      updatedAt: ""
    };

    act(() => {
      root.render(
        React.createElement(GlossaryExportWizardDialog, {
          isOpen: true,
          entries: [malformedEntry],
          translate,
          onClose: vi.fn()
        })
      );
    });

    expect(container.textContent).toContain("e-malformed");
    expect(container.textContent).toContain("glossary.entryManager.noTags");
  });

  it("switches format to PDF and displays PDF font & page settings options", () => {
    renderDialog();

    const select = container.querySelector("select.glossaryExportWizardSelect") as HTMLSelectElement;
    act(() => {
      select.value = "pdf";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("glossaryExportWizard.pdfFontLabel");
    expect(container.textContent).toContain("glossaryExportWizard.pdfPageSettingsLabel");
    expect(container.textContent).toContain("glossaryExportWizard.editPdfFonts");
    expect(container.textContent).toContain("glossaryExportWizard.editPdfPageSettings");
  });

  it("allows toggling an entry OFF, updates selected count, and preserves toggle state when occurrence counts update", () => {
    const onClose = vi.fn();
    const countMap = new Map<string, OccurrenceCountValue>([["e1", "loading"]]);

    const { rerender } = {
      rerender: (map: Map<string, OccurrenceCountValue>) => {
        act(() => {
          root.render(
            React.createElement(GlossaryExportWizardDialog, {
              isOpen: true,
              entries: [entryA, entryB, entryC],
              occurrenceCountsByEntryId: map,
              translate,
              onClose
            })
          );
        });
      }
    };

    rerender(countMap);

    const checkboxes = container.querySelectorAll<HTMLInputElement>(
      "input.exportConfirmationDialogIncludeInput"
    );

    // Toggle first entry OFF
    act(() => {
      checkboxes[0].click();
    });
    expect(checkboxes[0].checked).toBe(false);

    // Now occurrence count arrives for e1 (loading -> 42)
    const updatedCountMap = new Map<string, OccurrenceCountValue>([["e1", 42]]);
    rerender(updatedCountMap);

    // Toggle state should REMAIN false (not reset) and count updated to 42
    const updatedCheckboxes = container.querySelectorAll<HTMLInputElement>(
      "input.exportConfirmationDialogIncludeInput"
    );
    expect(updatedCheckboxes[0].checked).toBe(false);
    expect(container.textContent).toContain("42");
  });

  it("disables Next button and shows validation message when 0 entries selected", () => {
    renderDialog();

    const checkboxes = container.querySelectorAll<HTMLInputElement>(
      "input.exportConfirmationDialogIncludeInput"
    );

    // Toggle all OFF
    act(() => {
      checkboxes.forEach((cb) => cb.click());
    });

    expect(container.textContent).toContain("Export targets: 0 / 3");
    expect(container.textContent).toContain("glossaryExportWizard.noSelectionError");

    const nextBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "glossaryExportWizard.nextButton"
    );
    expect(nextBtn?.disabled).toBe(true);
  });

  it("navigates from Step 1 to Step 2 and back", () => {
    renderDialog();

    const nextBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "glossaryExportWizard.nextButton"
    )!;

    act(() => {
      nextBtn.click();
    });

    expect(container.textContent).toContain("glossaryExportWizard.step2Title");
    expect(container.textContent).toContain("HTML");
    expect(container.textContent).toContain("3件");
    expect(container.textContent).toContain("glossaryExportWizard.includeToc");
    expect(container.textContent).toContain("glossaryExportWizard.outputFolderLabel");

    const backBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "glossaryExportWizard.backButton"
    )!;

    act(() => {
      backBtn.click();
    });

    expect(container.textContent).toContain("glossaryExportWizard.step1Title");
  });

  it("disables Next button and displays occurrenceCountingWait message while selected entries are loading", () => {
    const loadingMap = new Map<string, OccurrenceCountValue>([
      ["e1", { status: "loading" }],
      ["e2", { status: "loading" }],
      ["e3", { status: "loading" }]
    ]);

    renderDialog({ occurrenceCountsByEntryId: loadingMap });

    const nextBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "glossaryExportWizard.nextButton"
    );
    expect(nextBtn?.disabled).toBe(true);
    expect(container.textContent).toContain("glossaryExportWizard.occurrenceCountingWait");
  });

  it("enables Next button once all selected entries settle (ready or failed)", () => {
    const settledMap = new Map<string, OccurrenceCountValue>([
      ["e1", { status: "ready", count: 12 }],
      ["e2", { status: "failed" }],
      ["e3", { status: "ready", count: 0 }]
    ]);

    renderDialog({ occurrenceCountsByEntryId: settledMap });

    const nextBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "glossaryExportWizard.nextButton"
    )!;
    expect(nextBtn.disabled).toBe(false);
    expect(container.textContent).not.toContain("glossaryExportWizard.occurrenceCountingWait");
    expect(container.textContent).not.toContain("glossaryExportWizard.noSelectionError");
  });

  it("unblocks Next button when a loading entry is toggled OFF", () => {
    const partialLoadingMap = new Map<string, OccurrenceCountValue>([
      ["e1", { status: "loading" }],
      ["e2", { status: "ready", count: 5 }],
      ["e3", { status: "ready", count: 2 }]
    ]);

    renderDialog({ occurrenceCountsByEntryId: partialLoadingMap });

    const nextBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "glossaryExportWizard.nextButton"
    )!;
    expect(nextBtn.disabled).toBe(true);

    const checkboxes = container.querySelectorAll<HTMLInputElement>(
      "input.exportConfirmationDialogIncludeInput"
    );

    // Toggle e1 (the loading one) OFF
    act(() => {
      checkboxes[0].click();
    });

    expect(checkboxes[0].checked).toBe(false);
    // Remaining selected rows (e2, e3) are ready, so Next should now be enabled
    expect(nextBtn.disabled).toBe(false);
  });

  it("disables Next button again if an OFF loading entry is toggled back ON", () => {
    const partialLoadingMap = new Map<string, OccurrenceCountValue>([
      ["e1", { status: "loading" }],
      ["e2", { status: "ready", count: 5 }],
      ["e3", { status: "ready", count: 2 }]
    ]);

    renderDialog({ occurrenceCountsByEntryId: partialLoadingMap });

    const checkboxes = container.querySelectorAll<HTMLInputElement>(
      "input.exportConfirmationDialogIncludeInput"
    );

    // Toggle e1 OFF
    act(() => {
      checkboxes[0].click();
    });

    const nextBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "glossaryExportWizard.nextButton"
    )!;
    expect(nextBtn.disabled).toBe(false);

    // Toggle e1 back ON
    act(() => {
      checkboxes[0].click();
    });

    expect(checkboxes[0].checked).toBe(true);
    expect(nextBtn.disabled).toBe(true);
    expect(container.textContent).toContain("glossaryExportWizard.occurrenceCountingWait");
  });

  it("renders with real ja translations and PDF format without throwing", () => {
    const realTranslate = (key: any, params?: any): string => {
      let template: string = jaTranslations[key as keyof typeof jaTranslations] ?? String(key);
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          template = template.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        });
      }
      return template;
    };

    renderDialog({ translate: realTranslate });

    const select = container.querySelector("select.glossaryExportWizardSelect") as HTMLSelectElement;
    act(() => {
      select.value = "pdf";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("PDF既定");
    expect(container.textContent).toContain("PDF本文フォント候補");
    expect(container.querySelector(".glossaryExportWizardErrorFallback")).toBeNull();
  });

  it("formats occurrence counts with locale number formatting (e.g. 4,300) and displays updated column headers", () => {
    const realTranslate = (key: any, params?: any): string => {
      let template: string = jaTranslations[key as keyof typeof jaTranslations] ?? String(key);
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          template = template.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        });
      }
      return template;
    };

    const formattedMap = new Map<string, OccurrenceCountValue>([
      ["e1", { status: "ready", count: 4300 }],
      ["e2", { status: "ready", count: 1234567 }]
    ]);

    renderDialog({ occurrenceCountsByEntryId: formattedMap, translate: realTranslate, uiLanguage: "ja" });

    expect(container.textContent).toContain("4,300");
    expect(container.textContent).toContain("1,234,567");

    const countColHeader = container.querySelector(".glossaryExportWizardColCount");
    expect(countColHeader?.textContent).toBe("出現頻度");

    const handleColHeader = container.querySelector(".glossaryExportWizardColHandle");
    expect(handleColHeader?.textContent).toBe("");
  });

  it("handles Step 2 TOC toggle and position dropdown state correctly", () => {
    renderDialog();

    // Navigate to Step 2
    const nextBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "glossaryExportWizard.nextButton"
    )!;
    act(() => {
      nextBtn.click();
    });

    const tocCheckbox = container.querySelector(
      "input.glossaryExportWizardCheckbox"
    ) as HTMLInputElement;
    const selects = Array.from(container.querySelectorAll<HTMLSelectElement>("select.glossaryExportWizardSelect"));
    const tocSelect = selects.find((s) => s.id.endsWith("-toc-position")) ?? selects[0];

    // Default: TOC checkbox is unchecked (OFF) and position dropdown is disabled
    expect(tocCheckbox.checked).toBe(false);
    expect(tocSelect.disabled).toBe(true);

    // Toggle TOC ON
    act(() => {
      tocCheckbox.click();
    });
    expect(tocCheckbox.checked).toBe(true);
    expect(tocSelect.disabled).toBe(false);

    // Change position to "back" (巻末)
    act(() => {
      tocSelect.value = "back";
      tocSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(tocSelect.value).toBe("back");

    // Toggle TOC OFF then back ON -> position remains "back"
    act(() => {
      tocCheckbox.click();
    });
    expect(tocCheckbox.checked).toBe(false);
    expect(tocSelect.disabled).toBe(true);

    act(() => {
      tocCheckbox.click();
    });
    expect(tocCheckbox.checked).toBe(true);
    expect(tocSelect.value).toBe("back");
  });

  it("executes combined HTML export with selected options and checks for overwrites", async () => {
    const onSelectFolder = vi.fn().mockResolvedValue({ ok: true, folderPath: "/user/documents" });
    const onCheckFileExists = vi.fn().mockResolvedValue({ exists: true });
    const onConfirmOverwrite = vi.fn().mockResolvedValue(true);
    const onExportCombined = vi.fn().mockResolvedValue({ ok: true, outputPath: "/user/documents/glossary-export.html", warningCount: 0 });

    renderDialog({
      onSelectFolder,
      onCheckFileExists,
      onConfirmOverwrite,
      onExportCombined
    });

    // Navigate to Step 2
    const nextBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "glossaryExportWizard.nextButton"
    )!;
    act(() => {
      nextBtn.click();
    });

    // Set folder path
    const textInputs = Array.from(
      container.querySelectorAll<HTMLInputElement>("input.glossaryExportWizardTextInput")
    );
    const folderInput = textInputs.find((input) => input.id.endsWith("-output-folder")) ?? textInputs[0];
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )!.set!;
    act(() => {
      nativeInputValueSetter.call(folderInput, "/user/documents");
      folderInput.dispatchEvent(new Event("input", { bubbles: true }));
      folderInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Enable TOC
    const tocCheckbox = container.querySelector(
      "input.glossaryExportWizardCheckbox"
    ) as HTMLInputElement;
    act(() => {
      tocCheckbox.click();
    });

    // Click Export execution button
    const exportBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "export.wizard.executeExport"
    )!;

    await act(async () => {
      exportBtn.click();
    });

    expect(onCheckFileExists).toHaveBeenCalledWith({
      filePath: "/user/documents/glossary-export.html"
    });
    expect(onConfirmOverwrite).toHaveBeenCalled();
    expect(onExportCombined).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: [entryA, entryB, entryC],
        outputFilePath: "/user/documents/glossary-export.html",
        fileName: "glossary-export.html",
        includeToc: true,
        tocPosition: "front"
      })
    );
  });
});

