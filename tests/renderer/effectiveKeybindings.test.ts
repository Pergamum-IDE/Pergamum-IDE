// @vitest-environment happy-dom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getEffectiveKeybindingRows,
  loadEffectiveKeybindingsFromMain,
  resetEffectiveKeybindings,
  setEffectiveKeybindings
} from "../../src/renderer/keybindings/effectiveKeybindingStore";
import {
  createPergamumEditorKeymapExtension,
  listEditorKeybindingDescriptors
} from "../../src/renderer/keybindings/codeMirrorKeymap";
import { EDITOR_KEYMAP_COMMAND_IDS } from "../../src/renderer/keybindings/editorKeybindingHandlers";
import {
  createRendererShortcutBindings,
  matchRendererShortcut,
  rendererShortcutCommandIds
} from "../../src/renderer/keybindings/rendererShortcuts";
import {
  catalogKeysForCommand,
  eventMatchesCatalogCommand
} from "../../src/renderer/keybindings/catalogKeyMatch";
import { shouldHandleTabSwitchShortcut } from "../../src/renderer/editorTabShortcuts";
import {
  resolveDefaultKeybindings,
  resolveEffectiveKeybindings,
  type PergamumPlatform,
  type UserKeybindingEntry
} from "../../src/shared/keybindings";

function effectiveRows(platform: PergamumPlatform, entries: UserKeybindingEntry[]) {
  return resolveEffectiveKeybindings({ platform, userEntries: entries }).keybindings;
}

function ev(
  key: string,
  modifiers: Partial<Record<"ctrlKey" | "metaKey" | "shiftKey" | "altKey", boolean>> = {}
) {
  return { key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...modifiers };
}

afterEach(() => {
  resetEffectiveKeybindings();
  vi.restoreAllMocks();
  delete (window as unknown as { pergamum?: unknown }).pergamum;
});

describe("effective keybinding store (#645)", () => {
  it("defaults to the shipped rows, stable between calls", () => {
    const first = getEffectiveKeybindingRows("win32");
    expect(first).toEqual(resolveDefaultKeybindings("win32"));
    expect(getEffectiveKeybindingRows("win32")).toBe(first);
  });

  it("returns the stored rows only for the platform they were resolved for", () => {
    const rows = effectiveRows("win32", [{ key: "Mod-Alt-9", command: "editor.markdown.bold" }]);
    setEffectiveKeybindings("win32", rows);
    expect(getEffectiveKeybindingRows("win32")).toBe(rows);
    expect(getEffectiveKeybindingRows("darwin")).toEqual(resolveDefaultKeybindings("darwin"));
  });

  it("reset restores the defaults (test API)", () => {
    setEffectiveKeybindings(
      "win32",
      effectiveRows("win32", [{ key: "Mod-Alt-9", command: "editor.markdown.bold" }])
    );
    resetEffectiveKeybindings();
    expect(getEffectiveKeybindingRows("win32")).toEqual(resolveDefaultKeybindings("win32"));
  });
});

describe("loadEffectiveKeybindingsFromMain (#645)", () => {
  function installBridge(getEffectiveKeybindings: () => Promise<unknown>) {
    (window as unknown as { pergamum: unknown }).pergamum = {
      keybindings: { getEffectiveKeybindings }
    };
  }

  it("stores the effective rows from the main process", async () => {
    const rows = effectiveRows("win32", [{ key: "Mod-Alt-9", command: "editor.markdown.bold" }]);
    installBridge(async () => ({ platform: "win32", keybindings: rows, diagnostics: [] }));
    await expect(loadEffectiveKeybindingsFromMain()).resolves.toBe(true);
    expect(getEffectiveKeybindingRows("win32")).toEqual(rows);
  });

  it("falls back to the defaults when the IPC fails, rejects or replies garbage", async () => {
    installBridge(async () => {
      throw new Error("ipc down");
    });
    await expect(loadEffectiveKeybindingsFromMain()).resolves.toBe(false);
    expect(getEffectiveKeybindingRows("win32")).toEqual(resolveDefaultKeybindings("win32"));

    installBridge(async () => ({ nope: true }));
    await expect(loadEffectiveKeybindingsFromMain()).resolves.toBe(false);
    installBridge(async () => undefined);
    await expect(loadEffectiveKeybindingsFromMain()).resolves.toBe(false);
    expect(getEffectiveKeybindingRows("win32")).toEqual(resolveDefaultKeybindings("win32"));
  });

  it("falls back to the defaults without a preload bridge", async () => {
    await expect(loadEffectiveKeybindingsFromMain()).resolves.toBe(false);
    expect(getEffectiveKeybindingRows("linux")).toEqual(resolveDefaultKeybindings("linux"));
  });
});

