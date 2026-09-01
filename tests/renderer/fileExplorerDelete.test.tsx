// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  { kind: "file", name: "a.md", relativePath: "a.md" },
  { kind: "file", name: "b.md", relativePath: "b.md" }
];

function ok(
  directoryRelativePath: string | null,
  entries: FileExplorerEntry[]
): ListFileExplorerChildrenResult {
  return { kind: "ok", directoryRelativePath, entries };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  delete (window as unknown as { pergamum?: unknown }).pergamum;
  vi.restoreAllMocks();
});

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

interface MountOptions {
  collectImpl?: (request: unknown) => unknown;
  deleteImpl?: (request: unknown) => unknown;
}

function mount(options: MountOptions = {}) {
  const collectFileExplorerDeleteTargets = vi.fn(async (request: unknown) =>
    options.collectImpl
      ? options.collectImpl(request)
      : {
          kind: "completed",
          result: {
            ok: true,
            fileCount: 1,
            folderCount: 0,
            targets: [
              {
                kind: "file",
                relativePath: "a.md",
                name: "a.md",
                parentRelativePath: "",
                lastModifiedIso: "2026-09-01T10:00:00.000Z",
                sizeBytes: 5,
                previewHead: "hi",
                previewTail: "hi",
                previewUnavailable: false
              }
            ]
          }
        }
  );
  const deleteFileExplorerEntry = vi.fn(async () => ({
    kind: "completed",
    result: { ok: true }
  }));
  const listFileExplorerChildren = vi.fn(async (dir: string | null) =>
    ok(dir, treeRoot)
  );
  const onEntriesDeleted = vi.fn();
  const onMoveResultMessage = vi.fn();

  Object.defineProperty(window, "pergamum", {
    configurable: true,
    value: {
      projects: {
        listFileExplorerChildren,
        collectFileExplorerDeleteTargets,
        deleteFileExplorerEntry
      }
    }
  });

  act(() => {
    root.render(
      React.createElement(FileExplorer, {
        project,
        highlightedRelativePath: null,
        translate,
        onActivateDocument: vi.fn(),
        onEntriesDeleted,
        onMoveResultMessage
      })
    );
  });

  return {
    collectFileExplorerDeleteTargets,
    deleteFileExplorerEntry,
    onEntriesDeleted,
    onMoveResultMessage
  };
}

function entryButton(relativePath: string): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(
    `[data-file-explorer-entry-path="${relativePath}"]`
  )!;
}

function clickEntry(relativePath: string): void {
  act(() => {
    entryButton(relativePath).dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
  });
}

function contextMenu(relativePath: string): void {
  act(() => {
    entryButton(relativePath).dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
    );
  });
}

function deleteMenuItem(): HTMLButtonElement | undefined {
  return container.querySelector<HTMLButtonElement>(
    '[data-file-explorer-context-command="delete"]'
  ) ?? undefined;
}

function pressDeleteKey(
  init: Partial<KeyboardEventInit> & { isComposing?: boolean } = {}
): void {
  const tree = container.querySelector('[data-file-explorer-entry-kind="root"]')!
    .closest("[class]")!;
  act(() => {
    const event = new KeyboardEvent("keydown", {
      key: "Delete",
      bubbles: true,
      cancelable: true,
      ...init
    });
    (entryButton("a.md") ?? tree).dispatchEvent(event);
  });
}

describe("FileExplorer delete wiring (#351)", () => {
  it("adds a Delete... context-menu item, disabled with no selection", async () => {
    mount();
    await flush();
    contextMenu("a.md"); // right-click selects the row
    const item = deleteMenuItem();
    expect(item).toBeDefined();
    expect(item!.textContent).toContain("Delete");
  });

  it("context-menu Delete runs collect and opens the confirmation table", async () => {
    const h = mount();
    await flush();
    contextMenu("a.md");
    act(() => deleteMenuItem()!.click());
    await flush();

    expect(h.collectFileExplorerDeleteTargets).toHaveBeenCalledWith({
      selectedRelativePaths: ["a.md"]
    });
    expect(
      container.querySelector(".fileExplorerDeleteDialogTable")
    ).not.toBeNull();
  });

  it("DEL key opens the same delete flow", async () => {
    const h = mount();
    await flush();
    clickEntry("a.md");
    pressDeleteKey();
    await flush();
    expect(h.collectFileExplorerDeleteTargets).toHaveBeenCalledTimes(1);
  });

  it("DEL key is ignored during IME composition", async () => {
    const h = mount();
    await flush();
    clickEntry("a.md");
    pressDeleteKey({ isComposing: true });
    await flush();
    expect(h.collectFileExplorerDeleteTargets).not.toHaveBeenCalled();
  });

  it("a rejected collect shows the failure-list dialog, not the table", async () => {
    const h = mount({
      collectImpl: () => ({
        kind: "completed",
        result: {
          ok: false,
          rejections: [
            { selectedPath: "a.md", reason: "reserved-or-protected" }
          ]
        }
      })
    });
    await flush();
    clickEntry("a.md");
    pressDeleteKey();
    await flush();

    expect(
      container.querySelector(".fileExplorerDeleteDialogTable")
    ).toBeNull();
    expect(
      container.querySelector('[data-file-operation-failure="true"]')
    ).not.toBeNull();
    expect(h.deleteFileExplorerEntry).not.toHaveBeenCalled();
  });

  it("confirming after the 5s arm deletes the item and bubbles onEntriesDeleted", async () => {
    const h = mount();
    await flush();
    clickEntry("a.md");
    pressDeleteKey();
    await flush();

    const confirmButton = [
      ...container.querySelectorAll<HTMLButtonElement>(
        ".fileExplorerDeleteConfirmButton"
      )
    ][0];
    expect(confirmButton.disabled).toBe(true);

    act(() => vi.advanceTimersByTime(5000));
    expect(
      container.querySelector<HTMLButtonElement>(
        ".fileExplorerDeleteConfirmButton"
      )!.disabled
    ).toBe(false);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(".fileExplorerDeleteConfirmButton")!
        .click();
    });
    await flush();

    expect(h.deleteFileExplorerEntry).toHaveBeenCalledWith({
      relativePath: "a.md",
      kind: "file"
    });
    expect(h.onEntriesDeleted).toHaveBeenCalledWith(["a.md"]);
  });
});
