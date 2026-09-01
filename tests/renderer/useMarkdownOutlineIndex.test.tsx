// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProjectDocument,
  updateCurrentDocumentContent
} from "../../src/renderer/currentDocument";
import { createMarkdownCurrentEditor } from "../../src/renderer/currentEditor";
import {
  activeOpenDocument,
  activateOpenDocument,
  closeOpenEditor,
  createInitialOpenDocumentsState,
  openOrActivateDocument,
  updateActiveOpenDocument,
  type OpenDocumentsState
} from "../../src/renderer/openDocuments";
import {
  useMarkdownOutlineIndex,
  type UseMarkdownOutlineIndexResult
} from "../../src/renderer/useMarkdownOutlineIndex";
import { serializeEditorId, type ActiveProjectContext } from "../../src/shared/editorId";

const projectContext: ActiveProjectContext = { rootPath: "C:\\Novel" };

let container: HTMLDivElement;
let root: Root;
let latest: UseMarkdownOutlineIndexResult;

function Harness({ state }: { state: OpenDocumentsState }): null {
  latest = useMarkdownOutlineIndex(state, { debounceMs: 200 });
  return null;
}

function render(state: OpenDocumentsState): void {
  act(() => {
    root.render(<Harness state={state} />);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function projectDoc(relativePath: string, content: string) {
  return createProjectDocument({ relativePath, name: relativePath }, content);
}

function withProjectDoc(relativePath: string, content: string): OpenDocumentsState {
  return openOrActivateDocument(
    createInitialOpenDocumentsState(),
    projectDoc(relativePath, content),
    projectContext
  );
}

function texts(outline: UseMarkdownOutlineIndexResult["activeOutline"]): string[] {
  return outline ? outline.flat.map((h) => h.text) : [];
}

describe("useMarkdownOutlineIndex (#352)", () => {
  it("indexes the active Markdown document immediately (no debounce on first sight)", () => {
    render(withProjectDoc("a.md", "# Alpha\n## Beta"));
    expect(texts(latest.activeOutline)).toEqual(["Alpha", "Beta"]);
  });

  it("debounces active-document edits", () => {
    let state = withProjectDoc("a.md", "# Alpha");
    render(state);
    expect(texts(latest.activeOutline)).toEqual(["Alpha"]);

    state = updateActiveOpenDocument(state, (document) =>
      updateCurrentDocumentContent(
        document,
        "# Alpha\n## Added",
        document.lineEndingBreaks
      )
    );
    render(state);
    // not yet — still within the debounce window
    expect(texts(latest.activeOutline)).toEqual(["Alpha"]);

    act(() => vi.advanceTimersByTime(200));
    expect(texts(latest.activeOutline)).toEqual(["Alpha", "Added"]);
  });

  it("does not re-parse inactive documents on a keystroke in the active one", () => {
    let state = withProjectDoc("a.md", "# Alpha");
    state = openOrActivateDocument(state, projectDoc("b.md", "# Bravo"), projectContext);
    render(state);

    const bKey = serializeEditorId(state.documents[1].id);
    const bBefore = latest.index.documents.get(bKey)!;

    // type in the active doc (b.md) and flush
    state = updateActiveOpenDocument(state, (document) =>
      updateCurrentDocumentContent(
        document,
        "# Bravo\n## More",
        document.lineEndingBreaks
      )
    );
    render(state);
    act(() => vi.advanceTimersByTime(200));

    // a.md's record is the exact same object (never re-parsed)
    const aKey = serializeEditorId(state.documents[0].id);
    expect(latest.index.documents.get(aKey)).toBeDefined();
    // b.md changed
    expect(latest.index.documents.get(bKey)).not.toBe(bBefore);
    expect(texts(latest.activeOutline)).toEqual(["Bravo", "More"]);
  });

  it("refreshes on tab switch: the outgoing doc's pre-switch edits are flushed, the incoming doc shows immediately", () => {
    let state = withProjectDoc("a.md", "# Alpha");
    state = openOrActivateDocument(state, projectDoc("b.md", "# Bravo"), projectContext);
    render(state); // active = b.md

    // switch back to a.md and edit it without waiting for debounce
    state = activateOpenDocument(state, state.documents[0].id);
    render(state);
    expect(texts(latest.activeOutline)).toEqual(["Alpha"]);

    state = updateActiveOpenDocument(state, (document) =>
      updateCurrentDocumentContent(
        document,
        "# Alpha\n## Quick",
        document.lineEndingBreaks
      )
    );
    render(state);

    // switch to b.md before the debounce fires
    state = activateOpenDocument(state, state.documents[1].id);
    render(state);

    // a.md's index entry was flushed on leaving, so it now has the edit
    const aKey = serializeEditorId(state.documents[0].id);
    expect(
      latest.index.documents.get(aKey)!.outline.flat.map((h) => h.text)
    ).toEqual(["Alpha", "Quick"]);
    // and b.md's outline is shown immediately
    expect(texts(latest.activeOutline)).toEqual(["Bravo"]);
  });

  it("drops a closed tab from the index", () => {
    let state = withProjectDoc("a.md", "# Alpha");
    state = openOrActivateDocument(state, projectDoc("b.md", "# Bravo"), projectContext);
    render(state);
    expect(latest.index.documents.size).toBe(2);

    state = closeOpenEditor(state, state.documents[1].id);
    render(state);
    expect(latest.index.documents.size).toBe(1);
    expect(texts(latest.activeOutline)).toEqual(["Alpha"]);
  });

  it("activeOutline is null when the active editor is not Markdown-backed (zero-tab)", () => {
    render(createInitialOpenDocumentsState());
    expect(latest.activeOutline).toBeNull();
    expect(activeOpenDocument(createInitialOpenDocumentsState())).toBeNull();
  });
});
