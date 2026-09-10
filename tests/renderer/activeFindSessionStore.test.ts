import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_ACTIVE_FIND_DOCUMENT_STATE,
  DEFAULT_ACTIVE_FIND_UI_STATE,
  getActiveFindDocumentState,
  getActiveFindSessionSummary,
  getActiveFindUiState,
  resetActiveFindSession,
  setActiveFindDocumentState,
  setActiveFindUiState
} from "../../src/renderer/find/activeFindSessionStore";

afterEach(() => {
  resetActiveFindSession();
});

describe("activeFindSessionStore (#425 follow-up)", () => {
  it("defaults: panel closed, search mode, empty per-document state", () => {
    expect(getActiveFindUiState()).toEqual({ open: false, mode: "search" });
    expect(getActiveFindDocumentState("anything")).toEqual(
      DEFAULT_ACTIVE_FIND_DOCUMENT_STATE
    );
    expect(DEFAULT_ACTIVE_FIND_UI_STATE).toEqual({ open: false, mode: "search" });
  });

  it("UI state is a single global value", () => {
    setActiveFindUiState({ open: true, mode: "replace" });
    expect(getActiveFindUiState()).toEqual({ open: true, mode: "replace" });
  });

  it("search state is keyed per documentKey and independent", () => {
    setActiveFindDocumentState("doc-a", {
      ...DEFAULT_ACTIVE_FIND_DOCUMENT_STATE,
      query: "QA",
      options: { caseSensitive: true, wholeWord: false, useRegex: false }
    });
    setActiveFindDocumentState("doc-b", {
      ...DEFAULT_ACTIVE_FIND_DOCUMENT_STATE,
      query: "メイド"
    });

    expect(getActiveFindDocumentState("doc-a").query).toBe("QA");
    expect(getActiveFindDocumentState("doc-a").options.caseSensitive).toBe(true);
    expect(getActiveFindDocumentState("doc-b").query).toBe("メイド");
    expect(getActiveFindDocumentState("doc-b").options.caseSensitive).toBe(false);
    // an untouched document still gets the defaults
    expect(getActiveFindDocumentState("doc-c")).toEqual(
      DEFAULT_ACTIVE_FIND_DOCUMENT_STATE
    );
  });

  it("summary is privacy-safe (booleans + counts, no query text)", () => {
    setActiveFindUiState({ open: true, mode: "replace" });
    setActiveFindDocumentState("doc-a", {
      ...DEFAULT_ACTIVE_FIND_DOCUMENT_STATE,
      query: "secret"
    });
    setActiveFindDocumentState("doc-b", DEFAULT_ACTIVE_FIND_DOCUMENT_STATE);

    const summary = getActiveFindSessionSummary();
    expect(summary).toEqual({
      open: true,
      mode: "replace",
      documentStateCount: 2
    });
    expect(JSON.stringify(summary)).not.toContain("secret");
  });

  it("reset clears the UI state AND every per-document state (project unload)", () => {
    setActiveFindUiState({ open: true, mode: "replace" });
    setActiveFindDocumentState("doc-a", {
      ...DEFAULT_ACTIVE_FIND_DOCUMENT_STATE,
      query: "from project A"
    });

    resetActiveFindSession();

    expect(getActiveFindUiState()).toEqual({ open: false, mode: "search" });
    expect(getActiveFindDocumentState("doc-a")).toEqual(
      DEFAULT_ACTIVE_FIND_DOCUMENT_STATE
    );
    expect(getActiveFindSessionSummary().documentStateCount).toBe(0);
  });
});
