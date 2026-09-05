import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = () => readFileSync("src/renderer/App.tsx", "utf8");

describe("Settings restart-required dialog wiring (#394 Step 2)", () => {
  it("changeSettings only saves and reports success/failure — it never runs the restart check itself", () => {
    const source = appSource();
    const changeSettingsIndex = source.indexOf(
      "async function changeSettings("
    );
    const nextFunctionIndex = source.indexOf(
      "const settingsFieldRestartTracker =",
      changeSettingsIndex
    );

    expect(changeSettingsIndex).toBeGreaterThan(-1);
    expect(nextFunctionIndex).toBeGreaterThan(changeSettingsIndex);

    const changeSettingsBlock = source.slice(
      changeSettingsIndex,
      nextFunctionIndex
    );

    expect(changeSettingsBlock).toContain("): Promise<boolean> {");
    expect(changeSettingsBlock).toContain("await saveSettings(nextSettings);");
    expect(changeSettingsBlock).toContain("return true;");
    expect(changeSettingsBlock).toContain("return false;");
    expect(changeSettingsBlock).not.toContain("promptRestartIfRequired");
  });

  it("delegates focus/change/blur handling to the settingsFieldRestartTracker instance, never touching the restart diff/promise state directly in App.tsx", () => {
    const source = appSource();
    const trackerRefIndex = source.indexOf(
      "const settingsFieldRestartTracker ="
    );
    const changeRequestIndex = source.indexOf(
      "function handleSettingsChangeRequest(",
      trackerRefIndex
    );
    const focusIndex = source.indexOf(
      "function handleSettingsFieldFocus(",
      changeRequestIndex
    );
    const blurIndex = source.indexOf(
      "async function handleSettingsFieldBlur(",
      focusIndex
    );
    const dialogFunctionIndex = source.indexOf(
      "async function showSettingsRestartRequiredDialog(",
      blurIndex
    );

    expect(trackerRefIndex).toBeGreaterThan(-1);
    expect(changeRequestIndex).toBeGreaterThan(trackerRefIndex);
    expect(focusIndex).toBeGreaterThan(changeRequestIndex);
    expect(blurIndex).toBeGreaterThan(focusIndex);
    expect(dialogFunctionIndex).toBeGreaterThan(blurIndex);

    const trackerCreationLine = source.slice(
      trackerRefIndex,
      changeRequestIndex
    );
    const changeRequestBlock = source.slice(changeRequestIndex, focusIndex);
    const focusBlock = source.slice(focusIndex, blurIndex);
    const blurBlock = source.slice(blurIndex, dialogFunctionIndex);

    expect(trackerCreationLine).toContain(
      "useRef(\n    createSettingsFieldRestartTracker()\n  ).current"
    );

    // App.tsx itself must never re-implement the race-prone
    // "snapshot -> await -> read" sequencing — that lives entirely inside
    // settingsFieldRestartTracker.ts.
    expect(changeRequestBlock).toContain(
      "settingsFieldRestartTracker.handleChangeRequest(\n      nextSettings,\n      changeSettings\n    );"
    );
    expect(changeRequestBlock).not.toContain("promptRestartIfRequired");

    expect(focusBlock).toContain(
      "settingsFieldRestartTracker.handleFocus(settings);"
    );
    expect(focusBlock).not.toContain("promptRestartIfRequired");

    expect(blurBlock).toContain("await settingsFieldRestartTracker.handleBlur(");
    expect(blurBlock).toContain("showSettingsRestartRequiredDialog,");
    expect(blurBlock).toContain("requestApplicationRestart");
    // No direct access to any focus/save/pending state — that state is
    // private to the tracker instance now.
    expect(blurBlock).not.toContain("Ref.current");
  });

  it("wires SettingsPanel's onSettingFieldFocus/onSettingFieldBlur to the new handlers, and onChangeSettings to the per-keystroke handler", () => {
    const source = appSource();
    const settingsPanelIndex = source.indexOf("<SettingsPanel");
    const closingIndex = source.indexOf("/>", settingsPanelIndex);

    expect(settingsPanelIndex).toBeGreaterThan(-1);
    expect(closingIndex).toBeGreaterThan(settingsPanelIndex);

    const settingsPanelBlock = source.slice(settingsPanelIndex, closingIndex);

    expect(settingsPanelBlock).toContain(
      "onChangeSettings={handleSettingsChangeRequest}"
    );
    expect(settingsPanelBlock).toContain(
      "onSettingFieldFocus={handleSettingsFieldFocus}"
    );
    expect(settingsPanelBlock).toContain("onSettingFieldBlur={() => {");
    expect(settingsPanelBlock).toContain("void handleSettingsFieldBlur();");
  });

  it("reuses the generic confirmDialog/ConfirmDialog infrastructure for the restart prompt, with no new dialog component", () => {
    const source = appSource();
    const dialogFunctionIndex = source.indexOf(
      "async function showSettingsRestartRequiredDialog("
    );
    const nextFunctionIndex = source.indexOf(
      "function requestApplicationRestart(",
      dialogFunctionIndex
    );

    expect(dialogFunctionIndex).toBeGreaterThan(-1);
    expect(nextFunctionIndex).toBeGreaterThan(dialogFunctionIndex);

    const dialogFunctionBlock = source.slice(
      dialogFunctionIndex,
      nextFunctionIndex
    );

    expect(dialogFunctionBlock).toContain("return await confirmDialog({");
    expect(dialogFunctionBlock).toContain(
      'title: translate("dialog.settingsRestartRequired.title")'
    );
    expect(dialogFunctionBlock).toContain(
      'text: translate("dialog.settingsRestartRequired.message")'
    );
    expect(dialogFunctionBlock).toContain(
      'confirmLabel: translate("dialog.settingsRestartRequired.confirm")'
    );
    expect(dialogFunctionBlock).toContain(
      'cancelLabel: translate("dialog.settingsRestartRequired.cancel")'
    );
    expect(dialogFunctionBlock).toContain('icon: { kind: "question"');
    expect(dialogFunctionBlock).toContain(
      'error instanceof AppDialogError && error.kind === "dialogAlreadyOpen"'
    );
  });

  it("requestApplicationRestart is a Step 2 no-op: no relaunch/quit/exit in its body", () => {
    const source = appSource();
    const restartFunctionIndex = source.indexOf(
      "function requestApplicationRestart("
    );

    expect(restartFunctionIndex).toBeGreaterThan(-1);

    const restartFunctionBlock = source.slice(
      restartFunctionIndex,
      restartFunctionIndex + 400
    );

    // The function BODY (after its opening brace) must never call these,
    // even though the doc comment above it mentions them as Step 3 future
    // work — strip comment lines before asserting.
    const bodyStart = restartFunctionBlock.indexOf("{");
    const functionBody = restartFunctionBlock
      .slice(bodyStart)
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");

    expect(functionBody).not.toContain("relaunch");
    expect(functionBody).not.toContain("app.quit");
    expect(functionBody).not.toContain("app.exit");
  });

  it("imports createSettingsFieldRestartTracker from the dedicated tracker module", () => {
    const source = appSource();

    expect(source).toContain(
      'import { createSettingsFieldRestartTracker } from "./settingsFieldRestartTracker";'
    );
    // The lower-level diff/orchestration module is no longer imported
    // directly by App.tsx — only settingsFieldRestartTracker.ts uses it now.
    expect(source).not.toContain(
      'import { promptRestartIfRequired } from "./settingsRestartRequiredChange";'
    );
  });
});
