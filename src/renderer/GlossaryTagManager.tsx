import { useState } from "react";
import type {
  CreateGlossaryTagInput,
  GlossaryTag,
  UpdateGlossaryTagInput
} from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import { GlossaryTagChip } from "./GlossaryTagChip";
import { GlossaryTagEditor } from "./GlossaryTagEditor";
import {
  createGlossaryTagDraftFromTag,
  createNewGlossaryTagDraft,
  glossaryTagDraftCreateInput,
  glossaryTagDraftUpdateInput,
  type GlossaryTagDraft
} from "./glossaryTagDraft";

interface GlossaryTagManagerProps {
  tags: readonly GlossaryTag[];
  translate: Translate;
  onCreateTag: (input: CreateGlossaryTagInput) => Promise<unknown>;
  onUpdateTag: (input: UpdateGlossaryTagInput) => Promise<unknown>;
  /**
   * Hard delete. The host confirms first through the Pergamum destructive
   * confirm dialog (the tag label is passed so it can name the target).
   */
  onDeleteTag: (tagId: string, tagLabel: string) => Promise<unknown>;
  /**
   * #375: start with the "new tag" form already open (used when the Tag
   * Manager tab is opened from the Glossary Entry editor's "Manage tags"
   * link, i.e. the user wants a tag that does not exist yet).
   */
  autoStartCreate?: boolean;
}

/**
 * #375: Glossary Tag CRUD surface — a list of tag chips plus an inline
 * {@link GlossaryTagEditor} for create / rename / recolor, and a per-row
 * hard-delete.
 */
export function GlossaryTagManager({
  tags,
  translate,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
  autoStartCreate = false
}: GlossaryTagManagerProps): JSX.Element {
  const [draft, setDraft] = useState<GlossaryTagDraft | null>(() =>
    autoStartCreate ? createNewGlossaryTagDraft() : null
  );
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    if (!draft || busy) {
      return;
    }

    setBusy(true);

    try {
      if (draft.tagId === null) {
        await onCreateTag(glossaryTagDraftCreateInput(draft));
      } else {
        await onUpdateTag(glossaryTagDraftUpdateInput(draft));
      }

      setDraft(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="glossaryTagManager"
      aria-label={translate("glossaryTagEditor.listHeading")}
    >
      <div className="glossaryTagManagerHeader">
        <h2>{translate("glossaryTagEditor.listHeading")}</h2>
        <button
          type="button"
          className="glossaryTagManagerNew"
          disabled={busy || draft?.tagId === null}
          onClick={() => setDraft(createNewGlossaryTagDraft())}
        >
          {translate("glossaryTagEditor.newTag")}
        </button>
      </div>

      {tags.length === 0 ? (
        <p className="glossaryTagManagerEmpty">
          {translate("glossaryTagEditor.listEmpty")}
        </p>
      ) : (
        <ul className="glossaryTagManagerList">
          {tags.map((tag) => (
            <li className="glossaryTagManagerRow" key={tag.id}>
              <GlossaryTagChip tag={tag} />
              <button
                type="button"
                className="glossaryTagManagerEdit"
                disabled={busy}
                onClick={() => setDraft(createGlossaryTagDraftFromTag(tag))}
              >
                {translate("glossaryTagEditor.editTag")}
              </button>
              <button
                type="button"
                className="glossaryTagManagerDelete"
                disabled={busy}
                onClick={() => {
                  void onDeleteTag(tag.id, tag.label);
                }}
              >
                {translate("glossaryTagEditor.deleteTag")}
              </button>
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <GlossaryTagEditor
          draft={draft}
          translate={translate}
          busy={busy}
          onChange={setDraft}
          onSubmit={() => {
            void submit();
          }}
          onCancel={() => setDraft(null)}
        />
      ) : null}
    </section>
  );
}
