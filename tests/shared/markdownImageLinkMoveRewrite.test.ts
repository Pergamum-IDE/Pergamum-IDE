import { describe, expect, it } from "vitest";
import {
  planMarkdownImageLinkRewritesForDocumentMove,
  type MarkdownImageLinkMoveRewrite
} from "../../src/shared/markdownImageLinkMoveRewrite";

/** Apply the plan to the source text so assertions can read the result. */
function applyRewrites(
  markdown: string,
  rewrites: readonly MarkdownImageLinkMoveRewrite[]
): string {
  let result = markdown;
  for (const rewrite of [...rewrites].sort((a, b) => b.from - a.from)) {
    expect(markdown.slice(rewrite.from, rewrite.to)).toBe(
      rewrite.oldDestination
    );
    result =
      result.slice(0, rewrite.from) +
      rewrite.newDestination +
      result.slice(rewrite.to);
  }
  return result;
}

function planOnly(
  markdown: string,
  oldPath: string,
  newPath: string
): readonly MarkdownImageLinkMoveRewrite[] {
  return planMarkdownImageLinkRewritesForDocumentMove({
    markdown,
    oldDocumentProjectRelativePath: oldPath,
    newDocumentProjectRelativePath: newPath
  });
}

describe("planMarkdownImageLinkRewritesForDocumentMove", () => {
  it("returns [] when the parent directory does not change (rename in place)", () => {
    expect(
      planOnly("![](../assets/foo.png)", "chapters/ch01.md", "chapters/ch02.md")
    ).toEqual([]);
  });

  it("returns [] for a same-directory move even with several links", () => {
    const md = "![](../assets/a.png)\n![](img/b.png)\n";
    expect(planOnly(md, "chapters/ch01.md", "chapters/renamed.md")).toEqual([]);
  });

  it("deepens the climb when the document moves into a sub-folder", () => {
    const md = "before ![](../assets/foo.png) after";
    const rewrites = planOnly(
      md,
      "chapters/ch01.md",
      "chapters/part1/ch01.md"
    );
    expect(rewrites).toHaveLength(1);
    expect(rewrites[0].oldDestination).toBe("../assets/foo.png");
    expect(rewrites[0].newDestination).toBe("../../assets/foo.png");
    expect(applyRewrites(md, rewrites)).toBe(
      "before ![](../../assets/foo.png) after"
    );
  });

  it("shortens the climb when the document moves up a folder", () => {
    const md = "![](../../assets/foo.png)";
    const rewrites = planOnly(
      md,
      "chapters/part1/ch01.md",
      "chapters/ch01.md"
    );
    expect(rewrites).toHaveLength(1);
    expect(rewrites[0].newDestination).toBe("../assets/foo.png");
  });

  it("rewrites a link whose target file does not exist (string transform only)", () => {
    const md = "![](../assets/missing.png)";
    const rewrites = planOnly(md, "chapters/ch01.md", "chapters/part1/ch01.md");
    expect(rewrites[0].newDestination).toBe("../../assets/missing.png");
  });

  it("keeps the destination when the recomputed form is identical", () => {
    // Moving between two siblings of the same depth that share the anchor:
    // chapters/a/ch.md -> chapters/b/ch.md, link ../../assets/x.png
    const md = "![](../../assets/x.png)";
    expect(planOnly(md, "chapters/a/ch.md", "chapters/b/ch.md")).toEqual([]);
  });

  it("ignores external http/https destinations", () => {
    const md =
      "![](https://example.com/x.png)\n![](http://example.com/y.png)";
    expect(planOnly(md, "chapters/ch01.md", "chapters/part1/ch01.md")).toEqual(
      []
    );
  });

  it("ignores data: and blob: destinations", () => {
    const md =
      "![](data:image/png;base64,iVBOR)\n![](blob:https://x/abc-123)";
    expect(planOnly(md, "chapters/ch01.md", "chapters/part1/ch01.md")).toEqual(
      []
    );
  });

  it("ignores protocol-relative destinations", () => {
    const md = "![](//cdn.example.com/x.png)";
    expect(planOnly(md, "chapters/ch01.md", "chapters/part1/ch01.md")).toEqual(
      []
    );
  });

  it("ignores .svg / .bmp / .avif (not Pergamum project-local images)", () => {
    const md =
      "![](../assets/a.svg)\n![](../assets/b.bmp)\n![](../assets/c.avif)";
    expect(planOnly(md, "chapters/ch01.md", "chapters/part1/ch01.md")).toEqual(
      []
    );
  });

  it("ignores inline HTML <img> tags", () => {
    const md = '<img src="../assets/foo.png" alt="x">';
    expect(planOnly(md, "chapters/ch01.md", "chapters/part1/ch01.md")).toEqual(
      []
    );
  });

  it("ignores reference-style image links", () => {
    const md = "![alt][ref]\n\n[ref]: ../assets/foo.png";
    expect(planOnly(md, "chapters/ch01.md", "chapters/part1/ch01.md")).toEqual(
      []
    );
  });

  it("ignores a link that cannot be resolved from the old context", () => {
    // Document already at the project root: `../` climbs above it.
    const md = "![](../assets/foo.png)";
    expect(planOnly(md, "ch01.md", "chapters/ch01.md")).toEqual([]);
  });

  it("ignores a non-leading `..` segment", () => {
    const md = "![](assets/../foo.png)";
    expect(planOnly(md, "chapters/ch01.md", "chapters/part1/ch01.md")).toEqual(
      []
    );
  });

  it("ignores backslash / absolute / drive-letter destinations", () => {
    const md =
      "![](..\\assets\\foo.png)\n![](/assets/foo.png)\n![](C:/assets/foo.png)";
    expect(planOnly(md, "chapters/ch01.md", "chapters/part1/ch01.md")).toEqual(
      []
    );
  });

  it("preserves an angle-wrapped destination as angle-wrapped", () => {
    const md = "![](<../assets/my images/foo.png>)";
    const rewrites = planOnly(md, "chapters/ch01.md", "chapters/part1/ch01.md");
    expect(rewrites).toHaveLength(1);
    expect(rewrites[0].oldDestination).toBe("<../assets/my images/foo.png>");
    expect(rewrites[0].newDestination).toBe(
      "<../../assets/my images/foo.png>"
    );
    expect(applyRewrites(md, rewrites)).toBe(
      "![](<../../assets/my images/foo.png>)"
    );
  });

  it("preserves percent-encoding in the destination (no decode to a bare space)", () => {
    const md = "![](../assets/my%20image.png)";
    const rewrites = planOnly(md, "chapters/ch01.md", "chapters/part1/ch01.md");
    expect(rewrites).toHaveLength(1);
    expect(rewrites[0].newDestination).toBe("../../assets/my%20image.png");
    expect(applyRewrites(md, rewrites)).not.toContain("my image.png");
  });

  it("keeps a bare destination bare when the new form is still safe", () => {
    const md = "![](../assets/foo.png)";
    const rewrites = planOnly(md, "chapters/ch01.md", "chapters/part1/ch01.md");
    expect(rewrites[0].newDestination).toBe("../../assets/foo.png");
    expect(rewrites[0].newDestination.startsWith("<")).toBe(false);
  });

  it("wraps a bare destination in <...> when the new form becomes ambiguous", () => {
    // The old folder segment `weird (dir)` re-enters the path as `downward`
    // once the document moves to an unrelated sibling folder.
    const md = "![](../assets/x.png)";
    const rewrites = planOnly(
      md,
      "weird (dir)/sub/doc.md",
      "other/doc.md"
    );
    expect(rewrites).toHaveLength(1);
    expect(rewrites[0].oldDestination).toBe("../assets/x.png");
    expect(rewrites[0].newDestination).toBe("<../weird (dir)/assets/x.png>");
  });

  it("does not touch the link title", () => {
    const md = '![alt](../assets/foo.png "a caption")';
    const rewrites = planOnly(md, "chapters/ch01.md", "chapters/part1/ch01.md");
    expect(applyRewrites(md, rewrites)).toBe(
      '![alt](../../assets/foo.png "a caption")'
    );
  });

  it("plans several links in document order, non-overlapping", () => {
    const md =
      "![](../assets/a.png)\n\n![](img/b.png)\n\n![](../../shared/c.png)\n";
    const rewrites = planOnly(
      md,
      "book/chapters/ch01.md",
      "book/chapters/part1/ch01.md"
    );
    // a.png: ../ -> ../../ ; img/b.png: -> ../img/b.png ; c.png: ../../ -> ../../../
    expect(rewrites.map((r) => r.newDestination)).toEqual([
      "../../assets/a.png",
      "../img/b.png",
      "../../../shared/c.png"
    ]);
    for (let i = 1; i < rewrites.length; i += 1) {
      expect(rewrites[i].from).toBeGreaterThanOrEqual(rewrites[i - 1].to);
    }
    expect(applyRewrites(md, rewrites)).toBe(
      "![](../../assets/a.png)\n\n![](../img/b.png)\n\n![](../../../shared/c.png)\n"
    );
  });

  it("skips image links inside fenced code blocks", () => {
    const md = "```\n![](../assets/foo.png)\n```\n";
    expect(planOnly(md, "chapters/ch01.md", "chapters/part1/ch01.md")).toEqual(
      []
    );
  });

  it("#414 P0-2: leaves a link to a same-operation moved image for the C2 planner", () => {
    const md = "![](../assets/foo.png)\n![](../assets/other.png)\n";
    const rewrites = planMarkdownImageLinkRewritesForDocumentMove({
      markdown: md,
      oldDocumentProjectRelativePath: "chapters/ch01.md",
      newDocumentProjectRelativePath: "chapters/part1/ch01.md",
      imageOldPathsMovingInSameOperation: ["assets/foo.png"]
    });
    // `../assets/foo.png` resolves to `assets/foo.png` (a moving image) → left
    // for C2. `../assets/other.png` (not moving) is still stabilised by C1.
    expect(rewrites.map((r) => r.oldDestination)).toEqual([
      "../assets/other.png"
    ]);
    expect(rewrites[0].newDestination).toBe("../../assets/other.png");
  });

  it("resolves purely from the two document paths (no save-directory input)", () => {
    // Same inputs -> same output, deterministically; the function has no
    // settings parameter to consult.
    const md = "![](../assets/foo.png)";
    const a = planOnly(md, "chapters/ch01.md", "chapters/part1/ch01.md");
    const b = planOnly(md, "chapters/ch01.md", "chapters/part1/ch01.md");
    expect(a).toEqual(b);
    expect(a[0].newDestination).toBe("../../assets/foo.png");
  });
});
