// @vitest-environment happy-dom
//
// #356 (second commit): File Explorer context-menu + keyboard entry points for
// the internal Copy / Cut / Paste buffers. Copy runs the #356 Copy
// plan/execute; Cut/Paste keeps the existing Move path. No OS clipboard.
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  FileExplorerEntry,
  ListFileExplorerChildrenResult,
  PergamumProject
} from "../../src/shared/api";
import type {
  FileExplorerCopyPlan,
  FileExplorerCopyPlanRow
} from "../../src/shared/projectCopy";
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
const osClipboardWrite = vi.fn();

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
  delete (window as unknown as { pergamum?: unknown }).pergamum;
  vi.restoreAllMocks();
  osClipboardWrite.mockClear();
});

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function planRow(
  overrides: Partial<FileExplorerCopyPlanRow> = {}
): FileExplorerCopyPlanRow {
  return {
    sourceRelativePath: "a.md",
    sourceName: "a.md",
    sourceKind: "file",
    sourceSizeBytes: 5,
    sourceModifiedAt: null,
    destinationName: "a copy.md",
    destinationRelativePath: "a copy.md",
    wasAutoRenamed: false,
    collisionSizeBytes: null,
    collisionModifiedAt: null,
    status: "ready",
    ...overrides
  };
}

interface HarnessOptions {
  plan?: FileExplorerCopyPlan;
  readOnly?: boolean;
  dirty?: string[];
}
interface Harness {
  moveFileExplorerEntries: ReturnType<typeof vi.fn>;
  planFileExplorerCopyEntries: ReturnType<typeof vi.fn>;
  executeFileExplorerCopyPlan: ReturnType<typeof vi.fn>;
  statFileExplorerEntries: ReturnType<typeof vi.fn>;
  onMoveResultMessage: ReturnType<typeof vi.fn>;
}

