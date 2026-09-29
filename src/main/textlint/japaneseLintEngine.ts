/// <reference path="./textlint-rule-preset-japanese.d.ts" />
import { TextlintKernel } from "@textlint/kernel";
import markdownPlugin from "@textlint/textlint-plugin-markdown";
import textPlugin from "@textlint/textlint-plugin-text";
import japanesePreset from "textlint-rule-preset-japanese";

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
 */
export type JapaneseLintOptions =
  | {
      readonly format: "markdown";
      readonly ext?: JapaneseLintMarkdownExtension;
    }
  | {
      readonly format: "text";
      readonly ext?: JapaneseLintTextExtension;
    };

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

const severityByLevel: Readonly<Record<number, JapaneseLintSeverity>> = {
  0: "info",
  1: "warning",
  2: "error"
};

// Preset rules with the preset's own default options. A rule whose default
// option is `false` is disabled, following textlint's rulesConfig convention.
const presetRules = Object.entries(japanesePreset.rules).flatMap(
  ([ruleId, rule]) => {
    const options = japanesePreset.rulesConfig[ruleId];

    if (options === false) {
      return [];
    }

    return [
      {
        ruleId,
        rule: rule as never,
        options: (options === true || options === undefined
          ? {}
          : options) as Record<string, unknown>
      }
    ];
  }
);

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

/** Ids of the rules the wrapper runs (for diagnostics and tests). */
export const japaneseLintRuleIds: readonly string[] = presetRules.map(
  (rule) => rule.ruleId
);

/**
 * Lints `source` with textlint-rule-preset-japanese, parsed according to
 * `options.format` / `options.ext`. Messages are ordered by position.
 */
export async function lintJapanese(
  source: string,
  options: JapaneseLintOptions
): Promise<JapaneseLintMessage[]> {
  const profile = sourceProfiles[options.format];
  const result = await kernel.lintText(source, {
    ext: options.ext ?? profile.defaultExt,
    plugins: [{ pluginId: profile.pluginId, plugin: profile.plugin as never }],
    rules: presetRules
  });

  return result.messages
    .map((message): JapaneseLintMessage => {
      const base = {
        ruleId: message.ruleId,
        severity: severityByLevel[message.severity ?? 2] ?? "error",
        message: message.message,
        line: message.line,
        column: message.column,
        index: message.index
      };

      return message.fix
        ? {
            ...base,
            fix: {
              range: [message.fix.range[0], message.fix.range[1]] as const,
              text: message.fix.text
            }
          }
        : base;
    })
    .sort((a, b) => a.index - b.index);
}

/** Convenience wrapper: lint a Markdown document. */
export function lintJapaneseMarkdown(
  markdown: string,
  ext: JapaneseLintMarkdownExtension = ".md"
): Promise<JapaneseLintMessage[]> {
  return lintJapanese(markdown, { format: "markdown", ext });
}

/** Convenience wrapper: lint a plain-text (`.txt`) document. */
export function lintJapanesePlainText(
  text: string
): Promise<JapaneseLintMessage[]> {
  return lintJapanese(text, { format: "text", ext: ".txt" });
}
