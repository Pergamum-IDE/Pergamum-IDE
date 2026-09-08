// @vitest-environment happy-dom
//
// #413: every File Explorer move route hands EVERY explicitly-selected
// Markdown file that changes parent folder to the pre-move image-link
// confirmation hook (single, multiple, or the Markdown files in a mixed
// selection — never a directory source), and applies the confirmed batch
// after the move lands. happy-dom aliases `DragEvent` to `Event`, so drag
// events are built by hand.
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  FileExplorerEntry,
  ListFileExplorerChildrenResult,
  PergamumProject
} from "../../src/shared/api";
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
  { kind: "file", name: "b.md", relativePath: "b.md" },
  { kind: "file", name: "note.txt", relativePath: "note.txt" }
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

interface HarnessOptions {
  prepareDecision?: "proceed" | "cancel";
}

interface Harness {
  moveFileExplorerEntries: ReturnType<typeof vi.fn>;
  onPrepareMarkdownDocumentMoves: ReturnType<typeof vi.fn>;
  onApplyMarkdownDocumentMoveImageLinks: ReturnType<typeof vi.fn>;
  onProjectDocumentsMoved: ReturnType<typeof vi.fn>;
}

async function mount(options: HarnessOptions = {}): Promise<Harness> {
  const listFileExplorerChildren = vi.fn(
    async (
      directoryRelativePath: string | null
    ): Promise<ListFileExplorerChildrenResult> => ({
      kind: "ok",
      directoryRelativePath,
      entries:
        directoryRelativePath === "Drafts"
          ? [{ kind: "file", name: "x.md", relativePath: "Drafts/x.md" }]
          : directoryRelativePath === "Archive"
            ? [{ kind: "file", name: "old.md", relativePath: "Archive/old.md" }]
            : treeRoot
    })
  );
  const moveFileExplorerEntries = vi.fn(async (request: unknown) => {
    const { sourceRelativePaths, destinationFolderRelativePath } = request as {
      sourceRelativePaths: string[];
      destinationFolderRelativePath: string;
    };
    return {
      kind: "completed",
      result: {
        ok: true,
        validation: { ok: true },
        results: sourceRelativePaths.map((sourceRelativePath) => {
          const name = sourceRelativePath.split("/").pop() ?? sourceRelativePath;
          const destinationRelativePath =
            destinationFolderRelativePath === ""
              ? name
              : `${destinationFolderRelativePath}/${name}`;
          return {
            status: "moved",
            sourceRelativePath,
            destinationRelativePath,
            sourceAbsolutePath: `C:/Novel/${sourceRelativePath}`,
            destinationAbsolutePath: `C:/Novel/${destinationRelativePath}`,
            isDirectory: false,
            movedProjectDocuments: []
          };
        }),
        successfulPathPairs: []
      }
    };
  });
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
  const onPrepareMarkdownDocumentMoves = vi.fn(
    async () => options.prepareDecision ?? "proceed"
  );
  const onApplyMarkdownDocumentMoveImageLinks = vi.fn();
  const onProjectDocumentsMoved = vi.fn();

  Object.defineProperty(window, "pergamum", {
    configurable: true,
    value: {
      projects: {
        listFileExplorerChildren,
        moveFileExplorerEntries,
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
        readOnly: false,
        onActivateDocument: vi.fn(),
        dirtyProjectDocumentRelativePaths: [],
        onMoveResultMessage: vi.fn(),
        onProjectDocumentsMoved,
        onPrepareMarkdownDocumentMoves,
        onApplyMarkdownDocumentMoveImageLinks
      })
    );
  });
  await flush();

  return {
    moveFileExplorerEntries,
    onPrepareMarkdownDocumentMoves,
    onApplyMarkdownDocumentMoveImageLinks,
    onProjectDocumentsMoved
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

function click(selector: string): void {
  act(() => {
    container!
      .querySelector<HTMLButtonElement>(selector)!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function clickEntry(
  relativePath: string,
  modifiers: { ctrlKey?: boolean } = {}
): void {
  act(() => {
    entryButton(relativePath).dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, ...modifiers })
    );
  });
}

describe("#413 File Explorer D&D move — image-link update hook", () => {
  it("hands a single Markdown file drop to the batch hook, then moves + tracks", async () => {
    const harness = await mount({ prepareDecision: "proceed" });
    await dragDrop("a.md", "Drafts");
    click(".fileExplorerDragDropMoveButton");
    await flush();

    expect(harness.onPrepareMarkdownDocumentMoves).toHaveBeenCalledWith([
      { oldProjectRelativePath: "a.md", newProjectRelativePath: "Drafts/a.md" }
    ]);
    expect(harness.moveFileExplorerEntries).toHaveBeenCalledWith({
      sourceRelativePaths: ["a.md"],
      destinationFolderRelativePath: "Drafts",
      dirtyProjectDocumentRelativePaths: []
    });
    // Existing document path tracking still fires.
    expect(harness.onProjectDocumentsMoved).toHaveBeenCalledWith([
      { oldRelativePath: "a.md", newRelativePath: "Drafts/a.md" }
    ]);
    expect(
      harness.onApplyMarkdownDocumentMoveImageLinks
    ).toHaveBeenCalledWith([
      { oldRelativePath: "a.md", newRelativePath: "Drafts/a.md" }
    ]);
  });

  it("hands EVERY selected Markdown file of a multi-drop to the batch hook, and tracks all", async () => {
    const harness = await mount({ prepareDecision: "proceed" });
    clickEntry("a.md");
    clickEntry("b.md", { ctrlKey: true });
    await dragDrop("a.md", "Drafts");
    click(".fileExplorerDragDropMoveButton");
    await flush();

    expect(harness.onPrepareMarkdownDocumentMoves).toHaveBeenCalledWith([
      { oldProjectRelativePath: "a.md", newProjectRelativePath: "Drafts/a.md" },
      { oldProjectRelativePath: "b.md", newProjectRelativePath: "Drafts/b.md" }
    ]);
    expect(harness.moveFileExplorerEntries).toHaveBeenCalledWith({
      sourceRelativePaths: ["a.md", "b.md"],
      destinationFolderRelativePath: "Drafts",
      dirtyProjectDocumentRelativePaths: []
    });
    // Both moved Markdown documents' identities must follow.
    expect(harness.onProjectDocumentsMoved).toHaveBeenCalledWith([
      { oldRelativePath: "a.md", newRelativePath: "Drafts/a.md" },
      { oldRelativePath: "b.md", newRelativePath: "Drafts/b.md" }
    ]);
    expect(
      harness.onApplyMarkdownDocumentMoveImageLinks
    ).toHaveBeenCalledWith([
      { oldRelativePath: "a.md", newRelativePath: "Drafts/a.md" },
      { oldRelativePath: "b.md", newRelativePath: "Drafts/b.md" }
    ]);
  });

  it("hands only the Markdown file of a mixed-selection drop to the batch hook", async () => {
    const harness = await mount({ prepareDecision: "proceed" });
    clickEntry("a.md");
    clickEntry("note.txt", { ctrlKey: true });
    await dragDrop("a.md", "Drafts");
    click(".fileExplorerDragDropMoveButton");
    await flush();

    expect(harness.onPrepareMarkdownDocumentMoves).toHaveBeenCalledWith([
      { oldProjectRelativePath: "a.md", newProjectRelativePath: "Drafts/a.md" }
    ]);
    // The move itself still carries the full selection.
    expect(harness.moveFileExplorerEntries).toHaveBeenCalledWith({
      sourceRelativePaths: ["a.md", "note.txt"],
      destinationFolderRelativePath: "Drafts",
      dirtyProjectDocumentRelativePaths: []
    });
    expect(harness.onProjectDocumentsMoved).toHaveBeenCalledWith([
      { oldRelativePath: "a.md", newRelativePath: "Drafts/a.md" },
      { oldRelativePath: "note.txt", newRelativePath: "Drafts/note.txt" }
    ]);
  });

  it("aborts the drop move when the pre-move hook returns cancel", async () => {
    const harness = await mount({ prepareDecision: "cancel" });
    await dragDrop("a.md", "Drafts");
    click(".fileExplorerDragDropMoveButton");
    await flush();

    expect(harness.onPrepareMarkdownDocumentMoves).toHaveBeenCalledTimes(1);
    expect(harness.moveFileExplorerEntries).not.toHaveBeenCalled();
    expect(
      harness.onApplyMarkdownDocumentMoveImageLinks
    ).not.toHaveBeenCalled();
  });

  it("does not fire the batch hook for a directory drop move", async () => {
    const harness = await mount();
    await dragDrop("Archive", "Drafts");
    click(".fileExplorerDragDropMoveButton");
    await flush();

    expect(harness.onPrepareMarkdownDocumentMoves).not.toHaveBeenCalled();
    expect(harness.moveFileExplorerEntries).toHaveBeenCalledWith({
      sourceRelativePaths: ["Archive"],
      destinationFolderRelativePath: "Drafts",
      dirtyProjectDocumentRelativePaths: []
    });
  });

  it("does not fire the batch hook for a non-Markdown file drop move", async () => {
    const harness = await mount();
    await dragDrop("note.txt", "Drafts");
    click(".fileExplorerDragDropMoveButton");
    await flush();

    expect(harness.onPrepareMarkdownDocumentMoves).not.toHaveBeenCalled();
    expect(harness.moveFileExplorerEntries).toHaveBeenCalled();
  });
});
