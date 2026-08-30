import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { CSSProperties } from "react";
import pergamumProjectIconUrl from "../../assets/icons/file-associations/pergamum/pergamum-scroll-file-icon.svg?url";
import filePlusIconUrl from "../../assets/icons/feather/explorer/file-plus.svg?url";
import folderPlusIconUrl from "../../assets/icons/feather/explorer/folder-plus.svg?url";
import documentTextIconUrl from "../../assets/icons/ionicons/explorer/document-text-outline.svg?url";
import folderOpenIconUrl from "../../assets/icons/ionicons/explorer/folder-open-outline.svg?url";
import folderIconUrl from "../../assets/icons/ionicons/explorer/folder-outline.svg?url";
import refreshIconUrl from "../../assets/icons/ionicons/explorer/refresh-outline.svg?url";
import type {
  CreateFileExplorerEntryResult,
  FileExplorerEntry,
  ListFileExplorerChildrenResult,
  PergamumProject
} from "../shared/api";
import { isFileExplorerCreateValidationReason } from "../shared/fileExplorerCreate";
import type { Translate } from "../shared/i18n";
import {
  navigatorClipboardAdapter,
  type ClipboardAdapter
} from "./dialog/clipboardAdapter";
import {
  NameInputDialog,
  type NameInputDialogSubmitResult
} from "./dialog/NameInputDialog";
import {
  createFileExplorerNameValidator,
  fileExplorerCreateFailureMessageKey,
  fileExplorerCreateTechnicalDetails,
  type FileExplorerCreateKind
} from "./fileExplorerCreateMessages";

/**
 * #311: an external request (from the Command Palette) to open the same
 * "New File" / "New Folder" dialog the toolbar opens. `token` changes on
 * every request so a repeated command re-opens the dialog.
 */
export interface FileExplorerCreateEntryRequest {
  kind: FileExplorerCreateKind;
  token: number;
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
  selectedRelativePath: string | null;
  highlightedRelativePath: string | null;
  canCreate: boolean;
  translate: Translate;
  /** #311: attached to the active project document entry once it is
   *  rendered, so the container can scroll it into view. */
  activeDocumentEntryRef?: (element: HTMLButtonElement | null) => void;
  onReload: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onToggleDirectory: (relativePath: string) => void;
  onSelectRoot: () => void;
  onSelectEntry: (relativePath: string) => void;
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
  onActivateDocument
}: FileExplorerProps): JSX.Element {
  const [entriesByDirectoryPath, setEntriesByDirectoryPath] = useState<
    Record<string, FileExplorerEntry[]>
  >({});
  const [createDialogKind, setCreateDialogKind] =
    useState<FileExplorerCreateKind | null>(null);
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

  const selectRoot = useCallback(() => {
    setSelection({ kind: "root" });
  }, []);

  const selectEntry = useCallback((relativePath: string) => {
    setSelection({ kind: "entry", relativePath });
  }, []);

  const toggleDirectory = useCallback(
    (relativePath: string) => {
      if (expandedDirectoryPaths.has(relativePath)) {
        setExpandedDirectoryPaths((current) =>
          withoutSetEntry(current, relativePath)
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

      setSelection({ kind: "entry", relativePath: newRelativePath });
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
      selectedRelativePath,
      translate
    ]
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
        highlightedRelativePath={project ? highlightedRelativePath : null}
        canCreate={canCreate}
        translate={translate}
        activeDocumentEntryRef={setActiveDocumentEntryElement}
        onReload={reloadCurrentExplorerContext}
        onNewFile={() => openCreateDialog("file")}
        onNewFolder={() => openCreateDialog("folder")}
        onToggleDirectory={toggleDirectory}
        onSelectRoot={selectRoot}
        onSelectEntry={selectEntry}
        onActivateDocument={onActivateDocument}
      />
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
    </>
  );
}

export function FileExplorerView({
  projectName,
  rootEntries,
  entriesByDirectoryPath,
  expandedDirectoryPaths,
  loadingDirectoryPaths,
  unavailableDirectoryPaths,
  isRootSelected,
  selectedRelativePath,
  highlightedRelativePath,
  canCreate,
  translate,
  activeDocumentEntryRef,
  onReload,
  onNewFile,
  onNewFolder,
  onToggleDirectory,
  onSelectRoot,
  onSelectEntry,
  onActivateDocument
}: FileExplorerViewProps): JSX.Element {
  const renderEntry = (entry: FileExplorerEntry, depth: number): JSX.Element => {
    const isExpanded =
      entry.kind === "folder" &&
      expandedDirectoryPaths.has(entry.relativePath);
    const isHighlighted =
      entry.kind === "file" && entry.relativePath === highlightedRelativePath;
    const isSelected = entry.relativePath === selectedRelativePath;
    const isOpenable = isOpenableFileExplorerEntry(entry);
    const icon = iconForEntry(entry, expandedDirectoryPaths);
    const childKey = directoryKey(entry.relativePath);
    const childEntries = entriesByDirectoryPath[childKey] ?? [];

    return (
      <div key={entry.relativePath}>
        <button
          type="button"
          ref={isHighlighted ? activeDocumentEntryRef : undefined}
          role="treeitem"
          aria-expanded={entry.kind === "folder" ? isExpanded : undefined}
          aria-current={isHighlighted ? "page" : undefined}
          data-selected={isSelected ? "true" : undefined}
          data-file-explorer-entry-kind={entry.kind}
          data-file-explorer-entry-path={entry.relativePath}
          data-file-explorer-openable={isOpenable ? "true" : undefined}
          className={
            [
              "fileExplorerItem",
              entry.kind === "folder" ? "isFolder" : "isFile",
              isHighlighted ? "isActive" : null,
              isSelected ? "isSelected" : null
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
          onClick={() => {
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
        </div>
      </div>
      {!projectName ? (
        <div className="fileExplorerEmpty">{translate("explorer.noProject")}</div>
      ) : (
        <div
          className="fileExplorerList"
          role="tree"
          aria-label={translate("explorer.fileTree")}
        >
          <button
            type="button"
            className={
              ["fileExplorerRoot", isRootSelected ? "isSelected" : null]
                .filter(Boolean)
                .join(" ")
            }
            role="treeitem"
            aria-expanded="true"
            data-selected={isRootSelected ? "true" : undefined}
            data-file-explorer-entry-kind="root"
            data-file-explorer-entry-path=""
            title={projectName}
            onClick={onSelectRoot}
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
