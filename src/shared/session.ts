/**
 * #272: the versioned, plain-data schema for the application Session
 * restore set, plus pure parsers/validators for it.
 *
 *     Current application state
 *          ↓ capture / serialize        (renderer builds RendererSessionSnapshot)
 *     Session Store                      (<userData>/sessions/)
 *          ↓ durable persistence         (main enriches → SessionRecord, atomic write)
 *     manifest.json + data/<sessionId>.json
 *
 * This module NEVER touches disk, Electron, CodeMirror, or React. It only
 * describes the shape of what is persisted and how to read untrusted
 * persisted bytes back safely.
 *
 * What is deliberately NOT in this schema (ADR-0009 Recovery owns these):
 *   - Markdown document body / dirty working-copy body
 *   - untitled editor body
 *   - full Glossary draft
 *   - Recovery payload
 *   - a copy of Settings
 *
 * #272 implements the "write it out" side only. Actual cold-start restore /
 * launch routing / UI reconstruction is a downstream Issue.
 */

import { isUuidv7 } from "./uuidv7";

export const SESSION_SCHEMA_VERSION = 1;
export const SESSION_MANIFEST_SCHEMA_VERSION = 1;

/** Longest string we will accept for any identity / locator field. */
const MAX_IDENTITY_LENGTH = 8192;

/**
 * A Session identity that Pergamum minted (sessionId, manifest membership).
 * MUST be a lowercase UUIDv7 — it is also the sole variable component of
 * the `data/<sessionId>.json` path, so anything else is rejected here
 * before it can ever reach the filesystem.
 */
export function isSessionId(value: unknown): value is string {
  return isUuidv7(value);
}

// ---------------------------------------------------------------------------
// Window state
// ---------------------------------------------------------------------------

/**
 * Window mode we persist and (downstream) restore. `minimized` is
 * deliberately absent: a session that ended minimized must not reopen
 * minimized.
 */
export type WindowSessionMode = "normal" | "maximized" | "fullscreen";

export interface WindowSessionBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface WindowSessionState {
  /**
   * The bounds the window would have in its normal (non-maximized,
   * non-fullscreen) state — kept even while maximized/fullscreen so a
   * later restore can place the "restore down" size correctly.
   */
  readonly normalBounds: WindowSessionBounds;
  readonly mode: WindowSessionMode;
}

// ---------------------------------------------------------------------------
// Editor View State (structurally mirrors #273 src/renderer/editorViewState.ts)
// ---------------------------------------------------------------------------

export interface SessionEditorContentDigest {
  readonly algorithm: "sha256";
  readonly digest: string;
}

export interface SessionEditorSelectionState {
  readonly anchor: number;
  readonly head: number;
}

export interface SessionEditorScrollState {
  readonly top: number;
  readonly left: number;
}

/**
 * The persisted form of #273's `EditorViewState`. Kept as its own type in
 * `shared/` (rather than importing the renderer module, which pulls in
 * CodeMirror) so main-side persistence can validate it. `EditorViewState`
 * is structurally assignable to this — see session.typecheck.ts.
 */
export interface SessionEditorViewState {
  readonly contentDigest: SessionEditorContentDigest;
  readonly selection: SessionEditorSelectionState;
  readonly scroll: SessionEditorScrollState | null;
}

// ---------------------------------------------------------------------------
// Editors
// ---------------------------------------------------------------------------

export type SessionEditorKind =
  | "projectMarkdown"
  | "standaloneMarkdown"
  | "untitled"
  | "glossaryEntry";

interface SessionEditorFields {
  /** 0-based tab position. Also kept explicit so a partially-valid list
   *  is still orderable. */
  readonly order: number;
}

export interface SessionProjectMarkdownEditor extends SessionEditorFields {
  readonly kind: "projectMarkdown";
  /** Reopen locator AND resource identity within the project root. */
  readonly relativePath: string;
  readonly viewState: SessionEditorViewState | null;
}

