import { describe, expect, it } from "vitest";
import {
  defaultKeybindings,
  keybindingCommands,
  listCommandMetadata,
  listResolvedKeyboardShortcutItems,
  validateKeybindingCatalog,
  type KeybindingCatalog,
  type KeybindingCommand,
  type PergamumPlatform
} from "../../src/shared/keybindings";

const platforms: readonly PergamumPlatform[] = ["win32", "linux", "darwin"];

function command(overrides: Partial<KeybindingCommand>): KeybindingCommand {
  return {
    id: "test.command",
    title: "Test",
    category: "Test",
    description: "test",
    scope: "app",
    executionHost: "renderer",
    source: "pergamum",
    readonly: false,
    readonlyReason: null,
    when: null,
    handlerStatus: "callbackDirect",
    ...overrides
  };
}

function diagnosticCodes(commands: KeybindingCommand[]): string[] {
  const catalog: KeybindingCatalog = { commands, defaults: [], reserved: [] };
  return validateKeybindingCatalog(catalog).map((d) => d.code);
}

describe("command metadata invariants (#640)", () => {
  it("every default keybinding has command metadata", () => {
    const ids = new Set(keybindingCommands.map((c) => c.id));
    for (const entry of defaultKeybindings) {
      expect(ids.has(entry.command), entry.command).toBe(true);
    }
  });

  it("ids are unique and title / category / description are non-empty", () => {
    const ids = keybindingCommands.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of keybindingCommands) {
      expect(c.title.trim(), c.id).not.toBe("");
      expect(c.category.trim(), c.id).not.toBe("");
      expect(c.description.trim(), c.id).not.toBe("");
    }
  });

  it("source, executionHost, readonly and handlerStatus agree", () => {
    for (const c of keybindingCommands) {
      if (c.source === "nativeRole") {
        expect(c.readonly, c.id).toBe(true);
        expect(c.executionHost, c.id).toBe("nativeRole");
        expect(c.handlerStatus, c.id).toBe("nativeRole");
      }
      if (c.source === "standard") {
        expect(c.readonly, c.id).toBe(true);
        expect(c.executionHost, c.id).toBe("standard");
        expect(c.handlerStatus, c.id).toBe("standard");
      }
      if (c.executionHost === "nativeRole") {
        expect(c.source, c.id).toBe("nativeRole");
      }
      if (c.executionHost === "standard") {
        expect(c.source, c.id).toBe("standard");
      }
      if (c.source === "pergamum") {
        expect(["renderer", "main"], c.id).toContain(c.executionHost);
        expect(
          ["registered", "callbackDirect", "notYetRegistered"],
          c.id
        ).toContain(c.handlerStatus);
      }
    }
  });

  it("the shipped catalog validates without errors", () => {
    expect(
      validateKeybindingCatalog().filter((d) => d.severity === "error")
    ).toEqual([]);
  });

  it("records the PO decisions: window.close / toggleFullscreen are nativeRole", () => {
    for (const id of ["window.close", "window.toggleFullscreen"]) {
      expect(keybindingCommands.find((c) => c.id === id)).toMatchObject({
        executionHost: "nativeRole",
        source: "nativeRole",
        readonly: true,
        handlerStatus: "nativeRole"
      });
    }
  });

  it("menu-accelerator commands run in the renderer registry (host = handler owner)", () => {
    for (const id of [
      "workspace.project.open",
      "app.zoom.in",
      "editor.document.save"
    ]) {
      expect(keybindingCommands.find((c) => c.id === id)).toMatchObject({
        executionHost: "renderer",
        handlerStatus: "registered"
      });
    }
  });

  it("maps locally wired commands as callbackDirect and unwired ones as notYetRegistered", () => {
    const status = (id: string) =>
      keybindingCommands.find((c) => c.id === id)?.handlerStatus;
    expect(status("editor.tabCapture.toggle")).toBe("callbackDirect");
    expect(status("editor.find.open")).toBe("callbackDirect");
    expect(status("workspace.tabs.next")).toBe("callbackDirect");
    expect(status("editor.markdown.list.ordered")).toBe("notYetRegistered");
  });

  it("the old metadataOnly field is gone", () => {
    for (const c of keybindingCommands) {
      expect("metadataOnly" in c).toBe(false);
    }
  });
});

