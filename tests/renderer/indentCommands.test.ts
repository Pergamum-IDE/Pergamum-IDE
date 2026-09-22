// @vitest-environment happy-dom
import { EditorSelection, EditorState, type ChangeSpec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildLineChange,
  editorIndentKeymap,
  fencedCodeIndentUnitFacet,
  indentCommand,
  outdentCommand,
  planIndentTransaction,
  type IndentDirection
} from "../../src/renderer/indentCommands";
import { classifyLine } from "../../src/renderer/indentLineContext";
import { createMarkdownEditorBaseSetup } from "../../src/renderer/markdownEditorCodeMirrorSetup";
import { documentIsMarkdownFacet } from "../../src/renderer/plainTextIndentCommands";
import type { FencedCodeIndentUnit } from "../../src/shared/settings";

function stateFor(
  doc: string,
  cursor: number,
  options: { readOnly?: boolean } = {}
): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.single(cursor),
    extensions: [
      EditorState.allowMultipleSelections.of(true),
      ...(options.readOnly ? [EditorState.readOnly.of(true)] : [])
    ]
  });
}

describe("planIndentTransaction (#463)", () => {
  const directions: readonly IndentDirection[] = ["indent", "outdent"];

  it.each(directions)(
    "read-only editor: %s is a no-op, reason 'readonly', regardless of context",
    (direction) => {
      const state = stateFor("foo", 1, { readOnly: true });
      const plan = planIndentTransaction(state, direction);
      expect(plan.changes).toEqual([]);
      expect(plan.result).toEqual({ kind: "noop", reason: "readonly" });
    }
  );

  it.each(directions)(
    "blank line: %s is a no-op",
    (direction) => {
      const state = stateFor("\n\n", 1);
      const plan = planIndentTransaction(state, direction);
      expect(plan.changes).toEqual([]);
      expect(plan.result.kind).toBe("noop");
    }
  );

  it.each(directions)(
    "top-level paragraph: %s is a no-op, reason 'topLevelParagraph'",
    (direction) => {
      const state = stateFor("Hello world", 3);
      const plan = planIndentTransaction(state, direction);
      expect(plan.changes).toEqual([]);
      expect(plan.result).toEqual({
        kind: "noop",
        reason: "topLevelParagraph"
      });
    }
  );

  it.each(directions)(
    "unsupported context (heading line): %s is a no-op, reason 'unsupportedContext'",
    (direction) => {
      const state = stateFor("# Heading", 3);
      const plan = planIndentTransaction(state, direction);
      expect(plan.changes).toEqual([]);
      expect(plan.result).toEqual({
        kind: "noop",
        reason: "unsupportedContext"
      });
    }
  );

  it("outermost list item: outdent is a no-op, reason 'outermostList' (T-5)", () => {
    const state = stateFor("- item", 2);
    const plan = planIndentTransaction(state, "outdent");
    expect(plan.changes).toEqual([]);
    expect(plan.result).toEqual({ kind: "noop", reason: "outermostList" });
  });

  it.each(["- item", "+ item", "* item", "- [ ] task", "- [x] task", "- [X] task"])(
    "outermost list item with preceding sibling ('%s'): indent adds 2 spaces",
    (lineText) => {
      const doc = `- prev\n${lineText}`;
      const state = stateFor(doc, doc.length - 1);
      const plan = planIndentTransaction(state, "indent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 7, insert: "  " }]);
    }
  );

  it.each(["  - item", "  + item", "  * item", "  - [ ] task", "  - [x] task", "  - [X] task"])(
    "indented list item ('%s'): outdent removes up to 2 spaces",
    (lineText) => {
      const state = stateFor(lineText, 4);
      const plan = planIndentTransaction(state, "outdent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 0, to: 2, insert: "" }]);
    }
  );

  it("indented list item with 1 space: outdent removes 1 space", () => {
    const state = stateFor(" - item", 3);
    const plan = planIndentTransaction(state, "outdent");
    expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
    expect(plan.changes).toEqual([{ from: 0, to: 1, insert: "" }]);
  });

  it("a selection with no touched lines is defensively a no-op ('noSupportedLines')", () => {
    // Not reachable through normal selection construction (a selection
    // always has at least one range/line) - exercised directly against the
    // aggregation path via an empty-document edge case instead.
    const state = stateFor("", 0);
    const plan = planIndentTransaction(state, "indent");
    expect(plan.result.kind).toBe("noop");
  });

  describe("mixed context (multiple touched lines)", () => {
    const mixedDoc = "top level paragraph\n- item\n- - -\n  - nested item";

    it("uniform reason across touched non-list lines is reported precisely", () => {
      // Both touched lines are top-level paragraphs.
      const doc = "first paragraph\nsecond paragraph";
      const state = EditorState.create({
        doc,
        selection: EditorSelection.single(0, doc.length),
        extensions: [EditorState.allowMultipleSelections.of(true)]
      });
      const plan = planIndentTransaction(state, "indent");
      expect(plan.result).toEqual({
        kind: "noop",
        reason: "topLevelParagraph"
      });
    });

    it("mixed selection: indent modifies ONLY list lines with preceding siblings, skipping paragraph and thematic break", () => {
      const mixedDoc = "top level paragraph\n- item 1\n- item 2\n- - -\n  - nested item 1\n  - nested item 2";
      const state = EditorState.create({
        doc: mixedDoc,
        selection: EditorSelection.single(0, mixedDoc.length),
        extensions: [EditorState.allowMultipleSelections.of(true)]
      });
      const plan = planIndentTransaction(state, "indent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 2 });
      // Line 3 ("- item 2", offset 29) and Line 6 ("  - nested item 2", offset 62)
      expect(plan.changes).toEqual([
        { from: 29, insert: "  " },
        { from: 62, insert: "  " }
      ]);
    });

    it("mixed selection: outdent modifies ONLY nested list line, skipping paragraph, thematic break, and outermost list line", () => {
      const state = EditorState.create({
        doc: mixedDoc,
        selection: EditorSelection.single(0, mixedDoc.length),
        extensions: [EditorState.allowMultipleSelections.of(true)]
      });
      const plan = planIndentTransaction(state, "outdent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      // Line 4 ("  - nested item", offset 33) -> removes 2 spaces at 33
      expect(plan.changes).toEqual([
        { from: 33, to: 35, insert: "" }
      ]);
    });

    it("classifies every line of a mixed-context document without throwing", () => {
      for (const line of mixedDoc.split("\n")) {
        expect(() => classifyLine(line)).not.toThrow();
      }
    });
  });

  describe("multi-cursor and multiple ranges", () => {
    it("deduplicates overlapping touched lines across multiple selection ranges", () => {
      const doc = "- item 1\n- item 2\n- item 3";
      // Two cursors on line 2 ("- item 2")
      const state = EditorState.create({
        doc,
        selection: EditorSelection.create([
          EditorSelection.cursor(10),
          EditorSelection.cursor(14)
        ]),
        extensions: [EditorState.allowMultipleSelections.of(true)]
      });
      const plan = planIndentTransaction(state, "indent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 9, insert: "  " }]);
    });
  });

  describe("buildLineChange dispatcher (#465 list support)", () => {
    it("returns ChangeSpec for list items with preceding sibling on indent, and null for unsupported contexts", () => {
      const doc = "- prev\n- item\n  - nested1\n  - nested2\n> quote\n    code";
      const state = EditorState.create({ doc });
      const line1 = state.doc.line(1); // - prev
      const line2 = state.doc.line(2); // - item
      const line3 = state.doc.line(3); //   - nested1
      const line4 = state.doc.line(4); //   - nested2
      const line5 = state.doc.line(5); // > quote
      const line6 = state.doc.line(6); //     code

      expect(buildLineChange(line1, classifyLine(line1.text), "indent", state.doc)).toBeNull();
      expect(buildLineChange(line2, classifyLine(line2.text), "indent", state.doc)).toEqual({ from: line2.from, insert: "  " });
      expect(buildLineChange(line3, classifyLine(line3.text), "indent", state.doc)).toBeNull();
      expect(buildLineChange(line4, classifyLine(line4.text), "indent", state.doc)).toEqual({ from: line4.from, insert: "  " });
      expect(buildLineChange(line5, classifyLine(line5.text), "indent", state.doc)).toEqual({ from: line5.from, to: line5.to, insert: "> > quote" });
      expect(buildLineChange(line6, classifyLine(line6.text), "indent", state.doc)).toBeNull();
    });
  });

  describe("semantic list sink indent rules (#465 dogfood blocker remediation)", () => {
    it("first unordered list item: indent is no-op", () => {
      const state = stateFor("- あ\n- い", 2);
      const plan = planIndentTransaction(state, "indent");
      expect(plan.changes).toEqual([]);
      expect(plan.result.kind).toBe("noop");
    });

    it("first task list item: indent is no-op", () => {
      const state = stateFor("- [ ] あ\n- [ ] い", 4);
      const plan = planIndentTransaction(state, "indent");
      expect(plan.changes).toEqual([]);
      expect(plan.result.kind).toBe("noop");
    });

    it("second unordered list item: indent sinks under previous item", () => {
      const state = stateFor("- あ\n- い", 6);
      const plan = planIndentTransaction(state, "indent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 4, insert: "  " }]);
    });

    it("second task list item: indent sinks under previous item", () => {
      const state = stateFor("- [ ] あ\n- [ ] い", 12);
      const plan = planIndentTransaction(state, "indent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 8, insert: "  " }]);
    });

    it("first nested child item: indent is no-op", () => {
      const state = stateFor("- 親\n  - 子1\n  - 子2", 7);
      const plan = planIndentTransaction(state, "indent");
      expect(plan.changes).toEqual([]);
      expect(plan.result.kind).toBe("noop");
    });

    it("second nested child item: indent sinks under previous nested sibling", () => {
      const state = stateFor("- 親\n  - 子1\n  - 子2", 14);
      const plan = planIndentTransaction(state, "indent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 11, insert: "  " }]);
    });

    it("dogfood case: selected odd items do not create non-semantic indentation", () => {
      const doc = "- あ\n- い\n- う\n- え\n- お";
      // Cursors touching line 1 ("- あ", pos 0), line 3 ("- う", pos 8), and line 5 ("- お", pos 16)
      const state = EditorState.create({
        doc,
        selection: EditorSelection.create([
          EditorSelection.cursor(0),
          EditorSelection.cursor(8),
          EditorSelection.cursor(16)
        ]),
        extensions: [EditorState.allowMultipleSelections.of(true)]
      });
      const plan = planIndentTransaction(state, "indent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 2 });
      // Line 3 ("- う", offset 8) and Line 5 ("- お", offset 16) are indented
      // Line 1 ("- あ") is a no-op because it has no preceding sibling candidate
      expect(plan.changes).toEqual([
        { from: 8, insert: "  " },
        { from: 16, insert: "  " }
      ]);
    });

    it("blank line stops parent candidate search", () => {
      const doc = "- あ\n\n- い";
      const state = stateFor(doc, doc.length - 1);
      const plan = planIndentTransaction(state, "indent");
      expect(plan.changes).toEqual([]);
      expect(plan.result.kind).toBe("noop");
    });

    it("paragraph stops parent candidate search", () => {
      const doc = "- あ\n本文\n- い";
      const state = stateFor(doc, doc.length - 1);
      const plan = planIndentTransaction(state, "indent");
      expect(plan.changes).toEqual([]);
      expect(plan.result.kind).toBe("noop");
    });

    it("thematic break stops parent candidate search", () => {
      const doc = "- あ\n---\n- い";
      const state = stateFor(doc, doc.length - 1);
      const plan = planIndentTransaction(state, "indent");
      expect(plan.changes).toEqual([]);
      expect(plan.result.kind).toBe("noop");
    });

    it("ordered list item does not treat unordered list item as preceding sibling", () => {
      const doc = "1. 第一\n- 第二";
      const state = stateFor(doc, doc.length - 1);
      const plan = planIndentTransaction(state, "indent");
      expect(plan.changes).toEqual([]);
      expect(plan.result.kind).toBe("noop");
    });
  });

  describe("ordered list indent / outdent with local renumbering (#470 remediation)", () => {
    it("ordered list first item: indent is no-op", () => {
      const state = stateFor("1. first\n2. second", 2);
      const plan = planIndentTransaction(state, "indent");
      expect(plan.changes).toEqual([]);
      expect(plan.result.kind).toBe("noop");
    });

    it("indent 2. child under 1. parent becomes 1. parent \\n   1. child", () => {
      const doc = "1. parent\n2. child";
      const state = stateFor(doc, doc.indexOf("2. child"));
      const plan = planIndentTransaction(state, "indent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 10, to: 18, insert: "   1. child" }]);
    });

    it("indent 2) child under 1) parent becomes 1) parent \\n   1) child (delimiter preserved)", () => {
      const doc = "1) parent\n2) child";
      const state = stateFor(doc, doc.indexOf("2) child"));
      const plan = planIndentTransaction(state, "indent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 10, to: 18, insert: "   1) child" }]);
    });

    it("indent 11. child under 10. parent becomes 10. parent \\n    1. child", () => {
      const doc = "10. parent\n11. child";
      const state = stateFor(doc, doc.indexOf("11. child"));
      const plan = planIndentTransaction(state, "indent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 11, to: 20, insert: "    1. child" }]);
    });

    it("selecting 1..5 keeps item 1 unchanged and turns items 2..5 into child list numbered 1..4", () => {
      const doc = "1. い\n2. ろ\n3. は\n4. に\n5. ほ";
      const state = EditorState.create({
        doc,
        selection: EditorSelection.single(0, doc.length),
        extensions: [EditorState.allowMultipleSelections.of(true)]
      });
      const plan = planIndentTransaction(state, "indent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 4 });
      expect(plan.changes).toEqual([
        { from: 5, to: 9, insert: "   1. ろ" },
        { from: 10, to: 14, insert: "   2. は" },
        { from: 15, to: 19, insert: "   3. に" },
        { from: 20, to: 24, insert: "   4. ほ" }
      ]);
    });

    it("outdent 1. parent \\n   1. child => outdents child back to 2. child at column 0", () => {
      const doc = "1. parent\n   1. child";
      const state = stateFor(doc, doc.indexOf("1. child"));
      const plan = planIndentTransaction(state, "outdent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 10, to: 21, insert: "2. child" }]);
    });

    it("outdent 10. parent \\n    1. child => outdents child back to 11. child at column 0", () => {
      const doc = "10. parent\n    1. child";
      const state = stateFor(doc, doc.indexOf("1. child"));
      const plan = planIndentTransaction(state, "outdent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 11, to: 23, insert: "11. child" }]);
    });

    it("outermost ordered list item: outdent is no-op", () => {
      const state = stateFor("1. item", 2);
      const plan = planIndentTransaction(state, "outdent");
      expect(plan.changes).toEqual([]);
      expect(plan.result).toEqual({ kind: "noop", reason: "outermostList" });
    });

    it("does NOT renumber unrelated ordered lists in the document", () => {
      const doc = "1. parent A\n2. child A\n\nSome paragraph\n\n1. list B\n2. item B";
      const state = stateFor(doc, doc.indexOf("2. child A"));
      const plan = planIndentTransaction(state, "indent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      // Only line 2 is changed, list B is not touched
      expect(plan.changes).toEqual([{ from: 12, to: 22, insert: "   1. child A" }]);
    });

    it("does NOT treat an unordered list item as a parent candidate for an ordered list item", () => {
      const doc = "- unordered\n1. ordered";
      const state = stateFor(doc, doc.length - 1);
      const plan = planIndentTransaction(state, "indent");
      expect(plan.changes).toEqual([]);
      expect(plan.result.kind).toBe("noop");
    });

    it("does NOT treat an ordered list item as a parent candidate for an unordered list item", () => {
      const doc = "1. ordered\n- unordered";
      const state = stateFor(doc, doc.length - 1);
      const plan = planIndentTransaction(state, "indent");
      expect(plan.changes).toEqual([]);
      expect(plan.result.kind).toBe("noop");
    });

    it("mixed list selection: modifies ONLY valid list lines, preserving paragraph and thematic break", () => {
      const doc = "- unordered 1\n- unordered 2\n1. ordered 1\n2. ordered 2\nparagraph\n---";
      const state = EditorState.create({
        doc,
        selection: EditorSelection.single(0, doc.length),
        extensions: [EditorState.allowMultipleSelections.of(true)]
      });
      const plan = planIndentTransaction(state, "indent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 2 });
      expect(plan.changes).toEqual([
        { from: 14, insert: "  " },
        { from: 41, to: 53, insert: "   1. ordered 2" }
      ]);
    });
  });

  describe("blockquote indent / outdent (#472)", () => {
    it("indents blockquote line from Q=1 to Q=2 (> quote -> > > quote)", () => {
      const state = stateFor("> quote", 2);
      const plan = planIndentTransaction(state, "indent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 0, to: 7, insert: "> > quote" }]);
    });

    it("indents nested blockquote line from Q=2 to Q=3 (> > quote -> > > > quote)", () => {
      const state = stateFor("> > quote", 3);
      const plan = planIndentTransaction(state, "indent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 0, to: 9, insert: "> > > quote" }]);
    });

    it("indents compact marker blockquote line into canonical spaced style (>> quote -> > > > quote)", () => {
      const state = stateFor(">> quote", 2);
      const plan = planIndentTransaction(state, "indent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 0, to: 8, insert: "> > > quote" }]);
    });

    it("outdents blockquote line from Q=2 to Q=1 (> > quote -> > quote)", () => {
      const state = stateFor("> > quote", 3);
      const plan = planIndentTransaction(state, "outdent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 0, to: 9, insert: "> quote" }]);
    });

    it("outdents compact marker blockquote line from Q=2 to Q=1 (>> quote -> > quote)", () => {
      const state = stateFor(">> quote", 2);
      const plan = planIndentTransaction(state, "outdent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 0, to: 8, insert: "> quote" }]);
    });

    it("outermost blockquote outdent removes marker (> quote -> quote)", () => {
      const state = stateFor("> quote", 2);
      const plan = planIndentTransaction(state, "outdent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 0, to: 7, insert: "quote" }]);
    });

    it("outermost blockquote without space outdent removes marker (>quote -> quote)", () => {
      const state = stateFor(">quote", 2);
      const plan = planIndentTransaction(state, "outdent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 0, to: 6, insert: "quote" }]);
    });

    it("empty blockquote line indent (> -> > >)", () => {
      const state = stateFor(">", 1);
      const plan = planIndentTransaction(state, "indent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 0, to: 1, insert: "> >" }]);
    });

    it("empty blockquote line outdent (> -> empty line)", () => {
      const state = stateFor(">", 1);
      const plan = planIndentTransaction(state, "outdent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 0, to: 1, insert: "" }]);
    });

    it("empty blockquote line with space outdent (>  -> empty line)", () => {
      const state = stateFor("> ", 1);
      const plan = planIndentTransaction(state, "outdent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 0, to: 2, insert: "" }]);
    });

    it("indented blockquote line indent preserves leading spaces (  > quote ->   > > quote)", () => {
      const state = stateFor("  > quote", 4);
      const plan = planIndentTransaction(state, "indent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 0, to: 9, insert: "  > > quote" }]);
    });

    it("indented blockquote line outdent preserves leading spaces (  > quote ->   quote)", () => {
      const state = stateFor("  > quote", 4);
      const plan = planIndentTransaction(state, "outdent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 0, to: 9, insert: "  quote" }]);
    });

    it("indents > lines inside a fenced code block as plain code text (4 spaces), not blockquote (> >)", () => {
      const doc = "```md\n> quote inside code block\n```";
      const state = stateFor(doc, doc.indexOf("> quote"));
      const planIndent = planIndentTransaction(state, "indent");
      expect(planIndent.changes).toEqual([{ from: 6, insert: "    " }]);
      expect(planIndent.result).toEqual({ kind: "applied", changedLineCount: 1 });

      const planOutdent = planIndentTransaction(state, "outdent");
      expect(planOutdent.changes).toEqual([]);
      expect(planOutdent.result.kind).toBe("noop");
    });

    it("read-only editor: blockquote indent/outdent is no-op", () => {
      const state = stateFor("> quote", 2, { readOnly: true });
      expect(planIndentTransaction(state, "indent").changes).toEqual([]);
      expect(planIndentTransaction(state, "outdent").changes).toEqual([]);
    });

    it("mixed selection: indents blockquote line and sinkable list line, skipping paragraph and thematic break", () => {
      const doc = "top level paragraph\n> quote\n- parent\n- list item\n---";
      const state = EditorState.create({
        doc,
        selection: EditorSelection.single(0, doc.length),
        extensions: [EditorState.allowMultipleSelections.of(true)]
      });
      const plan = planIndentTransaction(state, "indent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 2 });
      // Line 2 ("> quote", offset 20 -> "> > quote") and Line 4 ("- list item", offset 37 -> 2 spaces)
      expect(plan.changes).toEqual([
        { from: 20, to: 27, insert: "> > quote" },
        { from: 37, insert: "  " }
      ]);
    });
  });

  describe("fenced code block code text indent / outdent (#474)", () => {
    it("indents code text inside fenced block using configured spaces4 unit", () => {
      const doc = "```ts\nconst x = 1;\n```";
      const state = stateFor(doc, doc.indexOf("const"));
      const plan = planIndentTransaction(state, "indent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 6, insert: "    " }]);
    });

    it("indents code text inside fenced block using spaces2 unit", () => {
      const doc = "```ts\nconst x = 1;\n```";
      const state = stateFor(doc, doc.indexOf("const"));
      const plan = planIndentTransaction(state, "indent", undefined, "spaces2");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 6, insert: "  " }]);
    });

    it("indents code text inside fenced block using spaces6 unit", () => {
      const doc = "```ts\nconst x = 1;\n```";
      const state = stateFor(doc, doc.indexOf("const"));
      const plan = planIndentTransaction(state, "indent", undefined, "spaces6");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 6, insert: "      " }]);
    });

    it("indents code text inside fenced block using spaces8 unit", () => {
      const doc = "```ts\nconst x = 1;\n```";
      const state = stateFor(doc, doc.indexOf("const"));
      const plan = planIndentTransaction(state, "indent", undefined, "spaces8");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 6, insert: "        " }]);
    });

    it("indents code text inside fenced block using tab unit", () => {
      const doc = "```ts\nconst x = 1;\n```";
      const state = stateFor(doc, doc.indexOf("const"));
      const plan = planIndentTransaction(state, "indent", undefined, "tab");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 6, insert: "\t" }]);
    });

    it("outdents code text inside fenced block matching configured spaces4 unit", () => {
      const doc = "```ts\n    const x = 1;\n```";
      const state = stateFor(doc, doc.indexOf("const"));
      const plan = planIndentTransaction(state, "outdent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 6, to: 10, insert: "" }]);
    });

    it("outdents code text inside fenced block matching tab priority", () => {
      const doc = "```ts\n\tconst x = 1;\n```";
      const state = stateFor(doc, doc.indexOf("const"));
      const plan = planIndentTransaction(state, "outdent", undefined, "spaces4");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 6, to: 7, insert: "" }]);
    });

    it("outdents code text inside fenced block with fewer spaces than unit (space fallback)", () => {
      const doc = "```ts\n  const x = 1;\n```";
      const state = stateFor(doc, doc.indexOf("const"));
      const plan = planIndentTransaction(state, "outdent", undefined, "spaces4");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 6, to: 8, insert: "" }]);
    });

    it("outdents unindented code text inside fenced block is a no-op", () => {
      const doc = "```ts\nconst x = 1;\n```";
      const state = stateFor(doc, doc.indexOf("const"));
      const plan = planIndentTransaction(state, "outdent");
      expect(plan.changes).toEqual([]);
      expect(plan.result.kind).toBe("noop");
    });

    it("fence delimiter lines are no-op", () => {
      const doc = "```ts\nconst x = 1;\n```";
      // Line 1: ```ts
      const stateStart = stateFor(doc, 0);
      const planStartIndent = planIndentTransaction(stateStart, "indent");
      expect(planStartIndent.changes).toEqual([]);
      expect(planStartIndent.result.kind).toBe("noop");

      // Line 3: ```
      const stateEnd = stateFor(doc, doc.length - 1);
      const planEndIndent = planIndentTransaction(stateEnd, "indent");
      expect(planEndIndent.changes).toEqual([]);
      expect(planEndIndent.result.kind).toBe("noop");
    });

    it("empty / blank lines inside fenced code blocks are no-op (no invisible spaces inserted)", () => {
      const doc = "```ts\nconst x = 1;\n  \nconst y = 2;\n```";
      // Line 3: "  " (whitespace only)
      const stateBlank = stateFor(doc, doc.indexOf("  \n"));
      const planIndent = planIndentTransaction(stateBlank, "indent");
      expect(planIndent.changes).toEqual([]);
      expect(planIndent.result.kind).toBe("noop");

      const planOutdent = planIndentTransaction(stateBlank, "outdent");
      expect(planOutdent.changes).toEqual([]);
      expect(planOutdent.result.kind).toBe("noop");
    });

    it("treats Markdown list / blockquote syntax inside fenced code block as plain code text", () => {
      const doc = "```md\n- list item inside code\n> blockquote inside code\n```";
      // Line 2: "- list item inside code" (first line in block, no preceding sibling candidate, but code text should indent!)
      const stateList = stateFor(doc, doc.indexOf("- list"));
      const planList = planIndentTransaction(stateList, "indent");
      expect(planList.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(planList.changes).toEqual([{ from: 6, insert: "    " }]);

      // Line 3: "> blockquote inside code" (code text should insert 4 spaces, NOT > > quote)
      const stateQuote = stateFor(doc, doc.indexOf("> block"));
      const planQuote = planIndentTransaction(stateQuote, "indent");
      expect(planQuote.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(planQuote.changes).toEqual([{ from: 30, insert: "    " }]);
    });

    it("read-only editor: fenced code indent/outdent is no-op", () => {
      const doc = "```ts\nconst x = 1;\n```";
      const state = stateFor(doc, doc.indexOf("const"), { readOnly: true });
      expect(planIndentTransaction(state, "indent").changes).toEqual([]);
      expect(planIndentTransaction(state, "outdent").changes).toEqual([]);
    });

    it("mixed selection: indents non-blank code text lines and skips fence delimiters and blank lines", () => {
      const doc = "```ts\nconst a = 1;\n\nconst b = 2;\n```";
      const state = EditorState.create({
        doc,
        selection: EditorSelection.single(0, doc.length),
        extensions: [EditorState.allowMultipleSelections.of(true)]
      });
      const plan = planIndentTransaction(state, "indent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 2 });
      // Line 2 ("const a = 1;", offset 6) and Line 4 ("const b = 2;", offset 20)
      expect(plan.changes).toEqual([
        { from: 6, insert: "    " },
        { from: 20, insert: "    " }
      ]);
    });
  });

  describe("the 'applied' path (proven with an injected line-change handler)", () => {
    it("aggregates one change per touched line into a single applied result", () => {
      const doc = "alpha\nbeta\ngamma";
      const state = EditorState.create({
        doc,
        selection: EditorSelection.single(0, doc.length),
        extensions: [EditorState.allowMultipleSelections.of(true)]
      });

      const fakeHandler = (line: { from: number }): ChangeSpec => ({
        from: line.from,
        insert: ">> "
      });

      const plan = planIndentTransaction(state, "indent", fakeHandler);
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 3 });
      expect(plan.changes).toHaveLength(3);
    });

    it("dispatching the plan through a real EditorView applies every change in one transaction", () => {
      const doc = "alpha\nbeta";
      const view = new EditorView({
        state: EditorState.create({
          doc,
          selection: EditorSelection.single(0, doc.length),
          extensions: [EditorState.allowMultipleSelections.of(true)]
        })
      });
      try {
        const fakeHandler = (line: { from: number }): ChangeSpec => ({
          from: line.from,
          insert: ">> "
        });
        const plan = planIndentTransaction(view.state, "indent", fakeHandler);
        view.dispatch(
          view.state.update({ changes: plan.changes, userEvent: "input.indent" })
        );
        expect(view.state.doc.toString()).toBe(">> alpha\n>> beta");
      } finally {
        view.destroy();
      }
    });

    it("a no-op plan never calls dispatch's underlying change machinery (no changes to apply)", () => {
      const state = stateFor("Hello world", 3);
      const plan = planIndentTransaction(state, "indent");
      expect(plan.changes).toHaveLength(0);
    });
  });
});

describe("indentCommand / outdentCommand as CodeMirror Commands (#463)", () => {
  afterEach(() => {
    // Nothing persistent between tests - each test builds its own view.
  });

  it("indentCommand always reports the key as handled (true), applied or no-op alike", () => {
    const view = new EditorView({
      state: EditorState.create({ doc: "Hello world", selection: EditorSelection.single(3) })
    });
    try {
      expect(indentCommand(view)).toBe(true);
      // No change: this line is a top-level paragraph, still a stub.
      expect(view.state.doc.toString()).toBe("Hello world");
    } finally {
      view.destroy();
    }
  });

  it("outdentCommand always reports the key as handled (true), applied or no-op alike", () => {
    const view = new EditorView({
      state: EditorState.create({ doc: "Hello world", selection: EditorSelection.single(3) })
    });
    try {
      expect(outdentCommand(view)).toBe(true);
      expect(view.state.doc.toString()).toBe("Hello world");
    } finally {
      view.destroy();
    }
  });

  it("indentCommand does not dispatch a transaction on a read-only view", () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: "Hello world",
        selection: EditorSelection.single(3),
        extensions: [EditorState.readOnly.of(true)]
      })
    });
    try {
      expect(indentCommand(view)).toBe(true);
      expect(view.state.doc.toString()).toBe("Hello world");
    } finally {
      view.destroy();
    }
  });
});

describe("editorIndentKeymap wired into the base CodeMirror setup (#463)", () => {
  function mountView(input: { doc?: string; cursor?: number; readOnly?: boolean } = {}): EditorView {
    return new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: input.doc ?? "Hello world",
        selection: EditorSelection.single(input.cursor ?? 3),
        extensions: [
          ...createMarkdownEditorBaseSetup({ undoHistoryMinDepth: 100 }),
          ...(input.readOnly ? [EditorState.readOnly.of(true)] : [])
        ]
      })
    });
  }

  function ctrlBracketKeydown(bracket: "[" | "]"): KeyboardEvent {
    return new KeyboardEvent("keydown", {
      key: bracket,
      code: bracket === "]" ? "BracketRight" : "BracketLeft",
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
  }

  it("exposes exactly Mod-] -> indentCommand and Mod-[ -> outdentCommand", () => {
    expect(editorIndentKeymap).toEqual([
      { key: "Mod-]", run: indentCommand },
      { key: "Mod-[", run: outdentCommand }
    ]);
  });

  it("Mod+] (Ctrl+]) is consumed by the base setup and leaves a top-level paragraph unchanged", () => {
    const view = mountView();
    try {
      const event = ctrlBracketKeydown("]");
      view.contentDOM.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.doc.toString()).toBe("Hello world");
    } finally {
      view.destroy();
    }
  });

  it("Mod+[ (Ctrl+[) is consumed by the base setup and leaves a top-level paragraph unchanged", () => {
    const view = mountView();
    try {
      const event = ctrlBracketKeydown("[");
      view.contentDOM.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.doc.toString()).toBe("Hello world");
    } finally {
      view.destroy();
    }
  });

  it("Mod+] (Ctrl+]) indents a list item line", () => {
    const view = mountView({ doc: "- prev\n- item", cursor: 7 });
    try {
      const event = ctrlBracketKeydown("]");
      view.contentDOM.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.doc.toString()).toBe("- prev\n  - item");
    } finally {
      view.destroy();
    }
  });

  it("Mod+[ (Ctrl+[) outdents an indented list item line", () => {
    const view = mountView({ doc: "  - item" });
    try {
      const event = ctrlBracketKeydown("[");
      view.contentDOM.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.doc.toString()).toBe("- item");
    } finally {
      view.destroy();
    }
  });

  it("read-only: Mod+] on a list item is consumed but leaves document unchanged", () => {
    const view = mountView({ doc: "- item", readOnly: true });
    try {
      const event = ctrlBracketKeydown("]");
      view.contentDOM.dispatchEvent(event);
      expect(view.state.doc.toString()).toBe("- item");
    } finally {
      view.destroy();
    }
  });

  it("Tab is NOT bound by the base setup - no preventDefault, focus movement is left alone", () => {
    const view = mountView();
    try {
      const event = new KeyboardEvent("keydown", {
        key: "Tab",
        code: "Tab",
        bubbles: true,
        cancelable: true
      });
      view.contentDOM.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(view.state.doc.toString()).toBe("Hello world");
    } finally {
      view.destroy();
    }
  });

  it("Shift+Tab is NOT bound by the base setup - no preventDefault, focus movement is left alone", () => {
    const view = mountView();
    try {
      const event = new KeyboardEvent("keydown", {
        key: "Tab",
        code: "Tab",
        shiftKey: true,
        bubbles: true,
        cancelable: true
      });
      view.contentDOM.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(view.state.doc.toString()).toBe("Hello world");
    } finally {
      view.destroy();
    }
  });
});

describe("fencedCodeIndentUnit live setting integration (#474 blocker remediation)", () => {
  function mountFencedCodeView(input: {
    doc: string;
    cursor: number;
    unit?: FencedCodeIndentUnit;
  }): EditorView {
    return new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: input.doc,
        selection: EditorSelection.single(input.cursor),
        extensions: [
          ...createMarkdownEditorBaseSetup({
            undoHistoryMinDepth: 100,
            fencedCodeIndentUnit: input.unit ?? "spaces4"
          })
        ]
      })
    });
  }

  function ctrlBracketKeydown(bracket: "[" | "]"): KeyboardEvent {
    return new KeyboardEvent("keydown", {
      key: bracket,
      code: bracket === "]" ? "BracketRight" : "BracketLeft",
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
  }

  it.each([
    { unit: "spaces2" as const, expectedIndent: "  ", docAfter: "```js\n  const x = 1;\n```" },
    { unit: "spaces8" as const, expectedIndent: "        ", docAfter: "```js\n        const x = 1;\n```" },
    { unit: "tab" as const, expectedIndent: "\t", docAfter: "```js\n\tconst x = 1;\n```" }
  ])("Mod+] uses live fencedCodeIndentUnit '$unit'", ({ unit, docAfter }) => {
    const doc = "```js\nconst x = 1;\n```";
    const view = mountFencedCodeView({ doc, cursor: 7, unit });
    try {
      const event = ctrlBracketKeydown("]");
      view.contentDOM.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.doc.toString()).toBe(docAfter);
    } finally {
      view.destroy();
    }
  });

  it.each([
    { unit: "spaces2" as const, docBefore: "```js\n  const x = 1;\n```", docAfter: "```js\nconst x = 1;\n```" },
    { unit: "spaces8" as const, docBefore: "```js\n        const x = 1;\n```", docAfter: "```js\nconst x = 1;\n```" },
    { unit: "tab" as const, docBefore: "```js\n\tconst x = 1;\n```", docAfter: "```js\nconst x = 1;\n```" }
  ])("Mod+[ outdents using live fencedCodeIndentUnit '$unit'", ({ unit, docBefore, docAfter }) => {
    const view = mountFencedCodeView({ doc: docBefore, cursor: docBefore.indexOf("const"), unit });
    try {
      const event = ctrlBracketKeydown("[");
      view.contentDOM.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.doc.toString()).toBe(docAfter);
    } finally {
      view.destroy();
    }
  });

  it("planIndentTransaction without explicit fencedCodeIndentUnit reads facet value live from state", () => {
    const doc = "```js\nconst x = 1;\n```";
    const state = EditorState.create({
      doc,
      selection: EditorSelection.single(7),
      extensions: [fencedCodeIndentUnitFacet.of("spaces2")]
    });
    const plan = planIndentTransaction(state, "indent");
    expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
    expect(plan.changes).toEqual([{ from: 6, insert: "  " }]);
  });
});

