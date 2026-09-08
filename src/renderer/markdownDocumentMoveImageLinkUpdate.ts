/**
 * #413: renderer-side glue for keeping moved Markdown documents' inline
 * project-local image links pointing at the same project-relative targets.
 *
 * The rewrite *planning* is the pure shared function
 * {@link planMarkdownImageLinkRewritesForDocumentMove} — always one document
 * at a time. This module adds the renderer-specific pieces:
 *
 *   - {@link resolveMarkdownDocumentMoves}: from a File Explorer move's
 *     *explicit* selection, the subset that is a Markdown FILE changing
 *     parent folder (any count — single, multiple, or the Markdown files
 *     inside a mixed selection). A directory source is never expanded: its
 *     descendants are out of scope for #413.
 *   - turning a rewrite plan into CodeMirror change specs, and
 *   - applying a plan to plain document text (the closed-document path, and a
 *     last-resort fallback for an open document with no usable cached state).
 *
 * It performs no I/O and touches no React state, so it is fully unit-testable.
 */

import type { FileExplorerEntry } from "../shared/api";
import { isSupportedMarkdownFileName } from "../shared/fileExplorerRename";
import { projectRelativeDirname } from "../shared/markdownImageLink";
import type { MarkdownImageLinkMoveRewrite } from "../shared/markdownImageLinkMoveRewrite";

/** The last `/`-separated segment of a project-relative path. */
function baseName(relativePath: string): string {
  const slashIndex = relativePath.lastIndexOf("/");
  return slashIndex === -1 ? relativePath : relativePath.slice(slashIndex + 1);
}

/** Look up an entry's kind by its project-relative path. */
function entryKindForRelativePath(
  relativePath: string,
  entriesByDirectoryPath: Readonly<Record<string, FileExplorerEntry[]>>
): FileExplorerEntry["kind"] | undefined {
  for (const entries of Object.values(entriesByDirectoryPath)) {
    const match = entries.find((entry) => entry.relativePath === relativePath);
    if (match) {
      return match.kind;
    }
  }
  return undefined;
}

export interface MarkdownDocumentMove {
  readonly oldProjectRelativePath: string;
  readonly newProjectRelativePath: string;
}

/**
 * The explicitly-selected Markdown FILES in a File Explorer move whose new
 * parent folder differs from their current one — the documents #413 offers to
 * keep image-link-stable. Any count (0, 1, many).
 *
 * Excluded, silently: a folder source (its descendants are NOT scanned — #413
 * never recurses a directory move), a non-Markdown file, an entry whose kind
 * cannot be confirmed as a file, and a source already living in the
 * destination folder. Order follows `sourceRelativePaths`.
 */
export function resolveMarkdownDocumentMoves(input: {
  readonly sourceRelativePaths: readonly string[];
  readonly destinationFolderRelativePath: string;
  readonly entriesByDirectoryPath: Readonly<
    Record<string, FileExplorerEntry[]>
  >;
}): readonly MarkdownDocumentMove[] {
  const destinationFolder = input.destinationFolderRelativePath;
  const moves: MarkdownDocumentMove[] = [];

  for (const source of input.sourceRelativePaths) {
    const name = baseName(source);
    if (!isSupportedMarkdownFileName(name)) {
      continue;
    }

    // An unknown entry could be a folder whose name happens to end in `.md`;
    // only act when we can confirm it is a file.
    if (
      entryKindForRelativePath(source, input.entriesByDirectoryPath) !== "file"
    ) {
      continue;
    }

    const newProjectRelativePath =
      destinationFolder === "" ? name : `${destinationFolder}/${name}`;

    if (
      projectRelativeDirname(source) ===
      projectRelativeDirname(newProjectRelativePath)
    ) {
      continue;
    }

    moves.push({
      oldProjectRelativePath: source,
      newProjectRelativePath
    });
  }

  return moves;
}

/**
 * One moved Markdown document's confirmed image-link rewrite plan (only
 * documents with at least one rewrite reach a batch).
 */
export interface MarkdownDocumentMoveImageLinkUpdatePlan {
  readonly oldProjectRelativePath: string;
  readonly newProjectRelativePath: string;
  readonly rewrites: readonly MarkdownImageLinkMoveRewrite[];
}

