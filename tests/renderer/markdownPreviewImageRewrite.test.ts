import { describe, expect, it } from "vitest";
import { markdownPreviewRenderer } from "../../src/renderer/preview/markdownPreviewRenderer";
import type { PreviewRenderOptions } from "../../src/renderer/preview/previewRenderer";

/** #412: a Markdown document Preview anchored at `path`'s folder. */
function sourceFile(sourceMarkdownProjectRelativePath: string): PreviewRenderOptions {
  return {
    projectLocalImageResolution: {
      kind: "sourceFile",
      sourceMarkdownProjectRelativePath
    }
  };
}
/** #412: a Glossary vocabulary Preview anchored at the project root. */
const PROJECT_ROOT: PreviewRenderOptions = {
  projectLocalImageResolution: { kind: "projectRoot" }
};

describe("markdownPreviewRenderer project-local image rewrite (#409)", () => {
  it("does not rewrite anything when no resolution context is given (pre-#409 behavior)", () => {
    const html = markdownPreviewRenderer.render(
      "![alt](assets/images/foo.png)"
    );
    expect(html).toContain('src="assets/images/foo.png"');
    expect(html).not.toContain("pergamum-asset:");
  });

  it("does not rewrite anything for an explicit { kind: 'none' } context", () => {
    const html = markdownPreviewRenderer.render(
      "![alt](../../../outside.png)",
      { projectLocalImageResolution: { kind: "none" } }
    );
    expect(html).toContain('src="../../../outside.png"');
    expect(html).not.toContain("pergamum-asset:");
    expect(html).not.toContain('src="data:,"');
  });

  it("rewrites a project-local image link to pergamum-asset:// against the source file dir", () => {
    const html = markdownPreviewRenderer.render(
      "![alt](../assets/images/foo.png)",
      sourceFile("chapters/chapter01.md")
    );
    expect(html).toContain(
      'src="pergamum-asset://project/assets/images/foo.png"'
    );
    expect(html).not.toContain('src="../assets/images/foo.png"');
  });

  it("rewrites the exact link #407 inserts for a same-directory attachment", () => {
    const html = markdownPreviewRenderer.render(
      "![](assets/images/2026-09-07-141234567.png)",
      sourceFile("chapter01.md")
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
    const html = markdownPreviewRenderer.render(
      markdown,
      sourceFile("chapters/chapter01.md")
    );
    expect(html).not.toContain("pergamum-asset:");
  });

  it("neutralizes a link that escapes the project root", () => {
    const html = markdownPreviewRenderer.render(
      "![](../../../outside.png)",
      sourceFile("chapters/chapter01.md")
    );
    expect(html).toContain('src="data:,"');
    expect(html).not.toContain("pergamum-asset:");
    expect(html).not.toContain("outside.png");
  });

  it("neutralizes a backslash traversal link", () => {
    const html = markdownPreviewRenderer.render(
      "![](..\\secret.png)",
      sourceFile("chapters/chapter01.md")
    );
    expect(html).toContain('src="data:,"');
  });

  it("leaves an unsupported local image extension untouched", () => {
    const html = markdownPreviewRenderer.render(
      "![](diagram.svg)",
      sourceFile("chapters/chapter01.md")
    );
    expect(html).toContain('src="diagram.svg"');
    expect(html).not.toContain("pergamum-asset:");
  });

  it("keeps rendering non-image markdown unchanged", () => {
    const html = markdownPreviewRenderer.render(
      "# Title\n\nText",
      sourceFile("chapter01.md")
    );
    expect(html).toContain("<h1>Title</h1>");
  });

  // #409 P2: the #407 link generator wraps paths with spaces / risky chars in
  // `<...>`. Those must round-trip through the rewrite without corruption.
  it("rewrites an angle-bracket-wrapped path that contains a space", () => {
    const html = markdownPreviewRenderer.render(
      "![](<../assets/my images/pic.png>)",
      sourceFile("chapters/chapter01.md")
    );
    expect(html).toContain(
      'src="pergamum-asset://project/assets/my%20images/pic.png"'
    );
  });

  it("rewrites a path with non-ASCII (Japanese) segments and a space", () => {
    const html = markdownPreviewRenderer.render(
      "![](<../素材/挿絵 01.png>)",
      sourceFile("chapters/chapter01.md")
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

describe("markdownPreviewRenderer — Glossary Preview (projectRoot context, #412)", () => {
  it.each([
    ["![](assets/images/foo.png)", "assets/images/foo.png"],
    ["![](./assets/images/foo.png)", "assets/images/foo.png"],
    ["![](images/foo.png)", "images/foo.png"]
  ])("rewrites %s against the project root", (markdown, expectedRelative) => {
    const html = markdownPreviewRenderer.render(markdown, PROJECT_ROOT);
    expect(html).toContain(
      `src="pergamum-asset://project/${expectedRelative}"`
    );
  });

  it.each(["png", "jpg", "jpeg", "gif", "webp"])(
    "rewrites the supported extension .%s",
    (ext) => {
      const html = markdownPreviewRenderer.render(
        `![](assets/pic.${ext})`,
        PROJECT_ROOT
      );
      expect(html).toContain("src=\"pergamum-asset://project/assets/pic.");
    }
  );

  it.each(["svg", "bmp", "avif"])(
    "leaves the unsupported extension .%s untouched",
    (ext) => {
      const html = markdownPreviewRenderer.render(
        `![](assets/pic.${ext})`,
        PROJECT_ROOT
      );
      expect(html).toContain(`src="assets/pic.${ext}"`);
      expect(html).not.toContain("pergamum-asset:");
    }
  );

  it("blocks a ../ link — the Glossary has no source folder, so it escapes the root", () => {
    const html = markdownPreviewRenderer.render(
      "![](../assets/images/foo.png)",
      PROJECT_ROOT
    );
    expect(html).toContain('src="data:,"');
    expect(html).not.toContain("pergamum-asset:");
    expect(html).not.toContain("foo.png");
  });

  it.each([
    "![](http://example.com/a.png)",
    "![](https://example.com/a.png)",
    "![](data:image/png;base64,iVBORw0KGgo=)",
    "![](blob:https://x/abcd)"
  ])("leaves external / data / blob %s untouched", (markdown) => {
    const html = markdownPreviewRenderer.render(markdown, PROJECT_ROOT);
    expect(html).not.toContain("pergamum-asset:");
    expect(html).not.toContain('src="data:,"');
  });

  it("neutralizes a `.pergamum*` protected directory link", () => {
    const html = markdownPreviewRenderer.render(
      "![](.pergamum/secret.png)",
      PROJECT_ROOT
    );
    // Lexically valid shape, so the renderer rewrites to the asset URL; the
    // main-process handler is what refuses `.pergamum*`. What matters here is
    // it is NOT left as a bare filesystem-looking path.
    expect(html).not.toContain('src=".pergamum/secret.png"');
  });

  it.each([
    ["![](assets/my%20images/foo.png)", "assets/my%20images/foo.png"],
    ["![](<assets/my images/foo.png>)", "assets/my%20images/foo.png"]
  ])(
    "handles a %20 / space path the same as the Markdown Preview: %s",
    (markdown, expectedRelative) => {
      const html = markdownPreviewRenderer.render(markdown, PROJECT_ROOT);
      expect(html).toContain(
        `src="pergamum-asset://project/${expectedRelative}"`
      );
    }
  );

  it("handles a non-ASCII angle-bracket path with a space", () => {
    const html = markdownPreviewRenderer.render(
      "![](<素材/挿絵 01.png>)",
      PROJECT_ROOT
    );
    const expectedSrc =
      "pergamum-asset://project/" +
      encodeURIComponent("素材") +
      "/" +
      encodeURIComponent("挿絵 01.png");
    expect(html).toContain(`src="${expectedSrc}"`);
  });

  it("does not rewrite / normalize the Glossary text itself — only the rendered HTML changes", () => {
    const source = "See ![](assets/images/foo.png) and ![](../up.png)";
    const html = markdownPreviewRenderer.render(source, PROJECT_ROOT);
    // The function returns HTML; the caller's `source` string is untouched.
    expect(source).toBe("See ![](assets/images/foo.png) and ![](../up.png)");
    expect(html).toContain("pergamum-asset://project/assets/images/foo.png");
  });
});
