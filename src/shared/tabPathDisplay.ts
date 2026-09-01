/**
 * #354: tiny path helpers for the editor tab context menu's copy commands.
 *
 * Deliberately dependency-free (no `node:path`) so it runs in the renderer.
 * v1 keeps separator handling pragmatic: a project root is already an
 * OS-native absolute path, and project-relative paths use `/`. External
 * absolute paths are copied in their stored form.
 */

/** Last `/`- or `\`-separated segment of `pathLike` (its own value when it
 *  has no separator). Trailing separators are ignored. */
export function tabFileNameFromPath(pathLike: string): string {
  const trimmed = pathLike.replace(/[\\/]+$/, "");
  const segments = trimmed.split(/[\\/]/);
  const last = segments[segments.length - 1];
  return last.length > 0 ? last : pathLike;
}

/**
 * Join an OS-native project root with a `/`-separated project-relative path.
 * The separator is inferred from the root (`\` when it contains one,
 * otherwise `/`), so a Windows root stays `\`-delimited and a POSIX root
 * stays `/`-delimited.
 */
export function projectDocumentAbsolutePath(
  projectRootPath: string,
  relativePath: string
): string {
  const separator = projectRootPath.includes("\\") ? "\\" : "/";
  const normalizedRoot = projectRootPath.replace(/[\\/]+$/, "");
  const relativeSegments = relativePath
    .split(/[\\/]/)
    .filter((segment) => segment.length > 0);

  if (relativeSegments.length === 0) {
    return normalizedRoot;
  }

  return `${normalizedRoot}${separator}${relativeSegments.join(separator)}`;
}
