import { describe, expect, it } from "vitest";
import {
  parseQuickAccessInput,
  type QuickAccessMode,
  type QuickAccessPrefix
} from "../../src/renderer/quickAccessInputParser";

interface Case {
  readonly rawInput: string;
  readonly mode: QuickAccessMode;
  readonly prefix: QuickAccessPrefix;
  readonly query: string;
}

const cases: readonly Case[] = [
  // No prefix -> file mode. Unknown leading characters, including
  // surrogate-pair emoji, are not invalid prefixes; they stay part of the
  // file query, and leading whitespace is preserved (not trimmed).
  { rawInput: "", mode: "file", prefix: "", query: "" },
  { rawInput: "abc", mode: "file", prefix: "", query: "abc" },
  { rawInput: " abc", mode: "file", prefix: "", query: " abc" },
  { rawInput: "/abc", mode: "file", prefix: "", query: "/abc" },
  { rawInput: "😀abc", mode: "file", prefix: "", query: "😀abc" },

  // ">" / "＞" -> command mode.
  { rawInput: ">", mode: "command", prefix: ">", query: "" },
  { rawInput: ">save", mode: "command", prefix: ">", query: "save" },
  { rawInput: "> save", mode: "command", prefix: ">", query: "save" },
  { rawInput: ">  save", mode: "command", prefix: ">", query: "save" },
  { rawInput: "> ", mode: "command", prefix: ">", query: "" },
  { rawInput: ">save ", mode: "command", prefix: ">", query: "save " },
  { rawInput: "＞save", mode: "command", prefix: ">", query: "save" },

  // ":" / "：" -> line mode. Query content is not validated by the parser.
  { rawInput: ":", mode: "line", prefix: ":", query: "" },
  { rawInput: ":42", mode: "line", prefix: ":", query: "42" },
  { rawInput: ": 42", mode: "line", prefix: ":", query: "42" },
  { rawInput: ":abc", mode: "line", prefix: ":", query: "abc" },
  { rawInput: "：42", mode: "line", prefix: ":", query: "42" },

  // "#" / "＃" -> heading mode. No escape mechanism: a second "#" is query
  // content, not an attempt to escape the prefix.
  { rawInput: "#intro", mode: "heading", prefix: "#", query: "intro" },
  { rawInput: "# intro", mode: "heading", prefix: "#", query: "intro" },
  { rawInput: "＃intro", mode: "heading", prefix: "#", query: "intro" },
  { rawInput: "##", mode: "heading", prefix: "#", query: "#" },

  // "@" / "＠" -> glossary mode.
  { rawInput: "@alice", mode: "glossary", prefix: "@", query: "alice" },
  { rawInput: "@ alice", mode: "glossary", prefix: "@", query: "alice" },
  { rawInput: "＠alice", mode: "glossary", prefix: "@", query: "alice" },

  // "%" / "％" -> project full-text search shortcut (#384).
  { rawInput: "%", mode: "search", prefix: "%", query: "" },
  { rawInput: "%メイド", mode: "search", prefix: "%", query: "メイド" },
  { rawInput: "% メイド", mode: "search", prefix: "%", query: "メイド" },
  { rawInput: "％メイド", mode: "search", prefix: "%", query: "メイド" },
  { rawInput: "％ メイド", mode: "search", prefix: "%", query: "メイド" },
  { rawInput: "%%", mode: "search", prefix: "%", query: "%" },

  // The `file.md:42` suffix form is Future Work (#140) and must not be
  // interpreted as line mode here: "f" is not a reserved prefix, so the
  // whole string stays a no-prefix file query.
  { rawInput: "file.md:42", mode: "file", prefix: "", query: "file.md:42" }
];

describe("parseQuickAccessInput", () => {
  it.each(cases.map((c) => [c.rawInput, c] as const))(
    "%j",
    (rawInput, expected) => {
      expect(parseQuickAccessInput(rawInput)).toEqual(expected);
    }
  );

  it("preserves rawInput verbatim, including full-width prefixes", () => {
    expect(parseQuickAccessInput("＞save").rawInput).toBe("＞save");
    expect(parseQuickAccessInput("：42").rawInput).toBe("：42");
    expect(parseQuickAccessInput("＃intro").rawInput).toBe("＃intro");
    expect(parseQuickAccessInput("＠alice").rawInput).toBe("＠alice");
  });

  it("does not include a recognizedPrefix field", () => {
    const result = parseQuickAccessInput(">save");

    expect(Object.keys(result).sort()).toEqual([
      "mode",
      "prefix",
      "query",
      "rawInput"
    ]);
  });

  it("derives mode from prefix alone, so prefix !== \"\" doubles as the recognized-prefix check", () => {
    expect(parseQuickAccessInput("abc").prefix).toBe("");
    expect(parseQuickAccessInput(">abc").prefix).not.toBe("");
  });

  it("does not validate line query content beyond extracting it", () => {
    expect(parseQuickAccessInput(":abc").mode).toBe("line");
    expect(parseQuickAccessInput(":abc").query).toBe("abc");
    expect(parseQuickAccessInput(":").query).toBe("");
  });
});
