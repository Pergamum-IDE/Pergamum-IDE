/**
 * #407: binary sibling of `atomicFileWrite.ts` for clipboard image
 * attachments.
 *
 * The existing {@link ./atomicFileWrite}.`writeFileAtomic` is UTF-8/string
 * only (`encoding: "utf8"`, `flag: "wx"`) and always renames over the
 * target, so it can neither carry image bytes nor honour Issue #407 §22's
 * "no `exists()` -> `write()`" rule.
 *
 * Strong path (hardlink-capable filesystems):
 *   1. write `bytes` to a sibling temp file (`open(..., "wx")` — never
 *      clobbers a leftover temp),
 *   2. fsync the temp file's contents (a failure here aborts BEFORE any
 *      name is claimed),
 *   3. `link()` the fully-written temp file to `targetPath` — atomic, and
 *      fails with `EEXIST` if `targetPath` already exists so the caller's
 *      collision-suffix retry (§21) never races,
 *   4. unlink the temp file, then best-effort fsync the directory.
 *
 * Fallback path (exFAT / FAT32, OneDrive / Dropbox / Google Drive sync
 * folders, some SMB/NAS — anywhere `link()` reports `EXDEV` / `ENOSYS` /
 * `ENOTSUP` / `EOPNOTSUPP` / `EPERM`): create `targetPath` directly with
 * `writeFile(..., { flag: "wx" })` — still an EXCLUSIVE create, so it also
 * fails with `EEXIST` on a pre-existing target and NEVER overwrites — then
 * fsync it. If that exclusive create/write itself fails, any partial target
 * is best-effort removed and the underlying error is rethrown for the
 * caller to classify (`permissionDenied` / `writeFailure` / ...).
 *
 * In every case: an existing `targetPath` is never overwritten, `EEXIST`
 * flows to the caller's collision retry, and no temp / partial-target file
 * is knowingly left behind.
 */

import { promises as nodeFs } from "node:fs";
import path from "node:path";

export interface BinaryAtomicWriteFileSystem {
  writeFile(
    filePath: string,
    data: Uint8Array,
    options: { flag: "wx" }
  ): Promise<void>;
  link(existingPath: string, newPath: string): Promise<void>;
  rm(filePath: string, options: { force: true }): Promise<void>;
  open(
    filePath: string,
    flags: string
  ): Promise<BinaryAtomicWriteFileHandle>;
}

export interface BinaryAtomicWriteFileHandle {
  sync(): Promise<void>;
  close(): Promise<void>;
}

const defaultFileSystem: BinaryAtomicWriteFileSystem =
  nodeFs as unknown as BinaryAtomicWriteFileSystem;

/** Marks in-progress attachment temp files; never a finished image. */
export const BINARY_ATOMIC_WRITE_TEMP_MARKER = ".pergamum-img-tmp-";

/**
 * `link()` failure codes that mean "this filesystem cannot hardlink", not
 * "the write is disallowed". `EPERM` is intentionally included even though
 * it can also be a genuine permission failure: on such filesystems the
 * exclusive-create fallback below is tried, and only if THAT also fails
 * does the (correctly classified) permission error surface.
 */
export const HARDLINK_UNSUPPORTED_ERROR_CODES: ReadonlySet<string> = new Set([
  "EXDEV",
  "ENOSYS",
  "ENOTSUP",
  "EOPNOTSUPP",
  "EPERM"
]);

export interface BinaryAtomicWriteOptions {
  readonly fileSystem?: BinaryAtomicWriteFileSystem;
  /** Injectable so tests get deterministic temp names. */
  readonly tempSuffix?: () => string;
}

