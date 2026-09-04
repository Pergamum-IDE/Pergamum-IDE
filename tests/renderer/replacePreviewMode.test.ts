import { describe, expect, it } from "vitest";
import type { Translate } from "../../src/shared/i18n";
import { buildReplacePreviewModeLabel } from "../../src/renderer/replace/replacePreviewMode";

const translate: Translate = (key) => key;

describe("buildReplacePreviewModeLabel (#386)", () => {
  it("returns the plain full-text label when no option is active", () => {
    expect(
      buildReplacePreviewModeLabel(translate, {
        wholeWord: false,
        caseSensitive: false,
        useRegex: false
      })
    ).toBe("search.replace.preview.mode.plain");
  });

  it("lists regex, then whole word, then match case", () => {
    expect(
      buildReplacePreviewModeLabel(translate, {
        wholeWord: true,
        caseSensitive: true,
        useRegex: true
      })
    ).toBe(
      "search.replace.preview.mode.regex / " +
        "search.replace.preview.mode.wholeWord / " +
        "search.replace.preview.mode.caseSensitive"
    );
  });

  it("shows only the whole-word label when only whole word is on", () => {
    expect(
      buildReplacePreviewModeLabel(translate, {
        wholeWord: true,
        caseSensitive: false,
        useRegex: false
      })
    ).toBe("search.replace.preview.mode.wholeWord");
  });

  it("shows regex and match case together (the common regex combination)", () => {
    expect(
      buildReplacePreviewModeLabel(translate, {
        wholeWord: false,
        caseSensitive: true,
        useRegex: true
      })
    ).toBe(
      "search.replace.preview.mode.regex / " +
        "search.replace.preview.mode.caseSensitive"
    );
  });
});
