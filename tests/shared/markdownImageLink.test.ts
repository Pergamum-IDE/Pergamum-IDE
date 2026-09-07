import { describe, expect, it } from "vitest";
import {
  buildMarkdownImageLink,
  destinationHasMarkdownRiskyCharacters,
  markdownDestinationNeedsAngleWrapping,
  markdownImageLinkForAttachment,
  projectRelativeDirname,
  projectRelativeLinkPath
} from "../../src/shared/markdownImageLink";

describe("projectRelativeDirname", () => {
  it("returns the directory portion, or '' for a root-level file", () => {
    expect(projectRelativeDirname("novel/chapter01.md")).toBe("novel");
    expect(projectRelativeDirname("a/b/c/chapter.md")).toBe("a/b/c");
    expect(projectRelativeDirname("chapter01.md")).toBe("");
    expect(projectRelativeDirname("a\\b\\c.md")).toBe("a/b");
  });
});

describe("projectRelativeLinkPath", () => {
  it("walks up from the Markdown directory to a sibling folder (#407 §26)", () => {
    expect(projectRelativeLinkPath("novel", "images/x.png")).toBe(
      "../images/x.png"
    );
  });

  it("stays flat when the Markdown file is at the project root", () => {
    expect(projectRelativeLinkPath("", "images/x.png")).toBe("images/x.png");
  });

  it("collapses to a bare name when image and Markdown share a directory", () => {
    expect(projectRelativeLinkPath("a/b", "a/b/x.png")).toBe("x.png");
  });

  it("emits multiple ../ for a deeply nested Markdown file", () => {
    expect(projectRelativeLinkPath("a/b/c", "a/x.png")).toBe("../../x.png");
    expect(projectRelativeLinkPath("a/b/c", "images/x.png")).toBe(
      "../../../images/x.png"
    );
  });

  it("always uses / even for backslash inputs", () => {
    expect(projectRelativeLinkPath("novel\\part1", "assets\\img\\x.png")).toBe(
      "../../assets/img/x.png"
    );
  });
});

describe("markdownDestinationNeedsAngleWrapping", () => {
  it("is false for a plain slash-only path", () => {
    expect(markdownDestinationNeedsAngleWrapping("../images/x.png")).toBe(false);
  });

  it("is true for spaces, parentheses, angle brackets, backslash and empty", () => {
    expect(markdownDestinationNeedsAngleWrapping("../添付 画像/x.png")).toBe(true);
    expect(markdownDestinationNeedsAngleWrapping("../img(1)/x.png")).toBe(true);
    expect(markdownDestinationNeedsAngleWrapping("../a<b/x.png")).toBe(true);
    expect(markdownDestinationNeedsAngleWrapping("..\\img\\x.png")).toBe(true);
    expect(markdownDestinationNeedsAngleWrapping("")).toBe(true);
  });
});

describe("buildMarkdownImageLink", () => {
  it("produces a bare link for a safe path", () => {
    expect(buildMarkdownImageLink("../images/x.png")).toBe("![](../images/x.png)");
  });

  it("angle-wraps a path containing spaces / Japanese, without percent-encoding (#407 §28)", () => {
    expect(buildMarkdownImageLink("../添付 画像/x.png")).toBe(
      "![](<../添付 画像/x.png>)"
    );
  });

  it("normalizes backslashes to / and only then decides on wrapping (clean path stays bare)", () => {
    expect(buildMarkdownImageLink("..\\images\\x.png")).toBe(
      "![](../images/x.png)"
    );
  });
});

describe("markdownImageLinkForAttachment", () => {
  it("matches the Issue #407 §26 worked example", () => {
    expect(
      markdownImageLinkForAttachment({
        markdownRelativePath: "novel/chapter01.md",
        imageRelativePath: "images/2026-09-07-095213042.png"
      })
    ).toBe("![](../images/2026-09-07-095213042.png)");
  });

  it("angle-wraps when the configured folder has a space", () => {
    expect(
      markdownImageLinkForAttachment({
        markdownRelativePath: "novel/part1/chapter01.md",
        imageRelativePath: "添付 画像/x.png"
      })
    ).toBe("![](<../../添付 画像/x.png>)");
  });

  it("handles a root-level Markdown file", () => {
    expect(
      markdownImageLinkForAttachment({
        markdownRelativePath: "chapter01.md",
        imageRelativePath: "assets/images/x.png"
      })
    ).toBe("![](assets/images/x.png)");
  });
});

describe("destinationHasMarkdownRiskyCharacters", () => {
  it("flags spaces and markdown-significant punctuation", () => {
    expect(destinationHasMarkdownRiskyCharacters("assets/images")).toBe(false);
    expect(destinationHasMarkdownRiskyCharacters("添付 画像")).toBe(true);
    expect(destinationHasMarkdownRiskyCharacters("img(1)")).toBe(true);
    expect(destinationHasMarkdownRiskyCharacters("images#draft")).toBe(true);
  });
});
