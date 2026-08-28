// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyEditorViewState,
  captureEditorViewState,
  parseEditorViewState,
  type EditorViewState
} from "../../src/renderer/editorViewState";
import { computeEditorContentDigest } from "../../src/renderer/editorContentDigest";

const views: EditorView[] = [];

function mountEditor(doc: string): EditorView {
  const parent = document.createElement("div");
  document.body.appendChild(parent);

  const view = new EditorView({
    parent,
    state: EditorState.create({ doc })
  });

  views.push(view);
  return view;
}

/**
 * happy-dom does not lay out CodeMirror, so `scrollDOM.scrollTop` is inert
 * by default. Back it with a real number field so capture/apply scroll
 * behavior can be exercised deterministically against the public
 * `scrollDOM` surface.
 */
function withBackedScroll(view: EditorView): { top: number; left: number } {
  const backing = { top: 0, left: 0 };

  Object.defineProperty(view.scrollDOM, "scrollTop", {
    configurable: true,
    get: () => backing.top,
    set: (value: number) => {
      backing.top = value;
    }
  });
  Object.defineProperty(view.scrollDOM, "scrollLeft", {
    configurable: true,
    get: () => backing.left,
    set: (value: number) => {
      backing.left = value;
    }
  });

  return backing;
}

function digestOf(content: string) {
  return computeEditorContentDigest(content);
}

afterEach(() => {
  while (views.length > 0) {
    views.pop()?.destroy();
  }
});

describe("captureEditorViewState (#273)", () => {
  it("captures the caret position as a zero-length selection", () => {
    const view = mountEditor("hello world");
    view.dispatch({ selection: EditorSelection.single(5) });

    const state = captureEditorViewState(view);

    expect(state.selection).toEqual({ anchor: 5, head: 5 });
  });

  it("captures a forward selection with anchor before head", () => {
    const view = mountEditor("hello world");
    view.dispatch({ selection: EditorSelection.range(2, 8) });

    expect(captureEditorViewState(view).selection).toEqual({
      anchor: 2,
      head: 8
    });
  });

  it("captures a reverse selection with anchor after head", () => {
    const view = mountEditor("hello world");
    view.dispatch({ selection: EditorSelection.range(8, 2) });

    expect(captureEditorViewState(view).selection).toEqual({
      anchor: 8,
      head: 2
    });
  });

  it("captures the scroll offsets from the public scrollDOM surface", () => {
    const view = mountEditor("line\n".repeat(200));
    const backing = withBackedScroll(view);
    backing.top = 480;
    backing.left = 12;

    expect(captureEditorViewState(view).scroll).toEqual({
      top: 480,
      left: 12
    });
  });

  it("handles an empty document", () => {
    const view = mountEditor("");

    const state = captureEditorViewState(view);

    expect(state.selection).toEqual({ anchor: 0, head: 0 });
    expect(state.contentDigest).toEqual(digestOf(""));
  });

  it("computes the content digest from the normalized editor body", () => {
    const view = mountEditor("# Title\n\nParagraph body.");

    expect(captureEditorViewState(view).contentDigest).toEqual(
      digestOf("# Title\n\nParagraph body.")
    );
  });

  it("is a read-only observation: no dispatch, no focus, no state change", () => {
    const view = mountEditor("body text");
    view.dispatch({ selection: EditorSelection.single(4) });

    const stateBefore = view.state;
    const dispatchSpy = vi.spyOn(view, "dispatch");
    const focusSpy = vi.spyOn(view, "focus");

    captureEditorViewState(view);

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(focusSpy).not.toHaveBeenCalled();
    expect(view.state).toBe(stateBefore);
  });

  it("returns plain serializable data with no CodeMirror internals", () => {
    const view = mountEditor("some unique body token 12345");
    view.dispatch({ selection: EditorSelection.range(1, 6) });
    withBackedScroll(view);

    const state = captureEditorViewState(view);

    // Survives a JSON round trip unchanged.
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    // Every node is a plain object / primitive.
    assertPlainSerializable(state);
    // The document body itself never appears in the serialized form.
    expect(JSON.stringify(state)).not.toContain("unique body token");
  });
});

