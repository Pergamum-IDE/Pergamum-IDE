/**
 * #351: File Explorer deletion — Phase A (dry run / collect).
 *
 * `collectFileExplorerDeleteTargets` answers "what would deleting this
 * selection actually remove, and is any of it disallowed?" WITHOUT deleting
 * anything. It:
 *   - normalizes / boundary-checks every SELECTED project-relative path
 *     (traversal, absolute, `\0`, reserved / protected — the same rule the
 *     #324 Move validator applies via `normalizeMoveSourceRelativePath`),
 *   - rejects the project root, an outside-root path, and a symlink
 *     (`lstat` + `isSymbolicLink()` — File Explorer never lists symlinks, so
 *     this is a defense-in-depth check),
 *   - recursively enumerates every file / folder under a selected folder,
 *     including empty folders,
 *   - refuses a selected folder WHOLE when its subtree contains a protected
 *     entry (no partial deletion — ADR-0011 DEL-12),
 *   - reads a small head / tail window of each file for the confirmation
 *     table's preview columns (never the whole file),
 *   - is ALL-OR-NOTHING: one rejected selection makes the result
 *     `ok: false` with every rejection listed and NO targets.
 *
 * It never calls `unlink` / `rmdir` / `rename` / `writeFile`. Phase B
 * (`fileExplorerDeleteExecute.ts`) deletes one already-validated entry at a
 * time, re-checking the boundary each call.
 */

import { promises as fsPromises } from "node:fs";
import path from "node:path";
import {
  isReservedFileExplorerName,
  pathHasReservedFileExplorerSegment
} from "../shared/fileExplorerCreate";
import { isProtectedPergamumDataFilePath } from "../shared/saveTargetPolicy";
import {
  fileExplorerDeletePreviewFragment,
  type FileExplorerDeleteCollectResult,
  type FileExplorerDeleteRejection,
  type FileExplorerDeleteRejectionReason,
  type FileExplorerDeleteTarget
} from "../shared/fileExplorerDelete";

/** Bytes read from the head and (separately) the tail of a file for preview. */
const PREVIEW_READ_BYTES = 4096;

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

export interface FileExplorerDeleteCollectDeps {
  /** `fs.lstat` — does NOT follow a final symlink. */
  readonly lstat: (targetPath: string) => Promise<StatLike>;
  readonly readdir: (directoryPath: string) => Promise<readonly DirentLike[]>;
  /**
   * Read up to `PREVIEW_READ_BYTES` from the start and (separately) from the
   * end of `filePath`. Returns the decoded head / tail text, or
   * `{ unavailable: true }` when the content cannot be read or safely
   * decoded as UTF-8.
   */
  readonly readPreview: (
    filePath: string,
    sizeBytes: number
  ) => Promise<
    | { readonly unavailable: true }
    | { readonly unavailable: false; readonly head: string; readonly tail: string }
  >;
}

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code: unknown }).code);
  }

  return undefined;
}

function isMissingEntryError(error: unknown): boolean {
  const code = nodeErrorCode(error);

  return code === "ENOENT" || code === "ENOTDIR";
}

/** `true` when `value` contains a NUL byte (a strong binary-content signal). */
function hasNulByte(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) === 0) {
      return true;
    }
  }

  return false;
}

/*
 * A preview window is a fixed-length byte slice of a variable-width UTF-8
 * stream, so its boundary can fall INSIDE a multi-byte character even when
 * the whole file is valid UTF-8 (a 4 KB cut lands mid 3-byte character very
 * often in Japanese text). Strict-decoding such a slice on its own would
 * raise a decode error and mislabel a perfectly good file as
 * `プレビュー不可`. These helpers round a window to a whole-character
 * boundary BEFORE the strict decode: a genuinely invalid byte sequence
 * INSIDE the window still fails the decode and is reported as unavailable.
 */

/**
 * UTF-8 lead byte -> total sequence length; `0` when `byte` is not a valid
 * lead byte (a continuation byte, an overlong prefix `0xC0` / `0xC1`, or an
 * out-of-range prefix `0xF5`..`0xFF`). Strict ranges so a genuinely invalid
 * byte is never mistaken for a truncated character and hidden by the
 * boundary trim — it stays in the slice and the strict decode rejects it.
 */
