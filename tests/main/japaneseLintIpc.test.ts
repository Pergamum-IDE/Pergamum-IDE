import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JAPANESE_LINT_CHANNELS } from "../../src/shared/api";

const electronMock = vi.hoisted(() => ({ ipcHandle: vi.fn() }));

vi.mock("electron", () => ({
  app: { getAppPath: () => process.cwd(), isPackaged: false },
  ipcMain: { handle: electronMock.ipcHandle },
  MessageChannelMain: class {},
  utilityProcess: { fork: () => undefined }
}));

import {
  JAPANESE_LINT_MAX_RESULT_COUNT,
  JAPANESE_LINT_MAX_SOURCE_LENGTH
} from "../../src/shared/japaneseLint";
import {
  createInstantJapaneseLintService,
  registerJapaneseLintIpc,
  releaseJapaneseLintWorker,
  type InstantJapaneseLintService
} from "../../src/main/japaneseLintIpc";
import { createJapaneseLintHost } from "../../src/main/linterWorker/japaneseLintHost";
import type { JapaneseLintHost } from "../../src/main/linterWorker/japaneseLintHost";
import { sanitizeDebugLogDetails } from "../../src/main/debugLogSanitizer";
import { lintJapanese } from "../../src/main/textlint/japaneseLintEngine";
import {
  createFakeWorkerWorld,
  type FakeLint,
  type FakeWorkerOptions
} from "./linterWorker/fakeWorkerWorld";

const realDictionary = path.join(process.cwd(), "node_modules", "kuromoji", "dict");

const realLint: FakeLint = (source, { format, ext, rules }) =>
  format === "markdown"
    ? lintJapanese(source, {
        format: "markdown",
        ext: ext === ".markdown" ? ".markdown" : ".md",
        rules: rules as never
      })
    : lintJapanese(source, { format: "text", ext: ".txt", rules: rules as never });

interface Logged {
  level: string;
  event: string;
  details?: Record<string, unknown>;
}

const joshi = { text: "私は彼は好きだ。", format: "text", ext: ".txt" } as const;
const secretText = "秘密の本文です。";
const secretFile = "secret-chapter.md";
const secretPath = `C:\\Users\\tanaka_taro\\Documents\\${secretFile}`;

const hosts: JapaneseLintHost[] = [];

afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.dispose()));
});

function setup(
  worldOptions: FakeWorkerOptions = { lint: realLint, realDictionary },
  initialSettings: unknown = undefined
) {
  const world = createFakeWorkerWorld(worldOptions);
  const events: Logged[] = [];
  const state = { settings: initialSettings, hostsCreated: 0 };
  const logger = { log: (input: Logged) => void events.push(input) } as never;
  const service: InstantJapaneseLintService = createInstantJapaneseLintService({
    createHost: (getSettings) => {
      state.hostsCreated += 1;

      const host = createJapaneseLintHost({
        ...world.deps,
        getSettings,
        logger,
        timeouts: {
          startMs: 1000,
          requestMs: 1000,
          shutdownMs: 500,
          jobMs: 20_000,
          cancelGraceMs: 80
        }
      });

      hosts.push(host);

      return host;
    },
    settingsProvider: async () => state.settings,
    logger
  });

  return { service, world, events, state };
}

const ruleIds = async (
  service: InstantJapaneseLintService,
  request: unknown
): Promise<string[]> => {
  const response = await service.lint(request);

  return response.ok ? response.diagnostics.map((d) => d.ruleId) : [];
};

function lintDocumentsReceived(child: { received: unknown[] } | undefined): number {
  return (child?.received ?? []).filter(
    (message) => (message as { type?: string }).type === "lintDocument"
  ).length;
}

function gate() {
  let release!: () => void;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });

  return { opened, release };
}

