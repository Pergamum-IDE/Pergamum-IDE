import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
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

import {
  parseSaveUserKeybindingsRequest,
  registerKeybindingsIpc
} from "../../src/main/keybindingsIpc";
import { KEYBINDINGS_CHANNELS } from "../../src/shared/api";
import { resolveDefaultKeybindings } from "../../src/shared/keybindings";

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = electronMock.handlers.get(channel);
  if (handler === undefined) {
    throw new Error(`no handler for ${channel}`);
  }
  return (await handler({}, ...args)) as T;
}

beforeEach(async () => {
  electronMock.userData = await mkdtemp(path.join(os.tmpdir(), "pergamum-kb-ipc-"));
  electronMock.handlers.clear();
  registerKeybindingsIpc("win32");
});

afterEach(async () => {
  await rm(electronMock.userData, { recursive: true, force: true });
});

describe("keybindings IPC (#645)", () => {
  it("registers exactly the three keybindings channels", () => {
    // (captureInput is main -> renderer: it has no handler.)
    expect([...electronMock.handlers.keys()].sort()).toEqual(
      Object.values(KEYBINDINGS_CHANNELS)
        .filter((channel) => channel !== KEYBINDINGS_CHANNELS.captureInput)
        .sort()
    );
  });

  it("getUserKeybindings: no file = empty entries", async () => {
    await expect(invoke(KEYBINDINGS_CHANNELS.getUserKeybindings)).resolves.toEqual({
      entries: [],
      diagnostics: []
    });
  });

  it("getEffectiveKeybindings: no file = the defaults for the main platform, no diagnostics", async () => {
    const result = await invoke<{
      platform: string;
      keybindings: unknown[];
      diagnostics: unknown[];
    }>(KEYBINDINGS_CHANNELS.getEffectiveKeybindings);
    expect(result.platform).toBe("win32");
    expect(result.diagnostics).toEqual([]);
    expect(result.keybindings).toEqual(resolveDefaultKeybindings("win32"));
  });

  it("returns diagnostics for a malformed file while the defaults stay usable", async () => {
    await writeFile(path.join(electronMock.userData, "keybindings.json"), "[ nope");
    const effective = await invoke<{
      keybindings: unknown[];
      diagnostics: Array<{ code: string }>;
    }>(KEYBINDINGS_CHANNELS.getEffectiveKeybindings);
    expect(effective.diagnostics.map((d) => d.code)).toEqual(["jsonParseError"]);
    expect(effective.keybindings).toEqual(resolveDefaultKeybindings("win32"));
    const user = await invoke<{ entries: unknown[]; diagnostics: Array<{ code: string }> }>(
      KEYBINDINGS_CHANNELS.getUserKeybindings
    );
    expect(user.entries).toEqual([]);
    expect(user.diagnostics.map((d) => d.code)).toEqual(["jsonParseError"]);
  });

  it("save -> get round-trips through keybindings.json and the effective set", async () => {
    const saved = await invoke<{ ok: boolean }>(KEYBINDINGS_CHANNELS.saveUserKeybindings, [
      { key: "Mod-Alt-F", command: "editor.find.replace.open", when: "editorFocus" },
      { key: "F1", command: "-workbench.commandPalette.open" }
    ]);
    expect(saved.ok).toBe(true);

    const user = await invoke<{ entries: unknown[] }>(KEYBINDINGS_CHANNELS.getUserKeybindings);
    expect(user.entries).toEqual([
      { key: "Mod-Alt-f", command: "editor.find.replace.open", when: "editorFocus" },
      { key: "F1", command: "-workbench.commandPalette.open" }
    ]);

    const effective = await invoke<{
      keybindings: Array<{ command: string; key: string | null }>;
    }>(KEYBINDINGS_CHANNELS.getEffectiveKeybindings);
    const keys = (command: string) =>
      effective.keybindings
        .filter((b) => b.command === command && b.key !== null)
        .map((b) => b.key);
    // A positive entry adds; the unbind removed F1.
    expect(keys("editor.find.replace.open")).toEqual(["Mod-h", "Mod-Alt-f"]);
    expect(keys("workbench.commandPalette.open")).toEqual(["Mod-p"]);
  });

  it("an invalid save is rejected with diagnostics and writes nothing", async () => {
    const outcome = await invoke<{
      ok: boolean;
      diagnostics: Array<{ code: string; index?: number }>;
    }>(KEYBINDINGS_CHANNELS.saveUserKeybindings, [
      { key: "F5", command: "editor.markdown.bold" }
    ]);
    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics.map((d) => [d.code, d.index])).toEqual([
      ["reservedForbiddenKey", 0]
    ]);
    expect(await readdir(electronMock.userData)).toEqual([]);
  });

  it("rejects a malformed request shape and writes nothing", async () => {
    for (const request of [
      "not an array",
      [1],
      [{ key: 1, command: "x" }],
      [{ key: "Mod-k", command: "x", when: 5 }],
      null
    ]) {
      const outcome = await invoke<{ ok: boolean }>(
        KEYBINDINGS_CHANNELS.saveUserKeybindings,
        request
      );
      expect(outcome.ok, JSON.stringify(request)).toBe(false);
    }
    expect(await readdir(electronMock.userData)).toEqual([]);
  });

  it("results are plain serializable data and never expose the file path or file text", async () => {
    await writeFile(
      path.join(electronMock.userData, "keybindings.json"),
      JSON.stringify([{ key: "Mod-Alt-9", command: "editor.markdown.bold" }, "secret-item"])
    );
    for (const channel of [
      KEYBINDINGS_CHANNELS.getUserKeybindings,
      KEYBINDINGS_CHANNELS.getEffectiveKeybindings
    ]) {
      const result = await invoke(channel);
      expect(() => structuredClone(result)).not.toThrow();
      const text = JSON.stringify(result);
      expect(text).not.toContain(electronMock.userData);
      expect(text).not.toContain("secret-item");
    }
  });
});

