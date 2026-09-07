import { describe, expect, it } from "vitest";
import {
  PERGAMUM_ASSET_SCHEME,
  buildPergamumAssetUrl,
  parsePergamumAssetUrl,
  type PergamumAssetUrlRejectionReason
} from "../../src/shared/pergamumAssetUrl";

function rejectionOf(url: string): PergamumAssetUrlRejectionReason {
  const parsed = parsePergamumAssetUrl(url);
  if (parsed.ok) {
    throw new Error(`Expected "${url}" to be rejected, but it parsed.`);
  }
  return parsed.reason;
}

describe("pergamumAssetUrl (#409)", () => {
  describe("buildPergamumAssetUrl", () => {
    it("builds pergamum-asset://project/<path> from a canonical project-relative path", () => {
      expect(buildPergamumAssetUrl("assets/images/foo.png")).toBe(
        "pergamum-asset://project/assets/images/foo.png"
      );
    });

    it("percent-encodes each segment but keeps / separators", () => {
      expect(buildPergamumAssetUrl("assets/my images/a b.png")).toBe(
        "pergamum-asset://project/assets/my%20images/a%20b.png"
      );
    });

    it("round-trips through parsePergamumAssetUrl", () => {
      const url = buildPergamumAssetUrl("chapters/art/scene 1.png");
      const parsed = parsePergamumAssetUrl(url);
      expect(parsed).toEqual({
        ok: true,
        projectRelativePath: "chapters/art/scene 1.png",
        segments: ["chapters", "art", "scene 1.png"]
      });
    });

    it.each([
      "assets/images/foo.png",
      "assets/my images/a b.png",
      "素材/挿絵 01.png",
      "chapters/第1章/図 (1).png",
      "a/b+c/d&e.png"
    ])("round-trips %s through build -> parse", (projectRelativePath) => {
      const url = buildPergamumAssetUrl(projectRelativePath);
      const parsed = parsePergamumAssetUrl(url);
      expect(parsed.ok && parsed.projectRelativePath).toBe(projectRelativePath);
    });

    it("throws for a non-canonical input (defensive - callers must normalize first)", () => {
      expect(() => buildPergamumAssetUrl("a/../b.png")).toThrow();
      expect(() => buildPergamumAssetUrl("./a.png")).toThrow();
      expect(() => buildPergamumAssetUrl("/a.png")).toThrow();
      expect(() => buildPergamumAssetUrl("../a.png")).toThrow();
    });
  });

  describe("parsePergamumAssetUrl - accepts", () => {
    it("a plain project-relative image path", () => {
      expect(
        parsePergamumAssetUrl("pergamum-asset://project/assets/images/foo.png")
      ).toEqual({
        ok: true,
        projectRelativePath: "assets/images/foo.png",
        segments: ["assets", "images", "foo.png"]
      });
    });

    it("a percent-encoded space", () => {
      expect(
        parsePergamumAssetUrl("pergamum-asset://project/a/b%20c.png")
      ).toEqual({
        ok: true,
        projectRelativePath: "a/b c.png",
        segments: ["a", "b c.png"]
      });
    });

    it("a case-insensitive scheme + authority", () => {
      expect(
        parsePergamumAssetUrl("PERGAMUM-ASSET://PROJECT/a/b.png").ok
      ).toBe(true);
    });

    it("strips a query string and fragment", () => {
      expect(
        parsePergamumAssetUrl("pergamum-asset://project/a/b.png?v=2#x")
          .ok
      ).toBe(true);
      const parsed = parsePergamumAssetUrl(
        "pergamum-asset://project/a/b.png?v=2"
      );
      expect(parsed.ok && parsed.projectRelativePath).toBe("a/b.png");
    });
  });

  describe("parsePergamumAssetUrl - rejects", () => {
    it("a non pergamum-asset URL", () => {
      expect(parsePergamumAssetUrl("https://example.com/a.png")).toEqual({
        ok: false,
        reason: "notPergamumAssetUrl"
      });
      expect(rejectionOf("pergamum://project/a/b.png")).toBe(
        "notPergamumAssetUrl"
      );
    });

    it.each([
      "pergamum-asset://asset/assets/foo.png",
      "pergamum-asset://local/assets/foo.png",
      "pergamum-asset://foo/assets/foo.png",
      "pergamum-asset://other/a.png",
      "pergamum-asset:///a.png"
    ])("rejects the wrong authority %s (only `project` is allowed)", (url) => {
      expect(rejectionOf(url)).toBe("notPergamumAssetUrl");
    });

    it("an empty path", () => {
      expect(rejectionOf("pergamum-asset://project/")).toBe(
        "empty"
      );
    });

    it("a `../` parent segment", () => {
      expect(rejectionOf("pergamum-asset://project/../outside.png")).toBe(
        "parentSegment"
      );
      expect(
        rejectionOf("pergamum-asset://project/a/../../outside.png")
      ).toBe("parentSegment");
      expect(
        rejectionOf("pergamum-asset://project/a/%2e%2e/outside.png")
      ).toBe("parentSegment");
    });

    it("a `.` dot segment", () => {
      expect(
        rejectionOf("pergamum-asset://project/a/./b.png")
      ).toBe("dotSegment");
    });

    it("a backslash / encoded backslash (Windows traversal)", () => {
      expect(
        rejectionOf("pergamum-asset://project/..\\outside.png")
      ).toBe("backslash");
      expect(
        rejectionOf("pergamum-asset://project/a%5c..%5coutside.png")
      ).toBe("backslash");
    });

    it("an absolute-looking path (leading slash / double slash)", () => {
      expect(
        rejectionOf("pergamum-asset://project//etc/passwd.png")
      ).toBe("absolute");
    });

    it("an empty segment (trailing or doubled slash)", () => {
      expect(
        rejectionOf("pergamum-asset://project/a//b.png")
      ).toBe("emptySegment");
      expect(
        rejectionOf("pergamum-asset://project/a/b.png/")
      ).toBe("emptySegment");
    });

    it("malformed percent-encoding", () => {
      expect(
        rejectionOf("pergamum-asset://project/a/%zz.png")
      ).toBe("malformedEncoding");
    });

    it("a Windows reserved device name segment", () => {
      expect(
        rejectionOf("pergamum-asset://project/nul.png")
      ).toBe("invalidPath");
    });

    it("a Windows-invalid character in a segment", () => {
      expect(
        rejectionOf("pergamum-asset://project/a/b%3Ac.png")
      ).toBe("invalidPath");
    });
  });

  it("exposes the scheme name", () => {
    expect(PERGAMUM_ASSET_SCHEME).toBe("pergamum-asset");
  });
});
