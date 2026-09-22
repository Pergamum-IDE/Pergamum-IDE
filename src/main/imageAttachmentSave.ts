/**
 * #407: authoritative main-process handler that turns a validated clipboard
 * image request into a saved project file.
 *
 * Every renderer-supplied value is RE-checked here (Issue #407 §17 / §33):
 *   - byte length vs. the 128 MiB cap (§10),
 *   - magic bytes / reported MIME reconciliation (§12),
 *   - save-directory path shape (§17),
 *   - `path.resolve` + lexical containment in the project root,
 *   - realpath / symlink / junction containment of every existing ancestor
 *     AND of the leaf directory after creation (§18),
 *   - the resolved leaf is an actual directory, not a regular file (§19).
 *
 * Only then does it lazily `mkdir` the directory (§19), allocate a
 * timestamped filename (§20), and place the file with an exclusive,
 * collision-suffixing, atomic write (§21 / §22 / §23) that never re-encodes
 * the bytes (§13). No Markdown is touched here — link insertion is the
 * renderer's job and happens only after this returns `{ ok: true }` (§25).
 */

import path from "node:path";
import { promises as nodeFs } from "node:fs";

import type { AppPlatform } from "../shared/platform";
import {
  IMAGE_ATTACHMENT_MAX_BYTES,
  imageAttachmentExtension,
  resolveImageAttachmentFormat,
} from "../shared/imageAttachmentFormat";
import type {
  SaveImageAttachmentStorageFailureReason,
  SaveImageAttachmentStorageResult
} from "../shared/imageAttachmentSaveResult";
import { attachedImageFileNameForAttempt } from "../shared/attachedImageFilename";
import {
  writeNewBinaryFileAtomic,
  type BinaryAtomicWriteFileSystem
} from "./atomicFileWriteBinary";
import {
  resolveAndPrepareImageAttachmentDestination,
  type ImageAttachmentDestinationFileSystem
} from "./imageAttachmentDestination";

// ---------------------------------------------------------------------------
// Public request / result contract
// ---------------------------------------------------------------------------

export interface SaveImageAttachmentRequest {
  /** Absolute path of the current project root. Supplied by main-side state. */
  readonly projectRootPath: string;
  /** The configured, still-raw `imageAttachment.saveDirectory` setting value. */
  readonly saveDirectory: string;
  /** Verbatim image bytes (already <= 128 MiB on the renderer side). */
  readonly bytes: Uint8Array;
  /** `File.type` as reported by the clipboard (`""` when absent). */
  readonly reportedMimeType: string;
}

export type {
  SaveImageAttachmentStorageFailureReason as SaveImageAttachmentFailureReason,
  SaveImageAttachmentStorageResult as SaveImageAttachmentResult
} from "../shared/imageAttachmentSaveResult";

// ---------------------------------------------------------------------------
// Injected dependencies (real `node:fs` in production, fakes in tests)
// ---------------------------------------------------------------------------

export interface ImageAttachmentFileSystem extends BinaryAtomicWriteFileSystem {
  mkdir(
    dirPath: string,
    options: { recursive: true }
  ): Promise<string | undefined>;
  realpath(target: string): Promise<string>;
  stat(target: string): Promise<{ isDirectory(): boolean }>;
}

export interface SaveImageAttachmentDeps {
  readonly fileSystem?: ImageAttachmentFileSystem;
  readonly platform?: AppPlatform;
  readonly now?: () => Date;
  /** Deterministic temp-file suffix for the atomic write. */
  readonly tempSuffix?: () => string;
  /** Upper bound on collision-suffix retries. */
  readonly maxCollisionAttempts?: number;
}

const defaultFileSystem = nodeFs as unknown as ImageAttachmentFileSystem;

function nodePlatformToAppPlatform(platform: NodeJS.Platform): AppPlatform {
  switch (platform) {
    case "win32":
      return "windows";
    case "darwin":
      return "macos";
    case "linux":
      return "linux";
    default:
      return "other";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nodeErrorCode(error: unknown): string | null {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : null;
}

function classifyWriteError(
  error: unknown
): SaveImageAttachmentStorageFailureReason {
  switch (nodeErrorCode(error)) {
    case "ENOSPC":
      return "diskFull";
    case "EACCES":
    case "EPERM":
    case "EROFS":
      return "permissionDenied";
    case "EIO":
      return "ioError";
    case "ENOTDIR":
      return "saveDirectoryNotDirectory";
    default:
      return "writeFailure";
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function saveImageAttachment(
  request: SaveImageAttachmentRequest,
  deps: SaveImageAttachmentDeps = {}
): Promise<SaveImageAttachmentStorageResult> {
  const fileSystem = deps.fileSystem ?? defaultFileSystem;
  const platform =
    deps.platform ?? nodePlatformToAppPlatform(process.platform);
  const now = deps.now ?? (() => new Date());
  const maxCollisionAttempts = deps.maxCollisionAttempts ?? 1000;

  // 1. Size (§10) — re-checked even though the renderer already gated it.
  if (request.bytes.byteLength > IMAGE_ATTACHMENT_MAX_BYTES) {
    return {
      ok: false,
      reason: "sizeOverflow",
      actualBytes: request.bytes.byteLength
    };
  }

  // 2. Format (§12) — magic bytes authoritative.
  const format = resolveImageAttachmentFormat({
    bytes: request.bytes,
    reportedMimeType: request.reportedMimeType
  });
  if (!format.ok) {
    return { ok: false, reason: format.reason };
  }

  // 3-7. Save-directory shape, containment, protected locations, and lazy
  // mkdir (§17-§19) — shared with #535's image-insertion copy path.
  const destination = await resolveAndPrepareImageAttachmentDestination(
    { projectRootPath: request.projectRootPath, saveDirectory: request.saveDirectory, platform },
    fileSystem
  );
  if (!destination.ok) {
    return { ok: false, reason: destination.reason };
  }
  const resolvedDir = destination.resolvedDir;

  // 8. Filename allocation + exclusive, collision-suffixing, atomic write
  //    (§20 / §21 / §22 / §23).
  const extension = imageAttachmentExtension(format.format);
  const stamp = now();

  for (let attempt = 0; attempt < maxCollisionAttempts; attempt += 1) {
    const fileName = attachedImageFileNameForAttempt(
      stamp,
      extension,
      attempt
    );
    const targetPath = path.join(resolvedDir, fileName);
    try {
      await writeNewBinaryFileAtomic(targetPath, request.bytes, {
        fileSystem,
        tempSuffix: deps.tempSuffix
      });
      return {
        ok: true,
        relativePath: `${destination.normalized}/${fileName}`,
        fileName,
        format: format.format,
        byteLength: request.bytes.byteLength
      };
    } catch (error) {
      if (nodeErrorCode(error) === "EEXIST") {
        continue;
      }
      return { ok: false, reason: classifyWriteError(error) };
    }
  }

  return { ok: false, reason: "collisionExhausted" };
}