describe("instant japanese lint IPC -> Worker (#625 P1c)", () => {
  beforeEach(() => electronMock.ipcHandle.mockReset());

  it("registers the lint and release channels", async () => {
    registerJapaneseLintIpc();

    expect(electronMock.ipcHandle.mock.calls.map((call) => call[0])).toEqual([
      JAPANESE_LINT_CHANNELS.lint,
      JAPANESE_LINT_CHANNELS.release
    ]);

    // Nothing was started, so releasing is a harmless no-op.
    await expect(releaseJapaneseLintWorker()).resolves.toBeUndefined();

    const release = electronMock.ipcHandle.mock.calls[1]?.[1] as () => Promise<unknown>;

    await expect(release()).resolves.toBeUndefined();
  });

  it("lints Markdown (.md / .markdown) and plain text through the Worker", async () => {
    const { service, world } = setup();

    for (const [format, ext] of [
      ["markdown", ".md"],
      ["markdown", ".markdown"],
      ["text", ".txt"]
    ] as const) {
      expect(await ruleIds(service, { text: joshi.text, format, ext })).toContain(
        "no-doubled-joshi"
      );
    }

    // The lint really ran in the (fake) Worker process, and one Worker served
    // all three requests.
    expect(world.children).toHaveLength(1);
    expect(world.children[0]?.received.some((m) => JSON.stringify(m).includes("lintDocument"))).toBe(
      true
    );
  });

  it("keeps the Renderer contract: serializable diagnostics without fix suggestions", async () => {
    const { service } = setup();
    const response = await service.lint(joshi);

    expect(JSON.parse(JSON.stringify(response))).toEqual(response);
    if (response.ok) {
      expect(response.truncated).toBe(false);
      for (const diagnostic of response.diagnostics) {
        expect(Object.keys(diagnostic).sort()).toEqual(
          ["column", "index", "line", "message", "ruleId", "severity"].sort()
        );
      }
    }
  });

  it("rejects invalid requests without starting the Worker, and never rejects", async () => {
    const { service, world, state } = setup();

    for (const bad of [
      undefined,
      null,
      "text",
      0,
      [],
      { text: "x", format: "text", ext: ".md" },
      { text: 5, format: "text", ext: ".txt" }
    ]) {
      await expect(service.lint(bad)).resolves.toEqual({
        ok: false,
        reason: "invalid-request"
      });
    }

    expect(state.hostsCreated).toBe(0);
    expect(world.children).toHaveLength(0);
  });

  it("returns no diagnostics for empty text", async () => {
    const { service } = setup();

    expect(await service.lint({ text: "", format: "text", ext: ".txt" })).toEqual({
      ok: true,
      diagnostics: [],
      truncated: false
    });
  });
});

describe("Worker failures become the existing safe failure (#625 P1c)", () => {
  it("a dictionary that is missing is { ok:false, lint-failed } and the app is unharmed", async () => {
    const { service } = setup({
      lint: realLint,
      realDictionary,
      dictionaryExists: false
    });

    for (let index = 0; index < 3; index += 1) {
      await expect(service.lint(joshi)).resolves.toEqual({
        ok: false,
        reason: "lint-failed"
      });
    }
  });

  it("a textlint failure inside the Worker is lint-failed", async () => {
    const { service } = setup({
      lint: async () => {
        throw new Error("boom");
      },
      realDictionary
    });

    await expect(service.lint(joshi)).resolves.toEqual({
      ok: false,
      reason: "lint-failed"
    });
  });

  it("a Worker that dies mid-lint settles the request as lint-failed, and the next ON restarts it", async () => {
    const stuck = gate();
    let first = true;
    const { service, world } = setup({
      lint: async (...args) => {
        if (first) {
          first = false;
          await stuck.opened;
        }

        return realLint(...args);
      },
      realDictionary
    });
    const pending = service.lint(joshi);

    await vi.waitFor(() => expect(lintDocumentsReceived(world.children[0])).toBeGreaterThan(0));
    world.children[0]!.crash(1);

    await expect(pending).resolves.toEqual({ ok: false, reason: "lint-failed" });

    // A failed Worker is started afresh by the next request.
    expect(await ruleIds(service, joshi)).toContain("no-doubled-joshi");
    expect(world.children).toHaveLength(2);
    stuck.release();
  });
});

