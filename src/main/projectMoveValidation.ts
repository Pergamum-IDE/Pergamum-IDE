/**
 * #324: Move v1 — Phase A validation (dry run).
 *
 * `validateMoveEntries` answers "can these File Explorer files be moved into
 * this folder?" WITHOUT touching the filesystem beyond reads: it `lstat`s
 * each source and the destination, and `readdir`s the destination for
 * conflict detection. It never calls `fs.rename` / `writeFile` / `unlink` /
 * `mkdir`, and it never re-keys Recovery (no path changes happen here).
 *
 * A successful result is execution-ready structured data — Phase B (#325)
 * `fs.rename`s each `sourceAbsolutePath` → `destinationAbsolutePath` and
 * feeds the same pairs to the #320 Recovery re-key mechanism.
 *
 * Validation is all-or-nothing: one bad source makes the whole result
 * `ok: false` (with one error per distinct problem) and no `entries`.
 *
 * Dirty-open-document state is renderer-known; the caller passes it in
 * (`dirtyProjectDocumentRelativePaths`) rather than this module reaching
 * into a main-side global — the same shape #313 rename / Save / Close
 * Project use for renderer-owned state.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  pathHasReservedFileExplorerSegment
} from "../shared/fileExplorerCreate";
import { isProtectedPergamumDataFilePath } from "../shared/saveTargetPolicy";
import {
  isMoveDestinationPathTooLong,
  moveEntryNamesConflict,
  type MoveEntriesValidationError,
  type MoveEntriesValidationResult,
  type ProjectDocumentPathRelocation,
  type ValidatedMoveEntry
} from "../shared/projectMove";

export interface ValidateMoveEntriesInput {
  /** Absolute path of the current project root. */
  readonly projectRootPath: string;
  /** Project-root-relative file / folder paths selected for the move. */
  readonly sourceRelativePaths: readonly string[];
  /** Project-root-relative destination FOLDER path; `""` = project root. */
  readonly destinationFolderRelativePath: string;
  /**
   * Project-root-relative paths of documents currently open with unsaved
   * changes. Renderer-supplied — this module owns no live editor state. For a
   * folder source, any dirty document INSIDE the subtree blocks the Move.
   */
  readonly dirtyProjectDocumentRelativePaths: readonly string[];
  /**
   * #340: project-root-relative paths of every registered project Markdown
   * document. Used to compute a folder source's `movedProjectDocuments`
   * (the subtree's known documents that must be relocated). Main-side data;
   * absent for file-only callers / older tests.
   */
  readonly knownProjectDocumentRelativePaths?: readonly string[];
}

function nodeErrorCode(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
    ? (error as { code: string }).code
    : undefined;
}

/** Case- and NFC-insensitive key for duplicate / same-parent comparison. */
function foldPath(relativePath: string): string {
  return relativePath.normalize("NFC").toLowerCase();
}

/**
 * The parent folder of a project-relative entry path, `""` for a root-level
 * entry. `"a/b/c.md"` → `"a/b"`, `"c.md"` → `""`.
 */
