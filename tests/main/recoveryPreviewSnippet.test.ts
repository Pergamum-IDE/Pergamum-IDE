import { describe, expect, it } from "vitest";
import { buildRecoveryPreviewSnippet } from "../../src/main/recoveryPreviewSnippet";

describe("buildRecoveryPreviewSnippet", () => {
  it("collapses line breaks and whitespace runs to a single space and trims", () => {
    expect(
      buildRecoveryPreviewSnippet("  first\r\n\r\n  second\t\tthird  ")
    ).toBe("first seco…");
  });

  it("returns the whole string (no ellipsis) when short", () => {
    expect(buildRecoveryPreviewSnippet("hi there")).toBe("hi there");
    expect(buildRecoveryPreviewSnippet("0123456789")).toBe("0123456789");
  });

  it("appends an ellipsis only when there is more than 10 visible code points", () => {
    expect(buildRecoveryPreviewSnippet("01234567890")).toBe("0123456789…");
  });

  it("counts a multi-byte code point as one", () => {
    // 12 code points, one of them astral.
    expect(buildRecoveryPreviewSnippet("𐍈bcdefghijkl")).toBe("𐍈bcdefghij…");
  });

  it("returns an empty string for a blank or whitespace-only payload", () => {
    expect(buildRecoveryPreviewSnippet("")).toBe("");
    expect(buildRecoveryPreviewSnippet("   \n\t \r\n ")).toBe("");
  });

  it("does not mutate its input", () => {
    const input = "line one\nline two";
    buildRecoveryPreviewSnippet(input);
    expect(input).toBe("line one\nline two");
  });
});
