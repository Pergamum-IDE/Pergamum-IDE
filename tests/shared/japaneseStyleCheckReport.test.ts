import { describe, expect, it } from "vitest";
import { t, type Translate } from "../../src/shared/i18n";
import type { JapaneseLintDiagnostic } from "../../src/shared/japaneseLint";
import {
  getJapaneseLintRuleDefinition,
  japaneseLintRuleIds,
  japaneseLintRuleResultLabelKey
} from "../../src/shared/japaneseLintRules";
import {
  REPORT_SNIPPET_RADIUS,
  buildJapaneseStyleCheckReport,
  buildSnippet,
  escapeMarkdownText,
  formatReportDateTime,
  markdownInlineCode
} from "../../src/shared/japaneseStyleCheckReport";

const ja: Translate = (key, values) => t("ja", key, values);
const en: Translate = (key, values) => t("en", key, values);
const executedAt = new Date(2026, 8, 30, 2, 31);

function finding(
  overrides: Partial<JapaneseLintDiagnostic> = {}
): JapaneseLintDiagnostic {
  return {
    ruleId: "no-doubled-joshi",
    severity: "warning",
    message: "助詞が連続しています。",
    line: 12,
    column: 8,
    index: 0,
    ...overrides
  };
}

function build(
  partial: Partial<Parameters<typeof buildJapaneseStyleCheckReport>[0]> = {}
): string {
  const messages = partial.messages ?? [finding()];

  return buildJapaneseStyleCheckReport({
    fileName: "道標.txt",
    executedAt,
    totalMessages: messages.length,
    returnedMessages: messages.length,
    truncated: false,
    sourceText: "私は彼は好きだ。",
    messages,
    translate: ja,
    numberLocale: "ja-JP",
    ...partial
  });
}

describe("report building blocks (#625 P2b)", () => {
  it("escapeMarkdownText neutralizes table and inline syntax", () => {
    expect(escapeMarkdownText("a|b")).toBe("a\\|b");
    expect(escapeMarkdownText("`x`*y*_z_")).toBe("\\`x\\`\\*y\\*\\_z\\_");
    expect(escapeMarkdownText("<b>&</b>")).toBe("&lt;b&gt;&&lt;/b&gt;");
    expect(escapeMarkdownText("a\nb\r\nc")).toBe("a b c");
    expect(escapeMarkdownText("# h [l](u)")).toBe("\\# h \\[l\\](u)");
  });

  it("markdownInlineCode survives backticks and edge spaces", () => {
    expect(markdownInlineCode("abc")).toBe("abc".replace(/^/, "`") + "`");
    expect(markdownInlineCode("a`b")).toBe("`` a`b ``");
    expect(markdownInlineCode("a``b")).toBe("``` a``b ```");
    expect(markdownInlineCode(" x ")).toBe("`  x  `");
    expect(markdownInlineCode("a\nb")).toBe("`a b`");
  });

  it("buildSnippet keeps a short window around the finding", () => {
    const text = `${"あ".repeat(50)}ここ${"い".repeat(50)}`;
    const snippet = buildSnippet(text, 50);

    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
    expect(snippet).toContain("ここ");
    expect(snippet.length).toBe(REPORT_SNIPPET_RADIUS * 2 + 2);
  });

  it("buildSnippet has no ellipsis at the text edges and clamps the index", () => {
    expect(buildSnippet("短い文。", 0)).toBe("短い文。");
    expect(buildSnippet("短い文。", 999)).toBe("短い文。");
    expect(buildSnippet("短い文。", -5)).toBe("短い文。");
    expect(buildSnippet("", 0)).toBe("");
  });

  it("buildSnippet shows line breaks as ↵ and drops control characters", () => {
    expect(buildSnippet("あ\nい\r\nう\tえ\u0007お", 3)).toBe("あ↵い↵う え お");
  });

  it("formats the date as local YYYY-MM-DD HH:mm", () => {
    expect(formatReportDateTime(new Date(2026, 0, 5, 3, 7))).toBe("2026-01-05 03:07");
  });
});

