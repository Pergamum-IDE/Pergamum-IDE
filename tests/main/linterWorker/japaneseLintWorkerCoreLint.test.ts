import { describe, expect, it, vi } from "vitest";
import {
  createJapaneseLintWorkerCore,
  type JapaneseLintWorkerLintOptions
} from "../../../src/main/linterWorker/japaneseLintWorkerCore";
import type { JapaneseLintDiagnostic } from "../../../src/shared/japaneseLint";
import {
  JAPANESE_LINT_MAX_RESULT_COUNT
} from "../../../src/shared/japaneseLint";
import {
  buildJapaneseLintWorkerConfig,
  type JapaneseLintWorkerResponse
} from "../../../src/shared/japaneseLintWorkerProtocol";

const diagnostic = (index: number): JapaneseLintDiagnostic => ({
  ruleId: "no-doubled-joshi",
  severity: "error",
  message: "m",
  line: 1,
  column: index + 1,
  index
});

function makeCore(
  options: {
    lint?: (
      source: string,
      lintOptions: JapaneseLintWorkerLintOptions
    ) => Promise<readonly JapaneseLintDiagnostic[]>;
    dictionaryExists?: () => boolean;
  } = {}
) {
  const sent: JapaneseLintWorkerResponse[] = [];
  const exit = vi.fn();
  const setDictionaryPath = vi.fn();
  const lint = vi.fn(options.lint ?? (async () => []));
  const core = createJapaneseLintWorkerCore({
    send: (response) => sent.push(response),
    exit,
    dictionaryExists: async () => options.dictionaryExists?.() ?? true,
    setDictionaryPath,
    lint
  });

  return { core, sent, exit, setDictionaryPath, lint };
}

const init = (config = buildJapaneseLintWorkerConfig(undefined)) => ({
  type: "init",
  requestId: "init-1",
  dictionaryPath: "C:\\dict",
  config
});

const lintRequest = (jobId: string, source = "あ", requestId = `r-${jobId}`) => ({
  type: "lintDocument",
  requestId,
  jobId,
  source,
  format: "text",
  ext: ".txt"
});

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 10));

function gate() {
  let release!: (messages: readonly JapaneseLintDiagnostic[]) => void;
  const opened = new Promise<readonly JapaneseLintDiagnostic[]>((resolve) => {
    release = resolve;
  });

  return { opened, release };
}

describe("worker core: init hands the dictionary path to the engine (#625 P1b)", () => {
  it("points the engine at the Host-resolved path, only after it exists", async () => {
    const ok = makeCore();

    await ok.core.handleMessage(init());
    expect(ok.setDictionaryPath).toHaveBeenCalledExactlyOnceWith("C:\\dict");

    const missing = makeCore({ dictionaryExists: () => false });

    await missing.core.handleMessage(init());
    expect(missing.setDictionaryPath).not.toHaveBeenCalled();
  });
});

