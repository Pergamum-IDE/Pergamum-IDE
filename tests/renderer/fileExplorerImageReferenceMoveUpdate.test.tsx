// @vitest-environment happy-dom
//
// #414 (C2): every File Explorer move route hands the EXPLICITLY-selected
// supported image files (single / multiple / the images in a mixed selection —
// never a directory source, never .svg) to the pre-move image-reference
// confirmation hook, and applies the confirmed batch after the move lands.
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
  { kind: "folder", name: "assets", relativePath: "assets" },
  { kind: "file", name: "foo.png", relativePath: "foo.png" },
  { kind: "file", name: "bar.jpg", relativePath: "bar.jpg" },
  { kind: "file", name: "logo.svg", relativePath: "logo.svg" },
  { kind: "file", name: "a.md", relativePath: "a.md" }
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

interface HarnessOptions {
  prepareDecision?: "proceed" | "cancel";
  /** When set, `renameFileExplorerEntryPreflight` resolves `{ ok: false }`. */
  preflightReason?: string;
  /** `"throw"` → move IPC rejects; `"validation"` → move dry-run rejected. */
  moveOutcome?: "throw" | "validation";
}
interface Harness {
  moveFileExplorerEntries: ReturnType<typeof vi.fn>;
  renameFileExplorerEntry: ReturnType<typeof vi.fn>;
  renameFileExplorerEntryPreflight: ReturnType<typeof vi.fn>;
  onPrepareImageReferenceMoves: ReturnType<typeof vi.fn>;
  onApplyMoveImageRewrites: ReturnType<typeof vi.fn>;
  onClearMoveImageRewrites: ReturnType<typeof vi.fn>;
  onPrepareMarkdownDocumentMoves: ReturnType<typeof vi.fn>;
  onRenameUnavailable: ReturnType<typeof vi.fn>;
}

async function mount(options: HarnessOptions = {}): Promise<Harness> {
  const listFileExplorerChildren = vi.fn(
    async (
      directoryRelativePath: string | null
    ): Promise<ListFileExplorerChildrenResult> => ({
      kind: "ok",
      directoryRelativePath,
      entries:
        directoryRelativePath === "Drafts"
          ? [{ kind: "file", name: "x.md", relativePath: "Drafts/x.md" }]
          : directoryRelativePath === "assets"
            ? [{ kind: "file", name: "old.png", relativePath: "assets/old.png" }]
            : treeRoot
    })
  );
  const moveFileExplorerEntries = vi.fn(async (request: unknown) => {
    const { sourceRelativePaths, destinationFolderRelativePath } = request as {
      sourceRelativePaths: string[];
      destinationFolderRelativePath: string;
    };
    if (options.moveOutcome === "throw") {
      throw new Error("move IPC failed");
    }
    if (options.moveOutcome === "validation") {
      return {
        kind: "completed",
        result: {
          ok: false,
          validation: {
            ok: false,
            errors: [{ reason: "destination-conflict", sourceRelativePath: null }]
          },
          results: [],
          successfulPathPairs: []
        }
      };
    }
    return {
      kind: "completed",
      result: {
        ok: true,
        validation: { ok: true },
        results: sourceRelativePaths.map((sourceRelativePath) => {
          const name =
            sourceRelativePath.split("/").pop() ?? sourceRelativePath;
          const destinationRelativePath =
            destinationFolderRelativePath === ""
              ? name
              : `${destinationFolderRelativePath}/${name}`;
          return {
            status: "moved",
            sourceRelativePath,
            destinationRelativePath,
            sourceAbsolutePath: `C:/Novel/${sourceRelativePath}`,
            destinationAbsolutePath: `C:/Novel/${destinationRelativePath}`,
            isDirectory: false,
            movedProjectDocuments: []
          };
        }),
        successfulPathPairs: []
      }
    };
  });
  const statFileExplorerEntries = vi.fn(async () => ({
    kind: "ok",
    entries: []
  }));
  const resolveRename = (sourceRelativePath: string, newName: string) => {
    const dot = sourceRelativePath.lastIndexOf(".");
    const ext = dot === -1 ? "" : sourceRelativePath.slice(dot);
    const slash = sourceRelativePath.lastIndexOf("/");
    const dir = slash === -1 ? "" : sourceRelativePath.slice(0, slash + 1);
    const finalName = newName.includes(".") ? newName : `${newName}${ext}`;
    return { finalName, newRelativePath: `${dir}${finalName}`, dir, slash };
  };
  const renameFileExplorerEntryPreflight = vi.fn(
    async (sourceRelativePath: string, newName: string) => {
      if (options.preflightReason) {
        return { ok: false, reason: options.preflightReason };
      }
      const { finalName, newRelativePath } = resolveRename(
        sourceRelativePath,
        newName
      );
      return {
        ok: true,
        oldRelativePath: sourceRelativePath,
        newRelativePath,
        newName: finalName,
        entryKind: "file"
      };
    }
  );
  const renameFileExplorerEntry = vi.fn(
    async (sourceRelativePath: string, newName: string) => {
      const { finalName, newRelativePath, dir, slash } = resolveRename(
        sourceRelativePath,
        newName
      );
      return {
        ok: true,
        oldRelativePath: sourceRelativePath,
        newEntry: {
          kind: "file",
          name: finalName,
          relativePath: newRelativePath
        },
        parentDirectoryRelativePath: slash === -1 ? null : dir.slice(0, -1),
        movedProjectDocuments: []
      };
    }
  );
  const onPrepareImageReferenceMoves = vi.fn(
    async () => options.prepareDecision ?? "proceed"
  );
  const onApplyMoveImageRewrites = vi.fn();
  const onClearMoveImageRewrites = vi.fn();
  const onPrepareMarkdownDocumentMoves = vi.fn(
    async (): Promise<"proceed" | "cancel"> => "proceed"
  );
  const onRenameUnavailable = vi.fn();

  Object.defineProperty(window, "pergamum", {
    configurable: true,
    value: {
      projects: {
        listFileExplorerChildren,
        moveFileExplorerEntries,
        statFileExplorerEntries,
        renameFileExplorerEntry,
        renameFileExplorerEntryPreflight
      }
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
        readOnly: false,
        onActivateDocument: vi.fn(),
        dirtyProjectDocumentRelativePaths: [],
        onMoveResultMessage: vi.fn(),
        onProjectDocumentsMoved: vi.fn(),
        onPrepareMarkdownDocumentMoves,
        onPrepareImageReferenceMoves,
        onApplyMoveImageRewrites,
        onClearMoveImageRewrites,
        onRenameUnavailable
      })
    );
  });
  await flush();

  return {
    moveFileExplorerEntries,
    renameFileExplorerEntry,
    renameFileExplorerEntryPreflight,
    onPrepareImageReferenceMoves,
    onApplyMoveImageRewrites,
    onClearMoveImageRewrites,
    onPrepareMarkdownDocumentMoves,
    onRenameUnavailable
  };
}

