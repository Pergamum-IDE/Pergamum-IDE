import iconv from "iconv-lite";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JAPANESE_MACHINE_CHECK_CHANNELS } from "../../src/shared/api";

const electronMock = vi.hoisted(() => ({ ipcHandle: vi.fn() }));

vi.mock("electron", () => ({
  app: { getAppPath: () => process.cwd(), isPackaged: false },
  ipcMain: { handle: electronMock.ipcHandle },
  MessageChannelMain: class {},
  utilityProcess: { fork: () => undefined }
}));

import { sanitizeDebugLogDetails } from "../../src/main/debugLogSanitizer";
import {
  createInstantJapaneseLintService,
  type InstantJapaneseLintService
} from "../../src/main/japaneseLintIpc";
import {
  createJapaneseMachineCheckService,
  disposeJapaneseMachineCheck,
  registerJapaneseMachineCheckIpc,
  resolveInsideProject,
  type JapaneseMachineCheckService
} from "../../src/main/japaneseMachineCheckIpc";
import {
  createJapaneseLintHost,
  type JapaneseLintHost
} from "../../src/main/linterWorker/japaneseLintHost";
import { lintJapanese } from "../../src/main/textlint/japaneseLintEngine";
import type { JapaneseMachineCheckProgress } from "../../src/shared/japaneseMachineCheck";
import {
  createFakeWorkerWorld,
  type FakeLint,
  type FakeWorkerOptions
} from "./linterWorker/fakeWorkerWorld";

const realDictionary = path.join(process.cwd(), "node_modules", "kuromoji", "dict");
const root = path.resolve("C:\\Novel");

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

const hosts: JapaneseLintHost[] = [];

afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.dispose()));
});

const joshi = "私は彼は好きだ。";
const secretText = "秘密の本文です。";
const secretFile = "secret-chapter.md";

function gate() {
  let release!: () => void;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });

  return { opened, release };
}

function setup(
  files: Record<string, Uint8Array | string> = { "a.md": joshi },
  worldOptions: FakeWorkerOptions = { lint: realLint, realDictionary },
  state: {
    settings?: unknown;
    encoding?: string;
    projectRoot?: string | null;
    readFailure?: boolean;
    /** What the save dialog answers: a path, or null = canceled. */
    saveTarget?: string | null;
    writeFailure?: boolean;
    dialogFailure?: boolean;
    language?: "ja" | "en";
  } = {}
) {
  const world = createFakeWorkerWorld(worldOptions);
  const events: Logged[] = [];
  const writes: { path: string; content: string }[] = [];
  const dialogs: string[] = [];
  const created: JapaneseLintHost[] = [];
  const logger = { log: (input: Logged) => void events.push(input) } as never;
  const service: JapaneseMachineCheckService = createJapaneseMachineCheckService({
    createHost: (getSettings) => {
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
      created.push(host);

      return host;
    },
    currentProjectRootPath: () =>
      state.projectRoot === undefined ? root : state.projectRoot,
    settingsProvider: async () => state.settings,
    textEncodingProvider: async () => state.encoding ?? "utf8",
    readFile: async (absolute) => {
      if (state.readFailure) {
        throw new Error(`ENOENT ${absolute} ${secretText}`);
      }

      const key = path.relative(root, absolute).replace(/\\/g, "/");
      const content = files[key];

      if (content === undefined) {
        throw new Error(`ENOENT ${absolute}`);
      }

      return typeof content === "string"
        ? new TextEncoder().encode(content)
        : content;
    },
    showSaveDialog: async (defaultPath) => {
      dialogs.push(defaultPath);

      if (state.dialogFailure) {
        throw new Error("dialog exploded");
      }

      return state.saveTarget === undefined ? defaultPath : state.saveTarget;
    },
    writeReport: async (absolute, content) => {
      if (state.writeFailure) {
        throw new Error(`EACCES ${absolute} ${secretText}`);
      }

      writes.push({ path: absolute, content });
    },
    languageProvider: async () => state.language ?? "ja",
    now: () => new Date(2026, 8, 30, 2, 31),
    logger
  });

  return { service, world, events, created, state, writes, dialogs };
}

const lintDocumentsReceived = (child: { received: unknown[] } | undefined) =>
  (child?.received ?? []).filter(
    (m) => (m as { type?: string }).type === "lintDocument"
  ).length;

