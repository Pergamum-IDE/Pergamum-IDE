import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createJapaneseLintHost,
  type JapaneseLintHost,
  type JapaneseLintWorkerProgress
} from "../../../src/main/linterWorker/japaneseLintHost";
import { lintJapanese } from "../../../src/main/textlint/japaneseLintEngine";
import {
  JAPANESE_LINT_MAX_RESULT_COUNT,
  type JapaneseLintDiagnostic
} from "../../../src/shared/japaneseLint";
import { buildJapaneseLintWorkerConfig } from "../../../src/shared/japaneseLintWorkerProtocol";
import {
  createFakeWorkerWorld,
  type FakeLint,
  type FakeWorkerOptions
} from "./fakeWorkerWorld";

const realDictionary = path.join(process.cwd(), "node_modules", "kuromoji", "dict");

/** The real engine, exactly as the Worker entry wires it. */
const realLint: FakeLint = (source, { format, ext, rules }) =>
  format === "markdown"
    ? lintJapanese(source, {
        format: "markdown",
        ext: ext === ".markdown" ? ".markdown" : ".md",
        rules: rules as never
      })
    : lintJapanese(source, { format: "text", ext: ".txt", rules: rules as never });

function diagnostics(count: number): JapaneseLintDiagnostic[] {
  return Array.from({ length: count }, (_, index) => ({
    ruleId: "no-doubled-joshi",
    severity: "error" as const,
    message: "m",
    line: 1,
    column: index + 1,
    index
  }));
}

/** A lint that stays busy until the test lets it go (a Worker mid-textlint). */
function gate() {
  let release!: (messages: readonly JapaneseLintDiagnostic[]) => void;
  const opened = new Promise<readonly JapaneseLintDiagnostic[]>((resolve) => {
    release = resolve;
  });

  return { opened, release };
}

interface Logged {
  level: string;
  event: string;
  details?: Record<string, unknown>;
}

const hosts: JapaneseLintHost[] = [];

afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.dispose()));
});

function setup(
  worldOptions: FakeWorkerOptions = {},
  hostOptions: {
    settings?: unknown;
    timeouts?: Partial<{
      startMs: number;
      requestMs: number;
      shutdownMs: number;
      jobMs: number;
      cancelGraceMs: number;
    }>;
  } = {}
) {
  const world = createFakeWorkerWorld(worldOptions);
  const events: Logged[] = [];
  let ids = 0;
  const host = createJapaneseLintHost({
    ...world.deps,
    getSettings: () => hostOptions.settings,
    logger: {
      log: (input: Logged) => {
        events.push(input);
      }
    } as never,
    newRequestId: () => `req-${++ids}`,
    newJobId: () => `job-${++ids}`,
    timeouts: {
      startMs: 400,
      requestMs: 400,
      shutdownMs: 400,
      jobMs: 5000,
      cancelGraceMs: 80,
      ...hostOptions.timeouts
    }
  });

  hosts.push(host);

  return { world, host, events };
}

const md = { format: "markdown", ext: ".md" } as const;
const txt = { format: "text", ext: ".txt" } as const;

