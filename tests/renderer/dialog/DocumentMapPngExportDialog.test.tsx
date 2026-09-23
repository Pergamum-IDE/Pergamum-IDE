// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../../../src/shared/i18n";
import type {
  CheckFileExistsRequest,
  CheckFileExistsResult,
  ExportPngRequest,
  ExportPngResult,
  SelectExportFolderRequest,
  SelectExportFolderResult
} from "../../../src/shared/api";
import {
  DocumentMapPngExportDialog,
  type DocumentMapPngExportDialogProps,
  type DocumentMapPngExportSnapshot
} from "../../../src/renderer/dialog/DocumentMapPngExportDialog";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const rendererMock = vi.hoisted(() => ({
  renderDocumentMapPageToPngBytes: vi.fn()
}));

vi.mock("../../../src/renderer/documentMapPngRenderer", () => ({
  renderDocumentMapPageToPngBytes: rendererMock.renderDocumentMapPageToPngBytes
}));

function translate(
  key: Parameters<typeof t>[1],
  values?: Parameters<typeof t>[2]
): string {
  return t("ja", key, values);
}

function buildSnapshot(
  pageCount: number,
  overrides: Partial<DocumentMapPngExportSnapshot> = {}
): DocumentMapPngExportSnapshot {
  return {
    text: "hello world",
    entries: [],
    selectedTagIds: [],
    wrapColumns: 40,
    contentWidth: 80,
    normalizeUnicodeToNfc: false,
    pages: Array.from({ length: pageCount }, (_, index) => ({
      index,
      startVisualRow: index,
      endVisualRow: index + 1,
      startLogicalY: index * 2,
      height: 2
    })),
    pixelRatio: 1,
    defaultBaseFileName: "chapter01",
    ...overrides
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  rendererMock.renderDocumentMapPageToPngBytes.mockReset();
  rendererMock.renderDocumentMapPageToPngBytes.mockResolvedValue(
    new Uint8Array([1, 2, 3])
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function renderDialog(
  props: Partial<DocumentMapPngExportDialogProps> = {}
): void {
  const fullProps: DocumentMapPngExportDialogProps = {
    snapshot: buildSnapshot(3),
    translate,
    onClose: vi.fn(),
    onSelectFolder: vi.fn(
      async (): Promise<SelectExportFolderResult> => ({
        ok: true,
        folderPath: "C:\\exports"
      })
    ),
    onCheckFileExists: vi.fn(
      async (): Promise<CheckFileExistsResult> => ({ exists: false })
    ),
    onExportPng: vi.fn(async (): Promise<ExportPngResult> => ({ ok: true })),
    onConfirmOverwrite: vi.fn(async () => true),
    ...props
  };
  act(() => {
    root.render(React.createElement(DocumentMapPngExportDialog, fullProps));
  });
}

function primaryButton(): HTMLButtonElement {
  return container.querySelector(
    "[data-document-map-export-primary-button]"
  ) as HTMLButtonElement;
}

function browseButton(): HTMLButtonElement {
  return container.querySelector(
    "[data-document-map-export-browse-button]"
  ) as HTMLButtonElement;
}

function rowToggle(pageIndex: number): HTMLInputElement {
  return container.querySelector(
    `[data-document-map-export-row-toggle="${pageIndex}"]`
  ) as HTMLInputElement;
}

function headerToggle(): HTMLInputElement {
  return container.querySelector(
    "[data-document-map-export-header-toggle]"
  ) as HTMLInputElement;
}

function basenameInput(): HTMLInputElement {
  return container.querySelector(
    "[data-document-map-export-basename-input]"
  ) as HTMLInputElement;
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )!.set!;
  nativeSetter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function clickAsync(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("DocumentMapPngExportDialog (#537)", () => {
  it("renders nothing when the snapshot is null", () => {
    renderDialog({ snapshot: null });
    expect(container.querySelector(".documentMapPngExportDialog")).toBeNull();
  });

  it("pre-fills the base filename from the snapshot and disables Export until a folder is chosen", () => {
    renderDialog();

    expect(basenameInput().value).toBe("chapter01");
    expect(primaryButton().disabled).toBe(true);
    expect(primaryButton().textContent).toBe(
      translate("documentMap.export.exportButton")
    );
  });

  it("enables Export once a folder is selected via Browse", async () => {
    renderDialog();

    await clickAsync(browseButton());

    expect(primaryButton().disabled).toBe(false);
  });

  it("regenerates planned filenames when the base filename is edited, preserving row toggles", async () => {
    renderDialog();
    await clickAsync(browseButton());

    act(() => {
      rowToggle(1).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(rowToggle(1).checked).toBe(false);

    act(() => {
      setInputValue(basenameInput(), "renamed");
    });

    const rows = Array.from(
      container.querySelectorAll(".documentMapPngExportTable tbody tr")
    );
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("renamed_001.png"),
      expect.stringContaining("renamed_002.png"),
      expect.stringContaining("renamed_003.png")
    ]);
    expect(rowToggle(1).checked).toBe(false);
  });

  it("header checkbox cycles all-enabled -> all-disabled -> all-enabled", () => {
    renderDialog();

    expect(headerToggle().checked).toBe(true);

    act(() => {
      headerToggle().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect([0, 1, 2].every((i) => !rowToggle(i).checked)).toBe(true);

    act(() => {
      headerToggle().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect([0, 1, 2].every((i) => rowToggle(i).checked)).toBe(true);
  });

  it("disables Export when every row is disabled", () => {
    renderDialog();

    act(() => {
      headerToggle().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(primaryButton().disabled).toBe(true);
  });

  it("checks existence and writes only output-enabled rows, then reports success", async () => {
    const onCheckFileExists = vi.fn(
      async (_request: CheckFileExistsRequest): Promise<CheckFileExistsResult> => ({
        exists: false
      })
    );
    const onExportPng = vi.fn(
      async (_request: ExportPngRequest): Promise<ExportPngResult> => ({
        ok: true
      })
    );
    renderDialog({ onCheckFileExists, onExportPng });

    await clickAsync(browseButton());
    act(() => {
      rowToggle(1).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await clickAsync(primaryButton());

    expect(onCheckFileExists).toHaveBeenCalledTimes(2);
    const checkedPaths = onCheckFileExists.mock.calls.map(
      ([request]: [CheckFileExistsRequest]) => request.filePath
    );
    expect(checkedPaths).toEqual([
      "C:\\exports\\chapter01_001.png",
      "C:\\exports\\chapter01_003.png"
    ]);

    expect(onExportPng).toHaveBeenCalledTimes(2);
    const writtenPaths = onExportPng.mock.calls.map(
      ([request]: [ExportPngRequest]) => request.filePath
    );
    expect(writtenPaths).toEqual([
      "C:\\exports\\chapter01_001.png",
      "C:\\exports\\chapter01_003.png"
    ]);

    expect(primaryButton().textContent).toBe(
      translate("documentMap.export.closeButton")
    );
    expect(container.querySelector(".documentMapPngExportError")).toBeNull();
    expect(basenameInput().disabled).toBe(true);
  });

  it("prompts overwrite confirmation and writes nothing when the user cancels", async () => {
    const onCheckFileExists = vi.fn(
      async ({ filePath }: CheckFileExistsRequest): Promise<CheckFileExistsResult> => ({
        exists: filePath.endsWith("_002.png")
      })
    );
    const onConfirmOverwrite = vi.fn(async () => false);
    const onExportPng = vi.fn(
      async (): Promise<ExportPngResult> => ({ ok: true })
    );
    renderDialog({ onCheckFileExists, onConfirmOverwrite, onExportPng });

    await clickAsync(browseButton());
    await clickAsync(primaryButton());

    expect(onConfirmOverwrite).toHaveBeenCalledWith(1);
    expect(onExportPng).not.toHaveBeenCalled();
    expect(primaryButton().textContent).toBe(
      translate("documentMap.export.exportButton")
    );
    expect(primaryButton().disabled).toBe(false);
  });

  it("writes all output-enabled rows once the user confirms overwrite", async () => {
    const onCheckFileExists = vi.fn(
      async ({ filePath }: CheckFileExistsRequest): Promise<CheckFileExistsResult> => ({
        exists: filePath.endsWith("_002.png")
      })
    );
    const onConfirmOverwrite = vi.fn(async () => true);
    const onExportPng = vi.fn(
      async (): Promise<ExportPngResult> => ({ ok: true })
    );
    renderDialog({ onCheckFileExists, onConfirmOverwrite, onExportPng });

    await clickAsync(browseButton());
    await clickAsync(primaryButton());

    expect(onExportPng).toHaveBeenCalledTimes(3);
    expect(primaryButton().textContent).toBe(
      translate("documentMap.export.closeButton")
    );
  });

  it("excludes a disabled row from the dry-run exists check and the overwrite count", async () => {
    const onCheckFileExists = vi.fn(
      async (): Promise<CheckFileExistsResult> => ({ exists: true })
    );
    const onConfirmOverwrite = vi.fn(async () => true);
    renderDialog({ onCheckFileExists, onConfirmOverwrite });

    await clickAsync(browseButton());
    act(() => {
      rowToggle(1).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await clickAsync(primaryButton());

    expect(onCheckFileExists).toHaveBeenCalledTimes(2);
    expect(onConfirmOverwrite).toHaveBeenCalledWith(2);
  });

  it("shows a write-failure message identifying the file and does not mark success", async () => {
    const onExportPng = vi.fn(async (request: ExportPngRequest): Promise<ExportPngResult> =>
      request.filePath.endsWith("_002.png")
        ? { ok: false, reason: "permissionDenied" }
        : { ok: true }
    );
    renderDialog({ onExportPng });

    await clickAsync(browseButton());
    await clickAsync(primaryButton());

    const errorNode = container.querySelector(".documentMapPngExportError");
    expect(errorNode?.textContent).toBe(
      translate("documentMap.export.writeFailed", {
        fileName: "chapter01_002.png",
        reason: translate("documentMap.export.failureReason.permissionDenied")
      })
    );
    expect(primaryButton().textContent).toBe(
      translate("documentMap.export.exportButton")
    );
    // Stops at the failing file — later pages are never attempted.
    expect(onExportPng).toHaveBeenCalledTimes(2);
  });

  it("shows a render-failure message and stops without writing that page", async () => {
    rendererMock.renderDocumentMapPageToPngBytes
      .mockResolvedValueOnce(new Uint8Array([1]))
      .mockRejectedValueOnce(new Error("boom"));
    const onExportPng = vi.fn(
      async (): Promise<ExportPngResult> => ({ ok: true })
    );
    renderDialog({ onExportPng });

    await clickAsync(browseButton());
    await clickAsync(primaryButton());

    const errorNode = container.querySelector(".documentMapPngExportError");
    expect(errorNode?.textContent).toBe(
      translate("documentMap.export.renderFailed", {
        fileName: "chapter01_002.png"
      })
    );
    expect(onExportPng).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid base filename and disables Export", async () => {
    renderDialog();
    await clickAsync(browseButton());

    act(() => {
      setInputValue(basenameInput(), "bad/name");
    });

    expect(primaryButton().disabled).toBe(true);
    expect(
      container.querySelector(".documentMapPngExportFieldError")?.textContent
    ).toBe(translate("documentMap.export.baseFileNameError.invalidCharacter"));
  });

  it("hides the Cancel button and disables the header toggle after success", async () => {
    renderDialog();
    await clickAsync(browseButton());
    await clickAsync(primaryButton());

    expect(
      container.querySelector("[data-document-map-export-cancel-button]")
    ).toBeNull();
    expect(headerToggle().disabled).toBe(true);
    expect(rowToggle(0).disabled).toBe(true);
    expect(browseButton().disabled).toBe(true);
  });
});
