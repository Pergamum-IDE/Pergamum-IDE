import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent
} from "react";
import pergamumProjectIconUrl from "../../assets/icons/file-associations/pergamum/pergamum-scroll-file-icon.svg?url";
import filePlusIconUrl from "../../assets/icons/feather/explorer/file-plus.svg?url";
import folderPlusIconUrl from "../../assets/icons/feather/explorer/folder-plus.svg?url";
import moveIconUrl from "../../assets/icons/feather/explorer/move.svg?url";
import documentTextIconUrl from "../../assets/icons/ionicons/explorer/document-text-outline.svg?url";
import folderOpenIconUrl from "../../assets/icons/ionicons/explorer/folder-open-outline.svg?url";
import folderIconUrl from "../../assets/icons/ionicons/explorer/folder-outline.svg?url";
import pencilOutlineIconUrl from "../../assets/icons/ionicons/explorer/pencil-outline.svg?url";
import refreshIconUrl from "../../assets/icons/ionicons/explorer/refresh-outline.svg?url";
import type {
  CreateFileExplorerEntryResult,
  FileExplorerEntry,
  ListFileExplorerChildrenResult,
  PergamumProject,
  RenameFileExplorerEntryResult
} from "../shared/api";
import {
  collectMovedProjectDocumentRelocations,
  type ProjectDocumentPathRelocation
} from "../shared/projectMove";
import { isFileExplorerCreateValidationReason } from "../shared/fileExplorerCreate";
import {
  isFileExplorerRenameValidationReason,
  type FileExplorerRenameKind
} from "../shared/fileExplorerRename";
import type { Translate, TranslationKey } from "../shared/i18n";
import {
  navigatorClipboardAdapter,
  type ClipboardAdapter
} from "./dialog/clipboardAdapter";
import {
  NameInputDialog,
  type NameInputDialogSubmitResult
} from "./dialog/NameInputDialog";
import { MoveDestinationDialog } from "./dialog/MoveDestinationDialog";
import { FileOperationFailureDialog } from "./dialog/FileOperationFailureDialog";
import { FileExplorerDeleteDialog } from "./FileExplorerDeleteDialog";
import {
  fileExplorerDeleteRejectionReasonKey,
  type FileExplorerDeleteRejection,
  type FileExplorerDeleteTarget
} from "../shared/fileExplorerDelete";
import { isProtectedPergamumDataFilePath } from "../shared/saveTargetPolicy";
import { pathHasReservedFileExplorerSegment } from "../shared/fileExplorerCreate";
import {
  fileOperationFailureReasonTextKey,
  type FileOperationFailureItemKind,
  type FileOperationFailureStatus
} from "./fileOperationFailure";
import {
  collectFileExplorerMoveDestinationFolders,
  FILE_EXPLORER_MOVE_DND_MIME,
  isValidFileExplorerDropTarget,
  resolveFileExplorerDragSources,
  resolveFileExplorerDropDestination,
  resolveFileExplorerMoveDisabledReason,
  resolveFileExplorerMoveSources,
  resolveFileExplorerPasteDestination,
  resolveFileExplorerPasteDisabledReason,
  type FileExplorerDropTarget,
  type FileExplorerMoveDisabledReason,
  type FileExplorerPasteDisabledReason
} from "./fileExplorerMoveDestinations";
import {
  createFileExplorerNameValidator,
  fileExplorerCreateFailureMessageKey,
  fileExplorerCreateTechnicalDetails,
  type FileExplorerCreateKind
} from "./fileExplorerCreateMessages";
import {
  createFileExplorerRenameNameValidator,
  fileExplorerRenameFailureMessageKey,
  fileExplorerRenameTechnicalDetails
} from "./fileExplorerRenameMessages";
import {
  clearFileExplorerSelection,
  collapseFileExplorerSelection,
  createEmptyFileExplorerSelection,
  extendFileExplorerSelectionTo,
  isFileExplorerDescendantPath,
  replaceFileExplorerSelection,
  toggleFileExplorerSelection,
  type FileExplorerSelectionState
} from "./fileExplorerSelectionState";

/**
 * #311: an external request (from the Command Palette) to open the same
 * "New File" / "New Folder" dialog the toolbar opens. `token` changes on
 * every request so a repeated command re-opens the dialog.
 */
export interface FileExplorerCreateEntryRequest {
  kind: FileExplorerCreateKind;
  token: number;
}

/**
 * #318: an explicit rename target supplied by a global command (Command
 * Palette / menu / shortcut) — the active editor's backing project file, as
 * a project-relative path. The File Explorer renames exactly this file and
 * never consults its own selection.
 */
export interface FileExplorerRenameTarget {
  readonly relativePath: string;
}

export interface FileExplorerRenameEntryRequest {
  token: number;
  /**
   * #318: when set, rename this file (a global command's active-editor
   * target). When absent / null the rename targets the File Explorer's own
   * selection (a future File-Explorer-internal trigger).
   */
  target?: FileExplorerRenameTarget | null;
}

/**
 * #344: an external request to re-list one or more project directories NOW,
 * because a file appeared in the project by a path OUTSIDE the File
 * Explorer's own create / rename / move flows — currently a Recovery restore
 * that writes a `.recovered.md` into the open project. The File Explorer's
 * cached listing for that directory is stale until it is re-fetched.
 * Consumed once per token.
 */
export interface FileExplorerRefreshDirectoriesRequest {
  /** Project-relative directory paths to re-list (`null` = project root). */
  readonly directoryRelativePaths: readonly (string | null)[];
  readonly token: number;
}

/**
 * #355: an explicit request to reveal one project document in the File
 * Explorer — expand its parent folder chain, select its row, and scroll it
 * into view. Issued by the "Select in File Explorer" tab context-menu item.
 * `token` changes per request so a repeat re-runs the reveal.
 */
export interface FileExplorerRevealRequest {
  readonly relativePath: string;
  readonly token: number;
}

interface FileExplorerProps {
  project: PergamumProject | null;
  highlightedRelativePath: string | null;
  translate: Translate;
  /** #307: disable the create toolbar and never attempt a create IPC. */
  readOnly?: boolean;
  clipboardAdapter?: ClipboardAdapter;
  /** #311: Command Palette "Create New …" request; consumed once per token. */
  createEntryRequest?: FileExplorerCreateEntryRequest | null;
  onCreateEntryRequestHandled?: () => void;
  /** #313: Command Palette "Rename" request; consumed once per token. */
  renameEntryRequest?: FileExplorerRenameEntryRequest | null;
  onRenameEntryRequestHandled?: () => void;
  /** #344: re-list these project directories now — a file was added by a
   *  path outside the File Explorer's own flows (a Recovery restore).
   *  Consumed once per token. */
  refreshDirectoriesRequest?: FileExplorerRefreshDirectoriesRequest | null;
  onRefreshDirectoriesRequestHandled?: () => void;
  /** #355: an explicit "Select in File Explorer" request from a document tab.
   *  Unlike the passive #309 active-document follow, this ALWAYS expands the
   *  parent folder chain (even folders the user collapsed), selects the row,
   *  and scrolls it into view. Consumed once per token. */
  revealRequest?: FileExplorerRevealRequest | null;
  onRevealRequestHandled?: () => void;
  isProjectDocumentDirty?: (relativePath: string) => boolean;
  onProjectDocumentRenamed?: (
    oldRelativePath: string,
    newEntry: FileExplorerEntry
  ) => void;
  /** #338: after a successful Move, the old → new project-relative paths for
   *  every file that actually moved. The host follows open editor identity
   *  (tab label, save target, active/highlighted path, session snapshot) and
   *  its Recovery bookkeeping along these. A non-open old path is a no-op. */
  onProjectDocumentsMoved?: (
    relocations: readonly ProjectDocumentPathRelocation[]
  ) => void;
  onRenameUnavailable?: (message: string) => void;
  /** #327/#338: project-relative paths of documents open with UNSAVED changes.
   *  Passed to the Move backend as `dirtyProjectDocumentRelativePaths`, and the
   *  only editor state that still blocks a Move — a clean open document moves
   *  and its editor identity follows (#338). */
  dirtyProjectDocumentRelativePaths?: readonly string[];
  /** #327: a short, already-localized status line for a Move attempt.
   *  #351: reused for File Explorer deletion status / disabled reasons. */
  onMoveResultMessage?: (message: string) => void;
  /** #351: after a delete run settles, the project-relative paths that were
   *  actually removed. The host closes any open editors for them (Recovery
   *  rows are left intact — ADR-0011 DEL-14) and refreshes. */
  onEntriesDeleted?: (deletedRelativePaths: readonly string[]) => void;
  onActivateDocument: (relativePath: string) => void;
}

/** #351: `true` when a project-relative path is a Pergamum reserved /
 *  protected entry — a cheap renderer-side check so the context-menu Delete
 *  item can disable itself when the whole selection is protected. */
function isProtectedFileExplorerRelativePath(relativePath: string): boolean {
  return (
    pathHasReservedFileExplorerSegment(relativePath) ||
    relativePath
      .split("/")
      .some((segment) => isProtectedPergamumDataFilePath(segment))
  );
}

type FileExplorerDeleteFlowState =
  | { readonly kind: "collecting" }
  | {
      readonly kind: "rejected";
      readonly rejections: readonly FileExplorerDeleteRejection[];
    }
  | {
      readonly kind: "confirm";
      readonly targets: readonly FileExplorerDeleteTarget[];
      readonly fileCount: number;
      readonly folderCount: number;
    };

interface FileExplorerViewProps {
  projectName: string | null;
  rootEntries: FileExplorerEntry[];
  entriesByDirectoryPath: Readonly<Record<string, FileExplorerEntry[]>>;
  expandedDirectoryPaths: ReadonlySet<string>;
  loadingDirectoryPaths: ReadonlySet<string>;
  unavailableDirectoryPaths: ReadonlySet<string>;
  isRootSelected: boolean;
  /** The primary / keyboard-focused entry (drives roving tabindex and the
   *  #307 create target). One of `selectedPaths`, or `null`. */
  selectedRelativePath: string | null;
  /** #323: every currently-selected entry path (#322 selection set). */
  selectedPaths?: ReadonlySet<string>;
  /** #323: visible entry paths, top to bottom — the roving-tabindex order. */
  visibleOrder?: readonly string[];
  highlightedRelativePath: string | null;
  canCreate: boolean;
  /** #327: whether the current multi-selection can be moved (same rule as the
   *  context-menu `Move…`). */
  canMove?: boolean;
  /** #327: localized reason the move is unavailable — shown as the toolbar
   *  button's `title` when disabled. */
  moveDisabledReasonLabel?: string;
  /** #328: project-relative paths of the pending Cut sources — the rows are
   *  rendered muted (`data-file-explorer-cut="true"`) while still visible. */
  cutRelativePaths?: ReadonlySet<string>;
  /** #329 spike: project-relative paths currently being dragged — the source
   *  rows carry `data-file-explorer-dragging="true"`. */
  draggingRelativePaths?: ReadonlySet<string>;
  /** #342: the shared dirty check — a `file` row for a project document with
   *  unsaved changes shows a pencil indicator next to its name
   *  (`data-file-explorer-dirty="true"`). Same route the #338 Move gate uses. */
  isProjectDocumentDirty?: (relativePath: string) => boolean;
  /** #329 spike: the row the pointer is over during a drag (`""` = the
   *  project root row), plus whether a drop there is valid. Drives
   *  `data-file-explorer-drop-target="valid" | "invalid"`. */
  dropTargetPath?: string | null;
  dropTargetValid?: boolean;
  translate: Translate;
  /** #311: attached to the active project document entry once it is
   *  rendered, so the container can scroll it into view. */
  activeDocumentEntryRef?: (element: HTMLButtonElement | null) => void;
  /** #323: register a rendered row's DOM node with the container's roving
   *  focus map. */
  registerRowElement?: (
    relativePath: string,
    element: HTMLButtonElement | null
  ) => void;
  registerRootElement?: (element: HTMLButtonElement | null) => void;
  onReload: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  /** #327: the primary Move route — opens the destination picker for the
   *  current selection. */
  onMove?: () => void;
  onToggleDirectory: (relativePath: string) => void;
  onSelectRoot: () => void;
  /** Plain click / Space / plain Arrow — replace the selection with this
   *  single entry and move the anchor to it (#322 `replace`). */
  onSelectEntry: (relativePath: string) => void;
  /** Ctrl / Cmd + click — add/remove this entry (#322 `toggle`). */
  onToggleEntrySelection?: (relativePath: string) => void;
  /** Shift + click — visible-range select from the anchor (#322 `extendTo`).
   *  The container supplies `visibleOrder`. */
  onExtendEntrySelection?: (relativePath: string) => void;
  /** #323: keyboard nav / Space handling for one entry row. */
  onEntryKeyDown?: (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    entry: FileExplorerEntry
  ) => void;
  onRootKeyDown?: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  /**
   * #327: right-click inside the File Explorer tree. `entry` is the row that
   * was clicked, or `null` for the project root row / the empty list area
   * (both open the Move menu without changing the selection).
   */
  onEntryContextMenu?: (
    event: ReactMouseEvent<HTMLElement>,
    entry: FileExplorerEntry | null
  ) => void;
  /**
   * #328: Ctrl/Cmd+X / Ctrl/Cmd+V while focus is inside the tree. Scoped to
   * the tree subtree — it never sees an editor / input keystroke.
   */
  onTreeShortcutKeyDown?: (
    event: ReactKeyboardEvent<HTMLDivElement>
  ) => void;
  /**
   * #329 spike: native HTML5 drag & drop. `onEntryDragStart` fires for every
   * row (it cancels the drag itself for a folder / ineligible selection);
   * `onRowDragOver` / `onRowDragLeave` / `onRowDrop` fire for entry rows and
   * the project root row (`entry === null`).
   */
  onEntryDragStart?: (
    event: ReactDragEvent<HTMLElement>,
    entry: FileExplorerEntry
  ) => void;
  onEntryDragEnd?: (event: ReactDragEvent<HTMLElement>) => void;
  onRowDragOver?: (
    event: ReactDragEvent<HTMLElement>,
    entry: FileExplorerEntry | null
  ) => void;
  onRowDragLeave?: (
    event: ReactDragEvent<HTMLElement>,
    entry: FileExplorerEntry | null
  ) => void;
  onRowDrop?: (
    event: ReactDragEvent<HTMLElement>,
    entry: FileExplorerEntry | null
  ) => void;
  onActivateDocument: (relativePath: string) => void;
}