describe("indentCommand / outdentCommand routing by documentIsMarkdownFacet (#546)", () => {
  it("documentIsMarkdownFacet defaults to true: a top-level paragraph stays a Markdown-aware no-op", () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: "Hello world",
        selection: EditorSelection.single(3)
      })
    });
    try {
      expect(indentCommand(view)).toBe(true);
      expect(view.state.doc.toString()).toBe("Hello world");
    } finally {
      view.destroy();
    }
  });

  it("documentIsMarkdownFacet=false: indentCommand delegates to plain text indent, NOT the Markdown top-level-paragraph no-op", () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: "Hello world",
        selection: EditorSelection.single(3),
        extensions: [documentIsMarkdownFacet.of(false)]
      })
    });
    try {
      expect(indentCommand(view)).toBe(true);
      // textFileIndentUnitFacet defaults to "tab" (textFiles.indentUnit's
      // catalog default), same default as documentIsMarkdownFacet unset.
      expect(view.state.doc.toString()).toBe("\tHello world");
    } finally {
      view.destroy();
    }
  });

  it("documentIsMarkdownFacet=false: outdentCommand delegates to plain text outdent", () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: "  Hello world",
        selection: EditorSelection.single(5),
        extensions: [documentIsMarkdownFacet.of(false)]
      })
    });
    try {
      expect(outdentCommand(view)).toBe(true);
      expect(view.state.doc.toString()).toBe("Hello world");
    } finally {
      view.destroy();
    }
  });

  it("documentIsMarkdownFacet=false does not affect a genuinely Markdown structure (list item) already tested elsewhere: Mod+] via the base setup still no-ops the outermost list item's outdent", () => {
    // documentIsMarkdownFacet only changes whether Markdown CONTEXT DISPATCH
    // runs at all - it never re-enables ADR-0014 決定6 for a Markdown
    // document. This test documents that the facet's markdown=true default
    // (used everywhere the facet is unset, including every existing Markdown
    // editor) is unaffected by #546's addition.
    const view = new EditorView({
      state: EditorState.create({
        doc: "- item",
        selection: EditorSelection.single(2)
      })
    });
    try {
      expect(outdentCommand(view)).toBe(true);
      expect(view.state.doc.toString()).toBe("- item");
    } finally {
      view.destroy();
    }
  });
});
