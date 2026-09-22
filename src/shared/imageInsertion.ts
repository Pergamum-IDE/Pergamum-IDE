/**
 * #535: shared request/result shapes for the "Insert image" toolbar command
 * — pick one or more image files with the OS file picker, dry-run a copy
 * plan into the configured attachment folder, confirm overwrites, then copy
 * and insert Markdown image links.
 *
 * Deliberately a NEW, narrower main-process flow rather than a reuse of
 * `saveImageAttachment` (#407): that function generates a fresh timestamped
 * filename and silently auto-renames on any collision, which is the exact
 * opposite of what this command needs (preserve the original file name, ask
 * before overwriting). The destination-resolution / containment / mkdir
 * logic IS shared, via `resolveAndPrepareImageAttachmentDestination`
 * (`src/main/imageAttachmentDestination.ts`).
 */

import type { SaveImageAttachmentFailureReason } from "./imageAttachmentSaveResult";

/** Same accepted formats as clipboard image attachment (#407) — SVG / BMP /
 *  AVIF and everything else stay out of scope. */
export const IMAGE_INSERTION_FILE_DIALOG_EXTENSIONS: readonly string[] = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp"
];

export interface PickImageInsertionFilesResult {
  /** Absolute paths in the order the user selected them; `[]` when the
   *  picker was canceled. */
  readonly paths: readonly string[];
}

export type EnsureImageInsertionFolderResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: SaveImageAttachmentFailureReason };

export interface PlanImageInsertionCopyRequest {
  readonly saveDirectory: string;
  /** Absolute source file paths, in selection order. */
  readonly sourcePaths: readonly string[];
}

export interface ImageInsertionCopyPlanEntry {
  readonly sourcePath: string;
  readonly fileName: string;
  /** Project-root-relative, `/`-separated. */
  readonly destinationRelativePath: string;
  readonly willOverwrite: boolean;
}

export type ImageInsertionPlanRejectionReason =
  | "sourceUnreadable"
  | "unsupportedFormat";

export interface ImageInsertionPlanRejection {
  readonly sourcePath: string;
  readonly reason: ImageInsertionPlanRejectionReason;
}

export type PlanImageInsertionCopyResult =
  | {
      readonly ok: true;
      readonly entries: readonly ImageInsertionCopyPlanEntry[];
      readonly rejected: readonly ImageInsertionPlanRejection[];
    }
  | { readonly ok: false; readonly reason: SaveImageAttachmentFailureReason };

export interface CopyImageInsertionFilesRequest {
  readonly saveDirectory: string;
  /** Absolute source file paths, in selection order — same set the dry-run
   *  plan was built from. */
  readonly sourcePaths: readonly string[];
  /** All-or-nothing: applies to every conflicting destination in this batch. */
  readonly allowOverwrite: boolean;
}

export type CopyImageInsertionFailureReason =
  | SaveImageAttachmentFailureReason
  | ImageInsertionPlanRejectionReason
  | "overwriteNotAllowed";

export type CopyImageInsertionFilesResult =
  | {
      readonly ok: true;
      /** Project-root-relative, `/`-separated, same order as `sourcePaths`. */
      readonly relativePaths: readonly string[];
    }
  | { readonly ok: false; readonly reason: CopyImageInsertionFailureReason };
