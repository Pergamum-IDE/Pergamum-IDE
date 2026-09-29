import { describe, expect, it } from "vitest";
import {
  buildJapaneseLintWorkerConfig,
  isJapaneseLintWorkerConfig,
  parseJapaneseLintWorkerRequest,
  parseJapaneseLintWorkerResponse
} from "../../src/shared/japaneseLintWorkerProtocol";

const config = buildJapaneseLintWorkerConfig(undefined);

describe("Linter Worker protocol: config (#625 P1a)", () => {
  it("builds the init config from the stored settings", () => {
    const built = buildJapaneseLintWorkerConfig({
      rules: {
        "no-nfd": { enabled: false },
        "sentence-length": { enabled: true, options: { max: 40 } }
      },
      debounceMs: 1000,
      lineCacheLimit: 9000,
      workerRestartAttempts: 7
    });

    expect(built.debounceMs).toBe(1000);
    expect(built.lineCacheLimit).toBe(9000);
    expect(built.workerRestartAttempts).toBe(7);
    expect(built.enabledRuleIds).not.toContain("no-nfd");
    expect(built.enabledRuleIds).toContain("sentence-length");
    expect(built.enabledRuleIds).toEqual(built.rules.map((rule) => rule.id));
    expect(
      built.rules.find((rule) => rule.id === "sentence-length")?.options
    ).toEqual({ max: 40 });
  });

  it("uses the defaults for missing settings and passes its own validator", () => {
    expect(config).toMatchObject({
      debounceMs: 800,
      lineCacheLimit: 5000,
      workerRestartAttempts: 3
    });
    expect(isJapaneseLintWorkerConfig(config)).toBe(true);
    // The config survives a structured clone / JSON round trip.
    expect(JSON.parse(JSON.stringify(config))).toEqual(config);
  });

  it("rejects malformed configs", () => {
    for (const bad of [
      null,
      {},
      { ...config, enabledRuleIds: ["no-such-rule"] },
      { ...config, debounceMs: "800" },
      { ...config, lineCacheLimit: 1.5 },
      { ...config, rules: [{ id: "no-such-rule", options: {} }] },
      { ...config, rules: [{ id: "max-ten", options: { max: "3" } }] }
    ]) {
      expect(isJapaneseLintWorkerConfig(bad)).toBe(false);
    }
  });
});

describe("Linter Worker protocol: requests (#625 P1a)", () => {
  it("parses init / ping / shutdown, each with its requestId", () => {
    expect(
      parseJapaneseLintWorkerRequest({
        type: "init",
        requestId: "r-1",
        dictionaryPath: "C:\\dict",
        config
      })
    ).toEqual({
      type: "init",
      requestId: "r-1",
      dictionaryPath: "C:\\dict",
      config
    });
    expect(
      parseJapaneseLintWorkerRequest({ type: "ping", requestId: "r-2" })
    ).toEqual({ type: "ping", requestId: "r-2" });
    expect(
      parseJapaneseLintWorkerRequest({ type: "shutdown", requestId: "r-3" })
    ).toEqual({ type: "shutdown", requestId: "r-3" });
  });

  it("requires a safe requestId and drops unknown fields", () => {
    for (const requestId of [undefined, "", "has space", "a/b", 5, "x".repeat(81)]) {
      expect(
        parseJapaneseLintWorkerRequest({ type: "ping", requestId })
      ).toBeNull();
    }

    expect(
      parseJapaneseLintWorkerRequest({
        type: "ping",
        requestId: "r",
        text: "吾輩は猫である"
      })
    ).toEqual({ type: "ping", requestId: "r" });
  });

  it("rejects unknown types and a bad init", () => {
    for (const bad of [
      null,
      "ping",
      { type: "lintDocument", requestId: "r" },
      { type: "init", requestId: "r", dictionaryPath: 5, config },
      { type: "init", requestId: "r", dictionaryPath: "x".repeat(5000), config },
      { type: "init", requestId: "r", dictionaryPath: "C:\\d" }
    ]) {
      expect(parseJapaneseLintWorkerRequest(bad)).toBeNull();
    }
  });
});

describe("Linter Worker protocol: responses (#625 P1a)", () => {
  it("parses ready / pong / shutdown-complete with their requestId", () => {
    for (const type of ["ready", "pong", "shutdown-complete"] as const) {
      expect(parseJapaneseLintWorkerResponse({ type, requestId: "r-9" })).toEqual({
        type,
        requestId: "r-9"
      });
      expect(parseJapaneseLintWorkerResponse({ type })).toBeNull();
    }
  });

  it("parses a sanitized error, with or without a requestId", () => {
    const error = {
      kind: "uncaught-exception",
      name: "TypeError",
      code: "ERR_X",
      stack: ["    at tokenize (app.asar/dist/worker.js:120:15)"]
    };

    expect(
      parseJapaneseLintWorkerResponse({ type: "error", requestId: "r", error })
    ).toEqual({ type: "error", requestId: "r", error });
    expect(parseJapaneseLintWorkerResponse({ type: "error", error })).toEqual({
      type: "error",
      error
    });
  });

  it("re-validates the Worker's error: unsafe frames are dropped, bad shapes rejected", () => {
    const parsed = parseJapaneseLintWorkerResponse({
      type: "error",
      error: {
        kind: "internal",
        name: "Error",
        stack: [
          "    at ok (app.asar/dist/w.js:1:2)",
          "    at leak (C:\\Users\\tanaka_taro\\x.js:1:2)",
          "吾輩は猫である",
          42
        ]
      }
    });

    expect(parsed).toEqual({
      type: "error",
      error: {
        kind: "internal",
        name: "Error",
        stack: ["    at ok (app.asar/dist/w.js:1:2)"]
      }
    });

    for (const bad of [
      { kind: "made-up", name: "Error", stack: [] },
      { kind: "internal", name: "Bad name with 吾輩", stack: [] },
      { kind: "internal", name: "Error", stack: "not an array" },
      { kind: "internal", name: "Error", code: "C:\\Users\\x", stack: [] },
      "text",
      null
    ]) {
      expect(
        parseJapaneseLintWorkerResponse({ type: "error", error: bad })
      ).toBeNull();
    }
  });

  it("rejects unknown response types", () => {
    for (const bad of [null, "pong", { type: "lint-result", requestId: "r" }, {}]) {
      expect(parseJapaneseLintWorkerResponse(bad)).toBeNull();
    }
  });
});