type FileExplorerSelection =
  | {
      kind: "root";
    }
  | {
      kind: "entry";
      relativePath: string;
    };

/**
 * #323: the visible entry paths in top-to-bottom order — a folder's children
 * are included only when it is expanded. This is the single order source the
 * #322 range functions get (a collapsed folder's children are never in a
 * range). The project root is not included (it is not a selectable entry).
 */
export function flattenVisibleFileExplorerEntryPaths(input: {
  readonly rootEntries: readonly FileExplorerEntry[];
  readonly entriesByDirectoryPath: Readonly<
    Record<string, FileExplorerEntry[]>
  >;
  readonly expandedDirectoryPaths: ReadonlySet<string>;
}): string[] {
  const order: string[] = [];

  const walk = (entries: readonly FileExplorerEntry[]): void => {
    for (const entry of entries) {
      order.push(entry.relativePath);

      if (
        entry.kind === "folder" &&
        input.expandedDirectoryPaths.has(entry.relativePath)
      ) {
        walk(
          input.entriesByDirectoryPath[directoryKey(entry.relativePath)] ?? []
        );
      }
    }
  };

  walk(input.rootEntries);

  return order;
}

export interface FileExplorerReloadTargetState {
  entriesByDirectoryPath: Readonly<Record<string, FileExplorerEntry[]>>;
  expandedDirectoryPaths: ReadonlySet<string>;
  isRootSelected: boolean;
  selectedRelativePath: string | null;
}

const rootDirectoryKey = "";

function directoryKey(relativePath: string | null): string {
  return relativePath ?? rootDirectoryKey;
}

function hasDirectoryEntries(
  entriesByDirectoryPath: Readonly<Record<string, FileExplorerEntry[]>>,
  relativePath: string | null
): boolean {
  return Object.prototype.hasOwnProperty.call(
    entriesByDirectoryPath,
    directoryKey(relativePath)
  );
}

function withSetEntry<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  next.add(value);
  return next;
}

function withoutSetEntry<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  next.delete(value);
  return next;
}

function isFileExplorerEntryVisible(
  entriesByDirectoryPath: Readonly<Record<string, FileExplorerEntry[]>>,
  relativePath: string | null
): boolean {
  if (!relativePath) {
    return true;
  }

  return Object.values(entriesByDirectoryPath).some((entries) =>
    entries.some((entry) => entry.relativePath === relativePath)
  );
}

function fileExplorerEntryByRelativePath(
  entriesByDirectoryPath: Readonly<Record<string, FileExplorerEntry[]>>,
  relativePath: string
): FileExplorerEntry | null {
  for (const entries of Object.values(entriesByDirectoryPath)) {
    const entry = entries.find(
      (candidate) => candidate.relativePath === relativePath
    );

    if (entry) {
      return entry;
    }
  }

  return null;
}

function parentDirectoryRelativePath(relativePath: string): string | null {
  const slashIndex = relativePath.lastIndexOf("/");

  return slashIndex === -1 ? null : relativePath.slice(0, slashIndex);
}

/**
 * #340: `true` when `candidate` is `selectionPath` itself or lives inside it
 * (so a dirty document `Drafts/x.md` counts as "in" a selected `Drafts`
 * folder). Both are project-relative, forward-slash paths.
 */
function isPathWithinSelection(
  candidate: string,
  selectionPath: string
): boolean {
  return (
    candidate === selectionPath ||
    candidate.startsWith(`${selectionPath}/`)
  );
}

/**
 * #340: whether any dirty open project document is one of `selectionPaths` or
 * lives inside a selected folder's subtree.
 */
