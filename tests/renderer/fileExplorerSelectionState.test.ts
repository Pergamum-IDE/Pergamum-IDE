import { describe, expect, it } from "vitest";
import {
  clearFileExplorerSelection,
  collapseFileExplorerSelection,
  createEmptyFileExplorerSelection,
  extendFileExplorerSelectionTo,
  isFileExplorerDescendantPath,
  replaceFileExplorerSelection,
  toggleFileExplorerSelection,
  type FileExplorerSelectionState
} from "../../src/renderer/fileExplorerSelectionState";

function state(
  selected: readonly string[],
  anchor: string | null
): FileExplorerSelectionState {
  return { selected: new Set(selected), anchor };
}

function sorted(selection: FileExplorerSelectionState): string[] {
  return [...selection.selected].sort();
}

describe("createEmptyFileExplorerSelection", () => {
  it("creates an empty selection with no anchor", () => {
    const empty = createEmptyFileExplorerSelection();

    expect(empty.selected.size).toBe(0);
    expect(empty.anchor).toBeNull();
  });
});

describe("replaceFileExplorerSelection", () => {
  it("makes the selection a single item and moves the anchor to it", () => {
    const next = replaceFileExplorerSelection(
      createEmptyFileExplorerSelection(),
      "a.md"
    );

    expect(sorted(next)).toEqual(["a.md"]);
    expect(next.anchor).toBe("a.md");
  });

  it("replaces any existing selection", () => {
    const next = replaceFileExplorerSelection(
      state(["a.md", "b.md", "c.md"], "b.md"),
      "z.md"
    );

    expect(sorted(next)).toEqual(["z.md"]);
    expect(next.anchor).toBe("z.md");
  });
});

describe("toggleFileExplorerSelection", () => {
  it("adds an unselected item", () => {
    const next = toggleFileExplorerSelection(state(["a.md"], "a.md"), "b.md");

    expect(sorted(next)).toEqual(["a.md", "b.md"]);
  });

  it("removes an already-selected item", () => {
    const next = toggleFileExplorerSelection(
      state(["a.md", "b.md"], "a.md"),
      "b.md"
    );

    expect(sorted(next)).toEqual(["a.md"]);
  });

  it("moves the anchor to the toggled path", () => {
    expect(
      toggleFileExplorerSelection(state(["a.md"], "a.md"), "b.md").anchor
    ).toBe("b.md");
    expect(
      toggleFileExplorerSelection(state(["a.md", "b.md"], "a.md"), "b.md")
        .anchor
    ).toBe("b.md");
  });

  it("keeps the anchor even when toggling empties the selection", () => {
    const next = toggleFileExplorerSelection(state(["a.md"], "a.md"), "a.md");

    expect(next.selected.size).toBe(0);
    expect(next.anchor).toBe("a.md");
  });
});

describe("extendFileExplorerSelectionTo", () => {
  const order = ["a.md", "b.md", "c.md", "d.md", "e.md"];

  it("selects the inclusive anchor..target range in visible order", () => {
    const next = extendFileExplorerSelectionTo(
      state(["b.md"], "b.md"),
      "d.md",
      order
    );

    expect(sorted(next)).toEqual(["b.md", "c.md", "d.md"]);
  });

  it("selects a backwards range the same way", () => {
    const next = extendFileExplorerSelectionTo(
      state(["d.md"], "d.md"),
      "b.md",
      order
    );

    expect(sorted(next)).toEqual(["b.md", "c.md", "d.md"]);
  });

  it("does not move the anchor", () => {
    const next = extendFileExplorerSelectionTo(
      state(["b.md"], "b.md"),
      "e.md",
      order
    );

    expect(next.anchor).toBe("b.md");
  });

  it("replaces rather than adds to the previous selection", () => {
    const next = extendFileExplorerSelectionTo(
      state(["a.md", "e.md"], "b.md"),
      "c.md",
      order
    );

    expect(sorted(next)).toEqual(["b.md", "c.md"]);
  });

  it("yields a single-item selection when anchor and target are the same", () => {
    const next = extendFileExplorerSelectionTo(
      state(["c.md"], "c.md"),
      "c.md",
      order
    );

    expect(sorted(next)).toEqual(["c.md"]);
    expect(next.anchor).toBe("c.md");
  });

  it("only ranges over visible items — a collapsed folder's children are excluded", () => {
    // "Drafts/scene-1.md" is NOT in visibleOrder (folder collapsed).
    const visible = ["Drafts", "notes.md", "outline.md"];
    const next = extendFileExplorerSelectionTo(
      state(["Drafts"], "Drafts"),
      "outline.md",
      visible
    );

    expect(sorted(next)).toEqual(["Drafts", "notes.md", "outline.md"]);
  });

  it("falls back to replace when there is no anchor", () => {
    const next = extendFileExplorerSelectionTo(
      state(["a.md", "b.md"], null),
      "d.md",
      order
    );

    expect(sorted(next)).toEqual(["d.md"]);
    expect(next.anchor).toBe("d.md");
  });

  it("falls back to replace when the anchor is not a visible item", () => {
    const next = extendFileExplorerSelectionTo(
      state(["hidden.md"], "hidden.md"),
      "c.md",
      order
    );

    expect(sorted(next)).toEqual(["c.md"]);
    expect(next.anchor).toBe("c.md");
  });

  it("falls back to replace when the target is not a visible item", () => {
    const next = extendFileExplorerSelectionTo(
      state(["b.md"], "b.md"),
      "hidden.md",
      order
    );

    expect(sorted(next)).toEqual(["hidden.md"]);
    expect(next.anchor).toBe("hidden.md");
  });
});

