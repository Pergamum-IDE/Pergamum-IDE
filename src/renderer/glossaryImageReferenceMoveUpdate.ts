/**
 * #574 Slice 2: keep glossary Description image links pointing at an image
 * file that a File Explorer Move / Rename relocates — the glossary
 * counterpart of #414 (C2) for Markdown documents.
 *
 * Glossary Description links are PROJECT-ROOT-relative (#573 Slice 6), so
 * they are planned with `planGlossaryDescriptionImageReferenceRewritesForImageMove`
 * (same parser / candidate filter / notation rules as documents, project-root
 * base) and stay project-root-relative after the rewrite.
 *
 * Pure: no IPC, no React state. `App.tsx` owns the ordering:
 *   1. an OPEN glossary tab's current draft is rewritten first (the draft is
 *      the source of truth; dirty edits are kept),
 *   2. only then is the stored entry's Description updated, and the tab's
 *      saved BASELINE (not its draft) is rebased onto the stored result — so
 *      a clean tab stays clean and a dirty tab stays dirty with its own
 *      edits, and a later Ctrl+S can never write the old link back.
 */

import type {
  GlossaryEntry,
  UpdateGlossaryEntryInput
} from "../shared/glossary";
import {
  planGlossaryDescriptionImageReferenceRewritesForImageMove,
  type MarkdownImageReferenceMoveRewrite,
  type MovedImageFile
} from "../shared/markdownImageReferenceMoveRewrite";
import type {
  CurrentEditor,
  GlossaryDescriptionCurrentEditor
} from "./currentEditor";
import { applyMarkdownImageLinkRewritesToText } from "./markdownDocumentMoveImageLinkUpdate";
import {
  documentMayReferenceMovedImage,
  imageReferenceSearchPlan
} from "./markdownImageReferenceMoveUpdate";
import { isGlossaryEntryDraftDirty } from "./glossaryEntryDraft";
import { representativeGlossarySurface } from "./glossaryPresentation";

/** The Description rewrites for one glossary Description text. */
export function glossaryDescriptionImageReferenceRewrites(
  description: string,
  movedImages: readonly MovedImageFile[]
): readonly MarkdownImageReferenceMoveRewrite[] {
  // The same conservative filename pre-filter documents use.
  if (
    !documentMayReferenceMovedImage(
      description,
      imageReferenceSearchPlan(movedImages)
    )
  ) {
    return [];
  }

  return planGlossaryDescriptionImageReferenceRewritesForImageMove({
    markdown: description,
    movedImages
  });
}

/**
 * The rewritten Description, or `null` when nothing references a moved image
 * (the entry must then NOT be written) or the rewrites do not apply cleanly.
 */
export function rewriteGlossaryDescriptionImageReferences(
  description: string,
  movedImages: readonly MovedImageFile[]
): { readonly description: string; readonly referenceCount: number } | null {
  const rewrites = glossaryDescriptionImageReferenceRewrites(
    description,
    movedImages
  );

  if (rewrites.length === 0) {
    return null;
  }

  const rewritten = applyMarkdownImageLinkRewritesToText(description, rewrites);

  return rewritten === null || rewritten === description
    ? null
    : { description: rewritten, referenceCount: rewrites.length };
}

/**
 * The glossary update that changes ONLY a stored entry's Description — its
 * stored atoms (ids kept) and tags are sent back unchanged.
 */
export function glossaryEntryDescriptionUpdateInput(
  entry: GlossaryEntry,
  description: string
): UpdateGlossaryEntryInput {
  return {
    id: entry.id,
    description,
    atoms: [...entry.atoms]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((atom) => ({
        id: atom.id,
        value: atom.value,
        matchFlags: atom.matchFlags
      })),
    tagIds: entry.tags.map((tag) => tag.id)
  };
}

/**
 * Rebase an open glossary tab's saved BASELINE onto the stored entry after
 * its Description was maintained automatically. The draft (Description,
 * atoms, tags) is untouched — unlike a Save result, which also adopts the
 * stored tags — so dirty edits survive and only dirtiness is recomputed. Any
 * other editor (or another entry's tab) is returned unchanged.
 */
export function rebaseGlossaryDescriptionEditorBaseline(
  editor: CurrentEditor,
  storedEntry: GlossaryEntry
): CurrentEditor {
  if (editor.kind !== "glossaryDescription" || editor.entryId !== storedEntry.id) {
    return editor;
  }

  const draft = { ...editor.draft, entry: storedEntry };

  return {
    ...editor,
    representativeSurface: representativeGlossarySurface(storedEntry).trim(),
    draft: {
      ...draft,
      saveState:
        draft.saveState === "saving"
          ? "saving"
          : isGlossaryEntryDraftDirty(draft)
            ? "dirty"
            : "clean"
    }
  };
}

/**
 * #574 Slice 2: the confirmation-dialog count — how many glossary entries /
 * references a move would update. An entry open in a tab is counted by its
 * CURRENT draft (what will actually be rewritten), others by the stored
 * Description; each entry once.
 */
export function countGlossaryImageReferences(
  storedEntries: readonly GlossaryEntry[],
  openTabs: readonly GlossaryDescriptionCurrentEditor[],
  movedImages: readonly MovedImageFile[]
): {
  readonly entryCount: number;
  readonly referenceCount: number;
  readonly imageOldPaths: ReadonlySet<string>;
} {
  const descriptions = new Map<string, string>();

  for (const entry of storedEntries) {
    descriptions.set(entry.id, entry.description);
  }
  for (const tab of openTabs) {
    descriptions.set(tab.entryId, tab.draft.description);
  }

  let entryCount = 0;
  let referenceCount = 0;
  const imageOldPaths = new Set<string>();

  for (const description of descriptions.values()) {
    const rewrites = glossaryDescriptionImageReferenceRewrites(
      description,
      movedImages
    );

    if (rewrites.length > 0) {
      entryCount += 1;
      referenceCount += rewrites.length;
      for (const rewrite of rewrites) {
        imageOldPaths.add(rewrite.oldImageProjectRelativePath);
      }
    }
  }

  return { entryCount, referenceCount, imageOldPaths };
}
