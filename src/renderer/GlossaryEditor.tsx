import deleteIcon from "../../assets/icons/feather/glossary/delete.svg?raw";
import {
  glossaryEntryKinds,
  glossaryWarningPolicies,
  type GlossaryEntryKind,
  type GlossaryFormMatchBoundary,
  type GlossaryFormRelation,
  type GlossaryWarningPolicy
} from "../shared/glossary";
import type { Translate, TranslationKey } from "../shared/i18n";
import { pergamumContextSurfaceAttribute } from "../shared/editContextMenu";
import { GlossaryFormAdvancedMatchingSettings } from "./GlossaryFormAdvancedMatchingSettings";
import type {
  GlossaryEntryDraft,
  GlossaryFormDraft
} from "./glossaryEntryDraft";
import { canonicalGlossarySurface } from "./glossaryPresentation";
import { MarkdownEditor } from "./MarkdownEditor";
import { markdownPreviewRenderer } from "./preview/markdownPreviewRenderer";

const warningPolicyTranslationKeys: Record<
  GlossaryWarningPolicy,
  TranslationKey
> = {
  default: "glossaryEditor.warningPolicy.default",
  ignore: "glossaryEditor.warningPolicy.ignore",
  warn: "glossaryEditor.warningPolicy.warn"
};

interface GlossaryEditorProps {
  draft: GlossaryEntryDraft;
  translate: Translate;
  onChangeKind: (kind: GlossaryEntryKind) => void;
  onChangeDescription: (description: string) => void;
  onChangeCanonicalSurface: (surface: string) => void;
  onChangeCanonicalMatchBoundaryStart: (
    matchBoundaryStart: GlossaryFormMatchBoundary
  ) => void;
  onChangeCanonicalMatchBoundaryEnd: (
    matchBoundaryEnd: GlossaryFormMatchBoundary
  ) => void;
  onAddForm: (relation: GlossaryFormRelation) => void;
  onChangeFormSurface: (formId: string, surface: string) => void;
  onChangeFormWarningPolicy: (
    formId: string,
    warningPolicy: GlossaryWarningPolicy
  ) => void;
  onChangeFormMatchBoundaryStart: (
    formId: string,
    matchBoundaryStart: GlossaryFormMatchBoundary
  ) => void;
  onChangeFormMatchBoundaryEnd: (
    formId: string,
    matchBoundaryEnd: GlossaryFormMatchBoundary
  ) => void;
  onDeleteForm: (formId: string) => void;
  onDeleteEntry: () => void;
  onNavigateToPreviousOccurrence: () => void;
  onNavigateToNextOccurrence: () => void;
  readOnly?: boolean;
}

