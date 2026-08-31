/**
 * #274: the cold-start Session restore + launch-target routing sequence.
 *
 * This is a one-shot startup routine, not a resident coordinator: a single
 * injectable `runColdStartRestore(deps)` plus the pure helpers in
 * `shared/sessionRestore.ts`. It:
 *
 *   1. fetches the cold-start payload (bounded restore-set read + launch
 *      target) from main
 *   2. selects AT MOST ONE Session to restore (single-window)
 *   3. reopens its Project through the normal open lifecycle (never a
 *      Session-Restore shortcut), verifying the saved identity
 *   4. reopens its editors (`projectMarkdown` / `standaloneMarkdown` /
 *      `glossaryEntry`; `untitled` is skipped in #274), preserving relative
 *      order, skipping missing resources locally
 *   5. resolves the active editor (saved → filename fallback → no-active)
 *   6. hands the assembled working environment + pending #273 View States
 *      to the host to apply
 *   7. adopts the restored `sessionId` (new `instanceRunId`) and releases
 *      the held Session persistence
 *   8. integrates the launch target into the restored environment
 *
 * Failure is localized (Issue #274 "Partial-success hierarchy"): a manifest
 * failure, an invalid Session, a Project restore failure, a missing editor
 * resource, and a View State failure never cascade into one another.
 */

import type {
  ColdStartRestorePayload,
  MarkdownFile,
  OpenProjectByFilePathResult,
  PergamumProject,
  ProjectOpenResult
} from "../../shared/api";
import type { GlossaryEntry } from "../../shared/glossary";
import type { AppPlatform } from "../../shared/platform";
import type {
  SessionEditor,
  SessionEditorIdentity,
  SessionRecord
} from "../../shared/session";
import {
  sessionEditorIdentitiesEqual,
  sessionEditorIdentity
} from "../../shared/session";
import {
  fallbackFilenameForSessionEditor,
  resolveRestoredActiveEditor,
  selectRestoreSession,
  shouldSurfaceRestoreUnavailable,
  type ColdStartLaunchTarget,
  type RestoredEditorLike,
  type StartupMarkdownRoute
} from "../../shared/sessionRestore";

/** #347: the `rejected` shape of a startup Markdown route. */
export type StartupMarkdownRejectedRoute = Extract<
  StartupMarkdownRoute,
  { kind: "rejected" }
>;
import {
  createFileEditorIdForPath,
  createGlossaryEntryEditorId,
  createProjectDocumentEditorId,
  serializeEditorId,
  type ActiveProjectContext,
  type EditorId
} from "../../shared/editorId";
import {
  createGlossaryEntryCurrentEditor,
  createMarkdownCurrentEditor,
  type CurrentEditor
} from "../currentEditor";
import {
  createFileDocument,
  createProjectDocument
} from "../currentDocument";
import type { OpenDocument, OpenDocumentsState } from "../openDocuments";

export type RestoreUnavailableReason =
  | "unreadable"
  | "malformed"
  | "unsupportedSchema"
  | "abnormallySlow"
  | "allSessionsInvalid";

export interface RestoredEnvironment {
  readonly project: PergamumProject | null;
  readonly openDocuments: OpenDocumentsState;
  /** serializedEditorId → persisted #273 View State (opaque plain data). */
  readonly pendingViewStates: ReadonlyMap<string, unknown>;
}

export interface ColdStartRestoreDeps {
  readonly platform: AppPlatform;
  readonly getColdStartRestore: () => Promise<ColdStartRestorePayload>;

  /** Reopen a project from a saved `.pergamum` path with a saved-identity
   *  check, through the normal open lifecycle. */
  readonly openProjectByFilePath: (
    projectFilePath: string,
    expectedProjectId: string
  ) => Promise<OpenProjectByFilePathResult>;
  /** Existing renderer resolution of a `ProjectOpenResult` — applies the
   *  read-only confirmation dialog; returns `null` on cancel / no project. */
  readonly resolveProjectOpenResult: (
    result: ProjectOpenResult
  ) => Promise<PergamumProject | null>;
  readonly reloadSettingsAfterProjectOpen: () => Promise<void>;

