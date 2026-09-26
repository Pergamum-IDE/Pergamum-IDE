import { describe, expect, it } from "vitest";
import {
  applyMarkdownFileExtension,
  combineNameAndExtension,
  fileExplorerCreateFailureReasonFromErrorCode,
  fileExplorerCreateFailureReasonFromValidationError,
  isFileExplorerCreateValidationReason,
  isReservedFileExplorerName,
  pathHasReservedFileExplorerSegment,
  validateFileExplorerName,
  type FileExplorerNameValidationError
} from "../../src/shared/fileExplorerCreate";

describe("validateFileExplorerName", () => {
  it("accepts an ordinary name with leading space and returns it NFC-normalized and trimmed", () => {
    expect(validateFileExplorerName("  chapter-01")).toEqual({
      ok: true,
      name: "chapter-01"
    });
  });

  it.each<[string, FileExplorerNameValidationError]>([
    ["", "empty"],
    ["   ", "empty"],
    [".", "dot"],
    ["..", "dotDot"],
    ["CreateFile.", "trailingPeriodOrWhitespace"],
    ["CreateFile..", "dotDot"],
    ["CreateFile.txt.bin.", "trailingPeriodOrWhitespace"],
    ["CreateFile.txt.bin. ", "trailingPeriodOrWhitespace"],
    ["chapter-01 ", "trailingPeriodOrWhitespace"],
    ["a/b", "separator"],
    ["a\\b", "separator"],
    [`tab${String.fromCharCode(9)}name`, "controlCharacter"],
    [`nul${String.fromCharCode(0)}name`, "controlCharacter"],
    [`del${String.fromCharCode(127)}`, "controlCharacter"],
    [".git", "reserved"],
    [".DS_Store", "reserved"],
    ["Thumbs.db", "reserved"],
    ["desktop.ini", "reserved"],
    [".pergamum", "reserved"],
    [".pergamum.lock", "reserved"],
    ["pergamum.json", "reserved"],
    [".pergamum_recovery", "reserved"],
    [".pergamum.lock.stale-2026-08-30T00-00-00Z", "reserved"]
  ])("rejects %j with %s", (input, error) => {
    expect(validateFileExplorerName(input)).toEqual({ ok: false, error });
  });
});

describe("isReservedFileExplorerName", () => {
  it("is case-insensitive and matches stale-lock archives by prefix", () => {
    expect(isReservedFileExplorerName(".GIT")).toBe(true);
    expect(isReservedFileExplorerName("THUMBS.DB")).toBe(true);
    expect(isReservedFileExplorerName(".Pergamum.Lock.Stale-anything")).toBe(
      true
    );
    expect(isReservedFileExplorerName("chapter.md")).toBe(false);
    expect(isReservedFileExplorerName("")).toBe(false);
  });
});

describe("pathHasReservedFileExplorerSegment (#311)", () => {
  it("flags a reserved segment anywhere in a project-relative path", () => {
    for (const reserved of [
      ".git",
      ".pergamum_recovery",
      ".pergamum.lock",
      "pergamum.json",
      ".pergamum.lock.stale-20260830",
      "foo/.git",
      "foo/bar/.pergamum_recovery",
      "foo\\.pergamum.lock.stale-20260830",
      "Thumbs.db"
    ]) {
      expect(pathHasReservedFileExplorerSegment(reserved)).toBe(true);
    }
  });

  it("passes ordinary project-relative folder paths and the root", () => {
    expect(pathHasReservedFileExplorerSegment(null)).toBe(false);
    expect(pathHasReservedFileExplorerSegment("")).toBe(false);
    expect(pathHasReservedFileExplorerSegment("Drafts")).toBe(false);
    expect(pathHasReservedFileExplorerSegment("Drafts/Chapter1")).toBe(false);
    expect(
      pathHasReservedFileExplorerSegment("Drafts/pergamum-notes")
    ).toBe(false);
  });
});

