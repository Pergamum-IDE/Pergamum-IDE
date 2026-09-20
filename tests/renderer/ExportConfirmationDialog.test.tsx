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
  async () => ({ ok: true, outputPath: "C:\\export\\manuscript.txt" })
);
const noopLoadAozoraText = vi.fn<
  ExportConfirmationDialogProps["loadAozoraText"]
>(async () => "");
const noopExportUnavailable = vi.fn();
const noopExportFailed = vi.fn();

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
  loadAozoraText?: ExportConfirmationDialogProps["loadAozoraText"];
  onExportUnavailable?: ExportConfirmationDialogProps["onExportUnavailable"];
  onExportFailed?: ExportConfirmationDialogProps["onExportFailed"];
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
        loadAozoraText={options.loadAozoraText ?? noopLoadAozoraText}
        onExportUnavailable={
          options.onExportUnavailable ?? noopExportUnavailable
        }
        onExportFailed={options.onExportFailed ?? noopExportFailed}
        onClose={vi.fn()}
      />
    );
  });
}

function summary(kind: string): string {
  return (
    container!.querySelector<HTMLElement>(
      `[data-export-confirmation-summary="${kind}"]`
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

function fileStructureTocToggle(): HTMLInputElement {
  return container!.querySelector<HTMLInputElement>(
    `[data-export-file-structure-toc-toggle="true"]`
  )!;
}

function fileStructureTocControl(): HTMLElement {
  return fileStructureTocToggle().closest<HTMLElement>(
    ".exportConfirmationDialogTocControl"
  )!;
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

  it("renders the origin, candidate count, and flat candidate list", () => {
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
    expect(markup).toContain("Candidates:");
    expect(markup).toContain("2 files");
    expect(markup).toContain("Included:");
    expect(markup).toContain("Total characters:");
    expect(markup).toContain("15 chars");
    expect(markup).toContain("10 chars");
    expect(markup).toContain("5 chars");
    expect(markup).toContain("Export format");
    expect(markup).toContain("TXT (UTF-8)");
    expect(markup).toContain(
      "TXT (UTF-8) export removes formatting other than ruby and emphasis-dot notation."
    );
    expect(markup).toContain("Interpret body as");
    expect(markup).toContain("Aozora Bunko");
    expect(markup).toContain("Narou");
    expect(markup).toContain("Kakuyomu");
    expect(markup).toContain("Append file structure table of contents");
    expect(markup).toContain(
      "TXT (UTF-8) export cannot append a file structure table of contents."
    );
    expect(markup).toContain("Reload");
    expect(markup).toContain("Remove headings");
    expect(markup).toContain("Do not remove");
    expect(markup).toContain("Remove H1-H6");
    expect(markup).toContain("Does not affect source document files.");
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
    expect(markup).toContain("disabled=\"\"");
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
    expect(markup).toContain("0 files");
    expect(markup).toContain("No exportable documents found.");
    expect(markup).not.toContain("<tbody>");
  });

  it("updates included count and total characters when a row is toggled", () => {
    mountDialog();

    expect(summary("candidate-count")).toBe("2 files");
    expect(summary("included-count")).toBe("2 files");
    expect(summary("character-count")).toBe("26 chars");

    act(() => includeToggle("First/01.md").click());

    expect(summary("candidate-count")).toBe("2 files");
    expect(summary("included-count")).toBe("1 files");
    expect(summary("character-count")).toBe("10 chars");
    expect(folderRow("First").textContent).toContain("Some 1/2");

    act(() => includeToggle("First/01.md").click());

    expect(summary("included-count")).toBe("2 files");
    expect(summary("character-count")).toBe("26 chars");
    expect(folderRow("First").textContent).toContain("Included 2/2");
  });

  it("collapses and expands folder groups without changing totals", () => {
    mountDialog({ candidates: groupedCandidates });

    expect(candidateRow("First/01.md")).not.toBeNull();
    expect(summary("included-count")).toBe("3 files");
    expect(summary("character-count")).toBe("32 chars");

    act(() => folderCollapseButton("First").click());

    expect(candidateRow("First/01.md")).toBeNull();
    expect(candidateRow("First/notes.txt")).toBeNull();
    expect(folderRow("First")).not.toBeNull();
    expect(summary("included-count")).toBe("3 files");
    expect(summary("character-count")).toBe("32 chars");

    act(() => folderCollapseButton("First").click());

    expect(candidateRow("First/01.md")).not.toBeNull();
  });

  it("folder toggle updates child rows, folder summary, and overall summary", () => {
    mountDialog();

    act(() => folderToggle("First").click());

    expect(includeToggle("First/01.md").checked).toBe(false);
    expect(includeToggle("First/notes.txt").checked).toBe(false);
    expect(folderRow("First").textContent).toContain("Included 0/2");
    expect(summary("included-count")).toBe("0 files");
    expect(summary("character-count")).toBe("0 chars");

    act(() => folderToggle("First").click());

    expect(includeToggle("First/01.md").checked).toBe(true);
    expect(includeToggle("First/notes.txt").checked).toBe(true);
    expect(summary("included-count")).toBe("2 files");
    expect(summary("character-count")).toBe("26 chars");

    act(() => includeToggle("First/01.md").click());
    expect(folderRow("First").textContent).toContain("Some 1/2");

    act(() => folderToggle("First").click());

    expect(includeToggle("First/01.md").checked).toBe(true);
    expect(includeToggle("First/notes.txt").checked).toBe(true);
    expect(folderRow("First").textContent).toContain("Included 2/2");
  });

  it("shows and hides the dirty title icon for include and heading changes", () => {
    mountDialog();

    expect(dirtyIcon()).toBeNull();

    act(() => includeToggle("First/01.md").click());

    expect(dirtyIcon()?.getAttribute("title")).toBe("Modified");

    act(() => includeToggle("First/01.md").click());

    expect(dirtyIcon()).toBeNull();

    act(() => {
      const select = headingRemovalSelect();
      select.value = "1";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(dirtyIcon()).not.toBeNull();

    act(() => {
      const select = headingRemovalSelect();
      select.value = "0";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(dirtyIcon()).toBeNull();

    act(() => {
      const select = bodyNotationSelect();
      select.value = "aozora";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(dirtyIcon()).not.toBeNull();

    act(() => {
      const select = bodyNotationSelect();
      select.value = "markdown";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(dirtyIcon()).toBeNull();
  });

  it("exports included rows as TXT with the current dialog state", async () => {
    const onExportTxt = vi.fn<ExportConfirmationDialogProps["onExportTxt"]>(
      async () => ({ ok: true, outputPath: "C:\\export\\manuscript.txt" })
    );
    mountDialog({ onExportTxt });

    expect(fileStructureTocToggle().disabled).toBe(true);
    expect(fileStructureTocToggle().checked).toBe(false);
    expect(fileStructureTocToggle().getAttribute("role")).toBe("switch");
    expect(fileStructureTocControl().getAttribute("title")).toBe(
      "TXT (UTF-8) export cannot append a file structure table of contents."
    );
    const tocChildren = Array.from(fileStructureTocControl().children);
    expect(tocChildren[0]?.classList.contains(
      "exportConfirmationDialogControlLabel"
    )).toBe(true);
    expect(tocChildren[1]?.classList.contains(
      "exportConfirmationDialogIncludeSwitch"
    )).toBe(true);

    await act(async () => {
      buttonByText("Export").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onExportTxt).toHaveBeenCalledTimes(1);
    const request = onExportTxt.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      defaultFileName: "First.txt",
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
      async () => ({ ok: true, outputPath: "C:\\export\\manuscript.txt" })
    );
    const loadAozoraText = vi.fn<
      ExportConfirmationDialogProps["loadAozoraText"]
    >(async (relativePath) =>
      relativePath.endsWith(".txt") ? "※［＃1-14-2］" : "｜吾輩《わがはい》"
    );
    mountDialog({ onExportTxt, loadAozoraText });

    act(() => {
      const select = bodyNotationSelect();
      select.value = "aozora";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      buttonByText("Export").click();
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

    await act(async () => {
      buttonByText("Export").click();
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
    expect(dirtyIcon()).not.toBeNull();
    expect(folderRow("Second").dataset.exportOrderDirty).toBe("true");
    expect(folderRow("First").dataset.exportOrderDirty).toBe("true");

    dispatchDragStart(folderDragHandle("First"));
    dispatchDrop(folderRow("Second"));

    expect(renderedFolderOrder()).toEqual(["First", "Second"]);
    expect(dirtyIcon()).toBeNull();
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
    expect(dirtyIcon()).not.toBeNull();
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
    expect(dirtyIcon()).toBeNull();
  });

  it("recalculates previews and totals when heading removal changes", () => {
    mountDialog({
      candidates: [
        candidateWithText("First/heading.md", "markdown", "# Title\nabcdefghijklmnop"),
        candidateWithText("First/notes.txt", "text", "# Text heading\nbody")
      ]
    });

    expect(candidateRow("First/heading.md")!.textContent).toContain(
      "# Title ab…"
    );
    expect(summary("character-count")).toBe("43 chars");

    act(() => {
      const select = headingRemovalSelect();
      select.value = "1";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(candidateRow("First/heading.md")!.textContent).toContain(
      "abcdefghij…"
    );
    expect(candidateRow("First/heading.md")!.textContent).toContain("16 chars");
    expect(candidateRow("First/notes.txt")!.textContent).toContain(
      "# Text hea…"
    );
    expect(summary("character-count")).toBe("35 chars");
    expect(folderRow("First").textContent).toContain("35 chars");

    act(() => includeToggle("First/heading.md").click());
    act(() => folderCollapseButton("First").click());
    act(() => {
      const select = headingRemovalSelect();
      select.value = "2";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(candidateRow("First/heading.md")).toBeNull();
    expect(summary("character-count")).toBe("19 chars");

    act(() => folderCollapseButton("First").click());

    expect(includeToggle("First/heading.md").checked).toBe(false);
    expect(candidateRow("First/heading.md")!.textContent).toContain(
      "abcdefghij…"
    );
  });

  it("reloads immediately without confirmation when the dialog is clean", async () => {
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
    const onConfirmDiscardReload = vi.fn(async () => false);
    mountDialog({ onReloadCandidates, onConfirmDiscardReload });

    await act(async () => {
      buttonByText("Reload").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onConfirmDiscardReload).not.toHaveBeenCalled();
    expect(onReloadCandidates).toHaveBeenCalledTimes(1);
    expect(candidateRow("First/notes.txt")).toBeNull();
    expect(candidateRow("First/new.md")).not.toBeNull();
    expect(headingRemovalSelect().value).toBe("0");
    expect(includeToggle("First/01.md").checked).toBe(true);
    expect(includeToggle("First/new.md").checked).toBe(true);
    expect(summary("candidate-count")).toBe("2 files");
    expect(summary("included-count")).toBe("2 files");
    expect(summary("character-count")).toBe("29 chars");
    expect(dirtyIcon()).toBeNull();
  });

  it("cancels dirty reload confirmation without changing dialog state", async () => {
    const onReloadCandidates = vi.fn(async () => [candidates[0]]);
    const onConfirmDiscardReload = vi.fn(async () => false);
    mountDialog({ onReloadCandidates, onConfirmDiscardReload });

    act(() => includeToggle("First/01.md").click());

    await act(async () => {
      buttonByText("Reload").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onConfirmDiscardReload).toHaveBeenCalledTimes(1);
    expect(onReloadCandidates).not.toHaveBeenCalled();
    expect(includeToggle("First/01.md").checked).toBe(false);
    expect(dirtyIcon()).not.toBeNull();
  });

  it("confirms dirty reload and discards dialog edits", async () => {
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

    act(() => includeToggle("First/01.md").click());
    act(() => {
      const select = headingRemovalSelect();
      select.value = "1";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    act(() => {
      const select = bodyNotationSelect();
      select.value = "aozora";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      buttonByText("Reload").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onConfirmDiscardReload).toHaveBeenCalledTimes(1);
    expect(onReloadCandidates).toHaveBeenCalledTimes(1);
    expect(candidateRow("First/notes.txt")).toBeNull();
    expect(candidateRow("First/new.md")).not.toBeNull();
    expect(headingRemovalSelect().value).toBe("0");
    expect(bodyNotationSelect().value).toBe("markdown");
    expect(candidateRow("First/01.md")!.textContent).toContain("# Updated");
    expect(includeToggle("First/01.md").checked).toBe(true);
    expect(includeToggle("First/new.md").checked).toBe(true);
    expect(summary("candidate-count")).toBe("2 files");
    expect(summary("included-count")).toBe("2 files");
    expect(summary("character-count")).toBe("29 chars");
    expect(dirtyIcon()).toBeNull();
  });

  it("supports HTML combined export options and exposes last saved path in footer (#523 Slice 7)", async () => {
    const onExportHtmlCombined = vi.fn(async () => ({
      ok: true as const,
      outputPath: "C:\\export\\manuscript.html",
      warningCount: 0
    }));

    mountDialog({ onExportHtmlCombined });

    act(() => {
      const select = container!.querySelector<HTMLSelectElement>(
        "select[data-export-format-select='true']"
      )!;
      select.value = "htmlCombined";
      select.dispatchEvent(new Event("change", { bubbles: true }));
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

    const tocInput = container!.querySelector<HTMLInputElement>(
      "input[data-export-file-structure-toc-toggle='true']"
    );
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

    const confirmBtn = container!.querySelector<HTMLButtonElement>(
      ".appDialogButton-confirm"
    );
    expect(confirmBtn?.disabled).toBe(true);

    act(() => {
      setInputValue(assetFolderInput!, "custom.assets");
    });
    expect(confirmBtn?.disabled).toBe(false);

    await act(async () => {
      confirmBtn!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onExportHtmlCombined).toHaveBeenCalledTimes(1);

    const lastPathEl = container!.querySelector(
      ".exportConfirmationDialogLastExportPath"
    );
    expect(lastPathEl).not.toBeNull();
    expect(lastPathEl?.textContent).toContain("Saved to: C:\\export\\manuscript.html");
  });
});
