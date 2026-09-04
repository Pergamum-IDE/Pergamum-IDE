// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Translate } from "../../src/shared/i18n";
import {
  ReplacePreviewDialog,
  type ReplaceApplyResult,
  type ReplacePreviewCandidate,
  type ReplacePreviewScope,
  type ReplacePreviewSearchOptions
} from "../../src/renderer/replace/ReplacePreviewDialog";

const NO_OPTIONS: ReplacePreviewSearchOptions = {
  wholeWord: false,
  caseSensitive: false,
  useRegex: false
};

const translate: Translate = (key, values) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

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

function candidate(
  overrides: Partial<ReplacePreviewCandidate> = {}
): ReplacePreviewCandidate {
  return {
    id: overrides.id ?? "f1:0",
    fileId: overrides.fileId ?? "chapters/01.md",
    fileLabel: overrides.fileLabel ?? "01.md",
    filePath: overrides.filePath ?? "chapters/01.md",
    line: overrides.line ?? 1,
    column: overrides.column ?? 1,
    contextBefore: overrides.contextBefore ?? "before ",
    contextAfter: overrides.contextAfter ?? " after",
    truncatedStart: overrides.truncatedStart ?? false,
    truncatedEnd: overrides.truncatedEnd ?? false,
    beforeText: overrides.beforeText ?? "メイド",
    afterText: overrides.afterText ?? "使用人",
    enabled: overrides.enabled ?? true
  };
}

const CANDIDATES: ReplacePreviewCandidate[] = [
  candidate({ id: "a:0", fileId: "a.md", fileLabel: "a.md", line: 3, column: 6 }),
  candidate({ id: "a:1", fileId: "a.md", fileLabel: "a.md", line: 9, column: 2 }),
  candidate({ id: "b:0", fileId: "b.md", fileLabel: "b.md", line: 1, column: 1 })
];

function renderDialog(
  props: Partial<{
    scope: ReplacePreviewScope;
    findText: string;
    replaceText: string;
    searchOptions: ReplacePreviewSearchOptions;
    loading: boolean;
    candidates: readonly ReplacePreviewCandidate[];
    limitReached: boolean;
    applying: boolean;
    applyResult: ReplaceApplyResult | null;
    onCancel: () => void;
    onApplySelected: (ids: readonly string[]) => void;
  }> = {}
): void {
  act(() => {
    root.render(
      React.createElement(ReplacePreviewDialog, {
        scope: props.scope ?? "openDocuments",
        findText: props.findText ?? "メイド",
        replaceText: props.replaceText ?? "使用人",
        searchOptions: props.searchOptions ?? NO_OPTIONS,
        loading: props.loading ?? false,
        candidates: props.candidates ?? CANDIDATES,
        limitReached: props.limitReached ?? false,
        applying: props.applying ?? false,
        applyResult: props.applyResult ?? null,
        translate,
        opener: null,
        onCancel: props.onCancel ?? vi.fn(),
        onApplySelected: props.onApplySelected ?? vi.fn()
      })
    );
  });
}

function conditionValue(label: string): string | null {
  const rows = Array.from(
    container.querySelectorAll<HTMLElement>(".replacePreviewCondition")
  );
  const row = rows.find(
    (element) =>
      element.querySelector(".replacePreviewConditionLabel")?.textContent ===
      label
  );
  return (
    row?.querySelector(".replacePreviewConditionValue")?.textContent ?? null
  );
}

function rows(): HTMLLIElement[] {
  return Array.from(
    container.querySelectorAll<HTMLLIElement>(".replacePreviewRow")
  );
}
function summaryText(): string | null {
  return (
    container.querySelector(".replacePreviewSummary")?.textContent ?? null
  );
}
function rowControl(index: number): HTMLSelectElement {
  return rows()[index].querySelector<HTMLSelectElement>(
    ".replacePreviewRowControl"
  )!;
}
function setRow(index: number, value: "apply" | "ignore"): void {
  const select = rowControl(index);
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value"
    )!.set!;
    setter.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
