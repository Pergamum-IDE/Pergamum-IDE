/// <reference path="./textlint-rule-preset-japanese.d.ts" />
import { TextlintKernel } from "@textlint/kernel";
import markdownPlugin from "@textlint/textlint-plugin-markdown";
import textPlugin from "@textlint/textlint-plugin-text";
import japanesePreset from "textlint-rule-preset-japanese";
import {
  enabledJapaneseLintRules,
  type EnabledJapaneseLintRule
} from "../../shared/japaneseLintRules";

/**
 * PoC (#625): a thin wrapper that runs textlint-rule-preset-japanese over a
 * Markdown or plain-text string and returns plain, serializable results.
 *
 * Not wired to any UI or IPC yet. It uses `TextlintKernel` (the pure lint
 * engine, no filesystem or config-file discovery) rather than the CLI-style
 * `createLinter`, so the rule set is exactly the preset with its default
 * options and nothing is read from disk. Runs in Node (Main Process side).
 *
 * Severity is textlint's own value; mapping it to Pergamum's display severity
 * belongs to the diagnostics adapter, not to this engine wrapper.
 */

/** Source format of the text being linted (Markdown or a `.txt` document). */
export type JapaneseLintSourceFormat = "markdown" | "text";

export type JapaneseLintMarkdownExtension = ".md" | ".markdown";
export type JapaneseLintTextExtension = ".txt";

/**
 * `format` selects the textlint plugin; `ext` is the file extension textlint
 * is told about (it picks the processor by extension). The pair is constrained
 * by type, and `ext` defaults per format (`.md` / `.txt`).
 *
 * `rules` is the rule set to run (see japaneseLintRules.ts). Omitted, the
 * catalog defaults apply; an empty array runs nothing and never starts
 * textlint.
 */
export type JapaneseLintOptions = (
  | {
      readonly format: "markdown";
      readonly ext?: JapaneseLintMarkdownExtension;
    }
  | {
      readonly format: "text";
      readonly ext?: JapaneseLintTextExtension;
    }
) & { readonly rules?: readonly EnabledJapaneseLintRule[] };

export type JapaneseLintSeverity = "info" | "warning" | "error";

export interface JapaneseLintMessage {
  /** textlint rule id, e.g. "max-ten". */
  readonly ruleId: string;
  readonly severity: JapaneseLintSeverity;
  readonly message: string;
  /** 1-based line. */
  readonly line: number;
  /** 1-based column. */
  readonly column: number;
  /** 0-based UTF-16 offset into the linted text. */
  readonly index: number;
  /** Suggested replacement, when the rule can fix the problem. */
  readonly fix?: {
    readonly range: readonly [number, number];
    readonly text: string;
  };
}

// textlint's TextlintRuleSeverityLevelKeys: none=0, warning=1, error=2,
// info=3 (info is 3, not 0). `none` means "disabled" and is never shown, so
// the wrapper's own severity is exactly the three user-facing states.
const severityByLevel: Readonly<Record<number, JapaneseLintSeverity | null>> = {
  0: null,
  1: "warning",
  2: "error",
  3: "info"
};

/**
 * Maps a textlint severity level to the user-facing severity.
 * Returns null for `none` (0) - such a message must not be reported.
 * A missing level uses textlint's default (error); an unknown level is
 * surfaced as `error` rather than silently hidden or downgraded.
 */
export function toJapaneseLintSeverity(
  level: number | undefined
): JapaneseLintSeverity | null {
  if (level === undefined) {
    return "error";
  }

  const mapped = severityByLevel[level];

  return mapped === undefined ? "error" : mapped;
}

interface RawLintMessage {
  readonly ruleId: string;
  readonly severity?: number;
  readonly message: string;
  readonly line: number;
  readonly column: number;
  readonly index: number;
  readonly fix?: { readonly range: readonly number[]; readonly text: string };
}

/** Converts textlint messages into wrapper messages (position-ordered). */
export function toJapaneseLintMessages(
  raw: readonly RawLintMessage[]
): JapaneseLintMessage[] {
  return raw
    .flatMap((message): JapaneseLintMessage[] => {
      const severity = toJapaneseLintSeverity(message.severity);

      if (severity === null) {
        return [];
      }

      const base = {
        ruleId: message.ruleId,
        severity,
        message: message.message,
        line: message.line,
        column: message.column,
        index: message.index
      };

      return [
        message.fix
          ? {
              ...base,
              fix: {
                range: [message.fix.range[0], message.fix.range[1]] as const,
                text: message.fix.text
              }
            }
          : base
      ];
    })
    .sort((a, b) => a.index - b.index);
}

// Rule implementations by id. The preset's own per-rule options (e.g.
// no-doubled-joshi's min_interval) are the base; the user's numeric options
// from the settings win over them.
const presetRuleImplementations = new Map(
  Object.entries(japanesePreset.rules)
);

function isOptionsObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toKernelRules(rules: readonly EnabledJapaneseLintRule[]) {
  return rules.flatMap((enabled) => {
    const implementation = presetRuleImplementations.get(enabled.id);

    if (implementation === undefined) {
      return [];
    }

    const presetOptions = japanesePreset.rulesConfig[enabled.id];

    return [
      {
        ruleId: enabled.id,
        rule: implementation as never,
        options: {
          ...(isOptionsObject(presetOptions) ? presetOptions : {}),
          ...enabled.options
        } as Record<string, unknown>
      }
    ];
  });
}

const kernel = new TextlintKernel();

// Format -> textlint plugin + default extension. The markdown plugin parses
// Markdown (code fences / inline code are not prose); the text plugin lints
// the whole document as plain text.
const sourceProfiles = {
  markdown: {
    defaultExt: ".md",
    pluginId: "markdown",
    plugin: markdownPlugin
  },
  text: { defaultExt: ".txt", pluginId: "text", plugin: textPlugin }
} as const;

/** Ids of every rule the wrapper is able to run (for diagnostics and tests). */
export const japaneseLintRuleIds: readonly string[] = [
  ...presetRuleImplementations.keys()
];

/**
 * Lints `source` with textlint-rule-preset-japanese, parsed according to
 * `options.format` / `options.ext`. Messages are ordered by position.
 */
export async function lintJapanese(
  source: string,
  options: JapaneseLintOptions
): Promise<JapaneseLintMessage[]> {
  const rules = toKernelRules(options.rules ?? enabledJapaneseLintRules(undefined));

  // Every rule switched off: there is nothing to check, so do not start
  // textlint at all.
  if (rules.length === 0) {
    return [];
  }

  const profile = sourceProfiles[options.format];
  const result = await kernel.lintText(source, {
    ext: options.ext ?? profile.defaultExt,
    plugins: [{ pluginId: profile.pluginId, plugin: profile.plugin as never }],
    rules
  });

  return toJapaneseLintMessages(result.messages);
}

/** Convenience wrapper: lint a Markdown document. */
export function lintJapaneseMarkdown(
  markdown: string,
  ext: JapaneseLintMarkdownExtension = ".md",
  rules?: readonly EnabledJapaneseLintRule[]
): Promise<JapaneseLintMessage[]> {
  return lintJapanese(markdown, { format: "markdown", ext, rules });
}

/** Convenience wrapper: lint a plain-text (`.txt`) document. */
export function lintJapanesePlainText(
  text: string,
  rules?: readonly EnabledJapaneseLintRule[]
): Promise<JapaneseLintMessage[]> {
  return lintJapanese(text, { format: "text", ext: ".txt", rules });
}
