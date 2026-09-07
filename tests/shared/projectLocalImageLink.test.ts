import { describe, expect, it } from "vitest";
import {
  classifyProjectLocalImageLink,
  decodeImageLinkSrcForResolution,
  isExternalImageSrc,
  resolveProjectLocalImageSrc,
  type ProjectLocalImageResolutionContext
} from "../../src/shared/projectLocalImageLink";

/** #412: a Markdown document Preview context anchored at `path`'s folder. */
function srcFile(
  sourceMarkdownProjectRelativePath: string
): ProjectLocalImageResolutionContext {
  return { kind: "sourceFile", sourceMarkdownProjectRelativePath };
}
const PROJECT_ROOT_CTX: ProjectLocalImageResolutionContext = {
  kind: "projectRoot"
};

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
        resolveProjectLocalImageSrc("images/foo.png", srcFile("chapters/chapter01.md"))
      ).toEqual({
        kind: "rewrite",
        url: "pergamum-asset://project/chapters/images/foo.png",
        projectRelativePath: "chapters/images/foo.png"
      });
    });

    it("resolves a project-root anchored path from a top-level document", () => {
      expect(
        resolveProjectLocalImageSrc("assets/images/foo.png", srcFile("chapter01.md"))
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
          srcFile("chapters/chapter01.md")
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
          srcFile("chapters/chapter01.md")
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
          resolveProjectLocalImageSrc(name, srcFile("doc.md")).kind
        ).toBe("rewrite");
      }
    });
  });

  describe("resolveProjectLocalImageSrc - blocked (unsafe)", () => {
    it("blocks a ../ that escapes the project root", () => {
      expect(
        resolveProjectLocalImageSrc(
          "../../../etc/passwd.png",
          srcFile("chapters/chapter01.md")
        )
      ).toEqual({ kind: "blocked" });
    });

    it("blocks a backslash path (Windows traversal)", () => {
      expect(
        resolveProjectLocalImageSrc("..\\secret.png", srcFile("chapters/chapter01.md"))
      ).toEqual({ kind: "blocked" });
      expect(
        resolveProjectLocalImageSrc("images\\foo.png", srcFile("chapter01.md"))
      ).toEqual({ kind: "blocked" });
    });

    it("blocks an absolute / drive-letter path", () => {
      expect(
        resolveProjectLocalImageSrc("/etc/passwd.png", srcFile("doc.md"))
      ).toEqual({ kind: "blocked" });
      expect(
        resolveProjectLocalImageSrc("C:\\Windows\\a.png", srcFile("doc.md"))
      ).toEqual({ kind: "blocked" });
      expect(
        resolveProjectLocalImageSrc("C:/Windows/a.png", srcFile("doc.md"))
      ).toEqual({ kind: "blocked" });
    });

    it("blocks a path with a Windows-invalid character", () => {
      expect(
        resolveProjectLocalImageSrc("images/a:b.png", srcFile("doc.md"))
      ).toEqual({ kind: "blocked" });
    });

    it("blocks a Windows reserved device name", () => {
      expect(
        resolveProjectLocalImageSrc("nul.png", srcFile("doc.md"))
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
        resolveProjectLocalImageSrc(src, srcFile("chapters/chapter01.md"))
      ).toEqual({ kind: "passThrough" });
    });

    it("leaves a project-local link with an unsupported image extension untouched", () => {
      expect(
        resolveProjectLocalImageSrc("diagram.svg", srcFile("doc.md"))
      ).toEqual({ kind: "passThrough" });
      expect(
        resolveProjectLocalImageSrc("notes.pdf", srcFile("doc.md"))
      ).toEqual({ kind: "passThrough" });
      expect(
        resolveProjectLocalImageSrc("photo.bmp", srcFile("doc.md"))
      ).toEqual({ kind: "passThrough" });
    });
  });
});

