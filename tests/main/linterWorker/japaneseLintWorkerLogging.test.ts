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

/** A hostile error: text, a file name and a user path in message AND stack. */
function hostileError(): Error {
  const error = new TypeError(`${fakeText} ${fakePath}`);

  error.stack = [
    `TypeError: ${fakeText} ${fakePath}`,
    `    at tokenize (${fakePath}\\resources\\app.asar\\dist\\worker.js:120:15)`,
    `    at lintLine (${fakePath}:88:9)`,
    `    at ${fakeText} (${fakePath}:1:1)`,
    `${fakeText}`
  ].join("\n");

  return error;
}

function collect() {
  const events: LoggedEvent[] = [];
  const world = createFakeWorkerWorld({ pid: 777 });
  const host = createJapaneseLintHost({
    ...world.deps,
    getSettings: () => undefined,
    logger: {
      log: (input: LoggedEvent) => {
        events.push(input);
      }
    } as never,
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

describe("Linter Worker logging never carries text, names or paths (#625 P1a)", () => {
  it("a full lifecycle logs only safe fields", async () => {
    const { host, events, written } = collect();

    await host.start();
    await host.ping();
    await host.shutdown();

    expect(events.map((event) => event.event)).toEqual(
      expect.arrayContaining([
        "japaneseLint.worker.started",
        "japaneseLint.worker.ready",
        "japaneseLint.worker.request.completed",
        "japaneseLint.worker.exited"
      ])
    );

    const log = written();

    expect(log).toContain('"linterMode":"worker-lint"');
    expect(log).toContain('"workerPid":777');
    expect(log).toContain('"workerRequestType":"ping"');
    expect(log).toContain('"exitCode":0');
    for (const secret of forbidden) {
      expect(log, secret).not.toContain(secret);
    }
  });

  it("an error thrown inside the Worker is logged as name + sanitized frames only", async () => {
    const { host, world, written } = collect();

    await host.start();
    world.children[0]!.core!.reportFatal("uncaught-exception", hostileError());
    await new Promise((resolve) => setTimeout(resolve, 30));

    const log = written();

    expect(log).toContain('"errorName":"TypeError"');
    expect(log).toContain('"workerErrorKind":"uncaught-exception"');
    expect(log).toContain("at tokenize (app.asar/dist/worker.js:120:15)");
    expect(log).not.toContain("lintLine");
    for (const secret of forbidden) {
      expect(log, secret).not.toContain(secret);
    }
    // No raw message or raw stack field exists in what is written.
    expect(log).not.toContain('"message"');
    expect(log).not.toContain('"stack"');
    expect(log).not.toContain("stderr");
  });

  it("a hostile error message sent by a misbehaving Worker is dropped", async () => {
    const { host, world, written } = collect();

    await host.start();
    world.children[0]!.sendRaw({
      type: "error",
      error: {
        kind: "internal",
        name: `Bad ${fakeText}`,
        message: fakeText,
        stack: [`    at leak (${fakePath}:1:1)`, fakeText]
      }
    });
    world.children[0]!.sendRaw({
      type: "error",
      requestId: fakePath,
      error: { kind: "internal", name: "Error", stack: [] }
    });
    await new Promise((resolve) => setTimeout(resolve, 30));

    const log = written();

    for (const secret of forbidden) {
      expect(log, secret).not.toContain(secret);
    }
  });

  it("a crash (exit) is logged with its code and no other detail", async () => {
    const { host, world, events, written } = collect();

    await host.start();
    world.children[0]!.crash(-1073741819);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const exited = events.find(
      (event) => event.event === "japaneseLint.worker.exited"
    );

    expect(exited?.level).toBe("warn");
    expect(exited?.details).toMatchObject({
      exitCode: -1073741819,
      workerPid: 777,
      linterMode: "worker-lint"
    });
    for (const secret of forbidden) {
      expect(written(), secret).not.toContain(secret);
    }
  });

  it("logs the enabled rule ids (not text) when ready", async () => {
    const { host, events } = collect();

    await host.start();

    const ready = events.find(
      (event) => event.event === "japaneseLint.worker.ready"
    );
    const ids = ready?.details?.enabledRuleIds as string[];

    expect(ids).toContain("max-ten");
    expect(ids).not.toContain("sentence-length");
  });

  it("logging failures never disturb the Host", async () => {
    const world = createFakeWorkerWorld();
    const host = createJapaneseLintHost({
      ...world.deps,
      getSettings: () => undefined,
      logger: {
        log: () => {
          throw new Error(fakeText);
        }
      } as never,
      timeouts: { startMs: 300, requestMs: 300, shutdownMs: 300 }
    });

    hosts.push(host);
    await expect(host.start()).resolves.toBeUndefined();
    await expect(host.ping()).resolves.toBeDefined();
  });
});

describe("debug log sanitizer: Linter Worker fields (#625 P1a)", () => {
  it("keeps the safe worker fields", () => {
    const details = sanitizeDebugLogDetails(
      {
        linterMode: "worker-lint",
        workerPid: 4242,
        exitCode: 1,
        exitSignal: "SIGTERM",
        workerRequestType: "ping",
        workerRequestId: "req-1",
        enabledRuleIds: ["max-ten", "no-nfd"],
        errorName: "TypeError",
        errorCode: "ERR_X",
        sanitizedStack: ["    at fn (app.asar/dist/w.js:1:2)"],
        workerErrorKind: "uncaught-exception",
        durationMs: 12
      },
      sanitizerContext
    );

    expect(details).toMatchObject({
      linterMode: "worker-lint",
      workerPid: 4242,
      exitCode: 1,
      exitSignal: "SIGTERM",
      workerRequestType: "ping",
      workerRequestId: "req-1",
      enabledRuleIds: ["max-ten", "no-nfd"],
      errorName: "TypeError",
      errorCode: "ERR_X",
      sanitizedStack: ["    at fn (app.asar/dist/w.js:1:2)"],
      workerErrorKind: "uncaught-exception",
      durationMs: 12
    });
  });

  it("filters unsafe values: only allow-listed frames pass, free text is dropped", () => {
    const details = sanitizeDebugLogDetails(
      {
        sanitizedStack: [
          "    at ok (app.asar/dist/w.js:1:2)",
          `    at leak (${fakePath}:1:2)`,
          fakeText
        ],
        errorName: `Bad ${fakeText}`,
        errorCode: fakePath,
        exitSignal: fakePath,
        workerRequestId: fakePath,
        workerRequestType: "hackTheWorker",
        enabledRuleIds: [fakePath, "max-ten"],
        message: fakeText,
        stack: fakePath,
        stderr: fakeText,
        filePath: fakePath
      },
      sanitizerContext
    );
    const log = JSON.stringify(details);

    expect(details?.sanitizedStack).toEqual([
      "    at ok (app.asar/dist/w.js:1:2)"
    ]);
    expect(details?.workerRequestType).toBe("unknown");
    expect(details?.enabledRuleIds).toEqual(["max-ten"]);
    for (const secret of forbidden) {
      expect(log, secret).not.toContain(secret);
    }
    expect(log).not.toContain("stderr");
  });
});