describe("short result labels (#625)", () => {
  const suggested: Record<string, string> = {
    "max-ten": "読点が多い文",
    "no-doubled-conjunctive-particle-ga": "「が」の連続",
    "no-doubled-conjunction": "同じ接続詞の連続",
    "no-double-negative-ja": "二重否定",
    "no-doubled-joshi": "助詞の重なり",
    "sentence-length": "長すぎる文",
    "no-dropping-the-ra": "ら抜き言葉",
    "no-mix-dearu-desumasu": "文体の混在",
    "no-nfd": "分離した濁点・半濁点",
    "no-invalid-control-character": "制御文字",
    "no-zero-width-spaces": "ゼロ幅スペース",
    "no-kangxi-radicals": "紛らわしい部首文字"
  };

  it("every rule has a short Japanese label that is not the Settings switch text", () => {
    expect(japaneseLintRuleIds).toHaveLength(Object.keys(suggested).length);

    for (const id of japaneseLintRuleIds) {
      const short = ja(japaneseLintRuleResultLabelKey(id) as never);
      const switchText = ja(getJapaneseLintRuleDefinition(id).labelKey as never);

      expect(short, id).toBe(suggested[id]);
      expect(short, id).not.toContain("をチェック");
      expect(switchText, id).toBe(`${suggested[id]}をチェック`);
    }
  });

  it("every rule has a short English label too", () => {
    for (const id of japaneseLintRuleIds) {
      const short = en(japaneseLintRuleResultLabelKey(id) as never);

      expect(short, id).not.toBe(japaneseLintRuleResultLabelKey(id));
      expect(short, id).not.toMatch(/^Check /);
    }
  });

  it("ids and stored keys are untouched", () => {
    expect(japaneseLintRuleResultLabelKey("no-doubled-joshi")).toBe(
      "japaneseLint.rule.noDoubledJoshi.resultLabel"
    );
    expect(getJapaneseLintRuleDefinition("no-doubled-joshi").labelKey).toBe(
      "japaneseLint.rule.noDoubledJoshi.label"
    );
  });
});