  /** Open the `.pergamum` launch target the ordinary way (no Session
   *  restored). Reuses the existing startup-project flow. */
  readonly openLaunchTargetProjectNormally: () => Promise<PergamumProject | null>;

  readonly readProjectDocumentContent: (
    relativePath: string
  ) => Promise<string>;
  readonly readMarkdownFile: (filePath: string) => Promise<MarkdownFile>;
  readonly getGlossaryEntryById: (
    entryId: string
  ) => Promise<GlossaryEntry | null>;

  /** Apply the assembled working environment into renderer state. */
  readonly applyRestoredEnvironment: (env: RestoredEnvironment) => void;
  /** Adopt the restored Session identity BEFORE any persistence write. */
  readonly adoptSessionId: (sessionId: string) => void;
  /** Release the held Session persistence — cold start is done.
   *  `sessionWasRestored` tells the host whether a `setState`-driven
   *  re-persist is already coming (true) or it should flush now (false). */
  readonly finishColdStart: (sessionWasRestored: boolean) => void;

  /**
   * Route a Markdown launch target into the (already-applied) working
   * environment. The host defers this to a follow-up effect so it runs with
   * fresh state (restored Project / editors committed).
   *
   *   - `"external"`         — Case A: no enclosing project. The host
   *                            decides restored-project-scope vs standalone
   *                            (`decideMarkdownScope`), de-dupes, and opens.
   *   - `"enclosingProject"` — #347: the Markdown belongs to a project that
   *                            was just opened via the launch target. The
   *                            host opens it ONLY as a Project Document, and
   *                            ONLY if that project is actually open (writable
   *                            or read-only). If the project did not open
   *                            (user cancelled / fatal failure) it opens
   *                            nothing. It MUST NEVER fall back to a
   *                            standalone writable document (LOCK-STARTUP-1).
   */
  readonly routeMarkdownLaunchTarget: (
    filePath: string,
    scope: "external" | "enclosingProject"
  ) => void;

  /**
   * #347: a startup Markdown target that must NOT be opened as a standalone
   * writable document — the nearest project root is ambiguous (multiple
   * `.pergamum`), discovery failed for a safety-relevant reason, or the
   * input was unsupported / URL-like / a directory / missing. The host shows
   * a user-visible explanation and opens nothing.
   */
  readonly notifyStartupMarkdownRejected: (
    route: StartupMarkdownRejectedRoute
  ) => void;

  readonly notifyRestoreUnavailable: (reason: RestoreUnavailableReason) => void;
  readonly notifyProjectRestoreFailed: () => void;
  readonly notifyEditorSkipped: (resourceName: string) => void;

  readonly logDebug?: (
    message: string,
    detail?: Record<string, unknown>
  ) => void;
}

function basename(value: string): string {
  const parts = value.split(/[\\/]/);

  return parts[parts.length - 1] || value;
}

interface BuiltEditor {
  readonly openDocument: OpenDocument;
  readonly sessionIdentity: SessionEditorIdentity;
  readonly fallbackFilename: string | null;
  /** serializedEditorId, when this editor kind carries #273 View State. */
  readonly viewStateKey: string | null;
  readonly viewState: unknown | null;
}