describe("prepare (#625 P2a)", () => {
  it("returns name, extension, format, sizes, enabled rules and an estimate", async () => {
    const { service, created } = setup({ "sub/a.md": `${joshi}\n二行目。` });
    const result = await service.prepare({ relativePath: "sub/a.md" });

    expect(result).toMatchObject({
      ok: true,
      fileName: "a.md",
      ext: ".md",
      format: "markdown",
      sourceChars: joshi.length + 1 + 4,
      sourceLines: 2,
      isDirty: false,
      estimate: "short"
    });
    expect(result.ok && result.enabledRuleIds).toContain("max-ten");
    expect(result.ok && result.enabledRuleIds).not.toContain("sentence-length");
    // Preparing never starts a Worker.
    expect(created).toHaveLength(0);
  });

  it("classifies .markdown and .txt", async () => {
    const { service } = setup({ "b.markdown": joshi, "c.txt": joshi });

    expect(await service.prepare({ relativePath: "b.markdown" })).toMatchObject({
      ok: true,
      format: "markdown",
      ext: ".markdown"
    });
    expect(await service.prepare({ relativePath: "c.txt" })).toMatchObject({
      ok: true,
      format: "text",
      ext: ".txt"
    });
  });

  it("carries the dirty flag through", async () => {
    const { service } = setup();

    expect(
      await service.prepare({ relativePath: "a.md", isDirty: true })
    ).toMatchObject({ ok: true, isDirty: true });
  });

  it("classes the size for the estimate", async () => {
    const { service } = setup({
      "m.md": "あ".repeat(50_000),
      "l.md": "あ".repeat(150_000)
    });

    expect(await service.prepare({ relativePath: "m.md" })).toMatchObject({
      estimate: "medium"
    });
    expect(await service.prepare({ relativePath: "l.md" })).toMatchObject({
      estimate: "long"
    });
  });

  it("lists no rules when every rule is off", async () => {
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
    const { service } = setup(undefined, undefined, { settings: off });

    expect(await service.prepare({ relativePath: "a.md" })).toMatchObject({
      ok: true,
      enabledRuleIds: []
    });
  });

  it("refuses safely: bad input, unsupported files, no project, escapes, unreadable files", async () => {
    const { service } = setup({ "a.md": joshi });

    for (const bad of [undefined, null, 5, "a.md", {}, { relativePath: "" }]) {
      expect(await service.prepare(bad)).toEqual({
        ok: false,
        reason: "invalid-request"
      });
    }
    expect(await service.prepare({ relativePath: "cover.png" })).toEqual({
      ok: false,
      reason: "unsupported-file"
    });
    expect(await service.prepare({ relativePath: "..\\..\\secret.md" })).toEqual({
      ok: false,
      reason: "invalid-request"
    });
    expect(await service.prepare({ relativePath: "C:\\other\\x.md" })).toEqual({
      ok: false,
      reason: "invalid-request"
    });
    expect(await service.prepare({ relativePath: "missing.md" })).toEqual({
      ok: false,
      reason: "read-failed"
    });

    const noProject = setup(undefined, undefined, { projectRoot: null });

    expect(await noProject.service.prepare({ relativePath: "a.md" })).toEqual({
      ok: false,
      reason: "no-project"
    });
  });

  it("resolveInsideProject rejects anything outside the root", () => {
    expect(resolveInsideProject(root, "a.md")).toBe(path.join(root, "a.md"));
    expect(resolveInsideProject(root, "sub/../a.md")).toBe(path.join(root, "a.md"));
    expect(resolveInsideProject(root, "../x.md")).toBeNull();
    expect(resolveInsideProject(root, "sub/../../x.md")).toBeNull();
    expect(resolveInsideProject(root, ".")).toBeNull();
    expect(resolveInsideProject(root, "C:\\x.md")).toBeNull();
  });

  it("decodes .txt with the configured encoding, falling back to Shift_JIS", async () => {
    const sjis = iconv.encode(joshi, "shift_jis");
    const configured = setup({ "s.txt": sjis }, undefined, { encoding: "shiftJis" });
    const fallback = setup({ "s.txt": sjis }, undefined, { encoding: "utf8" });

    for (const { service } of [configured, fallback]) {
      expect(await service.prepare({ relativePath: "s.txt" })).toMatchObject({
        ok: true,
        sourceChars: joshi.length
      });
    }
  });

  it("counts CRLF text like the editor does (one line break each)", async () => {
    const { service } = setup({ "crlf.md": "あ\r\nい\r\nう" });

    expect(await service.prepare({ relativePath: "crlf.md" })).toMatchObject({
      sourceChars: 5,
      sourceLines: 3
    });
  });
});