export interface SessionStandaloneMarkdownEditor extends SessionEditorFields {
  readonly kind: "standaloneMarkdown";
  /** Absolute path — reopen locator AND resource identity. */
  readonly filePath: string;
  readonly viewState: SessionEditorViewState | null;
}

export interface SessionUntitledEditor extends SessionEditorFields {
  readonly kind: "untitled";
  /** Stable-within-the-session identity. The body is Recovery's job. */
  readonly untitledId: string;
  readonly viewState: SessionEditorViewState | null;
}

export interface SessionGlossaryEntryEditor extends SessionEditorFields {
  readonly kind: "glossaryEntry";
  /** GlossaryEntryId. */
  readonly entryId: string;
  /** Glossary editors have no in-scope CodeMirror view state (#272/#273). */
  readonly viewState: null;
}

export type SessionEditor =
  | SessionProjectMarkdownEditor
  | SessionStandaloneMarkdownEditor
  | SessionUntitledEditor
  | SessionGlossaryEntryEditor;

/**
 * Just enough to name which open editor was active — matched by identity
 * downstream, so a missing active editor can be detected and the
 * "filename-ascending file editor" fallback applied without guessing.
 */
export type SessionEditorIdentity =
  | { readonly kind: "projectMarkdown"; readonly relativePath: string }
  | { readonly kind: "standaloneMarkdown"; readonly filePath: string }
  | { readonly kind: "untitled"; readonly untitledId: string }
  | { readonly kind: "glossaryEntry"; readonly entryId: string };

// ---------------------------------------------------------------------------
// Project context
// ---------------------------------------------------------------------------

export interface SessionProjectContext {
  /** `metadata.project_id` — the identity of the Project. Never derived
   *  from name / path / timestamp. */
  readonly projectId: string;
  /** Where to reopen the Project from. NOT an identity — may go stale if
   *  `.pergamum` moves. */
  readonly projectFilePath: string;
  /** Project root — a locator hint for downstream restore. */
  readonly rootPath: string;
}

// ---------------------------------------------------------------------------
// Session record  (data/<sessionId>.json)
// ---------------------------------------------------------------------------

export interface SessionRecord {
  readonly schemaVersion: typeof SESSION_SCHEMA_VERSION;
  readonly sessionId: string;
  /** Owning / last-writing Pergamum process-run identity. */
  readonly instanceRunId: string;
  /** ISO timestamp — diagnostics / last-writer ordering only. */
  readonly updatedAt: string;
  /**
   * Independent of `editors`: a Project can be open with zero project-owned
   * tabs, and standalone/untitled tabs can exist with no Project. `null`
   * means "no Project was open".
   */
  readonly projectContext: SessionProjectContext | null;
  readonly window: WindowSessionState | null;
  /** Ordered by `order`. May be empty (zero-tab is a legal session). */
  readonly editors: readonly SessionEditor[];
  /** `null` when `editors` is empty, or when the active editor is unknown. */
  readonly activeEditor: SessionEditorIdentity | null;
}

// ---------------------------------------------------------------------------
// Manifest  (manifest.json) — thin restore-set membership only
// ---------------------------------------------------------------------------

export interface SessionManifest {
  readonly schemaVersion: typeof SESSION_MANIFEST_SCHEMA_VERSION;
  /** sessionIds currently in the future restore set. A session file on
   *  disk that is not listed here is an orphan and NOT a restore target. */
  readonly sessions: readonly string[];
  readonly updatedAt: string;
}

// ---------------------------------------------------------------------------
// Renderer → main snapshot payload
// ---------------------------------------------------------------------------

/**
 * What the renderer knows and sends over IPC. Main enriches this into a
 * full `SessionRecord` by adding `instanceRunId`, `projectContext.projectId`,
 * `window`, `schemaVersion` and `updatedAt` (see sessionRecordFromSnapshot).
 */