describe("Markdown report (#625 P2b)", () => {
  it("has the target table, counts and details, in Japanese", () => {
    const report = build({
      messages: [
        finding({ ruleId: "no-doubled-joshi", line: 12, column: 8, index: 2 }),
        finding({ ruleId: "max-ten", message: "読点が多すぎます。", line: 3, column: 1, index: 0 })
      ]
    });

    expect(report.startsWith("# 日本語表現チェック結果\n")).toBe(true);
    expect(report).toContain("## 対象");
    expect(report).toContain("| 項目 | 内容 |");
    expect(report).toContain("| ファイル | 道標.txt |");
    expect(report).toContain("| 実行日時 | 2026-09-30 02:31 |");
    expect(report).toContain("| 総指摘数 | 2 |");
    expect(report).toContain("| 表示対象の指摘数 | 2 |");
    expect(report).toContain("| 省略 | なし |");
    expect(report).toContain("## チェック項目別件数");
    expect(report).toContain("| 指摘項目 | 件数 |");
    expect(report).toContain("|---|---:|");
    expect(report).toContain("| 読点が多い文 | 1 |");
    expect(report).toContain("| 助詞の重なり | 1 |");
    expect(report).toContain("指摘のない項目: 10");
    expect(report).toContain("## 指摘詳細");
    expect(report).toContain("### 助詞の重なり\n");
    expect(report).toContain("### 読点が多い文\n");
    expect(report).not.toContain("をチェック");
    expect(report).toContain("#### 1. 12 行 8 列");
    expect(report).toContain("- ルール: `no-doubled-joshi`");
    expect(report).toContain("- メッセージ: 助詞が連続しています。");
    expect(report).toContain("- 周辺: `私は彼は好きだ。`");
    expect(report.endsWith("\n")).toBe(true);
  });

  it("lists rules in catalog order and numbers findings per rule", () => {
    const report = build({
      messages: [
        finding({ ruleId: "no-doubled-joshi", line: 1, column: 1 }),
        finding({ ruleId: "no-doubled-joshi", line: 2, column: 2 }),
        finding({ ruleId: "max-ten", line: 9, column: 9 })
      ]
    });

    expect(report.indexOf("### 読点が多い文\n")).toBeLessThan(
      report.indexOf("### 助詞の重なり\n")
    );
    expect(report).toContain("#### 1. 1 行 1 列");
    expect(report).toContain("#### 2. 2 行 2 列");
    expect(report).toContain("#### 1. 9 行 9 列");
  });

  it("a truncated report says so and explains the counts", () => {
    const report = build({
      totalMessages: 1101,
      returnedMessages: 1,
      truncated: true
    });

    expect(report).toContain("| 総指摘数 | 1,101 |");
    expect(report).toContain("| 省略 | あり |");
    expect(report).toContain("> 指摘が多いため、詳細は最初の 1,000 件に制限されています。");
    expect(report).toContain("> チェック項目別件数は、表示対象の指摘に基づきます。");
  });

  it("no note appears when nothing was cut", () => {
    expect(build()).not.toContain("> ");
  });

  it("a report with zero findings is still a complete document", () => {
    const report = build({ messages: [], totalMessages: 0, returnedMessages: 0 });

    expect(report).toContain("# 日本語表現チェック結果");
    expect(report).toContain("| 総指摘数 | 0 |");
    expect(report).toContain("指摘はありませんでした。");
    expect(report).not.toContain("## 指摘詳細");
    expect(report).not.toContain("## チェック項目別件数");
  });

  it("escapes so that the tables and lists do not break", () => {
    const report = build({
      fileName: "a|b`c*.md",
      sourceText: "x | y `z` *w* <t>",
      messages: [
        finding({ message: "a|b\nc *bold* <tag> `code`", index: 4 })
      ]
    });

    expect(report).toContain("| ファイル | a\\|b\\`c\\*.md |");
    // Every table row keeps the same number of unescaped pipes.
    for (const row of report.split("\n").filter((l) => /^\| .* \|$/.test(l))) {
      expect(row.replace(/\\\|/g, "").match(/\|/g)?.length, row).toBe(3);
    }
    expect(report).toContain("- メッセージ: a\\|b c \\*bold\\* &lt;tag&gt; \\`code\\`");
    // The snippet is a code span, so the raw markup is harmless there.
    expect(report).toMatch(/- 周辺: `.*`/);
    // The finding block stays a single line per bullet.
    expect(report.split("\n").filter((l) => l.startsWith("- 周辺")).length).toBe(1);
  });

  it("never embeds the whole text, only the window around each finding", () => {
    const secretTail = "この後ろは本文の末尾で保存されてはいけない。";
    const text = `${"あ".repeat(500)}${secretTail}`;
    const report = build({ sourceText: text, messages: [finding({ index: 10 })] });

    expect(report).not.toContain(secretTail);
    expect(report).not.toContain("あ".repeat(REPORT_SNIPPET_RADIUS * 3));
  });

  it("an unknown rule id is reported as itself", () => {
    const report = build({ messages: [finding({ ruleId: "some-future-rule" })] });

    expect(report).toContain("| some-future-rule | 1 |");
    expect(report).toContain("### some-future-rule");
  });

  it("English wording and number format", () => {
    const report = build({
      translate: en,
      numberLocale: "en-US",
      fileName: "novel.md",
      totalMessages: 1101,
      returnedMessages: 1,
      truncated: true
    });

    expect(report).toContain("# Japanese Style Check Results");
    expect(report).toContain("| File | novel.md |");
    expect(report).toContain("| Total findings | 1,101 |");
    expect(report).toContain("Line 12, column 8");
    expect(report).toContain("details are limited to the first 1,000");
    expect(report).not.toContain("Machine");
  });
});
