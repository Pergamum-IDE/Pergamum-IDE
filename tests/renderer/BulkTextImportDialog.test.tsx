// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../../src/shared/i18n";
import {
  BulkTextImportDialog,
  type BulkTextImportDialogProps,
  type BulkTextImportExecuteInput
} from "../../src/renderer/dialog/BulkTextImportDialog";
import type { TextImportFolderListing } from "../../src/renderer/dialog/TextImportDestinationPicker";
import type {
  ExecuteTextImportResult,
  PreviewTextImportFilesRequest,
  PreviewTextImportFilesResult,
  TextImportBomKind,
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

function previewOk(
  id: string,
  overrides: {
    previewHead?: string;
    previewTail?: string;
    bomKind?: TextImportBomKind;
  } = {}
): PreviewTextImportFilesResult {
  return {
    ok: true,
    files: [
      {
        ok: true,
        id,
        sourcePath: `/ext/${id}`,
        encoding: "utf8",
        bomKind: overrides.bomKind ?? "none",
        previewHead: overrides.previewHead ?? "更新後の冒頭",
        previewTail: overrides.previewTail ?? "更新後の末尾"
      }
    ]
  };
}

function previewPerFileFailure(
  id: string,
  reason: "decodeFailed" | "sourceMissing" | "sourceUnreadable" = "decodeFailed"
): PreviewTextImportFilesResult {
  return {
    ok: true,
    files: [
      {
        ok: false,
        id,
        sourcePath: `/ext/${id}`,
        encoding: "utf8",
        reason
      }
    ]
  };
}

describe("BulkTextImportDialog (#420 Step 3 + 4)", () => {
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
      pickSources: vi.fn(async () => []),
      onPreview: vi.fn(
        async (
          request: PreviewTextImportFilesRequest
        ): Promise<PreviewTextImportFilesResult> =>
          previewOk(request.files[0]?.id ?? "f1")
      ),
      onExecute: vi.fn(
        async (
          input: BulkTextImportExecuteInput
        ): Promise<ExecuteTextImportResult> => ({
          ok: true,
          imported: input.files.map((file) => ({
            sourcePath: file.sourcePath,
            targetProjectRelativePath: file.targetProjectRelativePath
          })),
          skipped: [],
          failed: []
        })
      ),
      onImported: vi.fn(),
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

  it("keeps Import disabled before any importable rows and closes with Cancel", () => {
    const onClose = vi.fn();
    renderDialog({ onClose });

    const importButton = container.querySelector<HTMLButtonElement>(
      ".bulkTextImportDialogImportButton"
    );
    expect(importButton?.disabled).toBe(true);
    expect(importButton?.title).toBe("取り込めるファイルがありません。");

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

  it("does not call the preview or execute callbacks on dry-run alone", async () => {
    const props = renderDialog();
    await chooseDestination("docs");
    dropFiles(["/ext/a.txt"]);
    await flush();

    expect(props.onDryRun).toHaveBeenCalled();
    expect(props.onPreview).not.toHaveBeenCalled();
    // Import runs only from an explicit click (#420 Step 5).
    expect(props.onExecute).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // #420 Step 4: per-file encoding dropdown + preview refresh
  // ---------------------------------------------------------------------------

  function encodingSelects(): HTMLSelectElement[] {
    return Array.from(
      container.querySelectorAll<HTMLSelectElement>(
        ".bulkTextImportDialogFileEncodingSelect"
      )
    );
  }

  function firstFileRow(): HTMLElement {
    return container.querySelector<HTMLElement>(
      ".bulkTextImportDialogFileRow"
    )!;
  }

  async function changeEncoding(
    select: HTMLSelectElement,
    value: string
  ): Promise<void> {
    act(() => {
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
  }

  async function readyWithRows(
    onDryRun: BulkTextImportDialogProps["onDryRun"],
    onPreview: BulkTextImportDialogProps["onPreview"],
    sources: readonly string[] = ["/ext/a.txt"]
  ): Promise<void> {
    renderDialog({ onDryRun, onPreview });
    await chooseDestination("docs");
    dropFiles(sources);
    await flush();
  }

  it("renders an encoding dropdown per file row, defaulting to the dry-run encoding", async () => {
    const onDryRun = vi.fn(async () =>
      okResult([
        fileRow({ id: "f1", selectedEncoding: "shiftJis" }),
        fileRow({ id: "f2", sourceDisplayPath: "b.txt", selectedEncoding: "eucJp" })
      ])
    );
    await readyWithRows(onDryRun, vi.fn());

    const selects = encodingSelects();
    expect(selects).toHaveLength(2);
    expect(selects[0].value).toBe("shiftJis");
    expect(selects[1].value).toBe("eucJp");
  });

  it("updates the selected encoding and calls previewTextImportFiles, never the dry-run", async () => {
    const onDryRun = vi.fn(async () => okResult([fileRow({ id: "f1" })]));
    const onPreview = vi.fn(
      async (r: PreviewTextImportFilesRequest) => previewOk(r.files[0].id)
    );
    await readyWithRows(onDryRun, onPreview);
    expect(onDryRun).toHaveBeenCalledTimes(1);

    await changeEncoding(encodingSelects()[0], "eucJp");

    expect(encodingSelects()[0].value).toBe("eucJp");
    expect(onPreview).toHaveBeenCalledTimes(1);
    // the preview request carries the dry-run row's own source path + id
    expect(onPreview).toHaveBeenCalledWith({
      files: [{ id: "f1", sourcePath: "/ext/notes.txt", encoding: "eucJp" }]
    });
    // encoding change must not re-run the dry-run
    expect(onDryRun).toHaveBeenCalledTimes(1);
  });

  it("shows a per-row loading note while the preview is in flight", async () => {
    const gate = deferred<PreviewTextImportFilesResult>();
    const onPreview = vi.fn(() => gate.promise);
    await readyWithRows(
      vi.fn(async () => okResult([fileRow({ id: "f1" })])),
      onPreview
    );

    await changeEncoding(encodingSelects()[0], "eucJp");
    expect(firstFileRow().textContent).toContain(
      "プレビューを更新しています..."
    );
    expect(
      firstFileRow().querySelector("[role='status']")?.textContent
    ).toContain("プレビューを更新しています...");

    await act(async () => {
      gate.resolve(previewOk("f1", { previewHead: "OK冒頭", previewTail: "OK末尾" }));
    });
    await flush();
    expect(firstFileRow().textContent).not.toContain(
      "プレビューを更新しています..."
    );
  });

  it("applies previewHead / previewTail / bomKind on preview success", async () => {
    const onPreview = vi.fn(async (r: PreviewTextImportFilesRequest) =>
      previewOk(r.files[0].id, {
        previewHead: "新しい先頭テキスト",
        previewTail: "新しい末尾テキスト",
        bomKind: "utf16le"
      })
    );
    await readyWithRows(
      vi.fn(async () =>
        okResult([
          fileRow({
            id: "f1",
            previewHead: "古い先頭",
            previewTail: "古い末尾",
            bomKind: "none"
          })
        ])
      ),
      onPreview
    );

    await changeEncoding(encodingSelects()[0], "utf16le");

    const row = firstFileRow();
    expect(row.textContent).toContain("新しい先頭テキスト");
    expect(row.textContent).toContain("新しい末尾テキスト");
    expect(row.textContent).not.toContain("古い先頭");
    expect(row.querySelector(".bulkTextImportDialogFileBom")?.textContent).toContain(
      "UTF-16 LE"
    );
  });

  it("shows a per-row failure message on a per-file preview failure", async () => {
    const onPreview = vi.fn(async (r: PreviewTextImportFilesRequest) =>
      previewPerFileFailure(r.files[0].id, "decodeFailed")
    );
    await readyWithRows(
      vi.fn(async () => okResult([fileRow({ id: "f1" })])),
      onPreview
    );

    await changeEncoding(encodingSelects()[0], "eucJp");

    const row = firstFileRow();
    expect(row.getAttribute("data-preview-status")).toBe("failed");
    expect(row.textContent).toContain("この文字コードではプレビューできません。");
    expect(row.textContent).toContain(
      t("ja", "textImport.dialog.skipReason.decodeFailed")
    );
  });

  it("shows a per-row failure message on a top-level preview failure", async () => {
    const onPreview = vi.fn(
      async (): Promise<PreviewTextImportFilesResult> => ({
        ok: false,
        reason: "invalidRequest"
      })
    );
    await readyWithRows(
      vi.fn(async () => okResult([fileRow({ id: "f1" })])),
      onPreview
    );

    await changeEncoding(encodingSelects()[0], "eucJp");

    const row = firstFileRow();
    expect(row.getAttribute("data-preview-status")).toBe("failed");
    expect(row.textContent).toContain("プレビューを更新できませんでした。");
  });

  it("shows a per-row failure message when the preview callback throws", async () => {
    const onPreview = vi.fn(async () => {
      throw new Error("ipc down");
    });
    await readyWithRows(
      vi.fn(async () => okResult([fileRow({ id: "f1" })])),
      onPreview
    );

    await changeEncoding(encodingSelects()[0], "eucJp");

    const row = firstFileRow();
    expect(row.getAttribute("data-preview-status")).toBe("failed");
    expect(row.textContent).toContain("プレビューを更新できませんでした。");
    // the dialog's dry-run result is not discarded
    expect(container.querySelector(".bulkTextImportDialogFileList")).not.toBeNull();
  });

  it("enables the dropdown for normal and decodeFailed rows, disables it for other skips", async () => {
    const onDryRun = vi.fn(async () =>
      okResult([
        fileRow({ id: "normal", sourceDisplayPath: "normal.txt" }),
        fileRow({
          id: "decode",
          sourceDisplayPath: "decode.txt",
          skipped: true,
          skipReason: "decodeFailed"
        }),
        fileRow({
          id: "exists",
          sourceDisplayPath: "exists.txt",
          skipped: true,
          skipReason: "targetExists"
        }),
        fileRow({
          id: "nottext",
          sourceDisplayPath: "nottext.bin",
          skipped: true,
          skipReason: "notTextFile"
        }),
        fileRow({
          id: "missing",
          sourceDisplayPath: "missing.txt",
          skipped: true,
          skipReason: "sourceMissing"
        }),
        fileRow({
          id: "unreadable",
          sourceDisplayPath: "unreadable.txt",
          skipped: true,
          skipReason: "sourceUnreadable"
        }),
        fileRow({
          id: "unsupported",
          sourceDisplayPath: "unsupported",
          skipped: true,
          skipReason: "unsupportedSource"
        })
      ])
    );
    await readyWithRows(onDryRun, vi.fn());

    const disabledById = Object.fromEntries(
      encodingSelects().map((select) => [
        select
          .closest(".bulkTextImportDialogFileRow")!
          .querySelector(".bulkTextImportDialogFileSource")!.textContent,
        select.disabled
      ])
    );
    expect(disabledById["normal.txt"]).toBe(false);
    expect(disabledById["decode.txt"]).toBe(false);
    expect(disabledById["exists.txt"]).toBe(true);
    expect(disabledById["nottext.bin"]).toBe(true);
    expect(disabledById["missing.txt"]).toBe(true);
    expect(disabledById["unreadable.txt"]).toBe(true);
    expect(disabledById["unsupported"]).toBe(true);
  });

  it("recovers a decodeFailed row when a new encoding previews successfully", async () => {
    const onPreview = vi.fn(async (r: PreviewTextImportFilesRequest) =>
      previewOk(r.files[0].id, { previewHead: "読めた冒頭", previewTail: "読めた末尾" })
    );
    await readyWithRows(
      vi.fn(async () =>
        okResult([
          fileRow({
            id: "f1",
            skipped: true,
            skipReason: "decodeFailed",
            previewHead: "",
            previewTail: ""
          })
        ])
      ),
      onPreview
    );

    // initially shows the decode-failed skip note
    expect(firstFileRow().textContent).toContain(
      t("ja", "textImport.dialog.skipReason.decodeFailed")
    );

    await changeEncoding(encodingSelects()[0], "eucJp");

    const row = firstFileRow();
    expect(row.getAttribute("data-skipped")).toBe("false");
    expect(row.textContent).toContain("選択した文字コードで読み取れました。");
    expect(row.textContent).toContain("読めた冒頭");
  });

  it("keeps a decodeFailed row skipped with a softer note when the new encoding still fails", async () => {
    const onPreview = vi.fn(async (r: PreviewTextImportFilesRequest) =>
      previewPerFileFailure(r.files[0].id, "decodeFailed")
    );
    await readyWithRows(
      vi.fn(async () =>
        okResult([
          fileRow({ id: "f1", skipped: true, skipReason: "decodeFailed" })
        ])
      ),
      onPreview
    );

    await changeEncoding(encodingSelects()[0], "eucJp");

    const row = firstFileRow();
    expect(row.getAttribute("data-skipped")).toBe("true");
    expect(row.textContent).toContain(
      "当初の文字コードでは読み取れませんでした。"
    );
  });

  it("drops a stale preview response when the encoding is changed again", async () => {
    const first = deferred<PreviewTextImportFilesResult>();
    const second = deferred<PreviewTextImportFilesResult>();
    const onPreview = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    await readyWithRows(
      vi.fn(async () => okResult([fileRow({ id: "f1" })])),
      onPreview
    );

    await changeEncoding(encodingSelects()[0], "eucJp");
    await changeEncoding(encodingSelects()[0], "utf16be");
    expect(onPreview).toHaveBeenCalledTimes(2);

    // newest resolves first
    await act(async () => {
      second.resolve(previewOk("f1", { previewHead: "second-head" }));
    });
    await flush();
    expect(firstFileRow().textContent).toContain("second-head");

    // stale (first) response arrives late and must not overwrite
    await act(async () => {
      first.resolve(previewOk("f1", { previewHead: "STALE-head" }));
    });
    await flush();
    expect(firstFileRow().textContent).toContain("second-head");
    expect(firstFileRow().textContent).not.toContain("STALE-head");
  });

  it("ignores a preview response that lands after the dialog is closed", async () => {
    const gate = deferred<PreviewTextImportFilesResult>();
    const onPreview = vi.fn(() => gate.promise);

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
            onDryRun={vi.fn(async () => okResult([fileRow({ id: "f1" })]))}
            getDroppedFilePaths={(files) => files.map((file) => file.name)}
            onPreview={onPreview}
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
    await changeEncoding(encodingSelects()[0], "eucJp");

    act(() => {
      container
        .querySelector<HTMLButtonElement>(".bulkTextImportDialogCancelButton")
        ?.click();
    });
    expect(container.querySelector(".bulkTextImportDialog")).toBeNull();

    await act(async () => {
      gate.resolve(previewOk("f1", { previewHead: "late-head" }));
    });
    await flush();

    act(() => {
      container.querySelector<HTMLButtonElement>("button")!.click();
    });
    await flush();
    expect(container.textContent).toContain("取り込み対象はまだありません。");
    expect(container.textContent).not.toContain("late-head");
  });

  it("does not let a stale preview response leak into rows rebuilt by a later dry-run", async () => {
    const firstPreview = deferred<PreviewTextImportFilesResult>();
    const onPreview = vi.fn(() => firstPreview.promise);
    const onDryRun = vi
      .fn()
      .mockImplementationOnce(async () =>
        okResult([fileRow({ id: "f1", sourceDisplayPath: "a.txt" })])
      )
      .mockImplementationOnce(async () =>
        okResult([
          fileRow({ id: "f1", sourceDisplayPath: "a.txt" }),
          fileRow({ id: "f2", sourceDisplayPath: "b.txt" })
        ])
      );

    renderDialog({ onDryRun, onPreview });
    await chooseDestination("docs");
    dropFiles(["/ext/a.txt"]);
    await flush();

    await changeEncoding(encodingSelects()[0], "eucJp");

    // second dry-run rebuilds the rows before the first preview resolves
    dropFiles(["/ext/b.txt"]);
    await flush();
    expect(encodingSelects()).toHaveLength(2);

    await act(async () => {
      firstPreview.resolve(previewOk("f1", { previewHead: "LEAKED-head" }));
    });
    await flush();

    expect(container.textContent).not.toContain("LEAKED-head");
    // rebuilt rows are back on their dry-run encoding, no lingering loading note
    expect(container.textContent).not.toContain(
      "プレビューを更新しています..."
    );
  });

  // ---------------------------------------------------------------------------
  // #420 Step 5: import execution
  // ---------------------------------------------------------------------------

  function importButton(): HTMLButtonElement {
    return container.querySelector<HTMLButtonElement>(
      ".bulkTextImportDialogImportButton"
    )!;
  }
  function cancelButton(): HTMLButtonElement {
    return container.querySelector<HTMLButtonElement>(
      ".bulkTextImportDialogCancelButton"
    )!;
  }
  function clickImport(): void {
    act(() => {
      importButton().click();
    });
  }

  async function readyForImport(
    props: Partial<BulkTextImportDialogProps> = {},
    files: readonly TextImportDryRunFile[] = [fileRow({ id: "f1" })]
  ): Promise<BulkTextImportDialogProps> {
    const resolved = renderDialog({
      onDryRun: vi.fn(async () => okResult(files)),
      ...props
    });
    await chooseDestination("docs");
    dropFiles(["/ext/a.txt"]);
    await flush();
    return resolved;
  }

  it("enables Import once the dry-run is ready with an importable row", async () => {
    renderDialog();
    expect(importButton().disabled).toBe(true);

    await chooseDestination("docs");
    dropFiles(["/ext/a.txt"]);
    await flush();

    expect(importButton().disabled).toBe(false);
  });

  it("keeps Import disabled when every row is skipped for a non-decode reason", async () => {
    await readyForImport({}, [
      fileRow({ id: "f1", skipped: true, skipReason: "targetExists" })
    ]);
    expect(importButton().disabled).toBe(true);
    expect(importButton().title).toBe("取り込めるファイルがありません。");
  });

  it("keeps Import disabled while a preview row is updating", async () => {
    const gate = deferred<PreviewTextImportFilesResult>();
    await readyForImport({ onPreview: vi.fn(() => gate.promise) }, [
      fileRow({ id: "f1" }),
      fileRow({ id: "f2", sourceDisplayPath: "b.txt" })
    ]);
    expect(importButton().disabled).toBe(false);

    await changeEncoding(encodingSelects()[0], "eucJp");
    expect(importButton().disabled).toBe(true);
    expect(importButton().title).toBe(
      "プレビューの更新が終わるまで待ってください。"
    );

    await act(async () => {
      gate.resolve(previewOk("f1"));
    });
    await flush();
    expect(importButton().disabled).toBe(false);
  });

  it("includes a decodeRecovered row in the import and uses its selected encoding", async () => {
    const onExecute = vi.fn(
      async (
        input: BulkTextImportExecuteInput
      ): Promise<ExecuteTextImportResult> => ({
        ok: true,
        imported: input.files.map((f) => ({
          sourcePath: f.sourcePath,
          targetProjectRelativePath: f.targetProjectRelativePath
        })),
        skipped: [],
        failed: []
      })
    );
    const onPreview = vi.fn(async (r: PreviewTextImportFilesRequest) =>
      previewOk(r.files[0].id, { previewHead: "読めた" })
    );
    await readyForImport({ onExecute, onPreview }, [
      fileRow({
        id: "rec",
        sourcePath: "/ext/rec.txt",
        targetProjectRelativePath: "docs/rec.md",
        skipped: true,
        skipReason: "decodeFailed"
      })
    ]);
    expect(importButton().disabled).toBe(true);

    await changeEncoding(encodingSelects()[0], "eucJp");
    expect(importButton().disabled).toBe(false);

    clickImport();
    await flush();

    expect(onExecute).toHaveBeenCalledTimes(1);
    expect(onExecute).toHaveBeenCalledWith({
      destinationFolderProjectRelativePath: "docs",
      files: [
        {
          sourcePath: "/ext/rec.txt",
          targetProjectRelativePath: "docs/rec.md",
          encoding: "eucJp"
        }
      ]
    });
  });

  it("sends only importable rows, with row-local encodings, and never folders / skips", async () => {
    const onExecute = vi.fn(
      async (): Promise<ExecuteTextImportResult> => ({
        ok: true,
        imported: [
          { sourcePath: "/ext/a.txt", targetProjectRelativePath: "docs/a.md" }
        ],
        skipped: [],
        failed: []
      })
    );
    const onDryRun = vi.fn(async () =>
      okResult(
        [
          fileRow({
            id: "ok",
            sourcePath: "/ext/a.txt",
            targetProjectRelativePath: "docs/a.md",
            selectedEncoding: "shiftJis"
          }),
          fileRow({
            id: "exists",
            sourcePath: "/ext/b.txt",
            targetProjectRelativePath: "docs/b.md",
            skipped: true,
            skipReason: "targetExists"
          })
        ],
        [folderRow({ sourcePath: "/ext/dir" })]
      )
    );
    renderDialog({ onDryRun, onExecute });
    await chooseDestination("docs");
    dropFiles(["/ext/a.txt"]);
    await flush();

    await changeEncoding(encodingSelects()[0], "utf8");
    clickImport();
    await flush();

    expect(onExecute).toHaveBeenCalledWith({
      destinationFolderProjectRelativePath: "docs",
      files: [
        {
          sourcePath: "/ext/a.txt",
          targetProjectRelativePath: "docs/a.md",
          encoding: "utf8"
        }
      ]
    });
  });

  it("runs executeTextImport once even on a double click", async () => {
    const gate = deferred<ExecuteTextImportResult>();
    const onExecute = vi.fn(() => gate.promise);
    await readyForImport({ onExecute });

    clickImport();
    clickImport();
    clickImport();
    await flush();

    expect(onExecute).toHaveBeenCalledTimes(1);

    await act(async () => {
      gate.resolve({ ok: true, imported: [], skipped: [], failed: [] });
    });
  });

  it("shows an importing banner and locks the inputs while the import runs", async () => {
    const gate = deferred<ExecuteTextImportResult>();
    const onClose = vi.fn();
    await readyForImport({ onExecute: vi.fn(() => gate.promise), onClose });

    clickImport();
    await flush();

    expect(container.textContent).toContain("取り込みを実行しています...");
    expect(importButton().disabled).toBe(true);
    expect(cancelButton().disabled).toBe(true);
    expect(encodingSelects()[0].disabled).toBe(true);
    expect(
      container.querySelector<HTMLButtonElement>(
        ".bulkTextImportDialogSelectDestinationButton"
      )?.disabled
    ).toBe(true);

    // Cancel / Escape are inert mid-import.
    act(() => {
      cancelButton().click();
    });
    act(() => {
      container
        .querySelector<HTMLElement>(".bulkTextImportDialog")
        ?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        );
    });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      gate.resolve({
        ok: true,
        imported: [
          { sourcePath: "/ext/notes.txt", targetProjectRelativePath: "docs/notes.md" }
        ],
        skipped: [],
        failed: []
      });
    });
    await flush();

    // closable again once done
    act(() => {
      cancelButton().click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the completed summary and imported paths, and keeps the dialog open", async () => {
    const onImported = vi.fn();
    await readyForImport({
      onImported,
      onExecute: vi.fn(
        async (): Promise<ExecuteTextImportResult> => ({
          ok: true,
          imported: [
            {
              sourcePath: "/ext/notes.txt",
              targetProjectRelativePath: "docs/notes.md"
            }
          ],
          skipped: [],
          failed: []
        })
      )
    });

    clickImport();
    await flush();

    const banner = container.querySelector<HTMLElement>(
      ".bulkTextImportDialogExecutionBanner"
    );
    expect(banner?.className).toContain("isCompleted");
    expect(banner?.textContent).toContain("取り込みが完了しました。");
    expect(banner?.textContent).toContain("docs/notes.md");
    // still open, and Import stays disabled (inputs unchanged)
    expect(container.querySelector(".bulkTextImportDialog")).not.toBeNull();
    expect(importButton().disabled).toBe(true);
    expect(onImported).toHaveBeenCalledWith(["docs/notes.md"]);
  });

  it("shows the partial-failure summary with skipped and failed rows", async () => {
    await readyForImport(
      {
        onExecute: vi.fn(
          async (): Promise<ExecuteTextImportResult> => ({
            ok: true,
            imported: [
              { sourcePath: "/ext/a.txt", targetProjectRelativePath: "docs/a.md" }
            ],
            skipped: [
              {
                sourcePath: "/ext/b.txt",
                targetProjectRelativePath: "docs/b.md",
                reason: "targetExists"
              }
            ],
            failed: [
              {
                sourcePath: "/ext/c.txt",
                reason: "sourceUnreadable",
                message: "EACCES"
              }
            ]
          })
        )
      },
      [
        fileRow({ id: "a", sourcePath: "/ext/a.txt", sourceDisplayPath: "a.txt" }),
        fileRow({ id: "b", sourcePath: "/ext/b.txt", sourceDisplayPath: "b.txt" }),
        fileRow({ id: "c", sourcePath: "/ext/c.txt", sourceDisplayPath: "c.txt" })
      ]
    );

    clickImport();
    await flush();

    const banner = container.querySelector<HTMLElement>(
      ".bulkTextImportDialogExecutionBanner"
    );
    expect(banner?.className).toContain("isPartial");
    expect(banner?.textContent).toContain("一部のファイルを取り込めませんでした。");
    expect(banner?.textContent).toContain(
      t("ja", "textImport.dialog.skipReason.targetExists")
    );
    expect(banner?.textContent).toContain(
      t("ja", "textImport.dialog.skipReason.sourceUnreadable")
    );
    expect(banner?.textContent).toContain("EACCES");
  });

  it("shows a failure summary for a top-level execute failure", async () => {
    const onImported = vi.fn();
    await readyForImport({
      onImported,
      onExecute: vi.fn(
        async (): Promise<ExecuteTextImportResult> => ({
          ok: false,
          reason: "noProject",
          message: "no project open"
        })
      )
    });

    clickImport();
    await flush();

    const banner = container.querySelector<HTMLElement>(
      ".bulkTextImportDialogExecutionBanner"
    );
    expect(banner?.className).toContain("isFailed");
    expect(banner?.textContent).toContain("取り込みを実行できませんでした。");
    expect(banner?.textContent).toContain("noProject");
    expect(onImported).not.toHaveBeenCalled();
  });

  it("shows a failure summary when the execute callback throws", async () => {
    await readyForImport({
      onExecute: vi.fn(async () => {
        throw new Error("ipc down");
      })
    });

    clickImport();
    await flush();

    const banner = container.querySelector<HTMLElement>(
      ".bulkTextImportDialogExecutionBanner"
    );
    expect(banner?.className).toContain("isFailed");
    expect(banner?.textContent).toContain("取り込みを実行できませんでした。");
    expect(banner?.textContent).toContain("ipc down");
    // the dry-run result / file list is not discarded
    expect(container.querySelector(".bulkTextImportDialogFileList")).not.toBeNull();
  });

  it("clears the import result when the destination changes", async () => {
    await readyForImport();
    clickImport();
    await flush();
    expect(container.textContent).toContain("取り込みが完了しました。");

    await chooseDestination("assets");
    await flush();

    expect(container.textContent).not.toContain("取り込みが完了しました。");
    expect(
      container.querySelector(".bulkTextImportDialogExecutionBanner")
    ).toBeNull();
  });

  it("clears the import result when a row encoding changes", async () => {
    await readyForImport();
    clickImport();
    await flush();
    expect(container.textContent).toContain("取り込みが完了しました。");

    await changeEncoding(encodingSelects()[0], "utf8");

    expect(container.textContent).not.toContain("取り込みが完了しました。");
  });

  it("ignores an execute response that lands after the dialog is closed", async () => {
    const gate = deferred<ExecuteTextImportResult>();

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
            onDryRun={vi.fn(async () => okResult([fileRow({ id: "f1" })]))}
            getDroppedFilePaths={(files) => files.map((file) => file.name)}
            onPreview={vi.fn(
              async (
                r: PreviewTextImportFilesRequest
              ): Promise<PreviewTextImportFilesResult> => previewOk(r.files[0].id)
            )}
            onExecute={vi.fn(() => gate.promise)}
            onImported={vi.fn()}
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

    clickImport();
    await flush();
    expect(container.textContent).toContain("取り込みを実行しています...");

    // Close is inert while importing — end the import first, then close.
    await act(async () => {
      gate.resolve({ ok: true, imported: [], skipped: [], failed: [] });
    });
    await flush();
    act(() => {
      cancelButton().click();
    });
    expect(container.querySelector(".bulkTextImportDialog")).toBeNull();

    // Reopen: fully reset, no lingering execution summary.
    act(() => {
      container.querySelector<HTMLButtonElement>("button")!.click();
    });
    await flush();
    expect(container.textContent).toContain("取り込み対象はまだありません。");
    expect(
      container.querySelector(".bulkTextImportDialogExecutionBanner")
    ).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // #420 Step 6: OS file / folder picker buttons + post-import Close label
  // ---------------------------------------------------------------------------

  function addFilesButton(): HTMLButtonElement {
    return container.querySelector<HTMLButtonElement>(
      ".bulkTextImportDialogAddFilesButton"
    )!;
  }
  function addFoldersButton(): HTMLButtonElement {
    return container.querySelector<HTMLButtonElement>(
      ".bulkTextImportDialogAddFoldersButton"
    )!;
  }
  function sourcePathTexts(): (string | null)[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>(".bulkTextImportDialogSourcePath")
    ).map((node) => node.textContent);
  }

  it("adds paths chosen from the file picker button to the source list", async () => {
    const pickSources = vi.fn(async (kind: "files" | "folders") =>
      kind === "files" ? ["/ext/a.txt", "/ext/b.txt"] : []
    );
    renderDialog({ pickSources });

    act(() => {
      addFilesButton().click();
    });
    await flush();

    expect(pickSources).toHaveBeenCalledWith("files");
    expect(sourcePathTexts()).toEqual(["/ext/a.txt", "/ext/b.txt"]);
    expect(
      container.querySelector("[data-testid='bulkTextImportSourceCount']")
        ?.textContent
    ).toContain("2");
  });

  it("adds paths chosen from the folder picker button to the source list", async () => {
    const pickSources = vi.fn(async (kind: "files" | "folders") =>
      kind === "folders" ? ["/ext/chapters"] : []
    );
    renderDialog({ pickSources });

    act(() => {
      addFoldersButton().click();
    });
    await flush();

    expect(pickSources).toHaveBeenCalledWith("folders");
    expect(sourcePathTexts()).toEqual(["/ext/chapters"]);
  });

  it("does not add a duplicate path from the picker", async () => {
    const pickSources = vi
      .fn()
      .mockResolvedValueOnce(["/ext/a.txt", "/ext/b.txt"])
      .mockResolvedValueOnce(["/ext/b.txt", "/ext/c.txt"]);
    renderDialog({ pickSources });

    act(() => {
      addFilesButton().click();
    });
    await flush();
    act(() => {
      addFilesButton().click();
    });
    await flush();

    expect(sourcePathTexts()).toEqual(["/ext/a.txt", "/ext/b.txt", "/ext/c.txt"]);
  });

  it("leaves the source list unchanged when the picker is cancelled", async () => {
    const pickSources = vi
      .fn()
      .mockResolvedValueOnce(["/ext/a.txt"])
      .mockResolvedValueOnce([]);
    renderDialog({ pickSources });

    act(() => {
      addFilesButton().click();
    });
    await flush();
    expect(sourcePathTexts()).toEqual(["/ext/a.txt"]);

    act(() => {
      addFilesButton().click();
    });
    await flush();
    expect(sourcePathTexts()).toEqual(["/ext/a.txt"]);
  });

  it("re-runs the dry-run after the picker adds sources", async () => {
    const onDryRun = vi.fn(async () => okResult([fileRow()]));
    const pickSources = vi.fn(async () => ["/ext/a.txt"]);
    renderDialog({ onDryRun, pickSources });
    await chooseDestination("docs");
    expect(onDryRun).not.toHaveBeenCalled();

    act(() => {
      addFilesButton().click();
    });
    await flush();

    expect(onDryRun).toHaveBeenCalledTimes(1);
    expect(onDryRun).toHaveBeenCalledWith({
      destinationFolderProjectRelativePath: "docs",
      sourcePaths: ["/ext/a.txt"]
    });
  });

  it("disables the picker buttons while an import is running", async () => {
    const gate = deferred<ExecuteTextImportResult>();
    renderDialog({
      onDryRun: vi.fn(async () => okResult([fileRow({ id: "f1" })])),
      onExecute: vi.fn(() => gate.promise)
    });
    await chooseDestination("docs");
    dropFiles(["/ext/a.txt"]);
    await flush();

    expect(addFilesButton().disabled).toBe(false);
    expect(addFoldersButton().disabled).toBe(false);

    act(() => {
      container
        .querySelector<HTMLButtonElement>(".bulkTextImportDialogImportButton")!
        .click();
    });
    await flush();

    expect(addFilesButton().disabled).toBe(true);
    expect(addFoldersButton().disabled).toBe(true);

    await act(async () => {
      gate.resolve({ ok: true, imported: [], skipped: [], failed: [] });
    });
    await flush();
  });

  it("keeps the Cancel label before an import and switches it to Close once completed", async () => {
    const onClose = vi.fn();
    renderDialog({
      onClose,
      onDryRun: vi.fn(async () => okResult([fileRow({ id: "f1" })])),
      onExecute: vi.fn(
        async (): Promise<ExecuteTextImportResult> => ({
          ok: true,
          imported: [
            {
              sourcePath: "/ext/notes.txt",
              targetProjectRelativePath: "docs/notes.md"
            }
          ],
          skipped: [],
          failed: []
        })
      )
    });
    await chooseDestination("docs");
    dropFiles(["/ext/a.txt"]);
    await flush();

    const cancel = () =>
      container.querySelector<HTMLButtonElement>(
        ".bulkTextImportDialogCancelButton"
      )!;

    // before import: still "キャンセル"
    expect(cancel().textContent).toBe("キャンセル");

    act(() => {
      container
        .querySelector<HTMLButtonElement>(".bulkTextImportDialogImportButton")!
        .click();
    });
    await flush();

    // after a completed import: "閉じる", and it closes the dialog
    expect(cancel().textContent).toBe("閉じる");
    act(() => {
      cancel().click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("hides the picker buttons when no pickSources callback is given", () => {
    renderDialog({ pickSources: undefined });
    expect(
      container.querySelector(".bulkTextImportDialogAddFilesButton")
    ).toBeNull();
    expect(
      container.querySelector(".bulkTextImportDialogAddFoldersButton")
    ).toBeNull();
  });

  it("nests the picker buttons inside the drag & drop target", () => {
    renderDialog();
    const dropArea = container.querySelector(".bulkTextImportDialogDropArea")!;
    expect(dropArea.contains(addFilesButton())).toBe(true);
    expect(dropArea.contains(addFoldersButton())).toBe(true);
  });
});