describe("Worker lifecycle (#625 P1c)", () => {
  it("starts lazily on the first lint and reuses the running Worker", async () => {
    const { service, world, state } = setup();

    expect(state.hostsCreated).toBe(0);
    await service.lint(joshi);
    await service.lint(joshi);
    await service.lint(joshi);

    expect(state.hostsCreated).toBe(1);
    expect(world.children).toHaveLength(1);
  });

  it("release() (Linter OFF / project close / quit) shuts the Worker down; the next lint starts a fresh one", async () => {
    const { service, world, state } = setup();

    await service.lint(joshi);
    await service.release();

    expect(world.children[0]?.exited || world.children[0]?.killed).toBe(true);

    await service.release(); // idempotent
    expect(await ruleIds(service, joshi)).toContain("no-doubled-joshi");
    expect(state.hostsCreated).toBe(2);
    expect(world.children).toHaveLength(2);
  });

  it("release() with nothing started does nothing", async () => {
    const { service, state } = setup();

    await service.release();
    expect(state.hostsCreated).toBe(0);
  });

  it("a request in flight when the Linter is turned OFF settles safely", async () => {
    const stuck = gate();
    const { service, world } = setup({
      lint: async (...args) => {
        await stuck.opened;

        return realLint(...args);
      },
      realDictionary
    });
    const pending = service.lint(joshi);

    await vi.waitFor(() => expect(lintDocumentsReceived(world.children[0])).toBeGreaterThan(0));
    await service.release();

    await expect(pending).resolves.toEqual({ ok: false, reason: "lint-failed" });
    stuck.release();
  });
});

describe("Settings reach the Worker (#625 P1c)", () => {
  it("a rule switched off is honored, and switching it back on applies to the next lint", async () => {
    const { service, state, world } = setup();

    expect(await ruleIds(service, joshi)).toContain("no-doubled-joshi");

    state.settings = { rules: { "no-doubled-joshi": { enabled: false } } };
    expect(await ruleIds(service, joshi)).not.toContain("no-doubled-joshi");

    state.settings = undefined;
    expect(await ruleIds(service, joshi)).toContain("no-doubled-joshi");

    // Applied by updateConfig, without restarting the Worker.
    expect(world.children).toHaveLength(1);
    expect(
      world.children[0]?.received.filter((m) =>
        JSON.stringify(m).includes('"updateConfig"')
      )
    ).toHaveLength(2);
  });

  it("does not send updateConfig when the settings did not change", async () => {
    const { service, world } = setup();

    await service.lint(joshi);
    await service.lint(joshi);

    expect(
      world.children[0]?.received.filter((m) =>
        JSON.stringify(m).includes('"updateConfig"')
      )
    ).toHaveLength(0);
  });

  it("keeps sentence-length off by default and applies its threshold once on", async () => {
    const { service, state } = setup();
    const long = { text: `${"あ".repeat(60)}。`, format: "markdown", ext: ".md" };

    expect(await ruleIds(service, long)).not.toContain("sentence-length");

    state.settings = { rules: { "sentence-length": { enabled: true, options: { max: 40 } } } };
    expect(await ruleIds(service, long)).toContain("sentence-length");
  });

  it("applies the max-ten threshold from Settings", async () => {
    const { service, state } = setup();
    const commas = {
      text: "私は、朝に、昼に、夜に、犬と散歩をした。",
      format: "text",
      ext: ".txt"
    };

    expect(await ruleIds(service, commas)).not.toContain("max-ten");

    state.settings = { rules: { "max-ten": { options: { max: 3 } } } };
    expect(await ruleIds(service, commas)).toContain("max-ten");
  });

  it("the first start inits the Worker with the settings just read", async () => {
    const { service, world } = setup(undefined, {
      rules: { "no-doubled-joshi": { enabled: false } }
    });

    expect(await ruleIds(service, joshi)).not.toContain("no-doubled-joshi");
    expect(world.children).toHaveLength(1);
  });

  it("with every rule off answers an empty ok without starting a Worker", async () => {
    const off = {
      rules: Object.fromEntries(
        [
          "max-ten",
          "no-doubled-conjunctive-particle-ga",
          "no-doubled-conjunction",
          "no-double-negative-ja",
          "no-doubled-joshi",
          "sentence-length",
          "no-dropping-the-ra",
          "no-mix-dearu-desumasu",
          "no-nfd",
          "no-invalid-control-character",
          "no-zero-width-spaces",
          "no-kangxi-radicals"
        ].map((id) => [id, { enabled: false }])
      )
    };
    const { service, world, state } = setup(undefined, off);

    expect(await service.lint(joshi)).toEqual({
      ok: true,
      diagnostics: [],
      truncated: false
    });
    expect(state.hostsCreated).toBe(0);
    expect(world.children).toHaveLength(0);
  });

  it("falls back to the defaults when the stored settings cannot be read", async () => {
    const world = createFakeWorkerWorld({ lint: realLint, realDictionary });
    const service = createInstantJapaneseLintService({
      createHost: (getSettings) => {
        const host = createJapaneseLintHost({
          ...world.deps,
          getSettings,
          logger: { log: () => undefined }
        });

        hosts.push(host);

        return host;
      },
      settingsProvider: async () => {
        throw new Error("settings.json unreadable");
      },
      logger: { log: () => undefined }
    });

    expect(await ruleIds(service, joshi)).toContain("no-doubled-joshi");
  });
});

