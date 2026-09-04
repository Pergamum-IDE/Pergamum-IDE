/**
 * #386 - Pergamum regex-replace replacement-template mini-language (v1).
 *
 * Only three constructs are allowed in the "replace with" text when Regex
 * Search is on:
 *
 *   $1 .. $99      numeric capture reference
 *   ${1} .. ${99}  numeric capture reference with an explicit boundary
 *   $$             a literal "$"
 *
 * Everything else that starts with `$` is rejected up front (`$&`, `` $` ``,
 * `$'`, `$<name>`, a lone `$`, `$0`, `$100`+). Crucially `$200` is NOT read as
 * `$2` + `"00"` - three or more digits after `$` are ambiguous and rejected;
 * use `${2}00` when you mean "group 2 then the literal 00".
 *
 * Nothing here touches a buffer, a file, or telemetry. The template string is
 * never logged.
 */

export type ReplacementToken =
  | { readonly kind: "literal"; readonly value: string }
  | { readonly kind: "capture"; readonly index: number };

export type ReplacementTemplateError =
  /** `$&`, `` $` ``, `$'`, `$<name>`, a trailing lone `$`, `${...}` that is
   *  not `${n}`, or any other `$`-sequence outside the allow-list. */
  | "unsupportedSequence"
  /** `$` followed by three or more digits (`$100`, `$200`). */
  | "ambiguousReference"
  /** `$0`, `$00`, `${0}`, `${100}` - a number outside 1..99. */
  | "invalidGroupNumber"
  /** A `$n` / `${n}` that points past the pattern's capture-group count. */
  | "missingGroup";

export type ReplacementTemplateParseResult =
  | { readonly ok: true; readonly tokens: ReplacementToken[] }
  | { readonly ok: false; readonly error: ReplacementTemplateError };

function isDigit(character: string): boolean {
  return character >= "0" && character <= "9";
}

/**
 * Parse a replacement template into literal / capture tokens. Adjacent
 * literals are merged so `$$10` is a single `literal "$10"` token.
 */
export function parseReplacementTemplate(
  template: string
): ReplacementTemplateParseResult {
  const tokens: ReplacementToken[] = [];
  let literal = "";
  let index = 0;

  const flushLiteral = (): void => {
    if (literal.length > 0) {
      tokens.push({ kind: "literal", value: literal });
      literal = "";
    }
  };

  while (index < template.length) {
    const character = template[index];

    if (character !== "$") {
      literal += character;
      index += 1;
      continue;
    }

    const next = template[index + 1];

    // 1. `$$` -> a literal "$"
    if (next === "$") {
      literal += "$";
      index += 2;
      continue;
    }

    // 2. `${n}` -> capture reference with an explicit boundary
    if (next === "{") {
      const close = template.indexOf("}", index + 2);
      const body = close === -1 ? null : template.slice(index + 2, close);
      if (body === null || body.length === 0 || ![...body].every(isDigit)) {
        return { ok: false, error: "unsupportedSequence" };
      }
      if (body.length > 2) {
        return { ok: false, error: "invalidGroupNumber" };
      }
      const groupNumber = Number.parseInt(body, 10);
      if (groupNumber < 1 || groupNumber > 99) {
        return { ok: false, error: "invalidGroupNumber" };
      }
      flushLiteral();
      tokens.push({ kind: "capture", index: groupNumber });
      index = close + 1;
      continue;
    }

    // 3. `$n` / `$nn` -> capture reference (3+ digits is ambiguous)
    if (next !== undefined && isDigit(next)) {
      let digits = "";
      let scan = index + 1;
      while (scan < template.length && isDigit(template[scan])) {
        digits += template[scan];
        scan += 1;
      }
      if (digits.length > 2) {
        return { ok: false, error: "ambiguousReference" };
      }
      const groupNumber = Number.parseInt(digits, 10);
      if (groupNumber < 1 || groupNumber > 99) {
        return { ok: false, error: "invalidGroupNumber" };
      }
      flushLiteral();
      tokens.push({ kind: "capture", index: groupNumber });
      index += 1 + digits.length;
      continue;
    }

    // 4. anything else after `$` (`$&`, `` $` ``, `$'`, `$<`, a trailing `$`)
    return { ok: false, error: "unsupportedSequence" };
  }

  flushLiteral();
  return { ok: true, tokens };
}

/**
 * Parse `template` and additionally reject any capture reference that points
 * past `captureGroupCount` (the number of `( )` groups in the search pattern).
 */
export function validateReplacementTemplate(
  template: string,
  captureGroupCount: number
): ReplacementTemplateParseResult {
  const parsed = parseReplacementTemplate(template);
  if (!parsed.ok) {
    return parsed;
  }
  for (const token of parsed.tokens) {
    if (token.kind === "capture" && token.index > captureGroupCount) {
      return { ok: false, error: "missingGroup" };
    }
  }
  return parsed;
}

/**
 * How many capture groups a regex pattern defines. Uses the "empty
 * alternative" probe (`/pattern|/`) so an always-matching exec exposes every
 * group slot. Returns `0` for a pattern that will not compile (the caller
 * has already surfaced the invalid-regex error by then).
 */
export function countCaptureGroups(pattern: string): number {
  try {
    const probe = new RegExp(`${pattern}|`);
    const match = probe.exec("");
    return match ? match.length - 1 : 0;
  } catch {
    return 0;
  }
}

/** Expand parsed tokens against one regex match's capture array. */
export function renderReplacement(
  tokens: readonly ReplacementToken[],
  match: readonly (string | undefined)[]
): string {
  let out = "";
  for (const token of tokens) {
    out +=
      token.kind === "literal" ? token.value : match[token.index] ?? "";
  }
  return out;
}
