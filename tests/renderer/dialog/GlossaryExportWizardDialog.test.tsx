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
    expect(container.textContent).toContain("glossaryExportWizard.notImplementedNotice");

    const backBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "glossaryExportWizard.backButton"
    )!;

    act(() => {
      backBtn.click();
    });

    expect(container.textContent).toContain("glossaryExportWizard.step1Title");
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
});
