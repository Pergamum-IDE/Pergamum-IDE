// @vitest-environment happy-dom
//
// #356: the File Explorer internal D&D drop now opens a Move / Copy / Cancel
// confirmation. Move reuses the existing Move pipeline; Copy runs a
// plan → (optional rename-copy confirmation) → execute flow. happy-dom aliases
// `DragEvent` to `Event`, so drag events are built by hand.
import { readFileSync } from "node:fs";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  FileExplorerEntry,
  ListFileExplorerChildrenResult,
  PergamumProject
} from "../../src/shared/api";
import type {
  FileExplorerCopyPlan,
  FileExplorerCopyPlanRow
} from "../../src/shared/projectCopy";
import { t, type Translate } from "../../src/shared/i18n";
import { FileExplorer } from "../../src/renderer/FileExplorer";

const translate: Translate = (key, values) => t("en", key, values);

const project: PergamumProject = {
  rootPath: "C:\\Novel",
  activeProjectFilePath: "C:\\Novel\\Novel.pergamum",
  accessMode: { kind: "readWrite" },
  name: "Novel",
  config: null,
  documents: []
};

const treeRoot: FileExplorerEntry[] = [
  { kind: "folder", name: "Drafts", relativePath: "Drafts" },
  { kind: "folder", name: "Archive", relativePath: "Archive" },
  { kind: "file", name: "a.md", relativePath: "a.md" },
  { kind: "file", name: "b.md", relativePath: "b.md" }
];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
  delete (window as unknown as { pergamum?: unknown }).pergamum;
  vi.restoreAllMocks();
});

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function planRow(
  overrides: Partial<FileExplorerCopyPlanRow> = {}
): FileExplorerCopyPlanRow {
  return {
    sourceRelativePath: "a.md",
    sourceName: "a.md",
    sourceKind: "file",
    sourceSizeBytes: 12,
    sourceModifiedAt: new Date(1_000).toISOString(),
    destinationName: "a copy.md",
    destinationRelativePath: "Drafts/a copy.md",
    wasAutoRenamed: false,
    collisionSizeBytes: null,
    collisionModifiedAt: null,
    status: "ready",
    ...overrides
  };
}

interface HarnessOptions {
  plan?: FileExplorerCopyPlan;
  executeResult?: unknown;
  readOnly?: boolean;
}

interface Harness {
  moveFileExplorerEntries: ReturnType<typeof vi.fn>;
  planFileExplorerCopyEntries: ReturnType<typeof vi.fn>;
  executeFileExplorerCopyPlan: ReturnType<typeof vi.fn>;
  statFileExplorerEntries: ReturnType<typeof vi.fn>;
  onMoveResultMessage: ReturnType<typeof vi.fn>;
}

async function mount(options: HarnessOptions = {}): Promise<Harness> {
  const listFileExplorerChildren = vi.fn(
    async (directoryRelativePath: string | null): Promise<ListFileExplorerChildrenResult> => ({
      kind: "ok",
      directoryRelativePath,
      entries:
        directoryRelativePath === "Drafts"
          ? [{ kind: "file", name: "x.md", relativePath: "Drafts/x.md" }]
          : treeRoot
    })
  );
  const moveFileExplorerEntries = vi.fn(async () => ({
    kind: "completed",
    result: {
      ok: true,
      validation: { ok: true },
      results: [
        {
          status: "moved",
          sourceRelativePath: "a.md",
          destinationRelativePath: "Drafts/a.md",
          sourceAbsolutePath: "C:/Novel/a.md",
          destinationAbsolutePath: "C:/Novel/Drafts/a.md",
          isDirectory: false,
          movedProjectDocuments: []
        }
      ],
      successfulPathPairs: []
    }
  }));
  const defaultPlan: FileExplorerCopyPlan = options.plan ?? {
    planId: "plan-1",
    destinationFolderRelativePath: "Drafts",
    rows: [planRow()],
    hasCollisions: false,
    hasBlockingIssues: false
  };
  const planFileExplorerCopyEntries = vi.fn(async () => ({
    kind: "planned",
    plan: defaultPlan
  }));
  const executeFileExplorerCopyPlan = vi.fn(
    async () =>
      options.executeResult ?? {
        kind: "completed",
        result: {
          ok: true,
          results: defaultPlan.rows
            .filter((r) => r.status !== "blocked")
            .map((r) => ({
              status: "copied",
              sourceRelativePath: r.sourceRelativePath,
              destinationRelativePath: r.destinationRelativePath,
              isDirectory: r.sourceKind === "folder"
            })),
          registeredDocumentRelativePaths: []
        }
      }
  );
  const statFileExplorerEntries = vi.fn(async () => ({
    kind: "ok",
    entries: [
      {
        relativePath: "a.md",
        name: "a.md",
        kind: "file",
        sizeBytes: 12,
        modifiedAt: new Date(1_000).toISOString()
      }
    ]
  }));
  const onMoveResultMessage = vi.fn();

  Object.defineProperty(window, "pergamum", {
    configurable: true,
    value: {
      projects: {
        listFileExplorerChildren,
        moveFileExplorerEntries,
        planFileExplorerCopyEntries,
        executeFileExplorerCopyPlan,
        statFileExplorerEntries
      }
    }
  });

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      React.createElement(FileExplorer, {
        project,
        highlightedRelativePath: null,
        translate,
        readOnly: options.readOnly ?? false,
        onActivateDocument: vi.fn(),
        dirtyProjectDocumentRelativePaths: [],
        onMoveResultMessage,
        onProjectDocumentsMoved: vi.fn()
      })
    );
  });
  await flush();

  return {
    moveFileExplorerEntries,
    planFileExplorerCopyEntries,
    executeFileExplorerCopyPlan,
    statFileExplorerEntries,
    onMoveResultMessage
  };
}

