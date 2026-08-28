import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * #274: the cold-start restore Error dialogs ("Session restore unavailable"
 * / "Project restore failed") must be *presented* once, not merely
 * *attempted* once — the same guaranteed-recognition contract the #272
 * SUSPENDED-persistence Error already meets. The sequencing rules live in
 * the DOM-free `DeferredErrorDialogQueue` (unit-tested separately); this
 * locks in the App.tsx wiring.
 */
const app = readFileSync("src/renderer/App.tsx", "utf8");

function functionBody(name: string): string {
  const start = app.indexOf(`function ${name}(`);
  expect(start, `${name} should exist`).toBeGreaterThan(-1);
  return app.slice(start, app.indexOf("\n  }", start) + 4);
}

describe("cold-start restore Error dialog wiring (#274)", () => {
  it("uses the DeferredErrorDialogQueue, not ad-hoc shown booleans", () => {
    expect(app).toContain(
      'import { DeferredErrorDialogQueue } from "./dialog/deferredErrorDialogQueue"'
    );
    expect(app).toMatch(
      /new DeferredErrorDialogQueue\(\[\s*"restoreUnavailable",\s*"projectRestoreFailed"\s*\]\)/
    );
    // The old "attempted once" booleans are gone.
    expect(app).not.toContain("sessionRestoreUnavailableDialogShownRef");
    expect(app).not.toContain("projectRestoreFailedDialogShownRef");
  });

  it("notify* only ARM the queue — they never call show...Dialog directly (that path can be lost to dialogAlreadyOpen)", () => {
    const restoreUnavailable = app.slice(
      app.indexOf("notifyRestoreUnavailable:"),
      app.indexOf("notifyProjectRestoreFailed:")
    );
    expect(restoreUnavailable).toContain(
      'deferredRestoreErrorDialogs.arm("restoreUnavailable")'
    );
    expect(restoreUnavailable).not.toContain("showSessionRestoreUnavailableDialog(");

    const projectFailed = app.slice(
      app.indexOf("notifyProjectRestoreFailed:"),
      app.indexOf("notifyEditorSkipped:")
    );
    expect(projectFailed).toContain(
      'deferredRestoreErrorDialogs.arm("projectRestoreFailed")'
    );
    expect(projectFailed).not.toContain("showProjectRestoreFailedDialog(");
  });

  it("marks the restore body settled in finally, then readies the queue only after deferred routing settles", () => {
    const effectStart = app.indexOf(
      "coldStartRestoreAttemptedRef.current = true;"
    );
    const effectBody = app.slice(effectStart, effectStart + 1400);
    // #280: `.finally(...)` marks the restore body boundary only; deferred
    // Markdown launch routing is observed by a later effect.
    expect(effectBody).toMatch(
      /\.finally\(\(\) => \{[\s\S]*setColdStartRestoreSettled\(true\)/
    );
    expect(effectBody).not.toContain("deferredRestoreErrorDialogs.markReady()");
    expect(effectBody).toContain("runColdStartRestore(coldStartRestoreDeps)");

    const readyEffect = app.slice(
      app.indexOf("deferredRestoreErrorDialogsReadyRef.current = true"),
      app.indexOf("createProjectCommandRef.current = createProject;")
    );
    expect(readyEffect).toContain("coldStartMarkdownLaunchRoutingSettled");
    expect(readyEffect).toContain("deferredRestoreErrorDialogs.markReady()");
    expect(readyEffect).toContain("pumpDeferredRestoreErrorDialogsRef.current()");
  });

  it("the dialog-controller subscription re-drives the queue when a modal closes", () => {
    const start = app.indexOf("dialogController.subscribe(");
    const subscribeBlock = app.slice(start, start + 500);
    expect(subscribeBlock).toContain(
      "pumpDeferredRestoreErrorDialogsRef.current()"
    );
    // #272 suspension presenter is still re-driven here too (not regressed).
    expect(subscribeBlock).toContain(
      "presentSessionPersistenceSuspendedDialogIfIdleRef.current()"
    );
  });

  it("the pump passes the live dialog-pending predicate and routes ids to the right Error dialog", () => {
    const body = functionBody("pumpDeferredRestoreErrorDialogs");
    expect(body).toContain("deferredRestoreErrorDialogs.pump(");
    expect(body).toMatch(
      /isDialogPending:\s*\(\)\s*=>\s*dialogController\.getPendingRequest\(\)\s*!==\s*null/
    );
    expect(body).toContain(
      'id === "restoreUnavailable"'
    );
    expect(body).toContain("showSessionRestoreUnavailableDialog()");
    expect(body).toContain("showProjectRestoreFailedDialog()");
  });

  it("both Error dialogs are still Error-icon confirm dialogs, distinct from Save/toast copy", () => {
    for (const name of [
      "showSessionRestoreUnavailableDialog",
      "showProjectRestoreFailedDialog"
    ]) {
      const body = functionBody(name);
      expect(body).toMatch(/kind:\s*"error"/);
      expect(body).not.toMatch(/notificationController|toast|warning/i);
      // No internal owed/shown bookkeeping any more — the queue owns it.
      expect(body).not.toContain("ShownRef.current");
    }
  });
});
