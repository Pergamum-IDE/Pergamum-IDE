import { useState } from "react";
import type { GlossaryTag, GlossaryTagId } from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import { GlossaryTagChip } from "./GlossaryTagChip";

export type GlossaryEntryFormMode = "create" | "edit";

/** The fields the form edits, and the shape it hands back to `onSubmit`. */
export interface GlossaryEntryFormValue {
  representative: string;
  description: string;
  tagIds: readonly GlossaryTagId[];
}

interface GlossaryEntryFormProps {
  /**
   * `"create"` / `"edit"` — informational (`data-form-mode`) for now. The two
   * modes render the identical fields; callers differ only in `initialValue`,
   * `submitLabel`, `failedMessage`, and what `onSubmit` persists to.
   */
  mode: GlossaryEntryFormMode;
  initialValue: GlossaryEntryFormValue;
  availableTags: readonly GlossaryTag[];
  translate: Translate;
  /** "作成" for create, "保存" for a future edit mode. */
  submitLabel: string;
  /** Shown on a failed submit — the one piece of copy that genuinely differs
   *  between create and edit ("could not create" vs. "could not save"). */
  failedMessage: string;
  /** Persist the value. Resolves `true` on success, `false` on failure. */
  onSubmit: (value: GlossaryEntryFormValue) => Promise<boolean>;
  /** Close the pane (Cancel, or after a successful submit). */
  onClose: () => void;
}

/**
 * #436 Phase 8-0 PoC — Slice 7.
 *
 * The single Glossary Entry Editor Pane form, shared by create AND (once a
 * later slice wires it up) edit mode — per PO direction, registering and
 * editing a glossary entry are never separate screens. Slice 6 introduced
 * this as `GlossaryEntryCreateForm`; Slice 7 generalized it so a future edit
 * mode reuses it instead of forking a second form.
 *
 * MVP scope unchanged from Slice 6: primary form + optional description +
 * 0..n tags. No multi-atom UI yet — the representative becomes the entry's
 * single `sortOrder: 0` atom in the caller's `onSubmit` adapter.
 */
export function GlossaryEntryForm({
  mode,
  initialValue,
  availableTags,
  translate,
  submitLabel,
  failedMessage,
  onSubmit,
  onClose
}: GlossaryEntryFormProps): JSX.Element {
  const [representative, setRepresentative] = useState(
    initialValue.representative
  );
  const [description, setDescription] = useState(initialValue.description);
  const [selectedTagIds, setSelectedTagIds] = useState<
    readonly GlossaryTagId[]
  >(initialValue.tagIds);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedRepresentative = representative.trim();

  function toggleTag(tagId: GlossaryTagId): void {
    setSelectedTagIds((current) =>
      current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId]
    );
  }

  async function submit(): Promise<void> {
    if (isSubmitting) {
      return;
    }

    if (trimmedRepresentative.length === 0) {
      setError(translate("glossaryEntryEditorPane.form.emptyRepresentative"));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    let ok = false;
    try {
      ok = await onSubmit({
        representative: trimmedRepresentative,
        description: description.trim(),
        tagIds: [...selectedTagIds]
      });
    } catch {
      ok = false;
    }

    if (ok) {
      // The pane unmounts on close — no local reset needed.
      onClose();
      return;
    }

    setIsSubmitting(false);
    setError(failedMessage);
  }

  return (
    <form
      className="glossaryEntryForm"
      data-form-mode={mode}
      aria-label={translate("glossaryEntryEditorPane.label")}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label className="glossaryEntryFormField">
        <span>
          {translate("glossaryEntryEditorPane.form.representativeLabel")}
        </span>
        <input
          type="text"
          className="glossaryEntryFormRepresentative"
          data-field="representative"
          value={representative}
          disabled={isSubmitting}
          onChange={(event) => setRepresentative(event.target.value)}
        />
      </label>

      <label className="glossaryEntryFormField">
        <span>
          {translate("glossaryEntryEditorPane.form.descriptionLabel")}
        </span>
        <input
          type="text"
          className="glossaryEntryFormDescription"
          data-field="description"
          value={description}
          disabled={isSubmitting}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>

      <div className="glossaryEntryFormTagsSection">
        <span className="glossaryEntryFormTagsLabel">
          {translate("glossaryEntryEditorPane.form.tagsLabel")}
        </span>
        {availableTags.length === 0 ? (
          <p className="glossaryEntryFormTagsHint">
            {translate("glossaryEntryEditorPane.form.noTagsAvailable")}
          </p>
        ) : (
          <>
            <div className="glossaryEntryFormTags">
              {availableTags.map((tag) => {
                const attached = selectedTagIds.includes(tag.id);
                return (
                  <button
                    type="button"
                    key={tag.id}
                    aria-pressed={attached}
                    className="glossaryEntryFormTagToggle"
                    disabled={isSubmitting}
                    onClick={() => toggleTag(tag.id)}
                  >
                    <GlossaryTagChip tag={tag} muted={!attached} />
                  </button>
                );
              })}
            </div>
            {selectedTagIds.length === 0 ? (
              <p className="glossaryEntryFormTagsHint">
                {translate("glossaryEntryEditorPane.form.noTagsSelected")}
              </p>
            ) : null}
          </>
        )}
      </div>

      {error ? (
        <p className="glossaryEntryFormError" role="alert">
          {error}
        </p>
      ) : null}

      <div className="glossaryEntryFormActions">
        <button
          type="button"
          className="glossaryEntryFormCancel"
          disabled={isSubmitting}
          onClick={onClose}
        >
          {translate("glossaryEntryEditorPane.form.cancel")}
        </button>
        <button
          type="submit"
          className="glossaryEntryFormSubmit"
          aria-disabled={trimmedRepresentative.length === 0}
          disabled={isSubmitting}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
