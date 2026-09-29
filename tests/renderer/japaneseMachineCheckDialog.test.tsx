// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t, type Translate } from "../../src/shared/i18n";
import {
  JapaneseMachineCheckDialog,
  formatElapsed,
  type JapaneseMachineCheckBridge
} from "../../src/renderer/dialog/JapaneseMachineCheckDialog";
import type {
  JapaneseMachineCheckPrepareResult,
  JapaneseMachineCheckProgress,
  JapaneseMachineCheckRunResult,
  JapaneseMachineCheckSaveReportResult
} from "../../src/shared/japaneseMachineCheck";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const translate: Translate = (key, values) => t("ja", key, values);

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
});

const prepared = (
  overrides: Partial<Extract<JapaneseMachineCheckPrepareResult, { ok: true }>> = {}
): JapaneseMachineCheckPrepareResult => ({
  ok: true,
  fileName: "chapter1.md",
  ext: ".md",
  format: "markdown",
  sourceChars: 1234,
  sourceLines: 40,
  isDirty: false,
  enabledRuleIds: ["max-ten", "no-doubled-joshi"],
  estimate: "short",
  ...overrides
});

interface Harness {
  readonly bridge: JapaneseMachineCheckBridge;
  readonly prepare: ReturnType<typeof vi.fn>;
  readonly run: ReturnType<typeof vi.fn>;
  readonly cancel: ReturnType<typeof vi.fn>;
  readonly saveReport: ReturnType<typeof vi.fn>;
  readonly discardResult: ReturnType<typeof vi.fn>;
  readonly onClose: ReturnType<typeof vi.fn>;
  emitProgress(progress: JapaneseMachineCheckProgress): void;
  resolveRun(result: JapaneseMachineCheckRunResult): void;
}