describe("worker core: lintDocument (#625 P1b)", () => {
  it("runs textlint with the rule snapshot and answers lint-result with the ids", async () => {
    const { core, sent, lint } = makeCore({ lint: async () => [diagnostic(0)] });

    await core.handleMessage(init());
    await core.handleMessage(lintRequest("j1", "あいう\nえ", "rq1"));
    await settle();

    expect(lint).toHaveBeenCalledTimes(1);
    expect(lint.mock.calls[0]?.[1]).toMatchObject({
      format: "text",
      ext: ".txt"
    });
    expect(lint.mock.calls[0]?.[1].rules.length).toBe(11);

    const result = sent.find((response) => response.type === "lint-result");

    expect(result).toMatchObject({
      type: "lint-result",
      requestId: "rq1",
      jobId: "j1",
      result: {
        ok: true,
        totalMessages: 1,
        maxMessages: JAPANESE_LINT_MAX_RESULT_COUNT,
        truncated: false,
        sourceChars: 5,
        sourceLines: 2
      }
    });
  });

  it("does not echo the manuscript text back in any response", async () => {
    const { core, sent } = makeCore({ lint: async () => [diagnostic(0)] });

    await core.handleMessage(init());
    await core.handleMessage(lintRequest("j1", "吾輩は猫である。"));
    await settle();

    expect(JSON.stringify(sent)).not.toContain("吾輩");
  });

  it("emits queued -> dictionary-check -> lint-running -> completed(total)", async () => {
    const { core, sent } = makeCore();

    await core.handleMessage(init());
    await core.handleMessage(lintRequest("j1", "あいうえお"));
    await settle();

    const progress = sent.filter((response) => response.type === "progress");

    expect(progress).toEqual([
      { type: "progress", jobId: "j1", stage: "queued", processedChars: 0, totalChars: 5 },
      { type: "progress", jobId: "j1", stage: "dictionary-check", processedChars: 0, totalChars: 5 },
      { type: "progress", jobId: "j1", stage: "lint-running", processedChars: 0, totalChars: 5 },
      { type: "progress", jobId: "j1", stage: "completed", processedChars: 5, totalChars: 5 }
    ]);
  });

  it("caps the result and reports total / max / truncated", async () => {
    const { core, sent } = makeCore({
      lint: async () => Array.from({ length: 1234 }, (_, index) => diagnostic(index))
    });

    await core.handleMessage(init());
    await core.handleMessage(lintRequest("j1"));
    await settle();

    const result = sent.find((response) => response.type === "lint-result");

    expect(result).toMatchObject({
      result: { totalMessages: 1234, maxMessages: 1000, truncated: true }
    });
    expect(
      result?.type === "lint-result" ? result.result.messages : []
    ).toHaveLength(1000);
  });

  it("strips everything but the diagnostic fields (no fix suggestions cross the boundary)", async () => {
    const withFix = {
      ...diagnostic(0),
      fix: { range: [0, 1], text: "x" }
    } as unknown as JapaneseLintDiagnostic;
    const { core, sent } = makeCore({ lint: async () => [withFix] });

    await core.handleMessage(init());
    await core.handleMessage(lintRequest("j1"));
    await settle();

    const result = sent.find((response) => response.type === "lint-result");
    const [message] = result?.type === "lint-result" ? result.result.messages : [];

    expect(Object.keys(message ?? {}).sort()).toEqual(
      ["column", "index", "line", "message", "ruleId", "severity"].sort()
    );
  });

  it("with every rule off answers an empty result and never calls textlint", async () => {
    const config = buildJapaneseLintWorkerConfig({
      rules: Object.fromEntries(
        buildJapaneseLintWorkerConfig(undefined).enabledRuleIds.map((id) => [
          id,
          { enabled: false }
        ])
      )
    });
    const { core, sent, lint } = makeCore();

    await core.handleMessage(init(config));
    await core.handleMessage(lintRequest("j1"));
    await settle();

    expect(lint).not.toHaveBeenCalled();
    expect(sent.find((response) => response.type === "lint-result")).toMatchObject({
      result: { ok: true, messages: [], totalMessages: 0 }
    });
  });

  it("answers dictionary-missing (and skips textlint) when the dictionary is gone at job time", async () => {
    let present = true;
    const { core, sent, lint } = makeCore({ dictionaryExists: () => present });

    await core.handleMessage(init());
    present = false;
    await core.handleMessage(lintRequest("j1"));
    await settle();

    expect(lint).not.toHaveBeenCalled();
    expect(sent.at(-1)).toMatchObject({
      type: "error",
      jobId: "j1",
      requestId: "r-j1",
      error: { kind: "dictionary-missing" }
    });
  });

  it("reports a textlint failure as a sanitized lint-failed error carrying no message text", async () => {
    const boom = new TypeError("吾輩は猫である C:\\Users\\tanaka_taro\\novel.md");

    boom.stack = [
      `TypeError: ${boom.message}`,
      "    at tokenize (C:\\Users\\tanaka_taro\\x\\app.asar\\dist\\worker.js:120:15)"
    ].join("\n");

    const { core, sent } = makeCore({
      lint: async () => {
        throw boom;
      }
    });

    await core.handleMessage(init());
    await core.handleMessage(lintRequest("j1"));
    await settle();

    expect(sent.at(-1)).toEqual({
      type: "error",
      requestId: "r-j1",
      jobId: "j1",
      error: {
        kind: "lint-failed",
        name: "TypeError",
        stack: ["    at tokenize (app.asar/dist/worker.js:120:15)"]
      }
    });
    expect(JSON.stringify(sent)).not.toContain("吾輩");
    expect(JSON.stringify(sent)).not.toContain("tanaka_taro");
  });

  it("refuses lintDocument / updateConfig before init", async () => {
    const { core, sent, lint } = makeCore();

    await core.handleMessage(lintRequest("j1"));
    await core.handleMessage({
      type: "updateConfig",
      requestId: "u1",
      config: buildJapaneseLintWorkerConfig(undefined)
    });

    expect(lint).not.toHaveBeenCalled();
    expect(sent).toMatchObject([
      { type: "error", jobId: "j1", error: { kind: "not-initialized" } },
      { type: "error", requestId: "u1", error: { kind: "not-initialized" } }
    ]);
  });

  it("rejects a malformed lintDocument as invalid-message, keeping requestId and jobId", async () => {
    const { core, sent, lint } = makeCore();

    await core.handleMessage(init());
    await core.handleMessage({ ...lintRequest("j9"), ext: ".md" });
    await core.handleMessage({ ...lintRequest("j8"), source: 42 });
    await core.handleMessage({ ...lintRequest("has space") });

    expect(lint).not.toHaveBeenCalled();
    expect(sent.slice(1)).toMatchObject([
      { type: "error", jobId: "j9", requestId: "r-j9", error: { kind: "invalid-message" } },
      { type: "error", jobId: "j8", requestId: "r-j8", error: { kind: "invalid-message" } },
      { type: "error", error: { kind: "invalid-message" } }
    ]);
  });

  it("runs jobs one at a time, in arrival order", async () => {
    const first = gate();
    const order: string[] = [];
    const { core, sent } = makeCore({
      lint: async (source) => {
        order.push(`start:${source}`);

        if (source === "A") {
          await first.opened;
        }

        order.push(`end:${source}`);

        return [];
      }
    });

    await core.handleMessage(init());
    await core.handleMessage(lintRequest("a", "A"));
    await core.handleMessage(lintRequest("b", "B"));
    await settle();

    expect(order).toEqual(["start:A"]);
    first.release([]);
    await settle();

    expect(order).toEqual(["start:A", "end:A", "start:B", "end:B"]);
    expect(
      sent.filter((response) => response.type === "lint-result").map((r) =>
        r.type === "lint-result" ? r.jobId : ""
      )
    ).toEqual(["a", "b"]);
  });
});

