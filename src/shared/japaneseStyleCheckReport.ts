import type { Translate } from "./i18n";
import {
  JAPANESE_LINT_MAX_RESULT_COUNT,
  type JapaneseLintDiagnostic
} from "./japaneseLint";
import {
  japaneseLintRuleResultLabelKey,
  isJapaneseLintRuleId,
  japaneseLintRuleCatalog
} from "./japaneseLintRules";

/**
 * #625 P2b: the Markdown report of a 日本語表現チェック run. Pure: the caller
 * (Main Process) supplies the saved source text, the returned findings and a
 * translator for the UI language. The report holds only short snippets around
 * each finding, never the whole text. It is written by the user's explicit
 * "save" and is never logged.
 */

/** Characters kept on each side of a finding. */
export const REPORT_SNIPPET_RADIUS = 15;

/** What the report is about. No path: a glossary Description has none. */
export interface JapaneseStyleCheckReportTarget {
  readonly kind: "projectFile" | "glossaryDescription";
  /** A file name, or a glossary Description's entry name - shown as is. */
  readonly displayName: string;
  readonly format: "markdown" | "text";
}

export interface JapaneseStyleCheckReportInput {
  readonly target: JapaneseStyleCheckReportTarget;
  readonly executedAt: Date;
  readonly totalMessages: number;
  readonly returnedMessages: number;
  readonly truncated: boolean;
  /** The saved text the findings' `index` values refer to. */
  readonly sourceText: string;
  readonly messages: readonly JapaneseLintDiagnostic[];
  readonly translate: Translate;
  /** Locale for digit grouping, e.g. "ja-JP". */
  readonly numberLocale?: string;
}

/** Escapes Markdown inline syntax and table-breaking characters. */
export function escapeMarkdownText(text: string): string {
  return text
    .replace(/\r\n?|\n/g, " ")
    .replace(/[\\`*_{}[\]<>|#~]/g, (character) =>
      character === "<"
        ? "&lt;"
        : character === ">"
          ? "&gt;"
          : `\\${character}`
    );
}

/** An inline code span that survives any backticks in `text`. */
export function markdownInlineCode(text: string): string {
  const flat = text.replace(/\r\n?|\n/g, " ");
  const longestRun = Math.max(
    0,
    ...(flat.match(/`+/g) ?? []).map((run) => run.length)
  );
  const fence = "`".repeat(longestRun + 1);
  const padded =
    longestRun > 0 || flat.startsWith(" ") || flat.endsWith(" ")
      ? ` ${flat} `
      : flat;

  return `${fence}${padded}${fence}`;
}

/**
 * A few characters around `index`, on one line, with ellipses where the text
 * was cut. Line breaks show as "↵".
 */
