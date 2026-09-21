// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { t, type Translate } from "../../src/shared/i18n";
import {
  ExportConfirmationDialog,
  type ExportConfirmationDialogProps
} from "../../src/renderer/dialog/ExportConfirmationDialog";
import {
  createExportCandidateTextDetails,
  type ExportCandidateListItem,
  type ExportDocumentKind
} from "../../src/renderer/exportCandidates";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const translate: Translate = (key, values) => t("en", key, values);
const noopReload = vi.fn(async () => null);
const noopConfirmDiscardReload = vi.fn(async () => true);
const noopExportTxt = vi.fn<ExportConfirmationDialogProps["onExportTxt"]>(
  async () => ({ ok: true, outputPath: "C:\\Users\\User\\Documents\\First.txt" })
);
const noopLoadAozoraText = vi.fn<
  ExportConfirmationDialogProps["loadAozoraText"]
>(async () => "");
const noopExportUnavailable = vi.fn();
const noopExportFailed = vi.fn();
const noopGetDocumentsPath = vi.fn<
  NonNullable<ExportConfirmationDialogProps["onGetDocumentsPath"]>
>(async () => ({ path: "C:\\Users\\User\\Documents" }));
const noopCheckFileExists = vi.fn<
  NonNullable<ExportConfirmationDialogProps["onCheckFileExists"]>
>(async () => ({ exists: false }));
const noopSelectExportFolder = vi.fn<
  NonNullable<ExportConfirmationDialogProps["onSelectExportFolder"]>
>(async (req) => ({
  ok: true,
  folderPath: req?.defaultPath ?? "C:\\Users\\User\\Documents"
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

const candidates = [
  {
    documentKey: "First/01.md",
    filePath: "First/01.md",
    parentPath: "First",
    fileName: "01.md",
    kind: "markdown" as const,
    rawText: "吾輩は猫である。名前はまだない。",
    previewStart: "吾輩は猫で",
    previewEnd: "まだない。",
    previewStartHover: "吾輩は猫である。名前はまだない。",
    previewEndHover: "吾輩は猫である。名前はまだない。",
    characterCount: 10,
    included: true
  },
  {
    documentKey: "First/notes.txt",
    filePath: "First/notes.txt",
    parentPath: "First",
    fileName: "notes.txt",
    kind: "text" as const,
    rawText: "plain text",
    previewStart: "plain text",
    previewEnd: "text memo",
    previewStartHover: "plain text",
    previewEndHover: "text memo",
    characterCount: 5,
    included: true
  }
] as const satisfies readonly ExportCandidateListItem[];

const groupedCandidates = [
  ...candidates,
  {
    documentKey: "Second/01.md",
    filePath: "Second/01.md",
    parentPath: "Second",
    fileName: "01.md",
    kind: "markdown" as const,
    rawText: "second",
    previewStart: "second",
    previewEnd: "second",
    previewStartHover: "second",
    previewEndHover: "second",
    characterCount: 20,
    included: true
  }
] as const satisfies readonly ExportCandidateListItem[];

function candidateWithText(
  filePath: string,
  kind: ExportDocumentKind,
  rawText: string,
  included = true
): ExportCandidateListItem {
  const parts = filePath.split("/");
  const fileName = parts[parts.length - 1] ?? filePath;
  const parentPath = parts.length > 1 ? parts.slice(0, -1).join("/") : "";

  return {
    documentKey: filePath,
    filePath,
    parentPath,
    fileName,
    kind,
    rawText,
    ...createExportCandidateTextDetails(rawText, kind),
    included
  };
}

function mountDialog(options: {
  candidates?: readonly ExportCandidateListItem[];
  onReloadCandidates?: () => Promise<
    readonly ExportCandidateListItem[] | null
  >;
  onConfirmDiscardReload?: () => Promise<boolean>;
  onExportTxt?: ExportConfirmationDialogProps["onExportTxt"];
  onExportHtmlCombined?: ExportConfirmationDialogProps["onExportHtmlCombined"];
  onSelectPdfSavePath?: ExportConfirmationDialogProps["onSelectPdfSavePath"];
  onExportPdfCombined?: ExportConfirmationDialogProps["onExportPdfCombined"];
  loadAozoraText?: ExportConfirmationDialogProps["loadAozoraText"];
  onExportUnavailable?: ExportConfirmationDialogProps["onExportUnavailable"];
  onExportFailed?: ExportConfirmationDialogProps["onExportFailed"];
  onSelectExportFolder?: ExportConfirmationDialogProps["onSelectExportFolder"];
  onGetDocumentsPath?: ExportConfirmationDialogProps["onGetDocumentsPath"];
  onCheckFileExists?: ExportConfirmationDialogProps["onCheckFileExists"];
} = {}): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <ExportConfirmationDialog
        origin={{ kind: "folder", folderPath: "First" }}
        projectName="Novel"
        candidates={options.candidates ?? candidates}
        translate={translate}
        opener={null}
        onReloadCandidates={options.onReloadCandidates ?? noopReload}
        onConfirmDiscardReload={
          options.onConfirmDiscardReload ?? noopConfirmDiscardReload
        }
        onExportTxt={options.onExportTxt ?? noopExportTxt}
        onExportHtmlCombined={options.onExportHtmlCombined}
        onSelectPdfSavePath={options.onSelectPdfSavePath}
        onExportPdfCombined={options.onExportPdfCombined}
        loadAozoraText={options.loadAozoraText ?? noopLoadAozoraText}
        onExportUnavailable={
          options.onExportUnavailable ?? noopExportUnavailable
        }
        onExportFailed={options.onExportFailed ?? noopExportFailed}
        onSelectExportFolder={options.onSelectExportFolder ?? noopSelectExportFolder}
        onGetDocumentsPath={options.onGetDocumentsPath ?? noopGetDocumentsPath}
        onCheckFileExists={options.onCheckFileExists ?? noopCheckFileExists}
        onClose={vi.fn()}
      />
    );
  });
}