function utf8SequenceLength(byte: number): number {
  if (byte <= 0x7f) return 1;
  if (byte >= 0xc2 && byte <= 0xdf) return 2;
  if (byte >= 0xe0 && byte <= 0xef) return 3;
  if (byte >= 0xf0 && byte <= 0xf4) return 4;
  return 0;
}

function isUtf8ContinuationByte(byte: number): boolean {
  return (byte & 0xc0) === 0x80;
}

/**
 * Drop a truncated multi-byte sequence at the END of a HEAD window (cut at a
 * fixed offset that may land mid-character). A complete trailing character —
 * or a genuinely invalid byte, left for the strict decoder to reject — is
 * kept as-is.
 */
function dropTruncatedTrailingUtf8(bytes: Buffer): Buffer {
  // A UTF-8 sequence is at most 4 bytes, so only the last 3 bytes can be a
  // dangling partial character (lead + up to 3 continuations = a whole one).
  for (let back = 1; back <= 3 && back <= bytes.length; back += 1) {
    const byte = bytes[bytes.length - back];

    if (isUtf8ContinuationByte(byte)) {
      continue;
    }

    const seqLen = utf8SequenceLength(byte);

    if (seqLen <= 1) {
      // ASCII, or an invalid lead byte — nothing to trim at the boundary.
      return bytes;
    }

    // `back` bytes of a sequence that needs `seqLen` are present.
    return back >= seqLen ? bytes : bytes.subarray(0, bytes.length - back);
  }

  return bytes;
}

/**
 * Drop orphan continuation bytes at the START of a TAIL window (which began
 * at `size - N`, possibly mid-character). At most 3 continuation bytes can
 * precede the first whole character.
 */
function dropOrphanLeadingUtf8Continuation(bytes: Buffer): Buffer {
  let start = 0;

  while (
    start < 3 &&
    start < bytes.length &&
    isUtf8ContinuationByte(bytes[start])
  ) {
    start += 1;
  }

  return start === 0 ? bytes : bytes.subarray(start);
}

/** `true` when a bare name is a Pergamum reserved / protected entry. */
export function isProtectedFileExplorerName(name: string): boolean {
  return isReservedFileExplorerName(name) || isProtectedPergamumDataFilePath(name);
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

export type AncestorPathScanResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly offendingPath: string };

/**
 * #351 blocker: a request like `link/escape.md`, where `<root>/link` is a
 * symlink to a directory OUTSIDE the project, stays lexically inside
 * `path.resolve(root, ...)` but resolves to an outside file — and the final
 * `lstat("<root>/link/escape.md").isSymbolicLink()` is then `false`. Defend
 * by `lstat`-ing every ANCESTOR segment (project root down to, but not
 * including, the final component) and refusing the whole path if any is a
 * symlink. v1 keeps the no-`realpath` stance; this is the segment-walk
 * equivalent, applied in BOTH collect and execute, before any
 * `readdir` / read / `unlink` / `rmdir`.
 *
 * A missing ancestor is not an escape (the caller's own `lstat` surfaces
 * not-found); any other `lstat` error means the path cannot be proven safe,
 * so a destructive op is refused.
 */
export async function scanFileExplorerDeleteAncestorPath(
  projectRootPath: string,
  normalizedRelativePath: string,
  lstat: (targetPath: string) => Promise<{ isSymbolicLink(): boolean }>
): Promise<AncestorPathScanResult> {
  const segments = normalizedRelativePath.split("/");

  for (let index = 0; index < segments.length - 1; index += 1) {
    const ancestorRelative = segments.slice(0, index + 1).join("/");
    const ancestorAbsolute = path.resolve(projectRootPath, ancestorRelative);

    let stats: { isSymbolicLink(): boolean };

    try {
      stats = await lstat(ancestorAbsolute);
    } catch (error) {
      if (isMissingEntryError(error)) {
        return { ok: true };
      }
      return { ok: false, offendingPath: ancestorRelative };
    }

    if (stats.isSymbolicLink()) {
      return { ok: false, offendingPath: ancestorRelative };
    }
  }

  return { ok: true };
}

