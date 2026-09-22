// @vitest-environment happy-dom
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import {
  plainTextIndentCommand,
  plainTextOutdentCommand,
  plainTextTabCommand,
  planPlainTextIndentTransaction,
  planPlainTextTabTransaction,
  textFileIndentUnitFacet,
  type PlainTextIndentDirection
} from "../../src/renderer/plainTextIndentCommands";
import type { TextFilesIndentUnit } from "../../src/shared/settings";

function stateFor(
  doc: string,
  selection: EditorSelection,
  options: { readOnly?: boolean; unit?: TextFilesIndentUnit } = {}
): EditorState {
  return EditorState.create({
    doc,
    selection,
    extensions: [
      EditorState.allowMultipleSelections.of(true),
      ...(options.readOnly ? [EditorState.readOnly.of(true)] : []),
      ...(options.unit !== undefined
        ? [textFileIndentUnitFacet.of(options.unit)]
        : [])
    ]
  });
}

describe("planPlainTextIndentTransaction (#546)", () => {
  const directions: readonly PlainTextIndentDirection[] = ["indent", "outdent"];

  it.each(directions)(
    "read-only editor: %s produces no changes",
    (direction) => {
      const state = stateFor("foo", EditorSelection.single(1), {
        readOnly: true
      });
      const plan = planPlainTextIndentTransaction(state, direction);
      expect(plan.changes).toEqual([]);
    }
  );

  it("defaults to the tab indent unit when the facet is unset (textFiles.indentUnit catalog default)", () => {
    const state = stateFor("foo", EditorSelection.single(1));
    const plan = planPlainTextIndentTransaction(state, "indent");
    const tr = state.update({ changes: plan.changes });
    expect(tr.state.doc.toString()).toBe("\tfoo");
  });

  it("indents a top-level plain paragraph (unlike the Markdown-aware no-op)", () => {
    const state = stateFor("foo", EditorSelection.single(1), {
      unit: "twoSpaces"
    });
    const plan = planPlainTextIndentTransaction(state, "indent");
    const tr = state.update({ changes: plan.changes });
    expect(tr.state.doc.toString()).toBe("  foo");
  });

  describe("indent inserts the configured unit", () => {
    it.each([
      { unit: "tab" as const, inserted: "\t" },
      { unit: "twoSpaces" as const, inserted: "  " },
      { unit: "fourSpaces" as const, inserted: "    " }
    ])("$unit inserts %s", ({ unit, inserted }) => {
      const state = stateFor("foo", EditorSelection.single(1), { unit });
      const plan = planPlainTextIndentTransaction(state, "indent");
      const tr = state.update({ changes: plan.changes });
      expect(tr.state.doc.toString()).toBe(`${inserted}foo`);
    });
  });

  it("indents multiple selected lines with the configured unit", () => {
    const doc = "foo\nbar\nbaz";
    const state = stateFor(doc, EditorSelection.single(0, doc.length), {
      unit: "fourSpaces"
    });
    const plan = planPlainTextIndentTransaction(state, "indent");
    const tr = state.update({ changes: plan.changes });
    expect(tr.state.doc.toString()).toBe(
      "    foo\n    bar\n    baz"
    );
  });

  it("multiple selections de-duplicate target lines", () => {
    const doc = "foo\nbar\nbaz";
    const state = stateFor(
      doc,
      EditorSelection.create([
        EditorSelection.cursor(1), // "foo"
        EditorSelection.cursor(2) // still "foo"
      ]),
      { unit: "twoSpaces" }
    );
    const plan = planPlainTextIndentTransaction(state, "indent");
    expect(plan.changes.length).toBe(1);
    const tr = state.update({ changes: plan.changes });
    expect(tr.state.doc.toString()).toBe("  foo\nbar\nbaz");
  });

  it("indent adds the indent unit to a blank target line", () => {
    const state = stateFor("\n", EditorSelection.single(0), {
      unit: "twoSpaces"
    });
    const plan = planPlainTextIndentTransaction(state, "indent");
    const tr = state.update({ changes: plan.changes });
    expect(tr.state.doc.toString()).toBe("  \n");
  });

  describe("outdent: current configured indent unit is removed first", () => {
    it.each([
      { unit: "tab" as const, before: "\tfoo" },
      { unit: "twoSpaces" as const, before: "  foo" },
      { unit: "fourSpaces" as const, before: "    foo" }
    ])("$unit removes its own unit exactly", ({ unit, before }) => {
      const state = stateFor(before, EditorSelection.single(0), { unit });
      const plan = planPlainTextIndentTransaction(state, "outdent");
      const tr = state.update({ changes: plan.changes });
      expect(tr.state.doc.toString()).toBe("foo");
    });
  });

  it("outdent removes a tab even when the setting is spaces (tolerant of externally edited files)", () => {
    const state = stateFor("\tfoo", EditorSelection.single(0), {
      unit: "twoSpaces"
    });
    const plan = planPlainTextIndentTransaction(state, "outdent");
    const tr = state.update({ changes: plan.changes });
    expect(tr.state.doc.toString()).toBe("foo");
  });

  it("outdent removes leading spaces up to the configured width when the unit is 'tab' (fallback width 4)", () => {
    const state = stateFor("      foo", EditorSelection.single(0), {
      unit: "tab"
    });
    const plan = planPlainTextIndentTransaction(state, "outdent");
    const tr = state.update({ changes: plan.changes });
    // 6 leading spaces present, fallback width caps removal at 4.
    expect(tr.state.doc.toString()).toBe("  foo");
  });

  it("outdent removes only the leading spaces actually present when fewer than the configured width", () => {
    const state = stateFor("  foo", EditorSelection.single(0), {
      unit: "fourSpaces"
    });
    const plan = planPlainTextIndentTransaction(state, "outdent");
    const tr = state.update({ changes: plan.changes });
    expect(tr.state.doc.toString()).toBe("foo");
  });

  it("outdent never removes non-whitespace content", () => {
    const state = stateFor("foobar", EditorSelection.single(0), {
      unit: "twoSpaces"
    });
    const plan = planPlainTextIndentTransaction(state, "outdent");
    expect(plan.changes).toEqual([]);
  });

  it("outdent line with no leading whitespace is a no-op", () => {
    const state = stateFor("foo", EditorSelection.single(1), {
      unit: "twoSpaces"
    });
    const plan = planPlainTextIndentTransaction(state, "outdent");
    expect(plan.changes).toEqual([]);
  });

  it("outdents multiple selected lines", () => {
    const doc = "  foo\n  bar\n  baz";
    const state = stateFor(doc, EditorSelection.single(0, doc.length), {
      unit: "twoSpaces"
    });
    const plan = planPlainTextIndentTransaction(state, "outdent");
    const tr = state.update({ changes: plan.changes });
    expect(tr.state.doc.toString()).toBe("foo\nbar\nbaz");
  });

  it("outdent on a blank target line with leading whitespace removes it", () => {
    const state = stateFor("  \n", EditorSelection.single(0), {
      unit: "twoSpaces"
    });
    const plan = planPlainTextIndentTransaction(state, "outdent");
    const tr = state.update({ changes: plan.changes });
    expect(tr.state.doc.toString()).toBe("\n");
  });
});

