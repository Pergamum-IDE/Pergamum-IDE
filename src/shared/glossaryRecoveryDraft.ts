/**
 * #573 Slice 9: the serializable Recovery form of a dirty glossary
 * Description tab's draft — stored as JSON in `Recovery.db`
 * `documents.payload_text` for `document_type = "glossary.description"`.
 *
 * It carries the WHOLE draft (Description AND metadata), never UI state:
 *
 *   - `entryId`       the saved entry this draft edits, or `null` for a
 *                     never-saved new entry,
 *   - `localId`       the temporary tab id of a never-saved new entry,
 *   - `baseUpdatedAt` the saved entry's `updatedAt` the draft diverged from,
 *   - `atoms`         ordered (index 0 = representative); `id` is the store
 *                     atom id, or `null` for an atom added in the draft.
 *
 * Pure: shared by the renderer (capture / restore) and main (candidate
 * preview + `.recovered.md` fallback). `payload_text` / this draft is never
 * sent to the renderer by the candidate LIST — only by the dedicated
 * explicit-restore IPC for a glossary candidate.
 */

export const GLOSSARY_RECOVERY_DRAFT_VERSION = 1;

export interface GlossaryRecoveryAtom {
  readonly id: string | null;
  readonly value: string;
  readonly matchFlags: number;
}

export interface GlossaryRecoveryDraft {
  readonly version: typeof GLOSSARY_RECOVERY_DRAFT_VERSION;
  readonly entryId: string | null;
  readonly localId: string | null;
  readonly baseUpdatedAt: string | null;
  readonly description: string;
  readonly atoms: readonly GlossaryRecoveryAtom[];
  readonly tagIds: readonly string[];
}

const ID_MAX = 512;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalId(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  return typeof value === "string" && value.length > 0 && value.length <= ID_MAX
    ? value
    : undefined;
}

function parseAtom(value: unknown): GlossaryRecoveryAtom | null {
  if (!isRecord(value) || typeof value.value !== "string") {
    return null;
  }

  const id = optionalId(value.id);

  if (
    id === undefined ||
    typeof value.matchFlags !== "number" ||
    !Number.isInteger(value.matchFlags) ||
    value.matchFlags < 0
  ) {
    return null;
  }

  return { id, value: value.value, matchFlags: value.matchFlags };
}

export function serializeGlossaryRecoveryDraft(
  draft: GlossaryRecoveryDraft
): string {
  return JSON.stringify({
    version: GLOSSARY_RECOVERY_DRAFT_VERSION,
    entryId: draft.entryId,
    localId: draft.localId,
    baseUpdatedAt: draft.baseUpdatedAt,
    description: draft.description,
    atoms: draft.atoms.map((atom) => ({
      id: atom.id,
      value: atom.value,
      matchFlags: atom.matchFlags
    })),
    tagIds: [...draft.tagIds]
  });
}

/**
 * Parse an untrusted `payload_text`. `null` when it is not a well-formed
 * current-version glossary draft (the caller then treats the row as not
 * restorable into a tab and may fall back to `.recovered.md`).
 */
export function parseGlossaryRecoveryDraft(
  payloadText: string
): GlossaryRecoveryDraft | null {
  let value: unknown;

  try {
    value = JSON.parse(payloadText);
  } catch {
    return null;
  }

  if (
    !isRecord(value) ||
    value.version !== GLOSSARY_RECOVERY_DRAFT_VERSION ||
    typeof value.description !== "string" ||
    !Array.isArray(value.atoms) ||
    !Array.isArray(value.tagIds)
  ) {
    return null;
  }

  const entryId = optionalId(value.entryId);
  const localId = optionalId(value.localId);
  const baseUpdatedAt = optionalId(value.baseUpdatedAt);

  if (
    entryId === undefined ||
    localId === undefined ||
    baseUpdatedAt === undefined ||
    (entryId === null && localId === null)
  ) {
    return null;
  }

  const atoms: GlossaryRecoveryAtom[] = [];

  for (const rawAtom of value.atoms) {
    const atom = parseAtom(rawAtom);

    if (!atom) {
      return null;
    }
    atoms.push(atom);
  }

  const tagIds: string[] = [];

  for (const tagId of value.tagIds) {
    if (typeof tagId !== "string" || tagId.length === 0 || tagId.length > ID_MAX) {
      return null;
    }
    tagIds.push(tagId);
  }

  return {
    version: GLOSSARY_RECOVERY_DRAFT_VERSION,
    entryId,
    localId,
    baseUpdatedAt,
    description: value.description,
    atoms,
    tagIds
  };
}

/**
 * The human text of a glossary Recovery row — its Description. Used for the
 * candidate preview / character count and for the `.recovered.md` fallback
 * (which therefore keeps the Description only; metadata is lost there). An
 * unparsable payload yields the raw text so nothing is silently dropped.
 */
export function glossaryRecoveryPayloadText(payloadText: string): string {
  return parseGlossaryRecoveryDraft(payloadText)?.description ?? payloadText;
}

/** Whether a glossary Recovery row is a never-saved new entry. */
export function isNewGlossaryRecoveryPayload(payloadText: string): boolean {
  return parseGlossaryRecoveryDraft(payloadText)?.entryId === null;
}
