// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { history, redo, undo } from "@codemirror/commands";
import {
  MarkdownEditor,
  markdownCalloutInsertionTransactionSpec,
  type MarkdownEditorParagraphIndentController
} from "../../src/renderer/MarkdownEditor";
import {
  buildMarkdownCalloutBlock,
  markdownCalloutMarker,
  markdownCalloutTypes,
  type MarkdownCalloutType
} from "../../src/shared/markdownCalloutMarkup";
import { markdownPreviewRenderer } from "../../src/renderer/preview/markdownPreviewRenderer";

/** `|` marks the cursor; `[` / `]` mark a selection's anchor / head. */
function stateFrom(marked: string, extensions: Extension = []) {
  const cursor = marked.indexOf("|");
  if (cursor >= 0) {
    return EditorState.create({
      doc: marked.replace("|", ""),
      selection: EditorSelection.cursor(cursor),
      extensions
    });
  }
  const anchor = marked.indexOf("[");
  const head = marked.indexOf("]") - 1;
  return EditorState.create({
    doc: marked.replace("[", "").replace("]", ""),
    selection: EditorSelection.range(anchor, head),
    extensions
  });
}

function insert(marked: string, type: MarkdownCalloutType): { doc: string; cursor: number } {
  const state = stateFrom(marked);
  const next = state.update(markdownCalloutInsertionTransactionSpec(state, type)).state;
  return { doc: next.doc.toString(), cursor: next.selection.main.head };
}

function withCursorMark(result: { doc: string; cursor: number }): string {
  return result.doc.slice(0, result.cursor) + "|" + result.doc.slice(result.cursor);
}

describe("buildMarkdownCalloutBlock (#570)", () => {
  it("uses uppercase markers for all five types", () => {
    expect(markdownCalloutTypes.map(markdownCalloutMarker)).toEqual([
      "NOTE",
      "TIP",
      "IMPORTANT",
      "WARNING",
      "CAUTION"
    ]);
  });

  it("builds an empty template with the cursor after the body line's '> '", () => {
    expect(buildMarkdownCalloutBlock("note", [])).toEqual({
      text: "> [!NOTE]\n> ",
      selectionOffsetFromInsertStart: "> [!NOTE]\n> ".length
    });
  });

  it("quotes every body line, blank lines as '> '", () => {
    expect(buildMarkdownCalloutBlock("tip", ["一行目", "", "三行目"]).text).toBe(
      "> [!TIP]\n> 一行目\n> \n> 三行目"
    );
  });
});