describe("applyEditorViewState (#273) — digest matches", () => {
  it("round-trips a caret position", () => {
    const doc = "The quick brown fox";
    const source = mountEditor(doc);
    source.dispatch({ selection: EditorSelection.single(10) });
    const state = captureEditorViewState(source);

    const target = mountEditor(doc);
    const result = applyEditorViewState(target, state);

    expect(result).toEqual({ status: "applied" });
    expect(target.state.selection.main.anchor).toBe(10);
    expect(target.state.selection.main.head).toBe(10);
  });

  it("round-trips a forward selection, preserving direction", () => {
    const doc = "The quick brown fox";
    const source = mountEditor(doc);
    source.dispatch({ selection: EditorSelection.range(4, 15) });
    const state = captureEditorViewState(source);

    const target = mountEditor(doc);
    applyEditorViewState(target, state);

    const main = target.state.selection.main;
    expect({ anchor: main.anchor, head: main.head }).toEqual({
      anchor: 4,
      head: 15
    });
    expect(main.head).toBeGreaterThan(main.anchor);
  });

  it("round-trips a reverse selection, preserving direction", () => {
    const doc = "The quick brown fox";
    const source = mountEditor(doc);
    source.dispatch({ selection: EditorSelection.range(15, 4) });
    const state = captureEditorViewState(source);

    const target = mountEditor(doc);
    applyEditorViewState(target, state);

    const main = target.state.selection.main;
    expect({ anchor: main.anchor, head: main.head }).toEqual({
      anchor: 15,
      head: 4
    });
    expect(main.head).toBeLessThan(main.anchor);
  });

  it("round-trips the scroll offsets", () => {
    const doc = "line\n".repeat(200);
    const source = mountEditor(doc);
    const sourceScroll = withBackedScroll(source);
    sourceScroll.top = 640;
    sourceScroll.left = 8;
    const state = captureEditorViewState(source);

    const target = mountEditor(doc);
    const targetScroll = withBackedScroll(target);
    const result = applyEditorViewState(target, state);

    expect(result).toEqual({ status: "applied" });
    expect(targetScroll).toEqual({ top: 640, left: 8 });
  });

  it("handles an empty document", () => {
    const source = mountEditor("");
    const state = captureEditorViewState(source);

    const target = mountEditor("");
    const result = applyEditorViewState(target, state);

    expect(result).toEqual({ status: "applied" });
    expect(target.state.selection.main.anchor).toBe(0);
  });

  it("clamps an out-of-range selection endpoint to a document edge (safe fallback)", () => {
    const doc = "short";
    const view = mountEditor(doc);
    const state: EditorViewState = {
      contentDigest: digestOf(doc),
      selection: { anchor: -4, head: 999 },
      scroll: null
    };

    const result = applyEditorViewState(view, state);

    expect(result.status).toBe("fallback");
    expect(result).toMatchObject({ reasons: ["selectionClamped"] });
    const main = view.state.selection.main;
    expect(main.anchor).toBe(0);
    expect(main.head).toBe(doc.length);
  });

  it("resets a non-finite selection to a caret at the document start", () => {
    const doc = "content here";
    const view = mountEditor(doc);
    const state: EditorViewState = {
      contentDigest: digestOf(doc),
      selection: { anchor: Number.NaN, head: Number.POSITIVE_INFINITY },
      scroll: null
    };

    const result = applyEditorViewState(view, state);

    expect(result).toEqual({
      status: "fallback",
      reasons: ["selectionReset"]
    });
    expect(view.state.selection.main.anchor).toBe(0);
    expect(view.state.selection.main.head).toBe(0);
  });

  it("drops only an invalid scroll while still applying a valid selection", () => {
    const doc = "keep the selection please";
    const view = mountEditor(doc);
    withBackedScroll(view);
    const state = {
      contentDigest: digestOf(doc),
      selection: { anchor: 5, head: 9 },
      scroll: { top: -1, left: Number.NaN }
    } as unknown as EditorViewState;

    const result = applyEditorViewState(view, state);

    expect(result).toEqual({
      status: "fallback",
      reasons: ["scrollDropped"]
    });
    const main = view.state.selection.main;
    expect({ anchor: main.anchor, head: main.head }).toEqual({
      anchor: 5,
      head: 9
    });
  });
});