function selectionCoversDirtyOpenDocument(
  selectionPaths: Iterable<string>,
  dirtyRelativePaths: readonly string[]
): boolean {
  for (const selectionPath of selectionPaths) {
    if (
      dirtyRelativePaths.some((dirty) =>
        isPathWithinSelection(dirty, selectionPath)
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * #309: the chain of ancestor folders for a project-relative document path,
 * from the outermost folder inwards, e.g.
 *   `Drafts/Chapter1/scene-03.md` → `["Drafts", "Drafts/Chapter1"]`.
 * The project root (`null`) is implicit and never included; a root-level
 * document (`chapter-01.md`) yields `[]`.
 */
export function ancestorDirectoryRelativePaths(relativePath: string): string[] {
  const segments = relativePath.split("/");
  segments.pop();

  const ancestors: string[] = [];
  let prefix = "";

  for (const segment of segments) {
    prefix = prefix ? `${prefix}/${segment}` : segment;
    ancestors.push(prefix);
  }

  return ancestors;
}

/**
 * #309: whether the active project document is already reachable in the
 * rendered tree — its parent folder's children are loaded AND every ancestor
 * folder is expanded. Used to decide when the reveal walk is done, so an
 * already-visible active document never triggers extra loads or tree changes.
 */
function isFileExplorerEntryRevealed(
  entriesByDirectoryPath: Readonly<Record<string, FileExplorerEntry[]>>,
  expandedDirectoryPaths: ReadonlySet<string>,
  relativePath: string
): boolean {
  if (!isFileExplorerEntryVisible(entriesByDirectoryPath, relativePath)) {
    return false;
  }

  return ancestorDirectoryRelativePaths(relativePath).every((directoryPath) =>
    expandedDirectoryPaths.has(directoryPath)
  );
}

function isProjectMarkdownRelativePath(relativePath: string): boolean {
  const lowerRelativePath = relativePath.toLowerCase();

  return (
    lowerRelativePath.endsWith(".md") ||
    lowerRelativePath.endsWith(".markdown")
  );
}

function isOpenableFileExplorerEntry(entry: FileExplorerEntry): boolean {
  return (
    entry.kind === "file" &&
    isProjectMarkdownRelativePath(entry.relativePath)
  );
}

function renameKindForEntry(entry: FileExplorerEntry): FileExplorerRenameKind {
  return entry.kind === "folder" ? "folder" : "file";
}

/**
 * #318: a minimal `FileExplorerEntry` for a global command's explicit rename
 * target (the active editor's project file). The file need not be loaded into
 * the tree — the rename dialog only needs kind / name / relativePath, and the
 * main process stays the source of truth for path safety.
 */
function fileExplorerEntryForRenameTarget(
  relativePath: string
): FileExplorerEntry {
  const normalized = relativePath.replace(/\\/g, "/");

  return {
    kind: "file",
    name: normalized.slice(normalized.lastIndexOf("/") + 1),
    relativePath: normalized
  };
}

function uniqueReloadTargets(
  targets: readonly (string | null)[]
): (string | null)[] {
  const seen = new Set<string>();
  const unique: (string | null)[] = [];

  for (const target of targets) {
    const key = directoryKey(target);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(target);
  }

  return unique;
}

export function resolveFileExplorerReloadTargets({
  entriesByDirectoryPath,
  expandedDirectoryPaths,
  isRootSelected,
  selectedRelativePath
}: FileExplorerReloadTargetState): (string | null)[] {
  if (isRootSelected) {
    return [null];
  }

  if (selectedRelativePath) {
    const selectedEntry = fileExplorerEntryByRelativePath(
      entriesByDirectoryPath,
      selectedRelativePath
    );

    if (selectedEntry?.kind === "folder") {
      return [selectedEntry.relativePath];
    }

    if (selectedEntry?.kind === "file") {
      return [parentDirectoryRelativePath(selectedEntry.relativePath)];
    }
  }

  return uniqueReloadTargets([
    null,
    ...Array.from(expandedDirectoryPaths).sort()
  ]);
}

/**
 * #307: which folder a "New File" / "New Folder" action creates into,
 * as a project-relative path (`null` = project root):
 *   - a selected folder  → that folder,
 *   - a selected file    → its parent folder,
 *   - the root selected, or nothing selected → the project root.
 * Never resolves an absolute path — the main process does that.
 */
export function resolveFileExplorerCreateParentDirectory({
  entriesByDirectoryPath,
  isRootSelected,
  selectedRelativePath
}: {
  entriesByDirectoryPath: Readonly<Record<string, FileExplorerEntry[]>>;
  isRootSelected: boolean;
  selectedRelativePath: string | null;
}): string | null {
  if (isRootSelected || !selectedRelativePath) {
    return null;
  }

  const selectedEntry = fileExplorerEntryByRelativePath(
    entriesByDirectoryPath,
    selectedRelativePath
  );

  if (selectedEntry?.kind === "folder") {
    return selectedEntry.relativePath;
  }

  if (selectedEntry?.kind === "file") {
    return parentDirectoryRelativePath(selectedEntry.relativePath);
  }

  return null;
}

/** #311: the smallest scroll-target contract needed to nudge the active
 *  project document entry into view — an element (or a test double) exposing
 *  `scrollIntoView`. */
export interface FileExplorerScrollTarget {
  scrollIntoView(options?: ScrollIntoViewOptions): void;
}

/**
 * #311: bring the active project document entry into view after #309 has
 * revealed it. Deliberately conservative — `block: "nearest"` does nothing
 * when the entry is already visible, and it never focuses or selects the
 * entry. Non-project editors pass `null` here and nothing scrolls.
 */
export function scrollFileExplorerActiveDocumentIntoView(
  target: FileExplorerScrollTarget | null
): void {
  target?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function iconForEntry(
  entry: FileExplorerEntry,
  expandedDirectoryPaths: ReadonlySet<string>
): { url: string; name: string } {
  if (entry.kind === "folder") {
    return expandedDirectoryPaths.has(entry.relativePath)
      ? { url: folderOpenIconUrl, name: "folder-open" }
      : { url: folderIconUrl, name: "folder" };
  }

  return { url: documentTextIconUrl, name: "document" };
}

export function FileExplorer({
  project,
  highlightedRelativePath,
  translate,
  readOnly = false,
  clipboardAdapter = navigatorClipboardAdapter,
  createEntryRequest = null,
  onCreateEntryRequestHandled,
  renameEntryRequest = null,
  onRenameEntryRequestHandled,
  refreshDirectoriesRequest = null,
  onRefreshDirectoriesRequestHandled,
  revealRequest = null,
  onRevealRequestHandled,
  isProjectDocumentDirty = () => false,
  onProjectDocumentRenamed,
  onProjectDocumentsMoved,
  onRenameUnavailable,
  dirtyProjectDocumentRelativePaths = EMPTY_STRING_LIST,
  onMoveResultMessage,
  onEntriesDeleted,
  onActivateDocument
}: FileExplorerProps): JSX.Element {
  const [entriesByDirectoryPath, setEntriesByDirectoryPath] = useState<
    Record<string, FileExplorerEntry[]>
  >({});
  const [createDialogKind, setCreateDialogKind] =
    useState<FileExplorerCreateKind | null>(null);
  // #355: when a create is triggered from a context menu, the target folder is
  // an explicit override rather than the current selection:
  //   `undefined` → no override (toolbar / Command Palette → selection-based),
  //   `null`      → project root (empty-area / project-root context menu),
  //   string      → that folder (folder-row context menu).
  const [createDialogParentOverride, setCreateDialogParentOverride] = useState<
    string | null | undefined
  >(undefined);
  const [renameDialogTarget, setRenameDialogTarget] =
    useState<FileExplorerEntry | null>(null);
  const [expandedDirectoryPaths, setExpandedDirectoryPaths] = useState<
    Set<string>
  >(() => new Set());
  const [loadingDirectoryPaths, setLoadingDirectoryPaths] = useState<
    Set<string>
  >(() => new Set());
  const [unavailableDirectoryPaths, setUnavailableDirectoryPaths] = useState<
    Set<string>
  >(() => new Set());
  const [selection, setSelection] = useState<FileExplorerSelection | null>(null);
  // #323: the multi-selection set + range anchor (#322 pure state machine).
  // `selection` above stays the single "primary / focused" entry — it drives
  // the #307 create target, #313 rename preflight, and the roving tabindex —
  // and is kept in sync as one member of this set.
  const [multiSelection, setMultiSelection] =
    useState<FileExplorerSelectionState>(createEmptyFileExplorerSelection);
  // #327: File Explorer item context menu (Move / Cut / Paste / Delete) and
  // the destination-folder picker it opens.
  // #355: it also carries the create target — a right-click on the project
  // root row or the empty list area targets the project root; a right-click
  // on a folder row targets that folder; a file row shows no create items.
  const [contextMenu, setContextMenu] = useState<{
    readonly x: number;
    readonly y: number;
    readonly createTarget:
      | { readonly kind: "root" }
      | { readonly kind: "folder"; readonly relativePath: string }
      | null;
  } | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveInFlight, setMoveInFlight] = useState(false);
  // #340 blocker: a Move that some or all items could not complete (validation
  // rejected it, or execution failed partway) is surfaced as a list modal, not
  // just the status line. Raw reason + source path per failed item; the
  // file/folder kind and localized text are resolved at render time.
  const [moveFailure, setMoveFailure] = useState<{
    readonly status: FileOperationFailureStatus;
    readonly entries: readonly {
      readonly reason: string;
      readonly sourceRelativePath: string | null;
    }[];
  } | null>(null);
  // #328: the pending internal Cut — a snapshot of the File Explorer selection
  // taken at Cut time, moved by the next Paste. Never touches the OS clipboard.
  const [cutState, setCutState] = useState<FileExplorerCutState | null>(null);
  // #329 spike: the in-progress native drag (renderer state is authoritative;
  // the DataTransfer payload is only the gesture carrier) and the row the
  // pointer is currently over.
  const [dragState, setDragState] = useState<FileExplorerDragState | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    readonly path: string;
    readonly valid: boolean;
  } | null>(null);
  const loadGenerationRef = useRef(0);
  // #311: the DOM node of the active project document entry (once #309 has
  // revealed it) and the last path we scrolled to, so the scroll fires once
  // per active document and never on every re-render.
  const activeDocumentEntryElementRef = useRef<HTMLButtonElement | null>(null);
  const lastScrolledHighlightRef = useRef<string | null>(null);
  // #355: the active-document path for which the passive #309 reveal has
  // already run to a terminal state. While it equals `highlightedRelativePath`
  // the auto-reveal is inert, so a folder the user collapses stays collapsed.
  // Reset on project switch; the explicit #355 reveal request ignores it.
  const lastRevealedHighlightRef = useRef<string | null>(null);
  // #355: a path an explicit reveal request wants scrolled into view once its
  // row mounts (set after the parent chain is expanded).
  const pendingRevealScrollRef = useRef<string | null>(null);
  const handledRevealRequestTokenRef = useRef<number | null>(null);
  const forceRevealRetriedKeysRef = useRef<Set<string>>(new Set());
  const projectKey = project
    ? `${project.rootPath}\0${project.activeProjectFilePath}`
    : "no-project";
  const hasProject = project !== null;
  const selectedRelativePath =
    selection?.kind === "entry" ? selection.relativePath : null;
  const isRootSelected = selection?.kind === "root";
  const selectedEntry = selectedRelativePath
    ? fileExplorerEntryByRelativePath(
        entriesByDirectoryPath,
        selectedRelativePath
      )
    : null;

  // #323: the visible entry order — the only order source handed to the #322
  // range functions.
  const rootEntriesForView = entriesByDirectoryPath[rootDirectoryKey] ?? [];
  const visibleOrder = useMemo(
    () =>
      flattenVisibleFileExplorerEntryPaths({
        rootEntries: rootEntriesForView,
        entriesByDirectoryPath,
        expandedDirectoryPaths
      }),
    [rootEntriesForView, entriesByDirectoryPath, expandedDirectoryPaths]
  );

  // #323: make `path` the sole selection AND the primary/focused entry.
  const selectSingleEntry = useCallback((relativePath: string) => {
    setSelection({ kind: "entry", relativePath });
    setMultiSelection((current) =>
      replaceFileExplorerSelection(current, relativePath)
    );
  }, []);

  const selectRoot = useCallback(() => {
    setSelection({ kind: "root" });
    // #323: the project root is not a multi-selectable entry — selecting it
    // clears the entry selection.
    setMultiSelection((current) => clearFileExplorerSelection(current));
  }, []);

  // #323: Ctrl / Cmd + click — the primary/focused entry follows the target;
  // the #322 anchor moves to it.
  const toggleEntrySelection = useCallback((relativePath: string) => {
    setSelection({ kind: "entry", relativePath });
    setMultiSelection((current) =>
      toggleFileExplorerSelection(current, relativePath)
    );
  }, []);

  // #323: Shift + click / Shift + Arrow — the #322 range function owns the
  // rule; the view only hands over the visible order. The primary/focused
  // entry follows the moving edge; the #322 anchor is left where it was.
  const extendEntrySelection = useCallback(
    (relativePath: string) => {
      setSelection({ kind: "entry", relativePath });
      setMultiSelection((current) =>
        extendFileExplorerSelectionTo(current, relativePath, visibleOrder)
      );
    },
    [visibleOrder]
  );

  // #323: roving-tabindex focus map, owned here so `FileExplorerView` stays a
  // pure render function.
  const rowElementsRef = useRef(new Map<string, HTMLButtonElement>());
  const rootButtonElementRef = useRef<HTMLButtonElement | null>(null);

  const registerRowElement = useCallback(
    (relativePath: string, element: HTMLButtonElement | null) => {
      if (element) {
        rowElementsRef.current.set(relativePath, element);
      } else {
        rowElementsRef.current.delete(relativePath);
      }
    },
    []
  );

  const registerRootElement = useCallback(
    (element: HTMLButtonElement | null) => {
      rootButtonElementRef.current = element;
    },
    []
  );

  const handleTreeEntryKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, entry: FileExplorerEntry) => {
      const path = entry.relativePath;

      if (event.key === " ") {
        // Space is the keyboard anchor gesture — select only, never open.
        event.preventDefault();
        selectSingleEntry(path);
        return;
      }

      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
        // Enter and every other key fall through to the native button click
        // (existing open / expand behavior).
        return;
      }

      event.preventDefault();
      const index = visibleOrder.indexOf(path);

      if (index === -1) {
        return;
      }

      const nextPath =
        visibleOrder[index + (event.key === "ArrowDown" ? 1 : -1)];

      if (nextPath === undefined) {
        if (event.key === "ArrowUp") {
          // Above the first entry → step onto the project root.
          rootButtonElementRef.current?.focus();
          selectRoot();
        }
        return;
      }

      rowElementsRef.current.get(nextPath)?.focus();
      if (event.shiftKey) {
        extendEntrySelection(nextPath);
      } else {
        selectSingleEntry(nextPath);
      }
    },
    [extendEntrySelection, selectSingleEntry, selectRoot, visibleOrder]
  );

  const handleRootKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key === " ") {
        event.preventDefault();
        selectRoot();
        return;
      }

      if (event.key === "ArrowDown" && visibleOrder.length > 0) {
        event.preventDefault();
        const firstPath = visibleOrder[0];
        rowElementsRef.current.get(firstPath)?.focus();
        if (event.shiftKey) {
          extendEntrySelection(firstPath);
        } else {
          selectSingleEntry(firstPath);
        }
      }
    },
    [extendEntrySelection, selectSingleEntry, selectRoot, visibleOrder]
  );

  const loadDirectoryForGeneration = useCallback(
    async (
      relativePath: string | null,
      generation: number
    ): Promise<void> => {
      if (!hasProject) {
        return;
      }

      const key = directoryKey(relativePath);
      setLoadingDirectoryPaths((current) => withSetEntry(current, key));
      setUnavailableDirectoryPaths((current) => withoutSetEntry(current, key));

      let result: ListFileExplorerChildrenResult;

      try {
        result = await window.pergamum.projects.listFileExplorerChildren(
          relativePath
        );
      } catch {
        result = {
          kind: "unavailable",
          directoryRelativePath: relativePath,
          reason: "unreadable"
        };
      }

      if (loadGenerationRef.current !== generation) {
        return;
      }

      setLoadingDirectoryPaths((current) => withoutSetEntry(current, key));

      if (result.kind === "ok") {
        setEntriesByDirectoryPath((current) => ({
          ...current,
          [key]: result.entries
        }));
        setUnavailableDirectoryPaths((current) =>
          withoutSetEntry(current, key)
        );
        return;
      }

      setUnavailableDirectoryPaths((current) => withSetEntry(current, key));
    },
    [hasProject]
  );

  const resetProjectTree = useCallback(() => {
    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;

    setEntriesByDirectoryPath({});
    setExpandedDirectoryPaths(new Set());
    setLoadingDirectoryPaths(new Set());
    setUnavailableDirectoryPaths(new Set());
    setSelection(null);
    // #323: a project close / switch clears the multi-selection too.
    setMultiSelection(createEmptyFileExplorerSelection());
    // #328: a pending Cut is scoped to the current project — drop it.
    setCutState(null);
    // #329 spike: abandon any in-progress drag on a project switch / remount.
    setDragState(null);
    setDropTarget(null);
    // #355: a new project re-arms the passive active-document reveal.
    lastRevealedHighlightRef.current = null;
    pendingRevealScrollRef.current = null;
    forceRevealRetriedKeysRef.current = new Set();

    if (hasProject) {
      void loadDirectoryForGeneration(null, generation);
    }
  }, [hasProject, loadDirectoryForGeneration]);

  useEffect(() => {
    resetProjectTree();

    return () => {
      loadGenerationRef.current += 1;
    };
  }, [projectKey, resetProjectTree]);

  const reloadCurrentExplorerContext = useCallback(() => {
    if (!hasProject) {
      return;
    }

    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    const targets = resolveFileExplorerReloadTargets({
      entriesByDirectoryPath,
      expandedDirectoryPaths,
      isRootSelected,
      selectedRelativePath
    });

    for (const target of targets) {
      void loadDirectoryForGeneration(target, generation);
    }
  }, [
    entriesByDirectoryPath,
    expandedDirectoryPaths,
    isRootSelected,
    hasProject,
    loadDirectoryForGeneration,
    selectedRelativePath
  ]);

  useEffect(() => {
    setSelection((currentSelection) => {
      if (currentSelection?.kind !== "entry") {
        return currentSelection;
      }

      return isFileExplorerEntryVisible(
        entriesByDirectoryPath,
        currentSelection.relativePath
      )
        ? currentSelection
        : null;
    });

    // #323: drop selected entries whose path no longer exists after a tree
    // reload / entry disappearance. (Folder collapse is handled separately by
    // `collapseFileExplorerSelection` — a collapsed folder's children still
    // exist in the data.) The anchor is kept as-is.
    setMultiSelection((current) => {
      if (current.selected.size === 0) {
        return current;
      }

      let changed = false;
      const kept = new Set<string>();

      for (const path of current.selected) {
        if (isFileExplorerEntryVisible(entriesByDirectoryPath, path)) {
          kept.add(path);
        } else {
          changed = true;
        }
      }

      return changed ? { selected: kept, anchor: current.anchor } : current;
    });
  }, [entriesByDirectoryPath]);

  // #309/#355: one pass of the "reveal a project document" walk — lazily
  // load each ancestor folder, then expand the whole chain so the document's
  // row renders. Multi-pass: returns `"pending"` while a load is in flight
  // (the caller re-runs when the tree changes), `"done"` when the row is
  // reachable (or was just expanded into place), `"unavailable"` when the
  // chain is broken. Never touches the File Explorer selection and never
  // collapses a folder.
  //
  // `mode: "auto"` — the passive #309 active-document follow. Gives up on the
  //   first unreadable ancestor.
  // `mode: "force"` — the explicit #355 "Select in File Explorer" request.
  //   Retries each unreadable ancestor once (the user asked for it) before
  //   giving up, tracked in `forceRevealRetriedKeysRef`.
  const revealPathInTree = useCallback(
    (
      relativePath: string,
      mode: "auto" | "force"
    ): "done" | "pending" | "unavailable" => {
      if (
        isFileExplorerEntryRevealed(
          entriesByDirectoryPath,
          expandedDirectoryPaths,
          relativePath
        )
      ) {
        return "done";
      }

      const ancestorDirectoryPaths =
        ancestorDirectoryRelativePaths(relativePath);

      for (const directoryPath of [null, ...ancestorDirectoryPaths]) {
        const key = directoryKey(directoryPath);
        const missing = !hasDirectoryEntries(
          entriesByDirectoryPath,
          directoryPath
        );
        const unavailable = unavailableDirectoryPaths.has(key);

        if (unavailable && mode === "auto") {
          return "unavailable";
        }

        if (unavailable && mode === "force") {
          if (forceRevealRetriedKeysRef.current.has(key)) {
            return "unavailable";
          }
          forceRevealRetriedKeysRef.current.add(key);
          if (!loadingDirectoryPaths.has(key)) {
            void loadDirectoryForGeneration(
              directoryPath,
              loadGenerationRef.current
            );
          }
          return "pending";
        }

        if (missing) {
          if (!loadingDirectoryPaths.has(key)) {
            void loadDirectoryForGeneration(
              directoryPath,
              loadGenerationRef.current
            );
          }
          // Wait for the load to land; the caller re-runs and continues.
          return "pending";
        }
      }

      // Every ancestor is loaded — expand the chain. Adds paths only; never
      // removes, so the user's other tree state is untouched.
      setExpandedDirectoryPaths((current) => {
        let changed = false;
        const next = new Set(current);
        for (const directoryPath of ancestorDirectoryPaths) {
          if (!next.has(directoryPath)) {
            next.add(directoryPath);
            changed = true;
          }
        }
        return changed ? next : current;
      });
      return "done";
    },
    [
      entriesByDirectoryPath,
      expandedDirectoryPaths,
      loadDirectoryForGeneration,
      loadingDirectoryPaths,
      unavailableDirectoryPaths
    ]
  );

  // #309/#355: passively follow the active project document, but ONLY ONCE
  // per document. After the walk reaches a terminal state for a given
  // `highlightedRelativePath`, this effect is inert for that path — so a
  // folder the user then collapses stays collapsed (it does NOT snap back
  // open on the next re-render). A different active document, or a project
  // switch (which nulls the ref), re-arms it. The explicit #355 reveal
  // request below ignores this gate.
  useEffect(() => {
    if (!hasProject || !highlightedRelativePath) {
      return;
    }
    if (lastRevealedHighlightRef.current === highlightedRelativePath) {
      return;
    }

    const result = revealPathInTree(highlightedRelativePath, "auto");

    if (result === "pending") {
      // Still loading an ancestor — wait; this effect re-runs on tree change.
      return;
    }

    // "done" or "unavailable": do not auto-reveal this path again.
    lastRevealedHighlightRef.current = highlightedRelativePath;
  }, [hasProject, highlightedRelativePath, revealPathInTree]);

  // #355: an explicit "Select in File Explorer" request. Unlike the passive
  // follow above it ALWAYS expands the parent chain (even folders the user
  // collapsed), selects the row, and scrolls it into view. Consumed once per
  // token.
  useEffect(() => {
    const request = revealRequest;
    if (!request || !hasProject) {
      return;
    }
    if (handledRevealRequestTokenRef.current === request.token) {
      return;
    }

    const result = revealPathInTree(request.relativePath, "force");

    if (result === "pending") {
      // Loading an ancestor — wait; this effect re-runs on tree change.
      return;
    }

    handledRevealRequestTokenRef.current = request.token;
    forceRevealRetriedKeysRef.current = new Set();

    if (result === "done") {
      selectSingleEntry(request.relativePath);
      const element = rowElementsRef.current.get(request.relativePath);
      if (element) {
        // The row was already visible — scroll / focus it right away.
        scrollFileExplorerActiveDocumentIntoView(element);
        element.focus();
      } else {
        // The chain was just expanded; the row mounts on the next render —
        // the follow-up effect below scrolls it then.
        pendingRevealScrollRef.current = request.relativePath;
      }
    }

    onRevealRequestHandled?.();
  }, [
    hasProject,
    onRevealRequestHandled,
    revealPathInTree,
    revealRequest,
    selectSingleEntry
  ]);

  // #355: once an explicitly-revealed row that needed lazy expansion has
  // mounted, scroll it into view and move focus to it (roving-tabindex
  // primary, set by `selectSingleEntry` above).
  useEffect(() => {
    const targetPath = pendingRevealScrollRef.current;
    if (targetPath === null) {
      return;
    }
    const element = rowElementsRef.current.get(targetPath);
    if (!element) {
      return;
    }
    pendingRevealScrollRef.current = null;
    scrollFileExplorerActiveDocumentIntoView(element);
    element.focus();
  }, [entriesByDirectoryPath, expandedDirectoryPaths]);

  const setActiveDocumentEntryElement = useCallback(
    (element: HTMLButtonElement | null) => {
      activeDocumentEntryElementRef.current = element;
    },
    []
  );

  // #311: once the active project document entry is in the rendered tree,
  // nudge it into view. Conservative by design — `block: "nearest"` is a
  // no-op when the entry is already visible — and it never focuses, selects,
  // or collapses anything. Non-project editors feed a null highlighted path,
  // so nothing scrolls for them. Runs at most once per active document via
  // `lastScrolledHighlightRef`; re-runs on tree changes so a document that
  // needed lazy ancestor expansion still scrolls once its entry mounts.
  useEffect(() => {
    if (!hasProject || !highlightedRelativePath) {
      lastScrolledHighlightRef.current = null;
      return;
    }

    if (lastScrolledHighlightRef.current === highlightedRelativePath) {
      return;
    }

    const element = activeDocumentEntryElementRef.current;

    if (!element) {
      return;
    }

    lastScrolledHighlightRef.current = highlightedRelativePath;
    scrollFileExplorerActiveDocumentIntoView(element);
  }, [
    entriesByDirectoryPath,
    expandedDirectoryPaths,
    hasProject,
    highlightedRelativePath
  ]);

  const toggleDirectory = useCallback(
    (relativePath: string) => {
      if (expandedDirectoryPaths.has(relativePath)) {
        setExpandedDirectoryPaths((current) =>
          withoutSetEntry(current, relativePath)
        );
        // #323 (R-4): collapsing a folder drops its descendants from the
        // selection; the folder itself stays. If the primary/focused entry
        // was inside, move focus up to the folder so a tab stop stays visible.
        setMultiSelection((current) =>
          collapseFileExplorerSelection(current, relativePath)
        );
        setSelection((current) =>
          current?.kind === "entry" &&
          isFileExplorerDescendantPath(current.relativePath, relativePath)
            ? { kind: "entry", relativePath }
            : current
        );
        return;
      }

      setExpandedDirectoryPaths((current) =>
        withSetEntry(current, relativePath)
      );

      if (
        !hasDirectoryEntries(entriesByDirectoryPath, relativePath) &&
        !loadingDirectoryPaths.has(directoryKey(relativePath))
      ) {
        void loadDirectoryForGeneration(
          relativePath,
          loadGenerationRef.current
        );
      }
    },
    [
      entriesByDirectoryPath,
      expandedDirectoryPaths,
      loadDirectoryForGeneration,
      loadingDirectoryPaths
    ]
  );

  const loadingForView = useMemo(() => {
    const next = new Set(loadingDirectoryPaths);

    if (
      hasProject &&
      !hasDirectoryEntries(entriesByDirectoryPath, null) &&
      !unavailableDirectoryPaths.has(rootDirectoryKey)
    ) {
      next.add(rootDirectoryKey);
    }

    return next;
  }, [
    entriesByDirectoryPath,
    hasProject,
    loadingDirectoryPaths,
    unavailableDirectoryPaths
  ]);

  // #307: create is available only for a writable open project. In
  // read-only mode the renderer never calls the create IPC.
  const canCreate = hasProject && !readOnly;
  const canRename = hasProject && !readOnly;

  // #311: the folder a create would target, as a project-relative path
  // (`null` = project root). Same rule as the create IPC uses; shown in the
  // name dialog so the user can see where the item lands. Never absolute —
  // the main process resolves the real path.
  const createParentDirectory = useMemo(
    () =>
      resolveFileExplorerCreateParentDirectory({
        entriesByDirectoryPath,
        isRootSelected,
        selectedRelativePath
      }),
    [entriesByDirectoryPath, isRootSelected, selectedRelativePath]
  );

  // #355: the folder a create will actually land in — the explicit
  // context-menu override when set (`null` = project root, string = a
  // folder), otherwise the selection-derived target. Shown in the dialog and
  // used by `submitCreate`, so the two can never disagree.
  const effectiveCreateParentDirectory =
    createDialogParentOverride !== undefined
      ? createDialogParentOverride
      : createParentDirectory;

  const openCreateDialog = useCallback(
    (kind: FileExplorerCreateKind, parentOverride?: string | null) => {
      if (!canCreate) {
        return;
      }
      setCreateDialogParentOverride(parentOverride);
      setCreateDialogKind(kind);
    },
    [canCreate]
  );

  const closeCreateDialog = useCallback(() => {
    setCreateDialogKind(null);
    setCreateDialogParentOverride(undefined);
  }, []);

  const reportRenameUnavailable = useCallback(
    (reason: Parameters<typeof fileExplorerRenameFailureMessageKey>[0]) => {
      onRenameUnavailable?.(
        translate(fileExplorerRenameFailureMessageKey(reason))
      );
    },
    [onRenameUnavailable, translate]
  );

  const openRenameDialog = useCallback(
    (explicitTarget?: FileExplorerRenameTarget | null) => {
      if (!hasProject) {
        reportRenameUnavailable("noProject");
        return;
      }

      if (!canRename) {
        reportRenameUnavailable("readOnlyProject");
        return;
      }

      // #318: a global command supplies the target explicitly (the active
      // editor's project file); a File-Explorer-internal trigger uses the
      // selection. Either way the same extension / dirty / root preflight
      // runs below before the dialog opens.
      if (explicitTarget) {
        if (explicitTarget.relativePath.trim() === "") {
          reportRenameUnavailable("cannotRenameProjectRoot");
          return;
        }
      } else if (isRootSelected) {
        reportRenameUnavailable("cannotRenameProjectRoot");
        return;
      }

      const targetEntry = explicitTarget
        ? fileExplorerEntryForRenameTarget(explicitTarget.relativePath)
        : selectedEntry;

      if (!targetEntry) {
        reportRenameUnavailable("noSelection");
        return;
      }

      if (targetEntry.kind === "file") {
        if (!isOpenableFileExplorerEntry(targetEntry)) {
          reportRenameUnavailable("unsupportedExtension");
          return;
        }

        if (isProjectDocumentDirty(targetEntry.relativePath)) {
          reportRenameUnavailable("openDocumentDirty");
          return;
        }
      }

      setRenameDialogTarget(targetEntry);
    },
    [
      canRename,
      hasProject,
      isProjectDocumentDirty,
      isRootSelected,
      reportRenameUnavailable,
      selectedEntry
    ]
  );

  // #311: a Command Palette "Create New File / Folder" opens the very same
  // dialog the toolbar opens. The create target still resolves from the
  // current File Explorer selection (or the project root when there is
  // none), so no Palette-specific creation path exists. Consumed once per
  // `token`; the read-only / no-project guard in `openCreateDialog` still
  // applies as a backstop to the command's `when` gate.
  const handledCreateEntryRequestTokenRef = useRef<number | null>(null);
  useEffect(() => {
    if (!createEntryRequest) {
      return;
    }
    if (
      handledCreateEntryRequestTokenRef.current === createEntryRequest.token
    ) {
      return;
    }
    handledCreateEntryRequestTokenRef.current = createEntryRequest.token;
    openCreateDialog(createEntryRequest.kind);
    onCreateEntryRequestHandled?.();
  }, [createEntryRequest, onCreateEntryRequestHandled, openCreateDialog]);

  // #313 / #318: a "Rename" request. A global command (Command Palette /
  // menu / shortcut) carries an explicit `target` (the active editor's
  // project file); a File-Explorer-internal trigger omits it and the
  // selection is used. Either way the extension / dirty-open-document / root
  // preflight runs in `openRenameDialog` before IPC.
  const handledRenameEntryRequestTokenRef = useRef<number | null>(null);
  useEffect(() => {
    if (!renameEntryRequest) {
      return;
    }
    if (
      handledRenameEntryRequestTokenRef.current === renameEntryRequest.token
    ) {
      return;
    }
    handledRenameEntryRequestTokenRef.current = renameEntryRequest.token;
    openRenameDialog(renameEntryRequest.target ?? null);
    onRenameEntryRequestHandled?.();
  }, [renameEntryRequest, onRenameEntryRequestHandled, openRenameDialog]);

  // #344: a file appeared in the project outside the File Explorer's own
  // create / rename / move flows (a Recovery restore writes `.recovered.md`
  // straight to disk). Re-list the affected directories so the stale cached
  // listing is replaced and the tree — plus the #309 active-document reveal —
  // shows the new file. Consumed once per token.
  const handledRefreshDirectoriesTokenRef = useRef<number | null>(null);
  useEffect(() => {
    if (!refreshDirectoriesRequest || !hasProject) {
      return;
    }
    if (
      handledRefreshDirectoriesTokenRef.current ===
      refreshDirectoriesRequest.token
    ) {
      return;
    }
    handledRefreshDirectoriesTokenRef.current = refreshDirectoriesRequest.token;

    const generation = loadGenerationRef.current;
    for (const directoryRelativePath of refreshDirectoriesRequest.directoryRelativePaths) {
      void loadDirectoryForGeneration(directoryRelativePath, generation);
    }
    onRefreshDirectoriesRequestHandled?.();
  }, [
    hasProject,
    loadDirectoryForGeneration,
    onRefreshDirectoriesRequestHandled,
    refreshDirectoriesRequest
  ]);

  const submitCreate = useCallback(
    async (
      kind: FileExplorerCreateKind,
      rawValue: string
    ): Promise<NameInputDialogSubmitResult> => {
      if (!canCreate) {
        return {
          ok: false,
          error: {
            message: translate("explorer.create.error.readOnlyProject")
          }
        };
      }

      // #355: honor the context-menu target override when present; otherwise
      // fall back to the selection-derived folder. Same value the dialog shows.
      const parentRelativePath = effectiveCreateParentDirectory;

      let result: CreateFileExplorerEntryResult;

      try {
        result =
          kind === "file"
            ? await window.pergamum.projects.createFileExplorerMarkdownFile(
                parentRelativePath,
                rawValue
              )
            : await window.pergamum.projects.createFileExplorerFolder(
                parentRelativePath,
                rawValue
              );
      } catch {
        return {
          ok: false,
          error: {
            message: translate("explorer.create.error.unknown"),
            technicalDetails: fileExplorerCreateTechnicalDetails({
              kind,
              reason: "unknown",
              parentRelativePath,
              requestedName: rawValue
            })
          }
        };
      }

      if (!result.ok) {
        const message = translate(
          fileExplorerCreateFailureMessageKey(result.reason)
        );

        if (isFileExplorerCreateValidationReason(result.reason)) {
          return { ok: false, error: { message } };
        }

        return {
          ok: false,
          error: {
            message,
            technicalDetails: fileExplorerCreateTechnicalDetails({
              kind,
              reason: result.reason,
              parentRelativePath,
              requestedName: rawValue
            })
          }
        };
      }

      const newRelativePath = result.entry.relativePath;
      const generation = loadGenerationRef.current;

      // Reload the parent folder so the new entry appears, keeping the
      // rest of the user's expanded tree untouched (#305).
      await loadDirectoryForGeneration(parentRelativePath, generation);

      if (parentRelativePath !== null) {
        setExpandedDirectoryPaths((current) =>
          withSetEntry(current, parentRelativePath)
        );
      }

      selectSingleEntry(newRelativePath);
      closeCreateDialog();

      if (kind === "file") {
        // Open it as a project document — never as a standalone Markdown.
        onActivateDocument(newRelativePath);
      } else {
        setExpandedDirectoryPaths((current) =>
          withSetEntry(current, newRelativePath)
        );
        void loadDirectoryForGeneration(newRelativePath, generation);
      }

      return { ok: true };
    },
    [
      canCreate,
      closeCreateDialog,
      effectiveCreateParentDirectory,
      loadDirectoryForGeneration,
      onActivateDocument,
      selectSingleEntry,
      translate
    ]
  );

  const submitRename = useCallback(
    async (
      targetEntry: FileExplorerEntry,
      rawValue: string
    ): Promise<NameInputDialogSubmitResult> => {
      if (!canRename) {
        return {
          ok: false,
          error: {
            message: translate("explorer.rename.error.readOnlyProject")
          }
        };
      }

      const kind = renameKindForEntry(targetEntry);

      if (
        targetEntry.kind === "file" &&
        isProjectDocumentDirty(targetEntry.relativePath)
      ) {
        return {
          ok: false,
          error: {
            message: translate("explorer.rename.error.openDocumentDirty")
          }
        };
      }

      let result: RenameFileExplorerEntryResult;

      try {
        result = await window.pergamum.projects.renameFileExplorerEntry(
          targetEntry.relativePath,
          rawValue
        );
      } catch {
        return {
          ok: false,
          error: {
            message: translate("explorer.rename.error.unknown"),
            technicalDetails: fileExplorerRenameTechnicalDetails({
              kind,
              reason: "unknown",
              sourceRelativePath: targetEntry.relativePath,
              requestedName: rawValue
            })
          }
        };
      }

      if (!result.ok) {
        const message = translate(
          fileExplorerRenameFailureMessageKey(result.reason)
        );

        if (isFileExplorerRenameValidationReason(result.reason)) {
          return { ok: false, error: { message } };
        }

        return {
          ok: false,
          error: {
            message,
            technicalDetails: fileExplorerRenameTechnicalDetails({
              kind,
              reason: result.reason,
              sourceRelativePath: targetEntry.relativePath,
              requestedName: rawValue
            })
          }
        };
      }

      const wasExpanded =
        targetEntry.kind === "folder" &&
        expandedDirectoryPaths.has(targetEntry.relativePath);
      const generation = loadGenerationRef.current;

      await loadDirectoryForGeneration(
        result.parentDirectoryRelativePath,
        generation
      );

      if (targetEntry.kind === "folder") {
        setEntriesByDirectoryPath((current) => {
          const oldKey = directoryKey(targetEntry.relativePath);
          const newKey = directoryKey(result.newEntry.relativePath);

          if (!Object.prototype.hasOwnProperty.call(current, oldKey)) {
            return current;
          }

          const next = { ...current, [newKey]: current[oldKey] };
          delete next[oldKey];

          return next;
        });

        if (wasExpanded) {
          setExpandedDirectoryPaths((current) => {
            const next = withoutSetEntry(current, targetEntry.relativePath);
            next.add(result.newEntry.relativePath);
            return next;
          });
        }
      }

      selectSingleEntry(result.newEntry.relativePath);
      setRenameDialogTarget(null);

      if (result.newEntry.kind === "file") {
        onProjectDocumentRenamed?.(result.oldRelativePath, result.newEntry);
      }

      return { ok: true };
    },
    [
      canRename,
      expandedDirectoryPaths,
      isProjectDocumentDirty,
      loadDirectoryForGeneration,
      onProjectDocumentRenamed,
      translate
    ]
  );

  // ---------------------------------------------------------------------------
  // #327: context-menu / toolbar Move route. #328: internal Cut / Paste.
  // ---------------------------------------------------------------------------
  const moveSources = useMemo(
    () =>
      resolveFileExplorerMoveSources(
        multiSelection.selected,
        entriesByDirectoryPath
      ),
    [multiSelection.selected, entriesByDirectoryPath]
  );
  // #338/#340: only a DIRTY open project document blocks a Move now — a clean
  // open document moves and its editor identity follows
  // (`onProjectDocumentsMoved`). For a selected FOLDER, a dirty document
  // anywhere in its subtree counts.
  const selectionHasDirtyOpenDocument = useMemo(
    () =>
      selectionCoversDirtyOpenDocument(
        multiSelection.selected,
        dirtyProjectDocumentRelativePaths
      ),
    [multiSelection.selected, dirtyProjectDocumentRelativePaths]
  );
  // UI enablement is a convenience — the backend validation is authoritative.
  // #328/#340: Cut has the exact same gating as Move (files or folders, no
  // dirty docs in scope).
  const canMoveSelection =
    hasProject &&
    !readOnly &&
    !moveInFlight &&
    moveSources.canMove &&
    !selectionHasDirtyOpenDocument;
  const canCutSelection = canMoveSelection;
  // #327 blocker: a single, most-explanatory reason `Move…` is disabled, shown
  // via the menu item's `title`. `null` ⟺ `canMoveSelection`.
  const moveDisabledReason: FileExplorerMoveDisabledReason | null =
    resolveFileExplorerMoveDisabledReason({
      moveInFlight,
      hasProject,
      readOnly,
      entryCount: moveSources.relativePaths.length,
      hasDirtyOpenDocument: selectionHasDirtyOpenDocument
    });
  // #328/#338/#340: whether any pending Cut source is (or contains, for a
  // folder) a DIRTY open document — Paste stays blocked for those.
  const cutSourceHasDirtyOpenDocument = useMemo(() => {
    if (cutState === null) {
      return false;
    }
    return selectionCoversDirtyOpenDocument(
      cutState.sourceRelativePaths,
      dirtyProjectDocumentRelativePaths
    );
  }, [cutState, dirtyProjectDocumentRelativePaths]);
  const canPasteCut =
    hasProject &&
    !readOnly &&
    !moveInFlight &&
    cutState !== null &&
    cutState.sourceRelativePaths.length > 0 &&
    !cutSourceHasDirtyOpenDocument;
  const pasteDisabledReason: FileExplorerPasteDisabledReason | null =
    resolveFileExplorerPasteDisabledReason({
      moveInFlight,
      hasProject,
      readOnly,
      cutSourceCount: cutState?.sourceRelativePaths.length ?? 0,
      cutHasDirtyOpenDocument: cutSourceHasDirtyOpenDocument
    });
  // #328: the pending Cut paths, as a set for the muted-row marker.
  const cutRelativePaths = useMemo(
    () => new Set(cutState?.sourceRelativePaths ?? []),
    [cutState]
  );
  // #329 spike: the dragging paths, as a set for the dragged-row marker.
  const draggingRelativePaths = useMemo(
    () => new Set(dragState?.sourceRelativePaths ?? []),
    [dragState]
  );
  const moveDestinationFolders = useMemo(
    () => collectFileExplorerMoveDestinationFolders(entriesByDirectoryPath),
    [entriesByDirectoryPath]
  );

  // -----------------------------------------------------------------------
  // #351: File Explorer project-local deletion (ADR-0011).
  // -----------------------------------------------------------------------
  const [deleteFlow, setDeleteFlow] =
    useState<FileExplorerDeleteFlowState | null>(null);

  const selectionIsEntirelyProtected =
    moveSources.relativePaths.length > 0 &&
    moveSources.relativePaths.every(isProtectedFileExplorerRelativePath);

  const deleteDisabledReasonKey: TranslationKey | null = !hasProject
    ? "explorer.delete.disabled.noProject"
    : readOnly
      ? "explorer.delete.disabled.readOnlyProject"
      : deleteFlow !== null
        ? "explorer.delete.disabled.deleteInProgress"
        : moveSources.relativePaths.length === 0
          ? "explorer.delete.disabled.emptySelection"
          : selectionHasDirtyOpenDocument
            ? "explorer.delete.disabled.containsDirtyOpenDocument"
            : selectionIsEntirelyProtected
              ? "explorer.delete.disabled.protectedSelected"
              : null;
  const canDeleteSelection = deleteDisabledReasonKey === null;

  const beginDelete = useCallback(async () => {
    if (
      !hasProject ||
      readOnly ||
      deleteFlow !== null ||
      moveDialogOpen ||
      moveFailure !== null ||
      createDialogKind !== null ||
      renameDialogTarget !== null
    ) {
      return;
    }

    const selectedRelativePaths = resolveFileExplorerMoveSources(
      multiSelection.selected,
      entriesByDirectoryPath
    ).relativePaths;

    if (selectedRelativePaths.length === 0) {
      return;
    }

    if (
      selectionCoversDirtyOpenDocument(
        selectedRelativePaths,
        dirtyProjectDocumentRelativePaths
      )
    ) {
      onMoveResultMessage?.(
        translate("explorer.delete.disabled.containsDirtyOpenDocument")
      );
      return;
    }

    setDeleteFlow({ kind: "collecting" });

    let response: Awaited<
      ReturnType<
        typeof window.pergamum.projects.collectFileExplorerDeleteTargets
      >
    >;
    try {
      response = await window.pergamum.projects.collectFileExplorerDeleteTargets(
        { selectedRelativePaths: [...selectedRelativePaths] }
      );
    } catch {
      setDeleteFlow(null);
      onMoveResultMessage?.(translate("explorer.delete.status.nothingDeleted"));
      return;
    }

    if (response.kind === "unavailable") {
      setDeleteFlow(null);
      onMoveResultMessage?.(
        translate(
          response.reason === "readOnlyProject"
            ? "explorer.delete.disabled.readOnlyProject"
            : "explorer.delete.disabled.noProject"
        )
      );
      return;
    }

    if (!response.result.ok) {
      setDeleteFlow({
        kind: "rejected",
        rejections: response.result.rejections
      });
      return;
    }

    setDeleteFlow({
      kind: "confirm",
      targets: response.result.targets,
      fileCount: response.result.fileCount,
      folderCount: response.result.folderCount
    });
  }, [
    createDialogKind,
    dirtyProjectDocumentRelativePaths,
    entriesByDirectoryPath,
    deleteFlow,
    hasProject,
    moveDialogOpen,
    moveFailure,
    multiSelection.selected,
    onMoveResultMessage,
    readOnly,
    renameDialogTarget,
    translate
  ]);

  const deleteEntry = useCallback(
    async (relativePath: string, kind: "file" | "folder") => {
      const response = await window.pergamum.projects.deleteFileExplorerEntry({
        relativePath,
        kind
      });
      return response.kind === "completed"
        ? response.result
        : ({ ok: false, reason: "delete-failed" } as const);
    },
    []
  );

  const handleDeleteRunSettled = useCallback(
    (deletedRelativePaths: readonly string[]) => {
      if (deletedRelativePaths.length === 0) {
        onMoveResultMessage?.(
          translate("explorer.delete.status.nothingDeleted")
        );
        return;
      }

      onEntriesDeleted?.(deletedRelativePaths);

      // Drop the deleted paths (and anything under a deleted folder) from the
      // multi-selection and from the per-directory listing cache; re-list the
      // affected parent directories.
      const deletedSet = new Set(deletedRelativePaths);
      const isDeleted = (relativePath: string): boolean =>
        deletedSet.has(relativePath) ||
        deletedRelativePaths.some((deleted) =>
          relativePath.startsWith(`${deleted}/`)
        );

      setMultiSelection((current) => {
        const nextSelected = new Set<string>();
        for (const relativePath of current.selected) {
          if (!isDeleted(relativePath)) {
            nextSelected.add(relativePath);
          }
        }
        return { selected: nextSelected, anchor: current.anchor };
      });

      setEntriesByDirectoryPath((current) => {
        const next: Record<string, FileExplorerEntry[]> = {};
        for (const [key, entries] of Object.entries(current)) {
          if (key !== "" && isDeleted(key)) {
            continue;
          }
          next[key] = entries;
        }
        return next;
      });

      const parents = new Set<string>();
      for (const deleted of deletedRelativePaths) {
        const slashIndex = deleted.lastIndexOf("/");
        parents.add(slashIndex === -1 ? "" : deleted.slice(0, slashIndex));
      }
      const generation = loadGenerationRef.current + 1;
      loadGenerationRef.current = generation;
      for (const parent of parents) {
        void loadDirectoryForGeneration(parent === "" ? null : parent, generation);
      }

      onMoveResultMessage?.(
        translate("explorer.delete.status.completed", {
          deleted: deletedRelativePaths.length
        })
      );
    },
    [
      loadDirectoryForGeneration,
      onEntriesDeleted,
      onMoveResultMessage,
      translate
    ]
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleEntryContextMenu = useCallback(
    (
      event: ReactMouseEvent<HTMLElement>,
      entry: FileExplorerEntry | null
    ) => {
      // Always suppress the OS menu inside the File Explorer tree.
      event.preventDefault();

      if (entry !== null) {
        // Right-click on a selected entry keeps the multi-selection;
        // right-click on a non-selected entry replaces it with that entry.
        setMultiSelection((current) =>
          current.selected.has(entry.relativePath)
            ? current
            : replaceFileExplorerSelection(current, entry.relativePath)
        );
        setSelection({ kind: "entry", relativePath: entry.relativePath });
      }
      // For the project root row / empty list area (`entry === null`) the
      // selection is left untouched — the menu still opens so `Move…` (and
      // its disabled reason) stays discoverable.

      // #355: the create target — project root for the root row / empty area,
      // the clicked folder for a folder row, and no create items for a file
      // row. Independent of the selection so a folder-row create always lands
      // in that folder even though the right-click also selected it.
      const createTarget =
        entry === null
          ? ({ kind: "root" } as const)
          : entry.kind === "folder"
            ? ({ kind: "folder", relativePath: entry.relativePath } as const)
            : null;

      setContextMenu({ x: event.clientX, y: event.clientY, createTarget });
    },
    []
  );

  // #327/#328: turn a completed Move IPC response into tree refreshes, a
  // selection update, and a status line. Shared by the Move route and the
  // #328 Paste route. Returns whether the filesystem may have changed
  // (`"applied"` ⟺ validation passed) so a caller can clear its own state.
  const applyMoveResponse = useCallback(
    (
      response: Awaited<
        ReturnType<typeof window.pergamum.projects.moveFileExplorerEntries>
      >,
      destinationFolderRelativePath: string
    ): "applied" | "not-applied" => {
      if (response.kind === "unavailable") {
        onMoveResultMessage?.(translate("explorer.move.status.unavailable"));
        return "not-applied";
      }

      const { result } = response;
      const destinationLabel =
        destinationFolderRelativePath === ""
          ? translate("explorer.move.destination.projectRoot")
          : destinationFolderRelativePath;

      if (!result.ok && result.validation.ok === false) {
        // Validation rejected (dry run): nothing changed on disk — nothing was
        // moved, merged, or overwritten. Surface every rejected item in the
        // failure-list modal (#340 blocker), and keep the status line as
        // secondary feedback.
        const firstReason =
          result.validation.errors[0]?.reason ?? "invalid-path";
        setMoveFailure({
          status: "rejected",
          entries: result.validation.errors.map((error) => ({
            reason: error.reason,
            sourceRelativePath: error.sourceRelativePath ?? null
          }))
        });
        onMoveResultMessage?.(
          translate("explorer.move.status.validationFailed", {
            reason: firstReason
          })
        );
        return "not-applied";
      }

      // Validation passed → the filesystem may have changed. Refresh the tree
      // and both the (previous) source parents and the destination folder.
      const movedTargets = result.results
        .filter((entry) => entry.status === "moved")
        .map((entry) => entry.destinationRelativePath);
      const movedFailedCount = result.results.filter(
        (entry) => entry.status === "failed"
      ).length;

      // #338/#340: follow open editor identity for every project document
      // that ACTUALLY moved — a moved file's own path, and, for a moved
      // folder, every registered document in its subtree. The host no-ops
      // for any old path that is not open.
      const relocations = collectMovedProjectDocumentRelocations(result);
      if (relocations.length > 0) {
        onProjectDocumentsMoved?.(relocations);
      }
      const generation = loadGenerationRef.current + 1;
      loadGenerationRef.current = generation;

      // #340: a moved folder relocates a whole subtree — its old directory
      // keys (cache) and any expanded state under the old path are now stale.
      const movedFolderPairs = result.results
        .filter(
          (entry): entry is Extract<typeof entry, { status: "moved" }> =>
            entry.status === "moved" && entry.isDirectory
        )
        .map((entry) => ({
          from: entry.sourceRelativePath,
          to: entry.destinationRelativePath
        }));

      if (movedFolderPairs.length > 0) {
        const isUnderMovedFolder = (
          directoryKeyPath: string
        ): { from: string; to: string } | undefined =>
          movedFolderPairs.find(
            (pair) =>
              directoryKeyPath === pair.from ||
              directoryKeyPath.startsWith(`${pair.from}/`)
          );

        setEntriesByDirectoryPath((current) => {
          let changed = false;
          const next: Record<string, FileExplorerEntry[]> = {};
          for (const [key, entries] of Object.entries(current)) {
            if (key !== "" && isUnderMovedFolder(key)) {
              // Drop the stale key — the new location loads lazily on expand
              // / reveal.
              changed = true;
              continue;
            }
            next[key] = entries;
          }
          return changed ? next : current;
        });

        setExpandedDirectoryPaths((current) => {
          let changed = false;
          const next = new Set<string>();
          for (const dir of current) {
            const pair = isUnderMovedFolder(dir);
            if (pair) {
              changed = true;
              next.add(pair.to + dir.slice(pair.from.length));
            } else {
              next.add(dir);
            }
          }
          return changed ? next : current;
        });
      }

      const reloadDirectories = new Set<string | null>([
        destinationFolderRelativePath === ""
          ? null
          : destinationFolderRelativePath
      ]);
      for (const entry of result.results) {
        reloadDirectories.add(
          parentDirectoryRelativePath(entry.sourceRelativePath)
        );
      }
      // #340: reload each moved folder's NEW location so its re-keyed
      // expansion has fresh children.
      for (const pair of movedFolderPairs) {
        reloadDirectories.add(pair.to);
      }
      for (const directory of reloadDirectories) {
        void loadDirectoryForGeneration(directory, generation);
      }

      // Never leave the selection pointing at old source paths.
      if (movedTargets.length > 0) {
        setMultiSelection({
          selected: new Set(movedTargets),
          anchor: movedTargets[movedTargets.length - 1] ?? null
        });
        setSelection({
          kind: "entry",
          relativePath: movedTargets[movedTargets.length - 1]
        });
      } else {
        setMultiSelection(createEmptyFileExplorerSelection());
        setSelection(null);
      }

      if (result.ok) {
        onMoveResultMessage?.(
          translate("explorer.move.status.succeeded", {
            count: movedTargets.length,
            destination: destinationLabel
          })
        );
      } else if (movedTargets.length === 0) {
        onMoveResultMessage?.(
          translate("explorer.move.status.allFailed", {
            failed: movedFailedCount
          })
        );
      } else {
        onMoveResultMessage?.(
          translate("explorer.move.status.partiallyFailed", {
            moved: movedTargets.length,
            failed: movedFailedCount
          })
        );
      }

      // Execution failure (wet run): the same failure-list modal carries the
      // items that did not land, whether the whole batch failed or only part.
      if (movedFailedCount > 0) {
        setMoveFailure({
          status: movedTargets.length > 0 ? "partiallyFailed" : "failed",
          entries: result.results
            .filter(
              (entry): entry is Extract<typeof entry, { status: "failed" }> =>
                entry.status === "failed"
            )
            .map((entry) => ({
              reason: entry.reason,
              sourceRelativePath: entry.sourceRelativePath
            }))
        });
      }

      return "applied";
    },
    [
      loadDirectoryForGeneration,
      onMoveResultMessage,
      onProjectDocumentsMoved,
      translate
    ]
  );

  const performMove = useCallback(
    async (destinationFolderRelativePath: string) => {
      const sources = resolveFileExplorerMoveSources(
        multiSelection.selected,
        entriesByDirectoryPath
      );

      // #327/#338: re-assert every gate at execution time — the selection or
      // its dirty state can change while the destination picker is open. Only
      // a DIRTY open document is rejected here; a clean open document moves and
      // its editor identity follows (`onProjectDocumentsMoved`).
      if (
        !hasProject ||
        readOnly ||
        moveInFlight ||
        !sources.canMove ||
        selectionHasDirtyOpenDocument
      ) {
        onMoveResultMessage?.(translate("explorer.move.status.unavailable"));
        return;
      }

      setMoveInFlight(true);
      let response: Awaited<
        ReturnType<typeof window.pergamum.projects.moveFileExplorerEntries>
      >;

      try {
        response = await window.pergamum.projects.moveFileExplorerEntries({
          sourceRelativePaths: sources.relativePaths,
          destinationFolderRelativePath,
          dirtyProjectDocumentRelativePaths: [
            ...dirtyProjectDocumentRelativePaths
          ]
        });
      } catch {
        setMoveInFlight(false);
        onMoveResultMessage?.(translate("explorer.move.status.unavailable"));
        return;
      }

      setMoveInFlight(false);
      applyMoveResponse(response, destinationFolderRelativePath);
    },
    [
      applyMoveResponse,
      dirtyProjectDocumentRelativePaths,
      entriesByDirectoryPath,
      hasProject,
      moveInFlight,
      multiSelection.selected,
      onMoveResultMessage,
      readOnly,
      selectionHasDirtyOpenDocument,
      translate
    ]
  );

  // #328: snapshot the current selection as the pending Cut. No filesystem
  // work — the next Paste calls the existing Move IPC. A disabled Cut is a
  // silent no-op (the menu item's `title` explains why).
  const performCut = useCallback(() => {
    const sources = resolveFileExplorerMoveSources(
      multiSelection.selected,
      entriesByDirectoryPath
    );

    if (
      !hasProject ||
      readOnly ||
      moveInFlight ||
      !sources.canMove ||
      selectionHasDirtyOpenDocument
    ) {
      return;
    }

    setCutState({
      sourceRelativePaths: sources.relativePaths,
      createdAt: Date.now()
    });
  }, [
    entriesByDirectoryPath,
    hasProject,
    moveInFlight,
    multiSelection.selected,
    readOnly,
    selectionHasDirtyOpenDocument
  ]);

  // #328: move the pending Cut sources into the folder resolved from the
  // primary selection. Reuses the Move IPC and `applyMoveResponse`.
  const performPaste = useCallback(async () => {
    if (cutState === null || cutState.sourceRelativePaths.length === 0) {
      onMoveResultMessage?.(translate("explorer.move.status.unavailable"));
      return;
    }

    const cutHasDirtyOpenDocument = selectionCoversDirtyOpenDocument(
      cutState.sourceRelativePaths,
      dirtyProjectDocumentRelativePaths
    );

    // Re-assert every gate at execution time (same rule as `performMove`).
    // #338/#340: only a DIRTY open document (in a cut file, or inside a cut
    // folder's subtree) is rejected — a clean open document Pastes and its
    // editor identity follows (`onProjectDocumentsMoved`).
    if (!hasProject || readOnly || moveInFlight || cutHasDirtyOpenDocument) {
      onMoveResultMessage?.(translate("explorer.move.status.unavailable"));
      return;
    }

    const destinationFolderRelativePath = resolveFileExplorerPasteDestination(
      selection,
      entriesByDirectoryPath
    );

    setMoveInFlight(true);
    let response: Awaited<
      ReturnType<typeof window.pergamum.projects.moveFileExplorerEntries>
    >;

    try {
      response = await window.pergamum.projects.moveFileExplorerEntries({
        sourceRelativePaths: [...cutState.sourceRelativePaths],
        destinationFolderRelativePath,
        dirtyProjectDocumentRelativePaths: [...dirtyProjectDocumentRelativePaths]
      });
    } catch {
      setMoveInFlight(false);
      onMoveResultMessage?.(translate("explorer.move.status.unavailable"));
      return;
    }

    setMoveInFlight(false);
    const outcome = applyMoveResponse(response, destinationFolderRelativePath);

    // #328 v1 rule: a fully- OR partially-applied Paste clears the pending
    // Cut. Pending state is kept only when nothing moved — a validation
    // failure or an unavailable gate — so the user can retry.
    if (outcome === "applied") {
      setCutState(null);
    }
  }, [
    applyMoveResponse,
    cutState,
    dirtyProjectDocumentRelativePaths,
    entriesByDirectoryPath,
    hasProject,
    moveInFlight,
    onMoveResultMessage,
    readOnly,
    selection,
    translate
  ]);

  // #328: Ctrl/Cmd+X / Ctrl/Cmd+V, only while focus is inside the tree. The
  // handler is scoped to the tree subtree, so an editor / input / preview
  // keystroke never reaches it; it also bails during IME composition and
  // while a File Explorer modal dialog owns the keyboard.
  const handleTreeShortcutKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
        return;
      }

      // Defensive: never shadow a real text-editing surface (the tree has
      // none, but a future inline rename input might live here).
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, [contenteditable='true']") != null
      ) {
        return;
      }

      // A File Explorer modal dialog owns the keyboard while it is open.
      if (
        moveDialogOpen ||
        moveFailure !== null ||
        createDialogKind !== null ||
        renameDialogTarget !== null ||
        deleteFlow !== null
      ) {
        return;
      }

      // #351: DEL runs the SAME delete command as the context menu — it
      // always goes through the confirmation dialog, never a silent delete.
      if (event.key === "Delete" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        void beginDelete();
        return;
      }

      const usesPrimaryModifier =
        (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;
      if (!usesPrimaryModifier) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "x") {
        event.preventDefault();
        performCut();
        return;
      }
      if (key === "v") {
        event.preventDefault();
        void performPaste();
      }
    },
    [
      beginDelete,
      createDialogKind,
      deleteFlow,
      moveDialogOpen,
      moveFailure,
      performCut,
      performPaste,
      renameDialogTarget
    ]
  );

  // -------------------------------------------------------------------------
  // #329 spike: native HTML5 Drag & Drop route.
  //
  // Deliberately thin: `dragstart` builds the sources (reusing the Move / Cut
  // resolver + a re-check), stamps a private MIME as the gesture carrier, and
  // records renderer-authoritative drag state. `dragover` / `drop` consult
  // that state (never the DataTransfer payload) and reuse `applyMoveResponse`.
  // See `fileExplorerMoveDestinations.ts` for the pure helpers this leans on.
  // -------------------------------------------------------------------------
  const performDndMove = useCallback(
    async (
      sourceRelativePaths: readonly string[],
      destinationFolderRelativePath: string
    ) => {
      const sourcesHaveDirtyOpenDocument = selectionCoversDirtyOpenDocument(
        sourceRelativePaths,
        dirtyProjectDocumentRelativePaths
      );

      // Re-check every safety gate at drop time — the same rule the Move and
      // Paste routes apply. #338/#340: only a DIRTY open document (in a
      // dragged file, or inside a dragged folder's subtree) is rejected. The
      // backend stays authoritative regardless.
      if (
        !hasProject ||
        readOnly ||
        moveInFlight ||
        sourceRelativePaths.length === 0 ||
        sourcesHaveDirtyOpenDocument
      ) {
        onMoveResultMessage?.(translate("explorer.move.status.unavailable"));
        return;
      }

      setMoveInFlight(true);
      let response: Awaited<
        ReturnType<typeof window.pergamum.projects.moveFileExplorerEntries>
      >;

      try {
        response = await window.pergamum.projects.moveFileExplorerEntries({
          sourceRelativePaths: [...sourceRelativePaths],
          destinationFolderRelativePath,
          dirtyProjectDocumentRelativePaths: [
            ...dirtyProjectDocumentRelativePaths
          ]
        });
      } catch {
        setMoveInFlight(false);
        onMoveResultMessage?.(translate("explorer.move.status.unavailable"));
        return;
      }

      setMoveInFlight(false);
      applyMoveResponse(response, destinationFolderRelativePath);
    },
    [
      applyMoveResponse,
      dirtyProjectDocumentRelativePaths,
      hasProject,
      moveInFlight,
      onMoveResultMessage,
      readOnly,
      translate
    ]
  );

  const handleEntryDragStart = useCallback(
    (event: ReactDragEvent<HTMLElement>, entry: FileExplorerEntry) => {
      // #340: file AND folder rows are drag sources. Only the project root
      // row (handled separately) and an exotic node are not.
      if (entry.kind !== "file" && entry.kind !== "folder") {
        event.preventDefault();
        return;
      }

      const isSelected = multiSelection.selected.has(entry.relativePath);

      // Match right-click semantics: a drag from a non-selected row makes that
      // row the whole selection first.
      if (!isSelected) {
        setSelection({ kind: "entry", relativePath: entry.relativePath });
        setMultiSelection((current) =>
          replaceFileExplorerSelection(current, entry.relativePath)
        );
      }

      const sources = resolveFileExplorerDragSources(
        {
          relativePath: entry.relativePath,
          kind: entry.kind,
          isSelected
        },
        multiSelection.selected,
        entriesByDirectoryPath
      );
      const sourcesHaveDirtyOpenDocument = selectionCoversDirtyOpenDocument(
        sources.sourceRelativePaths,
        dirtyProjectDocumentRelativePaths
      );

      if (
        !hasProject ||
        readOnly ||
        moveInFlight ||
        !sources.canDrag ||
        sourcesHaveDirtyOpenDocument
      ) {
        // Cancel the drag before it starts — the project root, an unknown
        // row, a DIRTY open document (#338/#340: including one inside a
        // dragged folder), and a read-only project never begin a movable drag.
        event.preventDefault();
        return;
      }

      event.dataTransfer.setData(
        FILE_EXPLORER_MOVE_DND_MIME,
        JSON.stringify(sources.sourceRelativePaths)
      );
      event.dataTransfer.effectAllowed = "move";
      setDragState({
        sourceRelativePaths: sources.sourceRelativePaths,
        startedAt: Date.now()
      });
    },
    [
      dirtyProjectDocumentRelativePaths,
      entriesByDirectoryPath,
      hasProject,
      moveInFlight,
      multiSelection.selected,
      readOnly
    ]
  );

  const handleEntryDragEnd = useCallback(() => {
    setDragState(null);
    setDropTarget(null);
  }, []);

  const dropTargetForEntry = useCallback(
    (entry: FileExplorerEntry | null): FileExplorerDropTarget =>
      entry === null
        ? { kind: "root" }
        : {
            kind: "entry",
            relativePath: entry.relativePath,
            entryKind: entry.kind
          },
    []
  );

  const handleRowDragOver = useCallback(
    (event: ReactDragEvent<HTMLElement>, entry: FileExplorerEntry | null) => {
      if (dragState === null) {
        return; // not our drag — leave the browser's default (no drop)
      }

      const destination = resolveFileExplorerDropDestination(
        dropTargetForEntry(entry)
      );
      const valid =
        destination !== null &&
        isValidFileExplorerDropTarget({
          dragSourceRelativePaths: dragState.sourceRelativePaths,
          destinationFolderRelativePath: destination
        });

      if (valid && destination !== null) {
        // preventDefault here is what makes the element a drop target.
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropTarget({ path: destination, valid: true });
      } else {
        setDropTarget({
          path: entry === null ? "" : entry.relativePath,
          valid: false
        });
      }
    },
    [dragState, dropTargetForEntry]
  );

  const handleRowDragLeave = useCallback(() => {
    // A continuous `dragover` re-establishes the marker immediately, so a
    // blunt clear is enough for the spike.
    setDropTarget(null);
  }, []);

  const handleRowDrop = useCallback(
    (event: ReactDragEvent<HTMLElement>, entry: FileExplorerEntry | null) => {
      event.preventDefault();

      const activeDrag = dragState;
      setDragState(null);
      setDropTarget(null);

      if (activeDrag === null) {
        return; // unknown / external drag — ignore silently
      }

      const destination = resolveFileExplorerDropDestination(
        dropTargetForEntry(entry)
      );
      if (
        destination === null ||
        !isValidFileExplorerDropTarget({
          dragSourceRelativePaths: activeDrag.sourceRelativePaths,
          destinationFolderRelativePath: destination
        })
      ) {
        return; // invalid target — no-op, no status noise
      }

      void performDndMove(activeDrag.sourceRelativePaths, destination);
    },
    [dragState, dropTargetForEntry, performDndMove]
  );

  return (
    <>
      <FileExplorerView
        projectName={project?.name ?? null}
        rootEntries={entriesByDirectoryPath[rootDirectoryKey] ?? []}
        entriesByDirectoryPath={entriesByDirectoryPath}
        expandedDirectoryPaths={expandedDirectoryPaths}
        loadingDirectoryPaths={loadingForView}
        unavailableDirectoryPaths={unavailableDirectoryPaths}
        isRootSelected={isRootSelected}
        selectedRelativePath={selectedRelativePath}
        selectedPaths={multiSelection.selected}
        visibleOrder={visibleOrder}
        highlightedRelativePath={project ? highlightedRelativePath : null}
        canCreate={canCreate}
        canMove={canMoveSelection}
        moveDisabledReasonLabel={
          moveDisabledReason
            ? translate(MOVE_DISABLED_REASON_MESSAGE_KEY[moveDisabledReason])
            : undefined
        }
        cutRelativePaths={cutRelativePaths}
        draggingRelativePaths={draggingRelativePaths}
        isProjectDocumentDirty={isProjectDocumentDirty}
        dropTargetPath={dropTarget?.path ?? null}
        dropTargetValid={dropTarget?.valid ?? false}
        translate={translate}
        activeDocumentEntryRef={setActiveDocumentEntryElement}
        registerRowElement={registerRowElement}
        registerRootElement={registerRootElement}
        onReload={reloadCurrentExplorerContext}
        onNewFile={() => openCreateDialog("file")}
        onNewFolder={() => openCreateDialog("folder")}
        onMove={() => setMoveDialogOpen(true)}
        onToggleDirectory={toggleDirectory}
        onSelectRoot={selectRoot}
        onSelectEntry={selectSingleEntry}
        onToggleEntrySelection={toggleEntrySelection}
        onExtendEntrySelection={extendEntrySelection}
        onEntryKeyDown={handleTreeEntryKeyDown}
        onRootKeyDown={handleRootKeyDown}
        onEntryContextMenu={handleEntryContextMenu}
        onTreeShortcutKeyDown={handleTreeShortcutKeyDown}
        onEntryDragStart={handleEntryDragStart}
        onEntryDragEnd={handleEntryDragEnd}
        onRowDragOver={handleRowDragOver}
        onRowDragLeave={handleRowDragLeave}
        onRowDrop={handleRowDrop}
        onActivateDocument={onActivateDocument}
      />
      {contextMenu !== null ? (
        <div
          className="fileExplorerContextMenuBackdrop"
          onClick={closeContextMenu}
          onContextMenu={(event) => {
            event.preventDefault();
            closeContextMenu();
          }}
        >
          <div
            className="fileExplorerContextMenu"
            role="menu"
            aria-label={translate("explorer.contextMenu.label")}
            style={
              {
                "--file-explorer-context-menu-x": `${contextMenu.x}px`,
                "--file-explorer-context-menu-y": `${contextMenu.y}px`
              } as CSSProperties
            }
            onClick={(event) => event.stopPropagation()}
          >
            {contextMenu.createTarget !== null
              ? (["file", "folder"] as const).map((createKind) => {
                  const target = contextMenu.createTarget;
                  return (
                    <button
                      key={`create-${createKind}`}
                      type="button"
                      role="menuitem"
                      className="fileExplorerContextMenuItem"
                      data-file-explorer-context-command={
                        createKind === "file" ? "new-file" : "new-folder"
                      }
                      disabled={!canCreate}
                      aria-disabled={!canCreate}
                      title={
                        canCreate
                          ? undefined
                          : translate("explorer.create.error.readOnlyProject")
                      }
                      onClick={() => {
                        closeContextMenu();
                        if (canCreate && target !== null) {
                          openCreateDialog(
                            createKind,
                            target.kind === "root"
                              ? null
                              : target.relativePath
                          );
                        }
                      }}
                    >
                      {translate(
                        createKind === "file"
                          ? "explorer.contextMenu.newFile"
                          : "explorer.contextMenu.newFolder"
                      )}
                    </button>
                  );
                })
              : null}
            <button
              type="button"
              role="menuitem"
              className="fileExplorerContextMenuItem"
              data-file-explorer-context-command="move"
              data-file-explorer-move-disabled-reason={
                moveDisabledReason ?? undefined
              }
              disabled={!canMoveSelection}
              aria-disabled={!canMoveSelection}
              title={
                moveDisabledReason
                  ? translate(
                      MOVE_DISABLED_REASON_MESSAGE_KEY[moveDisabledReason]
                    )
                  : undefined
              }
              onClick={() => {
                closeContextMenu();
                if (canMoveSelection) {
                  setMoveDialogOpen(true);
                }
              }}
            >
              {translate("explorer.contextMenu.move")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="fileExplorerContextMenuItem"
              data-file-explorer-context-command="cut"
              data-file-explorer-cut-disabled-reason={
                moveDisabledReason ?? undefined
              }
              disabled={!canCutSelection}
              aria-disabled={!canCutSelection}
              title={
                moveDisabledReason
                  ? translate(
                      CUT_DISABLED_REASON_MESSAGE_KEY[moveDisabledReason]
                    )
                  : undefined
              }
              onClick={() => {
                closeContextMenu();
                if (canCutSelection) {
                  performCut();
                }
              }}
            >
              {translate("explorer.contextMenu.cut")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="fileExplorerContextMenuItem"
              data-file-explorer-context-command="paste"
              data-file-explorer-paste-disabled-reason={
                pasteDisabledReason ?? undefined
              }
              disabled={!canPasteCut}
              aria-disabled={!canPasteCut}
              title={
                pasteDisabledReason
                  ? translate(
                      PASTE_DISABLED_REASON_MESSAGE_KEY[pasteDisabledReason]
                    )
                  : undefined
              }
              onClick={() => {
                closeContextMenu();
                if (canPasteCut) {
                  void performPaste();
                }
              }}
            >
              {translate("explorer.contextMenu.paste")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="fileExplorerContextMenuItem"
              data-file-explorer-context-command="delete"
              data-file-explorer-delete-disabled-reason={
                deleteDisabledReasonKey ?? undefined
              }
              disabled={!canDeleteSelection}
              aria-disabled={!canDeleteSelection}
              title={
                deleteDisabledReasonKey
                  ? translate(deleteDisabledReasonKey)
                  : undefined
              }
              onClick={() => {
                closeContextMenu();
                if (canDeleteSelection) {
                  void beginDelete();
                }
              }}
            >
              {translate("explorer.contextMenu.delete")}
            </button>
          </div>
        </div>
      ) : null}
      {deleteFlow?.kind === "confirm" ? (
        <FileExplorerDeleteDialog
          targets={deleteFlow.targets}
          fileCount={deleteFlow.fileCount}
          folderCount={deleteFlow.folderCount}
          translate={translate}
          opener={null}
          deleteEntry={deleteEntry}
          onRunSettled={handleDeleteRunSettled}
          onDismiss={() => setDeleteFlow(null)}
        />
      ) : null}
      {deleteFlow?.kind === "rejected" ? (
        <FileOperationFailureDialog
          title={translate("explorer.delete.rejectDialog.title")}
          intro={translate("explorer.delete.rejectDialog.intro")}
          items={deleteFlow.rejections.map((rejection) => {
            const kind: FileOperationFailureItemKind =
              rejection.selectedPath === ""
                ? "item"
                : (fileExplorerEntryByRelativePath(
                      entriesByDirectoryPath,
                      rejection.selectedPath
                    )?.kind ?? "item");

            return {
              kind,
              displayName:
                rejection.selectedPath === ""
                  ? null
                  : rejection.selectedPath,
              reasonText: translate(
                fileExplorerDeleteRejectionReasonKey(rejection.reason),
                rejection.offendingPath
                  ? { offendingPath: rejection.offendingPath }
                  : undefined
              )
            };
          })}
          translate={translate}
          opener={null}
          onClose={() => setDeleteFlow(null)}
        />
      ) : null}
      {moveDialogOpen ? (
        <MoveDestinationDialog
          folderRelativePaths={moveDestinationFolders}
          sourceCount={moveSources.relativePaths.length}
          translate={translate}
          opener={null}
          onCancel={() => setMoveDialogOpen(false)}
          onConfirm={(destinationFolderRelativePath) => {
            setMoveDialogOpen(false);
            void performMove(destinationFolderRelativePath);
          }}
        />
      ) : null}
      {moveFailure !== null ? (
        <FileOperationFailureDialog
          title={translate("fileOperation.move.failed.title")}
          intro={translate("fileOperation.move.failed.intro")}
          items={moveFailure.entries.map((entry) => {
            const kind: FileOperationFailureItemKind =
              entry.sourceRelativePath === null
                ? "item"
                : (fileExplorerEntryByRelativePath(
                      entriesByDirectoryPath,
                      entry.sourceRelativePath
                    )?.kind ?? "item");

            return {
              kind,
              displayName: entry.sourceRelativePath,
              reasonText: translate(
                fileOperationFailureReasonTextKey(entry.reason)
              )
            };
          })}
          translate={translate}
          opener={null}
          onClose={() => setMoveFailure(null)}
        />
      ) : null}
      {createDialogKind !== null ? (
        <NameInputDialog
          key={createDialogKind}
          title={translate(
            createDialogKind === "file"
              ? "explorer.newFile.title"
              : "explorer.newFolder.title"
          )}
          description={translate(
            createDialogKind === "file"
              ? "explorer.newFile.description"
              : "explorer.newFolder.description"
          )}
          inputLabel={translate(
            createDialogKind === "file"
              ? "explorer.newFile.inputLabel"
              : "explorer.newFolder.inputLabel"
          )}
          placeholder={translate(
            createDialogKind === "file"
              ? "explorer.newFile.placeholder"
              : "explorer.newFolder.placeholder"
          )}
          primaryLabel={translate(
            createDialogKind === "file"
              ? "explorer.newFile.primary"
              : "explorer.newFolder.primary"
          )}
          contextLabel={translate("explorer.create.target.label")}
          contextValue={
            effectiveCreateParentDirectory === null ||
            effectiveCreateParentDirectory === ""
              ? translate("explorer.create.target.projectRoot")
              : effectiveCreateParentDirectory
          }
          icon={{
            url: createDialogKind === "file" ? filePlusIconUrl : folderPlusIconUrl
          }}
          translate={translate}
          clipboardAdapter={clipboardAdapter}
          opener={null}
          validateName={createFileExplorerNameValidator(
            createDialogKind,
            translate
          )}
          onSubmit={(rawValue) => submitCreate(createDialogKind, rawValue)}
          onClose={closeCreateDialog}
        />
      ) : null}
      {renameDialogTarget !== null ? (
        <NameInputDialog
          key={`rename:${renameDialogTarget.relativePath}`}
          title={translate(
            renameDialogTarget.kind === "file"
              ? "explorer.rename.file.title"
              : "explorer.rename.folder.title"
          )}
          description={translate(
            renameDialogTarget.kind === "file"
              ? "explorer.rename.file.description"
              : "explorer.rename.folder.description"
          )}
          inputLabel={translate(
            renameDialogTarget.kind === "file"
              ? "explorer.rename.file.inputLabel"
              : "explorer.rename.folder.inputLabel"
          )}
          initialValue={renameDialogTarget.name}
          primaryLabel={translate(
            renameDialogTarget.kind === "file"
              ? "explorer.rename.file.primary"
              : "explorer.rename.folder.primary"
          )}
          contextLabel={translate("explorer.rename.context.label")}
          contextValue={renameDialogTarget.relativePath}
          icon={{
            url:
              renameDialogTarget.kind === "file"
                ? documentTextIconUrl
                : folderIconUrl
          }}
          translate={translate}
          clipboardAdapter={clipboardAdapter}
          opener={null}
          validateName={createFileExplorerRenameNameValidator(
            {
              kind: renameKindForEntry(renameDialogTarget),
              originalName: renameDialogTarget.name
            },
            translate
          )}
          onSubmit={(rawValue) => submitRename(renameDialogTarget, rawValue)}
          onClose={() => setRenameDialogTarget(null)}
        />
      ) : null}
    </>
  );
}

const EMPTY_SELECTED_PATHS: ReadonlySet<string> = new Set();
const EMPTY_VISIBLE_ORDER: readonly string[] = [];
const EMPTY_STRING_LIST: readonly string[] = [];

/**
 * #328: the pending internal Cut — a snapshot of the File Explorer selection,
 * moved by the next Paste. Never on the OS clipboard; scoped to the current
 * project (cleared on remount / project switch).
 */
interface FileExplorerCutState {
  readonly sourceRelativePaths: readonly string[];
  readonly createdAt: number;
}

/**
 * #329 spike: the in-progress native drag. Renderer-authoritative — the drop
 * handler trusts this, not the DataTransfer payload. Cleared on
 * `dragend` / `drop` / project switch.
 */
interface FileExplorerDragState {
  readonly sourceRelativePaths: readonly string[];
  readonly startedAt: number;
}

/**
 * #327 blocker: the localized reason a disabled `Move…` / `Cut` / `Paste`
 * shows in its `title`. `FileExplorerMoveDisabledReason` is shared by Move and
 * Cut (identical gating); Paste has its own taxonomy.
 */
const MOVE_DISABLED_REASON_MESSAGE_KEY: Record<
  FileExplorerMoveDisabledReason,
  TranslationKey
> = {
  "move-in-progress": "explorer.move.disabled.moveInProgress",
  "no-project": "explorer.move.disabled.noProject",
  "read-only-project": "explorer.move.disabled.readOnlyProject",
  "empty-selection": "explorer.move.disabled.emptySelection",
  "contains-dirty-open-document":
    "explorer.move.disabled.containsDirtyOpenDocument"
};

const CUT_DISABLED_REASON_MESSAGE_KEY: Record<
  FileExplorerMoveDisabledReason,
  TranslationKey
> = {
  "move-in-progress": "explorer.cut.disabled.moveInProgress",
  "no-project": "explorer.cut.disabled.noProject",
  "read-only-project": "explorer.cut.disabled.readOnlyProject",
  "empty-selection": "explorer.cut.disabled.emptySelection",
  "contains-dirty-open-document":
    "explorer.cut.disabled.containsDirtyOpenDocument"
};

const PASTE_DISABLED_REASON_MESSAGE_KEY: Record<
  FileExplorerPasteDisabledReason,
  TranslationKey
> = {
  "move-in-progress": "explorer.paste.disabled.moveInProgress",
  "no-project": "explorer.paste.disabled.noProject",
  "read-only-project": "explorer.paste.disabled.readOnlyProject",
  "no-cut-sources": "explorer.paste.disabled.noCutSources",
  "contains-dirty-open-document":
    "explorer.paste.disabled.containsDirtyOpenDocument"
};

export function FileExplorerView({
  projectName,
  rootEntries,
  entriesByDirectoryPath,
  expandedDirectoryPaths,
  loadingDirectoryPaths,
  unavailableDirectoryPaths,
  isRootSelected,
  selectedRelativePath,
  selectedPaths = EMPTY_SELECTED_PATHS,
  visibleOrder = EMPTY_VISIBLE_ORDER,
  highlightedRelativePath,
  canCreate,
  canMove = false,
  moveDisabledReasonLabel,
  cutRelativePaths = EMPTY_SELECTED_PATHS,
  draggingRelativePaths = EMPTY_SELECTED_PATHS,
  isProjectDocumentDirty = () => false,
  dropTargetPath = null,
  dropTargetValid = false,
  translate,
  activeDocumentEntryRef,
  registerRowElement,
  registerRootElement,
  onReload,
  onNewFile,
  onNewFolder,
  onMove,
  onToggleDirectory,
  onSelectRoot,
  onSelectEntry,
  onToggleEntrySelection,
  onExtendEntrySelection,
  onEntryKeyDown,
  onRootKeyDown,
  onEntryContextMenu,
  onTreeShortcutKeyDown,
  onEntryDragStart,
  onEntryDragEnd,
  onRowDragOver,
  onRowDragLeave,
  onRowDrop,
  onActivateDocument
}: FileExplorerViewProps): JSX.Element {
  const dropTargetState = (path: string): "valid" | "invalid" | undefined =>
    dropTargetPath === path
      ? dropTargetValid
        ? "valid"
        : "invalid"
      : undefined;
  // #323: roving tabindex — exactly one row in the tree is tabbable. The
  // primary/focused entry when it is on screen, otherwise the project root.
  const primaryInView =
    selectedRelativePath !== null &&
    visibleOrder.includes(selectedRelativePath);
  const rootIsTabStop = isRootSelected || !primaryInView;

  const renderEntry = (entry: FileExplorerEntry, depth: number): JSX.Element => {
    const isExpanded =
      entry.kind === "folder" &&
      expandedDirectoryPaths.has(entry.relativePath);
    const isHighlighted =
      entry.kind === "file" && entry.relativePath === highlightedRelativePath;
    const isSelected = selectedPaths.has(entry.relativePath);
    const isPrimary = entry.relativePath === selectedRelativePath;
    const isCut = cutRelativePaths.has(entry.relativePath);
    const isDragging = draggingRelativePaths.has(entry.relativePath);
    // #342: only file rows can be dirty project documents.
    const isDirtyFile =
      entry.kind === "file" && isProjectDocumentDirty(entry.relativePath);
    const dropState = dropTargetState(entry.relativePath);
    const isOpenable = isOpenableFileExplorerEntry(entry);
    const icon = iconForEntry(entry, expandedDirectoryPaths);
    const childKey = directoryKey(entry.relativePath);
    const childEntries = entriesByDirectoryPath[childKey] ?? [];

    return (
      <div key={entry.relativePath}>
        <button
          type="button"
          ref={(element) => {
            registerRowElement?.(entry.relativePath, element);

            if (isHighlighted) {
              activeDocumentEntryRef?.(element);
            }
          }}
          role="treeitem"
          tabIndex={isPrimary ? 0 : -1}
          aria-expanded={entry.kind === "folder" ? isExpanded : undefined}
          aria-selected={isSelected}
          aria-current={isHighlighted ? "page" : undefined}
          data-selected={isSelected ? "true" : undefined}
          data-file-explorer-primary={isPrimary ? "true" : undefined}
          data-file-explorer-entry-kind={entry.kind}
          data-file-explorer-entry-path={entry.relativePath}
          data-file-explorer-openable={isOpenable ? "true" : undefined}
          data-file-explorer-cut={isCut ? "true" : undefined}
          data-file-explorer-dragging={isDragging ? "true" : undefined}
          data-file-explorer-dirty={isDirtyFile ? "true" : undefined}
          data-file-explorer-drop-target={dropState}
          draggable={
            entry.kind === "file" || entry.kind === "folder" ? true : undefined
          }
          className={
            [
              "fileExplorerItem",
              entry.kind === "folder" ? "isFolder" : "isFile",
              isHighlighted ? "isActive" : null,
              isSelected ? "isSelected" : null,
              isCut ? "isCut" : null,
              isDragging ? "isDragging" : null,
              isDirtyFile ? "isDirty" : null,
              dropState === "valid" ? "isDropTarget" : null
            ]
              .filter(Boolean)
              .join(" ")
          }
          title={entry.relativePath}
          style={
            {
              "--file-explorer-indent": `${8 + depth * 16}px`
            } as CSSProperties
          }
          onKeyDown={(event) => onEntryKeyDown?.(event, entry)}
          onContextMenu={(event) => {
            // Stop the list-container handler below from also firing for a
            // row right-click.
            event.stopPropagation();
            onEntryContextMenu?.(event, entry);
          }}
          onDragStart={(event) => onEntryDragStart?.(event, entry)}
          onDragEnd={(event) => onEntryDragEnd?.(event)}
          onDragOver={(event) => onRowDragOver?.(event, entry)}
          onDragLeave={(event) => onRowDragLeave?.(event, entry)}
          onDrop={(event) => onRowDrop?.(event, entry)}
          onClick={(event) => {
            const extendRange = event?.shiftKey ?? false;
            const toggle =
              !extendRange &&
              ((event?.metaKey ?? false) || (event?.ctrlKey ?? false));

            if (extendRange) {
              onExtendEntrySelection?.(entry.relativePath);
              // Selection-only gesture — never opens / expands.
              return;
            }

            if (toggle) {
              onToggleEntrySelection?.(entry.relativePath);
              return;
            }

            onSelectEntry(entry.relativePath);

            if (entry.kind === "folder") {
              onToggleDirectory(entry.relativePath);
              return;
            }

            if (isOpenable) {
              onActivateDocument(entry.relativePath);
            }
          }}
        >
          <img
            className="fileExplorerIcon"
            src={icon.url}
            alt=""
            aria-hidden="true"
            data-file-explorer-icon={icon.name}
          />
          <span className="fileExplorerItemLabel">{entry.name}</span>
          {isDirtyFile ? (
            <img
              className="fileExplorerDirtyIndicator"
              src={pencilOutlineIconUrl}
              alt={translate("explorer.unsavedChanges")}
              title={translate("explorer.unsavedChanges")}
              data-file-explorer-dirty-indicator="true"
            />
          ) : null}
        </button>
        {entry.kind === "folder" && isExpanded ? (
          <div role="group">
            {loadingDirectoryPaths.has(childKey) ? (
              <div
                className="fileExplorerInlineStatus"
                role="status"
                style={
                  {
                    "--file-explorer-indent": `${8 + (depth + 1) * 16}px`
                  } as CSSProperties
                }
              >
                {translate("explorer.loading")}
              </div>
            ) : null}
            {unavailableDirectoryPaths.has(childKey) ? (
              <div
                className="fileExplorerInlineStatus isError"
                style={
                  {
                    "--file-explorer-indent": `${8 + (depth + 1) * 16}px`
                  } as CSSProperties
                }
              >
                {translate("explorer.folderUnavailable")}
              </div>
            ) : null}
            {!loadingDirectoryPaths.has(childKey) &&
            !unavailableDirectoryPaths.has(childKey)
              ? childEntries.map((child) => renderEntry(child, depth + 1))
              : null}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <aside
      className="fileExplorer"
      aria-label={translate("explorer.projectFiles")}
    >
      <div className="fileExplorerHeader">
        <span>{translate("explorer.files")}</span>
        <div
          className="fileExplorerToolbar"
          aria-label={translate("explorer.toolbar")}
        >
          <button
            type="button"
            className="fileExplorerToolbarButton"
            title={translate("explorer.reload")}
            aria-label={translate("explorer.reload")}
            disabled={!projectName}
            onClick={onReload}
          >
            <img
              src={refreshIconUrl}
              alt=""
              aria-hidden="true"
              className="fileExplorerToolbarIcon"
            />
          </button>
          <button
            type="button"
            className="fileExplorerToolbarButton"
            title={translate("explorer.newFile")}
            aria-label={translate("explorer.newFile")}
            disabled={!canCreate}
            onClick={onNewFile}
          >
            <img
              src={filePlusIconUrl}
              alt=""
              aria-hidden="true"
              className="fileExplorerToolbarIcon"
            />
          </button>
          <button
            type="button"
            className="fileExplorerToolbarButton"
            title={translate("explorer.newFolder")}
            aria-label={translate("explorer.newFolder")}
            disabled={!canCreate}
            onClick={onNewFolder}
          >
            <img
              src={folderPlusIconUrl}
              alt=""
              aria-hidden="true"
              className="fileExplorerToolbarIcon"
            />
          </button>
          <button
            type="button"
            className="fileExplorerToolbarButton"
            data-file-explorer-toolbar-command="move"
            title={
              canMove
                ? translate("explorer.contextMenu.move")
                : (moveDisabledReasonLabel ??
                  translate("explorer.contextMenu.move"))
            }
            aria-label={translate("explorer.contextMenu.move")}
            disabled={!canMove}
            aria-disabled={!canMove}
            onClick={() => onMove?.()}
          >
            <img
              src={moveIconUrl}
              alt=""
              aria-hidden="true"
              className="fileExplorerToolbarIcon"
            />
          </button>
        </div>
      </div>
      {!projectName ? (
        <div className="fileExplorerEmpty">{translate("explorer.noProject")}</div>
      ) : (
        <div
          className="fileExplorerList"
          role="tree"
          aria-multiselectable="true"
          aria-label={translate("explorer.fileTree")}
          onContextMenu={(event) => onEntryContextMenu?.(event, null)}
          onKeyDown={(event) => onTreeShortcutKeyDown?.(event)}
        >
          <button
            type="button"
            ref={(element) => registerRootElement?.(element)}
            onContextMenu={(event) => {
              event.stopPropagation();
              onEntryContextMenu?.(event, null);
            }}
            className={
              [
                "fileExplorerRoot",
                isRootSelected ? "isSelected" : null,
                dropTargetState("") === "valid" ? "isDropTarget" : null
              ]
                .filter(Boolean)
                .join(" ")
            }
            role="treeitem"
            tabIndex={rootIsTabStop ? 0 : -1}
            aria-expanded="true"
            aria-selected={isRootSelected}
            data-selected={isRootSelected ? "true" : undefined}
            data-file-explorer-entry-kind="root"
            data-file-explorer-entry-path=""
            data-file-explorer-drop-target={dropTargetState("")}
            title={projectName}
            onKeyDown={(event) => onRootKeyDown?.(event)}
            onClick={onSelectRoot}
            onDragOver={(event) => onRowDragOver?.(event, null)}
            onDragLeave={(event) => onRowDragLeave?.(event, null)}
            onDrop={(event) => onRowDrop?.(event, null)}
          >
            <img
              className="fileExplorerIcon fileExplorerProjectIcon"
              src={pergamumProjectIconUrl}
              alt=""
              aria-hidden="true"
              data-file-explorer-icon="pergamum-project"
            />
            <span className="fileExplorerItemLabel">{projectName}</span>
          </button>
          <div role="group">
            {loadingDirectoryPaths.has(rootDirectoryKey) ? (
              <div
                className="fileExplorerInlineStatus"
                role="status"
                style={{ "--file-explorer-indent": "24px" } as CSSProperties}
              >
                {translate("explorer.loading")}
              </div>
            ) : null}
            {unavailableDirectoryPaths.has(rootDirectoryKey) ? (
              <div
                className="fileExplorerInlineStatus isError"
                style={{ "--file-explorer-indent": "24px" } as CSSProperties}
              >
                {translate("explorer.folderUnavailable")}
              </div>
            ) : null}
            {!loadingDirectoryPaths.has(rootDirectoryKey) &&
            !unavailableDirectoryPaths.has(rootDirectoryKey) &&
            rootEntries.length === 0 ? (
              <div
                className="fileExplorerEmpty"
                style={{ "--file-explorer-indent": "24px" } as CSSProperties}
              >
                {translate("explorer.empty")}
              </div>
            ) : null}
            {!loadingDirectoryPaths.has(rootDirectoryKey) &&
            !unavailableDirectoryPaths.has(rootDirectoryKey)
              ? rootEntries.map((entry) => renderEntry(entry, 1))
              : null}
          </div>
        </div>
      )}
    </aside>
  );
}