describe("worker core: updateConfig (#625 P1b)", () => {
  it("answers config-updated and applies to jobs that start later", async () => {
    const seen: string[][] = [];
    const { core, sent } = makeCore({
      lint: async (_source, { rules }) => {
        seen.push(rules.map((rule) => rule.id));

        return [];
      }
    });

    await core.handleMessage(init());
    await core.handleMessage(lintRequest("j1"));
    await settle();
    await core.handleMessage({
      type: "updateConfig",
      requestId: "u1",
      config: buildJapaneseLintWorkerConfig({
        rules: { "sentence-length": { enabled: true }, "no-nfd": { enabled: false } }
      })
    });
    await core.handleMessage(lintRequest("j2"));
    await settle();

    expect(sent).toContainEqual({ type: "config-updated", requestId: "u1" });
    expect(seen[0]).toContain("no-nfd");
    expect(seen[1]).not.toContain("no-nfd");
    expect(seen[1]).toContain("sentence-length");
  });

  it("does not change the rules of the job that is already running", async () => {
    const stuck = gate();
    const seen: string[][] = [];
    const { core } = makeCore({
      lint: async (_source, { rules }) => {
        seen.push(rules.map((rule) => rule.id));

        return stuck.opened;
      }
    });

    await core.handleMessage(init());
    await core.handleMessage(lintRequest("j1"));
    await settle();
    await core.handleMessage({
      type: "updateConfig",
      requestId: "u1",
      config: buildJapaneseLintWorkerConfig({ rules: { "no-nfd": { enabled: false } } })
    });
    stuck.release([]);
    await settle();

    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("no-nfd");
  });
});

