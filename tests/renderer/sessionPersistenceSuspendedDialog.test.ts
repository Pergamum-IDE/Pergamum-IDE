import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * #272 (review Blocker 3): the ACTIVE → SUSPENDED Error dialog must be
 * *displayed* once, not merely *attempted* once. `DialogController.confirm()`
 * rejects with `AppDialogError("dialogAlreadyOpen")` while another modal is
 * open, so a naive "set notified = true, fire and forget" loses the dialog
 * forever. These lock in the deferred-present design without standing up a
 * full App render.
 */
const app = readFileSync("src/renderer/App.tsx", "utf8");

function functionBody(name: string): string {
  const start = app.indexOf(`function ${name}(`);
  expect(start, `${name} should exist`).toBeGreaterThan(-1);
  return app.slice(start, app.indexOf("\n  }", start) + 4);
}

describe("session persistence SUSPENDED Error dialog — displayed once (#272 review Blocker 3)", () => {
  it("tracks 'owed' and 'shown' separately (a transition owes a dialog; only an actual present marks it shown)", () => {
    expect(app).toMatch(/sessionPersistenceSuspendedDialogOwedRef\s*=\s*useRef\(false\)/);
    expect(app).toMatch(/sessionPersistenceSuspendedDialogShownRef\s*=\s*useRef\(false\)/);
    // The old "attempted once" boolean is gone.
    expect(app).not.toContain("sessionPersistenceSuspendedNotifiedRef");
  });

  it("the suspension handler only ARMS 'owed' and delegates presentation (idempotent across repeated failures)", () => {
    const body = functionBody("handleSessionPersistenceSuspended");
    // Repeated suspensions: if already shown or already owed, do nothing.
    expect(body).toMatch(
      /sessionPersistenceSuspendedDialogShownRef\.current\s*\|\|\s*[\s\S]*sessionPersistenceSuspendedDialogOwedRef\.current/
    );
    expect(body).toContain("sessionPersistenceSuspendedDialogOwedRef.current = true");
    expect(body).toContain("presentSessionPersistenceSuspendedDialogIfIdle()");
    // It never calls confirm/showdialog directly (that path can throw
    // dialogAlreadyOpen and be lost).
    expect(body).not.toContain("showSessionPersistenceSuspendedDialog(");
  });

  it("the presenter defers while another modal is open and only presents when dialogs are idle", () => {
    const body = functionBody("presentSessionPersistenceSuspendedDialogIfIdle");
    // Nothing owed, or already shown → bail.
    expect(body).toMatch(/!sessionPersistenceSuspendedDialogOwedRef\.current/);
    expect(body).toContain("sessionPersistenceSuspendedDialogShownRef.current");
    // Another modal open → defer (return without presenting).
    expect(body).toMatch(/dialogController\.getPendingRequest\(\)\s*!==\s*null/);
    // On present: clear 'owed', set 'shown', then actually show.
    expect(body).toContain("sessionPersistenceSuspendedDialogOwedRef.current = false");
    expect(body).toContain("sessionPersistenceSuspendedDialogShownRef.current = true");
    expect(body).toContain("showSessionPersistenceSuspendedDialog()");
  });

  it("a failed present re-arms 'owed' and clears 'shown' so the dialog is never permanently lost — and the rejection is caught", () => {
    const body = functionBody("presentSessionPersistenceSuspendedDialogIfIdle");
    expect(body).toMatch(/showSessionPersistenceSuspendedDialog\(\)\s*\.catch\(/);
    const catchBlock = body.slice(body.indexOf(".catch("));
    expect(catchBlock).toContain("sessionPersistenceSuspendedDialogShownRef.current = false");
    expect(catchBlock).toContain("sessionPersistenceSuspendedDialogOwedRef.current = true");
  });

  it("the dialog-controller subscription re-drives the presenter when a modal closes", () => {
    const start = app.indexOf("dialogController.subscribe(");
    expect(start).toBeGreaterThan(-1);
    const subscribeBlock = app.slice(start, start + 400);
    expect(subscribeBlock).toContain(
      "presentSessionPersistenceSuspendedDialogIfIdleRef.current()"
    );
  });

  it("is still an Error-icon dialog, separate from the Markdown save-failure copy", () => {
    const body = functionBody("showSessionPersistenceSuspendedDialog");
    expect(body).toMatch(/kind:\s*"error"/);
    expect(body).toContain("dialog.sessionPersistenceSuspended.title");
    // Not downgraded to a toast / warning.
    expect(body).not.toMatch(/notify|toast|warning/i);
  });

  it("constructs unique message text per failure code and presents openSessionsFolder choice only for manifestNotMutable and permissionDenied", () => {
    const body = functionBody("showSessionPersistenceSuspendedDialog");
    expect(body).toContain("dialog.sessionPersistenceSuspended.header");
    expect(body).toContain("dialog.sessionPersistenceSuspended.footer");
    expect(body).toContain("dialog.sessionPersistenceSuspended.reason.");

    // Button visibility check
    expect(body).toContain('effectiveReason === "manifestNotMutable"');
    expect(body).toContain('effectiveReason === "permissionDenied"');
    expect(body).toContain("choiceDialog(");
    expect(body).toContain("openSessionsFolder");
    expect(body).toContain("confirmDialog(");
    expect(body).toContain("window.pergamum.session.openSessionsFolder()");
  });

  it("resets shownRef in finally block when showSessionPersistenceSuspendedDialog completes (confirmDialog or choiceDialog closed)", () => {
    const body = functionBody("showSessionPersistenceSuspendedDialog");
    expect(body).toContain("finally {");
    expect(body).toContain("sessionPersistenceSuspendedDialogShownRef.current = false");
  });
});

// ---------------------------------------------------------------------------
// Actual DOM Rendering & Choice Validation Tests (#519)
// ---------------------------------------------------------------------------

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChoiceDialog } from "../../src/renderer/dialog/ChoiceDialog";
import { DialogController } from "../../src/renderer/dialog/dialogController";
import {
  validateChoiceDialogOptions,
  type AppChoiceDialogOptions
} from "../../src/renderer/dialog/appDialogTypes";
import { t, type Translate } from "../../src/shared/i18n";
import type { ClipboardAdapter } from "../../src/renderer/dialog/clipboardAdapter";