async function buildRestoredEditor(
  editor: SessionEditor,
  context: {
    readonly project: PergamumProject | null;
    readonly activeProjectContext: ActiveProjectContext | null;
    readonly projectRestoreSucceeded: boolean;
    readonly deps: ColdStartRestoreDeps;
  }
): Promise<BuiltEditor | null> {
  const { project, activeProjectContext, projectRestoreSucceeded, deps } =
    context;

  switch (editor.kind) {
    case "untitled":
      // #274: untitled editors are NOT reconstructed. Their identity stays
      // in the Session data; the editor is left to Recovery reconciliation.
      return null;

    case "projectMarkdown": {
      if (!projectRestoreSucceeded || !project || !activeProjectContext) {
        return null;
      }

      const isKnownDocument = project.documents.some(
        (document) => document.relativePath === editor.relativePath
      );

      if (!isKnownDocument) {
        deps.notifyEditorSkipped(basename(editor.relativePath));
        return null;
      }

      let content: string;

      try {
        content = await deps.readProjectDocumentContent(editor.relativePath);
      } catch {
        deps.notifyEditorSkipped(basename(editor.relativePath));
        return null;
      }

      const id = createProjectDocumentEditorId(
        editor.relativePath,
        activeProjectContext
      );
      const currentEditor: CurrentEditor = createMarkdownCurrentEditor(
        createProjectDocument(
          { relativePath: editor.relativePath, name: basename(editor.relativePath) },
          content
        )
      );

      return {
        openDocument: { id, editor: currentEditor },
        sessionIdentity: sessionEditorIdentity(editor),
        fallbackFilename: fallbackFilenameForSessionEditor(editor),
        viewStateKey: serializeEditorId(id),
        viewState: editor.viewState
      };
    }

    case "standaloneMarkdown": {
      let file: MarkdownFile;

      try {
        file = await deps.readMarkdownFile(editor.filePath);
      } catch {
        deps.notifyEditorSkipped(basename(editor.filePath));
        return null;
      }

      // Session recorded this as standalone — honor that. Never reclassify
      // to a project document just because the path is inside a root.
      const id = createFileEditorIdForPath(editor.filePath);
      const currentEditor: CurrentEditor = createMarkdownCurrentEditor(
        createFileDocument(file)
      );

      return {
        openDocument: { id, editor: currentEditor },
        sessionIdentity: sessionEditorIdentity(editor),
        fallbackFilename: fallbackFilenameForSessionEditor(editor),
        viewStateKey: serializeEditorId(id),
        viewState: editor.viewState
      };
    }

    case "glossaryEntry": {
      if (!projectRestoreSucceeded || !project || !activeProjectContext) {
        return null;
      }

      let entry: GlossaryEntry | null;

      try {
        entry = await deps.getGlossaryEntryById(editor.entryId);
      } catch {
        entry = null;
      }

      if (!entry) {
        deps.notifyEditorSkipped(editor.entryId);
        return null;
      }

      const id = createGlossaryEntryEditorId(
        editor.entryId,
        activeProjectContext
      );

      return {
        openDocument: { id, editor: createGlossaryEntryCurrentEditor(entry) },
        sessionIdentity: sessionEditorIdentity(editor),
        fallbackFilename: null,
        viewStateKey: null,
        viewState: null
      };
    }
  }
}

interface ProjectRestoreOutcome {
  readonly project: PergamumProject | null;
  /** True only when a saved Project Context resolved to a live project of
   *  the same identity. Drives whether project-dependent editors restore. */
  readonly succeeded: boolean;
  readonly failed: boolean;
}

async function restoreProjectContext(
  record: SessionRecord,
  deps: ColdStartRestoreDeps
): Promise<ProjectRestoreOutcome> {
  const projectContext = record.projectContext;

  if (!projectContext) {
    return { project: null, succeeded: false, failed: false };
  }

  const opened = await deps.openProjectByFilePath(
    projectContext.projectFilePath,
    projectContext.projectId
  );

  if (opened.kind === "failed" || opened.kind === "identityMismatch") {
    deps.logDebug?.("cold-start: project restore failed", {
      reason: opened.kind
    });
    deps.notifyProjectRestoreFailed();
    return { project: null, succeeded: false, failed: true };
  }

  const project = await deps.resolveProjectOpenResult(opened.result);

  if (!project) {
    // User declined the read-only confirmation, or the open produced no
    // project. Not surfaced as an error; project simply not restored.
    return { project: null, succeeded: false, failed: false };
  }

  await deps.reloadSettingsAfterProjectOpen();

  return { project, succeeded: true, failed: false };
}

