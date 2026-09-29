import { describe, expect, it } from "vitest";
import { enabledJapaneseLintRules } from "../../src/shared/japaneseLintRules";
import {
  japaneseLintRuleIds,
  lintJapanese,
  lintJapaneseMarkdown,
  lintJapanesePlainText,
  toJapaneseLintMessages,
  toJapaneseLintSeverity
} from "../../src/main/textlint/japaneseLintEngine";

// Rule sets used where a test needs a rule that is off by default (or a
// non-default threshold).
const withSentenceLength = enabledJapaneseLintRules({
  rules: { "sentence-length": { enabled: true } }
});
const withMaxTenThree = enabledJapaneseLintRules({
  rules: { "max-ten": { options: { max: 3 } } }
});

describe("japaneseLintEngine markdown (textlint-rule-preset-japanese PoC, #625)", () => {
  it("runs the preset's rules", () => {
    expect(japaneseLintRuleIds).toEqual(
      expect.arrayContaining(["max-ten", "no-doubled-joshi", "sentence-length"])
    );
    expect(japaneseLintRuleIds.length).toBeGreaterThanOrEqual(10);
  });

  it("returns no messages for clean Japanese text", async () => {
    expect(await lintJapaneseMarkdown("今日は天気がよいです。")).toEqual([]);
    expect(await lintJapaneseMarkdown("")).toEqual([]);
  });

  it("reports a doubled particle with rule id, severity and position", async () => {
    const messages = await lintJapaneseMarkdown(
      "私は彼は好きだ。\n\n猫が犬が好きだ。"
    );
    const joshi = messages.filter((m) => m.ruleId === "no-doubled-joshi");

    expect(joshi.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(message.severity).toBe("error");
      expect(message.line).toBeGreaterThanOrEqual(1);
      expect(message.column).toBeGreaterThanOrEqual(1);
      expect(message.index).toBeGreaterThanOrEqual(0);
    }
  });

  it("reports mixed である/ですます style", async () => {
    const messages = await lintJapaneseMarkdown(
      "これは本です。あれはペンである。"
    );

    expect(messages.map((m) => m.ruleId)).toContain("no-mix-dearu-desumasu");
  });

  it("reports too many commas (max-ten) with an index inside the text", async () => {
    const text = "私は、朝に、昼に、夜に、犬と散歩をした。";
    const messages = await lintJapaneseMarkdown(text, ".md", withMaxTenThree);
    const ten = messages.find((m) => m.ruleId === "max-ten");

    expect(ten).toBeDefined();
    expect(ten!.index).toBeLessThan(text.length);
  });

  it("reports over-long sentences", async () => {
    const messages = await lintJapaneseMarkdown(
      `${"あ".repeat(120)}。`,
      ".md",
      withSentenceLength
    );

    expect(messages.map((m) => m.ruleId)).toContain("sentence-length");
  });

  it("returns messages ordered by position", async () => {
    const messages = await lintJapaneseMarkdown(
      "これは本です。あれはペンである。\n\n私は彼は好きだ。"
    );
    const indexes = messages.map((m) => m.index);

    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });

  it("understands Markdown: code blocks and inline code are not linted as prose", async () => {
    const messages = await lintJapaneseMarkdown(
      "```\n私は彼は好きだ。あれはペンである。これは本です。\n```\n\n`私は彼は好きだ`\n"
    );

    expect(messages).toEqual([]);
  });

  it("uses 1-based line/column and reports the line of the problem in a multi-line document", async () => {
    const messages = await lintJapaneseMarkdown(
      "# 見出し\n\n正しい文です。\n\n" + "あ".repeat(120) + "。\n",
      ".md",
      withSentenceLength
    );
    const long = messages.find((m) => m.ruleId === "sentence-length");

    expect(long?.line).toBe(5);
    expect(long?.column).toBeGreaterThanOrEqual(1);
  });

  it("is repeatable (no state leaks between calls)", async () => {
    const text = "これは本です。あれはペンである。";

    expect(await lintJapaneseMarkdown(text)).toEqual(
      await lintJapaneseMarkdown(text)
    );
  });
});

