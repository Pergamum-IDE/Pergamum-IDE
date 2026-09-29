import { describe, expect, it } from "vitest";
import {
  buildJapaneseLintWorkerConfig,
  parseJapaneseLintWorkerRequest,
  parseJapaneseLintWorkerResponse
} from "../../src/shared/japaneseLintWorkerProtocol";

const config = buildJapaneseLintWorkerConfig(undefined);

const diagnostic = {
  ruleId: "no-doubled-joshi",
  severity: "error",
  message: "m",
  line: 1,
  column: 1,
  index: 0
};
const result = {
  ok: true,
  messages: [diagnostic],
  totalMessages: 1,
  maxMessages: 1000,
  truncated: false,
  elapsedMs: 3,
  sourceChars: 5,
  sourceLines: 1
};

const lintRequest = (overrides: Record<string, unknown> = {}) => ({
  type: "lintDocument",
  requestId: "r1",
  jobId: "j1",
  source: "あ",
  format: "text",
  ext: ".txt",
  ...overrides
});

describe("Linter Worker protocol: P1b requests (#625)", () => {
  it("accepts updateConfig / lintDocument / cancel", () => {
    for (const raw of [
      { type: "updateConfig", requestId: "u1", config },
      lintRequest(),
      lintRequest({ source: "", format: "markdown", ext: ".md" }),
      lintRequest({ format: "markdown", ext: ".markdown" }),
      { type: "cancel", requestId: "c1", jobId: "j1" }
    ]) {
      expect(parseJapaneseLintWorkerRequest(raw), JSON.stringify(raw)).not.toBeNull();
    }
  });

  it("rejects malformed P1b requests", () => {
    const withoutJobId: Record<string, unknown> = lintRequest();

    delete withoutJobId.jobId;

    for (const raw of [
      { type: "updateConfig", requestId: "u1" },
      { type: "updateConfig", requestId: "u1", config: {} },
      withoutJobId,
      lintRequest({ jobId: "bad id" }),
      lintRequest({ source: 1 }),
      lintRequest({ ext: ".md" }),
      lintRequest({ format: "markdown" }),
      lintRequest({ format: "html", ext: ".html" }),
      { type: "cancel", requestId: "c1" },
      { type: "cancel", requestId: "c1", jobId: "../x" }
    ]) {
      expect(parseJapaneseLintWorkerRequest(raw), JSON.stringify(raw)).toBeNull();
    }
  });
});

describe("Linter Worker protocol: P1b responses (#625)", () => {
  it("accepts config-updated / progress / lint-result / canceled / error", () => {
    for (const raw of [
      { type: "config-updated", requestId: "u1" },
      { type: "progress", jobId: "j1", stage: "queued", processedChars: 0, totalChars: 5 },
      { type: "progress", jobId: "j1", stage: "completed", processedChars: 5, totalChars: 5 },
      { type: "lint-result", requestId: "r1", jobId: "j1", result },
      { type: "canceled", requestId: "c1", jobId: "j1" },
      { type: "canceled", jobId: "j1" },
      {
        type: "error",
        requestId: "r1",
        jobId: "j1",
        error: { kind: "lint-failed", name: "Error", stack: [] }
      }
    ]) {
      expect(parseJapaneseLintWorkerResponse(raw), JSON.stringify(raw)).not.toBeNull();
    }
  });

  it("rejects malformed P1b responses", () => {
    for (const raw of [
      { type: "progress", jobId: "j1", stage: "smooth", processedChars: 0, totalChars: 5 },
      { type: "progress", jobId: "j1", stage: "queued", processedChars: -1, totalChars: 5 },
      { type: "progress", stage: "queued", processedChars: 0, totalChars: 5 },
      { type: "lint-result", requestId: "r1", jobId: "j1", result: { ...result, ok: false } },
      {
        type: "lint-result",
        requestId: "r1",
        jobId: "j1",
        result: { ...result, messages: [{ ...diagnostic, severity: "fatal" }] }
      },
      {
        type: "lint-result",
        requestId: "r1",
        jobId: "j1",
        result: { ...result, messages: Array.from({ length: 1001 }, () => diagnostic) }
      },
      { type: "lint-result", requestId: "r1", result },
      { type: "canceled" },
      { type: "config-updated" }
    ]) {
      expect(parseJapaneseLintWorkerResponse(raw), JSON.stringify(raw)).toBeNull();
    }
  });

  it("drops a raw error message and unsafe stack frames from a Worker error", () => {
    const parsed = parseJapaneseLintWorkerResponse({
      type: "error",
      requestId: "r1",
      jobId: "j1",
      error: {
        kind: "lint-failed",
        name: "Error",
        message: "吾輩は猫である",
        stack: ["    at leak (C:\\Users\\tanaka_taro\\x.js:1:1)", "吾輩"]
      }
    });
    const text = JSON.stringify(parsed);

    expect(text).not.toContain("吾輩");
    expect(text).not.toContain("tanaka_taro");
  });
});
