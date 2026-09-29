import { describe, expect, it, vi } from "vitest";
import {
  createJapaneseLintWorkerCore,
  dictionaryDirectoryExists
} from "../../../src/main/linterWorker/japaneseLintWorkerCore";
import type { JapaneseLintWorkerResponse } from "../../../src/shared/japaneseLintWorkerProtocol";
import { buildJapaneseLintWorkerConfig } from "../../../src/shared/japaneseLintWorkerProtocol";

function makeCore(dictionaryExists = true) {
  const sent: JapaneseLintWorkerResponse[] = [];
  const exit = vi.fn();
  const core = createJapaneseLintWorkerCore({
    send: (response) => sent.push(response),
    exit,
    dictionaryExists: async () => dictionaryExists,
    setDictionaryPath: () => undefined,
    lint: async () => []
  });

  return { core, sent, exit };
}

const initRequest = (requestId = "r1") => ({
  type: "init",
  requestId,
  dictionaryPath: "C:\\dict",
  config: buildJapaneseLintWorkerConfig(undefined)
});

describe("japaneseLintWorkerCore (#625 P1a)", () => {
  it("answers init with ready (same requestId)", async () => {
    const { core, sent } = makeCore();

    await core.handleMessage(initRequest("abc"));

    expect(sent).toEqual([{ type: "ready", requestId: "abc" }]);
  });

  it("answers ping with pong once initialized", async () => {
    const { core, sent } = makeCore();

    await core.handleMessage(initRequest());
    await core.handleMessage({ type: "ping", requestId: "p1" });

    expect(sent.at(-1)).toEqual({ type: "pong", requestId: "p1" });
  });

  it("refuses ping before init with a not-initialized error", async () => {
    const { core, sent } = makeCore();

    await core.handleMessage({ type: "ping", requestId: "p1" });

    expect(sent).toEqual([
      {
        type: "error",
        requestId: "p1",
        error: { kind: "not-initialized", name: "Error", stack: [] }
      }
    ]);
  });

  it("answers init with dictionary-missing when the dictionary is absent", async () => {
    const { core, sent } = makeCore(false);

    await core.handleMessage(initRequest("d1"));

    expect(sent[0]).toMatchObject({
      type: "error",
      requestId: "d1",
      error: { kind: "dictionary-missing" }
    });
    // Not initialized, so a ping is refused too.
    await core.handleMessage({ type: "ping", requestId: "p1" });
    expect(sent.at(-1)).toMatchObject({ type: "error", requestId: "p1" });
  });

  it("answers shutdown with shutdown-complete and then exits 0", async () => {
    const { core, sent, exit } = makeCore();

    await core.handleMessage(initRequest());
    await core.handleMessage({ type: "shutdown", requestId: "s1" });

    expect(sent.at(-1)).toEqual({ type: "shutdown-complete", requestId: "s1" });
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it("a repeated shutdown is answered but never exits twice", async () => {
    const { core, sent, exit } = makeCore();

    await core.handleMessage({ type: "shutdown", requestId: "s1" });
    await core.handleMessage({ type: "shutdown", requestId: "s2" });

    expect(
      sent.filter((response) => response.type === "shutdown-complete")
    ).toHaveLength(2);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed messages with an invalid-message error, keeping a safe requestId", async () => {
    const { core, sent } = makeCore();

    for (const raw of [
      null,
      "text",
      42,
      {},
      { type: "lint", requestId: "x" },
      { type: "ping" },
      { type: "ping", requestId: "has space" },
      { type: "init", requestId: "i1", dictionaryPath: "", config: {} },
      { type: "init", requestId: "i2", dictionaryPath: "C:\\d", config: null }
    ]) {
      await core.handleMessage(raw);
    }

    expect(sent).toHaveLength(9);
    for (const response of sent) {
      expect(response).toMatchObject({
        type: "error",
        error: { kind: "invalid-message" }
      });
    }
    expect(
      sent.filter((response) => response.type === "error" && response.requestId)
    ).toHaveLength(3);
  });

  it("never lets an internal failure escape handleMessage, and reports it sanitized", async () => {
    const sent: JapaneseLintWorkerResponse[] = [];
    const core = createJapaneseLintWorkerCore({
      send: (response) => sent.push(response),
      exit: () => undefined,
      dictionaryExists: async () => {
        throw new Error("吾輩は猫である C:\\Users\\tanaka_taro\\novel.md");
      },
      setDictionaryPath: () => undefined,
      lint: async () => []
    });

    await expect(core.handleMessage(initRequest("i9"))).resolves.toBeUndefined();

    expect(sent[0]).toMatchObject({
      type: "error",
      requestId: "i9",
      error: { kind: "internal" }
    });
    expect(JSON.stringify(sent)).not.toContain("吾輩");
    expect(JSON.stringify(sent)).not.toContain("tanaka_taro");
  });

  it("reportFatal sends a sanitized error without a requestId, then exits 1", () => {
    const { core, sent, exit } = makeCore();
    const error = new TypeError("吾輩は猫である");

    error.stack = [
      "TypeError: 吾輩は猫である",
      "    at tokenize (C:\\Users\\tanaka_taro\\app.asar\\dist\\worker.js:120:15)"
    ].join("\n");
    core.reportFatal("uncaught-exception", error);

    expect(sent).toEqual([
      {
        type: "error",
        error: {
          kind: "uncaught-exception",
          name: "TypeError",
          stack: ["    at tokenize (app.asar/dist/worker.js:120:15)"]
        }
      }
    ]);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("reportFatal still exits when sending fails", () => {
    const exit = vi.fn();
    const core = createJapaneseLintWorkerCore({
      send: () => {
        throw new Error("port closed");
      },
      exit,
      dictionaryExists: async () => true,
      setDictionaryPath: () => undefined,
      lint: async () => []
    });

    expect(() => core.reportFatal("unhandled-rejection", new Error("x"))).toThrow();
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });
});

describe("dictionaryDirectoryExists (#625 P1a)", () => {
  it("finds the real kuromoji dictionary in development", async () => {
    expect(
      await dictionaryDirectoryExists(`${process.cwd()}/node_modules/kuromoji/dict`)
    ).toBe(true);
  });

  it("reports a missing directory without throwing", async () => {
    expect(await dictionaryDirectoryExists("C:\\does\\not\\exist")).toBe(false);
  });
});