function mountEditor(
  doc: string,
  cursor: number,
  unit?: TextFilesIndentUnit
): EditorView {
  return new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: EditorSelection.single(cursor),
      extensions: [
        EditorState.allowMultipleSelections.of(true),
        ...(unit !== undefined ? [textFileIndentUnitFacet.of(unit)] : [])
      ]
    })
  });
}

describe("plainTextIndentCommand / plainTextOutdentCommand (#546)", () => {
  it("plainTextIndentCommand indents the current line using the configured unit and returns true", () => {
    const view = mountEditor("foo", 1, "twoSpaces");
    try {
      expect(plainTextIndentCommand(view)).toBe(true);
      expect(view.state.doc.toString()).toBe("  foo");
    } finally {
      view.destroy();
    }
  });

  it("plainTextOutdentCommand outdents the current line using the configured unit and returns true", () => {
    const view = mountEditor("  foo", 3, "twoSpaces");
    try {
      expect(plainTextOutdentCommand(view)).toBe(true);
      expect(view.state.doc.toString()).toBe("foo");
    } finally {
      view.destroy();
    }
  });

  it("plainTextOutdentCommand on a line with no leading whitespace returns true without changing the document", () => {
    const view = mountEditor("foo", 1, "twoSpaces");
    try {
      expect(plainTextOutdentCommand(view)).toBe(true);
      expect(view.state.doc.toString()).toBe("foo");
    } finally {
      view.destroy();
    }
  });
});

