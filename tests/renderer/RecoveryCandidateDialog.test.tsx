// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t, type Translate } from "../../src/shared/i18n";
import type { ClipboardAdapter } from "../../src/renderer/dialog/clipboardAdapter";
import type { RecoveryCandidate } from "../../src/shared/recoveryCandidate";
import { RecoveryCandidateDialog } from "../../src/renderer/recovery/RecoveryCandidateDialog";

const translateJa: Translate = (key, values) => t("ja", key, values);
const translateEn: Translate = (key, values) => t("en", key, values);
const noopClipboard: ClipboardAdapter = { writeText: () => Promise.resolve() };

const MANUSCRIPT_MARKER = "SECRET_MANUSCRIPT_DIALOG_MARKER";

function candidate(
  overrides: Partial<RecoveryCandidate> = {}
): RecoveryCandidate {
  return {
    recoveryId: "id-1",
    documentType: "markdown.file",
    displayName: "chapter-03.md",
    documentEncoding: "utf-8",
    documentLineend: "lf",
    updatedAt: "2026-08-29T12:41:00.000Z",
    characterCount: 4210,
    previewSnippet: `${MANUSCRIPT_MARKER} 昨日は…`,
    hasFilePath: true,
    hasProjectFilePath: true,
    ...overrides
  };
}

const twoCandidates: RecoveryCandidate[] = [
  candidate({ recoveryId: "id-1", displayName: "chapter-03.md" }),
  candidate({
    recoveryId: "id-2",
    displayName: "Untitled.md",
    documentType: "markdown.untitled",
    documentEncoding: null,
    documentLineend: null,
    previewSnippet: "",
    hasFilePath: false,
    hasProjectFilePath: false,
    updatedAt: "2026-08-29T12:45:00.000Z"
  })
];

function baseProps() {
  return {
    candidates: twoCandidates,
    translate: translateJa,
    clipboardAdapter: noopClipboard,
    opener: null,
    onClose: vi.fn(),
    onRestoreSelected: vi.fn(async () => undefined),
    getReportText: vi.fn(
      async (): Promise<string | null> => "report-text"
    ),
    onReportCopied: vi.fn()
  };
}

