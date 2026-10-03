import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * #664: App.tsx wiring. The Renderer menu must not get its own execution path:
 * the native menu's incoming command and a Renderer menu click share ONE
 * renderer-side entry, which executes through the CommandRegistry with the
 * "applicationMenu" source.
 */
const app = readFileSync("src/renderer/App.tsx", "utf8");

describe("application menu wiring in App (#664)", () => {
  it("has a single shared entry for application-menu commands", () => {
    expect(
      app.match(/const receiveApplicationMenuCommand = \(commandId: string\)/g)
    ).toHaveLength(1);
    expect(app.match(/application_menu\.command\.received/g)).toHaveLength(1);
  });

  it("the native menu's IPC command goes through that shared entry", () => {
    const subscription = app.indexOf("subscribeApplicationMenuCommands(");
    const block = app.slice(subscription, subscription + 400);

    expect(block).toContain("receiveApplicationMenuCommandRef.current(commandId)");
  });

  it("a Renderer menu click goes through the same shared entry", () => {
    const hook = app.indexOf("useApplicationMenuIntegration({");
    const block = app.slice(hook, hook + 300);

    expect(block).toContain(
      "receiveApplicationMenuCommandRef.current(commandId)"
    );
  });

  it("the shared entry executes with the applicationMenu source (IME save guard kept)", () => {
    const entry = app.indexOf("const receiveApplicationMenuCommand =");
    const block = app.slice(entry, entry + 700);

    expect(block).toContain("imeCompositionSaveGuard.handleCommand(");
    expect(block).toContain("executeUiCommandRef.current");
    expect(app).toContain(
      'executeUiCommand(noArgumentMenuCommandId(commandId), {\n      source: "applicationMenu"\n    });'
    );
  });

  it("connects the menu bar's click, shortcut labels and disabled state", () => {
    const bar = app.indexOf("<ApplicationMenuBar");
    const block = app.slice(bar, bar + 500);

    expect(block).toContain("onInvoke={applicationMenuIntegration.onInvoke}");
    expect(block).toContain(
      "getShortcutLabel={applicationMenuIntegration.getShortcutLabel}"
    );
    expect(block).toContain("isDisabled={applicationMenuIntegration.isDisabled}");
  });

  it("does not quit, exit or touch Electron from the Renderer menu path", () => {
    for (const path of [
      "src/renderer/applicationMenuIntegration.ts",
      "src/renderer/ApplicationMenuBar.tsx",
      "src/renderer/applicationMenuProjection.ts"
    ]) {
      const source = readFileSync(path, "utf8").replace(
        /\/\*[\s\S]*?\*\//g,
        ""
      );

      expect(source, path).not.toMatch(/app\.(quit|exit)\(/);
      expect(source, path).not.toContain('from "electron"');
    }
  });
});

describe("keyboard / modal wiring of the Renderer menu in App (#665)", () => {
  const stripComments = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("hands the menu the app-wide modal state and the IME guard", () => {
    const bar = app.indexOf("<ApplicationMenuBar");
    const block = app.slice(bar, bar + 700);

    expect(block).toContain(
      "isKeyboardBlocked={isApplicationMenuKeyboardBlocked}"
    );
    expect(block).toContain(
      "isImeComposing={imeCompositionSaveGuard.isComposing}"
    );
  });

  it("the blocked state is built on isAppModalSurfacePendingOrOpen and the other dialogs", () => {
    const start = app.indexOf("const isApplicationMenuKeyboardBlocked =");
    const block = app.slice(start, start + 900);

    expect(start).toBeGreaterThan(-1);
    expect(block).toContain("isAppModalSurfacePendingOrOpen ||");
    for (const dialog of [
      "rubyDialogState !== null",
      "emphasisMarkDialogState !== null",
      "linkInsertDialogState !== null",
      "isGlossaryExportWizardOpen",
      "exportConfirmationState !== null"
    ]) {
      expect(block, dialog).toContain(dialog);
    }
  });

  it("does not decide modality from a DOM query", () => {
    for (const path of [
      "src/renderer/ApplicationMenuBar.tsx",
      "src/renderer/applicationMenuKeyboard.ts"
    ]) {
      const code = stripComments(readFileSync(path, "utf8"));

      expect(code, path).not.toContain("aria-modal");
      expect(code, path).not.toMatch(/role=['"]?(alert)?dialog/);
    }
  });

  it("keeps the native bar hidden without autoHideMenuBar (Alt must not bring it back)", () => {
    for (const path of [
      "src/main/main.ts",
      "src/main/menu.ts",
      "src/main/nativeMenuBarVisibility.ts"
    ]) {
      const code = stripComments(readFileSync(path, "utf8"));

      expect(code, path).not.toMatch(/autoHideMenuBar\s*:\s*true/);
      expect(code, path).not.toMatch(/setAutoHideMenuBar\(\s*true/);
    }
  });

  it("never infers a mnemonic from label text and draws no underline", () => {
    const code = stripComments(
      readFileSync("src/renderer/applicationMenuKeyboard.ts", "utf8")
    );
    const css = readFileSync("src/renderer/styles.css", "utf8");

    expect(code).toContain("menu.mnemonic");
    expect(code).not.toMatch(/label\[0\]|label\.includes|label\.charAt/);
    expect(stripComments(css.slice(css.indexOf("/* #665:")))).not.toMatch(
      /underline|text-decoration/
    );
  });
});
