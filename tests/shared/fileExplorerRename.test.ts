import { describe, expect, it } from "vitest";
import {
  applyMarkdownFileRenameExtension,
  applyRenamableFileRenameExtension,
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

  it("#414: renames supported image files (path-only, no conversion)", () => {
    // No new extension → keep the original image extension.
    expect(
      applyRenamableFileRenameExtension("foo.png", "bar")
    ).toEqual({ ok: true, name: "bar.png" });
    // A new supported-image extension is allowed (path change only).
    expect(
      applyRenamableFileRenameExtension("foo.png", "foo.jpg")
    ).toEqual({ ok: true, name: "foo.jpg" });
    expect(
      applyRenamableFileRenameExtension("shot.JPEG", "shot.webp")
    ).toEqual({ ok: true, name: "shot.webp" });
    // Non-image new extension is rejected.
    expect(
      applyRenamableFileRenameExtension("foo.png", "foo.svg")
    ).toEqual({ ok: false, reason: "unsupportedExtension" });
    // Same name → samePath.
    expect(
      applyRenamableFileRenameExtension("foo.png", "foo")
    ).toEqual({ ok: false, reason: "samePath" });
    // A non-Markdown non-image original is still unsupported.
    expect(
      applyRenamableFileRenameExtension("notes.txt", "renamed")
    ).toEqual({ ok: false, reason: "unsupportedExtension" });
    // Markdown still routes through the Markdown rules unchanged.
    expect(
      applyRenamableFileRenameExtension("chapter-01.md", "chapter-02")
    ).toEqual({ ok: true, name: "chapter-02.md" });
  });

  it("#414: validateFileExplorerRenameName accepts an image file rename", () => {
    expect(
      validateFileExplorerRenameName({
        kind: "file",
        originalName: "diagram.png",
        newName: "architecture"
      })
    ).toEqual({ ok: true, name: "architecture.png" });
  });

  it("#414: rejects Windows-invalid filename characters as `invalidCharacter`", () => {
    for (const bad of [
      "100<>.png",
      'a"b.png',
      "a|b.md",
      "a?b.png",
      "a*b.png",
      "a:b.png"
    ]) {
      expect(
        validateFileExplorerRenameName({
          kind: "file",
          originalName: "foo.png",
          newName: bad
        })
      ).toEqual({ ok: false, reason: "invalidCharacter" });
    }
    // Also for folders.
    expect(
      validateFileExplorerRenameName({
        kind: "folder",
        originalName: "Drafts",
        newName: "Draft<s>"
      })
    ).toEqual({ ok: false, reason: "invalidCharacter" });
  });

  it("#414: invalidCharacter is reported BEFORE the extension / same-name checks", () => {
    // `.txt` would be `unsupportedExtension`, and `100<>` on its own is
    // otherwise a valid-shaped rename — the invalid char wins.
    expect(
      validateFileExplorerRenameName({
        kind: "file",
        originalName: "foo.png",
        newName: "bar<.txt"
      })
    ).toEqual({ ok: false, reason: "invalidCharacter" });
  });

  it("#414: `samePath` is still reported only for a genuine no-op rename", () => {
    expect(
      validateFileExplorerRenameName({
        kind: "file",
        originalName: "diagram.png",
        newName: "diagram"
      })
    ).toEqual({ ok: false, reason: "samePath" });
    expect(
      validateFileExplorerRenameName({
        kind: "file",
        originalName: "diagram.png",
        newName: "DIAGRAM.PNG"
      })
    ).toEqual({ ok: false, reason: "samePath" });
    // A real rename with a valid name is not `samePath`.
    expect(
      validateFileExplorerRenameName({
        kind: "file",
        originalName: "diagram.png",
        newName: "diagram2"
      })
    ).toEqual({ ok: true, name: "diagram2.png" });
  });

  it("#414: isFileExplorerRenameValidationReason treats invalidCharacter as a validation (not filesystem) reason", () => {
    expect(isFileExplorerRenameValidationReason("invalidCharacter")).toBe(true);
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