describe("applyEditorViewState (#273) — missing / malformed state", () => {
  it("reports stateMissing for null / undefined and leaves the editor untouched", () => {
    const view = mountEditor("untouched body");
    view.dispatch({ selection: EditorSelection.single(3) });

    expect(applyEditorViewState(view, null)).toEqual({
      status: "fallback",
      reasons: ["stateMissing"]
    });
    expect(applyEditorViewState(view, undefined)).toEqual({
      status: "fallback",
      reasons: ["stateMissing"]
    });
    expect(view.state.selection.main.anchor).toBe(3);
  });

  it("reports stateMalformed for a value that is not a well-formed EditorViewState", () => {
    const view = mountEditor("body");

    for (const malformed of [
      42,
      "nope",
      {},
      { contentDigest: { algorithm: "sha256" }, selection: { anchor: 0, head: 0 } },
      { contentDigest: { algorithm: "md5", digest: "x" }, selection: { anchor: 0, head: 0 } },
      { contentDigest: digestOf("body"), selection: { anchor: "0", head: 0 } },
      { contentDigest: digestOf("body"), selection: null }
    ]) {
      expect(applyEditorViewState(view, malformed)).toEqual({
        status: "fallback",
        reasons: ["stateMalformed"]
      });
    }
  });

  it("reports stateMalformed for a digest that is not a 64-char lowercase hex string", () => {
    const view = mountEditor("body");
    const validDigest = digestOf("body").digest;

    const badDigests = [
      validDigest.slice(0, 63), // 63 chars
      `${validDigest}a`, // 65 chars
      `${validDigest.slice(0, 63)}z`, // non-hex character
      `${validDigest.slice(0, 63)}A`, // uppercase hex character
      "" // empty string
    ];

    for (const digest of badDigests) {
      expect(
        applyEditorViewState(view, {
          contentDigest: { algorithm: "sha256", digest },
          selection: { anchor: 0, head: 0 },
          scroll: null
        })
      ).toEqual({ status: "fallback", reasons: ["stateMalformed"] });

      expect(
        parseEditorViewState({
          contentDigest: { algorithm: "sha256", digest },
          selection: { anchor: 0, head: 0 },
          scroll: null
        })
      ).toEqual({ ok: false, reason: "stateMalformed" });
    }
  });

  it("still accepts a well-formed 64-char lowercase hex digest", () => {
    const view = mountEditor("body");
    const parsed = parseEditorViewState({
      contentDigest: digestOf("body"),
      selection: { anchor: 0, head: 0 },
      scroll: null
    });

    expect(parsed).toMatchObject({ ok: true });
    expect(digestOf("body").digest).toMatch(/^[0-9a-f]{64}$/);
    // Digest matches the live document → applies cleanly, not stateMalformed.
    expect(applyEditorViewState(view, {
      contentDigest: digestOf("body"),
      selection: { anchor: 0, head: 0 },
      scroll: null
    })).toEqual({ status: "applied" });
  });
});

describe("applyEditorViewState (#273) — content digest mismatch", () => {
  function stateForChangedDocument(): {
    savedState: EditorViewState;
    target: EditorView;
  } {
    const source = mountEditor("original body content");
    source.dispatch({ selection: EditorSelection.range(3, 11) });
    const sourceScroll = withBackedScroll(source);
    sourceScroll.top = 300;
    const savedState = captureEditorViewState(source);

    // The document open now differs from the one the View State came from.
    const target = mountEditor("a completely different body");
    return { savedState, target };
  }

  it("detects the mismatch and returns contentMismatch", () => {
    const { savedState, target } = stateForChangedDocument();

    expect(applyEditorViewState(target, savedState)).toEqual({
      status: "contentMismatch"
    });
  });

  it("initializes caret and selection to a zero-length caret at the document start", () => {
    const { savedState, target } = stateForChangedDocument();
    target.dispatch({ selection: EditorSelection.range(2, 6) });

    applyEditorViewState(target, savedState);

    const main = target.state.selection.main;
    expect(main.anchor).toBe(0);
    expect(main.head).toBe(0);
    expect(main.empty).toBe(true);
  });

  it("initializes scroll to the top", () => {
    const { savedState, target } = stateForChangedDocument();
    const targetScroll = withBackedScroll(target);
    targetScroll.top = 220;
    targetScroll.left = 40;

    applyEditorViewState(target, savedState);

    expect(targetScroll).toEqual({ top: 0, left: 0 });
  });

  it("does not apply any part of the saved View State", () => {
    const { savedState, target } = stateForChangedDocument();

    // savedState had a (3,11) selection and top:300 scroll; none of it lands.
    const targetScroll = withBackedScroll(target);
    targetScroll.top = 55;

    applyEditorViewState(target, savedState);

    const main = target.state.selection.main;
    expect(main.anchor).toBe(0);
    expect(main.head).toBe(0);
    expect(targetScroll.top).toBe(0);
  });

  it("lets the caller distinguish contentMismatch from every fallback reason", () => {
    const { savedState, target } = stateForChangedDocument();
    const result = applyEditorViewState(target, savedState);

    // This is exactly the branch a later Session Restore caller keys the
    // "file changed externally, cursor reset" NotificationToast off of.
    expect(result.status).toBe("contentMismatch");
    expect(result).not.toHaveProperty("reasons");
  });
});

