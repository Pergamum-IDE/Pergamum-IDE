import { describe, expect, it } from "vitest";
import {
  formatLocalDateTime,
  formatResumeHubDateTime,
  generateDocumentPreview
} from "../../src/shared/resumeHubHelpers";

describe("generateDocumentPreview", () => {
  it("strips leading empty lines, converts newlines to spaces, and collapses whitespace", () => {
    const raw = "\n\n  \n\n  彼女が箱を開けた瞬間、   世界が静寂に包まれた。";
    // collapsed: "彼女が箱を開けた瞬間、 世界が静寂に包まれた。"
    // length of "彼女が箱を開けた瞬間、 世界が静寂に包まれた。" is 23 (>20) -> first 20 + "…"
    expect(generateDocumentPreview(raw)).toBe(
      "彼女が箱を開けた瞬間、 世界が静寂に包ま…"
    );
  });

  it("returns exact text when 20 characters or fewer", () => {
    const raw = "第一章 始まりの場所";
    expect(generateDocumentPreview(raw)).toBe("第一章 始まりの場所");
  });

  it("appends ellipsis when longer than 20 characters", () => {
    const raw = "123456789012345678901";
    expect(generateDocumentPreview(raw)).toBe("12345678901234567890…");
  });

  it("returns 本文なし when content is empty or whitespace only", () => {
    expect(generateDocumentPreview("")).toBe("本文なし");
    expect(generateDocumentPreview("   \n\n  \t ")).toBe("本文なし");
  });
});

describe("formatResumeHubDateTime", () => {
  it("formats date as yyyy-MM-dd HH:mm in local time by default", () => {
    const date = new Date(2026, 8, 28, 7, 10, 0); // Sep 28, 2026 07:10 local time
    expect(formatResumeHubDateTime(date)).toBe("2026-09-28 07:10");
    expect(formatLocalDateTime(date)).toBe("2026-09-28 07:10");
  });

  it("formats date in UTC when timeZone option is UTC", () => {
    const date = new Date("2026-09-28T05:00:00.000Z");
    expect(formatResumeHubDateTime(date, { timeZone: "UTC" })).toBe(
      "2026-09-28 05:00"
    );
  });

  it("formats date in Asia/Tokyo when timeZone option is Asia/Tokyo", () => {
    const date = new Date("2026-09-28T05:00:00.000Z");
    expect(formatResumeHubDateTime(date, { timeZone: "Asia/Tokyo" })).toBe(
      "2026-09-28 14:00"
    );
  });

  it("returns empty string for invalid date", () => {
    expect(formatResumeHubDateTime("invalid-date")).toBe("");
    expect(formatLocalDateTime("invalid-date")).toBe("");
  });
});
