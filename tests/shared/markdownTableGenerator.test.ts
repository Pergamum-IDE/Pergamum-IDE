import { describe, expect, it } from "vitest";
import { generateMarkdownTable } from "../../src/shared/markdownTableGenerator";

describe("generateMarkdownTable", () => {
  it("generates 1x1 table skeleton", () => {
    const table = generateMarkdownTable(1, 1);
    expect(table).toBe("|  |\n| --- |\n|  |");
  });

  it("generates 3x2 table skeleton", () => {
    const table = generateMarkdownTable(3, 2);
    const expected =
      "|  |  |  |\n" +
      "| --- | --- | --- |\n" +
      "|  |  |  |\n" +
      "|  |  |  |";
    expect(table).toBe(expected);
  });

  it("clamps values lower than 1 to 1", () => {
    const table = generateMarkdownTable(0, -5);
    expect(table).toBe("|  |\n| --- |\n|  |");
  });

  it("clamps values higher than 6 to 6", () => {
    const table = generateMarkdownTable(10, 8);
    const lines = table.split("\n");
    expect(lines).toHaveLength(8); // 1 header + 1 delimiter + 6 data rows
    expect(lines[0]).toBe("|  |  |  |  |  |  |");
  });
});
