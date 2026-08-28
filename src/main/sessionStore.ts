/**
 * #272: durable, crash-safe storage for the application Session restore
 * set, under `<userData>/sessions/`.
 *
 *   <userData>/
 *   └─ sessions/
 *      ├─ manifest.json          ← thin restore-set membership only
 *      └─ data/
 *         ├─ <sessionId-A>.json  ← one working-environment snapshot each
 *         └─ <sessionId-B>.json
 *
 * Completely separate from Settings, Recovery, the Project DB, the Project
 * directory, and `.pergamum_recovery/`. Nothing here is ever written inside
 * a Project directory.
 *
 * Guarantees:
 *   - a missing store is a legal empty restore set (first run)
 *   - one corrupt / missing individual Session file never invalidates the
 *     others, and never blocks reading the rest of the set
 *   - a Session file on disk that the manifest does not list is an orphan
 *     and is NOT a restore target (its existence is legal)
 *   - individual Session files and the manifest are each updated atomically
 *     (temp file in the same directory → fsync → rename), so an interrupted
 *     write keeps the previous good file
 *   - when adding a session to the set, the individual snapshot is made
 *     durable BEFORE the manifest references it; when removing, the manifest
 *     reference is dropped BEFORE the (best-effort) file cleanup, and a
 *     failed cleanup never affects restore-set correctness
 *
 * This module reads persisted bytes as untrusted input (see
 * shared/session.ts parsers) and never deletes or "repairs" anything
 * outside `<userData>/sessions/`.
 */

import { promises as nodeFs } from "node:fs";
import path from "node:path";
import {
  emptySessionManifest,
  isSessionId,
  isSessionManifestParseFailure,
  parseSessionManifest,
  parseSessionManifestStrict,
  parseSessionRecord,
  sessionDataFileName,
  SESSION_DATA_DIRECTORY_NAME,
  SESSION_MANIFEST_FILE_NAME,
  sessionManifestWith,
  type SessionManifest,
  type SessionRecord
} from "../shared/session";
import { toSessionStorageFailureError } from "../shared/sessionPersistenceFailure";
import {
  isAtomicWriteTempFileName,
  writeFileAtomic,
  type AtomicWriteOptions
} from "./atomicFileWrite";
import {
  createFsSessionManifestLock,
  type SessionManifestLock
} from "./sessionManifestLock";

/** Lock directory guarding cross-process `manifest.json` mutation. */
export const SESSION_MANIFEST_LOCK_DIRECTORY_NAME = "manifest.lock";

/**
 * Raised when a manifest MUTATION cannot proceed because the existing
 * `manifest.json` is present but not something we may safely overwrite
 * (malformed bytes, an unsupported future `schemaVersion`, or unreadable).
 * The manifest file is left byte-for-byte untouched.
 */
export class SessionManifestNotMutableError extends Error {
  constructor(
    readonly reason:
      | "malformed"
      | "unsupportedSchema"
      | "unreadable",
    readonly detail?: string
  ) {
    super(
      `Session manifest cannot be mutated safely (${reason}${
        detail ? `: ${detail}` : ""
      }).`
    );
    this.name = "SessionManifestNotMutableError";
  }
}

export type SessionSkipReason =
  | "fileMissing"
  | "fileUnreadable"
  | "malformedJson"
  | "invalidRecord"
  | "sessionIdMismatch";

export interface SessionSkip {
  readonly sessionId: string;
  readonly reason: SessionSkipReason;
}

export interface SessionRestoreSetReadResult {
  readonly manifest: SessionManifest;
  /** Valid, manifest-listed Session records, in manifest order. */
  readonly sessions: readonly SessionRecord[];
  /** Manifest entries that could not be loaded — diagnostics only. */
  readonly skipped: readonly SessionSkip[];
}

export interface SessionStore {
  readRestoreSet(): Promise<SessionRestoreSetReadResult>;
  /** Make `record` durable, then ensure the manifest lists it. */
  persistSession(record: SessionRecord): Promise<void>;
  /** Drop `sessionId` from the manifest, then best-effort delete its file. */
  removeSessionFromRestoreSet(sessionId: string): Promise<void>;
}

export interface SessionStoreFileSystem {
  readFile(filePath: string): Promise<string>;
  writeFileAtomic(filePath: string, data: string): Promise<void>;
  remove(filePath: string): Promise<void>;
}

