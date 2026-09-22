/**
 * #535: dry-run planning and actual file copy for the "Insert image"
 * toolbar command. See `src/shared/imageInsertion.ts` for why this is a new,
 * narrower flow rather than a reuse of `saveImageAttachment` (#407) —
 * original file names are preserved and an explicit overwrite is allowed,
 * which is the opposite of that function's auto-rename-on-collision design.
 *
 * The destination-resolution / containment / mkdir logic IS shared with
 * #407 via `resolveAndPrepareImageAttachmentDestination`.
 */

import path from "node:path";
import { promises as nodeFs } from "node:fs";

import type { AppPlatform } from "../shared/platform";
import { resolveImageAttachmentFormat } from "../shared/imageAttachmentFormat";
import type {
  CopyImageInsertionFilesRequest,
  CopyImageInsertionFilesResult,
  ImageInsertionCopyPlanEntry,
  ImageInsertionPlanRejection,
  PlanImageInsertionCopyRequest,
  PlanImageInsertionCopyResult
} from "../shared/imageInsertion";
import {
  resolveAndPrepareImageAttachmentDestination,
  type ImageAttachmentDestinationFileSystem
} from "./imageAttachmentDestination";

export interface ImageInsertionFileSystem
  extends ImageAttachmentDestinationFileSystem {
  readFile(filePath: string): Promise<Uint8Array>;
  writeFile(filePath: string, data: Uint8Array): Promise<void>;
  access(filePath: string): Promise<void>;
}

const defaultFileSystem: ImageInsertionFileSystem =
  nodeFs as unknown as ImageInsertionFileSystem;

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

async function destinationExists(
  fileSystem: ImageInsertionFileSystem,
  targetPath: string
): Promise<boolean> {
  try {
    await fileSystem.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export interface ImageInsertionCopyDeps {
  readonly fileSystem?: ImageInsertionFileSystem;
  readonly platform?: AppPlatform;
}

export async function planImageInsertionCopy(
  request: PlanImageInsertionCopyRequest,
  projectRootPath: string,
  deps: ImageInsertionCopyDeps = {}
): Promise<PlanImageInsertionCopyResult> {
  const fileSystem = deps.fileSystem ?? defaultFileSystem;
  const platform =
    deps.platform ?? nodePlatformToAppPlatform(process.platform);

  const destination = await resolveAndPrepareImageAttachmentDestination(
    { projectRootPath, saveDirectory: request.saveDirectory, platform },
    fileSystem
  );
  if (!destination.ok) {
    return { ok: false, reason: destination.reason };
  }

  const entries: ImageInsertionCopyPlanEntry[] = [];
  const rejected: ImageInsertionPlanRejection[] = [];

  for (const sourcePath of request.sourcePaths) {
    let bytes: Uint8Array;
    try {
      bytes = await fileSystem.readFile(sourcePath);
    } catch {
      rejected.push({ sourcePath, reason: "sourceUnreadable" });
      continue;
    }

    const format = resolveImageAttachmentFormat({
      bytes,
      reportedMimeType: ""
    });
    if (!format.ok) {
      rejected.push({ sourcePath, reason: "unsupportedFormat" });
      continue;
    }

    const fileName = path.basename(sourcePath);
    const destinationAbsolutePath = path.join(destination.resolvedDir, fileName);
    const willOverwrite = await destinationExists(
      fileSystem,
      destinationAbsolutePath
    );

    entries.push({
      sourcePath,
      fileName,
      destinationRelativePath: `${destination.normalized}/${fileName}`,
      willOverwrite
    });
  }

  return { ok: true, entries, rejected };
}

export async function copyImageInsertionFiles(
  request: CopyImageInsertionFilesRequest,
  projectRootPath: string,
  deps: ImageInsertionCopyDeps = {}
): Promise<CopyImageInsertionFilesResult> {
  const fileSystem = deps.fileSystem ?? defaultFileSystem;
  const platform =
    deps.platform ?? nodePlatformToAppPlatform(process.platform);

  const destination = await resolveAndPrepareImageAttachmentDestination(
    { projectRootPath, saveDirectory: request.saveDirectory, platform },
    fileSystem
  );
  if (!destination.ok) {
    return { ok: false, reason: destination.reason };
  }

  const relativePaths: string[] = [];

  // All-or-nothing (Issue #535 §9/§10): the first failure stops the whole
  // batch and reports failure — already-copied files are left on disk
  // (no risky cleanup attempt), but the caller must not insert any Markdown
  // links when this returns `ok: false`.
  for (const sourcePath of request.sourcePaths) {
    let bytes: Uint8Array;
    try {
      bytes = await fileSystem.readFile(sourcePath);
    } catch {
      return { ok: false, reason: "sourceUnreadable" };
    }

    const format = resolveImageAttachmentFormat({
      bytes,
      reportedMimeType: ""
    });
    if (!format.ok) {
      return { ok: false, reason: "unsupportedFormat" };
    }

    const fileName = path.basename(sourcePath);
    const destinationAbsolutePath = path.join(destination.resolvedDir, fileName);

    if (!request.allowOverwrite) {
      const exists = await destinationExists(
        fileSystem,
        destinationAbsolutePath
      );
      if (exists) {
        return { ok: false, reason: "overwriteNotAllowed" };
      }
    }

    try {
      await fileSystem.writeFile(destinationAbsolutePath, bytes);
    } catch (error) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : null;
      switch (code) {
        case "ENOSPC":
          return { ok: false, reason: "diskFull" };
        case "EACCES":
        case "EPERM":
        case "EROFS":
          return { ok: false, reason: "permissionDenied" };
        default:
          return { ok: false, reason: "writeFailure" };
      }
    }

    relativePaths.push(`${destination.normalized}/${fileName}`);
  }

  return { ok: true, relativePaths };
}