export interface RendererSessionSnapshot {
  readonly sessionId: string;
  readonly projectContext: {
    readonly projectFilePath: string;
    readonly rootPath: string;
  } | null;
  readonly editors: readonly SessionEditor[];
  readonly activeEditor: SessionEditorIdentity | null;
}

export interface SessionRecordEnrichment {
  readonly instanceRunId: string;
  readonly projectId: string | null;
  readonly window: WindowSessionState | null;
  readonly now: Date;
}

// ---------------------------------------------------------------------------
// Shared validation primitives
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdentityString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_IDENTITY_LENGTH
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFiniteInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value);
}

// ---------------------------------------------------------------------------
// Window state validation
// ---------------------------------------------------------------------------

const WINDOW_SESSION_MODES: readonly WindowSessionMode[] = [
  "normal",
  "maximized",
  "fullscreen"
];

export function parseWindowSessionState(
  value: unknown
): WindowSessionState | null {
  if (!isRecord(value)) {
    return null;
  }

  const { normalBounds, mode } = value;

  if (
    !isRecord(normalBounds) ||
    !isFiniteNumber(normalBounds.x) ||
    !isFiniteNumber(normalBounds.y) ||
    !isFiniteNumber(normalBounds.width) ||
    !isFiniteNumber(normalBounds.height) ||
    normalBounds.width <= 0 ||
    normalBounds.height <= 0
  ) {
    return null;
  }

  if (
    typeof mode !== "string" ||
    !WINDOW_SESSION_MODES.includes(mode as WindowSessionMode)
  ) {
    return null;
  }

  return {
    normalBounds: {
      x: normalBounds.x,
      y: normalBounds.y,
      width: normalBounds.width,
      height: normalBounds.height
    },
    mode: mode as WindowSessionMode
  };
}

// ---------------------------------------------------------------------------
// Editor view state validation
// ---------------------------------------------------------------------------

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

export function parseSessionEditorViewState(
  value: unknown
): SessionEditorViewState | null {
  if (!isRecord(value)) {
    return null;
  }

  const { contentDigest, selection, scroll } = value;

  if (
    !isRecord(contentDigest) ||
    contentDigest.algorithm !== "sha256" ||
    typeof contentDigest.digest !== "string" ||
    !SHA256_HEX_PATTERN.test(contentDigest.digest)
  ) {
    return null;
  }

  if (
    !isRecord(selection) ||
    !isFiniteNumber(selection.anchor) ||
    !isFiniteNumber(selection.head)
  ) {
    return null;
  }

  let parsedScroll: SessionEditorScrollState | null = null;

  if (scroll !== null && scroll !== undefined) {
    if (
      !isRecord(scroll) ||
      !isFiniteNumber(scroll.top) ||
      !isFiniteNumber(scroll.left)
    ) {
      // A malformed scroll must not invalidate the whole view state.
      parsedScroll = null;
    } else {
      parsedScroll = { top: scroll.top, left: scroll.left };
    }
  }

  return {
    contentDigest: { algorithm: "sha256", digest: contentDigest.digest },
    selection: { anchor: selection.anchor, head: selection.head },
    scroll: parsedScroll
  };
}

// ---------------------------------------------------------------------------
// Editor validation
// ---------------------------------------------------------------------------

function parseEditorOrder(value: unknown): number | null {
  if (!isFiniteInteger(value) || value < 0) {
    return null;
  }

  return value;
}

/** Returns null for an editor entry we cannot make sense of — the caller
 *  drops just that entry, never the whole session. */
