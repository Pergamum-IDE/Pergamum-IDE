// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CreateFileExplorerEntryResult,
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

const readOnlyProject: PergamumProject = {
  ...project,
  accessMode: { kind: "readOnly", reason: "writeLockUnavailable" }
};

const treeRoot: FileExplorerEntry[] = [
  { kind: "folder", name: "Drafts", relativePath: "Drafts" },
  { kind: "file", name: "a.md", relativePath: "a.md" }
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
  vi.restoreAllMocks();
});

async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

interface Harness {
  createFileExplorerMarkdownFile: ReturnType<typeof vi.fn>;
  createFileExplorerFolder: ReturnType<typeof vi.fn>;
  onActivateDocument: ReturnType<typeof vi.fn>;
}

async function mount(
  options: { project?: PergamumProject | null; readOnly?: boolean } = {}
): Promise<Harness> {
  const listFileExplorerChildren = vi.fn(
    async (directoryRelativePath: string | null) =>
      ok(directoryRelativePath, directoryRelativePath === null ? treeRoot : [])
  );
  const createFileExplorerMarkdownFile = vi.fn(
    async (parent: string | null): Promise<CreateFileExplorerEntryResult> => ({
      ok: true,
      entry: {
        kind: "file",
        name: "new.md",
        relativePath: parent ? `${parent}/new.md` : "new.md"
      }
    })
  );
  const createFileExplorerFolder = vi.fn(
    async (parent: string | null): Promise<CreateFileExplorerEntryResult> => ({
      ok: true,
      entry: {
        kind: "folder",
        name: "New",
        relativePath: parent ? `${parent}/New` : "New"
      }
    })
  );
  const onActivateDocument = vi.fn();

  Object.defineProperty(window, "pergamum", {
    configurable: true,
    value: {
      projects: {
        listFileExplorerChildren,
        createFileExplorerMarkdownFile,
        createFileExplorerFolder
      }
    }
  });

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root!.render(
      React.createElement(FileExplorer, {
        project: options.project === undefined ? project : options.project,
        highlightedRelativePath: null,
        translate,
        readOnly: options.readOnly ?? false,
        onActivateDocument
      })
    );
  });
  await flushPromises();

  return {
    createFileExplorerMarkdownFile,
    createFileExplorerFolder,
    onActivateDocument
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

function dispatchContextMenu(target: Element): void {
  act(() => {
    target.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
    );
  });
}

function rightClickRoot(): void {
  dispatchContextMenu(
    container!.querySelector('[data-file-explorer-entry-kind="root"]')!
  );
}
function rightClickListArea(): void {
  dispatchContextMenu(container!.querySelector(".fileExplorerList")!);
}
function rightClickEntry(relativePath: string): void {
  dispatchContextMenu(entryButton(relativePath));
}

function newFileItem(): HTMLButtonElement | null {
  return container!.querySelector<HTMLButtonElement>(
    '[data-file-explorer-context-command="new-file"]'
  );
}
function newFolderItem(): HTMLButtonElement | null {
  return container!.querySelector<HTMLButtonElement>(
    '[data-file-explorer-context-command="new-folder"]'
  );
}
function selectedPaths(): string[] {
  return [
    ...container!.querySelectorAll<HTMLElement>('[data-selected="true"]')
  ].map((element) => element.dataset.fileExplorerEntryPath ?? "");
}
function dialogContextValue(): string {
  return (
    container!.querySelector(".nameInputDialogContextValue")?.textContent ?? ""
  );
}
function typeName(value: string): void {
  act(() => {
    const field = container!.querySelector<HTMLInputElement>(
      ".nameInputDialogInput"
    )!;
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    nativeSetter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submitDialog(): Promise<void> {
  await act(async () => {
    container!.querySelector<HTMLButtonElement>(".nameInputDialogPrimary")!.click();
  });
  await flushPromises();
}

describe("FileExplorer create context menu (#355)", () => {
  it("shows enabled New File / New Folder on an empty-area right-click", async () => {
    await mount();
    rightClickListArea();
    expect(newFileItem()).not.toBeNull();
    expect(newFolderItem()).not.toBeNull();
    expect(newFileItem()!.disabled).toBe(false);
    expect(newFolderItem()!.disabled).toBe(false);
  });

  it("shows enabled New File / New Folder on the project root row right-click", async () => {
    await mount();
    rightClickRoot();
    expect(newFileItem()!.disabled).toBe(false);
    expect(newFolderItem()!.disabled).toBe(false);
  });

  it("shows New File / New Folder on a folder row right-click", async () => {
    await mount();
    rightClickEntry("Drafts");
    expect(newFileItem()).not.toBeNull();
    expect(newFolderItem()).not.toBeNull();
  });

  it("does NOT show create items on a file row right-click", async () => {
    await mount();
    rightClickEntry("a.md");
    expect(newFileItem()).toBeNull();
    expect(newFolderItem()).toBeNull();
  });

  it("empty-area New File creates under the project root even when a file is selected", async () => {
    const h = await mount();
    act(() => entryButton("a.md").click());
    expect(selectedPaths()).toEqual(["a.md"]);

    rightClickListArea();
    act(() => newFileItem()!.click());
    expect(dialogContextValue()).toBe(t("en", "explorer.create.target.projectRoot"));

    typeName("intro");
    await submitDialog();
    expect(h.createFileExplorerMarkdownFile).toHaveBeenCalledWith(null, "intro");
  });

  it("folder-row New Folder creates under the clicked folder, not the prior selection", async () => {
    const h = await mount();
    act(() => entryButton("a.md").click());
    expect(selectedPaths()).toEqual(["a.md"]);

    rightClickEntry("Drafts");
    act(() => newFolderItem()!.click());
    expect(dialogContextValue()).toBe("Drafts");

    typeName("Chapter1");
    await submitDialog();
    expect(h.createFileExplorerFolder).toHaveBeenCalledWith("Drafts", "Chapter1");
  });

  it("disables create items in a read-only project", async () => {
    await mount({ project: readOnlyProject, readOnly: true });
    rightClickListArea();
    expect(newFileItem()!.disabled).toBe(true);
    expect(newFolderItem()!.disabled).toBe(true);
  });

  it("does not clear an existing selection on an empty-area / root right-click", async () => {
    await mount();
    act(() => entryButton("a.md").click());
    expect(selectedPaths()).toEqual(["a.md"]);

    rightClickListArea();
    expect(selectedPaths()).toEqual(["a.md"]);
    rightClickRoot();
    expect(selectedPaths()).toEqual(["a.md"]);
  });
});
