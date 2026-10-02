import { describe, expect, it } from "vitest";
import {
  REPORT_FILE_BASE_NAME_FALLBACK,
  REPORT_FILE_BASE_NAME_MAX_CODE_POINTS,
  glossaryDescriptionReportFileName,
  sanitizeReportBaseName
} from "../../src/shared/japaneseMachineCheckReportFileName";

describe("glossary Description report file name (#688)", () => {
  it("keeps an ordinary name as is", () => {
    expect(glossaryDescriptionReportFileName("アリス")).toBe("アリス.lint.md");
    expect(glossaryDescriptionReportFileName("王都騎士団")).toBe(
      "王都騎士団.lint.md"
    );
    expect(glossaryDescriptionReportFileName("TYPE-MOON")).toBe(
      "TYPE-MOON.lint.md"
    );
  });

  it("replaces every file-name-forbidden character with _", () => {
    expect(sanitizeReportBaseName("AC/DC")).toBe("AC_DC");
    expect(sanitizeReportBaseName("a\\b")).toBe("a_b");
    expect(sanitizeReportBaseName("Type:Moon")).toBe("Type_Moon");
    expect(sanitizeReportBaseName("A?B")).toBe("A_B");
    expect(sanitizeReportBaseName('"黒の騎士"')).toBe("_黒の騎士_");
    expect(sanitizeReportBaseName("A<B>")).toBe("A_B_");
    expect(sanitizeReportBaseName("a|b")).toBe("a_b");
    expect(sanitizeReportBaseName("a*b")).toBe("a_b");
    expect(glossaryDescriptionReportFileName("Type:Moon/Zero?")).toBe(
      "Type_Moon_Zero_.lint.md"
    );
  });

  it("replaces control characters", () => {
    expect(sanitizeReportBaseName("a\u0000b\u001fc\u007fd\ne")).toBe(
      "a_b_c_d_e"
    );
  });

  it("drops trailing dots and spaces, which Windows would strip", () => {
    expect(sanitizeReportBaseName("name.")).toBe("name");
    expect(sanitizeReportBaseName("name. . ")).toBe("name");
    expect(sanitizeReportBaseName("name  ")).toBe("name");
  });

  it("keeps something usable from a name made only of forbidden characters", () => {
    expect(sanitizeReportBaseName("///")).toBe("___");
  });

  it("falls back only when nothing is left", () => {
    for (const empty of ["", " ", "...", ". ."]) {
      expect(sanitizeReportBaseName(empty), JSON.stringify(empty)).toBe(
        REPORT_FILE_BASE_NAME_FALLBACK
      );
    }
    expect(glossaryDescriptionReportFileName("")).toBe(
      `${REPORT_FILE_BASE_NAME_FALLBACK}.lint.md`
    );
  });

  it("makes Windows reserved device names safe, in any case and with a suffix", () => {
    for (const reserved of [
      "CON",
      "con",
      "PRN",
      "AUX",
      "NUL",
      "COM1",
      "com9",
      "LPT1",
      "lpt9"
    ]) {
      expect(sanitizeReportBaseName(reserved), reserved).toBe(`_${reserved}`);
    }
    expect(sanitizeReportBaseName("CON.txt")).toBe("_CON.txt");
    expect(sanitizeReportBaseName("nul.tar.gz")).toBe("_nul.tar.gz");
    expect(sanitizeReportBaseName("CON .x")).toBe("_CON .x");
    expect(glossaryDescriptionReportFileName("CON")).toBe("_CON.lint.md");
  });

  it("leaves names that only contain a reserved word alone", () => {
    for (const fine of ["CONSOLE", "COM10", "COM0", "LPT", "console.log", "アリスCON"]) {
      expect(sanitizeReportBaseName(fine), fine).toBe(fine);
    }
  });

  it("cuts a very long name by code points, never inside a surrogate pair", () => {
    const long = "あ".repeat(500);
    const cut = sanitizeReportBaseName(long);

    expect([...cut]).toHaveLength(REPORT_FILE_BASE_NAME_MAX_CODE_POINTS);

    const astral = "𠮷".repeat(REPORT_FILE_BASE_NAME_MAX_CODE_POINTS + 30);
    const astralCut = sanitizeReportBaseName(astral);

    expect([...astralCut]).toHaveLength(REPORT_FILE_BASE_NAME_MAX_CODE_POINTS);
    // Every unit pairs up: no lone surrogate was left by the cut.
    expect(astralCut).toBe(
      "𠮷".repeat(REPORT_FILE_BASE_NAME_MAX_CODE_POINTS)
    );
    expect(() => encodeURIComponent(astralCut)).not.toThrow();
  });

  it("keeps an astral character at the cut edge whole", () => {
    const edge =
      "a".repeat(REPORT_FILE_BASE_NAME_MAX_CODE_POINTS - 1) + "𠮷" + "tail";

    expect(sanitizeReportBaseName(edge)).toBe(
      "a".repeat(REPORT_FILE_BASE_NAME_MAX_CODE_POINTS - 1) + "𠮷"
    );
  });

  it("only affects the suggestion: the original name is not part of the result's contract", () => {
    const original = "Type:Moon/Zero?";

    sanitizeReportBaseName(original);

    expect(original).toBe("Type:Moon/Zero?");
  });
});
