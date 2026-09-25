/**
 * #573 Slice 9: Recovery for glossary Description tabs (renderer side).
 *
 * A dirty glossary tab's WHOLE draft (Description + metadata) is captured
 * into `Recovery.db` through the existing Markdown Recovery pipeline — same
 * coordinator, same cadence — as a `glossary.description` row whose
 * `payload_text` is a `GlossaryRecoveryDraft` JSON. Rows are removed on the
 * same triggers as Markdown rows (Save success, explicit Recovery discard,
 * restore finalize); closing / discarding a tab does NOT remove them.
 *
 * Pure and side-effect free (no IPC, no disk).
 */

import type { GlossaryEntry } from "../../shared/glossary";
import type { PergamumProject } from "../../shared/api";
import {
  GLOSSARY_RECOVERY_DRAFT_VERSION,
  serializeGlossaryRecoveryDraft,
  type GlossaryRecoveryDraft
} from "../../shared/glossaryRecoveryDraft";
import {
  recoveryGlossaryDocumentKey,
  recoveryGlossarySourceUri,
  type RecoveryDocumentPayload
} from "../../shared/recoveryDocument";
import {
  createGlossaryDescriptionCurrentEditor,
  createNewGlossaryDescriptionCurrentEditor,
  type CurrentEditor,
  type GlossaryDescriptionCurrentEditor,
  type GlossaryDescriptionRecoveryConflict
} from "../currentEditor";
import {
  buildLineEndingBreakSet
} from "../editorLineEndingField";
import {
  createLocalGlossaryAtomId,
  glossaryEntryDraftIsNew,
  isGlossaryEntryDraftDirty,
  isLocalGlossaryAtomId,
  representativeGlossaryAtomDraft,
  type GlossaryEntryDraft
} from "../glossaryEntryDraft";
import { analyzeLineEndings } from "../lineEndingTracking";

type GlossaryRecoveryTarget = { readonly kind: "entry" | "new"; readonly id: string };

function recoveryTargetForEditor(
  editor: GlossaryDescriptionCurrentEditor
): GlossaryRecoveryTarget {
  // A never-saved tab's `entryId` IS its temporary local id (Slice 7).
  return glossaryEntryDraftIsNew(editor.draft)
    ? { kind: "new", id: editor.entryId }
    : { kind: "entry", id: editor.entryId };
}

/** The serializable Recovery form of a glossary tab's draft. */
export function glossaryRecoveryDraftFromEditor(
  editor: GlossaryDescriptionCurrentEditor
): GlossaryRecoveryDraft {
  const isNew = glossaryEntryDraftIsNew(editor.draft);

  return {
    version: GLOSSARY_RECOVERY_DRAFT_VERSION,
    entryId: isNew ? null : editor.draft.entry.id,
    localId: isNew ? editor.entryId : null,
    // #574 Slice 4: a restored, still-conflicted tab keeps the ORIGINAL
    // base, so a crash before its save does not hide the conflict.
    baseUpdatedAt: isNew
      ? null
      : (editor.recoveryConflict?.baseUpdatedAt ?? editor.draft.entry.updatedAt),
    description: editor.draft.description,
    atoms: editor.draft.atoms.map((atom) => ({
      id: isLocalGlossaryAtomId(atom.id) ? null : atom.id,
      value: atom.value,
      matchFlags: atom.matchFlags
    })),
    tagIds: [...editor.draft.tagIds]
  };
}

/**
 * The Recovery `document_key` for a glossary tab, or `null` for any other
 * editor / when no project is open (glossary data is always project-owned).
 */
export function recoveryDocumentKeyForGlossaryEditor(
  editor: CurrentEditor,
  project: PergamumProject | null
): string | null {
  return editor.kind === "glossaryDescription" && project
    ? recoveryGlossaryDocumentKey(
        project.activeProjectFilePath,
        recoveryTargetForEditor(editor)
      )
    : null;
}

