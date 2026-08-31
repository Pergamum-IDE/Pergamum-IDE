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
  /** #327: a short, already-localized status line for a Move attempt. */
  onMoveResultMessage?: (message: string) => void;
  onActivateDocument: (relativePath: string) => void;
}

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
  isProjectDocumentDirty = () => false,
  onProjectDocumentRenamed,
  onProjectDocumentsMoved,
  onRenameUnavailable,
  dirtyProjectDocumentRelativePaths = EMPTY_STRING_LIST,
  onMoveResultMessage,
  onActivateDocument
}: FileExplorerProps): JSX.Element {
  const [entriesByDirectoryPath, setEntriesByDirectoryPath] = useState<
    Record<string, FileExplorerEntry[]>
  >({});
  const [createDialogKind, setCreateDialogKind] =
    useState<FileExplorerCreateKind | null>(null);
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
  // #327: File Explorer item context menu (a single `Move…` command) and the
  // destination-folder picker it opens.
  const [contextMenu, setContextMenu] = useState<{
    readonly x: number;
    readonly y: number;
  } | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveInFlight, setMoveInFlight] = useState(false);
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

  // #309: reveal the active project document. When the active editor is a
  // project document, `highlightedRelativePath` is its project-relative path
  // (it is `null` for every non-project editor — standalone Markdown,
  // Untitled, glossary — so those clear the highlight and reveal nothing).
  // This walks the ancestor folder chain, lazily loading each folder and
  // then expanding it, until the document is reachable in the tree. It never
  // touches the File Explorer selection (that state drives #307 create
  // targets), never collapses folders, and reloads only the document's own
  // ancestors. Each load is generation-guarded by `loadDirectoryForGeneration`,
  // so a late result after a project switch or close is discarded (#305).
  useEffect(() => {
    if (!hasProject || !highlightedRelativePath) {
      return;
    }

    if (
      isFileExplorerEntryRevealed(
        entriesByDirectoryPath,
        expandedDirectoryPaths,
        highlightedRelativePath
      )
    ) {
      return;
    }

    const ancestorDirectoryPaths = ancestorDirectoryRelativePaths(
      highlightedRelativePath
    );

    for (const directoryPath of [null, ...ancestorDirectoryPaths]) {
      const key = directoryKey(directoryPath);

      if (unavailableDirectoryPaths.has(key)) {
        // The chain is broken — the document cannot be revealed. Stop rather
        // than retry-loop the same unreadable folder.
        return;
      }

      if (!hasDirectoryEntries(entriesByDirectoryPath, directoryPath)) {
        if (!loadingDirectoryPaths.has(key)) {
          void loadDirectoryForGeneration(
            directoryPath,
            loadGenerationRef.current
          );
        }
        // Wait for the load to land; this effect re-runs and continues the
        // walk from the next unloaded ancestor.
        return;
      }
    }

    // Every ancestor is loaded — expand them so the document renders. Only
    // adds paths; never removes, so the user's other tree state is untouched.
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
  }, [
    entriesByDirectoryPath,
    expandedDirectoryPaths,
    hasProject,
    highlightedRelativePath,
    loadDirectoryForGeneration,
    loadingDirectoryPaths,
    unavailableDirectoryPaths
  ]);

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

  const openCreateDialog = useCallback(
    (kind: FileExplorerCreateKind) => {
      if (!canCreate) {
        return;
      }
      setCreateDialogKind(kind);
    },
    [canCreate]
  );

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

      const parentRelativePath = resolveFileExplorerCreateParentDirectory({
        entriesByDirectoryPath,
        isRootSelected,
        selectedRelativePath
      });

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
      setCreateDialogKind(null);

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
      entriesByDirectoryPath,
      isRootSelected,
      loadDirectoryForGeneration,
      onActivateDocument,
      selectSingleEntry,
      selectedRelativePath,
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
  // #338: only a DIRTY open project document blocks a Move now — a clean open
  // document moves and its editor identity follows (`onProjectDocumentsMoved`).
  const selectionHasDirtyOpenDocument = useMemo(() => {
    const dirtySet = new Set(dirtyProjectDocumentRelativePaths);
    return [...multiSelection.selected].some((path) => dirtySet.has(path));
  }, [multiSelection.selected, dirtyProjectDocumentRelativePaths]);
  // UI enablement is a convenience — the backend validation is authoritative.
  // #328: Cut has the exact same gating as Move (files only, no dirty docs).
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
      hasFolder: moveSources.hasFolder,
      fileCount: moveSources.relativePaths.length,
      hasDirtyOpenDocument: selectionHasDirtyOpenDocument
    });
  // #328/#338: whether any pending Cut source is a DIRTY open document — Paste
  // stays blocked for those (a clean open document Pastes and its editor
  // identity follows).
  const cutSourceHasDirtyOpenDocument = useMemo(() => {
    if (cutState === null) {
      return false;
    }
    const dirtySet = new Set(dirtyProjectDocumentRelativePaths);
    return cutState.sourceRelativePaths.some((path) => dirtySet.has(path));
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

      setContextMenu({ x: event.clientX, y: event.clientY });
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
        // Validation failure: nothing changed on disk — do not refresh as a
        // success, just report minimally.
        const firstReason =
          result.validation.errors[0]?.reason ?? "invalid-path";
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

      // #338: follow open editor identity for every file that ACTUALLY moved
      // (moved entries only — never a validation failure / unavailable / a
      // failed entry). The host no-ops for any old path that is not open.
      const relocations = collectMovedProjectDocumentRelocations(result);
      if (relocations.length > 0) {
        onProjectDocumentsMoved?.(relocations);
      }
      const generation = loadGenerationRef.current + 1;
      loadGenerationRef.current = generation;

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

    const dirtySet = new Set(dirtyProjectDocumentRelativePaths);
    const cutHasDirtyOpenDocument = cutState.sourceRelativePaths.some((path) =>
      dirtySet.has(path)
    );

    // Re-assert every gate at execution time (same rule as `performMove`).
    // #338: only a DIRTY open document is rejected — a clean open document
    // Pastes and its editor identity follows (`onProjectDocumentsMoved`).
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

      const usesPrimaryModifier =
        (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;
      if (!usesPrimaryModifier) {
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
        createDialogKind !== null ||
        renameDialogTarget !== null
      ) {
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
      createDialogKind,
      moveDialogOpen,
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
      const dirtySet = new Set(dirtyProjectDocumentRelativePaths);
      const sourcesHaveDirtyOpenDocument = sourceRelativePaths.some((path) =>
        dirtySet.has(path)
      );

      // Re-check every safety gate at drop time — the same rule the Move and
      // Paste routes apply. #338: only a DIRTY open document is rejected. The
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
      if (entry.kind !== "file") {
        // Folder Move is out of scope — a folder row never starts a drag and
        // never disturbs the selection.
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
      const dirtySet = new Set(dirtyProjectDocumentRelativePaths);
      const sourcesHaveDirtyOpenDocument = sources.sourceRelativePaths.some(
        (path) => dirtySet.has(path)
      );

      if (
        !hasProject ||
        readOnly ||
        moveInFlight ||
        !sources.canDrag ||
        sourcesHaveDirtyOpenDocument
      ) {
        // Cancel the drag before it starts — folders, mixed selections,
        // DIRTY open documents (#338), and read-only projects never begin a
        // movable drag.
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
          </div>
        </div>
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
            createParentDirectory ??
            translate("explorer.create.target.projectRoot")
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
          onClose={() => setCreateDialogKind(null)}
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
  "contains-folder": "explorer.move.disabled.containsFolder",
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
  "contains-folder": "explorer.cut.disabled.containsFolder",
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
          data-file-explorer-drop-target={dropState}
          draggable={entry.kind === "file" ? true : undefined}
          className={
            [
              "fileExplorerItem",
              entry.kind === "folder" ? "isFolder" : "isFile",
              isHighlighted ? "isActive" : null,
              isSelected ? "isSelected" : null,
              isCut ? "isCut" : null,
              isDragging ? "isDragging" : null,
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