describe("resolveProjectLocalImageSrc — resolution context (#412)", () => {
  describe("context.kind === 'none'", () => {
    it.each([
      "assets/images/foo.png",
      "./images/foo.png",
      "../assets/images/foo.png",
      "..\\secret.png",
      "/etc/passwd.png",
      "http://example.com/a.png"
    ])("never rewrites or blocks %s — always passThrough", (src) => {
      expect(resolveProjectLocalImageSrc(src, { kind: "none" })).toEqual({
        kind: "passThrough"
      });
    });
  });

  describe("context.kind === 'sourceFile' (Markdown document Preview)", () => {
    it("keeps the #409 source-file-relative resolution", () => {
      expect(
        resolveProjectLocalImageSrc(
          "../assets/images/foo.png",
          srcFile("chapters/chapter01.md")
        )
      ).toEqual({
        kind: "rewrite",
        url: "pergamum-asset://project/assets/images/foo.png",
        projectRelativePath: "assets/images/foo.png"
      });
      expect(
        resolveProjectLocalImageSrc("images/foo.png", srcFile("chapters/ch01.md"))
      ).toMatchObject({ projectRelativePath: "chapters/images/foo.png" });
    });
  });

  describe("context.kind === 'projectRoot' (Glossary Preview)", () => {
    it("resolves a bare path against the project root", () => {
      expect(
        resolveProjectLocalImageSrc("assets/images/foo.png", PROJECT_ROOT_CTX)
      ).toEqual({
        kind: "rewrite",
        url: "pergamum-asset://project/assets/images/foo.png",
        projectRelativePath: "assets/images/foo.png"
      });
    });

    it("resolves a leading ./ against the project root", () => {
      expect(
        resolveProjectLocalImageSrc("./assets/images/foo.png", PROJECT_ROOT_CTX)
      ).toMatchObject({
        kind: "rewrite",
        projectRelativePath: "assets/images/foo.png"
      });
    });

    it("blocks a ../ — Glossary has no folder to climb from, so it escapes the root", () => {
      expect(
        resolveProjectLocalImageSrc("../assets/images/foo.png", PROJECT_ROOT_CTX)
      ).toEqual({ kind: "blocked" });
    });

    it.each(["a.png", "a.PNG", "a.jpg", "a.jpeg", "a.gif", "a.webp"])(
      "rewrites supported extension %s",
      (name) => {
        expect(
          resolveProjectLocalImageSrc(`assets/${name}`, PROJECT_ROOT_CTX).kind
        ).toBe("rewrite");
      }
    );

    it.each(["assets/x.svg", "assets/x.bmp", "assets/x.avif"])(
      "leaves unsupported extension %s untouched",
      (src) => {
        expect(resolveProjectLocalImageSrc(src, PROJECT_ROOT_CTX)).toEqual({
          kind: "passThrough"
        });
      }
    );

    it.each([
      "http://example.com/a.png",
      "https://example.com/a.png",
      "data:image/png;base64,AAAA",
      "blob:abcd",
      "//cdn/a.png",
      "#anchor"
    ])("leaves external / data / blob %s untouched", (src) => {
      expect(resolveProjectLocalImageSrc(src, PROJECT_ROOT_CTX)).toEqual({
        kind: "passThrough"
      });
    });

    it.each(["..\\secret.png", "/etc/passwd.png", "C:\\Windows\\a.png"])(
      "blocks unsafe shape %s",
      (src) => {
        expect(resolveProjectLocalImageSrc(src, PROJECT_ROOT_CTX)).toEqual({
          kind: "blocked"
        });
      }
    );
  });

  it("the same string can rewrite in one context and block in another (intentional asymmetry, no auto-convert)", () => {
    const src = "../assets/images/foo.png";
    // From a chapters/ document: `..` climbs to the project root — fine.
    expect(
      resolveProjectLocalImageSrc(src, srcFile("chapters/ch01.md"))
    ).toMatchObject({ kind: "rewrite" });
    // In the Glossary: `..` escapes the project root — blocked.
    expect(resolveProjectLocalImageSrc(src, PROJECT_ROOT_CTX)).toEqual({
      kind: "blocked"
    });
  });
});

