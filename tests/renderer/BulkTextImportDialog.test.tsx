// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../../src/shared/i18n";
import {
  BulkTextImportDialog,
  type BulkTextImportDialogProps
} from "../../src/renderer/dialog/BulkTextImportDialog";
import type { TextImportFolderListing } from "../../src/renderer/dialog/TextImportDestinationPicker";
import type {
  TextImportDryRunFile,
  TextImportDryRunFolder,
  TextImportDryRunResult
} from "../../src/shared/textImport";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const translate = (key: any, values?: any) => t("ja", key, values);

function fileRow(
  overrides: Partial<TextImportDryRunFile> = {}
): TextImportDryRunFile {
  return {
    id: overrides.id ?? "f1",
    sourcePath: overrides.sourcePath ?? "/ext/notes.txt",
    sourceDisplayPath: overrides.sourceDisplayPath ?? "notes.txt",
    targetProjectRelativePath:
      overrides.targetProjectRelativePath ?? "docs/notes.md",
    originalTargetProjectRelativePath:
      overrides.originalTargetProjectRelativePath ?? "docs/notes.md",
    selectedEncoding: overrides.selectedEncoding ?? "shiftJis",
    bomKind: overrides.bomKind ?? "none",
    renamed: overrides.renamed ?? false,
    skipped: overrides.skipped ?? false,
    skipReason: overrides.skipReason,
    previewHead: overrides.previewHead ?? "冒頭のプレビュー",
    previewTail: overrides.previewTail ?? "末尾のプレビュー"
  };
}

function folderRow(
  overrides: Partial<TextImportDryRunFolder> = {}
): TextImportDryRunFolder {
  return {
    sourcePath: overrides.sourcePath ?? "/ext/chapter",
    targetProjectRelativePath:
      overrides.targetProjectRelativePath ?? "docs/chapter",
    hasSkippedDescendant: overrides.hasSkippedDescendant ?? false
  };
}

