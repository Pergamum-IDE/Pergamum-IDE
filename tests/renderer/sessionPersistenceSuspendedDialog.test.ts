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
    expect(body).toContain("dialog.sessionPersistenceSuspended.message");
    // Not downgraded to a toast / warning.
    expect(body).not.toMatch(/notify|toast|warning/i);
  });
});