function summaryText(): string {
  return (
    container!.querySelector<HTMLElement>(
      `[data-export-confirmation-summary="summary"]`
    )?.textContent ?? ""
  );
}

function includeToggle(filePath: string): HTMLInputElement {
  return container!.querySelector<HTMLInputElement>(
    `[data-export-include-toggle-file-path="${filePath}"]`
  )!;
}

function folderToggle(parentPath: string): HTMLInputElement {
  return container!.querySelector<HTMLInputElement>(
    `[data-export-folder-toggle-parent-path="${parentPath}"]`
  )!;
}

function folderCollapseButton(parentPath: string): HTMLButtonElement {
  return container!.querySelector<HTMLButtonElement>(
    `[data-export-folder-collapse-parent-path="${parentPath}"]`
  )!;
}

function folderRow(parentPath: string): HTMLElement {
  return container!.querySelector<HTMLElement>(
    `[data-export-folder-parent-path="${parentPath}"]`
  )!;
}

function candidateRow(filePath: string): HTMLElement | null {
  return container!.querySelector<HTMLElement>(
    `[data-export-candidate-file-path="${filePath}"]`
  );
}

function dirtyIcon(): HTMLElement | null {
  return container!.querySelector<HTMLElement>(
    ".exportConfirmationDialogDirtyIcon"
  );
}

function tableReloadButton(): HTMLButtonElement {
  return container!.querySelector<HTMLButtonElement>(
    `[data-export-table-reload-button="true"]`
  )!;
}

function closeButton(): HTMLButtonElement {
  return container!.querySelector<HTMLButtonElement>(
    `[data-export-close-button="true"]`
  )!;
}

function folderDragHandle(parentPath: string): HTMLElement {
  return container!.querySelector<HTMLElement>(
    `[data-export-folder-drag-handle-parent-path="${parentPath}"]`
  )!;
}

function fileDragHandle(filePath: string): HTMLElement {
  return container!.querySelector<HTMLElement>(
    `[data-export-file-drag-handle-file-path="${filePath}"]`
  )!;
}

function dispatchDragStart(element: HTMLElement): void {
  act(() => {
    element.dispatchEvent(
      new Event("dragstart", { bubbles: true, cancelable: true })
    );
  });
}

function dispatchDragOver(element: HTMLElement): void {
  act(() => {
    element.dispatchEvent(
      new Event("dragover", { bubbles: true, cancelable: true })
    );
  });
}

function dispatchDrop(element: HTMLElement): void {
  act(() => {
    element.dispatchEvent(
      new Event("dragover", { bubbles: true, cancelable: true })
    );
    element.dispatchEvent(
      new Event("drop", { bubbles: true, cancelable: true })
    );
  });
}

function renderedFolderOrder(): readonly string[] {
  return Array.from(
    container!.querySelectorAll<HTMLElement>("[data-export-folder-parent-path]")
  ).map((row) => row.dataset.exportFolderParentPath ?? "");
}

function renderedFileOrder(): readonly string[] {
  return Array.from(
    container!.querySelectorAll<HTMLElement>(
      "[data-export-candidate-file-path]"
    )
  ).map((row) => row.dataset.exportCandidateFilePath ?? "");
}

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(
    container!.querySelectorAll<HTMLButtonElement>("button")
  ).find((candidate) => candidate.textContent === text);

  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }

  return button;
}

function setSelectValue(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    "value"
  )?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function headingRemovalSelect(): HTMLSelectElement {
  return container!.querySelector<HTMLSelectElement>(
    `[data-export-heading-removal-select="true"]`
  )!;
}

function bodyNotationSelect(): HTMLSelectElement {
  return container!.querySelector<HTMLSelectElement>(
    `[data-export-body-notation-select="true"]`
  )!;
}

function fileStructureTocToggle(): HTMLInputElement | null {
  return container!.querySelector<HTMLInputElement>(
    `[data-export-file-structure-toc-toggle="true"]`
  );
}

function navigateToStep2(): void {
  const btn = buttonByText(translate("export.wizard.goToOutputFormat"));
  act(() => btn.click());
}

function navigateToStep3(): void {
  const btn = buttonByText(translate("export.wizard.goToOutputDestination"));
  act(() => btn.click());
}

function executeExportClick(): void {
  const btn = buttonByText(translate("export.wizard.executeExport"));
  act(() => btn.click());
}