export function GlossaryEditor({
  draft,
  translate,
  onChangeKind,
  onChangeDescription,
  onChangeCanonicalSurface,
  onChangeCanonicalMatchBoundaryStart,
  onChangeCanonicalMatchBoundaryEnd,
  onAddForm,
  onChangeFormSurface,
  onChangeFormWarningPolicy,
  onChangeFormMatchBoundaryStart,
  onChangeFormMatchBoundaryEnd,
  onDeleteForm,
  onDeleteEntry,
  onNavigateToPreviousOccurrence,
  onNavigateToNextOccurrence,
  readOnly = false
}: GlossaryEditorProps): JSX.Element {
  const entry = draft.entry;
  const title = draft.canonicalSurface.trim() || canonicalGlossarySurface(entry);
  const descriptionHtml = markdownPreviewRenderer.render(draft.description);
  const aliases = draft.forms.filter((form) => form.relation === "alias");
  const variants = draft.forms.filter((form) => form.relation === "variant");

  function renderFormRows(forms: GlossaryFormDraft[]): JSX.Element[] {
    return forms.map((form) => (
      <div className="glossaryEditorFormRow" key={form.id}>
        <div className="glossaryEditorFormRowMain">
          <input
            type="text"
            value={form.surface}
            readOnly={readOnly}
            {...{
              [pergamumContextSurfaceAttribute]: "glossaryFormSurface"
            }}
            onChange={(event) =>
              !readOnly
                ? onChangeFormSurface(form.id, event.target.value)
                : undefined
            }
          />
          <select
            value={form.warningPolicy}
            aria-label={translate("glossaryEditor.warningPolicy")}
            disabled={readOnly}
            onChange={(event) =>
              !readOnly
                ? onChangeFormWarningPolicy(
                    form.id,
                    event.target.value as GlossaryWarningPolicy
                  )
                : undefined
            }
          >
            {glossaryWarningPolicies.map((warningPolicy) => (
              <option key={warningPolicy} value={warningPolicy}>
                {translate(warningPolicyTranslationKeys[warningPolicy])}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="glossaryEditorRemoveFormButton"
            aria-label={translate("glossaryEditor.removeForm")}
            title={translate("glossaryEditor.removeForm")}
            disabled={readOnly}
            onClick={() => {
              if (!readOnly) {
                onDeleteForm(form.id);
              }
            }}
          >
            <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: deleteIcon }} />
          </button>
        </div>
        <GlossaryFormAdvancedMatchingSettings
          matchBoundaryStart={form.matchBoundaryStart}
          matchBoundaryEnd={form.matchBoundaryEnd}
          translate={translate}
          readOnly={readOnly}
          onChangeMatchBoundaryStart={(matchBoundaryStart) =>
            !readOnly
              ? onChangeFormMatchBoundaryStart(form.id, matchBoundaryStart)
              : undefined
          }
          onChangeMatchBoundaryEnd={(matchBoundaryEnd) =>
            !readOnly
              ? onChangeFormMatchBoundaryEnd(form.id, matchBoundaryEnd)
              : undefined
          }
        />
      </div>
    ));
  }

  return (
    <section
      className="glossaryEditor"
      aria-label={translate("glossaryEditor.label")}
    >
      <header className="glossaryEditorHeader">
        <h1>{title}</h1>
        <label className="glossaryEditorKindField">
          <span>{translate("glossaryEditor.kind")}</span>
          <select
            value={draft.kind}
            disabled={readOnly}
            onChange={(event) =>
              !readOnly
                ? onChangeKind(event.target.value as GlossaryEntryKind)
                : undefined
            }
          >
            {glossaryEntryKinds.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
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
          <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: deleteIcon }} />
        </button>
      </header>

      <section className="glossaryEditorSection">
        <h2>{translate("glossaryEditor.forms")}</h2>
        <div className="glossaryEditorCanonicalField">
          <label className="glossaryEditorCanonicalFieldMain">
            <span>{translate("glossaryEditor.canonicalSurface")}</span>
            <input
              type="text"
              required
              value={draft.canonicalSurface}
              readOnly={readOnly}
              {...{
                [pergamumContextSurfaceAttribute]: "glossaryCanonicalInput"
              }}
              onChange={(event) =>
                !readOnly
                  ? onChangeCanonicalSurface(event.target.value)
                  : undefined
              }
            />
          </label>
          <GlossaryFormAdvancedMatchingSettings
            key={draft.entry.id}
            matchBoundaryStart={draft.canonicalMatchBoundaryStart}
            matchBoundaryEnd={draft.canonicalMatchBoundaryEnd}
            translate={translate}
            readOnly={readOnly}
            onChangeMatchBoundaryStart={(matchBoundaryStart) => {
              if (!readOnly) {
                onChangeCanonicalMatchBoundaryStart(matchBoundaryStart);
              }
            }}
            onChangeMatchBoundaryEnd={(matchBoundaryEnd) => {
              if (!readOnly) {
                onChangeCanonicalMatchBoundaryEnd(matchBoundaryEnd);
              }
            }}
          />
        </div>

        <div className="glossaryEditorFormGroup">
          <h3>{translate("glossaryEditor.aliases")}</h3>
          <div className="glossaryEditorForms">
            {renderFormRows(aliases)}
          </div>
          <button
            type="button"
            className="glossaryEditorAddForm"
            disabled={readOnly}
            onClick={() => {
              if (!readOnly) {
                onAddForm("alias");
              }
            }}
          >
            {translate("glossaryEditor.addAlias")}
          </button>
        </div>

        <div className="glossaryEditorFormGroup">
          <h3>{translate("glossaryEditor.variants")}</h3>
          <div className="glossaryEditorForms">
            {renderFormRows(variants)}
          </div>
          <button
            type="button"
            className="glossaryEditorAddForm"
            disabled={readOnly}
            onClick={() => {
              if (!readOnly) {
                onAddForm("variant");
              }
            }}
          >
            {translate("glossaryEditor.addVariant")}
          </button>
        </div>
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
