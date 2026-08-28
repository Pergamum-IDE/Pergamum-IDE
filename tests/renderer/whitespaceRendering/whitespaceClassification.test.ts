import { describe, expect, it } from "vitest";
import {
  ASCII_SPACE,
  classifyWhitespaceCharacter,
  IDEOGRAPHIC_SPACE,
  isAnyWhitespaceCategoryRendered,
  isWhitespaceCategoryRendered,
  OTHER_UNICODE_SPACE_CODE_POINTS,
  TAB,
  WHITESPACE_MATCH_CHARACTER_CLASS,
  type WhitespaceCategory
} from "../../../src/renderer/whitespaceRendering/whitespaceClassification";
import type { ApplicationEditorWhitespaceSettings } from "../../../src/shared/settings";

const cp = (codePoint: number): string => String.fromCodePoint(codePoint);

describe("classifyWhitespaceCharacter (#256)", () => {
  it("maps the three single-character categories exactly", () => {
    expect(classifyWhitespaceCharacter(cp(0x3000))).toBe("ideographicSpace");
    expect(classifyWhitespaceCharacter(cp(0x0020))).toBe("asciiSpace");
    expect(classifyWhitespaceCharacter(cp(0x0009))).toBe("tab");
  });

  it("exports the same characters its constants name", () => {
    expect(IDEOGRAPHIC_SPACE).toBe(cp(0x3000));
    expect(ASCII_SPACE).toBe(cp(0x0020));
    expect(TAB).toBe(cp(0x0009));
  });

  it("maps representative Zs characters to otherUnicodeSpace", () => {
    // U+00A0, U+1680, U+2009, U+202F, U+205F — the issue's explicit list.
    for (const codePoint of [0x00a0, 0x1680, 0x2009, 0x202f, 0x205f]) {
      expect(classifyWhitespaceCharacter(cp(codePoint))).toBe(
        "otherUnicodeSpace"
      );
    }
  });

  it("maps every U+2000–U+200A character to otherUnicodeSpace", () => {
    for (let codePoint = 0x2000; codePoint <= 0x200a; codePoint += 1) {
      expect(classifyWhitespaceCharacter(cp(codePoint))).toBe(
        "otherUnicodeSpace"
      );
    }
  });

  it("does NOT put U+0020, U+3000 or TAB in otherUnicodeSpace", () => {
    expect(classifyWhitespaceCharacter(cp(0x0020))).not.toBe(
      "otherUnicodeSpace"
    );
    expect(classifyWhitespaceCharacter(cp(0x3000))).not.toBe(
      "otherUnicodeSpace"
    );
    expect(classifyWhitespaceCharacter(cp(0x0009))).not.toBe(
      "otherUnicodeSpace"
    );
  });

  it("does NOT classify line terminators, zero-width or format characters", () => {
    const excluded = [
      0x000a, // LF
      0x000d, // CR
      0x000b, // vertical tab
      0x000c, // form feed
      0x0085, // NEL
      0x2028, // LINE SEPARATOR
      0x2029, // PARAGRAPH SEPARATOR
      0x200b, // ZERO WIDTH SPACE
      0x200c, // ZWNJ
      0x200d, // ZWJ
      0x202a, // LEFT-TO-RIGHT EMBEDDING (bidi control)
      0x2066, // LEFT-TO-RIGHT ISOLATE (bidi control)
      0xfeff, // ZERO WIDTH NO-BREAK SPACE / BOM (Cf)
      0x0061, // "a"
      0x3042 // "あ"
    ];

    for (const codePoint of excluded) {
      expect(classifyWhitespaceCharacter(cp(codePoint))).toBeNull();
    }
  });

  it("returns null for anything that is not exactly one UTF-16 code unit", () => {
    expect(classifyWhitespaceCharacter("")).toBeNull();
    expect(classifyWhitespaceCharacter(`${ASCII_SPACE}${ASCII_SPACE}`)).toBeNull();
    expect(
      classifyWhitespaceCharacter(`${IDEOGRAPHIC_SPACE}${IDEOGRAPHIC_SPACE}`)
    ).toBeNull();
  });

  it("keeps the shared match character class in sync with the classifier", () => {
    const regExp = new RegExp(`^[${WHITESPACE_MATCH_CHARACTER_CLASS}]$`);
    const recognized = [
      TAB,
      ASCII_SPACE,
      IDEOGRAPHIC_SPACE,
      ...OTHER_UNICODE_SPACE_CODE_POINTS.map(cp)
    ];

    for (const character of recognized) {
      expect(regExp.test(character)).toBe(true);
      expect(classifyWhitespaceCharacter(character)).not.toBeNull();
    }

    for (const codePoint of [0x000a, 0x000d, 0x2028, 0x200b, 0x0078]) {
      expect(regExp.test(cp(codePoint))).toBe(false);
    }
  });
});

function settings(
  overrides: Partial<ApplicationEditorWhitespaceSettings> = {}
): ApplicationEditorWhitespaceSettings {
  return {
    renderIdeographicSpace: false,
    renderAsciiSpace: false,
    renderTab: false,
    renderOtherUnicodeSpace: false,
    ...overrides
  };
}

describe("whitespace category <-> settings mapping (#256)", () => {
  const cases: ReadonlyArray<
    [WhitespaceCategory, keyof ApplicationEditorWhitespaceSettings]
  > = [
    ["ideographicSpace", "renderIdeographicSpace"],
    ["asciiSpace", "renderAsciiSpace"],
    ["tab", "renderTab"],
    ["otherUnicodeSpace", "renderOtherUnicodeSpace"]
  ];

  it("reads each category from its own boolean, independently", () => {
    for (const [category, key] of cases) {
      expect(isWhitespaceCategoryRendered(category, settings())).toBe(false);
      expect(
        isWhitespaceCategoryRendered(category, settings({ [key]: true }))
      ).toBe(true);

      // Flipping one key on must not change any other category's answer.
      for (const [otherCategory] of cases) {
        if (otherCategory === category) {
          continue;
        }
        expect(
          isWhitespaceCategoryRendered(
            otherCategory,
            settings({ [key]: true })
          )
        ).toBe(false);
      }
    }
  });

  it("isAnyWhitespaceCategoryRendered is the OR of the four booleans", () => {
    expect(isAnyWhitespaceCategoryRendered(settings())).toBe(false);
    for (const [, key] of cases) {
      expect(
        isAnyWhitespaceCategoryRendered(settings({ [key]: true }))
      ).toBe(true);
    }
  });
});
