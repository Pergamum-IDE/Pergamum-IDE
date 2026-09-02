import deleteIcon from "../../assets/icons/feather/glossary/delete.svg?raw";
import type { GlossaryTag } from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import { pergamumContextSurfaceAttribute } from "../shared/editContextMenu";
import { GlossaryAtomMatchFlagsEditor } from "./GlossaryAtomMatchFlagsEditor";
import {
  glossaryEntryDraftValidity,
  representativeGlossaryAtomDraft,
  type GlossaryEntryDraft
} from "./glossaryEntryDraft";
import { representativeGlossarySurface } from "./glossaryPresentation";
import { GlossaryTagChip } from "./GlossaryTagChip";
import { MarkdownEditor } from "./MarkdownEditor";
import { markdownPreviewRenderer } from "./preview/markdownPreviewRenderer";

interface GlossaryEditorProps {
  draft: GlossaryEntryDraft;
  /** Every tag defined in the project, for the attach/detach picker. */
  availableTags: readonly GlossaryTag[];
  translate: Translate;
  onChangeDescription: (description: string) => void;
  onAddAtom: () => void;
  onChangeAtomValue: (atomId: string, value: string) => void;
  onChangeAtomMatchFlags: (atomId: string, matchFlags: number) => void;
  onDeleteAtom: (atomId: string) => void;
  onMoveAtom: (atomId: string, direction: "up" | "down") => void;
  onToggleTag: (tagId: string) => void;
  /**
   * #375: open the dedicated Glossary Tag Manager tab — the "I need a tag
   * that doesn't exist yet" escape hatch from the tag picker.
   */
  onOpenTagManager: () => void;
  onDeleteEntry: () => void;
  onNavigateToPreviousOccurrence: () => void;
  onNavigateToNextOccurrence: () => void;
  readOnly?: boolean;
}

