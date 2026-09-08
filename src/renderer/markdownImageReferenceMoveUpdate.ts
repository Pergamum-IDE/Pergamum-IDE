/**
 * #414 (C2): renderer-side glue for keeping the image links in OTHER Markdown
 * documents pointing at an image file that a File Explorer move / rename
 * relocates.
 *
 * The rewrite *planning* is the pure shared function
 * {@link planMarkdownImageReferenceRewritesForImageMove} — always one
 * document at a time. This module adds:
 *
 *   - {@link resolveMovedImageFiles}: from a move's *explicit* selection, the
 *     subset that is a supported image FILE changing project-relative path
 *     (single, multiple, or the images in a mixed selection; a directory
 *     source is never expanded — its contents are out of scope for #414).
 *   - {@link imageReferenceSearchTokens} / {@link documentMayReferenceMovedImage}:
 *     the cheap filename-string pre-filter that decides which project Markdown
 *     documents are even worth scanning + resolving.
 *   - batch folding, the 3-way dialog-choice resolution, and the
 *     partial-move-failure filter.
 *
 * The per-document CodeMirror change-spec / plain-text apply helpers are
 * reused from {@link ./markdownDocumentMoveImageLinkUpdate} (#413) — a
 * C2 rewrite is structurally a superset of a C1 one.
 */

import { supportedImageAttachmentFormatForFileName } from "../shared/imageAttachmentFormat";
import type { FileExplorerEntry } from "../shared/api";
import type {
  MarkdownImageReferenceMoveRewrite,
  MovedImageFile
} from "../shared/markdownImageReferenceMoveRewrite";

export type { MovedImageFile } from "../shared/markdownImageReferenceMoveRewrite";

function baseName(relativePath: string): string {
  const slash = relativePath.lastIndexOf("/");
  return slash === -1 ? relativePath : relativePath.slice(slash + 1);
}

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

/** `true` for `.png` / `.jpg` / `.jpeg` / `.gif` / `.webp` (case-insensitive). */
export function isSupportedProjectImageFileName(name: string): boolean {
  return supportedImageAttachmentFormatForFileName(name) !== null;
}

/**
 * The explicitly-selected supported image FILES in a move whose
 * project-relative path actually changes. A folder source is never expanded;
 * a non-image file, an entry whose kind cannot be confirmed as a file, and a
 * source already in the destination folder are all dropped. Order follows
 * `sourceRelativePaths`.
 */
export function resolveMovedImageFiles(input: {
  readonly sourceRelativePaths: readonly string[];
  readonly destinationFolderRelativePath: string;
  readonly entriesByDirectoryPath: Readonly<
    Record<string, FileExplorerEntry[]>
  >;
}): readonly MovedImageFile[] {
  const destinationFolder = input.destinationFolderRelativePath;
  const moved: MovedImageFile[] = [];

  for (const source of input.sourceRelativePaths) {
    const name = baseName(source);
    if (!isSupportedProjectImageFileName(name)) {
      continue;
    }
    if (
      entryKindForRelativePath(source, input.entriesByDirectoryPath) !== "file"
    ) {
      continue;
    }
    const newProjectRelativePath =
      destinationFolder === "" ? name : `${destinationFolder}/${name}`;
    if (newProjectRelativePath === source) {
      continue;
    }
    moved.push({
      oldProjectRelativePath: source,
      newProjectRelativePath
    });
  }

  return moved;
}

/**
 * `#414` P1-2: the cheap document-level pre-filter plan.
 *
 * `String.includes` on a raw basename would false-negative whenever the
 * author percent-encoded a special char (`figure%231.png` for
 * `figure#1.png`, `100%25.png` for `100%.png`, `my%20image.png` for
 * `my image.png`). The filter must be CONSERVATIVE: over-including a document
 * is fine (the planner rejects it on the real resolve), dropping one is a
 * bug.
 *
 * For a basename made only of characters `encodeURIComponent` leaves
 * untouched, the raw string is the only form it can appear as. Otherwise we
 * add every encoding form the author is likely to have produced, plus the
 * literal leading run (present under EVERY encoding); when even that run is
 * too short to be a useful `includes` needle we set `matchAllDocuments` and
 * scan every document.
 */
export interface ImageReferenceSearchPlan {
  readonly tokens: readonly string[];
  readonly matchAllDocuments: boolean;
}

