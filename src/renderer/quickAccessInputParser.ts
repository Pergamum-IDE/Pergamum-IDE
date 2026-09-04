/**
 * Foundation parser for the Quick Access prefix family (#138 / #139),
 * wired into the Command Palette's mode derivation as of #145. It replaced
 * the older `quickAccessPrefixResolver.ts` (whole-string-trimming, `>` / `#`
 * / `/` only, `#` mapped to glossary), which was retired once this parser
 * became the sole interpretation path — see #145 for the resolver/parser
 * behavior comparison that justified the removal.
 *
 * `command` (`>`), `file` (no prefix), `line` (`:`), `heading` (`#`),
 * `search` (`%` / `％`, #384) and `glossary` (`@` / `＠`, #142) are all
 * implemented - every `QuickAccessPrefix` has a working mode. Mode is derived
 * from `rawInput` on every parse.
 *
 * `rawInput` is the source of truth: mode is derived from it on every parse
 * rather than tracked as separate state, so deleting/replacing a prefix
 * character changes mode for free.
 */

export type QuickAccessMode =
  | "file"
  | "command"
  | "line"
  | "heading"
  | "glossary"
  | "search";

export type QuickAccessPrefix = "" | ">" | ":" | "#" | "@" | "%";

export interface QuickAccessInput {
  readonly rawInput: string;
  readonly prefix: QuickAccessPrefix;
  readonly mode: QuickAccessMode;
  readonly query: string;
}

const modeByPrefix: Record<QuickAccessPrefix, QuickAccessMode> = {
  "": "file",
  ">": "command",
  ":": "line",
  "#": "heading",
  "@": "glossary",
  "%": "search"
};

/**
 * Fixed first-code-point map only. Not general Unicode normalization (no
 * NFKC): every other full-width character is left untouched and falls
 * through to no-prefix file mode like any other unrecognized leading
 * character.
 */
const fullWidthPrefixByCodePoint = new Map<string, QuickAccessPrefix>([
  [">", ">"],
  [":", ":"],
  ["#", "#"],
  ["@", "@"],
  ["%", "%"],
  ["＞", ">"], // ＞
  ["：", ":"], // ：
  ["＃", "#"], // ＃
  ["＠", "@"], // ＠
  ["％", "%"] // ％
]);

function fileResult(rawInput: string): QuickAccessInput {
  return { rawInput, prefix: "", mode: "file", query: rawInput };
}

export function parseQuickAccessInput(rawInput: string): QuickAccessInput {
  const firstCodePoint = rawInput.codePointAt(0);

  if (firstCodePoint === undefined) {
    return fileResult(rawInput);
  }

  // codePointAt + fromCodePoint (rather than charAt/rawInput[0]) so an
  // astral leading character, e.g. an emoji surrogate pair, is compared as
  // one unit and never mistaken for a reserved prefix.
  const firstChar = String.fromCodePoint(firstCodePoint);
  const prefix = fullWidthPrefixByCodePoint.get(firstChar);

  if (prefix === undefined) {
    return fileResult(rawInput);
  }

  // Every recognized prefix (half-width or full-width) is exactly one
  // UTF-16 code unit, so slicing by `firstChar.length` is safe here even
  // though it would not be for an arbitrary code point.
  const afterPrefix = rawInput.slice(firstChar.length);

  return {
    rawInput,
    prefix,
    mode: modeByPrefix[prefix],
    // Only the prefix/query boundary is trimmed, and only on the leading
    // side; trailing query whitespace and no-prefix input are preserved
    // verbatim per #138.
    query: afterPrefix.trimStart()
  };
}