export function GlossaryEditor({
  draft,
  availableTags,
  translate,
  onChangeDescription,
  onAddAtom,
  onChangeAtomValue,
  onChangeAtomMatchFlags,
  onDeleteAtom,
  onMoveAtom,
  onToggleTag,
  onOpenTagManager,
  onDeleteEntry,
  onNavigateToPreviousOccurrence,
  onNavigateToNextOccurrence,
  readOnly = false
}: GlossaryEditorProps): JSX.Element {
  const title =
    representativeGlossaryAtomDraft(draft)?.value.trim() ||
    representativeGlossarySurface(draft.entry);
  const descriptionHtml = markdownPreviewRenderer.render(draft.description);
  const validity = glossaryEntryDraftValidity(draft);
  const attachedTagIds = new Set(draft.tagIds);

  return (
    <section
      className="glossaryEditor"
      aria-label={translate("glossaryEditor.label")}
    >
      <header className="glossaryEditorHeader">
        <h1>{title}</h1>
        <button
          type="button"
          className="glossaryEditorOccurrenceButton"
          aria-label={translate("glossaryEditor.previousOccurrence")}
          title={translate("glossaryEditor.previousOccurrence")}
          onClick={onNavigateToPreviousOccurrence}
        >
          {translate("glossaryEditor.previousOccurrenceLabel")}
        </button>
        <button
          type="button"
          className="glossaryEditorOccurrenceButton"
          aria-label={translate("glossaryEditor.nextOccurrence")}
          title={translate("glossaryEditor.nextOccurrence")}
          onClick={onNavigateToNextOccurrence}
        >
          {translate("glossaryEditor.nextOccurrenceLabel")}
        </button>
        <button
          type="button"
          className="glossaryEditorDeleteButton"
          aria-label={translate("glossaryEditor.deleteEntry")}
          title={translate("glossaryEditor.deleteEntry")}
          disabled={readOnly}
          onClick={() => {
            if (!readOnly) {
              onDeleteEntry();
            }
          }}
        >
          <span
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: deleteIcon }}
          />
        </button>
      </header>

      <section className="glossaryEditorSection">
        <h2>{translate("glossaryEditor.atoms.heading")}</h2>
        <ol className="glossaryEditorAtoms">
          {draft.atoms.map((atom, index) => (
            <li className="glossaryEditorAtomRow" key={atom.id}>
              <div className="glossaryEditorAtomRowMain">
                {index === 0 ? (
                  <span className="glossaryEditorAtomRepresentativeBadge">
                    {translate("glossaryEditor.atoms.representative")}
                  </span>
                ) : null}
                <input
                  type="text"
                  className="glossaryEditorAtomValue"
                  value={atom.value}
                  aria-label={translate("glossaryEditor.atoms.value")}
                  readOnly={readOnly}
                  {...{
                    [pergamumContextSurfaceAttribute]: "glossaryAtomValue"
                  }}
                  onChange={(event) => {
                    if (!readOnly) {
                      onChangeAtomValue(atom.id, event.target.value);
                    }
                  }}
                />
                <button
                  type="button"
                  className="glossaryEditorAtomMoveButton"
                  aria-label={translate("glossaryEditor.atoms.moveUp")}
                  title={translate("glossaryEditor.atoms.moveUp")}
                  disabled={readOnly || index === 0}
                  onClick={() => {
                    if (!readOnly) {
                      onMoveAtom(atom.id, "up");
                    }
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="glossaryEditorAtomMoveButton"
                  aria-label={translate("glossaryEditor.atoms.moveDown")}
                  title={translate("glossaryEditor.atoms.moveDown")}
                  disabled={readOnly || index === draft.atoms.length - 1}
                  onClick={() => {
                    if (!readOnly) {
                      onMoveAtom(atom.id, "down");
                    }
                  }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="glossaryEditorAtomRemoveButton"
                  aria-label={translate("glossaryEditor.atoms.remove")}
                  title={translate("glossaryEditor.atoms.remove")}
                  disabled={readOnly || draft.atoms.length === 1}
                  onClick={() => {
                    if (!readOnly) {
                      onDeleteAtom(atom.id);
                    }
                  }}
                >
                  <span
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: deleteIcon }}
                  />
                </button>
              </div>
              <GlossaryAtomMatchFlagsEditor
                matchFlags={atom.matchFlags}
                translate={translate}
                readOnly={readOnly}
                onChange={(matchFlags) =>
                  onChangeAtomMatchFlags(atom.id, matchFlags)
                }
              />
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="glossaryEditorAddAtom"
          disabled={readOnly}
          onClick={() => {
            if (!readOnly) {
              onAddAtom();
            }
          }}
        >
          {translate("glossaryEditor.atoms.add")}
        </button>
        {!validity.ok ? (
          <p className="glossaryEditorValidityMessage" role="alert">
            {translate(
              validity.reason === "noAtoms"
                ? "glossaryEditor.validity.noAtoms"
                : "glossaryEditor.validity.duplicateAtomValue"
            )}
          </p>
        ) : null}
      </section>

      <section className="glossaryEditorSection glossaryEditorTags">
        <div className="glossaryEditorTagsHeader">
          <h2>{translate("glossaryEditor.tags.heading")}</h2>
          <button
            type="button"
            className="glossaryEditorTagsManageLink"
            onClick={onOpenTagManager}
          >
            {translate("glossaryEditor.tags.openManager")}
          </button>
        </div>
        {availableTags.length === 0 ? (
          <p className="glossaryEditorTagsEmpty">
            {translate("glossaryEditor.tags.noProjectTags")}
          </p>
        ) : (
          <ul className="glossaryEditorTagList">
            {availableTags.map((tag) => {
              const attached = attachedTagIds.has(tag.id);

              return (
                <li key={tag.id}>
                  <button
                    type="button"
                    className="glossaryEditorTagToggle"
                    aria-pressed={attached}
                    aria-label={translate("glossaryEditor.tags.toggle")}
                    disabled={readOnly}
                    onClick={() => {
                      if (!readOnly) {
                        onToggleTag(tag.id);
                      }
                    }}
                  >
                    <GlossaryTagChip tag={tag} muted={!attached} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {availableTags.length > 0 && draft.tagIds.length === 0 ? (
          <p className="glossaryEditorTagsEmpty">
            {translate("glossaryEditor.tags.empty")}
          </p>
        ) : null}
      </section>

      <section className="glossaryEditorSection glossaryEditorDescription">
        <h2>{translate("glossaryEditor.description")}</h2>
        <div className="workspace glossaryEditorDescriptionWorkspace">
          <section
            className="pane"
            aria-label={translate("workspace.markdownEditor")}
          >
            <MarkdownEditor
              value={draft.description}
              onChange={readOnly ? () => undefined : onChangeDescription}
              contextSurface="glossaryDescription"
              readOnly={readOnly}
            />
          </section>

          <section
            className="pane"
            aria-label={translate("workspace.markdownPreview")}
          >
            {draft.description.trim().length > 0 ? (
              <article
                className="preview glossaryDescriptionPreview"
                dangerouslySetInnerHTML={{ __html: descriptionHtml }}
              />
            ) : (
              <p className="glossaryEditorEmptyDescription">
                {translate("glossaryEditor.emptyDescription")}
              </p>
            )}
          </section>
        </div>
      </section>
    </section>
  );
}