describe("planPlainTextTabTransaction / plainTextTabCommand (#546 follow-up)", () => {
  it("read-only editor produces no changes", () => {
    const state = stateFor("foo", EditorSelection.single(1), {
      readOnly: true,
      unit: "tab"
    });
    const plan = planPlainTextTabTransaction(state);
    expect(plan.changes).toEqual([]);
  });

  describe("no selection: inserts the configured unit at the caret", () => {
    it.each([
      { unit: "tab" as const, inserted: "\t" },
      { unit: "twoSpaces" as const, inserted: "  " },
      { unit: "fourSpaces" as const, inserted: "    " }
    ])("$unit", ({ unit, inserted }) => {
      const state = stateFor("foobar", EditorSelection.single(3), { unit });
      const plan = planPlainTextTabTransaction(state);
      const tr = state.update({ changes: plan.changes });
      expect(tr.state.doc.toString()).toBe(`foo${inserted}bar`);
    });
  });

  describe("partial single-line selection: replaces the selection with the configured unit", () => {
    it.each([
      { unit: "tab" as const, inserted: "\t" },
      { unit: "twoSpaces" as const, inserted: "  " },
      { unit: "fourSpaces" as const, inserted: "    " }
    ])("$unit", ({ unit, inserted }) => {
      const state = stateFor(
        "foobarbaz",
        EditorSelection.single(3, 6), // "bar"
        { unit }
      );
      const plan = planPlainTextTabTransaction(state);
      expect(plan.selection).toBeDefined();
      const tr = state.update({
        changes: plan.changes,
        selection: plan.selection
      });
      expect(tr.state.doc.toString()).toBe(`foo${inserted}baz`);
      // Caret lands right after the inserted unit.
      expect(tr.state.selection.main.head).toBe(3 + inserted.length);
      expect(tr.state.selection.main.empty).toBe(true);
    });
  });

  describe("multi-line / line selection: indents every touched line at line start", () => {
    it.each([
      { unit: "tab" as const, inserted: "\t" },
      { unit: "twoSpaces" as const, inserted: "  " },
      { unit: "fourSpaces" as const, inserted: "    " }
    ])("$unit", ({ unit, inserted }) => {
      const doc = "foo\nbar";
      const state = stateFor(doc, EditorSelection.single(0, doc.length), {
        unit
      });
      const plan = planPlainTextTabTransaction(state);
      const tr = state.update({ changes: plan.changes });
      expect(tr.state.doc.toString()).toBe(
        `${inserted}foo\n${inserted}bar`
      );
    });

    it("multiple selections (multi-cursor) are treated as line-based and de-duplicate target lines", () => {
      const doc = "foo\nbar\nbaz";
      const state = stateFor(
        doc,
        EditorSelection.create([
          EditorSelection.cursor(1), // "foo"
          EditorSelection.cursor(2) // still "foo"
        ]),
        { unit: "twoSpaces" }
      );
      const plan = planPlainTextTabTransaction(state);
      expect(plan.changes.length).toBe(1);
      const tr = state.update({ changes: plan.changes });
      expect(tr.state.doc.toString()).toBe("  foo\nbar\nbaz");
    });
  });

  describe("plainTextTabCommand (Command wrapper)", () => {
    it("no selection: inserts at the caret and returns true", () => {
      const view = mountEditor("foobar", 3, "tab");
      try {
        expect(plainTextTabCommand(view)).toBe(true);
        expect(view.state.doc.toString()).toBe("foo\tbar");
      } finally {
        view.destroy();
      }
    });

    it("partial single-line selection: replaces the selection and returns true", () => {
      const view = new EditorView({
        parent: document.body,
        state: EditorState.create({
          doc: "foobarbaz",
          selection: EditorSelection.single(3, 6),
          extensions: [
            EditorState.allowMultipleSelections.of(true),
            textFileIndentUnitFacet.of("fourSpaces")
          ]
        })
      });
      try {
        expect(plainTextTabCommand(view)).toBe(true);
        expect(view.state.doc.toString()).toBe("foo    baz");
      } finally {
        view.destroy();
      }
    });

    it("multi-line selection: indents each line and returns true", () => {
      const doc = "foo\nbar";
      const view = new EditorView({
        parent: document.body,
        state: EditorState.create({
          doc,
          selection: EditorSelection.single(0, doc.length),
          extensions: [
            EditorState.allowMultipleSelections.of(true),
            textFileIndentUnitFacet.of("twoSpaces")
          ]
        })
      });
      try {
        expect(plainTextTabCommand(view)).toBe(true);
        expect(view.state.doc.toString()).toBe("  foo\n  bar");
      } finally {
        view.destroy();
      }
    });
  });
});
