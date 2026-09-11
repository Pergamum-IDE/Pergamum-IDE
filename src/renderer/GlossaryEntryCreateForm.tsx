import { useState } from "react";
import type {
  CreateGlossaryEntryInput,
  GlossaryTag,
  GlossaryTagId
} from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import { GlossaryTagChip } from "./GlossaryTagChip";

interface GlossaryEntryCreateFormProps {
  /** Pre-filled primary form value (from `GlossaryEntryEditorPaneState`). */
  presetRepresentative: string;
  availableTags: readonly GlossaryTag[];
  translate: Translate;
  /** Persist the new entry. Resolves `true` on success, `false` on failure. */
  onCreate: (input: CreateGlossaryEntryInput) => Promise<boolean>;
  /** Close the pane (Cancel, or after a successful create). */
  onClose: () => void;
}

/**
 * #436 Phase 8-0 PoC — Slice 6.
 *
 * The create-mode body of the Glossary Entry Editor Pane: a minimal new-entry
 * form (primary form + optional description + 0..n tags). MVP — the primary
 * form becomes the single `sortOrder: 0` atom; no multi-atom UI yet. On a
 * successful create the host refreshes the glossary and the pane closes.
 */
export function GlossaryEntryCreateForm({
  presetRepresentative,
  availableTags,
  translate,
  onCreate,
  onClose
}: GlossaryEntryCreateFormProps): JSX.Element {
  const [representative, setRepresentative] = useState(presetRepresentative);
  const [description, setDescription] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<readonly GlossaryTagId[]>(
    []
  );
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
      setError(translate("glossaryEntryEditorPane.create.emptyRepresentative"));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    let created = false;
    try {
      created = await onCreate({
        description: description.trim(),
        atoms: [{ value: trimmedRepresentative, matchFlags: 0 }],
        tagIds: [...selectedTagIds]
      });
    } catch {
      created = false;
    }

    if (created) {
      // The pane unmounts on close — no local reset needed.
      onClose();
      return;
    }

    setIsSubmitting(false);
    setError(translate("glossaryEntryEditorPane.create.failed"));
  }

  return (
    <form
      className="glossaryEntryCreateForm"
      aria-label={translate("glossaryEntryEditorPane.label")}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label className="glossaryEntryCreateFormField">
        <span>
          {translate("glossaryEntryEditorPane.create.representativeLabel")}
        </span>
        <input
          type="text"
          className="glossaryEntryCreateFormRepresentative"
          data-field="representative"
          value={representative}
          disabled={isSubmitting}
          onChange={(event) => setRepresentative(event.target.value)}
        />
      </label>

      <label className="glossaryEntryCreateFormField">
        <span>
          {translate("glossaryEntryEditorPane.create.descriptionLabel")}
        </span>
        <input
          type="text"
          className="glossaryEntryCreateFormDescription"
          data-field="description"
          value={description}
          disabled={isSubmitting}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>

      <div className="glossaryEntryCreateFormTagsSection">
        <span className="glossaryEntryCreateFormTagsLabel">
          {translate("glossaryEntryEditorPane.create.tagsLabel")}
        </span>
        {availableTags.length === 0 ? (
          <p className="glossaryEntryCreateFormTagsHint">
            {translate("glossaryEntryEditorPane.create.noTagsAvailable")}
          </p>
        ) : (
          <>
            <div className="glossaryEntryCreateFormTags">
              {availableTags.map((tag) => {
                const attached = selectedTagIds.includes(tag.id);
                return (
                  <button
                    type="button"
                    key={tag.id}
                    aria-pressed={attached}
                    className="glossaryEntryCreateFormTagToggle"
                    disabled={isSubmitting}
                    onClick={() => toggleTag(tag.id)}
                  >
                    <GlossaryTagChip tag={tag} muted={!attached} />
                  </button>
                );
              })}
            </div>
            {selectedTagIds.length === 0 ? (
              <p className="glossaryEntryCreateFormTagsHint">
                {translate("glossaryEntryEditorPane.create.noTagsSelected")}
              </p>
            ) : null}
          </>
        )}
      </div>

      {error ? (
        <p className="glossaryEntryCreateFormError" role="alert">
          {error}
        </p>
      ) : null}

      <div className="glossaryEntryCreateFormActions">
        <button
          type="button"
          className="glossaryEntryCreateFormCancel"
          disabled={isSubmitting}
          onClick={onClose}
        >
          {translate("glossaryEntryEditorPane.create.cancel")}
        </button>
        <button
          type="submit"
          className="glossaryEntryCreateFormSubmit"
          aria-disabled={trimmedRepresentative.length === 0}
          disabled={isSubmitting}
        >
          {translate("glossaryEntryEditorPane.create.submit")}
        </button>
      </div>
    </form>
  );
}