/** The Recovery payload for a glossary tab, or `null` (see key above). */
export function buildGlossaryRecoveryPayload(
  editor: CurrentEditor,
  project: PergamumProject | null
): RecoveryDocumentPayload | null {
  const documentKey = recoveryDocumentKeyForGlossaryEditor(editor, project);

  if (editor.kind !== "glossaryDescription" || !project || !documentKey) {
    return null;
  }

  const representative =
    representativeGlossaryAtomDraft(editor.draft)?.value.trim() ||
    editor.representativeSurface ||
    editor.entryId;

  return {
    documentKey,
    documentType: "glossary.description",
    sourceUri: recoveryGlossarySourceUri(recoveryTargetForEditor(editor)),
    // Language-neutral: the candidate dialog labels the kind (語彙 / 新規語彙).
    displayName: representative,
    projectId: null,
    projectFilePath: project.activeProjectFilePath,
    filePath: null,
    documentEncoding: null,
    documentLineend: null,
    baseMtimeMs: null,
    baseSize: null,
    baseSha256: null,
    payloadText: serializeGlossaryRecoveryDraft(
      glossaryRecoveryDraftFromEditor(editor)
    )
  };
}

/**
 * #574 Slice 4: a recovered draft for an EXISTING entry conflicts when the
 * entry was updated after the snapshot (`baseUpdatedAt` ≠ its `updatedAt`,
 * strict string comparison — both are the store's ISO timestamps). No
 * current entry (new / deleted → recovered as new) or no recorded base
 * (older rows) is never a conflict.
 */
export function glossaryRecoveryConflict(
  draft: GlossaryRecoveryDraft,
  currentEntry: GlossaryEntry | null
): GlossaryDescriptionRecoveryConflict | null {
  if (
    currentEntry === null ||
    draft.baseUpdatedAt === null ||
    draft.baseUpdatedAt === currentEntry.updatedAt
  ) {
    return null;
  }

  return {
    baseUpdatedAt: draft.baseUpdatedAt,
    currentUpdatedAt: currentEntry.updatedAt
  };
}

/**
 * Rebuild a DIRTY glossary Description tab from a recovered draft.
 *
 *   - `currentEntry` given (the saved entry still exists): the tab edits that
 *     entry — its baseline is the entry as stored NOW, the recovered draft
 *     on top of it. Atom ids unknown to the current entry become local.
 *   - `currentEntry` null (a never-saved new entry, or the saved entry was
 *     deleted since): an unsaved new-entry tab under `localId`; its first
 *     Ctrl+S creates the entry. All atoms are local.
 */
export function glossaryEditorFromRecoveryDraft(
  draft: GlossaryRecoveryDraft,
  currentEntry: GlossaryEntry | null,
  localId: string
): GlossaryDescriptionCurrentEditor {
  const knownAtomIds = new Set(currentEntry?.atoms.map((atom) => atom.id) ?? []);
  const representative = draft.atoms[0]?.value ?? "";
  const base: GlossaryDescriptionCurrentEditor = currentEntry
    ? createGlossaryDescriptionCurrentEditor(currentEntry)
    : createNewGlossaryDescriptionCurrentEditor(representative, localId);
  const recoveredDraft: GlossaryEntryDraft = {
    ...base.draft,
    description: draft.description,
    atoms: draft.atoms.map((atom) => ({
      id:
        atom.id !== null && knownAtomIds.has(atom.id)
          ? atom.id
          : createLocalGlossaryAtomId(),
      value: atom.value,
      matchFlags: atom.matchFlags
    })),
    tagIds: [...draft.tagIds]
  };

  return {
    ...base,
    draft: {
      ...recoveredDraft,
      saveState: isGlossaryEntryDraftDirty(recoveredDraft) ? "dirty" : "clean"
    },
    descriptionLineEndingBreaks: buildLineEndingBreakSet(
      analyzeLineEndings(draft.description)
    ),
    recoveryConflict: glossaryRecoveryConflict(draft, currentEntry)
  };
}