export interface CreateSessionStoreOptions {
  /** Absolute path to `<userData>/sessions`. */
  readonly baseDirectory: string;
  readonly fileSystem?: SessionStoreFileSystem;
  readonly now?: () => Date;
  /**
   * Cross-process serialization for `manifest.json` mutation. Defaults to a
   * filesystem lock-directory under `baseDirectory` so independent Pergamum
   * processes sharing one `userData` cannot lose a membership update.
   */
  readonly manifestLock?: SessionManifestLock;
}

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code: unknown }).code);
  }

  return undefined;
}

function createDefaultFileSystem(
  atomicWriteOptions?: AtomicWriteOptions
): SessionStoreFileSystem {
  return {
    readFile: (filePath) => nodeFs.readFile(filePath, "utf8"),
    writeFileAtomic: (filePath, data) =>
      writeFileAtomic(filePath, data, atomicWriteOptions),
    remove: (filePath) => nodeFs.rm(filePath, { force: true })
  };
}

/**
 * Exposed for tests that need to inject a custom atomic-write filesystem
 * (fault injection) while keeping the real read/remove behavior.
 */
export function createSessionStoreFileSystemWithAtomicWrite(
  atomicWriteOptions: AtomicWriteOptions
): SessionStoreFileSystem {
  return createDefaultFileSystem(atomicWriteOptions);
}