type NormalizedSelection =
  | { readonly ok: true; readonly relativePath: string }
  | { readonly ok: false; readonly reason: FileExplorerDeleteRejectionReason };

/**
 * Normalize / boundary-check one selected path string. Mirrors the #324
 * Move `normalizeMoveSourceRelativePath`, mapped to delete rejection
 * reasons.
 */
export function normalizeFileExplorerDeleteSelection(
  raw: unknown
): NormalizedSelection {
  if (typeof raw !== "string" || raw.includes("\0")) {
    return { ok: false, reason: "invalid-path" };
  }

  // Empty / slashes-only resolves to the project root.
  const collapsed = raw
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "");

  if (collapsed.length === 0) {
    return { ok: false, reason: "project-root" };
  }

  if (path.win32.isAbsolute(raw) || path.posix.isAbsolute(raw)) {
    return { ok: false, reason: "outside-project" };
  }

  const segments = collapsed.split("/");

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
    return { ok: false, reason: "reserved-or-protected" };
  }

  return { ok: true, relativePath };
}

function parentRelativePath(relativePath: string): string {
  const slashIndex = relativePath.lastIndexOf("/");

  return slashIndex === -1 ? "" : relativePath.slice(0, slashIndex);
}

function fileTargetFrom(
  relativePath: string,
  stats: StatLike,
  preview:
    | { readonly unavailable: true }
    | { readonly unavailable: false; readonly head: string; readonly tail: string }
): FileExplorerDeleteTarget {
  const previewUnavailable = preview.unavailable;

  return {
    kind: "file",
    relativePath,
    name: relativePath.split("/").pop() ?? relativePath,
    parentRelativePath: parentRelativePath(relativePath),
    lastModifiedIso: safeIso(stats.mtime),
    sizeBytes: stats.size,
    previewHead: previewUnavailable
      ? null
      : fileExplorerDeletePreviewFragment(preview.head, false),
    previewTail: previewUnavailable
      ? null
      : fileExplorerDeletePreviewFragment(preview.tail, true),
    previewUnavailable
  };
}

function folderTargetFrom(
  relativePath: string,
  stats: StatLike | null
): FileExplorerDeleteTarget {
  return {
    kind: "folder",
    relativePath,
    name: relativePath.split("/").pop() ?? relativePath,
    parentRelativePath: parentRelativePath(relativePath),
    lastModifiedIso: stats ? safeIso(stats.mtime) : null,
    sizeBytes: null,
    previewHead: null,
    previewTail: null,
    previewUnavailable: false
  };
}

function safeIso(date: Date): string | null {
  const time = date.getTime();

  return Number.isNaN(time) ? null : date.toISOString();
}

type SubtreeWalk =
  | { readonly ok: true; readonly targets: readonly FileExplorerDeleteTarget[] }
  | {
      readonly ok: false;
      readonly reason: "folder-contains-protected" | "enumeration-failed";
      readonly offendingPath?: string;
    };

/**
 * Recursively collect every file / folder under `folderRelativePath`
 * (the folder itself is added by the caller). Aborts the whole selected
 * folder if any descendant is a protected entry (DEL-12) or a directory
 * cannot be read.
 */
