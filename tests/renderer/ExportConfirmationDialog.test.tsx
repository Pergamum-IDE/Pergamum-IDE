// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { t, type Translate } from "../../src/shared/i18n";
import { ExportConfirmationDialog } from "../../src/renderer/dialog/ExportConfirmationDialog";
import {
  createExportCandidateTextDetails,
  type ExportCandidateListItem,
  type ExportDocumentKind
} from "../../src/renderer/exportCandidates";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const translate: Translate = (key, values) => t("en", key, values);
const noopReload = vi.fn(async () => null);

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
    ".exportConfirmationDialogSelect"
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
    expect(markup).toContain("Reload");
    expect(markup).toContain("Remove headings");
    expect(markup).toContain("Do not remove");
    expect(markup).toContain("Remove H1-H6");
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
    expect(summary("character-count")).toBe("15 chars");

    act(() => includeToggle("First/01.md").click());

    expect(summary("candidate-count")).toBe("2 files");
    expect(summary("included-count")).toBe("1 files");
    expect(summary("character-count")).toBe("5 chars");
    expect(folderRow("First").textContent).toContain("Some 1/2");

    act(() => includeToggle("First/01.md").click());

    expect(summary("included-count")).toBe("2 files");
    expect(summary("character-count")).toBe("15 chars");
    expect(folderRow("First").textContent).toContain("Included 2/2");
  });

  it("collapses and expands folder groups without changing totals", () => {
    mountDialog({ candidates: groupedCandidates });

    expect(candidateRow("First/01.md")).not.toBeNull();
    expect(summary("included-count")).toBe("3 files");
    expect(summary("character-count")).toBe("35 chars");

    act(() => folderCollapseButton("First").click());

    expect(candidateRow("First/01.md")).toBeNull();
    expect(candidateRow("First/notes.txt")).toBeNull();
    expect(folderRow("First")).not.toBeNull();
    expect(summary("included-count")).toBe("3 files");
    expect(summary("character-count")).toBe("35 chars");

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
    expect(summary("character-count")).toBe("15 chars");

    act(() => includeToggle("First/01.md").click());
    expect(folderRow("First").textContent).toContain("Some 1/2");

    act(() => folderToggle("First").click());

    expect(includeToggle("First/01.md").checked).toBe(true);
    expect(includeToggle("First/notes.txt").checked).toBe(true);
    expect(folderRow("First").textContent).toContain("Included 2/2");
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

  it("reload preserves existing included state and adds new files included", async () => {
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
    mountDialog({ onReloadCandidates });

    act(() => includeToggle("First/01.md").click());
    act(() => {
      const select = headingRemovalSelect();
      select.value = "1";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      buttonByText("Reload").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onReloadCandidates).toHaveBeenCalledTimes(1);
    expect(candidateRow("First/notes.txt")).toBeNull();
    expect(candidateRow("First/new.md")).not.toBeNull();
    expect(headingRemovalSelect().value).toBe("1");
    expect(candidateRow("First/01.md")!.textContent).toContain("updated bo…");
    expect(candidateRow("First/01.md")!.textContent).not.toContain("# Updated");
    expect(includeToggle("First/01.md").checked).toBe(false);
    expect(includeToggle("First/new.md").checked).toBe(true);
    expect(summary("candidate-count")).toBe("2 files");
    expect(summary("included-count")).toBe("1 files");
    expect(summary("character-count")).toBe("7 chars");
  });
});
