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

const treeRoot: FileExplorerEntry[] = [
  { kind: "folder", name: "Drafts", relativePath: "Drafts" },
  { kind: "folder", name: "Archive", relativePath: "Archive" },
  { kind: "file", name: "a.md", relativePath: "a.md" },
  { kind: "file", name: "b.md", relativePath: "b.md" },
  { kind: "file", name: "c.md", relativePath: "c.md" }
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
  listCalls: Array<string | null>;
  setOpenProjectDocuments: (relativePaths: string[]) => void;
}

async function mount(
  options: {
    moveImpl?: (request: unknown) => unknown;
    dirtyProjectDocumentRelativePaths?: string[];
    openProjectDocumentRelativePaths?: string[];
  } = {}
): Promise<Harness> {
  const listCalls: Array<string | null> = [];
  const listFileExplorerChildren = vi.fn(
    async (directoryRelativePath: string | null) => {
      listCalls.push(directoryRelativePath);
      return ok(directoryRelativePath, treeRoot);
    }
  );
  const moveFileExplorerEntries = vi.fn(async (request: unknown) =>
    options.moveImpl
      ? options.moveImpl(request)
      : movedResult([{ src: "a.md", dest: "Drafts/a.md" }])
  );
  const onMoveResultMessage = vi.fn();

  Object.defineProperty(window, "pergamum", {
    configurable: true,
    value: {
      projects: { listFileExplorerChildren, moveFileExplorerEntries }
    }
  });

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  let openProjectDocumentRelativePaths =
    options.openProjectDocumentRelativePaths ?? [];

  const renderExplorer = (): void => {
    act(() => {
      root!.render(
        React.createElement(FileExplorer, {
          project,
          highlightedRelativePath: null,
          translate,
          onActivateDocument: vi.fn(),
          dirtyProjectDocumentRelativePaths:
            options.dirtyProjectDocumentRelativePaths ?? [],
          openProjectDocumentRelativePaths,
          onMoveResultMessage
        })
      );
    });
  };

  renderExplorer();
  await flushPromises();

  return {
    moveFileExplorerEntries,
    onMoveResultMessage,
    listCalls,
    setOpenProjectDocuments: (relativePaths) => {
      openProjectDocumentRelativePaths = relativePaths;
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

function dispatchContextMenu(target: Element): MouseEvent {
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function contextMenuEntry(relativePath: string): void {
  dispatchContextMenu(entryButton(relativePath));
}

function rightClickRoot(): MouseEvent {
  return dispatchContextMenu(
    container!.querySelector('[data-file-explorer-entry-kind="root"]')!
  );
}

function rightClickListArea(): MouseEvent {
  // The closest stable "empty area" surface in happy-dom is the tree
  // container itself (right-clicking a blank pixel is not simulable).
  return dispatchContextMenu(container!.querySelector(".fileExplorerList")!);
}

function contextMenuIsOpen(): boolean {
  return container!.querySelector('[role="menu"]') !== null;
}

function moveMenuItem(): HTMLButtonElement | null {
  return container!.querySelector<HTMLButtonElement>(
    '[data-file-explorer-context-command="move"]'
  );
}

function destinationOption(destinationPath: string): HTMLButtonElement {
  const option = container!.querySelector<HTMLButtonElement>(
    `[data-move-destination-path="${destinationPath}"]`
  );
  if (!option) {
    throw new Error(`destination option ${destinationPath} not rendered`);
  }
  return option;
}

function selectedPaths(): string[] {
  return Array.from(
    container!.querySelectorAll('[role="treeitem"][aria-selected="true"]')
  )
    .map((element) => element.getAttribute("data-file-explorer-entry-path"))
    .filter((path): path is string => Boolean(path))
    .sort();
}

async function moveSelectionTo(destinationPath: string): Promise<void> {
  contextMenuEntry(selectedPaths()[0] ?? "a.md");
  act(() => moveMenuItem()!.click());
  act(() => destinationOption(destinationPath).click());
  act(() => {
    container!
      .querySelector<HTMLButtonElement>(".moveDestinationDialogPrimary")!
      .click();
  });
  await flushPromises();
}

describe("FileExplorer context-menu Move — source selection (#327)", () => {
  it("keeps the existing multi-selection when right-clicking a selected file", async () => {
    await mount();
    clickEntry("a.md");
    clickEntry("b.md", { ctrlKey: true });

    contextMenuEntry("a.md");

    expect(selectedPaths()).toEqual(["a.md", "b.md"]);
    expect(moveMenuItem()?.disabled).toBe(false);
  });

  it("replaces the selection when right-clicking a non-selected file", async () => {
    await mount();
    clickEntry("a.md");

    contextMenuEntry("c.md");

    expect(selectedPaths()).toEqual(["c.md"]);
  });
});

describe("FileExplorer context-menu Move — enablement (#327)", () => {
  it("enables Move… for a files-only selection", async () => {
    await mount();
    clickEntry("a.md");
    contextMenuEntry("a.md");

    expect(moveMenuItem()?.disabled).toBe(false);
    expect(moveMenuItem()?.getAttribute("aria-disabled")).toBe("false");
  });

  it("disables Move… when the selection contains a folder", async () => {
    await mount();
    clickEntry("a.md");
    clickEntry("Drafts", { ctrlKey: true });
    contextMenuEntry("Drafts");

    expect(moveMenuItem()?.disabled).toBe(true);
    expect(moveMenuItem()?.getAttribute("aria-disabled")).toBe("true");
  });

  it("disables Move… when a selected file is an open document", async () => {
    await mount({ openProjectDocumentRelativePaths: ["a.md"] });
    clickEntry("a.md");
    contextMenuEntry("a.md");

    expect(moveMenuItem()?.disabled).toBe(true);
  });
});

describe("FileExplorer context-menu Move — destination picker (#327)", () => {
  it("lists the project root and existing folders only (no files)", async () => {
    await mount();
    clickEntry("a.md");
    contextMenuEntry("a.md");
    act(() => moveMenuItem()!.click());

    const options = Array.from(
      container!.querySelectorAll<HTMLButtonElement>(
        "[data-move-destination-path]"
      )
    ).map((option) => option.getAttribute("data-move-destination-path"));

    expect(options).toEqual(["", "Archive", "Drafts"]);
  });

  it("does not call the Move backend when the picker is canceled", async () => {
    const harness = await mount();
    clickEntry("a.md");
    contextMenuEntry("a.md");
    act(() => moveMenuItem()!.click());
    act(() => {
      // First footer button is Cancel.
      container!
        .querySelectorAll<HTMLButtonElement>(".appDialogButton")[0]
        .click();
    });

    expect(harness.moveFileExplorerEntries).not.toHaveBeenCalled();
    expect(
      container!.querySelector(".moveDestinationDialogList")
    ).toBeNull();
  });
});

describe("FileExplorer context-menu Move — backend call (#327)", () => {
  it("calls moveFileExplorerEntries with the selected file sources and destination", async () => {
    const harness = await mount();
    clickEntry("a.md");
    clickEntry("b.md", { ctrlKey: true });
    await moveSelectionTo("Drafts");

    expect(harness.moveFileExplorerEntries).toHaveBeenCalledWith({
      sourceRelativePaths: ["a.md", "b.md"],
      destinationFolderRelativePath: "Drafts",
      dirtyProjectDocumentRelativePaths: []
    });
  });

  it("passes the project root destination as an empty string and forwards dirty paths", async () => {
    const harness = await mount({
      dirtyProjectDocumentRelativePaths: ["notes.md"]
    });
    clickEntry("a.md");
    await moveSelectionTo("");

    expect(harness.moveFileExplorerEntries).toHaveBeenCalledWith({
      sourceRelativePaths: ["a.md"],
      destinationFolderRelativePath: "",
      dirtyProjectDocumentRelativePaths: ["notes.md"]
    });
  });
});

describe("FileExplorer context-menu Move — result handling (#327)", () => {
  it("records a validation failure and leaves the selection on the source path", async () => {
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
    clickEntry("a.md");
    await moveSelectionTo("Drafts");

    expect(harness.onMoveResultMessage).toHaveBeenCalledWith(
      expect.stringContaining("same-parent")
    );
    expect(selectedPaths()).toEqual(["a.md"]);
  });

  it("refreshes the destination folder and moves the selection off old paths on success", async () => {
    const harness = await mount({
      moveImpl: () => movedResult([{ src: "a.md", dest: "Drafts/a.md" }])
    });
    harness.listCalls.length = 0;
    clickEntry("a.md");
    await moveSelectionTo("Drafts");

    expect(harness.listCalls).toContain("Drafts");
    expect(selectedPaths()).not.toContain("a.md");
    expect(harness.onMoveResultMessage).toHaveBeenCalledWith(
      expect.stringMatching(/Moved 1/)
    );
  });

  it("reports a partial failure and still refreshes", async () => {
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
    harness.listCalls.length = 0;
    clickEntry("a.md");
    clickEntry("b.md", { ctrlKey: true });
    await moveSelectionTo("Drafts");

    expect(harness.listCalls).toContain("Drafts");
    expect(harness.onMoveResultMessage).toHaveBeenCalledWith(
      expect.stringMatching(/Moved 1.*1 failed/)
    );
  });

  it("keeps a Move a success when only the Recovery re-key diagnostic failed", async () => {
    const harness = await mount({
      moveImpl: () =>
        movedResult([{ src: "a.md", dest: "Drafts/a.md" }], {
          recoveryRekey: { failed: "threw" }
        })
    });
    clickEntry("a.md");
    await moveSelectionTo("Drafts");

    expect(harness.onMoveResultMessage).toHaveBeenCalledWith(
      expect.stringMatching(/Moved 1/)
    );
  });

  it("reports unavailable when the backend gates the move", async () => {
    const harness = await mount({
      moveImpl: () => ({ kind: "unavailable", reason: "readOnlyProject" })
    });
    clickEntry("a.md");
    await moveSelectionTo("Drafts");

    expect(harness.onMoveResultMessage).toHaveBeenCalledWith(
      expect.stringContaining("unavailable")
    );
  });
});

describe("FileExplorer context-menu Move — open anywhere in the tree (#327 blocker)", () => {
  it("opens the context menu when the project root row is right-clicked", async () => {
    await mount();
    const event = rightClickRoot();

    expect(contextMenuIsOpen()).toBe(true);
    expect(event.defaultPrevented).toBe(true); // no OS menu
    expect(moveMenuItem()).not.toBeNull();
  });

  it("opens the context menu when the list / empty area is right-clicked", async () => {
    await mount();
    const event = rightClickListArea();

    expect(contextMenuIsOpen()).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(moveMenuItem()).not.toBeNull();
  });

  it("does not destroy the existing multi-selection on a root / empty-area right-click", async () => {
    await mount();
    clickEntry("a.md");
    clickEntry("b.md", { ctrlKey: true });
    expect(selectedPaths()).toEqual(["a.md", "b.md"]);

    rightClickRoot();
    expect(selectedPaths()).toEqual(["a.md", "b.md"]);

    rightClickListArea();
    expect(selectedPaths()).toEqual(["a.md", "b.md"]);
  });

  it("still keeps the entry right-click selection rules", async () => {
    await mount();
    clickEntry("a.md");
    clickEntry("b.md", { ctrlKey: true });

    contextMenuEntry("a.md"); // selected → keep
    expect(selectedPaths()).toEqual(["a.md", "b.md"]);

    contextMenuEntry("c.md"); // non-selected → replace
    expect(selectedPaths()).toEqual(["c.md"]);
  });
});

describe("FileExplorer context-menu Move — disabled reason is visible (#327 blocker)", () => {
  it("shows Move… as a present-but-disabled item (not hidden) for an empty selection", async () => {
    await mount();
    rightClickListArea(); // nothing selected

    const item = moveMenuItem();
    expect(item).not.toBeNull();
    expect(item!.disabled).toBe(true);
    expect(item!.getAttribute("title")).toBe(
      "Select one or more files to move."
    );
    expect(item!.getAttribute("data-file-explorer-move-disabled-reason")).toBe(
      "empty-selection"
    );
  });

  it("shows Move… disabled with a folder reason when the selection contains a folder", async () => {
    await mount();
    clickEntry("a.md");
    clickEntry("Drafts", { ctrlKey: true });
    contextMenuEntry("Drafts");

    const item = moveMenuItem();
    expect(item!.disabled).toBe(true);
    expect(item!.getAttribute("data-file-explorer-move-disabled-reason")).toBe(
      "contains-folder"
    );
    expect(item!.getAttribute("title")).toBe(
      "Folders cannot be moved yet. Select files only."
    );
  });

  it("shows Move… disabled with an open-document reason", async () => {
    await mount({ openProjectDocumentRelativePaths: ["a.md"] });
    clickEntry("a.md");
    contextMenuEntry("a.md");

    const item = moveMenuItem();
    expect(item!.disabled).toBe(true);
    expect(item!.getAttribute("data-file-explorer-move-disabled-reason")).toBe(
      "contains-open-document"
    );
    expect(item!.getAttribute("title")).toContain("Close the document");
  });

  it("enables Move… with no disabled reason for an eligible file selection", async () => {
    await mount();
    clickEntry("a.md");
    contextMenuEntry("a.md");

    const item = moveMenuItem();
    expect(item!.disabled).toBe(false);
    expect(item!.getAttribute("title")).toBeNull();
    expect(
      item!.getAttribute("data-file-explorer-move-disabled-reason")
    ).toBeNull();
  });
});

function toolbarMoveButton(): HTMLButtonElement {
  const button = container!.querySelector<HTMLButtonElement>(
    '[data-file-explorer-toolbar-command="move"]'
  );
  if (!button) {
    throw new Error("toolbar Move button not rendered");
  }
  return button;
}

describe("FileExplorer toolbar Move — primary route (#327)", () => {
  it("renders a Move action in the File Explorer toolbar", async () => {
    await mount();
    expect(toolbarMoveButton().getAttribute("aria-label")).toBe("Move…");
  });

  it("is disabled with no selection and carries the disabled reason as title", async () => {
    await mount();
    const button = toolbarMoveButton();
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("title")).toBe(
      "Select one or more files to move."
    );
  });

  it("is enabled for a files-only selection and opens the destination picker", async () => {
    await mount();
    clickEntry("a.md");
    clickEntry("b.md", { ctrlKey: true });

    const button = toolbarMoveButton();
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("title")).toBe("Move…");

    act(() => button.click());
    expect(container!.querySelector(".moveDestinationDialogList")).not.toBeNull();
  });

  it("sources from the current multi-selection, independent of any right-click", async () => {
    const harness = await mount();
    clickEntry("a.md");
    clickEntry("c.md", { ctrlKey: true });

    act(() => toolbarMoveButton().click());
    act(() => destinationOption("Drafts").click());
    act(() => {
      container!
        .querySelector<HTMLButtonElement>(".moveDestinationDialogPrimary")!
        .click();
    });
    await flushPromises();

    expect(harness.moveFileExplorerEntries).toHaveBeenCalledWith({
      sourceRelativePaths: ["a.md", "c.md"],
      destinationFolderRelativePath: "Drafts",
      dirtyProjectDocumentRelativePaths: []
    });
  });

  it("uses the same enablement as the context menu (folder / open document)", async () => {
    await mount({ openProjectDocumentRelativePaths: ["a.md"] });

    clickEntry("a.md");
    clickEntry("Drafts", { ctrlKey: true });
    expect(toolbarMoveButton().disabled).toBe(true);
    expect(toolbarMoveButton().getAttribute("title")).toBe(
      "Folders cannot be moved yet. Select files only."
    );

    // Just the open document now.
    clickEntry("a.md");
    expect(toolbarMoveButton().disabled).toBe(true);
    expect(toolbarMoveButton().getAttribute("title")).toContain(
      "Close the document"
    );
  });
});

describe("FileExplorer Move — execution-time re-checks (#327 review blocker)", () => {
  it("does not call the Move backend if a selected file became an open document while the picker was open", async () => {
    const harness = await mount();
    clickEntry("a.md");
    act(() => toolbarMoveButton().click()); // picker opens while a.md is eligible

    // a.md is opened in the editor before the user confirms.
    harness.setOpenProjectDocuments(["a.md"]);

    act(() => destinationOption("Drafts").click());
    act(() => {
      container!
        .querySelector<HTMLButtonElement>(".moveDestinationDialogPrimary")!
        .click();
    });
    await flushPromises();

    expect(harness.moveFileExplorerEntries).not.toHaveBeenCalled();
    expect(harness.onMoveResultMessage).toHaveBeenCalledWith(
      expect.stringContaining("unavailable")
    );
  });

  it("still moves when the open-document gate is clear at confirm time", async () => {
    const harness = await mount({ openProjectDocumentRelativePaths: ["a.md"] });
    clickEntry("a.md");
    // Disabled now, but simulate the picker being reached and the document
    // then closed before confirming.
    harness.setOpenProjectDocuments([]);
    act(() => toolbarMoveButton().click());
    act(() => destinationOption("Drafts").click());
    act(() => {
      container!
        .querySelector<HTMLButtonElement>(".moveDestinationDialogPrimary")!
        .click();
    });
    await flushPromises();

    expect(harness.moveFileExplorerEntries).toHaveBeenCalledWith({
      sourceRelativePaths: ["a.md"],
      destinationFolderRelativePath: "Drafts",
      dirtyProjectDocumentRelativePaths: []
    });
  });
});
