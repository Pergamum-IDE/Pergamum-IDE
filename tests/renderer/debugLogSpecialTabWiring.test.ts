import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { t, type Translate } from "../../src/shared/i18n";
import { ActivityBar } from "../../src/renderer/ActivityBar";
import {
  shouldShowFullScreenWelcomeSurface,
  shouldShowWelcomeSurface
} from "../../src/renderer/welcomeSurface";
import type { OpenDocumentsState } from "../../src/renderer/openDocuments";

const appSource = () => readFileSync("src/renderer/App.tsx", "utf8");
const translate: Translate = (key) => key;
const emptyOpenDocumentsState = {
  documents: [],
  activeDocumentId: null
} as unknown as OpenDocumentsState;

describe("Debug Log special tab wiring (#377)", () => {
  it("keeps a dedicated open-state and only-when-selected active-state", () => {
    const source = appSource();

    expect(source).toContain(
      "const [isDebugLogTabOpen, setIsDebugLogTabOpen] = useState(false)"
    );
    expect(source).toContain(
      "const [isDebugModeEnabled, setIsDebugModeEnabled] = useState(false)"
    );
    expect(source).toContain(
      "isDebugLogTabOpen && activeSpecialTabId === \"debugLog\""
    );
    expect(source).toContain('specialWorkspaceTabId("debugLog")');
  });

  it("reuses the --pergamum-debug state from the debug log snapshot", () => {
    const source = appSource();

    expect(source).toContain("window.pergamum.debugLog\n      .getSnapshot()");
    expect(source).toContain("setIsDebugModeEnabled(snapshot.enabled)");
    // No new debug-mode IPC / flag is introduced.
    expect(source).not.toContain("getAppInfo().then((info) => setIsDebugMode");
  });

  it("registers the Debug Log command only while debug mode is enabled", () => {
    const source = appSource();
    const registerIndex = source.indexOf("registerDebugLogCommands(");
    const guardIndex = source.lastIndexOf(
      "if (isDebugModeEnabled) {",
      registerIndex
    );

    expect(registerIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeGreaterThan(-1);
    expect(registerIndex - guardIndex).toBeLessThan(200);
    expect(source).toContain("openDebugLog: () => {\n            openDebugLogTab();");
  });

  it("gates openDebugLogTab itself on debug mode as a backstop", () => {
    const source = appSource();
    const fnIndex = source.indexOf("function openDebugLogTab()");
    const nextFnIndex = source.indexOf("function activateSpecialTab(", fnIndex);
    const body = source.slice(fnIndex, nextFnIndex);

    expect(fnIndex).toBeGreaterThan(-1);
    expect(body).toContain("if (!isDebugModeEnabled) {");
    expect(body).toContain("setIsDebugLogTabOpen(true);");
    expect(body).toContain('setActiveSpecialTabId("debugLog");');
  });

  it("renders the existing DebugLogPanel inside the editor tab area, and no longer in the Utility Window", () => {
    const source = appSource();
    const bodyIndex = source.indexOf(
      '<section className="editorAreaBody" ref={editorAreaBodyRef}>'
    );
    const statusBarIndex = source.indexOf('<footer className="statusBar">');
    const editorAreaBodyBlock = source.slice(bodyIndex, statusBarIndex);

    expect(editorAreaBodyBlock).toContain("isDebugLogTabActive ? (");
    expect(editorAreaBodyBlock).toContain(
      '<section className="debugLogTab">'
    );
    expect(editorAreaBodyBlock).toContain("<DebugLogPanel translate={translate} />");
    // The Utility Window no longer branches on a Debug Log tab.
    expect(source).not.toContain(
      'layout.utilityWindow.activeTab === "debugLog"'
    );
  });

  it("closes an active Debug Log tab without the dirty document close flow", () => {
    const source = appSource();
    const closeFunctionIndex = source.indexOf(
      "async function closeEditorWithConfirmation"
    );
    const nextFunctionIndex = source.indexOf(
      "runEditorCloseFlow",
      closeFunctionIndex
    );
    const closeBlock = source.slice(closeFunctionIndex, nextFunctionIndex);

    expect(closeBlock).toContain("if (!editorId && isDebugLogTabActive) {");
    expect(closeBlock).toContain('closeSpecialTab("debugLog");');
  });

  it("wires the Activity Bar bug icon to the debug log command", () => {
    const source = appSource();

    expect(source).toContain("isDebugModeEnabled={isDebugModeEnabled}");
    expect(source).toContain("isDebugLogActive={isDebugLogTabActive}");
    expect(source).toContain("executeUiCommand(debugLogCommandIds.open, {");
  });
});

describe("Activity Bar bug icon visibility (#377)", () => {
  function markup(props: Partial<Parameters<typeof ActivityBar>[0]>): string {
    return renderToStaticMarkup(
      React.createElement(ActivityBar, {
        activeMode: "files",
        isApplicationSettingsActive: false,
        translate,
        onSelectMode: () => undefined,
        onOpenApplicationSettings: () => undefined,
        ...props
      })
    );
  }

  it("does not render the bug icon when debug mode is disabled", () => {
    const rendered = markup({ isDebugModeEnabled: false });

    expect(rendered).not.toContain("activity.debugLog");
  });

  it("renders the bug icon above Settings when debug mode is enabled", () => {
    const rendered = markup({ isDebugModeEnabled: true });

    const bugIndex = rendered.indexOf("activity.debugLog");
    const settingsIndex = rendered.indexOf("activity.applicationSettings");

    expect(bugIndex).toBeGreaterThan(-1);
    expect(settingsIndex).toBeGreaterThan(-1);
    expect(bugIndex).toBeLessThan(settingsIndex);
    // Both live in the secondary (bottom) group.
    expect(rendered.indexOf("activityBarSecondary")).toBeLessThan(bugIndex);
  });

  it("marks the bug icon pressed only while the Debug Log tab is active", () => {
    expect(markup({ isDebugModeEnabled: true, isDebugLogActive: false })).toContain(
      'aria-label="activity.debugLog" aria-pressed="false"'
    );
    expect(markup({ isDebugModeEnabled: true, isDebugLogActive: true })).toContain(
      'aria-label="activity.debugLog" aria-pressed="true"'
    );
  });

  it("localizes the bug icon tooltip / accessible name", () => {
    const ja = markup({
      isDebugModeEnabled: true,
      translate: (key, values) => t("ja", key, values)
    });
    const en = markup({
      isDebugModeEnabled: true,
      translate: (key, values) => t("en", key, values)
    });

    expect(ja).toContain('aria-label="デバッグログ"');
    expect(ja).toContain('title="デバッグログ"');
    expect(en).toContain('aria-label="Debug Log"');
    expect(en).toContain('title="Debug Log"');
  });
});

describe("Welcome surface accounts for the Debug Log tab (#377)", () => {
  it("hides Welcome once the Debug Log tab is open with no documents", () => {
    expect(
      shouldShowWelcomeSurface({
        openDocumentsState: emptyOpenDocumentsState,
        isSettingsTabOpen: false,
        isDebugLogTabOpen: true
      })
    ).toBe(false);

    expect(
      shouldShowFullScreenWelcomeSurface({
        openDocumentsState: emptyOpenDocumentsState,
        isSettingsTabOpen: false,
        isDebugLogTabOpen: true,
        projectIsOpen: false
      })
    ).toBe(false);
  });

  it("still shows Welcome on a truly empty workbench", () => {
    expect(
      shouldShowWelcomeSurface({
        openDocumentsState: emptyOpenDocumentsState,
        isSettingsTabOpen: false,
        isDebugLogTabOpen: false
      })
    ).toBe(true);
  });
});
