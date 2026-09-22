/**
 * #407 / #535: the shared "resolve the configured image-attachment save
 * directory into a real, contained, existing directory" logic — extracted
 * from `imageAttachmentSave.ts`'s `saveImageAttachment` (steps 3-7 of its
 * doc comment) so #535's new image-insertion copy path can reuse the exact
 * same security checks instead of re-implementing them:
 *
 *   - save-directory path shape (`validateAttachedImageSaveDestination`),
 *   - `path.resolve` + lexical containment in the project root,
 *   - Pergamum-owned locations (write-lock directory, `.pergamum*` files),
 *   - realpath / symlink / junction containment of every existing ancestor
 *     AND of the leaf directory after creation,
 *   - the resolved leaf is an actual directory, not a regular file,
 *   - lazy `mkdir`.
 *
 * `saveImageAttachment` itself is unchanged in behavior — it now just calls
 * this helper for the shared part and keeps its own timestamped-filename /
 * collision-suffixing / atomic-write logic (step 8) to itself.
 */

import path from "node:path";

import {
  isPathEqualOrInsideDirectory,
  isProjectWriteLockDirectoryTarget,
  isProtectedPergamumDataFilePath
} from "../shared/saveTargetPolicy";
import type { AppPlatform } from "../shared/platform";
import { validateAttachedImageSaveDestination } from "../shared/attachedImageSaveDestination";
import type { SaveImageAttachmentStorageFailureReason } from "../shared/imageAttachmentSaveResult";

export interface ImageAttachmentDestinationFileSystem {
  mkdir(
    dirPath: string,
    options: { recursive: true }
  ): Promise<string | undefined>;
  realpath(target: string): Promise<string>;
  stat(target: string): Promise<{ isDirectory(): boolean }>;
}

export type ResolveImageAttachmentDestinationResult =
  | {
      readonly ok: true;
      readonly resolvedDir: string;
      /** The `/`-joined, `.`-segment-free canonical form of `saveDirectory`. */
      readonly normalized: string;
    }
  | { readonly ok: false; readonly reason: SaveImageAttachmentStorageFailureReason };

function nodeErrorCode(error: unknown): string | null {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : null;
}

function classifyMkdirError(
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
    default:
      return "writeFailure";
  }
}

/**
 * Nearest ancestor of `absolutePath` (inclusive) that exists on disk, and
 * its realpath — or `null` when even the drive/root cannot be resolved. See
 * `imageAttachmentSave.ts`'s original doc comment for why ENOENT/ENOTDIR are
 * both "keep walking up" (Issue #407 remediation §4).
 */
async function nearestExistingRealpath(
  fileSystem: ImageAttachmentDestinationFileSystem,
  absolutePath: string
): Promise<{ probe: string; real: string } | null> {
  let probe = absolutePath;
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

export async function resolveAndPrepareImageAttachmentDestination(
  input: {
    readonly projectRootPath: string;
    readonly saveDirectory: string;
    readonly platform: AppPlatform;
  },
  fileSystem: ImageAttachmentDestinationFileSystem
): Promise<ResolveImageAttachmentDestinationResult> {
  const { projectRootPath, saveDirectory, platform } = input;

  const destination = validateAttachedImageSaveDestination(saveDirectory);
  if (!destination.ok) {
    return { ok: false, reason: "invalidPath" };
  }

  const projectRootAbsolute = path.resolve(projectRootPath);
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
    return { ok: false, reason: "containmentFailure" };
  }

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
  try {
    const stat = await fileSystem.stat(ancestor.probe);
    if (!stat.isDirectory()) {
      return { ok: false, reason: "saveDirectoryNotDirectory" };
    }
  } catch {
    return { ok: false, reason: "saveDirectoryNotDirectory" };
  }

  try {
    await fileSystem.mkdir(resolvedDir, { recursive: true });
  } catch (error) {
    if (nodeErrorCode(error) === "ENOTDIR" || nodeErrorCode(error) === "EEXIST") {
      return { ok: false, reason: "saveDirectoryNotDirectory" };
    }
    return { ok: false, reason: classifyMkdirError(error) };
  }

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

  return { ok: true, resolvedDir, normalized: destination.normalized };
}