export function parseSessionEditor(value: unknown): SessionEditor | null {
  if (!isRecord(value)) {
    return null;
  }

  const order = parseEditorOrder(value.order);

  if (order === null) {
    return null;
  }

  switch (value.kind) {
    case "projectMarkdown":
      return isIdentityString(value.relativePath)
        ? {
            kind: "projectMarkdown",
            order,
            relativePath: value.relativePath,
            viewState: parseSessionEditorViewState(value.viewState)
          }
        : null;
    case "standaloneMarkdown":
      return isIdentityString(value.filePath)
        ? {
            kind: "standaloneMarkdown",
            order,
            filePath: value.filePath,
            viewState: parseSessionEditorViewState(value.viewState)
          }
        : null;
    case "untitled":
      return isIdentityString(value.untitledId)
        ? {
            kind: "untitled",
            order,
            untitledId: value.untitledId,
            viewState: parseSessionEditorViewState(value.viewState)
          }
        : null;
    case "glossaryEntry":
      return isIdentityString(value.entryId)
        ? {
            kind: "glossaryEntry",
            order,
            entryId: value.entryId,
            viewState: null
          }
        : null;
    default:
      return null;
  }
}

export function sessionEditorIdentity(
  editor: SessionEditor
): SessionEditorIdentity {
  switch (editor.kind) {
    case "projectMarkdown":
      return { kind: "projectMarkdown", relativePath: editor.relativePath };
    case "standaloneMarkdown":
      return { kind: "standaloneMarkdown", filePath: editor.filePath };
    case "untitled":
      return { kind: "untitled", untitledId: editor.untitledId };
    case "glossaryEntry":
      return { kind: "glossaryEntry", entryId: editor.entryId };
  }
}

export function sessionEditorIdentityKey(
  identity: SessionEditorIdentity
): string {
  switch (identity.kind) {
    case "projectMarkdown":
      return `projectMarkdown ${identity.relativePath}`;
    case "standaloneMarkdown":
      return `standaloneMarkdown ${identity.filePath}`;
    case "untitled":
      return `untitled ${identity.untitledId}`;
    case "glossaryEntry":
      return `glossaryEntry ${identity.entryId}`;
  }
}

export function sessionEditorIdentitiesEqual(
  a: SessionEditorIdentity,
  b: SessionEditorIdentity
): boolean {
  return sessionEditorIdentityKey(a) === sessionEditorIdentityKey(b);
}

export function parseSessionEditorIdentity(
  value: unknown
): SessionEditorIdentity | null {
  if (!isRecord(value)) {
    return null;
  }

  switch (value.kind) {
    case "projectMarkdown":
      return isIdentityString(value.relativePath)
        ? { kind: "projectMarkdown", relativePath: value.relativePath }
        : null;
    case "standaloneMarkdown":
      return isIdentityString(value.filePath)
        ? { kind: "standaloneMarkdown", filePath: value.filePath }
        : null;
    case "untitled":
      return isIdentityString(value.untitledId)
        ? { kind: "untitled", untitledId: value.untitledId }
        : null;
    case "glossaryEntry":
      return isIdentityString(value.entryId)
        ? { kind: "glossaryEntry", entryId: value.entryId }
        : null;
    default:
      return null;
  }
}

function normalizeSessionEditors(
  editors: readonly SessionEditor[]
): SessionEditor[] {
  // Stable sort by declared order, then renumber 0..n-1 so downstream sees
  // a clean sequence even if the persisted `order` values had gaps.
  const sorted = [...editors].sort((a, b) => a.order - b.order);

  return sorted.map((editor, index) =>
    editor.order === index ? editor : { ...editor, order: index }
  );
}

// ---------------------------------------------------------------------------
// Project context validation
// ---------------------------------------------------------------------------

export function parseSessionProjectContext(
  value: unknown
): SessionProjectContext | null {
  if (!isRecord(value)) {
    return null;
  }

  // projectId is the Project's identity (`metadata.project_id`) — a
  // UUIDv7. A non-UUIDv7 projectId (including the old fake
  // "unknown-project" sentinel) is not accepted; the projectContext is
  // dropped (fail-soft on read — the rest of the Session still loads).
  // projectFilePath / rootPath are locators (paths), not identities.
  if (
    !isUuidv7(value.projectId) ||
    !isIdentityString(value.projectFilePath) ||
    !isIdentityString(value.rootPath)
  ) {
    return null;
  }

  return {
    projectId: value.projectId,
    projectFilePath: value.projectFilePath,
    rootPath: value.rootPath
  };
}