describe("existing behavior is preserved (#625 P1c)", () => {
  it("answers too-large without ever starting the Worker", async () => {
    const { service, world, state } = setup();

    for (const [format, ext] of [
      ["markdown", ".md"],
      ["markdown", ".markdown"],
      ["text", ".txt"]
    ] as const) {
      expect(
        await service.lint({
          text: "あ".repeat(JAPANESE_LINT_MAX_SOURCE_LENGTH + 1),
          format,
          ext
        })
      ).toEqual({ ok: false, reason: "too-large" });
    }

    expect(state.hostsCreated).toBe(0);
    expect(world.children).toHaveLength(0);
  });

  it("still lints a document exactly at the limit", async () => {
    const { service, world } = setup({
      lint: async () => [],
      realDictionary
    });
    const response = await service.lint({
      text: "あ".repeat(JAPANESE_LINT_MAX_SOURCE_LENGTH),
      format: "text",
      ext: ".txt"
    });

    expect(response).toEqual({ ok: true, diagnostics: [], truncated: false });
    expect(world.children).toHaveLength(1);
  });

  it("truncates a result over the cap, keeping the earliest diagnostics", async () => {
    const many = Array.from({ length: JAPANESE_LINT_MAX_RESULT_COUNT + 500 }, (_, index) => ({
      ruleId: "no-doubled-joshi",
      severity: "error" as const,
      message: "m",
      line: 1,
      column: 1,
      index
    }));
    const { service } = setup({ lint: async () => many, realDictionary });
    const response = await service.lint(joshi);

    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.truncated).toBe(true);
      expect(response.diagnostics).toHaveLength(JAPANESE_LINT_MAX_RESULT_COUNT);
      expect(response.diagnostics[0]?.index).toBe(0);
      expect(response.diagnostics.at(-1)?.index).toBe(JAPANESE_LINT_MAX_RESULT_COUNT - 1);
    }
  });

  it("does not flag a result exactly at the cap as truncated", async () => {
    const exact = Array.from({ length: JAPANESE_LINT_MAX_RESULT_COUNT }, (_, index) => ({
      ruleId: "r",
      severity: "warning" as const,
      message: "m",
      line: 1,
      column: 1,
      index
    }));
    const { service } = setup({ lint: async () => exact, realDictionary });
    const response = await service.lint(joshi);

    expect(response.ok && response.truncated).toBe(false);
  });
});