interface SelectedSessionRestoreOutcome {
  /**
   * True when the Session carried a Project Context that could NOT be
   * restored (the `.pergamum` is missing / unreadable, or the reopened
   * `metadata.project_id` did not match the saved identity). Callers use
   * this to keep an explicit `.pergamum` launch target from being lost
   * (BLOCKER 3): a provisional saved-locator match that fails identity
   * verification means the launched `.pergamum` is a different project than
   * the Session recorded, so it must still be opened the ordinary way.
   */
  readonly projectContextRestoreFailed: boolean;
}

async function restoreSelectedSession(
  record: SessionRecord,
  deps: ColdStartRestoreDeps
): Promise<SelectedSessionRestoreOutcome> {
  deps.adoptSessionId(record.sessionId);

  const projectOutcome = await restoreProjectContext(record, deps);
  const project = projectOutcome.project;
  const activeProjectContext: ActiveProjectContext | null = project
    ? { rootPath: project.rootPath }
    : null;

  const built: BuiltEditor[] = [];

  for (const editor of record.editors) {
    const restored = await buildRestoredEditor(editor, {
      project,
      activeProjectContext,
      projectRestoreSucceeded: projectOutcome.succeeded,
      deps
    });

    if (restored) {
      built.push(restored);
    }
  }

  const restoredLikes: RestoredEditorLike[] = built.map((entry) => ({
    identity: entry.sessionIdentity,
    fallbackFilename: entry.fallbackFilename
  }));

  const activeIdentity = resolveRestoredActiveEditor({
    restored: restoredLikes,
    savedActive: record.activeEditor
  });

  const activeFromIdentity = activeIdentity
    ? (built.find((entry) =>
        sessionEditorIdentitiesEqual(entry.sessionIdentity, activeIdentity)
      )?.openDocument.id ?? null)
    : null;

  // Keep the renderer's OpenDocumentsState invariant intact:
  //   documents.length === 0  ⟺  activeDocumentId === null
  // `resolveRestoredActiveEditor` already returns a member of `built`
  // whenever `built` is non-empty; this `?? built[0]` is a defensive belt so
  // a non-empty tab set can never end up with `activeDocumentId: null`.
  const activeDocumentId: EditorId | null =
    activeFromIdentity ?? (built.length > 0 ? built[0].openDocument.id : null);

  const pendingViewStates = new Map<string, unknown>();

  for (const entry of built) {
    if (entry.viewStateKey && entry.viewState) {
      pendingViewStates.set(entry.viewStateKey, entry.viewState);
    }
  }

  const openDocuments: OpenDocumentsState = {
    documents: built.map((entry) => entry.openDocument),
    activeDocumentId,
    nextUntitledId: 1
  };

  deps.applyRestoredEnvironment({ project, openDocuments, pendingViewStates });

  return {
    projectContextRestoreFailed: record.projectContext !== null && projectOutcome.failed
  };
}