describe("Host.lintDocument with the real textlint engine (#625 P1b)", () => {
  const real = { lint: realLint, realDictionary };

  it("lints a small Markdown source (.md)", async () => {
    const { host } = setup(real);

    await host.start();

    const result = await host.lintDocument({ source: "私は彼は好きだ。", ...md });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messages.map((m) => m.ruleId)).toContain("no-doubled-joshi");
      expect(result.sourceChars).toBe(8);
      expect(result.sourceLines).toBe(1);
      expect(result.maxMessages).toBe(JAPANESE_LINT_MAX_RESULT_COUNT);
      expect(result.truncated).toBe(false);
      expect(result.totalMessages).toBe(result.messages.length);
      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("lints .markdown and plain text (.txt) too, and treats them as their formats", async () => {
    const { host } = setup(real);

    await host.start();

    const source = "```\n私は彼は好きだ。\n```\n";
    const asMarkdown = await host.lintDocument({
      source,
      format: "markdown",
      ext: ".markdown"
    });
    const asText = await host.lintDocument({ source, ...txt });

    // A fenced block is not prose in Markdown, but is plain text in a .txt.
    expect(asMarkdown.ok && asMarkdown.messages).toEqual([]);
    expect(
      asText.ok && asText.messages.map((m) => m.ruleId)
    ).toContain("no-doubled-joshi");
  });

  it("returns messages in position order with 1-based line/column", async () => {
    const { host } = setup(real);

    await host.start();

    const result = await host.lintDocument({
      source: "これは本です。あれはペンである。\n\n私は彼は好きだ。",
      ...txt
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const indexes = result.messages.map((m) => m.index);

      expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
      expect(result.messages.every((m) => m.line >= 1 && m.column >= 1)).toBe(
        true
      );
      expect(result.sourceLines).toBe(3);
    }
  });

  it("applies the rule settings: sentence-length is OFF by default and ON when enabled", async () => {
    const source = `${"あ".repeat(150)}。`;
    const off = setup(real);

    await off.host.start();

    const defaultResult = await off.host.lintDocument({ source, ...txt });

    expect(
      defaultResult.ok && defaultResult.messages.map((m) => m.ruleId)
    ).not.toContain("sentence-length");

    const on = setup(real, {
      settings: { rules: { "sentence-length": { enabled: true } } }
    });

    await on.host.start();

    const enabledResult = await on.host.lintDocument({ source, ...txt });

    expect(
      enabledResult.ok && enabledResult.messages.map((m) => m.ruleId)
    ).toContain("sentence-length");
  });

  it("applies numeric options: the max-ten threshold changes what is found", async () => {
    const source = "私は、朝に、昼に、夜に、犬と散歩をした。";
    const fiveCommas = setup(real);

    await fiveCommas.host.start();

    const atDefault = await fiveCommas.host.lintDocument({ source, ...txt });

    expect(atDefault.ok && atDefault.messages.map((m) => m.ruleId)).not.toContain(
      "max-ten"
    );

    const three = setup(real, {
      settings: { rules: { "max-ten": { options: { max: 3 } } } }
    });

    await three.host.start();

    const result = await three.host.lintDocument({ source, ...txt });

    expect(result.ok && result.messages.map((m) => m.ruleId)).toContain(
      "max-ten"
    );
  });

  it("with every rule off, returns an empty result without running textlint", async () => {
    let lintCalls = 0;
    const allOff = {
      rules: Object.fromEntries(
        buildJapaneseLintWorkerConfig(undefined).enabledRuleIds.map((id) => [
          id,
          { enabled: false }
        ])
      )
    };
    const { host } = setup(
      {
        lint: async () => {
          lintCalls += 1;

          return diagnostics(3);
        }
      },
      { settings: allOff }
    );

    await host.start();

    const result = await host.lintDocument({ source: "私は彼は好きだ。", ...txt });

    expect(result.ok && result.messages).toEqual([]);
    expect(result.ok && result.totalMessages).toBe(0);
    expect(lintCalls).toBe(0);
  });

  it("a 60,000-character source is linted in the Worker (over the instant-check limit)", async () => {
    const { host } = setup(real, { timeouts: { jobMs: 120_000 } });

    await host.start();

    // Paragraphs of ten sentences: realistic prose (one giant paragraph is
    // textlint's worst case).
    const source = ("これは短い文です。".repeat(10) + "\n\n").repeat(660);
    const result = await host.lintDocument({ source, ...txt });

    expect(source.length).toBeGreaterThan(50_000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sourceChars).toBe(source.length);
    }
  }, 60_000);
});

describe("Host.lintDocument: results, ids and progress (#625 P1b)", () => {
  it("caps the result at 1,000 messages and reports total / max / truncated", async () => {
    const { host } = setup({ lint: async () => diagnostics(1500) });

    await host.start();

    const result = await host.lintDocument({ source: "あ", ...txt });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messages).toHaveLength(JAPANESE_LINT_MAX_RESULT_COUNT);
      expect(result.totalMessages).toBe(1500);
      expect(result.maxMessages).toBe(JAPANESE_LINT_MAX_RESULT_COUNT);
      expect(result.truncated).toBe(true);
      // The earliest messages are the ones kept.
      expect(result.messages[0]?.index).toBe(0);
      expect(result.messages.at(-1)?.index).toBe(JAPANESE_LINT_MAX_RESULT_COUNT - 1);
    }
  });

  it("exactly 1,000 messages is not truncated", async () => {
    const { host } = setup({ lint: async () => diagnostics(1000) });

    await host.start();

    const result = await host.lintDocument({ source: "あ", ...txt });

    expect(result.ok && result.truncated).toBe(false);
    expect(result.ok && result.totalMessages).toBe(1000);
  });

  it("sends the request with its requestId and jobId, and matches the result to them", async () => {
    const { host, world } = setup();

    await host.start();

    const result = await host.lintDocument({
      source: "あいう\nえお",
      jobId: "my-job",
      ...md
    });

    const request = world.children[0]?.received.at(-1) as Record<string, unknown>;

    expect(request).toMatchObject({
      type: "lintDocument",
      jobId: "my-job",
      source: "あいう\nえお",
      format: "markdown",
      ext: ".md"
    });
    expect(typeof request.requestId).toBe("string");

    const answered = world.children[0]?.sent.find(
      (response) => response.type === "lint-result"
    );

    expect(answered).toMatchObject({
      type: "lint-result",
      requestId: request.requestId,
      jobId: "my-job"
    });
    expect(result.ok && result.sourceLines).toBe(2);
  });

  it("keeps concurrent jobs apart by jobId (each caller gets its own result)", async () => {
    const { host } = setup({
      lint: async (source) =>
        source === "A" ? diagnostics(1) : source === "B" ? diagnostics(2) : []
    });

    await host.start();

    const [a, b, c] = await Promise.all([
      host.lintDocument({ source: "A", ...txt }),
      host.lintDocument({ source: "B", ...txt }),
      host.lintDocument({ source: "C", ...txt })
    ]);

    expect(a.ok && a.messages).toHaveLength(1);
    expect(b.ok && b.messages).toHaveLength(2);
    expect(c.ok && c.messages).toHaveLength(0);
  });

  it("emits coarse progress: queued, dictionary-check, lint-running, completed(total)", async () => {
    const { host } = setup();
    const seen: JapaneseLintWorkerProgress[] = [];

    await host.start();
    await host.lintDocument({
      source: "あいうえお",
      jobId: "p1",
      ...txt,
      onProgress: (progress) => seen.push(progress)
    });

    expect(seen.map((p) => p.stage)).toEqual([
      "queued",
      "dictionary-check",
      "lint-running",
      "completed"
    ]);
    expect(seen.map((p) => p.processedChars)).toEqual([0, 0, 0, 5]);
    expect(seen.every((p) => p.totalChars === 5 && p.jobId === "p1")).toBe(true);
  });

  it("a throwing progress listener does not break the job", async () => {
    const { host } = setup();

    await host.start();

    const result = await host.lintDocument({
      source: "あ",
      ...txt,
      onProgress: () => {
        throw new Error("listener bug");
      }
    });

    expect(result.ok).toBe(true);
  });

  it("returns an empty successful result for an empty source", async () => {
    const { host } = setup({ lint: realLint, realDictionary });

    await host.start();

    const result = await host.lintDocument({ source: "", ...md });

    expect(result.ok && result.messages).toEqual([]);
    expect(result.ok && result.sourceLines).toBe(1);
  });
});