describe("markdownCalloutInsertionTransactionSpec (#570)", () => {
  describe("no selection", () => {
    it.each(markdownCalloutTypes)("inserts the %s template and puts the cursor on the body line", (type) => {
      const marker = markdownCalloutMarker(type);
      expect(withCursorMark(insert("|", type))).toBe(`> [!${marker}]\n> |`);
    });

    it("pads with blank lines between surrounding paragraphs", () => {
      expect(withCursorMark(insert("前の段落\n|\n次の段落", "note"))).toBe(
        "前の段落\n\n> [!NOTE]\n> |\n\n次の段落"
      );
    });

    it("never starts the callout mid-line", () => {
      expect(withCursorMark(insert("前半|後半", "note"))).toBe(
        "前半\n\n> [!NOTE]\n> |\n\n後半"
      );
    });
  });

  describe("selection", () => {
    it.each(markdownCalloutTypes)("wraps a single selected line as a %s callout", (type) => {
      const marker = markdownCalloutMarker(type);
      expect(insert("[この伏線は第七章で回収する。]", type).doc).toBe(
        `> [!${marker}]\n> この伏線は第七章で回収する。`
      );
    });

    it("wraps multiple lines and leaves the cursor at the end of the callout", () => {
      const result = insert(
        "[この伏線は第七章で回収する。\n第三章の描写と矛盾しないようにする。]",
        "important"
      );
      expect(withCursorMark(result)).toBe(
        "> [!IMPORTANT]\n> この伏線は第七章で回収する。\n> 第三章の描写と矛盾しないようにする。|"
      );
    });

    it("preserves blank lines inside the selection as '> '", () => {
      expect(insert("[一行目\n\n三行目]", "note").doc).toBe(
        "> [!NOTE]\n> 一行目\n> \n> 三行目"
      );
    });

    it("expands a partial-line selection to the touched line range", () => {
      expect(insert("前の段落\n\nこの[伏線は第七章\nで回]収する。\n\n後の段落", "warning").doc).toBe(
        "前の段落\n\n> [!WARNING]\n> この伏線は第七章\n> で回収する。\n\n後の段落"
      );
    });

    it("works for a backward selection too", () => {
      const state = EditorState.create({
        doc: "一行目\n二行目",
        selection: EditorSelection.range(7, 1)
      });
      const next = state.update(markdownCalloutInsertionTransactionSpec(state, "tip")).state;
      expect(next.doc.toString()).toBe("> [!TIP]\n> 一行目\n> 二行目");
    });

    it("does not include a following line when the selection ends at its column 0", () => {
      expect(insert("[一行目\n]二行目", "caution").doc).toBe(
        "> [!CAUTION]\n> 一行目\n\n二行目"
      );
    });

    it("quotes an existing blockquote again (nested), without upgrading it", () => {
      expect(insert("[> 既存の引用]", "note").doc).toBe("> [!NOTE]\n> > 既存の引用");
    });

    it("pads against an adjacent paragraph so following text is not a lazy continuation", () => {
      expect(insert("前\n[本文]\n後", "note").doc).toBe("前\n\n> [!NOTE]\n> 本文\n\n後");
    });
  });

  it("is a single undoable / redoable transaction", () => {
    let state = stateFrom("前の段落\n\n[一行目\n\n三行目]\n\n後の段落", [history()]);
    const before = state.doc.toString();
    state = state.update(markdownCalloutInsertionTransactionSpec(state, "note")).state;
    const after = state.doc.toString();
    expect(after).not.toBe(before);

    const dispatch = (tr: Parameters<Parameters<typeof undo>[0]["dispatch"]>[0]) => {
      state = tr.state;
    };
    expect(undo({ state, dispatch })).toBe(true);
    expect(state.doc.toString()).toBe(before);
    expect(undo({ state, dispatch })).toBe(false);
    expect(redo({ state, dispatch })).toBe(true);
    expect(state.doc.toString()).toBe(after);
  });

  it("produces Markdown that #568 renders as a callout", () => {
    const { doc } = insert("[この伏線は第七章で回収する。\n\n三行目]\n\n通常本文です。", "important");
    const html = markdownPreviewRenderer.render(doc, { previewRenderer: "markdown" });
    expect(html).toContain("markdown-callout markdown-callout-important");
    expect(html).toContain("この伏線は第七章で回収する。");
    expect(html).toContain("三行目");
    expect(html).not.toContain("[!IMPORTANT]");
    expect(html).toMatch(/<\/div>\n<\/div>\n<p[^>]*>通常本文です。<\/p>/);
  });
});

describe("MarkdownEditor insertCallout controller (#570)", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    if (root) {
      act(() => root!.unmount());
      root = null;
    }
    container?.remove();
    container = null;
  });

  function mount(value: string, readOnly = false) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    let controller: MarkdownEditorParagraphIndentController | null = null;
    act(() => {
      root!.render(
        React.createElement(MarkdownEditor, {
          value,
          readOnly,
          onChange: () => undefined,
          onParagraphIndentControllerChange: (next) => {
            controller = next;
          }
        })
      );
    });
    return () => controller;
  }

  it("inserts the template into the live editor buffer", () => {
    const controller = mount("");
    let result = false;
    act(() => {
      result = controller()!.insertCallout("note");
    });
    expect(result).toBe(true);
    expect(controller()!.getBufferText()).toBe("> [!NOTE]\n> ");
    expect(controller()!.getSelection()).toEqual({ from: 12, to: 12 });
  });

  it("refuses to edit a read-only document", () => {
    const controller = mount("本文", true);
    let result = true;
    act(() => {
      result = controller()!.insertCallout("warning");
    });
    expect(result).toBe(false);
    expect(controller()!.getBufferText()).toBe("本文");
  });
});

describe("App callout toolbar wiring (#570)", () => {
  const appSource = readFileSync("src/renderer/App.tsx", "utf8");

  it("gates the callout dropdown with the shared Markdown toolbar gate (Markdown editor, not a special tab, not read-only)", () => {
    expect(appSource).toContain(
      "const canUseMarkdownToolbarCommands =\n    activeEditorIsMarkdown && !isReadOnlyProjectOwnedEditor;"
    );
    expect(appSource).toContain(
      "canInsertCallout={canUseMarkdownToolbarCommands}"
    );
  });

  it("routes the chosen type to the active editor's controller", () => {
    expect(appSource).toContain(
      "paragraphIndentControllerRef.current?.insertCallout(type);"
    );
  });
});
