import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  computeEditorContentDigest,
  editorContentMatchesDigest,
  normalizeEditorContentForDigest,
  sha256Hex
} from "../../src/renderer/editorContentDigest";
import { normalizeLineEndings } from "../../src/renderer/lineEndingTracking";

function referenceSha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

describe("sha256Hex (#273)", () => {
  it("matches the FIPS 180-4 test vectors", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("agrees with node:crypto for ASCII, multibyte, long, and newline content", () => {
    const inputs = [
      "",
      "a",
      "The quick brown fox jumps over the lazy dog",
      "第一章 竜の島\n\n本文がここに続く。",
      "line one\nline two\nline three\n",
      "x".repeat(1),
      "y".repeat(55),
      "z".repeat(56),
      "w".repeat(64),
      "q".repeat(1000),
      "🐉📜✨ mixed emoji and 日本語 text"
    ];

    for (const input of inputs) {
      expect(sha256Hex(input)).toBe(referenceSha256Hex(input));
    }
  });

  it("produces a 64-character lowercase hex string", () => {
    const digest = sha256Hex("anything");

    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("normalizeEditorContentForDigest (#273)", () => {
  it("drops a single leading UTF-8 BOM", () => {
    expect(normalizeEditorContentForDigest("﻿# Title")).toBe("# Title");
    // Only the leading one.
    expect(normalizeEditorContentForDigest("a﻿b")).toBe("a﻿b");
  });

  it("folds CRLF and CR to LF", () => {
    expect(normalizeEditorContentForDigest("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
  });

  it("is idempotent on already-normalized editor content", () => {
    const content = "already\nnormalized\ntext";

    expect(normalizeEditorContentForDigest(content)).toBe(content);
  });
});

describe("computeEditorContentDigest (#273)", () => {
  it("returns a plain { algorithm, digest } descriptor", () => {
    const digest = computeEditorContentDigest("body");

    expect(digest).toEqual({
      algorithm: "sha256",
      digest: referenceSha256Hex("body")
    });
    expect(Object.getPrototypeOf(digest)).toBe(Object.prototype);
  });

  it("gives the same digest for identical normalized content", () => {
    expect(computeEditorContentDigest("# Chapter\n\nText.")).toEqual(
      computeEditorContentDigest("# Chapter\n\nText.")
    );
  });

  it("gives a different digest when the content changes", () => {
    expect(computeEditorContentDigest("# Chapter\n\nText.").digest).not.toBe(
      computeEditorContentDigest("# Chapter\n\nText!").digest
    );
  });

  it("ignores raw CRLF / LF differences once the editor has normalized the body", () => {
    // Two files that differ ONLY by line-ending style read as the same
    // text in the Pergamum editor after normalizeLineEndings; their
    // digests must match.
    const crlfEditorContent = normalizeLineEndings("一行目\r\n二行目\r\n三行目");
    const lfEditorContent = normalizeLineEndings("一行目\n二行目\n三行目");

    expect(crlfEditorContent).toBe(lfEditorContent);
    expect(computeEditorContentDigest(crlfEditorContent).digest).toBe(
      computeEditorContentDigest(lfEditorContent).digest
    );
  });

  it("ignores a leading BOM difference", () => {
    expect(computeEditorContentDigest("﻿# Title\n\nBody").digest).toBe(
      computeEditorContentDigest("# Title\n\nBody").digest
    );
  });

  it("hashes the normalized editor content, not the raw bytes", () => {
    // A raw CRLF string and its normalized form would hash differently as
    // raw bytes, but computeEditorContentDigest normalizes first.
    const raw = "a\r\nb";

    expect(computeEditorContentDigest(raw).digest).toBe(sha256Hex("a\nb"));
    expect(computeEditorContentDigest(raw).digest).not.toBe(sha256Hex(raw));
  });
});

describe("editorContentMatchesDigest (#273)", () => {
  it("is true only when the current content reproduces the stored digest", () => {
    const digest = computeEditorContentDigest("stable body");

    expect(editorContentMatchesDigest("stable body", digest)).toBe(true);
    expect(editorContentMatchesDigest("changed body", digest)).toBe(false);
  });

  it("never matches an unknown algorithm", () => {
    expect(
      editorContentMatchesDigest("body", {
        algorithm: "sha1" as "sha256",
        digest: sha256Hex("body")
      })
    ).toBe(false);
  });
});
