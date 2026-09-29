// @vitest-environment happy-dom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { history, undoDepth } from "@codemirror/commands";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock
} from "vitest";
import type {
  JapaneseLintDiagnostic,
  JapaneseLintRequest,
  JapaneseLintResponse,
  JapaneseLintSource
} from "../../../src/shared/japaneseLint";
import { JAPANESE_LINT_MAX_RESULT_COUNT } from "../../../src/shared/japaneseLint";
import {
  JAPANESE_LINT_DEBOUNCE_MS,
  type JapaneseLintNotice,
  buildLineMarkers,
  createJapaneseLintExtension,
  formatDiagnosticTooltip,
  markerSeverityFor,
  refreshJapaneseLint,
  registerJapaneseLintDriver,
  unregisterJapaneseLintDriver
} from "../../../src/renderer/japaneseLint/japaneseLintGutterExtension";

function diagnostic(
  overrides: Partial<JapaneseLintDiagnostic> = {}
): JapaneseLintDiagnostic {
  return {
    ruleId: "no-doubled-joshi",
    severity: "error",
    message: "助詞が連続している可能性があります",
    line: 1,
    column: 1,
    index: 0,
    ...overrides
  };
}

describe("markerSeverityFor (#625)", () => {
  it("never shows textlint's error as an error: error and warning -> warning", () => {
    expect(markerSeverityFor("error")).toBe("warning");
    expect(markerSeverityFor("warning")).toBe("warning");
    expect(markerSeverityFor("info")).toBe("info");
  });
});

describe("buildLineMarkers (#625)", () => {
  it("formats the tooltip as message + textlint rule id", () => {
    expect(formatDiagnosticTooltip(diagnostic())).toBe(
      "助詞が連続している可能性があります\n(textlint-rule-no-doubled-joshi)"
    );
  });

  it("groups several diagnostics on one line into a single marker", () => {
    const markers = buildLineMarkers(
      [
        diagnostic({ line: 2, ruleId: "a", message: "A" }),
        diagnostic({ line: 2, ruleId: "b", message: "B", severity: "info" }),
        diagnostic({ line: 1, ruleId: "c", message: "C", severity: "info" })
      ],
      3
    );

    expect(markers.map((m) => [m.line, m.severity])).toEqual([
      [1, "info"],
      [2, "warning"]
    ]);
    expect(markers[1]?.tooltip).toBe(
      "A\n(textlint-rule-a)\n\nB\n(textlint-rule-b)"
    );
  });

  it("drops diagnostics whose line is outside the document", () => {
    expect(
      buildLineMarkers([diagnostic({ line: 0 }), diagnostic({ line: 9 })], 3)
    ).toEqual([]);
  });
});

