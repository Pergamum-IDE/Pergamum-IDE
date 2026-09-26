import { describe, expect, it } from "vitest";
import { joinExportPath } from "../../src/renderer/exportPathHelper";

describe("joinExportPath", () => {
  it("joins a Windows folder path with a file name using backslashes", () => {
    expect(joinExportPath("C:\\Users\\technerd\\Documents", "迷子たちと千年領主.pdf")).toBe(
      "C:\\Users\\technerd\\Documents\\迷子たちと千年領主.pdf"
    );
  });

  it("handles trailing backslashes in Windows folder path without duplicating backslashes", () => {
    expect(joinExportPath("C:\\Users\\technerd\\Documents\\\\", "glossary.html")).toBe(
      "C:\\Users\\technerd\\Documents\\glossary.html"
    );
  });

  it("joins a POSIX folder path with a file name using forward slashes", () => {
    expect(joinExportPath("/Users/technerd/Documents", "迷子たちと千年領主.pdf")).toBe(
      "/Users/technerd/Documents/迷子たちと千年領主.pdf"
    );
  });

  it("handles trailing forward slashes in POSIX folder path without duplicating slashes", () => {
    expect(joinExportPath("/Users/technerd/Documents///", "glossary.html")).toBe(
      "/Users/technerd/Documents/glossary.html"
    );
  });

  it("returns just the file name if folder path is empty or whitespace", () => {
    expect(joinExportPath("", "glossary.html")).toBe("glossary.html");
    expect(joinExportPath("   ", "glossary.html")).toBe("glossary.html");
  });
});
