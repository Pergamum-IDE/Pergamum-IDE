/**
 * #356: File Explorer project-local COPY — Phase A (plan / dry run).
 *
 * `planCopyEntries` answers "what would copying these dragged entries into
 * this folder actually create, and is any of it disallowed?" WITHOUT copying
 * anything. It `lstat`s each source + the destination, `readdir`s the
 * destination for the copy-name ladder, and walks each folder source's
 * subtree for symlinks / protected entries (no content reads).
 *
 * The plan is execution-ready: `executeCopyPlan` (`projectCopyExecution.ts`)
 * copies exactly the `destinationRelativePath` each row names — it never
 * re-runs the ladder.
 *
 * It never calls `fs.cp` / `writeFile` / `mkdir` / `rename`. Boundary /
 * reserved / traversal checks reuse the #324 Move validator's exported
 * helpers; the ancestor-symlink scan reuses the #351 Delete helper.
 */

import { promises as fsPromises } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { scanFileExplorerDeleteAncestorPath } from "./fileExplorerDeleteCollect";
import {
  dirtyPathIsInCopyScope,
  scanCopySubtree
} from "./fileExplorerCopySafety";
import {
  normalizeMoveDestinationFolderRelativePath,
  normalizeMoveSourceRelativePath
} from "./projectMoveValidation";
import {
  isCopyDestinationPathTooLong,
  resolveCopyName,
  type CopyEntriesValidationErrorReason,
  type FileExplorerCopyPlan,
  type FileExplorerCopyPlanRow,
  type FileExplorerCopyPlanRowStatus
} from "../shared/projectCopy";

interface StatLike {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  readonly size: number;
  readonly mtime: Date;
}

interface DirentLike {
  readonly name: string;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

export interface PlanCopyEntriesDeps {
  readonly lstat: (targetPath: string) => Promise<StatLike>;
  readonly readdir: (directoryPath: string) => Promise<readonly DirentLike[]>;
  /** Injectable so a plan id is deterministic in tests. */
  readonly newPlanId: () => string;
}

export const defaultPlanCopyEntriesDeps: PlanCopyEntriesDeps = {
  lstat: (targetPath) => fsPromises.lstat(targetPath),
  readdir: (directoryPath) =>
    fsPromises.readdir(directoryPath, { withFileTypes: true }),
  newPlanId: () => randomUUID()
};

export interface PlanCopyEntriesInput {
  readonly projectRootPath: string;
  readonly sourceRelativePaths: readonly string[];
  /** `""` = project root. */
  readonly destinationFolderRelativePath: string;
  /** Renderer-supplied paths of documents open with unsaved changes. */
  readonly dirtyProjectDocumentRelativePaths: readonly string[];
}

function nodeErrorCode(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
    ? (error as { code: string }).code
    : undefined;
}

function isMissingEntryError(error: unknown): boolean {
  const code = nodeErrorCode(error);
  return code === "ENOENT" || code === "ENOTDIR";
}

function foldPath(relativePath: string): string {
  return relativePath.normalize("NFC").toLowerCase();
}

function foldName(name: string): string {
  return name.normalize("NFC").toLowerCase();
}

function isOutsideProjectRoot(
  projectRootPath: string,
  absolutePath: string
): boolean {
  const relativeFromRoot = path.relative(
    path.resolve(projectRootPath),
    absolutePath
  );
  return (
    relativeFromRoot === ".." ||
    relativeFromRoot.startsWith(`..${path.sep}`) ||
    relativeFromRoot.startsWith("../") ||
    path.isAbsolute(relativeFromRoot)
  );
}

function isPathWithin(candidate: string, ancestor: string): boolean {
  return candidate === ancestor || candidate.startsWith(`${ancestor}/`);
}

function safeIso(date: Date): string | null {
  const time = date.getTime();
  return Number.isNaN(time) ? null : date.toISOString();
}

function blockedPlan(
  planId: string,
  destinationFolderRelativePath: string,
  blockingReason: CopyEntriesValidationErrorReason,
  rows: readonly FileExplorerCopyPlanRow[] = []
): FileExplorerCopyPlan {
  return {
    planId,
    destinationFolderRelativePath,
    rows,
    hasCollisions: false,
    hasBlockingIssues: true,
    blockingReason
  };
}

interface ResolvedDestination {
  readonly folderRelativePath: string;
  readonly folderAbsolutePath: string;
  readonly entryNamesFolded: Set<string>;
}

async function resolveDestination(
  input: PlanCopyEntriesInput,
  deps: PlanCopyEntriesDeps
):
  | Promise<
      | { readonly ok: true; readonly destination: ResolvedDestination }
      | {
          readonly ok: false;
          readonly reason: CopyEntriesValidationErrorReason;
        }
    > {
  const raw = input.destinationFolderRelativePath;
  if (typeof raw !== "string") {
    return { ok: false, reason: "invalid-path" };
  }

  const normalized = normalizeMoveDestinationFolderRelativePath(raw);
  if (!normalized.ok) {
    return {
      ok: false,
      reason:
        normalized.reason === "destination-outside-project"
          ? "destination-outside-project"
          : normalized.reason === "path-traversal"
            ? "path-traversal"
            : "invalid-path"
    };
  }

  const folderRelativePath = normalized.relativePath;
  const folderAbsolutePath =
    folderRelativePath === ""
      ? path.resolve(input.projectRootPath)
      : path.resolve(input.projectRootPath, folderRelativePath);

  if (isOutsideProjectRoot(input.projectRootPath, folderAbsolutePath)) {
    return { ok: false, reason: "destination-outside-project" };
  }

  if (folderRelativePath !== "") {
    const ancestorScan = await scanFileExplorerDeleteAncestorPath(
      input.projectRootPath,
      folderRelativePath,
      deps.lstat
    );
    if (!ancestorScan.ok) {
      return { ok: false, reason: "ancestor-symlink" };
    }
  }

  try {
    const stats = await deps.lstat(folderAbsolutePath);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      return { ok: false, reason: "destination-not-folder" };
    }
  } catch (error) {
    return {
      ok: false,
      reason:
        nodeErrorCode(error) === "ENOTDIR"
          ? "destination-not-folder"
          : "destination-not-found"
    };
  }