export function createSessionStore(
  options: CreateSessionStoreOptions
): SessionStore {
  const fileSystem = options.fileSystem ?? createDefaultFileSystem();
  const now = options.now ?? (() => new Date());
  const manifestLock =
    options.manifestLock ??
    createFsSessionManifestLock({
      lockFilePath: path.join(
        options.baseDirectory,
        SESSION_MANIFEST_LOCK_DIRECTORY_NAME
      )
    });
  const manifestPath = path.join(
    options.baseDirectory,
    SESSION_MANIFEST_FILE_NAME
  );
  const dataDirectory = path.join(
    options.baseDirectory,
    SESSION_DATA_DIRECTORY_NAME
  );

  function dataFilePath(sessionId: string): string {
    return path.join(dataDirectory, sessionDataFileName(sessionId));
  }

  // In-process ordering so this Store instance never contends with its own
  // filesystem lock. The `manifestLock` (below) is what serializes across
  // processes / other Store instances.
  let operationQueue: Promise<unknown> = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = operationQueue.then(operation, operation);
    operationQueue = result.then(
      () => undefined,
      () => undefined
    );

    return result;
  }

  /**
   * Read the manifest, apply `mutate`, and atomically write it back — the
   * whole cycle under both the in-process queue and the cross-process
   * manifest lock. If the lock cannot be acquired, the manifest is left
   * completely untouched and the error propagates to the caller.
   */
  function mutateManifest(
    mutate: (manifest: SessionManifest) => SessionManifest | null
  ): Promise<void> {
    return enqueue(() =>
      manifestLock.run(async () => {
        // STRICT read: a present-but-unsafe manifest throws here, BEFORE any
        // write, so the existing bytes (possibly a newer schema version) are
        // never clobbered.
        const manifest = await readManifestForMutation();
        const next = mutate(manifest);

        if (next === null) {
          return;
        }

        await writeManifest(next);
      })
    );
  }

  /**
   * Restore / read path: a missing / malformed / unsupported / unreadable
   * manifest all collapse to an empty restore set. Best-effort by design —
   * startup must not be blocked by a bad manifest.
   */
  async function readManifestForRestore(): Promise<SessionManifest> {
    let raw: string;

    try {
      raw = await fileSystem.readFile(manifestPath);
    } catch {
      return emptySessionManifest(now());
    }

    try {
      return parseSessionManifest(JSON.parse(raw), now());
    } catch {
      return emptySessionManifest(now());
    }
  }

  /**
   * Mutation path: only a genuinely absent manifest (ENOENT — first run)
   * yields an empty manifest to build on. A present-but-unsafe manifest
   * (unreadable, invalid JSON, structurally malformed, or an unsupported
   * future `schemaVersion`) throws `SessionManifestNotMutableError` so the
   * caller aborts and the file is left untouched.
   */
  async function readManifestForMutation(): Promise<SessionManifest> {
    let raw: string;

    try {
      raw = await fileSystem.readFile(manifestPath);
    } catch (error) {
      if (nodeErrorCode(error) === "ENOENT") {
        return emptySessionManifest(now());
      }

      throw new SessionManifestNotMutableError(
        "unreadable",
        nodeErrorCode(error)
      );
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new SessionManifestNotMutableError("malformed", "invalid JSON");
    }

    const result = parseSessionManifestStrict(parsed, now());

    if (isSessionManifestParseFailure(result)) {
      throw result.kind === "unsupportedSchema"
        ? new SessionManifestNotMutableError(
            "unsupportedSchema",
            `schemaVersion ${result.schemaVersion}`
          )
        : new SessionManifestNotMutableError("malformed");
    }

    return result;
  }

  async function writeManifest(manifest: SessionManifest): Promise<void> {
    await fileSystem.writeFileAtomic(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`
    );
  }

  async function readSessionRecord(
    sessionId: string
  ): Promise<{ record: SessionRecord } | { skip: SessionSkip }> {
    let raw: string;

    try {
      raw = await fileSystem.readFile(dataFilePath(sessionId));
    } catch (error) {
      return {
        skip: {
          sessionId,
          reason:
            nodeErrorCode(error) === "ENOENT" ? "fileMissing" : "fileUnreadable"
        }
      };
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      return { skip: { sessionId, reason: "malformedJson" } };
    }

    const record = parseSessionRecord(parsed);

    if (!record) {
      return { skip: { sessionId, reason: "invalidRecord" } };
    }

    if (record.sessionId !== sessionId) {
      return { skip: { sessionId, reason: "sessionIdMismatch" } };
    }

    return { record };
  }

  async function readRestoreSet(): Promise<SessionRestoreSetReadResult> {
    const manifest = await readManifestForRestore();
    const sessions: SessionRecord[] = [];
    const skipped: SessionSkip[] = [];

    for (const sessionId of manifest.sessions) {
      const result = await readSessionRecord(sessionId);

      if ("record" in result) {
        sessions.push(result.record);
      } else {
        skipped.push(result.skip);
      }
    }

    return { manifest, sessions, skipped };
  }

  async function persistSession(record: SessionRecord): Promise<void> {
    // Every storage-class failure on the durable path (data write, manifest
    // lock, manifest write, disk full, I/O error, unsafe manifest) is
    // reclassified so the renderer can move Session persistence to
    // SUSPENDED. Never affects Markdown / Project document saving.
    try {
      // Step 1: the individual snapshot becomes durable first.
      await fileSystem.writeFileAtomic(
        dataFilePath(record.sessionId),
        `${JSON.stringify(record, null, 2)}\n`
      );

      // Step 2: only then does the manifest reference it. Serialized against
      // other membership mutations in this and other processes.
      await mutateManifest((manifest) =>
        manifest.sessions.includes(record.sessionId)
          ? null
          : sessionManifestWith(
              manifest,
              [...manifest.sessions, record.sessionId],
              now()
            )
      );
    } catch (error) {
      throw toSessionStorageFailureError(error);
    }
  }

  async function removeSessionFromRestoreSet(
    sessionId: string
  ): Promise<void> {
    if (!isSessionId(sessionId)) {
      // Not a shape we could ever have persisted; nothing to remove.
      return;
    }

    // Step 1: drop membership first, so a crash before cleanup just leaves
    // a legal orphan file. If the manifest lock / write fails this rejects
    // BEFORE the file is touched, so the caller can decline the close.
    try {
      await mutateManifest((manifest) =>
        manifest.sessions.includes(sessionId)
          ? sessionManifestWith(
              manifest,
              manifest.sessions.filter((id) => id !== sessionId),
              now()
            )
          : null
      );
    } catch (error) {
      throw toSessionStorageFailureError(error);
    }

    // Step 2: best-effort file cleanup. A failure here is not a
    // restore-set correctness problem.
    try {
      await fileSystem.remove(dataFilePath(sessionId));
    } catch {
      // Orphan Session files are legal; the manifest is the source of truth.
    }
  }

  return {
    readRestoreSet,
    persistSession,
    removeSessionFromRestoreSet
  };
}

/**
 * Whether `fileName` (a bare name inside `sessions/data/`) is a finished
 * Session file rather than an in-progress atomic-write temp. Exposed for a
 * future orphan-sweep; the reader already ignores anything not listed in
 * the manifest.
 */
export function isFinishedSessionDataFileName(fileName: string): boolean {
  return fileName.endsWith(".json") && !isAtomicWriteTempFileName(fileName);
}
