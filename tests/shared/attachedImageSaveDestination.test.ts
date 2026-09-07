import { describe, expect, it } from "vitest";
import {
  isAcceptableAttachedImageSaveDestination,
  validateAttachedImageSaveDestination,
  type SaveDestinationRejectionReason
} from "../../src/shared/attachedImageSaveDestination";

function rejectionOf(raw: string): SaveDestinationRejectionReason {
  const result = validateAttachedImageSaveDestination(raw);
  if (result.ok) {
    throw new Error(`expected rejection for ${JSON.stringify(raw)}`);
  }
  return result.reason;
}

describe("validateAttachedImageSaveDestination — accepted", () => {
  it("accepts a simple project-relative directory", () => {
    expect(validateAttachedImageSaveDestination("images")).toEqual({
      ok: true,
      normalized: "images",
      segments: ["images"]
    });
  });

  it("accepts a nested directory and normalizes separators / redundant parts", () => {
    expect(
      validateAttachedImageSaveDestination("assets\\images\\.\\attached")
    ).toEqual({
      ok: true,
      normalized: "assets/images/attached",
      segments: ["assets", "images", "attached"]
    });
  });

  it("trims surrounding whitespace before validating", () => {
    expect(validateAttachedImageSaveDestination("  attachments/images  ")).toEqual(
      { ok: true, normalized: "attachments/images", segments: ["attachments", "images"] }
    );
  });

  it("accepts a Japanese directory name (percent-encoding not required here)", () => {
    expect(validateAttachedImageSaveDestination("素材/画像")).toEqual({
      ok: true,
      normalized: "素材/画像",
      segments: ["素材", "画像"]
    });
  });

  it("resolves an interior '..' that stays within the project", () => {
    expect(validateAttachedImageSaveDestination("a/b/../images")).toEqual({
      ok: true,
      normalized: "a/images",
      segments: ["a", "images"]
    });
  });
});

describe("validateAttachedImageSaveDestination — rejected", () => {
  it("rejects the empty / whitespace-only value", () => {
    expect(validateAttachedImageSaveDestination("")).toEqual({
      ok: false,
      reason: "empty"
    });
    expect(validateAttachedImageSaveDestination("   ")).toEqual({
      ok: false,
      reason: "empty"
    });
  });

  it("rejects an all-'..'/'.' path that collapses to the project root", () => {
    expect(validateAttachedImageSaveDestination("a/..")).toEqual({
      ok: false,
      reason: "empty"
    });
  });

  it("rejects POSIX-absolute and Windows root-relative paths", () => {
    expect(rejectionOf("/var/images")).toBe("absolute");
    expect(rejectionOf("\\images")).toBe("absolute");
    expect(rejectionOf("\\\\server\\share")).toBe("absolute");
    expect(rejectionOf("C:\\images")).toBe("absolute");
    expect(rejectionOf("c:/images")).toBe("absolute");
  });

  it("rejects a Windows drive-relative path", () => {
    expect(rejectionOf("C:images")).toBe("driveRelative");
  });

  it("rejects a path that climbs above the project root", () => {
    expect(rejectionOf("../images")).toBe("escapesProjectRoot");
    expect(rejectionOf("a/../../images")).toBe("escapesProjectRoot");
    expect(rejectionOf("..")).toBe("escapesProjectRoot");
  });

  it("rejects NUL / control characters and Windows-invalid characters", () => {
    expect(rejectionOf("images\u0000evil")).toBe("invalidCharacter");
    expect(rejectionOf("images\nfoo")).toBe("invalidCharacter");
    expect(rejectionOf("img?s")).toBe("invalidCharacter");
    expect(rejectionOf('a"b')).toBe("invalidCharacter");
  });

  it("rejects a Windows reserved device name in any segment", () => {
    expect(rejectionOf("CON")).toBe("reservedName");
    expect(rejectionOf("assets/nul/img")).toBe("reservedName");
    expect(rejectionOf("com1.png")).toBe("reservedName");
    expect(rejectionOf("assets/LPT9")).toBe("reservedName");
  });

  it("rejects a segment ending in a dot or a space", () => {
    expect(rejectionOf("images.")).toBe("trailingDotOrSpace");
    expect(rejectionOf("a/img /b")).toBe("trailingDotOrSpace");
  });
});

describe("isAcceptableAttachedImageSaveDestination", () => {
  it("mirrors the .ok field", () => {
    expect(isAcceptableAttachedImageSaveDestination("images")).toBe(true);
    expect(isAcceptableAttachedImageSaveDestination("../images")).toBe(false);
    expect(isAcceptableAttachedImageSaveDestination("")).toBe(false);
  });
});
