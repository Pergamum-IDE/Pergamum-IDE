/**
 * #327/#328/#340: pure helpers for the File Explorer Move / Cut-Paste routes.
 *
 *   - `collectFileExplorerMoveDestinationFolders` builds the destination
 *     folder picker's list from the tree data the File Explorer has already
 *     loaded (project root + every known folder). It does NOT hit the
 *     filesystem; folders inside never-expanded directories are simply not
 *     listed yet — the backend still validates the chosen destination.
 *   - `resolveFileExplorerMoveSources` turns a multi-selection into Move
 *     sources (#340: files AND folders, non-empty).
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
  /** Project-root-relative paths of the selected entries — files AND folders
   *  (#340) — in `localeCompare` path order. */
  readonly relativePaths: readonly string[];
  /** `true` when there is at least one entry to move. */
  readonly canMove: boolean;
}

/**
 * Resolve a multi-selection (a set of entry paths) into Move sources. #340:
 * both file and folder rows are movable; the backend stays authoritative for
 * folder-specific rules (destination-inside-source, ancestor/descendant
 * mixed selection, subtree dirty documents, …). Selection state only ever
 * holds paths that were rendered entries, so every selected path is a real
 * file or folder.
 */
export function resolveFileExplorerMoveSources(
  selectedPaths: ReadonlySet<string>,
  // Unused now that folders are movable too — kept so every call site
  // (Move / Cut / D&D) stays uniform and a future kind check is cheap to add.
  _entriesByDirectoryPath: Readonly<Record<string, FileExplorerEntry[]>>
): FileExplorerMoveSources {
  const relativePaths = [...selectedPaths].sort((left, right) =>
    left.localeCompare(right)
  );

  return {
    relativePaths,
    canMove: relativePaths.length > 0
  };
}

/**
 * #327 blocker / #328 / #338 / #340: why a Move (context menu / toolbar) or a
 * Cut is disabled. Exactly one is chosen (most-explanatory first); `null`
 * means the action is allowed. Move and Cut share this taxonomy — their
 * gating is identical. #340 removed `contains-folder`: folders are movable
 * now. `contains-dirty-open-document`: a selected file, or a document inside a
 * selected folder's subtree, is open with UNSAVED changes — a *clean* open
 * document moves fine (#338).
 */
export type FileExplorerMoveDisabledReason =
  | "move-in-progress"
  | "no-project"
  | "read-only-project"
  | "empty-selection"
  | "contains-dirty-open-document";

export function resolveFileExplorerMoveDisabledReason(input: {
  readonly moveInFlight: boolean;
  readonly hasProject: boolean;
  readonly readOnly: boolean;
  readonly entryCount: number;
  readonly hasDirtyOpenDocument: boolean;
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
  if (input.entryCount === 0) {
    return "empty-selection";
  }
  if (input.hasDirtyOpenDocument) {
    return "contains-dirty-open-document";
  }
  return null;
}

/**
 * #328/#338: why a Paste is disabled. `no-cut-sources` replaces the selection
 * reasons — a Paste depends on the pending Cut, not the current selection.
 */
export type FileExplorerPasteDisabledReason =
  | "move-in-progress"
  | "no-project"
  | "read-only-project"
  | "no-cut-sources"
  | "contains-dirty-open-document";

export function resolveFileExplorerPasteDisabledReason(input: {
  readonly moveInFlight: boolean;
  readonly hasProject: boolean;
  readonly readOnly: boolean;
  readonly cutSourceCount: number;
  readonly cutHasDirtyOpenDocument: boolean;
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
  if (input.cutHasDirtyOpenDocument) {
    return "contains-dirty-open-document";
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
 * #329/#340: resolve the Move sources for a drag.
 *
 *   - dragging a file OR folder row (#340) → movable
 *   - dragging the project root row / an unknown row → never movable
 *   - dragging a selected row        → the whole current multi-selection
 *   - dragging a non-selected row    → just that row (the caller also
 *     replaces the selection with it, matching right-click semantics)
 *
 * The backend stays authoritative for folder-specific rejections.
 */
export function resolveFileExplorerDragSources(
  origin: FileExplorerDragOrigin,
  selectedPaths: ReadonlySet<string>,
  entriesByDirectoryPath: Readonly<Record<string, FileExplorerEntry[]>>
): FileExplorerDragSources {
  if (origin.kind !== "file" && origin.kind !== "folder") {
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
 * #329/#340: the destination folder a drop resolves to, or `null` when the
 * target cannot accept a Move drop (a file row, the empty area). Only folder
 * rows and the project root are destinations — dropping onto a file is never
 * valid.
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

  // #340: dropping a folder onto itself or into its own subtree is invalid.
  const dropsIntoOwnSubtree = dragSourceRelativePaths.some(
    (source) =>
      destinationFolderRelativePath === source ||
      destinationFolderRelativePath.startsWith(`${source}/`)
  );
  if (dropsIntoOwnSubtree) {
    return false;
  }

  // A drop that would land every source back in its own parent is a no-op.
  const everySourceAlreadyThere = dragSourceRelativePaths.every((path) => {
    const slashIndex = path.lastIndexOf("/");
    const parent = slashIndex === -1 ? "" : path.slice(0, slashIndex);
    return parent === destinationFolderRelativePath;
  });

  return !everySourceAlreadyThere;
}
