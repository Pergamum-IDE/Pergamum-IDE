// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  inactiveMenuState,
  stepMenuKey,
  type MenuKeyInput
} from "../../src/renderer/applicationMenuKeyboard";
import { projectApplicationMenu } from "../../src/renderer/applicationMenuProjection";
import {
  handleCommandKeybindingKeyDown,
  isApplicationMenuMnemonicKey,
  matchCommandKeybinding,
  resolveCommandKeybindingDispatchBindings,
  type CommandKeybindingKeyEvent
} from "../../src/renderer/keybindings/commandKeybindingDispatcher";
import { RENDERER_SHORTCUT_COMMAND_IDS } from "../../src/renderer/keybindings/rendererShortcuts";
import { NATIVE_MENU_ACCELERATOR_COMMAND_IDS } from "../../src/shared/applicationMenuModel";
import {
  resolveDefaultKeybindings,
  resolveEffectiveKeybindings,
  type PergamumPlatform,
  type ResolvedKeybinding,
  type UserKeybindingEntry
} from "../../src/shared/keybindings";
import { t } from "../../src/shared/i18n";

// #693: user-assigned keys of presentation-only commands run through one
// generic Renderer-side dispatcher.

const JMC = "assist.japaneseMachineCheck.openDialog";
const win: PergamumPlatform = "win32";

function rows(
  userEntries: UserKeybindingEntry[],
  platform: PergamumPlatform = win
): ResolvedKeybinding[] {
  return resolveEffectiveKeybindings({ platform, userEntries }).keybindings;
}

function keyEvent(
  init: Partial<CommandKeybindingKeyEvent> & { key: string }
): CommandKeybindingKeyEvent & {
  prevented: () => boolean;
  stopped: () => boolean;
} {
  let prevented = false;
  let stopped = false;

  return {
    code: "",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    defaultPrevented: false,
    target: document.body,
    ...init,
    preventDefault: () => {
      prevented = true;
    },
    stopPropagation: () => {
      stopped = true;
    },
    prevented: () => prevented,
    stopped: () => stopped
  } as never;
}

const altSlash = () => keyEvent({ key: "/", code: "Slash", altKey: true });
const ctrlAltJ = () =>
  keyEvent({ key: "j", code: "KeyJ", ctrlKey: true, altKey: true });

