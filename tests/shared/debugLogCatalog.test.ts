import { describe, expect, it } from "vitest";
import {
  debugLogCommandExecutionSources,
  debugLogDbEntityKinds,
  debugLogDbOperations,
  debugLogDocumentKinds,
  debugLogEditorKinds,
  debugLogEventNames,
  debugLogReasons,
  debugLogRecoveryJournalModes,
  debugLogRecoverySynchronousLevels,
  debugLogViewportChangeSources,
  type DebugLogDetails
} from "../../src/shared/debugLog";
import { contextMenuSurfaces } from "../../src/shared/editContextMenu";

describe("debug log catalog", () => {
  it("does not include removed or out-of-scope event names", () => {
    expect(debugLogEventNames).not.toContain("debug.mode.enabled");
    expect(debugLogEventNames).not.toContain("log.file.rotated");
  });

  it("does not add an initial warn event catalog", () => {
    const warnLikeEvents = debugLogEventNames.filter((eventName) =>
      eventName.includes(".warn")
    );

    expect(warnLikeEvents).toEqual([]);
  });

  it("includes count only as an allowlisted debug detail key", () => {
    type HasGenericCount = "count" extends keyof DebugLogDetails ? true : false;
    const hasGenericCount: HasGenericCount = true;

    expect(hasGenericCount).toBe(true);
  });

  it("includes the context menu and edit command debug events but not dismissed", () => {
    expect(debugLogEventNames).toEqual(
      expect.arrayContaining([
        "contextMenu.requested",
        "contextMenu.opened",
        "contextMenu.suppressed",
        "contextMenu.command.selected",
        "edit.command.requested",
        "edit.command.delegated",
        "edit.command.ignored",
        "edit.command.failed"
      ])
    );
    expect(debugLogEventNames).not.toContain("contextMenu.dismissed");
  });

  it("defines unknownEditable only as the fallback surface, not unsupported", () => {
    expect([...contextMenuSurfaces]).toEqual([
      "markdownEditor",
      "glossaryCanonicalInput",
      "glossaryDescription",
      "glossaryFormSurface",
      "unknownEditable"
    ]);
    expect([...contextMenuSurfaces]).not.toContain("unsupported");
  });

  it("includes command.ignored alongside command.invoked and command.failed", () => {
    expect(debugLogEventNames).toEqual(
      expect.arrayContaining([
        "command.invoked",
        "command.ignored",
        "command.failed"
      ])
    );
  });

  it("includes command ignored reason catalog values", () => {
    expect(debugLogReasons).toContain("disabled_command");
    expect(debugLogReasons).toContain("readOnlyProject");
    expect(debugLogReasons).toContain("app_modal_open");
  });

  it("includes command.blocked as its own event, distinct from command.ignored", () => {
    expect(debugLogEventNames).toEqual(
      expect.arrayContaining(["command.blocked"])
    );
  });

  it("defines a closed source catalog shared by command.blocked and command.invoked", () => {
    expect([...debugLogCommandExecutionSources]).toEqual([
      "activityBar",
      "applicationMenu",
      "commandPalette",
      "contextMenu",
      "documentTabBar",
      "editorSurface",
      "toolbar",
      "utilityWindow",
      "workspaceSidebar",
      "unknown"
    ]);
  });

  it("includes the DB operation debug events", () => {
    expect(debugLogEventNames).toEqual(
      expect.arrayContaining([
        "db.operation.started",
        "db.operation.succeeded",
        "db.operation.failed",
        "db.operation.skipped"
      ])
    );
  });

  it("defines the closed DB operation and entity catalogs", () => {
    expect([...debugLogDbOperations]).toEqual([
      "create",
      "read",
      "update",
      "delete",
      "upsert",
      "list",
      "count",
      "initialize",
      "transaction"
    ]);
    expect([...debugLogDbOperations]).not.toContain("migrate");
    expect([...debugLogDbOperations]).not.toContain("save");
    expect([...debugLogDbEntityKinds]).toEqual([
      "glossaryEntry",
      "glossaryForm",
      "database",
      "unknown"
    ]);
    expect([...debugLogDbEntityKinds]).not.toContain("settings");
    expect([...debugLogDbEntityKinds]).not.toContain("projectConfig");
    expect([...debugLogDbEntityKinds]).not.toContain("recentProject");
  });

  it("includes the long-document open timing events (#152), and keeps document.open.failed distinct", () => {
    expect(debugLogEventNames).toEqual(
      expect.arrayContaining([
        "document.open.started",
        "document.open.fileRead.completed",
        "document.open.editorDocument.applied",
        "document.open.previewRender.completed",
        "document.open.usable",
        "document.open.completed",
        "document.open.failed"
      ])
    );
    // #152 explicitly does not run/emit a glossary occurrence scan event on
    // the document-open path (occurrence tracking is Glossary-Editor-only).
    expect(debugLogEventNames).not.toContain("document.open.glossaryScan.completed");
  });

  it("includes documentOpenId, fileSizeBytes, documentKind, and editorKind as allowlisted detail keys (#152)", () => {
    type HasDocumentOpenId = "documentOpenId" extends keyof DebugLogDetails
      ? true
      : false;
    type HasFileSizeBytes = "fileSizeBytes" extends keyof DebugLogDetails
      ? true
      : false;
    type HasDocumentKind = "documentKind" extends keyof DebugLogDetails
      ? true
      : false;
    type HasEditorKind = "editorKind" extends keyof DebugLogDetails
      ? true
      : false;
    const hasDocumentOpenId: HasDocumentOpenId = true;
    const hasFileSizeBytes: HasFileSizeBytes = true;
    const hasDocumentKind: HasDocumentKind = true;
    const hasEditorKind: HasEditorKind = true;

    expect(hasDocumentOpenId).toBe(true);
    expect(hasFileSizeBytes).toBe(true);
    expect(hasDocumentKind).toBe(true);
    expect(hasEditorKind).toBe(true);
  });

  it("defines documentKind/editorKind as small closed catalogs, not free-form strings", () => {
    expect([...debugLogDocumentKinds]).toEqual([
      "file",
      "project",
      "untitled",
      "unknown"
    ]);
    expect([...debugLogEditorKinds]).toEqual([
      "markdown",
      "glossaryEntry",
      "unknown"
    ]);
  });

  it("includes the preview DOM commit / decoration timing events (#154), between previewRender.completed and usable", () => {
    expect(debugLogEventNames).toEqual(
      expect.arrayContaining([
        "document.open.previewRender.completed",
        "document.open.previewDom.committed",
        "document.open.previewDecoration.completed",
        "document.open.usable"
      ])
    );

    const previewRenderIndex = debugLogEventNames.indexOf(
      "document.open.previewRender.completed"
    );
    const previewDomIndex = debugLogEventNames.indexOf(
      "document.open.previewDom.committed"
    );
    const previewDecorationIndex = debugLogEventNames.indexOf(
      "document.open.previewDecoration.completed"
    );
    const usableIndex = debugLogEventNames.indexOf("document.open.usable");

    expect(previewDomIndex).toBeGreaterThan(previewRenderIndex);
    expect(previewDecorationIndex).toBeGreaterThan(previewDomIndex);
    expect(usableIndex).toBeGreaterThan(previewDecorationIndex);
  });

  it("includes previewNodeCount, visitedTextNodeCount, decoratedNodeCount, and matchCount as allowlisted detail keys (#154), each with a specific, non-generic name", () => {
    type HasPreviewNodeCount = "previewNodeCount" extends keyof DebugLogDetails
      ? true
      : false;
    type HasVisitedTextNodeCount =
      "visitedTextNodeCount" extends keyof DebugLogDetails ? true : false;
    type HasDecoratedNodeCount =
      "decoratedNodeCount" extends keyof DebugLogDetails ? true : false;
    type HasMatchCount = "matchCount" extends keyof DebugLogDetails
      ? true
      : false;
    const hasPreviewNodeCount: HasPreviewNodeCount = true;
    const hasVisitedTextNodeCount: HasVisitedTextNodeCount = true;
    const hasDecoratedNodeCount: HasDecoratedNodeCount = true;
    const hasMatchCount: HasMatchCount = true;

    expect(hasPreviewNodeCount).toBe(true);
    expect(hasVisitedTextNodeCount).toBe(true);
    expect(hasDecoratedNodeCount).toBe(true);
    expect(hasMatchCount).toBe(true);
  });

  it("includes previewRender.started and previewFrame.observed (#154 follow-up), positioned around the events they bracket", () => {
    expect(debugLogEventNames).toEqual(
      expect.arrayContaining([
        "document.open.editorDocument.applied",
        "document.open.previewRender.started",
        "document.open.previewRender.completed",
        "document.open.previewDom.committed",
        "document.open.previewDecoration.completed",
        "document.open.previewFrame.observed",
        "document.open.usable"
      ])
    );

    const appliedIndex = debugLogEventNames.indexOf(
      "document.open.editorDocument.applied"
    );
    const previewRenderStartedIndex = debugLogEventNames.indexOf(
      "document.open.previewRender.started"
    );
    const previewRenderCompletedIndex = debugLogEventNames.indexOf(
      "document.open.previewRender.completed"
    );
    const previewDecorationIndex = debugLogEventNames.indexOf(
      "document.open.previewDecoration.completed"
    );
    const previewFrameIndex = debugLogEventNames.indexOf(
      "document.open.previewFrame.observed"
    );
    const usableIndex = debugLogEventNames.indexOf("document.open.usable");

    expect(previewRenderStartedIndex).toBeGreaterThan(appliedIndex);
    expect(previewRenderCompletedIndex).toBeGreaterThan(
      previewRenderStartedIndex
    );
    expect(previewFrameIndex).toBeGreaterThan(previewDecorationIndex);
    expect(usableIndex).toBeGreaterThan(previewFrameIndex);

    // #154 follow-up deliberately does not add codemirror.ready or a
    // separate markdownEditor.effect.completed event — see App.tsx's
    // handleDocumentOpenMeasured comment for why document.open.usable's
    // own durationMs already answers that question.
    expect(debugLogEventNames).not.toContain("document.open.codemirror.ready");
    expect(debugLogEventNames).not.toContain(
      "document.open.markdownEditor.effect.completed"
    );
  });

  it("includes the safe aggregate document/window/pane metric detail keys on document.open.completed (#161)", () => {
    type HasDocumentCharCount =
      "documentCharCount" extends keyof DebugLogDetails ? true : false;
    type HasDocumentLineCount =
      "documentLineCount" extends keyof DebugLogDetails ? true : false;
    type HasDocumentMaxLineLength =
      "documentMaxLineLength" extends keyof DebugLogDetails ? true : false;
    type HasAppWindowWidth =
      "appWindowWidth" extends keyof DebugLogDetails ? true : false;
    type HasAppWindowHeight =
      "appWindowHeight" extends keyof DebugLogDetails ? true : false;
    type HasEditorPaneWidth =
      "editorPaneWidth" extends keyof DebugLogDetails ? true : false;
    type HasEditorPaneHeight =
      "editorPaneHeight" extends keyof DebugLogDetails ? true : false;
    type HasPreviewPaneWidth =
      "previewPaneWidth" extends keyof DebugLogDetails ? true : false;
    type HasPreviewPaneHeight =
      "previewPaneHeight" extends keyof DebugLogDetails ? true : false;
    const hasDocumentCharCount: HasDocumentCharCount = true;
    const hasDocumentLineCount: HasDocumentLineCount = true;
    const hasDocumentMaxLineLength: HasDocumentMaxLineLength = true;
    const hasAppWindowWidth: HasAppWindowWidth = true;
    const hasAppWindowHeight: HasAppWindowHeight = true;
    const hasEditorPaneWidth: HasEditorPaneWidth = true;
    const hasEditorPaneHeight: HasEditorPaneHeight = true;
    const hasPreviewPaneWidth: HasPreviewPaneWidth = true;
    const hasPreviewPaneHeight: HasPreviewPaneHeight = true;

    expect(hasDocumentCharCount).toBe(true);
    expect(hasDocumentLineCount).toBe(true);
    expect(hasDocumentMaxLineLength).toBe(true);
    expect(hasAppWindowWidth).toBe(true);
    expect(hasAppWindowHeight).toBe(true);
    expect(hasEditorPaneWidth).toBe(true);
    expect(hasEditorPaneHeight).toBe(true);
    expect(hasPreviewPaneWidth).toBe(true);
    expect(hasPreviewPaneHeight).toBe(true);
  });

  it("includes layout.viewport.changed as a debug-only event, distinct from document.open.* (#162)", () => {
    expect(debugLogEventNames).toContain("layout.viewport.changed");
  });

  it("defines a closed viewportChangeSource catalog, separate from the generic command-execution source catalog (#162)", () => {
    expect([...debugLogViewportChangeSources]).toEqual([
      "windowResize",
      "paneResize",
      "unknown"
    ]);
    // Deliberately distinct from debugLogCommandExecutionSources — reusing
    // one key/catalog for two unrelated concepts would let either accept
    // the other's values.
    expect([...debugLogViewportChangeSources]).not.toEqual([
      ...debugLogCommandExecutionSources
    ]);

    type HasViewportChangeSource =
      "viewportChangeSource" extends keyof DebugLogDetails ? true : false;
    const hasViewportChangeSource: HasViewportChangeSource = true;

    expect(hasViewportChangeSource).toBe(true);
  });

  it("includes the DB skipped reason catalog values", () => {
    expect(debugLogReasons).toEqual(
      expect.arrayContaining([
        "validation_failed",
        "context_stale",
        "not_found",
        "no_changes",
        "database_unavailable",
        "transaction_inactive",
        "unknown"
      ])
    );
  });

  it("includes the Recovery Store lifecycle events (Phase 6-4-2)", () => {
    expect(debugLogEventNames).toEqual(
      expect.arrayContaining([
        "recovery.store.init.started",
        "recovery.store.init.succeeded",
        "recovery.store.init.skipped",
        "recovery.store.init.failed",
        "recovery.store.schema.archived",
        "recovery.store.lock.released"
      ])
    );
  });

  it("includes the #293 stale Recovery.lock recovery events, none implying a body/path leak", () => {
    expect(debugLogEventNames).toEqual(
      expect.arrayContaining([
        "recovery.store.lock.reclamation.refused",
        "recovery.store.lock.stale.detected",
        "recovery.store.lock.stale.archived",
        "recovery.store.lock.stale.archive.failed",
        "recovery.store.lock.reacquire.succeeded",
        "recovery.store.lock.reacquire.failed"
      ])
    );
    expect(
      debugLogEventNames.filter((name) => name.includes("payload"))
    ).toEqual([]);
    expect(debugLogEventNames).not.toContain("recovery.store.lock.path");

    type HasOwnerPid = "ownerPid" extends keyof DebugLogDetails ? true : false;
    type HasOwnerAppVersion = "ownerAppVersion" extends keyof DebugLogDetails
      ? true
      : false;
    type HasOwnerCreatedAt = "ownerCreatedAt" extends keyof DebugLogDetails
      ? true
      : false;
    const hasOwnerPid: HasOwnerPid = true;
    const hasOwnerAppVersion: HasOwnerAppVersion = true;
    const hasOwnerCreatedAt: HasOwnerCreatedAt = true;
    expect(hasOwnerPid).toBe(true);
    expect(hasOwnerAppVersion).toBe(true);
    expect(hasOwnerCreatedAt).toBe(true);

    // No raw-path-shaped detail key was added.
    type HasOwnerPath = "ownerPath" extends keyof DebugLogDetails ? true : false;
    const hasOwnerPath: HasOwnerPath = false;
    expect(hasOwnerPath).toBe(false);
  });

  it("includes the Recovery document payload persistence events (Phase 6-4-3)", () => {
    expect(debugLogEventNames).toEqual(
      expect.arrayContaining([
        "recovery.document.persisted",
        "recovery.document.persist.failed",
        "recovery.document.deleted",
        "recovery.document.delete.failed"
      ])
    );
    // No event name carries or implies the body text itself.
    expect(
      debugLogEventNames.filter((name) => name.includes("payload"))
    ).toEqual([]);
    expect(debugLogEventNames).not.toContain("recovery.document.body");
  });

  it("includes the Recovery candidate dialog events (Phase 6-4-4)", () => {
    expect(debugLogEventNames).toEqual(
      expect.arrayContaining([
        "recovery.candidates.dialog.shown",
        "recovery.candidates.listed",
        "recovery.document.restored",
        "recovery.document.restore.failed",
        "recovery.document.discarded",
        "recovery.document.discard.failed",
        "recovery.report.copied"
      ])
    );
    // No event name implies a body / snippet leak.
    expect(
      debugLogEventNames.filter((name) => name.includes("snippet"))
    ).toEqual([]);
    expect(debugLogEventNames).not.toContain("recovery.report.contents");
    expect(debugLogEventNames).not.toContain("recovery.document.preview");
  });

  it("exposes instanceRunId / schemaVersion / journalMode / synchronous as allowlisted detail keys, each a specific name", () => {
    type HasInstanceRunId = "instanceRunId" extends keyof DebugLogDetails
      ? true
      : false;
    type HasSchemaVersion = "schemaVersion" extends keyof DebugLogDetails
      ? true
      : false;
    type HasJournalMode = "journalMode" extends keyof DebugLogDetails
      ? true
      : false;
    type HasSynchronous = "synchronous" extends keyof DebugLogDetails
      ? true
      : false;
    const hasInstanceRunId: HasInstanceRunId = true;
    const hasSchemaVersion: HasSchemaVersion = true;
    const hasJournalMode: HasJournalMode = true;
    const hasSynchronous: HasSynchronous = true;

    expect(hasInstanceRunId).toBe(true);
    expect(hasSchemaVersion).toBe(true);
    expect(hasJournalMode).toBe(true);
    expect(hasSynchronous).toBe(true);
  });

  it("defines closed Recovery PRAGMA catalogs, not free-form strings", () => {
    expect([...debugLogRecoveryJournalModes]).toEqual([
      "wal",
      "other",
      "unknown"
    ]);
    expect([...debugLogRecoverySynchronousLevels]).toEqual([
      "full",
      "other",
      "unknown"
    ]);
    // A raw SQLite journal mode must never survive verbatim into the log.
    expect([...debugLogRecoveryJournalModes]).not.toContain("delete");
    expect([...debugLogRecoveryJournalModes]).not.toContain("memory");
  });
});