// ---------------------------------------------------------------------------
// Session record validation
// ---------------------------------------------------------------------------

/**
 * Parse an untrusted individual Session file. Returns `null` only when the
 * record is fundamentally unusable (not an object, wrong/unknown
 * `schemaVersion`, missing `sessionId`). Sub-parts fail soft:
 *   - a malformed `window` → `window: null`
 *   - a malformed editor entry → that entry dropped, the rest kept
 *   - a malformed editor `viewState` → `viewState: null`
 *   - a malformed `activeEditor` → `activeEditor: null`
 *   - a malformed `projectContext` → `projectContext: null`
 */
export function parseSessionRecord(value: unknown): SessionRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.schemaVersion !== SESSION_SCHEMA_VERSION) {
    return null;
  }

  if (!isSessionId(value.sessionId)) {
    return null;
  }

  // instanceRunId is the owning / last-writing Pergamum run identity — a
  // UUIDv7, exactly like sessionId. A record whose instanceRunId is not a
  // valid UUIDv7 is rejected outright; we never synthesize a fake
  // "unknown-instance-run" identity.
  if (!isUuidv7(value.instanceRunId)) {
    return null;
  }

  const instanceRunId = value.instanceRunId;

  const updatedAt =
    typeof value.updatedAt === "string" && value.updatedAt.length > 0
      ? value.updatedAt
      : new Date(0).toISOString();

  const editors = normalizeSessionEditors(
    Array.isArray(value.editors)
      ? value.editors
          .map(parseSessionEditor)
          .filter((editor): editor is SessionEditor => editor !== null)
      : []
  );

  const activeEditorCandidate = parseSessionEditorIdentity(value.activeEditor);
  const activeEditor =
    activeEditorCandidate &&
    editors.some((editor) =>
      sessionEditorIdentitiesEqual(
        sessionEditorIdentity(editor),
        activeEditorCandidate
      )
    )
      ? activeEditorCandidate
      : null;

  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    sessionId: value.sessionId,
    instanceRunId,
    updatedAt,
    projectContext: parseSessionProjectContext(value.projectContext),
    window: parseWindowSessionState(value.window),
    editors,
    activeEditor
  };
}

// ---------------------------------------------------------------------------
// Manifest validation
// ---------------------------------------------------------------------------

export function emptySessionManifest(now: Date = new Date()): SessionManifest {
  return {
    schemaVersion: SESSION_MANIFEST_SCHEMA_VERSION,
    sessions: [],
    updatedAt: now.toISOString()
  };
}

/**
 * Parse an untrusted `manifest.json`. A missing / malformed / wrong-version
 * manifest is treated as an empty restore set — never an error.
 * `sessions` is filtered to plausible id strings and de-duplicated.
 */
