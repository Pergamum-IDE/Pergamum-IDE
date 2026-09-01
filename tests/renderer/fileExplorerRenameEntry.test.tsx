// @vitest-environment happy-dom
//
// #362: File Explorer "Rename…" context-menu item + F2 shortcut. Both route
// into the existing #313 rename dialog / IPC flow; folder rename is now a
// subtree relocation that reuses the #338/#340 plural relocation pathway.
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  FileExplorerEntry,
  ListFileExplorerChildrenResult,
  PergamumProject,
  RenameFileExplorerEntryResult
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

interface Options {
  readOnly?: boolean;
  dirty?: string[];
  renameResult?: RenameFileExplorerEntryResult;
  renameImpl?: (...args: unknown[]) => Promise<RenameFileExplorerEntryResult>;
}
interface Harness {
  renameFileExplorerEntry: ReturnType<typeof vi.fn>;
  onProjectDocumentRenamed: ReturnType<typeof vi.fn>;
  onProjectDocumentsMoved: ReturnType<typeof vi.fn>;
  onRenameUnavailable: ReturnType<typeof vi.fn>;
  listFileExplorerChildren: ReturnType<typeof vi.fn>;
}

async function mount(options: Options = {}): Promise<Harness> {
  const listFileExplorerChildren = vi.fn(
    async (
      directoryRelativePath: string | null
    ): Promise<ListFileExplorerChildrenResult> => ({
      kind: "ok",
      directoryRelativePath,
      entries:
        directoryRelativePath === "Drafts"
          ? [{ kind: "file", name: "draft.md", relativePath: "Drafts/draft.md" }]
          : treeRoot
    })
  );
  const renameFileExplorerEntry = vi.fn(
    options.renameImpl ??
      (async (): Promise<RenameFileExplorerEntryResult> =>
        options.renameResult ?? {
          ok: true,
          oldRelativePath: "a.md",
          newEntry: { kind: "file", name: "a-2.md", relativePath: "a-2.md" },
          parentDirectoryRelativePath: null,
          movedProjectDocuments: [
            { oldRelativePath: "a.md", newRelativePath: "a-2.md" }
          ]
        })
  );
  const onProjectDocumentRenamed = vi.fn();
  const onProjectDocumentsMoved = vi.fn();
  const onRenameUnavailable = vi.fn();

  Object.defineProperty(window, "pergamum", {
    configurable: true,
    value: { projects: { listFileExplorerChildren, renameFileExplorerEntry } }
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
        dirtyProjectDocumentRelativePaths: options.dirty ?? [],
        isProjectDocumentDirty: (relativePath: string) =>
          (options.dirty ?? []).includes(relativePath),
        onProjectDocumentRenamed,
        onProjectDocumentsMoved,
        onRenameUnavailable
      })
    );
  });
  await flush();

  return {
    renameFileExplorerEntry,
    onProjectDocumentRenamed,
    onProjectDocumentsMoved,
    onRenameUnavailable,
    listFileExplorerChildren
  };
}

