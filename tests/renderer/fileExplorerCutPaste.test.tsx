// @vitest-environment happy-dom
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

const otherProject: PergamumProject = {
  ...project,
  rootPath: "C:\\OtherNovel",
  activeProjectFilePath: "C:\\OtherNovel\\Other.pergamum",
  name: "OtherNovel"
};

const treeRoot: FileExplorerEntry[] = [
  { kind: "folder", name: "Drafts", relativePath: "Drafts" },
  { kind: "folder", name: "Archive", relativePath: "Archive" },
  { kind: "file", name: "a.md", relativePath: "a.md" },
  { kind: "file", name: "b.md", relativePath: "b.md" },
  { kind: "file", name: "c.md", relativePath: "c.md" }
];

const defaultDraftsChildren: FileExplorerEntry[] = [
  { kind: "file", name: "x.md", relativePath: "Drafts/x.md" }
];

function ok(
  directoryRelativePath: string | null,
  entries: FileExplorerEntry[]
): ListFileExplorerChildrenResult {
  return { kind: "ok", directoryRelativePath, entries };
}

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
});

async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function movedResult(
  entries: Array<{ src: string; dest: string }>,
  extra: Record<string, unknown> = {}
) {
  return {
    kind: "completed",
    result: {
      ok: true,
      validation: { ok: true },
      results: entries.map((entry) => ({
        status: "moved",
        sourceRelativePath: entry.src,
        destinationRelativePath: entry.dest,
        sourceAbsolutePath: `C:/Novel/${entry.src}`,
        destinationAbsolutePath: `C:/Novel/${entry.dest}`
      })),
      successfulPathPairs: entries.map((entry) => ({
        oldAbsolutePath: `C:/Novel/${entry.src}`,
        newAbsolutePath: `C:/Novel/${entry.dest}`
      })),
      ...extra
    }
  };
}

interface Harness {
  moveFileExplorerEntries: ReturnType<typeof vi.fn>;
  onMoveResultMessage: ReturnType<typeof vi.fn>;
  onProjectDocumentsMoved: ReturnType<typeof vi.fn>;
  listCalls: Array<string | null>;
  /** #338: only DIRTY open documents block Cut/Paste — set the dirty list. */
  setDirtyProjectDocuments: (relativePaths: string[]) => void;
  setDraftsChildren: (entries: FileExplorerEntry[]) => void;
  setProject: (next: PergamumProject) => void;
}

async function mount(
  options: {
    moveImpl?: (request: unknown) => unknown;
    dirtyProjectDocumentRelativePaths?: string[];
    readOnly?: boolean;
  } = {}
): Promise<Harness> {
  const listCalls: Array<string | null> = [];
  let draftsChildren = defaultDraftsChildren;
  const listFileExplorerChildren = vi.fn(
    async (directoryRelativePath: string | null) => {
      listCalls.push(directoryRelativePath);
      return ok(
        directoryRelativePath,
        directoryRelativePath === "Drafts" ? draftsChildren : treeRoot
      );
    }
  );
  const moveFileExplorerEntries = vi.fn(async (request: unknown) =>
    options.moveImpl
      ? options.moveImpl(request)
      : movedResult([{ src: "a.md", dest: "Drafts/a.md" }])
  );
  const onMoveResultMessage = vi.fn();
  const onProjectDocumentsMoved = vi.fn();

  Object.defineProperty(window, "pergamum", {
    configurable: true,
    value: {
      projects: { listFileExplorerChildren, moveFileExplorerEntries }
    }
  });

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  let dirtyProjectDocumentRelativePaths =
    options.dirtyProjectDocumentRelativePaths ?? [];
  let currentProject = project;

  const renderExplorer = (): void => {
    act(() => {
      root!.render(
        React.createElement(FileExplorer, {
          project: currentProject,
          highlightedRelativePath: null,
          translate,
          readOnly: options.readOnly ?? false,
          onActivateDocument: vi.fn(),
          dirtyProjectDocumentRelativePaths,
          onMoveResultMessage,
          onProjectDocumentsMoved
        })
      );
    });
  };

  renderExplorer();
  await flushPromises();

  return {
    moveFileExplorerEntries,
    onMoveResultMessage,
    onProjectDocumentsMoved,
    listCalls,
    setDirtyProjectDocuments: (relativePaths) => {
      dirtyProjectDocumentRelativePaths = relativePaths;
      renderExplorer();
    },
    setDraftsChildren: (entries) => {
      draftsChildren = entries;
    },
    setProject: (next) => {
      currentProject = next;
      renderExplorer();
    }
  };
}

