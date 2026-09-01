// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t, type Translate } from "../../src/shared/i18n";
import type {
  FileExplorerDeleteEntryResult,
  FileExplorerDeleteTarget
} from "../../src/shared/fileExplorerDelete";
import { FileExplorerDeleteDialog } from "../../src/renderer/FileExplorerDeleteDialog";

const translate: Translate = (key, values) => t("ja", key, values);

// Hourglass vs trash SVG path fragments (the `?url` import inlines the SVG
// as a URL-encoded data URI, so spaces are `%20`).
const HOURGLASS_MARK = "M145.61%20464";
const TRASH_MARK = "m432%20144";

/** The confirm button's icon is a masked `<span>` whose glyph is carried by
 *  the `--file-explorer-delete-button-icon` custom property. */
function confirmButtonIconValue(button: HTMLButtonElement): string {
  const icon = button.querySelector<HTMLElement>(
    ".fileExplorerDeleteConfirmButtonIcon"
  );
  return icon?.style.getPropertyValue("--file-explorer-delete-button-icon") ?? "";
}

function fileTarget(
  relativePath: string,
  overrides: Partial<FileExplorerDeleteTarget> = {}
): FileExplorerDeleteTarget {
  return {
    kind: "file",
    relativePath,
    name: relativePath.split("/").pop() ?? relativePath,
    parentRelativePath: relativePath.split("/").slice(0, -1).join("/"),
    lastModifiedIso: "2026-09-01T10:00:00.000Z",
    sizeBytes: 12,
    previewHead: "head text",
    previewTail: "tail text",
    previewUnavailable: false,
    ...overrides
  };
}

function folderTarget(relativePath: string): FileExplorerDeleteTarget {
  return {
    ...fileTarget(relativePath),
    kind: "folder",
    sizeBytes: null,
    previewHead: null,
    previewTail: null
  };
}