describe("superseded requests (#625 P1c)", () => {
  it("cancels a job that is still queued when a newer request arrives, and never a running one", async () => {
    const stuck = gate();
    const seen: string[] = [];
    const { service, world } = setup({
      lint: async (source, options) => {
        seen.push(source);

        if (source === "A。") {
          await stuck.opened;
        }

        return realLint(source, options);
      },
      realDictionary
    });
    const a = service.lint({ text: "A。", format: "text", ext: ".txt" });

    await vi.waitFor(() => expect(seen).toEqual(["A。"]));

    const b = service.lint({ text: "B。", format: "text", ext: ".txt" });

    await vi.waitFor(() =>
      expect(
        world.children[0]?.received.filter((m) => JSON.stringify(m).includes('"lintDocument"'))
      ).toHaveLength(2)
    );

    const c = service.lint({ text: "C。", format: "text", ext: ".txt" });

    // B (queued behind running A) is superseded by C; A keeps running.
    expect(await b).toEqual({ ok: false, reason: "lint-failed" });
    await vi.waitFor(() => expect(world.children[0]?.received.some((m) => (m as { type?: string }).type === "cancel")).toBe(true));
    stuck.release();
    expect((await a).ok).toBe(true);
    expect((await c).ok).toBe(true);
    expect(seen).not.toContain("B。");
    expect(world.children).toHaveLength(1);
  });
});

describe("logging privacy on the instant Worker path (#625 P1c)", () => {
  const runtime = {
    appVersion: "0.1.0",
    platform: "win32",
    arch: "x64",
    locale: "ja",
    electronVersion: "43.4.0",
    nodeVersion: "24.19.0",
    debugMode: true
  } as const;
  const written = (events: Logged[]): string =>
    JSON.stringify(
      events.map((event) => ({
        event: event.event,
        details: sanitizeDebugLogDetails(event.details ?? {}, {
          runtime,
          isKnownProjectRef: () => false,
          isKnownDocumentRef: () => false
        } as never)
      }))
    );

  it("logs counts, ids and flags only - never text, names, paths or raw errors", async () => {
    const hostile = new TypeError(`${secretText} ${secretPath}`);

    hostile.stack = `TypeError: ${secretText}\n    at leak (${secretPath}:1:1)`;

    const ok = setup();

    await ok.service.lint({ text: `${secretText}\n私は彼は好きだ。`, format: "markdown", ext: ".md" });

    const failing = setup({
      lint: async () => {
        throw hostile;
      },
      realDictionary
    });

    await failing.service.lint({ text: secretText, format: "text", ext: ".txt" });

    const okLog = written(ok.events);
    const failLog = written(failing.events);

    expect(okLog).toContain('"linterMode":"instant-worker"');
    expect(okLog).toContain('"lintFormat":"markdown"');
    expect(failLog).toContain('"failureReason":"lint-failed"');

    const run = ok.events.find((e) => e.event === "japaneseLint.run.completed");

    expect(run?.details).toMatchObject({
      result: "succeeded",
      characterLength: secretText.length + 1 + "私は彼は好きだ。".length,
      lineCount: 2,
      extension: ".md"
    });
    expect(Array.isArray(run?.details?.enabledRuleIds)).toBe(true);

    for (const log of [okLog, failLog]) {
      for (const forbidden of ["秘密", secretFile, "tanaka_taro", "Documents", "at leak"]) {
        expect(log, forbidden).not.toContain(forbidden);
      }
    }
  });

  it("keeps working when the logger itself throws", async () => {
    const world = createFakeWorkerWorld({ lint: realLint, realDictionary });
    const throwing = {
      log: () => {
        throw new Error("sink down");
      }
    };
    const service = createInstantJapaneseLintService({
      createHost: (getSettings) => {
        const host = createJapaneseLintHost({
          ...world.deps,
          getSettings,
          logger: throwing
        });

        hosts.push(host);

        return host;
      },
      settingsProvider: async () => undefined,
      logger: throwing
    });

    expect((await service.lint(joshi)).ok).toBe(true);
  });
});