function entryButton(relativePath: string): HTMLButtonElement {
  const button = container!.querySelector<HTMLButtonElement>(
    `[data-file-explorer-entry-path="${relativePath}"]`
  );
  if (!button) {
    throw new Error(`entry ${relativePath} not rendered`);
  }
  return button;
}

function rootButton(): HTMLButtonElement {
  return container!.querySelector<HTMLButtonElement>(
    '[data-file-explorer-entry-kind="root"]'
  )!;
}

function fileExplorerList(): HTMLElement {
  return container!.querySelector<HTMLElement>(".fileExplorerList")!;
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

function clickRoot(): void {
  act(() => {
    rootButton().dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
  });
}

function dispatchContextMenu(target: Element): void {
  act(() => {
    target.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
    );
  });
}

function contextMenuEntry(relativePath: string): void {
  dispatchContextMenu(entryButton(relativePath));
}

function rightClickRoot(): void {
  dispatchContextMenu(rootButton());
}

function rightClickListArea(): void {
  dispatchContextMenu(fileExplorerList());
}

function menuItem(
  command: "move" | "cut" | "paste"
): HTMLButtonElement | null {
  return container!.querySelector<HTMLButtonElement>(
    `[data-file-explorer-context-command="${command}"]`
  );
}

function cutMenuItem(): HTMLButtonElement {
  const item = menuItem("cut");
  if (!item) {
    throw new Error("Cut menu item not rendered");
  }
  return item;
}

function pasteMenuItem(): HTMLButtonElement {
  const item = menuItem("paste");
  if (!item) {
    throw new Error("Paste menu item not rendered");
  }
  return item;
}

function cutMarkers(): string[] {
  return Array.from(
    container!.querySelectorAll('[data-file-explorer-cut="true"]')
  )
    .map((element) => element.getAttribute("data-file-explorer-entry-path"))
    .filter((path): path is string => Boolean(path))
    .sort();
}

function selectedPaths(): string[] {
  return Array.from(
    container!.querySelectorAll('[role="treeitem"][aria-selected="true"]')
  )
    .map((element) => element.getAttribute("data-file-explorer-entry-path"))
    .filter((path): path is string => Boolean(path))
    .sort();
}

function pressKey(
  target: Element | Document,
  key: string,
  init: KeyboardEventInit = {}
): void {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key,
        ...init
      })
    );
  });
}

async function cutViaContextMenu(...relativePaths: string[]): Promise<void> {
  relativePaths.forEach((relativePath, index) => {
    clickEntry(relativePath, index === 0 ? {} : { ctrlKey: true });
  });
  contextMenuEntry(relativePaths[relativePaths.length - 1]);
  act(() => cutMenuItem().click());
}

