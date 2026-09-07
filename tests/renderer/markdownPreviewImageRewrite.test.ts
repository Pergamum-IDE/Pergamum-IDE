import { describe, expect, it } from "vitest";
import { markdownPreviewRenderer } from "../../src/renderer/preview/markdownPreviewRenderer";

describe("markdownPreviewRenderer project-local image rewrite (#409)", () => {
  it("does not rewrite anything when no source path is given (pre-#409 behavior)", () => {
    const html = markdownPreviewRenderer.render(
      "![alt](assets/images/foo.png)"
    );
    expect(html).toContain('src="assets/images/foo.png"');
    expect(html).not.toContain("pergamum-asset:");
  });

  it("rewrites a project-local image link to pergamum-asset:// against the source file dir", () => {
    const html = markdownPreviewRenderer.render(
      "![alt](../assets/images/foo.png)",
      { sourceMarkdownProjectRelativePath: "chapters/chapter01.md" }
    );
    expect(html).toContain(
      'src="pergamum-asset://project/assets/images/foo.png"'
    );
    expect(html).not.toContain('src="../assets/images/foo.png"');
  });

  it("rewrites the exact link #407 inserts for a same-directory attachment", () => {
    const html = markdownPreviewRenderer.render(
      "![](assets/images/2026-09-07-141234567.png)",
      { sourceMarkdownProjectRelativePath: "chapter01.md" }
    );
    expect(html).toContain(
      'src="pergamum-asset://project/assets/images/2026-09-07-141234567.png"'
    );
  });

  it.each([
    "![](http://example.com/a.png)",
    "![](https://example.com/a.png)",
    "![](data:image/png;base64,iVBORw0KGgo=)",
    "![](blob:https://x/abcd)"
  ])("leaves external image %s untouched", (markdown) => {
    const html = markdownPreviewRenderer.render(markdown, {
      sourceMarkdownProjectRelativePath: "chapters/chapter01.md"
    });
    expect(html).not.toContain("pergamum-asset:");
  });

  it("neutralizes a link that escapes the project root", () => {
    const html = markdownPreviewRenderer.render(
      "![](../../../outside.png)",
      { sourceMarkdownProjectRelativePath: "chapters/chapter01.md" }
    );
    expect(html).toContain('src="data:,"');
    expect(html).not.toContain("pergamum-asset:");
    expect(html).not.toContain("outside.png");
  });

  it("neutralizes a backslash traversal link", () => {
    const html = markdownPreviewRenderer.render("![](..\\secret.png)", {
      sourceMarkdownProjectRelativePath: "chapters/chapter01.md"
    });
    expect(html).toContain('src="data:,"');
  });

  it("leaves an unsupported local image extension untouched", () => {
    const html = markdownPreviewRenderer.render("![](diagram.svg)", {
      sourceMarkdownProjectRelativePath: "chapters/chapter01.md"
    });
    expect(html).toContain('src="diagram.svg"');
    expect(html).not.toContain("pergamum-asset:");
  });

  it("keeps rendering non-image markdown unchanged", () => {
    const html = markdownPreviewRenderer.render("# Title\n\nText", {
      sourceMarkdownProjectRelativePath: "chapter01.md"
    });
    expect(html).toContain("<h1>Title</h1>");
  });

  // #409 P2: the #407 link generator wraps paths with spaces / risky chars in
  // `<...>`. Those must round-trip through the rewrite without corruption.
  it("rewrites an angle-bracket-wrapped path that contains a space", () => {
    const html = markdownPreviewRenderer.render(
      "![](<../assets/my images/pic.png>)",
      { sourceMarkdownProjectRelativePath: "chapters/chapter01.md" }
    );
    expect(html).toContain(
      'src="pergamum-asset://project/assets/my%20images/pic.png"'
    );
  });

  it("rewrites a path with non-ASCII (Japanese) segments and a space", () => {
    const html = markdownPreviewRenderer.render(
      "![](<../素材/挿絵 01.png>)",
      { sourceMarkdownProjectRelativePath: "chapters/chapter01.md" }
    );
    // encodeURIComponent("素材") / encodeURIComponent("挿絵 01.png")
    const expectedSrc =
      "pergamum-asset://project/" +
      encodeURIComponent("素材") +
      "/" +
      encodeURIComponent("挿絵 01.png");
    expect(html).toContain(`src="${expectedSrc}"`);
  });
});