export async function runColdStartRestore(
  deps: ColdStartRestoreDeps
): Promise<void> {
  let payload: ColdStartRestorePayload;

  try {
    payload = await deps.getColdStartRestore();
  } catch {
    // The payload itself could not be fetched — behave like an unavailable
    // manifest: no restore, normal startup, surface the error.
    deps.notifyRestoreUnavailable("unreadable");
    deps.finishColdStart(false);
    return;
  }

  const { read, launchTarget } = payload;
  let sessionWasRestored = false;

  try {
    if (read.kind === "manifestUnavailable") {
      deps.notifyRestoreUnavailable(read.reason);
      await openLaunchTargetOnly(launchTarget, deps);
      return;
    }

    if (read.kind === "timedOut") {
      deps.notifyRestoreUnavailable("abnormallySlow");
      await openLaunchTargetOnly(launchTarget, deps);
      return;
    }

    if (read.kind === "empty") {
      await openLaunchTargetOnly(launchTarget, deps);
      return;
    }

    // read.kind === "ok"
    if (
      shouldSurfaceRestoreUnavailable({
        manifestUnavailable: null,
        manifestListedSessionCount: read.manifestListedSessionCount,
        validCandidateCount: read.sessions.length
      })
    ) {
      deps.notifyRestoreUnavailable("allSessionsInvalid");
    }

    const selection = selectRestoreSession({
      candidates: read.sessions,
      launchTarget,
      platform: deps.platform
    });

    if (selection.kind === "none") {
      await openLaunchTargetOnly(launchTarget, deps);
      return;
    }

    const outcome = await restoreSelectedSession(selection.session, deps);
    sessionWasRestored = true;

    // Launch target integration AFTER restore. The host routes the Markdown
    // target in a follow-up effect (fresh state).
    if (launchTarget?.kind === "markdown") {
      routeColdStartMarkdownTarget(launchTarget, deps);
    } else if (launchTarget?.kind === "pergamum") {
      if (selection.matchedLaunchTarget && outcome.projectContextRestoreFailed) {
        // BLOCKER 3: the Session was selected only because its SAVED LOCATOR
        // matched the launched `.pergamum`. That match is provisional — the
        // `.pergamum` at that path is now a different project (identity
        // mismatch) or is missing / unreadable. The Session's Project
        // Context is not restored (a dialog already told the user), but the
        // `.pergamum` the user explicitly launched must NOT be lost: open it
        // the ordinary way, through the normal Project-open lifecycle. Any
        // independent editors the Session did restore stay as-is until that
        // ordinary open takes over the working environment.
        await deps.openLaunchTargetProjectNormally();
      }

      // #347: the launch target is a `.pergamum` only because a startup
      // Markdown file lives inside it. Now that the project has been through
      // its open lifecycle (Session restore or the ordinary open above, or a
      // read-only confirmation / cancel), attach that Markdown as a Project
      // Document — never standalone (LOCK-STARTUP-1/2). The host opens
      // nothing if the project did not actually open.
      if (launchTarget.openProjectMarkdownAfter) {
        deps.routeMarkdownLaunchTarget(
          launchTarget.openProjectMarkdownAfter,
          "enclosingProject"
        );
      }
    }
    // A `.pergamum` that matched and restored cleanly needs nothing
    // further — its project is already restored, no duplicate is created.
  } finally {
    deps.finishColdStart(sessionWasRestored);
  }
}

async function openLaunchTargetOnly(
  launchTarget: ColdStartLaunchTarget | null,
  deps: ColdStartRestoreDeps
): Promise<void> {
  if (!launchTarget) {
    return;
  }

  if (launchTarget.kind === "pergamum") {
    await deps.openLaunchTargetProjectNormally();

    // #347: a Markdown that lives inside this project is attached as a
    // Project Document once the project's open lifecycle has run. Never
    // standalone; opens nothing if the project did not open.
    if (launchTarget.openProjectMarkdownAfter) {
      deps.routeMarkdownLaunchTarget(
        launchTarget.openProjectMarkdownAfter,
        "enclosingProject"
      );
    }

    return;
  }

  routeColdStartMarkdownTarget(launchTarget, deps);
}

/**
 * #347: route a `kind: "markdown"` cold-start launch target.
 *
 *   - `externalFile` (or a pre-#347 payload with no `markdownRoute`) — no
 *     enclosing project; the host opens it as an External File Document.
 *   - `rejected` — ambiguous project root / discovery failure / unsupported
 *     / URL-like / directory / missing: the host shows an explanation and
 *     opens nothing. It is NEVER opened as standalone writable.
 */
function routeColdStartMarkdownTarget(
  launchTarget: Extract<ColdStartLaunchTarget, { kind: "markdown" }>,
  deps: ColdStartRestoreDeps
): void {
  const route = launchTarget.markdownRoute ?? { kind: "externalFile" };

  if (route.kind === "rejected") {
    deps.notifyStartupMarkdownRejected(route);
    return;
  }

  deps.routeMarkdownLaunchTarget(launchTarget.filePath, "external");
}
