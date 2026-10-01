// @vitest-environment happy-dom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PERGAMUM_EDITOR_KEYMAP_SCOPE,
  createPergamumEditorKeyBindings,
  createPergamumEditorKeymapExtension,
  findMissingEditorKeybindingHandlers,
  listEditorKeybindingDescriptors
} from "../../src/renderer/keybindings/codeMirrorKeymap";
import {
  EDITOR_KEYMAP_COMMAND_IDS,
  createDefaultEditorKeybindingHandlers
} from "../../src/renderer/keybindings/editorKeybindingHandlers";
import type { PergamumPlatform } from "../../src/shared/keybindings";

const platforms: readonly PergamumPlatform[] = ["win32", "linux", "darwin"];

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
});

function mount(extension: ReturnType<typeof createPergamumEditorKeymapExtension>) {
  view = new EditorView({
    parent: document.body,
    state: EditorState.create({ doc: "text", extensions: [extension] })
  });
  return view;
}

function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init
  });
}

describe("generated editor keymap snapshots (#641)", () => {
  it.each(platforms)("%s: descriptors", (platform) => {
    expect(
      listEditorKeybindingDescriptors(platform, EDITOR_KEYMAP_COMMAND_IDS)
    ).toMatchSnapshot();
  });
});

describe("createPergamumEditorKeyBindings (#641)", () => {
  it("creates one scoped binding per catalog key that has a handler", () => {
    const handlers = {
      "editor.markdown.bold": () => true,
      "editor.markdown.italic": () => true
    };
    const bindings = createPergamumEditorKeyBindings({
      platform: "win32",
      handlers
    });
    expect(bindings.map((b) => b.key).sort()).toEqual(["Ctrl-b", "Ctrl-i"]);
    expect(bindings.every((b) => b.scope === PERGAMUM_EDITOR_KEYMAP_SCOPE)).toBe(true);
  });

  it("converts keys per platform", () => {
    const handlers = { "editor.markdown.bold": () => true };
    expect(
      createPergamumEditorKeyBindings({ platform: "darwin", handlers }).map((b) => b.key)
    ).toEqual(["Cmd-b"]);
    expect(
      createPergamumEditorKeyBindings({ platform: "linux", handlers }).map((b) => b.key)
    ).toEqual(["Ctrl-b"]);
  });

  it("skips commands without a handler and reports them", () => {
    const handlers = { "editor.markdown.bold": () => true };
    const bindings = createPergamumEditorKeyBindings({
      platform: "win32",
      handlers,
      commandIds: ["editor.markdown.bold", "editor.markdown.italic"]
    });
    expect(bindings).toHaveLength(1);
    expect(
      findMissingEditorKeybindingHandlers({
        platform: "win32",
        handlers,
        commandIds: ["editor.markdown.bold", "editor.markdown.italic"]
      })
    ).toEqual(["editor.markdown.italic"]);
  });

  it("darwin null assignments produce no binding (blockquote is Cmd-Alt-q there)", () => {
    const darwin = listEditorKeybindingDescriptors(
      "darwin",
      EDITOR_KEYMAP_COMMAND_IDS
    ).map((d) => d.codeMirrorKey);
    expect(darwin).toContain("Cmd-Alt-q");
    expect(darwin).not.toContain("Cmd-Shift-q");
  });

  it("F3 / Shift+F3 are not part of the CodeMirror keymap (window listener, #643)", () => {
    expect(EDITOR_KEYMAP_COMMAND_IDS).not.toContain("editor.find.next");
    expect(EDITOR_KEYMAP_COMMAND_IDS).not.toContain("editor.find.previous");
  });

  it("the production handlers cover every command in the keymap", () => {
    for (const platform of platforms) {
      expect(
        findMissingEditorKeybindingHandlers({
          platform,
          handlers: createDefaultEditorKeybindingHandlers({
            glossaryCompletion: { getConfig: () => null, isReadOnly: () => false }
          }),
          commandIds: EDITOR_KEYMAP_COMMAND_IDS
        })
      ).toEqual([]);
    }
  });
});

