// @vitest-environment happy-dom
import React, { act } from "react";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  preventUnhandledReloadKey,
  useReloadKeyFallback
} from "../../src/renderer/reloadKeyFallback";
import {
  createRubyKeybindingHandlers,
  type MarkdownEditorRubyShortcutConfig
} from "../../src/renderer/editorRubyShortcuts";
import { keymapFor } from "./helpers/editorKeymapHarness";
import { stubRuntimePlatform } from "./helpers/runtimePlatform";
import { createPergamumEditorKeyBindings } from "../../src/renderer/keybindings/codeMirrorKeymap";
import { defaultKeybindings } from "../../src/shared/keybindings";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
}

describe("preventUnhandledReloadKey (#644)", () => {
  it("prevents an unhandled reload key on every platform (Mod-r, Mod-Shift-r, F5 variants)", () => {
    for (const [platform, mod] of [
      ["win32", { ctrlKey: true }],
      ["linux", { ctrlKey: true }],
      ["darwin", { metaKey: true }]
    ] as const) {
      for (const init of [
        { key: "r", ...mod },
        { key: "R", shiftKey: true, ...mod },
        { key: "F5" },
        { key: "F5", ...mod },
        { key: "F5", shiftKey: true }
      ]) {
        const event = keydown(init);
        expect(preventUnhandledReloadKey(event, platform), `${platform} ${init.key}`).toBe(true);
        expect(event.defaultPrevented).toBe(true);
      }
    }
  });

  it("does nothing when a handler already consumed the event, and never stops propagation", () => {
    const consumed = keydown({ key: "r", ctrlKey: true });
    consumed.preventDefault();
    const stop = vi.spyOn(consumed, "stopPropagation");
    expect(preventUnhandledReloadKey(consumed, "win32")).toBe(false);
    expect(stop).not.toHaveBeenCalled();

    const fresh = keydown({ key: "r", ctrlKey: true });
    const stopFresh = vi.spyOn(fresh, "stopPropagation");
    preventUnhandledReloadKey(fresh, "win32");
    expect(stopFresh).not.toHaveBeenCalled();
  });

  it("leaves ordinary shortcuts alone", () => {
    const event = keydown({ key: "s", ctrlKey: true });
    expect(preventUnhandledReloadKey(event, "win32")).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("reload fallback vs Ruby insertion (#644)", () => {
  let container: HTMLDivElement;
  let root: Root;
  let view: EditorView | null = null;
  let restorePlatform: (() => void) | null = null;

  function Harness() {
    useReloadKeyFallback();
    return null;
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<Harness />);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    view?.destroy();
    view = null;
    restorePlatform?.();
    restorePlatform = null;
  });

  function mountEditor(config: MarkdownEditorRubyShortcutConfig | null, readOnly = false) {
    view = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: "Hello world",
        selection: EditorSelection.single(0, 5),
        extensions: [
          EditorState.readOnly.of(readOnly),
          keymapFor({
            handlers: createRubyKeybindingHandlers(() => config),
            commandIds: ["editor.markdown.insertRuby"]
          })
        ]
      })
    });
    return view;
  }

  function rubyConfig(): MarkdownEditorRubyShortcutConfig {
    return {
      requestOpenRubyDialog: vi.fn(),
      notifyNoSelection: vi.fn(),
      notifyReadOnly: vi.fn(),
      notifyMultiLine: vi.fn()
    };
  }

  it("Mod-r in the editor still runs ruby insertion exactly once; the fallback then does nothing", () => {
    const config = rubyConfig();
    const v = mountEditor(config);
    const event = keydown({ key: "r", code: "KeyR", ctrlKey: true });
    const windowSeen: boolean[] = [];
    const listener = (e: Event) => windowSeen.push(e.defaultPrevented);
    window.addEventListener("keydown", listener);
    act(() => {
      v.contentDOM.dispatchEvent(event);
    });
    window.removeEventListener("keydown", listener);

    expect(config.requestOpenRubyDialog).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
    // Ruby consumed it before the window bubble listener ran.
    expect(windowSeen).toEqual([true]);
  });

  it("read-only editor: ruby keeps notifying (unchanged) and no reload can happen", () => {
    const config = rubyConfig();
    const v = mountEditor(config, true);
    const event = keydown({ key: "r", code: "KeyR", ctrlKey: true });
    act(() => {
      v.contentDOM.dispatchEvent(event);
    });
    expect(config.notifyReadOnly).toHaveBeenCalledOnce();
    expect(config.requestOpenRubyDialog).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("editor without a ruby config (e.g. glossary description): Mod-r is not reload", () => {
    const v = mountEditor(null);
    const event = keydown({ key: "r", code: "KeyR", ctrlKey: true });
    act(() => {
      v.contentDOM.dispatchEvent(event);
    });
    // Ruby declined, so the window fallback prevented the reload default.
    expect(event.defaultPrevented).toBe(true);
  });

  it("outside the editor, an unhandled Mod-r / Mod-Shift-r / F5 is prevented", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    for (const init of [
      { key: "r", ctrlKey: true },
      { key: "R", ctrlKey: true, shiftKey: true },
      { key: "F5" }
    ]) {
      const event = keydown(init);
      act(() => {
        input.dispatchEvent(event);
      });
      expect(event.defaultPrevented, init.key).toBe(true);
    }
    input.remove();
  });

  it("the catalog still generates Mod-r for ruby in the CodeMirror keymap", () => {
    expect(
      defaultKeybindings.find((entry) => entry.command === "editor.markdown.insertRuby")?.key
    ).toBe("Mod-r");
    for (const [platform, key] of [
      ["win32", "Ctrl-r"],
      ["linux", "Ctrl-r"],
      ["darwin", "Cmd-r"]
    ] as const) {
      const bindings = createPergamumEditorKeyBindings({
        platform,
        handlers: { "editor.markdown.insertRuby": () => true },
        commandIds: ["editor.markdown.insertRuby"]
      });
      expect(bindings.map((b) => b.key)).toEqual([key]);
    }
  });

  it("darwin: Cmd-r runs ruby, and the fallback does not double-handle", () => {
    restorePlatform = stubRuntimePlatform("macos");
    const config = rubyConfig();
    const v = mountEditor(config);
    const event = keydown({ key: "r", code: "KeyR", metaKey: true });
    act(() => {
      v.contentDOM.dispatchEvent(event);
    });
    expect(config.requestOpenRubyDialog).toHaveBeenCalledOnce();
  });
});
