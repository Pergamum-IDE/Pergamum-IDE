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

/**
 * #688: what a check is run on. A discriminated union (`kind` is required)
 * so a project file and a glossary Description are never confused, and no fake
 * path is ever needed for the latter.
 *
 * The same target object is meant to be handed to `prepare` and to `run`, so
 * the estimate and the run cannot end up on different snapshots.
 */

/** A saved file of the project, named by its project-relative path. */
export interface JapaneseMachineCheckProjectFileTarget {
  readonly kind: "projectFile";
  /** Project-relative path of the File Explorer file. */
  readonly relativePath: string;
  /**
   * The File Explorer knows the file has unsaved changes in an editor. Only a
   * warning flag: the check always reads the saved file, never editor text.
   */
  readonly isDirty?: boolean;
}

/**
 * The text of a glossary Description (checked as Markdown). Slice 1 only
 * defines and validates this shape; Main does not run it yet.
 */
export interface JapaneseMachineCheckGlossaryDescriptionTarget {
  readonly kind: "glossaryDescription";
  /** The draft text to check. Its size is not limited here (Worker run). */
  readonly text: string;
  /** User-facing name of the target, e.g. "アリス / Description". */
  readonly displayName: string;
}

export type JapaneseMachineCheckTarget =
  | JapaneseMachineCheckProjectFileTarget
  | JapaneseMachineCheckGlossaryDescriptionTarget;

/** No prepare-specific metadata yet: prepare takes the target as is. */
export type JapaneseMachineCheckPrepareRequest = JapaneseMachineCheckTarget;

/** Longest accepted project-relative path (metadata, not body text). */
export const JAPANESE_MACHINE_CHECK_MAX_RELATIVE_PATH_LENGTH = 4096;

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
      readonly targetKind: JapaneseMachineCheckTarget["kind"];
      /** The user-facing name of the target (a file name, or the given name). */
      readonly displayName: string;
      readonly ext: string;
      readonly format: JapaneseLintFormat;
      readonly sourceChars: number;
      readonly sourceLines: number;
      /**
       * A project file whose editor holds unsaved changes that this check
       * (which reads the saved file) leaves out. Always false for a glossary
       * Description: its draft snapshot itself is what is checked.
       */
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
  readonly targetKind: JapaneseMachineCheckTarget["kind"];
  /**
   * The user-facing name of what was checked: a file name, or a glossary
   * Description's entry name as given (never altered).
   */
  readonly displayName: string;
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
  /** The run the stage belongs to; a Renderer ignores other runs'. */
  readonly runId: string;
  readonly stage: JapaneseMachineCheckProgressStage;
}

/**
 * #625 P2c: the Renderer names each run so progress and cancel can be matched
 * to it. Optional on the wire (Main makes one up when missing).
 */
export type JapaneseMachineCheckRunRequest = JapaneseMachineCheckTarget & {
  readonly runId?: string;
};

export interface JapaneseMachineCheckCancelRequest {
  /** Cancel only this run; absent = whatever is running. */
  readonly runId?: string;
}

const runIdPattern = /^[A-Za-z0-9_.-]{1,80}$/;

export function parseJapaneseMachineCheckRunId(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const { runId } = value as Record<string, unknown>;

  return typeof runId === "string" && runIdPattern.test(runId) ? runId : null;
}

/**
 * Validates the untrusted target of a prepare / run request. Returns null for
 * anything that is not a well-formed target. Metadata (path, display name) is
 * length-limited; the body text of a glossary Description deliberately is not
 * (it is checked in a Worker, like the instant linter's text).
 */
export function parseJapaneseMachineCheckRequest(
  value: unknown
): JapaneseMachineCheckTarget | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (record.kind === "projectFile") {
    const { relativePath, isDirty } = record;

    if (
      typeof relativePath !== "string" ||
      relativePath.length === 0 ||
      relativePath.length > JAPANESE_MACHINE_CHECK_MAX_RELATIVE_PATH_LENGTH ||
      relativePath.includes("\0")
    ) {
      return null;
    }

    return {
      kind: "projectFile",
      relativePath,
      ...(typeof isDirty === "boolean" ? { isDirty } : {})
    };
  }

  if (record.kind === "glossaryDescription") {
    const { text, displayName } = record;

    if (
      typeof text !== "string" ||
      typeof displayName !== "string" ||
      displayName.trim().length === 0 ||
      displayName.includes("\0")
    ) {
      return null;
    }

    return { kind: "glossaryDescription", text, displayName };
  }

  return null;
}
