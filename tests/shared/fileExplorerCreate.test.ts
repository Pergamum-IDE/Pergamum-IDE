import { describe, expect, it } from "vitest";
import {
  applyMarkdownFileExtension,
  fileExplorerCreateFailureReasonFromErrorCode,
  fileExplorerCreateFailureReasonFromValidationError,
  isFileExplorerCreateValidationReason,
  isReservedFileExplorerName,
  validateFileExplorerName,
  type FileExplorerNameValidationError
} from "../../src/shared/fileExplorerCreate";

describe("validateFileExplorerName", () => {
  it("accepts an ordinary name and returns it NFC-normalized and trimmed", () => {
    expect(validateFileExplorerName("  chapter-01  ")).toEqual({
      ok: true,
      name: "chapter-01"
    });
  });

  it.each<[string, FileExplorerNameValidationError]>([
    ["", "empty"],
    ["   ", "empty"],
    [".", "dot"],
    ["..", "dotDot"],
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
