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
 *   - `resolveFileExplorerDragSources` / `resolveFileExplorerDropDestination` /
 *     `isValidFileExplorerDropTarget` (#329 spike) are the drag-and-drop
 *     equivalents — the native-HTML5-D&D route is a thin shell over these.
 *
 * No React / DOM here so all of them are cheap to unit test.
 */

import type { FileExplorerEntry } from "../shared/api";

/** The project root, as the Move backend expects it. */
export const FILE_EXPLORER_MOVE_ROOT_DESTINATION = "";

/**
 * #329 spike: the private DataTransfer MIME the File Explorer's own drag uses.
 * It only ever carries project-relative paths (never an absolute path, never
 * an OS file-drop format), and the drop handler prefers the renderer's own
 * drag state over reading it back.
 */
export const FILE_EXPLORER_MOVE_DND_MIME =
  "application/x-pergamum-file-explorer-move";

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

// ---------------------------------------------------------------------------
// #329 spike: native HTML5 Drag & Drop helpers.
//
// These carry the whole viability question — the renderer route is a thin
// shell that calls them, sets a private DataTransfer MIME as the gesture
// carrier, and re-checks safety here before touching the Move IPC.
// ---------------------------------------------------------------------------

/** The row a drag started from. `isSelected` matches the #322 multi-selection. */
export interface FileExplorerDragOrigin {
  readonly relativePath: string;
  readonly kind: FileExplorerEntry["kind"];
  readonly isSelected: boolean;
}

export interface FileExplorerDragSources {
  /** Project-root-relative paths of the FILES the drag would move. */
  readonly sourceRelativePaths: readonly string[];
  /** `true` when a movable drag may start (files only, non-empty). */
  readonly canDrag: boolean;
}

/**
 * #329: resolve the Move sources for a drag.
 *
 *   - dragging a folder / unknown row → never movable
 *   - dragging a selected file        → the whole current multi-selection
 *   - dragging a non-selected file    → just that file (the caller also
 *     replaces the selection with it, matching right-click semantics)
 *
 * Reuses `resolveFileExplorerMoveSources`, so a selection that mixes in a
 * folder or an unknown path is not draggable — same rule as Move / Cut.
 */
export function resolveFileExplorerDragSources(
  origin: FileExplorerDragOrigin,
  selectedPaths: ReadonlySet<string>,
  entriesByDirectoryPath: Readonly<Record<string, FileExplorerEntry[]>>
): FileExplorerDragSources {
  if (origin.kind !== "file") {
    return { sourceRelativePaths: [], canDrag: false };
  }

  const effectiveSelection = origin.isSelected
    ? selectedPaths
    : new Set<string>([origin.relativePath]);
  const move = resolveFileExplorerMoveSources(
    effectiveSelection,
    entriesByDirectoryPath
  );

  return { sourceRelativePaths: move.relativePaths, canDrag: move.canMove };
}

/** A drop target row: the project root, a rendered entry, or nothing. */
export type FileExplorerDropTarget =
  | { readonly kind: "root" }
  | {
      readonly kind: "entry";
      readonly relativePath: string;
      readonly entryKind: FileExplorerEntry["kind"];
    }
  | { readonly kind: "none" };

/**
 * #329: the destination folder a drop resolves to, or `null` when the target
 * cannot accept a Move drop (a file row, the empty area). Folder Move is out
 * of scope, so only folder rows and the project root are destinations.
 */
export function resolveFileExplorerDropDestination(
  target: FileExplorerDropTarget
): string | null {
  if (target.kind === "root") {
    return FILE_EXPLORER_MOVE_ROOT_DESTINATION;
  }
  if (target.kind === "entry" && target.entryKind === "folder") {
    return target.relativePath;
  }
  return null;
}

/**
 * #329: whether a drop of `dragSourceRelativePaths` onto
 * `destinationFolderRelativePath` is worth sending to the backend. This is the
 * cheap client-side pre-check only — the backend stays authoritative for
 * same-parent, conflicts, missing paths, traversal, permissions, etc.
 */
export function isValidFileExplorerDropTarget(input: {
  readonly dragSourceRelativePaths: readonly string[];
  readonly destinationFolderRelativePath: string | null;
}): boolean {
  const { dragSourceRelativePaths, destinationFolderRelativePath } = input;

  if (
    dragSourceRelativePaths.length === 0 ||
    destinationFolderRelativePath === null
  ) {
    return false;
  }

  // Dropping a source onto itself, or a drop that would land every source
  // back in its own parent, is a no-op — reject it before the IPC round-trip.
  if (dragSourceRelativePaths.includes(destinationFolderRelativePath)) {
    return false;
  }

  const everySourceAlreadyThere = dragSourceRelativePaths.every((path) => {
    const slashIndex = path.lastIndexOf("/");
    const parent = slashIndex === -1 ? "" : path.slice(0, slashIndex);
    return parent === destinationFolderRelativePath;
  });

  return !everySourceAlreadyThere;
}
