import { describe, expect, it } from "vitest";
import {
  applyMarkdownFileRenameExtension,
  fileExplorerRenameFailureReasonFromErrorCode,
  isFileExplorerRenameValidationReason,
  validateFileExplorerRenameName
} from "../../src/shared/fileExplorerRename";

describe("File Explorer rename helpers (#313)", () => {
  it("keeps a supported Markdown extension or reuses the original one", () => {
    expect(
      applyMarkdownFileRenameExtension("chapter-01.md", "chapter-02")
    ).toEqual({ ok: true, name: "chapter-02.md" });
    expect(
      applyMarkdownFileRenameExtension(
        "chapter-01.markdown",
        "chapter-02.md"
      )
    ).toEqual({ ok: true, name: "chapter-02.md" });
    expect(
      applyMarkdownFileRenameExtension(
        "chapter-01.markdown",
        "chapter-02.markdown"
      )
    ).toEqual({ ok: true, name: "chapter-02.markdown" });
  });

  it("rejects unsupported Markdown rename extensions", () => {
    expect(
      applyMarkdownFileRenameExtension("chapter-01.md", "chapter-02.txt")
    ).toEqual({ ok: false, reason: "unsupportedExtension" });
    expect(
      applyMarkdownFileRenameExtension("chapter-01.txt", "chapter-02")
    ).toEqual({ ok: false, reason: "unsupportedExtension" });
  });

  it("rejects reserved, invalid, and same-path names", () => {
    expect(
      validateFileExplorerRenameName({
        kind: "folder",
        originalName: "Drafts",
        newName: ".git"
      })
    ).toEqual({ ok: false, reason: "reservedName" });
    expect(
      validateFileExplorerRenameName({
        kind: "file",
        originalName: "chapter-01.md",
        newName: "chapter/02"
      })
    ).toEqual({ ok: false, reason: "invalidName" });
    expect(
      validateFileExplorerRenameName({
        kind: "file",
        originalName: "chapter-01.md",
        newName: "chapter-01"
      })
    ).toEqual({ ok: false, reason: "samePath" });
    expect(
      validateFileExplorerRenameName({
        kind: "folder",
        originalName: "Drafts",
        newName: "drafts"
      })
    ).toEqual({ ok: false, reason: "samePath" });
  });

  it("classifies validation reasons separately from filesystem reasons", () => {
    expect(isFileExplorerRenameValidationReason("invalidName")).toBe(true);
    expect(isFileExplorerRenameValidationReason("samePath")).toBe(true);
    expect(isFileExplorerRenameValidationReason("permissionDenied")).toBe(
      false
    );
  });

  it("maps raw filesystem error codes to stable reasons", () => {
    expect(fileExplorerRenameFailureReasonFromErrorCode("ENOENT")).toBe(
      "sourceMissing"
    );
    expect(fileExplorerRenameFailureReasonFromErrorCode("EEXIST")).toBe(
      "alreadyExists"
    );
    expect(fileExplorerRenameFailureReasonFromErrorCode("EPERM")).toBe(
      "permissionDenied"
    );
    expect(fileExplorerRenameFailureReasonFromErrorCode("EROFS")).toBe(
      "readOnlyFilesystem"
    );
    expect(fileExplorerRenameFailureReasonFromErrorCode("EWEIRD")).toBe(
      "unknown"
    );
  });
});
