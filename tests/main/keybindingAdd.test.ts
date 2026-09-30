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
  }
}));

vi.mock("../../src/main/atomicFileWrite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/main/atomicFileWrite")>();
  return { ...actual, writeFileAtomic: vi.fn(actual.writeFileAtomic) };
});

import { writeFileAtomic } from "../../src/main/atomicFileWrite";
import {
  parseKeybindingEditRequest,
  registerKeybindingsIpc
} from "../../src/main/keybindingsIpc";
import { setStartupKeybindings } from "../../src/main/keybindingsStore";
import { KEYBINDINGS_CHANNELS, type ApplyKeybindingChangeResult } from "../../src/shared/api";

function addRequest(commandId: string, newKey: string): unknown {
  return { kind: "add", target: { commandId }, newKey };
}

async function invoke(request: unknown): Promise<ApplyKeybindingChangeResult> {
  const handler = electronMock.handlers.get(KEYBINDINGS_CHANNELS.applyKeybindingChange);
  return (await handler!({ sender: { id: 1 } }, request)) as ApplyKeybindingChangeResult;
}

async function fileText(): Promise<string | null> {
  try {
    return await readFile(path.join(electronMock.userData, "keybindings.json"), "utf8");
  } catch {
    return null;
  }
}

let root: string;
const onKeybindingsApplied = vi.fn();

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "pergamum-kb-add-"));
  electronMock.userData = path.join(root, "userData");
  electronMock.handlers.clear();
  setStartupKeybindings(null);
  vi.mocked(writeFileAtomic).mockClear();
  onKeybindingsApplied.mockReset();
  registerKeybindingsIpc("win32", { onKeybindingsApplied });
});

afterEach(async () => {
  setStartupKeybindings(null);
  await rm(root, { recursive: true, force: true });
});

describe("parseKeybindingEditRequest: add (#648)", () => {
  it("accepts an add naming only the command", () => {
    expect(parseKeybindingEditRequest(addRequest("editor.markdown.bold", "Mod-Alt-9"))).toEqual({
      kind: "add",
      target: { commandId: "editor.markdown.bold" },
      newKey: "Mod-Alt-9"
    });
  });

  it("rejects malformed adds", () => {
    const bad: unknown[] = [
      { kind: "add", target: { commandId: "a" } },
      { kind: "add", target: { commandId: "a" }, newKey: "" },
      { kind: "add", target: { commandId: "a" }, newKey: 3 },
      { kind: "add", target: { commandId: "" }, newKey: "F2" },
      { kind: "add", target: {}, newKey: "F2" },
      { kind: "add", target: "a", newKey: "F2" },
      { kind: "add", target: { commandId: "a", key: "F1", origin: "default" }, newKey: "F2" },
      { kind: "add", target: { commandId: "a", path: "C:/x" }, newKey: "F2" }
    ];
    for (const request of bad) {
      expect(parseKeybindingEditRequest(request), JSON.stringify(request)).toBeNull();
    }
  });
});

describe("applyKeybindingChange: add (#648)", () => {
  it("appends the positive entry to keybindings.json and returns refreshed rows without any path", async () => {
    const result = await invoke(addRequest("editor.markdown.bold", "Mod-Alt-9"));
    expect(result.ok).toBe(true);
    expect(JSON.parse((await fileText()) as string)).toEqual([
      { key: "Mod-Alt-9", command: "editor.markdown.bold" }
    ]);
    const bold = result.items?.filter((i) => i.commandId === "editor.markdown.bold");
    expect(bold?.map((i) => [i.keyLabel, i.originKind])).toEqual([
      ["Ctrl+B", "default"],
      ["Ctrl+Alt+9", "user"]
    ]);
    expect(result.keybindings?.some((k) => k.command === "editor.markdown.bold" && k.key === "Mod-Alt-9")).toBe(true);
    expect(JSON.stringify(result)).not.toContain(root);
    expect(onKeybindingsApplied).toHaveBeenCalledOnce();
  });

  it("keeps existing entries (unbind + user) when adding", async () => {
    await mkdir(electronMock.userData, { recursive: true });
    const existing = [
      { key: "F1", command: "-workbench.commandPalette.open" },
      { key: "Mod-Alt-8", command: "editor.markdown.italic" }
    ];
    await writeFile(path.join(electronMock.userData, "keybindings.json"), JSON.stringify(existing));
    const result = await invoke(addRequest("workbench.commandPalette.open", "Mod-Alt-p"));
    expect(result.ok).toBe(true);
    expect(JSON.parse((await fileText()) as string)).toEqual([
      ...existing,
      { key: "Mod-Alt-p", command: "workbench.commandPalette.open" }
    ]);
  });

  it.each([
    ["duplicate", "editor.markdown.bold", "Mod-b"],
    ["conflict", "editor.markdown.bold", "Mod-i"],
    ["reserved", "editor.markdown.bold", "F5"],
    ["readonly", "editor.selection.copy", "Mod-Alt-9"],
    ["invalid", "no.such.command", "Mod-Alt-9"]
  ])("a %s add writes nothing and does not refresh the menu", async (reason, command, key) => {
    const result = await invoke(addRequest(command, key));
    expect(result.ok).toBe(false);
    expect(result.failure?.reason).toBe(reason);
    expect(result.items).toBeUndefined();
    expect(await fileText()).toBeNull();
    expect(vi.mocked(writeFileAtomic)).not.toHaveBeenCalled();
    expect(onKeybindingsApplied).not.toHaveBeenCalled();
  });

  it("a conflicting add names the other command", async () => {
    const result = await invoke(addRequest("editor.markdown.bold", "Mod-i"));
    expect(result.failure?.conflict?.commandId).toBe("editor.markdown.italic");
  });

  it("a malformed keybindings.json is not overwritten by an add", async () => {
    await mkdir(electronMock.userData, { recursive: true });
    await writeFile(path.join(electronMock.userData, "keybindings.json"), "[ nope");
    const result = await invoke(addRequest("editor.markdown.bold", "Mod-Alt-9"));
    expect(result.failure?.reason).toBe("fileInvalid");
    expect(await fileText()).toBe("[ nope");
    expect(onKeybindingsApplied).not.toHaveBeenCalled();
  });

  it("a save failure reports saveFailed and leaves the file alone", async () => {
    vi.mocked(writeFileAtomic).mockRejectedValueOnce(new Error("disk full"));
    const result = await invoke(addRequest("editor.markdown.bold", "Mod-Alt-9"));
    expect(result.failure?.reason).toBe("saveFailed");
    expect(await fileText()).toBeNull();
    expect(JSON.stringify(result)).not.toContain("disk full");
  });
});