describe("classifyProjectLocalImageLink (#411 / #412 context)", () => {
  it.each([
    "http://example.com/a.png",
    "https://example.com/a.png",
    "data:image/png;base64,AAAA",
    "blob:abcd",
    "mailto:x@example.com",
    "//cdn/a.png",
    "#anchor"
  ])("classifies %s as external (sourceFile)", (src) => {
    expect(
      classifyProjectLocalImageLink(src, srcFile("chapters/chapter01.md"))
    ).toEqual({ kind: "external" });
  });

  it("classifies an empty / whitespace src as empty", () => {
    expect(classifyProjectLocalImageLink("", srcFile("doc.md"))).toEqual({
      kind: "empty"
    });
    expect(classifyProjectLocalImageLink("   ", PROJECT_ROOT_CTX)).toEqual({
      kind: "empty"
    });
  });

  it("returns `empty` for a `none` context (diagnostics disabled)", () => {
    expect(
      classifyProjectLocalImageLink("assets/missing.png", { kind: "none" })
    ).toEqual({ kind: "empty" });
  });

  it("classifies a shape-valid, supported-extension link as a candidate resolved against the source dir (sourceFile)", () => {
    expect(
      classifyProjectLocalImageLink(
        "images/foo.png",
        srcFile("chapters/chapter01.md")
      )
    ).toEqual({
      kind: "candidate",
      projectRelativePath: "chapters/images/foo.png"
    });
    expect(
      classifyProjectLocalImageLink(
        "../assets/images/foo.png",
        srcFile("chapters/chapter01.md")
      )
    ).toEqual({ kind: "candidate", projectRelativePath: "assets/images/foo.png" });
  });

  it("resolves against the project ROOT for a projectRoot context (Glossary)", () => {
    expect(
      classifyProjectLocalImageLink("assets/missing.png", PROJECT_ROOT_CTX)
    ).toEqual({ kind: "candidate", projectRelativePath: "assets/missing.png" });
    // `..` has no source folder to climb from → escapes the root.
    expect(
      classifyProjectLocalImageLink("../assets/foo.png", PROJECT_ROOT_CTX)
    ).toEqual({ kind: "outsideProject" });
  });

  it("keeps angle-bracket / non-ASCII destinations as candidates (caller strips the <>)", () => {
    expect(
      classifyProjectLocalImageLink(
        "../素材/挿絵 01.png",
        srcFile("chapters/chapter01.md")
      )
    ).toEqual({ kind: "candidate", projectRelativePath: "素材/挿絵 01.png" });
  });

  it("classifies a ../ that escapes the project root as outsideProject (sourceFile)", () => {
    expect(
      classifyProjectLocalImageLink(
        "../../../outside.png",
        srcFile("chapters/chapter01.md")
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
  ])("classifies %s as invalidPath (both contexts)", (src) => {
    expect(classifyProjectLocalImageLink(src, srcFile("chapter01.md"))).toEqual({
      kind: "invalidPath"
    });
    expect(classifyProjectLocalImageLink(src, PROJECT_ROOT_CTX)).toEqual({
      kind: "invalidPath"
    });
  });

  it("classifies a shape-valid but unsupported-extension link as unsupportedFormat", () => {
    expect(
      classifyProjectLocalImageLink("assets/images/foo.svg", srcFile("chapter01.md"))
    ).toEqual({
      kind: "unsupportedFormat",
      projectRelativePath: "assets/images/foo.svg"
    });
    expect(
      classifyProjectLocalImageLink("assets/foo.bmp", PROJECT_ROOT_CTX)
    ).toEqual({
      kind: "unsupportedFormat",
      projectRelativePath: "assets/foo.bmp"
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