function clickButton(text: string): void {
  const button = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button")
  ).find((b) => b.textContent === text)!;
  act(() => button.click());
}

function confirmButton(): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(
    ".appDialogActions .appDialogButton-confirm"
  )!;
}

function secondaryButton(): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(
    ".appDialogActions .appDialogButton:not(.appDialogButton-confirm)"
  )!;
}

function pressEscape(): void {
  const dialogEl = container.querySelector('[role="dialog"]') as HTMLElement;
  act(() => {
    dialogEl.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
  });
}

describe("ReplacePreviewDialog (#386)", () => {
  it("renders the Open Documents scope header and description (replace IS implemented for this scope, so no not-implemented note)", () => {
    renderDialog();
    expect(
      container.querySelector(".appDialogTitle")?.textContent
    ).toBe("search.replace.preview.openDocs.title");
    expect(
      container.querySelector(".replacePreviewDescription")?.textContent
    ).toBe("search.replace.preview.openDocs.description");
    expect(
      container.querySelector(".replacePreviewNotImplemented")
    ).toBeNull();
  });

  it("shows the destructive 'cannot be undone' warning for the projectDocuments scope only", () => {
    renderDialog({ scope: "openDocuments" });
    expect(
      container.querySelector(".replacePreviewDestructiveWarning")
    ).toBeNull();

    renderDialog({ scope: "projectDocuments" });
    expect(
      container.querySelector(".replacePreviewDestructiveWarning")?.textContent
    ).toBe("search.replace.preview.project.destructiveWarning");
  });

  it("loading: shows the preparing message + skeleton rows, and no candidate list / summary", () => {
    renderDialog({ loading: true });

    expect(
      container.querySelector(".replacePreviewLoadingMessage")?.textContent
    ).toBe("search.replace.preview.preparing");
    expect(
      container.querySelectorAll(".replacePreviewSkeletonRow").length
    ).toBeGreaterThanOrEqual(3);

    // The real list, its counts and bulk actions are not rendered yet.
    expect(container.querySelector(".replacePreviewGroups")).toBeNull();
    expect(container.querySelector(".replacePreviewSummary")).toBeNull();
    expect(container.querySelector(".replacePreviewBulkActions")).toBeNull();
  });

  it("loading: keeps the find / replace / mode summary and shows only Cancel in the footer", () => {
    renderDialog({
      loading: true,
      findText: "メイド",
      replaceText: "使用人"
    });

    expect(conditionValue("search.replace.preview.findLabel")).toBe("メイド");
    expect(conditionValue("search.replace.preview.replaceLabel")).toBe("使用人");

    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".appDialogActions button")
    ).map((b) => b.textContent);
    expect(buttons).toEqual(["common.cancel"]);
    expect(
      buttons.some((label) => label === "search.replace.preview.applyAsEdits")
    ).toBe(false);
  });

  it("loading: Cancel still works", () => {
    const onCancel = vi.fn();
    renderDialog({ loading: true, onCancel });

    const cancel = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button")
    ).find((b) => b.textContent === "common.cancel")!;
    act(() => cancel.click());
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("ready (loading=false): renders the candidate list and the Apply button", () => {
    renderDialog(); // loading defaults to false

    expect(container.querySelector(".replacePreviewLoadingMessage")).toBeNull();
    expect(container.querySelector(".replacePreviewGroups")).not.toBeNull();
    expect(
      Array.from(
        container.querySelectorAll<HTMLButtonElement>(".appDialogActions button")
      ).map((b) => b.textContent)
    ).toEqual(["common.cancel", "search.replace.preview.applyAsEdits"]);
  });

  it("echoes the find / replace text and the mode in the condition summary", () => {
    renderDialog({ findText: "第([一二三])章", replaceText: "Chapter $1" });

    expect(conditionValue("search.replace.preview.findLabel")).toBe(
      "第([一二三])章"
    );
    expect(conditionValue("search.replace.preview.replaceLabel")).toBe(
      "Chapter $1"
    );
    // No options active -> the plain full-text search label.
    expect(conditionValue("search.replace.preview.modeLabel")).toBe(
      "search.replace.preview.mode.plain"
    );
  });

  it("builds the mode line from the active options (regex, then whole word, then match case)", () => {
    renderDialog({
      searchOptions: { wholeWord: false, caseSensitive: true, useRegex: true }
    });
    expect(conditionValue("search.replace.preview.modeLabel")).toBe(
      "search.replace.preview.mode.regex / search.replace.preview.mode.caseSensitive"
    );
  });

  it("shows the whole-word mode label when only whole word is on", () => {
    renderDialog({
      searchOptions: { wholeWord: true, caseSensitive: false, useRegex: false }
    });
    expect(conditionValue("search.replace.preview.modeLabel")).toBe(
      "search.replace.preview.mode.wholeWord"
    );
  });

  it("keeps a long find / replace string on a single ellipsised line via title", () => {
    const long = "あ".repeat(200);
    renderDialog({ findText: long, replaceText: long });

    const value = container.querySelector<HTMLElement>(
      ".replacePreviewConditionValue"
    )!;
    expect(value.textContent).toBe(long);
    expect(value.getAttribute("title")).toBe(long);
    // The dialog itself must not grow past its own max width.
    expect(
      container.querySelector(".replacePreviewDialog")
    ).not.toBeNull();
  });

  it("shows candidate / selected / file counts and groups by file", () => {
    renderDialog();
    expect(summaryText()).toBe(
      'search.replace.preview.summary:{"candidateCount":3,"selectedCount":3,"fileCount":2}'
    );
    const groups = container.querySelectorAll(".replacePreviewGroup");
    expect(groups).toHaveLength(2);
    expect(
      groups[0].querySelector(".replacePreviewGroupName")?.textContent
    ).toBe("a.md");
    expect(rows()).toHaveLength(3);
    expect(rows()[0].querySelector(".replacePreviewRowLocation")?.textContent).toBe(
      "3:6"
    );
  });

  it("defaults every row to Apply, showing the after text highlighted", () => {
    renderDialog();
    for (const row of rows()) {
      expect(row.getAttribute("data-applied")).toBe("true");
      expect(
        row.querySelector(".replacePreviewMark-after")?.textContent
      ).toBe("使用人");
      expect(row.querySelector(".replacePreviewMark-before")).toBeNull();
    }
  });

  it("toggles a row to Ignore: before text highlighted, selected count drops", () => {
    renderDialog();
    setRow(0, "ignore");

    expect(rows()[0].getAttribute("data-applied")).toBe("false");
    expect(
      rows()[0].querySelector(".replacePreviewMark-before")?.textContent
    ).toBe("メイド");
    expect(rows()[0].querySelector(".replacePreviewMark-after")).toBeNull();
    expect(summaryText()).toContain('"selectedCount":2');

    setRow(0, "apply");
    expect(rows()[0].getAttribute("data-applied")).toBe("true");
    expect(summaryText()).toContain('"selectedCount":3');
  });

  it("bulk Ignore all / Apply all flips every row", () => {
    renderDialog();
    clickButton("search.replace.preview.ignoreAll:{\"count\":3}");
    expect(rows().every((r) => r.getAttribute("data-applied") === "false")).toBe(
      true
    );
    expect(summaryText()).toContain('"selectedCount":0');

    clickButton("search.replace.preview.applyAll:{\"count\":3}");
    expect(rows().every((r) => r.getAttribute("data-applied") === "true")).toBe(
      true
    );
    expect(summaryText()).toContain('"selectedCount":3');
  });

  it("file-level Ignore only affects that file group", () => {
    renderDialog();
    // First group (a.md) has 2 candidates.
    clickButton('search.replace.preview.ignoreInFile:{"count":2}');

    const applied = rows().map((r) => r.getAttribute("data-applied"));
    expect(applied).toEqual(["false", "false", "true"]);
    expect(summaryText()).toContain('"selectedCount":1');
  });

  it("footer: Cancel closes via onCancel; Apply reports the still-applied ids", () => {
    const onCancel = vi.fn();
    const onApplySelected = vi.fn();
    renderDialog({ onCancel, onApplySelected });

    setRow(2, "ignore");
    clickButton("search.replace.preview.applyAsEdits");
    expect(onApplySelected).toHaveBeenCalledWith(["a:0", "a:1"]);

    clickButton("common.cancel");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("shows the limit-reached notice only when limitReached is set, above the scroll area", () => {
    renderDialog();
    expect(container.querySelector(".replacePreviewLimitNotice")).toBeNull();

    renderDialog({ limitReached: true });
    const notice = container.querySelector(".replacePreviewLimitNotice");
    expect(notice?.textContent).toBe("search.replace.preview.limitReached");
    // The notice is a sibling of the summary, not inside the scrollable list.
    expect(notice?.closest(".replacePreviewGroups")).toBeNull();
  });

  it("puts the candidate list in its own scroll container, not the whole body", () => {
    renderDialog();
    const groups = container.querySelector(".replacePreviewGroups");
    expect(groups).not.toBeNull();
    // Static summary rows are outside the scroll container.
    expect(
      container
        .querySelector(".replacePreviewSummary")
        ?.closest(".replacePreviewGroups")
    ).toBeNull();
    expect(
      container
        .querySelector(".replacePreviewConditions")
        ?.closest(".replacePreviewGroups")
    ).toBeNull();
  });

  it("shows a scope-specific empty state and no bulk actions when there are no candidates", () => {
    renderDialog({ candidates: [] });
    expect(
      container.querySelector(".replacePreviewEmpty")?.textContent
    ).toBe("search.replace.preview.openDocs.noCandidates");
    expect(container.querySelector(".replacePreviewBulkActions")).toBeNull();
    expect(summaryText()).toContain('"candidateCount":0');

    renderDialog({ scope: "projectDocuments", candidates: [] });
    expect(
      container.querySelector(".replacePreviewEmpty")?.textContent
    ).toBe("search.replace.project.emptyCandidates");
  });

  it("projectDocuments scope: destructive class, project title, and an hourglass + 置換する (no countdown digits) while waiting", () => {
    renderDialog({ scope: "projectDocuments" });
    expect(
      container.querySelector(".appDialogTitle")?.textContent
    ).toBe("search.replace.preview.project.title");
    expect(
      container.querySelector(".replacePreviewDialog.appDialog-destructive")
    ).not.toBeNull();

    const applyButton = confirmButton();
    expect(applyButton.textContent).toBe(
      "search.replace.preview.project.replaceLabel"
    );
    expect(applyButton.disabled).toBe(true);
    expect(
      applyButton.querySelector(".replacePreviewApplyIcon")
    ).not.toBeNull();
    expect(applyButton.getAttribute("title")).toBe(
      "search.replace.preview.project.delayTooltip"
    );
    // No seconds countdown anywhere in the button.
    expect(applyButton.textContent).not.toMatch(/\d/);
  });

  it("projectDocuments scope: apply arms after 5s (hourglass gone, ready tooltip), stays disabled with nothing selected or at the candidate ceiling", () => {
    vi.useFakeTimers();
    try {
      renderDialog({ scope: "projectDocuments" });
      const applyButton = () => confirmButton();
      expect(applyButton().disabled).toBe(true);

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(applyButton().textContent).toBe(
        "search.replace.preview.project.replaceLabel"
      );
      expect(
        applyButton().querySelector(".replacePreviewApplyIcon")
      ).toBeNull();
      expect(applyButton().getAttribute("title")).toBe(
        "search.replace.preview.applyAndSave"
      );
      expect(applyButton().disabled).toBe(false);

      // Nothing selected -> disabled even after the countdown.
      clickButton('search.replace.preview.ignoreAll:{"count":3}');
      expect(applyButton().disabled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("projectDocuments scope: apply stays disabled when the candidate ceiling was hit", () => {
    vi.useFakeTimers();
    try {
      renderDialog({ scope: "projectDocuments", limitReached: true });
      act(() => {
        vi.advanceTimersByTime(6000);
      });
      expect(confirmButton().disabled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("openDocuments scope: no countdown - apply is enabled immediately", () => {
    renderDialog({ scope: "openDocuments" });
    const applyButton = confirmButton();
    expect(applyButton.textContent).toBe("search.replace.preview.applyAsEdits");
    expect(applyButton.disabled).toBe(false);
  });

  it("guards a double-click: onApplySelected fires once even if the button is clicked twice before the host reacts", () => {
    const onApplySelected = vi.fn();
    renderDialog({ scope: "openDocuments", onApplySelected });
    const button = confirmButton();
    act(() => {
      button.click();
      button.click();
    });
    expect(onApplySelected).toHaveBeenCalledTimes(1);
  });
});

describe("ReplacePreviewDialog project-scope applying / completed lifecycle (#386)", () => {
  it("applying: primary shows 置換中... disabled+busy, secondary becomes 閉じる disabled and does not close", () => {
    const onCancel = vi.fn();
    renderDialog({ scope: "projectDocuments", applying: true, onCancel });

    const primary = confirmButton();
    expect(primary.textContent).toBe("search.replace.preview.project.applying");
    expect(primary.disabled).toBe(true);
    expect(primary.getAttribute("aria-busy")).toBe("true");

    const secondary = secondaryButton();
    expect(secondary.textContent).toBe("common.close");
    expect(secondary.disabled).toBe(true);

    act(() => secondary.click());
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("completed: hides the primary button entirely (no re-apply from the same dialog)", () => {
    renderDialog({
      scope: "projectDocuments",
      applyResult: { kind: "success", replacementCount: 1, fileCount: 1 }
    });
    expect(container.querySelector(".appDialogButton-confirm")).toBeNull();
  });

  it("applying: Escape does not close the dialog", () => {
    const onCancel = vi.fn();
    renderDialog({ scope: "projectDocuments", applying: true, onCancel });
    pressEscape();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("ready (not yet applying): Escape and Cancel still work normally", () => {
    const onCancel = vi.fn();
    renderDialog({ scope: "projectDocuments", onCancel });
    pressEscape();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("completed (success): hides the destructive warning, shows the saved summary, enables 閉じる, and never re-shows Apply", () => {
    const onCancel = vi.fn();
    const result: ReplaceApplyResult = {
      kind: "success",
      replacementCount: 12,
      fileCount: 3
    };
    renderDialog({ scope: "projectDocuments", applyResult: result, onCancel });

    expect(
      container.querySelector(".replacePreviewDestructiveWarning")
    ).toBeNull();
    expect(container.querySelector(".appDialogButton-confirm")).toBeNull();
    expect(
      container.querySelector(".replacePreviewApplyResult-success")?.textContent
    ).toBe(
      'search.replace.project.savedSummary:{"replacementCount":12,"fileCount":3}'
    );

    const closeButton = secondaryButton();
    expect(closeButton.textContent).toBe("common.close");
    expect(closeButton.disabled).toBe(false);
    act(() => closeButton.click());
    expect(onCancel).toHaveBeenCalledTimes(1);

    // Escape also closes now that it is no longer "applying".
    const onCancel2 = vi.fn();
    renderDialog({ scope: "projectDocuments", applyResult: result, onCancel: onCancel2 });
    pressEscape();
    expect(onCancel2).toHaveBeenCalledTimes(1);
  });

  it("completed (partial failure): shows the success/failure counts", () => {
    const result: ReplaceApplyResult = {
      kind: "partialFailure",
      successFileCount: 2,
      failureFileCount: 1
    };
    renderDialog({ scope: "projectDocuments", applyResult: result });
    expect(
      container.querySelector(".replacePreviewApplyResult-partialFailure")
        ?.textContent
    ).toBe(
      'search.replace.project.partialFailure.message:{"successFileCount":2,"failureFileCount":1}'
    );
  });

  it("completed (all failure, generic): shows the generic failure message", () => {
    const result: ReplaceApplyResult = { kind: "allFailure", reason: "generic" };
    renderDialog({ scope: "projectDocuments", applyResult: result });
    expect(
      container.querySelector(".replacePreviewApplyResult-allFailure")
        ?.textContent
    ).toBe("search.replace.project.allFailure.message");
  });

  it("completed (all failure, file changed): shows the file-changed message", () => {
    const result: ReplaceApplyResult = {
      kind: "allFailure",
      reason: "fileChanged"
    };
    renderDialog({ scope: "projectDocuments", applyResult: result });
    expect(
      container.querySelector(".replacePreviewApplyResult-allFailure")
        ?.textContent
    ).toBe("search.replace.project.fileChanged");
  });
});

describe("ReplacePreviewDialog (#386) continued", () => {

  it("renders a readable header + rows for every file group across many files (no bare-line placeholders)", () => {
    const many: ReplacePreviewCandidate[] = [];
    for (let file = 0; file < 20; file += 1) {
      const fileId = `chapters/${String(file).padStart(2, "0")}.md`;
      for (let row = 0; row < 5; row += 1) {
        many.push(
          candidate({
            id: `${fileId}:${row}`,
            fileId,
            fileLabel: `${String(file).padStart(2, "0")}.md`,
            filePath: fileId,
            line: row + 1,
            column: row + 2
          })
        );
      }
    }

    renderDialog({ candidates: many });

    const groupEls = Array.from(
      container.querySelectorAll(".replacePreviewGroup")
    );
    expect(groupEls).toHaveLength(20); // one per file, no empty groups

    for (const groupEl of groupEls) {
      // Header carries a non-empty file label and a separate count / selected
      // line (2-row layout).
      const name = groupEl.querySelector(".replacePreviewGroupName")?.textContent;
      expect(name).toMatch(/^\d\d\.md$/);
      expect(
        groupEl.querySelector(".replacePreviewGroupCount")?.textContent
      ).toBe('search.replace.preview.fileGroupCount:{"count":5}');
      expect(
        groupEl.querySelector(".replacePreviewGroupSelected")?.textContent
      ).toBe(
        'search.replace.preview.fileGroupSelected:{"selectedCount":5}'
      );

      const groupRows = Array.from(
        groupEl.querySelectorAll(".replacePreviewRow")
      );
      expect(groupRows).toHaveLength(5); // real rows, not separators
      for (const rowEl of groupRows) {
        expect(
          rowEl.querySelector(".replacePreviewRowLocation")?.textContent
        ).toMatch(/^\d+:\d+$/);
        expect(rowEl.querySelector(".replacePreviewRowContext")?.textContent)
          .not.toBe("");
        expect(rowEl.querySelector(".replacePreviewMark-after")?.textContent).toBe(
          "使用人"
        );
        expect(
          rowEl.querySelector("select.replacePreviewRowControl")
        ).not.toBeNull();
      }
    }

    // Exactly candidateCount rows total - nothing extra drawn.
    expect(rows()).toHaveLength(100);
  });
});

describe("ReplacePreviewDialog ignore styling & file-group navigation (#386)", () => {
  const styles = readFileSync("src/renderer/styles.css", "utf8");

  function ruleBody(selector: string): string {
    const start = styles.indexOf(`${selector} {`);
    expect(start).toBeGreaterThan(-1);
    return styles.slice(start, styles.indexOf("}", start));
  }

  it("ignored row shows the before text with a soft (non-strikethrough) highlight", () => {
    renderDialog();
    setRow(0, "ignore");

    const mark = rows()[0].querySelector(".replacePreviewMark-before");
    expect(mark?.textContent).toBe("メイド");
    expect(mark?.className).toBe(
      "replacePreviewMark replacePreviewMark-before"
    );
    expect(rows()[0].querySelector(".replacePreviewMark-after")).toBeNull();
  });

  it("ignore highlight is a grey background over normal text - no strikethrough, no red", () => {
    const before = ruleBody(".replacePreviewMark-before");
    expect(before).not.toContain("line-through");
    // colour comes from a token, never a red hex literal in the rule.
    expect(before).not.toMatch(/#[0-9a-fA-F]{3,6}/);

    const content = ruleBody(".replacePreviewContent");
    expect(content).toContain(
      "--replace-preview-before: var(--app-dialog-foreground)"
    );
    // the greyed background is a low-alpha neutral, not a pink/red wash.
    expect(content).toMatch(
      /--replace-preview-before-bg:\s*rgba\(\s*(?:0|15)[^)]*\)/
    );
  });

  it("keeps the green highlight for the applied (after) state", () => {
    renderDialog();
    expect(
      rows()[0].querySelector(".replacePreviewMark-after")?.textContent
    ).toBe("使用人");

    const content = ruleBody(".replacePreviewContent");
    expect(content).toContain("--replace-preview-after: #1f6b3a");
  });

  it("hides the file-group nav when there is a single group", () => {
    renderDialog({
      candidates: [
        candidate({ id: "only:0", fileId: "only.md", fileLabel: "only.md" })
      ]
    });
    expect(container.querySelector(".replacePreviewGroupNav")).toBeNull();
  });

  it("shows ↑/↓ file-group nav with more than one group and scrolls group-by-group", () => {
    const scrollIntoView = vi
      .spyOn(window.Element.prototype, "scrollIntoView")
      .mockImplementation(() => undefined);

    renderDialog(); // CANDIDATES spans a.md + b.md
    const nav = container.querySelector(".replacePreviewGroupNav");
    expect(nav).not.toBeNull();

    const [prev, next] = Array.from(
      nav!.querySelectorAll<HTMLButtonElement>(".replacePreviewGroupNavButton")
    );
    expect(prev.getAttribute("aria-label")).toBe(
      "search.replace.preview.groupNavPrev"
    );
    expect(next.getAttribute("aria-label")).toBe(
      "search.replace.preview.groupNavNext"
    );

    act(() => next.click());
    act(() => next.click()); // clamped at the last group
    act(() => prev.click());

    expect(scrollIntoView).toHaveBeenCalled();
    for (const call of scrollIntoView.mock.calls) {
      expect(call[0]).toEqual({ block: "start" });
    }
  });
});

describe("ReplacePreviewDialog candidate list CSS layout (#386)", () => {
  const styles = readFileSync("src/renderer/styles.css", "utf8");

  function ruleBody(selector: string): string {
    const start = styles.indexOf(`${selector} {`);
    expect(start).toBeGreaterThan(-1);
    return styles.slice(start, styles.indexOf("}", start));
  }

  it("pins each file group at its natural height so the column-flex scroll area cannot crush it to a border line", () => {
    const group = ruleBody(".replacePreviewGroup");
    expect(group).toContain("overflow: hidden");
    // flex-shrink must be 0 (via `flex: 0 0 auto` or explicit) - with
    // `overflow: hidden` a shrinkable flex item collapses to just its border.
    expect(group).toMatch(/flex:\s*0\s+0\s+auto|flex-shrink:\s*0/);
  });

  it("keeps the scroll on the group list, and the list only", () => {
    const groups = ruleBody(".replacePreviewGroups");
    expect(groups).toContain("overflow-y: auto");
    expect(groups).toContain("min-height: 0");

    const body = ruleBody(".replacePreviewDialog .appInfoDialogBody");
    expect(body).toContain("overflow: hidden");
  });
});
