import { describe, expect, it } from "vitest";
import {
  attachedImageBaseFileName,
  attachedImageFileNameForAttempt,
  formatAttachedImageTimestampStem
} from "../../src/shared/attachedImageFilename";

// A fixed LOCAL-time date: 2026-09-07 09:52:13.042
const SAMPLE = new Date(2026, 8, 7, 9, 52, 13, 42);

describe("formatAttachedImageTimestampStem", () => {
  it("formats as yyyy-MM-dd-HHmmssSSS with zero padding", () => {
    expect(formatAttachedImageTimestampStem(SAMPLE)).toBe("2026-09-07-095213042");
  });

  it("zero-pads single-digit month/day/hour and 3-digit millis", () => {
    const early = new Date(2026, 0, 3, 4, 5, 6, 7);
    expect(formatAttachedImageTimestampStem(early)).toBe("2026-01-03-040506007");
  });
});

describe("attachedImageBaseFileName", () => {
  it("appends the extension to the timestamp stem", () => {
    expect(attachedImageBaseFileName(SAMPLE, ".png")).toBe(
      "2026-09-07-095213042.png"
    );
    expect(attachedImageBaseFileName(SAMPLE, ".jpg")).toBe(
      "2026-09-07-095213042.jpg"
    );
  });
});

describe("attachedImageFileNameForAttempt", () => {
  it("uses the un-suffixed name for attempt 0", () => {
    expect(attachedImageFileNameForAttempt(SAMPLE, ".png", 0)).toBe(
      "2026-09-07-095213042.png"
    );
  });

  it("inserts -1, -2, ... before the extension on later attempts", () => {
    expect(attachedImageFileNameForAttempt(SAMPLE, ".png", 1)).toBe(
      "2026-09-07-095213042-1.png"
    );
    expect(attachedImageFileNameForAttempt(SAMPLE, ".webp", 2)).toBe(
      "2026-09-07-095213042-2.webp"
    );
    expect(attachedImageFileNameForAttempt(SAMPLE, ".gif", 17)).toBe(
      "2026-09-07-095213042-17.gif"
    );
  });

  it("rejects a negative or non-integer attempt", () => {
    expect(() => attachedImageFileNameForAttempt(SAMPLE, ".png", -1)).toThrow();
    expect(() => attachedImageFileNameForAttempt(SAMPLE, ".png", 1.5)).toThrow();
  });
});
