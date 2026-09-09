import { describe, expect, it } from "vitest";
import {
  normalizeProjectName,
  validateProjectName,
  PROJECT_NAME_MAX_LENGTH
} from "../../src/shared/projectName";

describe("projectName validation and normalization (#422)", () => {
  describe("normalizeProjectName", () => {
    it("trims leading and trailing whitespace", () => {
      expect(normalizeProjectName("  迷子たちと千年領主  ")).toBe(
        "迷子たちと千年領主"
      );
      expect(normalizeProjectName("\u3000全角空白トリム\u3000")).toBe(
        "全角空白トリム"
      );
    });
  });

  describe("validateProjectName", () => {
    it("accepts normal strings", () => {
      expect(validateProjectName("迷子たちと千年領主")).toEqual({
        ok: true,
        normalizedName: "迷子たちと千年領主"
      });
      expect(validateProjectName("Project Alpha")).toEqual({
        ok: true,
        normalizedName: "Project Alpha"
      });
    });

    it("normalizes whitespace on validation success", () => {
      expect(validateProjectName("   My Project   ")).toEqual({
        ok: true,
        normalizedName: "My Project"
      });
    });

    it("allows characters forbidden in filenames", () => {
      const complexNames = [
        "第一部：迷子たちと千年領主",
        "Project / Draft #1",
        "迷子たちと千年領主？！",
        "chapter: alpha / beta",
        "Title <with> *special* ?chars? | \"quoted\" & \\backslashes\\"
      ];

      for (const name of complexNames) {
        expect(validateProjectName(name)).toEqual({
          ok: true,
          normalizedName: name
        });
      }
    });

    it("allows Japanese full-width and half-width punctuation", () => {
      const jpName = "【完結】異世界転生…！？〜夢幻の章〜（第1部）";
      expect(validateProjectName(jpName)).toEqual({
        ok: true,
        normalizedName: jpName
      });
    });

    it("rejects non-strings and empty strings", () => {
      expect(validateProjectName(null)).toEqual({
        ok: false,
        error: "empty"
      });
      expect(validateProjectName(undefined)).toEqual({
        ok: false,
        error: "empty"
      });
      expect(validateProjectName("")).toEqual({
        ok: false,
        error: "empty"
      });
      expect(validateProjectName("   ")).toEqual({
        ok: false,
        error: "empty"
      });
      expect(validateProjectName("\u3000\u3000")).toEqual({
        ok: false,
        error: "empty"
      });
    });

    it("accepts exact max length and rejects over max length", () => {
      const exact120 = "a".repeat(PROJECT_NAME_MAX_LENGTH);
      expect(validateProjectName(exact120)).toEqual({
        ok: true,
        normalizedName: exact120
      });

      const over120 = "a".repeat(PROJECT_NAME_MAX_LENGTH + 1);
      expect(validateProjectName(over120)).toEqual({
        ok: false,
        error: "tooLong"
      });

      // Whitespace outside max length should be trimmed first
      const padded120 = `   ${exact120}   `;
      expect(validateProjectName(padded120)).toEqual({
        ok: true,
        normalizedName: exact120
      });
    });

    it("rejects control characters U+0000 to U+001F", () => {
      expect(validateProjectName("Title\nWithNewline")).toEqual({
        ok: false,
        error: "controlCharacters"
      });
      expect(validateProjectName("Title\rWithCarriageReturn")).toEqual({
        ok: false,
        error: "controlCharacters"
      });
      expect(validateProjectName("Title\tWithTab")).toEqual({
        ok: false,
        error: "controlCharacters"
      });
      expect(validateProjectName("Title\0WithNull")).toEqual({
        ok: false,
        error: "controlCharacters"
      });
      expect(validateProjectName("Title\x1fWithUnitSep")).toEqual({
        ok: false,
        error: "controlCharacters"
      });
    });

    it("rejects DEL character U+007F", () => {
      expect(validateProjectName("Title\x7fWithDel")).toEqual({
        ok: false,
        error: "controlCharacters"
      });
    });
  });
});
