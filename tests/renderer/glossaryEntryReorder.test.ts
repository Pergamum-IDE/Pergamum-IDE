import { describe, expect, it } from "vitest";
import {
  glossaryEntryOrderChanged,
  reorderGlossaryEntryIds
} from "../../src/renderer/glossaryEntryReorder";

const ids = ["a", "b", "c", "d"];

describe("reorderGlossaryEntryIds (#375)", () => {
  it("moves an id down to a later index", () => {
    expect(reorderGlossaryEntryIds(ids, 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an id up to an earlier index", () => {
    expect(reorderGlossaryEntryIds(ids, 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("returns a new array and never mutates the input", () => {
    const input = [...ids];
    const output = reorderGlossaryEntryIds(input, 1, 3);
    expect(output).not.toBe(input);
    expect(input).toEqual(ids);
  });

  it("is a no-op copy when the position does not change", () => {
    expect(reorderGlossaryEntryIds(ids, 2, 2)).toEqual(ids);
  });

  it("clamps an out-of-range destination into the array", () => {
    expect(reorderGlossaryEntryIds(ids, 0, 99)).toEqual(["b", "c", "d", "a"]);
    expect(reorderGlossaryEntryIds(ids, 3, -5)).toEqual(["d", "a", "b", "c"]);
  });

  it("returns an unchanged copy for an out-of-range source", () => {
    expect(reorderGlossaryEntryIds(ids, -1, 0)).toEqual(ids);
    expect(reorderGlossaryEntryIds(ids, 4, 0)).toEqual(ids);
  });

  it("keeps every id exactly once (a permutation)", () => {
    const output = reorderGlossaryEntryIds(ids, 1, 3);
    expect([...output].sort()).toEqual([...ids].sort());
  });
});

describe("glossaryEntryOrderChanged (#375)", () => {
  it("detects a positional change", () => {
    expect(glossaryEntryOrderChanged(ids, ["a", "c", "b", "d"])).toBe(true);
  });

  it("is false for an identical order", () => {
    expect(glossaryEntryOrderChanged(ids, [...ids])).toBe(false);
  });

  it("is true when the lengths differ", () => {
    expect(glossaryEntryOrderChanged(ids, ["a", "b", "c"])).toBe(true);
  });
});
