/**
 * #327/#328: pure helpers for the File Explorer Move / Cut-Paste routes.
 *
 *   - `collectFileExplorerMoveDestinationFolders` builds the destination
 *     folder picker's list from the tree data the File Explorer has already
 *     loaded (project root + every known folder). It does NOT hit the
 *     filesystem; folders inside never-expanded directories are simply not
 *     listed yet — the backend still validates the chosen destination.
 *   - `resolveFileExplorerMoveSources` turns a multi-selection into Move
 *     sources and reports whether the selection is movable in v1 (files
 *     only, non-empty).
 *   - `resolveFileExplorerMoveDisabledReason` / `resolveFileExplorerPaste…`
 *     pick the single most-explanatory reason a Move / Cut / Paste is
 *     unavailable (shown as the menu item's `title`).
 *   - `resolveFileExplorerPasteDestination` (#328) maps the File Explorer's
 *     primary selection to the folder a Paste drops the pending Cut into.
 *
 * No React / DOM here so all of them are cheap to unit test.
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

/**
 * #327 blocker / #328: why a Move (context menu / toolbar) or a Cut is
 * disabled. Exactly one is chosen (most-explanatory first); `null` means the
 * action is allowed. Move and Cut share this taxonomy — their gating is
 * identical.
 */
export type FileExplorerMoveDisabledReason =
  | "move-in-progress"
  | "no-project"
  | "read-only-project"
  | "empty-selection"
  | "contains-folder"
  | "contains-open-document";

export function resolveFileExplorerMoveDisabledReason(input: {
  readonly moveInFlight: boolean;
  readonly hasProject: boolean;
  readonly readOnly: boolean;
  readonly hasFolder: boolean;
  readonly fileCount: number;
  readonly hasOpenDocument: boolean;
}): FileExplorerMoveDisabledReason | null {
  if (input.moveInFlight) {
    return "move-in-progress";
  }
  if (!input.hasProject) {
    return "no-project";
  }
  if (input.readOnly) {
    return "read-only-project";
  }
  if (input.hasFolder) {
    return "contains-folder";
  }
  if (input.fileCount === 0) {
    return "empty-selection";
  }
  if (input.hasOpenDocument) {
    return "contains-open-document";
  }
  return null;
}

/**
 * #328: why a Paste is disabled. `no-cut-sources` replaces the selection
 * reasons — a Paste depends on the pending Cut, not the current selection.
 */
export type FileExplorerPasteDisabledReason =
  | "move-in-progress"
  | "no-project"
  | "read-only-project"
  | "no-cut-sources"
  | "contains-open-document";

export function resolveFileExplorerPasteDisabledReason(input: {
  readonly moveInFlight: boolean;
  readonly hasProject: boolean;
  readonly readOnly: boolean;
  readonly cutSourceCount: number;
  readonly cutHasOpenDocument: boolean;
}): FileExplorerPasteDisabledReason | null {
  if (input.moveInFlight) {
    return "move-in-progress";
  }
  if (!input.hasProject) {
    return "no-project";
  }
  if (input.readOnly) {
    return "read-only-project";
  }
  if (input.cutSourceCount === 0) {
    return "no-cut-sources";
  }
  if (input.cutHasOpenDocument) {
    return "contains-open-document";
  }
  return null;
}

/**
 * #328: the File Explorer's primary (single, keyboard-focused) selection —
 * the project root, one entry, or nothing.
 */
export type FileExplorerPrimarySelection =
  | { readonly kind: "root" }
  | { readonly kind: "entry"; readonly relativePath: string }
  | null;

/**
 * #328: the destination folder a Paste drops the pending Cut sources into,
 * derived from the primary selection:
 *
 *   - project root selected / nothing selected → `""` (project root)
 *   - a folder selected                        → that folder's path
 *   - a file selected (or an unknown path)     → that path's parent folder
 *
 * The backend still validates the result (same-parent, conflict, …).
 */
export function resolveFileExplorerPasteDestination(
  primarySelection: FileExplorerPrimarySelection,
  entriesByDirectoryPath: Readonly<Record<string, FileExplorerEntry[]>>
): string {
  if (primarySelection === null || primarySelection.kind === "root") {
    return FILE_EXPLORER_MOVE_ROOT_DESTINATION;
  }

  const { relativePath } = primarySelection;

  let kind: FileExplorerEntry["kind"] | undefined;
  for (const entries of Object.values(entriesByDirectoryPath)) {
    const match = entries.find((entry) => entry.relativePath === relativePath);
    if (match) {
      kind = match.kind;
      break;
    }
  }

  if (kind === "folder") {
    return relativePath;
  }

  const slashIndex = relativePath.lastIndexOf("/");
  return slashIndex === -1
    ? FILE_EXPLORER_MOVE_ROOT_DESTINATION
    : relativePath.slice(0, slashIndex);
}
