import type { JapaneseLintFormat } from "./japaneseLint";

/**
 * #625 P2a: the Japanese machine check wizard (File Explorer -> right click ->
 * "日本語表現チェック..."). Shapes shared by the Main Process service, the
 * preload bridge and the wizard dialog. Only saved files are checked, in a
 * Worker of their own (never the instant linter's), and only counts come back.
 */

export const JAPANESE_MACHINE_CHECK_EXTENSIONS = [
  ".md",
  ".markdown",
  ".txt"
] as const;

/** Case-insensitive: can this File Explorer file be machine-checked? */
export function isJapaneseMachineCheckPath(path: string): boolean {
  const lower = path.toLowerCase();

  return JAPANESE_MACHINE_CHECK_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function japaneseMachineCheckFormatForPath(
  path: string
): JapaneseLintFormat | null {
  const lower = path.toLowerCase();

  if (lower.endsWith(".txt")) {
    return "text";
  }

  return lower.endsWith(".md") || lower.endsWith(".markdown")
    ? "markdown"
    : null;
}

/** A project-relative path of a file in the File Explorer. */
export interface JapaneseMachineCheckTarget {
  readonly relativePath: string;
}

export interface JapaneseMachineCheckPrepareRequest
  extends JapaneseMachineCheckTarget {
  /** The File Explorer knows the file has unsaved changes in an editor. */
  readonly isDirty?: boolean;
}

export type JapaneseMachineCheckFailureReason =
  | "invalid-request"
  | "no-project"
  | "unsupported-file"
  | "read-failed"
  | "no-rules"
  | "busy"
  | "lint-failed"
  | "worker-failed"
  | "canceled";

/** A rough size class; the wizard words the estimate from it. */
export type JapaneseMachineCheckEstimate = "short" | "medium" | "long";

const SHORT_LIMIT = 20_000;
const MEDIUM_LIMIT = 100_000;

export function estimateJapaneseMachineCheck(
  sourceChars: number
): JapaneseMachineCheckEstimate {
  if (sourceChars <= SHORT_LIMIT) {
    return "short";
  }

  return sourceChars <= MEDIUM_LIMIT ? "medium" : "long";
}

export type JapaneseMachineCheckPrepareResult =
  | {
      readonly ok: true;
      readonly fileName: string;
      readonly ext: string;
      readonly format: JapaneseLintFormat;
      readonly sourceChars: number;
      readonly sourceLines: number;
      readonly isDirty: boolean;
      readonly enabledRuleIds: readonly string[];
      readonly estimate: JapaneseMachineCheckEstimate;
    }
  | {
      readonly ok: false;
      readonly reason: JapaneseMachineCheckFailureReason;
    };

export interface JapaneseMachineCheckRuleCount {
  readonly ruleId: string;
  readonly count: number;
}

/** #625 P2b: ask Main to save the report of a finished run. */
export interface JapaneseMachineCheckSaveReportRequest {
  readonly resultId: string;
}

export type JapaneseMachineCheckSaveReportResult =
  | { readonly ok: true; readonly fileName: string }
  | {
      readonly ok: false;
      readonly reason:
        | "canceled"
        | "not-ready"
        | "write-failed"
        | "invalid-target";
    };

export function parseJapaneseMachineCheckResultId(
  value: unknown
): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const { resultId } = value as Record<string, unknown>;

  return typeof resultId === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(resultId)
    ? resultId
    : null;
}

export interface JapaneseMachineCheckSummary {
  /**
   * Identifies the finished run inside the Main Process, which keeps the
   * findings and the checked text for the Markdown report. The text itself
   * never reaches the Renderer.
   */
  readonly resultId: string;
  readonly fileName: string;
  /** Every finding textlint reported. */
  readonly totalMessages: number;
  /** Findings kept (at most the result cap). */
  readonly returnedMessages: number;
  readonly truncated: boolean;
  readonly sourceChars: number;
  readonly sourceLines: number;
  readonly elapsedMs: number;
  /** Counted over the returned findings, in rule catalog order. */
  readonly ruleCounts: readonly JapaneseMachineCheckRuleCount[];
}

export type JapaneseMachineCheckRunResult =
  | { readonly ok: true; readonly summary: JapaneseMachineCheckSummary }
  | {
      readonly ok: false;
      readonly reason: JapaneseMachineCheckFailureReason;
    };

export type JapaneseMachineCheckProgressStage =
  | "starting"
  | "dictionary-check"
  | "lint-running"
  | "aggregating";

export interface JapaneseMachineCheckProgress {
  readonly stage: JapaneseMachineCheckProgressStage;
}

export function parseJapaneseMachineCheckRequest(
  value: unknown
): JapaneseMachineCheckPrepareRequest | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const { relativePath, isDirty } = value as Record<string, unknown>;

  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    relativePath.length > 4096 ||
    relativePath.includes("\0")
  ) {
    return null;
  }

  return {
    relativePath,
    ...(typeof isDirty === "boolean" ? { isDirty } : {})
  };
}
