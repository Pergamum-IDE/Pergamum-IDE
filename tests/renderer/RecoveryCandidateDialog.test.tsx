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
    onDiscardSelected: vi.fn(async () => undefined),
    onDiscardAll: vi.fn(async () => undefined),
    getReportText: vi.fn(
      async (): Promise<string | null> => "report-text"
    ),
    onReportCopied: vi.fn()
  };
}

describe("RecoveryCandidateDialog markup", () => {
  it("puts Copy Recovery Report in the lower-left footer, with recovery actions on the right", () => {
    const markup = renderToStaticMarkup(
      <RecoveryCandidateDialog {...baseProps()} />
    );
    // The report button lives in the About-style lower-left control.
    expect(markup).toMatch(
      /aboutDialogTechnicalInfoControl[^]*復旧レポートをコピー/
    );
    // The lower-right action stack contains explicit discard actions,
    // restore, then Close.
    expect(markup).toMatch(
      /recoveryCandidateDialogActions[^]*選択した復旧候補を破棄\.\.\.[^]*すべての復旧候補を破棄\.\.\.[^]*選択したものを復元[^]*後で決める/
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

  it("renders explicit destructive discard buttons", () => {
    const markup = renderToStaticMarkup(
      <RecoveryCandidateDialog {...baseProps()} />
    );
    expect(markup).toContain("選択した復旧候補を破棄...");
    expect(markup).toContain("すべての復旧候補を破棄...");
    expect(markup).toContain("appDialogButton-choice-destructive");
  });

  it("wires the ionicons hourglass + trash assets as bundled imports, not inline SVG strings", () => {
    const source = readFileSync(
      "src/renderer/recovery/RecoveryCandidateDialog.tsx",
      "utf8"
    );
    expect(source).toContain(
      'assets/icons/ionicons/dialog/hourglass-outline.svg?url'
    );
    expect(source).toContain(
      'assets/icons/ionicons/dialog/trash-bin-outline.svg?url'
    );
    expect(source).not.toContain("reload-outline.svg?url");
    // No hand-rolled inline SVG markup in the component.
    expect(source).not.toMatch(/<svg[\s>]/);
  });

  it("omits targetless discard icons and shows a pending icon for targetful discard", () => {
    const markup = renderToStaticMarkup(
      <RecoveryCandidateDialog {...baseProps()} />
    );
    const discardButtons = [
      ...markup.matchAll(
        /<button[^>]*recoveryDiscardButton[^>]*>([\s\S]*?)<\/button>/g
      )
    ];
    expect(discardButtons).toHaveLength(2);
    const selectedDiscard = discardButtons.find(([, inner]) =>
      inner.includes("選択した復旧候補を破棄...")
    )![1];
    const discardAll = discardButtons.find(([, inner]) =>
      inner.includes("すべての復旧候補を破棄...")
    )![1];

    expect(selectedDiscard).not.toContain("recoveryDiscardButtonIcon");
    // The all-discard icon is the button's first child (leading edge) and is
    // decorative; the visible label alone conveys the action.
    expect(discardAll).toMatch(
      /^<span class="recoveryDiscardButtonIcon"[^>]*aria-hidden="true"[^>]*><\/span>/
    );
    expect(discardAll).toContain("--recovery-discard-button-icon");
    expect(discardAll).toContain("data:image/svg+xml");
    expect(discardAll).not.toContain("<img");
    expect(discardAll).not.toContain("alt=");
    expect(markup).toContain("<span>選択した復旧候補を破棄...</span>");
    expect(markup).toContain("<span>すべての復旧候補を破棄...</span>");
  });

  it("uses a currentColor CSS mask for discard icons and does not render reload/spinner UI", () => {
    const markup = renderToStaticMarkup(
      <RecoveryCandidateDialog {...baseProps()} />
    );
    expect(markup).not.toContain("recoveryDiscardPendingIcon");
    expect(markup).not.toContain("reload-outline");

    const css = readFileSync("src/renderer/styles.css", "utf8");
    const start = css.indexOf(".recoveryDiscardButtonIcon {");
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf("}", start));
    expect(block).toContain("background-color: currentColor");
    expect(block).toContain(
      "mask: var(--recovery-discard-button-icon) center / contain no-repeat"
    );
    expect(block).toContain(
      "-webkit-mask: var(--recovery-discard-button-icon) center / contain no-repeat"
    );
    expect(css).not.toContain("recoveryDiscardPendingSpin");
    expect(css).not.toContain("rotate(360deg)");
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

  it("uses Decide Later while candidates remain and Close when there are none", () => {
    const withCandidates = renderToStaticMarkup(
      <RecoveryCandidateDialog {...baseProps()} />
    );
    expect(withCandidates).toContain("後で決める");
    expect(withCandidates).not.toMatch(/<button[^>]*>閉じる<\/button>/);

    const emptyJa = renderToStaticMarkup(
      <RecoveryCandidateDialog {...baseProps()} candidates={[]} />
    );
    expect(emptyJa).toMatch(/<button[^>]*>閉じる<\/button>/);
    expect(emptyJa).not.toContain("後で決める");

    const withCandidatesEn = renderToStaticMarkup(
      <RecoveryCandidateDialog {...baseProps()} translate={translateEn} />
    );
    expect(withCandidatesEn).toContain("Decide Later");
    expect(withCandidatesEn).not.toMatch(/<button[^>]*>Close<\/button>/);
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
  function candidateRows(): HTMLTableRowElement[] {
    return [...container.querySelectorAll<HTMLTableRowElement>("tbody tr")];
  }
  function footerButton(label: string): HTMLButtonElement {
    return [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.trim() === label
    )!;
  }
  function discardButtonIcon(button: HTMLButtonElement): HTMLElement | null {
    return button.querySelector<HTMLElement>(".recoveryDiscardButtonIcon");
  }
  function requireDiscardButtonIcon(button: HTMLButtonElement): HTMLElement {
    const icon = discardButtonIcon(button);
    expect(icon).not.toBeNull();
    return icon!;
  }
  function discardButtonIconUrl(button: HTMLButtonElement): string {
    return requireDiscardButtonIcon(button).style.getPropertyValue(
      "--recovery-discard-button-icon"
    );
  }
  function discardButtonIconPayload(button: HTMLButtonElement): string {
    return decodeURIComponent(discardButtonIconUrl(button));
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
      expect(footerButton("後で決める").disabled).toBe(false);
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

  it("candidate row clicks toggle selection without requiring the checkbox target", () => {
    render(baseProps());
    const rows = candidateRows();
    expect(rows).toHaveLength(2);
    expect(rowCheckboxes()[0].checked).toBe(false);
    expect(rows[0].getAttribute("aria-selected")).toBe("false");

    act(() => rows[0].click());
    expect(rowCheckboxes()[0].checked).toBe(true);
    expect(rows[0].getAttribute("aria-selected")).toBe("true");

    act(() => rows[0].click());
    expect(rowCheckboxes()[0].checked).toBe(false);
    expect(rows[0].getAttribute("aria-selected")).toBe("false");
  });

  it("checkbox clicks toggle exactly once and keep the header checkbox behavior intact", () => {
    render(baseProps());

    act(() => rowCheckboxes()[0].click());
    expect(rowCheckboxes()[0].checked).toBe(true);
    expect(rowCheckboxes().filter((checkbox) => checkbox.checked)).toHaveLength(
      1
    );
    expect(headerCheckbox().indeterminate).toBe(true);

    act(() => rowCheckboxes()[0].click());
    expect(rowCheckboxes()[0].checked).toBe(false);
    expect(rowCheckboxes().some((checkbox) => checkbox.checked)).toBe(false);

    act(() => headerCheckbox().click());
    expect(rowCheckboxes().every((checkbox) => checkbox.checked)).toBe(true);
    act(() => headerCheckbox().click());
    expect(rowCheckboxes().some((checkbox) => checkbox.checked)).toBe(false);
  });

  it("keeps native checkbox controls for keyboard Space toggling", () => {
    render(baseProps());
    const checkbox = rowCheckboxes()[0];
    expect(checkbox.tagName).toBe("INPUT");
    expect(checkbox.type).toBe("checkbox");

    const source = readFileSync(
      "src/renderer/recovery/RecoveryCandidateDialog.tsx",
      "utf8"
    );
    expect(source).toContain('type="checkbox"');
    expect(source).not.toContain("onKeyDown");
  });

  it("styles hover and selected recovery rows", () => {
    const css = readFileSync("src/renderer/styles.css", "utf8");
    expect(css).toContain(".recoveryCandidateDialogRow:hover");
    expect(css).toContain(".recoveryCandidateDialogRow-selected");
    expect(css).toContain(".recoveryCandidateDialogRow-selected:hover");
  });

  it("Decide Later calls onClose and never a restore / delete path", () => {
    const props = baseProps();
    render(props);
    act(() => footerButton("後で決める").click());
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onRestoreSelected).not.toHaveBeenCalled();
    expect(props.onDiscardSelected).not.toHaveBeenCalled();
    expect(props.onDiscardAll).not.toHaveBeenCalled();
  });

  it("Close uses the same close path when no candidates remain", () => {
    const props = baseProps();
    props.candidates = [];
    render(props);
    act(() => footerButton("閉じる").click());
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onRestoreSelected).not.toHaveBeenCalled();
    expect(props.onDiscardSelected).not.toHaveBeenCalled();
    expect(props.onDiscardAll).not.toHaveBeenCalled();
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

  describe("explicit discard 5s destructive delay (#300)", () => {
    const DISCARD_SELECTED = "選択した復旧候補を破棄...";
    const DISCARD_ALL = "すべての復旧候補を破棄...";

    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    function advance(ms: number): void {
      act(() => {
        vi.advanceTimersByTime(ms);
      });
    }

    it("Discard Selected stays disabled with no selection", () => {
      render(baseProps());
      const selectedButton = footerButton(DISCARD_SELECTED);
      expect(selectedButton.disabled).toBe(true);
      expect(discardButtonIcon(selectedButton)).toBeNull();
      advance(6000);
      expect(selectedButton.disabled).toBe(true);
      expect(discardButtonIcon(selectedButton)).toBeNull();
    });

    it("Discard Selected is still disabled right after selecting, then arms after 5s", async () => {
      const props = baseProps();
      render(props);

      act(() => rowCheckboxes()[0].click());
      const selectedButton = footerButton(DISCARD_SELECTED);
      expect(selectedButton.disabled).toBe(true);
      expect(discardButtonIconPayload(selectedButton)).toContain(
        "M145.61 464"
      );

      advance(4999);
      expect(selectedButton.disabled).toBe(true);
      expect(discardButtonIconPayload(selectedButton)).toContain(
        "M145.61 464"
      );

      advance(1);
      expect(selectedButton.disabled).toBe(false);
      expect(discardButtonIconPayload(selectedButton)).toContain("m432 144");

      await act(async () => {
        selectedButton.click();
      });
      expect(props.onDiscardSelected).toHaveBeenCalledWith(["id-2"]);
      expect(props.onDiscardAll).not.toHaveBeenCalled();
    });

    it("changing the selection restarts the Discard Selected 5s wait", async () => {
      const props = baseProps();
      render(props);

      act(() => rowCheckboxes()[0].click());
      advance(5000);
      expect(footerButton(DISCARD_SELECTED).disabled).toBe(false);

      // Add a second row → the selection changed → re-arm.
      act(() => rowCheckboxes()[1].click());
      expect(footerButton(DISCARD_SELECTED).disabled).toBe(true);

      advance(4999);
      expect(footerButton(DISCARD_SELECTED).disabled).toBe(true);
      advance(1);
      expect(footerButton(DISCARD_SELECTED).disabled).toBe(false);

      await act(async () => {
        footerButton(DISCARD_SELECTED).click();
      });
      expect(props.onDiscardSelected).toHaveBeenCalledWith(["id-2", "id-1"]);
    });

    it("clearing the selection returns Discard Selected to disabled", () => {
      render(baseProps());
      act(() => rowCheckboxes()[0].click());
      advance(5000);
      expect(footerButton(DISCARD_SELECTED).disabled).toBe(false);

      act(() => rowCheckboxes()[0].click()); // unselect
      const selectedButton = footerButton(DISCARD_SELECTED);
      expect(selectedButton.disabled).toBe(true);
      expect(discardButtonIcon(selectedButton)).toBeNull();
      advance(6000);
      expect(selectedButton.disabled).toBe(true);
      expect(discardButtonIcon(selectedButton)).toBeNull();
    });

    it("Discard All arms 5s after open, independent of selection, then passes every listed id", async () => {
      const props = baseProps();
      render(props);

      expect(footerButton(DISCARD_ALL).disabled).toBe(true);
      expect(discardButtonIconPayload(footerButton(DISCARD_ALL))).toContain(
        "M145.61 464"
      );
      advance(4999);
      expect(footerButton(DISCARD_ALL).disabled).toBe(true);
      advance(1);
      expect(footerButton(DISCARD_ALL).disabled).toBe(false);
      expect(discardButtonIconPayload(footerButton(DISCARD_ALL))).toContain(
        "m432 144"
      );
      // Never selected a row — Discard All does not depend on selectedCount.
      expect(rowCheckboxes().some((c) => c.checked)).toBe(false);

      await act(async () => {
        footerButton(DISCARD_ALL).click();
      });
      expect(props.onDiscardAll).toHaveBeenCalledWith(["id-1", "id-2"]);
      expect(props.onDiscardSelected).not.toHaveBeenCalled();
    });

    it("Discard All stays disabled with no candidates and shows no icon", () => {
      const props = baseProps();
      props.candidates = [];
      render(props);

      const discardAllButton = footerButton(DISCARD_ALL);
      expect(discardAllButton.disabled).toBe(true);
      expect(discardButtonIcon(discardAllButton)).toBeNull();
      advance(6000);
      expect(discardAllButton.disabled).toBe(true);
      expect(discardButtonIcon(discardAllButton)).toBeNull();
    });

    it("a changed candidate set restarts the Discard All 5s wait", () => {
      const props = baseProps();
      render(props);
      advance(5000);
      expect(footerButton(DISCARD_ALL).disabled).toBe(false);

      act(() => {
        root.render(
          <RecoveryCandidateDialog
            {...props}
            candidates={[twoCandidates[0]]}
          />
        );
      });
      expect(footerButton(DISCARD_ALL).disabled).toBe(true);
      advance(5000);
      expect(footerButton(DISCARD_ALL).disabled).toBe(false);
    });

    it("a candidate list that goes empty disables Discard All", () => {
      const props = baseProps();
      render(props);
      advance(5000);
      expect(footerButton(DISCARD_ALL).disabled).toBe(false);

      act(() => {
        root.render(<RecoveryCandidateDialog {...props} candidates={[]} />);
      });
      const discardAllButton = footerButton(DISCARD_ALL);
      expect(discardAllButton.disabled).toBe(true);
      expect(discardButtonIcon(discardAllButton)).toBeNull();
      advance(6000);
      expect(discardAllButton.disabled).toBe(true);
      expect(discardButtonIcon(discardAllButton)).toBeNull();
    });

    it("shows an hourglass icon while waiting, then switches to trash when armed", () => {
      render(baseProps());
      const allButton = () => footerButton(DISCARD_ALL);
      expect(
        requireDiscardButtonIcon(allButton()).getAttribute("aria-hidden")
      ).toBe(
        "true"
      );
      const pendingIcon = discardButtonIconPayload(allButton());
      expect(pendingIcon).toContain("M145.61 464");
      expect(pendingIcon).not.toContain("m432 144");
      expect(
        allButton().querySelector(".recoveryDiscardPendingIcon")
      ).toBeNull();
      expect(allButton().innerHTML).not.toContain("reload-outline");
      expect(allButton().disabled).toBe(true);

      advance(5000);
      expect(allButton().disabled).toBe(false);
      const readyIcon = discardButtonIconPayload(allButton());
      expect(readyIcon).toContain("m432 144");
      expect(readyIcon).not.toContain("M145.61 464");
    });

    it("still routes through onDiscard* (parent-side confirmation) after the delay", async () => {
      const props = baseProps();
      render(props);
      act(() => rowCheckboxes()[0].click());
      advance(5000);
      await act(async () => {
        footerButton(DISCARD_SELECTED).click();
      });
      // The dialog never deletes a row itself — it hands off to the parent,
      // which shows the destructive confirm dialog.
      expect(props.onDiscardSelected).toHaveBeenCalledTimes(1);
    });
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
    expect(footerButton("後で決める").disabled).toBe(false);
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
