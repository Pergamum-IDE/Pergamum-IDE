import { describe, expect, it } from "vitest";
import {
  glossaryTagOrderChanged,
  reorderGlossaryTagIds
} from "../../src/renderer/glossaryTagReorder";

const ids = ["a", "b", "c", "d"];

describe("reorderGlossaryTagIds (#375)", () => {
  it("moves an id down to a later index", () => {
    expect(reorderGlossaryTagIds(ids, 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an id up to an earlier index", () => {
    expect(reorderGlossaryTagIds(ids, 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("returns a new array and never mutates the input", () => {
    const input = [...ids];
    const output = reorderGlossaryTagIds(input, 1, 3);
    expect(output).not.toBe(input);
    expect(input).toEqual(ids);
  });

  it("is a no-op copy when the position does not change", () => {
    expect(reorderGlossaryTagIds(ids, 2, 2)).toEqual(ids);
  });

  it("clamps an out-of-range destination into the array", () => {
    expect(reorderGlossaryTagIds(ids, 0, 99)).toEqual(["b", "c", "d", "a"]);
    expect(reorderGlossaryTagIds(ids, 3, -5)).toEqual(["d", "a", "b", "c"]);
  });

  it("returns an unchanged copy for an out-of-range source", () => {
    expect(reorderGlossaryTagIds(ids, -1, 0)).toEqual(ids);
    expect(reorderGlossaryTagIds(ids, 4, 0)).toEqual(ids);
  });

  it("keeps every id exactly once (a permutation)", () => {
    const output = reorderGlossaryTagIds(ids, 1, 3);
    expect([...output].sort()).toEqual([...ids].sort());
  });
});

describe("glossaryTagOrderChanged (#375)", () => {
  it("detects a positional change", () => {
    expect(glossaryTagOrderChanged(ids, ["a", "c", "b", "d"])).toBe(true);
  });

  it("is false for an identical order", () => {
    expect(glossaryTagOrderChanged(ids, [...ids])).toBe(false);
  });

  it("is true when the lengths differ", () => {
    expect(glossaryTagOrderChanged(ids, ["a", "b", "c"])).toBe(true);
  });
});