export function moveEntryParentRelativePath(relativePath: string): string {
  const slashIndex = relativePath.lastIndexOf("/");

  return slashIndex === -1 ? "" : relativePath.slice(0, slashIndex);
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

type NormalizedSourcePath =
  | { readonly ok: true; readonly relativePath: string }
  | {
      readonly ok: false;
      readonly reason:
        | "invalid-path"
        | "path-traversal"
        | "source-outside-project";
    };

/**
 * #324: normalise / boundary-check one source string. `..` / `.` segments →
 * `path-traversal`; an absolute path → `source-outside-project`; anything
 * else unusable → `invalid-path`. Exported for focused tests.
 */
export function normalizeMoveSourceRelativePath(
  raw: string
): NormalizedSourcePath {
  if (typeof raw !== "string" || raw.length === 0 || raw.includes("\0")) {
    return { ok: false, reason: "invalid-path" };
  }

  if (path.win32.isAbsolute(raw) || path.posix.isAbsolute(raw)) {
    return { ok: false, reason: "source-outside-project" };
  }

  const segments = raw.replace(/\\/g, "/").split("/");

  if (segments.some((segment) => segment === "." || segment === "..")) {
    return { ok: false, reason: "path-traversal" };
  }

  if (segments.some((segment) => segment.length === 0)) {
    return { ok: false, reason: "invalid-path" };
  }

  const relativePath = segments.join("/");

  if (
    pathHasReservedFileExplorerSegment(relativePath) ||
    segments.some((segment) => isProtectedPergamumDataFilePath(segment))
  ) {
    return { ok: false, reason: "invalid-path" };
  }

  return { ok: true, relativePath };
}

type NormalizedDestinationPath =
  | { readonly ok: true; readonly relativePath: string }
  | {
      readonly ok: false;
      readonly reason:
        | "invalid-path"
        | "path-traversal"
        | "destination-outside-project";
    };

/**
 * #324: normalise / boundary-check the destination FOLDER string. `""` is
 * the project root (valid); `null` is not representable here and the caller
 * rejects it as `invalid-path`. Exported for focused tests.
 */
export function normalizeMoveDestinationFolderRelativePath(
  raw: string
): NormalizedDestinationPath {
  if (typeof raw !== "string" || raw.includes("\0")) {
    return { ok: false, reason: "invalid-path" };
  }

  if (raw.length === 0) {
    return { ok: true, relativePath: "" };
  }

  if (path.win32.isAbsolute(raw) || path.posix.isAbsolute(raw)) {
    return { ok: false, reason: "destination-outside-project" };
  }

  const segments = raw.replace(/\\/g, "/").split("/");

  if (segments.some((segment) => segment === "." || segment === "..")) {
    return { ok: false, reason: "path-traversal" };
  }

  if (segments.some((segment) => segment.length === 0)) {
    return { ok: false, reason: "invalid-path" };
  }

  const relativePath = segments.join("/");

  if (
    pathHasReservedFileExplorerSegment(relativePath) ||
    segments.some((segment) => isProtectedPergamumDataFilePath(segment))
  ) {
    return { ok: false, reason: "invalid-path" };
  }

  return { ok: true, relativePath };
}

interface ResolvedDestination {
  readonly folderRelativePath: string;
  readonly folderAbsolutePath: string;
  readonly entryNames: readonly string[];
}

async function resolveDestination(
  input: ValidateMoveEntriesInput
):
  | Promise<
      | { readonly ok: true; readonly destination: ResolvedDestination }
      | { readonly ok: false; readonly error: MoveEntriesValidationError }
    > {
  const raw = input.destinationFolderRelativePath;

  if (typeof raw !== "string") {
    return { ok: false, error: { reason: "invalid-path" } };
  }

  const normalized = normalizeMoveDestinationFolderRelativePath(raw);

  if (!normalized.ok) {
    return {
      ok: false,
      error: {
        reason: normalized.reason,
        destinationFolderRelativePath: raw
      }
    };
  }

  const folderRelativePath = normalized.relativePath;
  const folderAbsolutePath =
    folderRelativePath === ""
      ? path.resolve(input.projectRootPath)
      : path.resolve(input.projectRootPath, folderRelativePath);

  if (isOutsideProjectRoot(input.projectRootPath, folderAbsolutePath)) {
    return {
      ok: false,
      error: {
        reason: "destination-outside-project",
        destinationFolderRelativePath: folderRelativePath
      }
    };
  }

  try {
    const stats = await fs.lstat(folderAbsolutePath);

    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      return {
        ok: false,
        error: {
          reason: "destination-not-folder",
          destinationFolderRelativePath: folderRelativePath
        }
      };
    }
  } catch (error) {
    const code = nodeErrorCode(error);

    return {
      ok: false,
      error: {
        reason:
          code === "ENOTDIR"
            ? "destination-not-folder"
            : "destination-not-found",
        destinationFolderRelativePath: folderRelativePath
      }
    };
  }

  let entryNames: string[];

  try {
    entryNames = await fs.readdir(folderAbsolutePath);
  } catch {
    // A folder that stat'd as a directory but cannot be listed is treated as
    // missing for Phase A — Phase B would surface the real error.
    return {
      ok: false,
      error: {
        reason: "destination-not-found",
        destinationFolderRelativePath: folderRelativePath
      }
    };
  }

  return {
    ok: true,
    destination: { folderRelativePath, folderAbsolutePath, entryNames }
  };
}

