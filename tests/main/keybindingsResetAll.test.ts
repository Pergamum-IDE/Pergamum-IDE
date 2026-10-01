import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
  },
  shell: { openPath: vi.fn() }
}));

import { registerKeybindingsIpc } from "../../src/main/keybindingsIpc";
import {
  applyKeybindingChange,
  getStartupKeybindings,
  loadKeybindings,
  reloadKeybindingsFromDisk,
  resetAllUserKeybindings,
  setStartupKeybindings
} from "../../src/main/keybindingsStore";
import {
  KEYBINDINGS_CHANNELS,
  type ApplyKeybindingChangeResult,
  type GetKeyboardShortcutItemsResult
} from "../../src/shared/api";
import {
  hasResettableKeybindingChanges,
  resolveDefaultKeybindings
} from "../../src/shared/keybindings";

const FILE = "keybindings.json";
let dir: string;

async function write(text: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, FILE), text);
}

async function startup(): Promise<void> {
  setStartupKeybindings(await loadKeybindings("win32", dir));
}

const onApplied = vi.fn();

function call<T>(channel: string): Promise<T> {
  return Promise.resolve(electronMock.handlers.get(channel)!({}) as T);
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "pergamum-kb-reset-"));
  electronMock.userData = dir;
  electronMock.handlers.clear();
  onApplied.mockReset();
  setStartupKeybindings(null);
  registerKeybindingsIpc("win32", { onKeybindingsApplied: onApplied });
});

afterEach(async () => {
  setStartupKeybindings(null);
  await rm(dir, { recursive: true, force: true });
});

const CUSTOM = JSON.stringify([
  { key: "Mod-Alt-9", command: "editor.markdown.bold" },
  { key: "Mod-b", command: "-editor.markdown.bold" }
]);

describe("hasResettableKeybindingChanges (#652)", () => {
  it("is true for user entries or for any diagnostic, false otherwise", () => {
    expect(hasResettableKeybindingChanges([], [])).toBe(false);
    expect(
      hasResettableKeybindingChanges([{ key: "Mod-k", command: "editor.markdown.link" }], [])
    ).toBe(true);
    expect(
      hasResettableKeybindingChanges([], [{ code: "jsonParseError", severity: "error", message: "x" }])
    ).toBe(true);
  });
});

describe("resetAllUserKeybindings (#652)", () => {
  it("writes [] (pretty JSON + newline), keeps the file, and restores the defaults", async () => {
    await write(CUSTOM);
    await startup();
    const outcome = await resetAllUserKeybindings("win32", dir);
    expect(outcome.ok).toBe(true);
    expect(await readFile(path.join(dir, FILE), "utf8")).toBe("[]\n");
    const loaded = getStartupKeybindings()!;
    expect(loaded.userEntries).toEqual([]);
    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.effective.keybindings).toEqual(resolveDefaultKeybindings("win32"));
  });

  it("recovers a malformed file that single edits refuse to touch", async () => {
    await write(CUSTOM);
    await startup();
    const before = getStartupKeybindings()!;
    await write("[ {not json");
    await reloadKeybindingsFromDisk("win32", { directory: dir });
    // The applied (previous valid) state is kept and only diagnostics change.
    expect(getStartupKeybindings()!.effective).toBe(before.effective);

    const edit = await applyKeybindingChange(
      {
        kind: "unbind",
        target: { commandId: "editor.markdown.bold", key: "Mod-Alt-9", origin: "user" }
      },
      "win32",
      dir
    );
    expect(edit).toMatchObject({ ok: false, reason: "fileInvalid" });
    expect(await readFile(path.join(dir, FILE), "utf8")).toBe("[ {not json");

    const outcome = await resetAllUserKeybindings("win32", dir);
    expect(outcome.ok).toBe(true);
    expect(await readFile(path.join(dir, FILE), "utf8")).toBe("[]\n");
    const loaded = getStartupKeybindings()!;
    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.effective.keybindings).toEqual(resolveDefaultKeybindings("win32"));
  });

  it("is a valid recovery when nothing was applied yet (broken file at startup)", async () => {
    await write('{"not": "an array"}');
    await startup();
    expect(getStartupKeybindings()!.userEntries).toEqual([]);
    expect(getStartupKeybindings()!.diagnostics.length).toBeGreaterThan(0);
    const outcome = await resetAllUserKeybindings("win32", dir);
    expect(outcome.ok).toBe(true);
    expect(getStartupKeybindings()!.diagnostics).toEqual([]);
  });

  it("the watcher event of its own save is a no-op (same fingerprint)", async () => {
    await write(CUSTOM);
    await startup();
    await resetAllUserKeybindings("win32", dir);
    const reloaded = await reloadKeybindingsFromDisk("win32", { directory: dir });
    expect(reloaded).toEqual({ kind: "unchanged" });
  });
});

describe("reset IPC (#652)", () => {
  it("returns the refreshed list, applies to the menu once, and clears `resettable`", async () => {
    await write(CUSTOM);
    await startup();
    const before = await call<GetKeyboardShortcutItemsResult>(
      KEYBINDINGS_CHANNELS.getKeyboardShortcutItems
    );
    expect(before.resettable).toBe(true);

    const result = await call<ApplyKeybindingChangeResult>(
      KEYBINDINGS_CHANNELS.resetAllKeybindings
    );
    expect(result.ok).toBe(true);
    expect(result.resettable).toBe(false);
    expect(result.diagnostics).toEqual([]);
    expect(result.keybindings).toEqual(resolveDefaultKeybindings("win32"));
    expect(result.items!.every((item) => item.origin !== "user")).toBe(true);
    expect(onApplied).toHaveBeenCalledTimes(1);

    const after = await call<GetKeyboardShortcutItemsResult>(
      KEYBINDINGS_CHANNELS.getKeyboardShortcutItems
    );
    expect(after.resettable).toBe(false);
  });

  it("reports `resettable` for a malformed file", async () => {
    await write("[ {not json");
    await startup();
    const items = await call<GetKeyboardShortcutItemsResult>(
      KEYBINDINGS_CHANNELS.getKeyboardShortcutItems
    );
    expect(items.resettable).toBe(true);
  });

  it("a failed save changes nothing: file, applied state and menu stay", async () => {
    await write(CUSTOM);
    await startup();
    const applied = getStartupKeybindings()!;
    // The directory is made unwritable for this one call (its parent is a file).
    electronMock.userData = path.join(dir, FILE, "sub");

    const result = await call<ApplyKeybindingChangeResult>(
      KEYBINDINGS_CHANNELS.resetAllKeybindings
    );
    expect(result.ok).toBe(false);
    expect(result.failure?.reason).toBe("saveFailed");
    expect(result.diagnostics[0]?.code).toBe("fileWriteError");
    expect(getStartupKeybindings()).toBe(applied);
    expect(onApplied).not.toHaveBeenCalled();
    expect(await readFile(path.join(dir, FILE), "utf8")).toBe(CUSTOM);
  });
});
