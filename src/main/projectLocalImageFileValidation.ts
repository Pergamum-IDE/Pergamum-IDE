/**
 * #411: authoritative main-process validation of a single project-local image
 * file, shared by
 *   - the `pergamum-asset://` protocol handler ({@link ./pergamumAssetProtocol}),
 *     which serves the bytes to the Markdown Preview, and
 *   - the Markdown image-link diagnostics IPC handler
 *     ({@link ./markdownImageLinkDiagnosticsIpc}), which only reports whether a
 *     link is broken and why.
 *
 * The caller has already parsed a URL / classified a Markdown `src` into a
 * canonical, `.`/`..`-free list of project-relative path segments. This helper
 * performs every filesystem-touching gate:
 *
 *   1. `path.resolve` + lexical containment in the project root,
 *   2. the target is not a Pergamum-owned / protected location
 *      (`.pergamum*` file OR directory segment, the write-lock directory),
 *   3. the filename extension names a supported format (PNG/JPEG/GIF/WebP),
 *   4. realpath containment of the project root AND the resolved file
 *      (symlink / junction escape),
 *   5. the target is a regular file (not a directory), under the size cap,
 *   6. the file's magic bytes actually identify that supported format.
 *
 * It never rewrites, repairs, or converts anything — it reads the file once and
 * reports a typed reason. The reasons are a superset of what the protocol needs
 * (the protocol only maps them to bare HTTP statuses); diagnostics surfaces
 * each one to the author.
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
  IMAGE_ATTACHMENT_MAGIC_PREFIX_LENGTH,
  IMAGE_ATTACHMENT_MAX_BYTES,
  resolveImageAttachmentFormat,
  supportedImageAttachmentFormatForFileName,
  type SupportedImageAttachmentFormat
} from "../shared/imageAttachmentFormat";

export interface ProjectLocalImageFileSystem {
  realpath(target: string): Promise<string>;
  stat(
    target: string
  ): Promise<{ isFile(): boolean; isDirectory(): boolean; size: number }>;
  readFile(target: string): Promise<Uint8Array>;
}

export const defaultProjectLocalImageFileSystem: ProjectLocalImageFileSystem = {
  realpath: (target) => nodeFs.realpath(target),
  stat: (target) => nodeFs.stat(target),
  readFile: (target) => nodeFs.readFile(target)
};

/**
 * Why a project-local image file cannot be displayed. `outsideProject` and
 * `protectedLocation` are decided lexically (no fs touch); the rest require a
 * `realpath` / `stat` / `readFile`.
 */
export type ProjectLocalImageFileRejectionReason =
  | "outsideProject"
  | "protectedLocation"
  | "unsupportedFormat"
  | "missing"
  | "directory"
  | "tooLarge"
  | "formatMismatch";

export type ProjectLocalImageFileValidationResult =
  | {
      readonly ok: true;
      readonly format: SupportedImageAttachmentFormat;
      readonly resolvedRealPath: string;
      /** A fresh, non-shared-backed copy of the file's bytes. */
      readonly bytes: Uint8Array;
    }
  | {
      readonly ok: false;
      readonly reason: ProjectLocalImageFileRejectionReason;
    };

export interface ValidateProjectLocalImageFileInput {
  readonly projectRootPath: string;
  /**
   * Canonical, already-validated project-relative path segments (no `.`, no
   * `..`, no empty, no separators inside a segment). This is what
   * `parsePergamumAssetUrl` / `validateAttachedImageSaveDestination` produce.
   */
  readonly projectRelativeSegments: readonly string[];
  readonly fileSystem?: ProjectLocalImageFileSystem;
  readonly platform: AppPlatform;
  /** Upper bound on the file, bytes. Defaults to the #407 128 MiB cap. */
  readonly maxBytes?: number;
}

export async function validateProjectLocalImageFile(
  input: ValidateProjectLocalImageFileInput
): Promise<ProjectLocalImageFileValidationResult> {
  const fileSystem = input.fileSystem ?? defaultProjectLocalImageFileSystem;
  const maxBytes = input.maxBytes ?? IMAGE_ATTACHMENT_MAX_BYTES;

  const projectRootAbsolute = path.resolve(input.projectRootPath);
  const resolved = path.resolve(
    projectRootAbsolute,
    ...input.projectRelativeSegments
  );

  // 1. Lexical containment.
  try {
    if (
      !isPathEqualOrInsideDirectory(
        resolved,
        projectRootAbsolute,
        input.platform
      )
    ) {
      return { ok: false, reason: "outsideProject" };
    }
  } catch {
    return { ok: false, reason: "outsideProject" };
  }

  // 2. Pergamum-owned / protected locations. `isProtectedPergamumDataFilePath`
  //    only inspects the trailing name, so it also has to be applied per path
  //    segment — otherwise `.pergamum/secret.png` would slip through (a
  //    `.pergamum*` dir is just as off-limits as a `.pergamum*` file). Mirrors
  //    the segment-wise checks in pergamumAssetProtocol.ts / projectIpc.ts.
  try {
    if (
      isProjectWriteLockDirectoryTarget(
        resolved,
        projectRootAbsolute,
        input.platform
      ) ||
      isProtectedPergamumDataFilePath(resolved) ||
      input.projectRelativeSegments.some((segment) =>
        isProtectedPergamumDataFilePath(segment)
      )
    ) {
      return { ok: false, reason: "protectedLocation" };
    }
  } catch {
    return { ok: false, reason: "protectedLocation" };
  }

  // 3. Supported extension.
  const extensionFormat = supportedImageAttachmentFormatForFileName(resolved);
  if (extensionFormat === null) {
    return { ok: false, reason: "unsupportedFormat" };
  }

  // 4. Realpath containment (symlink / junction escape).
  let projectRootReal: string;
  try {
    projectRootReal = await fileSystem.realpath(projectRootAbsolute);
  } catch {
    return { ok: false, reason: "missing" };
  }

  let resolvedReal: string;
  try {
    resolvedReal = await fileSystem.realpath(resolved);
  } catch {
    return { ok: false, reason: "missing" };
  }

  try {
    if (
      !isPathEqualOrInsideDirectory(
        resolvedReal,
        projectRootReal,
        input.platform
      )
    ) {
      return { ok: false, reason: "outsideProject" };
    }
  } catch {
    return { ok: false, reason: "outsideProject" };
  }

  // 5. Regular file, under the size cap.
  let stats: { isFile(): boolean; isDirectory(): boolean; size: number };
  try {
    stats = await fileSystem.stat(resolvedReal);
  } catch {
    return { ok: false, reason: "missing" };
  }
  if (stats.isDirectory() || !stats.isFile()) {
    return { ok: false, reason: "directory" };
  }
  if (stats.size > maxBytes) {
    return { ok: false, reason: "tooLarge" };
  }

  // 6. Magic bytes must confirm the supported format the extension claimed.
  let bytes: Uint8Array;
  try {
    bytes = await fileSystem.readFile(resolvedReal);
  } catch {
    return { ok: false, reason: "missing" };
  }

  const body = Uint8Array.from(bytes);
  const magic = resolveImageAttachmentFormat({
    bytes: body.subarray(0, IMAGE_ATTACHMENT_MAGIC_PREFIX_LENGTH),
    reportedMimeType: ""
  });
  if (!magic.ok || magic.format !== extensionFormat) {
    return { ok: false, reason: "formatMismatch" };
  }

  return {
    ok: true,
    format: magic.format,
    resolvedRealPath: resolvedReal,
    bytes: body
  };
}
