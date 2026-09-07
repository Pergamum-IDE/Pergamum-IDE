import { describe, expect, it } from "vitest";
import {
  extractProjectLocalImageLinks,
  scanMarkdownImageLinks
} from "../../src/shared/markdownImageLinkExtraction";

/** The substring the returned [from, to) range points at. */
function slice(source: string, match: { from: number; to: number }): string {
  return source.slice(match.from, match.to);
}

describe("markdownImageLinkExtraction (#411)", () => {
  describe("scanMarkdownImageLinks - destination + range", () => {
    it("extracts a plain image link with no alt text", () => {
      const src = "before ![](assets/images/foo.png) after";
      const [match] = scanMarkdownImageLinks(src);
      expect(match.src).toBe("assets/images/foo.png");
      expect(slice(src, match)).toBe("assets/images/foo.png");
    });

    it("extracts alt text and a title without including them in the range", () => {
      const src = '![A cat](../assets/images/foo.png "a cute cat")';
      const [match] = scanMarkdownImageLinks(src);
      expect(match.src).toBe("../assets/images/foo.png");
      expect(slice(src, match)).toBe("../assets/images/foo.png");
    });

    it("extracts a single-quoted and a paren title form", () => {
      expect(scanMarkdownImageLinks("![x](a.png 'title')")[0].src).toBe("a.png");
      expect(scanMarkdownImageLinks("![x](a.png (title))")[0].src).toBe("a.png");
    });

    it("extracts an angle-bracketed destination with spaces (brackets stripped)", () => {
      const src = "![](<../assets/my images/foo.png>)";
      const [match] = scanMarkdownImageLinks(src);
      expect(match.src).toBe("../assets/my images/foo.png");
      expect(slice(src, match)).toBe("../assets/my images/foo.png");
    });

    it("extracts an angle-bracketed non-ASCII destination", () => {
      const src = '![挿絵](<../素材/挿絵 01.png> "図1")';
      const [match] = scanMarkdownImageLinks(src);
      expect(match.src).toBe("../素材/挿絵 01.png");
      expect(slice(src, match)).toBe("../素材/挿絵 01.png");
    });

    it("handles one level of [] nesting in the alt text", () => {
      const src = "![alt [inner] text](assets/foo.png)";
      const [match] = scanMarkdownImageLinks(src);
      expect(match.src).toBe("assets/foo.png");
    });

    it("finds multiple links in document order with correct offsets", () => {
      const src = "![](a.png)\n\ntext ![b](sub/b.jpg) text\n";
      const matches = scanMarkdownImageLinks(src);
      expect(matches.map((m) => m.src)).toEqual(["a.png", "sub/b.jpg"]);
      for (const match of matches) {
        expect(slice(src, match)).toBe(match.src);
      }
    });
  });

  describe("scanMarkdownImageLinks - what it skips", () => {
    it("skips an image link inside a fenced code block", () => {
      const src = "```\n![](assets/foo.png)\n```\n\n![](real.png)";
      expect(scanMarkdownImageLinks(src).map((m) => m.src)).toEqual(["real.png"]);
    });

    it("skips a ~~~ fenced code block too", () => {
      const src = "~~~md\n![](assets/foo.png)\n~~~\n";
      expect(scanMarkdownImageLinks(src)).toEqual([]);
    });

    it("skips an image link inside an inline code span", () => {
      const src = "use `![](assets/foo.png)` like this, then ![](real.png)";
      expect(scanMarkdownImageLinks(src).map((m) => m.src)).toEqual(["real.png"]);
    });

    it("skips a backslash-escaped image start", () => {
      expect(scanMarkdownImageLinks("\\![](assets/foo.png)")).toEqual([]);
    });

    it("does not match a reference-style image (no inline destination)", () => {
      expect(scanMarkdownImageLinks("![alt][ref]\n\n[ref]: a.png")).toEqual([]);
    });

    it("does not match a raw HTML <img> tag", () => {
      expect(
        scanMarkdownImageLinks('<img src="assets/foo.png" alt="x">')
      ).toEqual([]);
    });
  });

  describe("extractProjectLocalImageLinks - external filtering", () => {
    it("keeps only project-local candidates", () => {
      const src = [
        "![](assets/images/foo.png)",
        "![](./images/foo.png)",
        "![](../assets/images/foo.png)",
        "![](http://example.com/a.png)",
        "![](https://example.com/a.png)",
        "![](data:image/png;base64,AAAA)",
        "![](blob:abcd-1234)",
        "![](//cdn.example.com/a.png)",
        "![](mailto:x@example.com)",
        "![](#section)",
        "![]()"
      ].join("\n\n");
      expect(extractProjectLocalImageLinks(src).map((m) => m.src)).toEqual([
        "assets/images/foo.png",
        "./images/foo.png",
        "../assets/images/foo.png"
      ]);
    });

    it("keeps a project-local link even when its path shape is invalid (classifier decides)", () => {
      expect(
        extractProjectLocalImageLinks("![](images\\foo.png)").map((m) => m.src)
      ).toEqual(["images\\foo.png"]);
    });
  });
});
