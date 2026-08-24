import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { t, type Translate } from "../../../src/shared/i18n";
import { ConfirmDialog } from "../../../src/renderer/dialog/ConfirmDialog";
import type {
  AppConfirmDialogOptions,
  AppDialogActionOrder
} from "../../../src/renderer/dialog/appDialogTypes";
import type { ClipboardAdapter } from "../../../src/renderer/dialog/clipboardAdapter";

const translateJa: Translate = (key, values) => t("ja", key, values);
const translateEn: Translate = (key, values) => t("en", key, values);
const noop = () => undefined;
const noopClipboardAdapter: ClipboardAdapter = {
  writeText: () => Promise.resolve()
};

function baseOptions(
  overrides: Partial<AppConfirmDialogOptions> = {}
): AppConfirmDialogOptions {
  return {
    title: "確認",
    message: { kind: "plainText", text: "本当によろしいですか？" },
    icon: null,
    clipboardText: null,
    ...overrides
  } as AppConfirmDialogOptions;
}

function renderDialog(overrides: {
  options?: AppConfirmDialogOptions;
  actionOrder?: AppDialogActionOrder;
  translate?: Translate;
  clipboardAdapter?: ClipboardAdapter;
} = {}): string {
  return renderToStaticMarkup(
    React.createElement(ConfirmDialog, {
      options: overrides.options ?? baseOptions(),
      actionOrder: overrides.actionOrder ?? "confirmCancel",
      translate: overrides.translate ?? translateJa,
      clipboardAdapter: overrides.clipboardAdapter ?? noopClipboardAdapter,
      opener: null,
      onResult: noop
    })
  );
}

describe("ConfirmDialog structure (#182)", () => {
  it("renders the title text", () => {
    const markup = renderDialog({ options: baseOptions({ title: "確認タイトル" }) });

    expect(markup).toContain("確認タイトル");
  });

  it("renders the title/header as a distinct surface (appDialogHeader class)", () => {
    const markup = renderDialog();

    expect(markup).toContain("appDialogHeader");
  });

  it("renders the title with a bold-styling class", () => {
    const markup = renderDialog();

    expect(markup).toContain('class="appDialogTitle"');
  });

  it("renders the plain text message", () => {
    const markup = renderDialog({
      options: baseOptions({
        message: { kind: "plainText", text: "メッセージ本文" }
      })
    });

    expect(markup).toContain("メッセージ本文");
  });

  it("renders a shared path block without rewriting the displayed path", () => {
    const selectedPath = String.raw`C:\Project\Read Only\chapters\..\Draft  01.pergamum`;
    const markup = renderDialog({
      options: baseOptions({
        message: {
          kind: "plainTextWithPathBlock",
          beforeText: "",
          pathBlock: {
            label: "Save location:",
            value: selectedPath
          },
          afterText:
            "The selected save location is a Pergamum project file or internal management file."
        }
      })
    });

    expect(markup).toContain("appDialogPathBlock");
    expect(markup).toContain(">Save location:<");
    expect(markup).toContain(`>${selectedPath}<`);
    expect(markup).toContain(
      "The selected save location is a Pergamum project file or internal management file."
    );
    expect(markup).not.toContain('class="appDialogMessageText"></p>');
  });

  it("preserves newline characters in the message (pre-wrap class + literal newline in output)", () => {
    const markup = renderDialog({
      options: baseOptions({
        message: { kind: "plainText", text: "1行目\n2行目" }
      })
    });

    expect(markup).toContain('class="appDialogMessage"');
    expect(markup).toContain("1行目\n2行目");
  });

  it("displays HTML-like text as text, not as markup", () => {
    const markup = renderDialog({
      options: baseOptions({
        message: {
          kind: "plainText",
          text: "before <script>alert(1)</script> after"
        }
      })
    });

    expect(markup).not.toContain("<script>alert(1)</script>");
    expect(markup).toContain("&lt;script&gt;");
  });

  it("does not use dangerouslySetInnerHTML for message rendering (source check)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/renderer/dialog/ConfirmDialog.tsx", "utf8");
    const bodySection = source.slice(
      source.indexOf("appDialogBody"),
      source.indexOf("appDialogFooter")
    );

    expect(bodySection).not.toContain("dangerouslySetInnerHTML");
  });
});

