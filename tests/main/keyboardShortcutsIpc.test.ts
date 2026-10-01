import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => ({
  userData: "",
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
}));

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => electronMock.userData) },
  ipcMain: {
    handle: vi.fn(
      (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
        electronMock.handlers.set(channel, handler);
      }
    )
  }
}));

import { registerKeybindingsIpc } from "../../src/main/keybindingsIpc";
import { loadKeybindings, setStartupKeybindings } from "../../src/main/keybindingsStore";
import { KEYBINDINGS_CHANNELS } from "../../src/shared/api";
import type { KeyboardShortcutRow } from "../../src/shared/keybindings";

interface ItemsResult {
  platform: string;
  items: KeyboardShortcutRow[];
  diagnostics: Array<{ code: string }>;
}

async function invoke<T>(channel: string): Promise<T> {
  const handler = electronMock.handlers.get(channel);
  if (handler === undefined) {
    throw new Error(`no handler for ${channel}`);
  }
  return (await handler({})) as T;
}

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "pergamum-kb-ui-"));
  electronMock.userData = path.join(root, "userData");
  electronMock.handlers.clear();
  setStartupKeybindings(null);
});

afterEach(async () => {
  setStartupKeybindings(null);
  await rm(root, { recursive: true, force: true });
});

describe("getKeyboardShortcutItems (#646)", () => {
  it("returns the platform, label-formatted rows and no diagnostics with no keybindings.json", async () => {
    registerKeybindingsIpc("win32");
    const result = await invoke<ItemsResult>(KEYBINDINGS_CHANNELS.getKeyboardShortcutItems);
    expect(result.platform).toBe("win32");
    expect(result.diagnostics).toEqual([]);
    const save = result.items.find((item) => item.commandId === "editor.document.save");
    expect(save).toMatchObject({ keyLabel: "Ctrl+S", source: "pergamum", readonly: false });
    // native / standard rows and unassigned rows are listed; notYetRegistered is not.
    expect(result.items.some((item) => item.source === "nativeRole" && item.readonly)).toBe(true);
    expect(result.items.some((item) => item.source === "standard" && item.readonly)).toBe(true);
    expect(result.items.some((item) => item.key === null)).toBe(true);
    expect(result.items.some((item) => item.handlerStatus === "notYetRegistered")).toBe(false);
  });

  it("uses Cmd-style labels for darwin", async () => {
    registerKeybindingsIpc("darwin");
    const result = await invoke<ItemsResult>(KEYBINDINGS_CHANNELS.getKeyboardShortcutItems);
    expect(result.platform).toBe("darwin");
    expect(
      result.items.find((item) => item.commandId === "editor.saveAll")?.keyLabel
    ).toBe("Cmd+Option+S");
  });

  it("shows what was APPLIED at startup, not a fresh read of the file", async () => {
    registerKeybindingsIpc("win32");
    // Startup: no keybindings.json.
    setStartupKeybindings(await loadKeybindings("win32"));
    // The user edits the file afterwards.
    await (await import("node:fs/promises")).mkdir(electronMock.userData, { recursive: true });
    await writeFile(
      path.join(electronMock.userData, "keybindings.json"),
      JSON.stringify([{ key: "Mod-Alt-9", command: "editor.markdown.bold" }])
    );
    const result = await invoke<ItemsResult>(KEYBINDINGS_CHANNELS.getKeyboardShortcutItems);
    expect(
      result.items.filter((item) => item.commandId === "editor.markdown.bold").map((i) => i.keyLabel)
    ).toEqual(["Ctrl+B"]);
  });

  it("reflects the startup overlay and its diagnostics", async () => {
    await (await import("node:fs/promises")).mkdir(electronMock.userData, { recursive: true });
    await writeFile(
      path.join(electronMock.userData, "keybindings.json"),
      JSON.stringify([
        { key: "Mod-Alt-9", command: "editor.markdown.bold" },
        { key: "F5", command: "editor.markdown.italic" }
      ])
    );
    registerKeybindingsIpc("win32");
    setStartupKeybindings(await loadKeybindings("win32"));
    const result = await invoke<ItemsResult>(KEYBINDINGS_CHANNELS.getKeyboardShortcutItems);
    expect(
      result.items.filter((item) => item.commandId === "editor.markdown.bold").map((i) => i.keyLabel)
    ).toEqual(["Ctrl+B", "Ctrl+Alt+9"]);
    expect(
      result.items.filter((item) => item.commandId === "editor.markdown.italic").map((i) => i.keyLabel)
    ).toEqual(["Ctrl+I"]);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["reservedForbiddenKey"]);
  });

  it("falls back to a fresh load when no startup snapshot exists, and a malformed file still lists the defaults", async () => {
    await (await import("node:fs/promises")).mkdir(electronMock.userData, { recursive: true });
    await writeFile(path.join(electronMock.userData, "keybindings.json"), "[ nope");
    registerKeybindingsIpc("linux");
    const result = await invoke<ItemsResult>(KEYBINDINGS_CHANNELS.getKeyboardShortcutItems);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["jsonParseError"]);
    expect(result.items.find((i) => i.commandId === "editor.document.save")?.keyLabel).toBe("Ctrl+S");
  });

  it("is serializable and never contains a path or file text", async () => {
    await (await import("node:fs/promises")).mkdir(electronMock.userData, { recursive: true });
    await writeFile(
      path.join(electronMock.userData, "keybindings.json"),
      JSON.stringify([5, { key: "Mod-k", command: "no.such.command", secret: "hunter2" }])
    );
    registerKeybindingsIpc("win32");
    setStartupKeybindings(await loadKeybindings("win32"));
    const result = await invoke<ItemsResult>(KEYBINDINGS_CHANNELS.getKeyboardShortcutItems);
    expect(() => structuredClone(result)).not.toThrow();
    const text = JSON.stringify(result);
    expect(text).not.toContain(root);
    expect(text).not.toContain("hunter2");
  });
});

