import { describe, expect, it } from "vitest";
import {
  ancestorSubmenuKeys,
  closeMenu,
  inactiveMenuState,
  isMenuActive,
  pointerClickEntry,
  pointerHoverEntry,
  pointerHoverTopLevel,
  pointerToggleTopLevel,
  stepMenuKey,
  type MenuKeyInput,
  type MenuKeyboardState,
  type MenuStepContext,
  type MenuStepResult
} from "../../src/renderer/applicationMenuKeyboard";
import {
  projectApplicationMenu,
  type RendererMenuEntry
} from "../../src/renderer/applicationMenuProjection";
import { editorCommandIds } from "../../src/shared/commandIds";
import { t, type Language, type Translate } from "../../src/shared/i18n";

type TopLevel = Extract<RendererMenuEntry, { kind: "submenu" }>;

const translateFor =
  (language: Language): Translate =>
  (key, values) =>
    t(language, key, values);

function realMenus(
  language: Language = "en",
  disabled: readonly string[] = []
): readonly TopLevel[] {
  return projectApplicationMenu("windows", {
    translate: translateFor(language),
    isDisabled: (commandId) => disabled.includes(commandId)
  });
}

const context = (
  menus: readonly TopLevel[],
  overrides: Partial<MenuStepContext> = {}
): MenuStepContext => ({
  menus,
  blocked: false,
  composing: false,
  ...overrides
});

function input(
  type: "keydown" | "keyup",
  key: string,
  overrides: Partial<MenuKeyInput> = {}
): MenuKeyInput {
  return {
    type,
    key,
    altKey: key === "Alt",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    altGraph: false,
    ...overrides
  };
}

const down = (key: string, overrides: Partial<MenuKeyInput> = {}) =>
  input("keydown", key, overrides);
const up = (key: string, overrides: Partial<MenuKeyInput> = {}) =>
  input("keyup", key, overrides);

/** Feeds a sequence of inputs, returning the final state and every effect. */
function run(
  menus: readonly TopLevel[],
  inputs: readonly MenuKeyInput[],
  start: MenuKeyboardState = inactiveMenuState,
  overrides: Partial<MenuStepContext> = {}
): MenuStepResult & { all: readonly string[] } {
  let state = start;
  const all: string[] = [];
  let effects: MenuStepResult["effects"] = [];

  for (const step of inputs) {
    const result = stepMenuKey(state, step, context(menus, overrides));
    state = result.state;
    effects = result.effects;
    all.push(...result.effects.map((effect) => effect.type));
  }

  return { state, effects, all };
}

const altTap = [down("Alt"), up("Alt")];

/** Keyboard mode with the File menu open and `focusKey` set. */
function openFile(
  menus: readonly TopLevel[],
  keys: readonly MenuKeyInput[] = []
) {
  return run(menus, [down("f", { altKey: true }), ...keys]);
}

function keyOf(menus: readonly TopLevel[], label: string): string {
  const find = (entries: readonly RendererMenuEntry[]): string | null => {
    for (const entry of entries) {
      if (entry.kind !== "separator" && entry.label === label) return entry.key;
      if (entry.kind === "submenu") {
        const nested = find(entry.items);
        if (nested) return nested;
      }
    }
    return null;
  };
  const key = find(menus);
  if (!key) throw new Error(`no entry ${label}`);
  return key;
}

