/**
 * #272: a small, reusable durable-write helper.
 *
 * Pergamum had no atomic-write helper before this (settingsStore /
 * projectConfig both do a plain `fs.writeFile` straight over the target).
 * The Session Store must not let a write that is interrupted by process
 * termination destroy the previous good snapshot, so writes go:
 *
 *   1. write a sibling temp file in the SAME directory (same filesystem, so
 *      the final rename is a real atomic replace, incl. on Windows via
 *      MoveFileEx REPLACE_EXISTING)
 *   2. fsync the temp file's contents
 *   3. rename temp → target  (atomic; leaves the old target untouched until
 *      this instant)
 *   4. best-effort fsync the containing directory
 *
 * If the process dies before step 3, the target is still the previous good
 * file and the partial temp file is left behind with a `.tmp` name — never
 * mistaken for a real record by the Session Store reader.
 *
 * It is intentionally generic (not Session-specific) but kept in `main/`
 * since only the main process writes to disk.
 */

import { promises as nodeFs } from "node:fs";
import path from "node:path";

export interface AtomicWriteFileSystem {
  mkdir(
    dirPath: string,
    options: { recursive: true }
  ): Promise<string | undefined>;
  writeFile(
    filePath: string,
    data: string,
    options: { encoding: "utf8"; flag: "wx" }
  ): Promise<void>;
  rename(sourcePath: string, targetPath: string): Promise<void>;
  rm(filePath: string, options: { force: true }): Promise<void>;
  open(filePath: string, flags: string): Promise<AtomicWriteFileHandle>;
}

export interface AtomicWriteFileHandle {
  sync(): Promise<void>;
  close(): Promise<void>;
}

const defaultAtomicWriteFileSystem: AtomicWriteFileSystem =
  nodeFs as unknown as AtomicWriteFileSystem;

export interface AtomicWriteOptions {
  readonly fileSystem?: AtomicWriteFileSystem;
  /** Injectable suffix source so tests get deterministic temp names. */
  readonly tempSuffix?: () => string;
}

/** Marks Pergamum's in-progress temp files. A file matching this is never a
 *  finished record. */
export const ATOMIC_WRITE_TEMP_MARKER = ".pergamum-tmp-";

export function isAtomicWriteTempFileName(fileName: string): boolean {
  return fileName.includes(ATOMIC_WRITE_TEMP_MARKER);
}

function defaultTempSuffix(): string {
  return `${process.pid.toString(36)}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

async function bestEffortRemove(
  fileSystem: AtomicWriteFileSystem,
  filePath: string
): Promise<void> {
  try {
    await fileSystem.rm(filePath, { force: true });
  } catch {
    // A leftover temp file is harmless — the reader ignores temp names.
  }
}

async function bestEffortSyncDirectory(
  fileSystem: AtomicWriteFileSystem,
  dirPath: string
): Promise<void> {
  let handle: AtomicWriteFileHandle | null = null;

  try {
    handle = await fileSystem.open(dirPath, "r");
    await handle.sync();
  } catch {
    // Directory fsync is a durability nicety; not all platforms allow it.
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
 * Atomically write `data` to `targetPath`. Creates the containing directory
 * if needed. Throws if the write, the temp-file `fsync`, or the rename
 * fails; on any such failure the previous `targetPath` contents are
 * preserved and the partial temp file is removed.
 *
 * Durability distinction (#272 review):
 *   - the TEMP FILE `fsync` is a correctness / durability requirement — its
 *     failure aborts the write BEFORE the rename, so we never swap in bytes
 *     that were not confirmed to disk
 *   - the containing DIRECTORY `fsync` is a best-effort durability
 *     enhancement (not permitted on every platform) — its failure does not
 *     fail an otherwise successful write
 */
export async function writeFileAtomic(
  targetPath: string,
  data: string,
  options: AtomicWriteOptions = {}
): Promise<void> {
  const fileSystem = options.fileSystem ?? defaultAtomicWriteFileSystem;
  const tempSuffix = options.tempSuffix ?? defaultTempSuffix;
  const directory = path.dirname(targetPath);
  const baseName = path.basename(targetPath);
  const tempPath = path.join(
    directory,
    `${baseName}${ATOMIC_WRITE_TEMP_MARKER}${tempSuffix()}`
  );

  await fileSystem.mkdir(directory, { recursive: true });

  try {
    // `wx` — never clobber a leftover temp from another writer; the random
    // suffix makes a real collision astronomically unlikely, and if it does
    // happen we fail loudly rather than corrupt someone else's write.
    await fileSystem.writeFile(tempPath, data, { encoding: "utf8", flag: "wx" });

    // Temp-file fsync: MUST succeed before we rename. A failure here throws
    // out to the catch below (temp removed, target untouched).
    const handle = await fileSystem.open(tempPath, "r+");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }

    await fileSystem.rename(tempPath, targetPath);
  } catch (error) {
    await bestEffortRemove(fileSystem, tempPath);
    throw error;
  }

  await bestEffortSyncDirectory(fileSystem, directory);
}