describe("FileExplorerDeleteDialog (#351)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function props(overrides: Partial<
    Parameters<typeof FileExplorerDeleteDialog>[0]
  > = {}) {
    return {
      targets: [fileTarget("drafts/ch1.md"), folderTarget("drafts")],
      fileCount: 1,
      folderCount: 1,
      translate,
      opener: null,
      deleteEntry: vi.fn(
        async (): Promise<FileExplorerDeleteEntryResult> => ({ ok: true })
      ),
      onRunSettled: vi.fn(),
      onDismiss: vi.fn(),
      ...overrides
    };
  }

  function render(p: ReturnType<typeof props>): void {
    act(() => {
      root.render(<FileExplorerDeleteDialog {...p} />);
    });
  }

  function footerButtons(): HTMLButtonElement[] {
    return [
      ...container.querySelectorAll<HTMLButtonElement>(
        ".fileExplorerDeleteDialogActions button"
      )
    ];
  }
  function deleteButton(): HTMLButtonElement {
    return [
      ...container.querySelectorAll<HTMLButtonElement>("button")
    ].find((b) => b.textContent?.includes("削除") && !b.textContent.includes("中止"))!;
  }
  function abortButton(): HTMLButtonElement | undefined {
    return [
      ...container.querySelectorAll<HTMLButtonElement>("button")
    ].find((b) => b.textContent?.trim() === "中止");
  }
  function dismissButton(): HTMLButtonElement {
    return [
      ...container.querySelectorAll<HTMLButtonElement>("button")
    ].find(
      (b) =>
        b.textContent?.trim() === "キャンセル" ||
        b.textContent?.trim() === "閉じる"
    )!;
  }
  function bodyRows(): HTMLTableRowElement[] {
    return [...container.querySelectorAll<HTMLTableRowElement>("tbody tr")];
  }
  function rowStatuses(): (string | undefined)[] {
    return bodyRows().map((row) => row.dataset.deleteStatus);
  }
  function advance(ms: number): void {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  it("shows a table even for a single item, with the ADR-0011 columns", () => {
    render(props({ targets: [fileTarget("solo.md")], fileCount: 1, folderCount: 0 }));
    const headers = [...container.querySelectorAll("thead th")].map((th) =>
      th.textContent?.trim()
    );
    expect(headers).toEqual([
      "状態",
      "パス名",
      "ファイル名",
      "最終更新日時",
      "書き出し10文字",
      "終わり10文字",
      "全バイト数"
    ]);
    expect(bodyRows()).toHaveLength(1);
  });

  it("keeps the delete button disabled with an hourglass for 5s, then enables it with a trash icon", () => {
    render(props());
    const button = deleteButton();
    expect(button.disabled).toBe(true);
    expect(confirmButtonIconValue(button)).toContain(HOURGLASS_MARK);

    advance(4999);
    expect(deleteButton().disabled).toBe(true);

    advance(1);
    const armed = deleteButton();
    expect(armed.disabled).toBe(false);
    expect(confirmButtonIconValue(armed)).toContain(TRASH_MARK);
  });

  it("does not delete before the 5s arm even if clicked", async () => {
    const p = props();
    render(p);
    await act(async () => {
      deleteButton().click();
    });
    expect(p.deleteEntry).not.toHaveBeenCalled();
  });

  it("on confirm, deletes files first then folders deepest-first and reports per row", async () => {
    const order: string[] = [];
    const p = props({
      targets: [
        folderTarget("d"),
        fileTarget("d/a.md"),
        folderTarget("d/sub"),
        fileTarget("d/sub/b.md")
      ],
      fileCount: 2,
      folderCount: 2,
      deleteEntry: vi.fn(async (relativePath: string) => {
        order.push(relativePath);
        return { ok: true } as const;
      })
    });
    render(p);
    advance(5000);

    await act(async () => {
      deleteButton().click();
    });

    expect(order).toEqual(["d/a.md", "d/sub/b.md", "d/sub", "d"]);
    expect(p.onRunSettled).toHaveBeenCalledTimes(1);
    expect(new Set((p.onRunSettled as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string[])).toEqual(
      new Set(["d/a.md", "d/sub/b.md", "d/sub", "d"])
    );
    expect(
      bodyRows().every((row) => row.dataset.deleteStatus === "deleted")
    ).toBe(true);
    // Done phase: a Close button is shown.
    expect(
      [...container.querySelectorAll("button")].some(
        (b) => b.textContent?.trim() === "閉じる"
      )
    ).toBe(true);
  });

  it("a per-item failure is shown on that row and the rest still runs", async () => {
    const p = props({
      targets: [fileTarget("a.md"), fileTarget("b.md"), fileTarget("c.md")],
      fileCount: 3,
      folderCount: 0,
      deleteEntry: vi.fn(async (relativePath: string) =>
        relativePath === "b.md"
          ? ({ ok: false, reason: "permission-denied" } as const)
          : ({ ok: true } as const)
      )
    });
    render(p);
    advance(5000);
    await act(async () => {
      deleteButton().click();
    });

    const statuses = bodyRows().map((row) => row.dataset.deleteStatus);
    expect(statuses).toEqual(["deleted", "failed", "deleted"]);
    expect(new Set((p.onRunSettled as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string[])).toEqual(
      new Set(["a.md", "c.md"])
    );
  });

  it("orders the footer buttons [削除] then [キャンセル] and focuses キャンセル", () => {
    render(props());
    const [left, right] = footerButtons();
    expect(left.textContent).toContain("削除");
    expect(left.textContent).not.toContain("中止");
    expect(right.textContent?.trim()).toBe("キャンセル");
    expect(document.activeElement).toBe(right);
  });

  it("keeps focus on キャンセル after the 5s arm — never auto-focuses 削除", () => {
    render(props());
    const cancel = dismissButton();
    expect(document.activeElement).toBe(cancel);

    advance(5000);
    expect(deleteButton().disabled).toBe(false);
    // focus has NOT moved to the (now enabled) destructive button
    expect(document.activeElement).toBe(cancel);
    expect(document.activeElement).not.toBe(deleteButton());
  });

  it("does not delete on Enter while focus stays on キャンセル (before or after the arm)", async () => {
    const p = props();
    render(p);
    const cancel = dismissButton();

    // during the wait
    await act(async () => {
      cancel.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });
    advance(5000);
    // after the arm, focus still on cancel
    await act(async () => {
      cancel.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });
    expect(p.deleteEntry).not.toHaveBeenCalled();
  });

  it("while running shows [中止] with a disabled dismiss button, and focuses 中止", async () => {
    let release: (() => void) | null = null;
    const p = props({
      targets: [fileTarget("a.md")],
      fileCount: 1,
      folderCount: 0,
      deleteEntry: vi.fn(async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { ok: true } as const;
      })
    });
    render(p);
    advance(5000);
    act(() => {
      void deleteButton().click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    const [left, right] = footerButtons();
    expect(left.textContent?.trim()).toBe("中止");
    expect(right.disabled).toBe(true);
    expect(document.activeElement).toBe(left);

    await act(async () => {
      release?.();
      await Promise.resolve();
    });
  });

  it("when every row resolves: [削除] disabled, dismiss becomes [閉じる], rows kept", async () => {
    const p = props({
      targets: [fileTarget("a.md"), fileTarget("b.md")],
      fileCount: 2,
      folderCount: 0
    });
    render(p);
    advance(5000);
    await act(async () => {
      deleteButton().click();
    });

    const [left, right] = footerButtons();
    expect(left.textContent).toContain("削除");
    expect(left.disabled).toBe(true);
    expect(right.textContent?.trim()).toBe("閉じる");
    expect(right.disabled).toBe(false);
    expect(document.activeElement).toBe(right);
    expect(rowStatuses()).toEqual(["deleted", "deleted"]);
  });

  it("after a partial failure, [削除] re-runs ONLY the unresolved rows", async () => {
    const attempts: string[] = [];
    let failB = true;
    const p = props({
      targets: [fileTarget("a.md"), fileTarget("b.md"), fileTarget("c.md")],
      fileCount: 3,
      folderCount: 0,
      deleteEntry: vi.fn(async (relativePath: string) => {
        attempts.push(relativePath);
        if (relativePath === "b.md" && failB) {
          return { ok: false, reason: "permission-denied" } as const;
        }
        return { ok: true } as const;
      })
    });
    render(p);
    advance(5000);
    await act(async () => {
      deleteButton().click();
    });

    expect(rowStatuses()).toEqual(["deleted", "failed", "deleted"]);
    const dismiss = dismissButton();
    expect(dismiss.textContent?.trim()).toBe("閉じる");
    const retry = deleteButton();
    expect(retry.disabled).toBe(false);

    attempts.length = 0;
    failB = false;
    await act(async () => {
      retry.click();
    });

    // only the still-unresolved row was retried
    expect(attempts).toEqual(["b.md"]);
    expect(rowStatuses()).toEqual(["deleted", "deleted", "deleted"]);
    expect(deleteButton().disabled).toBe(true);
    expect((p.onRunSettled as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(
      2
    );
    expect(
      (p.onRunSettled as ReturnType<typeof vi.fn>).mock.calls[1]?.[0]
    ).toEqual(["b.md"]);
  });

  it("re-runs aborted and never-started rows, but not the already-deleted ones", async () => {
    let park: (() => void) | null = null;
    const attempts: string[] = [];
    const p = props({
      targets: [fileTarget("a.md"), fileTarget("b.md"), fileTarget("c.md")],
      fileCount: 3,
      folderCount: 0,
      deleteEntry: vi.fn(async (relativePath: string) => {
        attempts.push(relativePath);
        if (relativePath === "b.md" && park === null) {
          await new Promise<void>((resolve) => {
            park = resolve;
          });
        }
        return { ok: true } as const;
      })
    });
    render(p);
    advance(5000);
    act(() => {
      void deleteButton().click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    // parked on b.md; a.md done, c.md not started. Abort.
    act(() => abortButton()!.click());
    await act(async () => {
      park?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(rowStatuses()).toEqual(["deleted", "deleted", "aborted"]);

    attempts.length = 0;
    await act(async () => {
      deleteButton().click();
    });
    // a.md / b.md already resolved -> only c.md re-run
    expect(attempts).toEqual(["c.md"]);
    expect(rowStatuses()).toEqual(["deleted", "deleted", "deleted"]);
  });

  it("marks an ENOENT (alreadyAbsent) row as 削除済みでした and never re-runs it", async () => {
    const attempts: string[] = [];
    const p = props({
      targets: [fileTarget("gone.md"), fileTarget("stay.md")],
      fileCount: 2,
      folderCount: 0,
      deleteEntry: vi.fn(async (relativePath: string) => {
        attempts.push(relativePath);
        if (relativePath === "gone.md") {
          return { ok: true, alreadyAbsent: true } as const;
        }
        return { ok: false, reason: "busy" } as const;
      })
    });
    render(p);
    advance(5000);
    await act(async () => {
      deleteButton().click();
    });

    expect(rowStatuses()).toEqual(["already-absent", "failed"]);
    const goneRow = bodyRows()[0];
    expect(goneRow.textContent).toContain("削除済みでした");
    // onRunSettled counts the already-absent path as resolved for this run
    expect(
      (p.onRunSettled as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    ).toEqual(["gone.md"]);

    attempts.length = 0;
    await act(async () => {
      deleteButton().click();
    });
    expect(attempts).toEqual(["stay.md"]); // gone.md is not retried
  });

  it("abort stops the remaining items and does not roll back the deleted ones", async () => {
    let resolveThird: (() => void) | null = null;
    const p = props({
      targets: [fileTarget("a.md"), fileTarget("b.md"), fileTarget("c.md")],
      fileCount: 3,
      folderCount: 0,
      deleteEntry: vi.fn(async (relativePath: string) => {
        if (relativePath === "c.md") {
          await new Promise<void>((resolve) => {
            resolveThird = resolve;
          });
        }
        return { ok: true } as const;
      })
    });
    render(p);
    advance(5000);

    // Kick off the run but do not await it fully — it parks on "c.md".
    let runPromise: Promise<void>;
    act(() => {
      runPromise = (async () => {
        deleteButton().click();
      })();
    });
    await act(async () => {
      await Promise.resolve();
    });

    const abort = abortButton();
    expect(abort).toBeDefined();
    act(() => abort!.click());

    // Let "c.md" finish; the loop then aborts the (already none) remaining.
    await act(async () => {
      resolveThird?.();
      await runPromise;
    });

    // a.md and b.md deleted; nothing rolled back. c.md finished before abort
    // took effect (abort stops AFTER the in-flight item).
    const deletedArg = (p.onRunSettled as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string[];
    expect(deletedArg).toContain("a.md");
    expect(deletedArg).toContain("b.md");
  });
});
