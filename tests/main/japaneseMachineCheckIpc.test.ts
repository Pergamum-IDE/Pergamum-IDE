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
    /** Keeps the save dialog open until the test releases it. */
    saveGate?: Promise<void>;
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

      await state.saveGate;

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

  it("rejects POSIX, Windows drive and UNC absolute paths on every platform", () => {
    for (const absolute of [
      "/x.md",
      "/etc/passwd.md",
      "C:\\x.md",
      "C:/x.md",
      "c:x.md",
      "\\\\server\\share\\x.md",
      "//server/share/x.md",
      "\\x.md"
    ]) {
      expect(resolveInsideProject(root, absolute), absolute).toBeNull();
    }
  });

  it("keeps ordinary project-relative paths working", () => {
    expect(resolveInsideProject(root, "sub/a.md")).toBe(path.join(root, "sub", "a.md"));
    expect(resolveInsideProject(root, "..hidden.md")).toBe(
      path.join(root, "..hidden.md")
    );
    expect(resolveInsideProject(root, "日本語/章1.md")).toBe(
      path.join(root, "日本語", "章1.md")
    );
  });

  it("answers invalid-request without reading anything when the path is refused", async () => {
    const ctx = setup({ "a.md": joshi });
    const reads: string[] = [];
    const service = createJapaneseMachineCheckService({
      createHost: () => {
        throw new Error("no Worker for an invalid path");
      },
      currentProjectRootPath: () => root,
      settingsProvider: async () => undefined,
      textEncodingProvider: async () => "utf8",
      readFile: async (absolute) => {
        reads.push(absolute);

        return new TextEncoder().encode(joshi);
      },
      showSaveDialog: async (defaultPath) => defaultPath,
      writeReport: async () => undefined,
      languageProvider: async () => "ja",
      logger: { log: () => undefined }
    });

    void ctx;
    for (const relativePath of [
      "/x.md",
      "C:\\x.md",
      "C:/x.md",
      "\\\\server\\share\\x.md",
      "sub/../../x.md",
      "."
    ]) {
      expect(await service.prepare({ relativePath })).toEqual({
        ok: false,
        reason: relativePath === "." ? "unsupported-file" : "invalid-request"
      });
      expect(await service.run({ relativePath })).toEqual({
        ok: false,
        reason: relativePath === "." ? "unsupported-file" : "invalid-request"
      });
    }
    expect(reads).toEqual([]);
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

describe("lifecycle hardening (#625 P2c)", () => {
  const stuckSetup = (
    files: Record<string, string> = { "a.md": joshi },
    state: Parameters<typeof setup>[2] = {}
  ) => {
    const stuck = gate();
    const ctx = setup(
      files,
      {
        lint: async (...args) => {
          await stuck.opened;

          return realLint(...args);
        },
        realDictionary
      },
      state
    );

    return { ...ctx, stuck };
  };
  const startRun = async (
    ctx: ReturnType<typeof stuckSetup>,
    request: Record<string, unknown> = { relativePath: "a.md" },
    progress: (p: { runId: string; stage: string }) => void = () => undefined
  ) => {
    const pending = ctx.service.run(request, progress);

    await vi.waitFor(() =>
      expect(lintDocumentsReceived(ctx.world.children[0])).toBe(1)
    );

    return { pending };
  };
  const finishedResultId = async (
    ctx: ReturnType<typeof setup>,
    file = "a.md"
  ): Promise<string> => {
    const result = await ctx.service.run({ relativePath: file });

    if (!result.ok) {
      throw new Error(result.reason);
    }

    return result.summary.resultId;
  };

  describe.each(["closed", "switched"] as const)("project %s", (reason) => {
    it("cancels and disposes a running check", async () => {
      const ctx = stuckSetup();
      const { pending } = await startRun(ctx);

      await Promise.resolve();
      await vi.waitFor(() =>
        expect(lintDocumentsReceived(ctx.world.children[0])).toBe(1)
      );
      ctx.service.handleProjectBoundary(reason);

      expect(await pending).toEqual({ ok: false, reason: "canceled" });
      await vi.waitFor(() => expect(ctx.created[0]?.getState()).toBe("disposed"));

      // The Worker finishing later changes nothing.
      ctx.stuck.release();
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(await ctx.service.saveReport({ resultId: "anything" })).toEqual({
        ok: false,
        reason: "not-ready"
      });
    });

    it("discards a finished result and its text: the old id can no longer be saved", async () => {
      const ctx = setup({ "a.md": joshi });
      const resultId = await finishedResultId(ctx);

      ctx.service.handleProjectBoundary(reason);

      expect(await ctx.service.saveReport({ resultId })).toEqual({
        ok: false,
        reason: "not-ready"
      });
      expect(ctx.dialogs).toHaveLength(0);
      expect(ctx.writes).toHaveLength(0);
    });

    it("is idempotent and safe with nothing to clean", async () => {
      const ctx = setup();

      expect(() => {
        ctx.service.handleProjectBoundary(reason);
        ctx.service.handleProjectBoundary(reason);
      }).not.toThrow();
      expect(ctx.created).toHaveLength(0);
      // ... and a normal run works afterwards.
      expect((await ctx.service.run({ relativePath: "a.md" })).ok).toBe(true);
    });

    it("a run started right after can proceed once the old one has ended", async () => {
      const ctx = stuckSetup();
      const { pending: first } = await startRun(ctx);

      await vi.waitFor(() =>
        expect(lintDocumentsReceived(ctx.world.children[0])).toBe(1)
      );
      ctx.service.handleProjectBoundary(reason);
      await first;
      ctx.stuck.release();

      expect((await ctx.service.run({ relativePath: "a.md" })).ok).toBe(true);
    });

    it("drops a save that was waiting in the OS save dialog", async () => {
      let openDialog!: () => void;
      const dialogGate = new Promise<void>((resolve) => {
        openDialog = resolve;
      });
      const ctx = setup({ "a.md": joshi }, undefined, { saveGate: dialogGate });
      const resultId = await finishedResultId(ctx);
      const saving = ctx.service.saveReport({ resultId });

      await vi.waitFor(() => expect(ctx.dialogs).toHaveLength(1));
      ctx.service.handleProjectBoundary(reason);
      openDialog();

      expect(await saving).toEqual({ ok: false, reason: "not-ready" });
      expect(ctx.writes).toHaveLength(0);
    });
  });

  it("stops reporting progress once the project boundary was hit", async () => {
    const ctx = stuckSetup();
    const seen: { runId: string; stage: string }[] = [];
    const { pending } = await startRun(ctx, { relativePath: "a.md", runId: "run-a" }, (p) =>
      seen.push(p)
    );

    await vi.waitFor(() =>
      expect(lintDocumentsReceived(ctx.world.children[0])).toBe(1)
    );

    const before = seen.length;

    ctx.service.handleProjectBoundary("switched");
    ctx.stuck.release();
    await pending;

    expect(seen.length).toBe(before);
    expect(seen.every((p) => p.runId === "run-a")).toBe(true);
  });

  it("a result that only arrives after the project changed is never adopted (even without a notification)", async () => {
    const ctx = stuckSetup();
    const { pending } = await startRun(ctx);

    ctx.state.projectRoot = path.resolve("C:\\Other");
    ctx.stuck.release();

    expect(await pending).toEqual({ ok: false, reason: "canceled" });
    expect(await ctx.service.saveReport({ resultId: "x" })).toEqual({
      ok: false,
      reason: "not-ready"
    });
  });

  it("a stored result is not saved into another project even if no notification arrived", async () => {
    const ctx = setup({ "a.md": joshi });
    const resultId = await finishedResultId(ctx);

    ctx.state.projectRoot = path.resolve("C:\\Other");

    expect(await ctx.service.saveReport({ resultId })).toEqual({
      ok: false,
      reason: "not-ready"
    });
    expect(ctx.dialogs).toHaveLength(0);
  });

  describe("run ids", () => {
    it("tags progress with the caller's run id, or makes one up", async () => {
      const ctx = setup();
      const named: string[] = [];
      const anonymous: string[] = [];

      await ctx.service.run({ relativePath: "a.md", runId: "run-1" }, (p) =>
        named.push(p.runId)
      );
      await ctx.service.run({ relativePath: "a.md" }, (p) => anonymous.push(p.runId));

      expect(new Set(named)).toEqual(new Set(["run-1"]));
      expect(named.length).toBeGreaterThan(0);
      expect(new Set(anonymous).size).toBe(1);
      expect([...anonymous][0]).toMatch(/^[A-Za-z0-9_.-]{1,80}$/);
      expect([...anonymous][0]).not.toBe("run-1");
    });

    it("cancel({runId}) of another run does nothing; of the current run cancels it", async () => {
      const ctx = stuckSetup();
      const { pending } = await startRun(ctx, { relativePath: "a.md", runId: "run-now" });

      await ctx.service.cancel({ runId: "run-old" });
      await ctx.service.cancel({ runId: "bad id!" });
      ctx.stuck.release();

      expect((await pending).ok).toBe(true);

      const second = stuckSetup();
      const { pending: running } = await startRun(second, { relativePath: "a.md", runId: "run-now" });

      await second.service.cancel({ runId: "run-now" });
      expect(await running).toEqual({ ok: false, reason: "canceled" });
      second.stuck.release();
    });

    it("a late cancel of an earlier run cannot cancel the next run", async () => {
      const ctx = setup({ "a.md": joshi });

      await ctx.service.run({ relativePath: "a.md", runId: "run-1" });

      const stuck = gate();
      const second = setup(
        { "a.md": joshi },
        {
          lint: async (...args) => {
            await stuck.opened;

            return realLint(...args);
          },
          realDictionary
        }
      );
      const running = second.service.run({ relativePath: "a.md", runId: "run-2" });

      await vi.waitFor(() =>
        expect(lintDocumentsReceived(second.world.children[0])).toBe(1)
      );
      await second.service.cancel({ runId: "run-1" });
      stuck.release();

      expect((await running).ok).toBe(true);
    });

    it("a cancel that arrives while the file is still being read cancels that run", async () => {
      const ctx = setup({ "a.md": joshi });
      const pending = ctx.service.run({ relativePath: "a.md", runId: "run-early" });

      await ctx.service.cancel({ runId: "run-early" });

      expect(await pending).toEqual({ ok: false, reason: "canceled" });
    });

    it("cancel never rejects, whatever it is given", async () => {
      const ctx = setup();

      for (const bad of [undefined, null, 5, "x", {}, { runId: 1 }, []]) {
        await expect(ctx.service.cancel(bad)).resolves.toBeUndefined();
      }
    });
  });

  describe("cancel and dialog close", () => {
    it("cancel disposes the Worker and keeps no result", async () => {
      const ctx = stuckSetup();
      const { pending } = await startRun(ctx);

      await ctx.service.cancel();
      await ctx.service.cancel();
      expect(await pending).toEqual({ ok: false, reason: "canceled" });
      ctx.stuck.release();
      await vi.waitFor(() => expect(ctx.created[0]?.getState()).toBe("disposed"));
      expect(await ctx.service.saveReport({ resultId: "x" })).toEqual({
        ok: false,
        reason: "not-ready"
      });
    });

    it("discardResult (dialog closed) drops the text; saving the discarded id is not-ready; discarding twice is fine", async () => {
      const ctx = setup({ "a.md": joshi });
      const resultId = await finishedResultId(ctx);

      await ctx.service.discardResult({ resultId });
      await ctx.service.discardResult({ resultId });
      await ctx.service.discardResult(undefined);

      expect(await ctx.service.saveReport({ resultId })).toEqual({
        ok: false,
        reason: "not-ready"
      });
    });

    it("discarding an older id does not drop a newer result", async () => {
      const ctx = setup({ "a.md": joshi });
      const first = await finishedResultId(ctx);
      const second = await finishedResultId(ctx);

      await ctx.service.discardResult({ resultId: first });

      expect((await ctx.service.saveReport({ resultId: second })).ok).toBe(true);
      // ... and the first id (superseded by the second run) is not-ready.
      expect(await ctx.service.saveReport({ resultId: first })).toEqual({
        ok: false,
        reason: "not-ready"
      });
    });
  });

  describe("app shutdown", () => {
    it("cancels a running check and waits until its Worker is gone", async () => {
      const ctx = stuckSetup();
      const { pending } = await startRun(ctx);

      await ctx.service.dispose();

      expect(ctx.created[0]?.getState()).toBe("disposed");
      expect(await pending).toEqual({ ok: false, reason: "canceled" });
      ctx.stuck.release();
    });

    it("drops a finished result and its text", async () => {
      const ctx = setup({ "a.md": joshi });
      const resultId = await finishedResultId(ctx);

      await ctx.service.dispose();

      expect(await ctx.service.saveReport({ resultId })).toEqual({
        ok: false,
        reason: "not-ready"
      });
    });

    it("is safe to call repeatedly, at any time, and never rejects", async () => {
      const ctx = setup();

      await expect(ctx.service.dispose()).resolves.toBeUndefined();
      await expect(ctx.service.dispose()).resolves.toBeUndefined();
      await ctx.service.run({ relativePath: "a.md" });
      await expect(
        Promise.all([ctx.service.dispose(), ctx.service.dispose()])
      ).resolves.toBeDefined();
    });
  });

  describe("independence from the Instant Linter", () => {
    const instantOver = (world: ReturnType<typeof createFakeWorkerWorld>) =>
      createInstantJapaneseLintService({
        createHost: (getSettings) => {
          const host = createJapaneseLintHost({
            ...world.deps,
            getSettings,
            logger: { log: () => undefined }
          });

          hosts.push(host);

          return host;
        },
        settingsProvider: async () => undefined,
        logger: { log: () => undefined }
      });

    it("wizard cleanup (project boundary / quit) leaves the instant Worker running", async () => {
      const instantWorld = createFakeWorkerWorld({ lint: realLint, realDictionary });
      const instant = instantOver(instantWorld);
      const ctx = stuckSetup();

      await instant.lint({ text: joshi, format: "text", ext: ".txt" });

      const { pending } = await startRun(ctx);

      ctx.service.handleProjectBoundary("closed");
      await ctx.service.dispose();
      await pending;

      expect(instantWorld.children).toHaveLength(1);
      expect(instantWorld.children[0]?.exited).toBe(false);
      expect(
        (await instant.lint({ text: joshi, format: "text", ext: ".txt" })).ok
      ).toBe(true);
      expect(instantWorld.children).toHaveLength(1);
      ctx.stuck.release();
    });

    it("an instant release does not touch a running wizard check or a kept result", async () => {
      const instantWorld = createFakeWorkerWorld({ lint: realLint, realDictionary });
      const instant = instantOver(instantWorld);
      const kept = setup({ "a.md": joshi });
      const resultId = await finishedResultId(kept);
      const ctx = stuckSetup();
      const { pending } = await startRun(ctx);

      await instant.lint({ text: joshi, format: "text", ext: ".txt" });
      await instant.release();

      expect(ctx.created[0]?.getState()).toBe("ready");
      ctx.stuck.release();
      expect((await pending).ok).toBe(true);
      expect((await kept.service.saveReport({ resultId })).ok).toBe(true);
    });
  });

  describe("cleanup logging", () => {
    const runtime = {
      appVersion: "0.1.0",
      platform: "win32",
      arch: "x64",
      locale: "ja",
      electronVersion: "43.4.0",
      nodeVersion: "24.19.0",
      debugMode: true
    } as const;

    it("records only the reason and two flags - no text, names, paths or raw errors", async () => {
      const files = { [secretFile]: `${secretText}\n${joshi}` };
      const running = stuckSetup(files, {
        saveTarget: path.join(root, "very-secret-folder", "out.md")
      });
      const { pending } = await startRun(running, { relativePath: secretFile });

      running.service.handleProjectBoundary("switched");
      await pending;
      running.stuck.release();

      const stored = setup(files);
      const id = await finishedResultId(stored, secretFile);

      stored.service.handleProjectBoundary("closed");
      await stored.service.saveReport({ resultId: id });

      const finished = setup(files);

      await finishedResultId(finished, secretFile);
      await finished.service.dispose();

      const cleanup = [...running.events, ...stored.events, ...finished.events].filter(
        (e) => e.details?.hasStoredResult !== undefined || e.details?.hasRunningJob !== undefined
      );

      expect(cleanup.map((e) => e.details?.failureReason)).toEqual([
        "project-switched",
        "project-closed",
        "app-shutdown"
      ]);
      expect(cleanup[0]?.details).toMatchObject({
        linterMode: "wizard",
        hasRunningJob: true,
        hasStoredResult: false
      });
      expect(cleanup[1]?.details).toMatchObject({
        hasRunningJob: false,
        hasStoredResult: true
      });

      for (const ctx of [running, stored, finished]) {
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
          "Novel",
          "ENOENT"
        ]) {
          expect(log, forbidden).not.toContain(forbidden);
        }
        expect(log).toContain('"failureReason"');
      }
    });

    it("a boundary with nothing to clean logs nothing", async () => {
      const ctx = setup();

      ctx.service.handleProjectBoundary("closed");
      await ctx.service.dispose();

      expect(ctx.events).toHaveLength(0);
    });
  });

  it("projectIpc tells the wizard about every close / switch", async () => {
    const { readFileSync } = await import("node:fs");
    const project = readFileSync("src/main/projectIpc.ts", "utf8");
    const wizard = readFileSync("src/main/japaneseMachineCheckIpc.ts", "utf8");

    expect(project.match(/notifyProjectBoundary\("closed"\)/g)).toHaveLength(2);
    expect(project.match(/notifyProjectBoundary\("switched"\)/g)).toHaveLength(1);
    expect(wizard).toContain("onProjectBoundary(");
    expect(wizard).toContain("handleProjectBoundary(reason)");
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
