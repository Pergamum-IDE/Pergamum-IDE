// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getEffectiveKeybindingRows,
  getEffectiveKeybindingsRevision,
  resetEffectiveKeybindings,
  subscribeToKeybindingsChangesFromMain
} from "../../src/renderer/keybindings/effectiveKeybindingStore";
import {
  listKeyboardShortcutRows,
  resolveEffectiveKeybindings
} from "../../src/shared/keybindings";

function install(api: Record<string, unknown>): void {
  (window as unknown as { pergamum: unknown }).pergamum = { keybindings: api };
}

beforeEach(() => resetEffectiveKeybindings());
afterEach(() => {
  delete (window as unknown as { pergamum?: unknown }).pergamum;
  resetEffectiveKeybindings();
});

describe("renderer follows keybindings:changed (#650)", () => {
  it("re-fetches the effective keybindings and replaces the store (bumping the revision)", async () => {
    const { keybindings } = resolveEffectiveKeybindings({
      platform: "win32",
      userEntries: [{ key: "Mod-Alt-9", command: "editor.markdown.bold" }]
    });
    let listener: ((payload: unknown) => void) | null = null;
    const getEffectiveKeybindings = vi
      .fn()
      .mockResolvedValue({ platform: "win32", keybindings, diagnostics: [] });
    install({
      getEffectiveKeybindings,
      onKeybindingsChanged: (l: (payload: unknown) => void) => {
        listener = l;
        return () => {
          listener = null;
        };
      }
    });
    const unsubscribe = subscribeToKeybindingsChangesFromMain();
    const before = getEffectiveKeybindingsRevision();
    listener!({ version: 1, diagnosticsCount: 0 });
    await vi.waitFor(() => expect(getEffectiveKeybindingsRevision()).toBeGreaterThan(before));
    expect(getEffectiveKeybindings).toHaveBeenCalledTimes(1);
    expect(
      getEffectiveKeybindingRows("win32")
        .filter((row) => row.command === "editor.markdown.bold")
        .map((row) => row.key)
    ).toContain("Mod-Alt-9");
    unsubscribe();
    expect(listener).toBeNull();
  });

  it("is a harmless no-op without a bridge, and a failing fetch keeps the current rows", async () => {
    expect(() => subscribeToKeybindingsChangesFromMain()()).not.toThrow();
    let listener: ((payload: unknown) => void) | null = null;
    install({
      getEffectiveKeybindings: vi.fn().mockRejectedValue(new Error("ipc")),
      onKeybindingsChanged: (l: (payload: unknown) => void) => {
        listener = l;
        return () => undefined;
      }
    });
    subscribeToKeybindingsChangesFromMain();
    const before = getEffectiveKeybindingRows("win32");
    listener!({ version: 1, diagnosticsCount: 0 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getEffectiveKeybindingRows("win32")).toBe(before);
  });

  it("the shortcut list helper still works on refreshed rows", () => {
    const { keybindings } = resolveEffectiveKeybindings({ platform: "win32", userEntries: [] });
    expect(listKeyboardShortcutRows(keybindings, "win32").length).toBeGreaterThan(50);
  });
});

describe("#650 wiring (source checks)", () => {
  const main = readFileSync("src/main/main.ts", "utf8");
  const watcher = readFileSync("src/main/keybindingsWatcher.ts", "utf8");
  const store = readFileSync("src/main/keybindingsStore.ts", "utf8");
  const preload = readFileSync("src/preload/preload.ts", "utf8");
  const rendererMain = readFileSync("src/renderer/main.tsx", "utf8");

  it("main starts the watcher after the keybindings IPC and stops it on shutdown", () => {
    expect(main.indexOf("registerKeybindingsIpc(")).toBeGreaterThan(-1);
    expect(main.indexOf("startKeybindingsLiveReload(")).toBeGreaterThan(
      main.indexOf("registerKeybindingsIpc(")
    );
    expect(main).toContain("stopKeybindingsLiveReload?.();");
  });

  it("an external reload reuses the same runtime-apply function as a Keyboard Shortcuts save", () => {
    expect(main).toContain("onKeybindingsApplied: applyKeybindingsToMenu");
    expect(main).toContain("applyToRuntime: applyKeybindingsToMenu");
  });

  it("the renderer is told over one push channel, with no path or content", () => {
    expect(main).toContain("mainWindow.webContents.send(KEYBINDINGS_CHANNELS.changed, payload)");
    expect(preload).toContain("KEYBINDINGS_CHANNELS.changed");
    expect(rendererMain).toContain("subscribeToKeybindingsChangesFromMain()");
  });

  it("the watcher keeps no content fingerprint of its own and never logs", () => {
    expect(watcher).not.toMatch(/fingerprint\s*=|lastFingerprint|lastProcessed/i);
    expect(watcher).not.toMatch(/console\.|debugLogger|logger\./);
    // The single source of truth lives with the applied state.
    expect(store).toContain("readonly sourceFingerprint: string;");
  });

  it("adds no new dependency for watching", () => {
    expect(watcher).toContain('from "node:fs"');
    expect(watcher).not.toMatch(/chokidar/);
    const pkg = readFileSync("package.json", "utf8");
    expect(pkg).not.toMatch(/chokidar/);
  });
});