describe("createPergamumEditorKeymapExtension dispatch guards (#641)", () => {
  it("runs the handler and consumes the event", () => {
    const run = vi.fn(() => true);
    const v = mount(
      createPergamumEditorKeymapExtension({
        platform: "win32",
        handlers: { "editor.markdown.bold": run },
        commandIds: ["editor.markdown.bold"]
      })
    );
    const event = keydown({ key: "b", code: "KeyB", ctrlKey: true });
    v.contentDOM.dispatchEvent(event);
    expect(run).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not consume the key when the handler declines", () => {
    const v = mount(
      createPergamumEditorKeymapExtension({
        platform: "win32",
        handlers: { "editor.markdown.bold": () => false },
        commandIds: ["editor.markdown.bold"]
      })
    );
    const event = keydown({ key: "b", code: "KeyB", ctrlKey: true });
    v.contentDOM.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("never runs during IME composition (event.isComposing / compositionstart)", () => {
    const run = vi.fn(() => true);
    const v = mount(
      createPergamumEditorKeymapExtension({
        platform: "win32",
        handlers: { "editor.markdown.bold": run },
        commandIds: ["editor.markdown.bold"]
      })
    );
    v.contentDOM.dispatchEvent(
      keydown({ key: "b", code: "KeyB", ctrlKey: true, isComposing: true })
    );
    expect(run).not.toHaveBeenCalled();

    v.contentDOM.dispatchEvent(new Event("compositionstart", { bubbles: true }));
    v.contentDOM.dispatchEvent(keydown({ key: "b", code: "KeyB", ctrlKey: true }));
    expect(run).not.toHaveBeenCalled();

    v.contentDOM.dispatchEvent(new Event("compositionend", { bubbles: true }));
    v.contentDOM.dispatchEvent(keydown({ key: "b", code: "KeyB", ctrlKey: true }));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("re-checks the exact modifier set (CapsLock Ctrl+Shift+R must not run Ruby)", () => {
    const run = vi.fn(() => true);
    const v = mount(
      createPergamumEditorKeymapExtension({
        platform: "win32",
        handlers: { "editor.markdown.insertRuby": run },
        commandIds: ["editor.markdown.insertRuby"]
      })
    );
    // CodeMirror ignores Shift when matching a character key.
    v.contentDOM.dispatchEvent(
      keydown({ key: "r", code: "KeyR", ctrlKey: true, shiftKey: true })
    );
    v.contentDOM.dispatchEvent(
      keydown({ key: "r", code: "KeyR", ctrlKey: true, altKey: true })
    );
    expect(run).not.toHaveBeenCalled();
    v.contentDOM.dispatchEvent(keydown({ key: "r", code: "KeyR", ctrlKey: true }));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("darwin: Cmd matches Mod, bare Ctrl and Ctrl+Cmd do not", () => {
    const run = vi.fn(() => true);
    const v = mount(
      createPergamumEditorKeymapExtension({
        platform: "darwin",
        handlers: { "editor.markdown.bold": run },
        commandIds: ["editor.markdown.bold"]
      })
    );
    v.contentDOM.dispatchEvent(keydown({ key: "b", code: "KeyB", ctrlKey: true }));
    v.contentDOM.dispatchEvent(
      keydown({ key: "b", code: "KeyB", ctrlKey: true, metaKey: true })
    );
    expect(run).not.toHaveBeenCalled();
    v.contentDOM.dispatchEvent(keydown({ key: "b", code: "KeyB", metaKey: true }));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("darwin: Cmd+Option+Q fires blockquote; Cmd+Shift+Q does not", () => {
    const run = vi.fn(() => true);
    const v = mount(
      createPergamumEditorKeymapExtension({
        platform: "darwin",
        handlers: { "editor.markdown.insertBlockquote": run },
        commandIds: ["editor.markdown.insertBlockquote"]
      })
    );
    v.contentDOM.dispatchEvent(
      keydown({ key: "q", code: "KeyQ", metaKey: true, shiftKey: true })
    );
    expect(run).not.toHaveBeenCalled();
    // Option composes a character ("œ"); the physical key still matches.
    v.contentDOM.dispatchEvent(
      keydown({ key: "œ", code: "KeyQ", metaKey: true, altKey: true })
    );
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("darwin: Option-composed keys still match on the physical key (Shift+Option+M, Option+`)", () => {
    const toggle = vi.fn(() => true);
    const completion = vi.fn(() => true);
    const v = mount(
      createPergamumEditorKeymapExtension({
        platform: "darwin",
        handlers: {
          "editor.tabCapture.toggle": toggle,
          "glossary.completion.open": completion
        },
        commandIds: ["editor.tabCapture.toggle", "glossary.completion.open"]
      })
    );
    // Shift+Option+M composes "Â"; Option+` is a dead key.
    v.contentDOM.dispatchEvent(
      keydown({ key: "Â", code: "KeyM", altKey: true, shiftKey: true })
    );
    expect(toggle).toHaveBeenCalledTimes(1);
    v.contentDOM.dispatchEvent(
      keydown({ key: "Dead", code: "Backquote", altKey: true })
    );
    expect(completion).toHaveBeenCalledTimes(1);

    // Ctrl+Space / Cmd+Space / plain Option+M are not glossary completion /
    // tab capture on darwin.
    v.contentDOM.dispatchEvent(
      keydown({ key: " ", code: "Space", ctrlKey: true })
    );
    v.contentDOM.dispatchEvent(
      keydown({ key: " ", code: "Space", metaKey: true })
    );
    v.contentDOM.dispatchEvent(keydown({ key: "µ", code: "KeyM", altKey: true }));
    expect(completion).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("win32: Ctrl+M toggles, Ctrl+Space opens glossary completion", () => {
    const toggle = vi.fn(() => true);
    const completion = vi.fn(() => true);
    const v = mount(
      createPergamumEditorKeymapExtension({
        platform: "win32",
        handlers: {
          "editor.tabCapture.toggle": toggle,
          "glossary.completion.open": completion
        },
        commandIds: ["editor.tabCapture.toggle", "glossary.completion.open"]
      })
    );
    v.contentDOM.dispatchEvent(keydown({ key: "m", code: "KeyM", ctrlKey: true }));
    v.contentDOM.dispatchEvent(keydown({ key: " ", code: "Space", ctrlKey: true }));
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(completion).toHaveBeenCalledTimes(1);
  });

  it("stopPropagation is applied only to the listed commands (F2 rename)", () => {
    const v = mount(
      createPergamumEditorKeymapExtension({
        platform: "win32",
        handlers: {
          "editor.document.rename": () => true,
          "editor.markdown.bold": () => true
        },
        commandIds: ["editor.document.rename", "editor.markdown.bold"],
        stopPropagationCommandIds: ["editor.document.rename"]
      })
    );
    const f2 = keydown({ key: "F2", code: "F2" });
    const stopF2 = vi.spyOn(f2, "stopPropagation");
    v.contentDOM.dispatchEvent(f2);
    expect(stopF2).toHaveBeenCalled();

    const bold = keydown({ key: "b", code: "KeyB", ctrlKey: true });
    const stopBold = vi.spyOn(bold, "stopPropagation");
    v.contentDOM.dispatchEvent(bold);
    expect(stopBold).not.toHaveBeenCalled();
  });

  it("does not leak bindings into an editor built without the extension", () => {
    const run = vi.fn(() => true);
    const v = mount(
      createPergamumEditorKeymapExtension({
        platform: "win32",
        handlers: { "editor.markdown.bold": run },
        commandIds: []
      })
    );
    v.contentDOM.dispatchEvent(keydown({ key: "b", code: "KeyB", ctrlKey: true }));
    expect(run).not.toHaveBeenCalled();
  });
});
