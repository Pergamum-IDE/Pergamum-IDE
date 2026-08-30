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
import type { Translate } from "../../src/shared/i18n";
import {
  FileExplorer,
  resolveFileExplorerReloadTargets
} from "../../src/renderer/FileExplorer";

const translate: Translate = (key) => key;

const project: PergamumProject = {
  rootPath: "C:\\Novel",
  activeProjectFilePath: "C:\\Novel\\Novel.pergamum",
  accessMode: { kind: "readWrite" },
  name: "Novel",
  config: null,
  documents: [
    {
      relativePath: "chapter-01.md",
      name: "chapter-01.md"
    }
  ]
};

const rootEntries: FileExplorerEntry[] = [
  {
    kind: "folder",
    name: "Drafts",
    relativePath: "Drafts"
  },
  {
    kind: "file",
    name: "chapter-01.md",
    relativePath: "chapter-01.md"
  }
];

const draftEntries: FileExplorerEntry[] = [
  {
    kind: "file",
    name: "draft.md",
    relativePath: "Drafts/draft.md"
  }
];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
    root = null;
  }

  if (container) {
    container.remove();
    container = null;
  }

  delete (window as unknown as { pergamum?: unknown }).pergamum;
});

function ok(
  directoryRelativePath: string | null,
  entries: FileExplorerEntry[]
): ListFileExplorerChildrenResult {
  return {
    kind: "ok",
    directoryRelativePath,
    entries
  };
}

function mountFileExplorer(
  listFileExplorerChildren: (
    directoryRelativePath: string | null
  ) => Promise<ListFileExplorerChildrenResult>,
  mountedProject: PergamumProject | null = project,
  onActivateDocument = vi.fn()
): void {
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
      React.createElement(FileExplorer, {
        project: mountedProject,
        highlightedRelativePath: null,
        translate,
        onActivateDocument
      })
    );
  });
}

function rerenderFileExplorer(
  mountedProject: PergamumProject | null,
  onActivateDocument = vi.fn()
): void {
  act(() => {
    root!.render(
      React.createElement(FileExplorer, {
        project: mountedProject,
        highlightedRelativePath: null,
        translate,
        onActivateDocument
      })
    );
  });
}

async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function entryButton(relativePath: string): HTMLButtonElement {
  const button = container!.querySelector(
    `[data-file-explorer-entry-path="${relativePath}"]`
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`File Explorer entry ${relativePath} was not rendered.`);
  }

  return button;
}

function rootButton(): HTMLButtonElement {
  const button = container!.querySelector(
    '[data-file-explorer-entry-kind="root"]'
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("File Explorer root was not rendered as a button.");
  }

  return button;
}

