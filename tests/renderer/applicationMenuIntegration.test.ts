import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { rendererMenuNativeRoles } from "../../src/shared/api";
import {
  getApplicationMenuModel,
  type ApplicationMenuItem
} from "../../src/shared/applicationMenuModel";
import {
  applicationCommandIds,
  applicationMenuCommandIds,
  commandPaletteCommandIds,
  editorCommandIds,
  workspaceCommandIds
} from "../../src/shared/commandIds";
import {
  CommandRegistry,
  defineCommandId
} from "../../src/shared/commandRegistry";
import {
  formatKeybindingLabel,
  resolveDefaultKeybindings,
  type PergamumPlatform,
  type ResolvedKeybinding
} from "../../src/shared/keybindings";
import { createMenuAcceleratorLookup } from "../../src/main/menuAccelerators";
import {
  computeApplicationMenuEnablement,
  createApplicationMenuInvoker,
  createMenuShortcutLabelResolver,
  isApplicationMenuCommandDisabled
} from "../../src/renderer/applicationMenuIntegration";
import {
  projectApplicationMenu,
  type RendererMenuEntry
} from "../../src/renderer/applicationMenuProjection";
import { t, type Translate } from "../../src/shared/i18n";

const translate: Translate = (key, values) => t("en", key, values);

function rowsFor(platform: PergamumPlatform): readonly ResolvedKeybinding[] {
  return resolveDefaultKeybindings(platform);
}

function withKey(
  rows: readonly ResolvedKeybinding[],
  command: string,
  key: string | null
): ResolvedKeybinding[] {
  return rows.map((row) => (row.command === command ? { ...row, key } : row));
}

function flatten(entries: readonly RendererMenuEntry[]): RendererMenuEntry[] {
  return entries.flatMap((entry) => [
    entry,
    ...(entry.kind === "submenu" ? flatten(entry.items) : [])
  ]);
}

function labelOf(
  platform: PergamumPlatform,
  rows: readonly ResolvedKeybinding[],
  menuLabel: string
): Map<string, string | undefined> {
  const resolver = createMenuShortcutLabelResolver(platform, rows);
  const menus = projectApplicationMenu(
    platform === "win32" ? "windows" : "linux",
    { translate, getShortcutLabel: resolver }
  );
  const menu = menus.find((candidate) => candidate.label === menuLabel)!;

  return new Map(
    flatten(menu.items).flatMap((entry) =>
      entry.kind === "item" ? [[entry.label, entry.shortcutLabel] as const] : []
    )
  );
}