describe("clearFileExplorerSelection", () => {
  it("empties both the selection and the anchor", () => {
    const next = clearFileExplorerSelection(
      state(["a.md", "b.md"], "a.md")
    );

    expect(next.selected.size).toBe(0);
    expect(next.anchor).toBeNull();
  });
});

describe("isFileExplorerDescendantPath", () => {
  it("matches by path segment, not raw prefix", () => {
    expect(isFileExplorerDescendantPath("foo/bar.md", "foo")).toBe(true);
    expect(isFileExplorerDescendantPath("foo/bar/baz.md", "foo")).toBe(true);
    expect(isFileExplorerDescendantPath("foobar.md", "foo")).toBe(false);
    expect(isFileExplorerDescendantPath("foo-bar/baz.md", "foo")).toBe(false);
    expect(isFileExplorerDescendantPath("foo", "foo")).toBe(false);
  });
});

describe("collapseFileExplorerSelection", () => {
  it("removes selected items inside the collapsed folder", () => {
    const next = collapseFileExplorerSelection(
      state(["foo/bar.md", "foo/bar/baz.md"], "foo/bar.md"),
      "foo"
    );

    expect(next.selected.size).toBe(0);
  });

  it("keeps the folder itself selected", () => {
    const next = collapseFileExplorerSelection(
      state(["foo", "foo/bar.md"], "foo"),
      "foo"
    );

    expect(sorted(next)).toEqual(["foo"]);
  });

  it("keeps unrelated selected items", () => {
    const next = collapseFileExplorerSelection(
      state(["foo/bar.md", "other.md", "docs/x.md"], "foo/bar.md"),
      "foo"
    );

    expect(sorted(next)).toEqual(["docs/x.md", "other.md"]);
  });

  it("does not mis-remove siblings that share a name prefix", () => {
    const next = collapseFileExplorerSelection(
      state(["foobar.md", "foo-bar/baz.md", "foo/inside.md"], "foo/inside.md"),
      "foo"
    );

    expect(sorted(next)).toEqual(["foo-bar/baz.md", "foobar.md"]);
  });

  it("leaves the anchor untouched", () => {
    const next = collapseFileExplorerSelection(
      state(["foo/bar.md"], "foo/bar.md"),
      "foo"
    );

    expect(next.anchor).toBe("foo/bar.md");
  });
});

describe("purity", () => {
  it("does not mutate the input selected Set", () => {
    const input = state(["a.md", "b.md"], "a.md");
    const before = [...input.selected].sort();

    replaceFileExplorerSelection(input, "z.md");
    toggleFileExplorerSelection(input, "c.md");
    toggleFileExplorerSelection(input, "a.md");
    extendFileExplorerSelectionTo(input, "d.md", [
      "a.md",
      "b.md",
      "c.md",
      "d.md"
    ]);
    clearFileExplorerSelection(input);
    collapseFileExplorerSelection(input, "a");

    expect([...input.selected].sort()).toEqual(before);
    expect(input.anchor).toBe("a.md");
  });

  it("returns a fresh state object each call", () => {
    const input = state(["a.md"], "a.md");

    expect(replaceFileExplorerSelection(input, "a.md")).not.toBe(input);
    expect(toggleFileExplorerSelection(input, "b.md")).not.toBe(input);
    expect(clearFileExplorerSelection(input)).not.toBe(input);
    expect(collapseFileExplorerSelection(input, "x")).not.toBe(input);
    expect(
      extendFileExplorerSelectionTo(input, "a.md", ["a.md"])
    ).not.toBe(input);
  });
});
