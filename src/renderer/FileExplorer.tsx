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
  FileExplorerEntry,
  ListFileExplorerChildrenResult,
  PergamumProject
} from "../shared/api";
import type { Translate } from "../shared/i18n";

interface FileExplorerProps {
  project: PergamumProject | null;
  highlightedRelativePath: string | null;
  translate: Translate;
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
  translate: Translate;
  onReload: () => void;
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
  onActivateDocument
}: FileExplorerProps): JSX.Element {
  const [entriesByDirectoryPath, setEntriesByDirectoryPath] = useState<
    Record<string, FileExplorerEntry[]>
  >({});
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

  return (
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
      translate={translate}
      onReload={reloadCurrentExplorerContext}
      onToggleDirectory={toggleDirectory}
      onSelectRoot={selectRoot}
      onSelectEntry={selectEntry}
      onActivateDocument={onActivateDocument}
    />
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
  translate,
  onReload,
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
            disabled
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
            disabled
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
