// @vitest-environment happy-dom
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => ({ userData: "" }));

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => electronMock.userData) },
  ipcMain: { handle: vi.fn() },
  shell: { openPath: vi.fn() }
}));

import {
  getStartupKeybindings,
  loadKeybindings,
  reloadKeybindingsFromDisk,
  resetAllUserKeybindings,
  setStartupKeybindings,
  type LoadedKeybindings
} from "../../src/main/keybindingsStore";
import {
  NATIVE_MENU_ACCELERATOR_COMMAND_IDS,
  createMenuAcceleratorLookup
} from "../../src/main/menuAccelerators";
import {
  listEditorKeybindingDescriptors
} from "../../src/renderer/keybindings/codeMirrorKeymap";
import {
  getEffectiveKeybindingRows,
  resetEffectiveKeybindings,
  setEffectiveKeybindings
} from "../../src/renderer/keybindings/effectiveKeybindingStore";
import {
  createRendererShortcutBindings,
  rendererShortcutCommandIds
} from "../../src/renderer/keybindings/rendererShortcuts";
import {
  listKeyboardShortcutRows,
  resolveDefaultKeybindings,
  toCodeMirrorKey,
  toElectronAccelerator,
  type PergamumPlatform
} from "../../src/shared/keybindings";

/**
 * #655: the final invariant of the #635 series. For one keybindings.json the
 * keys the Keyboard Shortcuts screen lists are exactly the keys the three
 * registration layers (CodeMirror keymap, menu accelerators, renderer
 * listeners) register: nothing shown is dead, nothing registered is hidden.
 */

const FILE = "keybindings.json";
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "pergamum-kb-layers-"));
  electronMock.userData = dir;
  setStartupKeybindings(null);
  resetEffectiveKeybindings();
});

afterEach(async () => {
  setStartupKeybindings(null);
  resetEffectiveKeybindings();
  await rm(dir, { recursive: true, force: true });
});

async function writeFileText(text: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, FILE), text);
}

/** Main applies the file; the renderer store receives the effective rows. */
function applyToRenderer(loaded: LoadedKeybindings, platform: PergamumPlatform): void {
  setEffectiveKeybindings(platform, [...loaded.effective.keybindings]);
}

const canonical = (platform: PergamumPlatform, key: string): string =>
  toCodeMirrorKey(key, platform);

/** "command key" pairs the screen shows as an active, editable binding. */
function uiPairs(platform: PergamumPlatform, loaded: LoadedKeybindings): Set<string> {
  return new Set(
    listKeyboardShortcutRows(loaded.effective.keybindings, platform)
      .filter((row) => row.editable && row.key !== null && row.source === "pergamum")
      .map((row) => `${row.commandId} ${canonical(platform, row.key as string)}`)
  );
}

/** "command key" pairs registered by the three runtime layers. */
function runtimePairs(platform: PergamumPlatform): Set<string> {
  const pairs = new Set<string>();
  for (const descriptor of listEditorKeybindingDescriptors(platform)) {
    pairs.add(`${descriptor.commandId} ${descriptor.codeMirrorKey}`);
  }
  const rows = getEffectiveKeybindingRows(platform);
  const lookup = createMenuAcceleratorLookup(platform, undefined, null, rows);
  for (const commandId of NATIVE_MENU_ACCELERATOR_COMMAND_IDS) {
    for (const accelerator of lookup.getAll(commandId)) {
      // The menu uses CommandOrControl; compare through the physical key.
      const row = rows.find(
        (candidate) =>
          candidate.command === commandId &&
          candidate.key !== null &&
          toElectronAccelerator(candidate.key, platform, { modStyle: "commandOrControl" }) ===
            accelerator
      );
      expect(row, `${commandId} ${accelerator}`).toBeDefined();
      pairs.add(`${commandId} ${canonical(platform, (row as { key: string }).key)}`);
    }
  }
  for (const binding of createRendererShortcutBindings(platform)) {
    pairs.add(`${binding.commandId} ${canonical(platform, binding.key)}`);
  }
  return pairs;
}

/**
 * Editable Pergamum commands that no layer registers by design (they have no
 * listener of their own): none today, so any UI pair without a layer is a bug.
 */
function assertLayersMatchUi(platform: PergamumPlatform, loaded: LoadedKeybindings): void {
  const ui = uiPairs(platform, loaded);
  const runtime = runtimePairs(platform);
  // Guards against a vacuous pass: the real catalog has dozens of keyed commands.
  expect(ui.size).toBeGreaterThan(40);
  expect(runtime.size).toBe(ui.size);
  expect([...runtime].filter((pair) => !ui.has(pair)), "registered but not shown").toEqual([]);
  expect([...ui].filter((pair) => !runtime.has(pair)), "shown but not registered").toEqual([]);
}

