import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JAPANESE_LINT_CHANNELS } from "../../src/shared/api";

const electronMock = vi.hoisted(() => ({
  ipcHandle: vi.fn(),
  appPath: { value: process.cwd() }
}));

vi.mock("electron", () => ({
  app: { getAppPath: () => electronMock.appPath.value },
  ipcMain: { handle: electronMock.ipcHandle }
}));

import { mkdtempSync, rmSync } from "node:fs";
import {
  JAPANESE_LINT_MAX_RESULT_COUNT,
  JAPANESE_LINT_MAX_SOURCE_LENGTH
} from "../../src/shared/japaneseLint";
import type { DebugLogger } from "../../src/main/debugLogger";
import * as engine from "../../src/main/textlint/japaneseLintEngine";
import os from "node:os";
import path from "node:path";
import {
  ensureJapaneseLintDictionary,
  handleJapaneseLintRequest,
  registerJapaneseLintIpc,
  resetJapaneseLintDictionaryCheck,
  resolveJapaneseLintDictionaryDirectory
} from "../../src/main/japaneseLintIpc";
import {
  isJapaneseLintRejectionWindow,
  resetJapaneseLintRejectionGuard
} from "../../src/main/japaneseLintRejectionGuard";

describe("japaneseLintIpc (#625)", () => {
  beforeEach(() => {
    electronMock.ipcHandle.mockReset();
    electronMock.appPath.value = process.cwd();
    resetJapaneseLintDictionaryCheck();
    resetJapaneseLintRejectionGuard();
  });

  it("registers exactly one handler on the japaneseLint:lint channel", async () => {
    registerJapaneseLintIpc();

    expect(electronMock.ipcHandle).toHaveBeenCalledTimes(1);
    expect(electronMock.ipcHandle.mock.calls[0]?.[0]).toBe(
      JAPANESE_LINT_CHANNELS.lint
    );

    const handler = electronMock.ipcHandle.mock.calls[0]?.[1] as (
      event: unknown,
      request: unknown
    ) => Promise<unknown>;

    expect(
      await handler({}, { text: "私は彼は好きだ。", format: "text", ext: ".txt" })
    ).toMatchObject({ ok: true });
  });

  it("lints Markdown (.md and .markdown) and plain text (.txt)", async () => {
    for (const [format, ext] of [
      ["markdown", ".md"],
      ["markdown", ".markdown"],
      ["text", ".txt"]
    ] as const) {
      const response = await handleJapaneseLintRequest({
        text: "私は彼は好きだ。",
        format,
        ext
      });

      expect(response.ok).toBe(true);
      if (response.ok) {
        expect(response.diagnostics.map((d) => d.ruleId)).toContain(
          "no-doubled-joshi"
        );
      }
    }
  });

  it("returns only serializable diagnostics without fix suggestions", async () => {
    const response = await handleJapaneseLintRequest({
      text: "私は彼は好きだ。",
      format: "markdown",
      ext: ".md"
    });

    expect(JSON.parse(JSON.stringify(response))).toEqual(response);
    if (response.ok) {
      for (const diagnostic of response.diagnostics) {
        expect(Object.keys(diagnostic).sort()).toEqual(
          ["column", "index", "line", "message", "ruleId", "severity"].sort()
        );
      }
    }
  });

  it("rejects invalid requests without running the engine", async () => {
    for (const bad of [
      null,
      "text",
      { text: "x", format: "text", ext: ".md" },
      { text: 5, format: "text", ext: ".txt" }
    ]) {
      expect(await handleJapaneseLintRequest(bad)).toEqual({
        ok: false,
        reason: "invalid-request"
      });
    }
  });

  it("returns no diagnostics for empty text", async () => {
    expect(
      await handleJapaneseLintRequest({ text: "", format: "text", ext: ".txt" })
    ).toEqual({ ok: true, diagnostics: [], truncated: false });
  });

  describe("crash safety (kuromoji dictionary / leaked rejections)", () => {
    it("resolves the dictionary under <appPath>/node_modules/kuromoji/dict and pins KUROMOJIN_DIC_PATH", async () => {
      expect(resolveJapaneseLintDictionaryDirectory("/app.asar")).toBe(
        path.join("/app.asar", "node_modules", "kuromoji", "dict")
      );

      expect(await ensureJapaneseLintDictionary()).toBe(true);
      expect(process.env.KUROMOJIN_DIC_PATH).toBe(
        resolveJapaneseLintDictionaryDirectory(process.cwd())
      );
    });

    it("returns { ok:false } without entering textlint when the dictionary is missing (the packaged-app crash)", async () => {
      const emptyAppPath = mkdtempSync(path.join(os.tmpdir(), "pergamum-nodict-"));
      const leaked: unknown[] = [];
      const onUnhandled = (reason: unknown): void => {
        leaked.push(reason);
      };

      electronMock.appPath.value = emptyAppPath;
      process.on("unhandledRejection", onUnhandled);

      try {
        for (let i = 0; i < 3; i += 1) {
          expect(
            await handleJapaneseLintRequest({
              text: "私は彼は好きだ。",
              format: "markdown",
              ext: ".md"
            })
          ).toEqual({ ok: false, reason: "lint-failed" });
        }

        // Give a leaked rejection (if any) the chance to be reported.
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(leaked).toEqual([]);
        // The engine was never entered, so no guard window was opened.
        expect(isJapaneseLintRejectionWindow()).toBe(false);
      } finally {
        process.off("unhandledRejection", onUnhandled);
        rmSync(emptyAppPath, { recursive: true, force: true });
      }
    });

    it("recovers once the dictionary becomes available (a failed check is not cached)", async () => {
      const emptyAppPath = mkdtempSync(path.join(os.tmpdir(), "pergamum-nodict-"));

      try {
        electronMock.appPath.value = emptyAppPath;
        expect(await ensureJapaneseLintDictionary()).toBe(false);

        electronMock.appPath.value = process.cwd();
        expect(
          (
            await handleJapaneseLintRequest({
              text: "私は彼は好きだ。",
              format: "text",
              ext: ".txt"
            })
          ).ok
        ).toBe(true);
      } finally {
        rmSync(emptyAppPath, { recursive: true, force: true });
      }
    });

    it("opens the rejection guard window for a real lint run", async () => {
      await handleJapaneseLintRequest({
        text: "私は彼は好きだ。",
        format: "text",
        ext: ".txt"
      });

      expect(isJapaneseLintRejectionWindow()).toBe(true);
    });

    it("never rejects, whatever the input", async () => {
      for (const bad of [undefined, null, 0, "x", {}, [], { text: {} }]) {
        await expect(handleJapaneseLintRequest(bad)).resolves.toMatchObject({
          ok: false
        });
      }
    });
  });

  describe("large documents and result caps (freeze remediation)", () => {
    // Only `log` is used by the handler; the rest of DebugLogger is opaque.
    const makeLogger = () => {
      const log = vi.fn();

      return { log } as unknown as DebugLogger & { log: typeof log };
    };

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("answers too-large without ever calling the textlint engine", async () => {
      const lintSpy = vi.spyOn(engine, "lintJapanese");

      for (const [format, ext] of [
        ["markdown", ".md"],
        ["markdown", ".markdown"],
        ["text", ".txt"]
      ] as const) {
        expect(
          await handleJapaneseLintRequest({
            text: "あ".repeat(JAPANESE_LINT_MAX_SOURCE_LENGTH + 1),
            format,
            ext
          })
        ).toEqual({ ok: false, reason: "too-large" });
      }

      expect(lintSpy).not.toHaveBeenCalled();
      // No guard window either: nothing was run.
      expect(isJapaneseLintRejectionWindow()).toBe(false);
    });

    it("still lints a document exactly at the limit", async () => {
      const lintSpy = vi.spyOn(engine, "lintJapanese").mockResolvedValue([]);
      const response = await handleJapaneseLintRequest({
        text: "あ".repeat(JAPANESE_LINT_MAX_SOURCE_LENGTH),
        format: "text",
        ext: ".txt"
      });

      expect(response).toEqual({ ok: true, diagnostics: [], truncated: false });
      expect(lintSpy).toHaveBeenCalledTimes(1);
    });

    it("truncates a result over the cap, keeping the earliest diagnostics", async () => {
      const many = Array.from(
        { length: JAPANESE_LINT_MAX_RESULT_COUNT + 500 },
        (_, index) => ({
          ruleId: "no-doubled-joshi",
          severity: "error" as const,
          message: "m",
          line: 1,
          column: 1,
          index
        })
      );

      vi.spyOn(engine, "lintJapanese").mockResolvedValue(many);

      const response = await handleJapaneseLintRequest({
        text: "私は彼は好きだ。",
        format: "text",
        ext: ".txt"
      });

      expect(response.ok).toBe(true);
      if (response.ok) {
        expect(response.truncated).toBe(true);
        expect(response.diagnostics).toHaveLength(JAPANESE_LINT_MAX_RESULT_COUNT);
        expect(response.diagnostics[0]?.index).toBe(0);
        expect(response.diagnostics.at(-1)?.index).toBe(
          JAPANESE_LINT_MAX_RESULT_COUNT - 1
        );
      }
    });

    it("does not flag a result exactly at the cap as truncated", async () => {
      vi.spyOn(engine, "lintJapanese").mockResolvedValue(
        Array.from({ length: JAPANESE_LINT_MAX_RESULT_COUNT }, (_, index) => ({
          ruleId: "r",
          severity: "warning" as const,
          message: "m",
          line: 1,
          column: 1,
          index
        }))
      );

      const response = await handleJapaneseLintRequest({
        text: "あ",
        format: "text",
        ext: ".txt"
      });

      expect(response.ok && response.truncated).toBe(false);
    });

    it("logs sizes, timing and counts - never the body text", async () => {
      const logger = makeLogger();
      const secret = "秘密の本文です。";
      const body = secret + "\n二行目。";

      await handleJapaneseLintRequest(
        { text: body, format: "markdown", ext: ".markdown" },
        logger
      );
      await handleJapaneseLintRequest(
        {
          text: "あ".repeat(JAPANESE_LINT_MAX_SOURCE_LENGTH + 1),
          format: "text",
          ext: ".txt"
        },
        logger
      );

      const events = logger.log.mock.calls.map((call) => call[0]);

      expect(events.map((e) => e.event)).toEqual([
        "japaneseLint.run.completed",
        "japaneseLint.run.completed"
      ]);
      expect(events[0].details).toMatchObject({
        result: "succeeded",
        characterLength: body.length,
        lineCount: 2,
        extension: ".markdown"
      });
      expect(typeof events[0].details.durationMs).toBe("number");
      expect(events[1].details).toMatchObject({
        result: "ignored",
        reason: "too_large"
      });
      expect(JSON.stringify(events)).not.toContain("秘密");
    });

    it("keeps working when the logger itself throws", async () => {
      const logger = makeLogger();

      logger.log.mockImplementation(() => {
        throw new Error("sink down");
      });

      await expect(
        handleJapaneseLintRequest(
          { text: "私は彼は好きだ。", format: "text", ext: ".txt" },
          logger
        )
      ).resolves.toMatchObject({ ok: true });
    });
  });
});