describe("Host.lintDocument: failures never throw (#625 P1b)", () => {
  it("fails safely when the Host is not running (idle / stopped / failed / disposed)", async () => {
    const idle = setup();

    await expect(
      idle.host.lintDocument({ source: "あ", ...txt })
    ).resolves.toMatchObject({ ok: false, reason: "worker-failed" });

    const stopped = setup();

    await stopped.host.start();
    await stopped.host.shutdown();
    await expect(
      stopped.host.lintDocument({ source: "あ", ...txt })
    ).resolves.toMatchObject({ ok: false, reason: "worker-failed" });

    const failed = setup();

    await failed.host.start();
    failed.world.children[0]!.crash(1);
    await expect(
      failed.host.lintDocument({ source: "あ", ...txt })
    ).resolves.toMatchObject({ ok: false, reason: "worker-failed" });

    const disposed = setup();

    await disposed.host.start();
    await disposed.host.dispose();
    await expect(
      disposed.host.lintDocument({ source: "あ", ...txt })
    ).resolves.toMatchObject({ ok: false, reason: "worker-failed" });
  });

  it("fails a lint in flight when the Worker exits, without an unhandled rejection", async () => {
    const stuck = gate();
    const { host, world } = setup({ lint: () => stuck.opened });
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };

    process.on("unhandledRejection", onUnhandled);

    try {
      await host.start();

      const running = host.lintDocument({ source: "あ", ...txt });

      await new Promise((resolve) => setTimeout(resolve, 20));
      world.children[0]!.crash(-1073741819);

      await expect(running).resolves.toMatchObject({
        ok: false,
        reason: "worker-failed"
      });
      expect(host.getState()).toBe("failed");
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("reports dictionary-missing (and never runs textlint) when the dictionary disappears", async () => {
    let present = true;
    let lintCalls = 0;
    const { host } = setup({
      dictionaryExists: () => present,
      lint: async () => {
        lintCalls += 1;

        return [];
      }
    });

    await host.start();
    present = false;

    await expect(
      host.lintDocument({ source: "あ", ...txt })
    ).resolves.toMatchObject({ ok: false, reason: "dictionary-missing" });
    expect(lintCalls).toBe(0);

    // The Worker is still healthy and recovers when the dictionary returns.
    present = true;
    await expect(
      host.lintDocument({ source: "あ", ...txt })
    ).resolves.toMatchObject({ ok: true });
  });

  it("reports lint-failed when textlint throws, and the Worker stays usable", async () => {
    let calls = 0;
    const { host } = setup({
      lint: async () => {
        calls += 1;

        if (calls === 1) {
          throw new Error("boom");
        }

        return [];
      }
    });

    await host.start();

    await expect(
      host.lintDocument({ source: "あ", ...txt })
    ).resolves.toMatchObject({ ok: false, reason: "lint-failed" });
    expect(host.getState()).toBe("ready");
    await expect(
      host.lintDocument({ source: "あ", ...txt })
    ).resolves.toMatchObject({ ok: true });
  });

  it("rejects a malformed request at the Worker as worker-failed", async () => {
    const { host } = setup();

    await host.start();

    // A format / extension pair the Worker refuses (the Host does not pre-empt it).
    await expect(
      host.lintDocument({ source: "あ", format: "text", ext: ".md" })
    ).resolves.toMatchObject({ ok: false, reason: "worker-failed" });
    expect(host.getState()).toBe("ready");
  });

  it("refuses a duplicate jobId while the first is still running", async () => {
    const stuck = gate();
    const { host } = setup({ lint: () => stuck.opened });

    await host.start();

    const first = host.lintDocument({ source: "あ", jobId: "same", ...txt });
    const second = await host.lintDocument({
      source: "あ",
      jobId: "same",
      ...txt
    });

    expect(second).toMatchObject({ ok: false, reason: "worker-failed" });
    stuck.release([]);
    await expect(first).resolves.toMatchObject({ ok: true });
  });

  it("ends a job that never finishes (job timeout) and can start again", async () => {
    const stuck = gate();
    const { host, world } = setup(
      { lint: () => stuck.opened },
      { timeouts: { jobMs: 80, shutdownMs: 200 } }
    );

    await host.start();

    const result = await host.lintDocument({ source: "あ", ...txt });

    expect(result).toMatchObject({ ok: false, reason: "worker-failed" });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(world.children[0]?.killed).toBe(true);
    expect(host.getState()).toBe("stopped");
    await host.start();
    expect(host.getState()).toBe("ready");
  });
});

describe("Host.updateConfig (#625 P1b)", () => {
  it("applies to the NEXT lintDocument without a restart", async () => {
    const seenRules: string[][] = [];
    const { host, world } = setup({
      lint: async (_source, { rules }) => {
        seenRules.push(rules.map((rule) => rule.id));

        return [];
      }
    });

    await host.start();
    await host.lintDocument({ source: "あ", ...txt });

    await host.updateConfig(
      buildJapaneseLintWorkerConfig({
        rules: {
          "sentence-length": { enabled: true, options: { max: 40 } },
          "no-nfd": { enabled: false }
        }
      })
    );
    await host.lintDocument({ source: "あ", ...txt });

    expect(world.children).toHaveLength(1);
    expect(seenRules[0]).toContain("no-nfd");
    expect(seenRules[0]).not.toContain("sentence-length");
    expect(seenRules[1]).not.toContain("no-nfd");
    expect(seenRules[1]).toContain("sentence-length");
  });

  it("hands textlint the new numeric options", async () => {
    const seen: Record<string, number>[] = [];
    const { host } = setup({
      lint: async (_source, { rules }) => {
        seen.push(rules.find((rule) => rule.id === "max-ten")?.options ?? {});

        return [];
      }
    });

    await host.start();
    await host.updateConfig(
      buildJapaneseLintWorkerConfig({ rules: { "max-ten": { options: { max: 2 } } } })
    );
    await host.lintDocument({ source: "あ", ...txt });

    expect(seen).toEqual([{ max: 2 }]);
  });

  it("does not change the rules of a job that already started", async () => {
    const stuck = gate();
    const seenRules: string[][] = [];
    const { host } = setup({
      lint: async (_source, { rules }) => {
        seenRules.push(rules.map((rule) => rule.id));

        return stuck.opened;
      }
    });

    await host.start();

    const running = host.lintDocument({ source: "あ", ...txt });

    await new Promise((resolve) => setTimeout(resolve, 20));
    await host.updateConfig(
      buildJapaneseLintWorkerConfig({ rules: { "no-nfd": { enabled: false } } })
    );
    stuck.release([]);
    await running;

    expect(seenRules[0]).toContain("no-nfd");
  });

  it("is refused when the Worker is not running, and for a malformed config", async () => {
    const { host } = setup();

    await expect(
      host.updateConfig(buildJapaneseLintWorkerConfig(undefined))
    ).rejects.toMatchObject({ kind: "not-running" });

    await host.start();
    await expect(
      host.updateConfig({ nonsense: true } as never)
    ).rejects.toMatchObject({ kind: "invalid-argument" });
  });
});

describe("Host.cancel (#625 P1b)", () => {
  it("cancels a job that has not started: the caller gets canceled, the other job still finishes", async () => {
    const stuck = gate();
    const { host } = setup({
      lint: (source) => (source === "first" ? stuck.opened : Promise.resolve([]))
    });

    await host.start();

    const first = host.lintDocument({ source: "first", jobId: "a", ...txt });
    const second = host.lintDocument({ source: "second", jobId: "b", ...txt });

    await new Promise((resolve) => setTimeout(resolve, 20));
    await host.cancel("b");

    await expect(second).resolves.toMatchObject({ ok: false, reason: "canceled" });
    stuck.release(diagnostics(1));
    await expect(first).resolves.toMatchObject({ ok: true });
    expect(host.getState()).toBe("ready");
  });

  it("cancels a running job: answers canceled at once and never delivers its result", async () => {
    const stuck = gate();
    const { host, world } = setup({ lint: () => stuck.opened });
    const progress: string[] = [];

    await host.start();

    const running = host.lintDocument({
      source: "あ",
      jobId: "run",
      ...txt,
      onProgress: (p) => progress.push(p.stage)
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    const beforeCancel = progress.length;
    const canceling = host.cancel("run");

    await expect(running).resolves.toMatchObject({ ok: false, reason: "canceled" });

    // A stale result that arrives afterwards is not adopted (nor any progress).
    world.children[0]?.sendRaw({
      type: "lint-result",
      requestId: "req-x",
      jobId: "run",
      result: {
        ok: true,
        messages: [],
        totalMessages: 0,
        maxMessages: 1000,
        truncated: false,
        elapsedMs: 1,
        sourceChars: 1,
        sourceLines: 1
      }
    });
    world.children[0]?.sendRaw({
      type: "progress",
      jobId: "run",
      stage: "completed",
      processedChars: 1,
      totalChars: 1
    });
    await canceling;

    expect(progress.length).toBe(beforeCancel);
  });

  it("cancel does not hang when textlint is busy: the Worker is ended after the grace period", async () => {
    const stuck = gate();
    let calls = 0;
    const { host, world } = setup(
      {
        // Only the first job is stuck; the restarted Worker lints normally.
        lint: () => (++calls === 1 ? stuck.opened : Promise.resolve([]))
      },
      { timeouts: { cancelGraceMs: 60, shutdownMs: 300 } }
    );

    await host.start();

    const running = host.lintDocument({ source: "あ", jobId: "busy", ...txt });

    await new Promise((resolve) => setTimeout(resolve, 20));

    const startedAt = Date.now();

    await host.cancel("busy");

    expect(Date.now() - startedAt).toBeLessThan(1500);
    await expect(running).resolves.toMatchObject({ ok: false, reason: "canceled" });
    expect(world.children[0]?.killed).toBe(true);
    // Ending it on purpose is not a crash, and it can be started again.
    expect(host.getState()).toBe("stopped");
    await host.start();
    expect(host.getState()).toBe("ready");
    await expect(
      host.lintDocument({ source: "あ", ...txt })
    ).resolves.toMatchObject({ ok: true });
  });

  it("cancel resolves promptly when the Worker acknowledges (no process is ended)", async () => {
    const { host, world } = setup();

    await host.start();
    // An unknown job on a healthy Worker: nothing to do, nothing killed.
    await host.cancel("no-such-job");

    expect(world.children[0]?.killed).toBe(false);
    expect(host.getState()).toBe("ready");
  });

  it("cancel of an unknown / finished job and a double cancel do not crash", async () => {
    const stuck = gate();
    const { host } = setup(
      { lint: () => stuck.opened },
      { timeouts: { cancelGraceMs: 40, shutdownMs: 300 } }
    );

    await host.start();
    await expect(host.cancel("nope")).resolves.toBeUndefined();

    const running = host.lintDocument({ source: "あ", jobId: "j", ...txt });

    await new Promise((resolve) => setTimeout(resolve, 20));
    await expect(
      Promise.all([host.cancel("j"), host.cancel("j")])
    ).resolves.toEqual([undefined, undefined]);
    await running;
    await expect(host.cancel("j")).resolves.toBeUndefined();
  });

  it("cancel when the Worker is not running is a no-op", async () => {
    const { host } = setup();

    await expect(host.cancel("anything")).resolves.toBeUndefined();
  });
});