describe("run (#625 P2a)", () => {
  it("lints .md, .markdown and .txt in a Worker and aggregates per rule", async () => {
    const { service, world } = setup({ "a.md": joshi, "b.markdown": joshi, "c.txt": joshi });

    for (const file of ["a.md", "b.markdown", "c.txt"]) {
      const result = await service.run({ relativePath: file });

      expect(result.ok, file).toBe(true);
      if (result.ok) {
        expect(result.summary.fileName).toBe(file);
        expect(result.summary.totalMessages).toBeGreaterThan(0);
        expect(result.summary.returnedMessages).toBe(result.summary.totalMessages);
        expect(result.summary.truncated).toBe(false);
        expect(result.summary.ruleCounts.map((c) => c.ruleId)).toContain(
          "no-doubled-joshi"
        );
        expect(
          result.summary.ruleCounts.reduce((sum, c) => sum + c.count, 0)
        ).toBe(result.summary.returnedMessages);
      }
    }
    // One Worker per run.
    expect(world.children).toHaveLength(3);
  }, 30_000);

  it("reports the rule counts in catalog order", async () => {
    const many = [
      { ruleId: "no-doubled-joshi", n: 2 },
      { ruleId: "max-ten", n: 3 }
    ].flatMap(({ ruleId, n }) =>
      Array.from({ length: n }, (_, index) => ({
        ruleId,
        severity: "warning" as const,
        message: "m",
        line: 1,
        column: 1,
        index
      }))
    );
    const { service } = setup(undefined, { lint: async () => many, realDictionary });
    const result = await service.run({ relativePath: "a.md" });

    expect(result.ok && result.summary.ruleCounts).toEqual([
      { ruleId: "max-ten", count: 3 },
      { ruleId: "no-doubled-joshi", count: 2 }
    ]);
  });

  it("caps at 1,000 and reports the true total and truncated", async () => {
    const many = Array.from({ length: 1500 }, (_, index) => ({
      ruleId: "no-doubled-joshi",
      severity: "warning" as const,
      message: "m",
      line: 1,
      column: 1,
      index
    }));
    const { service } = setup(undefined, { lint: async () => many, realDictionary });
    const result = await service.run({ relativePath: "a.md" });

    expect(result.ok && result.summary).toMatchObject({
      totalMessages: 1500,
      returnedMessages: 1000,
      truncated: true,
      ruleCounts: [{ ruleId: "no-doubled-joshi", count: 1000 }]
    });
  });

  it("honours rule switches and numeric options from Settings", async () => {
    const commas = "私は、朝に、昼に、夜に、犬と散歩をした。";
    const { service, state } = setup({ "a.md": joshi, "c.txt": commas });
    const ruleIds = async (file: string) => {
      const result = await service.run({ relativePath: file });

      return result.ok ? result.summary.ruleCounts.map((c) => c.ruleId) : [];
    };

    expect(await ruleIds("a.md")).toContain("no-doubled-joshi");
    state.settings = { rules: { "no-doubled-joshi": { enabled: false } } };
    expect(await ruleIds("a.md")).not.toContain("no-doubled-joshi");

    state.settings = undefined;
    expect(await ruleIds("c.txt")).not.toContain("max-ten");
    state.settings = { rules: { "max-ten": { options: { max: 3 } } } };
    expect(await ruleIds("c.txt")).toContain("max-ten");
  });

  it("keeps sentence-length off by default, and applies it once on", async () => {
    const long = `${"あ".repeat(60)}。`;
    const { service, state } = setup({ "a.md": long });
    const ids = async () => {
      const result = await service.run({ relativePath: "a.md" });

      return result.ok ? result.summary.ruleCounts.map((c) => c.ruleId) : [];
    };

    expect(await ids()).not.toContain("sentence-length");
    state.settings = { rules: { "sentence-length": { enabled: true, options: { max: 40 } } } };
    expect(await ids()).toContain("sentence-length");
  });

  it("refuses to run with every rule off, and never starts a Worker", async () => {
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
    const { service, created } = setup(undefined, undefined, { settings: off });

    expect(await service.run({ relativePath: "a.md" })).toEqual({
      ok: false,
      reason: "no-rules"
    });
    expect(created).toHaveLength(0);
  });

  it("never rejects, whatever the input", async () => {
    const { service } = setup();

    for (const bad of [undefined, null, 0, "x", {}, [], { relativePath: 1 }]) {
      await expect(service.run(bad)).resolves.toMatchObject({ ok: false });
    }
    await expect(service.run({ relativePath: "missing.md" })).resolves.toEqual({
      ok: false,
      reason: "read-failed"
    });
    await expect(service.run({ relativePath: "cover.png" })).resolves.toEqual({
      ok: false,
      reason: "unsupported-file"
    });
  });

  it("reports coarse progress stages", async () => {
    const { service } = setup();
    const stages: string[] = [];

    await service.run({ relativePath: "a.md" }, (p: JapaneseMachineCheckProgress) =>
      stages.push(p.stage)
    );

    expect(stages).toEqual(["starting", "dictionary-check", "lint-running", "aggregating"]);
  });

  it("a throwing progress listener does not break the run", async () => {
    const { service } = setup();
    const result = await service.run({ relativePath: "a.md" }, () => {
      throw new Error("renderer gone");
    });

    expect(result.ok).toBe(true);
  });

  it("runs only one check at a time", async () => {
    const stuck = gate();
    const { service, world } = setup(undefined, {
      lint: async () => {
        await stuck.opened;

        return [];
      },
      realDictionary
    });
    const first = service.run({ relativePath: "a.md" });

    await vi.waitFor(() => expect(lintDocumentsReceived(world.children[0])).toBe(1));
    expect(await service.run({ relativePath: "a.md" })).toEqual({
      ok: false,
      reason: "busy"
    });
    stuck.release();
    expect((await first).ok).toBe(true);
    // ... and the next one is fine again.
    expect((await service.run({ relativePath: "a.md" })).ok).toBe(true);
  });
});

