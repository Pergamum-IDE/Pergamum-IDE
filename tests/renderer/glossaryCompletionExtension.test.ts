// @vitest-environment happy-dom
import {
  acceptCompletion,
  completionStatus,
  currentCompletions
} from "@codemirror/autocomplete";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import type { GlossaryEntry } from "../../src/shared/glossary";
import {
  createGlossaryCompletionExtension,
  type MarkdownEditorGlossaryCompletionConfig
} from "../../src/renderer/glossaryCompletionExtension";

let seq = 0;

function glossaryEntry(value: string): GlossaryEntry {
  seq += 1;
  const entryId = `entry-${seq}`;
  return {
    id: entryId,
    description: "",
    atoms: [
      {
        id: `atom-${seq}`,
        entryId,
        sortOrder: 0,
        value,
        matchFlags: 0,
        createdAt: "",
        updatedAt: ""
      }
    ],
    tags: [],
    createdAt: "",
    updatedAt: ""
  };
}

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

function createTestView(input: {
  doc?: string;
  caretAtEnd?: boolean;
  config: MarkdownEditorGlossaryCompletionConfig | null;
  readOnly?: boolean;
}): EditorView {
  const doc = input.doc ?? "";
  let currentConfig = input.config;
  const readOnly = input.readOnly ?? false;

  view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: input.caretAtEnd
        ? EditorSelection.single(doc.length)
        : undefined,
      extensions: [
        EditorState.readOnly.of(readOnly),
        createGlossaryCompletionExtension({
          getConfig: () => currentConfig,
          isReadOnly: () => readOnly
        })
      ]
    })
  });

  // Exposed for tests that need to swap the config after construction.
  (view as unknown as { __setConfig: (c: MarkdownEditorGlossaryCompletionConfig | null) => void }).__setConfig =
    (next) => {
      currentConfig = next;
    };

  return view;
}

function ctrlSpaceKeydown(isComposing: boolean): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: " ",
    code: "Space",
    ctrlKey: true,
    isComposing,
    bubbles: true,
    cancelable: true
  });
}

async function waitForCompletionToSettle(): Promise<void> {
  // completionConfig.updateSyncTime (100ms default) debounces the source's
  // resolved options into the active/selectable state - real time, not a
  // microtask tick.
  await new Promise((resolve) => setTimeout(resolve, 150));
}

