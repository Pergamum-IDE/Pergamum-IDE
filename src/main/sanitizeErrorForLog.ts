/**
 * Error sanitizing for logs that must never carry user text (#625 Linter
 * Worker, and any future process that handles manuscript text).
 *
 * An Error's `message` can contain the manuscript line a parser choked on, a
 * file name, or an absolute path with the user's account name; `stack` can
 * carry a path with the user's home directory. So nothing free-form is kept:
 *   - the message (line 1 of the stack) is DROPPED, always;
 *   - `name` and `code` are kept only when they have a strict identifier shape;
 *   - a stack frame is kept only if it matches the allow-list shape
 *     "at functionName (...app.asar/...:line:column)"; the path before
 *     "app.asar" is cut off, and every other line is dropped.
 * Source maps are not shipped, so the frames stay meaningful without leaking.
 */

export interface SanitizedErrorForLog {
  /** Error name, or "Error" when the original was not a safe identifier. */
  readonly name: string;
  readonly code?: string;
  /** Allow-listed frames only, e.g. "    at tokenize (app.asar/dist/worker.js:120:15)". */
  readonly stack: readonly string[];
}

export const SANITIZED_STACK_MAX_FRAMES = 20;

const safeNamePattern = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const safeCodePattern = /^[A-Za-z0-9_.-]{1,80}$/;

// at [async ]fn.name [as alias] (<anything>app.asar<sep>rest:line:col)
const frameShape =
  /^\s*at (?:async )?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?: \[as [A-Za-z_$][\w$]*\])?) \((.+):(\d+):(\d+)\)$/;
// The path after app.asar/: plain path characters only.
const asarRelativePathShape = /^[A-Za-z0-9_.\-@+/]+$/;

/**
 * Returns the sanitized form of one stack line, or null when it does not have
 * the allow-listed shape.
 */
export function sanitizeStackFrame(line: unknown): string | null {
  if (typeof line !== "string" || line.length > 500) {
    return null;
  }

  const match = frameShape.exec(line);

  if (match === null) {
    return null;
  }

  const [, functionName, location, lineNumber, columnNumber] = match;
  const asarIndex = (location ?? "").search(/(?:^|[\\/])app\.asar[\\/]/);

  if (asarIndex < 0) {
    return null;
  }

  const fromAsar = (location ?? "")
    .slice(asarIndex)
    .replace(/^[\\/]/, "")
    .replace(/\\/g, "/");
  const relative = fromAsar.slice("app.asar/".length);

  if (!asarRelativePathShape.test(relative) || relative.includes("..")) {
    return null;
  }

  return `    at ${functionName} (${fromAsar}:${lineNumber}:${columnNumber})`;
}

/** Sanitizes a stack string; the first (message) line never survives. */
export function sanitizeStackForLog(stack: unknown): string[] {
  if (typeof stack !== "string") {
    return [];
  }

  const frames: string[] = [];

  for (const line of stack.split(/\r?\n/)) {
    if (frames.length >= SANITIZED_STACK_MAX_FRAMES) {
      break;
    }

    const frame = sanitizeStackFrame(line);

    if (frame !== null) {
      frames.push(frame);
    }
  }

  return frames;
}

// A getter can throw (V8 even formats `stack` lazily, which can read
// `message`); a logger must never fail because of the value it is logging.
function readProperty(value: unknown, key: string): unknown {
  try {
    return typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)[key]
      : undefined;
  } catch {
    return undefined;
  }
}

/** Makes any thrown value safe to log. Never reads `message`. */
export function sanitizeErrorForLog(error: unknown): SanitizedErrorForLog {
  const rawName = readProperty(error, "name");
  const rawCode = readProperty(error, "code");
  const name =
    typeof rawName === "string" && safeNamePattern.test(rawName)
      ? rawName
      : "Error";
  const code =
    typeof rawCode === "string" && safeCodePattern.test(rawCode)
      ? rawCode
      : undefined;

  return {
    name,
    ...(code !== undefined ? { code } : {}),
    stack: sanitizeStackForLog(readProperty(error, "stack"))
  };
}
