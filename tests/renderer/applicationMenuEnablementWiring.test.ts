import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Application Menu enablement push (#252 follow-up)", () => {
  it("pushes isEnabledForContext for every application-menu command whenever the registry or live command context changes", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const effectIndex = source.indexOf(
      "for (const commandId of applicationMenuCommandIds)"
    );

    expect(effectIndex).toBeGreaterThan(-1);

    const effectBlock = source.slice(effectIndex, effectIndex + 400);

    expect(effectBlock).toContain("commandRegistry.isEnabledForContext(");
    expect(effectBlock).toContain(
      "window.pergamum.applicationMenu.setEnablement(enablement)"
    );
    expect(source).toContain("}, [commandRegistry, commandContext]);");
  });

  it("imports the value (not just the type) of applicationMenuCommandIds", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");

    expect(source).toContain("applicationMenuCommandIds,");
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
  it("gives every commandMenuItem a stable id and registers the setEnablement IPC handler", () => {
    const source = readFileSync("src/main/menu.ts", "utf8");

    expect(source).toContain("id: commandId,");
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
