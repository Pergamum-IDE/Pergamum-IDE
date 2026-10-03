import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Application Menu enablement push (#252 follow-up)", () => {
  it("pushes isEnabledForContext for every application-menu command whenever the registry or live command context changes", () => {
    // #664: the calculation lives in one helper that the Renderer menu's
    // disabled state shares; App only pushes its result.
    const integration = readFileSync(
      "src/renderer/applicationMenuIntegration.ts",
      "utf8"
    );
    const loopIndex = integration.indexOf(
      "for (const commandId of applicationMenuCommandIds)"
    );

    expect(loopIndex).toBeGreaterThan(-1);
    expect(integration.slice(loopIndex, loopIndex + 200)).toContain(
      "registry.isEnabledForContext(\n      noArgumentMenuCommandId(commandId),\n      context\n    )"
    );

    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const pushIndex = source.indexOf(
      "window.pergamum.applicationMenu.setEnablement("
    );

    expect(pushIndex).toBeGreaterThan(-1);
    expect(source.slice(pushIndex, pushIndex + 200)).toContain(
      "computeApplicationMenuEnablement(commandRegistry, commandContext)"
    );
    expect(source).toContain("}, [commandRegistry, commandContext]);");
  });

  it("imports the value (not just the type) of applicationMenuCommandIds", () => {
    const source = readFileSync(
      "src/renderer/applicationMenuIntegration.ts",
      "utf8"
    );

    // The value (not just the type) is imported, since it is iterated.
    expect(source).toMatch(
      /import \{\s*applicationMenuCommandIds,\s*noArgumentMenuCommandId\s*\} from "..\/shared\/commandIds"/
    );
    expect(source).toContain("for (const commandId of applicationMenuCommandIds)");
  });
});

describe("preload applicationMenu.setEnablement bridge (#252 follow-up)", () => {
  it("sends the enablement map over the setEnablement IPC channel", () => {
    const source = readFileSync("src/preload/preload.ts", "utf8");

    expect(source).toContain("setEnablement: (enablement) => {");
    expect(source).toContain(
      "ipcRenderer.send(APPLICATION_MENU_CHANNELS.setEnablement, enablement);"
    );
  });
});

describe("main-process menu command item ids and IPC registration (#252 follow-up)", () => {
  it("gives every command menu item a stable id and registers the setEnablement IPC handler", () => {
    // #662: command items are built by the Electron adapter from the model.
    const adapter = readFileSync("src/main/applicationMenuAdapter.ts", "utf8");
    expect(adapter).toContain("id: item.commandId,");

    const source = readFileSync("src/main/menu.ts", "utf8");

    expect(source).toContain(
      "ipcMain.on(APPLICATION_MENU_CHANNELS.setEnablement,"
    );
    expect(source).toContain("export function applyApplicationMenuEnablement(");
    expect(source).toContain("export function registerApplicationMenuIpc(");
  });

  it("is called from main.ts's startup sequence", () => {
    const source = readFileSync("src/main/main.ts", "utf8");

    expect(source).toContain("registerApplicationMenuIpc();");
  });
});
