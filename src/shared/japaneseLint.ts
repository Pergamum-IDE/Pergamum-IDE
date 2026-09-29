/**
 * #625: Japanese lint IPC contract, shared by Main / Preload / Renderer.
 *
 * The engine runs in the Main Process (src/main/textlint); the Renderer sends
 * only the text being edited plus the source format, and gets back plain,
 * serializable diagnostics. Nothing else about the project crosses the
 * boundary.
 */

export type JapaneseLintFormat = "markdown" | "text";
export type JapaneseLintExtension = ".md" | ".markdown" | ".txt";

/** The format/extension a document is linted as. */
export interface JapaneseLintSource {
  readonly format: JapaneseLintFormat;
  readonly ext: JapaneseLintExtension;
}

export interface JapaneseLintRequest {
  readonly text: string;
  readonly format: JapaneseLintFormat;
  readonly ext: JapaneseLintExtension;
}

/** textlint's user-facing severity as returned by the engine wrapper. */
export type JapaneseLintDiagnosticSeverity = "info" | "warning" | "error";

export interface JapaneseLintDiagnostic {
  /** textlint rule id, e.g. "no-doubled-joshi". */
  readonly ruleId: string;
  readonly severity: JapaneseLintDiagnosticSeverity;
  readonly message: string;
  /** 1-based line. */
  readonly line: number;
  /** 1-based column. */
  readonly column: number;
  /** 0-based UTF-16 offset into the request text. */
  readonly index: number;
}

export type JapaneseLintResponse =
  | {
      readonly ok: true;
      readonly diagnostics: readonly JapaneseLintDiagnostic[];
      /** True when there were more than the result cap and the rest was cut. */
      readonly truncated: boolean;
    }
  | {
      readonly ok: false;
      readonly reason: "invalid-request" | "lint-failed" | "too-large";
    };

/**
 * Longest text (UTF-16 units) the Japanese linter will run on. textlint's
 * cost grows faster than linearly and it runs on the Main Process, which must
 * keep pumping window messages: measured in Electron's Node, ~50k chars take
 * ~1s, 100k ~2.8s, 200k ~9s, 400k ~57s (a frozen "Not responding" window).
 * Larger documents are skipped, not linted.
 */
export const JAPANESE_LINT_MAX_SOURCE_LENGTH = 50_000;

/** Most diagnostics returned for one request; the rest are cut (truncated). */
export const JAPANESE_LINT_MAX_RESULT_COUNT = 1_000;

/** True when a document of this length is too large for the Japanese linter. */
export function isJapaneseLintSourceTooLarge(length: number): boolean {
  return length > JAPANESE_LINT_MAX_SOURCE_LENGTH;
}

const allowedExtensionsByFormat: Readonly<
  Record<JapaneseLintFormat, readonly JapaneseLintExtension[]>
> = {
  markdown: [".md", ".markdown"],
  text: [".txt"]
};

/**
 * Validates an untrusted request (the Renderer is not trusted, ADR-0006
 * S-15 style). Returns null when the shape or the format/ext pairing is
 * invalid. Size is deliberately NOT checked here: an oversized text is a
 * well-formed request that the handler answers with `too-large`.
 */
export function parseJapaneseLintRequest(
  value: unknown
): JapaneseLintRequest | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const { text, format, ext } = value as Record<string, unknown>;

  if (
    typeof text !== "string" ||
    (format !== "markdown" && format !== "text") ||
    typeof ext !== "string"
  ) {
    return null;
  }

  const allowed = allowedExtensionsByFormat[format];
  const matched = allowed.find((candidate) => candidate === ext);

  return matched === undefined ? null : { text, format, ext: matched };
}

/**
 * Chooses the lint format/extension for a document path. `.md` / `.markdown`
 * are Markdown, `.txt` is plain text (matched case-insensitively); anything
 * else is unsupported (null). A Markdown path with another Markdown-like
 * extension falls back to `.md`.
 */
export function japaneseLintSourceForPath(
  path: string | null,
  isMarkdownPath: (path: string) => boolean
): JapaneseLintSource | null {
  if (path === null) {
    return null;
  }

  const lower = path.toLowerCase();

  if (lower.endsWith(".markdown")) {
    return { format: "markdown", ext: ".markdown" };
  }

  if (lower.endsWith(".md")) {
    return { format: "markdown", ext: ".md" };
  }

  if (lower.endsWith(".txt")) {
    return { format: "text", ext: ".txt" };
  }

  return isMarkdownPath(path) ? { format: "markdown", ext: ".md" } : null;
}

export type JapaneseLintToggleDecision =
  | "turn-off"
  | "turn-on"
  /** Turning ON is refused: the document is too long (show the dialog). */
  | "refuse-too-large"
  /** The active surface does not support the check. */
  | "ignore";

/**
 * What a click on the toolbar toggle does. An oversized document never turns
 * the check ON (no IPC, no lint); turning OFF is always allowed.
 */
export function decideJapaneseLintToggle(input: {
  readonly canUse: boolean;
  readonly isActive: boolean;
  readonly documentLength: number;
}): JapaneseLintToggleDecision {
  if (!input.canUse) {
    return "ignore";
  }

  if (input.isActive) {
    return "turn-off";
  }

  return isJapaneseLintSourceTooLarge(input.documentLength)
    ? "refuse-too-large"
    : "turn-on";
}
