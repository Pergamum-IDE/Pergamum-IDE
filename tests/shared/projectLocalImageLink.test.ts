import { describe, expect, it } from "vitest";
import {
  isExternalImageSrc,
  resolveProjectLocalImageSrc
} from "../../src/shared/projectLocalImageLink";

describe("projectLocalImageLink (#409)", () => {
  describe("isExternalImageSrc", () => {
    it.each([
      "http://example.com/a.png",
      "https://example.com/a.png",
      "data:image/png;base64,AAAA",
      "blob:abcd-1234",
      "mailto:x@example.com",
      "ftp://host/a.png",
      "pergamum-asset://project/a.png",
      "//cdn.example.com/a.png",
      "#fragment"
    ])("treats %s as external / leave-alone", (src) => {
      expect(isExternalImageSrc(src)).toBe(true);
    });

    it.each(["assets/a.png", "./a.png", "../a.png", "a.png", ""])(
      "treats %s as not-external",
      (src) => {
        expect(isExternalImageSrc(src)).toBe(false);
      }
    );
  });

  describe("resolveProjectLocalImageSrc - rewrite", () => {
    it("resolves a same-directory relative path against the source file's dir", () => {
      expect(
        resolveProjectLocalImageSrc("images/foo.png", "chapters/chapter01.md")
      ).toEqual({
        kind: "rewrite",
        url: "pergamum-asset://project/chapters/images/foo.png",
        projectRelativePath: "chapters/images/foo.png"
      });
    });

    it("resolves a project-root anchored path from a top-level document", () => {
      expect(
        resolveProjectLocalImageSrc("assets/images/foo.png", "chapter01.md")
      ).toEqual({
        kind: "rewrite",
        url: "pergamum-asset://project/assets/images/foo.png",
        projectRelativePath: "assets/images/foo.png"
      });
    });

    it("resolves a leading ./ against the source file's dir", () => {
      expect(
        resolveProjectLocalImageSrc(
          "./images/foo.png",
          "chapters/chapter01.md"
        )
      ).toMatchObject({
        kind: "rewrite",
        projectRelativePath: "chapters/images/foo.png"
      });
    });

    it("resolves a ../ that stays inside the project root (Issue #409 example)", () => {
      expect(
        resolveProjectLocalImageSrc(
          "../assets/images/foo.png",
          "chapters/chapter01.md"
        )
      ).toEqual({
        kind: "rewrite",
        url: "pergamum-asset://project/assets/images/foo.png",
        projectRelativePath: "assets/images/foo.png"
      });
    });

    it("accepts every supported extension, case-insensitively", () => {
      for (const name of ["a.png", "a.PNG", "a.jpg", "a.jpeg", "a.gif", "a.webp"]) {
        expect(
          resolveProjectLocalImageSrc(name, "doc.md").kind
        ).toBe("rewrite");
      }
    });
  });

  describe("resolveProjectLocalImageSrc - blocked (unsafe)", () => {
    it("blocks a ../ that escapes the project root", () => {
      expect(
        resolveProjectLocalImageSrc(
          "../../../etc/passwd.png",
          "chapters/chapter01.md"
        )
      ).toEqual({ kind: "blocked" });
    });

    it("blocks a backslash path (Windows traversal)", () => {
      expect(
        resolveProjectLocalImageSrc("..\\secret.png", "chapters/chapter01.md")
      ).toEqual({ kind: "blocked" });
      expect(
        resolveProjectLocalImageSrc("images\\foo.png", "chapter01.md")
      ).toEqual({ kind: "blocked" });
    });

    it("blocks an absolute / drive-letter path", () => {
      expect(
        resolveProjectLocalImageSrc("/etc/passwd.png", "doc.md")
      ).toEqual({ kind: "blocked" });
      expect(
        resolveProjectLocalImageSrc("C:\\Windows\\a.png", "doc.md")
      ).toEqual({ kind: "blocked" });
      expect(
        resolveProjectLocalImageSrc("C:/Windows/a.png", "doc.md")
      ).toEqual({ kind: "blocked" });
    });

    it("blocks a path with a Windows-invalid character", () => {
      expect(
        resolveProjectLocalImageSrc("images/a:b.png", "doc.md")
      ).toEqual({ kind: "blocked" });
    });

    it("blocks a Windows reserved device name", () => {
      expect(
        resolveProjectLocalImageSrc("nul.png", "doc.md")
      ).toEqual({ kind: "blocked" });
    });
  });

  describe("resolveProjectLocalImageSrc - passThrough (unchanged)", () => {
    it.each([
      "http://example.com/a.png",
      "https://example.com/a.png",
      "data:image/png;base64,AAAA",
      "blob:abcd",
      "mailto:x@example.com",
      "//cdn/a.png",
      "#anchor",
      ""
    ])("leaves %s untouched", (src) => {
      expect(
        resolveProjectLocalImageSrc(src, "chapters/chapter01.md")
      ).toEqual({ kind: "passThrough" });
    });

    it("leaves a project-local link with an unsupported image extension untouched", () => {
      expect(
        resolveProjectLocalImageSrc("diagram.svg", "doc.md")
      ).toEqual({ kind: "passThrough" });
      expect(
        resolveProjectLocalImageSrc("notes.pdf", "doc.md")
      ).toEqual({ kind: "passThrough" });
      expect(
        resolveProjectLocalImageSrc("photo.bmp", "doc.md")
      ).toEqual({ kind: "passThrough" });
    });
  });
});
