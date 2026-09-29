// @vitest-environment happy-dom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  JapaneseLintRequest,
  JapaneseLintResponse,
  JapaneseLintSource
} from "../../../src/shared/japaneseLint";
import { JAPANESE_LINT_MAX_SOURCE_LENGTH } from "../../../src/shared/japaneseLint";
import {
  JAPANESE_LINT_DEBOUNCE_MS,
  clampJapaneseLintDebounceMs,
  createJapaneseLintExtension,
  refreshJapaneseLint,
  registerJapaneseLintDriver,
  unregisterJapaneseLintDriver
} from "../../../src/renderer/japaneseLint/japaneseLintGutterExtension";
import { resolveJapaneseLintDebounceMs } from "../../../src/shared/japaneseLintRules";

describe("resolveJapaneseLintDebounceMs / clamp (#625 P1d)", () => {
  it("defaults to 800 and matches the driver's fallback", () => {
    expect(resolveJapaneseLintDebounceMs(undefined)).toBe(800);
    expect(JAPANESE_LINT_DEBOUNCE_MS).toBe(800);
  });

  it("uses a stored value and clamps to 300..3000", () => {
    expect(resolveJapaneseLintDebounceMs({ debounceMs: 300 })).toBe(300);
    expect(resolveJapaneseLintDebounceMs({ debounceMs: 3000 })).toBe(3000);
    expect(resolveJapaneseLintDebounceMs({ debounceMs: 10 })).toBe(300);
    expect(resolveJapaneseLintDebounceMs({ debounceMs: 99999 })).toBe(3000);
  });

  it("falls back to the default for unusable values", () => {
    for (const bad of ["x", NaN, Infinity, null, {}, []]) {
      expect(resolveJapaneseLintDebounceMs({ debounceMs: bad })).toBe(800);
    }
    expect(resolveJapaneseLintDebounceMs(42)).toBe(800);
  });

  it("the renderer clamps defensively as well", () => {
    expect(clampJapaneseLintDebounceMs(undefined)).toBe(800);
    expect(clampJapaneseLintDebounceMs(NaN)).toBe(800);
    expect(clampJapaneseLintDebounceMs("500")).toBe(800);
    expect(clampJapaneseLintDebounceMs(0)).toBe(300);
    expect(clampJapaneseLintDebounceMs(-5)).toBe(300);
    expect(clampJapaneseLintDebounceMs(1e9)).toBe(3000);
    expect(clampJapaneseLintDebounceMs(1234.4)).toBe(1234);
  });
});

