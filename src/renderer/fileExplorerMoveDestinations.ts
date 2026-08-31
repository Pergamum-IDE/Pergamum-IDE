/**
 * #327: pure helpers for the File Explorer context-menu Move route.
 *
 *   - `collectFileExplorerMoveDestinationFolders` builds the destination
 *     folder picker's list from the tree data the File Explorer has already
 *     loaded (project root + every known folder). It does NOT hit the
 *     filesystem; folders inside never-expanded directories are simply not
 *     listed yet — the backend still validates the chosen destination.
 *   - `resolveFileExplorerMoveSources` turns a multi-selection into Move
 *     sources and reports whether the selection is movable in v1 (files
 *     only, non-empty).
 *
 * No React / DOM here so both are cheap to unit test.
 */

import type { FileExplorerEntry } from "../shared/api";

/** The project root, as the Move backend expects it. */
export const FILE_EXPLORER_MOVE_ROOT_DESTINATION = "";

/**
 * Every folder path known to the File Explorer right now, plus the project
 * root (`""`), sorted and de-duplicated. Suitable as the destination picker
 * option list.
 */
export function collectFileExplorerMoveDestinationFolders(
  entriesByDirectoryPath: Readonly<Record<string, FileExplorerEntry[]>>
): string[] {
  const folders = new Set<string>();

  for (const entries of Object.values(entriesByDirectoryPath)) {
    for (const entry of entries) {
      if (entry.kind === "folder") {
        folders.add(entry.relativePath);
      }
    }
  }

  return [
    FILE_EXPLORER_MOVE_ROOT_DESTINATION,
    ...[...folders].sort((left, right) => left.localeCompare(right))
  ];
}

export interface FileExplorerMoveSources {
  /** Project-root-relative paths of the selected FILES, in `localeCompare`
   *  path order. */
  readonly relativePaths: readonly string[];
  /** `true` when the selection has at least one folder — Move v1 is files
   *  only, so the UI disables `Move…` then. */
  readonly hasFolder: boolean;
  /** `true` when there is at least one movable file source. */
  readonly canMove: boolean;
}

/**
 * Resolve a multi-selection (a set of entry paths) into Move sources. Entry
 * kinds come from the loaded tree data; a selected path with no known entry
 * is treated conservatively as a folder (unknown → not movable).
 */
export function resolveFileExplorerMoveSources(
  selectedPaths: ReadonlySet<string>,
  entriesByDirectoryPath: Readonly<Record<string, FileExplorerEntry[]>>
): FileExplorerMoveSources {
  const kindByPath = new Map<string, FileExplorerEntry["kind"]>();

  for (const entries of Object.values(entriesByDirectoryPath)) {
    for (const entry of entries) {
      kindByPath.set(entry.relativePath, entry.kind);
    }
  }

  const orderedSelectedPaths = [...selectedPaths].sort((left, right) =>
    left.localeCompare(right)
  );
  const relativePaths: string[] = [];
  let hasFolder = false;

  for (const selectedPath of orderedSelectedPaths) {
    if (kindByPath.get(selectedPath) === "file") {
      relativePaths.push(selectedPath);
    } else {
      // folder, or an unknown path we cannot prove is a file
      hasFolder = true;
    }
  }

  return {
    relativePaths,
    hasFolder,
    canMove: relativePaths.length > 0 && !hasFolder
  };
}
