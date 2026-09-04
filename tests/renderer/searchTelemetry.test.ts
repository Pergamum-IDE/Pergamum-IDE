import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogEvent } = vi.hoisted(() => ({ mockLogEvent: vi.fn() }));

vi.mock("../../src/renderer/debugLog", () => ({
  logRendererDebugEvent: mockLogEvent,
  rendererDebugErrorInfo: (error: unknown) =>
    error instanceof Error ? { name: error.name } : {}
}));

import {
  logSearchCompleted,
  logSearchFailed,
  logSearchStaleDiscarded,
  logSearchStarted,
  newSearchRunId,
  type SearchTelemetryContext,
  type SearchTelemetryMetrics
} from "../../src/renderer/searchTelemetry";

const UUID_A = "018f4b8c-7a2b-7c3d-8e4f-a00000000001";
const UUID_B = "018f4b8c-7a2b-7c3d-8e4f-a00000000002";
const STARTED_AT = new Date("2026-09-04T14:20:00.000Z");

/** Strings that must NEVER appear in any telemetry payload. */
const FORBIDDEN = [
  "オーダ", // atom value
  "ジャンヌ・ヴァルジャン", // entry label
  "第[一二三]章", // regex pattern / query
  "chapters/01.md", // relative path
  "01.md", // filename
  "メイドは沈黙した" // body / matched text
];

function lastDetails(): Record<string, unknown> {
  const call = mockLogEvent.mock.calls.at(-1);
  return (call?.[0] as { details: Record<string, unknown> }).details;
}

function assertNoForbidden(): void {
  const serialized = JSON.stringify(mockLogEvent.mock.calls);
  for (const needle of FORBIDDEN) {
    expect(serialized).not.toContain(needle);
  }
}

function textContext(): SearchTelemetryContext {
  return {
    searchRunId: newSearchRunId(),
    mode: "text",
    startedAt: STARTED_AT,
    text: { wholeWord: true, caseSensitive: false, regex: true }
  };
}

function glossaryContext(
  selectedAtomIds: readonly string[] = [UUID_A, UUID_B]
): SearchTelemetryContext {
  return {
    searchRunId: newSearchRunId(),
    mode: "glossary",
    startedAt: STARTED_AT,
    glossary: { relationMode: "nearby", selectedAtomIds }
  };
}

const METRICS: SearchTelemetryMetrics = {
  durationMs: 83,
  documentCount: 42,
  searchedCharacterCount: 1_080_000,
  resultCount: 12
};

beforeEach(() => {
  mockLogEvent.mockReset();
});

describe("newSearchRunId (#384)", () => {
  it("returns distinct non-empty ids", () => {
    const a = newSearchRunId();
    const b = newSearchRunId();
    expect(a).not.toBe("");
    expect(a).not.toBe(b);
  });
});

describe("logSearchStarted (#384)", () => {
  it("emits search.started with text flags and no query", () => {
    logSearchStarted(textContext());

    expect(mockLogEvent).toHaveBeenCalledTimes(1);
    const [{ level, event, details }] = mockLogEvent.mock.calls[0];
    expect(level).toBe("debug");
    expect(event).toBe("search.started");
    expect(details).toMatchObject({
      searchMode: "text",
      searchWholeWord: true,
      searchCaseSensitive: false,
      searchRegex: true,
      searchStartedAt: "2026-09-04T14:20:00.000Z"
    });
    expect(typeof details.searchRunId).toBe("string");
    expect("query" in details).toBe(false);
    expect("pattern" in details).toBe(false);
    expect("selectedAtomIds" in details).toBe(false);
    assertNoForbidden();
  });

  it("emits search.started with glossary relation mode + UUID atom ids only", () => {
    logSearchStarted(glossaryContext([UUID_A, "オーダ", "not-a-uuid", UUID_B]));

    const details = lastDetails();
    expect(details).toMatchObject({
      searchMode: "glossary",
      searchRelationMode: "nearby",
      selectedAtomIds: [UUID_A, UUID_B],
      selectedAtomCount: 2
    });
    expect("searchWholeWord" in details).toBe(false);
    assertNoForbidden();
  });
});

describe("logSearchCompleted / staleDiscarded (#384)", () => {
  it("completed carries metrics, appliedToUi true, and the same runId as started", () => {
    const context = glossaryContext();
    logSearchStarted(context);
    logSearchCompleted(context, METRICS);

    const startedDetails = mockLogEvent.mock.calls[0][0].details as Record<
      string,
      unknown
    >;
    const completedDetails = lastDetails();

    expect(mockLogEvent.mock.calls[1][0].event).toBe("search.completed");
    expect(completedDetails).toMatchObject({
      searchMode: "glossary",
      searchRelationMode: "nearby",
      selectedAtomCount: 2,
      durationMs: 83,
      searchDocumentCount: 42,
      searchedCharacterCount: 1_080_000,
      searchResultCount: 12,
      searchAppliedToUi: true
    });
    expect(completedDetails.searchRunId).toBe(startedDetails.searchRunId);
    assertNoForbidden();
  });

  it("staleDiscarded carries metrics with appliedToUi false", () => {
    const context = textContext();
    logSearchStaleDiscarded(context, METRICS);

    const details = lastDetails();
    expect(mockLogEvent.mock.calls[0][0].event).toBe("search.staleDiscarded");
    expect(details).toMatchObject({
      searchAppliedToUi: false,
      durationMs: 83,
      searchDocumentCount: 42,
      searchedCharacterCount: 1_080_000,
      searchResultCount: 12
    });
  });

  it("clamps negative / NaN metrics to non-negative integers", () => {
    logSearchCompleted(textContext(), {
      durationMs: -1,
      documentCount: Number.NaN,
      searchedCharacterCount: 3.9,
      resultCount: -5
    });
    expect(lastDetails()).toMatchObject({
      durationMs: 0,
      searchDocumentCount: 0,
      searchedCharacterCount: 3,
      searchResultCount: 0
    });
  });
});

describe("logSearchFailed (#384)", () => {
  it("emits search.failed at error level with only the error name", () => {
    logSearchFailed(glossaryContext(), {
      durationMs: 5,
      error: new TypeError("第[一二三]章 is not a function")
    });

    const call = mockLogEvent.mock.calls[0][0];
    expect(call.level).toBe("error");
    expect(call.event).toBe("search.failed");
    expect(call.details).toMatchObject({
      searchMode: "glossary",
      durationMs: 5,
      error: { name: "TypeError" }
    });
    expect("errorMessage" in call.details).toBe(false);
    assertNoForbidden();
  });
});