// ---------------------------------------------------------------------------
// Cut state
// ---------------------------------------------------------------------------
describe("FileExplorer Cut/Paste — Cut state (#328)", () => {
  it("cuts a files-only selection without touching the filesystem", async () => {
    const harness = await mount();
    await cutViaContextMenu("a.md", "c.md");

    expect(cutMarkers()).toEqual(["a.md", "c.md"]);
    expect(harness.moveFileExplorerEntries).not.toHaveBeenCalled();
  });

  it("disables Cut for an empty selection with a reason in the title", async () => {
    await mount();
    rightClickListArea();

    const item = cutMenuItem();
    expect(item.disabled).toBe(true);
    expect(item.getAttribute("title")).toBe("Select one or more files to cut.");
    expect(
      item.getAttribute("data-file-explorer-cut-disabled-reason")
    ).toBe("empty-selection");
  });

  it("disables Cut when the selection contains a folder", async () => {
    await mount();
    clickEntry("a.md");
    clickEntry("Drafts", { ctrlKey: true });
    contextMenuEntry("Drafts");

    const item = cutMenuItem();
    expect(item.disabled).toBe(true);
    expect(
      item.getAttribute("data-file-explorer-cut-disabled-reason")
    ).toBe("contains-folder");
  });

  it("disables Cut when a selected file is a DIRTY open document (#338)", async () => {
    await mount({ dirtyProjectDocumentRelativePaths: ["a.md"] });
    clickEntry("a.md");
    contextMenuEntry("a.md");

    const item = cutMenuItem();
    expect(item.disabled).toBe(true);
    expect(item.getAttribute("title")).toBe(
      "Save the document before moving it."
    );
    expect(
      item.getAttribute("data-file-explorer-cut-disabled-reason")
    ).toBe("contains-dirty-open-document");
  });

  it("allows Cut of a CLEAN open document (#338)", async () => {
    await mount({ dirtyProjectDocumentRelativePaths: [] });
    clickEntry("a.md");
    contextMenuEntry("a.md");

    expect(cutMenuItem().disabled).toBe(false);
  });

  it("disables Cut in a read-only project", async () => {
    await mount({ readOnly: true });
    clickEntry("a.md");
    contextMenuEntry("a.md");

    const item = cutMenuItem();
    expect(item.disabled).toBe(true);
    expect(item.getAttribute("title")).toBe(
      "Files cannot be cut in a read-only project."
    );
  });

  it("replaces the pending Cut when a later Cut is made", async () => {
    await mount();
    await cutViaContextMenu("a.md");
    expect(cutMarkers()).toEqual(["a.md"]);

    await cutViaContextMenu("b.md");
    expect(cutMarkers()).toEqual(["b.md"]);
  });

  it("clears the pending Cut when the project changes", async () => {
    const harness = await mount();
    await cutViaContextMenu("a.md");
    expect(cutMarkers()).toEqual(["a.md"]);

    harness.setProject(otherProject);
    await flushPromises();

    expect(cutMarkers()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Paste destination
// ---------------------------------------------------------------------------
describe("FileExplorer Cut/Paste — Paste destination (#328)", () => {
  it("pastes into the project root when the root row is selected", async () => {
    const harness = await mount();
    await cutViaContextMenu("a.md");
    clickRoot();
    rightClickRoot();
    act(() => pasteMenuItem().click());
    await flushPromises();

    expect(harness.moveFileExplorerEntries).toHaveBeenCalledWith(
      expect.objectContaining({ destinationFolderRelativePath: "" })
    );
  });

  it("pastes into a selected folder", async () => {
    const harness = await mount();
    await cutViaContextMenu("a.md");
    contextMenuEntry("Drafts");
    act(() => pasteMenuItem().click());
    await flushPromises();

    expect(harness.moveFileExplorerEntries).toHaveBeenCalledWith(
      expect.objectContaining({ destinationFolderRelativePath: "Drafts" })
    );
  });

  it("pastes into the parent folder of a selected file", async () => {
    const harness = await mount();
    await cutViaContextMenu("a.md");
    clickEntry("Drafts");
    await flushPromises();
    clickEntry("Drafts/x.md");
    contextMenuEntry("Drafts/x.md");
    act(() => pasteMenuItem().click());
    await flushPromises();

    expect(harness.moveFileExplorerEntries).toHaveBeenCalledWith(
      expect.objectContaining({ destinationFolderRelativePath: "Drafts" })
    );
  });
});

// ---------------------------------------------------------------------------
// Paste execution
// ---------------------------------------------------------------------------
describe("FileExplorer Cut/Paste — Paste execution (#328)", () => {
  it("calls the Move IPC with the cut sources, resolved destination, and dirty paths", async () => {
    const harness = await mount({
      dirtyProjectDocumentRelativePaths: ["notes.md"]
    });
    await cutViaContextMenu("a.md", "b.md");
    contextMenuEntry("Drafts");
    act(() => pasteMenuItem().click());
    await flushPromises();

    expect(harness.moveFileExplorerEntries).toHaveBeenCalledWith({
      sourceRelativePaths: ["a.md", "b.md"],
      destinationFolderRelativePath: "Drafts",
      dirtyProjectDocumentRelativePaths: ["notes.md"]
    });
  });

  it("refreshes the destination folder and clears the Cut on success", async () => {
    const harness = await mount();
    await cutViaContextMenu("a.md");
    harness.listCalls.length = 0;
    contextMenuEntry("Drafts");
    act(() => pasteMenuItem().click());
    await flushPromises();

    expect(harness.listCalls).toContain("Drafts");
    expect(cutMarkers()).toEqual([]);
    expect(harness.onMoveResultMessage).toHaveBeenCalledWith(
      expect.stringMatching(/Moved 1/)
    );
  });

  it("selects the moved destination paths on success", async () => {
    const harness = await mount();
    await cutViaContextMenu("a.md");
    clickEntry("Drafts");
    await flushPromises();
    harness.setDraftsChildren([
      { kind: "file", name: "x.md", relativePath: "Drafts/x.md" },
      { kind: "file", name: "a.md", relativePath: "Drafts/a.md" }
    ]);
    pressKey(fileExplorerList(), "v", { ctrlKey: true });
    await flushPromises();

    expect(selectedPaths()).toContain("Drafts/a.md");
  });

  it("keeps the pending Cut and reports the reason on a validation failure", async () => {
    const harness = await mount({
      moveImpl: () => ({
        kind: "completed",
        result: {
          ok: false,
          validation: {
            ok: false,
            errors: [{ reason: "same-parent", sourceRelativePath: "a.md" }]
          },
          results: [],
          successfulPathPairs: []
        }
      })
    });
    await cutViaContextMenu("a.md");
    contextMenuEntry("Drafts");
    act(() => pasteMenuItem().click());
    await flushPromises();

    expect(harness.onMoveResultMessage).toHaveBeenCalledWith(
      expect.stringContaining("same-parent")
    );
    expect(cutMarkers()).toEqual(["a.md"]);
  });

  it("reports moved/failed counts and clears the Cut on a partial failure", async () => {
    const harness = await mount({
      moveImpl: () => ({
        kind: "completed",
        result: {
          ok: false,
          validation: { ok: true },
          results: [
            {
              status: "moved",
              sourceRelativePath: "a.md",
              destinationRelativePath: "Drafts/a.md",
              sourceAbsolutePath: "C:/Novel/a.md",
              destinationAbsolutePath: "C:/Novel/Drafts/a.md"
            },
            {
              status: "failed",
              reason: "permission-denied",
              sourceRelativePath: "b.md",
              destinationRelativePath: "Drafts/b.md",
              sourceAbsolutePath: "C:/Novel/b.md",
              destinationAbsolutePath: "C:/Novel/Drafts/b.md"
            }
          ],
          successfulPathPairs: [
            {
              oldAbsolutePath: "C:/Novel/a.md",
              newAbsolutePath: "C:/Novel/Drafts/a.md"
            }
          ]
        }
      })
    });
    await cutViaContextMenu("a.md", "b.md");
    contextMenuEntry("Drafts");
    act(() => pasteMenuItem().click());
    await flushPromises();

    expect(harness.onMoveResultMessage).toHaveBeenCalledWith(
      expect.stringMatching(/Moved 1.*1 failed/)
    );
    expect(cutMarkers()).toEqual([]);
  });

  it("keeps the pending Cut and reports unavailable when the backend gates the paste", async () => {
    const harness = await mount({
      moveImpl: () => ({ kind: "unavailable", reason: "readOnlyProject" })
    });
    await cutViaContextMenu("a.md");
    contextMenuEntry("Drafts");
    act(() => pasteMenuItem().click());
    await flushPromises();

    expect(harness.onMoveResultMessage).toHaveBeenCalledWith(
      expect.stringContaining("unavailable")
    );
    expect(cutMarkers()).toEqual(["a.md"]);
  });

  it("keeps the paste a success when only the Recovery re-key diagnostic failed", async () => {
    const harness = await mount({
      moveImpl: () =>
        movedResult([{ src: "a.md", dest: "Drafts/a.md" }], {
          recoveryRekey: { failed: "threw" }
        })
    });
    await cutViaContextMenu("a.md");
    contextMenuEntry("Drafts");
    act(() => pasteMenuItem().click());
    await flushPromises();

    expect(harness.onMoveResultMessage).toHaveBeenCalledWith(
      expect.stringMatching(/Moved 1/)
    );
    expect(cutMarkers()).toEqual([]);
  });

  it("disables Paste with no pending Cut and re-enables it after a Cut", async () => {
    await mount();
    rightClickListArea();
    expect(pasteMenuItem().disabled).toBe(true);
    expect(pasteMenuItem().getAttribute("title")).toBe(
      "Cut one or more files first."
    );

    // Close the menu, cut, reopen.
    act(() => {
      container!
        .querySelector<HTMLElement>(".fileExplorerContextMenuBackdrop")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await cutViaContextMenu("a.md");
    contextMenuEntry("Drafts");
    expect(pasteMenuItem().disabled).toBe(false);
  });

  it("reports the old -> new relocation on a successful Paste (#338)", async () => {
    const harness = await mount();
    await cutViaContextMenu("a.md");
    contextMenuEntry("Drafts");
    act(() => pasteMenuItem().click());
    await flushPromises();

    expect(harness.onProjectDocumentsMoved).toHaveBeenCalledWith([
      { oldRelativePath: "a.md", newRelativePath: "Drafts/a.md" }
    ]);
  });

  it("does not report a relocation when Paste validation fails (#338)", async () => {
    const harness = await mount({
      moveImpl: () => ({
        kind: "completed",
        result: {
          ok: false,
          validation: {
            ok: false,
            errors: [{ reason: "same-parent", sourceRelativePath: "a.md" }]
          },
          results: [],
          successfulPathPairs: []
        }
      })
    });
    await cutViaContextMenu("a.md");
    contextMenuEntry("Drafts");
    act(() => pasteMenuItem().click());
    await flushPromises();

    expect(harness.onProjectDocumentsMoved).not.toHaveBeenCalled();
  });

  it("still blocks Cut/Paste while a cut source is DIRTY (#338)", async () => {
    const harness = await mount();
    await cutViaContextMenu("a.md");
    // a.md gains unsaved changes after being cut.
    harness.setDirtyProjectDocuments(["a.md"]);
    contextMenuEntry("Drafts");
    expect(pasteMenuItem().disabled).toBe(true);
    expect(pasteMenuItem().getAttribute("title")).toBe(
      "Save the document before moving it."
    );

    act(() => pasteMenuItem().click());
    await flushPromises();
    expect(harness.moveFileExplorerEntries).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------
describe("FileExplorer Cut/Paste — keyboard shortcuts (#328)", () => {
  it("cuts the selection on Ctrl+X while the tree has focus", async () => {
    const harness = await mount();
    clickEntry("a.md");
    pressKey(entryButton("a.md"), "x", { ctrlKey: true });

    expect(cutMarkers()).toEqual(["a.md"]);
    expect(harness.moveFileExplorerEntries).not.toHaveBeenCalled();
  });

  it("cuts the selection on Cmd+X (meta) as well", async () => {
    await mount();
    clickEntry("a.md");
    pressKey(entryButton("a.md"), "x", { metaKey: true });

    expect(cutMarkers()).toEqual(["a.md"]);
  });

  it("pastes the pending Cut on Ctrl+V into the current destination", async () => {
    const harness = await mount();
    clickEntry("a.md");
    pressKey(entryButton("a.md"), "x", { ctrlKey: true });
    clickEntry("Drafts");
    await flushPromises();
    pressKey(fileExplorerList(), "v", { ctrlKey: true });
    await flushPromises();

    expect(harness.moveFileExplorerEntries).toHaveBeenCalledWith({
      sourceRelativePaths: ["a.md"],
      destinationFolderRelativePath: "Drafts",
      dirtyProjectDocumentRelativePaths: []
    });
  });

  it("does not intercept Ctrl+X from an input inside the tree", async () => {
    const harness = await mount();
    clickEntry("a.md");
    const input = document.createElement("input");
    fileExplorerList().appendChild(input);

    pressKey(input, "x", { ctrlKey: true });

    expect(cutMarkers()).toEqual([]);
    expect(harness.moveFileExplorerEntries).not.toHaveBeenCalled();
  });

  it("does not intercept Ctrl+X / Ctrl+V from outside the File Explorer", async () => {
    const harness = await mount();
    clickEntry("a.md");

    pressKey(document.body, "x", { ctrlKey: true });
    pressKey(document.body, "v", { ctrlKey: true });
    await flushPromises();

    expect(cutMarkers()).toEqual([]);
    expect(harness.moveFileExplorerEntries).not.toHaveBeenCalled();
  });

  it("does not cut while an IME composition is active", async () => {
    await mount();
    clickEntry("a.md");

    pressKey(entryButton("a.md"), "x", { ctrlKey: true, isComposing: true });
    expect(cutMarkers()).toEqual([]);

    pressKey(entryButton("a.md"), "x", { ctrlKey: true, keyCode: 229 });
    expect(cutMarkers()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Visual feedback
// ---------------------------------------------------------------------------
describe("FileExplorer Cut/Paste — visual feedback (#328)", () => {
  it("marks cut source rows with data-file-explorer-cut and the isCut class", async () => {
    await mount();
    await cutViaContextMenu("a.md");

    const row = entryButton("a.md");
    expect(row.getAttribute("data-file-explorer-cut")).toBe("true");
    expect(row.className).toContain("isCut");

    // A non-cut sibling carries neither.
    expect(entryButton("b.md").getAttribute("data-file-explorer-cut")).toBeNull();
  });

  it("removes the cut marker after a successful Paste", async () => {
    await mount();
    await cutViaContextMenu("a.md");
    expect(cutMarkers()).toEqual(["a.md"]);

    contextMenuEntry("Drafts");
    act(() => pasteMenuItem().click());
    await flushPromises();

    expect(cutMarkers()).toEqual([]);
  });

  it("moves the cut marker to the new sources after a replacing Cut", async () => {
    await mount();
    await cutViaContextMenu("a.md");
    expect(entryButton("a.md").getAttribute("data-file-explorer-cut")).toBe(
      "true"
    );

    await cutViaContextMenu("c.md");
    expect(entryButton("a.md").getAttribute("data-file-explorer-cut")).toBeNull();
    expect(entryButton("c.md").getAttribute("data-file-explorer-cut")).toBe(
      "true"
    );
  });
});