describe("ExportConfirmationDialog (#523)", () => {
  it("labels the project root origin with the project name when available", () => {
    const markup = renderToStaticMarkup(
      <ExportConfirmationDialog
        origin={{ kind: "projectRoot" }}
        projectName="Novel"
        candidates={[]}
        translate={translate}
        opener={null}
        onReloadCandidates={noopReload}
        onConfirmDiscardReload={noopConfirmDiscardReload}
        onExportTxt={noopExportTxt}
        loadAozoraText={noopLoadAozoraText}
        onExportUnavailable={noopExportUnavailable}
        onExportFailed={noopExportFailed}
        onClose={vi.fn()}
      />
    );

    expect(markup).toContain("Project root (Novel)");
  });

  it("renders the origin, candidate count, and flat candidate list in Step 1", () => {
    const markup = renderToStaticMarkup(
      <ExportConfirmationDialog
        origin={{ kind: "folder", folderPath: "First" }}
        projectName="Novel"
        candidates={candidates}
        translate={translate}
        opener={null}
        onReloadCandidates={noopReload}
        onConfirmDiscardReload={noopConfirmDiscardReload}
        onExportTxt={noopExportTxt}
        loadAozoraText={noopLoadAozoraText}
        onExportUnavailable={noopExportUnavailable}
        onExportFailed={noopExportFailed}
        onClose={vi.fn()}
      />
    );

    expect(markup).toContain("Export Confirmation");
    expect(markup).toContain("Target:");
    expect(markup).toContain("First");
    expect(markup).toContain("Approx. characters: 15  Included/candidates: 2/2 files");
    expect(markup).toContain("10 chars");
    expect(markup).toContain("5 chars");
    expect(markup).toContain("Source text interpretation");
    expect(markup).toContain("Interpretation result preview");
    expect(markup).toContain("Aozora Bunko");
    expect(markup).toContain("Narou");
    expect(markup).toContain("Kakuyomu");
    expect(markup).toContain("Reload");
    expect(markup).toContain("Included 2/2");
    expect(markup).toContain("01.md");
    expect(markup).toContain("notes.txt");
    expect(markup).toContain("吾輩は猫で");
    expect(markup).toContain("title=\"吾輩は猫である。名前はまだない。\"");
    expect(markup).toContain("text memo");
    expect(markup).toContain("exportConfirmationDialogHandleIcon");
    expect(markup).toContain("exportConfirmationDialogKindIcon");
    expect(markup).toContain("exportConfirmationDialogPreviewStart");
    expect(markup).toContain("exportConfirmationDialogPreviewEnd");
    expect(markup).toContain("exportConfirmationDialogRow");
    expect(markup).toContain("exportConfirmationDialogIncludeCell");
  });

  it("renders a safe empty state", () => {
    const markup = renderToStaticMarkup(
      <ExportConfirmationDialog
        origin={{ kind: "file", filePath: "assets/cover.png" }}
        projectName="Novel"
        candidates={[]}
        translate={translate}
        opener={null}
        onReloadCandidates={noopReload}
        onConfirmDiscardReload={noopConfirmDiscardReload}
        onExportTxt={noopExportTxt}
        loadAozoraText={noopLoadAozoraText}
        onExportUnavailable={noopExportUnavailable}
        onExportFailed={noopExportFailed}
        onClose={vi.fn()}
      />
    );

    expect(markup).toContain("assets/cover.png");
    expect(markup).toContain("Approx. characters: 0  Included/candidates: 0/0 files");
    expect(markup).toContain("No exportable documents found.");
    expect(markup).not.toContain("<tbody>");
  });

  it("updates included count and total characters when a row is toggled", () => {
    mountDialog();

    expect(summaryText()).toBe("Approx. characters: 15  Included/candidates: 2/2 files");

    act(() => includeToggle("First/01.md").click());

    expect(summaryText()).toBe("Approx. characters: 5  Included/candidates: 1/2 files");
    expect(folderRow("First").textContent).toContain("Some 1/2");

    act(() => includeToggle("First/01.md").click());

    expect(summaryText()).toBe("Approx. characters: 15  Included/candidates: 2/2 files");
    expect(folderRow("First").textContent).toContain("Included 2/2");
  });

  it("collapses and expands folder groups without changing totals", () => {
    mountDialog({ candidates: groupedCandidates });

    expect(candidateRow("First/01.md")).not.toBeNull();
    expect(summaryText()).toBe("Approx. characters: 35  Included/candidates: 3/3 files");

    act(() => folderCollapseButton("First").click());

    expect(candidateRow("First/01.md")).toBeNull();
    expect(candidateRow("First/notes.txt")).toBeNull();
    expect(folderRow("First")).not.toBeNull();
    expect(summaryText()).toBe("Approx. characters: 35  Included/candidates: 3/3 files");

    act(() => folderCollapseButton("First").click());

    expect(candidateRow("First/01.md")).not.toBeNull();
  });

  it("folder toggle updates child rows, folder summary, and overall summary", () => {
    mountDialog();

    act(() => folderToggle("First").click());

    expect(includeToggle("First/01.md").checked).toBe(false);
    expect(includeToggle("First/notes.txt").checked).toBe(false);
    expect(folderRow("First").textContent).toContain("Included 0/2");
    expect(summaryText()).toBe("Approx. characters: 0  Included/candidates: 0/2 files");

    act(() => folderToggle("First").click());

    expect(includeToggle("First/01.md").checked).toBe(true);
    expect(includeToggle("First/notes.txt").checked).toBe(true);
    expect(summaryText()).toBe("Approx. characters: 15  Included/candidates: 2/2 files");

    act(() => includeToggle("First/01.md").click());
    expect(folderRow("First").textContent).toContain("Some 1/2");

    act(() => folderToggle("First").click());

    expect(includeToggle("First/01.md").checked).toBe(true);
    expect(includeToggle("First/notes.txt").checked).toBe(true);
    expect(folderRow("First").textContent).toContain("Included 2/2");
  });

  it("tracks candidate list dirty state and enables/disables reload button", () => {
    mountDialog();

    expect(dirtyIcon()).toBeNull();
    expect(tableReloadButton().disabled).toBe(true);

    act(() => includeToggle("First/01.md").click());

    expect(tableReloadButton().disabled).toBe(false);

    act(() => includeToggle("First/01.md").click());

    expect(tableReloadButton().disabled).toBe(true);
  });

  it("exports included rows as TXT with the current dialog state", async () => {
    const onExportTxt = vi.fn<ExportConfirmationDialogProps["onExportTxt"]>(
      async () => ({ ok: true, outputPath: "C:\\Users\\User\\Documents\\First.txt" })
    );
    mountDialog({ onExportTxt });

    // Move to Step 2
    navigateToStep2();

    // In TXT export, TOC toggle is not available
    expect(fileStructureTocToggle()).toBeNull();

    // Move to Step 3
    navigateToStep3();

    await act(async () => {
      executeExportClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onExportTxt).toHaveBeenCalledTimes(1);
    const request = onExportTxt.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      targetPath: expect.stringMatching(/Novel\.txt$/),
      allowOverwrite: false,
      defaultFileName: "Novel",
      assembly: {
        format: "txtUtf8",
        bodyNotation: "markdown",
        headingRemovalLevel: 0,
        documents: [
          {
            filePath: "First/01.md",
            parentPath: "First",
            fileName: "01.md",
            kind: "markdown",
            text: "吾輩は猫である。名前はまだない。"
          },
          {
            filePath: "First/notes.txt",
            parentPath: "First",
            fileName: "notes.txt",
            kind: "text",
            text: "plain text"
          }
        ]
      }
    });
  });

  it("uses Aozora project reads when exporting with Aozora body notation", async () => {
    const onExportTxt = vi.fn<ExportConfirmationDialogProps["onExportTxt"]>(
      async () => ({ ok: true, outputPath: "C:\\Users\\User\\Documents\\First.txt" })
    );
    const loadAozoraText = vi.fn<
      ExportConfirmationDialogProps["loadAozoraText"]
    >(async (relativePath) =>
      relativePath.endsWith(".txt") ? "※［＃1-14-2］" : "｜吾輩《わがはい》"
    );
    mountDialog({ onExportTxt, loadAozoraText });

    act(() => {
      setSelectValue(bodyNotationSelect(), "aozora");
    });

    navigateToStep2();
    navigateToStep3();

    await act(async () => {
      executeExportClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(loadAozoraText).toHaveBeenCalledWith("First/01.md");
    expect(loadAozoraText).toHaveBeenCalledWith("First/notes.txt");
    const request = onExportTxt.mock.calls[0]?.[0];
    expect(request?.assembly).toMatchObject({
      bodyNotation: "aozora",
      documents: [
        { filePath: "First/01.md", text: "｜吾輩《わがはい》" },
        { filePath: "First/notes.txt", text: "𠀋" }
      ]
    });
  });

  it("does not export and reports a safe message when no files are included", async () => {
    const onExportTxt = vi.fn<ExportConfirmationDialogProps["onExportTxt"]>(
      async () => ({ ok: true, outputPath: "C:\\export\\manuscript.txt" })
    );
    const onExportUnavailable = vi.fn();
    mountDialog({ onExportTxt, onExportUnavailable });

    act(() => folderToggle("First").click());

    navigateToStep2();
    navigateToStep3();

    await act(async () => {
      executeExportClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onExportUnavailable).toHaveBeenCalledTimes(1);
    expect(onExportTxt).not.toHaveBeenCalled();
  });

  it("reorders folder groups by dragging the folder gripper", () => {
    mountDialog({ candidates: groupedCandidates });

    expect(renderedFolderOrder()).toEqual(["First", "Second"]);

    dispatchDragStart(folderDragHandle("Second"));
    expect(folderRow("Second").dataset.exportDragging).toBe("true");
    expect(candidateRow("Second/01.md")?.dataset.exportFolderDragSubdued).toBe(
      "true"
    );
    dispatchDragOver(folderRow("First"));
    expect(folderRow("First").dataset.exportDropTarget).toBe("true");
    dispatchDrop(folderRow("First"));

    expect(renderedFolderOrder()).toEqual(["Second", "First"]);
    expect(tableReloadButton().disabled).toBe(false);
    expect(folderRow("Second").dataset.exportOrderDirty).toBe("true");
    expect(folderRow("First").dataset.exportOrderDirty).toBe("true");

    dispatchDragStart(folderDragHandle("First"));
    dispatchDrop(folderRow("Second"));

    expect(renderedFolderOrder()).toEqual(["First", "Second"]);
    expect(tableReloadButton().disabled).toBe(true);
  });

  it("reorders file rows within the same folder by dragging the row gripper", () => {
    mountDialog({ candidates: groupedCandidates });

    expect(renderedFileOrder()).toEqual([
      "First/01.md",
      "First/notes.txt",
      "Second/01.md"
    ]);

    dispatchDragStart(fileDragHandle("First/notes.txt"));
    expect(candidateRow("First/notes.txt")?.dataset.exportDragging).toBe(
      "true"
    );
    dispatchDragOver(candidateRow("First/01.md")!);
    expect(candidateRow("First/01.md")?.dataset.exportDropTarget).toBe("true");
    dispatchDrop(candidateRow("First/01.md")!);

    expect(renderedFileOrder()).toEqual([
      "First/notes.txt",
      "First/01.md",
      "Second/01.md"
    ]);
    expect(tableReloadButton().disabled).toBe(false);
    expect(candidateRow("First/notes.txt")?.dataset.exportOrderDirty).toBe(
      "true"
    );
    expect(candidateRow("First/01.md")?.dataset.exportOrderDirty).toBe("true");
    expect(candidateRow("Second/01.md")?.dataset.exportOrderDirty).toBe(
      "false"
    );

    dispatchDragStart(fileDragHandle("First/01.md"));
    dispatchDrop(candidateRow("First/notes.txt")!);

    expect(renderedFileOrder()).toEqual([
      "First/01.md",
      "First/notes.txt",
      "Second/01.md"
    ]);
    expect(tableReloadButton().disabled).toBe(true);
  });

  it("recalculates previews and totals when heading removal changes", () => {
    mountDialog({
      candidates: [
        candidateWithText("First/heading.md", "markdown", "# Title\nabcdefghijklmnop"),
        candidateWithText("First/notes.txt", "text", "# Text heading\nbody")
      ]
    });

    expect(candidateRow("First/heading.md")!.textContent).toContain(
      "# Title abcdefg…"
    );
    expect(summaryText()).toContain("Approx. characters: 43");

    navigateToStep2();

    act(() => {
      setSelectValue(headingRemovalSelect(), "1");
    });

    expect(candidateRow("First/heading.md")!.textContent).toContain(
      "abcdefghijklmno…"
    );
    expect(candidateRow("First/heading.md")!.textContent).toContain("16 chars");
    expect(candidateRow("First/notes.txt")!.textContent).toContain(
      "# Text heading …"
    );
    expect(summaryText()).toContain("Approx. characters: 35");
    expect(folderRow("First").textContent).toContain("35 chars");

    act(() => includeToggle("First/heading.md").click());
    act(() => folderCollapseButton("First").click());
    act(() => {
      setSelectValue(headingRemovalSelect(), "2");
    });

    expect(candidateRow("First/heading.md")).toBeNull();
    expect(summaryText()).toContain("Approx. characters: 19");

    act(() => folderCollapseButton("First").click());

    expect(includeToggle("First/heading.md").checked).toBe(false);
    expect(candidateRow("First/heading.md")!.textContent).toContain(
      "abcdefghijklmno…"
    );
  });

  it("reloads after confirmation when candidate list is dirty", async () => {
    const onReloadCandidates = vi.fn(async () => [
      {
        ...candidates[0],
        rawText: "# Updated\nupdated body",
        previewStart: "updated",
        previewEnd: "updated",
        previewStartHover: "updated hover",
        previewEndHover: "updated hover",
        characterCount: 12,
        included: true
      },
      {
        documentKey: "First/new.md",
        filePath: "First/new.md",
        parentPath: "First",
        fileName: "new.md",
        kind: "markdown" as const,
        rawText: "newtext",
        previewStart: "new",
        previewEnd: "new",
        previewStartHover: "new",
        previewEndHover: "new",
        characterCount: 7,
        included: true
      }
    ]);
    const onConfirmDiscardReload = vi.fn(async () => true);
    mountDialog({ onReloadCandidates, onConfirmDiscardReload });

    expect(tableReloadButton().disabled).toBe(true);

    act(() => includeToggle("First/01.md").click());

    expect(tableReloadButton().disabled).toBe(false);

    await act(async () => {
      tableReloadButton().click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onConfirmDiscardReload).toHaveBeenCalledTimes(1);
    expect(onReloadCandidates).toHaveBeenCalledTimes(1);
    expect(candidateRow("First/notes.txt")).toBeNull();
    expect(candidateRow("First/new.md")).not.toBeNull();
    expect(includeToggle("First/01.md").checked).toBe(false);
    expect(includeToggle("First/new.md").checked).toBe(true);
    expect(summaryText()).toBe("Approx. characters: 7  Included/candidates: 1/2 files");
    expect(tableReloadButton().disabled).toBe(true);
  });

  it("cancels dirty reload confirmation without changing dialog state", async () => {
    const onReloadCandidates = vi.fn(async () => [candidates[0]]);
    const onConfirmDiscardReload = vi.fn(async () => false);
    mountDialog({ onReloadCandidates, onConfirmDiscardReload });

    act(() => includeToggle("First/01.md").click());

    await act(async () => {
      tableReloadButton().click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onConfirmDiscardReload).toHaveBeenCalledTimes(1);
    expect(onReloadCandidates).not.toHaveBeenCalled();
    expect(includeToggle("First/01.md").checked).toBe(false);
    expect(tableReloadButton().disabled).toBe(false);
  });

  it("supports HTML combined export options and exposes output result card (#523 Slice 7 & Slice 10)", async () => {
    const onExportHtmlCombined = vi.fn(async () => ({
      ok: true as const,
      outputPath: "C:\\Users\\User\\Documents\\First.html",
      warningCount: 0
    }));

    mountDialog({ onExportHtmlCombined });

    navigateToStep2();

    act(() => {
      const select = container!.querySelector<HTMLSelectElement>(
        "select[data-export-format-select='true']"
      )!;
      setSelectValue(select, "htmlCombined");
    });

    const note = container!.querySelector(
      ".exportConfirmationDialogControlNote"
    );
    expect(note?.textContent).toContain(
      "Combines included files into one HTML document"
    );

    const assetFolderInput = container!.querySelector<HTMLInputElement>(
      "input[data-export-image-asset-folder-input='true']"
    );
    expect(assetFolderInput).not.toBeNull();
    expect(assetFolderInput?.value).toBe("exports.assets");

    const tocInput = fileStructureTocToggle();
    expect(tocInput?.disabled).toBe(false);
    expect(tocInput?.checked).toBe(true);

    function setInputValue(input: HTMLInputElement, value: string): void {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    act(() => {
      setInputValue(assetFolderInput!, "invalid/folder");
    });

    const nextBtn = buttonByText(translate("export.wizard.goToOutputDestination"));
    expect(nextBtn.disabled).toBe(true);

    act(() => {
      setInputValue(assetFolderInput!, "custom.assets");
    });
    expect(nextBtn.disabled).toBe(false);

    navigateToStep3();

    await act(async () => {
      executeExportClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onExportHtmlCombined).toHaveBeenCalledTimes(1);

    const savedPathEl = container!.querySelector(
      "[data-export-result-path]"
    );
    expect(savedPathEl).not.toBeNull();
    expect(savedPathEl?.textContent).toContain("C:\\Users\\User\\Documents\\First.html");
  });

  it("supports PDF combined export options, font warning, and external image warning (#523 Slice 8 & Slice 10)", async () => {
    const pdfCandidates: ExportCandidateListItem[] = [
      {
        documentKey: "First/01.md",
        filePath: "First/01.md",
        parentPath: "First",
        fileName: "01.md",
        kind: "markdown",
        rawText: "# Chapter 1\n![External](https://example.com/image.png)",
        previewStart: "# Chapter 1",
        previewEnd: "image.png)",
        previewStartHover: "# Chapter 1",
        previewEndHover: "image.png)",
        characterCount: 30,
        included: true
      }
    ];

    const onExportPdfCombined = vi.fn(async () => ({
      ok: true as const,
      outputPath: "C:\\Users\\User\\Documents\\First.pdf",
      warningCount: 1
    }));

    mountDialog({ candidates: pdfCandidates, onExportPdfCombined });

    navigateToStep2();

    act(() => {
      const select = container!.querySelector<HTMLSelectElement>(
        "select[data-export-format-select='true']"
      )!;
      setSelectValue(select, "pdfCombined");
    });

    const notes = container!.querySelectorAll(
      ".exportConfirmationDialogControlNote"
    );
    const notesText = Array.from(notes).map((n) => n.textContent).join(" ");
    expect(notesText).toContain("Combines included files into one PDF document");
    expect(notesText).toContain("Configured fonts are not guaranteed to render identically");

    const externalWarning = container!.querySelector(
      "[data-export-pdf-external-image-warning='true']"
    );
    expect(externalWarning).not.toBeNull();
    expect(externalWarning?.textContent).toContain("contains 1 image reference(s) outside this computer");

    const assetFolderInput = container!.querySelector<HTMLInputElement>(
      "input[data-export-image-asset-folder-input='true']"
    );
    expect(assetFolderInput).toBeNull();

    const tocInput = fileStructureTocToggle();
    expect(tocInput?.disabled).toBe(false);
    expect(tocInput?.checked).toBe(true);

    navigateToStep3();

    await act(async () => {
      executeExportClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onExportPdfCombined).toHaveBeenCalledTimes(1);

    const savedPathEl = container!.querySelector(
      "[data-export-result-path]"
    );
    expect(savedPathEl).not.toBeNull();
    expect(savedPathEl?.textContent).toContain("C:\\Users\\User\\Documents\\First.pdf");
  });

  it("supports PDF font candidate picker dialog button, font inspection status, and result display (#523 Slice 9 & Slice 10)", async () => {
    const pdfCandidates: ExportCandidateListItem[] = [
      {
        documentKey: "First/01.md",
        filePath: "First/01.md",
        parentPath: "First",
        fileName: "01.md",
        kind: "markdown",
        rawText: "# Chapter 1",
        previewStart: "# Chapter 1",
        previewEnd: "# Chapter 1",
        previewStartHover: "# Chapter 1",
        previewEndHover: "# Chapter 1",
        characterCount: 10,
        included: true
      }
    ];

    const onExportPdfCombined = vi.fn(async () => ({
      ok: true as const,
      outputPath: "C:\\Users\\User\\Documents\\First.pdf",
      warningCount: 0,
      fontInspection: {
        status: "confirmed" as const,
        requestedFontFamily: "MS Mincho",
        detectedFonts: ["MS-Mincho"],
        matchedFonts: ["MS-Mincho"]
      }
    }));

    (window as any).pergamum = {
      fontCache: {
        load: async () => ({
          status: "loaded" as const,
          cache: {
            version: 1 as const,
            scannedAt: "2026-01-01",
            uiLanguage: "ja",
            families: [
              { family: "MS Mincho", displayName: "ＭＳ 明朝", fixedWidth: "unknown" as const }
            ]
          }
        })
      }
    };

    mountDialog({ candidates: pdfCandidates, onExportPdfCombined });

    await act(async () => {
      await Promise.resolve();
    });

    navigateToStep2();

    act(() => {
      const select = container!.querySelector<HTMLSelectElement>(
        "select[data-export-format-select='true']"
      )!;
      setSelectValue(select, "pdfCombined");
    });

    const editFontBtn = container!.querySelector<HTMLButtonElement>(
      "button[data-export-pdf-font-picker-button='true']"
    );
    expect(editFontBtn).not.toBeNull();

    act(() => {
      editFontBtn!.click();
    });

    // FontPickerDialog should open
    const fontPickerModal = document.querySelector(".appDialogBackdrop");
    expect(fontPickerModal).not.toBeNull();

    navigateToStep3();

    await act(async () => {
      executeExportClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onExportPdfCombined).toHaveBeenCalledWith(
      expect.objectContaining({
        targetPath: expect.stringMatching(/Novel\.pdf$/),
        allowOverwrite: false
      })
    );

    const savedPathEl = container!.querySelector("[data-export-result-path]");
    expect(savedPathEl).not.toBeNull();
  });

  it("opens FontPickerDialog for PDF font candidate selection and preserves font section when switching formats (#523 Slice 9 follow-up & Slice 10)", async () => {
    const pdfCandidates: ExportCandidateListItem[] = [
      {
        documentKey: "01.md",
        filePath: "01.md",
        parentPath: "",
        fileName: "01.md",
        kind: "markdown",
        rawText: "# Ch 1",
        previewStart: "# Ch 1",
        previewEnd: "# Ch 1",
        previewStartHover: "# Ch 1",
        previewEndHover: "# Ch 1",
        characterCount: 5,
        included: true
      }
    ];

    (window as any).pergamum = {
      fontCache: {
        load: async () => ({
          status: "loaded" as const,
          cache: {
            version: 1 as const,
            scannedAt: "2026-01-01",
            uiLanguage: "ja",
            families: [
              { family: "Yu Gothic", displayName: "游ゴシック", fixedWidth: "unknown" as const },
              { family: "MS Mincho", displayName: "ＭＳ 明朝", fixedWidth: "unknown" as const }
            ]
          }
        })
      }
    };

    mountDialog({ candidates: pdfCandidates });

    await act(async () => {
      await Promise.resolve();
    });

    navigateToStep2();

    act(() => {
      const select = container!.querySelector<HTMLSelectElement>(
        "select[data-export-format-select='true']"
      )!;
      setSelectValue(select, "pdfCombined");
    });

    const editFontBtn = container!.querySelector<HTMLButtonElement>(
      "button[data-export-pdf-font-picker-button='true']"
    );
    expect(editFontBtn).not.toBeNull();

    act(() => {
      const select = container!.querySelector<HTMLSelectElement>(
        "select[data-export-format-select='true']"
      )!;
      setSelectValue(select, "txtUtf8");
    });

    expect(
      container!.querySelector("button[data-export-pdf-font-picker-button='true']")
    ).toBeNull();

    act(() => {
      const select = container!.querySelector<HTMLSelectElement>(
        "select[data-export-format-select='true']"
      )!;
      setSelectValue(select, "pdfCombined");
    });

    const editFontBtnRestored = container!.querySelector<HTMLButtonElement>(
      "button[data-export-pdf-font-picker-button='true']"
    );
    expect(editFontBtnRestored).not.toBeNull();
  });

  it("navigates through all 4 wizard steps and allows reconfiguring (#523 Slice 10)", async () => {
    mountDialog();

    // Step 1 check
    expect(container!.querySelector("[data-export-body-notation-select='true']")).not.toBeNull();
    expect(container!.querySelector("[data-export-format-select='true']")).toBeNull();

    // Step 1 -> Step 2
    navigateToStep2();
    expect(container!.querySelector("[data-export-body-notation-select='true']")).toBeNull();
    expect(container!.querySelector("[data-export-format-select='true']")).not.toBeNull();
    expect(container!.querySelector("[data-export-file-name-input='true']")).toBeNull();

    // Step 2 -> Step 3
    navigateToStep3();
    expect(container!.querySelector("[data-export-format-select='true']")).toBeNull();
    expect(container!.querySelector("[data-export-file-name-input='true']")).not.toBeNull();

    // Step 3 export execution -> Step 4
    await act(async () => {
      executeExportClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container!.querySelector("[data-export-result-path]")).not.toBeNull();

    // Step 4 -> Reconfigure (returns to Step 1)
    act(() => {
      buttonByText(translate("export.wizard.reexport")).click();
    });

    expect(container!.querySelector("[data-export-body-notation-select='true']")).not.toBeNull();
    expect(container!.querySelector("[data-export-result-path]")).toBeNull();
  });

  it("locks candidate list during Step 3 and unlocks when returning to Step 2 (#523 Slice 10)", () => {
    mountDialog();

    expect(includeToggle("First/01.md").disabled).toBe(false);
    expect(fileDragHandle("First/01.md").getAttribute("draggable")).toBe("true");

    navigateToStep2();
    expect(includeToggle("First/01.md").disabled).toBe(false);

    navigateToStep3();
    expect(includeToggle("First/01.md").disabled).toBe(true);
    expect(folderToggle("First").disabled).toBe(true);
    expect(fileDragHandle("First/01.md").getAttribute("draggable")).toBe("false");
    expect(tableReloadButton().disabled).toBe(true);

    // Go back to Step 2
    act(() => {
      buttonByText(translate("export.wizard.backToOutputFormat")).click();
    });

    expect(includeToggle("First/01.md").disabled).toBe(false);
    expect(fileDragHandle("First/01.md").getAttribute("draggable")).toBe("true");
    expect(tableReloadButton().disabled).toBe(true);
  });

  it("handles overwrite confirmation modal when target file exists (#523 Slice 10)", async () => {
    const onExportTxt = vi.fn<ExportConfirmationDialogProps["onExportTxt"]>(
      async () => ({ ok: true, outputPath: "C:\\Users\\User\\Documents\\First.txt" })
    );
    const onCheckFileExists = vi.fn<
      NonNullable<ExportConfirmationDialogProps["onCheckFileExists"]>
    >(async () => ({ exists: true }));

    mountDialog({ onExportTxt, onCheckFileExists });

    navigateToStep2();
    navigateToStep3();

    // Click export -> shows overwrite modal prompt
    await act(async () => {
      executeExportClick();
      await Promise.resolve();
    });

    expect(onExportTxt).not.toHaveBeenCalled();
    const overwriteModal = container!.querySelector("[data-export-overwrite-modal='true']");
    expect(overwriteModal).not.toBeNull();

    // Click overwrite confirmation button
    await act(async () => {
      buttonByText(translate("export.wizard.overwriteConfirmButton")).click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onExportTxt).toHaveBeenCalledTimes(1);
    expect(onExportTxt.mock.calls[0]?.[0]?.allowOverwrite).toBe(true);
  });

  it("dynamically updates extension label in Step 3 based on selected format (#523 Slice 10)", () => {
    mountDialog();

    navigateToStep2();
    setSelectValue(container!.querySelector<HTMLSelectElement>("select[data-export-format-select='true']")!, "txtUtf8");
    navigateToStep3();
    expect(container!.querySelector("[data-export-fixed-extension='true']")?.textContent).toBe(".txt");

    // Back to Step 2 & select HTML
    act(() => { buttonByText(translate("export.wizard.backToOutputFormat")).click(); });
    setSelectValue(container!.querySelector<HTMLSelectElement>("select[data-export-format-select='true']")!, "htmlCombined");
    navigateToStep3();
    expect(container!.querySelector("[data-export-fixed-extension='true']")?.textContent).toBe(".html");

    // Back to Step 2 & select PDF
    act(() => { buttonByText(translate("export.wizard.backToOutputFormat")).click(); });
    setSelectValue(container!.querySelector<HTMLSelectElement>("select[data-export-format-select='true']")!, "pdfCombined");
    navigateToStep3();
    expect(container!.querySelector("[data-export-fixed-extension='true']")?.textContent).toBe(".pdf");
  });

  it("verifies all Slice 10 UI polish specifications", async () => {
    mountDialog();

    // 1. Table top-left reload button
    const reloadBtn = tableReloadButton();
    expect(reloadBtn).not.toBeNull();
    expect(reloadBtn.getAttribute("title")).toBe("Reload");
    expect(reloadBtn.disabled).toBe(true);
    expect(dirtyIcon()).toBeNull();

    // 2. Dirty state enables reload button
    act(() => includeToggle("First/01.md").click());
    expect(reloadBtn.disabled).toBe(false);

    // 3. Hover full file name / folder name in title attribute
    const fileCell = candidateRow("First/01.md")?.querySelector(".exportConfirmationDialogNameCell");
    expect(fileCell?.getAttribute("title")).toBe("01.md");
    const folderCell = folderRow("First").querySelector(".exportConfirmationDialogNameCell");
    expect(folderCell?.getAttribute("title")).toBe("First");

    // 4. Stable wizard container
    expect(container!.querySelector(".exportWizardContainer")).not.toBeNull();

    // 5. Footer navigation controls per step
    // Step 1
    const footerLeft = container!.querySelector(".exportConfirmationDialogFooterLeft");
    const footerRight = container!.querySelector(".appDialogActions");
    expect(footerLeft?.textContent).toContain("Cancel");
    expect(footerRight?.textContent).toContain("Specify output format →");

    // Step 2
    navigateToStep2();
    expect(footerLeft?.textContent).toContain("← Back to source interpretation");
    expect(footerRight?.textContent).toContain("Specify destination →");
    expect(footerLeft?.textContent).not.toContain("Cancel");
    expect(footerRight?.textContent).not.toContain("Cancel");

    // Step 3
    navigateToStep3();
    expect(footerLeft?.textContent).toContain("← Back");
    expect(footerRight?.textContent).toContain("Export");
    expect(footerLeft?.textContent).not.toContain("Cancel");
    expect(footerRight?.textContent).not.toContain("Cancel");

    // 6. Top-right close button × functionality
    const topCloseBtn = closeButton();
    expect(topCloseBtn).not.toBeNull();
    expect(topCloseBtn.getAttribute("title")).toBe("Cancel");
  });

  it("verifies Step 2 layout follow-up fixes (single heading removal dropdown, PDF caption under TOC toggle, single TOC toggle slider, no native TOC checkbox)", () => {
    mountDialog();

    navigateToStep2();

    // Select PDF format
    setSelectValue(container!.querySelector<HTMLSelectElement>("select[data-export-format-select='true']")!, "pdfCombined");

    // 1. Heading removal select is present exactly ONCE and is right under export format select
    const headingRemovalSelects = container!.querySelectorAll("select[data-export-heading-removal-select='true']");
    expect(headingRemovalSelects.length).toBe(1);

    const controlRows = Array.from(container!.querySelectorAll(".exportWizardStep2 .exportConfirmationDialogControlRow"));
    expect(controlRows.length).toBeGreaterThanOrEqual(2);
    expect(controlRows[0]?.querySelector("select[data-export-format-select='true']")).not.toBeNull();
    expect(controlRows[1]?.querySelector("select[data-export-heading-removal-select='true']")).not.toBeNull();

    // 2. Output file structure TOC option is present exactly ONCE and is a toggle slider
    const tocToggles = container!.querySelectorAll("[data-export-file-structure-toc-toggle='true']");
    expect(tocToggles.length).toBe(1);

    const tocInput = tocToggles[0] as HTMLInputElement;
    expect(tocInput.classList.contains("exportConfirmationDialogIncludeInput")).toBe(true);

    // 3. Native TOC checkbox is not rendered in Step 2 controls
    const nativeCheckbox = container!.querySelector(".exportWizardStep2 .exportConfirmationDialogCheckboxControl");
    expect(nativeCheckbox).toBeNull();

    // 4. PDF combined note caption is displayed under the TOC toggle control
    const step2Elements = Array.from(container!.querySelectorAll(".exportWizardStep2 .exportConfirmationDialogControls > *"));
    const tocControlIndex = step2Elements.findIndex((el) => el.querySelector("[data-export-file-structure-toc-toggle='true']"));
    const pdfNoteIndex = step2Elements.findIndex((el) => el.textContent === translate("export.confirmation.pdfCombined.note"));

    expect(tocControlIndex).toBeGreaterThan(-1);
    expect(pdfNoteIndex).toBeGreaterThan(tocControlIndex);
  });

  it("formats summary and character counts with locale-aware grouping and approximate labels for Japanese and English", () => {
    const largeCandidates = [
      candidateWithText("First/01.md", "markdown", "a".repeat(1112440)),
      candidateWithText("First/02.md", "markdown", "b".repeat(12672), false)
    ];

    // Test Japanese formatting
    const jaTranslate: Translate = (key, values) => t("ja", key, values);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        <ExportConfirmationDialog
          origin={{ kind: "folder", folderPath: "First" }}
          projectName="Novel"
          candidates={largeCandidates}
          translate={jaTranslate}
          uiLanguage="ja"
          opener={null}
          onReloadCandidates={noopReload}
          onConfirmDiscardReload={noopConfirmDiscardReload}
          onExportTxt={noopExportTxt}
          loadAozoraText={noopLoadAozoraText}
          onExportUnavailable={noopExportUnavailable}
          onExportFailed={noopExportFailed}
          onClose={vi.fn()}
        />
      );
    });

    const jaSummaryText = container.querySelector("[data-export-confirmation-summary='summary']")?.textContent;
    expect(jaSummaryText).toBe("合計文字数：1,112,440文字（概算）　採用/候補：1/2ファイル");

    const jaHeader = container.querySelector("th.exportConfirmationDialogCountCell")?.textContent;
    expect(jaHeader).toBe("文字数（概算）");

    const jaCountCell = container.querySelector("[data-export-candidate-file-path='First/01.md'] td.exportConfirmationDialogCharacterCount")?.textContent;
    expect(jaCountCell).toBe("1,112,440文字");

    act(() => root!.unmount());
    root = null;
    container.remove();
    container = null;

    // Test English formatting
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        <ExportConfirmationDialog
          origin={{ kind: "folder", folderPath: "First" }}
          projectName="Novel"
          candidates={largeCandidates}
          translate={translate}
          uiLanguage="en"
          opener={null}
          onReloadCandidates={noopReload}
          onConfirmDiscardReload={noopConfirmDiscardReload}
          onExportTxt={noopExportTxt}
          loadAozoraText={noopLoadAozoraText}
          onExportUnavailable={noopExportUnavailable}
          onExportFailed={noopExportFailed}
          onClose={vi.fn()}
        />
      );
    });

    const enSummaryText = container.querySelector("[data-export-confirmation-summary='summary']")?.textContent;
    expect(enSummaryText).toBe("Approx. characters: 1,112,440  Included/candidates: 1/2 files");

    const enHeader = container.querySelector("th.exportConfirmationDialogCountCell")?.textContent;
    expect(enHeader).toBe("Characters (approx.)");

    const enCountCell = container.querySelector("[data-export-candidate-file-path='First/01.md'] td.exportConfirmationDialogCharacterCount")?.textContent;
    expect(enCountCell).toBe("1,112,440 chars");
  });
});