describe("createGlossaryCompletionExtension - trigger and IME safety (#390)", () => {
  it("opens the completion popup on Ctrl+Space and preventDefaults the key", async () => {
    const testView = createTestView({
      config: { entries: [glossaryEntry("オーダー"), glossaryEntry("ジャンヌ")] }
    });

    const event = ctrlSpaceKeydown(false);
    testView.contentDOM.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    await waitForCompletionToSettle();
    expect(completionStatus(testView.state)).toBe("active");
  });

  it("lists every candidate, unfiltered and in sortOrder, for an empty prefix", async () => {
    const testView = createTestView({
      config: { entries: [glossaryEntry("第一"), glossaryEntry("第二")] }
    });

    testView.contentDOM.dispatchEvent(ctrlSpaceKeydown(false));
    await waitForCompletionToSettle();

    expect(currentCompletions(testView.state).map((c) => c.label)).toEqual([
      "第一",
      "第二"
    ]);
  });

  it("filters to startsWith candidates for a non-empty prefix and replaces that prefix on accept", async () => {
    const testView = createTestView({
      doc: "オー",
      caretAtEnd: true,
      config: { entries: [glossaryEntry("オーダー"), glossaryEntry("ジャンヌ")] }
    });

    testView.contentDOM.dispatchEvent(ctrlSpaceKeydown(false));
    await waitForCompletionToSettle();

    expect(currentCompletions(testView.state).map((c) => c.label)).toEqual([
      "オーダー"
    ]);

    acceptCompletion(testView);
    expect(testView.state.doc.toString()).toBe("オーダー");
  });

  it("keeps narrowing as the user keeps typing after the popup is already open", async () => {
    const testView = createTestView({
      config: {
        entries: [glossaryEntry("オーダー"), glossaryEntry("ジャンヌ")]
      }
    });

    testView.contentDOM.dispatchEvent(ctrlSpaceKeydown(false));
    await waitForCompletionToSettle();
    expect(currentCompletions(testView.state).map((c) => c.label)).toEqual([
      "オーダー",
      "ジャンヌ"
    ]);

    // Not a re-trigger (no Ctrl+Space) - ordinary typing into the already-open
    // popup, exactly like continuing to type after a manual Ctrl+Space.
    testView.dispatch({
      changes: { from: 0, to: 0, insert: "オ" },
      selection: EditorSelection.single(1),
      userEvent: "input.type"
    });
    await waitForCompletionToSettle();

    expect(completionStatus(testView.state)).toBe("active");
    expect(currentCompletions(testView.state).map((c) => c.label)).toEqual([
      "オーダー"
    ]);
  });

  it("inserts the selected registered form (not a fixed representative form) for a non-representative match", async () => {
    const entry = glossaryEntry("代表");
    entry.atoms.push({
      id: "atom-alt",
      entryId: entry.id,
      sortOrder: 1,
      value: "別表記",
      matchFlags: 0,
      createdAt: "",
      updatedAt: ""
    });

    const testView = createTestView({
      doc: "別",
      caretAtEnd: true,
      config: { entries: [entry] }
    });

    testView.contentDOM.dispatchEvent(ctrlSpaceKeydown(false));
    await waitForCompletionToSettle();

    acceptCompletion(testView);
    expect(testView.state.doc.toString()).toBe("別表記");
  });

  it("shows no detail when the registered form IS the entry's representative form (the common case)", async () => {
    const testView = createTestView({
      config: { entries: [glossaryEntry("表記")] }
    });

    testView.contentDOM.dispatchEvent(ctrlSpaceKeydown(false));
    await waitForCompletionToSettle();

    const [completion] = currentCompletions(testView.state);
    expect(completion.label).toBe("表記");
    expect(completion.detail).toBeUndefined();
  });

  it("shows '→ ' plus the parent entry label (no '親語彙:' / 'Atom' text) as detail only for a non-representative form", async () => {
    const entry = glossaryEntry("シズク");
    entry.atoms.push({
      id: "atom-alt",
      entryId: entry.id,
      sortOrder: 1,
      value: "迷子",
      matchFlags: 0,
      createdAt: "",
      updatedAt: ""
    });

    const testView = createTestView({ config: { entries: [entry] } });

    testView.contentDOM.dispatchEvent(ctrlSpaceKeydown(false));
    await waitForCompletionToSettle();

    const completions = currentCompletions(testView.state);
    const representative = completions.find((c) => c.label === "シズク");
    const nonRepresentative = completions.find((c) => c.label === "迷子");

    expect(representative?.detail).toBeUndefined();
    expect(nonRepresentative?.detail).toBe("→ シズク");
    expect(nonRepresentative?.detail).not.toContain("親語彙");
    expect(nonRepresentative?.detail?.toLowerCase()).not.toContain("atom");
  });

  it("does NOT open, and does NOT preventDefault, while an IME composition is in progress", async () => {
    const testView = createTestView({
      config: { entries: [glossaryEntry("オーダー")] }
    });

    testView.contentDOM.dispatchEvent(
      new Event("compositionstart", { bubbles: true })
    );

    const event = ctrlSpaceKeydown(true);
    testView.contentDOM.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);

    await waitForCompletionToSettle();
    expect(completionStatus(testView.state)).toBeNull();
  });

  it("also blocks on view.composing alone (event.isComposing false)", async () => {
    const testView = createTestView({
      config: { entries: [glossaryEntry("オーダー")] }
    });

    // Real composition input is hard to simulate headlessly; this asserts
    // the local compositionstart/compositionend tracked flag (the third of
    // the three required signals) blocks the trigger even when
    // event.isComposing itself happens to read false.
    testView.contentDOM.dispatchEvent(
      new Event("compositionstart", { bubbles: true })
    );

    const event = ctrlSpaceKeydown(false);
    testView.contentDOM.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    await waitForCompletionToSettle();
    expect(completionStatus(testView.state)).toBeNull();
  });

  it("can trigger again once the composition has ended", async () => {
    const testView = createTestView({
      config: { entries: [glossaryEntry("オーダー")] }
    });

    testView.contentDOM.dispatchEvent(
      new Event("compositionstart", { bubbles: true })
    );
    testView.contentDOM.dispatchEvent(ctrlSpaceKeydown(true));
    testView.contentDOM.dispatchEvent(
      new Event("compositionend", { bubbles: true })
    );

    const event = ctrlSpaceKeydown(false);
    testView.contentDOM.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    await waitForCompletionToSettle();
    expect(completionStatus(testView.state)).toBe("active");
  });

  it("stays inert (no preventDefault) when no config is supplied", () => {
    const testView = createTestView({ config: null });

    const event = ctrlSpaceKeydown(false);
    testView.contentDOM.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it("stays inert on a read-only editor even with a config", async () => {
    const testView = createTestView({
      config: { entries: [glossaryEntry("オーダー")] },
      readOnly: true
    });

    const event = ctrlSpaceKeydown(false);
    testView.contentDOM.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    await waitForCompletionToSettle();
    expect(completionStatus(testView.state)).toBeNull();
  });

  it("prefix 'オ' matches 'オーダ' (issue example)", async () => {
    const testView = createTestView({
      doc: "オ",
      caretAtEnd: true,
      config: { entries: [glossaryEntry("オーダ"), glossaryEntry("ヴィル")] }
    });

    testView.contentDOM.dispatchEvent(ctrlSpaceKeydown(false));
    await waitForCompletionToSettle();

    expect(currentCompletions(testView.state).map((c) => c.label)).toEqual([
      "オーダ"
    ]);
  });

  it("prefix 'メ' only matches forms starting with 'メ' (issue example)", async () => {
    const testView = createTestView({
      doc: "メ",
      caretAtEnd: true,
      config: {
        entries: [
          glossaryEntry("メイド服"),
          glossaryEntry("メイドさん"),
          glossaryEntry("オーダ")
        ]
      }
    });

    testView.contentDOM.dispatchEvent(ctrlSpaceKeydown(false));
    await waitForCompletionToSettle();

    expect(currentCompletions(testView.state).map((c) => c.label)).toEqual([
      "メイド服",
      "メイドさん"
    ]);
  });

  it("prefix 'ーダ' does NOT match 'オーダ' - startsWith only, no substring match (issue example)", async () => {
    const testView = createTestView({
      doc: "ーダ",
      caretAtEnd: true,
      config: { entries: [glossaryEntry("オーダ")] }
    });

    testView.contentDOM.dispatchEvent(ctrlSpaceKeydown(false));
    await waitForCompletionToSettle();

    expect(completionStatus(testView.state)).toBeNull();
  });

  it("never opens from ordinary typing (activateOnTyping: false)", async () => {
    const testView = createTestView({
      config: { entries: [glossaryEntry("オーダー")] }
    });

    testView.dispatch({
      changes: { from: 0, to: 0, insert: "オ" },
      selection: EditorSelection.single(1),
      userEvent: "input.type"
    });

    await waitForCompletionToSettle();
    expect(completionStatus(testView.state)).toBeNull();
  });
});