describe("Renderer menu shortcut labels (#664)", () => {
  it("shows the effective primary key, formatted by the shared formatter", () => {
    const labels = labelOf("win32", rowsFor("win32"), "File");

    expect(labels.get("Save")).toBe("Ctrl+S");
    expect(labels.get("Save All")).toBe(
      formatKeybindingLabel(
        rowsFor("win32").find((row) => row.command === editorCommandIds.saveAll)!
          .key!,
        "win32"
      )
    );
    expect(labels.get("Close Current Tab")).toBe("Ctrl+W");
  });

  it("shows a user override, not the default", () => {
    const rows = withKey(
      rowsFor("win32"),
      editorCommandIds.saveDocument,
      "Mod-Alt-s"
    );

    expect(labelOf("win32", rows, "File").get("Save")).toBe("Ctrl+Alt+S");
  });

  it("shows nothing for an unbound command (no default fallback)", () => {
    const rows = withKey(rowsFor("win32"), editorCommandIds.saveDocument, null);

    expect(labelOf("win32", rows, "File").get("Save")).toBeUndefined();
  });

  it("uses the same primary key the native accelerator backend binds, for every menu command", () => {
    const rows = withKey(
      rowsFor("win32"),
      editorCommandIds.saveAll,
      "Mod-Alt-s"
    );
    const lookup = createMenuAcceleratorLookup(
      "win32",
      undefined,
      undefined,
      rows
    );
    const resolver = createMenuShortcutLabelResolver("win32", rows);
    let compared = 0;

    for (const commandId of applicationMenuCommandIds) {
      const accelerator = lookup.get(commandId);
      const label = resolver({ id: commandId, kind: "customizable" });

      // Both are derived from the same selected key: present together.
      expect(label === undefined, commandId).toBe(accelerator === undefined);
      compared += accelerator === undefined ? 0 : 1;
    }

    expect(compared).toBeGreaterThan(5);
  });

  it("a command with several bindings shows only its primary (aliases stay in the backend)", () => {
    const labels = labelOf("win32", rowsFor("win32"), "View");

    expect(labels.get("Command Palette...")).toBe("Ctrl+P");
    expect(labels.get("Zoom In")).toBe("Ctrl+=");
    // The F1 / F12 / Ctrl++ aliases never replace the displayed primary.
    expect(labels.get("Command Palette...")).not.toBe("F1");
    expect(labelOf("win32", rowsFor("win32"), "File").get("Save As...")).not.toBe(
      "F12"
    );
    expect(labels.get("Zoom In")).not.toBe("Ctrl++");
  });

  it("keybinding: none and primaryUnlabeled items show no label", () => {
    const labels = labelOf("win32", rowsFor("win32"), "File");

    // Open Markdown File (none) and Application Settings (primaryUnlabeled).
    expect(labels.get("Open Markdown File...")).toBeUndefined();
    expect(labels.get("Application Settings...")).toBeUndefined();
    // ... although the key is bound in the effective rows.
    expect(
      rowsFor("win32").find(
        (row) => row.command === workspaceCommandIds.openApplicationSettings
      )?.key
    ).not.toBeNull();
  });

  it("native roles show their documented native shortcut from the catalog rows", () => {
    const edit = labelOf("win32", rowsFor("win32"), "Edit");
    const view = labelOf("win32", rowsFor("win32"), "View");
    const file = labelOf("win32", rowsFor("win32"), "File");

    expect(edit.get("Undo")).toBe("Ctrl+Z");
    expect(edit.get("Redo")).toBe("Ctrl+Y");
    expect(edit.get("Cut")).toBe("Ctrl+X");
    expect(edit.get("Copy")).toBe("Ctrl+C");
    expect(edit.get("Paste")).toBe("Ctrl+V");
    expect(edit.get("Select All")).toBe("Ctrl+A");
    expect(view.get("Toggle Developer Tools")).toBe("Ctrl+Shift+D");
    expect(view.get("Toggle Full Screen")).toBe("F11");
    expect(file.get("Quit Pergamum")).toBe("Ctrl+Q");
  });

  it("formats per platform with the shared formatter", () => {
    const linux = labelOf("linux", rowsFor("linux"), "File");

    expect(linux.get("Save")).toBe("Ctrl+S");
    expect(
      createMenuShortcutLabelResolver("darwin", rowsFor("darwin"))({
        id: editorCommandIds.saveDocument,
        kind: "customizable"
      })
    ).toBe("Cmd+S");
  });

  it("keeps no shortcut table of its own", () => {
    const source = readFileSync(
      "src/renderer/applicationMenuIntegration.ts",
      "utf8"
    ).replace(/\/\*[\s\S]*?\*\//g, "");

    expect(source).not.toMatch(/["'](?:Ctrl|Cmd|Alt|Shift|Option)\+/);
    expect(source).not.toMatch(/["']Mod-/);
    expect(source).toContain("formatKeybindingLabel(");
  });
});

describe("Renderer menu enablement (#664)", () => {
  function registry(): CommandRegistry {
    const commands = new CommandRegistry();
    commands.register({
      id: defineCommandId("test.always.run"),
      title: "Always",
      execute: () => undefined
    });
    commands.register({
      id: defineCommandId("test.needsProject.run"),
      title: "Needs project",
      when: { key: "project.isOpen" },
      execute: () => undefined
    });
    commands.register({
      id: defineCommandId("test.gated.run"),
      title: "Gated",
      isEnabled: () => gate.value,
      execute: () => undefined
    });
    return commands;
  }
  const gate = { value: true };

  it("respects both `when` and `isEnabled`, and re-evaluates on context change", () => {
    const commands = registry();

    expect(
      isApplicationMenuCommandDisabled(commands, {}, "test.always.run")
    ).toBe(false);
    expect(
      isApplicationMenuCommandDisabled(commands, {}, "test.needsProject.run")
    ).toBe(true);
    expect(
      isApplicationMenuCommandDisabled(
        commands,
        { "project.isOpen": true },
        "test.needsProject.run"
      )
    ).toBe(false);

    gate.value = false;
    expect(
      isApplicationMenuCommandDisabled(commands, {}, "test.gated.run")
    ).toBe(true);
    gate.value = true;
    expect(
      isApplicationMenuCommandDisabled(commands, {}, "test.gated.run")
    ).toBe(false);
  });

  it("treats an unregistered command as disabled, never silently enabled", () => {
    expect(
      isApplicationMenuCommandDisabled(
        new CommandRegistry(),
        {},
        "nobody.registered.this"
      )
    ).toBe(true);
  });

  it("is the same evaluation that is pushed to the native menu", () => {
    // `computeApplicationMenuEnablement` is what App pushes over IPC; the
    // Renderer menu's isDisabled agrees with it for every menu command.
    const commands = new CommandRegistry();
    for (const [index, commandId] of applicationMenuCommandIds.entries()) {
      commands.register({
        id: defineCommandId(commandId),
        title: commandId,
        isEnabled: () => index % 2 === 0,
        execute: () => undefined
      });
    }

    const pushed = computeApplicationMenuEnablement(commands, {});

    expect(Object.keys(pushed).sort()).toEqual(
      [...applicationMenuCommandIds].sort()
    );
    for (const commandId of applicationMenuCommandIds) {
      expect(isApplicationMenuCommandDisabled(commands, {}, commandId)).toBe(
        !pushed[commandId]
      );
    }
  });

  it("feeds the projection's disabled flag (native edit roles included)", () => {
    const disabled = new Set<string>([
      editorCommandIds.cutSelection,
      editorCommandIds.pasteSelection
    ]);
    const menus = projectApplicationMenu("windows", {
      translate,
      isDisabled: (commandId) => disabled.has(commandId)
    });
    const edit = flatten(menus[1].items);
    const state = (label: string) =>
      edit.find((entry) => entry.kind === "item" && entry.label === label);

    // Read-only project document: Copy / Select All stay enabled, Cut / Paste
    // are disabled (decided by the registry's native edit enablement).
    expect(state("Copy")).toMatchObject({ disabled: false });
    expect(state("Select All")).toMatchObject({ disabled: false });
    expect(state("Cut")).toMatchObject({ disabled: true });
    expect(state("Paste")).toMatchObject({ disabled: true });
  });
});

describe("Renderer menu click execution (#664)", () => {
  function setup(disabled: readonly string[] = []) {
    const deps = {
      executeCommand: vi.fn(),
      isCommandDisabled: (commandId: string) => disabled.includes(commandId),
      invokeNativeRole: vi.fn(async () => true),
      toggleFullscreen: vi.fn(async () => true)
    };

    return { deps, invoke: createApplicationMenuInvoker(deps) };
  }

  it("runs a command through the shared renderer execution exactly once", () => {
    const { deps, invoke } = setup();

    invoke({ type: "command", commandId: editorCommandIds.saveDocument });

    expect(deps.executeCommand).toHaveBeenCalledTimes(1);
    expect(deps.executeCommand).toHaveBeenCalledWith(
      editorCommandIds.saveDocument
    );
    expect(deps.invokeNativeRole).not.toHaveBeenCalled();
  });

  it("Quit goes through the command route (dirty-document preflight), never straight to Electron", () => {
    const { deps, invoke } = setup();

    invoke({ type: "command", commandId: applicationCommandIds.quitApplication });

    expect(deps.executeCommand).toHaveBeenCalledWith(
      applicationCommandIds.quitApplication
    );
    expect(deps.invokeNativeRole).not.toHaveBeenCalled();
    expect(
      readFileSync("src/renderer/applicationMenuIntegration.ts", "utf8")
    ).not.toMatch(/app\.quit\(|app\.exit\(|quitApplication\(/);
  });

  it.each(["undo", "redo", "cut", "copy", "paste", "selectAll"] as const)(
    "native edit role %s is run by Electron through the allowlisted bridge once",
    (role) => {
      const { deps, invoke } = setup();

      invoke({ type: "nativeRole", role, commandId: editorCommandIds.copySelection });

      expect(deps.invokeNativeRole).toHaveBeenCalledTimes(1);
      expect(deps.invokeNativeRole).toHaveBeenCalledWith(role);
      expect(deps.executeCommand).not.toHaveBeenCalled();
    }
  );

  it("re-checks enablement at click time for a role with a command id", () => {
    const { deps, invoke } = setup([editorCommandIds.pasteSelection]);

    invoke({
      type: "nativeRole",
      role: "paste",
      commandId: editorCommandIds.pasteSelection
    });

    expect(deps.invokeNativeRole).not.toHaveBeenCalled();
  });

  it("Toggle Developer Tools uses the bridge; Toggle Full Screen the existing window API", () => {
    const { deps, invoke } = setup();

    invoke({ type: "nativeRole", role: "toggleDevTools" });
    expect(deps.invokeNativeRole).toHaveBeenCalledWith("toggleDevTools");

    invoke({ type: "nativeRole", role: "togglefullscreen" });
    expect(deps.toggleFullscreen).toHaveBeenCalledTimes(1);
    expect(deps.invokeNativeRole).toHaveBeenCalledTimes(1);
  });

  it("never forwards a macOS-only role", () => {
    const { deps, invoke } = setup();

    for (const role of ["hide", "hideOthers", "services", "close", "front"] as const) {
      invoke({ type: "nativeRole", role });
    }

    expect(deps.invokeNativeRole).not.toHaveBeenCalled();
    expect(deps.toggleFullscreen).not.toHaveBeenCalled();
  });

  it("does not reimplement native editing, clipboard or Electron access", () => {
    const source = readFileSync(
      "src/renderer/applicationMenuIntegration.ts",
      "utf8"
    ).replace(/\/\*[\s\S]*?\*\//g, "");

    expect(source).not.toMatch(
      /execCommand|navigator\.clipboard|from "electron"|ipcRenderer/
    );
  });
});

describe("model <-> command boundary (#664)", () => {
  function collect(items: readonly ApplicationMenuItem[]): ApplicationMenuItem[] {
    return items.flatMap((item) => [
      item,
      ...(item.type === "submenu" ? collect(item.items) : [])
    ]);
  }

  it("every command id in the Windows / Linux menu is an allowlisted application-menu command", () => {
    for (const platform of ["win32", "linux"] as const) {
      for (const item of collect(
        getApplicationMenuModel(platform).flatMap((menu) => menu.items)
      )) {
        if (item.type === "command") {
          expect(applicationMenuCommandIds).toContain(item.commandId);
        }
        if (item.type === "nativeRole" && item.commandId !== undefined) {
          expect(applicationMenuCommandIds).toContain(item.commandId);
        }
      }
    }
  });

  it("every native role shown on Windows / Linux can be run by the Renderer", () => {
    for (const platform of ["win32", "linux"] as const) {
      for (const item of collect(
        getApplicationMenuModel(platform).flatMap((menu) => menu.items)
      )) {
        if (item.type === "nativeRole") {
          const runnable =
            item.role === "togglefullscreen" ||
            (rendererMenuNativeRoles as readonly string[]).includes(item.role);
          expect(runnable, `${platform}:${item.role}`).toBe(true);
        }
      }
    }
  });

  it("Command Palette stays reachable (command route)", () => {
    expect(applicationMenuCommandIds).toContain(commandPaletteCommandIds.open);
  });
});
