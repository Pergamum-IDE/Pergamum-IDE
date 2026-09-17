import { TextDecoder } from "node:util";
import type { MarkdownLineEnding } from "../shared/api";
import type { DebugLogReason } from "../shared/debugLog";
import { sanitizedFileIoErrorMessage } from "../shared/sanitizedFileIoErrorMessage";
import { PergamumTextFileEncodingError } from "./textFileIo";

export interface DecodedMarkdownContent {
  content: string;
  encoding: "utf8";
  lineEnding: MarkdownLineEnding;
  byteLength: number;
  characterLength: number;
  hadBom: boolean;
}

export interface MarkdownWriteMetadata {
  encoding: "utf8";
  lineEnding: MarkdownLineEnding;
  byteLength: number;
  characterLength: number;
}

export interface SanitizedFileIoError extends Error {
  readonly code: "PERGAMUM_FILE_IO_FAILED";
  readonly reason: DebugLogReason;
}

export function detectMarkdownLineEnding(
  content: string
): MarkdownLineEnding {
  const matches = content.match(/\r\n|\r|\n/g);

  if (!matches || matches.length === 0) {
    return "none";
  }

  const kinds = new Set<MarkdownLineEnding>();

  for (const match of matches) {
    if (match === "\r\n") {
      kinds.add("crlf");
    } else if (match === "\r") {
      kinds.add("cr");
    } else {
      kinds.add("lf");
    }
  }

  return kinds.size === 1 ? [...kinds][0] : "mixed";
}

function invalidEncodingError(): Error & { code: string } {
  const error = new Error("File is not valid UTF-8.") as Error & {
    code: string;
  };
  error.code = "ERR_INVALID_ENCODING";

  return error;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes
    );
  } catch {
    throw invalidEncodingError();
  }
}

export function decodeMarkdownBytes(
  bytes: Uint8Array
): DecodedMarkdownContent {
  const decoded = decodeUtf8(bytes);
  const hadBom = decoded.charCodeAt(0) === 0xfeff;
  const content = hadBom ? decoded.slice(1) : decoded;

  return {
    content,
    encoding: "utf8",
    lineEnding: detectMarkdownLineEnding(content),
    byteLength: bytes.byteLength,
    characterLength: content.length,
    hadBom
  };
}

export function markdownWriteMetadata(
  content: string
): MarkdownWriteMetadata {
  return {
    encoding: "utf8",
    lineEnding: detectMarkdownLineEnding(content),
    byteLength: Buffer.byteLength(content, "utf8"),
    characterLength: content.length
  };
}

export function fileIoFailureReason(error: unknown): DebugLogReason {
  if (error instanceof PergamumTextFileEncodingError) {
    return error.reason === "unencodableCharacters"
      ? "unencodableCharacters"
      : "invalidEncoding";
  }

  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : null;

  switch (code) {
    case "EACCES":
    case "EPERM":
      return "permissionDenied";
    case "ENOENT":
      return "notFound";
    case "EINVAL":
    case "ENAMETOOLONG":
    case "ERR_INVALID_ARG_TYPE":
    case "ERR_UNSUPPORTED_SAVE_TARGET":
      return "invalidPath";
    case "ERR_INVALID_ENCODING":
      return "invalidEncoding";
    case "EBUSY":
    case "EAGAIN":
    case "ETXTBSY":
      return "locked";
    default:
      return "unknown";
  }
}

export function sanitizedFileIoError(error: unknown): SanitizedFileIoError {
  const reason = fileIoFailureReason(error);
  const sanitized = new Error(
    sanitizedFileIoErrorMessage(reason)
  ) as SanitizedFileIoError;

  sanitized.name = "PergamumFileIoError";
  Object.defineProperty(sanitized, "code", {
    value: "PERGAMUM_FILE_IO_FAILED",
    enumerable: true
  });
  Object.defineProperty(sanitized, "reason", {
    value: reason,
    enumerable: true
  });

  return sanitized;
}
