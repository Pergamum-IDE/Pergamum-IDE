import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
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

vi.mock("../../src/main/atomicFileWrite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/main/atomicFileWrite")>();
  return { ...actual, writeFileAtomic: vi.fn(actual.writeFileAtomic) };
});

import {
  parseKeybindingEditRequest,
  registerKeybindingsIpc
} from "../../src/main/keybindingsIpc";
import {
  applyKeybindingChange,
  getStartupKeybindings,
  loadKeybindings,
  setStartupKeybindings
} from "../../src/main/keybindingsStore";
import { writeFileAtomic } from "../../src/main/atomicFileWrite";
import { KEYBINDINGS_CHANNELS, type ApplyKeybindingChangeResult } from "../../src/shared/api";
import type { KeybindingEditRequest } from "../../src/shared/keybindings";

const changeBold: KeybindingEditRequest = {
  kind: "change",
  target: { commandId: "editor.markdown.bold", key: "Mod-b", origin: "default" },
  newKey: "Mod-Alt-9"
};

async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = electronMock.handlers.get(channel);
  if (handler === undefined) {
    throw new Error(`no handler for ${channel}`);
  }
  return handler({ sender: { id: 1 } }, ...args);
}

async function fileText(): Promise<string | null> {
  try {
    return await readFile(path.join(electronMock.userData, "keybindings.json"), "utf8");
  } catch {
    return null;
  }
}

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "pergamum-kb-change-"));
  electronMock.userData = path.join(root, "userData");
  electronMock.handlers.clear();
  setStartupKeybindings(null);
  vi.mocked(writeFileAtomic).mockClear();
});

afterEach(async () => {
  setStartupKeybindings(null);
  await rm(root, { recursive: true, force: true });
});

describe("parseKeybindingEditRequest (#647)", () => {
  it("accepts well-formed change / unbind / reset payloads", () => {
    expect(parseKeybindingEditRequest(changeBold)).toEqual(changeBold);
    expect(
      parseKeybindingEditRequest({
        kind: "unbind",
        target: { commandId: "a", key: "F1", origin: "default" }
      })
    ).toEqual({ kind: "unbind", target: { commandId: "a", key: "F1", origin: "default" } });
    expect(
      parseKeybindingEditRequest({
        kind: "reset",
        target: { commandId: "a", key: null, origin: "default", defaultKey: "F1" }
      })
    ).toEqual({
      kind: "reset",
      target: { commandId: "a", key: null, origin: "default", defaultKey: "F1" }
    });
  });

  it("rejects malformed payloads strictly", () => {
    const bad: unknown[] = [
      null,
      "x",
      [],
      {},
      { kind: "delete", target: { commandId: "a", key: "F1", origin: "default" } },
      { kind: "change", target: { commandId: "a", key: "F1", origin: "default" } },
      { kind: "change", target: { commandId: "a", key: "F1", origin: "default" }, newKey: "" },
      { kind: "change", target: { commandId: "a", key: "F1", origin: "default" }, newKey: 5 },
      { kind: "unbind", target: { commandId: "a", key: "F1", origin: "default" }, newKey: "F2" },
      { kind: "unbind", target: { commandId: "", key: "F1", origin: "default" } },
      { kind: "unbind", target: { commandId: 5, key: "F1", origin: "default" } },
      { kind: "unbind", target: { commandId: "a", key: 7, origin: "default" } },
      { kind: "unbind", target: { commandId: "a", key: "F1", origin: "both" } },
      { kind: "reset", target: { commandId: "a", key: null, origin: "default", defaultKey: 3 } },
      { kind: "unbind", target: "a" }
    ];
    for (const request of bad) {
      expect(parseKeybindingEditRequest(request), JSON.stringify(request)).toBeNull();
    }
  });

  it("drops unknown extra fields rather than passing them on", () => {
    const parsed = parseKeybindingEditRequest({
      kind: "unbind",
      extra: "x",
      target: { commandId: "a", key: "F1", origin: "default", path: "C:/secret" }
    });
    expect(parsed).toEqual({
      kind: "unbind",
      target: { commandId: "a", key: "F1", origin: "default" }
    });
  });
});

