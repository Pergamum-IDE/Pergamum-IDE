import { describe, expect, it } from "vitest";
import {
  countCaptureGroups,
  parseReplacementTemplate,
  renderReplacement,
  validateReplacementTemplate,
  type ReplacementToken
} from "../../src/renderer/replace/replacementTemplate";

function tokens(template: string): ReplacementToken[] {
  const parsed = parseReplacementTemplate(template);
  if (!parsed.ok) {
    throw new Error(`expected ${template} to parse, got ${parsed.error}`);
  }
  return parsed.tokens;
}

function error(template: string): string {
  const parsed = parseReplacementTemplate(template);
  if (parsed.ok) {
    throw new Error(`expected ${template} to be invalid`);
  }
  return parsed.error;
}

describe("parseReplacementTemplate (#386)", () => {
  it("$$10 -> literal \"$10\" (three+ digits after $$ are just text)", () => {
    expect(tokens("$$10")).toEqual([{ kind: "literal", value: "$10" }]);
  });

  it("$$1 -> literal \"$1\"", () => {
    expect(tokens("$$1")).toEqual([{ kind: "literal", value: "$1" }]);
  });

  it("$$$1 -> literal \"$\" + capture group 1", () => {
    expect(tokens("$$$1")).toEqual([
      { kind: "literal", value: "$" },
      { kind: "capture", index: 1 }
    ]);
  });

  it("$$$$ -> literal \"$$\"", () => {
    expect(tokens("$$$$")).toEqual([{ kind: "literal", value: "$$" }]);
  });

  it("${2}00 -> capture group 2 + literal \"00\"", () => {
    expect(tokens("${2}00")).toEqual([
      { kind: "capture", index: 2 },
      { kind: "literal", value: "00" }
    ]);
  });

  it("$2a -> capture group 2 + literal \"a\"", () => {
    expect(tokens("$2a")).toEqual([
      { kind: "capture", index: 2 },
      { kind: "literal", value: "a" }
    ]);
  });

  it("$1 -> capture group 1; $99 -> capture group 99", () => {
    expect(tokens("$1")).toEqual([{ kind: "capture", index: 1 }]);
    expect(tokens("$99")).toEqual([{ kind: "capture", index: 99 }]);
  });

  it("${1} -> capture group 1; ${99} -> capture group 99", () => {
    expect(tokens("${1}")).toEqual([{ kind: "capture", index: 1 }]);
    expect(tokens("${99}")).toEqual([{ kind: "capture", index: 99 }]);
  });

  it("mixes literals and captures across the template", () => {
    expect(tokens("Chapter $1 - ${2}")).toEqual([
      { kind: "literal", value: "Chapter " },
      { kind: "capture", index: 1 },
      { kind: "literal", value: " - " },
      { kind: "capture", index: 2 }
    ]);
  });

  it("$0 / ${0} / $00 are invalid (group number out of 1..99)", () => {
    expect(error("$0")).toBe("invalidGroupNumber");
    expect(error("${0}")).toBe("invalidGroupNumber");
    expect(error("$00")).toBe("invalidGroupNumber");
  });

  it("$100 / $200 are ambiguous, not $1+00 / $2+00", () => {
    expect(error("$100")).toBe("ambiguousReference");
    expect(error("$200")).toBe("ambiguousReference");
    expect(error("abc$200def")).toBe("ambiguousReference");
  });

  it("${100} is invalid", () => {
    expect(error("${100}")).toBe("invalidGroupNumber");
  });

  it("$<name>, $&, $`, $', a lone $ -> unsupportedSequence", () => {
    expect(error("$<name>")).toBe("unsupportedSequence");
    expect(error("$&")).toBe("unsupportedSequence");
    expect(error("$`")).toBe("unsupportedSequence");
    expect(error("$'")).toBe("unsupportedSequence");
    expect(error("ends with $")).toBe("unsupportedSequence");
    expect(error("$")).toBe("unsupportedSequence");
    expect(error("${1")).toBe("unsupportedSequence");
    expect(error("${a}")).toBe("unsupportedSequence");
  });

  it("an empty template is a valid (empty) token list", () => {
    expect(tokens("")).toEqual([]);
  });
});

describe("validateReplacementTemplate + countCaptureGroups (#386)", () => {
  it("counts the capture groups in a pattern", () => {
    expect(countCaptureGroups("第([一二三])章")).toBe(1);
    expect(countCaptureGroups("(a)(b)(c)")).toBe(3);
    expect(countCaptureGroups("no groups here")).toBe(0);
  });

  it("rejects a capture reference past the pattern's group count", () => {
    const result = validateReplacementTemplate("$2", 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("missingGroup");
    }
  });

  it("accepts a capture reference within the group count", () => {
    const result = validateReplacementTemplate("Chapter $1", 1);
    expect(result.ok).toBe(true);
  });

  it("still reports a parse error before the group check", () => {
    const result = validateReplacementTemplate("$200", 5);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("ambiguousReference");
    }
  });
});

describe("renderReplacement (#386)", () => {
  it("expands literals and capture references against a match array", () => {
    const parsed = parseReplacementTemplate("Chapter $1 (${2})");
    if (!parsed.ok) {
      throw new Error("template should parse");
    }
    expect(
      renderReplacement(parsed.tokens, ["第一章", "一", "序"] as unknown as RegExpExecArray)
    ).toBe("Chapter 一 (序)");
  });

  it("treats an unmatched optional group as an empty string", () => {
    const parsed = parseReplacementTemplate("[$1]");
    if (!parsed.ok) {
      throw new Error("template should parse");
    }
    expect(
      renderReplacement(parsed.tokens, ["x", undefined] as unknown as RegExpExecArray)
    ).toBe("[]");
  });

  it("$$10 renders the literal $10", () => {
    const parsed = parseReplacementTemplate("$$10");
    if (!parsed.ok) {
      throw new Error("template should parse");
    }
    expect(renderReplacement(parsed.tokens, ["m"] as unknown as RegExpExecArray)).toBe(
      "$10"
    );
  });
});