const scenarios: Record<string, string> = {
  defaults: "[]",
  "user-added editor key": JSON.stringify([{ key: "Mod-Alt-9", command: "editor.markdown.bold" }]),
  "override (unbind + add)": JSON.stringify([
    { key: "Mod-b", command: "-editor.markdown.bold" },
    { key: "Mod-Alt-8", command: "editor.markdown.bold" }
  ]),
  "unbind an app alias (F1)": JSON.stringify([
    { key: "F1", command: "-workbench.commandPalette.open" }
  ]),
  "user-added menu + pane keys": JSON.stringify([
    { key: "Mod-Alt-7", command: "editor.document.save" },
    { key: "Mod-Alt-6", command: "workspace.files.toggle" }
  ]),
  "rejected entries change nothing (reserved, unknown, readonly, unknown when)": JSON.stringify([
    { key: "F5", command: "editor.markdown.bold" },
    { key: "Mod-Alt-5", command: "no.such.command" },
    { key: "Mod-Alt-4", command: "editor.selection.copy" },
    { key: "Mod-Alt-3", command: "editor.markdown.bold", when: "foo && bar" },
    { key: "Mod-Shift-r", command: "editor.markdown.bold" }
  ])
};

describe.each(["win32", "darwin"] as const)("UI == runtime layers (#655) on %s", (platform) => {
  it.each(Object.entries(scenarios))("%s", async (_name, text) => {
    await writeFileText(text);
    const loaded = await loadKeybindings(platform, dir);
    applyToRenderer(loaded, platform);
    assertLayersMatchUi(platform, loaded);
  });

  it("the rejected entries leave exactly the default keys in force", async () => {
    await writeFileText(scenarios["rejected entries change nothing (reserved, unknown, readonly, unknown when)"]!);
    const loaded = await loadKeybindings(platform, dir);
    expect(loaded.effective.keybindings).toEqual(resolveDefaultKeybindings(platform));
    expect(loaded.diagnostics.map((d) => d.code).sort()).toEqual(
      ["readonlyCommand", "reservedForbiddenKey", "reservedForbiddenKey", "unknownCommand", "unsupportedWhen"].sort()
    );
  });

  it("a user key really replaces the default in the layers (and only it)", async () => {
    await writeFileText(scenarios["override (unbind + add)"]!);
    const loaded = await loadKeybindings(platform, dir);
    applyToRenderer(loaded, platform);
    const runtime = runtimePairs(platform);
    expect(runtime.has(`editor.markdown.bold ${canonical(platform, "Mod-b")}`)).toBe(false);
    expect(runtime.has(`editor.markdown.bold ${canonical(platform, "Mod-Alt-8")}`)).toBe(true);
    // Ruby keeps Mod-r in every state.
    expect(runtime.has(`editor.markdown.insertRuby ${canonical(platform, "Mod-r")}`)).toBe(true);
  });

  it("Reset All brings the defaults back in the UI and in every layer", async () => {
    await writeFileText(scenarios["override (unbind + add)"]!);
    const customized = await loadKeybindings(platform, dir);
    setStartupKeybindings(customized);
    applyToRenderer(customized, platform);

    const outcome = await resetAllUserKeybindings(platform, dir);
    expect(outcome.ok).toBe(true);
    const loaded = getStartupKeybindings()!;
    applyToRenderer(loaded, platform);
    expect(loaded.effective.keybindings).toEqual(resolveDefaultKeybindings(platform));
    assertLayersMatchUi(platform, loaded);
    expect(runtimePairs(platform).has(`editor.markdown.bold ${canonical(platform, "Mod-b")}`)).toBe(true);
  });

  it("an external edit (live reload) keeps UI and layers equal; a malformed file keeps the last valid state", async () => {
    await writeFileText("[]");
    setStartupKeybindings(await loadKeybindings(platform, dir));

    await writeFileText(scenarios["user-added menu + pane keys"]!);
    const applied = await reloadKeybindingsFromDisk(platform, { directory: dir });
    expect(applied.kind).toBe("applied");
    const afterEdit = getStartupKeybindings()!;
    applyToRenderer(afterEdit, platform);
    assertLayersMatchUi(platform, afterEdit);

    await writeFileText("[ {broken");
    const kept = await reloadKeybindingsFromDisk(platform, { directory: dir });
    expect(kept.kind).toBe("diagnosticsOnly");
    const afterBroken = getStartupKeybindings()!;
    expect(afterBroken.effective.keybindings).toEqual(afterEdit.effective.keybindings);
    applyToRenderer(afterBroken, platform);
    assertLayersMatchUi(platform, afterBroken);

    await writeFileText("[]");
    const recovered = await reloadKeybindingsFromDisk(platform, { directory: dir });
    expect(recovered.kind).toBe("applied");
    const defaults = getStartupKeybindings()!;
    applyToRenderer(defaults, platform);
    expect(defaults.effective.keybindings).toEqual(resolveDefaultKeybindings(platform));
    assertLayersMatchUi(platform, defaults);
  });
});

describe("registration layers are listed by command (#655)", () => {
  it("every renderer-shortcut command and every menu command is a catalog command", () => {
    const known = new Set(resolveDefaultKeybindings("win32").map((row) => row.command));
    for (const id of [...NATIVE_MENU_ACCELERATOR_COMMAND_IDS, ...Object.values(rendererShortcutCommandIds)]) {
      expect(known.has(id), id).toBe(true);
    }
  });
});