describe("bare Alt (#665)", () => {
  const menus = realMenus();

  it("a bare Alt tap focuses the first top-level menu without opening it", () => {
    const result = run(menus, altTap);

    expect(result.state).toMatchObject({
      barKey: "0",
      focusKey: "0",
      openKey: null,
      altArmed: false
    });
    expect(result.all).toEqual(["captureFocusOwner", "preventDefault"]);
  });

  it("is armed on keydown and only fires on keyup", () => {
    const afterDown = run(menus, [down("Alt")]);

    expect(afterDown.state.altArmed).toBe(true);
    expect(isMenuActive(afterDown.state)).toBe(false);
  });

  it("a second bare Alt tap leaves the menu and restores the focus owner", () => {
    const result = run(menus, [...altTap, ...altTap]);

    expect(result.state).toEqual(inactiveMenuState);
    expect(result.all.at(-2)).toBe("restoreFocusOwner");
  });

  it("ignores key repeat (no repeated activation or toggle)", () => {
    const result = run(menus, [
      down("Alt"),
      down("Alt", { repeat: true }),
      down("Alt", { repeat: true }),
      up("Alt")
    ]);

    expect(result.state.barKey).toBe("0");
    expect(result.all.filter((type) => type === "captureFocusOwner")).toHaveLength(1);
  });

  it("is cancelled by any other key while Alt is down (Alt+F, Alt+Tab)", () => {
    const afterTab = run(menus, [down("Alt"), down("Tab", { altKey: true }), up("Alt")]);

    expect(isMenuActive(afterTab.state)).toBe(false);
    expect(afterTab.all).not.toContain("preventDefault");
  });

  it("Ctrl / Meta / Shift held with Alt do not arm it", () => {
    for (const modifier of [
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true }
    ]) {
      const result = run(menus, [down("Alt", modifier), up("Alt", modifier)]);

      expect(isMenuActive(result.state), JSON.stringify(modifier)).toBe(false);
    }
  });

  it("does nothing while a modal surface owns the keyboard", () => {
    const result = run(menus, altTap, inactiveMenuState, { blocked: true });

    expect(result.state).toEqual(inactiveMenuState);
    expect(result.all).toEqual([]);
  });

  it("does nothing during IME composition (event flags, legacy 229, app guard)", () => {
    for (const flags of [
      { isComposing: true },
      { keyCode: 229 }
    ] as const) {
      const result = run(menus, [down("Alt", flags), up("Alt", flags)]);
      expect(isMenuActive(result.state), JSON.stringify(flags)).toBe(false);
    }

    const guarded = run(menus, altTap, inactiveMenuState, { composing: true });
    expect(isMenuActive(guarded.state)).toBe(false);
  });
});

describe("Alt + mnemonic (#665)", () => {
  it.each(["en", "ja"] as const)(
    "%s: Alt+F/E/V/A/H open File/Edit/View/Assist/Help from the canonical mnemonic",
    (language) => {
      const menus = realMenus(language);
      const expected = { f: "0", e: "1", v: "2", a: "3", h: "4" };

      for (const [letter, menuKey] of Object.entries(expected)) {
        const result = run(menus, [down(letter, { altKey: true })]);

        expect(result.state.openKey, `${language} Alt+${letter}`).toBe(menuKey);
        // The first enabled item is focused, not just the trigger.
        expect(result.state.focusKey).toBe(`${menuKey}/0`);
        expect(result.all).toEqual(["captureFocusOwner", "preventDefault"]);
      }
    }
  );

  it("uppercase letters (Caps Lock) work too", () => {
    const menus = realMenus();

    expect(run(menus, [down("A", { altKey: true })]).state.openKey).toBe("3");
  });

  it("uses the model metadata, not the label text (Japanese Assist is 'アシスト' yet Alt+A works)", () => {
    const menus = realMenus("ja");

    expect(menus[3].label).toBe("アシスト(A)");
    expect(run(menus, [down("a", { altKey: true })]).state.openKey).toBe("3");
    // A letter that is in some label but is no mnemonic does nothing.
    expect(run(menus, [down("s", { altKey: true })]).state.openKey).toBeNull();
  });

  it("(Alt, release,) then the letter opens the menu", () => {
    const menus = realMenus();
    const result = run(menus, [...altTap, down("v")]);

    expect(result.state.openKey).toBe("2");
    expect(result.state.focusKey).toBe("2/0");
  });

  it("the second step works for every canonical mnemonic", () => {
    const menus = realMenus("ja");

    for (const [letter, key] of [["f", "0"], ["e", "1"], ["v", "2"], ["a", "3"], ["h", "4"]]) {
      expect(run(menus, [...altTap, down(letter)]).state.openKey).toBe(key);
    }
  });

  it("never treats AltGr or Ctrl+Alt+letter as a mnemonic", () => {
    const menus = realMenus();

    for (const modifiers of [
      { altKey: true, ctrlKey: true },
      { altKey: true, altGraph: true },
      { altKey: true, ctrlKey: true, altGraph: true }
    ]) {
      const result = run(menus, [down("f", modifiers)]);

      expect(isMenuActive(result.state), JSON.stringify(modifiers)).toBe(false);
      expect(result.all).toEqual([]);
    }
  });

  it("does not take Meta+Alt or Shift+Alt combinations", () => {
    const menus = realMenus();

    expect(run(menus, [down("f", { altKey: true, metaKey: true })]).state.openKey).toBeNull();
    expect(run(menus, [down("f", { altKey: true, shiftKey: true })]).state.openKey).toBeNull();
  });

  it("is inactive during IME composition and behind a modal", () => {
    const menus = realMenus();

    expect(run(menus, [down("f", { altKey: true, isComposing: true })]).state.openKey).toBeNull();
    expect(run(menus, [down("f", { altKey: true, keyCode: 229 })]).state.openKey).toBeNull();
    expect(
      run(menus, [down("f", { altKey: true })], inactiveMenuState, { blocked: true }).state.openKey
    ).toBeNull();
  });
});