describe("ConfirmDialog button labels (#182 D-10)", () => {
  it("uses the localized default confirm label (OK) when none is provided (ja)", () => {
    const markup = renderDialog({ translate: translateJa });

    expect(markup).toContain(">OK<");
  });

  it("uses the localized default cancel label when none is provided (ja: キャンセル)", () => {
    const markup = renderDialog({ translate: translateJa });

    expect(markup).toContain(">キャンセル<");
  });

  it("uses the localized default cancel label when none is provided (en: Cancel)", () => {
    const markup = renderDialog({ translate: translateEn });

    expect(markup).toContain(">Cancel<");
  });

  it("allows the caller to override the confirm label", () => {
    const markup = renderDialog({
      options: baseOptions({ confirmLabel: "実行する" })
    });

    expect(markup).toContain(">実行する<");
  });

  it("allows the caller to override the cancel label", () => {
    const markup = renderDialog({
      options: baseOptions({ cancelLabel: "やめる" })
    });

    expect(markup).toContain(">やめる<");
  });

  it("allows the caller to render a one-button dialog with cancelLabel: null", () => {
    const markup = renderDialog({
      options: baseOptions({
        confirmLabel: "OK",
        cancelLabel: null
      })
    });

    expect(markup).toContain("appDialogButton-confirm");
    expect(markup).not.toContain("appDialogButton-cancel");
    expect(markup).not.toContain(">キャンセル<");
  });
});

describe("ConfirmDialog icons (#182 D-3 / D-4 / D-5 / D-6)", () => {
  it("icon: null renders no icon element", () => {
    const markup = renderDialog({ options: baseOptions({ icon: null }) });

    expect(markup).not.toContain("appDialogIcon-");
  });

  it('icon.kind: "info" renders the Feather info icon', () => {
    const markup = renderDialog({
      options: baseOptions({ icon: { kind: "info", tooltip: "情報" } })
    });

    expect(markup).toContain("appDialogIcon-info");
    expect(markup).toContain("feather-info");
  });

  it('icon.kind: "warning" renders the Feather alert-circle icon', () => {
    const markup = renderDialog({
      options: baseOptions({ icon: { kind: "warning", tooltip: "警告" } })
    });

    expect(markup).toContain("appDialogIcon-warning");
    expect(markup).toContain("feather-alert-circle");
    expect(markup).not.toContain("feather-alert-triangle");
  });

  it('icon.kind: "error" renders the Feather x-circle icon (not x-octagon/error-octagon)', () => {
    const markup = renderDialog({
      options: baseOptions({ icon: { kind: "error", tooltip: "エラー" } })
    });

    expect(markup).toContain("appDialogIcon-error");
    expect(markup).toContain("feather-x-circle");
    expect(markup).not.toContain("feather-x-octagon");
  });

  it('icon.kind: "question" renders the Feather help-circle icon', () => {
    const markup = renderDialog({
      options: baseOptions({ icon: { kind: "question", tooltip: "確認" } })
    });

    expect(markup).toContain("appDialogIcon-question");
    expect(markup).toContain("feather-help-circle");
  });

  it("renders the icon tooltip as both title and aria-label", () => {
    const markup = renderDialog({
      options: baseOptions({
        icon: { kind: "warning", tooltip: "注意してください" }
      })
    });

    expect(markup).toContain('aria-label="注意してください"');
    expect(markup).toContain('title="注意してください"');
  });
});