export function parseSessionManifest(
  value: unknown,
  now: Date = new Date()
): SessionManifest {
  if (
    !isRecord(value) ||
    value.schemaVersion !== SESSION_MANIFEST_SCHEMA_VERSION ||
    !Array.isArray(value.sessions)
  ) {
    return emptySessionManifest(now);
  }

  const seen = new Set<string>();
  const sessions: string[] = [];

  for (const candidate of value.sessions) {
    // Membership entries are Session identities → must be UUIDv7. A
    // corrupt manifest carrying anything else (path fragments, absolute
    // paths, `..`) is silently filtered out here.
    if (isSessionId(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
      sessions.push(candidate);
    }
  }

  const updatedAt =
    typeof value.updatedAt === "string" && value.updatedAt.length > 0
      ? value.updatedAt
      : now.toISOString();

  return {
    schemaVersion: SESSION_MANIFEST_SCHEMA_VERSION,
    sessions,
    updatedAt
  };
}

export type SessionManifestParseFailure =
  | { readonly kind: "malformed" }
  | { readonly kind: "unsupportedSchema"; readonly schemaVersion: number };

/**
 * The STRICT counterpart of `parseSessionManifest`, for the mutation path.
 *
 * `parseSessionManifest` deliberately treats a missing / malformed /
 * unsupported-version manifest as an empty restore set — that safe fallback
 * is right for READING (restore is best-effort). But applying it to a
 * read-modify-WRITE would let an old Pergamum see a future `schemaVersion:
 * 2` manifest as "empty" and then overwrite it with a `schemaVersion: 1`
 * one, destroying a newer version's membership.
 *
 * So a mutation first parses strictly: a manifest that is present but
 * structurally malformed, unreadable, or carries an unsupported
 * `schemaVersion` is a FAILURE the caller must surface (leaving the file
 * bytes untouched), never an empty manifest to write over. Only a genuinely
 * absent manifest (first run) yields an empty one to build on.
 */
export function parseSessionManifestStrict(
  value: unknown,
  now: Date = new Date()
): SessionManifest | SessionManifestParseFailure {
  if (!isRecord(value)) {
    return { kind: "malformed" };
  }

  if (typeof value.schemaVersion !== "number") {
    return { kind: "malformed" };
  }

  if (value.schemaVersion !== SESSION_MANIFEST_SCHEMA_VERSION) {
    return {
      kind: "unsupportedSchema",
      schemaVersion: value.schemaVersion
    };
  }

  if (!Array.isArray(value.sessions)) {
    return { kind: "malformed" };
  }

  // #272 (review follow-up 6): the mutation path must NOT silently repair a
  // manifest it is about to overwrite. `parseSessionManifest` (restore-read)
  // filters non-UUIDv7 entries and de-dupes because a best-effort restore
  // should salvage what it can; doing the same here would let a
  // `sessions: [valid, "evil", valid]` manifest be "cleaned" and rewritten,
  // discarding whatever the malformed entry was standing in for and hiding
  // corruption from the operator. Any invalid membership value, any
  // duplicate, or any non-string entry ⇒ the whole manifest is malformed and
  // the caller leaves the existing bytes untouched.
  const seen = new Set<string>();

  for (const candidate of value.sessions) {
    if (!isSessionId(candidate) || seen.has(candidate)) {
      return { kind: "malformed" };
    }

    seen.add(candidate);
  }

  const updatedAt =
    typeof value.updatedAt === "string" && value.updatedAt.length > 0
      ? value.updatedAt
      : now.toISOString();

  return {
    schemaVersion: SESSION_MANIFEST_SCHEMA_VERSION,
    sessions: value.sessions as string[],
    updatedAt
  };
}

export function isSessionManifestParseFailure(
  value: SessionManifest | SessionManifestParseFailure
): value is SessionManifestParseFailure {
  return "kind" in value;
}

export function sessionManifestWith(
  manifest: SessionManifest,
  sessions: readonly string[],
  now: Date = new Date()
): SessionManifest {
  return {
    schemaVersion: SESSION_MANIFEST_SCHEMA_VERSION,
    sessions: [...sessions],
    updatedAt: now.toISOString()
  };
}

// ---------------------------------------------------------------------------
// Renderer snapshot validation + enrichment
// ---------------------------------------------------------------------------

export function parseRendererSessionSnapshot(
  value: unknown
): RendererSessionSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  if (!isSessionId(value.sessionId)) {
    return null;
  }

  let projectContext: RendererSessionSnapshot["projectContext"] = null;

  if (value.projectContext !== null && value.projectContext !== undefined) {
    if (
      !isRecord(value.projectContext) ||
      !isIdentityString(value.projectContext.projectFilePath) ||
      !isIdentityString(value.projectContext.rootPath)
    ) {
      return null;
    }

    projectContext = {
      projectFilePath: value.projectContext.projectFilePath,
      rootPath: value.projectContext.rootPath
    };
  }

  if (!Array.isArray(value.editors)) {
    return null;
  }

  const editors = value.editors
    .map(parseSessionEditor)
    .filter((editor): editor is SessionEditor => editor !== null);

  if (editors.length !== value.editors.length) {
    // The renderer must never send an editor we cannot represent.
    return null;
  }

  const normalizedEditors = normalizeSessionEditors(editors);
  const activeEditorCandidate = parseSessionEditorIdentity(value.activeEditor);
  const activeEditor =
    activeEditorCandidate &&
    normalizedEditors.some((editor) =>
      sessionEditorIdentitiesEqual(
        sessionEditorIdentity(editor),
        activeEditorCandidate
      )
    )
      ? activeEditorCandidate
      : null;

  return {
    sessionId: value.sessionId,
    projectContext,
    editors: normalizedEditors,
    activeEditor
  };
}