describe("host / handler validation (#640)", () => {
  it("accepts well-formed commands", () => {
    expect(diagnosticCodes([command({})])).toEqual([]);
  });

  it("flags nativeRole / standard host-source mismatches", () => {
    expect(
      diagnosticCodes([
        command({ id: "a", executionHost: "nativeRole", source: "pergamum" })
      ])
    ).toContain("nativeRoleHostMismatch");
    expect(
      diagnosticCodes([
        command({
          id: "b",
          executionHost: "renderer",
          source: "nativeRole",
          readonly: true,
          readonlyReason: "nativeRole",
          handlerStatus: "nativeRole"
        })
      ])
    ).toContain("nativeRoleHostMismatch");
    expect(
      diagnosticCodes([
        command({ id: "c", executionHost: "standard", source: "pergamum" })
      ])
    ).toContain("standardHostMismatch");
  });

  it("flags a Pergamum command hosted outside renderer / main", () => {
    expect(
      diagnosticCodes([command({ executionHost: "standard" })])
    ).toContain("pergamumHostInvalid");
  });

  it("flags handlerStatus that does not fit the source", () => {
    expect(
      diagnosticCodes([command({ handlerStatus: "nativeRole" })])
    ).toContain("handlerStatusMismatch");
    expect(
      diagnosticCodes([
        command({
          source: "standard",
          executionHost: "standard",
          readonly: true,
          readonlyReason: "standardBehavior",
          handlerStatus: "registered"
        })
      ])
    ).toContain("handlerStatusMismatch");
  });
});

describe("listCommandMetadata (#640)", () => {
  it("returns every command once, sorted by category, title, id", () => {
    const list = listCommandMetadata();
    expect(list).toHaveLength(keybindingCommands.length);
    expect(new Set(list.map((c) => c.id)).size).toBe(list.length);
    const keys = list.map((c) => `${c.category}\u0000${c.title}\u0000${c.id}`);
    expect(keys).toEqual([...keys].sort());
  });

  it("is deterministic and does not mutate the catalog order", () => {
    const before = keybindingCommands.map((c) => c.id);
    expect(listCommandMetadata().map((c) => c.id)).toEqual(
      listCommandMetadata().map((c) => c.id)
    );
    expect(keybindingCommands.map((c) => c.id)).toEqual(before);
  });
});

describe("listResolvedKeyboardShortcutItems (#640)", () => {
  it.each(platforms)("%s: one item per command, snapshot", (platform) => {
    const items = listResolvedKeyboardShortcutItems(platform);
    expect(items).toHaveLength(keybindingCommands.length);
    expect(items.every((i) => i.platform === platform)).toBe(true);
    expect(
      items.map((i) => ({
        commandId: i.commandId,
        category: i.category,
        scope: i.scope,
        executionHost: i.executionHost,
        source: i.source,
        readonly: i.readonly,
        handlerStatus: i.handlerStatus,
        when: i.when,
        keys: i.bindings.map((b) => b.key)
      }))
    ).toMatchSnapshot();
  });

  it("groups multiple default keys under one command", () => {
    const palette = listResolvedKeyboardShortcutItems("win32").find(
      (i) => i.commandId === "workbench.commandPalette.open"
    );
    expect(palette?.bindings.map((b) => b.key)).toEqual(["Mod-p", "F1"]);
    expect(palette?.key).toBe("Mod-p");
  });

  it("uses an empty bindings array and key=null when a platform has no key", () => {
    const heading = (platform: PergamumPlatform) =>
      listResolvedKeyboardShortcutItems(platform).find(
        (i) => i.commandId === "workbench.commandPalette.heading.open"
      );
    expect(heading("darwin")).toMatchObject({ key: null, bindings: [] });
    expect(heading("win32")?.key).toBe("Mod-#");
    const list = listResolvedKeyboardShortcutItems("linux").find(
      (i) => i.commandId === "editor.markdown.list.ordered"
    );
    expect(list).toMatchObject({ key: null, bindings: [] });
  });

  it("carries readonly / handler metadata for native and standard commands", () => {
    const items = listResolvedKeyboardShortcutItems("darwin");
    expect(items.find((i) => i.commandId === "app.hide")).toMatchObject({
      key: "Mod-h",
      readonly: true,
      readonlyReason: "nativeRole",
      handlerStatus: "nativeRole"
    });
    expect(
      items.find((i) => i.commandId === "editor.line.moveUp")
    ).toMatchObject({
      readonly: true,
      readonlyReason: "standardBehavior",
      handlerStatus: "standard"
    });
  });
});