function defaultTempSuffix(): string {
  return `${process.pid.toString(36)}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function nodeErrorCode(error: unknown): string | null {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : null;
}

async function bestEffortRemove(
  fileSystem: BinaryAtomicWriteFileSystem,
  filePath: string
): Promise<void> {
  try {
    await fileSystem.rm(filePath, { force: true });
  } catch {
    // A leftover temp is harmless — its name marks it as not-a-record.
  }
}

async function fsyncPath(
  fileSystem: BinaryAtomicWriteFileSystem,
  filePath: string
): Promise<void> {
  const handle = await fileSystem.open(filePath, "r+");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function bestEffortSyncDirectory(
  fileSystem: BinaryAtomicWriteFileSystem,
  dirPath: string
): Promise<void> {
  let handle: BinaryAtomicWriteFileHandle | null = null;
  try {
    handle = await fileSystem.open(dirPath, "r");
    await handle.sync();
  } catch {
    // Directory fsync is a durability nicety, not always permitted.
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Exclusive-create fallback for filesystems that cannot hardlink. Writes
 * `bytes` straight into a freshly created `targetPath` (`flag: "wx"`), then
 * fsyncs it. `EEXIST` is rethrown untouched (collision retry); any other
 * failure best-effort removes a possible partial target and rethrows.
 */
async function exclusiveCreateWrite(
  fileSystem: BinaryAtomicWriteFileSystem,
  targetPath: string,
  bytes: Uint8Array
): Promise<void> {
  try {
    await fileSystem.writeFile(targetPath, bytes, { flag: "wx" });
    await fsyncPath(fileSystem, targetPath);
  } catch (error) {
    if (nodeErrorCode(error) !== "EEXIST") {
      // A partial target may exist from a half-completed write.
      await bestEffortRemove(fileSystem, targetPath);
    }
    throw error;
  }
}

/**
 * Atomically create `targetPath` containing exactly `bytes`. Rethrows the
 * underlying error on failure (notably `EEXIST` when `targetPath` already
 * exists) and leaves no partial file with the target's name.
 *
 * The containing directory is assumed to exist — the caller is responsible
 * for lazy `mkdir` (Issue #407 §19). `bytes` is written verbatim; nothing
 * re-encodes the image (§13).
 */
export async function writeNewBinaryFileAtomic(
  targetPath: string,
  bytes: Uint8Array,
  options: BinaryAtomicWriteOptions = {}
): Promise<void> {
  const fileSystem = options.fileSystem ?? defaultFileSystem;
  const tempSuffix = options.tempSuffix ?? defaultTempSuffix;
  const directory = path.dirname(targetPath);
  const baseName = path.basename(targetPath);
  const tempPath = path.join(
    directory,
    `${BINARY_ATOMIC_WRITE_TEMP_MARKER}${tempSuffix()}-${baseName}`
  );

  // 1-2. Fully write + fsync the temp file.
  try {
    await fileSystem.writeFile(tempPath, bytes, { flag: "wx" });
    await fsyncPath(fileSystem, tempPath);
  } catch (error) {
    await bestEffortRemove(fileSystem, tempPath);
    throw error;
  }

  // 3. Try the strong (hardlink) placement.
  try {
    await fileSystem.link(tempPath, targetPath);
  } catch (linkError) {
    const code = nodeErrorCode(linkError);

    if (code === "EEXIST") {
      // Target already exists — the caller must retry with the next name.
      await bestEffortRemove(fileSystem, tempPath);
      throw linkError;
    }

    if (!HARDLINK_UNSUPPORTED_ERROR_CODES.has(code ?? "")) {
      await bestEffortRemove(fileSystem, tempPath);
      throw linkError;
    }

    // Fallback: exclusive direct create of the already-validated bytes.
    try {
      await exclusiveCreateWrite(fileSystem, targetPath, bytes);
    } catch (fallbackError) {
      await bestEffortRemove(fileSystem, tempPath);
      throw fallbackError;
    }

    await bestEffortRemove(fileSystem, tempPath);
    await bestEffortSyncDirectory(fileSystem, directory);
    return;
  }

  // 4. Strong path succeeded.
  await bestEffortRemove(fileSystem, tempPath);
  await bestEffortSyncDirectory(fileSystem, directory);
}