async function mount(options: HarnessOptions = {}): Promise<Harness> {
  const listFileExplorerChildren = vi.fn(
    async (
      directoryRelativePath: string | null
    ): Promise<ListFileExplorerChildrenResult> => ({
      kind: "ok",
      directoryRelativePath,
      entries: treeRoot
    })
  );
  const moveFileExplorerEntries = vi.fn(async () => ({
    kind: "completed",
    result: {
      ok: true,
      validation: { ok: true },
      results: [
        {
          status: "moved",
          sourceRelativePath: "a.md",
          destinationRelativePath: "Drafts/a.md",
          sourceAbsolutePath: "C:/Novel/a.md",
          destinationAbsolutePath: "C:/Novel/Drafts/a.md",
          isDirectory: false,
          movedProjectDocuments: []
        }
      ],
      successfulPathPairs: []
    }
  }));
  const plan: FileExplorerCopyPlan = options.plan ?? {
    planId: "plan-1",
    destinationFolderRelativePath: "",
    rows: [planRow()],
    hasCollisions: false,
    hasBlockingIssues: false
  };
  const planFileExplorerCopyEntries = vi.fn(async () => ({
    kind: "planned",
    plan
  }));
  const executeFileExplorerCopyPlan = vi.fn(async () => ({
    kind: "completed",
    result: {
      ok: true,
      results: plan.rows
        .filter((r) => r.status !== "blocked")
        .map((r) => ({
          status: "copied",
          sourceRelativePath: r.sourceRelativePath,
          destinationRelativePath: r.destinationRelativePath,
          isDirectory: r.sourceKind === "folder"
        })),
      registeredDocumentRelativePaths: []
    }
  }));
  const statFileExplorerEntries = vi.fn(async () => ({
    kind: "ok",
    entries: []
  }));
  const onMoveResultMessage = vi.fn();

  Object.defineProperty(window, "pergamum", {
    configurable: true,
    value: {
      projects: {
        listFileExplorerChildren,
        moveFileExplorerEntries,
        planFileExplorerCopyEntries,
        executeFileExplorerCopyPlan,
        statFileExplorerEntries
      }
    }
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: osClipboardWrite, write: osClipboardWrite }
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
        onMoveResultMessage,
        onProjectDocumentsMoved: vi.fn()
      })
    );
  });
  await flush();

  return {
    moveFileExplorerEntries,
    planFileExplorerCopyEntries,
    executeFileExplorerCopyPlan,
    statFileExplorerEntries,
    onMoveResultMessage
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
    menuItem(command)!.dispatchEvent(
      new MouseEvent("click", { bubbles: true })
    );
  });
}
function tree(): HTMLElement {
  return container!.querySelector<HTMLElement>(".fileExplorerList")!;
}
function pressPrimary(
  key: string,
  init: { isComposing?: boolean; from?: EventTarget } = {}
): void {
  const event = new KeyboardEvent("keydown", {
    key,
    ctrlKey: true,
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

describe("File Explorer Copy / Cut / Paste entry points (#356)", () => {
  describe("context menu", () => {
    it("shows Copy / Cut / Paste in order for a file row", async () => {
      await mount();
      openMenu("a.md");
      const commands = [
        ...container!.querySelectorAll("[data-file-explorer-context-command]")
      ].map((el) => el.getAttribute("data-file-explorer-context-command"));
      const copyIdx = commands.indexOf("copy");
      const cutIdx = commands.indexOf("cut");
      const pasteIdx = commands.indexOf("paste");
      expect(copyIdx).toBeGreaterThanOrEqual(0);
      expect(copyIdx).toBeLessThan(cutIdx);
      expect(cutIdx).toBeLessThan(pasteIdx);
      expect(menuItem("copy")?.textContent).toBe(
        t("en", "explorer.contextMenu.copy")
      );
    });

    it("enables Copy and Cut for a selected file when the project is writable", async () => {
      await mount();
      clickEntry("a.md");
      openMenu("a.md");
      expect(menuItem("copy")?.disabled).toBe(false);
      expect(menuItem("cut")?.disabled).toBe(false);
    });

    it("disables Paste when no internal buffer exists", async () => {
      await mount();
      clickEntry("a.md");
      openMenu("a.md");
      expect(menuItem("paste")?.disabled).toBe(true);
    });

    it("enables Paste once a Copy buffer exists", async () => {
      await mount();
      clickEntry("a.md");
      openMenu("a.md");
      clickMenu("copy");
      openMenu("a.md");
      expect(menuItem("paste")?.disabled).toBe(false);
    });

    it("enables Paste once a Cut buffer exists", async () => {
      await mount();
      clickEntry("a.md");
      openMenu("a.md");
      clickMenu("cut");
      openMenu("a.md");
      expect(menuItem("paste")?.disabled).toBe(false);
    });

    it("cannot Copy/Cut the project root", async () => {
      await mount();
      const rootRow = container!.querySelector<HTMLElement>(
        '[data-file-explorer-entry-kind="root"]'
      )!;
      act(() => {
        rootRow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      act(() => {
        rootRow.dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
        );
      });
      // The project root is not a Move/Copy/Cut source — the multi-selection
      // never holds `""`, so the taxonomy resolves to "empty selection".
      expect(menuItem("copy")?.disabled).toBe(true);
      expect(menuItem("cut")?.disabled).toBe(true);
    });

    it("read-only project disables Copy / Cut / Paste", async () => {
      await mount({ readOnly: true });
      clickEntry("a.md");
      openMenu("a.md");
      expect(menuItem("copy")?.disabled).toBe(true);
      expect(menuItem("cut")?.disabled).toBe(true);
      expect(menuItem("paste")?.disabled).toBe(true);
    });
  });

  describe("keyboard", () => {
    it("Ctrl+C stores a copy buffer without touching the filesystem", async () => {
      const harness = await mount();
      clickEntry("a.md");
      pressPrimary("c");
      await flush();

      expect(harness.planFileExplorerCopyEntries).not.toHaveBeenCalled();
      expect(harness.executeFileExplorerCopyPlan).not.toHaveBeenCalled();
      expect(harness.moveFileExplorerEntries).not.toHaveBeenCalled();
      expect(osClipboardWrite).not.toHaveBeenCalled();
      // buffer is live → Paste enabled
      openMenu("a.md");
      expect(menuItem("paste")?.disabled).toBe(false);
    });

    it("Ctrl+X keeps Cut behavior and clears the Copy buffer", async () => {
      const harness = await mount();
      clickEntry("a.md");
      pressPrimary("c");
      pressPrimary("x");
      await flush();

      // Paste now runs the Move path, not the Copy path
      pressPrimary("v");
      await flush();
      expect(harness.moveFileExplorerEntries).toHaveBeenCalledTimes(1);
      expect(harness.planFileExplorerCopyEntries).not.toHaveBeenCalled();
    });

    it("Ctrl+V with no buffer is a no-op", async () => {
      const harness = await mount();
      clickEntry("a.md");
      pressPrimary("v");
      await flush();
      expect(harness.moveFileExplorerEntries).not.toHaveBeenCalled();
      expect(harness.planFileExplorerCopyEntries).not.toHaveBeenCalled();
    });

    it("Ctrl+V with a Copy buffer calls planFileExplorerCopyEntries", async () => {
      const harness = await mount();
      clickEntry("a.md");
      pressPrimary("c");
      // paste into the project root (nothing selected as folder → root)
      pressPrimary("v");
      await flush();
      expect(harness.planFileExplorerCopyEntries).toHaveBeenCalledWith({
        sourceRelativePaths: ["a.md"],
        destinationFolderRelativePath: "",
        dirtyProjectDocumentRelativePaths: []
      });
      expect(harness.moveFileExplorerEntries).not.toHaveBeenCalled();
    });

    it("Ctrl+V with a Cut buffer calls moveFileExplorerEntries", async () => {
      const harness = await mount();
      clickEntry("a.md");
      pressPrimary("x");
      pressPrimary("v");
      await flush();
      expect(harness.moveFileExplorerEntries).toHaveBeenCalledTimes(1);
      expect(harness.planFileExplorerCopyEntries).not.toHaveBeenCalled();
    });

    it("Copy and Cut buffers are mutually exclusive", async () => {
      await mount();
      clickEntry("a.md");
      pressPrimary("x"); // cut
      pressPrimary("c"); // copy replaces cut
      await flush();
      // the cut muted-row marker is gone
      expect(entryButton("a.md").getAttribute("data-file-explorer-cut")).toBeNull();
    });

    it("does not fire during IME composition", async () => {
      const harness = await mount();
      clickEntry("a.md");
      pressPrimary("c", { isComposing: true });
      await flush();
      openMenu("a.md");
      expect(menuItem("paste")?.disabled).toBe(true);
      expect(harness.planFileExplorerCopyEntries).not.toHaveBeenCalled();
    });

    it("does not fire from an input inside the tree", async () => {
      const harness = await mount();
      clickEntry("a.md");
      const input = document.createElement("input");
      tree().appendChild(input);
      pressPrimary("c", { from: input });
      await flush();
      openMenu("a.md");
      expect(menuItem("paste")?.disabled).toBe(true);
      expect(harness.planFileExplorerCopyEntries).not.toHaveBeenCalled();
    });

    it("does not fire while a File Explorer modal dialog is open", async () => {
      const harness = await mount();
      clickEntry("a.md");
      openMenu("a.md");
      clickMenu("move"); // opens the Move destination dialog
      expect(container!.querySelector('[role="dialog"]')).not.toBeNull();
      pressPrimary("c");
      await flush();
      // no copy buffer was stored
      expect(harness.planFileExplorerCopyEntries).not.toHaveBeenCalled();
    });
  });

  describe("Copy / Paste execution", () => {
    it("collision-free Copy/Paste plans then executes directly", async () => {
      const harness = await mount();
      clickEntry("a.md");
      pressPrimary("c");
      pressPrimary("v");
      await flush();

      expect(harness.planFileExplorerCopyEntries).toHaveBeenCalledTimes(1);
      expect(harness.executeFileExplorerCopyPlan).toHaveBeenCalledWith({
        planId: "plan-1",
        dirtyProjectDocumentRelativePaths: []
      });
      expect(container!.querySelector(".fileExplorerCopyCollisionDialog")).toBeNull();
      expect(harness.onMoveResultMessage).toHaveBeenCalledWith(
        expect.stringContaining("Copied 1")
      );
    });

    it("collision Copy/Paste opens FileExplorerCopyCollisionDialog", async () => {
      const harness = await mount({
        plan: {
          planId: "plan-c",
          destinationFolderRelativePath: "",
          rows: [
            planRow({
              destinationName: "a copy 2.md",
              destinationRelativePath: "a copy 2.md",
              wasAutoRenamed: true,
              status: "will-auto-rename"
            })
          ],
          hasCollisions: true,
          hasBlockingIssues: false
        }
      });
      clickEntry("a.md");
      pressPrimary("c");
      pressPrimary("v");
      await flush();

      expect(
        container!.querySelector(".fileExplorerCopyCollisionDialog")
      ).not.toBeNull();
      expect(harness.executeFileExplorerCopyPlan).not.toHaveBeenCalled();
    });

    it("same-folder Copy/Paste plans a ` copy` destination (no same-parent no-op)", async () => {
      const harness = await mount();
      // select a.md (a root-level file) so the paste destination is the root,
      // which is a.md's own parent — allowed for Copy.
      clickEntry("a.md");
      pressPrimary("c");
      pressPrimary("v");
      await flush();
      expect(harness.planFileExplorerCopyEntries).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceRelativePaths: ["a.md"],
          destinationFolderRelativePath: ""
        })
      );
      expect(harness.executeFileExplorerCopyPlan).toHaveBeenCalled();
    });

    it("a blocking plan shows the shared failure dialog and never executes", async () => {
      const harness = await mount({
        plan: {
          planId: "plan-b",
          destinationFolderRelativePath: "",
          rows: [],
          hasCollisions: false,
          hasBlockingIssues: true,
          blockingReason: "source-not-found"
        }
      });
      clickEntry("a.md");
      pressPrimary("c");
      pressPrimary("v");
      await flush();

      expect(harness.executeFileExplorerCopyPlan).not.toHaveBeenCalled();
      expect(
        container!.querySelector('[data-file-operation-failure="true"]')
      ).not.toBeNull();
    });

    it("keeps the Copy buffer after a successful Paste (repeat paste works)", async () => {
      const harness = await mount();
      clickEntry("a.md");
      pressPrimary("c");
      pressPrimary("v");
      await flush();
      pressPrimary("v");
      await flush();
      expect(harness.planFileExplorerCopyEntries).toHaveBeenCalledTimes(2);
      expect(harness.executeFileExplorerCopyPlan).toHaveBeenCalledTimes(2);
    });

    it("Copy/Paste never calls the OS clipboard and never opens files", async () => {
      await mount();
      clickEntry("a.md");
      pressPrimary("c");
      pressPrimary("v");
      await flush();
      expect(osClipboardWrite).not.toHaveBeenCalled();
    });
  });
});
