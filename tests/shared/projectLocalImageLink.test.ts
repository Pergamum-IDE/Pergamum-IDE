import { describe, expect, it } from "vitest";
import {
  classifyProjectLocalImageLink,
  decodeImageLinkSrcForResolution,
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

describe("classifyProjectLocalImageLink (#411)", () => {
  it.each([
    "http://example.com/a.png",
    "https://example.com/a.png",
    "data:image/png;base64,AAAA",
    "blob:abcd",
    "mailto:x@example.com",
    "//cdn/a.png",
    "#anchor"
  ])("classifies %s as external", (src) => {
    expect(classifyProjectLocalImageLink(src, "chapters/chapter01.md")).toEqual({
      kind: "external"
    });
  });

  it("classifies an empty / whitespace src as empty", () => {
    expect(classifyProjectLocalImageLink("", "doc.md")).toEqual({ kind: "empty" });
    expect(classifyProjectLocalImageLink("   ", "doc.md")).toEqual({
      kind: "empty"
    });
  });

  it("classifies a shape-valid, supported-extension link as a candidate resolved against the source dir", () => {
    expect(
      classifyProjectLocalImageLink("images/foo.png", "chapters/chapter01.md")
    ).toEqual({ kind: "candidate", projectRelativePath: "chapters/images/foo.png" });
    expect(
      classifyProjectLocalImageLink(
        "../assets/images/foo.png",
        "chapters/chapter01.md"
      )
    ).toEqual({ kind: "candidate", projectRelativePath: "assets/images/foo.png" });
  });

  it("keeps angle-bracket / non-ASCII destinations as candidates (caller strips the <>)", () => {
    expect(
      classifyProjectLocalImageLink("../素材/挿絵 01.png", "chapters/chapter01.md")
    ).toEqual({ kind: "candidate", projectRelativePath: "素材/挿絵 01.png" });
  });

  it("classifies a ../ that escapes the project root as outsideProject", () => {
    expect(
      classifyProjectLocalImageLink(
        "../../../outside.png",
        "chapters/chapter01.md"
      )
    ).toEqual({ kind: "outsideProject" });
  });

  it.each([
    "images\\foo.png",
    "..\\secret.png",
    "/etc/passwd.png",
    "C:\\Windows\\a.png",
    "images/a:b.png",
    "nul.png"
  ])("classifies %s as invalidPath", (src) => {
    expect(classifyProjectLocalImageLink(src, "chapter01.md")).toEqual({
      kind: "invalidPath"
    });
  });

  it("classifies a shape-valid but unsupported-extension link as unsupportedFormat", () => {
    expect(
      classifyProjectLocalImageLink("assets/images/foo.svg", "chapter01.md")
    ).toEqual({
      kind: "unsupportedFormat",
      projectRelativePath: "assets/images/foo.svg"
    });
  });
});

describe("decodeImageLinkSrcForResolution (#411 follow-up)", () => {
  it("decodes a percent-encoded space", () => {
    expect(decodeImageLinkSrcForResolution("assets/figure%20image.png")).toBe(
      "assets/figure image.png"
    );
  });

  it("decodes non-ASCII percent escapes", () => {
    expect(decodeImageLinkSrcForResolution("assets/%E6%8C%BF%E7%B5%B5.png")).toBe(
      "assets/挿絵.png"
    );
  });

  it("decodes percent-encoded path separators (so traversal is not hidden)", () => {
    expect(
      decodeImageLinkSrcForResolution("%2e%2e%2f%2e%2e%2foutside.png")
    ).toBe("../../outside.png");
  });

  it("returns a malformed sequence unchanged instead of throwing", () => {
    expect(decodeImageLinkSrcForResolution("assets/%zz.png")).toBe(
      "assets/%zz.png"
    );
    expect(decodeImageLinkSrcForResolution("100% done.png")).toBe(
      "100% done.png"
    );
  });

  it("is a no-op for a plain path", () => {
    expect(decodeImageLinkSrcForResolution("assets/images/foo.png")).toBe(
      "assets/images/foo.png"
    );
  });
});
