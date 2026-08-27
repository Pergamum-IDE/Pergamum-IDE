import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = () => readFileSync("src/renderer/App.tsx", "utf8");

function sourceBlock(
  source: string,
  startNeedle: string,
  endNeedle: string
): string {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);

  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);

  return source.slice(start, end);
}

describe("external Markdown NotificationToast wiring (#266)", () => {
  it("dispatches the notification only for a newly opened Markdown file outside an open project", () => {
    const openFileBlock = sourceBlock(
      appSource(),
      "async function openFile()",
      "Fired once by MarkdownEditorSurface"
    );

    // open ≠ activate: an already-open external tab must not re-notify.
    expect(openFileBlock).toContain("const isNewExternalMarkdownOpen =");
    expect(openFileBlock).toContain('openedDocument.kind === "file"');
    expect(openFileBlock).toContain("project !== null");
    expect(openFileBlock).toContain(
      "!hasOpenDocument(openDocumentsState, openedEditorId)"
    );
  });

  it("dispatches through the application notification controller with an i18n message, only after a confirmed successful open", () => {
    const openFileBlock = sourceBlock(
      appSource(),
      "async function openFile()",
      "Fired once by MarkdownEditorSurface"
    );

    expect(openFileBlock).toContain(
      "if (didOpen && isNewExternalMarkdownOpen) {"
    );
    expect(openFileBlock).toContain("notificationController.notify({");
    expect(openFileBlock).toContain(
      'translate("notification.externalMarkdownOpened")'
    );
    // No raw Japanese string embedded at the call site.
    expect(openFileBlock).not.toContain("プロジェクト外");
  });

  it("does not notify when an already-open project document tab is re-activated", () => {
    const activateProjectDocumentBlock = sourceBlock(
      appSource(),
      "async function activateProjectDocument(",
      "async function changeSettings("
    );

    expect(activateProjectDocumentBlock).not.toContain(
      "notificationController.notify"
    );
    expect(activateProjectDocumentBlock).not.toContain(
      "notification.externalMarkdownOpened"
    );
  });

  it("mounts the NotificationHost with the app controller and the Settings auto-dismiss duration passed through in milliseconds (no unit conversion)", () => {
    const source = appSource();

    expect(source).toContain("<NotificationHost");
    expect(source).toContain("controller={notificationController}");
    expect(source).toContain("autoDismissMs={notificationAutoDismissMs}");
    expect(source).toContain(
      "const notificationAutoDismissMs =\n" +
        "    effectiveSettings.workbench.notification.durationMs;"
    );
  });

  it("creates one app-owned NotificationController and disposes it on unmount", () => {
    const source = appSource();

    expect(source).toContain("new NotificationController()");
    expect(source).toContain(
      "() => () => notificationController.dispose()"
    );
  });
});
