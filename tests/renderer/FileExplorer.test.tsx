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
  resolveFileExplorerReloadTargets,
  scrollFileExplorerActiveDocumentIntoView
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

describe("FileExplorer active project document reveal (#309)", () => {
  const revealRootEntries: FileExplorerEntry[] = [
    { kind: "folder", name: "Drafts", relativePath: "Drafts" },
    { kind: "file", name: "chapter-01.md", relativePath: "chapter-01.md" }
  ];
  const draftsChildren: FileExplorerEntry[] = [
    { kind: "folder", name: "Chapter1", relativePath: "Drafts/Chapter1" },
    { kind: "file", name: "outline.md", relativePath: "Drafts/outline.md" }
  ];
  const chapter1Children: FileExplorerEntry[] = [
    {
      kind: "file",
      name: "scene-03.md",
      relativePath: "Drafts/Chapter1/scene-03.md"
    }
  ];

  function revealList(
    directoryRelativePath: string | null
  ): Promise<ListFileExplorerChildrenResult> {
    switch (directoryRelativePath) {
      case null:
        return Promise.resolve(ok(null, revealRootEntries));
      case "Drafts":
        return Promise.resolve(ok("Drafts", draftsChildren));
      case "Drafts/Chapter1":
        return Promise.resolve(ok("Drafts/Chapter1", chapter1Children));
      default:
        return Promise.resolve(ok(directoryRelativePath, []));
    }
  }

  async function settleReveal(): Promise<void> {
    for (let i = 0; i < 6; i += 1) {
      await flushPromises();
    }
  }

  interface RevealHarness {
    listFileExplorerChildren: ReturnType<typeof vi.fn>;
    createFileExplorerMarkdownFile: ReturnType<typeof vi.fn>;
    rerender: (next: {
      project?: PergamumProject | null;
      highlightedRelativePath?: string | null;
    }) => void;
  }

  function renderReveal(options?: {
    listFileExplorerChildren?: (
      directoryRelativePath: string | null
    ) => Promise<ListFileExplorerChildrenResult>;
    project?: PergamumProject | null;
    highlightedRelativePath?: string | null;
    createFileExplorerMarkdownFile?: ReturnType<typeof vi.fn>;
  }): RevealHarness {
    const listFileExplorerChildren = vi.fn(
      options?.listFileExplorerChildren ?? revealList
    );
    const createFileExplorerMarkdownFile =
      options?.createFileExplorerMarkdownFile ??
      vi.fn(
        async (): Promise<CreateFileExplorerEntryResult> => ({
          ok: true,
          entry: { kind: "file", name: "new.md", relativePath: "new.md" }
        })
      );

    Object.defineProperty(window, "pergamum", {
      configurable: true,
      value: {
        projects: {
          listFileExplorerChildren,
          createFileExplorerMarkdownFile,
          createFileExplorerFolder: vi.fn(
            async (): Promise<CreateFileExplorerEntryResult> => ({
              ok: true,
              entry: { kind: "folder", name: "New", relativePath: "New" }
            })
          )
        }
      }
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    let currentProject: PergamumProject | null =
      options?.project === undefined ? project : options.project;
    let currentHighlight: string | null =
      options?.highlightedRelativePath ?? null;

    const paint = (): void => {
      act(() => {
        root!.render(
          React.createElement(FileExplorer, {
            project: currentProject,
            highlightedRelativePath: currentHighlight,
            translate,
            onActivateDocument: vi.fn()
          })
        );
      });
    };

    paint();

    return {
      listFileExplorerChildren,
      createFileExplorerMarkdownFile,
      rerender: (next) => {
        if ("project" in next) {
          currentProject = next.project ?? null;
        }
        if ("highlightedRelativePath" in next) {
          currentHighlight = next.highlightedRelativePath ?? null;
        }
        paint();
      }
    };
  }

  function typeDialogName(value: string): void {
    const field = container!.querySelector<HTMLInputElement>(
      ".nameInputDialogInput"
    )!;
    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;
      nativeSetter?.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("highlights a root-level active project document", async () => {
    renderReveal({ highlightedRelativePath: "chapter-01.md" });
    await settleReveal();

    const highlighted = entryButton("chapter-01.md");
    expect(highlighted.getAttribute("aria-current")).toBe("page");
    expect(highlighted.className).toContain("isActive");
  });

  it("expands and lazily loads the ancestor folders of a nested active project document", async () => {
    const { listFileExplorerChildren } = renderReveal({
      highlightedRelativePath: "Drafts/Chapter1/scene-03.md"
    });
    await settleReveal();

    expect(listFileExplorerChildren).toHaveBeenCalledWith(null);
    expect(listFileExplorerChildren).toHaveBeenCalledWith("Drafts");
    expect(listFileExplorerChildren).toHaveBeenCalledWith("Drafts/Chapter1");
    expect(entryButton("Drafts").getAttribute("aria-expanded")).toBe("true");
    expect(entryButton("Drafts/Chapter1").getAttribute("aria-expanded")).toBe(
      "true"
    );
  });

  it("makes a nested active project document visible after the lazy reveal", async () => {
    renderReveal({
      highlightedRelativePath: "Drafts/Chapter1/scene-03.md"
    });
    await settleReveal();

    const revealed = entryButton("Drafts/Chapter1/scene-03.md");
    expect(revealed.getAttribute("aria-current")).toBe("page");
    expect(revealed.className).toContain("isActive");
  });

  it("updates the active highlight when the active project document changes", async () => {
    const { rerender } = renderReveal({
      highlightedRelativePath: "chapter-01.md"
    });
    await settleReveal();
    expect(entryButton("chapter-01.md").getAttribute("aria-current")).toBe(
      "page"
    );

    rerender({ highlightedRelativePath: "Drafts/outline.md" });
    await settleReveal();

    expect(
      entryButton("chapter-01.md").getAttribute("aria-current")
    ).toBeNull();
    const nextHighlight = entryButton("Drafts/outline.md");
    expect(nextHighlight.getAttribute("aria-current")).toBe("page");
    expect(nextHighlight.className).toContain("isActive");
  });

  it("does not overwrite the File Explorer selection when revealing the active document", async () => {
    const { rerender } = renderReveal({ highlightedRelativePath: null });
    await settleReveal();

    act(() => entryButton("Drafts").click());
    await settleReveal();
    expect(entryButton("Drafts").dataset.selected).toBe("true");

    rerender({ highlightedRelativePath: "chapter-01.md" });
    await settleReveal();

    expect(entryButton("chapter-01.md").getAttribute("aria-current")).toBe(
      "page"
    );
    expect(entryButton("Drafts").dataset.selected).toBe("true");
    expect(entryButton("chapter-01.md").dataset.selected).toBeUndefined();
  });

  it("keeps expanded folders when the active project document is already visible", async () => {
    const { listFileExplorerChildren, rerender } = renderReveal({
      highlightedRelativePath: null
    });
    await settleReveal();

    act(() => entryButton("Drafts").click());
    await settleReveal();
    expect(container!.textContent).toContain("outline.md");

    const callsBefore = listFileExplorerChildren.mock.calls.length;
    rerender({ highlightedRelativePath: "chapter-01.md" });
    await settleReveal();

    expect(entryButton("Drafts").getAttribute("aria-expanded")).toBe("true");
    expect(container!.textContent).toContain("outline.md");
    expect(listFileExplorerChildren.mock.calls.length).toBe(callsBefore);
  });

  it("clears the active highlight when the active tab is a standalone Markdown file", async () => {
    const { rerender } = renderReveal({
      highlightedRelativePath: "chapter-01.md"
    });
    await settleReveal();
    expect(entryButton("chapter-01.md").getAttribute("aria-current")).toBe(
      "page"
    );

    // A standalone Markdown editor is not a project document, so the wiring
    // feeds the File Explorer a null highlighted path.
    rerender({ highlightedRelativePath: null });
    await settleReveal();

    expect(
      entryButton("chapter-01.md").getAttribute("aria-current")
    ).toBeNull();
    expect(
      container!.querySelector(".fileExplorerItem.isActive")
    ).toBeNull();
  });

  it("clears the active highlight when the active tab is an untitled document", async () => {
    const { rerender } = renderReveal({
      highlightedRelativePath: "chapter-01.md"
    });
    await settleReveal();

    // An untitled editor has no project-relative path.
    rerender({ highlightedRelativePath: null });
    await settleReveal();

    expect(
      entryButton("chapter-01.md").getAttribute("aria-current")
    ).toBeNull();
    expect(
      container!.querySelector(".fileExplorerItem.isActive")
    ).toBeNull();
  });

  it("clears the active highlight when the active tab is a glossary entry", async () => {
    const { rerender } = renderReveal({
      highlightedRelativePath: "chapter-01.md"
    });
    await settleReveal();

    // A glossary entry editor is not a project document.
    rerender({ highlightedRelativePath: null });
    await settleReveal();

    expect(
      entryButton("chapter-01.md").getAttribute("aria-current")
    ).toBeNull();
    expect(
      container!.querySelector(".fileExplorerItem.isActive")
    ).toBeNull();
  });

  it("leaves the File Explorer selection unchanged when the active editor is non-project", async () => {
    const { rerender } = renderReveal({
      highlightedRelativePath: "chapter-01.md"
    });
    await settleReveal();

    act(() => entryButton("Drafts").click());
    await settleReveal();
    expect(entryButton("Drafts").dataset.selected).toBe("true");

    rerender({ highlightedRelativePath: null });
    await settleReveal();

    expect(entryButton("Drafts").dataset.selected).toBe("true");
  });

  it("ignores a late reveal folder load after a project switch", async () => {
    const draftsLoad = deferred<ListFileExplorerChildrenResult>();
    let draftsCalls = 0;
    const listFileExplorerChildren = vi.fn((directoryRelativePath: string | null) => {
      if (directoryRelativePath === "Drafts") {
        draftsCalls += 1;
        if (draftsCalls === 1) {
          return draftsLoad.promise;
        }
      }
      return revealList(directoryRelativePath);
    });
    const switchedProject: PergamumProject = {
      ...project,
      rootPath: "C:\\Other",
      activeProjectFilePath: "C:\\Other\\Other.pergamum",
      name: "Other"
    };

    const { rerender } = renderReveal({
      listFileExplorerChildren,
      highlightedRelativePath: "Drafts/Chapter1/scene-03.md"
    });
    await settleReveal();

    rerender({
      project: switchedProject,
      highlightedRelativePath: null
    });
    await settleReveal();

    draftsLoad.resolve(
      ok("Drafts", [
        {
          kind: "file",
          name: "stale-scene.md",
          relativePath: "Drafts/stale-scene.md"
        }
      ])
    );
    await settleReveal();

    expect(container!.textContent).toContain("Other");
    expect(container!.textContent).not.toContain("stale-scene.md");
  });

  it("ignores a late reveal folder load after the project is closed", async () => {
    const draftsLoad = deferred<ListFileExplorerChildrenResult>();
    let draftsCalls = 0;
    const listFileExplorerChildren = vi.fn((directoryRelativePath: string | null) => {
      if (directoryRelativePath === "Drafts") {
        draftsCalls += 1;
        if (draftsCalls === 1) {
          return draftsLoad.promise;
        }
      }
      return revealList(directoryRelativePath);
    });

    const { rerender } = renderReveal({
      listFileExplorerChildren,
      highlightedRelativePath: "Drafts/Chapter1/scene-03.md"
    });
    await settleReveal();

    rerender({ project: null, highlightedRelativePath: null });
    await settleReveal();

    draftsLoad.resolve(
      ok("Drafts", [
        {
          kind: "file",
          name: "stale-scene.md",
          relativePath: "Drafts/stale-scene.md"
        }
      ])
    );
    await settleReveal();

    expect(container!.textContent).toContain("explorer.noProject");
    expect(container!.textContent).not.toContain("stale-scene.md");
  });

  it("keeps the #307 create target on the selected folder while another document is highlighted as active", async () => {
    const createFileExplorerMarkdownFile = vi.fn(
      async (): Promise<CreateFileExplorerEntryResult> => ({
        ok: true,
        entry: {
          kind: "file",
          name: "chapter-02.md",
          relativePath: "Drafts/chapter-02.md"
        }
      })
    );
    const { rerender } = renderReveal({
      highlightedRelativePath: null,
      createFileExplorerMarkdownFile
    });
    await settleReveal();

    act(() => entryButton("Drafts").click());
    await settleReveal();

    rerender({ highlightedRelativePath: "chapter-01.md" });
    await settleReveal();
    expect(entryButton("chapter-01.md").getAttribute("aria-current")).toBe(
      "page"
    );

    act(() => toolbarButton("explorer.newFile").click());
    typeDialogName("chapter-02");
    await act(async () => {
      container!
        .querySelector<HTMLButtonElement>(".nameInputDialogPrimary")!
        .click();
    });
    await settleReveal();

    expect(createFileExplorerMarkdownFile).toHaveBeenCalledWith(
      "Drafts",
      "chapter-02"
    );
  });
});

describe("scrollFileExplorerActiveDocumentIntoView (#311)", () => {
  it("uses a conservative, non-focusing scroll and tolerates a null target", () => {
    const scrollIntoView = vi.fn();
    scrollFileExplorerActiveDocumentIntoView({ scrollIntoView });
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest"
    });

    expect(() =>
      scrollFileExplorerActiveDocumentIntoView(null)
    ).not.toThrow();
  });
});

describe("FileExplorer context polish (#311)", () => {
  const rootEntries311: FileExplorerEntry[] = [
    { kind: "folder", name: "Drafts", relativePath: "Drafts" },
    { kind: "file", name: "chapter-01.md", relativePath: "chapter-01.md" }
  ];
  const draftsChildren311: FileExplorerEntry[] = [
    { kind: "folder", name: "Chapter1", relativePath: "Drafts/Chapter1" },
    { kind: "file", name: "outline.md", relativePath: "Drafts/outline.md" }
  ];
  const chapter1Children311: FileExplorerEntry[] = [
    {
      kind: "file",
      name: "scene-03.md",
      relativePath: "Drafts/Chapter1/scene-03.md"
    }
  ];

  function list311(
    directoryRelativePath: string | null
  ): Promise<ListFileExplorerChildrenResult> {
    switch (directoryRelativePath) {
      case null:
        return Promise.resolve(ok(null, rootEntries311));
      case "Drafts":
        return Promise.resolve(ok("Drafts", draftsChildren311));
      case "Drafts/Chapter1":
        return Promise.resolve(ok("Drafts/Chapter1", chapter1Children311));
      default:
        return Promise.resolve(ok(directoryRelativePath, []));
    }
  }

  async function settle(): Promise<void> {
    for (let i = 0; i < 6; i += 1) {
      await flushPromises();
    }
  }

  let hadScrollIntoView = false;
  let originalScrollIntoView:
    | typeof HTMLElement.prototype.scrollIntoView
    | undefined;
  let scrollSpy: ReturnType<typeof vi.fn>;
  let scrolledTargets: { element: Element; options: unknown }[] = [];

  function installScrollSpy(): void {
    hadScrollIntoView = "scrollIntoView" in HTMLElement.prototype;
    originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    scrolledTargets = [];
    scrollSpy = vi.fn(function (this: Element, options?: unknown) {
      scrolledTargets.push({ element: this, options });
    });
    HTMLElement.prototype.scrollIntoView =
      scrollSpy as unknown as typeof HTMLElement.prototype.scrollIntoView;
  }

  afterEach(() => {
    if (!scrollSpy) {
      return;
    }
    if (hadScrollIntoView && originalScrollIntoView) {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    } else {
      delete (HTMLElement.prototype as { scrollIntoView?: unknown })
        .scrollIntoView;
    }
    originalScrollIntoView = undefined;
    scrollSpy = undefined as unknown as ReturnType<typeof vi.fn>;
  });

  function render311(options?: {
    highlightedRelativePath?: string | null;
    listFileExplorerChildren?: (
      directoryRelativePath: string | null
    ) => Promise<ListFileExplorerChildrenResult>;
  }): {
    createFileExplorerFolder: ReturnType<typeof vi.fn>;
    createFileExplorerMarkdownFile: ReturnType<typeof vi.fn>;
    rerender: (highlightedRelativePath: string | null) => void;
  } {
    const createFileExplorerMarkdownFile = vi.fn(
      async (): Promise<CreateFileExplorerEntryResult> => ({
        ok: true,
        entry: { kind: "file", name: "new.md", relativePath: "new.md" }
      })
    );
    const createFileExplorerFolder = vi.fn(
      async (): Promise<CreateFileExplorerEntryResult> => ({
        ok: true,
        entry: { kind: "folder", name: "New", relativePath: "New" }
      })
    );

    Object.defineProperty(window, "pergamum", {
      configurable: true,
      value: {
        projects: {
          listFileExplorerChildren: vi.fn(
            options?.listFileExplorerChildren ?? list311
          ),
          createFileExplorerMarkdownFile,
          createFileExplorerFolder
        }
      }
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    let currentHighlight: string | null =
      options?.highlightedRelativePath ?? null;

    const paint = (): void => {
      act(() => {
        root!.render(
          React.createElement(FileExplorer, {
            project,
            highlightedRelativePath: currentHighlight,
            translate,
            onActivateDocument: vi.fn()
          })
        );
      });
    };

    paint();

    return {
      createFileExplorerFolder,
      createFileExplorerMarkdownFile,
      rerender: (highlightedRelativePath) => {
        currentHighlight = highlightedRelativePath;
        paint();
      }
    };
  }

  function contextValueText(): string | null {
    return (
      container!.querySelector(".nameInputDialogContextValue")?.textContent ??
      null
    );
  }

  // ---- 1. Create target display ----

  it("New File dialog shows Project root when nothing is selected", async () => {
    installScrollSpy();
    render311();
    await settle();

    act(() => toolbarButton("explorer.newFile").click());

    expect(
      container!.querySelector(".nameInputDialogContextLabel")?.textContent
    ).toBe("explorer.create.target.label");
    expect(contextValueText()).toBe("explorer.create.target.projectRoot");
  });

  it("New File dialog shows the selected folder path", async () => {
    installScrollSpy();
    render311();
    await settle();

    act(() => entryButton("Drafts").click());
    act(() => toolbarButton("explorer.newFile").click());

    expect(contextValueText()).toBe("Drafts");
  });

  it("New File dialog shows the selected file's parent folder path", async () => {
    installScrollSpy();
    render311();
    await settle();

    act(() => entryButton("Drafts").click());
    await settle();
    act(() => entryButton("Drafts/outline.md").click());
    act(() => toolbarButton("explorer.newFile").click());

    expect(contextValueText()).toBe("Drafts");
  });

  it("New Folder dialog uses the same create-target display rules", async () => {
    installScrollSpy();
    render311();
    await settle();

    act(() => entryButton("Drafts").click());
    act(() => toolbarButton("explorer.newFolder").click());

    expect(contextValueText()).toBe("Drafts");
  });

  it("shows a project-relative target only — never an absolute path", async () => {
    installScrollSpy();
    render311();
    await settle();

    act(() => entryButton("Drafts").click());
    await settle();
    act(() => entryButton("Drafts/Chapter1").click());
    await settle();
    act(() => toolbarButton("explorer.newFile").click());

    const value = contextValueText() ?? "";
    expect(value).toBe("Drafts/Chapter1");
    expect(value).not.toContain(project.rootPath);
    expect(value).not.toContain("\\");
    expect(value).not.toMatch(/^[A-Za-z]:/);
  });

  it("renders the create target only as caller-provided dialog context", async () => {
    installScrollSpy();
    render311();
    await settle();

    act(() => toolbarButton("explorer.newFile").click());

    const context = container!.querySelector(".nameInputDialogContext");
    expect(context).not.toBeNull();
    // The dialog shows exactly the label + value the caller passed.
    expect(context!.textContent).toBe(
      "explorer.create.target.labelexplorer.create.target.projectRoot"
    );
  });

  // ---- 2. Scroll active document into view ----

  it("scrolls the active project document entry into view after reveal", async () => {
    installScrollSpy();
    render311({ highlightedRelativePath: "chapter-01.md" });
    await settle();

    expect(scrollSpy).toHaveBeenCalled();
    const scrolledOn = scrolledTargets.at(-1)?.element as HTMLElement;
    expect(scrolledOn.dataset.fileExplorerEntryPath).toBe("chapter-01.md");
  });

  it("scrolls a nested active project document into view after lazy ancestor expansion", async () => {
    installScrollSpy();
    render311({ highlightedRelativePath: "Drafts/Chapter1/scene-03.md" });
    await settle();

    expect(entryButton("Drafts/Chapter1/scene-03.md")).toBeInstanceOf(
      HTMLButtonElement
    );
    expect(scrollSpy).toHaveBeenCalled();
    const scrolledOn = scrolledTargets.at(-1)?.element as HTMLElement;
    expect(scrolledOn.dataset.fileExplorerEntryPath).toBe(
      "Drafts/Chapter1/scene-03.md"
    );
  });

  it("uses conservative scroll options for an already-visible active document", async () => {
    installScrollSpy();
    render311({ highlightedRelativePath: "chapter-01.md" });
    await settle();

    expect(scrolledTargets.at(-1)?.options).toEqual({
      block: "nearest",
      inline: "nearest"
    });
  });

  it("does not scroll for a non-project active editor", async () => {
    installScrollSpy();
    render311({ highlightedRelativePath: null });
    await settle();

    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it("does not change the File Explorer selection when scrolling the active document", async () => {
    installScrollSpy();
    const { rerender } = render311({ highlightedRelativePath: null });
    await settle();

    act(() => entryButton("Drafts").click());
    await settle();
    expect(entryButton("Drafts").dataset.selected).toBe("true");

    rerender("chapter-01.md");
    await settle();

    expect(scrollSpy).toHaveBeenCalled();
    expect(entryButton("Drafts").dataset.selected).toBe("true");
    expect(entryButton("chapter-01.md").dataset.selected).toBeUndefined();
  });
});

describe("FileExplorer Command Palette create request (#311)", () => {
  interface CreateRequestHarness {
    createMarkdownFile: ReturnType<typeof vi.fn>;
    createFolder: ReturnType<typeof vi.fn>;
    onActivateDocument: ReturnType<typeof vi.fn>;
    onCreateEntryRequestHandled: ReturnType<typeof vi.fn>;
    rerender: (
      request: { kind: "file" | "folder"; token: number } | null
    ) => void;
  }

  function renderWithCreateRequest(
    initialRequest: { kind: "file" | "folder"; token: number } | null,
    createMarkdownFile = vi.fn(
      async (): Promise<CreateFileExplorerEntryResult> => ({
        ok: true,
        entry: { kind: "file", name: "new.md", relativePath: "new.md" }
      })
    ),
    createFolder = vi.fn(
      async (): Promise<CreateFileExplorerEntryResult> => ({
        ok: true,
        entry: { kind: "folder", name: "New", relativePath: "New" }
      })
    )
  ): CreateRequestHarness {
    const listFileExplorerChildren = vi.fn(
      async (relativePath: string | null) => {
        if (relativePath === "Drafts") {
          return ok("Drafts", draftEntries);
        }
        return ok(null, rootEntries);
      }
    );
    const onActivateDocument = vi.fn();
    const onCreateEntryRequestHandled = vi.fn();

    Object.defineProperty(window, "pergamum", {
      configurable: true,
      value: {
        projects: {
          listFileExplorerChildren,
          createFileExplorerMarkdownFile: createMarkdownFile,
          createFileExplorerFolder: createFolder
        }
      }
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    let currentRequest = initialRequest;

    const paint = (): void => {
      act(() => {
        root!.render(
          React.createElement(FileExplorer, {
            project,
            highlightedRelativePath: null,
            translate,
            readOnly: false,
            clipboardAdapter: { writeText: vi.fn(async () => undefined) },
            createEntryRequest: currentRequest,
            onCreateEntryRequestHandled,
            onActivateDocument
          })
        );
      });
    };

    paint();

    return {
      createMarkdownFile,
      createFolder,
      onActivateDocument,
      onCreateEntryRequestHandled,
      rerender: (request) => {
        currentRequest = request;
        paint();
      }
    };
  }

  function dialogInput(): HTMLInputElement | null {
    return container!.querySelector<HTMLInputElement>(".nameInputDialogInput");
  }

  function typeName(value: string): void {
    act(() => {
      const field = dialogInput()!;
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;
      nativeSetter?.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("opens the shared New File dialog on a create-file request and marks it handled", async () => {
    const harness = renderWithCreateRequest({ kind: "file", token: 1 });
    await flushPromises();

    expect(dialogInput()).not.toBeNull();
    expect(container!.textContent).toContain("explorer.newFile.title");
    // #311 create target: no selection → project root.
    expect(
      container!.querySelector(".nameInputDialogContextValue")?.textContent
    ).toBe("explorer.create.target.projectRoot");
    expect(harness.onCreateEntryRequestHandled).toHaveBeenCalledTimes(1);
  });

  it("opens the shared New Folder dialog on a create-folder request", async () => {
    renderWithCreateRequest({ kind: "folder", token: 1 });
    await flushPromises();

    expect(dialogInput()).not.toBeNull();
    expect(container!.textContent).toContain("explorer.newFolder.title");
  });

  it("keeps the #307 create target rules — uses the current File Explorer selection", async () => {
    const harness = renderWithCreateRequest(null);
    await flushPromises();

    act(() => entryButton("Drafts").click());
    await flushPromises();

    harness.rerender({ kind: "file", token: 1 });
    await flushPromises();

    expect(
      container!.querySelector(".nameInputDialogContextValue")?.textContent
    ).toBe("Drafts");
  });

  it("submits through the same #307 create IPC and opens the new document", async () => {
    const createMarkdownFile = vi.fn(
      async (): Promise<CreateFileExplorerEntryResult> => ({
        ok: true,
        entry: {
          kind: "file",
          name: "chapter-09.md",
          relativePath: "chapter-09.md"
        }
      })
    );
    const harness = renderWithCreateRequest(
      { kind: "file", token: 1 },
      createMarkdownFile
    );
    await flushPromises();

    typeName("chapter-09");
    await act(async () => {
      container!
        .querySelector<HTMLButtonElement>(".nameInputDialogPrimary")!
        .click();
    });
    await flushPromises();

    expect(createMarkdownFile).toHaveBeenCalledWith(null, "chapter-09");
    expect(harness.onActivateDocument).toHaveBeenCalledWith("chapter-09.md");
    expect(dialogInput()).toBeNull();
  });

  it("re-opens the dialog only when the request token changes", async () => {
    const harness = renderWithCreateRequest({ kind: "file", token: 1 });
    await flushPromises();
    expect(dialogInput()).not.toBeNull();

    // Cancel the dialog.
    act(() => {
      const cancel = Array.from(
        container!.querySelectorAll<HTMLButtonElement>(".appDialogButton")
      ).find((button) => button.textContent === "common.cancel");
      cancel?.click();
    });
    expect(dialogInput()).toBeNull();

    // Same token → not re-opened.
    harness.rerender({ kind: "file", token: 1 });
    await flushPromises();
    expect(dialogInput()).toBeNull();

    // New token → re-opened.
    harness.rerender({ kind: "folder", token: 2 });
    await flushPromises();
    expect(dialogInput()).not.toBeNull();
    expect(container!.textContent).toContain("explorer.newFolder.title");
  });

  it("ignores a create request in a read-only project", async () => {
    const listFileExplorerChildren = vi.fn(async () => ok(null, rootEntries));
    Object.defineProperty(window, "pergamum", {
      configurable: true,
      value: { projects: { listFileExplorerChildren } }
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const onCreateEntryRequestHandled = vi.fn();

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
          createEntryRequest: { kind: "file", token: 1 },
          onCreateEntryRequestHandled,
          onActivateDocument: vi.fn()
        })
      );
    });
    await flushPromises();

    expect(dialogInput()).toBeNull();
    // The request is still consumed so it will not linger.
    expect(onCreateEntryRequestHandled).toHaveBeenCalledTimes(1);
  });
});