function toolbarButton(label: string): HTMLButtonElement {
  const button = container!.querySelector(`button[aria-label="${label}"]`);

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Toolbar button ${label} was not rendered.`);
  }

  return button;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

describe("FileExplorer", () => {
  it("loads only root direct children on initial render", async () => {
    const listFileExplorerChildren = vi
      .fn()
      .mockResolvedValue(ok(null, rootEntries));

    mountFileExplorer(listFileExplorerChildren);
    await flushPromises();

    expect(listFileExplorerChildren).toHaveBeenCalledTimes(1);
    expect(listFileExplorerChildren).toHaveBeenCalledWith(null);
    expect(container!.textContent).toContain("Novel");
    expect(container!.textContent).toContain("Drafts");
    expect(container!.textContent).toContain("chapter-01.md");
    expect(container!.textContent).not.toContain("draft.md");
  });

  it("loads only the expanded folder direct children", async () => {
    const listFileExplorerChildren = vi
      .fn()
      .mockImplementation((directoryRelativePath: string | null) =>
        Promise.resolve(
          directoryRelativePath === "Drafts"
            ? ok("Drafts", draftEntries)
            : ok(null, rootEntries)
        )
      );

    mountFileExplorer(listFileExplorerChildren);
    await flushPromises();

    await act(async () => {
      entryButton("Drafts").click();
      await Promise.resolve();
    });

    expect(listFileExplorerChildren).toHaveBeenNthCalledWith(1, null);
    expect(listFileExplorerChildren).toHaveBeenNthCalledWith(2, "Drafts");
    expect(container!.textContent).toContain("draft.md");
    expect(entryButton("Drafts").getAttribute("aria-expanded")).toBe("true");

    await act(async () => {
      entryButton("Drafts").click();
      await Promise.resolve();
    });

    expect(entryButton("Drafts").getAttribute("aria-expanded")).toBe("false");
    expect(container!.textContent).not.toContain("draft.md");
  });

  it("activates Markdown files discovered by reload", async () => {
    const reloadedRootEntries: FileExplorerEntry[] = [
      ...rootEntries,
      {
        kind: "file",
        name: "late.md",
        relativePath: "late.md"
      },
      {
        kind: "file",
        name: "late.markdown",
        relativePath: "late.markdown"
      },
      {
        kind: "file",
        name: "late.txt",
        relativePath: "late.txt"
      }
    ];
    const onActivateDocument = vi.fn();
    const listFileExplorerChildren = vi
      .fn()
      .mockResolvedValueOnce(ok(null, rootEntries))
      .mockResolvedValueOnce(ok(null, reloadedRootEntries));

    mountFileExplorer(listFileExplorerChildren, project, onActivateDocument);
    await flushPromises();

    await act(async () => {
      toolbarButton("explorer.reload").click();
      await Promise.resolve();
    });

    expect(entryButton("late.md").dataset.fileExplorerOpenable).toBe("true");
    expect(entryButton("late.markdown").dataset.fileExplorerOpenable).toBe(
      "true"
    );
    expect(entryButton("late.txt").dataset.fileExplorerOpenable).toBeUndefined();

    await act(async () => {
      entryButton("late.md").click();
      entryButton("late.markdown").click();
      entryButton("late.txt").click();
      await Promise.resolve();
    });

    expect(onActivateDocument).toHaveBeenCalledTimes(2);
    expect(onActivateDocument).toHaveBeenNthCalledWith(1, "late.md");
    expect(onActivateDocument).toHaveBeenNthCalledWith(2, "late.markdown");
  });

  it("reloads the selected folder children and keeps the folder expanded", async () => {
    const updatedDraftEntries: FileExplorerEntry[] = [
      {
        kind: "file",
        name: "updated.md",
        relativePath: "Drafts/updated.md"
      }
    ];
    let draftLoadCount = 0;
    const listFileExplorerChildren = vi
      .fn()
      .mockImplementation((directoryRelativePath: string | null) => {
        if (directoryRelativePath === "Drafts") {
          draftLoadCount += 1;
          return Promise.resolve(
            ok(
              "Drafts",
              draftLoadCount === 1 ? draftEntries : updatedDraftEntries
            )
          );
        }

        return Promise.resolve(ok(null, rootEntries));
      });

    mountFileExplorer(listFileExplorerChildren);
    await flushPromises();
    await act(async () => {
      entryButton("Drafts").click();
      await Promise.resolve();
    });
    expect(container!.textContent).toContain("draft.md");

    await act(async () => {
      toolbarButton("explorer.reload").click();
      await Promise.resolve();
    });

    expect(listFileExplorerChildren).toHaveBeenNthCalledWith(3, "Drafts");
    expect(entryButton("Drafts").getAttribute("aria-expanded")).toBe("true");
    expect(container!.textContent).not.toContain("draft.md");
    expect(container!.textContent).toContain("updated.md");
  });

  it("reloads the selected file parent folder", async () => {
    const updatedDraftEntries: FileExplorerEntry[] = [
      {
        kind: "file",
        name: "after-file-selection.md",
        relativePath: "Drafts/after-file-selection.md"
      }
    ];
    let draftLoadCount = 0;
    const listFileExplorerChildren = vi
      .fn()
      .mockImplementation((directoryRelativePath: string | null) => {
        if (directoryRelativePath === "Drafts") {
          draftLoadCount += 1;
          return Promise.resolve(
            ok(
              "Drafts",
              draftLoadCount === 1 ? draftEntries : updatedDraftEntries
            )
          );
        }

        return Promise.resolve(ok(null, rootEntries));
      });

    mountFileExplorer(listFileExplorerChildren);
    await flushPromises();
    await act(async () => {
      entryButton("Drafts").click();
      await Promise.resolve();
    });
    await act(async () => {
      entryButton("Drafts/draft.md").click();
      await Promise.resolve();
    });

    await act(async () => {
      toolbarButton("explorer.reload").click();
      await Promise.resolve();
    });

    expect(listFileExplorerChildren).toHaveBeenNthCalledWith(3, "Drafts");
    expect(entryButton("Drafts").getAttribute("aria-expanded")).toBe("true");
    expect(container!.textContent).toContain("after-file-selection.md");
  });

  it("reloads root children for root selection while preserving expanded folders", async () => {
    const reloadedRootEntries: FileExplorerEntry[] = [
      ...rootEntries,
      {
        kind: "file",
        name: "root-refresh.md",
        relativePath: "root-refresh.md"
      }
    ];
    const listFileExplorerChildren = vi
      .fn()
      .mockResolvedValueOnce(ok(null, rootEntries))
      .mockResolvedValueOnce(ok("Drafts", draftEntries))
      .mockResolvedValueOnce(ok(null, reloadedRootEntries));

    mountFileExplorer(listFileExplorerChildren);
    await flushPromises();
    await act(async () => {
      entryButton("Drafts").click();
      await Promise.resolve();
    });
    await act(async () => {
      rootButton().click();
      await Promise.resolve();
    });

    await act(async () => {
      toolbarButton("explorer.reload").click();
      await Promise.resolve();
    });

    expect(listFileExplorerChildren).toHaveBeenNthCalledWith(3, null);
    expect(rootButton().dataset.selected).toBe("true");
    expect(entryButton("Drafts").getAttribute("aria-expanded")).toBe("true");
    expect(container!.textContent).toContain("draft.md");
    expect(container!.textContent).toContain("root-refresh.md");
  });

  it("resolves no-selection reload targets to the visible tree without collapsing folders", () => {
    expect(
      resolveFileExplorerReloadTargets({
        entriesByDirectoryPath: {
          "": rootEntries,
          Drafts: draftEntries
        },
        expandedDirectoryPaths: new Set(["Drafts"]),
        isRootSelected: false,
        selectedRelativePath: null
      })
    ).toEqual([null, "Drafts"]);

    expect(
      resolveFileExplorerReloadTargets({
        entriesByDirectoryPath: {
          "": rootEntries,
          Drafts: draftEntries
        },
        expandedDirectoryPaths: new Set(["Drafts"]),
        isRootSelected: false,
        selectedRelativePath: "Drafts"
      })
    ).toEqual(["Drafts"]);

    expect(
      resolveFileExplorerReloadTargets({
        entriesByDirectoryPath: {
          "": rootEntries,
          Drafts: draftEntries
        },
        expandedDirectoryPaths: new Set(["Drafts"]),
        isRootSelected: false,
        selectedRelativePath: "Drafts/draft.md"
      })
    ).toEqual(["Drafts"]);

    expect(
      resolveFileExplorerReloadTargets({
        entriesByDirectoryPath: {
          "": rootEntries,
          Drafts: draftEntries
        },
        expandedDirectoryPaths: new Set(["Drafts"]),
        isRootSelected: true,
        selectedRelativePath: null
      })
    ).toEqual([null]);
  });

  it("ignores late results after a project switch", async () => {
    const firstLoad = deferred<ListFileExplorerChildrenResult>();
    const secondLoad = deferred<ListFileExplorerChildrenResult>();
    const switchedProject: PergamumProject = {
      ...project,
      rootPath: "C:\\Other",
      activeProjectFilePath: "C:\\Other\\Other.pergamum",
      name: "Other",
      documents: [
        {
          relativePath: "other.md",
          name: "other.md"
        }
      ]
    };
    const listFileExplorerChildren = vi
      .fn()
      .mockReturnValueOnce(firstLoad.promise)
      .mockReturnValueOnce(secondLoad.promise);

    mountFileExplorer(listFileExplorerChildren);
    rerenderFileExplorer(switchedProject);

    firstLoad.resolve(
      ok(null, [
        {
          kind: "file",
          name: "old.md",
          relativePath: "old.md"
        }
      ])
    );
    secondLoad.resolve(
      ok(null, [
        {
          kind: "file",
          name: "other.md",
          relativePath: "other.md"
        }
      ])
    );
    await flushPromises();

    expect(container!.textContent).toContain("Other");
    expect(container!.textContent).toContain("other.md");
    expect(container!.textContent).not.toContain("old.md");
  });

  it("ignores late results after project close", async () => {
    const firstLoad = deferred<ListFileExplorerChildrenResult>();
    const listFileExplorerChildren = vi.fn().mockReturnValue(firstLoad.promise);

    mountFileExplorer(listFileExplorerChildren);
    rerenderFileExplorer(null);
    firstLoad.resolve(ok(null, rootEntries));
    await flushPromises();

    expect(container!.textContent).toContain("explorer.noProject");
    expect(container!.textContent).not.toContain("chapter-01.md");
  });
});
