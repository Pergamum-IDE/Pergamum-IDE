import type { FileExplorerEntry } from "../shared/api";
import {
  isProjectDocumentPath,
  type GetProjectDocumentKindOptions
} from "../shared/projectDocumentKind";
import { isSupportedProjectImageFileName } from "./markdownImageReferenceMoveUpdate";

export type FileExplorerEntryKind =
  | "folder"
  | "document"
  | "asset"
  | "unsupported";

export interface FileExplorerVisibilityOptions
  extends GetProjectDocumentKindOptions {
  readonly enablePlainTextDocuments: boolean;
}

/**
 * Classifies a File Explorer entry as a folder, supported document, supported asset, or unsupported.
 * The `options` argument is mandatory.
 */
export function getFileExplorerEntryKind(
  entry: FileExplorerEntry,
  options: FileExplorerVisibilityOptions
): FileExplorerEntryKind {
  if (entry.kind === "folder") {
    return "folder";
  }

  if (isProjectDocumentPath(entry.relativePath, options)) {
    return "document";
  }

  if (isSupportedProjectImageFileName(entry.name)) {
    return "asset";
  }

  return "unsupported";
}

/**
 * Determines whether a File Explorer entry should be rendered in the tree view.
 * Folders, supported project documents, and supported image assets are visible.
 * Unsupported files and disabled plain text files are hidden.
 * The `options` argument is mandatory.
 */
export function isVisibleFileExplorerEntry(
  entry: FileExplorerEntry,
  options: FileExplorerVisibilityOptions
): boolean {
  return getFileExplorerEntryKind(entry, options) !== "unsupported";
}
