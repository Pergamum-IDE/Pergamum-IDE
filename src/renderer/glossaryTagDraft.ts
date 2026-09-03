/**
 * #375: editable draft for the Glossary Tag editor (GitHub-label-style).
 * Covers both "create a new tag" (`tagId === null`) and "edit an existing
 * tag". No auto/manual foreground mode is stored — see `glossaryTagColor.ts`.
 */

import {
  GLOSSARY_TAG_LABEL_MAX_LENGTH,
  GlossaryValidationError,
  normalizeGlossaryRgbHex,
  type CreateGlossaryTagInput,
  type GlossaryTag,
  type UpdateGlossaryTagInput
} from "../shared/glossary";
import {
  autoGlossaryTagForegroundRgb,
  randomGlossaryTagBackgroundRgb
} from "../shared/glossaryTagColor";

export interface GlossaryTagDraft {
  /** `null` while creating; the tag id while editing. */
  tagId: string | null;
  label: string;
  /** Raw text; `""`/whitespace becomes `null` on save. */
  description: string;
  /** Raw `#RRGGBB` text as typed; normalized on save. */
  backgroundRgb: string;
  foregroundRgb: string;
}

export function createNewGlossaryTagDraft(
  random: () => number = Math.random
): GlossaryTagDraft {
  const backgroundRgb = randomGlossaryTagBackgroundRgb(random);

  return {
    tagId: null,
    label: "",
    description: "",
    backgroundRgb,
    // #375: a fresh tag starts with the YIQ-contrasting foreground for its
    // random background; the user is free to type over it.
    foregroundRgb: autoGlossaryTagForegroundRgb(backgroundRgb)
  };
}

/**
 * #375: randomize the background AND recompute the foreground from it (YIQ) in
 * one step — the manual "Auto foreground" affordance is gone.
 */
export function randomizeGlossaryTagDraftColors(
  draft: GlossaryTagDraft,
  random: () => number = Math.random
): GlossaryTagDraft {
  const backgroundRgb = randomGlossaryTagBackgroundRgb(random);

  return {
    ...draft,
    backgroundRgb,
    foregroundRgb: autoGlossaryTagForegroundRgb(backgroundRgb)
  };
}

export function createGlossaryTagDraftFromTag(
  tag: GlossaryTag
): GlossaryTagDraft {
  return {
    tagId: tag.id,
    label: tag.label,
    description: tag.description ?? "",
    backgroundRgb: tag.backgroundRgb,
    foregroundRgb: tag.foregroundRgb
  };
}

export type GlossaryTagDraftValidity =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        | "emptyLabel"
        | "labelTooLong"
        | "invalidBackground"
        | "invalidForeground";
    };

function isValidRgbHex(value: string): boolean {
  try {
    normalizeGlossaryRgbHex(value);
    return true;
  } catch (error) {
    if (error instanceof GlossaryValidationError) {
      return false;
    }
    throw error;
  }
}

export function glossaryTagDraftValidity(
  draft: GlossaryTagDraft
): GlossaryTagDraftValidity {
  const trimmedLabel = draft.label.trim();

  if (trimmedLabel.length === 0) {
    return { ok: false, reason: "emptyLabel" };
  }

  if ([...trimmedLabel].length > GLOSSARY_TAG_LABEL_MAX_LENGTH) {
    return { ok: false, reason: "labelTooLong" };
  }

  if (!isValidRgbHex(draft.backgroundRgb)) {
    return { ok: false, reason: "invalidBackground" };
  }

  if (!isValidRgbHex(draft.foregroundRgb)) {
    return { ok: false, reason: "invalidForeground" };
  }

  return { ok: true };
}

/**
 * Best-effort normalized values for the live preview chip — falls back to the
 * raw text when it is not yet a valid color so the preview never throws.
 */
export function glossaryTagDraftPreview(draft: GlossaryTagDraft): {
  label: string;
  backgroundRgb: string;
  foregroundRgb: string;
} {
  const safe = (value: string, fallback: string): string => {
    try {
      return normalizeGlossaryRgbHex(value);
    } catch {
      return fallback;
    }
  };

  return {
    label: draft.label.trim() || draft.label,
    backgroundRgb: safe(draft.backgroundRgb, "#e2e8f0"),
    foregroundRgb: safe(draft.foregroundRgb, "#25313d")
  };
}

function normalizedDescription(draft: GlossaryTagDraft): string | null {
  return draft.description.trim().length === 0 ? null : draft.description;
}

export function glossaryTagDraftCreateInput(
  draft: GlossaryTagDraft
): CreateGlossaryTagInput {
  return {
    label: draft.label.trim(),
    description: normalizedDescription(draft),
    backgroundRgb: normalizeGlossaryRgbHex(draft.backgroundRgb),
    foregroundRgb: normalizeGlossaryRgbHex(draft.foregroundRgb)
  };
}

export function glossaryTagDraftUpdateInput(
  draft: GlossaryTagDraft
): UpdateGlossaryTagInput {
  if (draft.tagId === null) {
    throw new Error("Cannot build an update input for an unsaved tag draft.");
  }

  return {
    id: draft.tagId,
    label: draft.label.trim(),
    description: normalizedDescription(draft),
    backgroundRgb: normalizeGlossaryRgbHex(draft.backgroundRgb),
    foregroundRgb: normalizeGlossaryRgbHex(draft.foregroundRgb)
  };
}