describe("applyMarkdownFileExtension", () => {
  it("keeps a supported extension (case-insensitive)", () => {
    expect(applyMarkdownFileExtension("chapter.md")).toEqual({
      ok: true,
      fileName: "chapter.md"
    });
    expect(applyMarkdownFileExtension("chapter.MARKDOWN")).toEqual({
      ok: true,
      fileName: "chapter.MARKDOWN"
    });
  });

  it("appends .md when no extension was entered", () => {
    expect(applyMarkdownFileExtension("chapter")).toEqual({
      ok: true,
      fileName: "chapter.md"
    });
    expect(applyMarkdownFileExtension("notes.for.today")).toEqual({
      ok: false,
      error: "unsupportedExtension"
    });
  });

  it("rejects an unsupported extension", () => {
    expect(applyMarkdownFileExtension("chapter.txt")).toEqual({
      ok: false,
      error: "unsupportedExtension"
    });
    expect(applyMarkdownFileExtension("archive.md.zip")).toEqual({
      ok: false,
      error: "unsupportedExtension"
    });
  });
});

describe("failure reason mapping", () => {
  it("maps Node error codes to stable reasons", () => {
    expect(fileExplorerCreateFailureReasonFromErrorCode("EEXIST")).toBe(
      "alreadyExists"
    );
    expect(fileExplorerCreateFailureReasonFromErrorCode("EACCES")).toBe(
      "permissionDenied"
    );
    expect(fileExplorerCreateFailureReasonFromErrorCode("EPERM")).toBe(
      "permissionDenied"
    );
    expect(fileExplorerCreateFailureReasonFromErrorCode("ENOENT")).toBe(
      "targetDirectoryMissing"
    );
    expect(fileExplorerCreateFailureReasonFromErrorCode("ENOTDIR")).toBe(
      "notDirectory"
    );
    expect(fileExplorerCreateFailureReasonFromErrorCode("ENAMETOOLONG")).toBe(
      "nameTooLong"
    );
    expect(fileExplorerCreateFailureReasonFromErrorCode("ENOSPC")).toBe(
      "noSpace"
    );
    expect(fileExplorerCreateFailureReasonFromErrorCode("EROFS")).toBe(
      "readOnlyFilesystem"
    );
    expect(fileExplorerCreateFailureReasonFromErrorCode("EWHATEVER")).toBe(
      "unknown"
    );
    expect(fileExplorerCreateFailureReasonFromErrorCode(undefined)).toBe(
      "unknown"
    );
  });

  it("maps a validation error to a reason and classifies validation reasons", () => {
    expect(
      fileExplorerCreateFailureReasonFromValidationError("reserved")
    ).toBe("reservedName");
    expect(fileExplorerCreateFailureReasonFromValidationError("empty")).toBe(
      "invalidName"
    );

    expect(isFileExplorerCreateValidationReason("invalidName")).toBe(true);
    expect(isFileExplorerCreateValidationReason("reservedName")).toBe(true);
    expect(isFileExplorerCreateValidationReason("unsupportedExtension")).toBe(
      true
    );
    expect(isFileExplorerCreateValidationReason("alreadyExists")).toBe(false);
    expect(isFileExplorerCreateValidationReason("permissionDenied")).toBe(
      false
    );
    expect(isFileExplorerCreateValidationReason("unknown")).toBe(false);
  });
});

describe("combineNameAndExtension", () => {
  it("appends selected extension when raw name has no recognized extension", () => {
    expect(combineNameAndExtension("chapter1", ".md")).toBe("chapter1.md");
    expect(combineNameAndExtension("notes.v1", ".md")).toBe("notes.v1.md");
    expect(combineNameAndExtension("document", ".txt")).toBe("document.txt");
    expect(combineNameAndExtension("CreateFile.txt.bin", ".md")).toBe(
      "CreateFile.txt.bin.md"
    );
  });

  it("preserves recognized existing extensions without duplicating", () => {
    expect(combineNameAndExtension("chapter1.md", ".md")).toBe("chapter1.md");
    expect(combineNameAndExtension("chapter1.MARKDOWN", ".md")).toBe(
      "chapter1.MARKDOWN"
    );
    expect(combineNameAndExtension("chapter1.txt", ".md")).toBe("chapter1.txt");
  });

  it("does not append extension over trailing dot or trailing whitespace", () => {
    expect(combineNameAndExtension("CreateFile.", ".md")).toBe("CreateFile.");
    expect(combineNameAndExtension("CreateFile.txt.bin.", ".md")).toBe(
      "CreateFile.txt.bin."
    );
  });
});