describe("openKeybindingsJsonLocation (#646)", () => {
  it("creates the directory, opens it, and returns only ok (no path)", async () => {
    const openDirectory = vi.fn(async () => "");
    registerKeybindingsIpc("win32", { openDirectory });
    const result = await invoke<{ ok: boolean }>(KEYBINDINGS_CHANNELS.openKeybindingsJsonLocation);
    expect(result).toEqual({ ok: true });
    expect(openDirectory).toHaveBeenCalledWith(electronMock.userData);
    expect((await stat(electronMock.userData)).isDirectory()).toBe(true);
    expect(JSON.stringify(result)).not.toContain(root);
    // It opens the directory only: nothing is written into it.
    expect(await readdir(electronMock.userData)).toEqual([]);
  });

  it("reports failure when the OS cannot open it, without leaking the OS message or path", async () => {
    registerKeybindingsIpc("win32", {
      openDirectory: async () => `cannot open ${electronMock.userData}`
    });
    const result = await invoke<{ ok: boolean }>(KEYBINDINGS_CHANNELS.openKeybindingsJsonLocation);
    expect(result).toEqual({ ok: false });
  });

  it("reports failure instead of throwing when opening rejects", async () => {
    registerKeybindingsIpc("win32", {
      openDirectory: async () => {
        throw new Error("boom");
      }
    });
    await expect(
      invoke(KEYBINDINGS_CHANNELS.openKeybindingsJsonLocation)
    ).resolves.toEqual({ ok: false });
  });

  it("an existing directory is fine", async () => {
    await (await import("node:fs/promises")).mkdir(electronMock.userData, { recursive: true });
    const openDirectory = vi.fn(async () => "");
    registerKeybindingsIpc("linux", { openDirectory });
    await expect(
      invoke(KEYBINDINGS_CHANNELS.openKeybindingsJsonLocation)
    ).resolves.toEqual({ ok: true });
  });
});

describe("registration (#646)", () => {
  it("registers the keybindings channels (#647 adds apply-change and capture mode, #652 reset-all)", () => {
    registerKeybindingsIpc("win32");
    expect([...electronMock.handlers.keys()].sort()).toEqual(
      [
        "keybindings:getUserKeybindings",
        "keybindings:getEffectiveKeybindings",
        "keybindings:saveUserKeybindings",
        "keybindings:getKeyboardShortcutItems",
        "keybindings:openKeybindingsJsonLocation",
        "keybindings:applyKeybindingChange",
        "keybindings:resetAllKeybindings",
        "keybindings:setCaptureMode"
      ].sort()
    );
  });
});