describe("applyKeybindingChange store (#647)", () => {
  it("writes keybindings.json, re-resolves the effective keybindings and makes them the applied set", async () => {
    const outcome = await applyKeybindingChange(changeBold, "win32");
    expect(outcome.ok).toBe(true);
    expect(JSON.parse((await fileText()) as string)).toEqual([
      { key: "Mod-b", command: "-editor.markdown.bold" },
      { key: "Mod-Alt-9", command: "editor.markdown.bold" }
    ]);
    expect(await fileText()).toMatch(/\n$/);
    if (outcome.ok) {
      const bold = outcome.loaded.effective.keybindings.filter(
        (row) => row.command === "editor.markdown.bold" && row.key !== null
      );
      expect(bold.map((row) => row.key)).toEqual(["Mod-Alt-9"]);
      expect(getStartupKeybindings()).toBe(outcome.loaded);
    }
  });

  it("successive edits build on the saved file (change, then reset the user row)", async () => {
    await applyKeybindingChange(changeBold, "win32");
    const outcome = await applyKeybindingChange(
      {
        kind: "reset",
        target: { commandId: "editor.markdown.bold", key: "Mod-Alt-9", origin: "user" }
      },
      "win32"
    );
    expect(outcome.ok).toBe(true);
    expect(JSON.parse((await fileText()) as string)).toEqual([
      { key: "Mod-b", command: "-editor.markdown.bold" }
    ]);
  });

  it("a conflict is refused with the conflicting command and nothing is written", async () => {
    const outcome = await applyKeybindingChange(
      { ...changeBold, newKey: "Mod-i" },
      "win32"
    );
    expect(outcome).toMatchObject({
      ok: false,
      reason: "conflict",
      conflict: { commandId: "editor.markdown.italic", title: "Italic" }
    });
    expect(await fileText()).toBeNull();
    expect(getStartupKeybindings()).toBeNull();
  });

  it("a reserved key is refused and nothing is written", async () => {
    const outcome = await applyKeybindingChange({ ...changeBold, newKey: "F5" }, "win32");
    expect(outcome).toMatchObject({ ok: false, reason: "reserved" });
    expect(await fileText()).toBeNull();
  });

  it("a malformed keybindings.json is never overwritten", async () => {
    await mkdir(electronMock.userData, { recursive: true });
    const broken = "[ this is not json";
    await writeFile(path.join(electronMock.userData, "keybindings.json"), broken);
    const outcome = await applyKeybindingChange(changeBold, "win32");
    expect(outcome).toMatchObject({ ok: false, reason: "fileInvalid" });
    expect(await fileText()).toBe(broken);
    expect(vi.mocked(writeFileAtomic)).not.toHaveBeenCalled();
  });

  it("a non-array root is not overwritten either", async () => {
    await mkdir(electronMock.userData, { recursive: true });
    await writeFile(path.join(electronMock.userData, "keybindings.json"), '{"a":1}');
    const outcome = await applyKeybindingChange(changeBold, "win32");
    expect(outcome).toMatchObject({ ok: false, reason: "fileInvalid" });
    expect(await fileText()).toBe('{"a":1}');
  });

  it("a failed write leaves the existing file intact, keeps the applied set, and reports saveFailed", async () => {
    await mkdir(electronMock.userData, { recursive: true });
    const original = "[]\n";
    await writeFile(path.join(electronMock.userData, "keybindings.json"), original);
    const before = await loadKeybindings("win32");
    setStartupKeybindings(before);
    vi.mocked(writeFileAtomic).mockRejectedValueOnce(new Error("disk full"));

    const outcome = await applyKeybindingChange(changeBold, "win32");
    expect(outcome).toMatchObject({ ok: false, reason: "saveFailed" });
    expect(await fileText()).toBe(original);
    expect(getStartupKeybindings()).toBe(before);
    // The diagnostic never leaks the OS message or a path.
    expect(JSON.stringify(outcome)).not.toContain("disk full");
    expect(JSON.stringify(outcome)).not.toContain(root);
  });

  it("a stale target is refused (the row is no longer there)", async () => {
    const outcome = await applyKeybindingChange(
      {
        kind: "unbind",
        target: { commandId: "editor.markdown.bold", key: "Mod-Alt-q", origin: "default" }
      },
      "win32"
    );
    expect(outcome).toMatchObject({ ok: false, reason: "stale" });
    expect(await fileText()).toBeNull();
  });

  it("read-only commands cannot be edited", async () => {
    const outcome = await applyKeybindingChange(
      {
        kind: "unbind",
        target: { commandId: "editor.selection.copy", key: "Mod-c", origin: "default" }
      },
      "win32"
    );
    expect(outcome).toMatchObject({ ok: false, reason: "readonly" });
  });

  it("does not leave temp files behind", async () => {
    await applyKeybindingChange(changeBold, "win32");
    expect(await readdir(electronMock.userData)).toEqual(["keybindings.json"]);
  });
});