describe("top-level navigation (#665)", () => {
  const menus = realMenus();

  it("Right / Left move between top-level menus and wrap", () => {
    const right = (n: number) =>
      run(menus, [...altTap, ...Array(n).fill(down("ArrowRight"))]).state.focusKey;

    expect([1, 2, 3, 4, 5].map(right)).toEqual(["1", "2", "3", "4", "0"]);
    expect(run(menus, [...altTap, down("ArrowLeft")]).state.focusKey).toBe("4");
  });

  it("Home / End jump to File / Help", () => {
    expect(run(menus, [...altTap, down("End")]).state.focusKey).toBe("4");
    expect(run(menus, [...altTap, down("End"), down("Home")]).state.focusKey).toBe("0");
  });

  it("Down / Enter / Space open the menu on its first enabled item", () => {
    for (const key of ["ArrowDown", "Enter", " "]) {
      const result = run(menus, [...altTap, down(key)]);

      expect(result.state.openKey, key).toBe("0");
      expect(result.state.focusKey, key).toBe("0/0");
    }
  });

  it("Up opens the menu on its last enabled item", () => {
    const result = run(menus, [...altTap, down("ArrowUp")]);
    const fileItems = menus[0].items;
    const lastEnabled = [...fileItems]
      .reverse()
      .find((entry) => entry.kind === "submenu" || (entry.kind === "item" && !entry.disabled))!;

    expect(result.state.focusKey).toBe(lastEnabled.key);
  });

  it("first / last enabled skip disabled items", () => {
    const withDisabled = realMenus("en", [
      // everything the File menu starts with is disabled
      ...menus[0].items
        .slice(0, 3)
        .flatMap((entry) =>
          entry.kind === "item" && entry.target.commandId ? [entry.target.commandId] : []
        )
    ]);
    const result = run(withDisabled, [...altTap, down("ArrowDown")]);

    // The first three items are disabled and a separator follows: Import is first.
    expect(result.state.focusKey).toBe(keyOf(withDisabled, "Import"));
  });

  it("while a popup is open, Right / Left switch the open menu", () => {
    const result = openFile(menus, [down("ArrowDown"), down("ArrowRight")]);

    // The first File item is a leaf, so Right moves to the next menu.
    expect(result.state.openKey).toBe("1");
    expect(result.state.focusKey).toBe("1/0");
    expect(
      run(menus, [down("e", { altKey: true }), down("ArrowLeft")]).state.openKey
    ).toBe("0");
  });
});

