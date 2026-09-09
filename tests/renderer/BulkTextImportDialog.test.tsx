// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
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

function cssRule(selector: string): string {
  const styles = readFileSync("src/renderer/styles.css", "utf8");
  const start = styles.indexOf(`${selector} {`);
  expect(start).toBeGreaterThan(-1);
  const end = styles.indexOf("}", start);
  expect(end).toBeGreaterThan(start);
  return styles.slice(start, end + 1);
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

  it("starts destination-first with source adding disabled until a destination is selected", async () => {
    const getDroppedFilePaths = vi.fn((files: readonly File[]) =>
      files.map((file) => file.name)
    );
    const pickSources = vi.fn(async () => ["/ext/picked.txt"]);
    const onDryRun = vi.fn(async () => okResult([fileRow()]));
    renderDialog({ getDroppedFilePaths, pickSources, onDryRun });

    expect(
      container.querySelector("[data-testid='bulkTextImportDestinationValue']")
        ?.textContent
    ).toBe("取り込み先フォルダを選択してください。");
    expect(
      container.querySelector(".bulkTextImportDialogDropArea")?.getAttribute(
        "aria-disabled"
      )
    ).toBe("true");
    expect(container.textContent).toContain(
      "取り込み先フォルダを選択すると、テキストファイルまたはフォルダを追加できます。"
    );
    expect(
      container.querySelector<HTMLButtonElement>(
        ".bulkTextImportDialogAddFilesButton"
      )?.disabled
    ).toBe(true);
    expect(
      container.querySelector<HTMLButtonElement>(
        ".bulkTextImportDialogAddFoldersButton"
      )?.disabled
    ).toBe(true);
    expect(
      container.querySelector<HTMLButtonElement>(
        ".bulkTextImportDialogImportButton"
      )?.disabled
    ).toBe(true);
    expect(
      container.querySelector(".bulkTextImportDialogFileEncodingSelect")
    ).toBeNull();

    dropFiles(["/ext/ignored.txt"]);
    await flush();
    expect(getDroppedFilePaths).not.toHaveBeenCalled();
    expect(
      container.querySelector("[data-testid='bulkTextImportSourceCount']")
    ).toBeNull();
    expect(onDryRun).not.toHaveBeenCalled();

    const addFiles = container.querySelector<HTMLButtonElement>(
      ".bulkTextImportDialogAddFilesButton"
    )!;
    const addFolders = container.querySelector<HTMLButtonElement>(
      ".bulkTextImportDialogAddFoldersButton"
    )!;
    act(() => {
      addFiles.disabled = false;
      addFiles.click();
      addFolders.disabled = false;
      addFolders.click();
    });
    await flush();
    expect(pickSources).not.toHaveBeenCalled();
    expect(onDryRun).not.toHaveBeenCalled();

    await chooseDestination("docs");
    expect(
      container.querySelector(".bulkTextImportDialogDropArea")?.getAttribute(
        "aria-disabled"
      )
    ).toBe("false");
    expect(addFiles.disabled).toBe(false);
    expect(addFolders.disabled).toBe(false);

    dropFiles(["/ext/accepted.txt"]);
    await flush();
    expect(getDroppedFilePaths).toHaveBeenCalledTimes(1);
    expect(
      container.querySelector("[data-testid='bulkTextImportSourceCount']")
        ?.textContent
    ).toContain("1");
    expect(onDryRun).toHaveBeenCalledTimes(1);
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

  it("shows a decorative folder icon per row that flips to the open variant on expand (#420)", async () => {
    renderDialog({ listFolders: defaultListFolders() });
    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          ".bulkTextImportDialogSelectDestinationButton"
        )!
        .click();
    });
    await flush();

    // root row: open-folder icon, decorative
    const rootIcon = container
      .querySelector<HTMLElement>(".textImportDestinationPickerRoot")!
      .querySelector<HTMLImageElement>(".textImportDestinationPickerFolderIcon")!;
    expect(rootIcon.tagName).toBe("IMG");
    expect(rootIcon.getAttribute("data-folder-icon")).toBe("folder-open");
    expect(rootIcon.getAttribute("aria-hidden")).toBe("true");
    expect(rootIcon.getAttribute("alt")).toBe("");

    const rows = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          ".textImportDestinationPickerRow"
        )
      );

    // collapsed folder row: twisty → icon → name, closed-folder icon
    const firstRow = rows()[0];
    const children = Array.from(firstRow.children);
    expect(
      children[0].classList.contains("textImportDestinationPickerTwisty")
    ).toBe(true);
    expect(
      children[1].classList.contains("textImportDestinationPickerFolderIcon")
    ).toBe(true);
    expect(
      children[2].classList.contains("textImportDestinationPickerName")
    ).toBe(true);
    expect(children[2].textContent).toBe("docs");
    const icon = firstRow.querySelector<HTMLImageElement>(
      ".textImportDestinationPickerFolderIcon"
    )!;
    expect(icon.getAttribute("data-folder-icon")).toBe("folder");
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(icon.getAttribute("alt")).toBe("");

    // expand → aria-expanded flips and the icon becomes the open variant
    const twisty = firstRow.querySelector<HTMLButtonElement>(
      ".textImportDestinationPickerTwisty"
    )!;
    expect(twisty.getAttribute("aria-expanded")).toBe("false");
    act(() => {
      twisty.click();
    });
    await flush();

    const expandedRow = rows()[0];
    expect(
      expandedRow
        .querySelector(".textImportDestinationPickerTwisty")
        ?.getAttribute("aria-expanded")
    ).toBe("true");
    expect(
      expandedRow
        .querySelector(".textImportDestinationPickerFolderIcon")
        ?.getAttribute("data-folder-icon")
    ).toBe("folder-open");
    // folder name / selection button unaffected
    expect(
      expandedRow.querySelector(".textImportDestinationPickerName")?.textContent
    ).toBe("docs");
  });

  it("labels the project root selection with the root label", async () => {
    renderDialog();
    await chooseDestination("");
    expect(
      container.querySelector("[data-testid='bulkTextImportDestinationValue']")
        ?.textContent
    ).toBe("/（プロジェクト直下）");
    expect(
      container.querySelector(".bulkTextImportDialogDropArea")?.getAttribute(
        "aria-disabled"
      )
    ).toBe("false");
    expect(
      container.querySelector<HTMLButtonElement>(
        ".bulkTextImportDialogAddFilesButton"
      )?.disabled
    ).toBe(false);
    expect(
      container.querySelector<HTMLButtonElement>(
        ".bulkTextImportDialogAddFoldersButton"
      )?.disabled
    ).toBe(false);
  });

  it("collects dropped file paths through the injected resolver and dedupes them", async () => {
    const getDroppedFilePaths = vi.fn((files: readonly File[]) =>
      files.map((file) => file.name)
    );
    renderDialog({ getDroppedFilePaths });
    await chooseDestination("docs");

    dropFiles(["/ext/a.txt", "/ext/b.txt"]);
    dropFiles(["/ext/b.txt", "/ext/c.txt"]);
    await flush();

    expect(getDroppedFilePaths).toHaveBeenCalledTimes(2);
    expect(
      container.querySelector("[data-testid='bulkTextImportSourceCount']")
        ?.textContent
    ).toContain("3");
    expect(container.querySelector(".bulkTextImportDialogSourceList")).toBeNull();
    expect(
      container.querySelector(".bulkTextImportDialogRemoveSourceButton")
    ).toBeNull();
  });

  it("does not render the individual source list or per-source remove buttons", async () => {
    renderDialog();
    await chooseDestination("docs");
    dropFiles(["/ext/a.txt", "/ext/b.txt"]);
    await flush();

    expect(
      container.querySelector("[data-testid='bulkTextImportSourceCount']")
        ?.textContent
    ).toContain("2");
    expect(container.querySelector(".bulkTextImportDialogSourcePath")).toBeNull();
    expect(
      container.querySelector(".bulkTextImportDialogRemoveSourceButton")
    ).toBeNull();
  });

  it("runs the dry-run only once both inputs are ready, and only dryRunTextImport", async () => {
    const onDryRun = vi.fn(async () => okResult([fileRow()]));
    renderDialog({ onDryRun });

    await chooseDestination("docs");
    expect(onDryRun).not.toHaveBeenCalled();

    dropFiles(["/ext/a.txt"]);
    await flush();

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
        okResult([
          fileRow({
            id: "s2",
            sourcePath: "/ext/b.txt",
            sourceDisplayPath: "b.txt"
          })
        ])
      );
    });
    await flush();
    expect(container.textContent).toContain("b.txt");

    // Stale (older) response arrives late and must be ignored.
    await act(async () => {
      first.resolve(
        okResult([
          fileRow({
            id: "s1",
            sourcePath: "/ext/a-stale.txt",
            sourceDisplayPath: "a-stale.txt"
          })
        ])
      );
    });
    await flush();
    expect(container.textContent).toContain("b.txt");
    expect(container.textContent).not.toContain("a-stale.txt");
  });

  it("renders file rows as a compact two-line path and preview layout", async () => {
    const onDryRun = vi.fn(async () =>
      okResult([
        fileRow({
          sourcePath: "/very/long/source/path/手記.txt",
          sourceDisplayPath: "手記.txt",
          targetProjectRelativePath: "docs/手記.md",
          selectedEncoding: "shiftJis",
          bomKind: "none",
          previewHead: "はじまり\r\n二行目",
          previewTail: "おわり\n終端"
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
    expect(row?.getAttribute("data-status-kind")).toBe("readable");
    expect(row?.querySelector(".bulkTextImportDialogFileStatusSymbol")?.textContent)
      .toBe("✓");
    expect(
      row?.querySelector(".bulkTextImportDialogFileStatusSymbol")?.getAttribute(
        "aria-label"
      )
    ).toBe("読取OK");
    expect(row?.querySelector(".bulkTextImportDialogFileMain")).not.toBeNull();
    expect(
      row?.querySelector(".bulkTextImportDialogFilePathLine")
    ).not.toBeNull();
    expect(
      row?.querySelector(".bulkTextImportDialogFilePreviewLine")
    ).not.toBeNull();
    expect(
      row?.querySelector(".bulkTextImportDialogFileEncoding")
    ).not.toBeNull();
    expect(
      row?.querySelector(".bulkTextImportDialogFileEncodingLabel")
    ).toBeNull();
    expect(row?.querySelector(".bulkTextImportDialogFileBom")).toBeNull();
    expect(row?.textContent).not.toContain("文字コード");

    const source = row?.querySelector<HTMLElement>(
      ".bulkTextImportDialogFileSource"
    );
    const target = row?.querySelector<HTMLElement>(
      ".bulkTextImportDialogFileTarget"
    );
    // #420 Step 8: the row shows only the file name; the parent folder is on
    // the source-folder group header. The full path stays in `title`.
    expect(source?.textContent).toBe("手記.txt");
    expect(target?.textContent).toBe("docs/手記.md");
    expect(source?.className).toContain(
      "bulkTextImportDialogSourcePathLeftEllipsis"
    );
    expect(target?.className).toContain(
      "bulkTextImportDialogTargetPathEllipsis"
    );
    expect(source?.title).toContain("/very/long/source/path/手記.txt");
    expect(target?.title).toContain("docs/手記.md");
    expect(row?.querySelector(".bulkTextImportDialogFilePathArrow")?.textContent)
      .toBe("▶");
    const select = row?.querySelector<HTMLSelectElement>(
      ".bulkTextImportDialogFileEncodingSelect"
    );
    expect(select?.value).toBe("shiftJis");
    expect(select?.getAttribute("aria-label")).toContain("手記.txt");
    expect(Array.from(select?.options ?? []).map((option) => option.text)).toContain(
      "処理スキップ"
    );
    expect(Array.from(select?.options ?? []).map((option) => option.text)).toContain(
      "Shift_JIS / CP932"
    );
    const previewHead = row?.querySelector<HTMLElement>(
      ".bulkTextImportDialogFilePreviewHead"
    );
    const previewTail = row?.querySelector<HTMLElement>(
      ".bulkTextImportDialogFilePreviewTail"
    );
    // #420 Step 8: display-only truncation hint — `head…` / `…tail`.
    expect(previewHead?.textContent).toBe("はじまり二行目...");
    expect(previewTail?.textContent).toBe("...おわり終端");
    expect(previewHead?.textContent).not.toContain("\r");
    expect(previewHead?.textContent).not.toContain("\n");
    expect(previewTail?.textContent).not.toContain("\r");
    expect(previewTail?.textContent).not.toContain("\n");
  });

  it("keeps the compact file-row CSS as a two-row grid with centered side areas", () => {
    expect(cssRule(".appDialog.bulkTextImportDialog")).toContain(
      "width: min(92vw, 1200px)"
    );
    expect(cssRule(".bulkTextImportDialogFileRow")).toContain("display: grid");
    expect(cssRule(".bulkTextImportDialogFileRow")).toContain(
      "grid-template-columns: auto minmax(0, 1fr) auto"
    );
    expect(cssRule(".bulkTextImportDialogFileStatusSymbol")).toContain(
      "grid-row: 1 / span 2"
    );
    expect(cssRule(".bulkTextImportDialogFileStatusSymbol")).toContain(
      "align-self: center"
    );
    expect(cssRule(".bulkTextImportDialogFileEncoding")).toContain(
      "grid-row: 1 / span 2"
    );
    expect(cssRule(".bulkTextImportDialogFileEncoding")).toContain(
      "align-self: center"
    );
    expect(cssRule(".bulkTextImportDialogFilePreviewLine")).toContain(
      "grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)"
    );
  });

  it("right-aligns source paths with left ellipsis and left-aligns target paths", () => {
    const sourceRule = cssRule(".bulkTextImportDialogSourcePathLeftEllipsis");
    expect(sourceRule).toContain("text-align: right");
    expect(sourceRule).toContain("text-overflow: ellipsis");
    expect(sourceRule).toContain("direction: rtl");
    expect(sourceRule).toContain("unicode-bidi: plaintext");

    const targetRule = cssRule(".bulkTextImportDialogTargetPathEllipsis");
    expect(targetRule).toContain("text-align: left");
    expect(targetRule).toContain("text-overflow: ellipsis");
    expect(targetRule).not.toContain("direction: rtl");
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
    expect(row?.getAttribute("data-status-kind")).toBe("skipped");
    const symbol = row?.querySelector<HTMLElement>(
      ".bulkTextImportDialogFileStatusSymbol"
    );
    expect(symbol?.textContent).toBe("⊘");
    expect(symbol?.title).toContain("処理スキップ");
    expect(symbol?.getAttribute("aria-label")).toContain("処理スキップ");
    expect(row?.textContent).toContain(
      t("ja", "textImport.dialog.skipReason.targetExists")
    );
    expect(
      row?.querySelector(".bulkTextImportDialogFilePreviewLine")
    ).not.toBeNull();
    expect(row?.textContent).not.toContain("SHOULD-NOT-SHOW");
  });

  it("shows a renamed status symbol and the actual target path when a file was renamed", async () => {
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
    expect(row?.getAttribute("data-status-kind")).toBe("renamed");
    const symbol = row?.querySelector<HTMLElement>(
      ".bulkTextImportDialogFileStatusSymbol"
    );
    expect(symbol?.textContent).toBe("!");
    expect(symbol?.title).toContain("名前が変わる");
    expect(symbol?.title).toContain("docs/notes-1.md");
    expect(row?.querySelector(".bulkTextImportDialogFileTarget")?.textContent)
      .toBe("docs/notes-1.md");
  });

  it("gives skipped status priority over renamed status", async () => {
    const onDryRun = vi.fn(async () =>
      okResult([
        fileRow({
          renamed: true,
          skipped: true,
          skipReason: "invalidProjectPath",
          targetProjectRelativePath: "docs/renamed.md"
        })
      ])
    );
    renderDialog({ onDryRun });

    await chooseDestination("docs");
    dropFiles(["/ext/notes.txt"]);
    await flush();

    const row = firstFileRow();
    expect(row.getAttribute("data-status-kind")).toBe("skipped");
    expect(
      row.querySelector(".bulkTextImportDialogFileStatusSymbol")?.textContent
    ).toBe("⊘");
  });

  it("gives manual skip status priority over renamed status", async () => {
    const onDryRun = vi.fn(async () =>
      okResult([
        fileRow({
          renamed: true,
          targetProjectRelativePath: "docs/notes.imported.md"
        })
      ])
    );
    renderDialog({ onDryRun });

    await chooseDestination("docs");
    dropFiles(["/ext/notes.txt"]);
    await flush();
    await changeEncoding(encodingSelects()[0], "skip");

    const row = firstFileRow();
    expect(row.getAttribute("data-status-kind")).toBe("skipped");
    expect(
      row.querySelector(".bulkTextImportDialogFileStatusSymbol")?.textContent
    ).toBe("⊘");
  });

  it("drops the separate folder-summary section — folder groups carry the rows (#420 Step 8)", async () => {
    const onDryRun = vi.fn(async () =>
      okResult(
        [
          fileRow({
            id: "a1",
            sourcePath: "/ext/chapter/a1.txt",
            sourceDisplayPath: "a1.txt",
            targetProjectRelativePath: "docs/chapter/a1.md"
          }),
          fileRow({
            id: "a2",
            sourcePath: "/ext/chapter/a2.txt",
            sourceDisplayPath: "a2.txt",
            skipped: true,
            skipReason: "targetExists"
          })
        ],
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

    // no separated folder summary / flat file section any more
    expect(container.querySelector(".bulkTextImportDialogFolderRow")).toBeNull();
    expect(
      container.querySelector(".bulkTextImportDialogFolderGroup")
    ).toBeNull();

    // one source-folder group, holding both compact file rows
    const scope = container.querySelector<HTMLElement>(
      ".bulkTextImportDialogFolderScope"
    );
    expect(scope).not.toBeNull();
    expect(scope?.textContent).toContain("/ext/chapter");
    expect(
      scope?.querySelectorAll(".bulkTextImportDialogFileRow")
    ).toHaveLength(2);
    expect(
      scope?.querySelector(".bulkTextImportDialogFolderEncodingSelect")
    ).not.toBeNull();
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
    expect(
      container.querySelector("[data-testid='bulkTextImportSourceCount']")
    ).toBeNull();
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
    expect(
      Array.from(selects[0].options).map((option) => option.text)
    ).toContain("処理スキップ");
    expect(firstFileRow().querySelector(".bulkTextImportDialogFileEncodingLabel"))
      .toBeNull();
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

  it("applies previewHead / previewTail on preview success without showing BOM", async () => {
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
    expect(row.querySelector(".bulkTextImportDialogFileBom")).toBeNull();
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
    expect(
      row.querySelector(".bulkTextImportDialogFilePreviewLine")
    ).not.toBeNull();
    expect(
      row.querySelector(".bulkTextImportDialogFileEncoding")
    ).not.toBeNull();
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
        fileRow({
          id: "normal",
          sourcePath: "/ext/normal.txt",
          sourceDisplayPath: "normal.txt"
        }),
        fileRow({
          id: "decode",
          sourcePath: "/ext/decode.txt",
          sourceDisplayPath: "decode.txt",
          skipped: true,
          skipReason: "decodeFailed"
        }),
        fileRow({
          id: "exists",
          sourcePath: "/ext/exists.txt",
          sourceDisplayPath: "exists.txt",
          skipped: true,
          skipReason: "targetExists"
        }),
        fileRow({
          id: "nottext",
          sourcePath: "/ext/nottext.bin",
          sourceDisplayPath: "nottext.bin",
          skipped: true,
          skipReason: "notTextFile"
        }),
        fileRow({
          id: "missing",
          sourcePath: "/ext/missing.txt",
          sourceDisplayPath: "missing.txt",
          skipped: true,
          skipReason: "sourceMissing"
        }),
        fileRow({
          id: "unreadable",
          sourcePath: "/ext/unreadable.txt",
          sourceDisplayPath: "unreadable.txt",
          skipped: true,
          skipReason: "sourceUnreadable"
        }),
        fileRow({
          id: "unsupported",
          sourcePath: "/ext/unsupported",
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
    expect(row.getAttribute("data-status-kind")).toBe("readable");
    const symbol = row.querySelector<HTMLElement>(
      ".bulkTextImportDialogFileStatusSymbol"
    );
    expect(symbol?.textContent).toBe("✓");
    expect(symbol?.title).toContain("選択した文字コードで読み取れました。");
    expect(symbol?.getAttribute("aria-label")).toContain(
      "選択した文字コードで読み取れました。"
    );
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

  it("marks a row manually skipped from the encoding dropdown without previewing", async () => {
    const onPreview = vi.fn(
      async (r: PreviewTextImportFilesRequest) => previewOk(r.files[0].id)
    );
    const onExecute = vi.fn(
      async (): Promise<ExecuteTextImportResult> => ({
        ok: true,
        imported: [],
        skipped: [],
        failed: []
      })
    );
    await readyForImport({ onPreview, onExecute }, [fileRow({ id: "f1" })]);

    await changeEncoding(encodingSelects()[0], "skip");

    const row = firstFileRow();
    expect(encodingSelects()[0].value).toBe("skip");
    expect(row.getAttribute("data-skipped")).toBe("true");
    expect(row.getAttribute("data-status-kind")).toBe("skipped");
    expect(
      row.querySelector(".bulkTextImportDialogFileStatusSymbol")?.textContent
    ).toBe("⊘");
    expect(row.textContent).toContain("処理スキップ");
    expect(onPreview).not.toHaveBeenCalled();
    expect(importButton().disabled).toBe(true);

    clickImport();
    await flush();
    expect(onExecute).not.toHaveBeenCalled();
  });

  it("clears manual skip by choosing an encoding again and refreshes the preview", async () => {
    const onPreview = vi.fn(async (r: PreviewTextImportFilesRequest) =>
      previewOk(r.files[0].id, {
        previewHead: "復帰した冒頭",
        previewTail: "復帰した末尾"
      })
    );
    await readyForImport({ onPreview }, [
      fileRow({ id: "f1", selectedEncoding: "shiftJis" })
    ]);

    await changeEncoding(encodingSelects()[0], "skip");
    expect(onPreview).not.toHaveBeenCalled();
    expect(importButton().disabled).toBe(true);

    await changeEncoding(encodingSelects()[0], "shiftJis");

    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onPreview).toHaveBeenCalledWith({
      files: [
        { id: "f1", sourcePath: "/ext/notes.txt", encoding: "shiftJis" }
      ]
    });
    expect(encodingSelects()[0].value).toBe("shiftJis");
    expect(firstFileRow().getAttribute("data-status-kind")).toBe("readable");
    expect(
      firstFileRow().querySelector(".bulkTextImportDialogFileStatusSymbol")
        ?.textContent
    ).toBe("✓");
    expect(firstFileRow().textContent).toContain("復帰した冒頭");
    expect(importButton().disabled).toBe(false);
  });

  it("excludes a manually skipped row from the execute request while keeping other rows importable", async () => {
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
    await readyForImport({ onExecute }, [
      fileRow({
        id: "a",
        sourcePath: "/ext/a.txt",
        sourceDisplayPath: "a.txt",
        targetProjectRelativePath: "docs/a.md"
      }),
      fileRow({
        id: "b",
        sourcePath: "/ext/b.txt",
        sourceDisplayPath: "b.txt",
        targetProjectRelativePath: "docs/b.md"
      })
    ]);

    await changeEncoding(encodingSelects()[1], "skip");
    expect(importButton().disabled).toBe(false);

    clickImport();
    await flush();

    expect(onExecute).toHaveBeenCalledWith({
      destinationFolderProjectRelativePath: "docs",
      files: [
        {
          sourcePath: "/ext/a.txt",
          targetProjectRelativePath: "docs/a.md",
          encoding: "shiftJis"
        }
      ],
      normalizeLineEndings: true
    });
  });

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
      ],
      normalizeLineEndings: true
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
      ],
      normalizeLineEndings: true
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
  function sourceCountText(): string | null | undefined {
    return container.querySelector("[data-testid='bulkTextImportSourceCount']")
      ?.textContent;
  }

  it("adds paths chosen from the file picker button to the source list", async () => {
    const pickSources = vi.fn(async (kind: "files" | "folders") =>
      kind === "files" ? ["/ext/a.txt", "/ext/b.txt"] : []
    );
    renderDialog({ pickSources });
    await chooseDestination("docs");

    act(() => {
      addFilesButton().click();
    });
    await flush();

    expect(pickSources).toHaveBeenCalledWith("files");
    expect(sourceCountText()).toContain("2");
    expect(container.querySelector(".bulkTextImportDialogSourcePath")).toBeNull();
  });

  it("adds paths chosen from the folder picker button to the source list", async () => {
    const pickSources = vi.fn(async (kind: "files" | "folders") =>
      kind === "folders" ? ["/ext/chapters"] : []
    );
    renderDialog({ pickSources });
    await chooseDestination("docs");

    act(() => {
      addFoldersButton().click();
    });
    await flush();

    expect(pickSources).toHaveBeenCalledWith("folders");
    expect(sourceCountText()).toContain("1");
    expect(container.querySelector(".bulkTextImportDialogSourcePath")).toBeNull();
  });

  it("does not add a duplicate path from the picker", async () => {
    const pickSources = vi
      .fn()
      .mockResolvedValueOnce(["/ext/a.txt", "/ext/b.txt"])
      .mockResolvedValueOnce(["/ext/b.txt", "/ext/c.txt"]);
    renderDialog({ pickSources });
    await chooseDestination("docs");

    act(() => {
      addFilesButton().click();
    });
    await flush();
    act(() => {
      addFilesButton().click();
    });
    await flush();

    expect(sourceCountText()).toContain("3");
  });

  it("leaves the source list unchanged when the picker is cancelled", async () => {
    const pickSources = vi
      .fn()
      .mockResolvedValueOnce(["/ext/a.txt"])
      .mockResolvedValueOnce([]);
    renderDialog({ pickSources });
    await chooseDestination("docs");

    act(() => {
      addFilesButton().click();
    });
    await flush();
    expect(sourceCountText()).toContain("1");

    act(() => {
      addFilesButton().click();
    });
    await flush();
    expect(sourceCountText()).toContain("1");
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

  // ---------------------------------------------------------------------------
  // #420 Step 8: source batch + source folder grouping, bulk encoding controls
  // ---------------------------------------------------------------------------

  function batchSelect(): HTMLSelectElement {
    return container.querySelector<HTMLSelectElement>(
      ".bulkTextImportDialogBatchEncodingSelect"
    )!;
  }
  function folderSelects(): HTMLSelectElement[] {
    return Array.from(
      container.querySelectorAll<HTMLSelectElement>(
        ".bulkTextImportDialogFolderEncodingSelect"
      )
    );
  }
  function folderScopes(): HTMLElement[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>(".bulkTextImportDialogFolderScope")
    );
  }

  const twoFolderRows = [
    fileRow({
      id: "a1",
      sourcePath: "/ext/input/A/a1.txt",
      sourceDisplayPath: "a1.txt",
      targetProjectRelativePath: "docs/A/a1.md"
    }),
    fileRow({
      id: "a2",
      sourcePath: "/ext/input/A/a2.txt",
      sourceDisplayPath: "a2.txt",
      targetProjectRelativePath: "docs/A/a2.md"
    }),
    fileRow({
      id: "b1",
      sourcePath: "/ext/input/B/b1.txt",
      sourceDisplayPath: "b1.txt",
      targetProjectRelativePath: "docs/B/b1.md"
    })
  ];

  async function readyGrouped(
    props: Partial<BulkTextImportDialogProps> = {},
    files: readonly TextImportDryRunFile[] = twoFolderRows,
    dropped: readonly string[] = ["/ext/input/A", "/ext/input/B"]
  ): Promise<BulkTextImportDialogProps> {
    const resolved = renderDialog({
      onDryRun: vi.fn(async () => okResult(files)),
      onPreview: vi.fn(
        async (r: PreviewTextImportFilesRequest) => previewOk(r.files[0]?.id ?? "a1")
      ),
      ...props
    });
    await chooseDestination("docs");
    dropFiles(dropped);
    await flush();
    return resolved;
  }

  it("groups file rows by source batch and then by source folder, with counts", async () => {
    await readyGrouped();

    const batchHeader = container.querySelector<HTMLElement>(
      ".bulkTextImportDialogBatchHeader"
    );
    expect(batchHeader?.textContent).toContain("D&D追加 1");
    expect(batchHeader?.textContent).toContain("3 ファイル");
    expect(batchSelect()).not.toBeNull();

    const scopes = folderScopes();
    expect(scopes).toHaveLength(2);
    expect(scopes[0].textContent).toContain("/ext/input/A");
    expect(scopes[0].textContent).toContain("2 ファイル");
    expect(scopes[1].textContent).toContain("/ext/input/B");
    expect(scopes[1].textContent).toContain("1 ファイル");
    expect(folderSelects()).toHaveLength(2);
    // the compact per-file rows are preserved inside each folder scope
    expect(
      scopes[0].querySelectorAll(".bulkTextImportDialogFileRow")
    ).toHaveLength(2);
  });

  it("offers the seven encodings plus 処理スキップ in the bulk selectors", async () => {
    await readyGrouped();
    const options = Array.from(batchSelect().options).map((o) => o.text);
    for (const label of [
      "UTF-8",
      "UTF-8 BOM",
      "Shift_JIS / CP932",
      "EUC-JP",
      "UTF-16 LE",
      "UTF-16 BE",
      "ISO-2022-JP",
      "処理スキップ"
    ]) {
      expect(options).toContain(label);
    }
  });

  it("applies a batch encoding to every row with a single batch preview IPC", async () => {
    const onPreview = vi.fn(
      async (r: PreviewTextImportFilesRequest) =>
        ({
          ok: true,
          files: r.files.map((f) => ({
            ok: true,
            id: f.id,
            sourcePath: f.sourcePath,
            encoding: f.encoding,
            bomKind: "none" as const,
            previewHead: "冒頭",
            previewTail: "末尾"
          }))
        }) satisfies PreviewTextImportFilesResult
    );
    await readyGrouped({ onPreview });

    await changeEncoding(batchSelect(), "eucJp");

    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onPreview.mock.calls[0][0].files.map((f: any) => f.id).sort()).toEqual(
      ["a1", "a2", "b1"]
    );
    expect(onPreview.mock.calls[0][0].files.every((f: any) => f.encoding === "eucJp")).toBe(
      true
    );
    expect(encodingSelects().map((s) => s.value)).toEqual([
      "eucJp",
      "eucJp",
      "eucJp"
    ]);
  });

  it("applies a folder encoding only to that folder's rows", async () => {
    const onPreview = vi.fn(
      async (r: PreviewTextImportFilesRequest) =>
        ({
          ok: true,
          files: r.files.map((f) => ({
            ok: true,
            id: f.id,
            sourcePath: f.sourcePath,
            encoding: f.encoding,
            bomKind: "none" as const,
            previewHead: "x",
            previewTail: "y"
          }))
        }) satisfies PreviewTextImportFilesResult
    );
    await readyGrouped({ onPreview });

    await changeEncoding(folderSelects()[0], "eucJp");

    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onPreview.mock.calls[0][0].files.map((f: any) => f.id).sort()).toEqual([
      "a1",
      "a2"
    ]);
    // folder A rows switch; folder B row keeps its dry-run encoding (shiftJis)
    expect(encodingSelects().map((s) => s.value)).toEqual([
      "eucJp",
      "eucJp",
      "shiftJis"
    ]);
  });

  it("bulk-skips a whole batch without previewing and disables Import", async () => {
    const onPreview = vi.fn(
      async (r: PreviewTextImportFilesRequest) => previewOk(r.files[0].id)
    );
    await readyGrouped({ onPreview });

    await changeEncoding(batchSelect(), "skip");

    const rows = Array.from(
      container.querySelectorAll<HTMLElement>(".bulkTextImportDialogFileRow")
    );
    expect(rows.every((r) => r.getAttribute("data-skipped") === "true")).toBe(true);
    expect(
      rows.every(
        (r) =>
          r.querySelector(".bulkTextImportDialogFileStatusSymbol")?.textContent ===
          "⊘"
      )
    ).toBe(true);
    expect(onPreview).not.toHaveBeenCalled();
    expect(importButton().disabled).toBe(true);
  });

  it("bulk-skips only one source folder", async () => {
    await readyGrouped();

    await changeEncoding(folderSelects()[1], "skip");

    const scopes = folderScopes();
    const folderARows = Array.from(
      scopes[0].querySelectorAll<HTMLElement>(".bulkTextImportDialogFileRow")
    );
    const folderBRows = Array.from(
      scopes[1].querySelectorAll<HTMLElement>(".bulkTextImportDialogFileRow")
    );
    expect(folderARows.every((r) => r.getAttribute("data-skipped") === "false")).toBe(
      true
    );
    expect(folderBRows.every((r) => r.getAttribute("data-skipped") === "true")).toBe(
      true
    );
    // still importable via folder A
    expect(importButton().disabled).toBe(false);
  });

  it("shows the bulk selector as 混在 when a file-level override diverges", async () => {
    await readyGrouped();
    // batch initially agrees on the dry-run encoding
    expect(batchSelect().value).toBe("shiftJis");

    await changeEncoding(encodingSelects()[0], "eucJp");

    expect(batchSelect().value).toBe("mixed");
    expect(Array.from(batchSelect().options).map((o) => o.text)).toContain("混在");
    // the folder that still agrees keeps a concrete value
    expect(folderSelects()[1].value).toBe("shiftJis");
  });

  it("drops a stale bulk preview response when a second bulk apply starts", async () => {
    const first = deferred<PreviewTextImportFilesResult>();
    const second = deferred<PreviewTextImportFilesResult>();
    const onPreview = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    await readyGrouped({ onPreview });

    await changeEncoding(batchSelect(), "eucJp");
    await changeEncoding(batchSelect(), "utf16be");
    expect(onPreview).toHaveBeenCalledTimes(2);

    await act(async () => {
      second.resolve({
        ok: true,
        files: ["a1", "a2", "b1"].map((id) => ({
          ok: true,
          id,
          sourcePath: `/ext/${id}`,
          encoding: "utf16be",
          bomKind: "none",
          previewHead: "second",
          previewTail: "t"
        }))
      });
    });
    await flush();
    expect(container.textContent).toContain("second");

    await act(async () => {
      first.resolve({
        ok: true,
        files: ["a1", "a2", "b1"].map((id) => ({
          ok: true,
          id,
          sourcePath: `/ext/${id}`,
          encoding: "eucJp",
          bomKind: "none",
          previewHead: "STALE",
          previewTail: "t"
        }))
      });
    });
    await flush();
    expect(container.textContent).not.toContain("STALE");
  });

  it("honours a BOM-derived initial encoding and lets a bulk apply override it", async () => {
    const onPreview = vi.fn(
      async (r: PreviewTextImportFilesRequest) => previewOk(r.files[0].id)
    );
    await readyGrouped(
      { onPreview },
      [
        fileRow({
          id: "bom",
          sourcePath: "/ext/input/A/bom.txt",
          sourceDisplayPath: "bom.txt",
          targetProjectRelativePath: "docs/A/bom.md",
          selectedEncoding: "utf8Bom",
          bomKind: "utf8"
        })
      ],
      ["/ext/input/A"]
    );

    // renderer never reads the BOM — it trusts the dry-run's selectedEncoding
    expect(encodingSelects()[0].value).toBe("utf8Bom");
    expect(container.querySelector(".bulkTextImportDialogFileBom")).toBeNull();

    await changeEncoding(batchSelect(), "shiftJis");
    expect(encodingSelects()[0].value).toBe("shiftJis");
  });

  it("disables the bulk selectors before a destination is chosen and while importing", async () => {
    const gate = deferred<ExecuteTextImportResult>();
    // before a destination: no rows, so no bulk selectors at all
    renderDialog({ onExecute: vi.fn(() => gate.promise) });
    expect(container.querySelector(".bulkTextImportDialogBatchEncodingSelect")).toBeNull();

    await readyGrouped({ onExecute: vi.fn(() => gate.promise) });
    expect(batchSelect().disabled).toBe(false);
    expect(folderSelects()[0].disabled).toBe(false);

    act(() => {
      importButton().click();
    });
    await flush();

    expect(batchSelect().disabled).toBe(true);
    expect(folderSelects()[0].disabled).toBe(true);

    await act(async () => {
      gate.resolve({ ok: true, imported: [], skipped: [], failed: [] });
    });
    await flush();
  });

  it("makes the source folder group the primary structure — header + rows together", async () => {
    await readyGrouped();

    // no separated summary sections
    expect(container.querySelector(".bulkTextImportDialogFolderRow")).toBeNull();
    expect(
      container.querySelector(".bulkTextImportDialogFolderGroup")
    ).toBeNull();

    const scopes = folderScopes();
    expect(scopes).toHaveLength(2);
    for (const scope of scopes) {
      // header shows the full source folder path, a file count and a bulk selector
      const header = scope.querySelector<HTMLElement>(
        ".bulkTextImportDialogFolderScopeHeader"
      )!;
      expect(header.textContent).toMatch(/\/ext\/input\/[AB]/);
      expect(header.textContent).toContain("ファイル");
      expect(
        header.querySelector(".bulkTextImportDialogFolderEncodingSelect")
      ).not.toBeNull();
      expect(
        header.querySelector(".bulkTextImportDialogFolderScopeToggle")
      ).not.toBeNull();
      // and the Step 7 compact rows live inside the same group
      const rowsInScope = scope.querySelectorAll(
        ".bulkTextImportDialogFileRow"
      );
      expect(rowsInScope.length).toBeGreaterThan(0);
      for (const row of Array.from(rowsInScope)) {
        expect(
          row.querySelector(".bulkTextImportDialogFileMain")
        ).not.toBeNull();
        expect(
          row.querySelector(".bulkTextImportDialogFileEncodingSelect")
        ).not.toBeNull();
      }
    }
  });

  it("keeps a batch-level bulk apply control above the folder groups", async () => {
    await readyGrouped();
    const batchGroup = container.querySelector<HTMLElement>(
      ".bulkTextImportDialogBatchGroup"
    )!;
    const header = batchGroup.querySelector<HTMLElement>(
      ".bulkTextImportDialogBatchHeader"
    )!;
    expect(header.textContent).toContain("D&D追加 1");
    expect(
      header.querySelector(".bulkTextImportDialogBatchEncodingSelect")
    ).not.toBeNull();
    // the folder groups are nested inside the same batch section
    expect(
      batchGroup.querySelectorAll(".bulkTextImportDialogFolderScope")
    ).toHaveLength(2);
  });

  it("collapses and expands a source folder group without touching the others", async () => {
    await readyGrouped();
    const scopes = folderScopes();
    expect(
      scopes[0].querySelectorAll(".bulkTextImportDialogFileRow")
    ).toHaveLength(2);

    const toggle = scopes[0].querySelector<HTMLButtonElement>(
      ".bulkTextImportDialogFolderScopeToggle"
    )!;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    act(() => {
      toggle.click();
    });

    const collapsed = folderScopes()[0];
    expect(collapsed.getAttribute("data-collapsed")).toBe("true");
    expect(
      collapsed.querySelectorAll(".bulkTextImportDialogFileRow")
    ).toHaveLength(0);
    // folder B is unaffected
    expect(
      folderScopes()[1].querySelectorAll(".bulkTextImportDialogFileRow")
    ).toHaveLength(1);

    act(() => {
      folderScopes()[0]
        .querySelector<HTMLButtonElement>(
          ".bulkTextImportDialogFolderScopeToggle"
        )!
        .click();
    });
    expect(
      folderScopes()[0].querySelectorAll(".bulkTextImportDialogFileRow")
    ).toHaveLength(2);
  });

  it("keeps the file-level dropdown behaviour intact inside a folder group", async () => {
    const onPreview = vi.fn(
      async (r: PreviewTextImportFilesRequest) =>
        previewOk(r.files[0].id, { previewHead: "個別更新" })
    );
    await readyGrouped({ onPreview });

    await changeEncoding(encodingSelects()[0], "utf16le");

    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onPreview.mock.calls[0][0].files).toEqual([
      { id: "a1", sourcePath: "/ext/input/A/a1.txt", encoding: "utf16le" }
    ]);
    expect(encodingSelects()[0].value).toBe("utf16le");
    // siblings untouched
    expect(encodingSelects()[1].value).toBe("shiftJis");
    expect(encodingSelects()[2].value).toBe("shiftJis");
    expect(firstFileRow().textContent).toContain("個別更新");
  });

  it("puts the source folder path immediately right of the ▼ toggle", async () => {
    await readyGrouped();
    const header = folderScopes()[0].querySelector<HTMLElement>(
      ".bulkTextImportDialogFolderScopeHeader"
    )!;
    const children = Array.from(header.children);
    // toggle first, then the full source folder path, then count / label / select
    expect(children[0].classList.contains("bulkTextImportDialogFolderScopeToggle")).toBe(
      true
    );
    expect(children[1].classList.contains("bulkTextImportDialogFolderScopePath")).toBe(
      true
    );
    expect(children[1].textContent).toBe("/ext/input/A");
    // the path is not reversed / right-aligned any more
    expect(
      children[1].classList.contains("bulkTextImportDialogSourcePathLeftEllipsis")
    ).toBe(false);
    // count / selector come after the path
    const selectIndex = children.findIndex((c) =>
      c.classList.contains("bulkTextImportDialogFolderEncodingSelect")
    );
    const pathIndex = children.findIndex((c) =>
      c.classList.contains("bulkTextImportDialogFolderScopePath")
    );
    expect(selectIndex).toBeGreaterThan(pathIndex);
  });

  // -------------------------------------------------------------------------
  // #420 Step 8: line-ending normalization toggle
  // -------------------------------------------------------------------------

  function lineEndingToggle(): HTMLInputElement {
    return container.querySelector<HTMLInputElement>(
      ".bulkTextImportDialogLineEndingToggleInput"
    )!;
  }
  async function setLineEndingToggle(checked: boolean): Promise<void> {
    if (lineEndingToggle().checked === checked) {
      return;
    }
    // A real click toggles `.checked` and fires React's onChange for a
    // controlled checkbox (dispatching a bare "change" event does not).
    act(() => {
      lineEndingToggle().click();
    });
    await flush();
  }

  it("shows the line-ending toggle, on by default, with its hint", async () => {
    renderDialog();
    expect(lineEndingToggle()).not.toBeNull();
    expect(lineEndingToggle().checked).toBe(true);
    expect(container.textContent).toContain(
      "改行コードをアプリケーション設定に揃える"
    );
    expect(container.textContent).toContain(
      "元のテキストファイルの改行コードを保持します"
    );
  });

  it("passes normalizeLineEndings: true to execute while the toggle is on", async () => {
    const props = await readyForImport();
    clickImport();
    await flush();
    expect(props.onExecute).toHaveBeenCalledWith(
      expect.objectContaining({ normalizeLineEndings: true })
    );
  });

  it("passes normalizeLineEndings: false once the toggle is turned off", async () => {
    const props = await readyForImport();
    await setLineEndingToggle(false);
    expect(lineEndingToggle().checked).toBe(false);

    clickImport();
    await flush();
    expect(props.onExecute).toHaveBeenCalledWith(
      expect.objectContaining({ normalizeLineEndings: false })
    );
  });

  it("does not re-run dry-run or preview when the toggle changes, but clears the result", async () => {
    const props = await readyForImport();
    clickImport();
    await flush();
    expect(container.textContent).toContain("取り込みが完了しました。");
    (props.onDryRun as ReturnType<typeof vi.fn>).mockClear();
    (props.onPreview as ReturnType<typeof vi.fn>).mockClear();

    await setLineEndingToggle(false);

    expect(props.onDryRun).not.toHaveBeenCalled();
    expect(props.onPreview).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("取り込みが完了しました。");
    expect(
      container.querySelector(".bulkTextImportDialogExecutionBanner")
    ).toBeNull();
  });

  it("disables the toggle while an import is running", async () => {
    const gate = deferred<ExecuteTextImportResult>();
    await readyForImport({ onExecute: vi.fn(() => gate.promise) });
    expect(lineEndingToggle().disabled).toBe(false);

    clickImport();
    await flush();
    expect(lineEndingToggle().disabled).toBe(true);

    await act(async () => {
      gate.resolve({ ok: true, imported: [], skipped: [], failed: [] });
    });
    await flush();
  });

  it("resets the toggle to on when the dialog is closed and reopened", async () => {
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
          />
        </>
      );
    }
    act(() => {
      root.render(<Harness />);
    });

    await chooseDestination("docs");
    await setLineEndingToggle(false);
    expect(lineEndingToggle().checked).toBe(false);

    act(() => {
      container
        .querySelector<HTMLButtonElement>(".bulkTextImportDialogCancelButton")
        ?.click();
    });
    act(() => {
      container.querySelector<HTMLButtonElement>("button")!.click();
    });
    await flush();

    expect(lineEndingToggle().checked).toBe(true);
  });

  it("renders the line-ending control as a toggle slider (switch semantics)", async () => {
    renderDialog();
    const input = lineEndingToggle();
    expect(input.getAttribute("type")).toBe("checkbox");
    expect(input.getAttribute("role")).toBe("switch");
    expect(input.getAttribute("aria-checked")).toBe("true");

    const wrapper = container.querySelector<HTMLElement>(
      ".bulkTextImportDialogLineEndingToggle"
    )!;
    expect(
      wrapper.querySelector(".bulkTextImportDialogLineEndingToggleSwitch")
    ).not.toBeNull();
    expect(
      wrapper.querySelector(".bulkTextImportDialogLineEndingToggleTrack")
    ).not.toBeNull();
    expect(
      wrapper.querySelector(".bulkTextImportDialogLineEndingToggleThumb")
    ).not.toBeNull();

    // label click toggles it (once a destination makes it interactive)
    await chooseDestination("docs");
    act(() => {
      container
        .querySelector<HTMLElement>(
          ".bulkTextImportDialogLineEndingToggleText"
        )!
        .click();
    });
    await flush();
    expect(lineEndingToggle().checked).toBe(false);
    expect(lineEndingToggle().getAttribute("aria-checked")).toBe("false");
  });

  it("disables the line-ending toggle until a destination folder is chosen", async () => {
    renderDialog();
    expect(lineEndingToggle().disabled).toBe(true);

    // a click while disabled is inert — stays on
    act(() => {
      lineEndingToggle().click();
    });
    await flush();
    expect(lineEndingToggle().checked).toBe(true);

    await chooseDestination("docs");
    expect(lineEndingToggle().disabled).toBe(false);

    // the project root ("") also counts as a destination
    // (re-render clean and pick the root)
    act(() => root.unmount());
    root = createRoot(container);
    renderDialog();
    expect(lineEndingToggle().disabled).toBe(true);
    await chooseDestination("");
    expect(lineEndingToggle().disabled).toBe(false);
  });

  it("shows only the file name in a grouped file row, with the full path on the group header and in title", async () => {
    await readyGrouped(
      {},
      [
        fileRow({
          id: "a1",
          sourcePath: "/ext/input/A/euc-jp.txt",
          sourceDisplayPath: "euc-jp.txt",
          targetProjectRelativePath: "decode/euc-jp.md"
        })
      ],
      ["/ext/input/A"]
    );

    const scope = folderScopes()[0];
    // parent path only on the folder group header
    expect(
      scope
        .querySelector(".bulkTextImportDialogFolderScopeHeader")
        ?.textContent
    ).toContain("/ext/input/A");

    const source = firstFileRow().querySelector<HTMLElement>(
      ".bulkTextImportDialogFileSource"
    )!;
    expect(source.textContent).toBe("euc-jp.txt");
    expect(source.textContent).not.toContain("/ext/input/A");
    // full sourcePath still available on the title
    expect(source.title).toContain("/ext/input/A/euc-jp.txt");

    // target keeps its project-relative path and left alignment
    const target = firstFileRow().querySelector<HTMLElement>(
      ".bulkTextImportDialogFileTarget"
    )!;
    expect(target.textContent).toBe("decode/euc-jp.md");
    expect(target.className).toContain(
      "bulkTextImportDialogTargetPathEllipsis"
    );
  });

  // -------------------------------------------------------------------------
  // #420 Step 8: preview head/tail truncation hint (display only)
  // -------------------------------------------------------------------------

  function previewHeadSpan(): HTMLElement {
    return firstFileRow().querySelector<HTMLElement>(
      ".bulkTextImportDialogFilePreviewHead"
    )!;
  }
  function previewTailSpan(): HTMLElement {
    return firstFileRow().querySelector<HTMLElement>(
      ".bulkTextImportDialogFilePreviewTail"
    )!;
  }

  it("appends ... to the head preview and prepends ... to the tail preview", async () => {
    await readyGrouped(
      {},
      [
        fileRow({
          id: "p1",
          sourcePath: "/ext/input/A/p1.txt",
          sourceDisplayPath: "p1.txt",
          previewHead: "先頭の20文字ぶんのテキスト",
          previewTail: "末尾の20文字ぶんのテキスト"
        })
      ],
      ["/ext/input/A"]
    );

    expect(previewHeadSpan().textContent).toBe("先頭の20文字ぶんのテキスト...");
    expect(previewTailSpan().textContent).toBe("...末尾の20文字ぶんのテキスト");
    // title carries the same decorated text
    expect(previewHeadSpan().title).toContain("先頭の20文字ぶんのテキスト...");
  });

  it("derives the ... hint per render — it does not accumulate or mutate state", async () => {
    const props = await readyForImport({}, [
      fileRow({
        id: "p1",
        previewHead: "あたま",
        previewTail: "しっぽ"
      })
    ]);
    expect(previewHeadSpan().textContent).toBe("あたま...");

    // an unrelated re-render (toggle) must not double the ellipsis
    act(() => {
      container
        .querySelector<HTMLInputElement>(
          ".bulkTextImportDialogLineEndingToggleInput"
        )!
        .click();
    });
    await flush();

    expect(previewHeadSpan().textContent).toBe("あたま...");
    expect(previewTailSpan().textContent).toBe("...しっぽ");
    // the underlying preview state is untouched: re-previewing sends the raw
    // text's encoding request, and a fresh success still renders `raw...`.
    expect(props.onDryRun).toHaveBeenCalledTimes(1);
  });

  it("shows the empty-preview placeholder alone, with no stray ...", async () => {
    await readyGrouped(
      {},
      [
        fileRow({
          id: "empty",
          sourcePath: "/ext/input/A/empty.txt",
          sourceDisplayPath: "empty.txt",
          previewHead: "",
          previewTail: ""
        })
      ],
      ["/ext/input/A"]
    );

    expect(previewHeadSpan().textContent).toBe(
      t("ja", "textImport.dialog.previewEmpty")
    );
    expect(previewHeadSpan().textContent).not.toContain("...");
    expect(previewTailSpan().textContent).not.toContain("...");
  });

  it("leaves skipped and preview-failed rows' preview text unchanged", async () => {
    // skipped (targetExists) row — shows the skip reason, not a `...` preview
    await readyGrouped(
      {},
      [
        fileRow({
          id: "skip",
          sourcePath: "/ext/input/A/skip.txt",
          sourceDisplayPath: "skip.txt",
          skipped: true,
          skipReason: "targetExists",
          previewHead: "見えないはず",
          previewTail: "見えないはず"
        })
      ],
      ["/ext/input/A"]
    );
    expect(firstFileRow().textContent).toContain(
      t("ja", "textImport.dialog.skipReason.targetExists")
    );
    expect(previewHeadSpan().textContent).not.toContain("見えないはず");
    expect(previewHeadSpan().textContent).not.toBe("見えないはず...");

    // preview-failed row — shows the failure message, not a `...` preview
    act(() => root.unmount());
    root = createRoot(container);
    const onPreview = vi.fn(
      async (r: PreviewTextImportFilesRequest) =>
        previewPerFileFailure(r.files[0].id, "decodeFailed")
    );
    await readyGrouped(
      { onPreview },
      [
        fileRow({
          id: "fail",
          sourcePath: "/ext/input/A/fail.txt",
          sourceDisplayPath: "fail.txt"
        })
      ],
      ["/ext/input/A"]
    );
    await changeEncoding(encodingSelects()[0], "eucJp");
    expect(firstFileRow().getAttribute("data-preview-status")).toBe("failed");
    expect(firstFileRow().textContent).toContain(
      "この文字コードではプレビューできません。"
    );
  });

  // -------------------------------------------------------------------------
  // #420 Step 8: the D&D area is inert until a destination folder is chosen
  // -------------------------------------------------------------------------

  it("makes the drag & drop area fully inert until a destination folder is chosen", async () => {
    renderDialog();
    const area = () =>
      container.querySelector<HTMLElement>(".bulkTextImportDialogDropArea")!;

    expect(area().className).toContain("isDisabled");
    expect(area().getAttribute("aria-disabled")).toBe("true");

    // dragover is not claimed while disabled (handler skips preventDefault)
    const dragOver = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperty(dragOver, "dataTransfer", { value: { files: [] } });
    act(() => {
      area().dispatchEvent(dragOver);
    });
    expect(dragOver.defaultPrevented).toBe(false);

    // and CSS neutralises real pointer input over the disabled area
    const rule = cssRule(".bulkTextImportDialogDropArea.isDisabled");
    expect(rule).toContain("pointer-events: none");

    await chooseDestination("docs");
    expect(area().className).not.toContain("isDisabled");
    expect(area().getAttribute("aria-disabled")).toBe("false");

    const dragOver2 = new Event("dragover", {
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(dragOver2, "dataTransfer", { value: { files: [] } });
    act(() => {
      area().dispatchEvent(dragOver2);
    });
    expect(dragOver2.defaultPrevented).toBe(true);
  });
});
