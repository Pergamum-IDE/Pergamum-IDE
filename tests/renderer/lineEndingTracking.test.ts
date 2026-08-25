import { describe, expect, it } from "vitest";
import {
  analyzeLineEndings,
  serializeLineEndings,
  type LineEndingBreak
} from "../../src/renderer/lineEndingTracking";

describe("analyzeLineEndings (#253)", () => {
  it("detects a pure LF document", () => {
    expect(analyzeLineEndings("a\nb\nc")).toEqual([
      { position: 1, kind: "lf" },
      { position: 3, kind: "lf" }
    ]);
  });

  it("detects a pure CRLF document", () => {
    expect(analyzeLineEndings("a\r\nb\r\nc")).toEqual([
      { position: 1, kind: "crlf" },
      { position: 3, kind: "crlf" }
    ]);
  });

  it("detects a pure CR document", () => {
    expect(analyzeLineEndings("a\rb\rc")).toEqual([
      { position: 1, kind: "cr" },
      { position: 3, kind: "cr" }
    ]);
  });

  it("detects mixed LF / CRLF / CR line endings, each break kept distinct", () => {
    expect(analyzeLineEndings("a\r\nb\nc\rd")).toEqual([
      { position: 1, kind: "crlf" },
      { position: 3, kind: "lf" },
      { position: 5, kind: "cr" }
    ]);
  });

  it("counts a CRLF as exactly one break, not a CR followed by an LF", () => {
    const breaks = analyzeLineEndings("abc\r\ndef\nghi");

    expect(breaks).toHaveLength(2);
    expect(breaks.filter((b) => b.kind === "crlf")).toHaveLength(1);
    expect(breaks.filter((b) => b.kind === "cr")).toHaveLength(0);
    expect(breaks.filter((b) => b.kind === "lf")).toHaveLength(1);
  });

  it("matches the issue's worked example: CRLF once, LF once, CR zero, total two", () => {
    const breaks = analyzeLineEndings("abc\r\ndef\nghi");

    expect(breaks).toEqual([
      { position: 3, kind: "crlf" },
      { position: 7, kind: "lf" }
    ]);
  });

  it("computes positions in CodeMirror's normalized (post-join) coordinate space, not raw-string offsets", () => {
    // Raw "abc\r\ndef" has the "d" at raw offset 5, but after CRLF
    // normalizes to a single "\n", the normalized string is "abc\ndef" and
    // "d" sits at offset 4.
    const breaks = analyzeLineEndings("abc\r\ndef");

    expect(breaks).toEqual([{ position: 3, kind: "crlf" }]);
    expect("abc\ndef".slice(breaks[0].position + 1)).toBe("def");
  });

  it("treats a missing trailing newline as no fourth kind — EOF is not a line ending", () => {
    expect(analyzeLineEndings("no newline here")).toEqual([]);
  });

  it("returns an empty array for an empty document", () => {
    expect(analyzeLineEndings("")).toEqual([]);
  });

  it("returns an empty array for a single-line document without a trailing newline", () => {
    expect(analyzeLineEndings("just one line")).toEqual([]);
  });

  it("does not miscount when a line's content is empty (consecutive breaks)", () => {
    expect(analyzeLineEndings("a\r\n\r\nb")).toEqual([
      { position: 1, kind: "crlf" },
      { position: 2, kind: "crlf" }
    ]);
  });
});

describe("serializeLineEndings (#253)", () => {
  it("returns content unchanged when there are no tracked breaks", () => {
    expect(serializeLineEndings("no breaks", [])).toBe("no breaks");
  });

  it("round-trips a pure LF document exactly", () => {
    const raw = "a\nb\nc";
    expect(serializeLineEndings(raw, analyzeLineEndings(raw))).toBe(raw);
  });

  it("round-trips a pure CRLF document exactly", () => {
    const raw = "a\r\nb\r\nc";
    const normalized = "a\nb\nc";
    const breaks = analyzeLineEndings(raw);

    expect(serializeLineEndings(normalized, breaks)).toBe(raw);
  });

  it("round-trips a pure CR document exactly", () => {
    const raw = "a\rb\rc";
    const normalized = "a\nb\nc";
    const breaks = analyzeLineEndings(raw);

    expect(serializeLineEndings(normalized, breaks)).toBe(raw);
  });

  it("round-trips a mixed LF/CRLF/CR document exactly, without normalizing to one kind", () => {
    const raw = "one\r\ntwo\nthree\rfour";
    const normalized = "one\ntwo\nthree\nfour";
    const breaks = analyzeLineEndings(raw);

    const result = serializeLineEndings(normalized, breaks);

    expect(result).toBe(raw);
    // Explicitly confirm it isn't collapsed to a single kind.
    expect(result).toContain("\r\n");
    expect(result).toMatch(/[^\r]\n[^\r]/); // a bare LF exists
    expect(result).toMatch(/[^\n]\r[^\n]/); // a bare CR exists
  });

  it("round-trips a document with no trailing newline", () => {
    const raw = "a\r\nb\r\nc";
    expect(
      serializeLineEndings("a\nb\nc", analyzeLineEndings(raw))
    ).toBe(raw);
  });

  it("round-trips an empty document", () => {
    expect(serializeLineEndings("", analyzeLineEndings(""))).toBe("");
  });

  it("applies each break's own kind at its own position, independent of neighboring breaks", () => {
    const breaks: LineEndingBreak[] = [
      { position: 1, kind: "cr" },
      { position: 3, kind: "crlf" },
      { position: 5, kind: "lf" }
    ];

    expect(serializeLineEndings("a\nb\nc\nd", breaks)).toBe("a\rb\r\nc\nd");
  });
});