describe("ConfirmDialog clipboard copy button (#182 D-9)", () => {
  it("clipboardText: null renders no copy button", () => {
    const markup = renderDialog({ options: baseOptions({ clipboardText: null }) });

    expect(markup).not.toContain("appDialogCopyButton");
  });

  it('clipboardText: "" renders no copy button', () => {
    const markup = renderDialog({ options: baseOptions({ clipboardText: "" }) });

    expect(markup).not.toContain("appDialogCopyButton");
  });

  it("a non-empty clipboardText renders a copy button", () => {
    const markup = renderDialog({
      options: baseOptions({ clipboardText: "error: boom" })
    });

    expect(markup).toContain("appDialogCopyButton");
  });

  it("the copy button is icon-only (renders the Feather clipboard icon, no visible label text)", () => {
    const markup = renderDialog({
      options: baseOptions({ clipboardText: "error: boom" })
    });
    const buttonStart = markup.indexOf('class="appDialogCopyButton"');
    const buttonTagEnd = markup.indexOf(">", buttonStart);
    const nextTagStart = markup.indexOf("<", buttonTagEnd);
    const innerContent = markup.slice(buttonTagEnd + 1, nextTagStart);

    expect(markup).toContain("feather-clipboard");
    // The button's own text node (before its first child element) is empty —
    // the only content is the SVG, not a visible label string.
    expect(innerContent.trim()).toBe("");
  });

  it("the copy button's accessible label and tooltip use dialog.copyErrorDetails (ja)", () => {
    const markup = renderDialog({
      options: baseOptions({ clipboardText: "error: boom" }),
      translate: translateJa
    });

    expect(markup).toContain('aria-label="エラー詳細をコピー"');
    expect(markup).toContain('title="エラー詳細をコピー"');
  });

  it("the copy button's accessible label and tooltip use dialog.copyErrorDetails (en)", () => {
    const markup = renderDialog({
      options: baseOptions({ clipboardText: "error: boom" }),
      translate: translateEn
    });

    expect(markup).toContain('aria-label="Copy details"');
    expect(markup).toContain('title="Copy details"');
  });

  it("the copy button appears before the confirm/cancel action group in DOM order", () => {
    const markup = renderDialog({
      options: baseOptions({ clipboardText: "error: boom" })
    });
    const copyIndex = markup.indexOf("appDialogCopyButton");
    const actionsIndex = markup.indexOf("appDialogActions");

    expect(copyIndex).toBeGreaterThan(-1);
    expect(actionsIndex).toBeGreaterThan(-1);
    expect(copyIndex).toBeLessThan(actionsIndex);
  });

  it("does not call clipboard APIs directly from the component (source check — goes through the adapter)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/renderer/dialog/ConfirmDialog.tsx", "utf8");

    expect(source).not.toContain("navigator.clipboard");
  });

  it("the copy button's click handler does not call onResult (source check — copy never resolves confirm/cancel or closes the dialog)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/renderer/dialog/ConfirmDialog.tsx", "utf8");
    const copyClickHandler = source.slice(
      source.indexOf("async function handleCopyClick"),
      source.indexOf("const confirmButton")
    );

    expect(copyClickHandler).not.toContain("onResult");
  });
});

describe("ConfirmDialog platform action order and DOM structure (#182 D-11 / D-15)", () => {
  it('actionOrder "confirmCancel" renders the confirm button before the cancel button', () => {
    const markup = renderDialog({ actionOrder: "confirmCancel" });
    const confirmIndex = markup.indexOf("appDialogButton-confirm");
    const cancelIndex = markup.indexOf("appDialogButton-cancel");

    expect(confirmIndex).toBeLessThan(cancelIndex);
  });

  it('actionOrder "cancelConfirm" renders the cancel button before the confirm button', () => {
    const markup = renderDialog({ actionOrder: "cancelConfirm" });
    const confirmIndex = markup.indexOf("appDialogButton-confirm");
    const cancelIndex = markup.indexOf("appDialogButton-cancel");

    expect(cancelIndex).toBeLessThan(confirmIndex);
  });

  it("LTR DOM order matches visual order: copy -> confirm -> cancel for confirmCancel", () => {
    const markup = renderDialog({
      actionOrder: "confirmCancel",
      options: baseOptions({ clipboardText: "diagnostic" })
    });
    const copyIndex = markup.indexOf("appDialogCopyButton");
    const confirmIndex = markup.indexOf("appDialogButton-confirm");
    const cancelIndex = markup.indexOf("appDialogButton-cancel");

    expect(copyIndex).toBeLessThan(confirmIndex);
    expect(confirmIndex).toBeLessThan(cancelIndex);
  });

  it("LTR DOM order matches visual order: copy -> cancel -> confirm for cancelConfirm", () => {
    const markup = renderDialog({
      actionOrder: "cancelConfirm",
      options: baseOptions({ clipboardText: "diagnostic" })
    });
    const copyIndex = markup.indexOf("appDialogCopyButton");
    const confirmIndex = markup.indexOf("appDialogButton-confirm");
    const cancelIndex = markup.indexOf("appDialogButton-cancel");

    expect(copyIndex).toBeLessThan(cancelIndex);
    expect(cancelIndex).toBeLessThan(confirmIndex);
  });

  it("visual button order does not change confirm/cancel result semantics (both classes always present with fixed meaning)", () => {
    const confirmCancelMarkup = renderDialog({ actionOrder: "confirmCancel" });
    const cancelConfirmMarkup = renderDialog({ actionOrder: "cancelConfirm" });

    for (const markup of [confirmCancelMarkup, cancelConfirmMarkup]) {
      expect(markup).toContain("appDialogButton-confirm");
      expect(markup).toContain("appDialogButton-cancel");
    }
  });

  it("documents actionOrder as DOM order while leaving visual order to CSS and writing direction", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/renderer/dialog/ConfirmDialog.tsx", "utf8");

    expect(source).toContain(
      "DOM order follows the platform action order"
    );
    expect(source).toContain(
      "order is resolved by CSS and the effective writing direction"
    );
    expect(source).not.toContain("visual (and DOM) order");
  });

  it("does not manually reverse action button arrays for RTL in JS", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/renderer/dialog/ConfirmDialog.tsx", "utf8");

    expect(source).not.toContain("TextDirection");
    expect(source).not.toContain("getLanguageDirection");
    expect(source).not.toContain("languageMetadata");
    expect(source).not.toContain(".reverse(");
  });
});