describe("Worker lifecycle (#625 P2a)", () => {
  it("starts the Worker lazily at run and disposes it when the run ends", async () => {
    const { service, world, created } = setup();

    expect(created).toHaveLength(0);
    await service.prepare({ relativePath: "a.md" });
    expect(created).toHaveLength(0);

    await service.run({ relativePath: "a.md" });
    expect(created).toHaveLength(1);
    await vi.waitFor(() => expect(created[0]?.getState()).toBe("disposed"));
    expect(world.children[0]?.exited || world.children[0]?.killed).toBe(true);
  });

  it("a Worker failure is a safe failure and the next run works", async () => {
    let failOnce = true;
    const { service, world } = setup(undefined, {
      lint: async (...args) => {
        if (failOnce) {
          failOnce = false;
          throw new Error(`boom ${secretText}`);
        }

        return realLint(...args);
      },
      realDictionary
    });

    expect(await service.run({ relativePath: "a.md" })).toEqual({
      ok: false,
      reason: "lint-failed"
    });
    expect((await service.run({ relativePath: "a.md" })).ok).toBe(true);
    expect(world.children).toHaveLength(2);
  });

  it("a Worker that dies mid-run is a safe failure", async () => {
    const stuck = gate();
    const { service, world } = setup(undefined, {
      lint: async () => {
        await stuck.opened;

        return [];
      },
      realDictionary
    });
    const pending = service.run({ relativePath: "a.md" });

    await vi.waitFor(() => expect(lintDocumentsReceived(world.children[0])).toBe(1));
    world.children[0]!.crash(1);

    expect(await pending).toEqual({ ok: false, reason: "lint-failed" });
    stuck.release();
  });

  it("a missing dictionary is a safe failure", async () => {
    const { service } = setup(undefined, {
      lint: realLint,
      realDictionary,
      dictionaryExists: false
    });

    expect(await service.run({ relativePath: "a.md" })).toEqual({
      ok: false,
      reason: "worker-failed"
    });
  });

  it("dispose() (app quit) stops a run in flight", async () => {
    const stuck = gate();
    const { service, world } = setup(undefined, {
      lint: async () => {
        await stuck.opened;

        return [];
      },
      realDictionary
    });
    const pending = service.run({ relativePath: "a.md" });

    await vi.waitFor(() => expect(lintDocumentsReceived(world.children[0])).toBe(1));
    await service.dispose();

    expect(await pending).toEqual({ ok: false, reason: "canceled" });
    stuck.release();
  });

  it("the module-level dispose is a harmless no-op before any use", async () => {
    await expect(disposeJapaneseMachineCheck()).resolves.toBeUndefined();
  });
});

