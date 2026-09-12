import { describe, expect, it } from "vitest";
import { normalizeMarkdownTextForStorage } from "../../src/shared/markdownTextNormalization";

describe("normalizeMarkdownTextForStorage (#449)", () => {
  it("normalizes Markdown text to NFC when enabled", () => {
    expect(
      normalizeMarkdownTextForStorage("か\u3099", {
        normalizeUnicodeToNfc: true
      })
    ).toBe("が");
  });

  it("leaves Markdown text unchanged when disabled", () => {
    const decomposed = "か\u3099";

    expect(
      normalizeMarkdownTextForStorage(decomposed, {
        normalizeUnicodeToNfc: false
      })
    ).toBe(decomposed);
  });

  it("keeps already-NFC Markdown text unchanged", () => {
    expect(
      normalizeMarkdownTextForStorage("が", {
        normalizeUnicodeToNfc: true
      })
    ).toBe("が");
  });
});
