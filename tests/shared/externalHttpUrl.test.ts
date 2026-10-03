import { describe, expect, it } from "vitest";
import {
  classifyPreviewLinkHref,
  parseExternalHttpUrl
} from "../../src/shared/externalHttpUrl";

describe("classifyPreviewLinkHref", () => {
  it("treats absolute http and https URLs as external", () => {
    expect(classifyPreviewLinkHref("http://example.com")).toEqual({
      kind: "externalHttp",
      url: "http://example.com/"
    });
    expect(classifyPreviewLinkHref("https://example.com/a?b=1#c")).toEqual({
      kind: "externalHttp",
      url: "https://example.com/a?b=1#c"
    });
  });

  it("never upgrades http to https and normalizes the scheme case", () => {
    expect(classifyPreviewLinkHref("HTTP://Example.com/x")).toEqual({
      kind: "externalHttp",
      url: "http://example.com/x"
    });
  });

  it.each([
    "file:///C:/Windows/System32/notepad.exe",
    "mailto:test@example.com",
    "ftp://example.com/file",
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "custom://thing",
    "vscode://open",
    "./relative.md",
    "../relative.txt",
    "relative.md",
    "/absolute/path.md",
    "//example.com/protocol-relative",
    "",
    "   "
  ])("blocks %s", (href) => {
    expect(classifyPreviewLinkHref(href)).toEqual({ kind: "blocked" });
  });

  it("blocks a missing href", () => {
    expect(classifyPreviewLinkHref(null)).toEqual({ kind: "blocked" });
    expect(classifyPreviewLinkHref(undefined)).toEqual({ kind: "blocked" });
  });

  it("does not classify a hash-only link as external", () => {
    expect(classifyPreviewLinkHref("#heading")).toEqual({ kind: "hashOnly" });
    expect(classifyPreviewLinkHref("#")).toEqual({ kind: "hashOnly" });
  });
});

describe("parseExternalHttpUrl", () => {
  it("accepts only absolute http(s)", () => {
    expect(parseExternalHttpUrl("https://example.com")).toBe("https://example.com/");
    expect(parseExternalHttpUrl("http://example.com")).toBe("http://example.com/");
  });

  it.each([
    "file:///x",
    "mailto:a@b.c",
    "ftp://x",
    "javascript:alert(1)",
    "data:text/plain,x",
    "not a url",
    "",
    "#hash"
  ])("rejects %s", (value) => {
    expect(parseExternalHttpUrl(value)).toBeNull();
  });

  it("rejects non-strings", () => {
    expect(parseExternalHttpUrl(undefined)).toBeNull();
    expect(parseExternalHttpUrl(null)).toBeNull();
    expect(parseExternalHttpUrl(42)).toBeNull();
    expect(parseExternalHttpUrl({ href: "https://example.com" })).toBeNull();
  });
});