describe("parseSaveUserKeybindingsRequest (#645)", () => {
  it("accepts well-formed entries and drops nothing", () => {
    expect(
      parseSaveUserKeybindingsRequest([
        { key: "Mod-k", command: "editor.markdown.link" },
        { key: "Mod-l", command: "editor.markdown.heading", when: "x" }
      ])
    ).toEqual([
      { key: "Mod-k", command: "editor.markdown.link" },
      { key: "Mod-l", command: "editor.markdown.heading", when: "x" }
    ]);
    expect(parseSaveUserKeybindingsRequest([])).toEqual([]);
  });

  it("rejects non-arrays and malformed items", () => {
    expect(parseSaveUserKeybindingsRequest({})).toBeNull();
    expect(parseSaveUserKeybindingsRequest([null])).toBeNull();
    expect(parseSaveUserKeybindingsRequest([["Mod-k", "x"]])).toBeNull();
    expect(parseSaveUserKeybindingsRequest([{ key: "Mod-k" }])).toBeNull();
  });
});

describe("preload / API surface and #645 scope safety", () => {
  it("preload exposes the three keybindings calls through KEYBINDINGS_CHANNELS only", () => {
    const preload = readFileSync("src/preload/preload.ts", "utf8");
    expect(preload).toContain("KEYBINDINGS_CHANNELS.getUserKeybindings");
    expect(preload).toContain("KEYBINDINGS_CHANNELS.getEffectiveKeybindings");
    expect(preload).toContain("KEYBINDINGS_CHANNELS.saveUserKeybindings");
    expect(preload).not.toMatch(/keybindings[\s\S]{0,200}userData/);
  });

  it("the API type has no path-returning keybindings call", () => {
    const api = readFileSync("src/shared/api.ts", "utf8");
    const start = api.indexOf("keybindings: {");
    const block = api.slice(start, api.indexOf("};", start));
    expect(block).toContain("getUserKeybindings");
    expect(block).toContain("getEffectiveKeybindings");
    expect(block).toContain("saveUserKeybindings");
    expect(block).not.toMatch(/path/i);
  });

  it("introduces no Keyboard Shortcuts UI, file watcher or project-level keybindings", () => {
    const sources = [
      "src/main/keybindingsStore.ts",
      "src/main/keybindingsIpc.ts",
      "src/renderer/keybindings/effectiveKeybindingStore.ts",
      "src/shared/keybindings/user.ts"
    ].map((p) => readFileSync(p, "utf8"));
    for (const source of sources) {
      expect(source).not.toMatch(/fs\.watch|chokidar|watchFile/);
      expect(source).not.toMatch(/KeyboardShortcuts(Dialog|Panel|Tab|Settings)/);
      expect(source).not.toMatch(/projectFilePath|projectKeybindings|projectRoot/);
    }
  });

  it("adds no shortcut-editing / key-capture component to the renderer", () => {
    // (#646 added the view-only Keyboard Shortcuts screen; nothing may edit.)
    const names = readdirSync("src/renderer", { recursive: true }) as string[];
    expect(
      names.filter((name) =>
        /(KeyCapture|KeyRecorder|ShortcutEditor|KeybindingsEditor|KeybindingEditor|KeybindingsJsonEditor)\w*\.tsx?$/.test(name)
      )
    ).toEqual([]);
  });

  it("the file is read at startup only (main.ts loads it once, before the menu)", () => {
    const main = readFileSync("src/main/main.ts", "utf8");
    expect(main.match(/loadKeybindings\(/g)).toHaveLength(1);
    expect(main.indexOf("loadKeybindings(")).toBeLessThan(
      main.indexOf("await installApplicationMenu(")
    );
    expect(main).toContain("applicationMenuOptions(loadedKeybindings.effective.keybindings)");
    expect(main).toContain("registerKeybindingsIpc(process.platform, {");
  });

  it("the renderer loads effective keybindings before the first render", () => {
    const entry = readFileSync("src/renderer/main.tsx", "utf8");
    expect(entry.indexOf("loadEffectiveKeybindingsFromMain()")).toBeLessThan(
      entry.indexOf("createRoot")
    );
  });
});

// Keep the temp-file helper import used (readFile) for the file content check.
describe("keybindings.json file content after an IPC save (#645)", () => {
  it("is pretty JSON with a trailing newline", async () => {
    await invoke(KEYBINDINGS_CHANNELS.saveUserKeybindings, [
      { key: "Mod-Alt-9", command: "editor.markdown.bold" }
    ]);
    const text = await readFile(path.join(electronMock.userData, "keybindings.json"), "utf8");
    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain('  {\n    "key": "Mod-Alt-9"');
  });
});