export function buildSnippet(
  sourceText: string,
  index: number,
  radius: number = REPORT_SNIPPET_RADIUS
): string {
  const safeIndex = Math.min(Math.max(0, index), sourceText.length);
  const start = Math.max(0, safeIndex - radius);
  const end = Math.min(sourceText.length, safeIndex + radius);
  const body = sourceText
    .slice(start, end)
    .replace(/\r\n?|\n/g, "↵")
    .replace(/[\t\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ");

  return `${start > 0 ? "…" : ""}${body}${end < sourceText.length ? "…" : ""}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatReportDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function targetRows(
  target: JapaneseStyleCheckReportTarget,
  translate: Translate
): string[] {
  const name = escapeMarkdownText(target.displayName);

  // A project file keeps the long-standing single "ファイル" row.
  if (target.kind === "projectFile") {
    return [`| ${translate("japaneseStyleReport.file")} | ${name} |`];
  }

  return [
    `| ${translate("japaneseStyleReport.targetName")} | ${name} |`,
    `| ${translate("japaneseStyleReport.type")} | ${translate("japaneseStyleReport.type.glossaryDescription")} |`,
    `| ${translate("japaneseStyleReport.format")} | ${target.format === "markdown" ? "Markdown" : "Text"} |`
  ];
}

export function buildJapaneseStyleCheckReport(
  input: JapaneseStyleCheckReportInput
): string {
  const { translate } = input;
  const formatNumber = (value: number): string =>
    new Intl.NumberFormat(input.numberLocale).format(value);
  const ruleLabel = (ruleId: string): string => {
    if (isJapaneseLintRuleId(ruleId)) {
      return translate(japaneseLintRuleResultLabelKey(ruleId) as never);
    }

    return ruleId;
  };

  // Group by rule: catalog order first, unknown ids after.
  const groups = new Map<string, JapaneseLintDiagnostic[]>();

  for (const message of input.messages) {
    const list = groups.get(message.ruleId) ?? [];

    list.push(message);
    groups.set(message.ruleId, list);
  }

  const catalogIds: readonly string[] = japaneseLintRuleCatalog.map(
    (rule) => rule.id
  );
  const orderedRuleIds = [
    ...catalogIds.filter((id) => groups.has(id)),
    ...[...groups.keys()].filter((id) => !catalogIds.includes(id))
  ];
  const lines: string[] = [];

  lines.push(`# ${translate("japaneseStyleReport.title")}`, "");
  lines.push(`## ${translate("japaneseStyleReport.target")}`, "");
  lines.push(
    `| ${translate("japaneseStyleReport.table.item")} | ${translate("japaneseStyleReport.table.content")} |`,
    "|---|---|",
    ...targetRows(input.target, translate),
    `| ${translate("japaneseStyleReport.executedAt")} | ${formatReportDateTime(input.executedAt)} |`,
    `| ${translate("japaneseStyleReport.total")} | ${formatNumber(input.totalMessages)} |`,
    `| ${translate("japaneseStyleReport.returned")} | ${formatNumber(input.returnedMessages)} |`,
    `| ${translate("japaneseStyleReport.truncated")} | ${translate(
      input.truncated
        ? "japaneseStyleReport.truncated.yes"
        : "japaneseStyleReport.truncated.no"
    )} |`,
    ""
  );

  if (input.truncated) {
    lines.push(
      `> ${translate("japaneseStyleReport.truncatedNote", {
        max: formatNumber(JAPANESE_LINT_MAX_RESULT_COUNT)
      })}`,
      `> ${translate("japaneseStyleReport.truncatedCountNote")}`,
      ""
    );
  }

  if (orderedRuleIds.length === 0) {
    lines.push(translate("japaneseStyleReport.none"), "");

    return `${lines.join("\n")}\n`;
  }

  lines.push(`## ${translate("japaneseStyleReport.counts")}`, "");
  lines.push(
    `| ${translate("japaneseStyleReport.counts.rule")} | ${translate("japaneseStyleReport.counts.count")} |`,
    "|---|---:|"
  );
  for (const ruleId of orderedRuleIds) {
    lines.push(
      `| ${escapeMarkdownText(ruleLabel(ruleId))} | ${formatNumber(groups.get(ruleId)?.length ?? 0)} |`
    );
  }
  lines.push("");

  const zeroRules = japaneseLintRuleCatalog.length - orderedRuleIds.filter(
    (id) => catalogIds.includes(id)
  ).length;

  if (zeroRules > 0) {
    lines.push(
      translate("japaneseStyleReport.zeroRules", {
        count: formatNumber(zeroRules)
      }),
      ""
    );
  }

  lines.push(`## ${translate("japaneseStyleReport.details")}`, "");
  for (const ruleId of orderedRuleIds) {
    lines.push(`### ${escapeMarkdownText(ruleLabel(ruleId))}`, "");

    (groups.get(ruleId) ?? []).forEach((message, position) => {
      lines.push(
        `#### ${position + 1}. ${translate("japaneseStyleReport.position", {
          line: formatNumber(message.line),
          column: formatNumber(message.column)
        })}`,
        "",
        `- ${translate("japaneseStyleReport.rule")}: ${markdownInlineCode(message.ruleId)}`,
        `- ${translate("japaneseStyleReport.message")}: ${escapeMarkdownText(message.message)}`,
        `- ${translate("japaneseStyleReport.context")}: ${markdownInlineCode(
          buildSnippet(input.sourceText, message.index)
        )}`,
        ""
      );
    });
  }

  return `${lines.join("\n")}\n`;
}
