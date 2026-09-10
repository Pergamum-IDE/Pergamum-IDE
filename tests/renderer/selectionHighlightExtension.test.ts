import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  SMART_SELECTION_HIGHLIGHT_MAX_LENGTH,
  createSelectionHighlightExtension,
  findSmartSelectionHighlightRanges,
  smartSelectionHighlightField
} from "../../src/renderer/selectionHighlightExtension";

function stateWithSelection(doc: string, from: number, to: number): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.single(from, to),
    extensions: [smartSelectionHighlightField]
  });
}

function offsets(doc: string, value: string, fromIndex = 0): [number, number] {
  const start = doc.indexOf(value, fromIndex);

  if (start < 0) {
    throw new Error(`Could not find "${value}" in test document.`);
  }

  return [start, start + value.length];
}

describe("selection highlight extension (#425)", () => {
  it("creates mutually exclusive mode extensions", () => {
    expect(createSelectionHighlightExtension("off")).toEqual([]);
    expect(createSelectionHighlightExtension("smart")).toBe(
      smartSelectionHighlightField
    );
    expect(createSelectionHighlightExtension("default")).not.toBe(
      smartSelectionHighlightField
    );
  });

  it("does not smart-highlight empty, whitespace-only, multiline, or overly long selections", () => {
    expect(
      findSmartSelectionHighlightRanges(stateWithSelection("hello", 0, 0))
    ).toEqual([]);
    expect(
      findSmartSelectionHighlightRanges(stateWithSelection("   hello", 0, 3))
    ).toEqual([]);
    expect(
      findSmartSelectionHighlightRanges(stateWithSelection("foo\nfoo", 0, 7))
    ).toEqual([]);

    const longSelection = "a".repeat(SMART_SELECTION_HIGHLIGHT_MAX_LENGTH + 1);
    expect(
      findSmartSelectionHighlightRanges(
        stateWithSelection(`${longSelection} ${longSelection}`, 0, longSelection.length)
      )
    ).toEqual([]);
  });

  it("smart mode uses shared whole-word boundaries for ASCII words", () => {
    const doc = "night knight overnight midnight nightmare nightfall night";
    const [from, to] = offsets(doc, "night");

    expect(
      findSmartSelectionHighlightRanges(stateWithSelection(doc, from, to))
    ).toEqual([
      { from: 0, to: 5 },
      { from: 52, to: 57 }
    ]);
  });

  it("smart mode uses shared Japanese-aware whole-word boundaries", () => {
    const doc = "ハンドメイド メイド服 超メイド オーダーメイド メイド";
    const [from, to] = offsets(doc, "メイド服");

    expect(
      findSmartSelectionHighlightRanges(stateWithSelection(doc, from, from + 3))
    ).toEqual([
      { from, to: from + 3 },
      { from: 13, to: 16 },
      { from: 25, to: 28 }
    ]);
    expect(to).toBe(from + "メイド服".length);
  });
});