  let entryNames: readonly DirentLike[];
  try {
    entryNames = await deps.readdir(folderAbsolutePath);
  } catch {
    return { ok: false, reason: "destination-not-found" };
  }

  return {
    ok: true,
    destination: {
      folderRelativePath,
      folderAbsolutePath,
      entryNamesFolded: new Set(entryNames.map((entry) => foldName(entry.name)))
    }
  };
}


function blockedRow(
  sourceRelativePath: string,
  sourceName: string,
  sourceKind: "file" | "folder",
  reason: CopyEntriesValidationErrorReason,
  sourceSizeBytes: number | null = null,
  sourceModifiedAt: string | null = null
): FileExplorerCopyPlanRow {
  return {
    sourceRelativePath,
    sourceName,
    sourceKind,
    sourceSizeBytes,
    sourceModifiedAt,
    destinationName: "",
    destinationRelativePath: "",
    wasAutoRenamed: false,
    collisionSizeBytes: null,
    collisionModifiedAt: null,
    status: "blocked",
    reason
  };
}

export async function planCopyEntries(
  input: PlanCopyEntriesInput,
  deps: PlanCopyEntriesDeps = defaultPlanCopyEntriesDeps
): Promise<FileExplorerCopyPlan> {
  const planId = deps.newPlanId();
  const sources = input.sourceRelativePaths;

  if (!Array.isArray(sources) || sources.length === 0) {
    return blockedPlan(
      planId,
      typeof input.destinationFolderRelativePath === "string"
        ? input.destinationFolderRelativePath
        : "",
      "empty-sources"
    );
  }

  const resolvedDestination = await resolveDestination(input, deps);
  if (!resolvedDestination.ok) {
    return blockedPlan(
      planId,
      typeof input.destinationFolderRelativePath === "string"
        ? input.destinationFolderRelativePath
        : "",
      resolvedDestination.reason
    );
  }

  const { folderRelativePath, folderAbsolutePath, entryNamesFolded } =
    resolvedDestination.destination;
  const foldedDestination = foldPath(folderRelativePath);

  const dirtyFoldedPaths = (input.dirtyProjectDocumentRelativePaths ?? [])
    .filter((value): value is string => typeof value === "string")
    .map((value) => foldPath(value.replace(/\\/g, "/")));

  // #340-style: a mixed ancestor/descendant selection is refused wholesale.
  const foldedNormalizedSources = sources
    .map((raw) => normalizeMoveSourceRelativePath(raw))
    .filter((r): r is { ok: true; relativePath: string } => r.ok)
    .map((r) => foldPath(r.relativePath));
  const hasAncestorDescendantPair = foldedNormalizedSources.some((a, index) =>
    foldedNormalizedSources.some(
      (b, otherIndex) => index !== otherIndex && a !== b && isPathWithin(b, a)
    )
  );
  if (hasAncestorDescendantPair) {
    return blockedPlan(
      planId,
      folderRelativePath,
      "contains-ancestor-and-descendant"
    );
  }

  const rows: FileExplorerCopyPlanRow[] = [];
  const seenSources = new Set<string>();
  // Names claimed earlier in this batch, so two sources copied into the same
  // folder never land on the same destination name.
  const batchClaimedFolded = new Set<string>();

  for (const rawSource of sources) {
    const rawSourceString =
      typeof rawSource === "string" ? rawSource : String(rawSource);

    if (
      typeof rawSource === "string" &&
      rawSource
        .replace(/\\/g, "/")
        .replace(/\/+/g, "/")
        .replace(/^\/|\/$/g, "").length === 0
    ) {
      rows.push(
        blockedRow(rawSourceString, rawSourceString, "file", "source-is-project-root")
      );
      continue;
    }

    const normalized = normalizeMoveSourceRelativePath(rawSource);
    if (!normalized.ok) {
      const reason: CopyEntriesValidationErrorReason =
        normalized.reason === "source-outside-project"
          ? "source-outside-project"
          : normalized.reason === "path-traversal"
            ? "path-traversal"
            : "invalid-path";
      rows.push(blockedRow(rawSourceString, rawSourceString, "file", reason));
      continue;
    }

    const sourceRelativePath = normalized.relativePath;
    const sourceName =
      sourceRelativePath.split("/").pop() ?? sourceRelativePath;
    const foldedSource = foldPath(sourceRelativePath);

    if (seenSources.has(foldedSource)) {
      rows.push(
        blockedRow(sourceRelativePath, sourceName, "file", "duplicate-source")
      );
      continue;
    }
    seenSources.add(foldedSource);

    const sourceAbsolutePath = path.resolve(
      input.projectRootPath,
      sourceRelativePath
    );

    if (isOutsideProjectRoot(input.projectRootPath, sourceAbsolutePath)) {
      rows.push(
        blockedRow(
          sourceRelativePath,
          sourceName,
          "file",
          "source-outside-project"
        )
      );
      continue;
    }

    const ancestorScan = await scanFileExplorerDeleteAncestorPath(
      input.projectRootPath,
      sourceRelativePath,
      deps.lstat
    );
    if (!ancestorScan.ok) {
      rows.push(
        blockedRow(sourceRelativePath, sourceName, "file", "ancestor-symlink")
      );
      continue;
    }

    let sourceStats: StatLike;
    try {
      sourceStats = await deps.lstat(sourceAbsolutePath);
    } catch (error) {
      rows.push(
        blockedRow(
          sourceRelativePath,
          sourceName,
          "file",
          isMissingEntryError(error) ? "source-not-found" : "enumeration-failed"
        )
      );
      continue;
    }

    const sourceIsDirectory = sourceStats.isDirectory();
    const sourceKind: "file" | "folder" = sourceIsDirectory ? "folder" : "file";
    const sourceSizeBytes = sourceIsDirectory ? null : sourceStats.size;
    const sourceModifiedAt = safeIso(sourceStats.mtime);

    if (
      sourceStats.isSymbolicLink() ||
      (!sourceStats.isFile() && !sourceIsDirectory)
    ) {
      rows.push(
        blockedRow(
          sourceRelativePath,
          sourceName,
          sourceKind,
          "source-not-file-or-folder",
          sourceSizeBytes,
          sourceModifiedAt
        )
      );
      continue;
    }

    const hasDirtyInScope = dirtyPathIsInCopyScope(
      dirtyFoldedPaths,
      foldedSource,
      sourceIsDirectory
    );
    if (hasDirtyInScope) {
      rows.push(
        blockedRow(
          sourceRelativePath,
          sourceName,
          sourceKind,
          "source-dirty-open-document",
          sourceSizeBytes,
          sourceModifiedAt
        )
      );
      continue;
    }

    if (
      sourceIsDirectory &&
      isPathWithin(foldedDestination, foldedSource)
    ) {
      rows.push(
        blockedRow(
          sourceRelativePath,
          sourceName,
          sourceKind,
          "destination-inside-source",
          sourceSizeBytes,
          sourceModifiedAt
        )
      );
      continue;
    }

    if (sourceIsDirectory) {
      const subtreeScan = await scanCopySubtree(
        input.projectRootPath,
        sourceRelativePath,
        deps.readdir
      );
      if (!subtreeScan.ok) {
        rows.push(
          blockedRow(
            sourceRelativePath,
            sourceName,
            sourceKind,
            subtreeScan.reason,
            sourceSizeBytes,
            sourceModifiedAt
          )
        );
        continue;
      }
    }

    const resolvedName = resolveCopyName(
      sourceName,
      sourceIsDirectory,
      (foldedCandidate) =>
        entryNamesFolded.has(foldedCandidate) ||
        batchClaimedFolded.has(foldedCandidate)
    );
    batchClaimedFolded.add(resolvedName.name.normalize("NFC").toLowerCase());

    const destinationRelativePath =
      folderRelativePath === ""
        ? resolvedName.name
        : `${folderRelativePath}/${resolvedName.name}`;
    const destinationAbsolutePath = path.join(
      folderAbsolutePath,
      resolvedName.name
    );

    if (isCopyDestinationPathTooLong(destinationAbsolutePath)) {
      rows.push(
        blockedRow(
          sourceRelativePath,
          sourceName,
          sourceKind,
          "destination-path-too-long",
          sourceSizeBytes,
          sourceModifiedAt
        )
      );
      continue;
    }

    // Collision metadata: the existing item at the FIRST-CHOICE ` copy` name,
    // when one is on disk (that is what the auto-rename stepped around).
    let collisionSizeBytes: number | null = null;
    let collisionModifiedAt: string | null = null;
    if (
      resolvedName.wasAutoRenamed &&
      entryNamesFolded.has(
        resolvedName.firstChoiceName.normalize("NFC").toLowerCase()
      )
    ) {
      try {
        const collisionStats = await deps.lstat(
          path.join(folderAbsolutePath, resolvedName.firstChoiceName)
        );
        collisionSizeBytes = collisionStats.isDirectory()
          ? null
          : collisionStats.size;
        collisionModifiedAt = safeIso(collisionStats.mtime);
      } catch {
        // Best effort — a missing / unreadable colliding item just leaves the
        // metadata blank in the dialog.
      }
    }

    const status: FileExplorerCopyPlanRowStatus = resolvedName.wasAutoRenamed
      ? "will-auto-rename"
      : "ready";

    rows.push({
      sourceRelativePath,
      sourceName,
      sourceKind,
      sourceSizeBytes,
      sourceModifiedAt,
      destinationName: resolvedName.name,
      destinationRelativePath,
      wasAutoRenamed: resolvedName.wasAutoRenamed,
      collisionSizeBytes,
      collisionModifiedAt,
      status
    });
  }

  const hasBlockingIssues = rows.some((row) => row.status === "blocked");
  const hasCollisions = rows.some(
    (row) => row.status === "will-auto-rename"
  );

  return {
    planId,
    destinationFolderRelativePath: folderRelativePath,
    rows,
    hasCollisions,
    hasBlockingIssues
  };
}
