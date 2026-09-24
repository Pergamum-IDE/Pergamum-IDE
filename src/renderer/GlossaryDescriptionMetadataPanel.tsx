import { useId } from "react";
import chevronsDownIcon from "../../assets/icons/feather/glossary/chevrons-down.svg?raw";
import chevronsRightIcon from "../../assets/icons/feather/glossary/chevrons-right.svg?raw";
import type { GlossaryTag } from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import {
  GlossaryEntryMetadataFields,
  glossaryEntryMetadataDraftHandlers
} from "./GlossaryEntryMetadataFields";
import {
  glossaryEntryDraftValidity,
  representativeGlossaryAtomDraft,
  type GlossaryEntryDraft
} from "./glossaryEntryDraft";

interface GlossaryDescriptionMetadataPanelProps {
  draft: GlossaryEntryDraft;
  /** Every tag defined in the project, for the attach/detach picker. */
  availableTags: readonly GlossaryTag[];
  translate: Translate;
  readOnly: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  /** Apply one draft mutation to the tab's OWN `GlossaryEntryDraft`. */
  onUpdateDraft: (
    update: (draft: GlossaryEntryDraft) => GlossaryEntryDraft
  ) => void;
  onOpenTagManager: () => void;
}

/**
 * #573 Slice 5: the glossary Description tab's collapsible metadata area
 * (表記 / 検索設定 / タグ), shown above the Description editor + preview.
 * It edits the tab's own draft, so dirty / Ctrl+S / close confirm apply to
 * metadata edits exactly as to Description edits. Collapsed, it shows a
 * one-line summary — including the reason saving is blocked, if any.
 */
export function GlossaryDescriptionMetadataPanel({
  draft,
  availableTags,
  translate,
  readOnly,
  expanded,
  onToggleExpanded,
  onUpdateDraft,
  onOpenTagManager
}: GlossaryDescriptionMetadataPanelProps): JSX.Element {
  const bodyId = useId();
  const validity = glossaryEntryDraftValidity(draft);
  const representative = representativeGlossaryAtomDraft(draft)?.value.trim();
  const tagLabels = draft.tagIds
    .map((tagId) => availableTags.find((tag) => tag.id === tagId)?.label)
    .filter((label): label is string => label !== undefined);

  return (
    <section
      className="glossaryDescriptionMetadataPanel"
      data-expanded={expanded}
      aria-label={translate("glossaryDescriptionTab.metadata.heading")}
    >
      <div className="glossaryDescriptionMetadataHeader">
        <button
          type="button"
          className="glossaryDescriptionMetadataToggle"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={onToggleExpanded}
        >
          <span
            className="glossaryDescriptionMetadataToggleIcon"
            aria-hidden="true"
            dangerouslySetInnerHTML={{
              __html: expanded ? chevronsDownIcon : chevronsRightIcon
            }}
          />
          <span className="glossaryDescriptionMetadataHeading">
            {translate("glossaryDescriptionTab.metadata.heading")}
          </span>
        </button>
        {!expanded ? (
          <span className="glossaryDescriptionMetadataSummary">
            <span>
              {translate("glossaryDescriptionTab.metadata.summary.representative", {
                value: representative || "—"
              })}
            </span>
            <span>
              {translate("glossaryDescriptionTab.metadata.summary.atomCount", {
                count: draft.atoms.length
              })}
            </span>
            <span>
              {tagLabels.length > 0
                ? translate("glossaryDescriptionTab.metadata.summary.tags", {
                    tags: tagLabels.join(", ")
                  })
                : translate("glossaryDescriptionTab.metadata.summary.noTags")}
            </span>
          </span>
        ) : null}
        {!expanded && !validity.ok ? (
          <span
            className="glossaryDescriptionMetadataSummaryInvalid"
            role="alert"
          >
            {translate(
              validity.reason === "noAtoms"
                ? "glossaryEditor.validity.noAtoms"
                : "glossaryEditor.validity.duplicateAtomValue"
            )}
          </span>
        ) : null}
      </div>
      <div
        id={bodyId}
        className="glossaryDescriptionMetadataBody"
        hidden={!expanded}
      >
        <GlossaryEntryMetadataFields
          draft={draft}
          availableTags={availableTags}
          translate={translate}
          readOnly={readOnly}
          onOpenTagManager={onOpenTagManager}
          {...glossaryEntryMetadataDraftHandlers(onUpdateDraft)}
        />
      </div>
    </section>
  );
}
