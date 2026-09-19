// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  FileExplorerEntry,
  ListFileExplorerChildrenResult,
  PergamumProject
} from "../../src/shared/api";
import { t, type Translate } from "../../src/shared/i18n";
import { FileExplorer } from "../../src/renderer/FileExplorer";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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
  { kind: "file", name: "cover.png", relativePath: "cover.png" }
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

async function mount(): Promise<{
  readonly onExportFromFileExplorer: ReturnType<typeof vi.fn>;
}> {
  const listFileExplorerChildren = vi.fn(
    async (
      directoryRelativePath: string | null
    ): Promise<ListFileExplorerChildrenResult> => ({
      kind: "ok",
      directoryRelativePath,
      entries: directoryRelativePath === null ? treeRoot : []
    })
  );
  const onExportFromFileExplorer = vi.fn();

  Object.defineProperty(window, "pergamum", {
    configurable: true,
    value: {
      projects: {
        listFileExplorerChildren
      }
    }
  });

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <FileExplorer
        project={project}
        highlightedRelativePath={null}
        translate={translate}
        onActivateDocument={vi.fn()}
        onExportFromFileExplorer={onExportFromFileExplorer}
      />
    );
  });
  await flush();

  return { onExportFromFileExplorer };
}

function entry(relativePath: string): HTMLElement {
  return container!.querySelector<HTMLElement>(
    `[data-file-explorer-entry-path="${relativePath}"]`
  )!;
}

function rootEntry(): HTMLElement {
  return container!.querySelector<HTMLElement>(
    '[data-file-explorer-entry-kind="root"]'
  )!;
}

function openContextMenu(target: HTMLElement): void {
  act(() => {
    target.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 12,
        clientY: 24
      })
    );
  });
}

function exportMenuItem(): HTMLButtonElement {
  return container!.querySelector<HTMLButtonElement>(
    '[data-file-explorer-context-command="export"]'
  )!;
}

function clickExportMenuItem(): void {
  act(() => exportMenuItem().click());
}

describe("File Explorer Export context menu (#523 Slice 1)", () => {
  it("shows Export for the project root and passes a projectRoot origin", async () => {
    const { onExportFromFileExplorer } = await mount();

    openContextMenu(rootEntry());

    expect(exportMenuItem().textContent).toBe(
      t("en", "explorer.contextMenu.export")
    );
    clickExportMenuItem();
    expect(onExportFromFileExplorer).toHaveBeenCalledWith({
      kind: "projectRoot"
    });
  });

  it("shows Export for a folder row and passes a folder origin", async () => {
    const { onExportFromFileExplorer } = await mount();

    openContextMenu(entry("Drafts"));
    clickExportMenuItem();

    expect(onExportFromFileExplorer).toHaveBeenCalledWith({
      kind: "folder",
      folderPath: "Drafts"
    });
  });

  it("shows Export for a file row and passes a file origin", async () => {
    const { onExportFromFileExplorer } = await mount();

    openContextMenu(entry("a.md"));
    clickExportMenuItem();

    expect(onExportFromFileExplorer).toHaveBeenCalledWith({
      kind: "file",
      filePath: "a.md"
    });
  });
});