describe("parseEditorViewState (#273)", () => {
  it("accepts a well-formed state and marks a malformed scroll as malformed", () => {
    const parsed = parseEditorViewState({
      contentDigest: digestOf("body"),
      selection: { anchor: 1, head: 4 },
      scroll: { top: "bad", left: 0 }
    });

    expect(parsed).toEqual({
      ok: true,
      value: {
        contentDigest: digestOf("body"),
        selection: { anchor: 1, head: 4 },
        scroll: { kind: "malformed" }
      }
    });
  });

  it("keeps a valid scroll", () => {
    const parsed = parseEditorViewState({
      contentDigest: digestOf("body"),
      selection: { anchor: 0, head: 0 },
      scroll: { top: 10, left: 2 }
    });

    expect(parsed).toMatchObject({
      ok: true,
      value: { scroll: { kind: "value", value: { top: 10, left: 2 } } }
    });
  });

  it("treats null / absent scroll as none", () => {
    expect(
      parseEditorViewState({
        contentDigest: digestOf("body"),
        selection: { anchor: 0, head: 0 },
        scroll: null
      })
    ).toMatchObject({ ok: true, value: { scroll: { kind: "none" } } });
  });
});

describe("editorViewState foundation stays out of Session persistence (#273)", () => {
  // Strip comments first: the doc comments deliberately spell out what this
  // foundation does NOT do ("no userData write", "no SQLite", ...), and the
  // guard is about executable code, not prose.
  function stripComments(source: string): string {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
  }

  const digestSource = stripComments(
    readFileSync("src/renderer/editorContentDigest.ts", "utf8")
  );
  const viewStateSource = stripComments(
    readFileSync("src/renderer/editorViewState.ts", "utf8")
  );

  it("adds no persistence / storage wiring", () => {
    for (const source of [digestSource, viewStateSource]) {
      expect(source).not.toMatch(/pergamum\.json/);
      expect(source).not.toMatch(/userData/);
      expect(source).not.toMatch(/better-sqlite3|sqlite|SQLite/);
      expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
      expect(source).not.toMatch(/ipcRenderer|window\.pergamum|contextBridge/);
      expect(source).not.toMatch(/writeFile|readFile|node:fs|"fs"|'fs'/);
      expect(source).not.toMatch(/from "electron"|from 'electron'/);
    }
  });

  it("does not intervene in IME composition or focus", () => {
    for (const source of [digestSource, viewStateSource]) {
      expect(source).not.toMatch(/compositionend|compositionstart|isComposing/);
      expect(source).not.toMatch(/\.focus\(\)/);
    }
  });
});

type PlainSerializable =
  | string
  | number
  | boolean
  | null
  | { [key: string]: PlainSerializable }
  | PlainSerializable[];

function assertPlainSerializable(value: unknown): asserts value is PlainSerializable {
  if (value === null) {
    return;
  }

  const type = typeof value;

  if (type === "string" || type === "number" || type === "boolean") {
    return;
  }

  expect(type).toBe("object");

  if (Array.isArray(value)) {
    for (const item of value) {
      assertPlainSerializable(item);
    }
    return;
  }

  // Reject class instances / exotic objects: only plain object literals pass.
  expect(Object.getPrototypeOf(value)).toBe(Object.prototype);

  for (const nested of Object.values(value as Record<string, unknown>)) {
    assertPlainSerializable(nested);
  }
}
