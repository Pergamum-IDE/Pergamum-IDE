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

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const translate: Translate = (key, values) => t("ja", key, values);

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
  { kind: "file", name: "b.markdown", relativePath: "b.markdown" },
  { kind: "file", name: "c.txt", relativePath: "c.txt" },
  { kind: "file", name: "cover.png", relativePath: "cover.png" },
  { kind: "file", name: "data.bin", relativePath: "data.bin" }
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
});

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(withHandler = true) {
  const onJapaneseMachineCheck = vi.fn();

  Object.defineProperty(window, "pergamum", {
    configurable: true,
    value: {
      projects: {
        listFileExplorerChildren: vi.fn(
          async (
            directoryRelativePath: string | null
          ): Promise<ListFileExplorerChildrenResult> => ({
            kind: "ok",
            directoryRelativePath,
            entries: directoryRelativePath === null ? treeRoot : []
          })
        )
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
        enablePlainTextDocuments
        onActivateDocument={vi.fn()}
        {...(withHandler ? { onJapaneseMachineCheck } : {})}
      />
    );
  });
  await flush();

  return { onJapaneseMachineCheck };
}

function openMenuOn(selector: string): void {
  const target = container!.querySelector<HTMLElement>(selector)!;

  act(() => {
    target.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
    );
  });
}

const entrySelector = (path: string): string =>
  `[data-file-explorer-entry-path="${path}"]`;
const item = (): HTMLButtonElement | null =>
  container!.querySelector<HTMLButtonElement>(
    '[data-file-explorer-context-command="japaneseMachineCheck"]'
  );

describe("File Explorer 日本語表現チェック context menu (#625 P2a)", () => {
  it.each(["a.md", "b.markdown", "c.txt"])(
    "shows the item for %s and passes its project-relative path",
    async (path) => {
      const { onJapaneseMachineCheck } = await mount();

      openMenuOn(entrySelector(path));

      expect(item()?.textContent).toBe("日本語表現チェック...");

      act(() => item()!.click());

      expect(onJapaneseMachineCheck).toHaveBeenCalledExactlyOnceWith(path);
      // The menu closes.
      expect(item()).toBeNull();
    }
  );

  it.each(["Drafts", "cover.png"])(
    "does not show the item for %s (folder / image; unsupported files are not listed at all)",
    async (path) => {
      await mount();
      openMenuOn(entrySelector(path));

      expect(item()).toBeNull();
      // The ordinary menu is still there.
      expect(
        container!.querySelector('[data-file-explorer-context-command="export"]')
      ).not.toBeNull();
    }
  );

  it("does not show the item for the project root", async () => {
    await mount();
    openMenuOn('[data-file-explorer-entry-kind="root"]');

    expect(item()).toBeNull();
  });

  it("is absent when the host gives no handler", async () => {
    await mount(false);
    openMenuOn(entrySelector("a.md"));

    expect(item()).toBeNull();
  });

  it("the English label is 'Japanese Style Check...'", () => {
    expect(t("en", "explorer.contextMenu.japaneseMachineCheck")).toBe(
      "Japanese Style Check..."
    );
  });
});