function entryButton(relativePath: string): HTMLButtonElement {
  return container!.querySelector<HTMLButtonElement>(
    `[data-file-explorer-entry-path="${relativePath}"]`
  )!;
}
function clickEntry(relativePath: string, mods: { ctrlKey?: boolean } = {}): void {
  act(() => {
    entryButton(relativePath).dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, ...mods })
    );
  });
}
function openMenu(relativePath: string): void {
  act(() => {
    entryButton(relativePath).dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
    );
  });
}
function menuItem(command: string): HTMLButtonElement | null {
  return container!.querySelector<HTMLButtonElement>(
    `[data-file-explorer-context-command="${command}"]`
  );
}
function clickMenu(command: string): void {
  act(() => {
    menuItem(command)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}
function tree(): HTMLElement {
  return container!.querySelector<HTMLElement>(".fileExplorerList")!;
}
function renameDialogInput(): HTMLInputElement | null {
  return container!.querySelector<HTMLInputElement>(".nameInputDialogInput");
}
function pressF2(
  init: { isComposing?: boolean; from?: EventTarget } = {}
): void {
  const event = new KeyboardEvent("keydown", {
    key: "F2",
    bubbles: true,
    cancelable: true
  });
  if (init.isComposing) {
    Object.defineProperty(event, "isComposing", { value: true });
  }
  act(() => {
    (init.from ?? tree()).dispatchEvent(event);
  });
}
function typeRename(value: string): void {
  act(() => {
    const field = renameDialogInput()!;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    setter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function submitRename(): Promise<void> {
  return act(async () => {
    container!
      .querySelector<HTMLButtonElement>(".nameInputDialogPrimary")!
      .click();
  });
}

describe("File Explorer Rename entry points (#362)", () => {
  describe("context menu", () => {
    it("shows Rename between Paste and Delete for file and folder rows", async () => {
      await mount();
      openMenu("a.md");
      const commands = [
        ...container!.querySelectorAll("[data-file-explorer-context-command]")
      ].map((el) => el.getAttribute("data-file-explorer-context-command"));
      expect(commands.indexOf("paste")).toBeLessThan(
        commands.indexOf("rename")
      );
      expect(commands.indexOf("rename")).toBeLessThan(
        commands.indexOf("delete")
      );
      expect(menuItem("rename")?.textContent).toBe(
        t("en", "explorer.contextMenu.rename")
      );

      openMenu("Drafts");
      expect(menuItem("rename")).not.toBeNull();
    });

    it("enables Rename for a single selected file / folder in a writable project", async () => {
      await mount();
      clickEntry("a.md");
      openMenu("a.md");
      expect(menuItem("rename")?.disabled).toBe(false);

      clickEntry("Drafts");
      openMenu("Drafts");
      expect(menuItem("rename")?.disabled).toBe(false);
    });

    it("disables Rename with no selection (empty-area right-click)", async () => {
      await mount();
      act(() =>
        tree().dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
        )
      );
      expect(menuItem("rename")?.disabled).toBe(true);
    });

    it("disables Rename for the project root", async () => {
      await mount();
      const rootRow = container!.querySelector<HTMLElement>(
        '[data-file-explorer-entry-kind="root"]'
      )!;
      act(() =>
        rootRow.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      );
      act(() =>
        rootRow.dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
        )
      );
      expect(menuItem("rename")?.disabled).toBe(true);
    });

    it("disables Rename for a multi-selection", async () => {
      await mount();
      clickEntry("a.md");
      clickEntry("b.md", { ctrlKey: true });
      openMenu("b.md");
      expect(menuItem("rename")?.disabled).toBe(true);
    });

    it("disables Rename in a read-only project", async () => {
      await mount({ readOnly: true });
      clickEntry("a.md");
      openMenu("a.md");
      expect(menuItem("rename")?.disabled).toBe(true);
    });

    it("disables Rename for a dirty open file", async () => {
      await mount({ dirty: ["a.md"] });
      clickEntry("a.md");
      openMenu("a.md");
      expect(menuItem("rename")?.disabled).toBe(true);
    });

    it("opens the rename dialog for a single file and for a single folder", async () => {
      await mount();
      clickEntry("a.md");
      openMenu("a.md");
      clickMenu("rename");
      expect(renameDialogInput()).not.toBeNull();
      expect(renameDialogInput()?.value).toBe("a.md");

      // close, then folder
      act(() =>
        container!
          .querySelector<HTMLButtonElement>(".nameInputDialogCancel, [data-name-input-dialog-cancel]")
          ?.click()
      );
      clickEntry("Drafts");
      openMenu("Drafts");
      clickMenu("rename");
      expect(renameDialogInput()?.value).toBe("Drafts");
    });
  });

  describe("F2", () => {
    it("opens the rename dialog for a selected file and folder", async () => {
      await mount();
      clickEntry("a.md");
      pressF2();
      expect(renameDialogInput()?.value).toBe("a.md");
    });

    it("opens the rename dialog for a selected folder", async () => {
      await mount();
      clickEntry("Drafts");
      pressF2();
      expect(renameDialogInput()?.value).toBe("Drafts");
    });

    it("is a no-op for no selection", async () => {
      const harness = await mount();
      pressF2();
      expect(renameDialogInput()).toBeNull();
      expect(harness.renameFileExplorerEntry).not.toHaveBeenCalled();
    });

    it("is a no-op for multi-selection", async () => {
      await mount();
      clickEntry("a.md");
      clickEntry("b.md", { ctrlKey: true });
      pressF2();
      expect(renameDialogInput()).toBeNull();
    });

    it("is a no-op for the project root", async () => {
      await mount();
      act(() =>
        container!
          .querySelector<HTMLElement>('[data-file-explorer-entry-kind="root"]')!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }))
      );
      pressF2();
      expect(renameDialogInput()).toBeNull();
    });

    it("is a no-op in a read-only project", async () => {
      await mount({ readOnly: true });
      clickEntry("a.md");
      pressF2();
      expect(renameDialogInput()).toBeNull();
    });

    it("is a no-op during IME composition and from an input element", async () => {
      await mount();
      clickEntry("a.md");
      pressF2({ isComposing: true });
      expect(renameDialogInput()).toBeNull();

      const input = document.createElement("input");
      tree().appendChild(input);
      pressF2({ from: input });
      expect(renameDialogInput()).toBeNull();
    });

    it("is a no-op while the rename dialog (a File Explorer modal) is open", async () => {
      const harness = await mount();
      clickEntry("a.md");
      pressF2();
      expect(renameDialogInput()).not.toBeNull();
      // a second F2 while the modal is open changes nothing / no extra IPC
      pressF2();
      typeRename("a-2");
      await submitRename();
      await flush();
      expect(harness.renameFileExplorerEntry).toHaveBeenCalledTimes(1);
    });
  });

  describe("rename execution", () => {
    it("renames a file through IPC (with the dirty list), refreshes the parent, selects it, relocates identity", async () => {
      const harness = await mount();
      clickEntry("a.md");
      pressF2();
      typeRename("a-2");
      await submitRename();
      await flush();

      expect(harness.renameFileExplorerEntry).toHaveBeenCalledWith(
        "a.md",
        "a-2",
        []
      );
      expect(harness.listFileExplorerChildren).toHaveBeenCalledWith(null);
      expect(harness.onProjectDocumentRenamed).toHaveBeenCalledWith("a.md", {
        kind: "file",
        name: "a-2.md",
        relativePath: "a-2.md"
      });
      expect(renameDialogInput()).toBeNull();
    });

    it("renames a folder subtree and relocates every open subtree document identity", async () => {
      const harness = await mount({
        renameResult: {
          ok: true,
          oldRelativePath: "Drafts",
          newEntry: {
            kind: "folder",
            name: "Renamed",
            relativePath: "Renamed"
          },
          parentDirectoryRelativePath: null,
          movedProjectDocuments: [
            { oldRelativePath: "Drafts/draft.md", newRelativePath: "Renamed/draft.md" },
            {
              oldRelativePath: "Drafts/sub/b.md",
              newRelativePath: "Renamed/sub/b.md"
            }
          ]
        }
      });
      clickEntry("Drafts");
      pressF2();
      typeRename("Renamed");
      await submitRename();
      await flush();

      expect(harness.renameFileExplorerEntry).toHaveBeenCalledWith(
        "Drafts",
        "Renamed",
        []
      );
      expect(harness.onProjectDocumentsMoved).toHaveBeenCalledWith([
        { oldRelativePath: "Drafts/draft.md", newRelativePath: "Renamed/draft.md" },
        {
          oldRelativePath: "Drafts/sub/b.md",
          newRelativePath: "Renamed/sub/b.md"
        }
      ]);
      expect(harness.onProjectDocumentRenamed).not.toHaveBeenCalled();
      // the parent directory of the renamed folder is refreshed
      expect(harness.listFileExplorerChildren).toHaveBeenCalledWith(null);
      expect(renameDialogInput()).toBeNull();
    });

    it("does not call the rename IPC when the folder subtree has a dirty open document", async () => {
      const harness = await mount({ dirty: ["Drafts/draft.md"] });
      clickEntry("Drafts");
      pressF2();

      // the pre-flight blocks the dialog and reports it
      expect(renameDialogInput()).toBeNull();
      expect(harness.renameFileExplorerEntry).not.toHaveBeenCalled();
      expect(harness.onRenameUnavailable).toHaveBeenCalledWith(
        t("en", "explorer.rename.error.openDocumentDirty")
      );
    });
  });
});