/** All the rewrite plans a single File Explorer move produced, aggregated. */
export interface MarkdownDocumentMoveImageLinkUpdateBatch {
  readonly plans: readonly MarkdownDocumentMoveImageLinkUpdatePlan[];
  readonly totalRewriteCount: number;
}

/**
 * Fold per-document plans into a batch, dropping documents with nothing to
 * rewrite. `plans` is empty ⟺ no confirmation dialog is shown.
 */
export function buildMarkdownDocumentMoveImageLinkUpdateBatch(
  plans: readonly MarkdownDocumentMoveImageLinkUpdatePlan[]
): MarkdownDocumentMoveImageLinkUpdateBatch {
  const nonEmpty = plans.filter((plan) => plan.rewrites.length > 0);
  return {
    plans: nonEmpty,
    totalRewriteCount: nonEmpty.reduce(
      (sum, plan) => sum + plan.rewrites.length,
      0
    )
  };
}

/** The three mutually-exclusive outcomes of the pre-move confirmation dialog. */
export type MarkdownImageLinkMoveUpdateChoice = "update" | "skip" | "cancel";

export interface MarkdownImageLinkMoveUpdateResolution {
  /** What the File Explorer move route should do next. */
  readonly moveDecision: "proceed" | "cancel";
  /**
   * The batch to stage for the post-move apply, or `null` to stage nothing.
   * `null` for BOTH `skip` and `cancel` — "don't update" must leave the
   * document bodies untouched exactly like a cancel does.
   */
  readonly stagedBatch: MarkdownDocumentMoveImageLinkUpdateBatch | null;
}

/**
 * Map a dialog choice to (a) whether the move proceeds and (b) what — if
 * anything — gets staged for the post-move rewrite. This is the single place
 * that decides it, so `update` and `skip` can never collapse into the same
 * `"proceed"` branch again.
 */
export function resolveMarkdownImageLinkMoveUpdateChoice(
  choice: MarkdownImageLinkMoveUpdateChoice,
  batch: MarkdownDocumentMoveImageLinkUpdateBatch
): MarkdownImageLinkMoveUpdateResolution {
  switch (choice) {
    case "update":
      return { moveDecision: "proceed", stagedBatch: batch };
    case "skip":
      return { moveDecision: "proceed", stagedBatch: null };
    case "cancel":
      return { moveDecision: "cancel", stagedBatch: null };
  }
}

export interface MarkdownDocumentTextChangeSpec {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

/**
 * A rewrite plan as ascending, non-overlapping CodeMirror change specs, or
 * `null` when the plan does not line up with `documentText` (a stale plan:
 * the text changed under it). The planner already returns document-ordered,
 * non-overlapping rewrites, so the only real check here is that every
 * `oldDestination` still sits exactly where the plan says it does.
 */
export function markdownImageLinkRewriteChangeSpecs(
  documentText: string,
  rewrites: readonly MarkdownImageLinkMoveRewrite[]
): readonly MarkdownDocumentTextChangeSpec[] | null {
  const specs: MarkdownDocumentTextChangeSpec[] = [];
  let previousTo = -1;

  for (const rewrite of rewrites) {
    if (
      rewrite.from < 0 ||
      rewrite.from < previousTo ||
      rewrite.from > rewrite.to ||
      rewrite.to > documentText.length ||
      documentText.slice(rewrite.from, rewrite.to) !== rewrite.oldDestination
    ) {
      return null;
    }
    specs.push({
      from: rewrite.from,
      to: rewrite.to,
      insert: rewrite.newDestination
    });
    previousTo = rewrite.to;
  }

  return specs;
}

/**
 * Apply a rewrite plan to plain text (the closed-document path). Returns the
 * rewritten text, or `null` when the plan is stale for `documentText`.
 */
export function applyMarkdownImageLinkRewritesToText(
  documentText: string,
  rewrites: readonly MarkdownImageLinkMoveRewrite[]
): string | null {
  const specs = markdownImageLinkRewriteChangeSpecs(documentText, rewrites);
  if (specs === null) {
    return null;
  }

  let result = "";
  let cursor = 0;
  for (const spec of specs) {
    result += documentText.slice(cursor, spec.from) + spec.insert;
    cursor = spec.to;
  }
  result += documentText.slice(cursor);
  return result;
}
