// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileExplorer } from "../../src/renderer/FileExplorer";
import { t, type Translate } from "../../src/shared/i18n";
import type {
  FileExplorerEntry,
  ListFileExplorerChildrenResult,
  PergamumProject
} from "../../src/shared/api";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const translate: Translate = (key, values) => t("en", key, values);

const sampleProject: PergamumProject = {
  rootPath: "C:\\Novel",
  activeProjectFilePath: "C:\\Novel\\Novel.pergamum",
  accessMode: { kind: "readWrite" },
  name: "Novel",
  config: null,
  documents: []
};

const treeRoot: FileExplorerEntry[] = [
  { kind: "file", name: "chapter-01.md", relativePath: "chapter-01.md" },
  { kind: "file", name: "chapter-02.md", relativePath: "chapter-02.md" }
];

function ok(
  directoryRelativePath: string | null,
  entries: FileExplorerEntry[]
): ListFileExplorerChildrenResult {
  return { kind: "ok", directoryRelativePath, entries };
}

async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("File Explorer context menu viewport positioning (#629)", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1000
    });
    Object.defineProperty(window, "innerHeight", {
      writable: true,
      configurable: true,
      value: 800
    });

    Object.defineProperty(window, "pergamum", {
      configurable: true,
      value: {
        projects: {
          listFileExplorerChildren: vi.fn(
            async (directoryRelativePath: string | null) =>
              ok(directoryRelativePath, directoryRelativePath === null ? treeRoot : [])
          )
        }
      }
    });
  });

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    container = null;
    root = null;
    delete (window as unknown as { pergamum?: unknown }).pergamum;
    vi.restoreAllMocks();
  });

  async function mountExplorer(options: {
    onJapaneseMachineCheck?: (path: string) => void;
  } = {}): Promise<void> {
    act(() => {
      root!.render(
        <FileExplorer
          project={sampleProject}
          highlightedRelativePath={null}
          translate={translate}
          onActivateDocument={vi.fn()}
          onJapaneseMachineCheck={options.onJapaneseMachineCheck}
        />
      );
    });
    await flushPromises();
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

  it("clamps context menu position when opened near the bottom-right edge of the viewport", async () => {
    vi.spyOn(HTMLDivElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 200,
      height: 300,
      top: 750,
      left: 950,
      right: 1150,
      bottom: 1050,
      x: 950,
      y: 750,
      toJSON: () => ({})
    });

    await mountExplorer();

    const fileRow = entryButton("chapter-01.md");

    // Trigger right click near bottom-right edge (x: 950, y: 750)
    act(() => {
      fileRow.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 950,
          clientY: 750
        })
      );
    });

    const menu = container!.querySelector<HTMLDivElement>(".fileExplorerContextMenu");
    expect(menu).not.toBeNull();

    const styleX = menu?.style.getPropertyValue("--file-explorer-context-menu-x");
    const styleY = menu?.style.getPropertyValue("--file-explorer-context-menu-y");

    // maxX = 1000 - 200 - 8 = 792
    // maxY = 800 - 300 - 8 = 492
    expect(styleX).toBe("792px");
    expect(styleY).toBe("492px");
  });

  it("includes Japanese Machine Check item and clamps correctly", async () => {
    const onJapaneseMachineCheck = vi.fn();
    await mountExplorer({ onJapaneseMachineCheck });

    const fileRow = entryButton("chapter-01.md");

    act(() => {
      fileRow.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 500,
          clientY: 750
        })
      );
    });

    const jaCheckItem = container!.querySelector<HTMLButtonElement>(
      '[data-file-explorer-context-command="japaneseMachineCheck"]'
    );
    expect(jaCheckItem).not.toBeNull();

    act(() => {
      jaCheckItem?.click();
    });

    expect(onJapaneseMachineCheck).toHaveBeenCalledWith("chapter-01.md");
    expect(container!.querySelector(".fileExplorerContextMenu")).toBeNull();
  });

  it("closes context menu on Escape key press", async () => {
    await mountExplorer();

    const fileRow = entryButton("chapter-01.md");

    act(() => {
      fileRow.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: 100
        })
      );
    });

    expect(container!.querySelector(".fileExplorerContextMenu")).not.toBeNull();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(container!.querySelector(".fileExplorerContextMenu")).toBeNull();
  });

  it("closes context menu on outside backdrop click", async () => {
    await mountExplorer();

    const fileRow = entryButton("chapter-01.md");

    act(() => {
      fileRow.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: 100
        })
      );
    });

    const backdrop = container!.querySelector<HTMLDivElement>(
      ".fileExplorerContextMenuBackdrop"
    );
    expect(backdrop).not.toBeNull();

    act(() => {
      backdrop?.click();
    });

    expect(container!.querySelector(".fileExplorerContextMenu")).toBeNull();
  });
});
