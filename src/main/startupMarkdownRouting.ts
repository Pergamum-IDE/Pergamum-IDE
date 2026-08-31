/**
 * #347: lock-aware startup Markdown open routing — main-process classifier.
 *
 * A Markdown file handed to Pergamum at cold start (startup args / "Open
 * With" / EXE drop) must never be opened as a standalone writable document
 * when it actually belongs to a Pergamum project — another process may hold
 * that project's write lock, and two writable views of the same manuscript
 * file is manuscript data loss.
 *
 * This module does discovery + validation only. It is pure with respect to
 * Electron / IPC / renderer state: the only thing it touches is the
 * filesystem, through injectable deps so the classifier is unit-testable.
 *
 * It deliberately does NOT probe the project write lock. When a Markdown is
 * found to live inside a project, routing promotes it to a `.pergamum`
 * launch target and the existing project-open lifecycle (read-only
 * confirmation dialog, `lockSetupFailed` handling, cancel) decides what
 * happens — see `coldStartLaunchTargetFromClassification` in
 * `startupLaunchTarget.ts` and the renderer cold-start routing.
 *
 * Safety invariant (LOCK-STARTUP-1): a project-owned Markdown file opened
 * from outside Pergamum is never routed to a standalone writable document.
 * Any doubt — ambiguous project root, unreadable ancestor directory —
 * resolves to a safe rejection, never to standalone.
 */

import path from "node:path";
import { promises as fsPromises } from "node:fs";
import { SUPPORTED_MARKDOWN_FILE_EXTENSIONS } from "../shared/fileExplorerCreate";
import { projectFileExtension } from "./projectDatabase";
import { isUrlLikeStartupInput } from "./startupProjectArgv";
import type { StartupMarkdownRejectionReason } from "../shared/sessionRestore";

// #347 / LOCK-STARTUP-5: URL-like detection lives with the shared argv
// parsing so the `.pergamum` and Markdown startup paths reject URLs
// identically. Re-exported here for the classifier's existing callers.
export { isUrlLikeStartupInput };

export type StartupMarkdownClassification =
  | { readonly kind: "externalFile"; readonly filePath: string }
  | {
      readonly kind: "enclosingProject";
      readonly filePath: string;
      readonly projectFilePath: string;
      readonly projectRootPath: string;
    }
  | {
      readonly kind: "rejected";
      readonly filePath: string;
      readonly reason: StartupMarkdownRejectionReason;
    };

interface StatLike {
  isFile(): boolean;
  isDirectory(): boolean;
}

export interface StartupMarkdownRoutingDeps {
  readonly stat: (targetPath: string) => Promise<StatLike>;
  readonly readdir: (directoryPath: string) => Promise<string[]>;
  /**
   * Resolve symlinks in the target path. #347: a symlink that lives outside
   * any project but points AT a project-owned Markdown must still be
   * discovered as project-owned — otherwise it opens as a standalone
   * writable document while another process edits the same real file
   * (LOCK-STARTUP-1). Enclosing-project discovery walks up from the REAL
   * parent directory.
   */
  readonly realpath: (targetPath: string) => Promise<string>;
}

export const defaultStartupMarkdownRoutingDeps: StartupMarkdownRoutingDeps = {
  stat: (targetPath) => fsPromises.stat(targetPath),
  readdir: (directoryPath) => fsPromises.readdir(directoryPath),
  realpath: (targetPath) => fsPromises.realpath(targetPath)
};

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code: unknown }).code);
  }

  return undefined;
}

/**
 * A "not found" style filesystem error — the target genuinely is not there.
 * Distinguished from permission / I/O errors so callers can pick the right
 * rejection reason (`notFound` vs the catch-all `discoveryFailed`).
 */
function isMissingEntryError(error: unknown): boolean {
  const code = nodeErrorCode(error);

  return code === "ENOENT" || code === "ENOTDIR";
}

function isSupportedStartupMarkdownExtension(extension: string): boolean {
  return SUPPORTED_MARKDOWN_FILE_EXTENSIONS.includes(extension.toLowerCase());
}

type EnclosingProjectDiscovery =
  | { readonly kind: "none" }
  | {
      readonly kind: "found";
      readonly projectRootPath: string;
      readonly projectFilePath: string;
    }
  | { readonly kind: "ambiguous" }
  | { readonly kind: "failed" };