async function mount(
  prepareResult: JapaneseMachineCheckPrepareResult = prepared(),
  isDirty = false
): Promise<Harness> {
  let progressListener: ((p: JapaneseMachineCheckProgress) => void) | null = null;
  let resolveRun!: (result: JapaneseMachineCheckRunResult) => void;
  const prepare = vi.fn(async () => prepareResult);
  const run = vi.fn(
    () =>
      new Promise<JapaneseMachineCheckRunResult>((resolve) => {
        resolveRun = resolve;
      })
  );
  const cancel = vi.fn(async () => undefined);
  const onClose = vi.fn();
  const saveReport = vi.fn(
    async (): Promise<JapaneseMachineCheckSaveReportResult> => ({
      ok: true,
      fileName: "chapter1.md.lint.md"
    })
  );
  const discardResult = vi.fn(async () => undefined);
  const bridge: JapaneseMachineCheckBridge = {
    prepare,
    run,
    cancel,
    saveReport,
    discardResult,
    onProgress: (callback) => {
      progressListener = callback;

      return () => {
        progressListener = null;
      };
    }
  };

  await act(async () => {
    root.render(
      <JapaneseMachineCheckDialog
        relativePath="Drafts/chapter1.md"
        isDirty={isDirty}
        translate={translate}
        platform="windows"
        bridge={bridge}
        onClose={onClose}
      />
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  return {
    bridge,
    prepare,
    run,
    cancel,
    saveReport,
    discardResult,
    onClose,
    emitProgress: (progress) => act(() => progressListener?.(progress)),
    resolveRun: (result) => resolveRun(result)
  };
}

const q = (selector: string): HTMLElement | null =>
  container.ownerDocument.querySelector<HTMLElement>(selector);
const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

describe("Japanese machine check dialog: estimate screen (#625 P2a)", () => {
  it("shows the file, type, size, estimate and enabled checks - without starting a run", async () => {
    const h = await mount();
    const text = document.body.textContent ?? "";

    expect(h.prepare).toHaveBeenCalledWith({
      relativePath: "Drafts/chapter1.md",
      isDirty: false
    });
    expect(text).toContain("日本語表現チェック");
    expect(text).toContain("chapter1.md");
    expect(text).toContain("Markdown");
    expect(text).toContain("1,234");
    expect(text).toContain("40");
    expect(text).toContain("2 項目");
    expect(q('[data-japanese-machine-check="estimate-text"]')?.textContent).toContain(
      "短い文書です。"
    );
    expect(h.run).not.toHaveBeenCalled();
  });

  it("shows a qualitative note, never a time estimate", async () => {
    const note = () =>
      q('[data-japanese-machine-check="estimate-text"]')?.textContent ?? "";

    await mount(prepared({ estimate: "medium" }));
    expect(note()).toContain("実行時の注意");
    expect(note()).toContain("長文です。完了まで時間がかかる場合があります。");

    act(() => root.unmount());
    root = createRoot(container);
    await mount(prepared({ sourceChars: 180_000, estimate: "long" }));
    expect(note()).toContain(
      "非常に長い文書です。完了までかなり時間がかかる場合があります。"
    );

    // No seconds / minutes promise and no "estimated time" label anywhere.
    const text = document.body.textContent ?? "";

    expect(text).not.toContain("推定所要時間");
    expect(text).not.toMatch(/数秒|数十秒|[0-9]+ ?分|[0-9]+ ?秒/);
  });

  it("warns that only the saved content is checked when the file is dirty", async () => {
    await mount(prepared({ isDirty: true }), true);

    expect(q('[data-japanese-machine-check="dirty-warning"]')?.textContent).toContain(
      "保存されていない変更があります"
    );
    expect(q('[data-japanese-machine-check="dirty-warning"]')?.textContent).toContain(
      "保存済みの内容"
    );
  });

  it("shows no dirty warning for a clean file", async () => {
    await mount();

    expect(q('[data-japanese-machine-check="dirty-warning"]')).toBeNull();
  });

  it("with no enabled check, says so and disables Run", async () => {
    const h = await mount(prepared({ enabledRuleIds: [] }));

    expect(q('[data-japanese-machine-check="no-rules"]')?.textContent).toContain(
      "有効なチェック項目がありません"
    );
    expect((q('[data-japanese-machine-check="run"]') as HTMLButtonElement).disabled).toBe(
      true
    );
    act(() => (q('[data-japanese-machine-check="run"]') as HTMLButtonElement).click());
    expect(h.run).not.toHaveBeenCalled();
  });

  it("Cancel closes without a run", async () => {
    const h = await mount();

    act(() =>
      (document.querySelector(".appDialogButton-cancel") as HTMLButtonElement).click()
    );

    expect(h.onClose).toHaveBeenCalledTimes(1);
    expect(h.run).not.toHaveBeenCalled();
    expect(h.cancel).not.toHaveBeenCalled();
  });

  it("a prepare failure is a safe error with only a Close button", async () => {
    await mount({ ok: false, reason: "read-failed" });

    expect(q('[data-japanese-machine-check="error"]')?.textContent).toContain(
      "日本語表現チェックを実行できませんでした"
    );
  });

  it("an unexpected prepare rejection is a safe error too", async () => {
    const rejecting: JapaneseMachineCheckBridge = {
      prepare: async () => {
        throw new Error("C:\\secret\\path boom");
      },
      run: async () => ({ ok: false, reason: "lint-failed" }),
      cancel: async () => undefined,
      saveReport: async () => ({ ok: false, reason: "canceled" }),
      discardResult: async () => undefined,
      onProgress: () => () => undefined
    };

    await act(async () => {
      root.render(
        <JapaneseMachineCheckDialog
          relativePath="a.md"
          isDirty={false}
          translate={translate}
          bridge={rejecting}
          onClose={() => undefined}
        />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const text = document.body.textContent ?? "";

    expect(text).toContain("日本語表現チェックを実行できませんでした");
    expect(text).not.toContain("secret");
  });
});

describe("Japanese machine check dialog: running screen (#625 P2a)", () => {
  async function running(h?: Harness): Promise<Harness> {
    const harness = h ?? (await mount());

    act(() => (q('[data-japanese-machine-check="run"]') as HTMLButtonElement).click());
    await flush();

    return harness;
  }

  it("Run starts the check and shows the file, elapsed time, a status and a note - no progress bar", async () => {
    const h = await running();

    expect(h.run).toHaveBeenCalledWith({ relativePath: "Drafts/chapter1.md" });
    expect(document.body.textContent).toContain("chapter1.md");
    expect(document.body.textContent).toContain("日本語を解析中です...");
    expect(q('[data-japanese-machine-check="progress"]')).toBeNull();
    expect(document.querySelector("progress")).toBeNull();
    expect(q('[data-japanese-machine-check="status"]')?.textContent).toBe(
      "準備しています..."
    );
    expect(q('[data-japanese-machine-check="elapsed"]')?.textContent).toBe(
      "経過時間: 00:00"
    );
    expect(q('[data-japanese-machine-check="running-note"]')?.textContent).toContain(
      "文書の長さやチェック項目によって、完了まで時間がかかる場合があります。"
    );
    expect(q('[data-japanese-machine-check="running-note"]')?.textContent).toContain(
      "必要であればキャンセルできます。"
    );
  });

  it("the elapsed time counts up (mm:ss) while running", async () => {
    vi.useFakeTimers();

    try {
      await running();

      const elapsed = () =>
        q('[data-japanese-machine-check="elapsed"]')?.textContent;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_200);
      });
      expect(elapsed()).toBe("経過時間: 00:05");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(65_000);
      });
      expect(elapsed()).toBe("経過時間: 01:10");
    } finally {
      vi.useRealTimers();
    }
  });

  it("formatElapsed pads and keeps counting minutes", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(59.9)).toBe("00:59");
    expect(formatElapsed(75 * 60 + 3)).toBe("75:03");
    expect(formatElapsed(-4)).toBe("00:00");
  });

  it("follows the coarse stages", async () => {
    const h = await running();
    const status = () => q('[data-japanese-machine-check="status"]')?.textContent;

    h.emitProgress({ stage: "dictionary-check" });
    expect(status()).toBe("辞書を確認しています...");
    h.emitProgress({ stage: "lint-running" });
    expect(status()).toBe("日本語を解析しています...");
    h.emitProgress({ stage: "aggregating" });
    expect(status()).toBe("結果を集計しています...");
  });

  it("Cancel stops the run through the bridge and closes", async () => {
    const h = await running();

    act(() => (q('[data-japanese-machine-check="cancel"]') as HTMLButtonElement).click());
    await flush();

    expect(h.cancel).toHaveBeenCalledTimes(1);
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });

  it("a result that arrives after Cancel never becomes a summary", async () => {
    const h = await running();

    act(() => (q('[data-japanese-machine-check="cancel"]') as HTMLButtonElement).click());
    await flush();
    h.resolveRun({
      ok: true,
      summary: {
        resultId: "result-late",
        fileName: "chapter1.md",
        totalMessages: 5,
        returnedMessages: 5,
        truncated: false,
        sourceChars: 10,
        sourceLines: 1,
        elapsedMs: 3,
        ruleCounts: [{ ruleId: "max-ten", count: 5 }]
      }
    });
    await flush();

    expect(q('[data-japanese-machine-check="rule-table"]')).toBeNull();
    expect(q('[data-japanese-machine-check="total"]')).toBeNull();
  });

  it("canceling twice is safe (the button is disabled once canceling)", async () => {
    const h = await running();
    const button = q('[data-japanese-machine-check="cancel"]') as HTMLButtonElement;

    act(() => button.click());
    act(() => button.click());
    await flush();

    expect(h.cancel).toHaveBeenCalledTimes(1);
  });

  it("Escape while running cancels too", async () => {
    const h = await running();
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;

    act(() => {
      dialog.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    await flush();

    expect(h.cancel).toHaveBeenCalledTimes(1);
  });

  it("a run the Main Process reports as canceled closes the dialog", async () => {
    const h = await running();

    h.resolveRun({ ok: false, reason: "canceled" });
    await flush();

    expect(h.onClose).toHaveBeenCalledTimes(1);
  });

  it("unmounting mid-run cancels it", async () => {
    const h = await running();

    act(() => root.unmount());

    expect(h.cancel).toHaveBeenCalledTimes(1);
    // afterEach unmounts again: recreate a root so that stays valid.
    root = createRoot(container);
  });

  it("a failed run shows a safe error (no raw detail)", async () => {
    const h = await running();

    h.resolveRun({ ok: false, reason: "worker-failed" });
    await flush();

    expect(q('[data-japanese-machine-check="error"]')?.textContent).toBe(
      "日本語表現チェックを実行できませんでした。"
    );
  });

  it("a rejected run is a safe error too", async () => {
    const h = await mount();

    h.run.mockImplementationOnce(async () => {
      throw new Error("C:\\Users\\tanaka_taro\\secret.md");
    });
    act(() => (q('[data-japanese-machine-check="run"]') as HTMLButtonElement).click());
    await flush();

    const text = document.body.textContent ?? "";

    expect(text).toContain("日本語表現チェックを実行できませんでした");
    expect(text).not.toContain("tanaka_taro");
  });
});

describe("Japanese machine check dialog: summary screen (#625 P2a)", () => {
  async function summary(truncated: boolean, ruleCounts = [
    { ruleId: "max-ten", count: 12 },
    { ruleId: "no-doubled-joshi", count: 3 }
  ]): Promise<Harness> {
    const h = await mount();

    act(() => (q('[data-japanese-machine-check="run"]') as HTMLButtonElement).click());
    await flush();
    h.resolveRun({
      ok: true,
      summary: {
        resultId: "result-1",
        fileName: "chapter1.md",
        totalMessages: truncated ? 4321 : 15,
        returnedMessages: truncated ? 1000 : 15,
        truncated,
        sourceChars: 1234,
        sourceLines: 40,
        elapsedMs: 12,
        ruleCounts
      }
    });
    await flush();

    return h;
  }

  it("shows the file, totals and a per-rule count table with localized names", async () => {
    await summary(false);

    expect(q('[data-japanese-machine-check="total"]')?.textContent).toBe("15");
    expect(q('[data-japanese-machine-check="returned"]')?.textContent).toBe("15");
    expect(document.body.textContent).toContain("chapter1.md");

    const rows = [...document.querySelectorAll("[data-rule-id]")];

    expect(rows.map((row) => row.getAttribute("data-rule-id"))).toEqual([
      "max-ten",
      "no-doubled-joshi"
    ]);
    // The short result label, not the Settings switch text.
    expect(rows[0]?.querySelector("td")?.textContent).toBe("読点が多い文");
    expect(rows[1]?.querySelector("td")?.textContent).toBe("助詞の重なり");
    expect(document.body.textContent).not.toContain("をチェック");
    expect(
      document.querySelector("[data-japanese-machine-check=rule-table] th")?.textContent
    ).toBe("指摘項目");
    expect(rows[0]?.textContent).toContain("12");
    expect(q('[data-japanese-machine-check="truncated"]')).toBeNull();
  });

  it("shows the truncation note with the 1,000 cap", async () => {
    await summary(true);

    expect(q('[data-japanese-machine-check="total"]')?.textContent).toBe("4,321");
    expect(q('[data-japanese-machine-check="returned"]')?.textContent).toBe("1,000");
    expect(q('[data-japanese-machine-check="truncated"]')?.textContent).toBe(
      "指摘が多いため、表示対象は最初の 1,000 件に制限されています。"
    );
  });

  it("says so when there are no findings", async () => {
    await summary(false, []);

    expect(q('[data-japanese-machine-check="none"]')?.textContent).toBe(
      "指摘はありませんでした。"
    );
    expect(q('[data-japanese-machine-check="rule-table"]')).toBeNull();
  });

  it("offers Close and the Markdown save button", async () => {
    const h = await summary(false);
    const buttons = [...document.querySelectorAll(".appDialogFooter button")];

    expect(buttons.map((b) => b.textContent)).toEqual([
      "閉じる",
      "結果をMarkdownファイルとして保存する"
    ]);
    act(() => (buttons[0] as HTMLButtonElement).click());
    expect(h.onClose).toHaveBeenCalledTimes(1);
    expect(h.cancel).not.toHaveBeenCalled();
  });
});

describe("Japanese style check dialog: Markdown report save (#625 P2b)", () => {
  async function onSummary(counts = [{ ruleId: "max-ten", count: 1 }]): Promise<Harness> {
    const h = await mount();

    act(() => (q('[data-japanese-machine-check="run"]') as HTMLButtonElement).click());
    await flush();
    h.resolveRun({
      ok: true,
      summary: {
        resultId: "result-1",
        fileName: "chapter1.md",
        totalMessages: counts.length,
        returnedMessages: counts.length,
        truncated: false,
        sourceChars: 10,
        sourceLines: 1,
        elapsedMs: 5,
        ruleCounts: counts
      }
    });
    await flush();

    return h;
  }

  const saveButton = () =>
    q('[data-japanese-machine-check="save-report"]') as HTMLButtonElement | null;
  const status = () => q('[data-japanese-machine-check="report-status"]');

  it("is shown on the summary screen only", async () => {
    const h = await mount();

    // estimate
    expect(saveButton()).toBeNull();
    act(() => (q('[data-japanese-machine-check="run"]') as HTMLButtonElement).click());
    await flush();
    // running
    expect(saveButton()).toBeNull();
    expect(document.body.textContent).not.toContain("Markdownファイルとして保存");
    h.resolveRun({ ok: false, reason: "worker-failed" });
    await flush();
    // error
    expect(saveButton()).toBeNull();
  });

  it("saves by result id only, keeps the dialog open and shows success", async () => {
    const h = await onSummary();

    expect(status()).toBeNull();
    act(() => saveButton()!.click());
    await flush();

    expect(h.saveReport).toHaveBeenCalledExactlyOnceWith({ resultId: "result-1" });
    expect(status()?.textContent).toBe("Markdown レポートを保存しました。");
    expect(status()?.getAttribute("data-report-state")).toBe("saved");
    expect(h.onClose).not.toHaveBeenCalled();
    // The summary is still there.
    expect(q('[data-japanese-machine-check="rule-table"]')).not.toBeNull();
  });

  it("can save a run with no findings", async () => {
    const h = await onSummary([]);

    act(() => saveButton()!.click());
    await flush();

    expect(h.saveReport).toHaveBeenCalledTimes(1);
    expect(status()?.getAttribute("data-report-state")).toBe("saved");
  });

  it("a canceled save dialog is not an error", async () => {
    const h = await onSummary();

    h.saveReport.mockResolvedValueOnce({ ok: false, reason: "canceled" });
    act(() => saveButton()!.click());
    await flush();

    expect(status()?.textContent).toBe("保存はキャンセルされました。");
    expect(status()?.getAttribute("role")).toBe("status");
    expect(saveButton()).not.toBeNull();
  });

  it.each(["write-failed", "not-ready", "invalid-target"] as const)(
    "a %s failure shows only the safe message",
    async (reason) => {
      const h = await onSummary();

      h.saveReport.mockResolvedValueOnce({ ok: false, reason });
      act(() => saveButton()!.click());
      await flush();

      expect(status()?.textContent).toBe("Markdown レポートを保存できませんでした。");
      expect(status()?.getAttribute("role")).toBe("alert");
    }
  );

  it("a rejected save shows the safe message, never the raw error", async () => {
    const h = await onSummary();

    h.saveReport.mockRejectedValueOnce(new Error("C:\\Users\\tanaka_taro\\x EACCES"));
    act(() => saveButton()!.click());
    await flush();

    expect(status()?.textContent).toBe("Markdown レポートを保存できませんでした。");
    expect(document.body.textContent).not.toContain("tanaka_taro");
    expect(document.body.textContent).not.toContain("EACCES");
  });

  it("can be retried after a failure", async () => {
    const h = await onSummary();

    h.saveReport.mockResolvedValueOnce({ ok: false, reason: "write-failed" });
    act(() => saveButton()!.click());
    await flush();
    act(() => saveButton()!.click());
    await flush();

    expect(h.saveReport).toHaveBeenCalledTimes(2);
    expect(status()?.getAttribute("data-report-state")).toBe("saved");
  });

  it("closing the dialog lets Main forget the finished run", async () => {
    const h = await onSummary();

    act(() => root.unmount());

    expect(h.discardResult).toHaveBeenCalledExactlyOnceWith({ resultId: "result-1" });
    root = createRoot(container);
  });

  it("English wording", () => {
    expect(t("en", "japaneseMachineCheck.report.button")).toBe(
      "Save results as Markdown"
    );
  });
});

describe("Japanese machine check dialog: platform button order (#625 P2a)", () => {
  it("Windows: Run before Cancel; macOS: Cancel before Run", async () => {
    const order = async (platform: "windows" | "macos"): Promise<string[]> => {
      act(() => root.unmount());
      root = createRoot(container);

      const bridge: JapaneseMachineCheckBridge = {
        prepare: async () => prepared(),
        run: async () => ({ ok: false, reason: "lint-failed" }),
        cancel: async () => undefined,
      saveReport: async () => ({ ok: false, reason: "canceled" }),
      discardResult: async () => undefined,
        onProgress: () => () => undefined
      };

      await act(async () => {
        root.render(
          <JapaneseMachineCheckDialog
            relativePath="a.md"
            isDirty={false}
            translate={translate}
            platform={platform}
            bridge={bridge}
            onClose={() => undefined}
          />
        );
        await Promise.resolve();
        await Promise.resolve();
      });

      return [...document.querySelectorAll(".appDialogFooter button")].map(
        (b) => b.textContent ?? ""
      );
    };

    expect(await order("windows")).toEqual(["実行", "キャンセル"]);
    expect(await order("macos")).toEqual(["キャンセル", "実行"]);
  });
});