function entryButton(relativePath: string): HTMLButtonElement {
  return container!.querySelector<HTMLButtonElement>(
    `[data-file-explorer-entry-path="${relativePath}"]`
  )!;
}

function makeDragEvent(type: string, dataTransfer?: DataTransfer): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    configurable: true,
    value: dataTransfer ?? new window.DataTransfer()
  });
  return event;
}

async function dragDrop(sourcePath: string, targetPath: string): Promise<void> {
  const start = makeDragEvent("dragstart");
  act(() => {
    entryButton(sourcePath).dispatchEvent(start);
  });
  const dt = (start as unknown as { dataTransfer: DataTransfer }).dataTransfer;
  act(() => {
    entryButton(targetPath).dispatchEvent(makeDragEvent("dragover", dt));
  });
  act(() => {
    entryButton(targetPath).dispatchEvent(makeDragEvent("drop", dt));
  });
  await flush();
}

function q(selector: string): HTMLElement | null {
  return container!.querySelector<HTMLElement>(selector);
}
function click(selector: string): void {
  act(() => {
    container!
      .querySelector<HTMLButtonElement>(selector)!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("File Explorer D&D confirmation (#356)", () => {
  it("opens the Move / Copy / Cancel dialog on drop instead of executing Move", async () => {
    const harness = await mount();
    await dragDrop("a.md", "Drafts");

    expect(q(".fileExplorerDragDropDialog")).not.toBeNull();
    expect(q(".fileExplorerDragDropMoveButton")).not.toBeNull();
    expect(q(".fileExplorerDragDropCopyButton")).not.toBeNull();
    expect(harness.moveFileExplorerEntries).not.toHaveBeenCalled();
    expect(harness.planFileExplorerCopyEntries).not.toHaveBeenCalled();
    // no overwrite affordance anywhere in the dialog
    expect(container!.textContent?.toLowerCase()).not.toContain("overwrite");
  });

  it("focuses Cancel initially so Enter never triggers Move or Copy", async () => {
    const harness = await mount();
    await dragDrop("a.md", "Drafts");

    expect(document.activeElement).toBe(q(".fileExplorerDragDropCancelButton"));

    act(() => {
      q(".fileExplorerDragDropCancelButton")!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });
    await flush();
    expect(harness.moveFileExplorerEntries).not.toHaveBeenCalled();
    expect(harness.planFileExplorerCopyEntries).not.toHaveBeenCalled();
  });

  it("Cancel executes nothing and closes the dialog", async () => {
    const harness = await mount();
    await dragDrop("a.md", "Drafts");
    click(".fileExplorerDragDropCancelButton");
    await flush();

    expect(q(".fileExplorerDragDropDialog")).toBeNull();
    expect(harness.moveFileExplorerEntries).not.toHaveBeenCalled();
    expect(harness.planFileExplorerCopyEntries).not.toHaveBeenCalled();
  });

  it("Move runs the existing Move pipeline", async () => {
    const harness = await mount();
    await dragDrop("a.md", "Drafts");
    click(".fileExplorerDragDropMoveButton");
    await flush();

    expect(harness.moveFileExplorerEntries).toHaveBeenCalledWith({
      sourceRelativePaths: ["a.md"],
      destinationFolderRelativePath: "Drafts",
      dirtyProjectDocumentRelativePaths: []
    });
    expect(harness.planFileExplorerCopyEntries).not.toHaveBeenCalled();
  });

  it("Copy with no collisions runs plan then executes directly (no second dialog)", async () => {
    const harness = await mount();
    await dragDrop("a.md", "Drafts");
    click(".fileExplorerDragDropCopyButton");
    await flush();

    expect(harness.planFileExplorerCopyEntries).toHaveBeenCalledWith({
      sourceRelativePaths: ["a.md"],
      destinationFolderRelativePath: "Drafts",
      dirtyProjectDocumentRelativePaths: []
    });
    expect(harness.executeFileExplorerCopyPlan).toHaveBeenCalledWith({
      planId: "plan-1",
      dirtyProjectDocumentRelativePaths: []
    });
    expect(q(".fileExplorerCopyCollisionDialog")).toBeNull();
    expect(harness.onMoveResultMessage).toHaveBeenCalledWith(
      expect.stringContaining("Copied 1")
    );
  });

  it("Copy with a collision opens the rename-copy confirmation and executes on Copy", async () => {
    const harness = await mount({
      plan: {
        planId: "plan-9",
        destinationFolderRelativePath: "Drafts",
        rows: [
          planRow({
            destinationName: "a copy 2.md",
            destinationRelativePath: "Drafts/a copy 2.md",
            wasAutoRenamed: true,
            status: "will-auto-rename",
            collisionSizeBytes: 99,
            collisionModifiedAt: new Date(2_000).toISOString()
          })
        ],
        hasCollisions: true,
        hasBlockingIssues: false
      }
    });
    await dragDrop("a.md", "Drafts");
    click(".fileExplorerDragDropCopyButton");
    await flush();

    const dialog = q(".fileExplorerCopyCollisionDialog");
    expect(dialog).not.toBeNull();
    expect(harness.executeFileExplorerCopyPlan).not.toHaveBeenCalled();
    // destination shown once, above the table
    expect(dialog!.querySelector(".fileExplorerCopyCollisionDialogDestinationPath")?.textContent).toBe(
      "Drafts"
    );
    // the 9 spec columns
    const headers = [
      ...dialog!.querySelectorAll("thead th")
    ].map((th) => th.textContent);
    expect(headers).toEqual([
      t("en", "explorer.copy.collision.column.status"),
      t("en", "explorer.copy.collision.column.source"),
      t("en", "explorer.copy.collision.column.sourceSize"),
      t("en", "explorer.copy.collision.column.sourceModified"),
      t("en", "explorer.copy.collision.column.direction"),
      t("en", "explorer.copy.collision.column.destinationName"),
      t("en", "explorer.copy.collision.column.existingSize"),
      t("en", "explorer.copy.collision.column.existingModified"),
      t("en", "explorer.copy.collision.column.action")
    ]);
    expect(document.activeElement).toBe(
      dialog!.querySelector(".fileExplorerCopyCollisionCancelButton")
    );

    click(".fileExplorerCopyCollisionRunButton");
    await flush();

    expect(harness.executeFileExplorerCopyPlan).toHaveBeenCalledWith({
      planId: "plan-9",
      dirtyProjectDocumentRelativePaths: []
    });
    // completion swaps Cancel → Close; the Copy button is no longer actionable
    expect(q(".fileExplorerCopyCollisionCloseButton")).not.toBeNull();
    expect(q(".fileExplorerCopyCollisionCancelButton")).toBeNull();
    const runButton = container!.querySelector<HTMLButtonElement>(
      ".fileExplorerCopyCollisionRunButton"
    );
    expect(runButton?.hidden || runButton === null).toBe(true);
  });

  it("a blocked plan surfaces the failure list and never executes", async () => {
    const harness = await mount({
      plan: {
        planId: "plan-b",
        destinationFolderRelativePath: "Drafts",
        rows: [],
        hasCollisions: false,
        hasBlockingIssues: true,
        blockingReason: "destination-not-folder"
      }
    });
    await dragDrop("a.md", "Drafts");
    click(".fileExplorerDragDropCopyButton");
    await flush();

    expect(harness.executeFileExplorerCopyPlan).not.toHaveBeenCalled();
    expect(
      container!.querySelector('[data-file-operation-failure="true"]')
    ).not.toBeNull();
    expect(container!.textContent).toContain(
      t("en", "fileOperation.copy.blocked.title")
    );
  });

  it("shows the folder note when a folder is among the dragged sources", async () => {
    await mount();
    await dragDrop("Drafts", "Archive");

    const dialog = q(".fileExplorerDragDropDialog");
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toContain(
      t("en", "explorer.dnd.dialog.folderNote")
    );
    // the table lists the top-level dragged source only
    expect(dialog!.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(dialog!.querySelector("tbody tr")?.textContent).toContain("Drafts");
  });

  it("keeps the dialog closed for an invalid (file-row) drop target", async () => {
    const harness = await mount();
    await dragDrop("a.md", "b.md");
    expect(q(".fileExplorerDragDropDialog")).toBeNull();
    expect(harness.moveFileExplorerEntries).not.toHaveBeenCalled();
  });
});

describe("File Explorer D&D confirmation (#356) — untouched behavior", () => {
  it("does not touch the File Explorer Rename pipeline", () => {
    for (const file of [
      "src/renderer/FileExplorerDragDropDialog.tsx",
      "src/renderer/FileExplorerCopyCollisionDialog.tsx",
      "src/main/projectCopyValidation.ts",
      "src/main/projectCopyExecution.ts"
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("fileExplorerRename");
      expect(source).not.toContain("renameFileExplorerEntry");
      expect(source).not.toContain("RenameFileExplorer");
    }
  });

  it("keeps the copy execution request free of any overwrite flag", () => {
    const execSource = readFileSync(
      "src/main/projectCopyExecution.ts",
      "utf8"
    );
    expect(execSource).toContain("errorOnExist: true");
    expect(execSource).toContain("force: false");
    expect(execSource).not.toMatch(/overwrite/i);
  });
});