function okResult(
  files: readonly TextImportDryRunFile[],
  folders: readonly TextImportDryRunFolder[] = []
): TextImportDryRunResult {
  return { ok: true, files, folders };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("BulkTextImportDialog (#420 Step 3)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  const rootListing: TextImportFolderListing = {
    ok: true,
    folders: [
      { name: "docs", relativePath: "docs" },
      { name: "assets", relativePath: "assets" }
    ]
  };

  function defaultListFolders(): (
    dir: string | null
  ) => Promise<TextImportFolderListing> {
    return vi.fn(async (dir: string | null) =>
      dir === null ? rootListing : { ok: true, folders: [] }
    );
  }

  function renderDialog(
    props: Partial<BulkTextImportDialogProps> = {}
  ): BulkTextImportDialogProps {
    const defaultProps: BulkTextImportDialogProps = {
      isOpen: true,
      translate,
      onClose: vi.fn(),
      listFolders: defaultListFolders(),
      onDryRun: vi.fn(async () => okResult([fileRow()])),
      getDroppedFilePaths: vi.fn((files: readonly File[]) =>
        files.map((file) => file.name)
      ),
      ...props
    };

    act(() => {
      root.render(<BulkTextImportDialog {...defaultProps} />);
    });

    return defaultProps;
  }

  async function flush(): Promise<void> {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  function dropFiles(paths: readonly string[]): void {
    const area = container.querySelector<HTMLElement>(
      ".bulkTextImportDialogDropArea"
    )!;
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: { files: paths.map((path) => new File(["body"], path)) }
    });
    act(() => {
      area.dispatchEvent(event);
    });
  }

  async function chooseDestination(path = ""): Promise<void> {
    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          ".bulkTextImportDialogSelectDestinationButton"
        )!
        .click();
    });
    await flush();
    act(() => {
      container
        .querySelector<HTMLButtonElement>(`[data-destination-path="${path}"]`)!
        .click();
    });
    act(() => {
      container
        .querySelector<HTMLButtonElement>(".textImportDestinationPickerConfirm")!
        .click();
    });
    await flush();
  }

  it("returns null when closed", () => {
    renderDialog({ isOpen: false });
    expect(container.innerHTML).toBe("");
  });

  it("renders the accessible title and description", () => {
    renderDialog();

    const dialog = container.querySelector<HTMLElement>(".bulkTextImportDialog");
    expect(dialog?.getAttribute("role")).toBe("dialog");
    expect(container.querySelector(".appDialogTitle")?.textContent).toBe(
      "テキストファイルをまとめてインポート"
    );
    expect(container.textContent).toContain(
      "文字コードを指定して、テキストファイルを Markdown 文書として取り込みます。ファイル別に指定することも可能です。プレビューで確認してください。"
    );
  });

  it("keeps Import disabled with a next-step hint and closes with Cancel", () => {
    const onClose = vi.fn();
    renderDialog({ onClose });

    const importButton = container.querySelector<HTMLButtonElement>(
      ".bulkTextImportDialogImportButton"
    );
    expect(importButton?.disabled).toBe(true);
    expect(importButton?.title).toBe(
      "インポート実行は次のステップで実装します。"
    );

    act(() => {
      container
        .querySelector<HTMLButtonElement>(".bulkTextImportDialogCancelButton")
        ?.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the empty-target hint until both a destination and a source are set", () => {
    renderDialog();
    expect(container.textContent).toContain("取り込み対象はまだありません。");
    expect(container.textContent).toContain(
      "取り込み先フォルダを選択してください。"
    );
  });

  it("lists project folders in the destination picker and stores the chosen path", async () => {
    const listFolders = defaultListFolders();
    renderDialog({ listFolders });

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          ".bulkTextImportDialogSelectDestinationButton"
        )!
        .click();
    });
    await flush();

    expect(listFolders).toHaveBeenCalledWith(null);
    const picker = container.querySelector(".textImportDestinationPickerDialog");
    expect(picker).not.toBeNull();
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>(
          ".textImportDestinationPickerList .textImportDestinationPickerName"
        )
      ).map((node) => node.getAttribute("data-destination-path"))
    ).toEqual(["docs", "assets"]);

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-destination-path="docs"]')!
        .click();
    });
    act(() => {
      container
        .querySelector<HTMLButtonElement>(".textImportDestinationPickerConfirm")!
        .click();
    });
    await flush();

    expect(
      container.querySelector(".textImportDestinationPickerDialog")
    ).toBeNull();
    expect(
      container.querySelector("[data-testid='bulkTextImportDestinationValue']")
        ?.textContent
    ).toBe("docs");
  });

  it("labels the project root selection with the root label", async () => {
    renderDialog();
    await chooseDestination("");
    expect(
      container.querySelector("[data-testid='bulkTextImportDestinationValue']")
        ?.textContent
    ).toBe("/（プロジェクト直下）");
  });

  it("collects dropped file paths through the injected resolver and dedupes them", async () => {
    const getDroppedFilePaths = vi.fn((files: readonly File[]) =>
      files.map((file) => file.name)
    );
    renderDialog({ getDroppedFilePaths });

    dropFiles(["/ext/a.txt", "/ext/b.txt"]);
    dropFiles(["/ext/b.txt", "/ext/c.txt"]);
    await flush();

    expect(getDroppedFilePaths).toHaveBeenCalledTimes(2);
    const items = Array.from(
      container.querySelectorAll<HTMLElement>(".bulkTextImportDialogSourcePath")
    ).map((node) => node.textContent);
    expect(items).toEqual(["/ext/a.txt", "/ext/b.txt", "/ext/c.txt"]);
    expect(
      container.querySelector("[data-testid='bulkTextImportSourceCount']")
        ?.textContent
    ).toContain("3");
  });

  it("removes a source path from the list", async () => {
    renderDialog();
    dropFiles(["/ext/a.txt", "/ext/b.txt"]);
    await flush();

    act(() => {
      container
        .querySelectorAll<HTMLButtonElement>(
          ".bulkTextImportDialogRemoveSourceButton"
        )[0]
        .click();
    });

    const items = Array.from(
      container.querySelectorAll<HTMLElement>(".bulkTextImportDialogSourcePath")
    ).map((node) => node.textContent);
    expect(items).toEqual(["/ext/b.txt"]);
  });

  it("runs the dry-run only once both inputs are ready, and only dryRunTextImport", async () => {
    const onDryRun = vi.fn(async () => okResult([fileRow()]));
    renderDialog({ onDryRun });

    dropFiles(["/ext/a.txt"]);
    await flush();
    expect(onDryRun).not.toHaveBeenCalled();

    await chooseDestination("docs");

    expect(onDryRun).toHaveBeenCalledTimes(1);
    expect(onDryRun).toHaveBeenCalledWith({
      destinationFolderProjectRelativePath: "docs",
      sourcePaths: ["/ext/a.txt"]
    });
  });

  it("re-runs the dry-run when the source set changes", async () => {
    const onDryRun = vi.fn(async () => okResult([fileRow()]));
    renderDialog({ onDryRun });

    await chooseDestination("docs");
    dropFiles(["/ext/a.txt"]);
    await flush();
    expect(onDryRun).toHaveBeenCalledTimes(1);

    dropFiles(["/ext/b.txt"]);
    await flush();
    expect(onDryRun).toHaveBeenCalledTimes(2);
    expect(onDryRun).toHaveBeenLastCalledWith({
      destinationFolderProjectRelativePath: "docs",
      sourcePaths: ["/ext/a.txt", "/ext/b.txt"]
    });
  });

  it("shows a loading state while the dry-run is in flight", async () => {
    const gate = deferred<TextImportDryRunResult>();
    const onDryRun = vi.fn(() => gate.promise);
    renderDialog({ onDryRun });

    await chooseDestination("docs");
    dropFiles(["/ext/a.txt"]);
    await flush();

    expect(container.textContent).toContain("取り込み対象を確認しています...");

    await act(async () => {
      gate.resolve(okResult([fileRow()]));
    });
    await flush();
    expect(container.textContent).not.toContain(
      "取り込み対象を確認しています..."
    );
  });

  it("drops a stale dry-run response and keeps the latest result", async () => {
    const first = deferred<TextImportDryRunResult>();
    const second = deferred<TextImportDryRunResult>();
    const onDryRun = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    renderDialog({ onDryRun });

    await chooseDestination("docs");
    dropFiles(["/ext/a.txt"]);
    await flush();
    dropFiles(["/ext/b.txt"]);
    await flush();
    expect(onDryRun).toHaveBeenCalledTimes(2);

    // Newest response lands first.
    await act(async () => {
      second.resolve(
        okResult([fileRow({ id: "s2", sourceDisplayPath: "b.txt" })])
      );
    });
    await flush();
    expect(container.textContent).toContain("b.txt");

    // Stale (older) response arrives late and must be ignored.
    await act(async () => {
      first.resolve(
        okResult([fileRow({ id: "s1", sourceDisplayPath: "a-stale.txt" })])
      );
    });
    await flush();
    expect(container.textContent).toContain("b.txt");
    expect(container.textContent).not.toContain("a-stale.txt");
  });

  it("renders file rows with target, encoding, BOM and preview", async () => {
    const onDryRun = vi.fn(async () =>
      okResult([
        fileRow({
          sourceDisplayPath: "手記.txt",
          targetProjectRelativePath: "docs/手記.md",
          selectedEncoding: "shiftJis",
          bomKind: "none",
          previewHead: "はじまり",
          previewTail: "おわり"
        })
      ])
    );
    renderDialog({ onDryRun });

    await chooseDestination("docs");
    dropFiles(["/ext/手記.txt"]);
    await flush();

    const row = container.querySelector<HTMLElement>(
      ".bulkTextImportDialogFileRow"
    );
    expect(row?.getAttribute("data-skipped")).toBe("false");
    expect(row?.textContent).toContain("手記.txt");
    expect(row?.textContent).toContain("docs/手記.md");
    expect(row?.textContent).toContain("Shift_JIS");
    expect(row?.textContent).toContain("はじまり");
    expect(row?.textContent).toContain("おわり");
  });

  it("shows the localized skip reason and hides the preview for a skipped file", async () => {
    const onDryRun = vi.fn(async () =>
      okResult([
        fileRow({
          skipped: true,
          skipReason: "targetExists",
          previewHead: "SHOULD-NOT-SHOW",
          previewTail: "SHOULD-NOT-SHOW"
        })
      ])
    );
    renderDialog({ onDryRun });

    await chooseDestination("docs");
    dropFiles(["/ext/a.txt"]);
    await flush();

    const row = container.querySelector<HTMLElement>(
      ".bulkTextImportDialogFileRow"
    );
    expect(row?.getAttribute("data-skipped")).toBe("true");
    expect(row?.textContent).toContain(
      t("ja", "textImport.dialog.skipReason.targetExists")
    );
    expect(row?.textContent).not.toContain("SHOULD-NOT-SHOW");
  });

  it("shows a conflict-rename note when a file was renamed", async () => {
    const onDryRun = vi.fn(async () =>
      okResult([
        fileRow({
          renamed: true,
          targetProjectRelativePath: "docs/notes-1.md"
        })
      ])
    );
    renderDialog({ onDryRun });

    await chooseDestination("docs");
    dropFiles(["/ext/notes.txt"]);
    await flush();

    const row = container.querySelector<HTMLElement>(
      ".bulkTextImportDialogFileRow"
    );
    expect(row?.getAttribute("data-renamed")).toBe("true");
    expect(row?.querySelector(".bulkTextImportDialogFileRenamed")?.textContent)
      .toContain("docs/notes-1.md");
  });

  it("renders folder rows and flags folders with skipped descendants", async () => {
    const onDryRun = vi.fn(async () =>
      okResult(
        [fileRow()],
        [
          folderRow({
            sourcePath: "/ext/chapter",
            targetProjectRelativePath: "docs/chapter",
            hasSkippedDescendant: true
          })
        ]
      )
    );
    renderDialog({ onDryRun });

    await chooseDestination("docs");
    dropFiles(["/ext/chapter"]);
    await flush();

    const folder = container.querySelector<HTMLElement>(
      ".bulkTextImportDialogFolderRow"
    );
    expect(folder?.getAttribute("data-has-skipped-descendant")).toBe("true");
    expect(folder?.textContent).toContain("docs/chapter");
    expect(folder?.textContent).toContain("スキップされるファイルを含みます。");
  });

  it("shows a failure state when the dry-run cannot be computed", async () => {
    const onDryRun = vi.fn(async (): Promise<TextImportDryRunResult> => ({
      ok: false,
      reason: "noProject",
      message: "プロジェクトが開かれていません。"
    }));
    renderDialog({ onDryRun });

    await chooseDestination("docs");
    dropFiles(["/ext/a.txt"]);
    await flush();

    const failure = container.querySelector<HTMLElement>(
      ".bulkTextImportDialogCheckFailed"
    );
    expect(failure).not.toBeNull();
    expect(failure?.textContent).toContain(
      "取り込み対象を確認できませんでした。"
    );
    expect(failure?.textContent).toContain("プロジェクトが開かれていません。");
  });

  it("shows a failure state when the dry-run callback throws", async () => {
    const onDryRun = vi.fn(async () => {
      throw new Error("ipc down");
    });
    renderDialog({ onDryRun });

    await chooseDestination("docs");
    dropFiles(["/ext/a.txt"]);
    await flush();

    expect(
      container.querySelector(".bulkTextImportDialogCheckFailed")
    ).not.toBeNull();
  });

  it("closes on Escape but never on a backdrop click (transient state guard)", () => {
    const onClose = vi.fn();
    renderDialog({ onClose });

    // A stray click on the backdrop must not discard the destination /
    // source list / dry-run result held in the dialog (#420 Step 3).
    act(() => {
      container.querySelector<HTMLElement>(".appDialogBackdrop")?.click();
    });
    expect(onClose).not.toHaveBeenCalled();

    // Clicking inside the dialog body is likewise inert.
    act(() => {
      container.querySelector<HTMLElement>(".bulkTextImportDialog")?.click();
    });
    expect(onClose).not.toHaveBeenCalled();

    const dialog = container.querySelector<HTMLElement>(
      ".bulkTextImportDialog"
    );
    act(() => {
      dialog?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("resets destination, sources and dry-run result on close and reopen", async () => {
    const onDryRun = vi.fn(async () => okResult([fileRow()]));

    function Harness(): JSX.Element {
      const [isOpen, setIsOpen] = React.useState(true);
      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            open
          </button>
          <BulkTextImportDialog
            isOpen={isOpen}
            translate={translate}
            onClose={() => setIsOpen(false)}
            listFolders={defaultListFolders()}
            onDryRun={onDryRun}
            getDroppedFilePaths={(files) => files.map((file) => file.name)}
          />
        </>
      );
    }

    act(() => {
      root.render(<Harness />);
    });

    await chooseDestination("docs");
    dropFiles(["/ext/a.txt"]);
    await flush();
    expect(container.querySelector(".bulkTextImportDialogFileRow")).not.toBeNull();

    act(() => {
      container
        .querySelector<HTMLButtonElement>(".bulkTextImportDialogCancelButton")
        ?.click();
    });
    expect(container.querySelector(".bulkTextImportDialog")).toBeNull();

    act(() => {
      container.querySelector<HTMLButtonElement>("button")!.click();
    });
    await flush();

    expect(container.textContent).toContain("取り込み対象はまだありません。");
    expect(
      container.querySelector("[data-testid='bulkTextImportDestinationValue']")
        ?.textContent
    ).toBe("取り込み先フォルダを選択してください。");
    expect(container.querySelector(".bulkTextImportDialogSourcePath")).toBeNull();
    expect(container.querySelector(".bulkTextImportDialogFileRow")).toBeNull();
  });

  it("never calls preview or execute IPC-shaped callbacks (none are passed in Step 3)", async () => {
    const props = renderDialog();
    await chooseDestination("docs");
    dropFiles(["/ext/a.txt"]);
    await flush();

    // The only backend callback the dialog is given is the dry-run.
    expect(Object.keys(props)).not.toContain("onPreview");
    expect(Object.keys(props)).not.toContain("onExecute");
    expect(props.onDryRun).toHaveBeenCalled();
  });
});
