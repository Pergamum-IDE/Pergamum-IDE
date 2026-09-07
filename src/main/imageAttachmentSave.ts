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

import {
  isPathEqualOrInsideDirectory,
  isProjectWriteLockDirectoryTarget,
  isProtectedPergamumDataFilePath
} from "../shared/saveTargetPolicy";
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
import { validateAttachedImageSaveDestination } from "../shared/attachedImageSaveDestination";
import { attachedImageFileNameForAttempt } from "../shared/attachedImageFilename";
import {
  writeNewBinaryFileAtomic,
  type BinaryAtomicWriteFileSystem
} from "./atomicFileWriteBinary";

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

/**
 * Nearest ancestor of `absolutePath` (inclusive) that exists on disk, and
 * its realpath — or `null` when even the drive/root cannot be resolved.
 *
 * A missing component (`ENOENT`) and a non-directory component in the way
 * (`ENOTDIR` — e.g. `.../images/sub` where `images` is a regular file) are
 * BOTH "keep walking up"; the walk then stops at the offending file itself
 * (`realpath` succeeds on a regular file), so the caller can classify the
 * situation identically on Windows and POSIX (Issue #407 remediation §4).
 */
async function nearestExistingRealpath(
  fileSystem: ImageAttachmentFileSystem,
  absolutePath: string
): Promise<{ probe: string; real: string } | null> {
  let probe = absolutePath;
  // Bounded walk: path depth is tiny in practice.
  for (let guard = 0; guard < 4096; guard += 1) {
    try {
      const real = await fileSystem.realpath(probe);
      return { probe, real };
    } catch (error) {
      const code = nodeErrorCode(error);
      if (code !== "ENOENT" && code !== "ENOTDIR") {
        return null;
      }
    }
    const parent = path.dirname(probe);
    if (parent === probe) {
      return null;
    }
    probe = parent;
  }
  return null;
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

  // 3. Save-directory shape (§17).
  const destination = validateAttachedImageSaveDestination(
    request.saveDirectory
  );
  if (!destination.ok) {
    return { ok: false, reason: "invalidPath" };
  }

  // 4. Resolve + lexical containment.
  const projectRootAbsolute = path.resolve(request.projectRootPath);
  const resolvedDir = path.resolve(
    projectRootAbsolute,
    ...destination.segments
  );
  try {
    if (
      !isPathEqualOrInsideDirectory(resolvedDir, projectRootAbsolute, platform)
    ) {
      return { ok: false, reason: "containmentFailure" };
    }
  } catch {
    // A malformed / non-absolute root path — refuse rather than guess.
    return { ok: false, reason: "containmentFailure" };
  }

  // 4b. Pergamum-owned locations are off limits even when project-relative
  //     (Issue #407 remediation §2): the write-lock directory and anything
  //     inside it, and any path shaped like a Pergamum data file
  //     (`.pergamum`, `.pergamum-journal`, `.pergamum-wal`, `.pergamum-shm`).
  try {
    if (
      isProjectWriteLockDirectoryTarget(
        resolvedDir,
        projectRootAbsolute,
        platform
      ) ||
      isProtectedPergamumDataFilePath(resolvedDir)
    ) {
      return { ok: false, reason: "protectedLocation" };
    }
  } catch {
    return { ok: false, reason: "containmentFailure" };
  }

  // 5. Realpath containment of the project root and the nearest existing
  //    ancestor of the target directory (§18: symlink / junction escape).
  let projectRootReal: string;
  try {
    projectRootReal = await fileSystem.realpath(projectRootAbsolute);
  } catch {
    return { ok: false, reason: "containmentFailure" };
  }

  const ancestor = await nearestExistingRealpath(fileSystem, resolvedDir);
  if (!ancestor) {
    return { ok: false, reason: "containmentFailure" };
  }
  if (
    !isPathEqualOrInsideDirectory(ancestor.real, projectRootReal, platform)
  ) {
    return { ok: false, reason: "containmentFailure" };
  }
  // The nearest existing component — whether it is the target dir itself or
  // an ancestor of it — must be a real directory. A regular file there (the
  // leaf, or an intermediate segment like `images` in `images/sub`) makes
  // the save-directory path unusable; classify it the same on every OS
  // rather than depending on a later `mkdir`'s `ENOTDIR` vs `EEXIST` vs
  // `containmentFailure` (Issue #407 remediation §4 / §19).
  try {
    const stat = await fileSystem.stat(ancestor.probe);
    if (!stat.isDirectory()) {
      return { ok: false, reason: "saveDirectoryNotDirectory" };
    }
  } catch {
    return { ok: false, reason: "saveDirectoryNotDirectory" };
  }

  // 6. Lazy mkdir (§19).
  try {
    await fileSystem.mkdir(resolvedDir, { recursive: true });
  } catch (error) {
    if (nodeErrorCode(error) === "ENOTDIR" || nodeErrorCode(error) === "EEXIST") {
      return { ok: false, reason: "saveDirectoryNotDirectory" };
    }
    return { ok: false, reason: classifyWriteError(error) };
  }

  // 7. Re-check the leaf after creation: still a directory, still contained
  //    (a freshly created symlink leaf cannot slip past).
  let leafReal: string;
  try {
    leafReal = await fileSystem.realpath(resolvedDir);
    const leafStat = await fileSystem.stat(resolvedDir);
    if (!leafStat.isDirectory()) {
      return { ok: false, reason: "saveDirectoryNotDirectory" };
    }
  } catch {
    return { ok: false, reason: "containmentFailure" };
  }
  if (!isPathEqualOrInsideDirectory(leafReal, projectRootReal, platform)) {
    return { ok: false, reason: "containmentFailure" };
  }

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
