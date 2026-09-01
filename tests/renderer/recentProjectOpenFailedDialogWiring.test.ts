import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { enTranslations as en } from "../../src/shared/i18n/en";
import { jaTranslations as ja } from "../../src/shared/i18n/ja";

/**
 * #366 (dogfood): a recent-project open failure (`projects:openRecentProject`)
 * must show the same safe, user-facing dialog style as a session-restore
 * project-open failure, and must never leak the raw IPC/remote-method error
 * text into the UI (status line or dialog). Session-restore failure wiring
 * (`showProjectRestoreFailedDialog`, the deferred restore-Error queue) must
 * stay unchanged — see `coldStartRestoreErrorDialogWiring.test.ts`.
 */
const app = readFileSync("src/renderer/App.tsx", "utf8");

function functionBody(name: string): string {
  const start = app.indexOf(`function ${name}(`);
  expect(start, `${name} should exist`).toBeGreaterThan(-1);
  return app.slice(start, app.indexOf("\n  }", start) + 4);
}

describe("recent-project open failure dialog wiring (#366)", () => {
  it("openRecentProject's catch block never builds a status message from the raw error", () => {
    const body = functionBody("openRecentProject");

    // The old leak: `values: { message: errorMessage(error, translate) }`
    // fed straight into the visible status line.
    expect(body).not.toContain("errorMessage(error, translate)");
    expect(body).not.toMatch(/values:\s*\{\s*message:/);
  });

  it("openRecentProject shows the safe projectOpenFailed dialog and still logs detail", () => {
    const body = functionBody("openRecentProject");

    expect(body).toContain('key: "status.recentProjectOpenFailed"');
    expect(body).toContain("await showProjectOpenFailedDialog();");
    expect(body).toContain('event: "project.open.failed"');
    expect(body).toMatch(/level:\s*"error"/);
    expect(body).toContain("rendererDebugErrorInfo(error)");
  });

  it("showProjectOpenFailedDialog mirrors showProjectRestoreFailedDialog's shape (plain-text Error confirm dialog)", () => {
    const body = functionBody("showProjectOpenFailedDialog");

    expect(body).toContain('translate("dialog.projectOpenFailed.title")');
    expect(body).toContain('translate("dialog.projectOpenFailed.message")');
    expect(body).toMatch(/kind:\s*"error"/);
    expect(body).toContain('kind: "plainText"');
    expect(body).toContain("cancelLabel: null");
    // No dynamic error text anywhere in the dialog body.
    expect(body).not.toContain("errorMessage(");
    expect(body).not.toMatch(/error\.message/);
  });

  it("does not route the recent-project failure through the startup deferred restore-Error queue", () => {
    const body = functionBody("openRecentProject");

    expect(body).not.toContain("deferredRestoreErrorDialogs");
    expect(body).not.toContain("presentOwedRestoreDialogsIfIdle");
  });

  it("leaves session-restore failure wiring untouched", () => {
    // showProjectRestoreFailedDialog itself, and its place in the deferred
    // queue's pump, are unchanged (still separately covered by
    // coldStartRestoreErrorDialogWiring.test.ts).
    const restoreBody = functionBody("showProjectRestoreFailedDialog");
    expect(restoreBody).toContain('translate("dialog.projectRestoreFailed.title")');
    expect(restoreBody).toContain('translate("dialog.projectRestoreFailed.message")');

    const pumpBody = functionBody("pumpDeferredRestoreErrorDialogs");
    expect(pumpBody).toContain("showProjectRestoreFailedDialog()");
    // The new dialog is a direct, synchronous show — never wired into the
    // deferred pump alongside the startup dialogs.
    expect(pumpBody).not.toContain("showProjectOpenFailedDialog");
  });

  it("dialog.projectOpenFailed strings match the requested safe copy in both locales, with no error interpolation", () => {
    expect(ja["dialog.projectOpenFailed.title"]).toBe(
      "プロジェクトを開けませんでした"
    );
    expect(ja["dialog.projectOpenFailed.message"]).toBe(
      "プロジェクトファイル（.pergamum）が見つからないか、読み込めないか、別のプロジェクトに置き換わっている可能性があります。\n文書やプロジェクトの内容が削除されたわけではありません。"
    );
    expect(en["dialog.projectOpenFailed.title"]).toBe("Could not open project");
    expect(en["dialog.projectOpenFailed.message"]).toBe(
      "The project file (.pergamum) may be missing, unreadable, or replaced by another project.\nYour documents and project contents have not been deleted."
    );

    for (const table of [ja, en]) {
      expect(table["dialog.projectOpenFailed.title"]).not.toContain("{");
      expect(table["dialog.projectOpenFailed.message"]).not.toContain("{");
    }
  });

  it("status.recentProjectOpenFailed no longer interpolates a raw error message", () => {
    expect(ja["status.recentProjectOpenFailed"]).toBe(
      "最近のプロジェクトを開けませんでした"
    );
    expect(en["status.recentProjectOpenFailed"]).toBe(
      "Recent project open failed"
    );
    expect(ja["status.recentProjectOpenFailed"]).not.toContain("{message}");
    expect(en["status.recentProjectOpenFailed"]).not.toContain("{message}");
  });
});
