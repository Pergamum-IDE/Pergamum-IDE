import { describe, expect, it } from "vitest";
import { GlossaryValidationError } from "../../src/shared/glossary";
import {
  autoGlossaryTagForegroundRgb,
  GLOSSARY_TAG_YIQ_THRESHOLD,
  randomGlossaryTagBackgroundRgb
} from "../../src/shared/glossaryTagColor";

describe("autoGlossaryTagForegroundRgb (#375)", () => {
  it("picks black on a light background and white on a dark one (YIQ)", () => {
    expect(autoGlossaryTagForegroundRgb("#ffffff")).toBe("#000000");
    expect(autoGlossaryTagForegroundRgb("#000000")).toBe("#ffffff");
    expect(autoGlossaryTagForegroundRgb("#ffff00")).toBe("#000000"); // yellow
    expect(autoGlossaryTagForegroundRgb("#0000ff")).toBe("#ffffff"); // blue
  });

  it("uses the documented threshold of 128000", () => {
    // R*299 + G*587 + B*114 with R=G=B=145 -> 145 * 1000 = 145000 >= threshold
    expect(autoGlossaryTagForegroundRgb("#919191")).toBe("#000000");
    // R=G=B=127 -> 127000 < 128000
    expect(autoGlossaryTagForegroundRgb("#7f7f7f")).toBe("#ffffff");
    expect(GLOSSARY_TAG_YIQ_THRESHOLD).toBe(128000);
  });

  it("accepts a 3-digit / no-# hex and rejects garbage", () => {
    expect(autoGlossaryTagForegroundRgb("fff")).toBe("#000000");
    expect(() => autoGlossaryTagForegroundRgb("nope")).toThrow(
      GlossaryValidationError
    );
  });
});

describe("randomGlossaryTagBackgroundRgb (#375)", () => {
  it("is a normalized #rrggbb and is deterministic with an injected random", () => {
    const values = [0, 0.5, 0.999];
    let index = 0;
    const random = () => values[index++ % values.length];

    expect(randomGlossaryTagBackgroundRgb(random)).toBe("#0080ff");
    expect(randomGlossaryTagBackgroundRgb(() => 0.25)).toBe("#404040");
    expect(randomGlossaryTagBackgroundRgb(() => Math.random())).toMatch(
      /^#[0-9a-f]{6}$/
    );
  });
});