describe("ConfirmDialog footer CSS direction-safety (#187)", () => {
  it("uses logical spacing in the dialog footer/action area", async () => {
    const { readFileSync } = await import("node:fs");
    const styles = readFileSync("src/renderer/styles.css", "utf8");
    const dialogFooterCss = styles.slice(
      styles.indexOf(".appDialogFooter"),
      styles.indexOf(".appDialogButton-confirm")
    );

    expect(dialogFooterCss).toContain("padding-block");
    expect(dialogFooterCss).toContain("padding-inline");
    expect(dialogFooterCss).toContain("margin-inline-start: auto");
    expect(dialogFooterCss).toContain("text-align: start");
    expect(dialogFooterCss).not.toMatch(/\b(?:margin-left|margin-right)\b/);
    expect(dialogFooterCss).not.toMatch(/\b(?:left|right)\s*:/);
  });
});

describe("ConfirmDialog initial focus (#182 D-15 / D-16, via the autoFocus prop)", () => {
  it("default tone: the confirm button carries autofocus, the cancel button does not", () => {
    const markup = renderDialog({ options: baseOptions() });
    const confirmTag = markup.slice(
      markup.indexOf("appDialogButton-confirm") - 40,
      markup.indexOf(">", markup.indexOf("appDialogButton-confirm"))
    );
    const cancelTag = markup.slice(
      markup.indexOf("appDialogButton-cancel") - 40,
      markup.indexOf(">", markup.indexOf("appDialogButton-cancel"))
    );

    expect(confirmTag).toContain("autofocus");
    expect(cancelTag).not.toContain("autofocus");
  });

  it("destructive tone: the cancel button carries autofocus, the confirm button does not", () => {
    const markup = renderDialog({
      options: baseOptions({ tone: "destructive", confirmLabel: "削除" })
    });
    const confirmTag = markup.slice(
      markup.indexOf("appDialogButton-confirm") - 40,
      markup.indexOf(">", markup.indexOf("appDialogButton-confirm"))
    );
    const cancelTag = markup.slice(
      markup.indexOf("appDialogButton-cancel") - 40,
      markup.indexOf(">", markup.indexOf("appDialogButton-cancel"))
    );

    expect(cancelTag).toContain("autofocus");
    expect(confirmTag).not.toContain("autofocus");
  });

  it("default tone initial focus is confirm even when a copy button is present", () => {
    const markup = renderDialog({
      options: baseOptions({ clipboardText: "diagnostic" })
    });
    const copyTag = markup.slice(
      markup.indexOf("appDialogCopyButton") - 20,
      markup.indexOf(">", markup.indexOf("appDialogCopyButton"))
    );

    expect(copyTag).not.toContain("autofocus");
  });

  it("initial focus is independent from DOM order (confirm is still initial focus under cancelConfirm order)", () => {
    const markup = renderDialog({ actionOrder: "cancelConfirm" });
    const confirmTag = markup.slice(
      markup.indexOf("appDialogButton-confirm") - 40,
      markup.indexOf(">", markup.indexOf("appDialogButton-confirm"))
    );

    expect(confirmTag).toContain("autofocus");
  });
});

