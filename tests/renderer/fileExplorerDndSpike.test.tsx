// @vitest-environment happy-dom
//
// #329 spike: native HTML5 Drag & Drop viability for the File Explorer Move
// route. happy-dom aliases `DragEvent` to `Event` and never simulates a real
// drag, so these tests build a plain `Event` + a manual `DataTransfer` and
// dispatch the individual `dragstart` / `dragover` / `drop` / `dragend`
// events. The renderer route is deliberately thin over the pure helpers in
// `fileExplorerMoveDestinations.test.ts`, which carry the bulk of the
// coverage.
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
import { FILE_EXPLORER_MOVE_DND_MIME } from "../../src/renderer/fileExplorerMoveDestinations";

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

function movedResult(entries: Array<{ src: string; dest: string }>) {
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
      }))
    }
  };
}

interface Harness {
  moveFileExplorerEntries: ReturnType<typeof vi.fn>;
  onMoveResultMessage: ReturnType<typeof vi.fn>;
  listCalls: Array<string | null>;
  setDraftsChildren: (entries: FileExplorerEntry[]) => void;
}

async function mount(
  options: {
    moveImpl?: (request: unknown) => unknown;
    openProjectDocumentRelativePaths?: string[];
    readOnly?: boolean;
  } = {}
): Promise<Harness> {
  const listCalls: Array<string | null> = [];
  let draftsChildren: FileExplorerEntry[] = [
    { kind: "file", name: "x.md", relativePath: "Drafts/x.md" }
  ];
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

  Object.defineProperty(window, "pergamum", {
    configurable: true,
    value: {
      projects: { listFileExplorerChildren, moveFileExplorerEntries }
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
        openProjectDocumentRelativePaths:
          options.openProjectDocumentRelativePaths ?? [],
        onMoveResultMessage
      })
    );
  });
  await flushPromises();

  return {
    moveFileExplorerEntries,
    onMoveResultMessage,
    listCalls,
    setDraftsChildren: (entries) => {
      draftsChildren = entries;
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

function rootRow(): HTMLButtonElement {
  return container!.querySelector<HTMLButtonElement>(
    '[data-file-explorer-entry-kind="root"]'
  )!;
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

interface FakeDragEvent extends Event {
  dataTransfer: DataTransfer;
}

function makeDragEvent(type: string, dataTransfer?: DataTransfer): FakeDragEvent {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true
  }) as FakeDragEvent;
  Object.defineProperty(event, "dataTransfer", {
    configurable: true,
    value: dataTransfer ?? new window.DataTransfer()
  });
  return event;
}

/** Fire `dragstart` on a row and return the event (so the caller can read
 *  `defaultPrevented` and the DataTransfer that carried the gesture). */
function dragStart(relativePath: string): FakeDragEvent {
  const event = makeDragEvent("dragstart");
  act(() => {
    entryButton(relativePath).dispatchEvent(event);
  });
  return event;
}

function dragOver(
  target: HTMLElement,
  dataTransfer: DataTransfer
): FakeDragEvent {
  const event = makeDragEvent("dragover", dataTransfer);
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function drop(target: HTMLElement, dataTransfer: DataTransfer): FakeDragEvent {
  const event = makeDragEvent("drop", dataTransfer);
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function dragEnd(relativePath: string): void {
  act(() => {
    entryButton(relativePath).dispatchEvent(makeDragEvent("dragend"));
  });
}

function draggingMarkers(): string[] {
  return Array.from(
    container!.querySelectorAll('[data-file-explorer-dragging="true"]')
  )
    .map((element) => element.getAttribute("data-file-explorer-entry-path"))
    .filter((path): path is string => Boolean(path))
    .sort();
}

function dropTargetState(relativePath: string): string | null {
  return (
    container!
      .querySelector(`[data-file-explorer-entry-path="${relativePath}"]`)
      ?.getAttribute("data-file-explorer-drop-target") ?? null
  );
}

function selectedPaths(): string[] {
  return Array.from(
    container!.querySelectorAll('[role="treeitem"][aria-selected="true"]')
  )
    .map((element) => element.getAttribute("data-file-explorer-entry-path"))
    .filter((path): path is string => Boolean(path))
    .sort();
}

// ---------------------------------------------------------------------------
// Drag source
// ---------------------------------------------------------------------------
describe("FileExplorer D&D spike — drag source (#329)", () => {
  it("drags the whole multi-selection from a selected file row", async () => {
    await mount();
    clickEntry("a.md");
    clickEntry("b.md", { ctrlKey: true });

    const event = dragStart("a.md");

    expect(event.defaultPrevented).toBe(false);
    expect(
      event.dataTransfer.getData(FILE_EXPLORER_MOVE_DND_MIME)
    ).toBe(JSON.stringify(["a.md", "b.md"]));
    expect(event.dataTransfer.effectAllowed).toBe("move");
    expect(draggingMarkers()).toEqual(["a.md", "b.md"]);
  });

  it("drags just the row (and adopts it as the selection) when it was not selected", async () => {
    await mount();
    clickEntry("a.md");

    const event = dragStart("c.md");

    expect(event.dataTransfer.getData(FILE_EXPLORER_MOVE_DND_MIME)).toBe(
      JSON.stringify(["c.md"])
    );
    expect(draggingMarkers()).toEqual(["c.md"]);
    expect(selectedPaths()).toEqual(["c.md"]);
  });

  it("does not start a movable drag from a folder row", async () => {
    await mount();

    const event = dragStart("Drafts");

    expect(event.defaultPrevented).toBe(true);
    expect(event.dataTransfer.getData(FILE_EXPLORER_MOVE_DND_MIME)).toBe("");
    expect(draggingMarkers()).toEqual([]);
  });

  it("does not start a drag when a selected file is an open project document", async () => {
    await mount({ openProjectDocumentRelativePaths: ["a.md"] });
    clickEntry("a.md");

    const event = dragStart("a.md");

    expect(event.defaultPrevented).toBe(true);
    expect(draggingMarkers()).toEqual([]);
  });

  it("does not start a drag in a read-only project", async () => {
    await mount({ readOnly: true });
    clickEntry("a.md");

    const event = dragStart("a.md");

    expect(event.defaultPrevented).toBe(true);
    expect(draggingMarkers()).toEqual([]);
  });

  it("only puts project-relative paths on the DataTransfer", async () => {
    await mount();
    clickEntry("a.md");

    const payload = dragStart("a.md").dataTransfer.getData(
      FILE_EXPLORER_MOVE_DND_MIME
    );

    expect(payload).not.toContain("C:\\");
    expect(payload).not.toContain("C:/Novel");
    expect(JSON.parse(payload)).toEqual(["a.md"]);
  });
});

// ---------------------------------------------------------------------------
// Drop destination
// ---------------------------------------------------------------------------
describe("FileExplorer D&D spike — drop destination (#329)", () => {
  it("marks a folder row a valid drop target on dragover and accepts the drop", async () => {
    const harness = await mount();
    clickEntry("a.md");
    const started = dragStart("a.md");

    const over = dragOver(entryButton("Drafts"), started.dataTransfer);
    expect(over.defaultPrevented).toBe(true);
    expect(dropTargetState("Drafts")).toBe("valid");

    drop(entryButton("Drafts"), started.dataTransfer);
    await flushPromises();

    expect(harness.moveFileExplorerEntries).toHaveBeenCalledWith({
      sourceRelativePaths: ["a.md"],
      destinationFolderRelativePath: "Drafts",
      dirtyProjectDocumentRelativePaths: []
    });
  });

  it("drops onto the project root row with the empty destination", async () => {
    const harness = await mount();
    clickEntry("Drafts");
    await flushPromises();
    clickEntry("Drafts/x.md");
    const started = dragStart("Drafts/x.md");

    dragOver(rootRow(), started.dataTransfer);
    drop(rootRow(), started.dataTransfer);
    await flushPromises();

    expect(harness.moveFileExplorerEntries).toHaveBeenCalledWith({
      sourceRelativePaths: ["Drafts/x.md"],
      destinationFolderRelativePath: "",
      dirtyProjectDocumentRelativePaths: []
    });
  });

  it("ignores a drop on a file row", async () => {
    const harness = await mount();
    clickEntry("a.md");
    const started = dragStart("a.md");

    const over = dragOver(entryButton("b.md"), started.dataTransfer);
    expect(over.defaultPrevented).toBe(false);
    expect(dropTargetState("b.md")).toBe("invalid");

    drop(entryButton("b.md"), started.dataTransfer);
    await flushPromises();

    expect(harness.moveFileExplorerEntries).not.toHaveBeenCalled();
  });

  it("ignores a drop that would land every source back in its own parent", async () => {
    const harness = await mount();
    clickEntry("a.md");
    const started = dragStart("a.md");

    // a.md already lives at the project root.
    dragOver(rootRow(), started.dataTransfer);
    drop(rootRow(), started.dataTransfer);
    await flushPromises();

    expect(harness.moveFileExplorerEntries).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Execution + drag state lifecycle
// ---------------------------------------------------------------------------
describe("FileExplorer D&D spike — execution & lifecycle (#329)", () => {
  it("refreshes the destination and selects the moved paths on a successful drop", async () => {
    const harness = await mount();
    clickEntry("a.md");
    clickEntry("Drafts");
    await flushPromises();
    harness.setDraftsChildren([
      { kind: "file", name: "x.md", relativePath: "Drafts/x.md" },
      { kind: "file", name: "a.md", relativePath: "Drafts/a.md" }
    ]);
    // Re-select a.md (clicking Drafts moved the primary selection).
    clickEntry("a.md");
    const started = dragStart("a.md");
    harness.listCalls.length = 0;

    drop(entryButton("Drafts"), started.dataTransfer);
    await flushPromises();

    expect(harness.listCalls).toContain("Drafts");
    expect(selectedPaths()).toContain("Drafts/a.md");
    expect(harness.onMoveResultMessage).toHaveBeenCalledWith(
      expect.stringMatching(/Moved 1/)
    );
  });

  it("does not refresh and reports the reason on a validation failure", async () => {
    const harness = await mount({
      moveImpl: () => ({
        kind: "completed",
        result: {
          ok: false,
          validation: {
            ok: false,
            errors: [{ reason: "destination-conflict", sourceRelativePath: "a.md" }]
          },
          results: [],
          successfulPathPairs: []
        }
      })
    });
    clickEntry("a.md");
    const started = dragStart("a.md");
    harness.listCalls.length = 0;

    drop(entryButton("Drafts"), started.dataTransfer);
    await flushPromises();

    expect(harness.listCalls).toEqual([]);
    expect(harness.onMoveResultMessage).toHaveBeenCalledWith(
      expect.stringContaining("destination-conflict")
    );
  });

  it("reports unavailable when the backend gates the drop", async () => {
    const harness = await mount({
      moveImpl: () => ({ kind: "unavailable", reason: "readOnlyProject" })
    });
    clickEntry("a.md");
    const started = dragStart("a.md");

    drop(entryButton("Drafts"), started.dataTransfer);
    await flushPromises();

    expect(harness.onMoveResultMessage).toHaveBeenCalledWith(
      expect.stringContaining("unavailable")
    );
  });

  it("clears the drag state after a drop", async () => {
    const harness = await mount();
    clickEntry("a.md");
    const started = dragStart("a.md");
    expect(draggingMarkers()).toEqual(["a.md"]);

    drop(entryButton("Drafts"), started.dataTransfer);
    await flushPromises();

    expect(draggingMarkers()).toEqual([]);
    expect(dropTargetState("Drafts")).toBeNull();
    expect(harness.moveFileExplorerEntries).toHaveBeenCalledTimes(1);
  });

  it("clears the drag state after dragend without a drop", async () => {
    const harness = await mount();
    clickEntry("a.md");
    dragStart("a.md");
    expect(draggingMarkers()).toEqual(["a.md"]);

    dragEnd("a.md");

    expect(draggingMarkers()).toEqual([]);
    expect(harness.moveFileExplorerEntries).not.toHaveBeenCalled();
  });
});