describe("cancel (#625 P2a)", () => {
  it("cancels a running check: canceled, and the late result is never adopted", async () => {
    const stuck = gate();
    const { service, world, created } = setup(undefined, {
      lint: async (...args) => {
        await stuck.opened;

        return realLint(...args);
      },
      realDictionary
    });
    const pending = service.run({ relativePath: "a.md" });

    await vi.waitFor(() => expect(lintDocumentsReceived(world.children[0])).toBe(1));
    await service.cancel();

    expect(await pending).toEqual({ ok: false, reason: "canceled" });

    // textlint finishes after the cancel: nothing changes.
    stuck.release();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await vi.waitFor(() => expect(created[0]?.getState()).toBe("disposed"));
  });

  it("cancel is safe to call repeatedly, and when nothing runs", async () => {
    const stuck = gate();
    const { service, world } = setup(undefined, {
      lint: async () => {
        await stuck.opened;

        return [];
      },
      realDictionary
    });

    await expect(service.cancel()).resolves.toBeUndefined();

    const pending = service.run({ relativePath: "a.md" });

    await vi.waitFor(() => expect(lintDocumentsReceived(world.children[0])).toBe(1));
    await Promise.all([service.cancel(), service.cancel(), service.cancel()]);
    expect(await pending).toEqual({ ok: false, reason: "canceled" });
    await expect(service.cancel()).resolves.toBeUndefined();
    stuck.release();
  });

  it("a cancel that arrives before the Worker exists still wins", async () => {
    const { service, created } = setup();
    const pending = service.run({ relativePath: "a.md" });

    // run() has not passed its first await yet.
    await service.cancel();

    expect(await pending).toEqual({ ok: false, reason: "canceled" });
    void created;
  });

  it("after a cancel the next run works with a fresh Worker", async () => {
    const stuck = gate();
    let first = true;
    const { service, world } = setup(undefined, {
      lint: async (source, options) => {
        if (first) {
          first = false;
          await stuck.opened;
        }

        return realLint(source, options);
      },
      realDictionary
    });
    const pending = service.run({ relativePath: "a.md" });

    await vi.waitFor(() => expect(lintDocumentsReceived(world.children[0])).toBe(1));
    await service.cancel();
    await pending;

    expect((await service.run({ relativePath: "a.md" })).ok).toBe(true);
    stuck.release();
  });
});

describe("Instant Linter independence (#625 P2a)", () => {
  it("releasing the instant Worker does not stop a running check, and vice versa", async () => {
    const stuck = gate();
    const wizard = setup(undefined, {
      lint: async () => {
        await stuck.opened;

        return [];
      },
      realDictionary
    });
    const instantWorld = createFakeWorkerWorld({ lint: realLint, realDictionary });
    const instant: InstantJapaneseLintService = createInstantJapaneseLintService({
      createHost: (getSettings) => {
        const host = createJapaneseLintHost({
          ...instantWorld.deps,
          getSettings,
          logger: { log: () => undefined }
        });

        hosts.push(host);

        return host;
      },
      settingsProvider: async () => undefined,
      logger: { log: () => undefined }
    });
    const running = wizard.service.run({ relativePath: "a.md" });

    await vi.waitFor(() =>
      expect(lintDocumentsReceived(wizard.world.children[0])).toBe(1)
    );

    // The instant linter works and is released while the wizard runs.
    expect(
      (await instant.lint({ text: joshi, format: "text", ext: ".txt" })).ok
    ).toBe(true);
    await instant.release();
    expect(wizard.created[0]?.getState()).toBe("ready");

    stuck.release();
    expect((await running).ok).toBe(true);

    // Separate processes.
    expect(instantWorld.children).toHaveLength(1);
    expect(wizard.world.children).toHaveLength(1);
  });

  it("a wizard cancel (which ends its Worker) leaves the instant Worker alone", async () => {
    const stuck = gate();
    const wizard = setup(undefined, {
      lint: async () => {
        await stuck.opened;

        return [];
      },
      realDictionary
    });
    const instantWorld = createFakeWorkerWorld({ lint: realLint, realDictionary });
    const instant = createInstantJapaneseLintService({
      createHost: (getSettings) => {
        const host = createJapaneseLintHost({
          ...instantWorld.deps,
          getSettings,
          logger: { log: () => undefined }
        });

        hosts.push(host);

        return host;
      },
      settingsProvider: async () => undefined,
      logger: { log: () => undefined }
    });

    await instant.lint({ text: joshi, format: "text", ext: ".txt" });

    const running = wizard.service.run({ relativePath: "a.md" });

    await vi.waitFor(() =>
      expect(lintDocumentsReceived(wizard.world.children[0])).toBe(1)
    );
    await wizard.service.cancel();
    await running;

    expect(instantWorld.children[0]?.exited).toBe(false);
    expect(
      (await instant.lint({ text: joshi, format: "text", ext: ".txt" })).ok
    ).toBe(true);
    expect(instantWorld.children).toHaveLength(1);
    stuck.release();
  });
});

