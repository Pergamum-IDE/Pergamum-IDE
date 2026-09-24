// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../../../src/shared/i18n";
import type {
  CheckFileExistsResult,
  SelectExportFolderResult
} from "../../../src/shared/api";
import {
  GlossaryExportDialog,
  type GlossaryExportDialogProps
} from "../../../src/renderer/dialog/GlossaryExportDialog";
import type { GlossaryExportRunResult } from "../../../src/renderer/glossaryExport/glossaryExportRunner";

// #574 Slice 6: Glossary Export Dialog (one entry → HTML).

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function translate(
  key: Parameters<typeof t>[1],
  values?: Parameters<typeof t>[2]
): string {
  return t("ja", key, values);
}

const request = {
  entryId: "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f00a1",
  entryLabel: "オーダ"
};

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

function renderDialog(
  props: Partial<GlossaryExportDialogProps> = {}
): GlossaryExportDialogProps {
  const fullProps: GlossaryExportDialogProps = {
    request,
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
    onConfirmOverwrite: vi.fn(async () => true),
    onExport: vi.fn(
      async (): Promise<GlossaryExportRunResult> => ({
        ok: true,
        outputPath: "C:\\exports\\オーダ.html",
        warningCount: 0
      })
    ),
    ...props
  };
  act(() => {
    root.render(React.createElement(GlossaryExportDialog, fullProps));
  });
  return fullProps;
}

function q<T extends Element>(selector: string): T {
  return container.querySelector(selector) as T;
}

async function clickAsync(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve();
    }
  });
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )!.set!;
  nativeSetter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

const primary = () => q<HTMLButtonElement>("[data-glossary-export-primary-button]");
const browse = () => q<HTMLButtonElement>("[data-glossary-export-browse-button]");
const fileNameInput = () => q<HTMLInputElement>("[data-glossary-export-filename-input]");

describe("GlossaryExportDialog (#574 Slice 6)", () => {
  it("renders nothing when closed", () => {
    renderDialog({ request: null });
    expect(q(".glossaryExportDialog")).toBeNull();
  });

  it("shows the target entry, HTML format and the fixed content sections", () => {
    renderDialog();

    expect(container.textContent).toContain(translate("glossaryExport.dialogTitle"));
    expect(q("[data-glossary-export-target]")?.textContent).toBe("オーダ");
    expect(q("[data-glossary-export-format]")?.textContent).toBe("HTML");
    expect(
      Array.from(container.querySelectorAll(".glossaryExportContentList li")).map(
        (item) => item.textContent
      )
    ).toEqual(["語彙情報", "表記ごとの出現数", "Description"]);
    expect(fileNameInput().value).toBe("オーダ");
  });

  it("requires an output folder before Export is enabled", async () => {
    renderDialog();

    expect(primary().disabled).toBe(true);
    expect(container.textContent).toContain(translate("glossaryExport.folderRequired"));

    await clickAsync(browse());

    expect(primary().disabled).toBe(false);
  });

  it("rejects an invalid file name", async () => {
    renderDialog();
    await clickAsync(browse());

    act(() => setInputValue(fileNameInput(), "a/b"));

    expect(primary().disabled).toBe(true);
    expect(q('[role="alert"]')?.textContent).toBe(
      translate("glossaryExport.fileNameError.invalidCharacter")
    );
  });

  it("exports the planned single-entry HTML and shows the saved path", async () => {
    const props = renderDialog();
    await clickAsync(browse());
    await clickAsync(primary());

    expect(props.onExport).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId: request.entryId,
        format: "html",
        outputFilePath: "C:\\exports\\オーダ.html",
        imageAssetFolderName: "オーダ.assets"
      })
    );
    expect(q("[data-glossary-export-result]")?.textContent).toBe(
      translate("glossaryExport.success", { path: "C:\\exports\\オーダ.html" })
    );
    expect(primary().textContent).toBe(translate("glossaryExport.closeButton"));
  });

  it("an existing file needs confirmation; cancelling writes nothing", async () => {
    const props = renderDialog({
      onCheckFileExists: vi.fn(async () => ({ exists: true })),
      onConfirmOverwrite: vi.fn(async () => false)
    });
    await clickAsync(browse());
    await clickAsync(primary());

    expect(props.onConfirmOverwrite).toHaveBeenCalledTimes(1);
    expect(props.onExport).not.toHaveBeenCalled();
    expect(primary().disabled).toBe(false);
  });

  it("Cancel just closes", async () => {
    const props = renderDialog();

    await clickAsync(q("[data-glossary-export-cancel-button]"));

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onExport).not.toHaveBeenCalled();
  });

  it("reports a deleted entry", async () => {
    renderDialog({
      onExport: vi.fn(async () => ({ ok: false as const, reason: "entryNotFound" as const }))
    });
    await clickAsync(browse());
    await clickAsync(primary());

    expect(q(".glossaryExportError")?.textContent).toBe(
      translate("glossaryExport.entryNotFound")
    );
  });
});