describe("RecoveryCandidateDialog markup", () => {
  it("puts Copy Recovery Report in the lower-left footer, with only Restore / Close on the right", () => {
    const markup = renderToStaticMarkup(
      <RecoveryCandidateDialog {...baseProps()} />
    );
    // The report button lives in the About-style lower-left control.
    expect(markup).toMatch(
      /aboutDialogTechnicalInfoControl[^]*復旧レポートをコピー/
    );
    // The lower-right action stack is Restore then Close — no discard.
    expect(markup).toMatch(
      /recoveryCandidateDialogActions[^]*選択したものを復元[^]*閉じる/
    );
    // The report button is NOT inside the action stack.
    const actions = markup.slice(markup.indexOf("recoveryCandidateDialogActions"));
    expect(actions).not.toContain("復旧レポートをコピー");
  });

  it("renders the report copy control as an icon button, not a text-label button", () => {
    const markup = renderToStaticMarkup(
      <RecoveryCandidateDialog {...baseProps()} />
    );
    const buttonMatch = markup.match(
      /<button[^>]*recoveryCandidateDialogReportButton[^>]*>([\s\S]*?)<\/button>/
    );
    expect(buttonMatch).not.toBeNull();
    const [wholeButton, innerHtml] = buttonMatch!;
    // Icon, not a visible text label.
    expect(innerHtml).toContain("<img");
    expect(innerHtml).toContain("aboutDialogCopyTechnicalIcon");
    expect(innerHtml).not.toContain("復旧レポートをコピー");
    // Accessible label + tooltip both carry the localized name.
    expect(wholeButton).toContain('aria-label="復旧レポートをコピー"');
    expect(wholeButton).toContain('title="復旧レポートをコピー"');
    // Not destructive, Close is unaffected.
    expect(wholeButton).not.toContain("appDialogButton-choice-destructive");
    // Idle icon is the clipboard glyph.
    expect(wholeButton).toMatch(/src="[^"]*clipboard[^"]*"/);
  });

  it("uses the current UI language for the report control label and tooltip", () => {
    const markup = renderToStaticMarkup(
      <RecoveryCandidateDialog {...baseProps()} translate={translateEn} />
    );
    expect(markup).toContain('aria-label="Copy Recovery Report"');
    expect(markup).toContain('title="Copy Recovery Report"');
    expect(markup).not.toContain("復旧レポートをコピー");
  });

  it("bottom-aligns the footer copy control via a dedicated layout hook", () => {
    const markup = renderToStaticMarkup(
      <RecoveryCandidateDialog {...baseProps()} />
    );
    expect(markup).toContain("recoveryCandidateDialogFooterContent");

    const css = readFileSync("src/renderer/styles.css", "utf8");
    const start = css.indexOf(".recoveryCandidateDialogFooterContent {");
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf("}", start));
    expect(block).toContain("align-items: flex-end");
  });

  it("shows the last-updated column as yyyy-MM-dd only, keeping the full value for sorting", () => {
    const markup = renderToStaticMarkup(
      <RecoveryCandidateDialog {...baseProps()} />
    );
    // Date-only in the visible cell…
    expect(markup).toContain("<td>2026-08-29</td>");
    // …never the full timestamp.
    expect(markup).not.toContain("2026-08-29T12:41:00.000Z");
    expect(markup).not.toContain("2026-08-29T12:45:00.000Z");
  });

  it("renders no destructive discard button", () => {
    const markup = renderToStaticMarkup(
      <RecoveryCandidateDialog {...baseProps()} />
    );
    expect(markup).not.toContain("選択したものを破棄");
    expect(markup).not.toContain("appDialogButton-choice-destructive");
  });

  it("gives disabled dialog buttons a visible disabled style", () => {
    // Regression guard: a disabled Restore Selected button must not keep the
    // full-strength confirm fill and read as enabled.
    const css = readFileSync("src/renderer/styles.css", "utf8");
    const start = css.indexOf(".appDialogButton:disabled {");
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf("}", start));
    expect(block).toMatch(/opacity:\s*0?\.\d+/);
  });

  it("renders a grid with the checkbox column + the five data columns and the localized empty preview", () => {
    const markup = renderToStaticMarkup(
      <RecoveryCandidateDialog {...baseProps()} />
    );
    expect(markup).toContain('role="grid"');
    expect(markup).toContain("文書名");
    expect(markup).toContain("本文冒頭");
    expect(markup).toContain("最終更新");
    expect(markup).toContain("文字数");
    expect(markup).toContain("種別");
    expect(markup).toContain('aria-sort="descending"'); // initial updatedAt desc
    // Untitled row has a blank payload → localized placeholder.
    expect(markup).toContain("—");
  });

  it("shows the empty-state message and no grid when there are no candidates", () => {
    const markup = renderToStaticMarkup(
      <RecoveryCandidateDialog {...baseProps()} candidates={[]} />
    );
    expect(markup).toContain("復元できる未保存の編集内容はありません。");
    expect(markup).not.toContain('role="grid"');
  });
});

