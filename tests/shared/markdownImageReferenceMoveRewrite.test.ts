import { describe, expect, it } from "vitest";
import {
  planMarkdownImageReferenceRewritesForImageMove,
  type MarkdownImageReferenceMoveRewrite,
  type MovedImageFile
} from "../../src/shared/markdownImageReferenceMoveRewrite";

function plan(
  markdown: string,
  docPath: string,
  movedImages: readonly MovedImageFile[]
): readonly MarkdownImageReferenceMoveRewrite[] {
  return planMarkdownImageReferenceRewritesForImageMove({
    markdown,
    markdownDocumentProjectRelativePath: docPath,
    movedImages
  });
}

function apply(
  markdown: string,
  rewrites: readonly MarkdownImageReferenceMoveRewrite[]
): string {
  let out = markdown;
  for (const r of [...rewrites].sort((a, b) => b.from - a.from)) {
    expect(markdown.slice(r.from, r.to)).toBe(r.oldDestination);
    out = out.slice(0, r.from) + r.newDestination + out.slice(r.to);
  }
  return out;
}

const move = (
  oldProjectRelativePath: string,
  newProjectRelativePath: string
): MovedImageFile => ({ oldProjectRelativePath, newProjectRelativePath });

describe("planMarkdownImageReferenceRewritesForImageMove", () => {
  it("rewrites a link that points at a moved image (into a sub-folder)", () => {
    const md = "see ![](../assets/foo.png) here";
    const rewrites = plan(md, "chapters/ch01.md", [
      move("assets/foo.png", "assets/characters/foo.png")
    ]);
    expect(rewrites).toHaveLength(1);
    expect(rewrites[0].oldDestination).toBe("../assets/foo.png");
    expect(rewrites[0].newDestination).toBe("../assets/characters/foo.png");
    expect(rewrites[0].oldImageProjectRelativePath).toBe("assets/foo.png");
    expect(rewrites[0].newImageProjectRelativePath).toBe(
      "assets/characters/foo.png"
    );
    expect(apply(md, rewrites)).toBe("see ![](../assets/characters/foo.png) here");
  });

  it("rewrites references to several moved images in one document", () => {
    const md = "![](../img/a.png)\n\n![](../img/b.png)\n";
    const rewrites = plan(md, "ch/doc.md", [
      move("img/a.png", "img/moved/a.png"),
      move("img/b.png", "archive/b.png")
    ]);
    expect(rewrites.map((r) => r.newDestination)).toEqual([
      "../img/moved/a.png",
      "../archive/b.png"
    ]);
  });

  it("matches on the resolved target, not just the filename", () => {
    // Both links have basename `foo.png`; only the one resolving to
    // `assets/foo.png` is a reference to the moved image.
    const md = "![](../assets/foo.png)\n![](../other/foo.png)\n";
    const rewrites = plan(md, "chapters/ch01.md", [
      move("assets/foo.png", "assets/new/foo.png")
    ]);
    expect(rewrites).toHaveLength(1);
    expect(rewrites[0].oldDestination).toBe("../assets/foo.png");
  });

  it("rewrites even when the image file does not exist (string match only)", () => {
    const md = "![](../assets/missing.png)";
    const rewrites = plan(md, "chapters/ch01.md", [
      move("assets/missing.png", "assets/sub/missing.png")
    ]);
    expect(rewrites[0].newDestination).toBe("../assets/sub/missing.png");
  });

  it("handles a pure image rename (basename changes, same folder)", () => {
    const md = "![](../assets/foo.png)";
    const rewrites = plan(md, "chapters/ch01.md", [
      move("assets/foo.png", "assets/renamed.png")
    ]);
    expect(rewrites[0].newDestination).toBe("../assets/renamed.png");
  });

  it("ignores external http/https/data/blob/protocol-relative links", () => {
    const md =
      "![](https://x/foo.png)\n![](http://x/foo.png)\n![](data:image/png;base64,AA)\n![](blob:https://x/foo.png)\n![](//cdn/foo.png)";
    expect(
      plan(md, "chapters/ch01.md", [move("assets/foo.png", "assets/x/foo.png")])
    ).toEqual([]);
  });

  it("ignores .svg / .bmp / .avif references", () => {
    const md = "![](../assets/foo.svg)\n![](../assets/foo.bmp)";
    expect(
      plan(md, "chapters/ch01.md", [
        move("assets/foo.svg", "assets/x/foo.svg"),
        move("assets/foo.bmp", "assets/x/foo.bmp")
      ])
    ).toEqual([]);
  });

  it("ignores inline HTML <img> and reference-style images", () => {
    const md = '<img src="../assets/foo.png">\n\n![alt][ref]\n\n[ref]: ../assets/foo.png';
    expect(
      plan(md, "chapters/ch01.md", [move("assets/foo.png", "assets/x/foo.png")])
    ).toEqual([]);
  });

  it("ignores a same-basename link that resolves elsewhere", () => {
    const md = "![](foo.png)"; // resolves to chapters/foo.png, not assets/foo.png
    expect(
      plan(md, "chapters/ch01.md", [move("assets/foo.png", "assets/x/foo.png")])
    ).toEqual([]);
  });

  it("never resolves a link whose basename matches no moved image", () => {
    // A syntactically odd but non-matching link must not be resolved / thrown on.
    const md = "![](../deep/../weird/unrelated.png) ![](../assets/foo.png)";
    const rewrites = plan(md, "chapters/ch01.md", [
      move("assets/foo.png", "assets/x/foo.png")
    ]);
    expect(rewrites).toHaveLength(1);
    expect(rewrites[0].oldDestination).toBe("../assets/foo.png");
  });

  it("returns [] when old and new image paths are identical", () => {
    const md = "![](../assets/foo.png)";
    expect(
      plan(md, "chapters/ch01.md", [move("assets/foo.png", "assets/foo.png")])
    ).toEqual([]);
  });

  it("returns [] when the recomputed destination equals the original", () => {
    // Image moved, but from this document the relative path is unchanged.
    const md = "![](img/a.png)";
    expect(
      plan(md, "ch/doc.md", [move("ch/img/a.png", "ch/img/a.png")])
    ).toEqual([]);
  });

  it("preserves an angle-wrapped destination", () => {
    const md = "![](<../assets/my images/foo.png>)";
    const rewrites = plan(md, "chapters/ch01.md", [
      move("assets/my images/foo.png", "assets/characters/my images/foo.png")
    ]);
    expect(rewrites).toHaveLength(1);
    expect(rewrites[0].oldDestination).toBe("<../assets/my images/foo.png>");
    expect(rewrites[0].newDestination).toBe(
      "<../assets/characters/my images/foo.png>"
    );
    expect(apply(md, rewrites)).toBe(
      "![](<../assets/characters/my images/foo.png>)"
    );
  });

  it("preserves percent-encoding (no decode to a bare space)", () => {
    const md = "![](../assets/my%20image.png)";
    const rewrites = plan(md, "chapters/ch01.md", [
      move("assets/my image.png", "assets/characters/my image.png")
    ]);
    expect(rewrites).toHaveLength(1);
    expect(rewrites[0].newDestination).toBe(
      "../assets/characters/my%20image.png"
    );
    expect(apply(md, rewrites)).not.toContain("my image.png");
  });

  describe("#414 P1-3: percent-encoding is preserved beyond just spaces", () => {
    it("keeps `%23` for a `#` in the filename", () => {
      const md = "![](../assets/figure%231.png)";
      const rewrites = plan(md, "chapters/ch01.md", [
        move("assets/figure#1.png", "assets/moved/figure#1.png")
      ]);
      expect(rewrites[0].newDestination).toBe("../assets/moved/figure%231.png");
      expect(apply(md, rewrites)).not.toContain("figure#1.png");
    });

    it("keeps `%25` for a `%` in the filename", () => {
      const md = "![](../assets/100%25.png)";
      const rewrites = plan(md, "chapters/ch01.md", [
        move("assets/100%.png", "assets/moved/100%.png")
      ]);
      expect(rewrites[0].newDestination).toBe("../assets/moved/100%25.png");
      expect(apply(md, rewrites)).not.toMatch(/100%\.png/);
    });

    it("keeps `%20` for a space in the filename", () => {
      const md = "![](../assets/my%20image.png)";
      const rewrites = plan(md, "chapters/ch01.md", [
        move("assets/my image.png", "assets/moved/my image.png")
      ]);
      expect(rewrites[0].newDestination).toBe("../assets/moved/my%20image.png");
    });

    it("keeps `%28` / `%29` for parentheses in the filename", () => {
      const md = "![](../assets/shot%2801%29.png)";
      const rewrites = plan(md, "chapters/ch01.md", [
        move("assets/shot(01).png", "assets/moved/shot(01).png")
      ]);
      expect(rewrites[0].newDestination).toBe(
        "../assets/moved/shot%2801%29.png"
      );
    });

    it("never encodes the `/` path separators as `%2F`", () => {
      const md = "![](../assets/figure%231.png)";
      const rewrites = plan(md, "chapters/ch01.md", [
        move("assets/figure#1.png", "assets/moved/nested/figure#1.png")
      ]);
      expect(rewrites[0].newDestination).toBe(
        "../assets/moved/nested/figure%231.png"
      );
      expect(rewrites[0].newDestination).not.toContain("%2F");
    });

    it("does not double-encode (real name has a literal `%`, not `%25`)", () => {
      const md = "![](../assets/a%2520b.png)"; // author wrote `%2520` → real name `a%20b.png`
      const rewrites = plan(md, "chapters/ch01.md", [
        move("assets/a%20b.png", "assets/moved/a%20b.png")
      ]);
      // `%` → `%25`, so `a%20b.png` re-encodes to `a%2520b.png` (round-trips).
      expect(rewrites[0].newDestination).toBe("../assets/moved/a%2520b.png");
    });

    it("angle-wrapped + percent-encoded round-trips", () => {
      const md = "![](<../assets/figure%231.png>)";
      const rewrites = plan(md, "chapters/ch01.md", [
        move("assets/figure#1.png", "assets/moved/figure#1.png")
      ]);
      expect(rewrites[0].oldDestination).toBe("<../assets/figure%231.png>");
      expect(rewrites[0].newDestination).toBe(
        "<../assets/moved/figure%231.png>"
      );
      expect(apply(md, rewrites)).toBe("![](<../assets/moved/figure%231.png>)");
    });
  });

  it("keeps a bare destination bare when the new form is safe", () => {
    const md = "![](../assets/foo.png)";
    const rewrites = plan(md, "chapters/ch01.md", [
      move("assets/foo.png", "assets/characters/foo.png")
    ]);
    expect(rewrites[0].newDestination.startsWith("<")).toBe(false);
  });

  it("wraps a bare destination in <...> when the new form is ambiguous", () => {
    const md = "![](../assets/foo.png)";
    const rewrites = plan(md, "chapters/ch01.md", [
      move("assets/foo.png", "assets/my folder/foo.png")
    ]);
    expect(rewrites[0].newDestination).toBe("<../assets/my folder/foo.png>");
  });

  it("does not touch the link title", () => {
    const md = '![alt](../assets/foo.png "a caption")';
    const rewrites = plan(md, "chapters/ch01.md", [
      move("assets/foo.png", "assets/x/foo.png")
    ]);
    expect(apply(md, rewrites)).toBe('![alt](../assets/x/foo.png "a caption")');
  });

  it("ignores references inside fenced code blocks", () => {
    const md = "```\n![](../assets/foo.png)\n```\n";
    expect(
      plan(md, "chapters/ch01.md", [move("assets/foo.png", "assets/x/foo.png")])
    ).toEqual([]);
  });

  it("#414 P0-2: recomputes from the referencing document's FINAL folder (mixed move)", () => {
    // `chapters/a.md` and `assets/foo.png` move to `Drafts/` in one operation.
    const md = "![](../assets/foo.png)";
    const rewrites = planMarkdownImageReferenceRewritesForImageMove({
      markdown: md,
      markdownDocumentProjectRelativePath: "chapters/a.md",
      movedImages: [move("assets/foo.png", "Drafts/foo.png")],
      movedMarkdownDocuments: [
        {
          oldProjectRelativePath: "chapters/a.md",
          newProjectRelativePath: "Drafts/a.md"
        }
      ]
    });
    expect(rewrites).toHaveLength(1);
    // From Drafts/a.md to Drafts/foo.png → `foo.png`.
    expect(rewrites[0].newDestination).toBe("foo.png");
    // The plan is keyed by the document's FINAL path (apply runs post-move).
    expect(rewrites[0].markdownDocumentProjectRelativePath).toBe("Drafts/a.md");
  });

  it("#414 P0-2: a non-moving referencing document is still resolved from its current folder", () => {
    const md = "![](../assets/foo.png)";
    const rewrites = planMarkdownImageReferenceRewritesForImageMove({
      markdown: md,
      markdownDocumentProjectRelativePath: "chapters/a.md",
      movedImages: [move("assets/foo.png", "Drafts/foo.png")],
      movedMarkdownDocuments: [
        {
          oldProjectRelativePath: "other/x.md",
          newProjectRelativePath: "Drafts/x.md"
        }
      ]
    });
    expect(rewrites[0].newDestination).toBe("../Drafts/foo.png");
    expect(rewrites[0].markdownDocumentProjectRelativePath).toBe(
      "chapters/a.md"
    );
  });

  it("resolves purely from document + image paths (no save-directory input)", () => {
    const md = "![](../assets/foo.png)";
    const a = plan(md, "chapters/ch01.md", [
      move("assets/foo.png", "assets/x/foo.png")
    ]);
    const b = plan(md, "chapters/ch01.md", [
      move("assets/foo.png", "assets/x/foo.png")
    ]);
    expect(a).toEqual(b);
    expect(a[0].newDestination).toBe("../assets/x/foo.png");
  });
});
