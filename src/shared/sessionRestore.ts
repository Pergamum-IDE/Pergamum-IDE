/**
 * #274: pure, side-effect-free helpers for cold-start Session restore and
 * launch-target routing.
 *
 * This module NEVER touches disk, Electron, IPC, CodeMirror, or React. It
 * only decides:
 *
 *   - which single Session (at most one — Pergamum is single-window) should
 *     be restored, given the validated candidates and the current launch
 *     target
 *   - which restored editor should become active when the saved active
 *     editor could not be restored (deterministic filename fallback)
 *   - whether a Markdown launch target safely belongs to the restored
 *     Project scope (ambiguous → standalone, never guessed)
 *   - whether a manifest / Session read outcome warrants the "restore
 *     unavailable" Error dialog
 *
 * All path comparison reuses the existing platform-aware comparator in
 * `saveTargetPolicy` (separator + `..` normalization, platform case
 * behavior). No new canonicalization framework, no `fs.realpath`.
 */

import type { AppPlatform } from "./platform";
import { isPathEqualOrInsideDirectory } from "./saveTargetPolicy";
import type {
  SessionEditor,
  SessionEditorIdentity,
  SessionRecord
} from "./session";
import { sessionEditorIdentitiesEqual } from "./session";

// ---------------------------------------------------------------------------
// Launch target
// ---------------------------------------------------------------------------

export type ColdStartLaunchTarget =
  | { readonly kind: "pergamum"; readonly filePath: string }
  | { readonly kind: "markdown"; readonly filePath: string };

// ---------------------------------------------------------------------------
// Session selection
// ---------------------------------------------------------------------------

export interface SessionSelectionInput {
  /** Valid, current-schema Session core records, in manifest order. */
  readonly candidates: readonly SessionRecord[];
  readonly launchTarget: ColdStartLaunchTarget | null;
  readonly platform: AppPlatform;
}

export type SessionSelectionResult =
  | {
      readonly kind: "selected";
      readonly session: SessionRecord;
      /** True only when a `.pergamum` launch target picked this Session. */
      readonly matchedLaunchTarget: boolean;
    }
  | {
      readonly kind: "none";
      readonly reason: "noCandidates" | "noMatchingSessionForPergamumTarget";
    };

/**
 * Path equality via the existing platform-aware comparator. `A` and `B`
 * denote the same location iff each is "equal or inside" the other. No fs
 * access; no symlink resolution — an unresolved equivalence is simply "not
 * equal" here, which the callers treat as "do not match / do not route".
 */
export function samePergamumProjectLocator(
  a: string,
  b: string,
  platform: AppPlatform
): boolean {
  try {
    return (
      isPathEqualOrInsideDirectory(a, b, platform) &&
      isPathEqualOrInsideDirectory(b, a, platform)
    );
  } catch {
    return false;
  }
}

/**
 * The candidate with the greatest `updatedAt`. Iterates in manifest order
 * and only replaces on a strictly-greater timestamp, so the earliest
 * candidate in manifest order wins any tie — a deterministic tie-break.
 */
function latestByUpdatedAt(
  candidates: readonly SessionRecord[]
): SessionRecord | null {
  let best: SessionRecord | null = null;

  for (const candidate of candidates) {
    if (best === null || candidate.updatedAt > best.updatedAt) {
      best = candidate;
    }
  }

  return best;
}

/**
 * Pick at most one Session to restore.
 *
 *   - `.pergamum` launch target: restore the valid Session whose Project
 *     Context locator is the same path — otherwise restore NOTHING (the
 *     caller opens the launch-target Project normally; an unrelated Session
 *     is never restored in its place).
 *   - Markdown launch target, or no launch target: restore the latest
 *     (`updatedAt`) valid Session; the Markdown target is routed afterward.
 */
export function selectRestoreSession(
  input: SessionSelectionInput
): SessionSelectionResult {
  const { candidates, launchTarget, platform } = input;

  if (launchTarget?.kind === "pergamum") {
    const match = candidates.find(
      (candidate) =>
        candidate.projectContext !== null &&
        samePergamumProjectLocator(
          candidate.projectContext.projectFilePath,
          launchTarget.filePath,
          platform
        )
    );

    return match
      ? { kind: "selected", session: match, matchedLaunchTarget: true }
      : { kind: "none", reason: "noMatchingSessionForPergamumTarget" };
  }

  const latest = latestByUpdatedAt(candidates);

  return latest
    ? { kind: "selected", session: latest, matchedLaunchTarget: false }
    : { kind: "none", reason: "noCandidates" };
}

// ---------------------------------------------------------------------------
// Editor order + active-editor fallback
// ---------------------------------------------------------------------------

function basename(value: string): string {
  const parts = value.split(/[\\/]/);

  return parts[parts.length - 1] || value;
}

