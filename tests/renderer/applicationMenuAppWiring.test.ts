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
      'executeUiCommand(commandId, { source: "applicationMenu" });'
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