function entryButton(relativePath: string): HTMLButtonElement {
  return container!.querySelector<HTMLButtonElement>(
    `[data-file-explorer-entry-path="${relativePath}"]`
  )!;
}
function makeDragEvent(type: string, dataTransfer?: DataTransfer): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    configurable: true,
    value: dataTransfer ?? new window.DataTransfer()
  });
  return event;
}
async function dragDrop(sourcePath: string, targetPath: string): Promise<void> {
  const start = makeDragEvent("dragstart");
  act(() => {
    entryButton(sourcePath).dispatchEvent(start);
  });
  const dt = (start as unknown as { dataTransfer: DataTransfer }).dataTransfer;
  act(() => {
    entryButton(targetPath).dispatchEvent(makeDragEvent("dragover", dt));
  });
  act(() => {
    entryButton(targetPath).dispatchEvent(makeDragEvent("drop", dt));
  });
  await flush();
}
function click(selector: string): void {
  act(() => {
    container!
      .querySelector<HTMLButtonElement>(selector)!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
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

describe("#414 File Explorer D&D move — image-reference update hook", () => {
  it("hands a single image drop to the batch hook, then moves + applies", async () => {
    const harness = await mount({ prepareDecision: "proceed" });
    await dragDrop("foo.png", "Drafts");
    click(".fileExplorerDragDropMoveButton");
    await flush();

    expect(harness.onPrepareImageReferenceMoves).toHaveBeenCalledWith(
      [{ oldProjectRelativePath: "foo.png", newProjectRelativePath: "Drafts/foo.png" }],
      []
    );
    expect(harness.moveFileExplorerEntries).toHaveBeenCalledWith({
      sourceRelativePaths: ["foo.png"],
      destinationFolderRelativePath: "Drafts",
      dirtyProjectDocumentRelativePaths: []
    });
    expect(harness.onApplyMoveImageRewrites).toHaveBeenCalledWith({
      // `collectMovedProjectDocumentRelocations` lists every moved file;
      // the App merge keys C1 plans by md-doc path so a stray image entry
      // here is harmless.
      relocations: [
        { oldRelativePath: "foo.png", newRelativePath: "Drafts/foo.png" }
      ],
      completedImageMoves: [
        {
          oldProjectRelativePath: "foo.png",
          newProjectRelativePath: "Drafts/foo.png"
        }
      ]
    });
  });

  it("hands EVERY selected image of a multi-drop to the batch hook", async () => {
    const harness = await mount({ prepareDecision: "proceed" });
    clickEntry("foo.png");
    clickEntry("bar.jpg", { ctrlKey: true });
    await dragDrop("foo.png", "Drafts");
    click(".fileExplorerDragDropMoveButton");
    await flush();

    expect(harness.onPrepareImageReferenceMoves).toHaveBeenCalledWith(
      [
        { oldProjectRelativePath: "bar.jpg", newProjectRelativePath: "Drafts/bar.jpg" },
        { oldProjectRelativePath: "foo.png", newProjectRelativePath: "Drafts/foo.png" }
      ],
      []
    );
  });

  it("hands only the images of a mixed selection to C2 (and only the md to C1)", async () => {
    const harness = await mount({ prepareDecision: "proceed" });
    clickEntry("foo.png");
    clickEntry("a.md", { ctrlKey: true });
    await dragDrop("foo.png", "Drafts");
    click(".fileExplorerDragDropMoveButton");
    await flush();

    // C2 gets the images + is told which docs move in the same operation.
    expect(harness.onPrepareImageReferenceMoves).toHaveBeenCalledWith(
      [
        {
          oldProjectRelativePath: "foo.png",
          newProjectRelativePath: "Drafts/foo.png"
        }
      ],
      [{ oldProjectRelativePath: "a.md", newProjectRelativePath: "Drafts/a.md" }]
    );
    // C1 gets the docs + is told which images move in the same operation.
    expect(harness.onPrepareMarkdownDocumentMoves).toHaveBeenCalledWith(
      [{ oldProjectRelativePath: "a.md", newProjectRelativePath: "Drafts/a.md" }],
      [
        {
          oldProjectRelativePath: "foo.png",
          newProjectRelativePath: "Drafts/foo.png"
        }
      ]
    );
  });

  it("aborts the drop move when the C2 hook returns cancel", async () => {
    const harness = await mount({ prepareDecision: "cancel" });
    await dragDrop("foo.png", "Drafts");
    click(".fileExplorerDragDropMoveButton");
    await flush();

    expect(harness.onPrepareImageReferenceMoves).toHaveBeenCalledTimes(1);
    expect(harness.moveFileExplorerEntries).not.toHaveBeenCalled();
    expect(harness.onApplyMoveImageRewrites).not.toHaveBeenCalled();
  });

  it("does not fire for a directory drop move", async () => {
    const harness = await mount();
    await dragDrop("assets", "Drafts");
    click(".fileExplorerDragDropMoveButton");
    await flush();

    expect(harness.onPrepareImageReferenceMoves).not.toHaveBeenCalled();
    expect(harness.moveFileExplorerEntries).toHaveBeenCalled();
  });

  it("does not fire for an unsupported image (.svg) drop move", async () => {
    const harness = await mount();
    await dragDrop("logo.svg", "Drafts");
    click(".fileExplorerDragDropMoveButton");
    await flush();

    expect(harness.onPrepareImageReferenceMoves).not.toHaveBeenCalled();
    expect(harness.moveFileExplorerEntries).toHaveBeenCalled();
  });
});

describe("#414 P1-1 — a staged batch is dropped on every non-landing path", () => {
  it("C2 cancel clears the staged batch (and never applies)", async () => {
    const harness = await mount({ prepareDecision: "cancel" });
    await dragDrop("foo.png", "Drafts");
    click(".fileExplorerDragDropMoveButton");
    await flush();

    expect(harness.onClearMoveImageRewrites).toHaveBeenCalled();
    expect(harness.moveFileExplorerEntries).not.toHaveBeenCalled();
    expect(harness.onApplyMoveImageRewrites).not.toHaveBeenCalled();
  });

  it("a move IPC throw clears the staged batch", async () => {
    const harness = await mount({
      prepareDecision: "proceed",
      moveOutcome: "throw"
    });
    await dragDrop("foo.png", "Drafts");
    click(".fileExplorerDragDropMoveButton");
    await flush();

    expect(harness.onClearMoveImageRewrites).toHaveBeenCalled();
    expect(harness.onApplyMoveImageRewrites).not.toHaveBeenCalled();
  });

  it("a move validation failure (nothing moved) clears the staged batch", async () => {
    const harness = await mount({
      prepareDecision: "proceed",
      moveOutcome: "validation"
    });
    await dragDrop("foo.png", "Drafts");
    click(".fileExplorerDragDropMoveButton");
    await flush();

    expect(harness.onClearMoveImageRewrites).toHaveBeenCalled();
    expect(harness.onApplyMoveImageRewrites).not.toHaveBeenCalled();
  });

  it("a successful move consumes the batch via apply, NOT clear", async () => {
    const harness = await mount({ prepareDecision: "proceed" });
    await dragDrop("foo.png", "Drafts");
    click(".fileExplorerDragDropMoveButton");
    await flush();

    expect(harness.onApplyMoveImageRewrites).toHaveBeenCalledTimes(1);
    expect(harness.onClearMoveImageRewrites).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// #414 P0-1: image-file RENAME (F2 / context menu) goes through the same C2
// pre-rename confirmation + post-rename apply.
// ---------------------------------------------------------------------------

function renameDialogInput(): HTMLInputElement | null {
  return container!.querySelector<HTMLInputElement>(".nameInputDialogInput");
}
function pressF2(): void {
  act(() => {
    container!
      .querySelector<HTMLElement>(".fileExplorerList")!
      .dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "F2",
          bubbles: true,
          cancelable: true
        })
      );
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
async function submitRenameDialog(): Promise<void> {
  await act(async () => {
    container!
      .querySelector<HTMLButtonElement>(".nameInputDialogPrimary")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}
function renameDialogDescription(): string {
  return (
    container!.querySelector<HTMLElement>(".nameInputDialogDescription")
      ?.textContent ?? ""
  );
}
function renameDialogError(): string {
  return (
    container!.querySelector<HTMLElement>(".nameInputDialogError")?.textContent ??
    ""
  );
}

describe("#414 P0-1 File Explorer image-file rename — C2 flow", () => {
  it("F2 opens a rename dialog for a supported image file", async () => {
    const harness = await mount();
    clickEntry("foo.png");
    pressF2();
    expect(renameDialogInput()).not.toBeNull();
    expect(harness.onRenameUnavailable).not.toHaveBeenCalled();
  });

  it("does not show Markdown-fixed wording for an image rename", async () => {
    await mount();
    clickEntry("foo.png");
    pressF2();
    const description = renameDialogDescription();
    expect(description).not.toMatch(/Markdown/i);
    // Generic file wording covering the extension-kept behaviour.
    expect(description.toLowerCase()).toContain("file name");
    expect(description.toLowerCase()).toContain("extension");
  });

  it("shows an invalid-character error for `100<>.png`, and never runs the rename", async () => {
    const harness = await mount();
    clickEntry("foo.png");
    pressF2();
    typeRename("100<>.png");
    await submitRenameDialog();

    expect(renameDialogError()).toBe(
      "The file name contains characters that cannot be used."
    );
    // No filesystem rename, no C2 planning — the invalid name never gets past
    // validation.
    expect(harness.renameFileExplorerEntry).not.toHaveBeenCalled();
    expect(harness.onPrepareImageReferenceMoves).not.toHaveBeenCalled();
  });

  it("F2 is unavailable for an unsupported image (.svg)", async () => {
    const harness = await mount();
    clickEntry("logo.svg");
    pressF2();
    expect(renameDialogInput()).toBeNull();
    expect(harness.onRenameUnavailable).toHaveBeenCalled();
  });

  it("dry-runs, THEN confirms, THEN renames, THEN applies (update)", async () => {
    const harness = await mount({ prepareDecision: "proceed" });
    clickEntry("foo.png");
    pressF2();
    typeRename("bar");
    await submitRenameDialog();

    expect(harness.onPrepareImageReferenceMoves).toHaveBeenCalledWith(
      [
        {
          oldProjectRelativePath: "foo.png",
          newProjectRelativePath: "bar.png"
        }
      ],
      []
    );
    // Order: preflight → C2 confirmation → real rename IPC.
    const preflightOrder =
      harness.renameFileExplorerEntryPreflight.mock.invocationCallOrder[0];
    const confirmOrder =
      harness.onPrepareImageReferenceMoves.mock.invocationCallOrder[0];
    const renameOrder =
      harness.renameFileExplorerEntry.mock.invocationCallOrder[0];
    expect(preflightOrder).toBeLessThan(confirmOrder);
    expect(confirmOrder).toBeLessThan(renameOrder);
    expect(harness.renameFileExplorerEntry).toHaveBeenCalledWith(
      "foo.png",
      "bar",
      []
    );
    expect(harness.onApplyMoveImageRewrites).toHaveBeenCalledWith({
      relocations: [],
      completedImageMoves: [
        { oldProjectRelativePath: "foo.png", newProjectRelativePath: "bar.png" }
      ]
    });
  });

  it("C2 cancel aborts the rename (dry-run ran, no rename IPC, no apply)", async () => {
    const harness = await mount({ prepareDecision: "cancel" });
    clickEntry("foo.png");
    pressF2();
    typeRename("bar");
    await submitRenameDialog();

    expect(harness.renameFileExplorerEntryPreflight).toHaveBeenCalledTimes(1);
    expect(harness.onPrepareImageReferenceMoves).toHaveBeenCalledTimes(1);
    expect(harness.renameFileExplorerEntry).not.toHaveBeenCalled();
    expect(harness.onApplyMoveImageRewrites).not.toHaveBeenCalled();
  });

  it.each([
    ["samePath", "Enter a different name."],
    [
      "invalidCharacter",
      "The file name contains characters that cannot be used."
    ],
    [
      "unsupportedExtension",
      "That extension can't be used for this file. Omit the extension to keep the current extension."
    ],
    ["alreadyExists", "A file or folder with this name already exists."]
  ])(
    "a dry-run failure (%s) shows an inline error and NEVER opens the C2 dialog",
    async (reason, message) => {
      const harness = await mount({ preflightReason: reason });
      clickEntry("foo.png");
      pressF2();
      typeRename("whatever");
      await submitRenameDialog();

      expect(renameDialogError()).toBe(message);
      expect(harness.onPrepareImageReferenceMoves).not.toHaveBeenCalled();
      expect(harness.renameFileExplorerEntry).not.toHaveBeenCalled();
      expect(harness.onApplyMoveImageRewrites).not.toHaveBeenCalled();
    }
  );

  it("an unsupported-extension error for an image rename is not Markdown-worded", async () => {
    const harness = await mount({ preflightReason: "unsupportedExtension" });
    clickEntry("foo.png");
    pressF2();
    typeRename("foo.tiff");
    await submitRenameDialog();

    const error = renameDialogError();
    expect(error).not.toMatch(/Markdown/i);
    expect(error).not.toMatch(/\.md\b/);
    expect(error).toContain("extension");
    expect(harness.onPrepareImageReferenceMoves).not.toHaveBeenCalled();
    expect(harness.renameFileExplorerEntry).not.toHaveBeenCalled();
  });

  it("a dry-run failure never rolls a pending C2 batch forward to the next move", async () => {
    const harness = await mount({ preflightReason: "alreadyExists" });
    clickEntry("foo.png");
    pressF2();
    typeRename("bar");
    await submitRenameDialog();
    // No C2 planning → nothing staged → the later D&D move applies nothing stale.
    expect(harness.onPrepareImageReferenceMoves).not.toHaveBeenCalled();
  });

  it("an actual-rename failure does not apply C2 and clears the pending batch", async () => {
    const harness = await mount({ prepareDecision: "proceed" });
    // Preflight says OK, but the real rename fails (TOCTOU).
    harness.renameFileExplorerEntry.mockResolvedValueOnce({
      ok: false,
      reason: "alreadyExists"
    });
    clickEntry("foo.png");
    pressF2();
    typeRename("bar");
    await submitRenameDialog();

    expect(harness.onPrepareImageReferenceMoves).toHaveBeenCalledTimes(1);
    expect(harness.renameFileExplorerEntry).toHaveBeenCalledTimes(1);
    // No apply — the rename did not land — and the batch was dropped.
    expect(harness.onApplyMoveImageRewrites).not.toHaveBeenCalled();
    expect(harness.onClearMoveImageRewrites).toHaveBeenCalled();
    expect(renameDialogError()).toBe(
      "A file or folder with this name already exists."
    );
  });

  it("a preflight failure clears the pending batch (and never opens C2)", async () => {
    const harness = await mount({ preflightReason: "alreadyExists" });
    clickEntry("foo.png");
    pressF2();
    typeRename("bar");
    await submitRenameDialog();

    expect(harness.onClearMoveImageRewrites).toHaveBeenCalled();
    expect(harness.onPrepareImageReferenceMoves).not.toHaveBeenCalled();
    expect(harness.renameFileExplorerEntry).not.toHaveBeenCalled();
  });

  it("a C2 cancel on the rename path clears the pending batch", async () => {
    const harness = await mount({ prepareDecision: "cancel" });
    clickEntry("foo.png");
    pressF2();
    typeRename("bar");
    await submitRenameDialog();

    expect(harness.onClearMoveImageRewrites).toHaveBeenCalled();
    expect(harness.renameFileExplorerEntry).not.toHaveBeenCalled();
  });
});
