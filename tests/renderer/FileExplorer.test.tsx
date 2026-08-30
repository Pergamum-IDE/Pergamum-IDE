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
import type { CreateFileExplorerEntryResult } from "../../src/shared/api";
import {
  FileExplorer,
  resolveFileExplorerCreateParentDirectory,
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

describe("resolveFileExplorerCreateParentDirectory (#307)", () => {
  const entriesByDirectoryPath = {
    "": rootEntries,
    Drafts: draftEntries
  };

  it("returns null for the root selection or no selection", () => {
    expect(
      resolveFileExplorerCreateParentDirectory({
        entriesByDirectoryPath,
        isRootSelected: true,
        selectedRelativePath: null
      })
    ).toBeNull();
    expect(
      resolveFileExplorerCreateParentDirectory({
        entriesByDirectoryPath,
        isRootSelected: false,
        selectedRelativePath: null
      })
    ).toBeNull();
  });

  it("returns a selected folder itself", () => {
    expect(
      resolveFileExplorerCreateParentDirectory({
        entriesByDirectoryPath,
        isRootSelected: false,
        selectedRelativePath: "Drafts"
      })
    ).toBe("Drafts");
  });

  it("returns the parent folder of a selected file", () => {
    expect(
      resolveFileExplorerCreateParentDirectory({
        entriesByDirectoryPath,
        isRootSelected: false,
        selectedRelativePath: "Drafts/draft.md"
      })
    ).toBe("Drafts");
    expect(
      resolveFileExplorerCreateParentDirectory({
        entriesByDirectoryPath,
        isRootSelected: false,
        selectedRelativePath: "chapter-01.md"
      })
    ).toBeNull();
  });
});

describe("FileExplorer create toolbar (#307)", () => {
  function mountWithCreate(options: {
    project?: PergamumProject | null;
    createMarkdownFile?: (
      parent: string | null,
      name: string
    ) => Promise<CreateFileExplorerEntryResult>;
    createFolder?: (
      parent: string | null,
      name: string
    ) => Promise<CreateFileExplorerEntryResult>;
    writeText?: (text: string) => Promise<void>;
  }): {
    listFileExplorerChildren: ReturnType<typeof vi.fn>;
    onActivateDocument: ReturnType<typeof vi.fn>;
  } {
    const listFileExplorerChildren = vi.fn(
      async (relativePath: string | null) => {
        if (relativePath === null) {
          return ok(null, rootEntries);
        }
        if (relativePath === "Drafts") {
          return ok("Drafts", draftEntries);
        }
        return ok(relativePath, []);
      }
    );
    const onActivateDocument = vi.fn();

    Object.defineProperty(window, "pergamum", {
      configurable: true,
      value: {
        projects: {
          listFileExplorerChildren,
          createFileExplorerMarkdownFile:
            options.createMarkdownFile ??
            vi.fn(async (): Promise<CreateFileExplorerEntryResult> => ({
              ok: true,
              entry: {
                kind: "file",
                name: "new.md",
                relativePath: "new.md"
              }
            })),
          createFileExplorerFolder:
            options.createFolder ??
            vi.fn(async (): Promise<CreateFileExplorerEntryResult> => ({
              ok: true,
              entry: {
                kind: "folder",
                name: "New",
                relativePath: "New"
              }
            }))
        }
      }
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(
        React.createElement(FileExplorer, {
          project:
            options.project === undefined ? project : options.project,
          highlightedRelativePath: null,
          translate,
          readOnly: false,
          clipboardAdapter: {
            writeText: options.writeText ?? vi.fn(async () => undefined)
          },
          onActivateDocument
        })
      );
    });

    return { listFileExplorerChildren, onActivateDocument };
  }

  function dialogInput(): HTMLInputElement {
    return container!.querySelector<HTMLInputElement>(
      ".nameInputDialogInput"
    )!;
  }
  function dialogPrimary(): HTMLButtonElement {
    return container!.querySelector<HTMLButtonElement>(
      ".nameInputDialogPrimary"
    )!;
  }
  function typeName(value: string): void {
    act(() => {
      const field = dialogInput();
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;
      nativeSetter?.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("disables New File / New Folder when there is no project", async () => {
    mountWithCreate({ project: null });
    await flushPromises();

    expect(toolbarButton("explorer.newFile").disabled).toBe(true);
    expect(toolbarButton("explorer.newFolder").disabled).toBe(true);
  });

  it("disables New File / New Folder in a read-only project", async () => {
    const listFileExplorerChildren = vi
      .fn()
      .mockResolvedValue(ok(null, rootEntries));
    Object.defineProperty(window, "pergamum", {
      configurable: true,
      value: { projects: { listFileExplorerChildren } }
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        React.createElement(FileExplorer, {
          project: {
            ...project,
            accessMode: { kind: "readOnly", reason: "writeLockUnavailable" }
          },
          highlightedRelativePath: null,
          translate,
          readOnly: true,
          onActivateDocument: vi.fn()
        })
      );
    });
    await flushPromises();

    expect(toolbarButton("explorer.newFile").disabled).toBe(true);
    expect(toolbarButton("explorer.newFolder").disabled).toBe(true);
  });

  it("creates a Markdown file into the selected folder and opens it as a project document", async () => {
    const createMarkdownFile = vi.fn(
      async (): Promise<CreateFileExplorerEntryResult> => ({
        ok: true,
        entry: {
          kind: "file",
          name: "chapter-02.md",
          relativePath: "Drafts/chapter-02.md"
        }
      })
    );
    const { onActivateDocument } = mountWithCreate({ createMarkdownFile });
    await flushPromises();

    act(() => entryButton("Drafts").click());
    act(() => toolbarButton("explorer.newFile").click());

    typeName("chapter-02");
    await act(async () => {
      dialogPrimary().click();
    });
    await flushPromises();

    expect(createMarkdownFile).toHaveBeenCalledWith("Drafts", "chapter-02");
    expect(onActivateDocument).toHaveBeenCalledWith("Drafts/chapter-02.md");
    // Dialog closed on success.
    expect(container!.querySelector(".nameInputDialogInput")).toBeNull();
  });

  it("rejects an unsupported extension in the renderer without calling the create IPC", async () => {
    const createMarkdownFile = vi.fn(async (): Promise<CreateFileExplorerEntryResult> => ({
      ok: true,
      entry: { kind: "file", name: "x.md", relativePath: "x.md" }
    }));
    mountWithCreate({ createMarkdownFile });
    await flushPromises();

    act(() => toolbarButton("explorer.newFile").click());
    typeName("notes.txt");
    await act(async () => {
      dialogPrimary().click();
    });

    expect(createMarkdownFile).not.toHaveBeenCalled();
    expect(
      container!.querySelector(".nameInputDialogError")?.textContent
    ).toBe("explorer.create.error.unsupportedExtension");
  });

  it("surfaces an operation error with a technical-copy button and does not open a document", async () => {
    const writeText = vi.fn(async () => undefined);
    const createMarkdownFile = vi.fn(
      async (): Promise<CreateFileExplorerEntryResult> => ({
        ok: false,
        reason: "permissionDenied"
      })
    );
    const { onActivateDocument } = mountWithCreate({
      createMarkdownFile,
      writeText
    });
    await flushPromises();

    act(() => toolbarButton("explorer.newFile").click());
    typeName("chapter-03");
    await act(async () => {
      dialogPrimary().click();
    });

    expect(
      container!.querySelector(".nameInputDialogError")?.textContent
    ).toBe("explorer.create.error.permissionDenied");
    expect(onActivateDocument).not.toHaveBeenCalled();

    const copy = container!.querySelector<HTMLButtonElement>(
      ".nameInputDialogCopyButton"
    );
    expect(copy).not.toBeNull();
    await act(async () => {
      copy!.click();
    });
    const copied = String(
      (writeText.mock.calls[0] as unknown[] | undefined)?.[0] ?? ""
    );
    expect(copied).toContain("reason: permissionDenied");
    expect(copied).not.toContain(project.rootPath);
  });

  it("shows a reserved-name validation error without calling the create IPC", async () => {
    const createFolder = vi.fn(async (): Promise<CreateFileExplorerEntryResult> => ({
      ok: true,
      entry: { kind: "folder", name: "x", relativePath: "x" }
    }));
    mountWithCreate({ createFolder });
    await flushPromises();

    act(() => toolbarButton("explorer.newFolder").click());
    typeName(".git");
    await act(async () => {
      dialogPrimary().click();
    });

    expect(createFolder).not.toHaveBeenCalled();
    expect(
      container!.querySelector(".nameInputDialogError")?.textContent
    ).toBe("explorer.create.name.reserved");
  });

  it("reloads the parent folder after a successful folder create", async () => {
    const createFolder = vi.fn(
      async (): Promise<CreateFileExplorerEntryResult> => ({
        ok: true,
        entry: {
          kind: "folder",
          name: "Chapters",
          relativePath: "Chapters"
        }
      })
    );
    const { listFileExplorerChildren } = mountWithCreate({ createFolder });
    await flushPromises();
    listFileExplorerChildren.mockClear();

    act(() => toolbarButton("explorer.newFolder").click());
    typeName("Chapters");
    await act(async () => {
      dialogPrimary().click();
    });
    await flushPromises();

    // Root reloaded (parent) + the new folder's own children loaded.
    expect(listFileExplorerChildren).toHaveBeenCalledWith(null);
    expect(listFileExplorerChildren).toHaveBeenCalledWith("Chapters");
    expect(container!.querySelector(".nameInputDialogInput")).toBeNull();
  });
});