describe("ConfirmDialog accessibility (#182 D-18)", () => {
  it('default tone uses role="dialog"', () => {
    const markup = renderDialog({ options: baseOptions() });

    expect(markup).toContain('role="dialog"');
    expect(markup).not.toContain('role="alertdialog"');
  });

  it('destructive tone uses role="alertdialog"', () => {
    const markup = renderDialog({
      options: baseOptions({ tone: "destructive", confirmLabel: "削除" })
    });

    expect(markup).toContain('role="alertdialog"');
  });

  it('sets aria-modal="true"', () => {
    const markup = renderDialog();

    expect(markup).toContain('aria-modal="true"');
  });

  it("associates the title via aria-labelledby", () => {
    const markup = renderDialog();

    expect(markup).toContain('aria-labelledby="appDialogTitle"');
    expect(markup).toContain('id="appDialogTitle"');
  });

  it("associates the message via aria-describedby", () => {
    const markup = renderDialog();

    expect(markup).toContain('aria-describedby="appDialogMessage"');
    expect(markup).toContain('id="appDialogMessage"');
  });

  it("destructive tone is reflected in dialog markup via a class", () => {
    const markup = renderDialog({
      options: baseOptions({ tone: "destructive", confirmLabel: "削除" })
    });

    expect(markup).toContain("appDialog-destructive");
  });

  it("keeps destructive confirm styling scoped to the binary confirm class contract", async () => {
    const { readFileSync } = await import("node:fs");
    const markup = renderDialog({
      options: baseOptions({ tone: "destructive", confirmLabel: "削除" })
    });
    const styles = readFileSync("src/renderer/styles.css", "utf8");

    expect(markup).toContain("appDialog-destructive");
    expect(markup).toContain("appDialogButton-confirm");
    expect(styles).toContain(".appDialog-destructive .appDialogButton-confirm");
    expect(styles).toContain(
      ".appDialog-destructive .appDialogButton-confirm:hover"
    );
  });
});

describe("ConfirmDialog backdrop (#182 D-17)", () => {
  it("renders a backdrop element wrapping the dialog", () => {
    const markup = renderDialog();

    expect(markup).toContain("appDialogBackdrop");
    expect(markup.indexOf("appDialogBackdrop")).toBeLessThan(
      markup.indexOf('role="dialog"')
    );
  });
});

describe("ConfirmDialog backdrop dismissal wiring (#184 follow-up, source check)", () => {
  it("resolves the backdrop click handler's dismiss flag from confirmDialogDismissesOnBackdropClick(options), not a hardcoded value", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/renderer/dialog/ConfirmDialog.tsx", "utf8");

    expect(source).toContain("confirmDialogDismissesOnBackdropClick(options)");
  });
});

describe("ConfirmDialog sound feedback wiring (#200)", () => {
  it("does not create local audio elements; dialog display sound is handled at the controller request boundary", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/renderer/dialog/ConfirmDialog.tsx", "utf8");

    expect(source).not.toContain("playDialogShownSound");
    expect(source).not.toContain("new Audio");
  });
});

describe("ConfirmDialog button accelerators (#184 follow-up)", () => {
  it("does not wire accessKey (or any other per-button accelerator) onto dialog buttons (source check)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/renderer/dialog/ConfirmDialog.tsx", "utf8");

    expect(source).not.toContain("accessKey");
  });

  it("does not add mnemonic markers such as (&S) to the dirty-close dialog's translated button labels", () => {
    const mnemonicPattern = /\(&[A-Za-z]\)/;

    for (const translate of [translateEn, translateJa]) {
      expect(translate("dialog.dirtyClose.discardAndClose")).not.toMatch(
        mnemonicPattern
      );
      expect(translate("common.cancel")).not.toMatch(mnemonicPattern);
      expect(translate("common.ok")).not.toMatch(mnemonicPattern);
    }
  });
});

describe("ConfirmDialog shortcut scope (#190)", () => {
  it("does not implement one-off Ctrl/Cmd shortcut suppression inside the dialog component", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/renderer/dialog/ConfirmDialog.tsx", "utf8");
    const handlers = readFileSync(
      "src/renderer/dialog/confirmDialogHandlers.ts",
      "utf8"
    );
    const dialogSources = `${source}\n${handlers}`;

    expect(dialogSources).not.toContain("ctrlKey");
    expect(dialogSources).not.toContain("metaKey");
    expect(dialogSources).not.toContain("editor.document.save");
    expect(dialogSources).not.toContain("workbench.commandPalette.open");
  });
});
