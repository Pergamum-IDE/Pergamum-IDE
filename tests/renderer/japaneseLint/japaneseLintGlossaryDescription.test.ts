// @vitest-environment happy-dom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { history } from "@codemirror/commands";
import { readFileSync } from "node:fs";
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
import {
  JAPANESE_LINT_DEBOUNCE_MS,
  createJapaneseLintExtension,
  refreshJapaneseLint,
  registerJapaneseLintDriver,
  unregisterJapaneseLintDriver
} from "../../../src/renderer/japaneseLint/japaneseLintGutterExtension";
import {
  glossaryDescriptionJapaneseLintSource,
  resolveJapaneseLintEditorSource
} from "../../../src/renderer/japaneseLint/japaneseLintEditorSource";
import type { CurrentEditor } from "../../../src/renderer/currentEditor";
import { isMarkdownPath } from "../../../src/shared/projectDocumentKind";

function editor(value: unknown): CurrentEditor {
  return value as CurrentEditor;
}

const description = editor({ kind: "glossaryDescription" });

function markdownEditor(document: unknown): CurrentEditor {
  return editor({ kind: "markdown", document });
}

function resolve(
  currentEditor: CurrentEditor | null,
  isSpecialTabActive = false
): JapaneseLintSource | null {
  return resolveJapaneseLintEditorSource(
    { isSpecialTabActive, currentEditor },
    isMarkdownPath
  );
}

describe("instant Japanese lint source of the active editor (#687)", () => {
  it("lints a glossary Description as Markdown (.md)", () => {
    expect(resolve(description)).toEqual({ format: "markdown", ext: ".md" });
    expect(resolve(description)).toBe(glossaryDescriptionJapaneseLintSource);
  });

  it("keeps Markdown documents as before", () => {
    expect(
      resolve(markdownEditor({ kind: "project", relativePath: "a.md" }))
    ).toEqual({ format: "markdown", ext: ".md" });
    expect(
      resolve(markdownEditor({ kind: "project", relativePath: "a.markdown" }))
    ).toEqual({ format: "markdown", ext: ".markdown" });
    expect(resolve(markdownEditor({ kind: "untitled" }))).toEqual({
      format: "markdown",
      ext: ".md"
    });
    expect(
      resolve(markdownEditor({ kind: "file", path: "C:/x/notes.md" }))
    ).toEqual({ format: "markdown", ext: ".md" });
  });

  it("keeps plain text documents as before", () => {
    expect(
      resolve(markdownEditor({ kind: "project", relativePath: "a.txt" }))
    ).toEqual({ format: "text", ext: ".txt" });
  });

  it("stays unavailable for special tabs, no editor and unsupported files", () => {
    expect(resolve(description, true)).toBeNull();
    expect(
      resolve(markdownEditor({ kind: "project", relativePath: "a.md" }), true)
    ).toBeNull();
    expect(resolve(null)).toBeNull();
    expect(
      resolve(markdownEditor({ kind: "project", relativePath: "a.json" }))
    ).toBeNull();
  });

  it("does not depend on the saved / dirty state of the Description", () => {
    const dirty = editor({
      kind: "glossaryDescription",
      draft: { description: "未保存" }
    });
    const clean = editor({ kind: "glossaryDescription" });

    expect(resolve(dirty)).toEqual(resolve(clean));
  });
});

describe("Glossary Description wiring (#687)", () => {
  const app = readFileSync("src/renderer/App.tsx", "utf8");

  it("shares one source between the lint driver and command / toolbar enablement", () => {
    expect(app).toContain("resolveJapaneseLintEditorSource(");
    expect(app).toContain(
      "const canUseJapaneseLint = japaneseLintDocumentSource !== null;"
    );
    expect(app).toContain("canToggleInstantJapaneseLint: () => canUseJapaneseLint");
    expect(app).toContain("canUseJapaneseLint={canUseJapaneseLint}");
  });

  it("adds no Glossary-specific lint concept to the IPC / Worker contract", () => {
    for (const path of [
      "src/shared/japaneseLint.ts",
      "src/main/japaneseLintIpc.ts"
    ]) {
      expect(readFileSync(path, "utf8")).not.toMatch(/glossary/i);
    }
  });
});

