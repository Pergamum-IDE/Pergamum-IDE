import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "C:\\fake-userData")
  }
}));

import { parseSaveApplicationSettingsRequest } from "../../src/main/settingsStore";
import {
  defaultApplicationSettings,
  toSaveApplicationSettingsRequest,
  type ApplicationSettings
} from "../../src/shared/settings";

// The bug: an `ApplicationSettings` (which carries `recentProjects`) spread
// into a save request type-checks but the main process parses the request
// strictly and rejects the extra top-level key ("Invalid application
// settings"). These tests pin the renderer-shape / main-parser boundary.

const settingsWithRecent: ApplicationSettings = {
  ...defaultApplicationSettings,
  recentProjects: [
    {
      name: "Book",
      filePath: "/w/Book/Book.pergamum",
      lastOpenedAt: "2026-01-01T00:00:00.000Z"
    }
  ] as unknown as ApplicationSettings["recentProjects"]
};

describe("toSaveApplicationSettingsRequest", () => {
  it("keeps every saveable section and drops recentProjects", () => {
    const request = toSaveApplicationSettingsRequest(settingsWithRecent);

    expect("recentProjects" in request).toBe(false);
    expect(request.preview).toBe(settingsWithRecent.preview);
    expect(request.workbench).toBe(settingsWithRecent.workbench);
    expect(request.commandPalette).toBe(settingsWithRecent.commandPalette);
    expect(request.editor).toBe(settingsWithRecent.editor);
    expect(request.search).toBe(settingsWithRecent.search);
    expect(request.markdownFiles).toBe(settingsWithRecent.markdownFiles);
    expect(request.textFiles).toBe(settingsWithRecent.textFiles);
    expect(request.imageAttachment).toBe(settingsWithRecent.imageAttachment);
    expect(request.documentMap).toBe(settingsWithRecent.documentMap);
  });

  it("leaves the optional sparse sections out when absent and keeps them when present", () => {
    const without = toSaveApplicationSettingsRequest({
      ...settingsWithRecent,
      notification: undefined,
      japaneseLint: undefined
    });
    expect("notification" in without).toBe(false);
    expect("japaneseLint" in without).toBe(false);

    const notification = {
      ...(defaultApplicationSettings.notification ?? {})
    } as NonNullable<ApplicationSettings["notification"]>;
    const japaneseLint = {} as NonNullable<ApplicationSettings["japaneseLint"]>;
    const withBoth = toSaveApplicationSettingsRequest({
      ...settingsWithRecent,
      notification,
      japaneseLint
    });
    expect(withBoth.notification).toBe(notification);
    expect(withBoth.japaneseLint).toBe(japaneseLint);
  });

  it("is accepted by the main-process strict parser", () => {
    const request = toSaveApplicationSettingsRequest(settingsWithRecent);

    expect(() => parseSaveApplicationSettingsRequest(request)).not.toThrow();
  });

  it("is accepted with the usage-tour flag set (Usage Tour 'don't show again')", () => {
    const request = {
      ...toSaveApplicationSettingsRequest(settingsWithRecent),
      workbench: {
        ...settingsWithRecent.workbench,
        usageTourAutoShowDisabled: true
      }
    };
    const parsed = parseSaveApplicationSettingsRequest(request);

    expect(parsed).not.toBeNull();
    expect(parsed?.workbench.usageTourAutoShowDisabled).toBe(true);
  });

  it("is accepted with the Tab Capture toggle flipped", () => {
    const request = {
      ...toSaveApplicationSettingsRequest(settingsWithRecent),
      editor: {
        ...settingsWithRecent.editor,
        captureTabInEditor: !settingsWithRecent.editor.captureTabInEditor
      }
    };
    const parsed = parseSaveApplicationSettingsRequest(request);

    expect(parsed).not.toBeNull();
    expect(parsed?.editor.captureTabInEditor).toBe(
      !settingsWithRecent.editor.captureTabInEditor
    );
  });

  it("documents the original bug: spreading ApplicationSettings is rejected, strict validation stays", () => {
    expect(() =>
      parseSaveApplicationSettingsRequest({ ...settingsWithRecent })
    ).toThrow("Invalid application settings.");
  });
});

describe("renderer call sites build the request through the helper", () => {
  const app = readFileSync("src/renderer/App.tsx", "utf8");

  it("Usage Tour auto-show dismissal and completion save a valid request", () => {
    for (const handler of [
      "const handleDismissAutoShowUsageTour",
      "const handleCompleteUsageTour"
    ]) {
      const body = app.slice(app.indexOf(handler));
      const code = body.slice(0, body.indexOf("}, [isUsageTourManual]);"));

      expect(code, handler).toContain("toSaveApplicationSettingsRequest(current)");
      expect(code, handler).toContain("usageTourAutoShowDisabled: true");
      expect(code, handler).toContain("if (!isUsageTourManual)");
      expect(code, handler).not.toMatch(/\.\.\.current,/);
    }
  });

  it("Closing the tour (Escape) never persists anything", () => {
    const body = app.slice(app.indexOf("const handleCloseUsageTour"));
    const code = body.slice(0, body.indexOf("}, []);"));

    expect(code).not.toContain("changeSettingsRef");
  });

  it("Tab Capture toggle saves a valid request", () => {
    const body = app.slice(app.indexOf("const toggle = (): void => {"));
    const code = body.slice(0, body.indexOf("publishTabCaptureToggle(toggle)"));

    expect(code).toContain("toSaveApplicationSettingsRequest(current)");
    expect(code).toContain("captureTabInEditor: !current.editor.captureTabInEditor");
    expect(code).not.toMatch(/\.\.\.current,/);
  });
});
