// @vitest-environment happy-dom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseKeybindingKey,
  resolveDefaultKeybindings,
  validateKeybindingCatalog,
  type PergamumPlatform
} from "../../src/shared/keybindings";
import { shouldHandleTabSwitchShortcut } from "../../src/renderer/editorTabShortcuts";
import { isGlossaryCompletionShortcutEvent } from "../../src/renderer/glossaryCompletion";
import { activeFindModeForKeyEvent } from "../../src/renderer/find/activeFindKeymapExtension";
import {
  appPlatformToPergamumPlatform,
  getRuntimePlatform,
  isModKey
} from "../../src/renderer/platformModifier";
import { stubRuntimePlatform } from "./helpers/runtimePlatform";
import { handlerFires } from "./helpers/editorKeymapHarness";

const isTabCaptureToggleShortcut = (
  event: KeyboardEvent,
  platform: PergamumPlatform
): boolean => handlerFires("editor.tabCapture.toggle", event, platform);

const TOOLBAR_COMMANDS = [
  "editor.markdown.bold",
  "editor.markdown.italic",
  "editor.markdown.strikethrough",
  "editor.markdown.link",
  "editor.markdown.heading",
  "editor.markdown.insertHorizontalRule",
  "editor.markdown.insertCodeBlock",
  "editor.markdown.insertBlockquote",
  "editor.image.insert",
  "editor.markdown.insertTable",
  "editor.markdown.toggleSyntaxChecker"
] as const;

/** The toolbar command the generated keymap would run for `event`, if any. */
function matchMarkdownToolbarShortcutTrigger(
  event: KeyboardEvent,
  platform: PergamumPlatform
): string | null {
  for (const command of TOOLBAR_COMMANDS) {
    if (handlerFires(command, event, platform)) {
      return command;
    }
  }
  return null;
}
const isRubyShortcutTrigger = (
  event: KeyboardEvent,
  platform: PergamumPlatform
): boolean => handlerFires("editor.markdown.insertRuby", event, platform);
const isEmphasisMarkShortcutTrigger = (
  event: KeyboardEvent,
  platform: PergamumPlatform
): boolean => handlerFires("editor.markdown.insertEmphasisMark", event, platform);

/**
 * #636: platform-aware Mod handling and macOS default overrides. Where a
 * runtime registration still uses a literal, the catalog (#639) value is
 * turned into a synthetic key event and fed to the runtime matcher, so the
 * two cannot drift apart silently.
 */

const platforms: readonly PergamumPlatform[] = ["win32", "linux", "darwin"];

interface SyntheticKey {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

function eventFromCatalogKey(
  notation: string,
  platform: PergamumPlatform
): SyntheticKey {
  const parsed = parseKeybindingKey(notation);
  if (parsed === null) {
    throw new Error(`invalid key ${notation}`);
  }
  const mod = parsed.modifiers.has("Mod");
  const codeByKey: Record<string, string> = { "`": "Backquote", Space: "Space" };
  const code =
    codeByKey[parsed.key] ??
    (/^[a-z]$/.test(parsed.key)
      ? `Key${parsed.key.toUpperCase()}`
      : parsed.key);
  return {
    key: parsed.key === "Space" ? " " : parsed.key,
    code,
    ctrlKey: parsed.modifiers.has("Ctrl") || (mod && platform !== "darwin"),
    metaKey: mod && platform === "darwin",
    altKey: parsed.modifiers.has("Alt"),
    shiftKey: parsed.modifiers.has("Shift")
  };
}

function catalogKey(platform: PergamumPlatform, command: string): string {
  const keys = resolveDefaultKeybindings(platform)
    .filter((binding) => binding.command === command)
    .map((binding) => binding.key);
  expect(keys, `${command} on ${platform}`).toHaveLength(1);
  const [key] = keys;
  if (key === null || key === undefined) {
    throw new Error(`${command} has no key on ${platform}`);
  }
  return key;
}

function realEvent(synthetic: SyntheticKey): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    ...synthetic,
    bubbles: true,
    cancelable: true
  });
}

