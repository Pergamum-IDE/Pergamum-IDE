import { TextlintKernel } from "@textlint/kernel";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lintJapanese } from "../../src/main/textlint/japaneseLintEngine";
import {
  enabledJapaneseLintRules,
  japaneseLintRuleIds,
  type JapaneseLintRuleId
} from "../../src/shared/japaneseLintRules";

async function ruleIdsFor(
  text: string,
  settings?: unknown,
  format: "markdown" | "text" = "text"
): Promise<string[]> {
  const rules = enabledJapaneseLintRules(settings);
  const messages =
    format === "markdown"
      ? await lintJapanese(text, { format, rules })
      : await lintJapanese(text, { format, rules });

  return messages.map((message) => message.ruleId);
}

function only(ruleId: JapaneseLintRuleId, options?: Record<string, number>) {
  return {
    rules: Object.fromEntries(
      japaneseLintRuleIds.map((id) => [
        id,
        id === ruleId
          ? { enabled: true, ...(options ? { options } : {}) }
          : { enabled: false }
      ])
    )
  };
}

// One text that trips each rule when it is the only rule enabled.
const samples: readonly (readonly [JapaneseLintRuleId, string])[] = [
  ["max-ten", "私は、朝に、昼に、夜に、犬と、猫と、鳥と散歩をした。"],
  ["no-doubled-joshi", "私は彼は好きだ。"],
  ["no-mix-dearu-desumasu", "これは本です。あれはペンである。"],
  ["no-nfd", "が"],
  ["no-zero-width-spaces", "あ​い。"],
  ["no-kangxi-radicals", "⼀と書く。"]
];

describe("japanese lint rule switches in the engine (#625)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not report a rule that is switched off", async () => {
    const text = "私は彼は好きだ。";

    expect(await ruleIdsFor(text)).toContain("no-doubled-joshi");
    expect(
      await ruleIdsFor(text, { rules: { "no-doubled-joshi": { enabled: false } } })
    ).not.toContain("no-doubled-joshi");
  });

  it("reports each sample only when its own rule is on", async () => {
    for (const [ruleId, text] of samples) {
      const withRule = await ruleIdsFor(text, only(ruleId), "text");

      expect(withRule, `${ruleId} on`).toContain(ruleId);

      const others = await ruleIdsFor(
        text,
        { rules: { [ruleId]: { enabled: false } } },
        "text"
      );

      expect(others, `${ruleId} off`).not.toContain(ruleId);
    }
  });

  it("never starts textlint when every rule is off, and returns an empty result", async () => {
    const lintText = vi.spyOn(TextlintKernel.prototype, "lintText");
    const allOff = {
      rules: Object.fromEntries(
        japaneseLintRuleIds.map((id) => [id, { enabled: false }])
      )
    };

    expect(await ruleIdsFor("私は彼は好きだ。あれは本である。", allOff)).toEqual(
      []
    );
    expect(
      await lintJapanese("私は彼は好きだ。", { format: "text", rules: [] })
    ).toEqual([]);
    expect(lintText).not.toHaveBeenCalled();
  });

  it("keeps sentence-length off by default, and reports it once switched on", async () => {
    const text = `${"あ".repeat(150)}。`;

    expect(await ruleIdsFor(text)).not.toContain("sentence-length");
    expect(
      await ruleIdsFor(text, { rules: { "sentence-length": { enabled: true } } })
    ).toContain("sentence-length");
  });

  it("changes what sentence-length detects when its threshold changes", async () => {
    const text = `${"あ".repeat(60)}。`;
    const at = (max: number) => ruleIdsFor(text, only("sentence-length", { max }));

    expect(await at(100)).not.toContain("sentence-length");
    expect(await at(40)).toContain("sentence-length");
    expect(await at(20)).toContain("sentence-length");
  });

  it("changes what max-ten detects when its threshold changes (default 5)", async () => {
    // 4 commas in one sentence.
    const text = "私は、朝に、昼に、夜に、犬と散歩をした。";
    const at = (max?: number) =>
      ruleIdsFor(text, only("max-ten", max === undefined ? undefined : { max }));

    expect(await at()).not.toContain("max-ten");
    expect(await at(5)).not.toContain("max-ten");
    expect(await at(3)).toContain("max-ten");
    expect(await at(1)).toContain("max-ten");
  });

  it("passes the user's threshold on top of the preset's own rule options", async () => {
    // no-doubled-joshi keeps the preset's min_interval while max-ten is tuned.
    const ids = await ruleIdsFor(
      "私は彼は好きだ。私は、朝に、昼に、夜に、犬と散歩をした。",
      { rules: { "max-ten": { options: { max: 3 } } } }
    );

    expect(ids).toContain("no-doubled-joshi");
    expect(ids).toContain("max-ten");
  });

  it("runs the catalog defaults when no rules are given", async () => {
    const messages = await lintJapanese(`${"あ".repeat(150)}。私は彼は好きだ。`, {
      format: "text"
    });
    const ids = messages.map((message) => message.ruleId);

    expect(ids).toContain("no-doubled-joshi");
    expect(ids).not.toContain("sentence-length");
  });

  it("works for Markdown as well as plain text", async () => {
    const text = `${"あ".repeat(150)}。`;

    expect(
      await ruleIdsFor(text, only("sentence-length"), "markdown")
    ).toContain("sentence-length");
    expect(await ruleIdsFor(text, undefined, "markdown")).not.toContain(
      "sentence-length"
    );
  });
});
