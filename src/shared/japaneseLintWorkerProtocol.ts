/**
 * #625 Linter Worker (Electron utilityProcess) message protocol.
 *
 * Host (Main Process) <-> Worker messages travel over a MessagePort. Every
 * request carries a `requestId`, and every response echoes it, so a Host can
 * match answers to questions and reject exactly the ones a dying Worker
 * leaves unanswered.
 *
 * This slice only carries lifecycle traffic (init / ping / shutdown). No
 * manuscript text is part of the protocol yet, and errors cross the boundary
 * only in sanitized form (see sanitizeErrorForLog.ts) - never a raw message.
 */

import {
  enabledJapaneseLintRules,
  isJapaneseLintRuleId,
  resolveJapaneseLintSettings,
  type EnabledJapaneseLintRule,
  type JapaneseLintRuleId
} from "./japaneseLintRules";

export interface JapaneseLintWorkerConfig {
  /** Ids of the rules switched on, in catalog order. */
  readonly enabledRuleIds: readonly JapaneseLintRuleId[];
  /** Snapshot of the enabled rules with their numeric options. */
  readonly rules: readonly EnabledJapaneseLintRule[];
  readonly debounceMs: number;
  readonly lineCacheLimit: number;
  readonly workerRestartAttempts: number;
}

export type JapaneseLintWorkerRequest =
  | {
      readonly type: "init";
      readonly requestId: string;
      readonly dictionaryPath: string;
      readonly config: JapaneseLintWorkerConfig;
    }
  | { readonly type: "ping"; readonly requestId: string }
  | { readonly type: "shutdown"; readonly requestId: string };

export type JapaneseLintWorkerRequestType =
  JapaneseLintWorkerRequest["type"];

export type JapaneseLintWorkerErrorKind =
  | "invalid-message"
  | "not-initialized"
  | "dictionary-missing"
  | "init-failed"
  | "uncaught-exception"
  | "unhandled-rejection"
  | "internal";

export interface SanitizedWorkerError {
  readonly kind: JapaneseLintWorkerErrorKind;
  readonly name: string;
  readonly code?: string;
  readonly stack: readonly string[];
}

export type JapaneseLintWorkerResponse =
  | { readonly type: "ready"; readonly requestId: string }
  | { readonly type: "pong"; readonly requestId: string }
  | { readonly type: "shutdown-complete"; readonly requestId: string }
  | {
      readonly type: "error";
      readonly requestId?: string;
      readonly error: SanitizedWorkerError;
    };

/** The first message on the Host -> Worker channel hands over the port. */
export const JAPANESE_LINT_WORKER_CONNECT_MESSAGE = {
  type: "connect"
} as const;

const requestIdPattern = /^[A-Za-z0-9_.-]{1,80}$/;
const errorKinds: readonly JapaneseLintWorkerErrorKind[] = [
  "invalid-message",
  "not-initialized",
  "dictionary-missing",
  "init-failed",
  "uncaught-exception",
  "unhandled-rejection",
  "internal"
];
const safeNamePattern = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const safeCodePattern = /^[A-Za-z0-9_.-]{1,80}$/;
const stackFramePattern =
  /^ {4}at [A-Za-z_$][\w$.]*(?: \[as [A-Za-z_$][\w$]*\])? \(app\.asar\/[A-Za-z0-9_.\-@+/]+:\d+:\d+\)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSafeRequestId(value: unknown): value is string {
  return typeof value === "string" && requestIdPattern.test(value);
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

export function isJapaneseLintWorkerConfig(
  value: unknown
): value is JapaneseLintWorkerConfig {
  if (!isRecord(value)) {
    return false;
  }

  const { enabledRuleIds, rules, debounceMs, lineCacheLimit, workerRestartAttempts } =
    value;

  return (
    Array.isArray(enabledRuleIds) &&
    enabledRuleIds.every(isJapaneseLintRuleId) &&
    Array.isArray(rules) &&
    rules.every(
      (rule) =>
        isRecord(rule) &&
        isJapaneseLintRuleId(rule.id) &&
        isRecord(rule.options) &&
        Object.values(rule.options).every(
          (option) => typeof option === "number" && Number.isFinite(option)
        )
    ) &&
    isFiniteInteger(debounceMs) &&
    isFiniteInteger(lineCacheLimit) &&
    isFiniteInteger(workerRestartAttempts)
  );
}

/** Validates an untrusted message on the Worker side. null = malformed. */
export function parseJapaneseLintWorkerRequest(
  raw: unknown
): JapaneseLintWorkerRequest | null {
  if (!isRecord(raw) || !isSafeRequestId(raw.requestId)) {
    return null;
  }

  switch (raw.type) {
    case "ping":
    case "shutdown":
      return { type: raw.type, requestId: raw.requestId };
    case "init":
      return typeof raw.dictionaryPath === "string" &&
        raw.dictionaryPath.length > 0 &&
        raw.dictionaryPath.length <= 4096 &&
        isJapaneseLintWorkerConfig(raw.config)
        ? {
            type: "init",
            requestId: raw.requestId,
            dictionaryPath: raw.dictionaryPath,
            config: raw.config
          }
        : null;
    default:
      return null;
  }
}

function parseSanitizedWorkerError(raw: unknown): SanitizedWorkerError | null {
  if (
    !isRecord(raw) ||
    !errorKinds.includes(raw.kind as JapaneseLintWorkerErrorKind) ||
    typeof raw.name !== "string" ||
    !safeNamePattern.test(raw.name) ||
    !Array.isArray(raw.stack)
  ) {
    return null;
  }

  if (raw.code !== undefined && !(typeof raw.code === "string" && safeCodePattern.test(raw.code))) {
    return null;
  }

  // Re-check every frame: the Worker is another process and is not trusted.
  const stack = raw.stack
    .filter(
      (frame): frame is string =>
        typeof frame === "string" && stackFramePattern.test(frame)
    )
    .slice(0, 20);

  return {
    kind: raw.kind as JapaneseLintWorkerErrorKind,
    name: raw.name,
    ...(typeof raw.code === "string" ? { code: raw.code } : {}),
    stack
  };
}

/** Validates an untrusted message on the Host side. null = malformed. */
export function parseJapaneseLintWorkerResponse(
  raw: unknown
): JapaneseLintWorkerResponse | null {
  if (!isRecord(raw)) {
    return null;
  }

  switch (raw.type) {
    case "ready":
    case "pong":
    case "shutdown-complete":
      return isSafeRequestId(raw.requestId)
        ? { type: raw.type, requestId: raw.requestId }
        : null;
    case "error": {
      const error = parseSanitizedWorkerError(raw.error);

      if (error === null) {
        return null;
      }

      if (raw.requestId === undefined) {
        return { type: "error", error };
      }

      return isSafeRequestId(raw.requestId)
        ? { type: "error", requestId: raw.requestId, error }
        : null;
    }
    default:
      return null;
  }
}

/**
 * The config a Host sends with `init`: the rule snapshot plus the runtime
 * settings, resolved from the stored `japaneseLint` settings section.
 */
export function buildJapaneseLintWorkerConfig(
  storedSettings: unknown
): JapaneseLintWorkerConfig {
  const resolved = resolveJapaneseLintSettings(storedSettings);
  const rules = enabledJapaneseLintRules(storedSettings);

  return {
    enabledRuleIds: rules.map((rule) => rule.id),
    rules,
    debounceMs: resolved.debounceMs,
    lineCacheLimit: resolved.lineCacheLimit,
    workerRestartAttempts: resolved.workerRestartAttempts
  };
}
