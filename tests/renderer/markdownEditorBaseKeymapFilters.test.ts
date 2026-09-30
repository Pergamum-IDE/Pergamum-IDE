// @vitest-environment happy-dom
import { searchKeymap, searchPanelOpen } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import {
  NATIVE_SEARCH_PANEL_KEYS,
  REPLACED_INDENT_KEYS,
  createMarkdownEditorBaseSetup
} from "../../src/renderer/markdownEditorCodeMirrorSetup";
import {
  editorCommandIds
} from "../../src/shared/commandIds";
import {
  listCommonDefaultKeys,
  resolveDefaultKeybindings
} from "../../src/shared/keybindings";

/**
 * #641 Slice 3: the base setup's standard-keymap filters take their keys from
 * the keybinding catalog, and stay deliberately narrow.
 */

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
});

function mountBase(): EditorView {
  view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc: "hello world",
      extensions: createMarkdownEditorBaseSetup({ undoHistoryMinDepth: 100 })
    })
  });
  return view;
}

function ctrlKey(key: string, code: string): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key,
    code,
    ctrlKey: true,
    bubbles: true,
    cancelable: true
  });
}

describe("base keymap filters derived from the catalog (#641)", () => {
  it("native search panel openers are exactly Find (Mod-f), Find next (F3) and glossary-from-selection (Mod-g)", () => {
    expect([...NATIVE_SEARCH_PANEL_KEYS].sort()).toEqual(["F3", "Mod-f", "Mod-g"]);
  });

  it("the replaced indent keys are exactly the catalog's indent / outdent keys", () => {
    expect([...REPLACED_INDENT_KEYS].sort()).toEqual(["Mod-[", "Mod-]"]);
    expect(
      [...REPLACED_INDENT_KEYS].sort()
    ).toEqual(
      listCommonDefaultKeys([editorCommandIds.indent, editorCommandIds.outdent]).sort()
    );
  });

  it("each filtered key is a real @codemirror/search binding that Pergamum takes over", () => {
    const searchKeys = new Set(searchKeymap.map((binding) => binding.key));
    for (const key of NATIVE_SEARCH_PANEL_KEYS) {
      expect(searchKeys.has(key), key).toBe(true);
    }
  });

  it("does not open the native search panel from Mod-f (Pergamum's own Find owns it)", () => {
    const v = mountBase();
    v.contentDOM.dispatchEvent(ctrlKey("f", "KeyF"));
    expect(searchPanelOpen(v.state)).toBe(false);
  });

  it("keeps unrelated standard bindings: Mod-i (selectParentSyntax) still works when no Pergamum handler is installed", () => {
    // A generic "drop every key the catalog uses" filter would remove this.
    const italic = resolveDefaultKeybindings("linux").find(
      (binding) => binding.command === "editor.markdown.italic"
    );
    expect(italic?.key).toBe("Mod-i");
    const v = mountBase();
    const event = ctrlKey("i", "KeyI");
    v.contentDOM.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("F3 / Mod-g carry their Shift variants (findPrevious), which are removed with them", () => {
    for (const key of ["F3", "Mod-g"]) {
      const binding = searchKeymap.find((candidate) => candidate.key === key);
      expect(binding?.shift, key).toBeDefined();
    }
    expect(NATIVE_SEARCH_PANEL_KEYS.has("Shift-F3")).toBe(false);
  });

  it("keeps the other search bindings (Mod-d selectNextOccurrence, Mod-Alt-g gotoLine)", () => {
    const remaining = searchKeymap
      .filter((binding) => binding.key === undefined || !NATIVE_SEARCH_PANEL_KEYS.has(binding.key))
      .map((binding) => binding.key);
    expect(remaining).toEqual(expect.arrayContaining(["Mod-d", "Mod-Alt-g"]));
  });

  it("the base setup no longer binds Mod-] / Mod-[ itself (the editor keymap dispatcher does, #647)", () => {
    const v = mountBase();
    const event = new KeyboardEvent("keydown", {
      key: "]",
      code: "BracketRight",
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
    v.contentDOM.dispatchEvent(event);
    // CodeMirror's own generic indentMore is filtered out and nothing else
    // handles the key here.
    expect(event.defaultPrevented).toBe(false);
  });
});
