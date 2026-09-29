import { promises as fs } from "node:fs";
import path from "node:path";
import {
  parseJapaneseLintWorkerRequest,
  type JapaneseLintWorkerErrorKind,
  type JapaneseLintWorkerResponse
} from "../../shared/japaneseLintWorkerProtocol";
import { sanitizeErrorForLog } from "../sanitizeErrorForLog";
import { japaneseLintDictionaryProbeFile } from "./japaneseLintDictionary";

/**
 * The Linter Worker's message handling, independent of Electron so it can be
 * unit-tested and driven over any transport. The utilityProcess entry
 * (japaneseLintWorker.ts) wires it to a MessagePort.
 *
 * Foundation slice: init / ping / shutdown only. It does not run textlint.
 * Every error leaves this module already sanitized (name / code / allow-listed
 * stack frames) - a raw `message` never reaches a response.
 */

export interface JapaneseLintWorkerCoreDeps {
  send(response: JapaneseLintWorkerResponse): void;
  exit(code: number): void;
  /** True when the kuromoji dictionary directory is readable. */
  dictionaryExists(dictionaryPath: string): Promise<boolean>;
}

export interface JapaneseLintWorkerCore {
  handleMessage(raw: unknown): Promise<void>;
  /** Reports a fatal error (uncaught exception / rejection), then exits. */
  reportFatal(
    kind: "uncaught-exception" | "unhandled-rejection",
    error: unknown
  ): void;
}

export async function dictionaryDirectoryExists(
  dictionaryPath: string
): Promise<boolean> {
  try {
    await fs.access(path.join(dictionaryPath, japaneseLintDictionaryProbeFile));

    return true;
  } catch {
    return false;
  }
}

export function createJapaneseLintWorkerCore(
  deps: JapaneseLintWorkerCoreDeps
): JapaneseLintWorkerCore {
  let state: "uninitialized" | "ready" | "stopping" = "uninitialized";

  function sendError(
    kind: JapaneseLintWorkerErrorKind,
    error: unknown,
    requestId?: string
  ): void {
    const sanitized = sanitizeErrorForLog(error);

    deps.send({
      type: "error",
      ...(requestId !== undefined ? { requestId } : {}),
      error: {
        kind,
        name: sanitized.name,
        ...(sanitized.code !== undefined ? { code: sanitized.code } : {}),
        stack: sanitized.stack
      }
    });
  }

  function requestIdOf(raw: unknown): string | undefined {
    const id =
      typeof raw === "object" && raw !== null
        ? (raw as Record<string, unknown>).requestId
        : undefined;

    return typeof id === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(id)
      ? id
      : undefined;
  }

  async function handleMessage(raw: unknown): Promise<void> {
    try {
      const request = parseJapaneseLintWorkerRequest(raw);

      if (request === null) {
        sendError("invalid-message", undefined, requestIdOf(raw));

        return;
      }

      switch (request.type) {
        case "init": {
          if (!(await deps.dictionaryExists(request.dictionaryPath))) {
            sendError("dictionary-missing", undefined, request.requestId);

            return;
          }

          state = "ready";
          deps.send({ type: "ready", requestId: request.requestId });

          return;
        }
        case "ping": {
          if (state !== "ready") {
            sendError("not-initialized", undefined, request.requestId);

            return;
          }

          deps.send({ type: "pong", requestId: request.requestId });

          return;
        }
        case "shutdown": {
          const alreadyStopping = state === "stopping";

          state = "stopping";
          deps.send({
            type: "shutdown-complete",
            requestId: request.requestId
          });

          // A repeated shutdown is answered but never exits twice.
          if (!alreadyStopping) {
            deps.exit(0);
          }

          return;
        }
      }
    } catch (error) {
      sendError("internal", error, requestIdOf(raw));
    }
  }

  return {
    handleMessage,
    reportFatal(kind, error) {
      try {
        sendError(kind, error);
      } finally {
        deps.exit(1);
      }
    }
  };
}
