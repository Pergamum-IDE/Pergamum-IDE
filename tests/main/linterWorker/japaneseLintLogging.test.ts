import { afterEach, describe, expect, it } from "vitest";
import {
  sanitizeDebugLogDetails,
  type DebugLogRuntimeDetails
} from "../../../src/main/debugLogSanitizer";
import {
  createJapaneseLintHost,
  type JapaneseLintHost
} from "../../../src/main/linterWorker/japaneseLintHost";
import { createFakeWorkerWorld } from "./fakeWorkerWorld";

const fakeUser = "tanaka_taro";
const fakeText = "吾輩は猫である。名前はまだ無い。";
const fakeFile = "secret-novel-chapter1.md";
const fakePath = `C:\\Users\\${fakeUser}\\Documents\\${fakeFile}`;
const forbidden = [fakeUser, fakeText, "吾輩", fakeFile, "Documents", "Users"];

const runtime: DebugLogRuntimeDetails = {
  appVersion: "0.1.0",
  platform: "win32",
  arch: "x64",
  locale: "ja",
  electronVersion: "43.4.0",
  nodeVersion: "24.19.0",
  debugMode: true
};
const sanitizerContext = {
  runtime,
  isKnownProjectRef: () => false,
  isKnownDocumentRef: () => false
};

interface LoggedEvent {
  level: string;
  event: string;
  details?: Record<string, unknown>;
}

const hosts: JapaneseLintHost[] = [];

afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.dispose()));
});

function hostileError(): Error {
  const error = new TypeError(`${fakeText} ${fakePath}`);

  error.stack = [
    `TypeError: ${fakeText} ${fakePath}`,
    `    at tokenize (${fakePath}\\resources\\app.asar\\dist\\worker.js:120:15)`,
    `    at ${fakeText} (${fakePath}:1:1)`,
    fakeText
  ].join("\n");

  return error;
}

function setup(lint?: () => never | Promise<never>) {
  const events: LoggedEvent[] = [];
  const world = createFakeWorkerWorld({
    pid: 777,
    ...(lint ? { lint: lint as never } : {})
  });
  const host = createJapaneseLintHost({
    ...world.deps,
    getSettings: () => undefined,
    logger: { log: (input: LoggedEvent) => void events.push(input) } as never,
    timeouts: { startMs: 300, requestMs: 300, shutdownMs: 300 }
  });

  hosts.push(host);

  // What would actually be written: the details after the last gate.
  const written = (): string =>
    JSON.stringify(
      events.map((event) => ({
        level: event.level,
        event: event.event,
        details: sanitizeDebugLogDetails(event.details ?? {}, sanitizerContext)
      }))
    );

  return { events, world, host, written };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

describe("lintDocument logging never carries text, names or paths (#625 P1b)", () => {
  it("logs only counts / ids / flags for a successful lint", async () => {
    const { host, events, written } = setup();

    await host.start();

    const result = await host.lintDocument({
      source: fakeText,
      format: "text",
      ext: ".txt"
    });

    expect(result.ok).toBe(true);

    const completed = events.find(
      (event) => event.event === "japaneseLint.worker.lint.completed"
    );

    expect(completed?.details).toMatchObject({
      linterMode: "worker-lint",
      workerPid: 777,
      workerRequestType: "lintDocument",
      lintFormat: "text",
      extension: ".txt",
      characterLength: fakeText.length,
      lineCount: 1,
      result: "succeeded",
      totalMessages: 0,
      returnedMessages: 0,
      truncated: false
    });
    expect(typeof completed?.details?.workerRequestId).toBe("string");
    expect(typeof completed?.details?.workerJobId).toBe("string");

    const log = written();

    for (const secret of forbidden) {
      expect(log, secret).not.toContain(secret);
    }
    expect(log).toContain('"workerRequestType":"lintDocument"');
  });

  it("a lint failure logs a reason and sanitized frames, never the message or text", async () => {
    const { host, written } = setup(() => {
      throw hostileError();
    });

    await host.start();

    const result = await host.lintDocument({
      source: fakeText,
      format: "markdown",
      ext: ".md"
    });

    expect(result).toMatchObject({ ok: false, reason: "lint-failed" });

    const log = written();

    expect(log).toContain('"failureReason":"lint-failed"');
    for (const secret of forbidden) {
      expect(log, secret).not.toContain(secret);
    }
    expect(log).not.toContain('"message"');
    expect(log).not.toContain('"source"');
  });

  it("a Worker that dies mid-lint is logged without any manuscript detail", async () => {
    const { host, world, written } = setup(() => new Promise<never>(() => undefined));

    await host.start();

    const pending = host.lintDocument({
      source: fakeText,
      format: "text",
      ext: ".txt"
    });

    await settle();
    world.children[0]!.crash(1);

    expect(await pending).toMatchObject({ ok: false, reason: "worker-failed" });

    const log = written();

    for (const secret of forbidden) {
      expect(log, secret).not.toContain(secret);
    }
  });

  it("the sanitizer keeps the P1b fields and filters unsafe values", () => {
    const kept = sanitizeDebugLogDetails(
      {
        workerJobId: "job-1",
        lintFormat: "markdown",
        totalMessages: 1500,
        returnedMessages: 1000,
        truncated: true,
        failureReason: "canceled",
        workerRequestType: "lintDocument"
      },
      sanitizerContext
    );

    expect(kept).toMatchObject({
      workerJobId: "job-1",
      lintFormat: "markdown",
      totalMessages: 1500,
      returnedMessages: 1000,
      truncated: true,
      failureReason: "canceled",
      workerRequestType: "lintDocument"
    });

    const dropped = sanitizeDebugLogDetails(
      {
        workerJobId: fakePath,
        lintFormat: fakeFile,
        failureReason: fakeText,
        totalMessages: fakeText,
        truncated: fakeText
      },
      sanitizerContext
    );
    const log = JSON.stringify(dropped);

    for (const secret of forbidden) {
      expect(log, secret).not.toContain(secret);
    }
    expect(dropped?.failureReason).not.toBe(fakeText);
    expect(dropped?.workerJobId).toBeUndefined();
  });
});