describe("popup navigation (#665)", () => {
  const menus = realMenus();

  it("Up / Down wrap and skip separators and disabled items", () => {
    const disabled = [editorCommandIds.newFile];
    const m = realMenus("en", disabled);
    const items = m[0].items;
    const keys = items
      .filter((e) => e.kind === "submenu" || (e.kind === "item" && !e.disabled))
      .map((e) => e.key);

    let state: MenuKeyboardState = openFile(m).state;
    const visited: (string | null)[] = [state.focusKey];
    for (let index = 0; index < keys.length; index += 1) {
      state = run(m, [down("ArrowDown")], state).state;
      visited.push(state.focusKey);
    }

    // Visits every enabled / navigable item, never a separator or the disabled one.
    expect(new Set(visited).size).toBe(keys.length);
    expect(visited.every((key) => keys.includes(key as string))).toBe(true);
    // Down from the last item wraps to the first.
    expect(visited[visited.length - 1]).toBe(visited[0]);
    // Up from the first wraps to the last.
    const up1 = run(m, [down("ArrowUp")], openFile(m).state).state.focusKey;
    expect(up1).toBe(keys[keys.length - 1]);
  });

  it("Home / End focus the first / last enabled item", () => {
    const state = openFile(menus, [down("ArrowDown"), down("ArrowDown")]).state;

    expect(run(menus, [down("Home")], state).state.focusKey).toBe("0/0");
    const end = run(menus, [down("End")], state).state.focusKey!;
    expect(end).toBe(
      [...menus[0].items].reverse().find((e) => e.kind !== "separator" && !(e.kind === "item" && e.disabled))!.key
    );
  });

  it("with no enabled item nothing crashes and focus stays on the trigger", () => {
    const allDisabled: TopLevel[] = [
      {
        kind: "submenu",
        key: "0",
        label: "Empty",
        mnemonic: "E",
        items: [
          { kind: "separator", key: "0/0" },
          {
            kind: "item",
            key: "0/1",
            label: "Off",
            disabled: true,
            target: { type: "command", commandId: "x" }
          }
        ]
      }
    ];
    const result = run(allDisabled, [...altTap, down("ArrowDown"), down("ArrowDown"), down("Home"), down("End"), down("Enter")]);

    expect(result.state.openKey).toBe("0");
    expect(result.state.focusKey).toBe("0");
    expect(result.all).not.toContain("invoke");
  });
});

describe("activation (#665)", () => {
  const menus = realMenus();

  it("Enter / Space on an enabled leaf: close, restore focus, THEN invoke", () => {
    for (const key of ["Enter", " "]) {
      const result = run(menus, [down("f", { altKey: true }), down(key)]);

      expect(result.state).toEqual(inactiveMenuState);
      expect(result.effects.map((effect) => effect.type)).toEqual([
        "restoreFocusOwner",
        "invoke",
        "preventDefault"
      ]);
    }
  });

  it("invokes the #664 target of the focused item", () => {
    const m = menus;
    const save = keyOf(m, "Save");
    const state = { ...inactiveMenuState, openKey: "0", barKey: "0", focusKey: save };
    const result = run(m, [down("Enter")], state);
    const invoke = result.effects.find((effect) => effect.type === "invoke");

    expect(invoke).toMatchObject({
      target: { type: "command", commandId: editorCommandIds.saveDocument }
    });
  });

  it("a disabled leaf is neither focused by navigation nor invoked", () => {
    const m = realMenus("en", [editorCommandIds.saveDocument]);
    const save = keyOf(m, "Save");
    // Even if focus somehow sat on it, Enter / Space do nothing.
    const state = { ...inactiveMenuState, openKey: "0", barKey: "0", focusKey: save };

    for (const key of ["Enter", " "]) {
      const result = run(m, [down(key)], state);

      expect(result.all).not.toContain("invoke");
      expect(result.state.openKey).toBe("0");
    }
  });

  it("native edit roles are activated the same way (restore before invoke)", () => {
    const copy = keyOf(menus, "Copy");
    const state = { ...inactiveMenuState, openKey: "1", barKey: "1", focusKey: copy };
    const result = run(menus, [down("Enter")], state);

    expect(result.effects.map((effect) => effect.type).slice(0, 2)).toEqual([
      "restoreFocusOwner",
      "invoke"
    ]);
    expect(result.effects[1]).toMatchObject({
      target: { type: "nativeRole", role: "copy" }
    });
  });
});