describe("Glossary Description instant lint behavior (#687)", () => {
  let parent: HTMLElement;
  let view: EditorView;
  let source: JapaneseLintSource | null;
  let lint: Mock<(request: JapaneseLintRequest) => Promise<JapaneseLintResponse>>;

  const diagnostic = (line = 1): JapaneseLintDiagnostic => ({
    ruleId: "no-doubled-joshi",
    severity: "warning",
    message: "助詞が連続している可能性があります",
    line,
    column: 1,
    index: 0
  });

  const withMarker: JapaneseLintResponse = {
    ok: true,
    diagnostics: [diagnostic()],
    truncated: false
  };

  function stateFor(doc: string): EditorState {
    return EditorState.create({
      doc,
      extensions: [history(), createJapaneseLintExtension()]
    });
  }

  function mount(doc: string): void {
    view = new EditorView({ parent, state: stateFor(doc) });
    registerJapaneseLintDriver(view, {
      getSource: () => source,
      lint: (request) => lint(request)
    });
  }

  const markers = (): HTMLElement[] => [
    ...parent.querySelectorAll<HTMLElement>(".cm-pergamum-japaneseLintMarker")
  ];

  async function settle(ms = 0): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
  }

  function deferred(): {
    promise: Promise<JapaneseLintResponse>;
    resolve: (response: JapaneseLintResponse) => void;
  } {
    let resolveFn!: (response: JapaneseLintResponse) => void;
    const promise = new Promise<JapaneseLintResponse>((resolve) => {
      resolveFn = resolve;
    });

    return { promise, resolve: resolveFn };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    parent = document.createElement("div");
    document.body.appendChild(parent);
    source = glossaryDescriptionJapaneseLintSource;
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

  it("lints the current in-memory draft as Markdown, not a saved value", async () => {
    // saved: "これは保存済みです。" — the editor now holds the unsaved draft.
    mount("これは未保存の変更です。");
    await settle(0);

    expect(lint).toHaveBeenCalledTimes(1);
    expect(lint).toHaveBeenCalledWith({
      text: "これは未保存の変更です。",
      format: "markdown",
      ext: ".md"
    });
  });

  it("re-lints the edited text after the debounce and shows its markers", async () => {
    mount("吾輩は猫である。");
    await settle(0);
    lint.mockClear();
    lint.mockResolvedValue(withMarker);

    view.dispatch({ changes: { from: view.state.doc.length, insert: "吾輩わ" } });
    await settle(JAPANESE_LINT_DEBOUNCE_MS - 50);
    expect(lint).not.toHaveBeenCalled();
    await settle(100);

    expect(lint).toHaveBeenCalledTimes(1);
    expect(lint.mock.calls[0]?.[0].text).toBe("吾輩は猫である。吾輩わ");
    expect(markers()).toHaveLength(1);
  });

  it("an old request's result never overwrites the newer content", async () => {
    const first = deferred();

    lint.mockImplementationOnce(() => first.promise);
    mount("古い内容。");
    await settle(0);

    view.dispatch({ changes: { from: 0, insert: "新しい。" } });
    first.resolve(withMarker);
    await settle(0);

    expect(markers()).toEqual([]);
  });

  it("Description A -> Description B: A's late result does not land on B", async () => {
    const a = deferred();

    lint.mockImplementationOnce(() => a.promise);
    mount("説明A。");
    await settle(0);
    expect(lint).toHaveBeenCalledTimes(1);

    // The tab switch swaps the EditorState of the same view (as the editor
    // does for a document switch), which rebuilds the plugin.
    view.setState(stateFor("説明B。"));
    a.resolve(withMarker);
    await settle(0);

    expect(markers()).toEqual([]);
    // B is linted on its own and gets its own result.
    expect(lint).toHaveBeenLastCalledWith({
      text: "説明B。",
      format: "markdown",
      ext: ".md"
    });
  });

  it("Description -> Markdown document: the Description's late result is not shown there", async () => {
    const a = deferred();

    lint.mockImplementationOnce(() => a.promise);
    mount("説明。");
    await settle(0);

    source = { format: "markdown", ext: ".markdown" };
    view.setState(stateFor("# 本文\n"));
    a.resolve(withMarker);
    await settle(0);

    expect(markers()).toEqual([]);
    expect(lint).toHaveBeenLastCalledWith({
      text: "# 本文\n",
      format: "markdown",
      ext: ".markdown"
    });
  });

  it("Markdown document -> Description: the document's late result is not shown there", async () => {
    const doc = deferred();

    source = { format: "markdown", ext: ".md" };
    lint.mockImplementationOnce(() => doc.promise);
    mount("# 本文\n");
    await settle(0);

    view.setState(stateFor("説明。"));
    doc.resolve(withMarker);
    await settle(0);

    expect(markers()).toEqual([]);
  });

  it("an editor remount (old view destroyed) never lets the old result reach the new view", async () => {
    const old = deferred();

    lint.mockImplementationOnce(() => old.promise);
    mount("旧。");
    await settle(0);

    unregisterJapaneseLintDriver(view);
    view.destroy();
    mount("新。");
    old.resolve(withMarker);
    await settle(0);

    expect(markers()).toEqual([]);
  });

  it("turning the linter OFF clears markers and a pending result cannot bring them back", async () => {
    lint.mockResolvedValueOnce(withMarker);
    mount("説明。");
    await settle(0);
    expect(markers()).toHaveLength(1);

    const pending = deferred();

    lint.mockImplementationOnce(() => pending.promise);
    refreshJapaneseLint(view);
    await settle(0);

    source = null;
    refreshJapaneseLint(view);
    await settle(0);
    pending.resolve(withMarker);
    await settle(0);

    expect(markers()).toEqual([]);

    // ON again lints again.
    source = glossaryDescriptionJapaneseLintSource;
    lint.mockResolvedValueOnce(withMarker);
    refreshJapaneseLint(view);
    await settle(0);

    expect(markers()).toHaveLength(1);
  });
});
