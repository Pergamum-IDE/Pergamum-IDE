// @vitest-environment happy-dom
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import {
  findMarkdownTableBlock,
  isMarkdownTableDelimiterRow,
  parseMarkdownTableRowCells,
  tryNavigateTableCell
} from "../../src/renderer/markdownTableNavigation";

describe("markdownTableNavigation (#476)", () => {
  describe("isMarkdownTableDelimiterRow", () => {
    it.each([
      "| --- | --- |",
      "|:---|---:|",
      "|:---:|:---:|",
      "--- | ---",
      "| - | - |"
    ])("recognizes delimiter row '%s'", (lineText) => {
      expect(isMarkdownTableDelimiterRow(lineText)).toBe(true);
    });

    it.each([
      "| A | B |",
      "| --- | foo |",
      "| |",
      "これは A | B という本文です。",
      "# Heading"
    ])("rejects non-delimiter row '%s'", (lineText) => {
      expect(isMarkdownTableDelimiterRow(lineText)).toBe(false);
    });
  });

  describe("parseMarkdownTableRowCells", () => {
    it("parses pipe table row with leading and trailing pipes", () => {
      const state = EditorState.create({ doc: "| A | B |" });
      const line = state.doc.line(1);
      const cells = parseMarkdownTableRowCells(line);
      expect(cells.length).toBe(2);
      expect(cells[0].from).toBe(1);
      expect(cells[0].to).toBe(4);
      expect(cells[0].contentStartPos).toBe(2); // 'A' position
      expect(cells[1].from).toBe(5);
      expect(cells[1].to).toBe(8);
      expect(cells[1].contentStartPos).toBe(6); // 'B' position
    });

    it("parses empty cell safely", () => {
      const state = EditorState.create({ doc: "| A |   |" });
      const line = state.doc.line(1);
      const cells = parseMarkdownTableRowCells(line);
      expect(cells.length).toBe(2);
      expect(cells[1].from).toBe(5);
      expect(cells[1].to).toBe(8);
      expect(cells[1].contentStartPos).toBe(6); // inside empty cell space
    });

    it("parses row without leading pipe", () => {
      const state = EditorState.create({ doc: "A | B" });
      const line = state.doc.line(1);
      const cells = parseMarkdownTableRowCells(line);
      expect(cells.length).toBe(2);
      expect(cells[0].contentStartPos).toBe(0);
      expect(cells[1].contentStartPos).toBe(4);
    });
  });

  describe("findMarkdownTableBlock", () => {
    it("detects valid Markdown pipe table block", () => {
      const doc = EditorState.create({
        doc: "Paragraph\n| A | B |\n| --- | --- |\n| C | D |\nParagraph 2"
      }).doc;

      const block = findMarkdownTableBlock(doc, 2);
      expect(block).not.toBeNull();
      expect(block?.startLineNumber).toBe(2);
      expect(block?.endLineNumber).toBe(4);
      expect(block?.delimiterLineNumber).toBe(3);
      expect(block?.dataRows.map((r) => r.lineNumber)).toEqual([2, 4]);
    });

    it("rejects normal paragraph with pipe (no delimiter row)", () => {
      const doc = EditorState.create({
        doc: "これは A | B という本文です。"
      }).doc;

      expect(findMarkdownTableBlock(doc, 1)).toBeNull();
    });

    it("rejects table-like text inside code fence", () => {
      const doc = EditorState.create({
        doc: "```md\n| A | B |\n| --- | --- |\n| C | D |\n```"
      }).doc;

      expect(findMarkdownTableBlock(doc, 2)).toBeNull();
      expect(findMarkdownTableBlock(doc, 4)).toBeNull();
    });
  });

  describe("tryNavigateTableCell", () => {
    function mountView(doc: string, cursor: number): EditorView {
      return new EditorView({
        parent: document.body,
        state: EditorState.create({
          doc,
          selection: EditorSelection.single(cursor)
        })
      });
    }

    const tableDoc = "| A | B |\n| --- | --- |\n| C | D |";

    it("same row next cell: Tab from cell A to cell B", () => {
      const view = mountView(tableDoc, 2); // 'A'
      try {
        const handled = tryNavigateTableCell(view, "next");
        expect(handled).toBe(true);
        expect(view.state.selection.main.head).toBe(6); // 'B'
        expect(view.state.doc.toString()).toBe(tableDoc);
      } finally {
        view.destroy();
      }
    });

    it("same row previous cell: Shift+Tab from cell B to cell A", () => {
      const view = mountView(tableDoc, 6); // 'B'
      try {
        const handled = tryNavigateTableCell(view, "previous");
        expect(handled).toBe(true);
        expect(view.state.selection.main.head).toBe(2); // 'A'
        expect(view.state.doc.toString()).toBe(tableDoc);
      } finally {
        view.destroy();
      }
    });

    it("row boundary next: Tab from cell B to cell C (skipping delimiter row)", () => {
      const view = mountView(tableDoc, 6); // 'B' (line 1)
      try {
        const handled = tryNavigateTableCell(view, "next");
        expect(handled).toBe(true);
        // Cell C is on line 3, offset is 26 ('| A | B |\n| --- | --- |\n| C | D |' line 3 starts at 24)
        expect(view.state.selection.main.head).toBe(26); // 'C'
        expect(view.state.doc.toString()).toBe(tableDoc);
      } finally {
        view.destroy();
      }
    });

    it("row boundary previous: Shift+Tab from cell C to cell B (skipping delimiter row)", () => {
      const view = mountView(tableDoc, 26); // 'C' (line 3)
      try {
        const handled = tryNavigateTableCell(view, "previous");
        expect(handled).toBe(true);
        expect(view.state.selection.main.head).toBe(6); // 'B'
        expect(view.state.doc.toString()).toBe(tableDoc);
      } finally {
        view.destroy();
      }
    });

    it("table final cell Tab: no-op, handled=true, no cursor move, no doc change, no row added", () => {
      const view = mountView(tableDoc, 30); // 'D' (line 3)
      try {
        const handled = tryNavigateTableCell(view, "next");
        expect(handled).toBe(true);
        expect(view.state.selection.main.head).toBe(30);
        expect(view.state.doc.toString()).toBe(tableDoc);
      } finally {
        view.destroy();
      }
    });

    it("table first cell Shift+Tab: no-op, handled=true, no cursor move, no doc change", () => {
      const view = mountView(tableDoc, 2); // 'A'
      try {
        const handled = tryNavigateTableCell(view, "previous");
        expect(handled).toBe(true);
        expect(view.state.selection.main.head).toBe(2);
        expect(view.state.doc.toString()).toBe(tableDoc);
      } finally {
        view.destroy();
      }
    });

    it("delimiter row: Tab / Shift+Tab is handled=true with no cursor move and no doc change", () => {
      const delimiterPos = tableDoc.indexOf("---");
      const view = mountView(tableDoc, delimiterPos);
      try {
        const handledNext = tryNavigateTableCell(view, "next");
        expect(handledNext).toBe(true);
        expect(view.state.doc.toString()).toBe(tableDoc);

        const handledPrev = tryNavigateTableCell(view, "previous");
        expect(handledPrev).toBe(true);
        expect(view.state.doc.toString()).toBe(tableDoc);
      } finally {
        view.destroy();
      }
    });

    it("returns false for non-table lines", () => {
      const doc = "Paragraph line";
      const view = mountView(doc, 3);
      try {
        expect(tryNavigateTableCell(view, "next")).toBe(false);
      } finally {
        view.destroy();
      }
    });

    it("returns false for multi-cell selection", () => {
      const view = new EditorView({
        parent: document.body,
        state: EditorState.create({
          doc: tableDoc,
          selection: EditorSelection.range(2, 6) // spans 'A' to 'B'
        })
      });
      try {
        expect(tryNavigateTableCell(view, "next")).toBe(false);
      } finally {
        view.destroy();
      }
    });
  });
});
