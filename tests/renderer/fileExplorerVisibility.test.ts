import { describe, expect, it } from "vitest";
import type { FileExplorerEntry } from "../../src/shared/api";
import {
  getFileExplorerEntryKind,
  isVisibleFileExplorerEntry
} from "../../src/renderer/fileExplorerVisibility";

function fileEntry(relativePath: string): FileExplorerEntry {
  const name = relativePath.split("/").pop() ?? relativePath;
  return { kind: "file", name, relativePath };
}

function folderEntry(relativePath: string): FileExplorerEntry {
  const name = relativePath.split("/").pop() ?? relativePath;
  return { kind: "folder", name, relativePath };
}

describe("fileExplorerVisibility (#501 Slice 1)", () => {
  const plainTextDisabled = { enablePlainTextDocuments: false };
  const plainTextEnabled = { enablePlainTextDocuments: true };

  describe("folders", () => {
    it("classifies folders as 'folder' and keeps them visible regardless of children", () => {
      const folders = [
        folderEntry("empty-folder"),
        folderEntry("txt-only"),
        folderEntry("unsupported-only"),
        folderEntry("images-only"),
        folderEntry("nested/deep/folder")
      ];

      for (const folder of folders) {
        expect(getFileExplorerEntryKind(folder, plainTextDisabled)).toBe("folder");
        expect(isVisibleFileExplorerEntry(folder, plainTextDisabled)).toBe(true);
        expect(getFileExplorerEntryKind(folder, plainTextEnabled)).toBe("folder");
        expect(isVisibleFileExplorerEntry(folder, plainTextEnabled)).toBe(true);
      }
    });
  });

  describe("Markdown documents", () => {
    it("classifies .md and .markdown as 'document' and visible regardless of plain text setting", () => {
      const mdFiles = [
        fileEntry("chapter1.md"),
        fileEntry("README.markdown"),
        fileEntry("drafts/scene.MD")
      ];

      for (const file of mdFiles) {
        expect(getFileExplorerEntryKind(file, plainTextDisabled)).toBe("document");
        expect(isVisibleFileExplorerEntry(file, plainTextDisabled)).toBe(true);
        expect(getFileExplorerEntryKind(file, plainTextEnabled)).toBe("document");
        expect(isVisibleFileExplorerEntry(file, plainTextEnabled)).toBe(true);
      }
    });
  });

  describe("Plain Text documents", () => {
    it("classifies .txt as 'unsupported' and hidden when enablePlainTextDocuments is false", () => {
      const txtFiles = [
        fileEntry("notes.txt"),
        fileEntry("memo.TXT"),
        fileEntry("txt-only/memo.txt")
      ];

      for (const file of txtFiles) {
        expect(getFileExplorerEntryKind(file, plainTextDisabled)).toBe("unsupported");
        expect(isVisibleFileExplorerEntry(file, plainTextDisabled)).toBe(false);
      }
    });

    it("classifies .txt as 'document' and visible when enablePlainTextDocuments is true", () => {
      const txtFiles = [
        fileEntry("notes.txt"),
        fileEntry("memo.TXT"),
        fileEntry("txt-only/memo.txt")
      ];

      for (const file of txtFiles) {
        expect(getFileExplorerEntryKind(file, plainTextEnabled)).toBe("document");
        expect(isVisibleFileExplorerEntry(file, plainTextEnabled)).toBe(true);
      }
    });
  });

  describe("supported image assets", () => {
    it("classifies supported images as 'asset' (not document) and visible regardless of plain text setting", () => {
      const imageFiles = [
        fileEntry("cover.png"),
        fileEntry("photo.jpg"),
        fileEntry("photo.jpeg"),
        fileEntry("anim.gif"),
        fileEntry("map.webp"),
        fileEntry("images-only/map.WEBP")
      ];

      for (const file of imageFiles) {
        expect(getFileExplorerEntryKind(file, plainTextDisabled)).toBe("asset");
        expect(isVisibleFileExplorerEntry(file, plainTextDisabled)).toBe(true);
        expect(getFileExplorerEntryKind(file, plainTextEnabled)).toBe("asset");
        expect(isVisibleFileExplorerEntry(file, plainTextEnabled)).toBe(true);
      }
    });
  });

  describe("unsupported files", () => {
    it("classifies unsupported files as 'unsupported' and hidden", () => {
      const unsupportedFiles = [
        fileEntry("data.json"),
        fileEntry("doc.pdf"),
        fileEntry("manuscript.docx"),
        fileEntry("script.js"),
        fileEntry("unsupported-only/data.json")
      ];

      for (const file of unsupportedFiles) {
        expect(getFileExplorerEntryKind(file, plainTextDisabled)).toBe("unsupported");
        expect(isVisibleFileExplorerEntry(file, plainTextDisabled)).toBe(false);
        expect(getFileExplorerEntryKind(file, plainTextEnabled)).toBe("unsupported");
        expect(isVisibleFileExplorerEntry(file, plainTextEnabled)).toBe(false);
      }
    });
  });
});
