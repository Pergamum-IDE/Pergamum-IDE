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

  it("generates 10x10 table skeleton (#603)", () => {
    const table = generateMarkdownTable(10, 10);
    const lines = table.split("\n");
    expect(lines).toHaveLength(12); // 1 header + 1 delimiter + 10 data rows
    expect(lines[0]).toBe("|" + "  |".repeat(10));
    expect(lines[1]).toBe("|" + " --- |".repeat(10));
  });

  it("clamps values lower than 1 to 1", () => {
    const table = generateMarkdownTable(0, -5);
    expect(table).toBe("|  |\n| --- |\n|  |");
  });

  it("clamps values higher than 99 to 99", () => {
    const table = generateMarkdownTable(150, 120);
    const lines = table.split("\n");
    expect(lines).toHaveLength(101); // 1 header + 1 delimiter + 99 data rows
    expect(lines[0]).toBe("|" + "  |".repeat(99));
  });
});