function keyEvent(
  init: Partial<SyntheticKey> & { key: string; code?: string }
): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    code: `Key${init.key.toUpperCase()}`,
    ...init,
    bubbles: true,
    cancelable: true
  });
}

describe("platform-aware Mod helper (#636)", () => {
  it("darwin: Mod = metaKey && !ctrlKey", () => {
    expect(isModKey({ ctrlKey: false, metaKey: true }, "darwin")).toBe(true);
    expect(isModKey({ ctrlKey: true, metaKey: false }, "darwin")).toBe(false);
    expect(isModKey({ ctrlKey: true, metaKey: true }, "darwin")).toBe(false);
    expect(isModKey({ ctrlKey: false, metaKey: false }, "darwin")).toBe(false);
  });

  it("win32 / linux: Mod = ctrlKey && !metaKey", () => {
    for (const platform of ["win32", "linux"] as const) {
      expect(isModKey({ ctrlKey: true, metaKey: false }, platform)).toBe(true);
      expect(isModKey({ ctrlKey: false, metaKey: true }, platform)).toBe(false);
      expect(isModKey({ ctrlKey: true, metaKey: true }, platform)).toBe(false);
    }
  });

  it("maps AppPlatform to PergamumPlatform, treating other as linux", () => {
    expect(appPlatformToPergamumPlatform("macos")).toBe("darwin");
    expect(appPlatformToPergamumPlatform("windows")).toBe("win32");
    expect(appPlatformToPergamumPlatform("linux")).toBe("linux");
    expect(appPlatformToPergamumPlatform("other")).toBe("linux");
  });

  it("reads the platform from window.pergamum.platform, defaulting to linux", () => {
    expect(getRuntimePlatform()).toBe("linux");
    const restore = stubRuntimePlatform("macos");
    try {
      expect(getRuntimePlatform()).toBe("darwin");
    } finally {
      restore();
    }
  });

  it("renderer code never reads navigator.platform (comments aside)", () => {
    const offenders: string[] = [];
    for (const entry of readdirSync("src/renderer", {
      recursive: true,
      withFileTypes: true
    })) {
      if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) {
        continue;
      }
      const path = join(entry.parentPath, entry.name);
      const code = readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      if (/navigator\s*\.\s*platform/.test(code)) {
        offenders.push(path);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("macOS Ctrl+letter stays with the OS text-editing keys (#636)", () => {
  const ctrlLetters = ["a", "e", "b", "f", "n", "p", "k", "h", "d", "o", "t", "y"];

  it("toolbar / ruby / emphasis / find / glossary shortcuts ignore bare Ctrl+letter on darwin", () => {
    for (const letter of ctrlLetters) {
      const ctrl = keyEvent({ key: letter, ctrlKey: true });
      const ctrlShift = keyEvent({ key: letter, ctrlKey: true, shiftKey: true });
      expect(matchMarkdownToolbarShortcutTrigger(ctrl, "darwin"), letter).toBeNull();
      expect(matchMarkdownToolbarShortcutTrigger(ctrlShift, "darwin"), letter).toBeNull();
      expect(isRubyShortcutTrigger(ctrl, "darwin"), letter).toBe(false);
      expect(activeFindModeForKeyEvent(ctrl, "darwin"), letter).toBeNull();
    }
    expect(
      isEmphasisMarkShortcutTrigger(
        keyEvent({ key: ".", code: "Period", ctrlKey: true }),
        "darwin"
      )
    ).toBe(false);
  });

  it("Cmd+B / I / K / L / T and Cmd+R work on darwin", () => {
    const expected: Record<string, string> = {
      b: "editor.markdown.bold",
      i: "editor.markdown.italic",
      k: "editor.markdown.link",
      l: "editor.markdown.heading",
      t: "editor.markdown.insertTable"
    };
    for (const [letter, trigger] of Object.entries(expected)) {
      expect(
        matchMarkdownToolbarShortcutTrigger(
          keyEvent({ key: letter, metaKey: true }),
          "darwin"
        )
      ).toBe(trigger);
    }
    expect(
      isRubyShortcutTrigger(keyEvent({ key: "r", metaKey: true }), "darwin")
    ).toBe(true);
  });

  it("win32 / linux Ctrl shortcuts are unchanged and Cmd does nothing there", () => {
    for (const platform of ["win32", "linux"] as const) {
      expect(
        matchMarkdownToolbarShortcutTrigger(
          keyEvent({ key: "b", ctrlKey: true }),
          platform
        )
      ).toBe("editor.markdown.bold");
      expect(
        matchMarkdownToolbarShortcutTrigger(
          keyEvent({ key: "q", ctrlKey: true, shiftKey: true }),
          platform
        )
      ).toBe("editor.markdown.insertBlockquote");
      expect(
        matchMarkdownToolbarShortcutTrigger(
          keyEvent({ key: "b", metaKey: true }),
          platform
        )
      ).toBeNull();
    }
  });
});

describe("macOS default overrides: catalog and runtime agree (#636)", () => {
  it("replace: Mod-h, darwin Mod-Alt-f (Cmd+H hides the app)", () => {
    for (const platform of platforms) {
      const key = catalogKey(platform, "editor.find.replace.open");
      expect(key).toBe(platform === "darwin" ? "Mod-Alt-f" : "Mod-h");
      expect(
        activeFindModeForKeyEvent(realEvent(eventFromCatalogKey(key, platform)), platform)
      ).toBe("replace");
    }
    const cmdH = keyEvent({ key: "h", metaKey: true });
    expect(activeFindModeForKeyEvent(cmdH, "darwin")).toBeNull();
    expect(
      activeFindModeForKeyEvent(keyEvent({ key: "f", metaKey: true }), "darwin")
    ).toBe("search");
  });

  it("tab capture toggle: Ctrl-m, darwin Shift-Alt-m", () => {
    for (const platform of platforms) {
      const key = catalogKey(platform, "editor.tabCapture.toggle");
      expect(key).toBe(platform === "darwin" ? "Shift-Alt-m" : "Ctrl-m");
      expect(isTabCaptureToggleShortcut(realEvent(eventFromCatalogKey(key, platform)), platform)).toBe(true);
    }
  });

  it("tab switching: Alt-Arrow, darwin Mod-Alt-Arrow", () => {
    for (const [command, arrow, direction] of [
      ["workspace.tabs.previous", "ArrowLeft", "previous"],
      ["workspace.tabs.next", "ArrowRight", "next"]
    ] as const) {
      for (const platform of platforms) {
        const key = catalogKey(platform, command);
        expect(key).toBe(
          platform === "darwin" ? `Mod-Alt-${arrow}` : `Alt-${arrow}`
        );
        expect(
          shouldHandleTabSwitchShortcut(
            { ...eventFromCatalogKey(key, platform), target: null },
            false,
            platform
          )
        ).toBe(direction);
      }
      // Option+Arrow alone stays word movement on macOS.
      expect(
        shouldHandleTabSwitchShortcut(
          {
            ...eventFromCatalogKey(`Alt-${arrow}`, "darwin"),
            target: null
          },
          false,
          "darwin"
        )
      ).toBeNull();
    }
  });

  it("glossary completion: Ctrl-Space, darwin Alt-`", () => {
    for (const platform of platforms) {
      const key = catalogKey(platform, "glossary.completion.open");
      expect(key).toBe(platform === "darwin" ? "Alt-`" : "Ctrl-Space");
      expect(
        isGlossaryCompletionShortcutEvent(eventFromCatalogKey(key, platform), platform)
      ).toBe(true);
    }
    const ctrlSpace = eventFromCatalogKey("Ctrl-Space", "darwin");
    const cmdSpace = eventFromCatalogKey("Mod-Space", "darwin");
    expect(isGlossaryCompletionShortcutEvent(ctrlSpace, "darwin")).toBe(false);
    expect(isGlossaryCompletionShortcutEvent(cmdSpace, "darwin")).toBe(false);
    expect(
      isGlossaryCompletionShortcutEvent(
        eventFromCatalogKey("Alt-`", "win32"),
        "win32"
      )
    ).toBe(false);
  });

  it("blockquote: Mod-Shift-q, darwin Mod-Alt-q (Cmd+Shift+Q logs out)", () => {
    for (const platform of platforms) {
      const key = catalogKey(platform, "editor.markdown.insertBlockquote");
      expect(key).toBe(platform === "darwin" ? "Mod-Alt-q" : "Mod-Shift-q");
      expect(
        matchMarkdownToolbarShortcutTrigger(
          realEvent(eventFromCatalogKey(key, platform)),
          platform
        )
      ).toBe("editor.markdown.insertBlockquote");
    }
    expect(
      matchMarkdownToolbarShortcutTrigger(
        keyEvent({ key: "q", metaKey: true, shiftKey: true }),
        "darwin"
      )
    ).toBeNull();
  });

  it("Ruby is Mod-r on every platform", () => {
    for (const platform of platforms) {
      const key = catalogKey(platform, "editor.markdown.insertRuby");
      expect(key).toBe("Mod-r");
      expect(
        isRubyShortcutTrigger(realEvent(eventFromCatalogKey(key, platform)), platform)
      ).toBe(true);
    }
  });

  it("palette # / % direct shortcuts: Mod-#, Mod-%, null on darwin, excluded in App.tsx", () => {
    for (const command of [
      "workbench.commandPalette.heading.open",
      "workbench.commandPalette.projectSearch.open"
    ]) {
      expect(resolveDefaultKeybindings("darwin").find((b) => b.command === command)?.key).toBeNull();
      expect(resolveDefaultKeybindings("win32").find((b) => b.command === command)?.key).not.toBeNull();
    }
    const app = readFileSync("src/renderer/App.tsx", "utf8");
    for (const id of ["openCommandPaletteHeadingJump", "openCommandPaletteProjectSearch"]) {
      const start = app.indexOf(`id: "${id}"`);
      const block = app.slice(start, app.indexOf("handler:", start));
      expect(block, id).toContain('excludePlatforms: ["darwin"]');
    }
  });
});

describe("darwin catalog safety (#636)", () => {
  it("has no forbidden / nativeOnly reserved key violations and no duplicates", () => {
    const problems = validateKeybindingCatalog().filter(
      (d) => d.severity === "error" && d.platform === "darwin"
    );
    expect(problems).toEqual([]);
  });

  it("does not define a custom F11 fullscreen shortcut on darwin", () => {
    const fullscreen = resolveDefaultKeybindings("darwin").find(
      (b) => b.command === "window.toggleFullscreen"
    );
    expect(fullscreen?.key).not.toBe("F11");
    expect(fullscreen?.readonly).toBe(true);
  });
});

describe("Cmd+W / Cmd+Shift+W (#636)", () => {
  const menu = readFileSync("src/main/menu.ts", "utf8");

  it("keeps editor.close on CommandOrControl+W (catalog-derived, #642)", () => {
    expect(menu).toMatch(
      /editorCommandIds\.close,\s*language,\s*"menu\.closeCurrentTab",\s*options,\s*accelerators\.get\(editorCommandIds\.close\)/
    );
    for (const platform of platforms) {
      expect(catalogKey(platform, "editor.close")).toBe("Mod-w");
    }
  });

  it("gives the darwin native close role Cmd+Shift+W so it cannot claim Cmd+W", () => {
    const start = menu.indexOf('"menu.close"');
    expect(start).toBeGreaterThan(-1);
    const block = menu.slice(start, start + 120);
    expect(block).toContain('"CommandOrControl+Shift+W"');
    expect(menu.slice(start - 200, start)).toContain('roleItem(\n              "close"');
  });
});