function deps(
  userRows: ResolvedKeybinding[],
  overrides: Partial<Parameters<typeof handleCommandKeybindingKeyDown>[1]> = {}
) {
  const execute = vi.fn<(id: string) => void>();
  const isEnabled = vi.fn<(id: string) => boolean>(() => true);

  return {
    execute,
    isEnabled,
    deps: { platform: win, rows: userRows, isEnabled, execute, ...overrides }
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("generic command keybinding dispatcher (#693)", () => {
  it("Alt+/ assigned to Japanese Style Check runs it once, through the registry, with no native accelerator", () => {
    const { execute, deps: d } = deps(rows([{ key: "Alt-/", command: JMC }]));
    const event = altSlash();

    expect(NATIVE_MENU_ACCELERATOR_COMMAND_IDS).not.toContain(JMC);
    expect(handleCommandKeybindingKeyDown(event, d)).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(JMC);
    expect(event.prevented()).toBe(true);
    expect(event.stopped()).toBe(true);
  });

  it("Ctrl+Alt+J works the same way", () => {
    const { execute, deps: d } = deps(rows([{ key: "Mod-Alt-j", command: JMC }]));

    expect(handleCommandKeybindingKeyDown(ctrlAltJ(), d)).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(JMC);
  });

  it("after a rebind only the new key runs; the old one does not", () => {
    const { execute, deps: d } = deps(rows([{ key: "Mod-Alt-k", command: JMC }]));

    expect(handleCommandKeybindingKeyDown(ctrlAltJ(), d)).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    expect(
      handleCommandKeybindingKeyDown(
        keyEvent({ key: "k", code: "KeyK", ctrlKey: true, altKey: true }),
        d
      )
    ).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("after an unbind nothing runs", () => {
    const bound = rows([{ key: "Mod-Alt-j", command: JMC }]).map((row) =>
      row.command === JMC ? { ...row, key: null } : row
    );
    const { execute, deps: d } = deps(bound);

    expect(handleCommandKeybindingKeyDown(ctrlAltJ(), d)).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("the live effective rows are read at event time", () => {
    const execute = vi.fn();
    let current = rows([{ key: "Mod-Alt-j", command: JMC }]);
    const live = (): ResolvedKeybinding[] => current;

    // Simulates the hook, which passes the store's rows each time.
    const press = (event: ReturnType<typeof ctrlAltJ>) =>
      handleCommandKeybindingKeyDown(event, {
        platform: win,
        rows: live(),
        isEnabled: () => true,
        execute
      });

    expect(press(ctrlAltJ())).toBe(true);
    current = rows([]);
    expect(press(ctrlAltJ())).toBe(false);
  });

  it("never takes a key a native accelerator runs (no double fire)", () => {
    const all = rows([]);
    const owned = resolveCommandKeybindingDispatchBindings(all).map(
      (binding) => binding.command
    );

    for (const id of NATIVE_MENU_ACCELERATOR_COMMAND_IDS) {
      expect(owned, id).not.toContain(id);
    }

    const { execute, deps: d } = deps(all);

    // Ctrl+S (Save) belongs to Electron's accelerator.
    expect(
      handleCommandKeybindingKeyDown(
        keyEvent({ key: "s", code: "KeyS", ctrlKey: true }),
        d
      )
    ).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("never takes a key a dedicated renderer shortcut runs (no double fire)", () => {
    const all = rows([]);
    const owned = resolveCommandKeybindingDispatchBindings(all).map(
      (binding) => binding.command
    );

    for (const id of RENDERER_SHORTCUT_COMMAND_IDS) {
      expect(owned, id).not.toContain(id);
    }

    const { execute, deps: d } = deps(all);

    // Ctrl+O (Command Palette file mode) has its own window listener.
    expect(
      handleCommandKeybindingKeyDown(
        keyEvent({ key: "o", code: "KeyO", ctrlKey: true }),
        d
      )
    ).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("owns only registered, user-assignable app-scope commands", () => {
    const owned = resolveCommandKeybindingDispatchBindings(
      rows([
        { key: "Mod-Alt-j", command: JMC },
        { key: "Mod-Alt-8", command: "assist.export.openDialog" }
      ])
    );

    expect(owned.map((binding) => binding.command).sort()).toEqual(
      ["assist.export.openDialog", JMC].sort()
    );
    for (const binding of owned) {
      expect(binding.scope).toBe("app");
      expect(binding.source).toBe("pergamum");
      expect(binding.readonly).toBe(false);
      expect(binding.handlerStatus).toBe("registered");
    }
    // Default rows alone own nothing: no such command ships with a key.
    expect(resolveCommandKeybindingDispatchBindings(resolveDefaultKeybindings(win))).toEqual(
      []
    );
  });

  it("ignores editor-scope and readonly native-role rows", () => {
    const owned = resolveCommandKeybindingDispatchBindings(rows([])).map(
      (binding) => binding.command
    );

    expect(owned).not.toContain("editor.markdown.bold");
    expect(owned).not.toContain("editor.selection.copy");
  });

  it("leaves a key alone while an IME composition is going on", () => {
    const { execute, deps: d } = deps(rows([{ key: "Alt-/", command: JMC }]));

    expect(
      handleCommandKeybindingKeyDown(
        keyEvent({ key: "/", code: "Slash", altKey: true, isComposing: true }),
        d
      )
    ).toBe(false);
    expect(
      handleCommandKeybindingKeyDown(
        keyEvent({ key: "/", code: "Slash", altKey: true, keyCode: 229 }),
        d
      )
    ).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("leaves a key alone when something else already handled it", () => {
    const { execute, deps: d } = deps(rows([{ key: "Alt-/", command: JMC }]));
    const event = keyEvent({
      key: "/",
      code: "Slash",
      altKey: true,
      defaultPrevented: true
    });

    expect(handleCommandKeybindingKeyDown(event, d)).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("stays silent while a modal dialog is open or a text field has focus", () => {
    const { execute, deps: d } = deps(rows([{ key: "Alt-/", command: JMC }]));
    const dialog = document.createElement("div");

    dialog.setAttribute("aria-modal", "true");
    document.body.appendChild(dialog);
    expect(handleCommandKeybindingKeyDown(altSlash(), d)).toBe(false);
    dialog.remove();

    const input = document.createElement("input");

    document.body.appendChild(input);
    expect(
      handleCommandKeybindingKeyDown(
        keyEvent({ key: "/", code: "Slash", altKey: true, target: input }),
        d
      )
    ).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not run, nor swallow the key of, a command the registry says is disabled", () => {
    const { execute, isEnabled, deps: d } = deps(
      rows([{ key: "Alt-/", command: JMC }])
    );
    const event = altSlash();

    isEnabled.mockReturnValue(false);

    expect(handleCommandKeybindingKeyDown(event, d)).toBe(false);
    expect(isEnabled).toHaveBeenCalledWith(JMC);
    expect(execute).not.toHaveBeenCalled();
    expect(event.prevented()).toBe(false);
  });

  it("matches modifiers exactly: Alt+/ is not a bare / or Ctrl+Alt+/", () => {
    const all = rows([{ key: "Alt-/", command: JMC }]);

    expect(matchCommandKeybinding(altSlash(), win, all)).toBe(JMC);
    expect(
      matchCommandKeybinding(keyEvent({ key: "/", code: "Slash" }), win, all)
    ).toBeNull();
    expect(
      matchCommandKeybinding(
        keyEvent({ key: "/", code: "Slash", altKey: true, ctrlKey: true }),
        win,
        all
      )
    ).toBeNull();
  });

  it("AltGr is not mistaken for Ctrl+Alt", () => {
    const all = rows([{ key: "Mod-Alt-j", command: JMC }]);
    const altGr = keyEvent({
      key: "j",
      code: "KeyJ",
      ctrlKey: true,
      altKey: true
    });
    const withState = {
      ...altGr,
      getModifierState: (name: string) => name === "AltGraph"
    } as CommandKeybindingKeyEvent;

    expect(matchCommandKeybinding(withState, win, all)).toBeNull();
  });
});

describe("Application Menu mnemonics keep priority (#693)", () => {
  const menus = projectApplicationMenu("windows", {
    translate: (key, values) => t("en", key, values)
  });
  const menuKey = (key: string, overrides: Partial<MenuKeyInput> = {}): MenuKeyInput => ({
    type: "keydown",
    key,
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    altGraph: false,
    ...overrides
  });

  it("Alt+A (and F / E / V / H) opens the menu and is not a shortcut, even if a command is bound to it", () => {
    for (const letter of ["f", "e", "v", "a", "h"]) {
      expect(
        isApplicationMenuMnemonicKey(
          keyEvent({ key: letter, altKey: true }),
          win
        ),
        letter
      ).toBe(true);
    }

    const bound = rows([{ key: "Alt-a", command: JMC }]);
    const { execute, deps: d } = deps(bound);

    expect(
      handleCommandKeybindingKeyDown(
        keyEvent({ key: "a", code: "KeyA", altKey: true }),
        d
      )
    ).toBe(false);
    expect(execute).not.toHaveBeenCalled();

    // And the menu itself really handles it.
    const result = stepMenuKey(inactiveMenuState, menuKey("a"), {
      menus,
      blocked: false,
      composing: false
    });

    expect(result.effects.length).toBeGreaterThan(0);
  });

  it("Alt+/ is not a mnemonic: the menu handler does not consume it", () => {
    expect(
      isApplicationMenuMnemonicKey(keyEvent({ key: "/", altKey: true }), win)
    ).toBe(false);

    const result = stepMenuKey(inactiveMenuState, menuKey("/"), {
      menus,
      blocked: false,
      composing: false
    });

    expect(JSON.stringify(result.effects)).not.toContain("prevent");
    expect(result.effects).toEqual([]);
  });

  it("AltGr is never a mnemonic; Alt with Shift/Ctrl is not either", () => {
    expect(
      isApplicationMenuMnemonicKey(
        keyEvent({ key: "a", altKey: true, ctrlKey: true }),
        win
      )
    ).toBe(false);
    expect(
      isApplicationMenuMnemonicKey(
        keyEvent({ key: "a", altKey: true, shiftKey: true }),
        win
      )
    ).toBe(false);
  });

  it("there is no Renderer menu mnemonic on macOS", () => {
    expect(
      isApplicationMenuMnemonicKey(
        keyEvent({ key: "a", altKey: true }),
        "darwin"
      )
    ).toBe(false);
  });
});

describe("wiring (#693)", () => {
  const app = readFileSync("src/renderer/App.tsx", "utf8");

  it("App runs matched commands through executeUiCommand (the Command Registry) and asks the registry for enablement", () => {
    expect(app).toContain("useCommandKeybindingDispatcher({");
    expect(app).toContain('{ source: "keyboardShortcut" }');
    expect(app).toContain("commandRegistry.isEnabledForContext(");
  });

  it("has no command-specific code: Japanese Style Check is not named in the dispatcher", () => {
    const source = readFileSync(
      "src/renderer/keybindings/commandKeybindingDispatcher.ts",
      "utf8"
    );
    // Comments explain the rule with an example; only code is checked.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    expect(code).not.toMatch(/japanese|assist\./i);
    expect(code).toContain("NATIVE_MENU_ACCELERATOR_COMMAND_IDS");
  });

  it("is one capture-phase listener that is removed on unmount", () => {
    const source = readFileSync(
      "src/renderer/keybindings/commandKeybindingDispatcher.ts",
      "utf8"
    );

    expect(source).toContain('window.addEventListener("keydown", handleKeyDown, true)');
    expect(source).toContain('window.removeEventListener("keydown", handleKeyDown, true)');
  });
});