describe("Markdown report save (#625 P2b)", () => {
  const sub = "sub";
  const summaryOf = async (
    ctx: ReturnType<typeof setup>,
    relativePath = `${sub}/a.md`
  ): Promise<string> => {
    const result = await ctx.service.run({ relativePath });

    if (!result.ok) {
      throw new Error(`run failed: ${result.reason}`);
    }

    return result.summary.resultId;
  };

  it("saves the report of a finished run, defaulting next to the file as <name>.lint.md", async () => {
    const ctx = setup({ [`${sub}/a.md`]: joshi });
    const resultId = await summaryOf(ctx);
    const saved = await ctx.service.saveReport({ resultId });

    expect(saved).toEqual({ ok: true, fileName: "a.md.lint.md" });
    expect(ctx.dialogs).toEqual([path.join(root, sub, "a.md.lint.md")]);
    expect(ctx.writes).toHaveLength(1);
    expect(ctx.writes[0]?.path).toBe(path.join(root, sub, "a.md.lint.md"));

    const report = ctx.writes[0]!.content;

    expect(report).toContain("# 日本語表現チェック結果");
    expect(report).toContain("| ファイル | a.md |");
    expect(report).toContain("| 実行日時 | 2026-09-30 02:31 |");
    expect(report).toContain("### 助詞の重なり\n");
    expect(report).not.toContain("助詞の重なりをチェック");
    expect(report).toContain("`no-doubled-joshi`");
    // A short snippet of the checked text, not the whole thing.
    expect(report).toContain("私は彼は好きだ。");
  });

  it("keeps the original extension for .txt and .markdown", async () => {
    const ctx = setup({ "c.txt": joshi, "d.markdown": joshi });

    await ctx.service.saveReport({ resultId: await summaryOf(ctx, "c.txt") });
    await ctx.service.saveReport({ resultId: await summaryOf(ctx, "d.markdown") });

    expect(ctx.dialogs).toEqual([
      path.join(root, "c.txt.lint.md"),
      path.join(root, "d.markdown.lint.md")
    ]);
  });

  it("writes the user's chosen path, not the default", async () => {
    const chosen = path.join(root, "reports", "mine.md");
    const ctx = setup({ "a.md": joshi }, undefined, { saveTarget: chosen });

    expect(await ctx.service.saveReport({ resultId: await summaryOf(ctx, "a.md") })).toEqual(
      { ok: true, fileName: "mine.md" }
    );
    expect(ctx.writes[0]?.path).toBe(chosen);
  });

  it("can save a run with no findings", async () => {
    const ctx = setup({ "a.md": "今日は晴れです。" });
    const saved = await ctx.service.saveReport({ resultId: await summaryOf(ctx, "a.md") });

    expect(saved.ok).toBe(true);
    expect(ctx.writes[0]?.content).toContain("指摘はありませんでした。");
  });

  it("a truncated run's report carries the cap notice and only the returned findings", async () => {
    const many = Array.from({ length: 1500 }, (_, index) => ({
      ruleId: "no-doubled-joshi",
      severity: "warning" as const,
      message: "助詞が連続しています。",
      line: 1,
      column: 1,
      index
    }));
    const ctx = setup({ "a.md": "あ".repeat(2000) }, { lint: async () => many, realDictionary });

    await ctx.service.saveReport({ resultId: await summaryOf(ctx, "a.md") });

    const report = ctx.writes[0]!.content;

    expect(report).toContain("| 総指摘数 | 1,500 |");
    expect(report).toContain("| 表示対象の指摘数 | 1,000 |");
    expect(report).toContain("| 省略 | あり |");
    expect(report).toContain("詳細は最初の 1,000 件に制限されています");
    expect(report).toContain("チェック項目別件数は、表示対象の指摘に基づきます");
    expect(report.match(/^#### /gm)).toHaveLength(1000);
  });

  it("uses the UI language for the report", async () => {
    const ctx = setup({ "a.md": joshi }, undefined, { language: "en" });

    await ctx.service.saveReport({ resultId: await summaryOf(ctx, "a.md") });

    expect(ctx.writes[0]?.content).toContain("# Japanese Style Check Results");
  });

  it("is not-ready before any run, for an unknown id, and after the result was discarded", async () => {
    const ctx = setup();

    expect(await ctx.service.saveReport({ resultId: "nope" })).toEqual({
      ok: false,
      reason: "not-ready"
    });

    const resultId = await summaryOf(ctx, "a.md");

    expect(await ctx.service.saveReport({ resultId: "other-id" })).toEqual({
      ok: false,
      reason: "not-ready"
    });
    await ctx.service.discardResult({ resultId });
    expect(await ctx.service.saveReport({ resultId })).toEqual({
      ok: false,
      reason: "not-ready"
    });
    expect(ctx.writes).toHaveLength(0);
    expect(ctx.dialogs).toHaveLength(0);
  });

  it("is not-ready while a new run replaces the previous result, and for a canceled/failed run", async () => {
    const stuck = gate();
    const ctx = setup(undefined, {
      lint: async (...args) => {
        await stuck.opened;

        return realLint(...args);
      },
      realDictionary
    });
    const first = ctx.service.run({ relativePath: "a.md" });

    await vi.waitFor(() => expect(lintDocumentsReceived(ctx.world.children[0])).toBe(1));
    // Nothing finished yet.
    expect(await ctx.service.saveReport({ resultId: "x" })).toEqual({
      ok: false,
      reason: "not-ready"
    });
    await ctx.service.cancel();
    await first;
    stuck.release();
    expect(await ctx.service.saveReport({ resultId: "x" })).toEqual({
      ok: false,
      reason: "not-ready"
    });
  });

  it("rejects malformed requests as not-ready and never rejects", async () => {
    const ctx = setup();

    for (const bad of [undefined, null, 5, "id", {}, { resultId: 3 }, { resultId: "a b" }]) {
      await expect(ctx.service.saveReport(bad)).resolves.toEqual({
        ok: false,
        reason: "not-ready"
      });
    }
  });

  it("a canceled save dialog is 'canceled' and writes nothing", async () => {
    const ctx = setup({ "a.md": joshi }, undefined, { saveTarget: null });
    const resultId = await summaryOf(ctx, "a.md");

    expect(await ctx.service.saveReport({ resultId })).toEqual({
      ok: false,
      reason: "canceled"
    });
    expect(ctx.writes).toHaveLength(0);

    // The result is still there for another try.
    ctx.state.saveTarget = path.join(root, "again.md");
    expect((await ctx.service.saveReport({ resultId })).ok).toBe(true);
  });

  it("a write failure is 'write-failed'", async () => {
    const ctx = setup({ "a.md": joshi }, undefined, { writeFailure: true });
    const resultId = await summaryOf(ctx, "a.md");

    expect(await ctx.service.saveReport({ resultId })).toEqual({
      ok: false,
      reason: "write-failed"
    });
  });

  it("refuses to overwrite the checked file or a Pergamum data file", async () => {
    const same = setup({ "a.md": joshi }, undefined, {
      saveTarget: path.join(root, "A.MD")
    });

    expect(await same.service.saveReport({ resultId: await summaryOf(same, "a.md") })).toEqual({
      ok: false,
      reason: "invalid-target"
    });
    expect(same.writes).toHaveLength(0);

    const data = setup({ "a.md": joshi }, undefined, {
      saveTarget: path.join(root, "pergamum.db")
    });

    expect(await data.service.saveReport({ resultId: await summaryOf(data, "a.md") })).toEqual({
      ok: false,
      reason: "invalid-target"
    });
    expect(data.writes).toHaveLength(0);
  });

  it("a save dialog that throws is a safe write-failed", async () => {
    const ctx = setup({ "a.md": joshi }, undefined, { dialogFailure: true });
    const resultId = await summaryOf(ctx, "a.md");

    expect(await ctx.service.saveReport({ resultId })).toEqual({
      ok: false,
      reason: "write-failed"
    });
  });

  it("logs counts and reasons only - never text, snippets, names, paths or raw errors", async () => {
    const chosen = path.join(root, "very-secret-folder", "out.md");
    const ok = setup({ [secretFile]: `${secretText}\n${joshi}` }, undefined, {
      saveTarget: chosen
    });
    const failing = setup({ [secretFile]: `${secretText}\n${joshi}` }, undefined, {
      saveTarget: chosen,
      writeFailure: true
    });
    const canceled = setup({ [secretFile]: `${secretText}\n${joshi}` }, undefined, {
      saveTarget: null
    });

    for (const ctx of [ok, failing, canceled]) {
      await ctx.service.saveReport({ resultId: await summaryOf(ctx, secretFile) });
    }

    const entry = ok.events.find((e) => e.details?.linterMode === "wizard-report");

    expect(entry?.details).toMatchObject({
      linterMode: "wizard-report",
      result: "succeeded",
      truncated: false
    });
    expect(typeof entry?.details?.totalMessages).toBe("number");
    expect(typeof entry?.details?.returnedMessages).toBe("number");
    expect(typeof entry?.details?.workerJobId).toBe("string");
    expect(
      failing.events.find((e) => e.details?.linterMode === "wizard-report")?.details
    ).toMatchObject({ result: "failed", failureReason: "write-failed" });

    const runtime = {
      appVersion: "0.1.0",
      platform: "win32",
      arch: "x64",
      locale: "ja",
      electronVersion: "43.4.0",
      nodeVersion: "24.19.0",
      debugMode: true
    } as const;

    for (const ctx of [ok, failing, canceled]) {
      const log = JSON.stringify(
        ctx.events.map((event) => ({
          event: event.event,
          details: sanitizeDebugLogDetails(event.details ?? {}, {
            runtime,
            isKnownProjectRef: () => false,
            isKnownDocumentRef: () => false
          } as never)
        }))
      );

      for (const forbidden of [
        "秘密",
        "私は彼",
        secretFile,
        "very-secret-folder",
        "out.md",
        "lint.md",
        "EACCES",
        "Novel"
      ]) {
        expect(log, forbidden).not.toContain(forbidden);
      }
    }
  });
});

describe("IPC registration (#625 P2a)", () => {
  it("registers prepare / run / cancel / saveReport / discardResult", () => {
    electronMock.ipcHandle.mockReset();
    registerJapaneseMachineCheckIpc();

    expect(electronMock.ipcHandle.mock.calls.map((c) => c[0])).toEqual([
      JAPANESE_MACHINE_CHECK_CHANNELS.prepare,
      JAPANESE_MACHINE_CHECK_CHANNELS.run,
      JAPANESE_MACHINE_CHECK_CHANNELS.cancel,
      JAPANESE_MACHINE_CHECK_CHANNELS.saveReport,
      JAPANESE_MACHINE_CHECK_CHANNELS.discardResult
    ]);
  });
});

describe("logging privacy (#625 P2a)", () => {
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

  it("logs sizes, counts and flags only - never text, file names, paths or raw errors", async () => {
    const hostile = new TypeError(`${secretText} C:\\Users\\tanaka_taro\\${secretFile}`);

    hostile.stack = `TypeError: ${secretText}\n    at leak (C:\\Users\\tanaka_taro\\${secretFile}:1:1)`;

    const ok = setup({ [secretFile]: `${secretText}\n${joshi}` });

    await ok.service.prepare({ relativePath: secretFile });
    await ok.service.run({ relativePath: secretFile });

    const failing = setup(
      { [secretFile]: secretText },
      {
        lint: async () => {
          throw hostile;
        },
        realDictionary
      }
    );

    await failing.service.run({ relativePath: secretFile });

    const unreadable = setup({}, undefined, { readFailure: true });

    await unreadable.service.run({ relativePath: secretFile });

    const run = ok.events.find(
      (e) => e.event === "japaneseLint.run.completed" && e.details?.linterMode === "wizard"
    );

    expect(run?.details).toMatchObject({
      linterMode: "wizard",
      result: "succeeded",
      lintFormat: "markdown",
      extension: ".md",
      lineCount: 2
    });
    expect(typeof run?.details?.totalMessages).toBe("number");
    expect(Array.isArray(run?.details?.enabledRuleIds)).toBe(true);

    for (const { events } of [ok, failing, unreadable]) {
      const log = written(events);

      for (const forbidden of [
        "秘密",
        secretFile,
        "tanaka_taro",
        "C:\\\\Users",
        "at leak",
        "ENOENT"
      ]) {
        expect(log, forbidden).not.toContain(forbidden);
      }
    }
    expect(written(failing.events)).toContain('"failureReason":"lint-failed"');
  });

  it("keeps working when the logger throws", async () => {
    const { service } = setup();
    // Rebuild with a throwing logger.
    const world = createFakeWorkerWorld({ lint: realLint, realDictionary });
    const throwing = {
      log: () => {
        throw new Error("sink down");
      }
    };
    const guarded = createJapaneseMachineCheckService({
      createHost: (getSettings) => {
        const host = createJapaneseLintHost({
          ...world.deps,
          getSettings,
          logger: throwing
        });

        hosts.push(host);

        return host;
      },
      currentProjectRootPath: () => root,
      settingsProvider: async () => undefined,
      textEncodingProvider: async () => "utf8",
      readFile: async () => new TextEncoder().encode(joshi),
      showSaveDialog: async (defaultPath) => defaultPath,
      writeReport: async () => undefined,
      languageProvider: async () => "ja",
      logger: throwing
    });

    void service;
    expect((await guarded.run({ relativePath: "a.md" })).ok).toBe(true);
  });
});
