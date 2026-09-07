import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FileExplorerEntry } from "../../src/shared/api";
import { iconForEntry } from "../../src/renderer/FileExplorer";

const NO_EXPANDED = new Set<string>();

function fileEntry(relativePath: string): FileExplorerEntry {
  const name = relativePath.split("/").pop() ?? relativePath;
  return { kind: "file", name, relativePath };
}

function folderEntry(
  relativePath: string
): FileExplorerEntry {
  const name = relativePath.split("/").pop() ?? relativePath;
  return { kind: "folder", name, relativePath };
}

function iconOf(relativePath: string): { url: string; name: string } {
  return iconForEntry(fileEntry(relativePath), NO_EXPANDED);
}

describe("File Explorer iconForEntry (#409 file-type icons)", () => {
  describe("Markdown files", () => {
    it.each(["chapter01.md", "README.md", "notes/draft.md", "book.markdown"])(
      "%s -> markdown icon (markdown-svgrepo-com.svg)",
      (path) => {
        const icon = iconOf(path);
        expect(icon.name).toBe("markdown");
      }
    );

    it("is case-insensitive on the extension", () => {
      expect(iconOf("CHAPTER.MD").name).toBe("markdown");
      expect(iconOf("Book.Markdown").name).toBe("markdown");
    });
  });

  describe("image files (Pergamum-recognized formats)", () => {
    it.each([
      "assets/foo.png",
      "assets/foo.jpg",
      "assets/foo.jpeg",
      "assets/foo.gif",
      "assets/foo.webp"
    ])("%s -> image icon (image.svg)", (path) => {
      const icon = iconOf(path);
      expect(icon.name).toBe("image");
    });

    it.each([
      "assets/foo.PNG",
      "assets/foo.JPG",
      "assets/foo.JPEG",
      "assets/foo.GIF",
      "assets/foo.WEBP"
    ])("%s (uppercase) -> image icon", (path) => {
      expect(iconOf(path).name).toBe("image");
    });

    it("resolves the exact attachment name #407 saves", () => {
      expect(
        iconOf("assets/images/2026-09-07-141234567.png").name
      ).toBe("image");
    });

    it.each(["assets/foo.svg", "assets/foo.bmp", "assets/foo.avif"])(
      "%s is NOT an image icon",
      (path) => {
        expect(iconOf(path).name).not.toBe("image");
        expect(iconOf(path).name).toBe("document");
      }
    );
  });

  describe("TXT files", () => {
    it.each(["memo.txt", "sub/notes.txt"])("%s -> txt icon (document-svgrepo-com.svg)", (path) => {
      const icon = iconOf(path);
      expect(icon.name).toBe("txt");
    });

    it("is case-insensitive on the extension", () => {
      expect(iconOf("notes.TXT").name).toBe("txt");
    });
  });

  describe("other file types keep the generic document icon (no regression)", () => {
    it.each([
      "assets/foo.pdf",
      "data/table.csv",
      "config.json",
      "script.ts",
      "styles.css",
      "archive.zip",
      "noextension",
      ".gitignore"
    ])("%s -> document icon", (path) => {
      const icon = iconOf(path);
      expect(icon.name).toBe("document");
    });

    it("does NOT treat an image/markdown/txt extension in the middle of the name as a match", () => {
      expect(iconOf("foo.png.bak").name).toBe("document");
      expect(iconOf("draft.md.old").name).toBe("document");
      expect(iconOf("notes.txt.bak").name).toBe("document");
    });
  });

  describe("folders are unaffected", () => {
    it("collapsed folder -> folder icon", () => {
      expect(
        iconForEntry(folderEntry("assets"), NO_EXPANDED).name
      ).toBe("folder");
    });

    it("expanded folder -> folder-open icon", () => {
      expect(
        iconForEntry(folderEntry("assets"), new Set(["assets"])).name
      ).toBe("folder-open");
    });
  });

  it("wires the bundled markdown / image / txt icon assets (no raw SVG strings)", () => {
    const source = readFileSync("src/renderer/FileExplorer.tsx", "utf8");
    expect(source).toContain(
      "assets/icons/svgrepo/explorer/markdown-svgrepo-com.svg?url"
    );
    expect(source).toContain(
      "assets/icons/feather/explorer/image.svg?url"
    );
    expect(source).toContain(
      "assets/icons/svgrepo/explorer/document-svgrepo-com.svg?url"
    );
    // The image extension check is shared with #407/#409, not a duplicated
    // list.
    expect(source).toContain("supportedImageAttachmentFormatForFileName");
    expect(source).not.toContain("markdown-svgrepo-com.svg?raw");
  });
});