describe("Japanese lint driver debounce follows the setting (#625 P1d)", () => {
  let parent: HTMLElement;
  let view: EditorView;
  let source: JapaneseLintSource | null;
  let debounce: number | undefined;
  let lint: ReturnType<
    typeof vi.fn<(request: JapaneseLintRequest) => Promise<JapaneseLintResponse>>
  >;

  function mount(doc: string): void {
    view = new EditorView({
      parent,
      state: EditorState.create({ doc, extensions: [createJapaneseLintExtension()] })
    });
    registerJapaneseLintDriver(view, {
      getSource: () => source,
      lint: (request) => lint(request),
      getDebounceMs: () => debounce
    });
  }

  const settle = (ms: number) => vi.advanceTimersByTimeAsync(ms);
  const edit = (text = "あ") =>
    view.dispatch({ changes: { from: view.state.doc.length, insert: text } });

  async function start(doc = "私は彼は好きだ。"): Promise<void> {
    mount(doc);
    source = { format: "text", ext: ".txt" };
    refreshJapaneseLint(view);
    await settle(0);
    lint.mockClear();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    parent = document.createElement("div");
    document.body.appendChild(parent);
    source = null;
    debounce = undefined;
    lint = vi.fn(async () => ({ ok: true, diagnostics: [], truncated: false }));
  });

  afterEach(() => {
    unregisterJapaneseLintDriver(view);
    view.destroy();
    parent.remove();
    vi.useRealTimers();
  });

  it("uses 800ms when no setting is supplied", async () => {
    await start();
    edit();
    await settle(799);
    expect(lint).not.toHaveBeenCalled();
    await settle(1);
    expect(lint).toHaveBeenCalledTimes(1);
  });

  it("300ms and 3000ms", async () => {
    debounce = 300;
    await start();
    edit();
    await settle(299);
    expect(lint).not.toHaveBeenCalled();
    await settle(1);
    expect(lint).toHaveBeenCalledTimes(1);

    debounce = 3000;
    lint.mockClear();
    edit();
    await settle(2999);
    expect(lint).not.toHaveBeenCalled();
    await settle(1);
    expect(lint).toHaveBeenCalledTimes(1);
  });

  it("a changed setting applies to the next edit, without a re-mount", async () => {
    debounce = 1000;
    await start();
    edit();
    await settle(1000);
    expect(lint).toHaveBeenCalledTimes(1);

    debounce = 400;
    lint.mockClear();
    edit();
    await settle(399);
    expect(lint).not.toHaveBeenCalled();
    await settle(1);
    expect(lint).toHaveBeenCalledTimes(1);
  });

  it("an out-of-range value from the config is clamped", async () => {
    debounce = 1;
    await start();
    edit();
    await settle(299);
    expect(lint).not.toHaveBeenCalled();
    await settle(1);
    expect(lint).toHaveBeenCalledTimes(1);
  });

  it("does not lint while OFF, however long the debounce", async () => {
    debounce = 300;
    mount("私は彼は好きだ。");
    await settle(0);
    edit();
    await settle(5000);
    expect(lint).not.toHaveBeenCalled();
  });

  it("turning OFF cancels a pending timer", async () => {
    debounce = 1000;
    await start();
    edit();
    await settle(500);
    source = null;
    refreshJapaneseLint(view);
    await settle(5000);
    expect(lint).not.toHaveBeenCalled();
  });

  it("destroying the view clears the pending timer", async () => {
    debounce = 1000;
    await start();
    edit();
    view.destroy();
    await settle(5000);
    expect(lint).not.toHaveBeenCalled();
    // afterEach destroys again; a second destroy is harmless.
  });

  it("keeps the stale guard: an edit during a slow request discards its result", async () => {
    let resolveFirst!: (response: JapaneseLintResponse) => void;

    debounce = 300;
    lint.mockImplementationOnce(
      () => new Promise<JapaneseLintResponse>((resolve) => (resolveFirst = resolve))
    );
    mount("あ");
    source = { format: "text", ext: ".txt" };
    refreshJapaneseLint(view);
    await settle(0);
    edit();
    resolveFirst({
      ok: true,
      diagnostics: [
        { ruleId: "r", severity: "warning", message: "m", line: 1, column: 1, index: 0 }
      ],
      truncated: false
    });
    await settle(0);
    expect(parent.querySelectorAll(".cm-pergamum-japaneseLintMarker")).toHaveLength(0);
  });

  it("keeps the 50,000-character guard", async () => {
    debounce = 300;
    await start("あ".repeat(JAPANESE_LINT_MAX_SOURCE_LENGTH + 1));
    refreshJapaneseLint(view);
    await settle(0);
    expect(lint).not.toHaveBeenCalled();
  });
});

describe("debounce wiring (#625 P1d)", () => {
  const read = (file: string): string => readFileSync(file, "utf8");

  it("App resolves the setting and hands it down to the editor", () => {
    const app = read("src/renderer/App.tsx");

    expect(app).toContain("resolveJapaneseLintDebounceMs(settings.japaneseLint)");
    expect(app).toContain("japaneseLintDebounceMs={japaneseLintDebounceMs}");
  });

  it("the editor feeds it to the driver through a ref (read at each scheduling)", () => {
    const editor = read("src/renderer/MarkdownEditor.tsx");

    expect(editor).toContain("getDebounceMs: () => japaneseLintDebounceMsRef.current");
    expect(read("src/renderer/EditorSurface.tsx").match(/japaneseLintDebounceMs=/g)).toHaveLength(2);
  });

  it("no fixed 400 ms debounce remains", () => {
    expect(read("src/renderer/japaneseLint/japaneseLintGutterExtension.ts")).not.toMatch(
      /JAPANESE_LINT_DEBOUNCE_MS = 400/
    );
  });
});
