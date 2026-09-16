/**
 * Phase 8-2 / Issue #501: Shared Project Document Kind Boundary.
 *
 * Classifies supported project document files based on file extension
 * and application settings.
 */

export type ProjectDocumentKind = "markdown" | "plainText";

export interface GetProjectDocumentKindOptions {
  /**
   * Whether optional plain text (`.txt`) documents are enabled as project documents.
   */
  enablePlainTextDocuments: boolean;
}

/**
 * Determines the `ProjectDocumentKind` for a given project-relative path or file path.
 *
 * Expected behavior:
 * - `.md` => `'markdown'`
 * - `.markdown` => `'markdown'`
 * - `.txt` => `'plainText'` (only when `enablePlainTextDocuments` is `true`)
 * - `.txt` => `null` (when `enablePlainTextDocuments` is `false`)
 * - other extensions / unrecognized files => `null`
 */
export function getProjectDocumentKind(
  projectRelativePath: string,
  options: GetProjectDocumentKindOptions
): ProjectDocumentKind | null {
  const lower = projectRelativePath.toLowerCase();

  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return "markdown";
  }

  if (options.enablePlainTextDocuments && lower.endsWith(".txt")) {
    return "plainText";
  }

  return null;
}

/**
 * Helper to check whether a project-relative path or file path is a supported
 * project document under the current settings.
 */
export function isProjectDocumentPath(
  projectRelativePath: string,
  options: GetProjectDocumentKindOptions
): boolean {
  return getProjectDocumentKind(projectRelativePath, options) !== null;
}
