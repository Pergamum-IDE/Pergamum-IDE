import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "C:/userData-from-mock") }
}));

import {
  getKeybindingsFilePath,
  keybindingsFileName,
  loadKeybindings,
  readUserKeybindings,
  saveUserKeybindings,
  writeUserKeybindings
} from "../../src/main/keybindingsStore";
import { resolveDefaultKeybindings } from "../../src/shared/keybindings";

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "pergamum-keybindings-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("keybindings.json location (#645)", () => {
  it("is keybindings.json in the Application Settings directory (userData), next to settings.json", () => {
    expect(keybindingsFileName).toBe("keybindings.json");
    expect(getKeybindingsFilePath()).toBe(
      path.join("C:/userData-from-mock", "keybindings.json")
    );
    expect(getKeybindingsFilePath(directory)).toBe(path.join(directory, "keybindings.json"));

    const store = readFileSync("src/main/keybindingsStore.ts", "utf8");
    const settings = readFileSync("src/main/settingsStore.ts", "utf8");
    expect(store).toContain('app.getPath("userData")');
    expect(settings).toContain('app.getPath("userData")');
  });

  it("introduces no project-level keybindings path and no file watcher", () => {
    const store = readFileSync("src/main/keybindingsStore.ts", "utf8");
    expect(store).not.toMatch(/projectFilePath|\.pergamum|projectRoot/);
    expect(store).not.toContain("watch(");
    expect(store).not.toContain("chokidar");
  });
});

describe("readUserKeybindings (#645)", () => {
  it("a missing file is an empty list without diagnostics", async () => {
    await expect(readUserKeybindings(directory)).resolves.toEqual({
      entries: [],
      sourceIndices: [],
      diagnostics: []
    });
  });

  it("a missing directory is also an empty list", async () => {
    await expect(
      readUserKeybindings(path.join(directory, "does", "not", "exist"))
    ).resolves.toMatchObject({ entries: [], diagnostics: [] });
  });

  it("reads valid entries", async () => {
    await writeFile(
      path.join(directory, "keybindings.json"),
      '[{ "key": "Mod-Alt-F", "command": "editor.find.replace.open" }]'
    );
    const parsed = await readUserKeybindings(directory);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.entries).toEqual([
      { key: "Mod-Alt-f", command: "editor.find.replace.open" }
    ]);
  });

  it("a malformed file yields diagnostics and the defaults stay usable", async () => {
    await writeFile(path.join(directory, "keybindings.json"), "[ {not json");
    const loaded = await loadKeybindings("win32", directory);
    expect(loaded.diagnostics.map((d) => d.code)).toEqual(["jsonParseError"]);
    expect(loaded.effective.keybindings).toEqual(resolveDefaultKeybindings("win32"));
  });

  it("an unreadable path (a directory named keybindings.json) yields a read diagnostic", async () => {
    await mkdir(path.join(directory, "keybindings.json"));
    const parsed = await readUserKeybindings(directory);
    expect(parsed.diagnostics.map((d) => d.code)).toEqual(["fileReadError"]);
    // Neither the diagnostic nor anything else exposes the path.
    expect(JSON.stringify(parsed.diagnostics)).not.toContain(directory);
  });
});

describe("loadKeybindings (#645)", () => {
  it("overlays the file on the defaults and numbers diagnostics by file index", async () => {
    await writeFile(
      path.join(directory, "keybindings.json"),
      JSON.stringify([
        7,
        { key: "Mod-Alt-9", command: "editor.markdown.bold" },
        { key: "Mod-i", command: "editor.markdown.bold" }
      ])
    );
    const loaded = await loadKeybindings("linux", directory);
    expect(loaded.diagnostics.map((d) => [d.code, d.index])).toEqual([
      ["entryMustBeObject", 0],
      ["conflictingKey", 2]
    ]);
    expect(
      loaded.effective.keybindings
        .filter((b) => b.command === "editor.markdown.bold")
        .map((b) => b.key)
    ).toEqual(["Mod-Alt-9"]);
  });

  it("no file = exactly the defaults", async () => {
    const loaded = await loadKeybindings("darwin", directory);
    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.effective.keybindings).toEqual(resolveDefaultKeybindings("darwin"));
  });
});

describe("writeUserKeybindings (#645)", () => {
  it("creates a missing parent directory and writes pretty JSON with a trailing newline", async () => {
    const nested = path.join(directory, "a", "b");
    await writeUserKeybindings(
      [{ key: "Mod-Alt-F", command: "editor.find.replace.open" }],
      nested
    );
    const text = await readFile(path.join(nested, "keybindings.json"), "utf8");
    expect(text).toBe(`[
  {
    "key": "Mod-Alt-f",
    "command": "editor.find.replace.open"
  }
]
`);
  });

  it("leaves no temp files behind and replaces an existing file", async () => {
    await writeUserKeybindings([{ key: "F1", command: "-workbench.commandPalette.open" }], directory);
    await writeUserKeybindings([], directory);
    expect(await readFile(path.join(directory, "keybindings.json"), "utf8")).toBe("[]\n");
    expect(await readdir(directory)).toEqual(["keybindings.json"]);
  });

  it("a failed write does not corrupt the existing file (atomic write)", async () => {
    const original = '[\n  {\n    "key": "F1",\n    "command": "-workbench.commandPalette.open"\n  }\n]\n';
    await writeFile(path.join(directory, "keybindings.json"), original);

    // Make the temp write fail: turn the target directory's temp name space
    // read-only is not portable, so write to a path whose parent is a FILE.
    const blocker = path.join(directory, "blocker");
    await writeFile(blocker, "x");
    await expect(
      writeUserKeybindings([{ key: "Mod-k", command: "editor.markdown.link" }], blocker)
    ).rejects.toBeTruthy();

    expect(await readFile(path.join(directory, "keybindings.json"), "utf8")).toBe(original);
  });
});

describe("saveUserKeybindings (#645)", () => {
  it("writes a valid set and returns warnings only", async () => {
    const outcome = await saveUserKeybindings(
      [{ key: "Mod-Alt-9", command: "editor.markdown.bold" }],
      "win32",
      directory
    );
    expect(outcome).toEqual({ ok: true, diagnostics: [] });
    expect(JSON.parse(await readFile(path.join(directory, "keybindings.json"), "utf8"))).toEqual([
      { key: "Mod-Alt-9", command: "editor.markdown.bold" }
    ]);
  });

  it("rejects a save with an error diagnostic and does not touch the file", async () => {
    const original = "[]\n";
    await writeFile(path.join(directory, "keybindings.json"), original);
    const outcome = await saveUserKeybindings(
      [
        { key: "Mod-Alt-9", command: "editor.markdown.bold" },
        { key: "F5", command: "editor.markdown.italic" }
      ],
      "win32",
      directory
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics.map((d) => [d.code, d.index])).toEqual([
      ["reservedForbiddenKey", 1]
    ]);
    expect(await readFile(path.join(directory, "keybindings.json"), "utf8")).toBe(original);
  });

  it("does not create the file when the very first save is invalid", async () => {
    const outcome = await saveUserKeybindings(
      [{ key: "Mod-k", command: "no.such.command" }],
      "win32",
      directory
    );
    expect(outcome.ok).toBe(false);
    expect(await readdir(directory)).toEqual([]);
  });

  it("a warning-only save is written (duplicate of the current binding)", async () => {
    const outcome = await saveUserKeybindings(
      [{ key: "Mod-b", command: "editor.markdown.bold" }],
      "win32",
      directory
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics.map((d) => d.code)).toEqual(["duplicateUserEntry"]);
  });
});