describe("no keybindings.json: #641-#644 behavior is unchanged (#645)", () => {
  it.each(["win32", "linux", "darwin"] as const)(
    "%s: an empty effective set produces the same renderer, editor and lookup data as the defaults",
    (platform) => {
      const beforeRenderer = createRendererShortcutBindings(platform);
      const beforeEditor = listEditorKeybindingDescriptors(platform, EDITOR_KEYMAP_COMMAND_IDS);
      const beforeKeys = catalogKeysForCommand("glossary.completion.open", platform);

      setEffectiveKeybindings(platform, effectiveRows(platform, []));

      expect(createRendererShortcutBindings(platform)).toEqual(beforeRenderer);
      expect(listEditorKeybindingDescriptors(platform, EDITOR_KEYMAP_COMMAND_IDS)).toEqual(
        beforeEditor
      );
      expect(catalogKeysForCommand("glossary.completion.open", platform)).toEqual(beforeKeys);
    }
  );
});

describe("a user override reaches every registration layer (#645)", () => {
  it("CodeMirror: the generated editor binding follows the user key (and only it)", () => {
    const rows = effectiveRows("win32", [
      { key: "Mod-Alt-9", command: "editor.markdown.bold" }
    ]);
    setEffectiveKeybindings("win32", rows);

    const descriptors = listEditorKeybindingDescriptors("win32", EDITOR_KEYMAP_COMMAND_IDS);
    const bold = descriptors.filter((d) => d.commandId === "editor.markdown.bold");
    expect(bold.map((d) => d.codeMirrorKey)).toEqual(["Ctrl-Alt-9"]);

    const run = vi.fn(() => true);
    const view = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: "x",
        extensions: [
          createPergamumEditorKeymapExtension({
            platform: "win32",
            handlers: { "editor.markdown.bold": run },
            commandIds: ["editor.markdown.bold"]
          })
        ]
      })
    });
    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", { key: "b", code: "KeyB", ctrlKey: true, bubbles: true, cancelable: true })
    );
    expect(run).not.toHaveBeenCalled();
    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", { key: "9", code: "Digit9", ctrlKey: true, altKey: true, bubbles: true, cancelable: true })
    );
    expect(run).toHaveBeenCalledOnce();
    view.destroy();
  });

  it("renderer listener: the palette shortcut follows the user key", () => {
    const id = rendererShortcutCommandIds.commandPaletteFile;
    expect(matchRendererShortcut(ev("o", { ctrlKey: true }), id, "win32")).toBe(true);

    setEffectiveKeybindings(
      "win32",
      effectiveRows("win32", [{ key: "Mod-Alt-9", command: id }])
    );
    expect(matchRendererShortcut(ev("o", { ctrlKey: true }), id, "win32")).toBe(false);
    expect(
      matchRendererShortcut(ev("9", { ctrlKey: true, altKey: true }), id, "win32")
    ).toBe(true);
    expect(
      createRendererShortcutBindings("win32").find((b) => b.commandId === id)?.key
    ).toBe("Mod-Alt-9");
  });

  it("window listeners: tab switching and other catalog matchers follow the user key", () => {
    setEffectiveKeybindings(
      "win32",
      effectiveRows("win32", [
        { key: "Mod-Alt-9", command: "workspace.tabs.previous" },
        { key: "Mod-Alt-x", command: "glossary.completion.open" }
      ])
    );
    const target = document.body;
    expect(
      shouldHandleTabSwitchShortcut({ ...ev("ArrowLeft", { altKey: true }), target }, false, "win32")
    ).toBeNull();
    expect(
      shouldHandleTabSwitchShortcut(
        { ...ev("9", { ctrlKey: true, altKey: true }), target },
        false,
        "win32"
      )
    ).toBe("previous");
    expect(
      eventMatchesCatalogCommand(
        { ...ev("x", { ctrlKey: true, altKey: true }), code: "KeyX" },
        "glossary.completion.open",
        "win32"
      )
    ).toBe(true);
  });

  it("an unbound renderer shortcut no longer fires", () => {
    const id = rendererShortcutCommandIds.commandPaletteFile;
    setEffectiveKeybindings(
      "win32",
      effectiveRows("win32", [{ key: "Mod-o", command: `-${id}` }])
    );
    expect(matchRendererShortcut(ev("o", { ctrlKey: true }), id, "win32")).toBe(false);
  });

  it("an unassigned (null) default stays absent unless the user binds it", () => {
    const heading = rendererShortcutCommandIds.commandPaletteHeading;
    setEffectiveKeybindings("darwin", effectiveRows("darwin", []));
    expect(
      matchRendererShortcut(ev("#", { metaKey: true, shiftKey: true }), heading, "darwin")
    ).toBe(false);
  });

  it("reserved reload keys never reach a layer, even if the user asks for them", () => {
    setEffectiveKeybindings(
      "win32",
      effectiveRows("win32", [{ key: "F5", command: "editor.markdown.bold" }])
    );
    expect(catalogKeysForCommand("editor.markdown.bold", "win32")).toEqual(["Mod-b"]);
  });
});

// Keep beforeEach import used.
beforeEach(() => {
  resetEffectiveKeybindings();
});