describe("worker core: cancel (#625 P1b)", () => {
  it("cancels a queued job before it starts: canceled is sent and textlint never sees it", async () => {
    const first = gate();
    const sources: string[] = [];
    const { core, sent } = makeCore({
      lint: async (source) => {
        sources.push(source);

        if (source === "A") {
          await first.opened;
        }

        return [];
      }
    });

    await core.handleMessage(init());
    await core.handleMessage(lintRequest("a", "A"));
    await core.handleMessage(lintRequest("b", "B"));
    await settle();
    await core.handleMessage({ type: "cancel", requestId: "c1", jobId: "b" });
    first.release([]);
    await settle();

    expect(sent).toContainEqual({ type: "canceled", requestId: "c1", jobId: "b" });
    expect(sources).toEqual(["A"]);
    expect(
      sent.some((response) => response.type === "lint-result" && response.jobId === "b")
    ).toBe(false);
  });

  it("cancel of a running job is best-effort: its result is dropped and canceled is sent when it ends", async () => {
    const stuck = gate();
    const { core, sent } = makeCore({ lint: () => stuck.opened });

    await core.handleMessage(init());
    await core.handleMessage(lintRequest("a"));
    await settle();
    await core.handleMessage({ type: "cancel", requestId: "c1", jobId: "a" });
    await settle();

    // textlint cannot be interrupted: no answer yet.
    expect(sent.some((response) => response.type === "canceled")).toBe(false);

    stuck.release([diagnostic(0)]);
    await settle();

    expect(sent).toContainEqual({ type: "canceled", requestId: "c1", jobId: "a" });
    expect(sent.some((response) => response.type === "lint-result")).toBe(false);
  });

  it("cancel of an unknown or finished job is idempotent", async () => {
    const { core, sent } = makeCore();

    await core.handleMessage(init());
    await core.handleMessage({ type: "cancel", requestId: "c1", jobId: "nope" });
    await core.handleMessage({ type: "cancel", requestId: "c2", jobId: "nope" });

    expect(sent.filter((response) => response.type === "canceled")).toHaveLength(2);
  });

  it("shutdown cancels the jobs that never started", async () => {
    const stuck = gate();
    const { core, sent, exit } = makeCore({ lint: () => stuck.opened });

    await core.handleMessage(init());
    await core.handleMessage(lintRequest("a"));
    await core.handleMessage(lintRequest("b"));
    await settle();
    await core.handleMessage({ type: "shutdown", requestId: "s1" });

    expect(sent).toContainEqual({ type: "canceled", jobId: "b" });
    expect(sent.at(-1)).toEqual({ type: "shutdown-complete", requestId: "s1" });
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });
});

describe("worker core: reportError keeps a healthy Worker running (#625 P1b)", () => {
  it("sends a sanitized error without exiting", () => {
    const { core, sent, exit } = makeCore();
    const error = new Error("吾輩は猫である");

    core.reportError("unhandled-rejection", error);

    expect(sent).toMatchObject([
      { type: "error", error: { kind: "unhandled-rejection", name: "Error" } }
    ]);
    expect(JSON.stringify(sent)).not.toContain("吾輩");
    expect(exit).not.toHaveBeenCalled();
  });

  it("never throws even if the port is already gone", () => {
    const core = createJapaneseLintWorkerCore({
      send: () => {
        throw new Error("closed");
      },
      exit: () => undefined,
      dictionaryExists: async () => true,
      setDictionaryPath: () => undefined,
      lint: async () => []
    });

    expect(() => core.reportError("unhandled-rejection", new Error("x"))).not.toThrow();
  });
});