/**
 * Walk ancestor directories from `startDirectory` upward. The nearest
 * directory that contains at least one `.pergamum` file is the enclosing
 * project root:
 *
 *   - exactly one `.pergamum`  → `found`
 *   - two or more `.pergamum`  → `ambiguous` (no "default project file"
 *     rule exists — ADR-0008 — so this is never guessed)
 *   - a directory we cannot read → `failed` (safe reject, never standalone)
 *   - reached the filesystem root with nothing → `none`
 */
async function discoverEnclosingProject(
  startDirectory: string,
  deps: StartupMarkdownRoutingDeps
): Promise<EnclosingProjectDiscovery> {
  let directory = startDirectory;

  // Guard against a pathological path depth / a `path.dirname` that never
  // converges.
  for (let guard = 0; guard < 4096; guard += 1) {
    let entries: string[];

    try {
      entries = await deps.readdir(directory);
    } catch {
      return { kind: "failed" };
    }

    const projectFiles = entries.filter(
      (name) => path.extname(name).toLowerCase() === projectFileExtension
    );

    if (projectFiles.length > 1) {
      return { kind: "ambiguous" };
    }

    if (projectFiles.length === 1) {
      return {
        kind: "found",
        projectRootPath: directory,
        projectFilePath: path.join(directory, projectFiles[0])
      };
    }

    const parent = path.dirname(directory);

    if (parent === directory) {
      return { kind: "none" };
    }

    directory = parent;
  }

  return { kind: "failed" };
}

function rejected(
  filePath: string,
  reason: StartupMarkdownRejectionReason
): StartupMarkdownClassification {
  return { kind: "rejected", filePath, reason };
}

/**
 * Classify a cold-start Markdown target into one of:
 *
 *   - `externalFile`     — a valid `.md` / `.markdown` with no enclosing
 *                          Pergamum project → open as an External File
 *                          Document
 *   - `enclosingProject` — a valid Markdown inside exactly one Pergamum
 *                          project → open that project through the normal
 *                          lifecycle, then the Markdown as a Project
 *                          Document (never standalone)
 *   - `rejected`         — every unsafe / unsupported / ambiguous case → do
 *                          not open as standalone writable
 *
 * `rawInput` is the untouched positional argument so URL-like inputs are
 * caught before any `path` normalization.
 */
export async function classifyStartupMarkdownTarget(
  rawInput: string,
  deps: StartupMarkdownRoutingDeps = defaultStartupMarkdownRoutingDeps
): Promise<StartupMarkdownClassification> {
  if (typeof rawInput !== "string" || rawInput.trim().length === 0) {
    return rejected(String(rawInput ?? ""), "discoveryFailed");
  }

  if (isUrlLikeStartupInput(rawInput)) {
    return rejected(rawInput.trim(), "urlLikeInput");
  }

  const inputPath = path.resolve(rawInput);
  const extension = path.extname(inputPath).toLowerCase();

  let stats: StatLike;

  try {
    stats = await deps.stat(inputPath);
  } catch (error) {
    if (isMissingEntryError(error)) {
      return rejected(inputPath, "notFound");
    }

    return rejected(inputPath, "discoveryFailed");
  }

  if (stats.isDirectory()) {
    return rejected(inputPath, "isDirectory");
  }

  if (!stats.isFile()) {
    return rejected(inputPath, "notAFile");
  }

  // Extension policy is applied to the argument the user named (a
  // `chapter-link.md` symlink is a `.md` target regardless of its real
  // name).
  if (!isSupportedStartupMarkdownExtension(extension)) {
    return rejected(inputPath, "unsupportedExtension");
  }

  // #347: resolve symlinks BEFORE enclosing-project discovery. A link that
  // lives outside any project but points at a project-owned Markdown must be
  // discovered as project-owned — otherwise it opens standalone writable
  // while another process edits the same real file (LOCK-STARTUP-1). All
  // downstream routing uses the real path so the canonical file is opened.
  let filePath: string;

  try {
    filePath = path.resolve(await deps.realpath(inputPath));
  } catch (error) {
    if (isMissingEntryError(error)) {
      return rejected(inputPath, "notFound");
    }

    return rejected(inputPath, "discoveryFailed");
  }

  const discovery = await discoverEnclosingProject(
    path.dirname(filePath),
    deps
  );

  if (discovery.kind === "failed") {
    return rejected(filePath, "discoveryFailed");
  }

  if (discovery.kind === "ambiguous") {
    return rejected(filePath, "ambiguousProject");
  }

  if (discovery.kind === "none") {
    return { kind: "externalFile", filePath };
  }

  return {
    kind: "enclosingProject",
    filePath,
    projectFilePath: discovery.projectFilePath,
    projectRootPath: discovery.projectRootPath
  };
}
