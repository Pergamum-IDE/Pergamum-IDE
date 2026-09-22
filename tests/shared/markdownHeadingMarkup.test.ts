import { describe, expect, it } from "vitest";
import { applyHeadingToLine } from "../../src/shared/markdownHeadingMarkup";

describe("applyHeadingToLine", () => {
  it("applies H1 to a plain line", () => {
    expect(applyHeadingToLine("本文", 1)).toBe("# 本文");
  });

  it("applies H2 to a plain line", () => {
    expect(applyHeadingToLine("本文", 2)).toBe("## 本文");
  });

  it("replaces an existing H4 marker with H2 instead of duplicating it", () => {
    expect(applyHeadingToLine("#### 本文", 2)).toBe("## 本文");
  });

  it("removes an existing H2 marker for the normal paragraph option", () => {
    expect(applyHeadingToLine("## 本文", "normal")).toBe("本文");
  });

  it("leaves a non-heading line unchanged for the normal paragraph option", () => {
    expect(applyHeadingToLine("本文", "normal")).toBe("本文");
  });
});
