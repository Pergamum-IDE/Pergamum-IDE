import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent
} from "react";
import type {
  PergamumAppInfo,
  PergamumProject,
  ProjectOpenResult,
  ProjectDocument,
  SaveMarkdownRejectedReason,
  SaveApplicationSettingsRequest,
  DirtyWorkingCopy,
  LifecycleCloseDecision,
  LifecycleWindowCloseRequest,
  SaveWorkingCopyOutcome
} from "../shared/api";
import {
  applicationMenuCommandIds,
  type ApplicationMenuCommandId,
  type EditCommandId
} from "../shared/commandIds";
import type { CommandContext } from "../shared/commandEnablement";
import type {
  DebugLogEditorIdKind,
  DebugLogSaveTargetKind
} from "../shared/debugLog";
import {
  CommandDisabledError,
  CommandRegistry,
  type CommandArgumentList,
  type CommandExecutionOptions,
  type CommandId
} from "../shared/commandRegistry";
import {
  createEditorIdForPath,
  createGlossaryEntryEditorId,
  createProjectDocumentEditorId,
  serializeEditorId,
  type ActiveProjectContext,
  type EditorId
} from "../shared/editorId";
import { decideMarkdownScope } from "../shared/sessionRestore";
import type {
  CreateGlossaryEntryInput,
  GlossaryEntry,
  GlossaryEntryId,
  GlossaryEntryKind,
  GlossaryFormMatchBoundary,
  GlossaryFormRelation,
  GlossaryWarningPolicy
} from "../shared/glossary";
import {
  t,
  type Translate,
  type TranslationKey,
  type TranslationValues
} from "../shared/i18n";
import { resolveEffectiveSettings } from "../shared/settings";
import { isPathEqualOrInsideDirectory } from "../shared/saveTargetPolicy";
import { ActivityBar } from "./ActivityBar";
import { AboutDialog } from "./dialog/AboutDialog";
import {
  applicationCommandIds,
  createApplicationCommandTitles,
  registerApplicationCommands
} from "./applicationCommands";
import { subscribeApplicationMenuCommands } from "./applicationMenuBridge";
import {
  CHARACTER_COUNT_UPDATE_DEBOUNCE_MS,
  countMarkdownDocumentCharacters
} from "./characterCount";
import {
  applyEditorFontFamily,
  applyWorkbenchFontFamily
} from "./workbenchFontFamily";
import { CommandPalette } from "./CommandPalette";
import {
  createCommandPaletteCommandTitles,
  registerCommandPaletteCommands
} from "./commandPaletteCommands";
import { buildCommandContextSnapshot } from "./commandContextSnapshot";
import {
  applyStandaloneSaveResult,
  createFileDocument,
  createProjectDocument,
  currentDocumentContent,
  displayName,
  isProjectCurrentDocument,
  markCurrentDocumentSaved,
  standaloneSavePath,
  updateCurrentDocumentContent,
  type CurrentDocument
} from "./currentDocument";
import {
  lineEndingBreakSetToArray,
  type LineEndingBreakSet
} from "./editorLineEndingField";
import { serializeLineEndings } from "./lineEndingTracking";
import {
  createGlossaryEntryCurrentEditor,
  createMarkdownCurrentEditor,
  currentEditorGlossaryEntryId,
  currentEditorProjectRelativePath,
  currentEditorTitle,
  isCurrentEditorDirty,
  markdownDocumentForEditor,
  type CurrentEditor
} from "./currentEditor";
import { DocumentTabBar } from "./DocumentTabBar";
import { ChoiceDialog } from "./dialog/ChoiceDialog";
import { ConfirmDialog } from "./dialog/ConfirmDialog";
import { navigatorClipboardAdapter } from "./dialog/clipboardAdapter";
import {
  DialogController,
  type DialogControllerPendingRequest
} from "./dialog/dialogController";
import { DeferredErrorDialogQueue } from "./dialog/deferredErrorDialogQueue";
import {
  AppDialogError,
  getDialogActionOrder,
  type AppChoiceDialogOptions,
  type AppChoiceDialogResult,
  type AppConfirmDialogOptions,
  type AppConfirmDialogResult,
  type AppDialogChoiceId
} from "./dialog/appDialogTypes";
import { runEditorCloseFlow } from "./documentTabCloseFlow";
import {
  resolveDirtyWorkingCopies,
  type DirtyWorkingCopyResolutionResult
} from "./dirtyWorkingCopyResolution";
import {
  durationSincePerformanceMark,
  logRendererDebugEvent,
  rendererDebugErrorInfo
} from "./debugLog";
import { DebugLogPanel } from "./DebugLogPanel";
import { createDocumentOpenIdFactory } from "./documentOpenId";
import {
  EditorSurface,
  type DocumentOpenAggregateMetrics,
  type ViewportSizeDetails
} from "./EditorSurface";
import type {
  MarkdownEditorParagraphIndentController,
  MarkdownEditorViewStateController
} from "./MarkdownEditor";
import type { EditorViewState } from "./editorViewState";
import { createUuidv7 } from "../shared/uuidv7";
import { buildSessionSnapshotInputs } from "./session/sessionSnapshot";
import { SessionPersistenceCoordinator } from "./session/sessionPersistenceCoordinator";
import {
  runColdStartRestore,
  type ColdStartRestoreDeps,
  type RestoreUnavailableReason
} from "./session/coldStartRestore";
import { runExplicitProjectCloseCommit } from "./explicitProjectCloseCommit";
import {
  isSessionStorageFailure,
  type SessionStorageFailureReason
} from "../shared/sessionPersistenceFailure";
import {
  createContextMenuInteractionIdFactory,
  delegatedContextSurfaceFromDocument,
  executeContextMenuEditCommand,
  handleEditContextMenuEvent,
  hasSelectionInDocument,
  type NativeEditCommandContext
} from "./editContextMenuBridge";
import {
  createEditorCommandTitles,
  editorCommandIds,
  registerEditorCommands
} from "./editorCommands";
import {
  validateStandaloneSaveTargetForSaveAsUi,
  type StandaloneSaveTargetPolicyResult
} from "./saveAsTargetUiPolicy";
import {
  createLineJumpCommandTitles,
  registerLineJumpCommands
} from "./lineJumpCommands";
import {
  createAssistCommandTitles,
  registerAssistCommands
} from "./assistCommands";
import { LineEndingDistributionDialog } from "./dialog/LineEndingDistributionDialog";
import {
  computeLineEndingDistribution,
  type LineEndingDistribution
} from "./lineEndingDistribution";
import {
  computeParagraphIndentInsertTransform,
  computeParagraphIndentRemoveTransform,
  type ParagraphIndentCounts
} from "./paragraphIndentTransform";
import {
  createLineJumpEditorSnapshot,
  documentLineStartOffset
} from "./lineJumpQuery";
import { UtilityWindow } from "./UtilityWindow";
import { GlossaryOccurrencesPanel } from "./GlossaryOccurrencesPanel";
import {
  EditorNavigation,
  type EditorResolveResult,
  type OpenEditorOptions
} from "./editorNavigation";
import {
  applyGlossaryEntryDraftSaveResult,
  addGlossaryEntryDraftForm,
  deleteGlossaryEntryDraftForm,
  glossaryEntryDraftUpdateInput,
  isGlossaryEntryDraftDirty,
  markGlossaryEntryDraftSaveFailed,
  markGlossaryEntryDraftSaving,
  updateGlossaryEntryDraftCanonicalMatchBoundaryEnd,
  updateGlossaryEntryDraftCanonicalMatchBoundaryStart,
  updateGlossaryEntryDraftCanonicalSurface,
  updateGlossaryEntryDraftDescription,
  updateGlossaryEntryDraftFormMatchBoundaryEnd,
  updateGlossaryEntryDraftFormMatchBoundaryStart,
  updateGlossaryEntryDraftFormSurface,
  updateGlossaryEntryDraftFormWarningPolicy,
  updateGlossaryEntryDraftKind
} from "./glossaryEntryDraft";
import { canonicalGlossarySurface } from "./glossaryPresentation";
import {
  createGlossaryCommandTitles,
  glossaryCommandIds,
  registerGlossaryCommands
} from "./glossaryCommands";
import type { GlossaryOccurrenceRange } from "./glossaryOccurrenceNavigation";
import {
  inactiveGlossaryOccurrenceTrackingState,
  navigateGlossaryOccurrenceTracking,
  resolveGlossaryOccurrenceTrackingSession,
  startGlossaryOccurrenceTracking,
  type GlossaryOccurrenceDirection,
  type GlossaryOccurrenceTrackingState,
  type GlossaryOccurrenceTrackingOutcome,
  type NavigateGlossaryOccurrenceTrackingOutcome,
  type ResolveGlossaryOccurrenceTrackingSessionContext,
  type ResolveGlossaryOccurrenceTrackingSessionResult
} from "./glossaryOccurrenceTracking";
import {
  createGlossaryOccurrencesCommandTitles,
  glossaryOccurrencesCommandIds,
  registerGlossaryOccurrencesCommands
} from "./glossaryOccurrencesCommands";
import { createImeCompositionSaveGuard } from "./imeCompositionSaveGuard";
import {
  canMutateWorkingCopy,
  createLifecycleCommitBarrier,
  type LifecycleCommitBarrierIntent,
  type LifecycleCommitBarrierToken
} from "./lifecycleCommitBarrier";
import {
  activeCurrentEditor,
  activeOpenDocument,
  activateOpenDocument,
  closeOpenEditor,
  createInitialOpenDocumentsState,
  documentTabs,
  editorIdForCurrentDocument,
  findOpenDocument,
  hasOpenDocument,
  openOrActivateEditor,
  removeProjectScopedOpenEditors,
  replaceOpenDocument,
  resolveCloseTargetEditorId,
  updateActiveOpenDocument,
  updateActiveOpenEditor,
  updateOpenEditor,
  type OpenDocumentsState
} from "./openDocuments";
import { currentDocumentForOpenedFile } from "./projectDocumentResolution";
import {
  loadFirstProjectDocumentIfCurrent,
  openFirstProjectDocumentAfterContextSwitch,
  ProjectActivationLifetime,
  resetOpenDocumentsForProjectContextSwitch
} from "./projectActivationState";
import { confirmProjectSwitchWithUnsavedDocuments } from "./projectSwitchConfirmation";
import { confirmReadOnlyProjectOpenIfNeeded } from "./readOnlyProjectOpenConfirmation";
import { RecentProjectsPanel } from "./RecentProjectsPanel";
import { resolveCurrentEditor } from "./resolveCurrentEditor";
import { NotificationHost } from "./notification/NotificationHost";
import { NotificationController } from "./notification/notificationController";
import { SettingsPanel } from "./SettingsPanel";
import { createSaveInFlightGuard } from "./saveInFlightGuard";
import { defaultSidebarMode, type SidebarMode } from "./sidebarMode";
import {
  createBrowserSoundFeedbackPlayer,
  playDialogShownSound,
  type SoundFeedbackPlayer
} from "./soundFeedback";
import { useApplicationSettings } from "./useApplicationSettings";
import { useHorizontalDrag } from "./useHorizontalDrag";
import { useVerticalDrag } from "./useVerticalDrag";
import {
  createUtilityWindowCommandTitles,
  registerUtilityWindowCommands,
  utilityWindowCommandIds
} from "./utilityWindowCommands";
import { WelcomeScreen } from "./WelcomeScreen";
import { shouldShowWelcomeSurface } from "./welcomeSurface";
import {
  clampSidebarWidth,
  clampUtilityWindowHeight,
  createInitialWorkbenchLayoutState,
  resolveActiveActivityMode,
  resolveSidebarToggle,
  resolveUtilityWindowOpenState,
  type UtilityWindowTabId,
  type WorkbenchLayoutState
} from "./workbenchLayout";
import {
  createWorkspaceCommandTitles,
  registerWorkspaceCommands,
  workspaceCommandIds,
  workspaceFocusCommandIdForMode
} from "./workspaceCommands";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import {
  documentWorkspaceTabId,
  specialWorkspaceTabId,
  type SpecialTabId,
  type SpecialWorkspaceTab,
  type WorkspaceTabId
} from "./workspaceTabs";

interface StatusMessage {
  key: TranslationKey;
  values?: TranslationValues;
}

type SaveFileOutcome =
  SaveWorkingCopyOutcome;

interface SaveFileOptions {
  readonly editorId?: EditorId;
  readonly forceSaveAs?: boolean;
}

let lifecycleRequestSequence = 0;

function createRendererLifecycleRequestId(intent: string): string {
  lifecycleRequestSequence += 1;
  return `${intent}:${Date.now()}:${lifecycleRequestSequence}`;
}

type StandaloneSaveTargetSelection =
  | {
      readonly kind: "selected";
      readonly path: string;
    }
  | {
      readonly kind: "cancelled";
      readonly reason: "standalone_save_canceled";
    };

const readOnlyProjectSaveAsChoiceIds = {
  save: "save",
  cancel: "cancel"
} as const satisfies Record<string, AppDialogChoiceId>;

function errorMessage(error: unknown, translate: Translate): string {
  return error instanceof Error ? error.message : translate("error.unknown");
}

function projectOpenStatus(
  openedStatus: StatusMessage,
  settingsReloadError: StatusMessage | null,
  translate: Translate
): StatusMessage {
  return settingsReloadError
    ? {
        key: "status.withDetail",
        values: {
          status: translate(openedStatus.key, openedStatus.values),
          detail: translate(settingsReloadError.key, settingsReloadError.values)
        }
      }
    : openedStatus;
}

function projectContextForProject(
  project: PergamumProject | null
): ActiveProjectContext | null {
  return project ? { rootPath: project.rootPath } : null;
}

function projectDocumentPathForReadOnlyRootUi(
  project: PergamumProject,
  document: CurrentDocument
): string | null {
  switch (document.kind) {
    case "file":
      return document.path;
    case "project":
      return `${project.rootPath}/${document.relativePath}`;
    case "untitled":
      return null;
  }
}

function debugEditorIdKind(
  editorId: EditorId | null | undefined
): DebugLogEditorIdKind {
  return editorId?.kind ?? "unknown";
}

function debugSaveTargetKind(editor: CurrentEditor): DebugLogSaveTargetKind {
  switch (editor.kind) {
    case "glossaryEntry":
      return "glossaryEntry";
    case "markdown":
      return isProjectCurrentDocument(editor.document)
        ? "projectDocument"
        : "standaloneMarkdown";
  }
}

