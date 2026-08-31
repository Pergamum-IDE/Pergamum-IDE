/**
 * #340 blocker: a reusable "these items could not be processed" model for
 * File Explorer file-operation failures.
 *
 * The dialog that consumes this (`FileOperationFailureDialog`) is a plain
 * list, not a per-reason essay: every failed item is one short
 * `kind + name + reason` row. New failure reasons map onto the existing short
 * `fileOperation.failure.reason.*` label set — no new long-form i18n bodies.
 *
 * The model is deliberately operation-agnostic (`file | folder | item`
 * kinds, a free `displayName`, a pre-localized `reasonText`) so a future
 * Copy / Import / Rename failure can reuse the same dialog.
 */

import type { TranslationKey } from "../shared/i18n";

export type FileOperationFailureItemKind = "file" | "folder" | "item";

/** How the overall operation ended — informational only for now. */
export type FileOperationFailureStatus =
  | "rejected" // dry-run / validation blocked it before anything ran
  | "failed" // wet-run: nothing landed
  | "partiallyFailed"; // wet-run: some items moved, these did not

export interface FileOperationFailureItem {
  readonly kind: FileOperationFailureItemKind;
  /** Path or name to show. `null` for a batch-level failure with no single
   *  item (e.g. "a folder and an item inside it are both selected"). */
  readonly displayName: string | null;
  /** Already-localized, single-sentence reason. */
  readonly reasonText: string;
}

/**
 * Move validation (`MoveEntriesValidationErrorReason`) and execution
 * (`MoveEntryExecutionFailureReason`) reason codes → the shared short reason
 * label key. Anything unmapped falls back to `…reason.unknown`, so this stays
 * small and additive.
 */
const REASON_TEXT_KEY: Readonly<Record<string, TranslationKey>> = {
  "destination-conflict": "fileOperation.failure.reason.destinationConflict",
  "destination-conflict-during-execution":
    "fileOperation.failure.reason.destinationConflict",
  "batch-destination-conflict":
    "fileOperation.failure.reason.batchDestinationConflict",
  "destination-inside-source":
    "fileOperation.failure.reason.destinationInsideSource",
  "contains-ancestor-and-descendant":
    "fileOperation.failure.reason.containsAncestorAndDescendant",
  "source-dirty-open-document":
    "fileOperation.failure.reason.dirtyOpenDocument",
  "source-is-project-root":
    "fileOperation.failure.reason.sourceIsProjectRoot",
  "same-parent": "fileOperation.failure.reason.sameParent",
  "destination-outside-project":
    "fileOperation.failure.reason.destinationUnavailable",
  "destination-not-found":
    "fileOperation.failure.reason.destinationUnavailable",
  "destination-not-folder":
    "fileOperation.failure.reason.destinationUnavailable",
  "destination-path-too-long":
    "fileOperation.failure.reason.destinationUnavailable",
  "permission-denied": "fileOperation.failure.reason.permissionDenied",
  "rename-failed": "fileOperation.failure.reason.executionFailed",
  "source-missing-during-execution":
    "fileOperation.failure.reason.executionFailed"
};

export function fileOperationFailureReasonTextKey(
  reason: string
): TranslationKey {
  return REASON_TEXT_KEY[reason] ?? "fileOperation.failure.reason.unknown";
}

export function fileOperationFailureItemKindKey(
  kind: FileOperationFailureItemKind
): TranslationKey {
  if (kind === "file") {
    return "fileOperation.itemKind.file";
  }
  if (kind === "folder") {
    return "fileOperation.itemKind.folder";
  }
  return "fileOperation.itemKind.item";
}

/**
 * The plain text shown in the dialog's read-only textarea, e.g.
 *
 *   Folder: Drafts
 *   Reason: The destination already contains an item with the same name.
 *
 *   File: Drafts/chapter-01.md
 *   Reason: The destination already contains an item with the same name.
 */
export function buildFileOperationFailureText(input: {
  readonly items: readonly FileOperationFailureItem[];
  readonly kindLabel: (kind: FileOperationFailureItemKind) => string;
  readonly reasonLabel: string;
}): string {
  return input.items
    .map((item) => {
      const lines: string[] = [];
      if (item.displayName !== null && item.displayName !== "") {
        lines.push(`${input.kindLabel(item.kind)}: ${item.displayName}`);
      }
      lines.push(`${input.reasonLabel}: ${item.reasonText}`);
      return lines.join("\n");
    })
    .join("\n\n");
}