describe("Japanese lint gutter driver (#625)", () => {
  let parent: HTMLElement;
  let view: EditorView;
  let source: JapaneseLintSource | null;
  let notices: JapaneseLintNotice[];
  let lint: Mock<(request: JapaneseLintRequest) => Promise<JapaneseLintResponse>>;

  function mount(doc: string): void {
    view = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        extensions: [history(), createJapaneseLintExtension()]
      })
    });
    registerJapaneseLintDriver(view, {
      getSource: () => source,
      lint: (request: JapaneseLintRequest) => lint(request),
      onNotice: (notice) => notices.push(notice)
    });
  }

  const markers = (): HTMLElement[] => [
    ...parent.querySelectorAll<HTMLElement>(".cm-pergamum-japaneseLintMarker")
  ];

  async function settle(ms = 0): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    parent = document.createElement("div");
    document.body.appendChild(parent);
    source = null;
    notices = [];
    lint = vi.fn(
      async (): Promise<JapaneseLintResponse> => ({
        ok: true,
        diagnostics: [],
        truncated: false
      })
    );
  });

  afterEach(() => {
    unregisterJapaneseLintDriver(view);
    view.destroy();
    parent.remove();
    vi.useRealTimers();
  });

  it("does nothing while OFF (no request, no markers, no gutter width)", async () => {
    mount("私は彼は好きだ。");
    await settle(1000);

    expect(lint).not.toHaveBeenCalled();
    expect(markers()).toEqual([]);
  });

  it("lints as soon as it is turned ON and shows a gutter marker with tooltip", async () => {
    lint.mockResolvedValue({
      ok: true,
      diagnostics: [diagnostic({ line: 2 })],
      truncated: false
    });
    mount("一行目。\n私は彼は好きだ。");

    source = { format: "markdown", ext: ".markdown" };
    refreshJapaneseLint(view);
    await settle(0);

    expect(lint).toHaveBeenCalledTimes(1);
    expect(lint).toHaveBeenCalledWith({
      text: "一行目。\n私は彼は好きだ。",
      format: "markdown",
      ext: ".markdown"
    });
    expect(markers()).toHaveLength(1);
    expect(markers()[0]?.dataset.severity).toBe("warning");
    expect(markers()[0]?.title).toContain("助詞が連続している可能性があります");
    expect(markers()[0]?.title).toContain("textlint-rule-no-doubled-joshi");
  });

  it("passes plain text as format text / .txt", async () => {
    mount("私は彼は好きだ。");
    source = { format: "text", ext: ".txt" };
    refreshJapaneseLint(view);
    await settle(0);

    expect(lint).toHaveBeenCalledWith(
      expect.objectContaining({ format: "text", ext: ".txt" })
    );
  });

  it("shows no text underline (no @codemirror/lint ranges)", async () => {
    lint.mockResolvedValue({ ok: true, diagnostics: [diagnostic()], truncated: false });
    mount("私は彼は好きだ。");
    source = { format: "text", ext: ".txt" };
    refreshJapaneseLint(view);
    await settle(0);

    expect(markers()).toHaveLength(1);
    expect(parent.querySelector(".cm-lintRange")).toBeNull();
    expect(parent.querySelector(".cm-lintRange-warning")).toBeNull();
  });

  it("clears markers when turned OFF", async () => {
    lint.mockResolvedValue({ ok: true, diagnostics: [diagnostic()], truncated: false });
    mount("私は彼は好きだ。");
    source = { format: "text", ext: ".txt" };
    refreshJapaneseLint(view);
    await settle(0);
    expect(markers()).toHaveLength(1);

    source = null;
    refreshJapaneseLint(view);
    await settle(0);

    expect(markers()).toEqual([]);
  });

  it("re-lints after a debounce, not on every keystroke", async () => {
    mount("あ");
    source = { format: "text", ext: ".txt" };
    refreshJapaneseLint(view);
    await settle(0);
    lint.mockClear();

    for (const text of ["い", "う", "え"]) {
      view.dispatch({ changes: { from: view.state.doc.length, insert: text } });
      await settle(JAPANESE_LINT_DEBOUNCE_MS - 50);
      expect(lint).not.toHaveBeenCalled();
    }

    await settle(100);

    expect(lint).toHaveBeenCalledTimes(1);
    expect(lint.mock.calls[0]?.[0].text).toBe("あいうえ");
  });

  it("discards a stale response that arrives after the document changed", async () => {
    let resolveFirst!: (response: JapaneseLintResponse) => void;

    lint
      .mockImplementationOnce(
        () =>
          new Promise<JapaneseLintResponse>((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValue({ ok: true, diagnostics: [], truncated: false });
    mount("私は彼は好きだ。");
    source = { format: "text", ext: ".txt" };
    refreshJapaneseLint(view);
    await settle(0);
    expect(lint).toHaveBeenCalledTimes(1);

    // The user edits while the first request is still running.
    view.dispatch({ changes: { from: 0, insert: "追記。" } });
    resolveFirst({ ok: true, diagnostics: [diagnostic()], truncated: false });
    await settle(0);

    // The old result must not be shown for the new text.
    expect(markers()).toEqual([]);

    await settle(JAPANESE_LINT_DEBOUNCE_MS + 10);

    expect(lint).toHaveBeenCalledTimes(2);
    expect(lint.mock.calls[1]?.[0].text).toBe("追記。私は彼は好きだ。");
    expect(markers()).toEqual([]);
  });

  it("discards a response that arrives after the linter was turned OFF", async () => {
    let resolveFirst!: (response: JapaneseLintResponse) => void;

    lint.mockImplementationOnce(
      () =>
        new Promise<JapaneseLintResponse>((resolve) => {
          resolveFirst = resolve;
        })
    );
    mount("私は彼は好きだ。");
    source = { format: "text", ext: ".txt" };
    refreshJapaneseLint(view);
    await settle(0);

    source = null;
    refreshJapaneseLint(view);
    resolveFirst({ ok: true, diagnostics: [diagnostic()], truncated: false });
    await settle(0);

    expect(markers()).toEqual([]);
  });

  it("keeps the marker while typing, until the debounced re-lint replaces it", async () => {
    lint.mockResolvedValueOnce({
      ok: true,
      diagnostics: [diagnostic({ line: 2 })],
      truncated: false
    });
    mount("一行目。\n二行目。");
    source = { format: "text", ext: ".txt" };
    refreshJapaneseLint(view);
    await settle(0);
    expect(markers()).toHaveLength(1);

    // An edit above the flagged line does not drop or duplicate the marker.
    lint.mockResolvedValue({ ok: true, diagnostics: [], truncated: false });
    view.dispatch({ changes: { from: 0, insert: "新しい行。\n" } });
    expect(markers()).toHaveLength(1);

    await settle(JAPANESE_LINT_DEBOUNCE_MS + 10);

    expect(markers()).toEqual([]);
  });

  it("does not touch content, selection or undo history", async () => {
    lint.mockResolvedValue({ ok: true, diagnostics: [diagnostic()], truncated: false });
    mount("私は彼は好きだ。");
    view.dispatch({ selection: { anchor: 2, head: 4 } });
    const before = {
      doc: view.state.doc.toString(),
      selection: view.state.selection.main,
      depth: undoDepth(view.state)
    };

    source = { format: "text", ext: ".txt" };
    refreshJapaneseLint(view);
    await settle(0);
    source = null;
    refreshJapaneseLint(view);
    await settle(0);

    expect(view.state.doc.toString()).toBe(before.doc);
    expect(view.state.selection.main.anchor).toBe(before.selection.anchor);
    expect(view.state.selection.main.head).toBe(before.selection.head);
    expect(undoDepth(view.state)).toBe(before.depth);
  });

  it("clears markers when the IPC reports a failure (never shows a stale result)", async () => {
    lint.mockResolvedValueOnce({ ok: true, diagnostics: [diagnostic()], truncated: false });
    mount("私は彼は好きだ。");
    source = { format: "text", ext: ".txt" };
    refreshJapaneseLint(view);
    await settle(0);

    lint.mockResolvedValue({ ok: false, reason: "lint-failed" });
    refreshJapaneseLint(view);
    await settle(0);

    expect(markers()).toEqual([]);
  });

  it("survives a rejected lint call", async () => {
    lint.mockRejectedValue(new Error("ipc down"));
    mount("私は彼は好きだ。");
    source = { format: "text", ext: ".txt" };
    refreshJapaneseLint(view);

    await expect(settle(0)).resolves.toBeUndefined();
    expect(markers()).toEqual([]);
  });

  it("survives the bridge throwing synchronously (e.g. window.pergamum missing) and clears old markers", async () => {
    lint.mockResolvedValueOnce({ ok: true, diagnostics: [diagnostic()], truncated: false });
    mount("私は彼は好きだ。");
    source = { format: "text", ext: ".txt" };
    refreshJapaneseLint(view);
    await settle(0);
    expect(markers()).toHaveLength(1);

    lint.mockImplementation(() => {
      throw new TypeError("Cannot read properties of undefined");
    });
    refreshJapaneseLint(view);

    await expect(settle(0)).resolves.toBeUndefined();
    expect(markers()).toEqual([]);
  });

  describe("large documents and result caps (#625 freeze remediation)", () => {
    // The 50,000-character limit is gone: the Worker keeps Main free.
    const bigDoc = "あ".repeat(50_001);

    it("sends a document over 50,000 characters over IPC and shows its markers", async () => {
      lint.mockResolvedValue({
        ok: true,
        diagnostics: [diagnostic()],
        truncated: false
      });
      mount(bigDoc);
      source = { format: "markdown", ext: ".md" };
      refreshJapaneseLint(view);
      await settle(0);

      expect(lint).toHaveBeenCalledTimes(1);
      expect(lint.mock.calls[0]?.[0].text).toHaveLength(50_001);
      expect(markers()).toHaveLength(1);
      expect(notices).toEqual([]);
    });

    it("a slow long-document result is discarded after OFF", async () => {
      let resolveLint!: (response: JapaneseLintResponse) => void;

      lint.mockImplementationOnce(
        () => new Promise<JapaneseLintResponse>((resolve) => (resolveLint = resolve))
      );
      mount(bigDoc);
      source = { format: "text", ext: ".txt" };
      refreshJapaneseLint(view);
      await settle(0);
      source = null;
      refreshJapaneseLint(view);
      await settle(0);
      resolveLint({ ok: true, diagnostics: [diagnostic()], truncated: false });
      await settle(0);

      expect(markers()).toEqual([]);
    });

    it("a slow long-document result is discarded after an edit (stale token)", async () => {
      let resolveLint!: (response: JapaneseLintResponse) => void;

      lint.mockImplementationOnce(
        () => new Promise<JapaneseLintResponse>((resolve) => (resolveLint = resolve))
      );
      mount(bigDoc);
      source = { format: "text", ext: ".txt" };
      refreshJapaneseLint(view);
      await settle(0);
      view.dispatch({ changes: { from: 0, insert: "い" } });
      resolveLint({ ok: true, diagnostics: [diagnostic()], truncated: false });
      await settle(0);

      expect(markers()).toEqual([]);
    });

    it("a failed long-document lint clears the markers and shows no notice", async () => {
      lint.mockResolvedValueOnce({
        ok: true,
        diagnostics: [diagnostic()],
        truncated: false
      });
      mount(bigDoc);
      source = { format: "text", ext: ".txt" };
      refreshJapaneseLint(view);
      await settle(0);
      expect(markers()).toHaveLength(1);

      lint.mockResolvedValue({ ok: false, reason: "lint-failed" });
      refreshJapaneseLint(view);
      await settle(0);

      expect(markers()).toEqual([]);
      expect(notices).toEqual([]);
    });

    it("builds markers for a truncated, maximum-size result without failing", async () => {
      const lines = 2000;
      const doc = Array.from({ length: lines }, () => "私は彼は好きだ。").join(
        "\n"
      );
      const diagnostics = Array.from(
        { length: JAPANESE_LINT_MAX_RESULT_COUNT },
        (_, index) => diagnostic({ line: index + 1, index })
      );

      lint.mockResolvedValue({ ok: true, diagnostics, truncated: true });
      mount(doc);
      source = { format: "text", ext: ".txt" };
      refreshJapaneseLint(view);
      await settle(0);

      expect(view.state.doc.lines).toBe(lines);
      expect(markers().length).toBeGreaterThan(0);
      expect(notices).toEqual(["truncated"]);
    });

    it("caps an over-long response defensively even if the main process did not", async () => {
      const doc = Array.from({ length: 1500 }, () => "あ").join("\n");
      const diagnostics = Array.from({ length: 1500 }, (_, index) =>
        diagnostic({ line: index + 1, index })
      );

      lint.mockResolvedValue({ ok: true, diagnostics, truncated: false });
      mount(doc);
      source = { format: "text", ext: ".txt" };
      refreshJapaneseLint(view);
      await settle(0);

      expect(view.state.doc.lines).toBe(1500);
      expect(notices).toEqual(["truncated"]);
    });

    it("does not notify for an ordinary complete result", async () => {
      lint.mockResolvedValue({
        ok: true,
        diagnostics: [diagnostic()],
        truncated: false
      });
      mount("私は彼は好きだ。");
      source = { format: "text", ext: ".txt" };
      refreshJapaneseLint(view);
      await settle(0);

      expect(notices).toEqual([]);
    });
  });
});