async function walkSubtree(
  projectRootPath: string,
  folderRelativePath: string,
  deps: FileExplorerDeleteCollectDeps
): Promise<SubtreeWalk> {
  const targets: FileExplorerDeleteTarget[] = [];
  const stack: string[] = [folderRelativePath];

  while (stack.length > 0) {
    const currentRelative = stack.pop()!;
    const currentAbsolute = path.resolve(projectRootPath, currentRelative);

    let entries: readonly DirentLike[];

    try {
      entries = await deps.readdir(currentAbsolute);
    } catch {
      return { ok: false, reason: "enumeration-failed" };
    }

    for (const entry of entries) {
      const childRelative = `${currentRelative}/${entry.name}`;

      // A protected / reserved descendant (Pergamum data, `.git`, OS noise)
      // means the folder cannot be deleted as a whole — no partial deletion.
      if (isProtectedFileExplorerName(entry.name)) {
        return {
          ok: false,
          reason: "folder-contains-protected",
          offendingPath: childRelative
        };
      }

      if (entry.isSymbolicLink()) {
        // A symlink inside a to-be-deleted folder: refuse the whole folder
        // rather than delete through / around it.
        return {
          ok: false,
          reason: "folder-contains-protected",
          offendingPath: childRelative
        };
      }

      if (entry.isDirectory()) {
        let dirStats: StatLike | null = null;

        try {
          dirStats = await deps.lstat(
            path.resolve(projectRootPath, childRelative)
          );
        } catch {
          dirStats = null;
        }

        targets.push(folderTargetFrom(childRelative, dirStats));
        stack.push(childRelative);
        continue;
      }

      if (!entry.isFile()) {
        // socket / fifo / device inside the subtree — refuse the folder.
        return {
          ok: false,
          reason: "folder-contains-protected",
          offendingPath: childRelative
        };
      }

      const childAbsolute = path.resolve(projectRootPath, childRelative);
      let fileStats: StatLike;

      try {
        fileStats = await deps.lstat(childAbsolute);
      } catch {
        return { ok: false, reason: "enumeration-failed" };
      }

      if (fileStats.isSymbolicLink()) {
        return {
          ok: false,
          reason: "folder-contains-protected",
          offendingPath: childRelative
        };
      }

      const preview = await deps.readPreview(childAbsolute, fileStats.size);

      targets.push(fileTargetFrom(childRelative, fileStats, preview));
    }
  }

  return { ok: true, targets };
}

export interface CollectFileExplorerDeleteTargetsInput {
  readonly projectRootPath: string;
  readonly selectedRelativePaths: readonly string[];
}

export async function collectFileExplorerDeleteTargets(
  input: CollectFileExplorerDeleteTargetsInput,
  deps: FileExplorerDeleteCollectDeps
): Promise<FileExplorerDeleteCollectResult> {
  const selections = input.selectedRelativePaths;

  if (!Array.isArray(selections) || selections.length === 0) {
    return {
      ok: false,
      rejections: [{ selectedPath: "", reason: "empty-selection" }]
    };
  }

  const rejections: FileExplorerDeleteRejection[] = [];
  const targetsByPath = new Map<string, FileExplorerDeleteTarget>();

  // De-dupe / drop selections nested inside another selection: `A` already
  // carries `A/B.md`, so re-walking `A/B.md` (or listing it twice) is wasted
  // and its target would just be overwritten anyway.
  const normalizedSelections = selections.map((raw) => ({
    raw,
    normalized: normalizeFileExplorerDeleteSelection(raw)
  }));
  const validRelativePaths = normalizedSelections
    .filter(
      (s): s is { raw: unknown; normalized: { ok: true; relativePath: string } } =>
        s.normalized.ok
    )
    .map((s) => s.normalized.relativePath);
  const isNestedInAnotherSelection = (relativePath: string): boolean =>
    validRelativePaths.some(
      (other) =>
        other !== relativePath && relativePath.startsWith(`${other}/`)
    );

  for (const { raw, normalized } of normalizedSelections) {
    if (!normalized.ok) {
      rejections.push({
        selectedPath: typeof raw === "string" ? raw : String(raw),
        reason: normalized.reason
      });
      continue;
    }

    const relativePath = normalized.relativePath;

    if (isNestedInAnotherSelection(relativePath)) {
      continue;
    }

    const absolutePath = path.resolve(input.projectRootPath, relativePath);

    if (isOutsideProjectRoot(input.projectRootPath, absolutePath)) {
      rejections.push({ selectedPath: relativePath, reason: "outside-project" });
      continue;
    }

    // Reject a path that traverses a symlinked directory before reading it.
    const ancestorScan = await scanFileExplorerDeleteAncestorPath(
      input.projectRootPath,
      relativePath,
      deps.lstat
    );

    if (!ancestorScan.ok) {
      rejections.push({
        selectedPath: relativePath,
        reason: "symlinked-path",
        offendingPath: ancestorScan.offendingPath
      });
      continue;
    }

    let stats: StatLike;

    try {
      stats = await deps.lstat(absolutePath);
    } catch (error) {
      rejections.push({
        selectedPath: relativePath,
        reason: isMissingEntryError(error) ? "not-found" : "enumeration-failed"
      });
      continue;
    }

    if (stats.isSymbolicLink()) {
      rejections.push({ selectedPath: relativePath, reason: "symlink" });
      continue;
    }

    if (stats.isFile()) {
      const preview = await deps.readPreview(absolutePath, stats.size);

      targetsByPath.set(
        relativePath,
        fileTargetFrom(relativePath, stats, preview)
      );
      continue;
    }

    if (!stats.isDirectory()) {
      rejections.push({
        selectedPath: relativePath,
        reason: "unsupported-node"
      });
      continue;
    }

    const walk = await walkSubtree(input.projectRootPath, relativePath, deps);

    if (!walk.ok) {
      rejections.push({
        selectedPath: relativePath,
        reason: walk.reason,
        ...(walk.offendingPath ? { offendingPath: walk.offendingPath } : {})
      });
      continue;
    }

    targetsByPath.set(relativePath, folderTargetFrom(relativePath, stats));

    for (const target of walk.targets) {
      targetsByPath.set(target.relativePath, target);
    }
  }

  if (rejections.length > 0) {
    return { ok: false, rejections };
  }

  const targets = [...targetsByPath.values()].sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath)
  );

  return {
    ok: true,
    targets,
    fileCount: targets.filter((t) => t.kind === "file").length,
    folderCount: targets.filter((t) => t.kind === "folder").length
  };
}