describe("japaneseLintEngine plain text (#625)", () => {
  it("detects a doubled particle in plain text", async () => {
    const messages = await lintJapanesePlainText("私は彼は好きだ。");

    expect(messages.map((m) => m.ruleId)).toContain("no-doubled-joshi");
  });

  it("detects mixed styles and long sentences in plain text", async () => {
    const mixed = await lintJapanesePlainText(
      "これは本です。あれはペンである。"
    );
    const long = await lintJapanesePlainText(
      `${"あ".repeat(120)}。`,
      withSentenceLength
    );

    expect(mixed.map((m) => m.ruleId)).toContain("no-mix-dearu-desumasu");
    expect(long.map((m) => m.ruleId)).toContain("sentence-length");
  });

  it("returns valid line / column / index over multiple lines", async () => {
    const text = "正しい文です。\n\n" + "あ".repeat(120) + "。\n";
    const messages = await lintJapanesePlainText(text, withSentenceLength);
    const long = messages.find((m) => m.ruleId === "sentence-length");
    const indexes = messages.map((m) => m.index);

    expect(long).toBeDefined();
    expect(long!.line).toBe(3);
    expect(long!.column).toBeGreaterThanOrEqual(1);
    // The reported offset lies within the offending third line.
    expect(long!.index).toBeGreaterThanOrEqual(text.indexOf("あ"));
    expect(long!.index).toBeLessThan(text.length);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });

  it("does not treat Markdown syntax specially: a fenced block is linted as text", async () => {
    const source = "```\n私は彼は好きだ。\n```\n";

    expect(await lintJapaneseMarkdown(source)).toEqual([]);
    expect(
      (await lintJapanesePlainText(source)).map((m) => m.ruleId)
    ).toContain("no-doubled-joshi");
  });

  it("does not crash on empty / newline-only input in either format", async () => {
    for (const format of ["markdown", "text"] as const) {
      for (const source of ["", "\n", "\n\n\n", "\r\n"]) {
        expect(await lintJapanese(source, { format })).toEqual([]);
      }
    }
  });

  it("keeps no state between interleaved Markdown and plain-text calls", async () => {
    const text = "これは本です。あれはペンである。";
    const md1 = await lintJapanese(text, { format: "markdown" });
    const txt1 = await lintJapanese(text, { format: "text" });
    const md2 = await lintJapanese(text, { format: "markdown" });
    const txt2 = await lintJapanese(text, { format: "text" });

    expect(md2).toEqual(md1);
    expect(txt2).toEqual(txt1);
    expect(md1.length).toBeGreaterThan(0);
  });

  it("returns serializable plain objects (survives a JSON round trip)", async () => {
    const messages = await lintJapanesePlainText("私は彼は好きだ。");

    expect(JSON.parse(JSON.stringify(messages))).toEqual(messages);
  });
});

describe("japaneseLintEngine severity mapping (#625)", () => {
  // textlint: none=0, warning=1, error=2, info=3.
  it("maps textlint levels to the user-facing severity (info is 3, not 0)", () => {
    expect(toJapaneseLintSeverity(1)).toBe("warning");
    expect(toJapaneseLintSeverity(2)).toBe("error");
    expect(toJapaneseLintSeverity(3)).toBe("info");
  });

  it("treats none (0) as 'do not report'", () => {
    expect(toJapaneseLintSeverity(0)).toBeNull();
  });

  it("uses error for a missing level and for an unknown level", () => {
    expect(toJapaneseLintSeverity(undefined)).toBe("error");
    expect(toJapaneseLintSeverity(99)).toBe("error");
  });

  it("converts messages: drops none, keeps info/warning/error, orders by index", () => {
    const raw = (severity: number | undefined, index: number) => ({
      ruleId: "r",
      severity,
      message: "m",
      line: 1,
      column: index + 1,
      index
    });
    const messages = toJapaneseLintMessages([
      raw(3, 30),
      raw(0, 20),
      raw(1, 10),
      raw(2, 0)
    ]);

    expect(messages.map((m) => [m.index, m.severity])).toEqual([
      [0, "error"],
      [10, "warning"],
      [30, "info"]
    ]);
  });

  it("carries a fix through as a plain object", () => {
    const [message] = toJapaneseLintMessages([
      {
        ruleId: "r",
        severity: 2,
        message: "m",
        line: 1,
        column: 1,
        index: 0,
        fix: { range: [0, 1], text: "x" }
      }
    ]);

    expect(message?.fix).toEqual({ range: [0, 1], text: "x" });
  });
});

describe("japaneseLintEngine extensions (#625)", () => {
  const markdown =
    "# 見出し\n\n私は彼は好きだ。\n\n```\n私は彼は好きだ。\n```\n";

  it("treats .markdown exactly like .md", async () => {
    const asMd = await lintJapanese(markdown, { format: "markdown", ext: ".md" });
    const asMarkdown = await lintJapanese(markdown, {
      format: "markdown",
      ext: ".markdown"
    });

    expect(asMarkdown.length).toBeGreaterThan(0);
    expect(asMarkdown).toEqual(asMd);
    // The fenced block is still skipped under .markdown (Markdown parsing).
    expect(asMarkdown.every((m) => m.line === 3)).toBe(true);
  });

  it("lintJapaneseMarkdown accepts an optional .markdown extension", async () => {
    expect(await lintJapaneseMarkdown(markdown, ".markdown")).toEqual(
      await lintJapaneseMarkdown(markdown, ".md")
    );
    expect(await lintJapaneseMarkdown(markdown, ".markdown")).not.toEqual([]);
  });

  it("uses the format's default extension when ext is omitted", async () => {
    const omitted = await lintJapanese(markdown, { format: "markdown" });

    expect(omitted).toEqual(await lintJapaneseMarkdown(markdown));
    expect(omitted).toEqual(
      await lintJapanese(markdown, { format: "markdown", ext: ".md" })
    );

    const text = "私は彼は好きだ。";

    expect(await lintJapanese(text, { format: "text" })).toEqual(
      await lintJapanese(text, { format: "text", ext: ".txt" })
    );
  });

  it("constrains format / ext combinations by type", () => {
    // @ts-expect-error a text document cannot claim a Markdown extension
    lintJapanese("", { format: "text", ext: ".md" }).catch(() => undefined);
    // @ts-expect-error a Markdown document cannot claim the .txt extension
    lintJapanese("", { format: "markdown", ext: ".txt" }).catch(() => undefined);
  });
});