describe("nested submenus and Escape staircase (#665)", () => {
  const menus = realMenus();
  const importKey = keyOf(menus, "Import");
  const bulkKey = keyOf(menus, "Bulk Import Text Files...");

  it("Enter / Space / Right on a submenu open it and focus its first child", () => {
    for (const key of ["Enter", " ", "ArrowRight"]) {
      const state = { ...inactiveMenuState, openKey: "0", barKey: "0", focusKey: importKey };
      const result = run(menus, [down(key)], state);

      expect(result.state.submenuKeys, key).toEqual([importKey]);
      expect(result.state.focusKey, key).toBe(bulkKey);
      expect(result.all).not.toContain("invoke");
    }
  });

  it("Left in a nested submenu closes it and returns to the parent item", () => {
    const state = {
      ...inactiveMenuState,
      openKey: "0",
      barKey: "0",
      submenuKeys: [importKey],
      focusKey: bulkKey
    };
    const result = run(menus, [down("ArrowLeft")], state);

    expect(result.state.submenuKeys).toEqual([]);
    expect(result.state.focusKey).toBe(importKey);
    expect(result.state.openKey).toBe("0");
  });

  it("Escape: child -> parent item, root popup -> top-level, then out to the focus owner", () => {
    let state: MenuKeyboardState = {
      ...inactiveMenuState,
      openKey: "0",
      barKey: "0",
      submenuKeys: [importKey],
      focusKey: bulkKey
    };

    state = run(menus, [down("Escape")], state).state;
    expect(state).toMatchObject({ submenuKeys: [], focusKey: importKey, openKey: "0" });

    state = run(menus, [down("Escape")], state).state;
    expect(state).toMatchObject({ openKey: null, focusKey: "0", barKey: "0" });

    const last = run(menus, [down("Escape")], state);
    expect(last.state).toEqual(inactiveMenuState);
    expect(last.all).toEqual(["restoreFocusOwner", "preventDefault"]);
  });

  it("a root popup alone: Escape #1 closes it to the trigger, #2 leaves with a restore", () => {
    const opened = run(menus, [...altTap, down("ArrowDown")]);
    const first = run(menus, [down("Escape")], opened.state);
    const second = run(menus, [down("Escape")], first.state);

    expect(first.state).toMatchObject({ openKey: null, focusKey: "0" });
    expect(first.all).not.toContain("restoreFocusOwner");
    expect(second.state).toEqual(inactiveMenuState);
    expect(second.all).toContain("restoreFocusOwner");
  });

  it("a menu opened with the mouse: Escape closes it in one step (and restores)", () => {
    const pointerOpen = pointerToggleTopLevel(inactiveMenuState, menus[0]).state;

    expect(pointerOpen.focusKey).toBeNull();
    const result = run(menus, [down("Escape")], pointerOpen);

    expect(result.state).toEqual(inactiveMenuState);
    expect(result.all).toContain("restoreFocusOwner");
  });

  it("Right on a leaf in a nested popup stays; Left/Right at the root popup switch menus", () => {
    const nestedLeaf = {
      ...inactiveMenuState,
      openKey: "0",
      barKey: "0",
      submenuKeys: [importKey],
      focusKey: bulkKey
    };

    expect(run(menus, [down("ArrowRight")], nestedLeaf).state.focusKey).toBe(bulkKey);
  });

  it("works at any depth (a synthetic 3-level menu)", () => {
    const deep: TopLevel[] = [
      {
        kind: "submenu",
        key: "0",
        label: "Deep",
        mnemonic: "D",
        items: [
          {
            kind: "submenu",
            key: "0/0",
            label: "L1",
            items: [
              {
                kind: "submenu",
                key: "0/0/0",
                label: "L2",
                items: [
                  {
                    kind: "item",
                    key: "0/0/0/0",
                    label: "Leaf",
                    disabled: false,
                    target: { type: "command", commandId: "deep.leaf" }
                  }
                ]
              }
            ]
          }
        ]
      }
    ];
    let state = run(deep, [down("d", { altKey: true })]).state;
    expect(state.focusKey).toBe("0/0");
    state = run(deep, [down("ArrowRight")], state).state;
    expect(state).toMatchObject({ focusKey: "0/0/0", submenuKeys: ["0/0"] });
    state = run(deep, [down("ArrowRight")], state).state;
    expect(state).toMatchObject({ focusKey: "0/0/0/0", submenuKeys: ["0/0", "0/0/0"] });
    state = run(deep, [down("Escape")], state).state;
    expect(state).toMatchObject({ focusKey: "0/0/0", submenuKeys: ["0/0"] });
    state = run(deep, [down("ArrowLeft")], state).state;
    expect(state).toMatchObject({ focusKey: "0/0", submenuKeys: [] });
    expect(ancestorSubmenuKeys("0/0/0/0")).toEqual(["0/0", "0/0/0"]);
  });
});

