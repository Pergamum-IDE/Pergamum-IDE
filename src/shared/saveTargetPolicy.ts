import type { AppPlatform } from "./platform";

export const protectedPergamumFileSuffixes = [
  ".pergamum",
  ".pergamum-journal",
  ".pergamum-wal",
  ".pergamum-shm"
] as const;

export const projectWriteLockDirectoryName = ".pergamum.lock";

interface ParsedPath {
  readonly root: string;
  readonly segments: readonly string[];
}

function normalizeSeparators(value: string): string {
  return value.replace(/\\/g, "/");
}

function normalizeWindowsSpecialPath(value: string): string {
  const normalized = normalizeSeparators(value);

  if (/^\/\/[?.]\/UNC\//i.test(normalized)) {
    return `//${normalized.slice(8)}`;
  }

  if (/^\/\/[?.]\//i.test(normalized)) {
    return normalized.slice(4);
  }

  return normalized;
}

function normalizeSegments(segments: readonly string[]): string[] {
  const normalizedSegments: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === ".") {
      continue;
    }

    if (segment === "..") {
      if (normalizedSegments.length === 0) {
        throw new Error("Path escapes its root.");
      }

      normalizedSegments.pop();
      continue;
    }

    normalizedSegments.push(segment);
  }

  return normalizedSegments;
}

function parseAbsolutePath(value: string): ParsedPath {
  if (value.length === 0) {
    throw new Error("Path must not be empty.");
  }

  const normalized = normalizeWindowsSpecialPath(value);

  if (/^[A-Za-z]:(?:\/|$)/.test(normalized)) {
    return {
      root: `${normalized[0].toUpperCase()}:/`,
      segments: normalizeSegments(normalized.slice(3).split("/"))
    };
  }

  if (normalized.startsWith("//")) {
    const parts = normalized.slice(2).split("/");
    const server = parts[0];
    const share = parts[1];

    if (!server || !share) {
      throw new Error("UNC path must include a server and share.");
    }

    return {
      root: `//${server}/${share}/`,
      segments: normalizeSegments(parts.slice(2))
    };
  }

  if (normalized.startsWith("/")) {
    return {
      root: "/",
      segments: normalizeSegments(normalized.slice(1).split("/"))
    };
  }

  throw new Error("Path must be absolute.");
}

function compareSegment(value: string, platform: AppPlatform): string {
  const normalized = value.normalize("NFC");

  return platform === "windows" || platform === "macos"
    ? normalized.toLowerCase()
    : normalized;
}

function comparablePath(value: string, platform: AppPlatform): ParsedPath {
  const parsed = parseAbsolutePath(value);

  return {
    root: compareSegment(parsed.root, platform),
    segments: parsed.segments.map((segment) =>
      compareSegment(segment, platform)
    )
  };
}

export function isPathEqualOrInsideDirectory(
  targetPath: string,
  directoryPath: string,
  platform: AppPlatform
): boolean {
  const target = comparablePath(targetPath, platform);
  const directory = comparablePath(directoryPath, platform);

  if (target.root !== directory.root) {
    return false;
  }

  if (target.segments.length < directory.segments.length) {
    return false;
  }

  return directory.segments.every(
    (segment, index) => target.segments[index] === segment
  );
}

export function isProtectedPergamumDataFilePath(filePath: string): boolean {
  const normalizedPath = normalizeSeparators(filePath).toLowerCase();

  return protectedPergamumFileSuffixes.some((suffix) =>
    normalizedPath.endsWith(suffix)
  );
}

function preferredPathSeparator(value: string): "/" | "\\" {
  return value.includes("\\") ? "\\" : "/";
}

function trimTrailingPathSeparators(value: string): string {
  return value.replace(/[\\/]+$/, "");
}

export function projectWriteLockDirectoryPathForProjectRoot(
  projectRootPath: string
): string {
  if (projectRootPath.length === 0) {
    throw new Error("Project root path must not be empty.");
  }

  const separator = preferredPathSeparator(projectRootPath);
  const trimmedRootPath = trimTrailingPathSeparators(projectRootPath);

  if (trimmedRootPath.length === 0) {
    return `${separator}${projectWriteLockDirectoryName}`;
  }

  return `${trimmedRootPath}${separator}${projectWriteLockDirectoryName}`;
}

export function isProjectWriteLockDirectoryTarget(
  filePath: string,
  projectRootPath: string,
  platform: AppPlatform
): boolean {
  return isPathEqualOrInsideDirectory(
    filePath,
    projectWriteLockDirectoryPathForProjectRoot(projectRootPath),
    platform
  );
}