const translateJa: Translate = (key, values) => t("ja", key, values);
const noopClipboardAdapter: ClipboardAdapter = {
  writeText: () => Promise.resolve()
};

function buildSessionPersistenceSuspendedChoiceOptions(
  reason: "manifestNotMutable" | "permissionDenied"
): AppChoiceDialogOptions {
  const header = translateJa("dialog.sessionPersistenceSuspended.header");
  const footer = translateJa("dialog.sessionPersistenceSuspended.footer");
  const reasonKey = `dialog.sessionPersistenceSuspended.reason.${reason}` as const;
  const reasonDescription = translateJa(reasonKey);
  const text = `${header}\n\n${reasonDescription}\n\n${footer}\n\n[Code: ${reason}]`;

  return {
    title: translateJa("dialog.sessionPersistenceSuspended.title"),
    message: {
      kind: "plainText",
      text
    },
    icon: {
      kind: "error",
      tooltip: translateJa("dialog.icon.error")
    },
    clipboardText: "Technical Info Mock",
    clipboardTextTitle: translateJa("dialog.copyTechnicalInfo"),
    dismissOnBackdropClick: false,
    choices: [
      {
        id: "openSessionsFolder",
        label: translateJa("dialog.sessionPersistenceSuspended.openSessionsFolder"),
        role: "neutral"
      },
      {
        id: "ok",
        label: translateJa("common.ok"),
        role: "primary"
      }
    ],
    primaryChoiceId: "ok"
  };
}

describe("session persistence choiceDialog actual rendering & validation (#519)", () => {
  it("validates choiceDialog options for manifestNotMutable and permissionDenied without throwing invalidChoiceDialogOptions", () => {
    const manifestOptions = buildSessionPersistenceSuspendedChoiceOptions("manifestNotMutable");
    const permOptions = buildSessionPersistenceSuspendedChoiceOptions("permissionDenied");

    expect(() => validateChoiceDialogOptions(manifestOptions)).not.toThrow();
    expect(() => validateChoiceDialogOptions(permOptions)).not.toThrow();
  });

  it("renders ChoiceDialog component markup correctly for manifestNotMutable suspension", () => {
    const options = buildSessionPersistenceSuspendedChoiceOptions("manifestNotMutable");
    const markup = renderToStaticMarkup(
      React.createElement(ChoiceDialog, {
        options,
        platform: "windows",
        translate: translateJa,
        clipboardAdapter: noopClipboardAdapter,
        opener: null,
        onResult: () => undefined
      })
    );

    // Header title
    expect(markup).toContain("作業情報の自動保存を停止しました");
    // Action buttons
    expect(markup).toContain("セッションフォルダを開く");
    expect(markup).toContain("OK");
    // Technical info copy button
    expect(markup).toContain("技術情報をコピー");
  });

  it("successfully registers and resolves choice request in DialogController for manifestNotMutable options", async () => {
    const controller = new DialogController();
    const options = buildSessionPersistenceSuspendedChoiceOptions("manifestNotMutable");

    const choicePromise = controller.choice(options);
    expect(controller.getPendingRequest()?.kind).toBe("choice");

    controller.resolve({ kind: "chosen", id: "openSessionsFolder" });
    const result = await choicePromise;

    expect(result).toEqual({ kind: "chosen", id: "openSessionsFolder" });
    expect(controller.getPendingRequest()).toBeNull();
  });
});