describe("accelerators and Tab while the menu is active (#665)", () => {
  const menus = realMenus();
  const active = openFile(menus, [down("ArrowDown")]).state;

  it.each([
    ["F1", {}],
    ["F12", {}],
    ["p", { ctrlKey: true }],
    ["s", { ctrlKey: true }],
    ["w", { ctrlKey: true }],
    [",", { ctrlKey: true }],
    ["c", { ctrlKey: true }],
    ["x", { ctrlKey: true }]
  ] as const)(
    "%s: the menu closes and restores focus first; the event is NOT consumed",
    (key, modifiers) => {
      const result = run(menus, [down(key, modifiers)], active);

      expect(result.state).toEqual(inactiveMenuState);
      expect(result.all).toEqual(["restoreFocusOwner"]);
      expect(result.all).not.toContain("preventDefault");
      expect(result.all).not.toContain("invoke");
    }
  );

  it("shortcuts do nothing while the menu is inactive", () => {
    const result = run(menus, [down("F1"), down("p", { ctrlKey: true })]);

    expect(result.all).toEqual([]);
  });

  it("Tab leaves the menu (restoring focus) and is not trapped or consumed", () => {
    for (const shiftKey of [false, true]) {
      const result = run(menus, [down("Tab", { shiftKey })], active);

      expect(result.state).toEqual(inactiveMenuState);
      expect(result.all).toEqual(["restoreFocusOwner"]);
    }
  });

  it("a modal blocks every key (the component closes the menu separately)", () => {
    const result = run(menus, [down("ArrowDown")], active, { blocked: true });

    expect(result.state.focusKey).toBe(active.focusKey);
    expect(result.all).toEqual([]);
  });
});

describe("pointer steps keep the #663 behavior (#665)", () => {
  const menus = realMenus();

  it("toggle opens and closes; hover switches only while open", () => {
    const opened = pointerToggleTopLevel(inactiveMenuState, menus[0]);
    expect(opened.state.openKey).toBe("0");
    expect(opened.state.focusKey).toBeNull(); // the mouse never moves DOM focus
    expect(opened.effects).toEqual([{ type: "captureFocusOwner" }]);

    expect(pointerToggleTopLevel(opened.state, menus[0]).state).toEqual(inactiveMenuState);
    expect(pointerHoverTopLevel(inactiveMenuState, menus[1]).state).toEqual(inactiveMenuState);
    expect(pointerHoverTopLevel(opened.state, menus[2]).state.openKey).toBe("2");
  });

  it("hover opens / closes nested submenus; clicking a leaf restores then invokes", () => {
    const state = pointerToggleTopLevel(inactiveMenuState, menus[0]).state;
    const importEntry = menus[0].items.find((entry) => entry.kind === "submenu")!;
    const leaf = menus[0].items.find((entry) => entry.kind === "item" && !entry.disabled)!;

    const hovered = pointerHoverEntry(state, importEntry).state;
    expect(hovered.submenuKeys).toEqual([importEntry.key]);
    expect(pointerHoverEntry(hovered, leaf).state.submenuKeys).toEqual([]);

    const click = pointerClickEntry(hovered, leaf);
    expect(click.state).toEqual(inactiveMenuState);
    expect(click.effects.map((effect) => effect.type)).toEqual([
      "restoreFocusOwner",
      "invoke"
    ]);
  });

  it("clicking a disabled item does nothing and keeps the menu open", () => {
    const m = realMenus("en", [editorCommandIds.saveDocument]);
    const state = pointerToggleTopLevel(inactiveMenuState, m[0]).state;
    const save = m[0].items.find((entry) => entry.kind === "item" && entry.label === "Save")!;
    const result = pointerClickEntry(state, save);

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });

  it("closeMenu(restore=false) never restores (outside click / blur / modal)", () => {
    const open = pointerToggleTopLevel(inactiveMenuState, menus[0]).state;

    expect(closeMenu(open, false).effects).toEqual([]);
    expect(closeMenu(open, true).effects).toEqual([{ type: "restoreFocusOwner" }]);
    expect(closeMenu(inactiveMenuState, true).effects).toEqual([]);
  });
});
