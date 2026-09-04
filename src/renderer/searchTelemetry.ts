import {
  logRendererDebugEvent,
  rendererDebugErrorInfo
} from "./debugLog";

/**
 * #384 - Search pane telemetry, emitted through the debug-log pipeline so the
 * records land in the JSONL dogfood log (not just the dev console).
 *
 * Pergamum edits novel manuscripts, so a search log must NEVER carry the query
 * text, a regex pattern, a GlossaryAtom value, a Glossary Entry label, a
 * preview, matched text, the searched body, or any file path / name. This
 * module only ever forwards: mode, boolean text flags, the glossary relation
 * mode, selected atom UUIDs + counts, and size / timing metrics. `searchRunId`
 * correlates the `search.started` / `search.completed` / `search.staleDiscarded`
 * / `search.failed` events of one execution.
 */

export type SearchTelemetryMode = "text" | "glossary";
export type GlossaryTelemetryRelationMode = "any" | "all" | "nearby";

export interface TextSearchTelemetryFlags {
  readonly wholeWord: boolean;
  readonly caseSensitive: boolean;
  readonly regex: boolean;
}

export interface GlossarySearchTelemetryInfo {
  readonly relationMode: GlossaryTelemetryRelationMode;
  /** Selected GlossaryAtom ids. Non-UUID entries are dropped before logging. */
  readonly selectedAtomIds: readonly string[];
}

/** The invariant data of one search execution, created at `search.started`. */
export interface SearchTelemetryContext {
  readonly searchRunId: string;
  readonly mode: SearchTelemetryMode;
  readonly startedAt: Date;
  readonly text?: TextSearchTelemetryFlags;
  readonly glossary?: GlossarySearchTelemetryInfo;
}

/** Completion / discard metrics gathered from the search result. */
export interface SearchTelemetryMetrics {
  readonly durationMs: number;
  readonly documentCount: number;
  readonly searchedCharacterCount: number;
  readonly resultCount: number;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function isoOf(date: Date): string {
  const time = date.getTime();
  return Number.isFinite(time)
    ? new Date(time).toISOString()
    : new Date(0).toISOString();
}

/** A per-execution correlation id. Uses `crypto.randomUUID` when available. */
export function newSearchRunId(): string {
  const cryptoObject: Crypto | undefined =
    typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoObject && typeof cryptoObject.randomUUID === "function") {
    return cryptoObject.randomUUID();
  }
  // Fallback: still opaque, still safe-code shaped, never derived from text.
  return `run-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function modeSpecificDetails(
  context: SearchTelemetryContext
): Record<string, unknown> {
  if (context.mode === "glossary") {
    const selectedAtomIds = (context.glossary?.selectedAtomIds ?? []).filter(
      (atomId) => typeof atomId === "string" && UUID_PATTERN.test(atomId)
    );
    return {
      searchRelationMode: context.glossary?.relationMode ?? "any",
      selectedAtomIds,
      selectedAtomCount: selectedAtomIds.length
    };
  }
  return {
    searchWholeWord: Boolean(context.text?.wholeWord),
    searchCaseSensitive: Boolean(context.text?.caseSensitive),
    searchRegex: Boolean(context.text?.regex)
  };
}

function baseDetails(
  context: SearchTelemetryContext
): Record<string, unknown> {
  return {
    searchRunId: context.searchRunId,
    searchMode: context.mode,
    searchStartedAt: isoOf(context.startedAt),
    ...modeSpecificDetails(context)
  };
}

function metricDetails(
  metrics: SearchTelemetryMetrics
): Record<string, unknown> {
  return {
    durationMs: nonNegativeInteger(metrics.durationMs),
    searchDocumentCount: nonNegativeInteger(metrics.documentCount),
    searchedCharacterCount: nonNegativeInteger(metrics.searchedCharacterCount),
    searchResultCount: nonNegativeInteger(metrics.resultCount)
  };
}

/** Forward one event to the debug-log pipeline. Telemetry must never break the
 *  search, so any pipeline error is swallowed. */
function emitSearchEvent(
  level: "debug" | "error",
  event:
    | "search.started"
    | "search.completed"
    | "search.staleDiscarded"
    | "search.failed",
  details: Record<string, unknown>
): void {
  try {
    logRendererDebugEvent({ level, event, details });
  } catch {
    // Ignored on purpose - a logging failure must not affect search results.
  }
}

/** `search.started` - one search execution is about to run. */
export function logSearchStarted(context: SearchTelemetryContext): void {
  emitSearchEvent("debug", "search.started", baseDetails(context));
}

/** `search.completed` - the search resolved AND became the pane's result. */
export function logSearchCompleted(
  context: SearchTelemetryContext,
  metrics: SearchTelemetryMetrics
): void {
  emitSearchEvent("debug", "search.completed", {
    ...baseDetails(context),
    ...metricDetails(metrics),
    searchAppliedToUi: true
  });
}

/** `search.staleDiscarded` - the search resolved but a newer one had started. */
export function logSearchStaleDiscarded(
  context: SearchTelemetryContext,
  metrics: SearchTelemetryMetrics
): void {
  emitSearchEvent("debug", "search.staleDiscarded", {
    ...baseDetails(context),
    ...metricDetails(metrics),
    searchAppliedToUi: false
  });
}

/** `search.failed` - the search threw. Only the error name / code is logged. */
export function logSearchFailed(
  context: SearchTelemetryContext,
  input: { readonly durationMs: number; readonly error: unknown }
): void {
  emitSearchEvent("error", "search.failed", {
    ...baseDetails(context),
    durationMs: nonNegativeInteger(input.durationMs),
    error: rendererDebugErrorInfo(input.error)
  });
}