/**
 * Default {@link FileExplorerDeleteCollectDeps} bound to `node:fs`. The
 * preview reader opens the file once, reads a head window and (for a larger
 * file) a separate tail window, rounds each partial window to a whole UTF-8
 * character boundary, and decodes each as strict UTF-8 — returning
 * `unavailable` on any read / decode failure or a NUL byte. It never reads
 * the whole file.
 */
export const defaultFileExplorerDeleteCollectDeps: FileExplorerDeleteCollectDeps =
  {
    lstat: (targetPath) => fsPromises.lstat(targetPath),
    readdir: (directoryPath) =>
      fsPromises.readdir(directoryPath, { withFileTypes: true }),
    readPreview: async (filePath, sizeBytes) => {
      let handle: Awaited<ReturnType<typeof fsPromises.open>> | null = null;

      try {
        handle = await fsPromises.open(filePath, "r");

        // The whole file fits in one window: both ends are real boundaries.
        const wholeFile = sizeBytes <= PREVIEW_READ_BYTES;

        const headLength = Math.min(PREVIEW_READ_BYTES, Math.max(sizeBytes, 0));
        const headBuffer = Buffer.alloc(headLength);
        if (headLength > 0) {
          await handle.read(headBuffer, 0, headLength, 0);
        }

        let tailBuffer: Buffer;
        if (wholeFile) {
          tailBuffer = headBuffer;
        } else {
          tailBuffer = Buffer.alloc(PREVIEW_READ_BYTES);
          await handle.read(
            tailBuffer,
            0,
            PREVIEW_READ_BYTES,
            sizeBytes - PREVIEW_READ_BYTES
          );
        }

        // A partial head window may be cut mid-character at its END; a
        // partial tail window at its START. Round to a whole-character
        // boundary so a mid-character cut is not misread as corruption.
        const headForDecode = wholeFile
          ? headBuffer
          : dropTruncatedTrailingUtf8(headBuffer);

        const decoder = new TextDecoder("utf-8", { fatal: true });
        const head = decoder.decode(headForDecode);
        const tail = wholeFile
          ? head
          : new TextDecoder("utf-8", { fatal: true }).decode(
              dropOrphanLeadingUtf8Continuation(tailBuffer)
            );

        if (hasNulByte(head) || hasNulByte(tail)) {
          return { unavailable: true };
        }

        return { unavailable: false, head, tail };
      } catch {
        return { unavailable: true };
      } finally {
        await handle?.close().catch(() => undefined);
      }
    }
  };