describe("applyKeybindingChange IPC (#647)", () => {
  it("validates the payload and rejects a malformed one without touching the file", async () => {
    registerKeybindingsIpc("win32");
    const result = (await invoke(KEYBINDINGS_CHANNELS.applyKeybindingChange, {
      kind: "nope"
    })) as ApplyKeybindingChangeResult;
    expect(result.ok).toBe(false);
    expect(result.failure?.reason).toBe("invalid");
    expect(await fileText()).toBeNull();
  });

  it("on success returns the refreshed items, the effective keybindings and diagnostics, with no path", async () => {
    registerKeybindingsIpc("win32");
    const result = (await invoke(
      KEYBINDINGS_CHANNELS.applyKeybindingChange,
      changeBold
    )) as ApplyKeybindingChangeResult;
    expect(result.ok).toBe(true);
    expect(result.platform).toBe("win32");
    expect(result.diagnostics).toEqual([]);
    const bold = result.items?.filter((item) => item.commandId === "editor.markdown.bold");
    expect(bold?.map((item) => [item.keyLabel, item.origin, item.defaultKeyLabel])).toEqual([
      [null, "default", "Ctrl+B"],
      ["Ctrl+Alt+9", "user", null]
    ]);
    expect(result.keybindings?.length).toBeGreaterThan(50);
    expect(() => structuredClone(result)).not.toThrow();
    expect(JSON.stringify(result)).not.toContain(root);
  });

  it("refreshes the menu after a successful save, with the new effective keybindings", async () => {
    const onKeybindingsApplied = vi.fn();
    registerKeybindingsIpc("win32", { onKeybindingsApplied });
    await invoke(KEYBINDINGS_CHANNELS.applyKeybindingChange, changeBold);
    expect(onKeybindingsApplied).toHaveBeenCalledOnce();
    const loaded = onKeybindingsApplied.mock.calls[0]?.[0] as Awaited<
      ReturnType<typeof loadKeybindings>
    >;
    expect(
      loaded.effective.keybindings.some(
        (row) => row.command === "editor.markdown.bold" && row.key === "Mod-Alt-9"
      )
    ).toBe(true);
  });

  it("does not refresh the menu when the change was refused", async () => {
    const onKeybindingsApplied = vi.fn();
    registerKeybindingsIpc("win32", { onKeybindingsApplied });
    const result = (await invoke(KEYBINDINGS_CHANNELS.applyKeybindingChange, {
      ...changeBold,
      newKey: "Mod-i"
    })) as ApplyKeybindingChangeResult;
    expect(result.ok).toBe(false);
    expect(result.failure?.reason).toBe("conflict");
    expect(result.failure?.conflict?.commandId).toBe("editor.markdown.italic");
    expect(result.items).toBeUndefined();
    expect(onKeybindingsApplied).not.toHaveBeenCalled();
  });

  it("a menu rebuild failure does not undo the saved change", async () => {
    registerKeybindingsIpc("win32", {
      onKeybindingsApplied: async () => {
        throw new Error("menu");
      }
    });
    const result = (await invoke(
      KEYBINDINGS_CHANNELS.applyKeybindingChange,
      changeBold
    )) as ApplyKeybindingChangeResult;
    expect(result.ok).toBe(true);
    expect(await fileText()).not.toBeNull();
  });

  it("the Keyboard Shortcuts list afterwards shows the applied change", async () => {
    registerKeybindingsIpc("win32");
    await invoke(KEYBINDINGS_CHANNELS.applyKeybindingChange, changeBold);
    const items = (await invoke(KEYBINDINGS_CHANNELS.getKeyboardShortcutItems)) as {
      items: Array<{ commandId: string; keyLabel: string | null }>;
    };
    expect(
      items.items.filter((item) => item.commandId === "editor.markdown.bold").map((i) => i.keyLabel)
    ).toEqual([null, "Ctrl+Alt+9"]);
  });
});
