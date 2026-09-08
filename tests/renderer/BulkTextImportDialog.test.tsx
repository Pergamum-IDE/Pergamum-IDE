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

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("BulkTextImportDialog (#420 Step 2)", () => {
  let container: HTMLDivElement;
  let root: Root;

  const translate = (key: any, values?: any) => t("ja", key, values);

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
    props: Partial<BulkTextImportDialogProps> = {}
  ): BulkTextImportDialogProps {
    const defaultProps: BulkTextImportDialogProps = {
      isOpen: true,
      translate,
      onClose: vi.fn(),
      ...props
    };

    act(() => {
      root.render(<BulkTextImportDialog {...defaultProps} />);
    });

    return defaultProps;
  }

  it("returns null when closed", () => {
    renderDialog({ isOpen: false });

    expect(container.innerHTML).toBe("");
  });

  it("renders the accessible title, description, and Step 2 placeholders", () => {
    renderDialog();

    const dialog = container.querySelector<HTMLElement>(
      ".bulkTextImportDialog"
    );

    expect(dialog?.getAttribute("role")).toBe("dialog");
    expect(container.querySelector(".appDialogTitle")?.textContent).toBe(
      "テキストファイルをまとめてインポート"
    );
    expect(container.textContent).toContain(
      "テキストファイルを文字コードを指定して Markdown 文書として取り込みます。"
    );
    expect(container.textContent).toContain(
      "取り込み先フォルダは次のステップで選択できるようになります。"
    );
    expect(container.textContent).toContain(
      "テキストファイルまたはフォルダの追加は次のステップで実装します。"
    );
    expect(container.textContent).toContain("取り込み対象はまだありません。");
  });

  it("keeps Import disabled and closes with Cancel", () => {
    const onClose = vi.fn();
    renderDialog({ onClose });

    const importButton = container.querySelector<HTMLButtonElement>(
      ".bulkTextImportDialogImportButton"
    );
    const cancelButton = container.querySelector<HTMLButtonElement>(
      ".bulkTextImportDialogCancelButton"
    );

    expect(importButton?.disabled).toBe(true);
    act(() => {
      cancelButton?.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    renderDialog({ onClose });

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

  it("closes on backdrop click but not on dialog body click", () => {
    const onClose = vi.fn();
    renderDialog({ onClose });

    const backdrop = container.querySelector<HTMLElement>(".appDialogBackdrop");
    const dialog = container.querySelector<HTMLElement>(
      ".bulkTextImportDialog"
    );

    act(() => {
      dialog?.click();
    });
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      backdrop?.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("can close and reopen from the same owner state", () => {
    function Harness(): JSX.Element {
      const [isOpen, setIsOpen] = React.useState(false);

      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            open
          </button>
          <BulkTextImportDialog
            isOpen={isOpen}
            translate={translate}
            onClose={() => setIsOpen(false)}
          />
        </>
      );
    }

    act(() => {
      root.render(<Harness />);
    });
    expect(container.querySelector(".bulkTextImportDialog")).toBeNull();

    const openButton = container.querySelector<HTMLButtonElement>("button")!;

    act(() => {
      openButton.click();
    });
    expect(container.querySelector(".bulkTextImportDialog")).not.toBeNull();

    act(() => {
      container
        .querySelector<HTMLButtonElement>(".bulkTextImportDialogCancelButton")
        ?.click();
    });
    expect(container.querySelector(".bulkTextImportDialog")).toBeNull();

    act(() => {
      openButton.click();
    });
    expect(container.querySelector(".bulkTextImportDialog")).not.toBeNull();
  });
});