export function App(): JSX.Element {
  const [project, setProject] = useState<PergamumProject | null>(null);
  const [openDocumentsState, setOpenDocumentsState] =
    useState<OpenDocumentsState>(createInitialOpenDocumentsState);
  const openDocumentsStateRef = useRef(openDocumentsState);
  openDocumentsStateRef.current = openDocumentsState;
  /**
   * Inlines what `DialogProvider`/`useDialog` (#182) do internally rather
   * than mounting that provider: it needs a `translate` bound to
   * `displayLanguage`, which only exists once `useApplicationSettings()`
   * below has run, so `App` itself can't be a descendant of its own
   * provider. `DialogController` + the concrete dialog components are the
   * reusable pieces this actually needs.
   */
  const dialogControllerRef = useRef<DialogController | null>(null);

  if (!dialogControllerRef.current) {
    dialogControllerRef.current = new DialogController();
  }

  const dialogController = dialogControllerRef.current;
  const [status, setStatus] = useState<StatusMessage>({ key: "app.ready" });
  const [statusBarCharacterCount, setStatusBarCharacterCount] = useState<{
    readonly documentKey: string;
    readonly count: number;
  } | null>(null);
  const soundPlaybackWarningReportedRef = useRef(false);

  function reportSoundPlaybackFailure(): void {
    if (soundPlaybackWarningReportedRef.current) {
      return;
    }

    soundPlaybackWarningReportedRef.current = true;
    setStatus({ key: "status.soundPlaybackFailed" });
  }

  const soundFeedbackRef = useRef<SoundFeedbackPlayer | null>(null);

  if (!soundFeedbackRef.current) {
    soundFeedbackRef.current = createBrowserSoundFeedbackPlayer({
      onPlaybackFailure: reportSoundPlaybackFailure
    });
  }

  const soundFeedback = soundFeedbackRef.current;
  const dialogOpenerRef = useRef<Element | null>(null);
  const aboutDialogOpenerRef = useRef<Element | null>(null);
  const isAboutDialogPendingOrOpenRef = useRef(false);
  const [aboutDialogAppInfo, setAboutDialogAppInfo] =
    useState<PergamumAppInfo | null>(null);
  const lineEndingDistributionDialogOpenerRef = useRef<Element | null>(null);
  const isLineEndingDistributionDialogPendingOrOpenRef = useRef(false);
  const [lineEndingDistributionData, setLineEndingDistributionData] =
    useState<LineEndingDistribution | null>(null);
  const [pendingDialogRequest, setPendingDialogRequest] =
    useState<DialogControllerPendingRequest | null>(() =>
      dialogController.getPendingRequest()
    );

  useEffect(
    () =>
      dialogController.subscribe(() => {
        setPendingDialogRequest(dialogController.getPendingRequest());
        // A modal opened / closed — present any owed deferred Error dialog
        // now that dialogs may be idle (#272 suspension, #274 restore).
        presentSessionPersistenceSuspendedDialogIfIdleRef.current();
        pumpDeferredRestoreErrorDialogsRef.current();
      }),
    [dialogController]
  );
  useEffect(() => () => dialogController.dispose(), [dialogController]);

  /**
   * #266: application-level information-notification channel
   * (`NotificationToast`). Like `dialogController` above it is created once
   * and owned by `App` (not a mounted provider) because callers dispatch
   * through it with a `translate` bound to `displayLanguage`. `NotificationHost`
   * renders the stack; this controller owns state + per-toast auto-dismiss
   * timers. Never used for warnings/errors — those stay with the dialogs.
   */
  const notificationControllerRef = useRef<NotificationController | null>(null);

  if (!notificationControllerRef.current) {
    notificationControllerRef.current = new NotificationController();
  }

  const notificationController = notificationControllerRef.current;

  useEffect(
    () => () => notificationController.dispose(),
    [notificationController]
  );

  const dialogActionOrder = useMemo(
    () => getDialogActionOrder(window.pergamum.platform),
    []
  );

  function confirmDialog(
    options: AppConfirmDialogOptions
  ): Promise<AppConfirmDialogResult> {
    if (typeof document !== "undefined") {
      dialogOpenerRef.current = document.activeElement;
    }

    const result = dialogController.confirm(options);

    const pending = dialogController.getPendingRequest();

    if (pending?.kind === "confirm" && pending.options === options) {
      playDialogShownSound(
        soundFeedback,
        effectiveSettings.workbench.sound,
        reportSoundPlaybackFailure
      );
    }

    return result;
  }

  function choiceDialog(
    options: AppChoiceDialogOptions
  ): Promise<AppChoiceDialogResult> {
    if (typeof document !== "undefined") {
      dialogOpenerRef.current = document.activeElement;
    }

    const result = dialogController.choice(options);

    const pending = dialogController.getPendingRequest();

    if (pending?.kind === "choice" && pending.options === options) {
      playDialogShownSound(
        soundFeedback,
        effectiveSettings.workbench.sound,
        reportSoundPlaybackFailure
      );
    }

    return result;
  }
  const [sidebarMode, setSidebarMode] = useState(defaultSidebarMode);
  const [layout, setLayout] = useState<WorkbenchLayoutState>(
    createInitialWorkbenchLayoutState
  );
  const [isSettingsTabOpen, setIsSettingsTabOpen] = useState(false);
  const [activeSpecialTabId, setActiveSpecialTabId] =
    useState<SpecialTabId | null>(null);
  const [isRecentProjectsOpen, setIsRecentProjectsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [glossaryRefreshToken, setGlossaryRefreshToken] = useState(0);
  const [pendingMarkdownSelection, setPendingMarkdownSelection] =
    useState<GlossaryOccurrenceRange | null>(null);
  /**
   * In-flight document-open timing correlation (#152). Set at the start of
   * `openFile()`, read by MarkdownEditorSurface's one-shot preview-render
   * measurement, then cleared by `handleDocumentOpenMeasured` once the
   * editor-usable/completed events are logged.
   */
  const [documentOpenMeasurement, setDocumentOpenMeasurement] = useState<{
    documentOpenId: string;
    startedAt: number;
  } | null>(null);
  const [
    glossaryOccurrenceTrackingState,
    setGlossaryOccurrenceTrackingState
  ] = useState<GlossaryOccurrenceTrackingState>(
    inactiveGlossaryOccurrenceTrackingState
  );
  const editorNavigationRef = useRef<EditorNavigation<CurrentEditor> | null>(
    null
  );
  const projectActivationLifetimeRef = useRef(
    new ProjectActivationLifetime()
  );
  const lastActiveMarkdownEditorIdRef = useRef<EditorId | null>(null);
  const navigateGlossaryOccurrenceRef = useRef<
    (
      entryId: GlossaryEntryId,
      direction: GlossaryOccurrenceDirection
    ) => Promise<boolean>
  >(() => Promise.resolve(false));
  const navigateGlossaryOccurrenceTrackingSessionRef = useRef<
    (direction: GlossaryOccurrenceDirection) => Promise<boolean>
  >(() => Promise.resolve(false));
  const openTrackedGlossaryEntryRef = useRef<() => Promise<boolean>>(() =>
    Promise.resolve(false)
  );
  const closeGlossaryOccurrenceTrackingRef = useRef<() => boolean>(
    () => false
  );
  const createProjectCommandRef = useRef<() => Promise<void>>(() =>
    Promise.resolve()
  );
  const openProjectCommandRef = useRef<() => Promise<void>>(() =>
    Promise.resolve()
  );
  const closeProjectCommandRef = useRef<() => Promise<void>>(() =>
    Promise.resolve()
  );
  const quitApplicationCommandRef = useRef<() => Promise<void>>(() =>
    Promise.resolve()
  );
  // #274: cold-start Session restore + launch routing runs exactly once,
  // after settings are ready. Replaces the bare startup-project open.
  const coldStartRestoreAttemptedRef = useRef(false);
  const openAboutDialogCommandRef = useRef<() => Promise<void>>(() =>
    Promise.resolve()
  );
  const openMarkdownDocumentCommandRef = useRef<() => Promise<void>>(() =>
    Promise.resolve()
  );
  const saveCurrentDocumentCommandRef = useRef<() => Promise<void>>(() =>
    Promise.resolve()
  );
  const saveCurrentDocumentAsCommandRef = useRef<() => Promise<void>>(() =>
    Promise.resolve()
  );
  const closeEditorCommandRef = useRef<
    (editorId?: EditorId) => Promise<void>
  >(() => Promise.resolve());
  const canCloseEditorCommandRef = useRef<(editorId?: EditorId) => boolean>(
    () => true
  );
  const nativeEditCommandContextRef =
    useRef<NativeEditCommandContext | null>(null);
  const toggleRecentProjectsCommandRef = useRef<() => void>(() => undefined);
  const canSaveCurrentDocumentCommandRef = useRef<() => boolean>(() => false);
  const canSaveCurrentDocumentAsCommandRef = useRef<() => boolean>(
    () => false
  );
  const goToLineCommandRef = useRef<(line: number) => void>(() => undefined);
  const showLineEndingDistributionCommandRef = useRef<() => void>(
    () => undefined
  );
  const insertParagraphIndentCommandRef = useRef<() => void>(() => undefined);
  const removeParagraphIndentCommandRef = useRef<() => void>(() => undefined);
  const paragraphIndentControllerRef =
    useRef<MarkdownEditorParagraphIndentController | null>(null);
  const handleParagraphIndentControllerChange = useCallback(
    (controller: MarkdownEditorParagraphIndentController | null) => {
      paragraphIndentControllerRef.current = controller;
    },
    []
  );
  // #272: Session persistence seam. `App` only *observes* already-derived
  // session inputs and forwards them to the coordinator, plus exposes a
  // read-only Editor View State handle (#273). All serialization, debounce,
  // atomic write and disk I/O live outside `App` (coordinator + main).
  const markdownEditorViewStateControllerRef =
    useRef<MarkdownEditorViewStateController | null>(null);
  const handleMarkdownEditorViewStateControllerChange = useCallback(
    (controller: MarkdownEditorViewStateController | null) => {
      markdownEditorViewStateControllerRef.current = controller;
    },
    []
  );
  // #274: starts as a freshly-minted id; if cold-start restore selects a
  // Session, that Session's `sessionId` is ADOPTED here (same working
  // environment identity, new `instanceRunId`) before any snapshot is
  // persisted — so continuous persistence overwrites that record instead of
  // growing the restore set.
  const [rendererSessionId, setRendererSessionId] = useState<string>(() =>
    createUuidv7()
  );
  // #272 (PO decision): fired ONCE when Session persistence goes
  // ACTIVE → SUSPENDED. Ref-indirected so the coordinator (created once)
  // always reaches the current handler.
  const sessionPersistenceSuspendedHandlerRef = useRef<
    (reason: SessionStorageFailureReason) => void
  >(() => undefined);
  // Re-attempts the deferred suspension Error dialog whenever dialogs go
  // idle (called from the dialog-controller subscription).
  const presentSessionPersistenceSuspendedDialogIfIdleRef = useRef<
    () => void
  >(() => undefined);
  const sessionPersistenceRef = useRef<SessionPersistenceCoordinator | null>(
    null
  );

  if (!sessionPersistenceRef.current) {
    sessionPersistenceRef.current = new SessionPersistenceCoordinator({
      sessionId: rendererSessionId,
      // #274: hold automatic persistence until cold-start restore resolves.
      deferInitialFlush: true,
      transport: {
        persist: (snapshot) => window.pergamum.session.persist(snapshot),
        dropFromRestoreSet: (sessionId) =>
          window.pergamum.session.dropFromRestoreSet(sessionId)
      },
      onSuspended: (reason) =>
        sessionPersistenceSuspendedHandlerRef.current(reason),
      captureActiveEditorViewState: () => {
        const state = openDocumentsStateRef.current;
        const active = activeOpenDocument(state);
        const editor = activeCurrentEditor(state);

        if (!active || editor?.kind !== "markdown") {
          return null;
        }

        return {
          key: serializeEditorId(active.id),
          viewState:
            markdownEditorViewStateControllerRef.current?.captureViewState() ??
            null
        };
      }
    });
  }

  const sessionPersistence = sessionPersistenceRef.current;
  // #272 (review Blocker 3): the outgoing Markdown editor's final View State,
  // captured by MarkdownEditor at the active-editor-switch / unmount
  // boundary (never per keystroke), so a fast tab switch before the
  // persistence debounce never loses it.
  const handleMarkdownViewStateSnapshot = useCallback(
    (outgoingDocumentKey: string, viewState: EditorViewState | null) => {
      sessionPersistence.recordEditorViewState(outgoingDocumentKey, viewState);
    },
    [sessionPersistence]
  );
  // #272 (review Blocker 4): a caret/selection/scroll-only change in the
  // active Markdown editor never touches React state, so nothing else would
  // schedule a Session flush for it. This is the cheap "flush is owed"
  // signal — it does NOT capture, hash, serialize, or IPC; the actual
  // View State capture still happens once, at flush time.
  const handleMarkdownViewStateDirty = useCallback(() => {
    sessionPersistence.markViewStateDirty();
  }, [sessionPersistence]);
  // #274: persisted #273 View States awaiting re-apply, keyed by
  // serializedEditorId. Populated by cold-start restore; each entry is
  // consumed (applied or digest-rejected) the first time its editor shows.
  const pendingRestoreViewStatesRef = useRef<Map<string, unknown>>(new Map());
  const [pendingRestoreViewStateVersion, setPendingRestoreViewStateVersion] =
    useState(0);
  const handleRestoreActiveEditorViewStateApplied = useCallback(
    (key: string) => {
      if (pendingRestoreViewStatesRef.current.delete(key)) {
        setPendingRestoreViewStateVersion((version) => version + 1);
      }
    },
    []
  );
  // #274: guaranteed-recognition Error dialogs for cold-start restore
  // problems ("Session restore unavailable" / "Project restore failed").
  // Mirrors the #272 SUSPENDED-persistence dialog contract: an Error that
  // becomes due is *presented* exactly once, not merely *attempted* once.
  // The queue holds each Error `owed` until the cold-start restore sequence
  // (launch routing / any read-only-project confirmation) has settled, then
  // presents from an idle boundary so it never collides with a
  // launch-routing modal. See src/renderer/dialog/deferredErrorDialogQueue.
  const deferredRestoreErrorDialogsRef =
    useRef<DeferredErrorDialogQueue | null>(null);

  if (!deferredRestoreErrorDialogsRef.current) {
    deferredRestoreErrorDialogsRef.current = new DeferredErrorDialogQueue([
      "restoreUnavailable",
      "projectRestoreFailed"
    ]);
  }

  const deferredRestoreErrorDialogs = deferredRestoreErrorDialogsRef.current;
  // Re-drives the queue whenever dialogs go idle (dialog-controller
  // subscription) and once after the cold-start sequence settles.
  // Ref-indirected like the #272 presenter (subscription effect is
  // created once).
  const pumpDeferredRestoreErrorDialogsRef = useRef<() => void>(
    () => undefined
  );
  // #274: a Markdown launch target awaiting routing into the restored
  // working environment (handled by a follow-up effect, with fresh state).
  const [
    pendingMarkdownLaunchTargetForRestore,
    setPendingMarkdownLaunchTargetForRestore
  ] = useState<string | null>(null);
  /**
   * Holds the current live command context. Read lazily by the
   * CommandRegistry's injected context provider so `when` re-evaluation at
   * execution time never sees a stale closure (#128).
   */
  const commandContextRef = useRef<CommandContext>({});
  const executeUiCommandRef = useRef<
    (commandId: ApplicationMenuCommandId) => void
  >(() => undefined);
  const handleLifecycleWindowCloseRequestRef = useRef<
    (request: LifecycleWindowCloseRequest) => Promise<void>
  >(() => Promise.resolve());
  const lifecycleOperationInProgressRef = useRef(false);
  const lifecycleCommitBarrierRef = useRef(createLifecycleCommitBarrier());
  const projectCloseBarrierReleaseAfterCommitRef =
    useRef<LifecycleCommitBarrierToken | null>(null);
  const [lifecycleCommitBarrierIntent, setLifecycleCommitBarrierIntent] =
    useState<LifecycleCommitBarrierIntent | null>(null);
  const mainAreaRef = useRef<HTMLElement | null>(null);
  const editorAreaBodyRef = useRef<HTMLElement | null>(null);
  const sidebarWidthAtDragStartRef = useRef(layout.sidebar.width);
  const sidebarResizeDrag = useHorizontalDrag({
    onDragStart: () => {
      sidebarWidthAtDragStartRef.current = layout.sidebar.width;
    },
    onDragMove: (deltaX) => {
      const nextWidth = clampSidebarWidth(
        sidebarWidthAtDragStartRef.current + deltaX,
        mainAreaRef.current?.clientWidth
      );

      setLayout((current) =>
        current.sidebar.width === nextWidth
          ? current
          : { ...current, sidebar: { ...current.sidebar, width: nextWidth } }
      );
    }
  });
  const utilityWindowHeightAtDragStartRef = useRef(layout.utilityWindow.height);
  const utilityWindowResizeDrag = useVerticalDrag({
    onDragStart: () => {
      utilityWindowHeightAtDragStartRef.current = layout.utilityWindow.height;
    },
    onDragMove: (deltaY) => {
      const nextHeight = clampUtilityWindowHeight(
        utilityWindowHeightAtDragStartRef.current - deltaY,
        editorAreaBodyRef.current?.clientHeight
      );

      setLayout((current) =>
        current.utilityWindow.height === nextHeight
          ? current
          : {
              ...current,
              utilityWindow: { ...current.utilityWindow, height: nextHeight }
            }
      );
    }
  });
  const {
    settings,
    displayLanguage,
    isLoading: isSettingsLoading,
    error: settingsError,
    reloadSettings,
    saveSettings
  } = useApplicationSettings();
  const imeCompositionSaveGuard = useMemo(
    () =>
      createImeCompositionSaveGuard({
        log: (input) => {
          logRendererDebugEvent({
            level: "debug",
            ...input
          });
        }
      }),
    []
  );
  const saveInFlightGuard = useMemo(() => createSaveInFlightGuard(), []);
  const nextContextMenuInteractionId = useMemo(
    () => createContextMenuInteractionIdFactory(),
    []
  );
  const nextDocumentOpenId = useMemo(() => createDocumentOpenIdFactory(), []);

  // #262: `activeDocument` / `currentEditor` are null in the zero-tab state
  // (no open document tab). The Welcome surface is shown then; downstream code
  // guards on these being non-null rather than assuming an active editor.
  const activeDocument = activeOpenDocument(openDocumentsState);
  const currentEditor = activeCurrentEditor(openDocumentsState);
  const activeMarkdownDocument = currentEditor
    ? markdownDocumentForEditor(currentEditor)
    : null;
  // #274: the pending restore View State for the currently active editor,
  // handed to EditorSurface → MarkdownEditor for a one-shot #273 apply.
  const restoreActiveEditorViewState = useMemo(() => {
    if (!activeDocument) {
      return null;
    }

    const key = serializeEditorId(activeDocument.id);
    const viewState = pendingRestoreViewStatesRef.current.get(key);

    return viewState ? { key, viewState } : null;
    // pendingRestoreViewStateVersion bumps when an entry is consumed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDocument?.id, pendingRestoreViewStateVersion]);
  const hasOpenDocumentTab = openDocumentsState.documents.length > 0;
  // When the Settings tab is the only open tab (zero document tabs), it is the
  // active surface even though `activeSpecialTabId` may not have been set.
  const isSettingsTabActive =
    isSettingsTabOpen &&
    (activeSpecialTabId === "settings" || !hasOpenDocumentTab);

  useEffect(() => {
    if (currentEditor?.kind === "markdown" && activeDocument) {
      lastActiveMarkdownEditorIdRef.current = activeDocument.id;
    }
  }, [currentEditor, activeDocument?.id]);
  useEffect(() => {
    function handleWindowResize(): void {
      const sidebarContainerWidth = mainAreaRef.current?.clientWidth;
      const utilityWindowContainerHeight =
        editorAreaBodyRef.current?.clientHeight;

      setLayout((current) => {
        const nextWidth =
          sidebarContainerWidth === undefined
            ? current.sidebar.width
            : clampSidebarWidth(current.sidebar.width, sidebarContainerWidth);
        const nextHeight =
          utilityWindowContainerHeight === undefined
            ? current.utilityWindow.height
            : clampUtilityWindowHeight(
                current.utilityWindow.height,
                utilityWindowContainerHeight
              );

        if (
          nextWidth === current.sidebar.width &&
          nextHeight === current.utilityWindow.height
        ) {
          return current;
        }

        return {
          ...current,
          sidebar: { ...current.sidebar, width: nextWidth },
          utilityWindow: { ...current.utilityWindow, height: nextHeight }
        };
      });
    }

    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, []);
  useEffect(
    () =>
      subscribeApplicationMenuCommands(
        window.pergamum.applicationMenu.onCommand,
        () => (commandId) => {
          logRendererDebugEvent({
            level: "debug",
            event: "application_menu.command.received",
            details: {
              commandId,
              operation: "command",
              result: "succeeded"
            }
          });
          imeCompositionSaveGuard.handleCommand(
            commandId,
            executeUiCommandRef.current
          );
        }
      ),
    [imeCompositionSaveGuard]
  );
  useEffect(
    () =>
      window.pergamum.lifecycle.onWindowCloseRequest((request) => {
        void handleLifecycleWindowCloseRequestRef.current(request).catch(() => {
          void window.pergamum.lifecycle.respondWindowCloseRequest({
            status: "failed",
            requestId: request.requestId,
            reason: "rendererUnavailable"
          });
        });
      }),
    []
  );
  const activeProjectContext = useMemo(
    () => projectContextForProject(project),
    [project]
  );
  // #272: recomputed whenever the Project or the open-editor set changes.
  // Cheap (no serialization / hashing) — the coordinator debounces and
  // captures Editor View State at most once per flush.
  const sessionSnapshotInputs = useMemo(
    () =>
      buildSessionSnapshotInputs(
        rendererSessionId,
        project,
        openDocumentsState
      ),
    [rendererSessionId, project, openDocumentsState]
  );
  useEffect(() => {
    sessionPersistence.updateSessionInputs(sessionSnapshotInputs);
  }, [sessionPersistence, sessionSnapshotInputs]);
  useEffect(
    () => () => sessionPersistence.dispose(),
    [sessionPersistence]
  );
  // #272 (PO decision): a storage-class failure on a main-driven
  // (window-event) Session re-persist — which the coordinator never awaited
  // — SUSPENDS the coordinator so it stops ordinary continuous persistence.
  useEffect(
    () =>
      window.pergamum.session.onStorageFailure((reason) => {
        sessionPersistence.suspendFromStorageFailure(
          reason as SessionStorageFailureReason
        );
      }),
    [sessionPersistence]
  );
  useEffect(() => {
    imeCompositionSaveGuard.clearPendingSave("active_editor_changed");
  }, [activeDocument?.id, imeCompositionSaveGuard]);
  useEffect(() => {
    imeCompositionSaveGuard.clearPendingSave("project_context_changed");
  }, [activeProjectContext?.rootPath, imeCompositionSaveGuard]);
  useEffect(
    () => () => {
      imeCompositionSaveGuard.clearPendingSave("unmount");
    },
    [imeCompositionSaveGuard]
  );
  const effectiveSettings = useMemo(
    () => resolveEffectiveSettings(settings, project?.config?.settings),
    [settings, project?.config?.settings]
  );
  // #266: NotificationToast auto-dismiss duration, in milliseconds — the
  // Settings value is already stored in the unit the controller's timer
  // consumes, so it passes straight through (no conversion). Kept in sync
  // with the controller by NotificationHost; toasts already on screen keep
  // their original timer.
  const notificationAutoDismissMs =
    effectiveSettings.workbench.notification.durationMs;
  useEffect(() => {
    applyWorkbenchFontFamily(effectiveSettings.workbench.fontFamily);
  }, [effectiveSettings.workbench.fontFamily]);
  useEffect(() => {
    applyEditorFontFamily(effectiveSettings.editor.fontFamily);
  }, [effectiveSettings.editor.fontFamily]);
  // #262: with no active editor (`currentEditor === null`) this is false, so
  // the debounced count below never runs and the Status Bar shows nothing —
  // the #259 character-count algorithm/settings/debounce are untouched.
  const shouldComputeStatusBarCharacterCount =
    effectiveSettings.workbench.statusBar.visible &&
    effectiveSettings.workbench.statusBar.characterCount.visible &&
    !isSettingsTabActive &&
    currentEditor?.kind === "markdown";
  const statusBarCharacterCountDocumentKey =
    shouldComputeStatusBarCharacterCount && activeDocument
      ? serializeEditorId(activeDocument.id)
      : null;
  const statusBarCharacterCountContent =
    shouldComputeStatusBarCharacterCount && currentEditor?.kind === "markdown"
      ? currentDocumentContent(currentEditor.document)
      : "";
  useEffect(() => {
    if (
      !shouldComputeStatusBarCharacterCount ||
      statusBarCharacterCountDocumentKey === null
    ) {
      setStatusBarCharacterCount(null);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setStatusBarCharacterCount({
        documentKey: statusBarCharacterCountDocumentKey,
        count: countMarkdownDocumentCharacters(statusBarCharacterCountContent, {
          exclude: effectiveSettings.editor.characterCount.exclude
        })
      });
    }, CHARACTER_COUNT_UPDATE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [
    shouldComputeStatusBarCharacterCount,
    statusBarCharacterCountDocumentKey,
    statusBarCharacterCountContent,
    effectiveSettings.editor.characterCount.exclude.whitespace,
    effectiveSettings.editor.characterCount.exclude.lineBreaks,
    effectiveSettings.editor.characterCount.exclude.headings,
    effectiveSettings.editor.characterCount.exclude.markdownSyntax,
    effectiveSettings.editor.characterCount.exclude.markdownComments
  ]);
  const isDirty = currentEditor ? isCurrentEditorDirty(currentEditor) : false;
  const isReadOnlyProject = project?.accessMode.kind === "readOnly";
  const isReadWriteProject = project?.accessMode.kind === "readWrite";
  const isProjectOwnedCurrentEditor =
    !isSettingsTabActive &&
    (currentEditor?.kind === "glossaryEntry" ||
      (currentEditor?.kind === "markdown" &&
        activeMarkdownDocument?.kind === "project"));
  const isReadOnlyProjectOwnedEditor =
    isReadOnlyProject && isProjectOwnedCurrentEditor;
  const isSavingGlossaryEntry =
    currentEditor?.kind === "glossaryEntry" &&
    currentEditor.draft.saveState === "saving";
  const canSaveGlossaryEntry =
    currentEditor?.kind === "glossaryEntry" &&
    !isSavingGlossaryEntry &&
    currentEditor.draft.canonicalSurface.trim().length > 0;
  const canSave =
    !isSettingsTabActive && currentEditor?.kind === "markdown"
      ? Boolean(activeMarkdownDocument)
      : !isSettingsTabActive && canSaveGlossaryEntry;
  const canSaveAs =
    !isSettingsTabActive &&
    currentEditor?.kind === "markdown" &&
    Boolean(activeMarkdownDocument);
  const isLifecycleCommitBarrierActive =
    lifecycleCommitBarrierIntent !== null;
  const isEditorReadOnly = !canMutateWorkingCopy({
    lifecycleCommitBarrierActive: isLifecycleCommitBarrierActive,
    isReadOnlyProjectOwnedEditor
  });

  function isLifecycleCommitBarrierActiveNow(): boolean {
    return lifecycleCommitBarrierRef.current.isActive();
  }

  function enterLifecycleCommitBarrier(
    intent: LifecycleCommitBarrierIntent
  ): LifecycleCommitBarrierToken {
    const token = lifecycleCommitBarrierRef.current.enter(intent);
    setLifecycleCommitBarrierIntent(intent);
    return token;
  }

  function exitLifecycleCommitBarrier(
    token: LifecycleCommitBarrierToken
  ): void {
    if (lifecycleCommitBarrierRef.current.exit(token)) {
      setLifecycleCommitBarrierIntent(null);
    }
  }

  function canMutateActiveWorkingCopy(): boolean {
    return canMutateWorkingCopy({
      lifecycleCommitBarrierActive: isLifecycleCommitBarrierActiveNow(),
      isReadOnlyProjectOwnedEditor
    });
  }

  useLayoutEffect(() => {
    const token = projectCloseBarrierReleaseAfterCommitRef.current;

    if (!token) {
      return;
    }

    projectCloseBarrierReleaseAfterCommitRef.current = null;
    exitLifecycleCommitBarrier(token);
  });

  function isInsideCurrentReadOnlyProjectRootForUi(filePath: string): boolean {
    if (!project || !isReadOnlyProject) {
      return false;
    }

    try {
      return isPathEqualOrInsideDirectory(
        filePath,
        project.rootPath,
        window.pergamum.platform
      );
    } catch {
      return true;
    }
  }

  const activeEditorSaveBlockedByReadOnlyProjectRootForUi =
    !isSettingsTabActive &&
    currentEditor?.kind === "markdown" &&
    activeMarkdownDocument &&
    project
      ? (() => {
          const documentPath = projectDocumentPathForReadOnlyRootUi(
            project,
            activeMarkdownDocument
          );

          return documentPath
            ? isInsideCurrentReadOnlyProjectRootForUi(documentPath)
            : false;
        })()
      : false;
  const commandContext = useMemo(
    () =>
      buildCommandContextSnapshot({
        projectIsOpen: project !== null,
        projectAccessReadWrite: isReadWriteProject,
        projectAccessReadOnly: isReadOnlyProject,
        editorHasDocument:
          !isSettingsTabActive && currentEditor?.kind === "markdown"
            ? Boolean(activeMarkdownDocument)
            : !isSettingsTabActive && currentEditor?.kind === "glossaryEntry",
        editorIsDirty: !isSettingsTabActive && isDirty,
        editorKindMarkdown:
          !isSettingsTabActive && currentEditor?.kind === "markdown",
        editorKindGlossary:
          !isSettingsTabActive && currentEditor?.kind === "glossaryEntry",
        editorDocumentProjectOwned: isProjectOwnedCurrentEditor,
        activeEditorSaveBlockedByReadOnlyProjectRootForUi,
        occurrenceTrackingActive:
          glossaryOccurrenceTrackingState.kind === "active"
      }),
    [
      project,
      isReadWriteProject,
      isReadOnlyProject,
      isSettingsTabActive,
      currentEditor?.kind,
      activeMarkdownDocument,
      isProjectOwnedCurrentEditor,
      activeEditorSaveBlockedByReadOnlyProjectRootForUi,
      isDirty,
      glossaryOccurrenceTrackingState.kind
    ]
  );
  commandContextRef.current = commandContext;
  const translate = useMemo(
    () => (key: TranslationKey, values?: TranslationValues) =>
      t(displayLanguage, key, values),
    [displayLanguage]
  );
  const statusBarNumberFormatter = useMemo(
    () => new Intl.NumberFormat(displayLanguage),
    [displayLanguage]
  );
  const statusBarCharacterCountText =
    statusBarCharacterCountDocumentKey !== null &&
    statusBarCharacterCount?.documentKey === statusBarCharacterCountDocumentKey
      ? translate("status.characterCount", {
          count: statusBarNumberFormatter.format(statusBarCharacterCount.count)
        })
      : null;
  const commandRegistry = useMemo(() => {
    const registry = new CommandRegistry();

    registerApplicationCommands(
      registry,
      {
        openAbout: () => openAboutDialogCommandRef.current(),
        quitApplication: () => quitApplicationCommandRef.current(),
        createProject: () => createProjectCommandRef.current(),
        openProject: () => openProjectCommandRef.current(),
        closeProject: () => closeProjectCommandRef.current(),
        toggleRecentProjects: () => toggleRecentProjectsCommandRef.current()
      },
      createApplicationCommandTitles(translate)
    );
    registerEditorCommands(
      registry,
      {
        openMarkdownDocument: () => openMarkdownDocumentCommandRef.current(),
        saveCurrentDocument: () => saveCurrentDocumentCommandRef.current(),
        saveCurrentDocumentAs: () =>
          saveCurrentDocumentAsCommandRef.current(),
        canSaveCurrentDocument: () => canSaveCurrentDocumentCommandRef.current(),
        canSaveCurrentDocumentAs: () =>
          canSaveCurrentDocumentAsCommandRef.current(),
        closeEditor: (editorId) => closeEditorCommandRef.current(editorId),
        canCloseEditor: (editorId) =>
          canCloseEditorCommandRef.current(editorId),
        delegateNativeEditCommand: (commandId) =>
          delegateNativeEditCommand(commandId),
        canDelegateNativeEditCommand: () => true
      },
      createEditorCommandTitles(translate)
    );
    registerLineJumpCommands(
      registry,
      {
        goToLine: (line) => goToLineCommandRef.current(line)
      },
      createLineJumpCommandTitles(translate)
    );
    registerAssistCommands(
      registry,
      {
        showLineEndingDistribution: () =>
          showLineEndingDistributionCommandRef.current(),
        insertParagraphIndent: () => insertParagraphIndentCommandRef.current(),
        removeParagraphIndent: () => removeParagraphIndentCommandRef.current()
      },
      createAssistCommandTitles(translate)
    );
    registerWorkspaceCommands(
      registry,
      {
        focusSidebarMode: (mode) => {
          const toggled = resolveSidebarToggle(
            sidebarMode,
            mode,
            layout.sidebar.collapsed
          );

          setSidebarMode(toggled.mode);
          setLayout((current) => {
            if (toggled.collapsed) {
              return current.sidebar.collapsed
                ? current
                : {
                    ...current,
                    sidebar: { ...current.sidebar, collapsed: true }
                  };
            }

            return {
              ...current,
              sidebar: {
                collapsed: false,
                width: clampSidebarWidth(
                  current.sidebar.width,
                  mainAreaRef.current?.clientWidth
                )
              }
            };
          });
        },
        openApplicationSettings: () => {
          openSettingsTab();
        }
      },
      createWorkspaceCommandTitles(translate)
    );
    registerUtilityWindowCommands(
      registry,
      {
        openUtilityWindow: () => {
          setLayout((current) => ({
            ...current,
            utilityWindow: resolveUtilityWindowOpenState(
              current.utilityWindow,
              true,
              editorAreaBodyRef.current?.clientHeight
            )
          }));
        },
        closeUtilityWindow: () => {
          setLayout((current) => ({
            ...current,
            utilityWindow: resolveUtilityWindowOpenState(
              current.utilityWindow,
              false
            )
          }));
        },
        toggleUtilityWindow: () => {
          setLayout((current) => ({
            ...current,
            utilityWindow: resolveUtilityWindowOpenState(
              current.utilityWindow,
              !current.utilityWindow.open,
              editorAreaBodyRef.current?.clientHeight
            )
          }));
        }
      },
      createUtilityWindowCommandTitles(translate)
    );
    registerGlossaryCommands(
      registry,
      {
        openGlossaryEntry: async (entryId) => {
          const editorId = createGlossaryEntryEditorId(
            entryId,
            activeProjectContext
          );

          return await openEditorFromExplicitActivation(editorId);
        },
        createGlossaryEntry: async (input) => {
          const projectGeneration =
            projectActivationLifetimeRef.current.captureProjectActivationGeneration();
          let entry: GlossaryEntry;

          try {
            entry = await window.pergamum.glossary.create(input);
          } catch (error) {
            if (
              !projectActivationLifetimeRef.current.isProjectActivationCurrent(
                projectGeneration
              )
            ) {
              return false;
            }

            throw error;
          }

          if (
            !projectActivationLifetimeRef.current.isProjectActivationCurrent(
              projectGeneration
            )
          ) {
            return false;
          }

          setGlossaryRefreshToken((token) => token + 1);

          const editorId = createGlossaryEntryEditorId(
            entry.id,
            activeProjectContext
          );

          return await openEditorFromExplicitActivation(editorId, {
            history: "record",
            resolvedEditor: createGlossaryEntryCurrentEditor(entry)
          });
        },
        navigateToPreviousGlossaryOccurrence: (entryId) =>
          navigateGlossaryOccurrenceRef.current(entryId, "previous"),
        navigateToNextGlossaryOccurrence: (entryId) =>
          navigateGlossaryOccurrenceRef.current(entryId, "next")
      },
      createGlossaryCommandTitles(translate)
    );
    registerGlossaryOccurrencesCommands(
      registry,
      {
        navigateToPreviousOccurrence: () =>
          navigateGlossaryOccurrenceTrackingSessionRef.current("previous"),
        navigateToNextOccurrence: () =>
          navigateGlossaryOccurrenceTrackingSessionRef.current("next"),
        openTrackedGlossaryEntry: () => openTrackedGlossaryEntryRef.current(),
        closeGlossaryOccurrenceTracking: () =>
          closeGlossaryOccurrenceTrackingRef.current()
      },
      createGlossaryOccurrencesCommandTitles(translate)
    );
    registerCommandPaletteCommands(
      registry,
      {
        openCommandPalette: () => {
          setIsCommandPaletteOpen((isOpen) => (isOpen ? isOpen : true));
        }
      },
      createCommandPaletteCommandTitles(translate)
    );

    registry.setCommandContextProvider(() => commandContextRef.current);
    registry.setCommandExecutionBlocker(() =>
      isLifecycleCommitBarrierActiveNow() ||
      dialogController.getPendingRequest() ||
      isAboutDialogPendingOrOpenRef.current ||
      isLineEndingDistributionDialogPendingOrOpenRef.current
        ? "app_modal_open"
        : null
    );
    registry.setOnCommandIgnored((event) => {
      logRendererDebugEvent({
        level: "debug",
        event: "command.ignored",
        details: {
          commandId: event.commandId,
          source: event.source,
          result: "ignored",
          reason: event.reason ?? "disabled_command"
        }
      });
    });
    registry.setOnCommandInvoked((event) => {
      logRendererDebugEvent({
        level: "debug",
        event: "command.invoked",
        details: {
          commandId: event.commandId,
          source: event.source
        }
      });
    });

    return registry;
  }, [
    activeProjectContext,
    dialogController,
    layout.sidebar.collapsed,
    sidebarMode,
    translate
  ]);
  // #252 follow-up: the native Electron application menu is built once at
  // startup and otherwise never touched, so it does not automatically
  // reflect `when`-based enablement (e.g. `editor.kind.markdown` going
  // false while Application Settings is the active tab). Push the same
  // enablement the Command Palette already uses
  // (`CommandRegistry.isEnabledForContext`) to main whenever it changes,
  // so `assist.lineEndingDistribution.show` (and any other menu command
  // that declares a `when`) is grayed out consistently in both surfaces.
  useEffect(() => {
    const enablement: Record<string, boolean> = {};

    for (const commandId of applicationMenuCommandIds) {
      enablement[commandId] = commandRegistry.isEnabledForContext(
        commandId,
        commandContext
      );
    }

    window.pergamum.applicationMenu.setEnablement(enablement);
  }, [commandRegistry, commandContext]);
  useEffect(
    () =>
      window.pergamum.contextMenu.onCommandSelected((selection) => {
        void executeContextMenuEditCommand(selection, {
          commandRegistry,
          editorIdKind: debugEditorIdKind(activeDocument?.id),
          delegatedSurface: delegatedContextSurfaceFromDocument(),
          hasSelection: hasSelectionInDocument(),
          log: logRendererDebugEvent,
          setNativeEditCommandContext: (context) => {
            nativeEditCommandContextRef.current = context;
          },
          clearNativeEditCommandContext: (context) => {
            if (nativeEditCommandContextRef.current === context) {
              nativeEditCommandContextRef.current = null;
            }
          }
        }).catch((error) => {
          logRendererDebugEvent({
            level: "error",
            event: "command.failed",
            details: {
              commandId: selection.commandId,
              operation: "unknown",
              result: "failed",
              statusKey: "status.commandFailed",
              error: rendererDebugErrorInfo(error)
            }
          });
          setStatus({
            key: "status.commandFailed",
            values: { message: errorMessage(error, translate) }
          });
        });
      }),
    [activeDocument?.id, commandRegistry, translate]
  );
  // #262: Welcome is shown exactly when there are zero open tabs of any kind —
  // independent of whether a project is open.
  const shouldShowWelcome = shouldShowWelcomeSurface({
    openDocumentsState,
    isSettingsTabOpen
  });
  const activeActivityMode = resolveActiveActivityMode(
    sidebarMode,
    layout.sidebar.collapsed,
    project !== null
  );
  const tabs = useMemo(
    () => documentTabs(openDocumentsState),
    [openDocumentsState]
  );
  const specialTabs = useMemo<SpecialWorkspaceTab[]>(
    () =>
      isSettingsTabOpen
        ? [
            {
              kind: "special",
              id: "settings",
              title: translate("settings.application.title")
            }
          ]
        : [],
    [isSettingsTabOpen, translate]
  );
  const activeWorkspaceTabId: WorkspaceTabId | undefined = isSettingsTabActive
    ? specialWorkspaceTabId("settings")
    : openDocumentsState.activeDocumentId
      ? documentWorkspaceTabId(openDocumentsState.activeDocumentId)
      : undefined;
  if (!editorNavigationRef.current) {
    editorNavigationRef.current = new EditorNavigation({
      resolveEditor,
      applyEditor
    });
  }
  const editorNavigation = editorNavigationRef.current;
  editorNavigation.updateAdapter({
    resolveEditor,
    applyEditor
  });

  async function confirmProjectSwitch(): Promise<boolean> {
    return confirmProjectSwitchWithUnsavedDocuments({
      state: openDocumentsState,
      translate,
      choiceDialog
    });
  }

  async function resolveProjectOpenResult(
    result: ProjectOpenResult
  ): Promise<PergamumProject | null> {
    return confirmReadOnlyProjectOpenIfNeeded({
      result,
      translate,
      choiceDialog,
      confirmReadOnlyProjectOpen:
        window.pergamum.projects.confirmReadOnlyProjectOpen,
      cancelReadOnlyProjectOpen:
        window.pergamum.projects.cancelReadOnlyProjectOpen
    });
  }

  function setActiveDocumentContent(
    nextContent: string,
    nextLineEndingBreaks: LineEndingBreakSet
  ): void {
    if (!canMutateActiveWorkingCopy()) {
      return;
    }

    setOpenDocumentsState((state) =>
      updateActiveOpenDocument(state, (document) =>
        updateCurrentDocumentContent(
          document,
          nextContent,
          nextLineEndingBreaks
        )
      )
    );
  }

  function setActiveGlossaryEntryKind(kind: GlossaryEntryKind): void {
    if (!canMutateActiveWorkingCopy()) {
      return;
    }

    setOpenDocumentsState((state) =>
      updateActiveOpenEditor(state, (editor) =>
        editor.kind === "glossaryEntry"
          ? { ...editor, draft: updateGlossaryEntryDraftKind(editor.draft, kind) }
          : editor
      )
    );
  }

  function setActiveGlossaryEntryDescription(description: string): void {
    if (!canMutateActiveWorkingCopy()) {
      return;
    }

    setOpenDocumentsState((state) =>
      updateActiveOpenEditor(state, (editor) =>
        editor.kind === "glossaryEntry"
          ? {
              ...editor,
              draft: updateGlossaryEntryDraftDescription(
                editor.draft,
                description
              )
            }
          : editor
      )
    );
  }

  function setActiveGlossaryEntryCanonicalSurface(surface: string): void {
    if (!canMutateActiveWorkingCopy()) {
      return;
    }

    setOpenDocumentsState((state) =>
      updateActiveOpenEditor(state, (editor) =>
        editor.kind === "glossaryEntry"
          ? {
              ...editor,
              draft: updateGlossaryEntryDraftCanonicalSurface(
                editor.draft,
                surface
              )
            }
          : editor
      )
    );
  }

  function setActiveGlossaryEntryCanonicalMatchBoundaryStart(
    matchBoundaryStart: GlossaryFormMatchBoundary
  ): void {
    if (!canMutateActiveWorkingCopy()) {
      return;
    }

    setOpenDocumentsState((state) =>
      updateActiveOpenEditor(state, (editor) =>
        editor.kind === "glossaryEntry"
          ? {
              ...editor,
              draft: updateGlossaryEntryDraftCanonicalMatchBoundaryStart(
                editor.draft,
                matchBoundaryStart
              )
            }
          : editor
      )
    );
  }

  function setActiveGlossaryEntryCanonicalMatchBoundaryEnd(
    matchBoundaryEnd: GlossaryFormMatchBoundary
  ): void {
    if (!canMutateActiveWorkingCopy()) {
      return;
    }

    setOpenDocumentsState((state) =>
      updateActiveOpenEditor(state, (editor) =>
        editor.kind === "glossaryEntry"
          ? {
              ...editor,
              draft: updateGlossaryEntryDraftCanonicalMatchBoundaryEnd(
                editor.draft,
                matchBoundaryEnd
              )
            }
          : editor
      )
    );
  }

  function addActiveGlossaryEntryForm(
    relation: GlossaryFormRelation
  ): void {
    if (!canMutateActiveWorkingCopy()) {
      return;
    }

    setOpenDocumentsState((state) =>
      updateActiveOpenEditor(state, (editor) =>
        editor.kind === "glossaryEntry"
          ? {
              ...editor,
              draft: addGlossaryEntryDraftForm(editor.draft, relation)
            }
          : editor
      )
    );
  }

  function setActiveGlossaryEntryFormSurface(
    formId: string,
    surface: string
  ): void {
    if (!canMutateActiveWorkingCopy()) {
      return;
    }

    setOpenDocumentsState((state) =>
      updateActiveOpenEditor(state, (editor) =>
        editor.kind === "glossaryEntry"
          ? {
              ...editor,
              draft: updateGlossaryEntryDraftFormSurface(
                editor.draft,
                formId,
                surface
              )
            }
          : editor
      )
    );
  }

  function setActiveGlossaryEntryFormWarningPolicy(
    formId: string,
    warningPolicy: GlossaryWarningPolicy
  ): void {
    if (!canMutateActiveWorkingCopy()) {
      return;
    }

    setOpenDocumentsState((state) =>
      updateActiveOpenEditor(state, (editor) =>
        editor.kind === "glossaryEntry"
          ? {
              ...editor,
              draft: updateGlossaryEntryDraftFormWarningPolicy(
                editor.draft,
                formId,
                warningPolicy
              )
            }
          : editor
      )
    );
  }

  function setActiveGlossaryEntryFormMatchBoundaryStart(
    formId: string,
    matchBoundaryStart: GlossaryFormMatchBoundary
  ): void {
    if (!canMutateActiveWorkingCopy()) {
      return;
    }

    setOpenDocumentsState((state) =>
      updateActiveOpenEditor(state, (editor) =>
        editor.kind === "glossaryEntry"
          ? {
              ...editor,
              draft: updateGlossaryEntryDraftFormMatchBoundaryStart(
                editor.draft,
                formId,
                matchBoundaryStart
              )
            }
          : editor
      )
    );
  }

  function setActiveGlossaryEntryFormMatchBoundaryEnd(
    formId: string,
    matchBoundaryEnd: GlossaryFormMatchBoundary
  ): void {
    if (!canMutateActiveWorkingCopy()) {
      return;
    }

    setOpenDocumentsState((state) =>
      updateActiveOpenEditor(state, (editor) =>
        editor.kind === "glossaryEntry"
          ? {
              ...editor,
              draft: updateGlossaryEntryDraftFormMatchBoundaryEnd(
                editor.draft,
                formId,
                matchBoundaryEnd
              )
            }
          : editor
      )
    );
  }

  function deleteActiveGlossaryEntryForm(formId: string): void {
    if (!canMutateActiveWorkingCopy()) {
      return;
    }

    setOpenDocumentsState((state) =>
      updateActiveOpenEditor(state, (editor) =>
        editor.kind === "glossaryEntry"
          ? {
              ...editor,
              draft: deleteGlossaryEntryDraftForm(editor.draft, formId)
            }
          : editor
      )
    );
  }

  async function createGlossaryEntryFromSidebar(
    input: CreateGlossaryEntryInput
  ): Promise<boolean> {
    try {
      return await commandRegistry.execute(
        glossaryCommandIds.createEntry,
        { source: "workspaceSidebar" },
        input
      );
    } catch (error) {
      if (error instanceof CommandDisabledError) {
        return false;
      }

      setStatus({
        key: "status.commandFailed",
        values: { message: errorMessage(error, translate) }
      });
      return false;
    }
  }

  function activateDocument(documentId: EditorId): void {
    if (isLifecycleCommitBarrierActiveNow()) {
      return;
    }

    openEditorFromUi(documentId);
    setActiveSpecialTabId(null);
  }

  function openSettingsTab(): void {
    setIsSettingsTabOpen(true);
    setActiveSpecialTabId("settings");
  }

  function activateSpecialTab(tabId: SpecialTabId): void {
    if (tabId === "settings" && isSettingsTabOpen) {
      setActiveSpecialTabId(tabId);
    }
  }

  function closeSpecialTab(tabId: SpecialTabId): void {
    if (tabId !== "settings") {
      return;
    }

    setIsSettingsTabOpen(false);
    setActiveSpecialTabId((current) => (current === tabId ? null : current));
  }

  async function openAboutDialog(): Promise<void> {
    if (isAboutDialogPendingOrOpenRef.current) {
      return;
    }

    if (typeof document !== "undefined") {
      aboutDialogOpenerRef.current = document.activeElement;
    }

    isAboutDialogPendingOrOpenRef.current = true;

    try {
      const appInfo = await window.pergamum.appInfo.getAppInfo();

      setAboutDialogAppInfo(appInfo);
      playDialogShownSound(
        soundFeedback,
        effectiveSettings.workbench.sound,
        reportSoundPlaybackFailure
      );
    } catch (error) {
      isAboutDialogPendingOrOpenRef.current = false;
      throw error;
    }
  }

  function closeAboutDialog(): void {
    isAboutDialogPendingOrOpenRef.current = false;
    setAboutDialogAppInfo(null);
  }

  /**
   * #252: this dialog's data is derived synchronously from the active
   * document's #253 tracking state and the current
   * `editor.lineEnding.expected` setting — no IPC round trip, unlike
   * openAboutDialog above. It never mutates the document.
   */
  function openLineEndingDistributionDialog(): void {
    if (
      isLineEndingDistributionDialogPendingOrOpenRef.current ||
      !activeMarkdownDocument
    ) {
      return;
    }

    if (typeof document !== "undefined") {
      lineEndingDistributionDialogOpenerRef.current = document.activeElement;
    }

    isLineEndingDistributionDialogPendingOrOpenRef.current = true;
    setLineEndingDistributionData(
      computeLineEndingDistribution(
        activeMarkdownDocument.lineEndingBreaks,
        effectiveSettings.editor.lineEnding.expected
      )
    );
    playDialogShownSound(
      soundFeedback,
      effectiveSettings.workbench.sound,
      reportSoundPlaybackFailure
    );
  }

  function closeLineEndingDistributionDialog(): void {
    isLineEndingDistributionDialogPendingOrOpenRef.current = false;
    setLineEndingDistributionData(null);
  }

  function showParagraphIndentResultDialog(
    operation: "insert" | "remove",
    counts: ParagraphIndentCounts
  ): void {
    void confirmDialog({
      title: translate(
        operation === "insert"
          ? "dialog.paragraphIndent.insert.title"
          : "dialog.paragraphIndent.remove.title"
      ),
      message: {
        kind: "plainText",
        text: translate("dialog.paragraphIndent.result.message", {
          changedLineCount: counts.changedLineCount,
          skippedLineCount: counts.skippedLineCount,
          emptyLineCount: counts.emptyLineCount
        })
      },
      icon: {
        kind: "info",
        tooltip: translate("dialog.icon.info")
      },
      clipboardText: null,
      dismissOnBackdropClick: false,
      confirmLabel: translate("common.ok"),
      cancelLabel: null
    }).catch((error) => {
      if (error instanceof AppDialogError && error.kind === "dialogAlreadyOpen") {
        return;
      }

      setStatus({
        key: "status.commandFailed",
        values: { message: errorMessage(error, translate) }
      });
    });
  }

  function applyParagraphIndentOperation(
    operation: "insert" | "remove"
  ): void {
    if (
      isSettingsTabActive ||
      currentEditor?.kind !== "markdown" ||
      !activeMarkdownDocument ||
      isLifecycleCommitBarrierActiveNow() ||
      isReadOnlyProjectOwnedEditor
    ) {
      return;
    }

    const content = currentDocumentContent(activeMarkdownDocument);
    const transform =
      operation === "insert"
        ? computeParagraphIndentInsertTransform(
            content,
            effectiveSettings.editor.paragraphIndent.excludeLeadingCharacters
          )
        : computeParagraphIndentRemoveTransform(content);

    if (transform.changes.length > 0) {
      const applied =
        paragraphIndentControllerRef.current?.applyParagraphIndentChanges(
          transform.changes
        ) ?? false;

      if (!applied) {
        return;
      }
    }

    showParagraphIndentResultDialog(operation, transform.counts);
  }

  function reportAboutExternalLinkFailure(error: unknown): void {
    setStatus({
      key: "status.commandFailed",
      values: { message: errorMessage(error, translate) }
    });
  }

  function openAboutRepository(): void {
    void window.pergamum.appInfo
      .openRepository()
      .catch(reportAboutExternalLinkFailure);
  }

  function openAboutTypewriterSoundsCredit(): void {
    void window.pergamum.appInfo
      .openTypewriterSoundsCredit()
      .catch(reportAboutExternalLinkFailure);
  }

  function canCloseEditorNow(editorId?: EditorId): boolean {
    if (!editorId && isSettingsTabActive) {
      return true;
    }

    return resolveCloseTargetEditorId(openDocumentsState, editorId) !== null;
  }

  async function closeEditorWithConfirmation(
    editorId?: EditorId
  ): Promise<void> {
    if (isLifecycleCommitBarrierActiveNow()) {
      return;
    }

    if (!editorId && isSettingsTabActive) {
      closeSpecialTab("settings");
      return;
    }

    await runEditorCloseFlow(editorId, {
      state: openDocumentsState,
      translate,
      choiceDialog,
      saveDirtyEditorBeforeClose: (targetId) =>
        saveFile({ editorId: targetId }),
      onClose: (targetId) => {
        editorNavigation.invalidateEditor(targetId);
        setOpenDocumentsState((state) => closeOpenEditor(state, targetId));
      }
    });
  }

  function handleActivityBarModeClick(mode: SidebarMode): void {
    executeUiCommand(workspaceFocusCommandIdForMode(mode), {
      source: "activityBar"
    });
  }

  function handleChangeMarkdownEditorPreviewRatio(ratio: number): void {
    setLayout((current) =>
      current.markdownEditorPreview.ratio === ratio
        ? current
        : { ...current, markdownEditorPreview: { ratio } }
    );
  }

  async function resolveEditor(
    editorId: EditorId
  ): Promise<EditorResolveResult<CurrentEditor>> {
    return resolveCurrentEditor(editorId, {
      openDocumentsState,
      project,
      activeProjectContext,
      readProjectDocument,
      getGlossaryEntryById: window.pergamum.glossary.getById
    });
  }

  function applyEditor(editorId: EditorId, editor: CurrentEditor): void {
    setActiveSpecialTabId(null);
    setOpenDocumentsState((state) => {
      if (hasOpenDocument(state, editorId)) {
        return activateOpenDocument(state, editorId);
      }

      return openOrActivateEditor(state, editor, activeProjectContext);
    });
  }

  function openEditor(
    editorId: EditorId,
    options?: OpenEditorOptions<CurrentEditor>
  ): Promise<boolean> {
    return editorNavigation.openEditor(editorId, options);
  }

  function openEditorFromExplicitActivation(
    editorId: EditorId,
    options?: OpenEditorOptions<CurrentEditor>
  ): Promise<boolean> {
    projectActivationLifetimeRef.current.markExplicitEditorActivation();

    return openEditor(editorId, options);
  }

  function openEditorFromUi(
    editorId: EditorId,
    options?: OpenEditorOptions<CurrentEditor>
  ): void {
    if (isLifecycleCommitBarrierActiveNow()) {
      return;
    }

    void openEditorFromExplicitActivation(editorId, options).catch((error) => {
      setStatus({
        key: "status.documentOpenFailed",
        values: { message: errorMessage(error, translate) }
      });
    });
  }

  async function openDocument(document: CurrentDocument): Promise<boolean> {
    if (isLifecycleCommitBarrierActiveNow()) {
      return false;
    }

    const editorId = editorIdForCurrentDocument(
      document,
      activeProjectContext
    );

    if (!editorId) {
      throw new Error("Untitled editors must already have an EditorId.");
    }

    return await openEditorFromExplicitActivation(editorId, {
      history: "record",
      resolvedEditor: createMarkdownCurrentEditor(document)
    });
  }

  function executeUiCommand<TArgs extends readonly unknown[], TResult>(
    commandId: CommandId<TArgs, TResult>,
    options: CommandExecutionOptions,
    ...args: CommandArgumentList<TArgs>
  ): void {
    void commandRegistry.execute(commandId, options, ...args).catch((error) => {
      if (error instanceof CommandDisabledError) {
        return;
      }

      logRendererDebugEvent({
        level: "error",
        event: "command.failed",
        details: {
          commandId: String(commandId),
          operation: "unknown",
          result: "failed",
          statusKey: "status.commandFailed",
          error: rendererDebugErrorInfo(error)
        }
      });
      setStatus({
        key: "status.commandFailed",
        values: { message: errorMessage(error, translate) }
      });
    });
  }

  executeUiCommandRef.current = (commandId) => {
    executeUiCommand(commandId, { source: "applicationMenu" });
  };

  async function delegateNativeEditCommand(
    commandId: EditCommandId
  ): Promise<void> {
    const context = nativeEditCommandContextRef.current;

    if (!context || context.commandId !== commandId) {
      return;
    }

    await window.pergamum.edit.delegateNativeEdit(context);
  }

  function handleContextMenuCapture(
    event: ReactMouseEvent<HTMLElement>
  ): void {
    handleEditContextMenuEvent(event, {
      commandRegistry,
      nextInteractionId: nextContextMenuInteractionId,
      editorIdKind: debugEditorIdKind(activeDocument?.id),
      hasSelection: () => hasSelectionInDocument(),
      log: logRendererDebugEvent,
      popupEditMenu: window.pergamum.contextMenu.popupEditMenu
    });
  }

  function handleCompositionStartCapture(): void {
    imeCompositionSaveGuard.handleCompositionStart();
    logRendererDebugEvent({
      level: "debug",
      event: "ime.composition.started",
      details: {
        editorIdKind: debugEditorIdKind(activeDocument?.id),
        hasPendingSave: imeCompositionSaveGuard.hasPendingSave(),
        hasScheduledSave: imeCompositionSaveGuard.hasScheduledSave()
      }
    });
  }

  function handleCompositionEndCapture(): void {
    imeCompositionSaveGuard.handleCompositionEnd((commandId) => {
      executeUiCommandRef.current(commandId);
    });
    logRendererDebugEvent({
      level: "debug",
      event: "ime.composition.ended",
      details: {
        editorIdKind: debugEditorIdKind(activeDocument?.id),
        hasPendingSave: imeCompositionSaveGuard.hasPendingSave(),
        hasScheduledSave: imeCompositionSaveGuard.hasScheduledSave()
      }
    });
  }

  function handleAppBlurCapture(
    event: ReactFocusEvent<HTMLElement>
  ): void {
    const nextTarget = event.relatedTarget;
    const hasRelatedTarget = nextTarget instanceof Node;
    const nextTargetInsideAppShell =
      hasRelatedTarget && event.currentTarget.contains(nextTarget);
    const willClearPendingSave = !hasRelatedTarget || !nextTargetInsideAppShell;

    if (
      imeCompositionSaveGuard.isComposing() ||
      imeCompositionSaveGuard.hasPendingSave() ||
      imeCompositionSaveGuard.hasScheduledSave()
    ) {
      logRendererDebugEvent({
        level: "debug",
        event: "ime.focus.checked",
        details: {
          hasRelatedTarget,
          nextTargetInsideAppShell,
          documentHasFocus: document.hasFocus(),
          willClearPendingSave
        }
      });
    }

    if (willClearPendingSave) {
      imeCompositionSaveGuard.clearPendingSave("focus_left_app_shell");
    }
  }

  /**
   * Shared instrumentation tail for every markdown document-open path
   * (#152 follow-up): File menu (`openFile`) and Workspace/File Explorer
   * (`activateProjectDocument`) both call this around the step that
   * actually creates/applies the editor, so `documentOpenId` generation
   * stays centralized (one factory) and this logging boundary is not
   * duplicated per caller. Each caller still logs its own
   * `document.open.started` beforehand, since what happens *before* this
   * point genuinely differs per path (see the two callers below).
   *
   * `openStartedAt` is the whole operation's start (used for `usable` /
   * `completed`'s total duration later, and for this function's own
   * `completed`/`failed` short-circuits). `editorDocument.applied.durationMs`
   * is measured separately, starting only once inside this function, right
   * before `performOpen()` — *not* from `openStartedAt` — so it never
   * includes time spent before this call (code-review fix: it previously
   * included OS file-chooser time on the File menu path). That means:
   *  - File menu: editor creation + state application only — content was
   *    already loaded by the separate, main-process-timed
   *    `document.open.fileRead.completed` before this runs.
   *  - Explorer: project document resolve/read (if not already open —
   *    `resolveCurrentEditor` returns instantly from cache when it is) +
   *    editor creation + state application, combined — the whole boundary
   *    available at this layer. The Explorer path does not get its own
   *    `fileRead.completed`-equivalent event: doing so would require
   *    threading `documentOpenId` through the generic
   *    `EditorNavigation`/`resolveEditor` adapter boundary shared with
   *    non-markdown (glossary entry) opens, which is the kind of larger
   *    architectural change #152 explicitly avoids. This is the closest
   *    honest boundary available without that change.
   */
  async function completeInstrumentedDocumentOpen(
    documentOpenId: string,
    openStartedAt: number,
    performOpen: () => Promise<boolean>
  ): Promise<boolean> {
    try {
      const applyStartedAt = performance.now();
      const opened = await performOpen();

      if (!opened) {
        // performOpen() completed without throwing but did not actually
        // apply an editor (e.g. the target was not found, or a newer open
        // superseded this one) — not a success, and not a thrown failure
        // either. Closes out document.open.started honestly instead of
        // leaving it dangling, without fabricating an applied/usable editor.
        logRendererDebugEvent({
          level: "debug",
          event: "document.open.completed",
          details: {
            documentOpenId,
            result: "ignored",
            durationMs: durationSincePerformanceMark(openStartedAt)
          }
        });

        return false;
      }

      logRendererDebugEvent({
        level: "debug",
        event: "document.open.editorDocument.applied",
        details: {
          documentOpenId,
          durationMs: durationSincePerformanceMark(applyStartedAt)
        }
      });

      // Cleared by handleDocumentOpenMeasured once MarkdownEditorSurface has
      // rendered this document and reported its preview-render duration.
      setDocumentOpenMeasurement({ documentOpenId, startedAt: openStartedAt });

      return true;
    } catch (error) {
      logRendererDebugEvent({
        level: "error",
        event: "document.open.failed",
        details: {
          documentOpenId,
          result: "failed",
          durationMs: durationSincePerformanceMark(openStartedAt),
          error: rendererDebugErrorInfo(error)
        }
      });

      throw error;
    }
  }

  async function openFile(): Promise<void> {
    if (isLifecycleCommitBarrierActiveNow()) {
      return;
    }

    const documentOpenId = nextDocumentOpenId();
    const startedAt = performance.now();

    logRendererDebugEvent({
      level: "debug",
      event: "document.open.started",
      details: {
        documentOpenId,
        documentKind: "file",
        editorKind: "markdown"
      }
    });

    let file: Awaited<ReturnType<typeof window.pergamum.files.openMarkdown>>;

    try {
      // The OS open-dialog and the actual file read happen together in one
      // IPC call; the main process logs document.open.failed itself for a
      // failure at this stage (see fileIpc.ts), so this catch only needs to
      // surface status — logging it again here would duplicate that event.
      file = await window.pergamum.files.openMarkdown(documentOpenId);
    } catch (error) {
      setStatus({
        key: "status.documentOpenFailed",
        values: { message: errorMessage(error, translate) }
      });
      await showFileOpenFailedDialog();
      return;
    }

    if (!file) {
      logRendererDebugEvent({
        level: "debug",
        event: "document.open.completed",
        details: {
          documentOpenId,
          result: "cancelled",
          durationMs: durationSincePerformanceMark(startedAt)
        }
      });
      setStatus({ key: "status.openCanceled" });
      return;
    }

    const openedDocument = currentDocumentForOpenedFile(
      file,
      project,
      activeProjectContext
    );

    // #266: notify on *open* of an external Markdown file (a project is open
    // and the picked file is outside its root, `kind === "file"`), but not
    // when the file is already open in a tab — that path only re-activates
    // the existing tab, and `Open ≠ Activate`. The dispatch happens after a
    // confirmed successful open, below.
    const openedEditorId = editorIdForCurrentDocument(
      openedDocument,
      activeProjectContext
    );
    const isNewExternalMarkdownOpen =
      openedDocument.kind === "file" &&
      project !== null &&
      (openedEditorId === null ||
        !hasOpenDocument(openDocumentsState, openedEditorId));

    try {
      const didOpen = await completeInstrumentedDocumentOpen(documentOpenId, startedAt, () =>
        openDocument(openedDocument)
      );

      setStatus({
        key: "status.openedFile",
        values: { name: openedDocument.name }
      });

      if (didOpen && isNewExternalMarkdownOpen) {
        notificationController.notify({
          message: translate("notification.externalMarkdownOpened")
        });
      }
    } catch (error) {
      setStatus({
        key: "status.documentOpenFailed",
        values: { message: errorMessage(error, translate) }
      });
    }
  }

  /**
   * Fired once by MarkdownEditorSurface after it has rendered the just-opened
   * document's preview (#152) — the closest practical point in this
   * architecture to "the Markdown editor pane can render" / "input can be
   * accepted", since content has already been pushed into the CodeMirror
   * view by the time this component's own effect runs (child effects fire
   * before parent effects). Ignored if it does not match the in-flight
   * measurement (e.g. a stale call after a newer open already started).
   *
   * `usableDurationMs` (also used for `document.open.completed`) is, by
   * construction, the cumulative time from `openStartedAt` to the moment
   * this parent passive effect fires (#154 follow-up) — i.e. it already
   * *is* the "MarkdownEditorSurface / parent passive effect" boundary. No
   * separate `document.open.markdownEditor.effect.completed` event is
   * needed: reading `usable`'s own `durationMs` answers that question.
   */
  function handleDocumentOpenMeasured(
    documentOpenId: string,
    previewRenderDurationMs: number,
    aggregateMetrics: DocumentOpenAggregateMetrics
  ): void {
    if (
      !documentOpenMeasurement ||
      documentOpenMeasurement.documentOpenId !== documentOpenId
    ) {
      return;
    }

    const usableDurationMs = durationSincePerformanceMark(
      documentOpenMeasurement.startedAt
    );

    logRendererDebugEvent({
      level: "debug",
      event: "document.open.previewRender.completed",
      details: {
        documentOpenId,
        durationMs: Math.round(previewRenderDurationMs)
      }
    });
    logRendererDebugEvent({
      level: "debug",
      event: "document.open.usable",
      details: { documentOpenId, durationMs: usableDurationMs }
    });
    // aggregateMetrics (#161) is attached only here, never to `usable` above
    // — it's a one-time snapshot for the whole open, not a per-boundary
    // measurement.
    logRendererDebugEvent({
      level: "debug",
      event: "document.open.completed",
      details: {
        documentOpenId,
        result: "succeeded",
        durationMs: usableDurationMs,
        ...aggregateMetrics
      }
    });

    setDocumentOpenMeasurement(null);
  }

  /**
   * Fired at most once per debounce window when the app window or the
   * editor/preview pane sizes change while a markdown document is open
   * (#162). Not part of the document-open measurement lifecycle (no
   * documentOpenId gating) — this reports layout changes that can happen
   * long after any open completed.
   */
  function handleViewportChanged(details: ViewportSizeDetails): void {
    logRendererDebugEvent({
      level: "debug",
      event: "layout.viewport.changed",
      details: { ...details }
    });
  }

  /**
   * Fired once by GlossaryPreviewDecorator (#154) immediately after it has
   * synchronously written the just-rendered preview HTML into the live DOM,
   * inside its own `useLayoutEffect` — the closest observable point to
   * "React committed this subtree and reflected it in the DOM" reachable
   * without instrumenting React internals. `durationMs` is measured from
   * `previewRenderStartedAt` (the same start boundary
   * `previewRender.completed` uses), so it also captures React's
   * reconciliation/commit/effect-scheduling gap, not just the DOM write
   * itself. Layout effects run before the browser paints, so this does NOT
   * guarantee paint has completed. Ignored if it does not match the
   * in-flight measurement (stale open, or a later open already superseded
   * it) — mirrors handleDocumentOpenMeasured's guard.
   */
  function handleDocumentOpenPreviewDomCommitted(
    documentOpenId: string,
    durationMs: number,
    previewNodeCount: number
  ): void {
    if (
      !documentOpenMeasurement ||
      documentOpenMeasurement.documentOpenId !== documentOpenId
    ) {
      return;
    }

    logRendererDebugEvent({
      level: "debug",
      event: "document.open.previewDom.committed",
      details: { documentOpenId, durationMs, previewNodeCount }
    });
  }

  /**
   * Fired once by GlossaryPreviewDecorator (#154) right after
   * `decoratePreviewContainer` (TreeWalker traversal + glossary mark
   * insertion) finishes for the just-opened document's preview.
   * `durationMs` is the decoration pass's own elapsed time — not cumulative
   * from document-open start — so it isolates glossary decoration cost from
   * the DOM-commit cost reported separately above. Ignored if it does not
   * match the in-flight measurement.
   */
  function handleDocumentOpenPreviewDecorationCompleted(
    documentOpenId: string,
    durationMs: number,
    visitedTextNodeCount: number,
    decoratedNodeCount: number,
    matchCount: number
  ): void {
    if (
      !documentOpenMeasurement ||
      documentOpenMeasurement.documentOpenId !== documentOpenId
    ) {
      return;
    }

    logRendererDebugEvent({
      level: "debug",
      event: "document.open.previewDecoration.completed",
      details: {
        documentOpenId,
        durationMs,
        visitedTextNodeCount,
        decoratedNodeCount,
        matchCount
      }
    });
  }

  /**
   * Fired once by MarkdownEditorSurface (#154 follow-up), from the same
   * closure as `previewRenderStartedAt` used for `previewRender.completed`
   * and `previewDom.committed`, right before `onDocumentOpenPreviewRendered`
   * in the same one-shot effect. `durationMs` is the cumulative time from
   * `openStartedAt` (this open's true start, not `applyStartedAt`) to that
   * render-start mark — i.e. it isolates the
   * "openStartedAt → previewRenderStartedAt" segment (file read / IPC /
   * editorDocument.applied / React's own scheduling delay to re-render with
   * the new content), which none of the other document-open events cover.
   * Ignored if it does not match the in-flight measurement.
   */
  function handleDocumentOpenPreviewRenderStarted(
    documentOpenId: string,
    previewRenderStartedAt: number
  ): void {
    if (
      !documentOpenMeasurement ||
      documentOpenMeasurement.documentOpenId !== documentOpenId
    ) {
      return;
    }

    logRendererDebugEvent({
      level: "debug",
      event: "document.open.previewRender.started",
      details: {
        documentOpenId,
        durationMs: Math.round(
          previewRenderStartedAt - documentOpenMeasurement.startedAt
        )
      }
    });
  }

  /**
   * Fired once by GlossaryPreviewDecorator (#154 follow-up), inside a
   * `requestAnimationFrame` callback scheduled right after glossary
   * decoration finishes — a proxy for "the browser reached its next
   * paint-adjacent frame boundary after this preview was decorated". Like
   * `previewDom.committed`, this does NOT guarantee the browser has actually
   * painted; `requestAnimationFrame` callbacks run just before a paint that
   * may occur, not after one is confirmed to have happened. `durationMs` is
   * this segment's own elapsed time (from right after decoration finished
   * to the callback firing), not cumulative from document-open start.
   *
   * Because the callback fires asynchronously, this event can legitimately
   * be logged after `usable`/`completed` for the same `documentOpenId` (the
   * passive effect that reports those often runs before the next animation
   * frame) — that relative ordering is itself part of what this event is
   * for (#154 follow-up question: is time lost before or after the frame
   * boundary?), so it is not treated as staleness. Genuine staleness — a
   * newer open superseding this one — is instead prevented at the source:
   * GlossaryPreviewDecorator cancels any pending frame request in its
   * effect cleanup whenever the preview content changes.
   */
  function handleDocumentOpenPreviewFrameObserved(
    documentOpenId: string,
    durationMs: number
  ): void {
    if (
      !documentOpenMeasurement ||
      documentOpenMeasurement.documentOpenId !== documentOpenId
    ) {
      return;
    }

    logRendererDebugEvent({
      level: "debug",
      event: "document.open.previewFrame.observed",
      details: { documentOpenId, durationMs }
    });
  }

  function replaceSavedDocument(
    documentId: EditorId,
    document: CurrentDocument
  ): boolean {
    const replacement = replaceOpenDocument(
      openDocumentsStateRef.current,
      documentId,
      document,
      activeProjectContext
    );

    openDocumentsStateRef.current = replacement.state;
    setOpenDocumentsState(replacement.state);

    return replacement.didCollide;
  }

  async function showFileOpenFailedDialog(): Promise<void> {
    await confirmDialog({
      title: translate("dialog.fileOpenFailed.title"),
      message: {
        kind: "plainText",
        text: translate("dialog.fileOpenFailed.message")
      },
      icon: {
        kind: "error",
        tooltip: translate("dialog.icon.error")
      },
      clipboardText: null,
      dismissOnBackdropClick: false,
      confirmLabel: translate("common.ok"),
      cancelLabel: null
    });
  }

  async function showFileSaveFailedDialog(): Promise<void> {
    await confirmDialog({
      title: translate("dialog.fileSaveFailed.title"),
      message: {
        kind: "plainText",
        text: translate("dialog.fileSaveFailed.message")
      },
      icon: {
        kind: "error",
        tooltip: translate("dialog.icon.error")
      },
      clipboardText: null,
      dismissOnBackdropClick: false,
      confirmLabel: translate("common.ok"),
      cancelLabel: null
    });
  }

  async function showGlossarySaveFailedDialog(): Promise<void> {
    await confirmDialog({
      title: translate("dialog.glossarySaveFailed.title"),
      message: {
        kind: "plainText",
        text: translate("dialog.glossarySaveFailed.message")
      },
      icon: {
        kind: "error",
        tooltip: translate("dialog.icon.error")
      },
      clipboardText: null,
      dismissOnBackdropClick: false,
      confirmLabel: translate("common.ok"),
      cancelLabel: null
    });
  }

  async function showProjectCloseFailedDialog(): Promise<void> {
    await confirmDialog({
      title: translate("dialog.projectCloseFailed.title"),
      message: {
        kind: "plainText",
        text: translate("dialog.projectCloseFailed.message")
      },
      icon: {
        kind: "error",
        tooltip: translate("dialog.icon.error")
      },
      clipboardText: null,
      dismissOnBackdropClick: false,
      confirmLabel: translate("common.ok"),
      cancelLabel: null
    });
  }

  /**
   * #272 (PO decision): Session automatic persistence has SUSPENDED because
   * the Session store could not be written. It MUST be presented to the
   * user as an Error dialog (not a NotificationToast, not a warning) — and
   * "presented", not merely "attempted". If another modal is open when the
   * suspension happens, the Error dialog is deferred and shown once that
   * modal closes. Exactly one Error dialog per ACTIVE → SUSPENDED
   * transition. Deliberately distinct from a Markdown document Save failure,
   * and it never touches editing / saving.
   *
   * `owed`  — a suspension Error dialog is due but not yet on screen.
   * `shown` — it has actually been presented (never present a second one).
   */
  const sessionPersistenceSuspendedDialogOwedRef = useRef(false);
  const sessionPersistenceSuspendedDialogShownRef = useRef(false);

  async function showSessionPersistenceSuspendedDialog(): Promise<void> {
    await confirmDialog({
      title: translate("dialog.sessionPersistenceSuspended.title"),
      message: {
        kind: "plainText",
        text: translate("dialog.sessionPersistenceSuspended.message")
      },
      icon: {
        kind: "error",
        tooltip: translate("dialog.icon.error")
      },
      clipboardText: null,
      dismissOnBackdropClick: false,
      confirmLabel: translate("common.ok"),
      cancelLabel: null
    });
  }

  function presentSessionPersistenceSuspendedDialogIfIdle(): void {
    if (
      !sessionPersistenceSuspendedDialogOwedRef.current ||
      sessionPersistenceSuspendedDialogShownRef.current
    ) {
      return;
    }

    // Another modal is open — wait. The dialog-controller subscription
    // effect calls this again when it closes.
    if (dialogController.getPendingRequest() !== null) {
      return;
    }

    sessionPersistenceSuspendedDialogOwedRef.current = false;
    sessionPersistenceSuspendedDialogShownRef.current = true;

    void showSessionPersistenceSuspendedDialog().catch(() => {
      // Could not present after all (a modal opened in the same tick).
      // Re-arm and try again when dialogs are next idle.
      sessionPersistenceSuspendedDialogShownRef.current = false;
      sessionPersistenceSuspendedDialogOwedRef.current = true;
    });
  }

  function handleSessionPersistenceSuspended(
    _reason: SessionStorageFailureReason
  ): void {
    if (
      sessionPersistenceSuspendedDialogShownRef.current ||
      sessionPersistenceSuspendedDialogOwedRef.current
    ) {
      return;
    }

    sessionPersistenceSuspendedDialogOwedRef.current = true;
    presentSessionPersistenceSuspendedDialogIfIdle();
  }
  sessionPersistenceSuspendedHandlerRef.current =
    handleSessionPersistenceSuspended;
  presentSessionPersistenceSuspendedDialogIfIdleRef.current =
    presentSessionPersistenceSuspendedDialogIfIdle;

  async function confirmReadOnlyProjectSaveAsInsideRoot(
    selectedPath: string
  ): Promise<boolean> {
    let result: AppChoiceDialogResult;

    try {
      result = await choiceDialog({
        title: translate("dialog.readOnlyProjectSaveAsInsideRoot.title"),
        message: {
          kind: "plainTextWithPathBlock",
          beforeText: translate(
            "dialog.readOnlyProjectSaveAsInsideRoot.message"
          ),
          pathBlock: {
            label: translate(
              "dialog.readOnlyProjectSaveAsInsideRoot.targetLabel"
            ),
            value: selectedPath
          },
          afterText: translate(
            "dialog.readOnlyProjectSaveAsInsideRoot.messageAfterTarget"
          )
        },
        icon: {
          kind: "warning",
          tooltip: translate("dialog.icon.warning")
        },
        choices: [
          {
            id: readOnlyProjectSaveAsChoiceIds.save,
            label: translate("dialog.readOnlyProjectSaveAsInsideRoot.save"),
            role: "primary"
          },
          {
            id: readOnlyProjectSaveAsChoiceIds.cancel,
            label: translate("common.cancel"),
            role: "cancel"
          }
        ],
        primaryChoiceId: readOnlyProjectSaveAsChoiceIds.save,
        cancelChoiceId: readOnlyProjectSaveAsChoiceIds.cancel,
        initialFocusChoiceId: readOnlyProjectSaveAsChoiceIds.cancel,
        clipboardText: null,
        dismissOnBackdropClick: false
      });
    } catch (error) {
      if (error instanceof AppDialogError && error.kind === "dialogAlreadyOpen") {
        return false;
      }

      throw error;
    }

    return (
      result.kind === "chosen" &&
      result.id === readOnlyProjectSaveAsChoiceIds.save
    );
  }

  async function showSaveAsRejectedDialog(
    reason: SaveMarkdownRejectedReason,
    targetPath: string
  ): Promise<void> {
    const titleKey =
      `dialog.saveAsRejected.${reason}.title` as TranslationKey;
    const messageKey =
      `dialog.saveAsRejected.${reason}.message` as TranslationKey;

    await confirmDialog({
      title: translate(titleKey),
      message: {
        kind: "plainTextWithPathBlock",
        beforeText: "",
        pathBlock: {
          label: translate("dialog.saveAsRejected.targetLabel"),
          value: targetPath
        },
        afterText: translate(messageKey)
      },
      icon: {
        kind: "error",
        tooltip: translate("dialog.icon.error")
      },
      clipboardText: null,
      dismissOnBackdropClick: false,
      confirmLabel: translate("common.close"),
      cancelLabel: null
    });
  }

  async function validateStandaloneSaveTargetForSaveAs(
    filePath: string
  ): Promise<StandaloneSaveTargetPolicyResult> {
    return validateStandaloneSaveTargetForSaveAsUi({
      filePath,
      currentProjectRootPath: project?.rootPath ?? null,
      isReadOnlyProject,
      platform: window.pergamum.platform
    });
  }

  async function selectStandaloneSaveTarget(
    documentToSave: CurrentDocument
  ): Promise<StandaloneSaveTargetSelection> {
    const selected = await window.pergamum.files.selectMarkdownSavePath(
      standaloneSavePath(documentToSave) ?? documentToSave.name
    );

    if (!selected) {
      return { kind: "cancelled", reason: "standalone_save_canceled" };
    }

    return { kind: "selected", path: selected.path };
  }

  async function saveGlossaryEntryByEditorId(
    editorId: EditorId
  ): Promise<SaveFileOutcome> {
    const editorIdKind = debugEditorIdKind(editorId);
    const targetOpenDocument = findOpenDocument(
      openDocumentsStateRef.current,
      editorId
    );

    if (!targetOpenDocument || targetOpenDocument.editor.kind !== "glossaryEntry") {
      logRendererDebugEvent({
        level: "debug",
        event: "save.skipped",
        details: {
          editorIdKind,
          operation: "save",
          result: "ignored",
          reason: "unsupported_editor"
        }
      });
      return "ignored";
    }

    const documentIdToSave = targetOpenDocument.id;
    const draftToSave = targetOpenDocument.editor.draft;

    if (!isGlossaryEntryDraftDirty(draftToSave)) {
      logRendererDebugEvent({
        level: "debug",
        event: "save.skipped",
        details: {
          editorIdKind,
          operation: "save",
          result: "ignored",
          reason: "glossary_not_dirty"
        }
      });
      return "ignored";
    }

    if (draftToSave.saveState === "saving") {
      logRendererDebugEvent({
        level: "debug",
        event: "save.skipped",
        details: {
          editorIdKind,
          operation: "save",
          result: "ignored",
          reason: "glossary_already_saving"
        }
      });
      return "ignored";
    }

    const projectGeneration =
      projectActivationLifetimeRef.current.captureProjectActivationGeneration();

    const savingState = updateOpenEditor(
      openDocumentsStateRef.current,
      documentIdToSave,
      (editor) =>
        editor.kind === "glossaryEntry"
          ? { ...editor, draft: markGlossaryEntryDraftSaving(editor.draft) }
          : editor
    );
    openDocumentsStateRef.current = savingState;
    setOpenDocumentsState(savingState);

    try {
      const savedEntry = await window.pergamum.glossary.update(
        glossaryEntryDraftUpdateInput(draftToSave)
      );

      if (
        !projectActivationLifetimeRef.current.isProjectActivationCurrent(
          projectGeneration
        )
      ) {
        logRendererDebugEvent({
          level: "debug",
          event: "save.skipped",
          details: {
            editorIdKind,
            operation: "save",
            result: "ignored",
            reason: "project_context_changed"
          }
        });
        return "ignored";
      }

      const savedState = updateOpenEditor(
        openDocumentsStateRef.current,
        documentIdToSave,
        (editor) =>
          editor.kind === "glossaryEntry"
            ? {
                ...editor,
                draft: applyGlossaryEntryDraftSaveResult(
                  editor.draft,
                  savedEntry
                )
              }
            : editor
      );
      openDocumentsStateRef.current = savedState;
      setOpenDocumentsState(savedState);
      setGlossaryRefreshToken((token) => token + 1);
      setStatus({
        key: "status.savedPath",
        values: { path: canonicalGlossarySurface(savedEntry) }
      });
      logRendererDebugEvent({
        level: "debug",
        event: "save.succeeded",
        details: {
          editorIdKind,
          operation: "save",
          result: "succeeded",
          saveTargetKind: "glossaryEntry"
        }
      });
      return "saved";
    } catch (error) {
      logRendererDebugEvent({
        level: "error",
        event: "save.failed",
        details: {
          editorIdKind,
          operation: "save",
          result: "failed",
          error: rendererDebugErrorInfo(error)
        }
      });
      if (
        !projectActivationLifetimeRef.current.isProjectActivationCurrent(
          projectGeneration
        )
      ) {
        logRendererDebugEvent({
          level: "debug",
          event: "save.skipped",
          details: {
            editorIdKind,
            operation: "save",
            result: "ignored",
            reason: "project_context_changed"
          }
        });
        return "ignored";
      }

      const failedState = updateOpenEditor(
        openDocumentsStateRef.current,
        documentIdToSave,
        (editor) =>
          editor.kind === "glossaryEntry"
            ? {
                ...editor,
                draft: markGlossaryEntryDraftSaveFailed(editor.draft)
              }
            : editor
      );
      openDocumentsStateRef.current = failedState;
      setOpenDocumentsState(failedState);
      setStatus({
        key: "status.saveFailed",
        values: { message: errorMessage(error, translate) }
      });
      await showGlossarySaveFailedDialog();
      return "failed";
    }
  }

  async function deleteActiveGlossaryEntry(): Promise<void> {
    if (isLifecycleCommitBarrierActiveNow()) {
      return;
    }

    if (activeDocument?.editor.kind !== "glossaryEntry") {
      return;
    }

    const documentIdToDelete = activeDocument.id;
    const entryIdToDelete = activeDocument.editor.draft.entry.id;
    const confirmMessage = translate(
      "glossaryEditor.deleteEntryConfirmMessage"
    );
    const projectGeneration =
      projectActivationLifetimeRef.current.captureProjectActivationGeneration();

    try {
      const result = await window.pergamum.glossary.delete(
        entryIdToDelete,
        confirmMessage
      );

      if (
        !projectActivationLifetimeRef.current.isProjectActivationCurrent(
          projectGeneration
        )
      ) {
        return;
      }

      if (!result.deleted) {
        return;
      }

      editorNavigation.invalidateEditor(documentIdToDelete);
      setOpenDocumentsState((state) =>
        closeOpenEditor(state, documentIdToDelete)
      );
      setGlossaryRefreshToken((token) => token + 1);
      setGlossaryOccurrenceTrackingState((state) =>
        state.kind === "active" && state.entryId === entryIdToDelete
          ? inactiveGlossaryOccurrenceTrackingState
          : state
      );
    } catch (error) {
      if (
        !projectActivationLifetimeRef.current.isProjectActivationCurrent(
          projectGeneration
        )
      ) {
        return;
      }

      setStatus({
        key: "status.commandFailed",
        values: { message: errorMessage(error, translate) }
      });
    }
  }

  function openUtilityWindowOnOccurrencesTab(): void {
    setLayout((current) => ({
      ...current,
      utilityWindow: {
        ...resolveUtilityWindowOpenState(
          current.utilityWindow,
          true,
          editorAreaBodyRef.current?.clientHeight
        ),
        activeTab: "occurrences"
      }
    }));
  }

  function selectUtilityWindowTab(tab: UtilityWindowTabId): void {
    setLayout((current) => ({
      ...current,
      utilityWindow: {
        ...current.utilityWindow,
        activeTab: tab
      }
    }));
  }

  async function navigateGlossaryOccurrence(
    entryId: GlossaryEntryId,
    direction: GlossaryOccurrenceDirection
  ): Promise<boolean> {
    if (
      activeDocument?.editor.kind !== "glossaryEntry" ||
      activeDocument.editor.draft.entry.id !== entryId
    ) {
      return false;
    }

    const entry = activeDocument.editor.draft.entry;
    const targetEditorId = lastActiveMarkdownEditorIdRef.current;
    const targetOpenDocument = targetEditorId
      ? findOpenDocument(openDocumentsState, targetEditorId)
      : null;
    const targetDocument =
      targetOpenDocument && targetOpenDocument.editor.kind === "markdown"
        ? {
            editorId: targetOpenDocument.id,
            content: currentDocumentContent(targetOpenDocument.editor.document)
          }
        : null;

    let outcome: GlossaryOccurrenceTrackingOutcome;

    try {
      outcome = startGlossaryOccurrenceTracking({
        currentSession: glossaryOccurrenceTrackingState,
        entry,
        entryLabel: canonicalGlossarySurface(entry),
        targetDocument,
        direction
      });
    } catch (error) {
      logRendererDebugEvent({
        level: "error",
        event: "glossary.occurrences.scan.failed",
        details: {
          editorIdKind: "glossaryEntry",
          operation: "scan",
          result: "failed",
          statusKey: "status.commandFailed",
          error: rendererDebugErrorInfo(error)
        }
      });
      setStatus({
        key: "status.commandFailed",
        values: { message: errorMessage(error, translate) }
      });
      return false;
    }

    switch (outcome.kind) {
      case "noTargetDocument":
        setStatus({ key: "status.glossaryOccurrenceNoActiveDocument" });
        return false;
      case "noOccurrences":
        setStatus({ key: "status.glossaryOccurrenceNotFound" });
        return false;
      case "tracking": {
        const didOpen = await editorNavigation.openEditor(
          outcome.session.targetMarkdownEditorId,
          { history: "skip" }
        );

        if (!didOpen) {
          setStatus({ key: "status.glossaryOccurrenceNoActiveDocument" });
          return false;
        }

        setGlossaryOccurrenceTrackingState(outcome.session);
        setPendingMarkdownSelection(outcome.range);
        openUtilityWindowOnOccurrencesTab();
        return true;
      }
    }
  }

  navigateGlossaryOccurrenceRef.current = navigateGlossaryOccurrence;

  function resolveGlossaryOccurrenceTrackingSessionContext(): ResolveGlossaryOccurrenceTrackingSessionContext {
    return {
      openDocumentsState,
      getGlossaryEntryById: window.pergamum.glossary.getById
    };
  }

  function applyGlossaryOccurrenceTrackingResolutionFailure(
    kind: Exclude<ResolveGlossaryOccurrenceTrackingSessionResult["kind"], "resolved">
  ): void {
    if (kind === "inactive") {
      return;
    }

    setGlossaryOccurrenceTrackingState(inactiveGlossaryOccurrenceTrackingState);
    setStatus({
      key:
        kind === "entryMissing"
          ? "status.glossaryOccurrenceEntryNotFound"
          : "status.glossaryOccurrenceNoActiveDocument"
    });
  }

  async function navigateGlossaryOccurrenceTrackingSession(
    direction: GlossaryOccurrenceDirection
  ): Promise<boolean> {
    const resolved = await resolveGlossaryOccurrenceTrackingSession(
      glossaryOccurrenceTrackingState,
      resolveGlossaryOccurrenceTrackingSessionContext()
    );

    if (resolved.kind !== "resolved") {
      applyGlossaryOccurrenceTrackingResolutionFailure(resolved.kind);
      return false;
    }

    let outcome: NavigateGlossaryOccurrenceTrackingOutcome;

    try {
      outcome = navigateGlossaryOccurrenceTracking({
        session: resolved.session,
        content: resolved.targetContent,
        direction
      });
    } catch (error) {
      logRendererDebugEvent({
        level: "error",
        event: "glossary.occurrences.scan.failed",
        details: {
          editorIdKind: resolved.session.targetMarkdownEditorId.kind,
          operation: "scan",
          result: "failed",
          statusKey: "status.commandFailed",
          error: rendererDebugErrorInfo(error)
        }
      });
      setStatus({
        key: "status.commandFailed",
        values: { message: errorMessage(error, translate) }
      });
      return false;
    }

    if (outcome.kind === "noOccurrences") {
      setGlossaryOccurrenceTrackingState(
        inactiveGlossaryOccurrenceTrackingState
      );
      setStatus({ key: "status.glossaryOccurrenceNotFound" });
      return false;
    }

    const didOpen = await editorNavigation.openEditor(
      outcome.session.targetMarkdownEditorId,
      { history: "skip" }
    );

    if (!didOpen) {
      setGlossaryOccurrenceTrackingState(
        inactiveGlossaryOccurrenceTrackingState
      );
      setStatus({ key: "status.glossaryOccurrenceNoActiveDocument" });
      return false;
    }

    setGlossaryOccurrenceTrackingState(outcome.session);
    setPendingMarkdownSelection(outcome.range);
    return true;
  }

  navigateGlossaryOccurrenceTrackingSessionRef.current =
    navigateGlossaryOccurrenceTrackingSession;

  async function openTrackedGlossaryEntry(): Promise<boolean> {
    const resolved = await resolveGlossaryOccurrenceTrackingSession(
      glossaryOccurrenceTrackingState,
      resolveGlossaryOccurrenceTrackingSessionContext()
    );

    if (resolved.kind !== "resolved") {
      applyGlossaryOccurrenceTrackingResolutionFailure(resolved.kind);
      return false;
    }

    const entryId = resolved.session.entryId;

    try {
      const didOpen = await commandRegistry.execute(
        glossaryCommandIds.openEntry,
        { source: "utilityWindow" },
        entryId
      );

      if (!didOpen) {
        setGlossaryOccurrenceTrackingState(
          inactiveGlossaryOccurrenceTrackingState
        );
        setStatus({ key: "status.glossaryOccurrenceEntryNotFound" });
      }

      return didOpen;
    } catch (error) {
      if (error instanceof CommandDisabledError) {
        return false;
      }

      setGlossaryOccurrenceTrackingState(
        inactiveGlossaryOccurrenceTrackingState
      );
      setStatus({
        key: "status.commandFailed",
        values: { message: errorMessage(error, translate) }
      });
      return false;
    }
  }

  openTrackedGlossaryEntryRef.current = openTrackedGlossaryEntry;

  function closeGlossaryOccurrenceTracking(): boolean {
    if (glossaryOccurrenceTrackingState.kind !== "active") {
      return false;
    }

    setGlossaryOccurrenceTrackingState(inactiveGlossaryOccurrenceTrackingState);
    return true;
  }

  closeGlossaryOccurrenceTrackingRef.current = closeGlossaryOccurrenceTracking;

  async function saveFile(
    options: SaveFileOptions = {}
  ): Promise<SaveFileOutcome> {
    if (isLifecycleCommitBarrierActiveNow()) {
      return "ignored";
    }

    const latestOpenDocumentsState = openDocumentsStateRef.current;
    const targetOpenDocument = options.editorId
      ? findOpenDocument(latestOpenDocumentsState, options.editorId)
      : activeDocument;
    const editorIdKind = debugEditorIdKind(
      targetOpenDocument?.id ?? options.editorId ?? activeDocument?.id
    );

    if (!targetOpenDocument || (!options.editorId && isSettingsTabActive)) {
      logRendererDebugEvent({
        level: "debug",
        event: "save.skipped",
        details: {
          editorIdKind,
          operation: "save",
          result: "ignored",
          reason: "unsupported_editor"
        }
      });
      return "ignored";
    }

    const targetEditor = targetOpenDocument.editor;
    const targetIsDirty = isCurrentEditorDirty(targetEditor);
    const targetCanSave =
      targetEditor.kind === "markdown"
        ? true
        : targetEditor.kind === "glossaryEntry" &&
          targetEditor.draft.saveState !== "saving" &&
          targetEditor.draft.canonicalSurface.trim().length > 0;

    logRendererDebugEvent({
      level: "debug",
      event: "save.requested",
      details: {
        editorIdKind,
        operation: "save",
        isDirty: targetIsDirty,
        canSave: options.forceSaveAs
          ? targetEditor.kind === "markdown"
          : targetCanSave
      }
    });

    const result = await saveInFlightGuard.run<SaveFileOutcome>(
      async () => {
        const saveTargetKind: DebugLogSaveTargetKind =
          targetEditor.kind === "markdown" &&
          (options.forceSaveAs ||
            !isProjectCurrentDocument(targetEditor.document))
            ? "standaloneMarkdown"
            : debugSaveTargetKind(targetEditor);

        logRendererDebugEvent({
          level: "debug",
          event: "save.started",
          details: {
            editorIdKind,
            operation: "save",
            saveTargetKind
          }
        });

        if (targetEditor.kind === "glossaryEntry") {
          if (options.forceSaveAs) {
            logRendererDebugEvent({
              level: "debug",
              event: "save.skipped",
              details: {
                editorIdKind,
                operation: "save",
                result: "ignored",
                reason: "unsupported_editor"
              }
            });
            return "ignored";
          }

          return saveGlossaryEntryByEditorId(targetOpenDocument.id);
        }

        try {
          if (targetEditor.kind !== "markdown") {
            logRendererDebugEvent({
              level: "debug",
              event: "save.skipped",
              details: {
                editorIdKind,
                operation: "save",
                result: "ignored",
                reason: "unsupported_editor"
              }
            });
            return "ignored";
          }

          const documentToSave = targetEditor.document;
          const documentIdToSave = targetOpenDocument.id;
          // #253: reconstruct the original (or newly-inherited) per-break
          // line endings from the tracked kinds before writing — the
          // canonical `content` itself is always CodeMirror's "\n"-only
          // normalized text (see lineEndingTracking.ts). This is the only
          // place a full-document line-ending pass happens on save; it
          // never runs per keystroke. Both the project and standalone save
          // branches below use this same serialized string, so the two
          // save paths share one line-ending semantics.
          const serializedContentToSave = serializeLineEndings(
            documentToSave.content,
            lineEndingBreakSetToArray(documentToSave.lineEndingBreaks)
          );

          if (
            isProjectCurrentDocument(documentToSave) &&
            options.forceSaveAs !== true
          ) {
            const savedProjectDocument =
              await window.pergamum.projects.saveProjectDocument(
                documentToSave.relativePath,
                serializedContentToSave
              );

            replaceSavedDocument(
              documentIdToSave,
              markCurrentDocumentSaved(documentToSave)
            );
            setStatus({
              key: "status.savedPath",
              values: { path: savedProjectDocument.relativePath }
            });
            logRendererDebugEvent({
              level: "debug",
              event: "save.succeeded",
              details: {
                editorIdKind,
                operation: "save",
                result: "succeeded",
                saveTargetKind: "projectDocument"
              }
            });
            return "saved";
          }

          const existingSavePath =
            options.forceSaveAs === true
              ? null
              : standaloneSavePath(documentToSave);
          let selectedSaveAsTargetPath: string | null = null;
          const savedStandaloneDocument = existingSavePath
            ? await window.pergamum.files.writeMarkdown(
                existingSavePath,
                serializedContentToSave
              )
            : await (async () => {
                const selectedTarget =
                  await selectStandaloneSaveTarget(documentToSave);

                if (selectedTarget.kind === "cancelled") {
                  setStatus({ key: "status.saveCanceled" });
                  logRendererDebugEvent({
                    level: "debug",
                    event: "save.skipped",
                    details: {
                      editorIdKind,
                      operation: "save",
                      result: "cancelled",
                      reason: selectedTarget.reason
                    }
                  });
                  return null;
                }

                selectedSaveAsTargetPath = selectedTarget.path;

                const targetPolicy =
                  await validateStandaloneSaveTargetForSaveAs(
                    selectedTarget.path
                  );

                if (targetPolicy.kind === "rejected") {
                  return targetPolicy;
                }

                if (
                  targetPolicy.requiresReadOnlyProjectConfirmation &&
                  !(await confirmReadOnlyProjectSaveAsInsideRoot(
                    selectedTarget.path
                  ))
                ) {
                  setStatus({ key: "status.saveCanceled" });
                  logRendererDebugEvent({
                    level: "debug",
                    event: "save.skipped",
                    details: {
                      editorIdKind,
                      operation: "save",
                      result: "cancelled",
                      reason: "standalone_save_canceled"
                    }
                  });
                  return null;
                }

                return window.pergamum.files.writeMarkdown(
                  selectedTarget.path,
                  serializedContentToSave
                );
              })();

          if (!savedStandaloneDocument) {
            return "cancelled";
          }

          if (savedStandaloneDocument.kind === "rejected") {
            const rejectedTargetPath =
              selectedSaveAsTargetPath ?? existingSavePath;

            if (rejectedTargetPath) {
              await showSaveAsRejectedDialog(
                savedStandaloneDocument.reason,
                rejectedTargetPath
              );
            }

            return "rejected";
          }

          const savedDocument = applyStandaloneSaveResult(
            documentToSave,
            savedStandaloneDocument
          );
          const didCollide = replaceSavedDocument(
            documentIdToSave,
            savedDocument
          );

          setStatus(
            didCollide
              ? {
                  key: "status.saveAsTargetAlreadyOpen",
                  values: { path: savedStandaloneDocument.path }
                }
              : {
                  key: "status.savedPath",
                  values: { path: savedDocument.name }
                }
          );
          logRendererDebugEvent({
            level: "debug",
            event: "save.succeeded",
            details: {
              editorIdKind,
              operation: "save",
              result: "succeeded",
              saveTargetKind: "standaloneMarkdown"
            }
          });
          return "saved";
        } catch (error) {
          logRendererDebugEvent({
            level: "error",
            event: "save.failed",
            details: {
              editorIdKind,
              operation: "save",
              result: "failed",
              error: rendererDebugErrorInfo(error)
            }
          });
          setStatus({
            key: "status.saveFailed",
            values: { message: errorMessage(error, translate) }
          });
          await showFileSaveFailedDialog();
          return "failed";
        }
      },
      () => {
        logRendererDebugEvent({
          level: "debug",
          event: "save.in_flight.ignored",
          details: {
            editorIdKind,
            operation: "save",
            result: "ignored"
          }
        });
      }
    );

    return result ?? "ignored";
  }

  async function readProjectDocument(
    document: ProjectDocument
  ): Promise<CurrentDocument> {
    const loadedDocument = await window.pergamum.projects.readProjectDocument(
      document.relativePath
    );

    return createProjectDocument(document, loadedDocument.content);
  }

  async function activateProject(
    openedProject: PergamumProject
  ): Promise<StatusMessage | null> {
    const activationToken =
      projectActivationLifetimeRef.current.startProjectContextSwitch();
    const openedProjectContext: ActiveProjectContext = {
      rootPath: openedProject.rootPath
    };

    editorNavigation.reset();
    lastActiveMarkdownEditorIdRef.current = null;
    setPendingMarkdownSelection(null);
    setGlossaryOccurrenceTrackingState(inactiveGlossaryOccurrenceTrackingState);
    setOpenDocumentsState((state) =>
      resetOpenDocumentsForProjectContextSwitch(state)
    );
    setProject(openedProject);

    if (openedProject.documents.length > 0) {
      const firstDocument = openedProject.documents[0];
      const firstCurrentDocument = await loadFirstProjectDocumentIfCurrent(
        projectActivationLifetimeRef.current,
        activationToken,
        () => readProjectDocument(firstDocument)
      );

      if (!firstCurrentDocument) {
        return null;
      }

      setOpenDocumentsState((state) =>
        openFirstProjectDocumentAfterContextSwitch(
          state,
          firstCurrentDocument,
          openedProjectContext
        )
      );

      return {
        key: "status.openedProjectDocument",
        values: {
          projectName: openedProject.name,
          relativePath: firstDocument.relativePath
        }
      };
    }

    return {
      key: "status.openedProject",
      values: {
        projectName: openedProject.name,
        count: openedProject.documents.length
      }
    };
  }

  async function resolveDirtyForLifecycle(
    intent:
      | "explicitProjectClose"
      | "ordinaryWindowClose"
      | "explicitApplicationQuit",
    targetName: string
  ): Promise<DirtyWorkingCopyResolutionResult> {
    return resolveDirtyWorkingCopies(intent, {
      getState: () => openDocumentsStateRef.current,
      translate,
      targetName,
      choiceDialog,
      saveDirtyWorkingCopy: (workingCopy: DirtyWorkingCopy) =>
        saveFile({ editorId: workingCopy.editorId }),
      enterCommitBarrier: enterLifecycleCommitBarrier
    });
  }

  function resetRendererProjectAfterExplicitClose(
    commitBarrierToken: LifecycleCommitBarrierToken
  ): void {
    if (!lifecycleCommitBarrierRef.current.isCurrent(commitBarrierToken)) {
      return;
    }

    projectCloseBarrierReleaseAfterCommitRef.current = commitBarrierToken;
    projectActivationLifetimeRef.current.startProjectContextSwitch();
    editorNavigation.reset();
    lastActiveMarkdownEditorIdRef.current = null;
    setPendingMarkdownSelection(null);
    setGlossaryOccurrenceTrackingState(inactiveGlossaryOccurrenceTrackingState);
    const nextOpenDocumentsState = removeProjectScopedOpenEditors(
      openDocumentsStateRef.current
    );
    openDocumentsStateRef.current = nextOpenDocumentsState;
    setOpenDocumentsState(nextOpenDocumentsState);
    setProject(null);
    setStatus({ key: "status.projectClosed" });
  }

  async function commitExplicitProjectClose(): Promise<boolean> {
    try {
      const result = await window.pergamum.projects.closeCurrentProject({
        requestId: createRendererLifecycleRequestId("explicitProjectClose"),
        intent: "explicitProjectClose"
      });

      if (result.status === "failed") {
        setStatus({
          key: "status.projectCloseFailed",
          values: { message: result.reason }
        });
        return false;
      }

      return true;
    } catch (error) {
      setStatus({
        key: "status.projectCloseFailed",
        values: { message: errorMessage(error, translate) }
      });
      return false;
    }
  }

  async function closeProject(): Promise<void> {
    if (
      !project ||
      lifecycleOperationInProgressRef.current ||
      isLifecycleCommitBarrierActiveNow()
    ) {
      return;
    }

    // #272 (review): explicit Project Close's durable commit boundary — see
    // runExplicitProjectCloseCommit. The post-close Session snapshot is made
    // durable (awaited) BEFORE the main-process Project Close runs, so
    // "Project Close SUCCESS ⇒ durable Session is post-close" always holds.
    // If the post-close Session cannot be persisted, the Project stays open.
    let shouldShowCloseFailedDialog = false;
    lifecycleOperationInProgressRef.current = true;
    try {
      const dirtyResolution = await resolveDirtyForLifecycle(
        "explicitProjectClose",
        project.name
      );

      if (
        dirtyResolution.status === "resolved" ||
        dirtyResolution.status === "discarded"
      ) {
        const commitBarrierToken = dirtyResolution.commitBarrierToken;
        // Built from CURRENT state — the Project is not closed yet.
        const preCloseSessionInputs = buildSessionSnapshotInputs(
          rendererSessionId,
          project,
          openDocumentsStateRef.current
        );
        const prospectivePostCloseSessionInputs = buildSessionSnapshotInputs(
          rendererSessionId,
          null,
          removeProjectScopedOpenEditors(openDocumentsStateRef.current)
        );

        const closeResult = await runExplicitProjectCloseCommit({
          commitPostCloseSession: () =>
            sessionPersistence.commitNow(prospectivePostCloseSessionInputs),
          closeProjectInMain: () => commitExplicitProjectClose(),
          rollbackSession: () =>
            sessionPersistence.commitNow(preCloseSessionInputs),
          applyRendererPostCloseState: () =>
            resetRendererProjectAfterExplicitClose(commitBarrierToken),
          exitCommitBarrier: () =>
            exitLifecycleCommitBarrier(commitBarrierToken)
        });

        switch (closeResult.status) {
          case "closed":
            break;
          case "sessionCommitFailed":
            setStatus({
              key: "status.projectCloseFailed",
              values: { message: errorMessage(closeResult.error, translate) }
            });
            // A storage-class session-commit failure has already SUSPENDED
            // Session persistence and shown the single suspension Error
            // dialog; do not stack the generic "could not close project"
            // dialog on top. Non-storage failures still get the generic
            // dialog. Either way, the Project is NOT closed.
            shouldShowCloseFailedDialog = !isSessionStorageFailure(
              closeResult.error
            );
            break;
          case "mainCloseFailed":
            // commitExplicitProjectClose already surfaced the main-close
            // reason; a rollback failure is more severe, so overwrite.
            if (!closeResult.rolledBack) {
              setStatus({
                key: "status.projectCloseFailed",
                values: {
                  message: errorMessage(closeResult.rollbackError, translate)
                }
              });
            }
            shouldShowCloseFailedDialog = true;
            break;
        }
      }
    } finally {
      lifecycleOperationInProgressRef.current = false;
    }

    if (shouldShowCloseFailedDialog) {
      await showProjectCloseFailedDialog();
    }
  }

  async function handleLifecycleWindowCloseRequest(
    request: LifecycleWindowCloseRequest
  ): Promise<void> {
    let decision: LifecycleCloseDecision;
    let commitBarrierToken: LifecycleCommitBarrierToken | null = null;

    if (lifecycleOperationInProgressRef.current) {
      decision = { status: "cancelled", requestId: request.requestId };
    } else {
      lifecycleOperationInProgressRef.current = true;
      try {
        const dirtyResolution = await resolveDirtyForLifecycle(
          request.intent,
          "Pergamum"
        );

        if (
          dirtyResolution.status === "resolved" ||
          dirtyResolution.status === "discarded"
        ) {
          commitBarrierToken = dirtyResolution.commitBarrierToken;

          if (request.isFinalWindow) {
            // #272: the final window close keeps this Session in the restore
            // set; a best-effort flush is enough (durability is continuous).
            void sessionPersistence.flushNow();
            decision = { status: "approved", requestId: request.requestId };
          } else {
            // #272 (review Blocker 5): an ordinary non-final window close
            // removes this Session from the future restore set. That removal
            // MUST be durable before we approve the close — otherwise a
            // manifest write failure would let the closed Session revive on
            // next launch. On failure, decline the close (safe: the window
            // stays open, the user can retry).
            try {
              await sessionPersistence.dropFromRestoreSet();
              decision = { status: "approved", requestId: request.requestId };
            } catch {
              exitLifecycleCommitBarrier(commitBarrierToken);
              commitBarrierToken = null;
              decision = { status: "cancelled", requestId: request.requestId };
            }
          }
        } else {
          decision = { status: "cancelled", requestId: request.requestId };
        }
      } catch {
        decision = {
          status: "failed",
          requestId: request.requestId,
          reason: "dirtyResolutionFailed"
        };
      } finally {
        lifecycleOperationInProgressRef.current = false;
      }
    }

    try {
      await window.pergamum.lifecycle.respondWindowCloseRequest(decision);
    } catch (error) {
      if (commitBarrierToken) {
        exitLifecycleCommitBarrier(commitBarrierToken);
      }

      throw error;
    }
  }

  async function quitApplication(): Promise<void> {
    if (lifecycleOperationInProgressRef.current) {
      return;
    }

    lifecycleOperationInProgressRef.current = true;
    try {
      const dirtyResolution = await resolveDirtyForLifecycle(
        "explicitApplicationQuit",
        "Pergamum"
      );

      if (
        dirtyResolution.status !== "resolved" &&
        dirtyResolution.status !== "discarded"
      ) {
        return;
      }

      const commitBarrierToken = dirtyResolution.commitBarrierToken;

      // #272: explicitApplicationQuit keeps the restore set; a best-effort
      // flush is an optimization, never a correctness dependency.
      void sessionPersistence.flushNow();

      try {
        await window.pergamum.lifecycle.quitApplication({
          requestId: createRendererLifecycleRequestId("explicitApplicationQuit"),
          intent: "explicitApplicationQuit"
        });
      } catch (error) {
        exitLifecycleCommitBarrier(commitBarrierToken);
        throw error;
      }
    } catch (error) {
      setStatus({
        key: "status.quitFailed",
        values: { message: errorMessage(error, translate) }
      });
    } finally {
      lifecycleOperationInProgressRef.current = false;
    }
  }

  async function reloadSettingsAfterProjectOpen(): Promise<StatusMessage | null> {
    try {
      await reloadSettings();
      return null;
    } catch (error) {
      return {
        key: "status.settingsReloadFailed",
        values: { message: errorMessage(error, translate) }
      };
    }
  }

  async function createProject(): Promise<void> {
    if (isLifecycleCommitBarrierActiveNow()) {
      return;
    }

    if (!(await confirmProjectSwitch())) {
      setStatus({ key: "status.openProjectCanceled" });
      return;
    }

    try {
      const createdProject = await resolveProjectOpenResult(
        await window.pergamum.projects.createProject()
      );

      if (!createdProject) {
        setStatus({ key: "status.openProjectCanceled" });
        return;
      }

      const settingsReloadError = await reloadSettingsAfterProjectOpen();
      const openedStatus = await activateProject(createdProject);

      if (!openedStatus) {
        return;
      }

      setStatus(projectOpenStatus(openedStatus, settingsReloadError, translate));
    } catch (error) {
      setStatus({
        key: "status.projectOpenFailed",
        values: { message: errorMessage(error, translate) }
      });
    }
  }

  async function openProject(): Promise<void> {
    if (isLifecycleCommitBarrierActiveNow()) {
      return;
    }

    if (!(await confirmProjectSwitch())) {
      setStatus({ key: "status.openProjectCanceled" });
      return;
    }

    try {
      const openedProject = await resolveProjectOpenResult(
        await window.pergamum.projects.openProject()
      );

      if (!openedProject) {
        setStatus({ key: "status.openProjectCanceled" });
        return;
      }

      const settingsReloadError = await reloadSettingsAfterProjectOpen();
      const openedStatus = await activateProject(openedProject);

      if (!openedStatus) {
        return;
      }

      setStatus(projectOpenStatus(openedStatus, settingsReloadError, translate));
    } catch (error) {
      setStatus({
        key: "status.projectOpenFailed",
        values: { message: errorMessage(error, translate) }
      });
    }
  }

  async function openStartupProject(): Promise<void> {
    try {
      const startupProjectOpenResult =
        await window.pergamum.projects.openStartupProject();

      if (startupProjectOpenResult.kind === "noStartupProjectOpen") {
        return;
      }

      if (startupProjectOpenResult.kind === "startupProjectOpenFailed") {
        setStatus({
          key: "status.projectOpenFailed",
          values: { message: startupProjectOpenResult.message }
        });
        return;
      }

      const openedProject = await resolveProjectOpenResult(
        startupProjectOpenResult.result
      );

      if (!openedProject) {
        setStatus({ key: "status.openProjectCanceled" });
        return;
      }

      const settingsReloadError = await reloadSettingsAfterProjectOpen();
      const openedStatus = await activateProject(openedProject);

      if (!openedStatus) {
        return;
      }

      setStatus(projectOpenStatus(openedStatus, settingsReloadError, translate));
    } catch (error) {
      setStatus({
        key: "status.projectOpenFailed",
        values: { message: errorMessage(error, translate) }
      });
    }
  }

  async function openRecentProject(projectFilePath: string): Promise<void> {
    if (isLifecycleCommitBarrierActiveNow()) {
      return;
    }

    if (!(await confirmProjectSwitch())) {
      setStatus({ key: "status.openProjectCanceled" });
      return;
    }

    try {
      const openedProject = await resolveProjectOpenResult(
        await window.pergamum.projects.openRecentProject(projectFilePath)
      );

      if (!openedProject) {
        setStatus({ key: "status.openProjectCanceled" });
        return;
      }

      const settingsReloadError = await reloadSettingsAfterProjectOpen();
      const openedStatus = await activateProject(openedProject);

      if (!openedStatus) {
        return;
      }

      setIsRecentProjectsOpen(false);
      setStatus(projectOpenStatus(openedStatus, settingsReloadError, translate));
    } catch (error) {
      setStatus({
        key: "status.recentProjectOpenFailed",
        values: { message: errorMessage(error, translate) }
      });
    }
  }

  // #274: pure "put this Error dialog on screen" helpers. Owed/shown
  // bookkeeping and the idle-boundary sequencing live in
  // `presentOwedRestoreDialogsIfIdle` below, mirroring the #272 SUSPENDED
  // persistence dialog.
  function showSessionRestoreUnavailableDialog(): Promise<void> {
    return confirmDialog({
      title: translate("dialog.sessionRestoreUnavailable.title"),
      message: {
        kind: "plainText",
        text: translate("dialog.sessionRestoreUnavailable.message")
      },
      icon: { kind: "error", tooltip: translate("dialog.icon.error") },
      clipboardText: null,
      dismissOnBackdropClick: false,
      confirmLabel: translate("common.ok"),
      cancelLabel: null
    }).then(() => undefined);
  }

  function showProjectRestoreFailedDialog(): Promise<void> {
    return confirmDialog({
      title: translate("dialog.projectRestoreFailed.title"),
      message: {
        kind: "plainText",
        text: translate("dialog.projectRestoreFailed.message")
      },
      icon: { kind: "error", tooltip: translate("dialog.icon.error") },
      clipboardText: null,
      dismissOnBackdropClick: false,
      confirmLabel: translate("common.ok"),
      cancelLabel: null
    }).then(() => undefined);
  }

  // #274: re-drive the deferred restore-Error queue. Presents at most one
  // owed-and-unshown Error, only once the cold-start sequence is ready AND
  // the dialog controller is idle; a rejected presentation
  // (`dialogAlreadyOpen`, race) re-arms `owed` inside the queue. Safe to
  // call repeatedly (dialog-controller subscription, post-restore boundary).
  function pumpDeferredRestoreErrorDialogs(): void {
    deferredRestoreErrorDialogs.pump({
      isDialogPending: () => dialogController.getPendingRequest() !== null,
      present: (id) =>
        id === "restoreUnavailable"
          ? showSessionRestoreUnavailableDialog()
          : showProjectRestoreFailedDialog()
    });
  }
  pumpDeferredRestoreErrorDialogsRef.current = pumpDeferredRestoreErrorDialogs;

  // #274: apply the assembled restored working environment. Bypasses the
  // ordinary project-activation path (no "first document auto-open"). Only
  // touches stable setState / refs, so it is safe to call from the
  // cold-start closure.
  function applyRestoredEnvironment(env: {
    readonly project: PergamumProject | null;
    readonly openDocuments: OpenDocumentsState;
    readonly pendingViewStates: ReadonlyMap<string, unknown>;
  }): void {
    editorNavigation.reset();
    projectActivationLifetimeRef.current.startProjectContextSwitch();
    projectActivationLifetimeRef.current.markExplicitEditorActivation();
    lastActiveMarkdownEditorIdRef.current = null;
    setPendingMarkdownSelection(null);
    setGlossaryOccurrenceTrackingState(
      inactiveGlossaryOccurrenceTrackingState
    );
    pendingRestoreViewStatesRef.current = new Map(env.pendingViewStates);
    setPendingRestoreViewStateVersion((version) => version + 1);
    setProject(env.project);
    openDocumentsStateRef.current = env.openDocuments;
    setOpenDocumentsState(env.openDocuments);
  }

  async function openStandaloneMarkdownByPathForRestore(
    filePath: string
  ): Promise<void> {
    try {
      const file = await window.pergamum.files.readMarkdownFile(filePath);

      await openDocument(createFileDocument(file));
    } catch (error) {
      setStatus({
        key: "status.documentOpenFailed",
        values: { message: errorMessage(error, translate) }
      });
    }
  }

  // #274: route a Markdown launch target into the (now committed) restored
  // working environment. Runs from a follow-up effect so `project` /
  // `activeProjectContext` / the EditorNavigation adapter are all fresh.
  async function routeMarkdownLaunchTargetNow(filePath: string): Promise<void> {
    const scope = decideMarkdownScope({
      markdownPath: filePath,
      projectRootPath: project?.rootPath ?? null,
      platform: window.pergamum.platform
    });

    if (scope === "insideProject" && project && activeProjectContext) {
      const editorId = createEditorIdForPath(filePath, activeProjectContext);

      if (
        editorId.kind === "projectDocument" &&
        project.documents.some(
          (document) => document.relativePath === editorId.relativePath
        )
      ) {
        if (findOpenDocument(openDocumentsState, editorId)) {
          openEditorFromUi(editorId);
        } else {
          await activateProjectDocument(editorId.relativePath);
        }

        return;
      }
    }

    // Ambiguous / outside the restored Project scope → standalone.
    await openStandaloneMarkdownByPathForRestore(filePath);
  }

  const coldStartRestoreDeps: ColdStartRestoreDeps = {
    platform: window.pergamum.platform,
    getColdStartRestore: () => window.pergamum.session.getColdStartRestore(),
    openProjectByFilePath: (projectFilePath, expectedProjectId) =>
      window.pergamum.projects.openProjectByFilePath(
        projectFilePath,
        expectedProjectId
      ),
    resolveProjectOpenResult: (result) => resolveProjectOpenResult(result),
    reloadSettingsAfterProjectOpen: async () => {
      await reloadSettingsAfterProjectOpen();
    },
    openLaunchTargetProjectNormally: async () => {
      await openStartupProject();
      return null;
    },
    readProjectDocumentContent: async (relativePath) =>
      (await window.pergamum.projects.readProjectDocument(relativePath)).content,
    readMarkdownFile: (filePath) =>
      window.pergamum.files.readMarkdownFile(filePath),
    getGlossaryEntryById: (entryId) =>
      window.pergamum.glossary.getById(entryId),
    applyRestoredEnvironment: (env) => applyRestoredEnvironment(env),
    adoptSessionId: (sessionId) => {
      setRendererSessionId(sessionId);
      sessionPersistence.adoptSessionId(sessionId);
    },
    finishColdStart: (sessionWasRestored) => {
      sessionPersistence.resolveColdStartRestore({
        scheduleNow: !sessionWasRestored
      });
    },
    routeMarkdownLaunchTarget: (filePath) => {
      setPendingMarkdownLaunchTargetForRestore(filePath);
    },
    // #274: arm the Error as owed only. Presentation is deferred to an idle
    // boundary so it never collides with a launch-routing modal (e.g. a
    // read-only-project confirmation from the `.pergamum` ordinary open).
    notifyRestoreUnavailable: (_reason: RestoreUnavailableReason) => {
      deferredRestoreErrorDialogs.arm("restoreUnavailable");
    },
    notifyProjectRestoreFailed: () => {
      deferredRestoreErrorDialogs.arm("projectRestoreFailed");
    },
    notifyEditorSkipped: (resourceName) => {
      notificationController.notify({
        message: translate("notification.sessionRestore.editorSkipped", {
          name: resourceName
        })
      });
    }
  };

  useEffect(() => {
    if (isSettingsLoading || coldStartRestoreAttemptedRef.current) {
      return;
    }

    coldStartRestoreAttemptedRef.current = true;
    void runColdStartRestore(coldStartRestoreDeps)
      .catch((error) => {
        // The restore sequence is best-effort; a failure here must never
        // block startup. Release the held persistence so continuous #272
        // persistence resumes normally.
        sessionPersistence.resolveColdStartRestore({ scheduleNow: true });
        logRendererDebugEvent({
          level: "error",
          event: "command.failed",
          details: {
            commandId: "session.coldStartRestore",
            operation: "unknown",
            result: "failed",
            statusKey: "status.commandFailed",
            error: rendererDebugErrorInfo(error)
          }
        });
      })
      .finally(() => {
        // #274: the restore sequence (incl. launch routing / any read-only
        // confirmation) has settled — now present any owed restore Error
        // dialog. If a modal is still open it stays owed; the
        // dialog-controller subscription retries when things go idle.
        deferredRestoreErrorDialogs.markReady();
        pumpDeferredRestoreErrorDialogsRef.current();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSettingsLoading]);

  useEffect(() => {
    if (pendingMarkdownLaunchTargetForRestore === null) {
      return;
    }

    const filePath = pendingMarkdownLaunchTargetForRestore;
    setPendingMarkdownLaunchTargetForRestore(null);
    void routeMarkdownLaunchTargetNow(filePath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMarkdownLaunchTargetForRestore]);

  createProjectCommandRef.current = createProject;
  openProjectCommandRef.current = openProject;
  closeProjectCommandRef.current = closeProject;
  quitApplicationCommandRef.current = quitApplication;
  openAboutDialogCommandRef.current = openAboutDialog;
  handleLifecycleWindowCloseRequestRef.current =
    handleLifecycleWindowCloseRequest;
  showLineEndingDistributionCommandRef.current =
    openLineEndingDistributionDialog;
  insertParagraphIndentCommandRef.current = () =>
    applyParagraphIndentOperation("insert");
  removeParagraphIndentCommandRef.current = () =>
    applyParagraphIndentOperation("remove");
  openMarkdownDocumentCommandRef.current = openFile;
  saveCurrentDocumentCommandRef.current = async () => {
    await saveFile();
  };
  saveCurrentDocumentAsCommandRef.current = async () => {
    await saveFile({ forceSaveAs: true });
  };
  closeEditorCommandRef.current = closeEditorWithConfirmation;
  canCloseEditorCommandRef.current = canCloseEditorNow;
  toggleRecentProjectsCommandRef.current = () => {
    setIsRecentProjectsOpen((isOpen) => !isOpen);
  };
  canSaveCurrentDocumentCommandRef.current = () => canSave;
  canSaveCurrentDocumentAsCommandRef.current = () => canSaveAs;
  goToLineCommandRef.current = (line) => {
    if (currentEditor?.kind !== "markdown") {
      return;
    }

    if (isSettingsTabActive) {
      return;
    }

    const offset = documentLineStartOffset(
      currentDocumentContent(currentEditor.document),
      line
    );

    if (offset === null) {
      // Out of range: command-body validation (#148), not registry
      // enablement — command.invoked has already fired by the time
      // execute() reaches here; this just silently does not navigate.
      return;
    }

    setPendingMarkdownSelection({ start: offset, end: offset });
  };
  // Palette-display-only data for line jump candidate generation (#148):
  // lazily split (see createLineJumpEditorSnapshot), so it costs nothing on
  // renders where the Palette isn't open in line mode.
  const lineJumpEditorSnapshot =
    !isSettingsTabActive && currentEditor?.kind === "markdown"
      ? createLineJumpEditorSnapshot(
          currentDocumentContent(currentEditor.document)
        )
      : null;

  async function activateProjectDocument(relativePath: string): Promise<void> {
    if (isLifecycleCommitBarrierActiveNow()) {
      return;
    }

    const document = project?.documents.find(
      (projectDocument) => projectDocument.relativePath === relativePath
    );

    if (!document) {
      setStatus({ key: "status.projectDocumentNotFound" });
      return;
    }

    // Workspace/File Explorer pane open path (#152 follow-up). Unlike
    // openFile(), there is no OS dialog step, so document.open.started can
    // fire immediately — this path's "started" therefore does not carry
    // any dialog-interaction time the way the File menu path's does.
    const documentOpenId = nextDocumentOpenId();
    const startedAt = performance.now();

    logRendererDebugEvent({
      level: "debug",
      event: "document.open.started",
      details: {
        documentOpenId,
        documentKind: "project",
        editorKind: "markdown"
      }
    });

    try {
      const documentId = createProjectDocumentEditorId(
        document.relativePath,
        activeProjectContext
      );

      const didOpen = await completeInstrumentedDocumentOpen(
        documentOpenId,
        startedAt,
        () => openEditorFromExplicitActivation(documentId)
      );

      setStatus(
        didOpen
          ? {
              key: "status.openedProjectDocumentOnly",
              values: { relativePath: document.relativePath }
            }
          : { key: "status.projectDocumentNotFound" }
      );
    } catch (error) {
      setStatus({
        key: "status.documentOpenFailed",
        values: { message: errorMessage(error, translate) }
      });
      await showFileOpenFailedDialog();
    }
  }

  async function changeSettings(
    nextSettings: SaveApplicationSettingsRequest
  ): Promise<void> {
    try {
      await saveSettings(nextSettings);
      setStatus({ key: "status.settingsSaved" });
    } catch (error) {
      setStatus({
        key: "status.settingsSaveFailed",
        values: { message: errorMessage(error, translate) }
      });
    }
  }

  return (
    <main
      className="appShell"
      onCompositionStartCapture={handleCompositionStartCapture}
      onCompositionEndCapture={handleCompositionEndCapture}
      onBlurCapture={handleAppBlurCapture}
      onContextMenuCapture={handleContextMenuCapture}
    >
      <header className="toolbar">
        <div className="documentTitle">
          <span>
            {isSettingsTabActive
              ? translate("settings.application.title")
              : currentEditor
                ? currentEditorTitle(currentEditor)
                : ""}
          </span>
          {!isSettingsTabActive && isDirty ? (
            <span className="dirtyIndicator">
              {translate("document.unsaved")}
            </span>
          ) : null}
          {project ? (
            <span className="projectName">
              {translate("project.label", { name: project.name })}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() =>
            executeUiCommand(applicationCommandIds.openProject, {
              source: "toolbar"
            })
          }
        >
          {translate("toolbar.openProject")}
        </button>
        <button
          type="button"
          onClick={() =>
            executeUiCommand(editorCommandIds.openMarkdownDocument, {
              source: "toolbar"
            })
          }
        >
          {translate("common.open")}
        </button>
        <button
          type="button"
          onClick={() =>
            executeUiCommand(editorCommandIds.saveDocument, {
              source: "toolbar"
            })
          }
          disabled={
            !commandRegistry.isEnabledForContext(
              editorCommandIds.saveDocument,
              commandContext
            )
          }
        >
          {translate("common.save")}
        </button>
        <button
          type="button"
          onClick={() =>
            executeUiCommand(applicationCommandIds.toggleRecentProjects, {
              source: "toolbar"
            })
          }
        >
          {translate("toolbar.recentProjects")}
        </button>
      </header>

      <section className="appBody">
        <ActivityBar
          activeMode={activeActivityMode}
          isApplicationSettingsActive={isSettingsTabActive}
          translate={translate}
          onSelectMode={handleActivityBarModeClick}
          onOpenApplicationSettings={() =>
            executeUiCommand(workspaceCommandIds.openApplicationSettings, {
              source: "activityBar"
            })
          }
        />

        <section className="appContent">
          {isRecentProjectsOpen ? (
            <RecentProjectsPanel
              recentProjects={settings.recentProjects}
              translate={translate}
              onOpenProject={(projectFilePath) => {
                void openRecentProject(projectFilePath);
              }}
            />
          ) : null}

          {shouldShowWelcome ? (
            <WelcomeScreen
              recentProjects={settings.recentProjects}
              translate={translate}
              onCreateProject={() => {
                void createProject();
              }}
              onOpenProject={() => {
                void openProject();
              }}
              onOpenRecentProject={(projectFilePath) => {
                void openRecentProject(projectFilePath);
              }}
            />
          ) : (
            <section className="mainArea" ref={mainAreaRef}>
              {!layout.sidebar.collapsed ? (
                <>
                  <div
                    className="workbenchSidebar"
                    style={{ width: layout.sidebar.width }}
                  >
                    <WorkspaceSidebar
                      mode={sidebarMode}
                      project={project}
                      highlightedProjectDocumentRelativePath={
                        currentEditor
                          ? currentEditorProjectRelativePath(currentEditor)
                          : null
                      }
                      highlightedGlossaryEntryId={
                        currentEditor
                          ? currentEditorGlossaryEntryId(currentEditor)
                          : null
                      }
                      glossaryRefreshToken={glossaryRefreshToken}
                      translate={translate}
                      onActivateProjectDocument={(relativePath) => {
                        void activateProjectDocument(relativePath);
                      }}
                      onActivateGlossaryEntry={(entryId) => {
                        executeUiCommand(
                          glossaryCommandIds.openEntry,
                          { source: "workspaceSidebar" },
                          entryId
                        );
                      }}
                      onCreateGlossaryEntry={createGlossaryEntryFromSidebar}
                    />
                  </div>
                  <div
                    className="workbenchSidebarResizeHandle"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={translate("workbench.sidebarResizeHandle")}
                    onPointerDown={sidebarResizeDrag.onPointerDown}
                    onPointerMove={sidebarResizeDrag.onPointerMove}
                    onPointerUp={sidebarResizeDrag.onPointerUp}
                    onPointerCancel={sidebarResizeDrag.onPointerCancel}
                  />
                </>
              ) : null}

              <section className="editorArea">
                <DocumentTabBar
                  tabs={tabs}
                  activeDocumentId={openDocumentsState.activeDocumentId}
                  projectAccessMode={project?.accessMode ?? null}
                  activeWorkspaceTabId={activeWorkspaceTabId}
                  specialTabs={specialTabs}
                  translate={translate}
                  onSelectDocument={activateDocument}
                  onCloseDocument={(documentId) =>
                    executeUiCommand(
                      editorCommandIds.close,
                      { source: "documentTabBar" },
                      { editorId: documentId }
                    )
                  }
                  onSelectSpecialTab={activateSpecialTab}
                  onCloseSpecialTab={closeSpecialTab}
                  isUtilityWindowOpen={layout.utilityWindow.open}
                  onToggleUtilityWindow={() =>
                    executeUiCommand(utilityWindowCommandIds.toggle, {
                      source: "documentTabBar"
                    })
                  }
                />

                <section className="editorAreaBody" ref={editorAreaBodyRef}>
                  {isSettingsTabActive ? (
                    <SettingsPanel
                      settings={settings}
                      isLoading={isSettingsLoading}
                      error={settingsError}
                      translate={translate}
                      onChangeSettings={(nextSettings) => {
                        void changeSettings(nextSettings);
                      }}
                    />
                  ) : activeDocument ? (
                    <>
                      <EditorSurface
                        editor={activeDocument.editor}
                        activeDocumentKey={serializeEditorId(
                          activeDocument.id
                        )}
                        previewUpdateDelayMs={
                          effectiveSettings.preview.updateDelayMs
                        }
                        newFileLineEndingFallback={
                          effectiveSettings.files.newFile.lineEnding
                        }
                        expectedLineEnding={
                          effectiveSettings.editor.lineEnding.expected
                        }
                        markerGlyph={
                          effectiveSettings.editor.lineEnding.markerGlyph
                        }
                        projectRootPath={project?.rootPath ?? null}
                        glossaryRefreshToken={glossaryRefreshToken}
                        translate={translate}
                        soundFeedback={soundFeedback}
                        soundSettings={effectiveSettings.workbench.sound}
                        isProjectOwnedReadOnly={isEditorReadOnly}
                        markdownEditorPreviewRatio={
                          layout.markdownEditorPreview.ratio
                        }
                        onChangeMarkdownEditorPreviewRatio={
                          handleChangeMarkdownEditorPreviewRatio
                        }
                        onChangeMarkdownContent={setActiveDocumentContent}
                        onParagraphIndentControllerChange={
                          handleParagraphIndentControllerChange
                        }
                        onViewStateControllerChange={
                          handleMarkdownEditorViewStateControllerChange
                        }
                        onViewStateSnapshot={handleMarkdownViewStateSnapshot}
                        onViewStateDirty={handleMarkdownViewStateDirty}
                        restoreActiveEditorViewState={
                          restoreActiveEditorViewState
                        }
                        onRestoreActiveEditorViewStateApplied={
                          handleRestoreActiveEditorViewStateApplied
                        }
                        onChangeGlossaryEntryKind={setActiveGlossaryEntryKind}
                        onChangeGlossaryEntryDescription={
                          setActiveGlossaryEntryDescription
                        }
                        onChangeGlossaryEntryCanonicalSurface={
                          setActiveGlossaryEntryCanonicalSurface
                        }
                        onChangeGlossaryEntryCanonicalMatchBoundaryStart={
                          setActiveGlossaryEntryCanonicalMatchBoundaryStart
                        }
                        onChangeGlossaryEntryCanonicalMatchBoundaryEnd={
                          setActiveGlossaryEntryCanonicalMatchBoundaryEnd
                        }
                        onAddGlossaryEntryForm={addActiveGlossaryEntryForm}
                        onChangeGlossaryEntryFormSurface={
                          setActiveGlossaryEntryFormSurface
                        }
                        onChangeGlossaryEntryFormWarningPolicy={
                          setActiveGlossaryEntryFormWarningPolicy
                        }
                        onChangeGlossaryEntryFormMatchBoundaryStart={
                          setActiveGlossaryEntryFormMatchBoundaryStart
                        }
                        onChangeGlossaryEntryFormMatchBoundaryEnd={
                          setActiveGlossaryEntryFormMatchBoundaryEnd
                        }
                        onDeleteGlossaryEntryForm={deleteActiveGlossaryEntryForm}
                        onDeleteGlossaryEntry={() => {
                          void deleteActiveGlossaryEntry();
                        }}
                        onNavigateToPreviousGlossaryOccurrence={() => {
                          if (currentEditor?.kind === "glossaryEntry") {
                            executeUiCommand(
                              glossaryCommandIds.previousOccurrence,
                              { source: "editorSurface" },
                              currentEditor.draft.entry.id
                            );
                          }
                        }}
                        onNavigateToNextGlossaryOccurrence={() => {
                          if (currentEditor?.kind === "glossaryEntry") {
                            executeUiCommand(
                              glossaryCommandIds.nextOccurrence,
                              { source: "editorSurface" },
                              currentEditor.draft.entry.id
                            );
                          }
                        }}
                        pendingMarkdownSelection={pendingMarkdownSelection}
                        onPendingMarkdownSelectionApplied={() => {
                          setPendingMarkdownSelection(null);
                        }}
                        documentOpenId={documentOpenMeasurement?.documentOpenId ?? null}
                        onDocumentOpenPreviewRenderStarted={
                      handleDocumentOpenPreviewRenderStarted
                    }
                        onDocumentOpenPreviewRendered={handleDocumentOpenMeasured}
                        onDocumentOpenPreviewDomCommitted={
                      handleDocumentOpenPreviewDomCommitted
                    }
                        onDocumentOpenPreviewDecorationCompleted={
                      handleDocumentOpenPreviewDecorationCompleted
                    }
                        onDocumentOpenPreviewFrameObserved={
                      handleDocumentOpenPreviewFrameObserved
                    }
                        onViewportChanged={handleViewportChanged}
                      />

                      {layout.utilityWindow.open ? (
                        <>
                          <div
                            className="utilityWindowResizeHandle"
                            role="separator"
                            aria-orientation="horizontal"
                            aria-label={translate(
                              "workbench.utilityWindowResizeHandle"
                            )}
                            onPointerDown={
                              utilityWindowResizeDrag.onPointerDown
                            }
                            onPointerMove={
                              utilityWindowResizeDrag.onPointerMove
                            }
                            onPointerUp={utilityWindowResizeDrag.onPointerUp}
                            onPointerCancel={
                              utilityWindowResizeDrag.onPointerCancel
                            }
                          />
                          <UtilityWindow
                            activeTab={layout.utilityWindow.activeTab}
                            height={layout.utilityWindow.height}
                            translate={translate}
                            onSelectTab={selectUtilityWindowTab}
                            onClose={() =>
                              executeUiCommand(utilityWindowCommandIds.close, {
                                source: "utilityWindow"
                              })
                            }
                          >
                            {layout.utilityWindow.activeTab === "debugLog" ? (
                              <DebugLogPanel translate={translate} />
                            ) : (
                              <GlossaryOccurrencesPanel
                                session={glossaryOccurrenceTrackingState}
                                translate={translate}
                                onNavigatePrevious={() =>
                                  executeUiCommand(
                                    glossaryOccurrencesCommandIds.previous,
                                    { source: "utilityWindow" }
                                  )
                                }
                                onNavigateNext={() =>
                                  executeUiCommand(
                                    glossaryOccurrencesCommandIds.next,
                                    { source: "utilityWindow" }
                                  )
                                }
                                onOpenEntry={() =>
                                  executeUiCommand(
                                    glossaryOccurrencesCommandIds.openEntry,
                                    { source: "utilityWindow" }
                                  )
                                }
                                onCloseTracking={() =>
                                  executeUiCommand(
                                    glossaryOccurrencesCommandIds.closeTracking,
                                    { source: "utilityWindow" }
                                  )
                                }
                              />
                            )}
                          </UtilityWindow>
                        </>
                      ) : null}
                    </>
                  ) : null}
                </section>
              </section>
            </section>
          )}
        </section>
      </section>

      {effectiveSettings.workbench.statusBar.visible ? (
        <footer className="statusBar">
          <span className="statusBarMessage">
            {translate(status.key, status.values)}
          </span>
          {statusBarCharacterCountText ? (
            <span className="statusBarCharacterCount">
              {statusBarCharacterCountText}
            </span>
          ) : null}
        </footer>
      ) : null}

      {isCommandPaletteOpen ? (
        <CommandPalette
          commandRegistry={commandRegistry}
          translate={translate}
          isComposing={imeCompositionSaveGuard.isComposing}
          commandContext={commandContext}
          descriptionSettings={effectiveSettings.commandPalette.description}
          onExecuteCommand={(commandId, ...args) => {
            executeUiCommand(commandId, { source: "commandPalette" }, ...args);
            setIsCommandPaletteOpen(false);
          }}
          onBlockedCommand={(commandId) => {
            logRendererDebugEvent({
              level: "debug",
              event: "command.blocked",
              details: {
                commandId: String(commandId),
                source: "commandPalette",
                reason: "disabled_command"
              }
            });
          }}
          onClose={() => setIsCommandPaletteOpen(false)}
          lineJumpEditorSnapshot={lineJumpEditorSnapshot}
        />
      ) : null}

      {aboutDialogAppInfo ? (
        <AboutDialog
          appInfo={aboutDialogAppInfo}
          translate={translate}
          clipboardAdapter={navigatorClipboardAdapter}
          opener={aboutDialogOpenerRef.current}
          onClose={closeAboutDialog}
          onOpenRepository={openAboutRepository}
          onOpenTypewriterSoundsCredit={openAboutTypewriterSoundsCredit}
        />
      ) : null}

      {lineEndingDistributionData ? (
        <LineEndingDistributionDialog
          distribution={lineEndingDistributionData}
          translate={translate}
          opener={lineEndingDistributionDialogOpenerRef.current}
          onClose={closeLineEndingDistributionDialog}
        />
      ) : null}

      {pendingDialogRequest?.kind === "confirm" ? (
        <ConfirmDialog
          options={pendingDialogRequest.options}
          actionOrder={dialogActionOrder}
          translate={translate}
          clipboardAdapter={navigatorClipboardAdapter}
          opener={dialogOpenerRef.current}
          onResult={(result) => dialogController.resolve(result)}
        />
      ) : null}
      {pendingDialogRequest?.kind === "choice" ? (
        <ChoiceDialog
          options={pendingDialogRequest.options}
          platform={window.pergamum.platform}
          translate={translate}
          clipboardAdapter={navigatorClipboardAdapter}
          opener={dialogOpenerRef.current}
          onResult={(result) => dialogController.resolve(result)}
        />
      ) : null}

      <NotificationHost
        controller={notificationController}
        translate={translate}
        autoDismissMs={notificationAutoDismissMs}
      />
    </main>
  );
}