// The unreserved set `encodeURIComponent` never escapes.
const URL_UNRESERVED_SEGMENT = /^[A-Za-z0-9\-_.~!*'()]+$/;
const URL_UNRESERVED_LEADING_RUN = /^[A-Za-z0-9\-_.~!*'()]+/;

export function imageReferenceSearchPlan(
  movedImages: readonly MovedImageFile[]
): ImageReferenceSearchPlan {
  const tokens = new Set<string>();
  let matchAllDocuments = false;

  for (const image of movedImages) {
    const name = baseName(image.oldProjectRelativePath);
    tokens.add(name);

    if (URL_UNRESERVED_SEGMENT.test(name)) {
      continue;
    }

    // Encoding forms an author or tool might have written.
    try {
      tokens.add(encodeURIComponent(name));
    } catch {
      /* malformed surrogate etc — the raw form is still in `tokens` */
    }
    tokens.add(name.replace(/ /g, "%20"));
    tokens.add(name.replace(/#/g, "%23"));
    tokens.add(name.replace(/%/g, "%25"));
    tokens.add(
      name
        .replace(/%/g, "%25")
        .replace(/ /g, "%20")
        .replace(/#/g, "%23")
    );

    // The literal leading run survives every encoding scheme.
    const leadingRun = URL_UNRESERVED_LEADING_RUN.exec(name)?.[0] ?? "";
    if (leadingRun.length >= 3) {
      tokens.add(leadingRun);
    } else {
      matchAllDocuments = true;
    }
  }

  return { tokens: [...tokens], matchAllDocuments };
}

/**
 * @deprecated kept for existing callers/tests; prefer {@link imageReferenceSearchPlan}.
 */
export function imageReferenceSearchTokens(
  movedImages: readonly MovedImageFile[]
): readonly string[] {
  return imageReferenceSearchPlan(movedImages).tokens;
}

/**
 * Cheap pre-filter: could `content` reference one of the moved images? A
 * `matchAllDocuments` plan (an unsafe/ambiguous basename) always returns
 * `true` — the planner does the real work.
 */
export function documentMayReferenceMovedImage(
  content: string,
  plan: ImageReferenceSearchPlan
): boolean {
  return (
    plan.matchAllDocuments ||
    plan.tokens.some((token) => content.includes(token))
  );
}

/** One document's confirmed reference rewrites (only non-empty plans reach a batch). */
export interface ImageReferenceMoveUpdatePlan {
  readonly markdownDocumentProjectRelativePath: string;
  readonly rewrites: readonly MarkdownImageReferenceMoveRewrite[];
}

export interface ImageReferenceMoveUpdateBatch {
  readonly plans: readonly ImageReferenceMoveUpdatePlan[];
  /** Total image-reference rewrites across every document. */
  readonly totalReferenceCount: number;
  /** Number of documents with at least one rewrite. */
  readonly documentCount: number;
  /** Number of DISTINCT moved images that are actually referenced. */
  readonly imageCount: number;
}

export function buildImageReferenceMoveUpdateBatch(
  plans: readonly ImageReferenceMoveUpdatePlan[]
): ImageReferenceMoveUpdateBatch {
  const nonEmpty = plans.filter((plan) => plan.rewrites.length > 0);
  const images = new Set<string>();
  let totalReferenceCount = 0;
  for (const plan of nonEmpty) {
    totalReferenceCount += plan.rewrites.length;
    for (const rewrite of plan.rewrites) {
      images.add(rewrite.oldImageProjectRelativePath);
    }
  }
  return {
    plans: nonEmpty,
    totalReferenceCount,
    documentCount: nonEmpty.length,
    imageCount: images.size
  };
}

/** The three mutually-exclusive outcomes of the pre-move confirmation dialog. */
export type ImageReferenceMoveUpdateChoice = "update" | "skip" | "cancel";

export interface ImageReferenceMoveUpdateResolution {
  readonly moveDecision: "proceed" | "cancel";
  /** `null` for BOTH `skip` and `cancel` — "don't update" rewrites nothing. */
  readonly stagedBatch: ImageReferenceMoveUpdateBatch | null;
}

export function resolveImageReferenceMoveUpdateChoice(
  choice: ImageReferenceMoveUpdateChoice,
  batch: ImageReferenceMoveUpdateBatch
): ImageReferenceMoveUpdateResolution {
  switch (choice) {
    case "update":
      return { moveDecision: "proceed", stagedBatch: batch };
    case "skip":
      return { moveDecision: "proceed", stagedBatch: null };
    case "cancel":
      return { moveDecision: "cancel", stagedBatch: null };
  }
}

/** One image file that actually completed its move (old → new). */
export interface CompletedImageMove {
  readonly oldProjectRelativePath: string;
  readonly newProjectRelativePath: string;
}

/**
 * Keep only the rewrites whose image (`old → new`) actually completed its
 * move; drop plans that become empty. Used so a PARTIAL image-move failure
 * never rewrites a reference to an image that did not move.
 */
/** A collision-proof key for one image relocation (`old → new`). */
function imageMoveKey(oldPath: string, newPath: string): string {
  return JSON.stringify([oldPath, newPath]);
}

export function filterImageReferenceUpdatePlansToCompletedMoves(
  plans: readonly ImageReferenceMoveUpdatePlan[],
  completedMoves: readonly CompletedImageMove[]
): readonly ImageReferenceMoveUpdatePlan[] {
  const completed = new Set(
    completedMoves.map((move) =>
      imageMoveKey(move.oldProjectRelativePath, move.newProjectRelativePath)
    )
  );
  const kept: ImageReferenceMoveUpdatePlan[] = [];
  for (const plan of plans) {
    const rewrites = plan.rewrites.filter((rewrite) =>
      completed.has(
        imageMoveKey(
          rewrite.oldImageProjectRelativePath,
          rewrite.newImageProjectRelativePath
        )
      )
    );
    if (rewrites.length > 0) {
      kept.push({
        markdownDocumentProjectRelativePath:
          plan.markdownDocumentProjectRelativePath,
        rewrites
      });
    }
  }
  return kept;
}
