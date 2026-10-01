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
  fingerprintKeybindingsSource,
  getStartupKeybindings,
  loadKeybindings,
  reloadKeybindingsFromDisk,
  setStartupKeybindings,
  MISSING_SOURCE_FINGERPRINT
} from "../../src/main/keybindingsStore";
import {
  createKeybindingsWatcher,
  startKeybindingsLiveReload,
  type DirectoryWatcherHandle,
  type WatchDirectory
} from "../../src/main/keybindingsWatcher";
import { KEYBINDINGS_CHANNELS, type GetEffectiveKeybindingsResult } from "../../src/shared/api";

const FILE = "keybindings.json";
let dir: string;

async function write(text: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, FILE), text);
}

async function startup(): Promise<void> {
  setStartupKeybindings(await loadKeybindings("win32", dir));
}

const boldKeys = (loaded: { effective: { keybindings: readonly { command: string; key: string | null }[] } }) =>
  loaded.effective.keybindings
    .filter((row) => row.command === "editor.markdown.bold")
    .map((row) => row.key);

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "pergamum-kb-live-"));
  electronMock.userData = dir;
  electronMock.handlers.clear();
  setStartupKeybindings(null);
});

afterEach(async () => {
  setStartupKeybindings(null);
  vi.useRealTimers();
  await rm(dir, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ */
/* the watcher (fake directory watcher + fake timers)                  */
/* ------------------------------------------------------------------ */

function fakeWatch(): {
  watchDirectory: WatchDirectory;
  emit: (eventType: string, filename: string | null) => void;
  fail: () => void;
  opened: () => number;
  closed: () => number;
  watchedDirectories: string[];
} {
  let listener: ((eventType: string, filename: string | Buffer | null) => void) | null = null;
  let errorListener: ((error: unknown) => void) | null = null;
  let opened = 0;
  let closed = 0;
  const watchedDirectories: string[] = [];
  return {
    watchDirectory: (directory, l) => {
      opened += 1;
      watchedDirectories.push(directory);
      listener = l;
      const handle: DirectoryWatcherHandle = {
        close: () => {
          closed += 1;
        },
        on: (_event, el) => {
          errorListener = el;
        }
      };
      return handle;
    },
    emit: (eventType, filename) => listener?.(eventType, filename),
    fail: () => errorListener?.(new Error("watch failed")),
    opened: () => opened,
    closed: () => closed,
    watchedDirectories
  };
}

describe("createKeybindingsWatcher (#650)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  function make(onChange = vi.fn()) {
    const fake = fakeWatch();
    const watcher = createKeybindingsWatcher({
      directory: "DIR",
      onChange,
      watchDirectory: fake.watchDirectory,
      debounceMs: 300,
      rearmDelayMs: 1000
    });
    watcher.start();
    return { fake, watcher, onChange };
  }

  it("watches the DIRECTORY, not the file", () => {
    const { fake } = make();
    expect(fake.watchedDirectories).toEqual(["DIR"]);
  });

  it.each(["rename", "change"])("a %s event for keybindings.json triggers one reload after the debounce", async (eventType) => {
    const { fake, onChange } = make();
    fake.emit(eventType, FILE);
    expect(onChange).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(299);
    expect(onChange).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("create, delete and atomic replacement are all just events for the file", async () => {
    const { fake, onChange } = make();
    for (const eventType of ["rename", "rename", "change"]) {
      fake.emit(eventType, FILE);
      await vi.advanceTimersByTimeAsync(400);
    }
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("a burst of events collapses to ONE reload (trailing debounce)", async () => {
    const { fake, onChange } = make();
    for (let i = 0; i < 6; i += 1) {
      fake.emit(i % 2 === 0 ? "change" : "rename", FILE);
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(onChange).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("ignores other files and temp files; a missing file name still counts", async () => {
    const { fake, onChange } = make();
    fake.emit("change", "settings.json");
    fake.emit("rename", "keybindings.json.123.tmp");
    await vi.advanceTimersByTimeAsync(500);
    expect(onChange).not.toHaveBeenCalled();
    fake.emit("change", null);
    await vi.advanceTimersByTimeAsync(400);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("stop() closes the watcher, cancels a pending reload and ignores later events", async () => {
    const { fake, watcher, onChange } = make();
    fake.emit("change", FILE);
    watcher.stop();
    expect(fake.closed()).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onChange).not.toHaveBeenCalled();
    fake.emit("change", FILE);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onChange).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("an event during a running reload schedules exactly one more reload", async () => {
    let release: () => void = () => undefined;
    const onChange = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const { fake } = make(onChange);
    fake.emit("change", FILE);
    await vi.advanceTimersByTimeAsync(300);
    expect(onChange).toHaveBeenCalledTimes(1);
    fake.emit("change", FILE);
    await vi.advanceTimersByTimeAsync(300);
    // Still running: not started again in parallel.
    expect(onChange).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(300);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("a failing reload does not stop the watcher", async () => {
    const onChange = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(undefined);
    const { fake } = make(onChange);
    fake.emit("change", FILE);
    await vi.advanceTimersByTimeAsync(400);
    fake.emit("change", FILE);
    await vi.advanceTimersByTimeAsync(400);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("a watcher error re-arms ONCE later and then reloads (the file may have changed meanwhile)", async () => {
    const { fake, onChange } = make();
    fake.fail();
    expect(fake.closed()).toBe(1);
    expect(fake.opened()).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fake.opened()).toBe(2);
    await vi.advanceTimersByTimeAsync(400);
    expect(onChange).toHaveBeenCalledTimes(1);
    fake.fail();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fake.opened()).toBe(2);
  });

  it("when the directory cannot be watched at start, it tries once more later", async () => {
    let attempts = 0;
    const fake = fakeWatch();
    const watcher = createKeybindingsWatcher({
      directory: "DIR",
      onChange: vi.fn(),
      watchDirectory: (directory, listener) => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("ENOENT");
        }
        return fake.watchDirectory(directory, listener);
      },
      rearmDelayMs: 1000
    });
    watcher.start();
    expect(fake.opened()).toBe(0);
    await vi.advanceTimersByTimeAsync(1001);
    expect(fake.opened()).toBe(1);
    watcher.stop();
  });
});

/* ------------------------------------------------------------------ */
/* reloadKeybindingsFromDisk (real temp directory)                     */
/* ------------------------------------------------------------------ */

describe("reloadKeybindingsFromDisk (#650)", () => {
  const reload = () => reloadKeybindingsFromDisk("win32", { directory: dir });

  it("startup load initialises the fingerprint (missing file / existing file)", async () => {
    await startup();
    expect(getStartupKeybindings()?.sourceFingerprint).toBe(MISSING_SOURCE_FINGERPRINT);
    const text = '[{"key":"Mod-Alt-9","command":"editor.markdown.bold"}]\n';
    await write(text);
    await startup();
    expect(getStartupKeybindings()?.sourceFingerprint).toBe(fingerprintKeybindingsSource(text));
  });

  it("a valid external edit is applied and becomes the current state with its fingerprint", async () => {
    await startup();
    const text = '[{"key":"Mod-Alt-9","command":"editor.markdown.bold"}]\n';
    await write(text);
    const outcome = await reload();
    expect(outcome.kind).toBe("applied");
    expect(boldKeys(getStartupKeybindings()!)).toContain("Mod-Alt-9");
    expect(getStartupKeybindings()!.sourceFingerprint).toBe(fingerprintKeybindingsSource(text));
    expect(getStartupKeybindings()!.userEntries).toEqual([
      { key: "Mod-Alt-9", command: "editor.markdown.bold" }
    ]);
  });

  it("the same content again is a no-op", async () => {
    await startup();
    await write('[{"key":"Mod-Alt-9","command":"editor.markdown.bold"}]');
    expect((await reload()).kind).toBe("applied");
    const before = getStartupKeybindings();
    expect((await reload()).kind).toBe("unchanged");
    expect(getStartupKeybindings()).toBe(before);
  });

  it("a formatting-only edit changes the fingerprint but is not re-applied", async () => {
    await write('[{"key":"Mod-Alt-9","command":"editor.markdown.bold"}]');
    await startup();
    await write('[\n  { "key": "Mod-Alt-9", "command": "editor.markdown.bold" }\n]\n');
    const outcome = await reload();
    expect(outcome.kind).toBe("unchanged");
    expect(getStartupKeybindings()!.sourceFingerprint).toBe(
      fingerprintKeybindingsSource('[\n  { "key": "Mod-Alt-9", "command": "editor.markdown.bold" }\n]\n')
    );
  });

  it("malformed JSON keeps the applied keybindings, updates only the diagnostics and the fingerprint", async () => {
    await write('[{"key":"Mod-Alt-9","command":"editor.markdown.bold"}]');
    await startup();
    const applied = getStartupKeybindings()!;
    await write("[ {");
    const outcome = await reload();
    expect(outcome.kind).toBe("diagnosticsOnly");
    const now = getStartupKeybindings()!;
    expect(now.effective).toBe(applied.effective);
    expect(now.userEntries).toBe(applied.userEntries);
    expect(boldKeys(now)).toContain("Mod-Alt-9");
    expect(now.diagnostics.map((d) => d.code)).toEqual(["jsonParseError"]);
    expect(now.sourceFingerprint).toBe(fingerprintKeybindingsSource("[ {"));
  });

  it("the same malformed content again is a no-op (no repeated diagnostics)", async () => {
    await startup();
    await write("[ {");
    expect((await reload()).kind).toBe("diagnosticsOnly");
    expect((await reload()).kind).toBe("unchanged");
    expect((await reload()).kind).toBe("unchanged");
  });

  it("a non-array root is handled like malformed JSON", async () => {
    await startup();
    await write('{"a":1}');
    const outcome = await reload();
    expect(outcome.kind).toBe("diagnosticsOnly");
    expect(getStartupKeybindings()!.diagnostics.map((d) => d.code)).toEqual(["rootMustBeArray"]);
  });

  it("malformed -> valid recovers and applies", async () => {
    await startup();
    await write("[ {");
    await reload();
    await write('[{"key":"Mod-Alt-9","command":"editor.markdown.bold"}]');
    const outcome = await reload();
    expect(outcome.kind).toBe("applied");
    expect(boldKeys(getStartupKeybindings()!)).toContain("Mod-Alt-9");
    expect(getStartupKeybindings()!.diagnostics).toEqual([]);
  });

  it("starting from a malformed file: defaults + diagnostics stay, repeated events are no-ops", async () => {
    await write("[ {");
    await startup();
    expect(getStartupKeybindings()!.diagnostics.map((d) => d.code)).toEqual(["jsonParseError"]);
    expect(boldKeys(getStartupKeybindings()!)).toEqual(["Mod-b"]);
    expect((await reload()).kind).toBe("unchanged");
  });

  it("with no applied state yet, a malformed file applies the defaults with the diagnostics", async () => {
    await write("[ {");
    const outcome = await reload();
    expect(outcome.kind).toBe("applied");
    expect(boldKeys(getStartupKeybindings()!)).toEqual(["Mod-b"]);
  });

  it("deleting the file returns to the defaults without an error; recreating applies again", async () => {
    await write('[{"key":"Mod-Alt-9","command":"editor.markdown.bold"}]');
    await startup();
    await rm(path.join(dir, FILE));
    const deleted = await reload();
    expect(deleted.kind).toBe("applied");
    const now = getStartupKeybindings()!;
    expect(boldKeys(now)).toEqual(["Mod-b"]);
    expect(now.userEntries).toEqual([]);
    expect(now.diagnostics).toEqual([]);
    expect(now.sourceFingerprint).toBe(MISSING_SOURCE_FINGERPRINT);
    expect((await reload()).kind).toBe("unchanged");
    await write('[{"key":"Mod-Alt-8","command":"editor.markdown.bold"}]');
    expect((await reload()).kind).toBe("applied");
    expect(boldKeys(getStartupKeybindings()!)).toContain("Mod-Alt-8");
  });

  it("validation errors follow the existing resolver: bad entries dropped, good ones applied", async () => {
    await startup();
    await write(
      JSON.stringify([
        { key: "Mod-Alt-9", command: "editor.markdown.bold" },
        { key: "Mod-Alt-8", command: "no.such.command" }
      ])
    );
    const outcome = await reload();
    expect(outcome.kind).toBe("applied");
    const now = getStartupKeybindings()!;
    expect(boldKeys(now)).toContain("Mod-Alt-9");
    expect(now.diagnostics.map((d) => d.code)).toContain("unknownCommand");
  });

  it("an unreadable file is retried once, then reported as diagnostics only", async () => {
    await startup();
    await mkdir(path.join(dir, FILE)); // a directory: readFile fails (not ENOENT)
    const delay = vi.fn().mockResolvedValue(undefined);
    const outcome = await reloadKeybindingsFromDisk("win32", {
      directory: dir,
      readRetryDelayMs: 100,
      delay
    });
    expect(delay).toHaveBeenCalledTimes(1);
    expect(delay).toHaveBeenCalledWith(100);
    expect(outcome.kind).toBe("diagnosticsOnly");
    expect(getStartupKeybindings()!.diagnostics.map((d) => d.code)).toEqual(["fileReadError"]);
    expect(boldKeys(getStartupKeybindings()!)).toEqual(["Mod-b"]);
  });

  it("a Keyboard Shortcuts save updates the same fingerprint, so its own file event is a no-op", async () => {
    await startup();
    const result = await applyKeybindingChange(
      {
        kind: "add",
        target: { commandId: "editor.markdown.bold" },
        newKey: "Mod-Alt-9"
      },
      "win32",
      dir
    );
    expect(result.ok).toBe(true);
    const text = await readFile(path.join(dir, FILE), "utf8");
    expect(getStartupKeybindings()!.sourceFingerprint).toBe(fingerprintKeybindingsSource(text));
    const before = getStartupKeybindings();
    expect((await reload()).kind).toBe("unchanged");
    expect(getStartupKeybindings()).toBe(before);
  });

  it("a save and a reload are serialised: a concurrent reload sees the saved state and does nothing", async () => {
    await startup();
    const [saved, reloaded] = await Promise.all([
      applyKeybindingChange(
        { kind: "add", target: { commandId: "editor.markdown.bold" }, newKey: "Mod-Alt-9" },
        "win32",
        dir
      ),
      reload()
    ]);
    expect(saved.ok).toBe(true);
    expect(reloaded.kind).toBe("unchanged");
    expect(boldKeys(getStartupKeybindings()!)).toEqual(["Mod-b", "Mod-Alt-9"]);
  });

  it("a malformed file after our own save is not overwritten by the next save", async () => {
    await startup();
    await write("[ {");
    await reload();
    const result = await applyKeybindingChange(
      { kind: "add", target: { commandId: "editor.markdown.bold" }, newKey: "Mod-Alt-9" },
      "win32",
      dir
    );
    expect(result).toMatchObject({ ok: false, reason: "fileInvalid" });
    expect(await readFile(path.join(dir, FILE), "utf8")).toBe("[ {");
  });
});

/* ------------------------------------------------------------------ */
/* live reload: watcher + reload + runtime apply + notification        */
/* ------------------------------------------------------------------ */

describe("startKeybindingsLiveReload (#650)", () => {
  function start(extra: Partial<Parameters<typeof startKeybindingsLiveReload>[0]> = {}) {
    const fake = fakeWatch();
    const applyToRuntime = vi.fn();
    const notify = vi.fn();
    const live = startKeybindingsLiveReload({
      platform: "win32",
      directory: dir,
      applyToRuntime,
      notify,
      watchDirectory: fake.watchDirectory,
      debounceMs: 10,
      readRetryDelayMs: 1,
      ...extra
    });
    return { fake, applyToRuntime, notify, live };
  }

  it("an external valid edit is applied once and the renderer is notified without path or content", async () => {
    await startup();
    const { fake, applyToRuntime, notify, live } = start();
    await write('[{"key":"Mod-Alt-9","command":"editor.markdown.bold"}]');
    fake.emit("rename", FILE);
    fake.emit("change", FILE);
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(applyToRuntime).toHaveBeenCalledTimes(1);
    expect(boldKeys(applyToRuntime.mock.calls[0]![0])).toContain("Mod-Alt-9");
    const payload = notify.mock.calls[0]![0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["diagnosticsCount", "version"]);
    expect(payload).toEqual({ version: 1, diagnosticsCount: 0 });
    expect(JSON.stringify(payload)).not.toContain(dir);
    live.stop();
  });

  it("our own save followed by its watcher event applies and notifies nothing", async () => {
    await startup();
    const { fake, applyToRuntime, notify, live } = start();
    await applyKeybindingChange(
      { kind: "add", target: { commandId: "editor.markdown.bold" }, newKey: "Mod-Alt-9" },
      "win32",
      dir
    );
    fake.emit("rename", FILE);
    fake.emit("change", FILE);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(applyToRuntime).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    live.stop();
  });

  it("malformed JSON notifies the diagnostics but does not touch the runtime; the same content is silent", async () => {
    await write('[{"key":"Mod-Alt-9","command":"editor.markdown.bold"}]');
    await startup();
    const { fake, applyToRuntime, notify, live } = start();
    await write("[ {");
    fake.emit("change", FILE);
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(notify).toHaveBeenLastCalledWith({ version: 1, diagnosticsCount: 1 });
    expect(applyToRuntime).not.toHaveBeenCalled();
    fake.emit("change", FILE);
    fake.emit("change", FILE);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(notify).toHaveBeenCalledTimes(1);
    live.stop();
  });

  it("malformed -> valid applies and bumps the version", async () => {
    await startup();
    const { fake, applyToRuntime, notify, live } = start();
    await write("[ {");
    fake.emit("change", FILE);
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    await write('[{"key":"Mod-Alt-9","command":"editor.markdown.bold"}]');
    fake.emit("change", FILE);
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(2));
    expect(applyToRuntime).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenLastCalledWith({ version: 2, diagnosticsCount: 0 });
    live.stop();
  });

  it("deleting the file applies the defaults", async () => {
    await write('[{"key":"Mod-Alt-9","command":"editor.markdown.bold"}]');
    await startup();
    const { fake, applyToRuntime, notify, live } = start();
    await rm(path.join(dir, FILE));
    fake.emit("rename", FILE);
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(boldKeys(applyToRuntime.mock.calls[0]![0])).toEqual(["Mod-b"]);
    live.stop();
  });

  it("a runtime-apply failure does not lose the notification or stop the watcher", async () => {
    await startup();
    const applyToRuntime = vi.fn().mockRejectedValue(new Error("menu"));
    const { fake, notify, live } = start({ applyToRuntime });
    await write('[{"key":"Mod-Alt-9","command":"editor.markdown.bold"}]');
    fake.emit("change", FILE);
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    await write('[{"key":"Mod-Alt-8","command":"editor.markdown.bold"}]');
    fake.emit("change", FILE);
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(2));
    live.stop();
  });

  it("after stop() nothing reacts any more", async () => {
    await startup();
    const { fake, applyToRuntime, notify, live } = start();
    live.stop();
    await write('[{"key":"Mod-Alt-9","command":"editor.markdown.bold"}]');
    fake.emit("change", FILE);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(applyToRuntime).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("works with the real fs.watch on a temp directory (create, change, delete)", async () => {
    await startup();
    const applyToRuntime = vi.fn();
    const notify = vi.fn();
    const live = startKeybindingsLiveReload({
      platform: "win32",
      directory: dir,
      applyToRuntime,
      notify,
      debounceMs: 30
    });
    try {
      await write('[{"key":"Mod-Alt-9","command":"editor.markdown.bold"}]');
      await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1), { timeout: 5000, interval: 25 });
      await write('[{"key":"Mod-Alt-8","command":"editor.markdown.bold"}]');
      await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(2), { timeout: 5000, interval: 25 });
      await rm(path.join(dir, FILE));
      await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(3), { timeout: 5000, interval: 25 });
      expect(boldKeys(getStartupKeybindings()!)).toEqual(["Mod-b"]);
    } finally {
      live.stop();
    }
  });
});

/* ------------------------------------------------------------------ */
/* getEffectiveKeybindings returns the APPLIED state                    */
/* ------------------------------------------------------------------ */

describe("getEffectiveKeybindings after #650", () => {
  it("returns what is applied, not a fresh (possibly half-edited) read of the file", async () => {
    await write('[{"key":"Mod-Alt-9","command":"editor.markdown.bold"}]');
    await startup();
    await write("[ {");
    registerKeybindingsIpc("win32");
    const handler = electronMock.handlers.get(KEYBINDINGS_CHANNELS.getEffectiveKeybindings)!;
    const result = (await handler({})) as GetEffectiveKeybindingsResult;
    expect(
      result.keybindings.filter((r) => r.command === "editor.markdown.bold").map((r) => r.key)
    ).toContain("Mod-Alt-9");
    expect(result.diagnostics).toEqual([]);
  });
});