describe("RecoveryCandidateDialog behavior", () => {
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

  function render(props: ReturnType<typeof baseProps>): void {
    act(() => {
      root.render(<RecoveryCandidateDialog {...props} />);
    });
  }

  function rowCheckboxes(): HTMLInputElement[] {
    return [
      ...container.querySelectorAll<HTMLInputElement>("tbody input[type=checkbox]")
    ];
  }
  function headerCheckbox(): HTMLInputElement {
    return container.querySelector<HTMLInputElement>(
      "thead input[type=checkbox]"
    )!;
  }
  function footerButton(label: string): HTMLButtonElement {
    return [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.trim() === label
    )!;
  }
  function reportCopyButton(): HTMLButtonElement {
    return container.querySelector<HTMLButtonElement>(
      ".recoveryCandidateDialogReportButton"
    )!;
  }
  function reportCopyIconSrc(): string {
    return reportCopyButton().querySelector("img")!.getAttribute("src") ?? "";
  }

  it("disables Restore with zero selected and enables it once a row is selected", () => {
    render(baseProps());
    expect(footerButton("選択したものを復元").disabled).toBe(true);

    act(() => {
      rowCheckboxes()[0].click();
    });
    expect(footerButton("選択したものを復元").disabled).toBe(false);

    act(() => {
      rowCheckboxes()[0].click();
    });
    expect(footerButton("選択したものを復元").disabled).toBe(true);
  });

  describe("Restore Selected enabled state (#288 follow-up)", () => {
    const RESTORE_LABEL = "選択したものを復元";

    it("zero candidates: disabled, and a click never restores", async () => {
      const props = baseProps();
      props.candidates = [];
      render(props);

      expect(footerButton(RESTORE_LABEL).disabled).toBe(true);
      await act(async () => {
        footerButton(RESTORE_LABEL).click();
      });
      expect(props.onRestoreSelected).not.toHaveBeenCalled();
    });

    it("candidates exist but none selected: disabled, and a click never restores", async () => {
      const props = baseProps();
      render(props);

      expect(rowCheckboxes().some((c) => c.checked)).toBe(false);
      expect(footerButton(RESTORE_LABEL).disabled).toBe(true);
      await act(async () => {
        footerButton(RESTORE_LABEL).click();
      });
      expect(props.onRestoreSelected).not.toHaveBeenCalled();
    });

    it("one candidate selected: enabled, and a click restores exactly that candidate", async () => {
      const props = baseProps();
      render(props);
      // updatedAt desc → row 0 is id-2 (the newer Untitled row).
      act(() => rowCheckboxes()[0].click());

      expect(footerButton(RESTORE_LABEL).disabled).toBe(false);
      await act(async () => {
        footerButton(RESTORE_LABEL).click();
      });
      expect(props.onRestoreSelected).toHaveBeenCalledTimes(1);
      expect(props.onRestoreSelected).toHaveBeenCalledWith(["id-2"]);
    });

    it("multiple candidates exist but all unchecked: disabled", () => {
      const props = baseProps();
      render(props);

      // Select all, then clear via the header checkbox.
      act(() => headerCheckbox().click());
      expect(footerButton(RESTORE_LABEL).disabled).toBe(false);
      act(() => headerCheckbox().click());

      expect(rowCheckboxes().some((c) => c.checked)).toBe(false);
      expect(footerButton(RESTORE_LABEL).disabled).toBe(true);
    });

    it("becomes disabled again after unchecking the last selected candidate", () => {
      render(baseProps());
      act(() => rowCheckboxes()[0].click());
      act(() => rowCheckboxes()[1].click());
      expect(footerButton(RESTORE_LABEL).disabled).toBe(false);

      act(() => rowCheckboxes()[0].click());
      expect(footerButton(RESTORE_LABEL).disabled).toBe(false);

      act(() => rowCheckboxes()[1].click());
      expect(footerButton(RESTORE_LABEL).disabled).toBe(true);
    });

    it("when the candidate list changes to empty the selection is ignored and Restore is disabled", async () => {
      const props = baseProps();
      render(props);
      act(() => rowCheckboxes()[0].click());
      expect(footerButton(RESTORE_LABEL).disabled).toBe(false);

      act(() => {
        root.render(<RecoveryCandidateDialog {...props} candidates={[]} />);
      });

      expect(container.querySelector("tbody")).toBeNull();
      expect(footerButton(RESTORE_LABEL).disabled).toBe(true);
      await act(async () => {
        footerButton(RESTORE_LABEL).click();
      });
      expect(props.onRestoreSelected).not.toHaveBeenCalled();
    });

    it("uses a real disabled attribute, not aria-disabled only", () => {
      const props = baseProps();
      props.candidates = [];
      render(props);
      const button = footerButton(RESTORE_LABEL);
      expect(button.hasAttribute("disabled")).toBe(true);
      expect(button.getAttribute("aria-disabled")).toBeNull();
    });

    it("keeps Close enabled while Restore is disabled", () => {
      const props = baseProps();
      render(props);
      expect(footerButton(RESTORE_LABEL).disabled).toBe(true);
      expect(footerButton("閉じる").disabled).toBe(false);
    });
  });

  it("header checkbox is indeterminate for a partial selection and checked for all", () => {
    render(baseProps());
    expect(headerCheckbox().checked).toBe(false);
    expect(headerCheckbox().indeterminate).toBe(false);

    act(() => rowCheckboxes()[0].click());
    expect(headerCheckbox().indeterminate).toBe(true);
    expect(headerCheckbox().checked).toBe(false);

    act(() => headerCheckbox().click()); // select all
    expect(headerCheckbox().checked).toBe(true);
    expect(rowCheckboxes().every((c) => c.checked)).toBe(true);

    act(() => headerCheckbox().click()); // clear
    expect(rowCheckboxes().some((c) => c.checked)).toBe(false);
  });

  it("Close calls onClose and never a restore / delete path", () => {
    const props = baseProps();
    render(props);
    act(() => footerButton("閉じる").click());
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onRestoreSelected).not.toHaveBeenCalled();
    // There is no discard control on this surface at all.
    expect(footerButton("選択したものを破棄")).toBeUndefined();
  });

  it("Restore Selected passes the selected recoveryIds", async () => {
    const props = baseProps();
    render(props);
    // Row 0 in the initial (updatedAt desc) order is the newer Untitled row.
    act(() => rowCheckboxes()[0].click());
    await act(async () => {
      footerButton("選択したものを復元").click();
    });
    expect(props.onRestoreSelected).toHaveBeenCalledWith(["id-2"]);
  });

  it("Copy Recovery Report copies the fetched text and reports the copy", async () => {
    const writeText = vi.fn(async () => undefined);
    const props = baseProps();
    props.clipboardAdapter = { writeText };
    render(props);
    await act(async () => {
      reportCopyButton().click();
    });
    expect(props.getReportText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("report-text");
    expect(props.onReportCopied).toHaveBeenCalledWith(2);
  });

  it("has an accessible label and is not disabled on the copy control at rest", () => {
    render(baseProps());
    const button = reportCopyButton();
    expect(button.getAttribute("aria-label")).toBe("復旧レポートをコピー");
    expect(button.getAttribute("title")).toBe("復旧レポートをコピー");
    expect(button.disabled).toBe(false);
    // Idle icon = clipboard glyph.
    expect(reportCopyIconSrc()).toMatch(/clipboard/);
  });

  it("shows a check icon after a successful copy", async () => {
    const props = baseProps();
    props.clipboardAdapter = { writeText: vi.fn(async () => undefined) };
    render(props);
    const idleSrc = reportCopyIconSrc();
    await act(async () => {
      reportCopyButton().click();
    });
    const successSrc = reportCopyIconSrc();
    expect(successSrc).not.toBe(idleSrc);
    expect(successSrc).toMatch(/check-square/);
    // The status card carries the localized confirmation text (not tooltip-only).
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "コピーしました"
    );
  });

  it("shows an X icon when the copy fails", async () => {
    const props = baseProps();
    props.getReportText = vi.fn(async (): Promise<string | null> => null);
    render(props);
    const idleSrc = reportCopyIconSrc();
    await act(async () => {
      reportCopyButton().click();
    });
    const failedSrc = reportCopyIconSrc();
    expect(failedSrc).not.toBe(idleSrc);
    expect(failedSrc).toMatch(/x-circle/);
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "クリップボードへコピーできませんでした"
    );
  });

  it("keeps Close enabled while the copy control is busy", async () => {
    const props = baseProps();
    let resolveReport: (value: string) => void = () => undefined;
    props.getReportText = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveReport = resolve;
        })
    );
    render(props);
    act(() => {
      reportCopyButton().click();
    });
    expect(footerButton("閉じる").disabled).toBe(false);
    await act(async () => {
      resolveReport("report-text");
    });
  });

  it("selection is keyed by recoveryId and survives a sort", () => {
    const props = baseProps();
    render(props);
    act(() => rowCheckboxes()[0].click()); // select the first *visible* row (id-1, updatedAt desc → id-2 is first)
    // With updatedAt desc, row 0 is id-2 (12:45). Select it.
    const selectedBefore = rowCheckboxes()
      .map((c, i) => (c.checked ? i : -1))
      .filter((i) => i >= 0);
    // Toggle sort to updatedAt asc via the header button.
    const updatedHeader = [
      ...container.querySelectorAll<HTMLButtonElement>(
        ".recoveryCandidateDialogSortButton"
      )
    ].find((b) => b.textContent?.includes("最終更新"))!;
    act(() => updatedHeader.click());
    const selectedAfter = rowCheckboxes()
      .map((c, i) => (c.checked ? i : -1))
      .filter((i) => i >= 0);
    // The visible index of the checked row flipped, proving selection is by id.
    expect(selectedAfter).not.toEqual(selectedBefore);
    expect(rowCheckboxes().filter((c) => c.checked)).toHaveLength(1);
  });
});