/**
 * Combine the renderer's snapshot with the main-process-only facts
 * (`instanceRunId`, the Project's real `projectId`, live `window` state)
 * into the durable `SessionRecord`.
 *
 * `projectId` is the Project's *identity* (`metadata.project_id`, a
 * UUIDv7), strictly separate from the `projectFilePath` *locator*. If the
 * snapshot carries a `projectContext` but `enrichment.projectId` is `null`
 * or not a valid UUIDv7 (locator does not match the live Project, no live
 * projectId, or a broken identity), this returns `null`: the caller must
 * NOT persist a Project-Context record with a fabricated identity, and must
 * NOT silently downgrade it to `projectContext: null` either.
 *
 * `enrichment.instanceRunId` must also be a valid UUIDv7 — otherwise the
 * record cannot be built.
 *
 * A snapshot with no `projectContext` always produces a record
 * (`projectContext: null`).
 */
export function sessionRecordFromSnapshot(
  snapshot: RendererSessionSnapshot,
  enrichment: SessionRecordEnrichment
): SessionRecord | null {
  if (!isUuidv7(enrichment.instanceRunId)) {
    return null;
  }

  let projectContext: SessionProjectContext | null = null;

  if (snapshot.projectContext) {
    if (!isUuidv7(enrichment.projectId)) {
      return null;
    }

    projectContext = {
      projectId: enrichment.projectId,
      projectFilePath: snapshot.projectContext.projectFilePath,
      rootPath: snapshot.projectContext.rootPath
    };
  }

  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    sessionId: snapshot.sessionId,
    instanceRunId: enrichment.instanceRunId,
    updatedAt: enrichment.now.toISOString(),
    projectContext,
    window: enrichment.window,
    editors: snapshot.editors,
    activeEditor: snapshot.activeEditor
  };
}

// ---------------------------------------------------------------------------
// Physical layout helpers (paths only — no fs here)
// ---------------------------------------------------------------------------

export const SESSIONS_DIRECTORY_NAME = "sessions";
export const SESSION_MANIFEST_FILE_NAME = "manifest.json";
export const SESSION_DATA_DIRECTORY_NAME = "data";

export class InvalidSessionIdError extends Error {
  constructor(readonly rejected: unknown) {
    super("Session id must be a lowercase UUIDv7.");
    this.name = "InvalidSessionIdError";
  }
}

/**
 * The bare file name for a Session's data file. This is the ONLY place a
 * sessionId becomes part of a filesystem path, so it is the defense-in-depth
 * boundary: a non-UUIDv7 sessionId (which is the only shape that could carry
 * `/`, `\`, `..`, a drive letter, or a leading separator) is rejected here
 * before any path is built. Callers should have validated already; this
 * throws rather than silently coercing.
 */
export function sessionDataFileName(sessionId: string): string {
  if (
    !isSessionId(sessionId) ||
    /[\\/]|\.\.|^[A-Za-z]:|^~/.test(sessionId)
  ) {
    throw new InvalidSessionIdError(sessionId);
  }

  return `${sessionId}.json`;
}