/**
 * #340: `true` when `candidate` is `ancestor` itself or a path inside it.
 * Both are folded, forward-slash project-relative paths.
 */
function isPathWithin(candidate: string, ancestor: string): boolean {
  return candidate === ancestor || candidate.startsWith(`${ancestor}/`);
}

export async function validateMoveEntries(
  input: ValidateMoveEntriesInput
): Promise<MoveEntriesValidationResult> {
  const sources = input.sourceRelativePaths;

  if (!Array.isArray(sources) || sources.length === 0) {
    return { ok: false, errors: [{ reason: "empty-sources" }] };
  }

  const resolvedDestination = await resolveDestination(input);

  if (!resolvedDestination.ok) {
    return { ok: false, errors: [resolvedDestination.error] };
  }

  const { folderRelativePath, folderAbsolutePath, entryNames } =
    resolvedDestination.destination;
  const foldedDestination = foldPath(folderRelativePath);

  const dirtyFoldedPaths = (input.dirtyProjectDocumentRelativePaths ?? [])
    .filter((value): value is string => typeof value === "string")
    .map((value) => foldPath(value.replace(/\\/g, "/")));
  const knownProjectDocuments = (
    input.knownProjectDocumentRelativePaths ?? []
  ).filter((value): value is string => typeof value === "string");

  // #340: a mixed ancestor/descendant selection (e.g. `A/` + `A/B.md`) is
  // rejected wholesale rather than auto-normalised — moving `A/` already
  // carries `A/B.md`, and a doubled relocation / re-key is unsafe in v1.
  const foldedNormalizedSources = sources
    .map((raw) => normalizeMoveSourceRelativePath(raw))
    .filter((r): r is { ok: true; relativePath: string } => r.ok)
    .map((r) => foldPath(r.relativePath));
  const hasAncestorDescendantPair = foldedNormalizedSources.some((a, index) =>
    foldedNormalizedSources.some(
      (b, otherIndex) =>
        index !== otherIndex && a !== b && isPathWithin(b, a)
    )
  );

  const errors: MoveEntriesValidationError[] = [];
  const entries: ValidatedMoveEntry[] = [];
  const seenSources = new Set<string>();

  if (hasAncestorDescendantPair) {
    errors.push({ reason: "contains-ancestor-and-descendant" });
  }

  for (const rawSource of sources) {
    // A raw source string that resolves to the project root itself (empty /
    // only slashes) can never be a Move source.
    if (
      typeof rawSource === "string" &&
      rawSource.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "")
        .length === 0
    ) {
      errors.push({ reason: "source-is-project-root" });
      continue;
    }

    const normalized = normalizeMoveSourceRelativePath(rawSource);

    if (!normalized.ok) {
      errors.push({
        reason: normalized.reason,
        sourceRelativePath: typeof rawSource === "string" ? rawSource : undefined
      });
      continue;
    }

    const sourceRelativePath = normalized.relativePath;
    const foldedSource = foldPath(sourceRelativePath);

    if (seenSources.has(foldedSource)) {
      errors.push({ reason: "duplicate-source", sourceRelativePath });
      continue;
    }
    seenSources.add(foldedSource);

    const sourceAbsolutePath = path.resolve(
      input.projectRootPath,
      sourceRelativePath
    );

    if (isOutsideProjectRoot(input.projectRootPath, sourceAbsolutePath)) {
      errors.push({ reason: "source-outside-project", sourceRelativePath });
      continue;
    }

    let sourceStats: Awaited<ReturnType<typeof fs.lstat>>;

    try {
      sourceStats = await fs.lstat(sourceAbsolutePath);
    } catch {
      errors.push({ reason: "source-not-found", sourceRelativePath });
      continue;
    }

    // #340: a folder source is now valid (moved as a subtree); only a
    // symlink or an exotic node (socket / device / fifo) is rejected.
    const sourceIsDirectory = sourceStats.isDirectory();

    if (
      sourceStats.isSymbolicLink() ||
      (!sourceStats.isFile() && !sourceIsDirectory)
    ) {
      errors.push({ reason: "source-not-file", sourceRelativePath });
      continue;
    }

    // #340: for a folder source, a dirty open document ANYWHERE in the
    // subtree blocks the Move (the renderer's identity update only follows
    // clean documents).
    const hasDirtyInScope = sourceIsDirectory
      ? dirtyFoldedPaths.some((dirty) =>
          isPathWithin(dirty, foldedSource)
        )
      : dirtyFoldedPaths.includes(foldedSource);

    if (hasDirtyInScope) {
      errors.push({
        reason: "source-dirty-open-document",
        sourceRelativePath
      });
      continue;
    }

    // #340: a folder can never be moved into itself or its own subtree.
    if (
      sourceIsDirectory &&
      isPathWithin(foldedDestination, foldedSource)
    ) {
      errors.push({
        reason: "destination-inside-source",
        sourceRelativePath,
        destinationFolderRelativePath: folderRelativePath
      });
      continue;
    }

    // #324: same-parent is a no-op — it MUST be caught before conflict
    // detection, otherwise a file "moved" into its own folder sees itself as
    // an existing same-name file and a no-op becomes a false conflict.
    if (foldPath(moveEntryParentRelativePath(sourceRelativePath)) ===
      foldedDestination
    ) {
      errors.push({
        reason: "same-parent",
        sourceRelativePath,
        destinationFolderRelativePath: folderRelativePath
      });
      continue;
    }

    const baseName =
      sourceRelativePath.split("/").pop() ?? sourceRelativePath;

    // #340: a name collision is a conflict for a folder too — folders are
    // never merged.
    if (
      entryNames.some((existingName) =>
        moveEntryNamesConflict(existingName, baseName)
      )
    ) {
      errors.push({
        reason: "destination-conflict",
        sourceRelativePath,
        destinationFolderRelativePath: folderRelativePath
      });
      continue;
    }

    const destinationRelativePath =
      folderRelativePath === "" ? baseName : `${folderRelativePath}/${baseName}`;
    const destinationAbsolutePath = path.join(folderAbsolutePath, baseName);

    if (isMoveDestinationPathTooLong(destinationAbsolutePath)) {
      errors.push({
        reason: "destination-path-too-long",
        sourceRelativePath,
        destinationFolderRelativePath: folderRelativePath
      });
      continue;
    }

    // #340: for a folder, relocate every registered project Markdown document
    // inside the subtree. New path = the folder's new location + the tail
    // after the old folder path.
    const subtreePrefix = `${sourceRelativePath}/`;
    const movedProjectDocuments: ProjectDocumentPathRelocation[] =
      sourceIsDirectory
        ? knownProjectDocuments
            .filter((doc) => doc.startsWith(subtreePrefix))
            .map((oldRelativePath) => ({
              oldRelativePath,
              newRelativePath:
                destinationRelativePath +
                oldRelativePath.slice(sourceRelativePath.length)
            }))
        : [];

    entries.push({
      sourceRelativePath,
      destinationFolderRelativePath: folderRelativePath,
      destinationRelativePath,
      sourceAbsolutePath,
      destinationAbsolutePath,
      isDirectory: sourceIsDirectory,
      movedProjectDocuments
    });
  }

  // #340 blocker: two sources in THIS batch that would land on the same
  // destination path (after NFC + case folding) collide with each other —
  // e.g. `A/foo.md` and `B/foo.md` both → `Archive/foo.md`. This is invisible
  // to the per-source filesystem conflict check (`entryNames`), so detect it
  // here and reject every colliding entry before any `fs.rename` runs.
  const foldedDestinationCounts = new Map<string, number>();
  for (const entry of entries) {
    const key = foldPath(entry.destinationRelativePath);
    foldedDestinationCounts.set(key, (foldedDestinationCounts.get(key) ?? 0) + 1);
  }
  for (const entry of entries) {
    if (
      (foldedDestinationCounts.get(foldPath(entry.destinationRelativePath)) ??
        0) > 1
    ) {
      errors.push({
        reason: "batch-destination-conflict",
        sourceRelativePath: entry.sourceRelativePath,
        destinationFolderRelativePath: entry.destinationFolderRelativePath
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, entries };
}