/**
 * The filename used for the deterministic active-editor fallback ordering.
 * `null` for kinds that never participate as a "file editor" fallback
 * (glossary, untitled).
 */
export function fallbackFilenameForSessionEditor(
  editor: SessionEditor
): string | null {
  switch (editor.kind) {
    case "projectMarkdown":
      return basename(editor.relativePath);
    case "standaloneMarkdown":
      return basename(editor.filePath);
    case "untitled":
    case "glossaryEntry":
      return null;
  }
}

export interface RestoredEditorLike {
  readonly identity: SessionEditorIdentity;
  /** From `fallbackFilenameForSessionEditor` — `null` for non-file kinds. */
  readonly fallbackFilename: string | null;
}

/**
 * Resolve which restored editor becomes active.
 *
 *   1. the saved active editor, if it was itself restored
 *   2. otherwise the successful FILE editor (`projectMarkdown` /
 *      `standaloneMarkdown`) whose filename sorts first (lexicographic
 *      ascending); glossary / untitled never participate in THIS step
 *   3. otherwise, if there are restored editors at all but none is a file
 *      editor (e.g. glossary-only), the first restored editor in saved
 *      `order` — an invariant-safe last resort, NOT a fake / empty editor,
 *      and Glossary is still not treated as a "file editor" above
 *   4. otherwise `null` — genuine safe no-active (zero restored editors)
 *
 * Steps 3–4 keep the renderer's `OpenDocumentsState` invariant intact:
 * `documents.length === 0  ⟺  activeDocumentId === null`. `restored` is
 * expected in saved-order (its parser already normalized `order` to
 * `0..n-1`), so `restored[0]` is a deterministic choice.
 */
export function resolveRestoredActiveEditor(args: {
  readonly restored: readonly RestoredEditorLike[];
  readonly savedActive: SessionEditorIdentity | null;
}): SessionEditorIdentity | null {
  const { restored, savedActive } = args;

  if (
    savedActive &&
    restored.some((editor) =>
      sessionEditorIdentitiesEqual(editor.identity, savedActive)
    )
  ) {
    return savedActive;
  }

  const fileEditors = restored
    .filter(
      (editor): editor is RestoredEditorLike & { fallbackFilename: string } =>
        editor.fallbackFilename !== null
    )
    .sort((a, b) =>
      a.fallbackFilename < b.fallbackFilename
        ? -1
        : a.fallbackFilename > b.fallbackFilename
          ? 1
          : 0
    );

  if (fileEditors.length > 0) {
    return fileEditors[0].identity;
  }

  return restored.length > 0 ? restored[0].identity : null;
}

// ---------------------------------------------------------------------------
// Markdown launch-target scope routing
// ---------------------------------------------------------------------------

export type MarkdownScopeDecision = "insideProject" | "standalone";

/**
 * Decide whether a Markdown launch target safely belongs to the restored
 * Project's scope. Any doubt (no Project, comparison throws) resolves to
 * `standalone` — the Issue's "ambiguous → do not guess Project" rule.
 */
export function decideMarkdownScope(args: {
  readonly markdownPath: string;
  readonly projectRootPath: string | null;
  readonly platform: AppPlatform;
}): MarkdownScopeDecision {
  const { markdownPath, projectRootPath, platform } = args;

  if (!projectRootPath) {
    return "standalone";
  }

  try {
    return isPathEqualOrInsideDirectory(markdownPath, projectRootPath, platform)
      ? "insideProject"
      : "standalone";
  } catch {
    return "standalone";
  }
}

// ---------------------------------------------------------------------------
// Failure classification (drives the "restore unavailable" Error dialog)
// ---------------------------------------------------------------------------

export type ManifestUnavailableReason =
  | "unreadable"
  | "malformed"
  | "unsupportedSchema"
  | "abnormallySlow";

export interface RestoreReadSummary {
  /** Non-null when the manifest itself could not be used. */
  readonly manifestUnavailable: ManifestUnavailableReason | null;
  /** How many sessionIds the manifest referenced (0 when unavailable). */
  readonly manifestListedSessionCount: number;
  /** How many of those validated as usable current-schema Session cores. */
  readonly validCandidateCount: number;
}

/**
 * The "Pergamumの作業情報を読み込めなかったため、復元せずに起動しました" Error
 * dialog is owed when:
 *   - the manifest could not be used at all, OR
 *   - the manifest listed at least one Session but NONE validated
 *     (i.e. "we tried to restore and could not", not "the set is empty").
 *
 * A genuinely empty manifest (0 listed) is normal — no dialog.
 */
export function shouldSurfaceRestoreUnavailable(
  summary: RestoreReadSummary
): boolean {
  if (summary.manifestUnavailable !== null) {
    return true;
  }

  return (
    summary.manifestListedSessionCount > 0 && summary.validCandidateCount === 0
  );
}
