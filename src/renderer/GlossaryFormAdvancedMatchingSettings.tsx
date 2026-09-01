import { useState } from "react";
import {
  glossaryFormMatchBoundaries,
  type GlossaryFormMatchBoundary
} from "../shared/glossary";
import type { Translate, TranslationKey } from "../shared/i18n";

const matchBoundaryLabelTranslationKeys: Record<
  GlossaryFormMatchBoundary,
  TranslationKey
> = {
  auto: "glossaryEditor.matchBoundary.auto.label",
  strict: "glossaryEditor.matchBoundary.strict.label",
  none: "glossaryEditor.matchBoundary.none.label"
};

const matchBoundaryDescriptionTranslationKeys: Record<
  GlossaryFormMatchBoundary,
  TranslationKey
> = {
  auto: "glossaryEditor.matchBoundary.auto.description",
  strict: "glossaryEditor.matchBoundary.strict.description",
  none: "glossaryEditor.matchBoundary.none.description"
};

interface GlossaryFormAdvancedMatchingSettingsViewProps {
  matchBoundaryStart: GlossaryFormMatchBoundary;
  matchBoundaryEnd: GlossaryFormMatchBoundary;
  allowSingleCharacterMatch: boolean;
  translate: Translate;
  isExpanded: boolean;
  readOnly?: boolean;
  onToggleExpanded: () => void;
  onChangeMatchBoundaryStart: (value: GlossaryFormMatchBoundary) => void;
  onChangeMatchBoundaryEnd: (value: GlossaryFormMatchBoundary) => void;
  onChangeAllowSingleCharacterMatch: (value: boolean) => void;
}

export function GlossaryFormAdvancedMatchingSettingsView({
  matchBoundaryStart,
  matchBoundaryEnd,
  allowSingleCharacterMatch,
  translate,
  isExpanded,
  readOnly = false,
  onToggleExpanded,
  onChangeMatchBoundaryStart,
  onChangeMatchBoundaryEnd,
  onChangeAllowSingleCharacterMatch
}: GlossaryFormAdvancedMatchingSettingsViewProps): JSX.Element {
  return (
    <div className="glossaryEditorAdvancedMatchingSettings">
      <button
        type="button"
        className="glossaryEditorAdvancedMatchingSettingsToggle"
        aria-expanded={isExpanded}
        onClick={onToggleExpanded}
      >
        <span
          className="glossaryEditorAdvancedMatchingSettingsChevron"
          aria-hidden="true"
        >
          {isExpanded ? "▾" : "▸"}
        </span>
        {translate("glossaryEditor.advancedMatchingSettings")}
      </button>
      {isExpanded ? (
        <div className="glossaryEditorAdvancedMatchingSettingsBody">
          <label className="glossaryEditorMatchBoundaryField">
            <span>{translate("glossaryEditor.matchBoundaryStart")}</span>
            <select
              value={matchBoundaryStart}
              aria-label={translate("glossaryEditor.matchBoundaryStart")}
              disabled={readOnly}
              onChange={(event) =>
                !readOnly
                  ? onChangeMatchBoundaryStart(
                      event.target.value as GlossaryFormMatchBoundary
                    )
                  : undefined
              }
            >
              {glossaryFormMatchBoundaries.map((matchBoundary) => (
                <option key={matchBoundary} value={matchBoundary}>
                  {translate(matchBoundaryLabelTranslationKeys[matchBoundary])}
                </option>
              ))}
            </select>
            <p className="glossaryEditorMatchBoundaryDescription">
              {translate(
                matchBoundaryDescriptionTranslationKeys[matchBoundaryStart]
              )}
            </p>
          </label>

          <label className="glossaryEditorMatchBoundaryField">
            <span>{translate("glossaryEditor.matchBoundaryEnd")}</span>
            <select
              value={matchBoundaryEnd}
              aria-label={translate("glossaryEditor.matchBoundaryEnd")}
              disabled={readOnly}
              onChange={(event) =>
                !readOnly
                  ? onChangeMatchBoundaryEnd(
                      event.target.value as GlossaryFormMatchBoundary
                    )
                  : undefined
              }
            >
              {glossaryFormMatchBoundaries.map((matchBoundary) => (
                <option key={matchBoundary} value={matchBoundary}>
                  {translate(matchBoundaryLabelTranslationKeys[matchBoundary])}
                </option>
              ))}
            </select>
            <p className="glossaryEditorMatchBoundaryDescription">
              {translate(
                matchBoundaryDescriptionTranslationKeys[matchBoundaryEnd]
              )}
            </p>
          </label>

          <label className="glossaryEditorAllowSingleCharacterMatchField">
            <input
              type="checkbox"
              checked={allowSingleCharacterMatch}
              disabled={readOnly}
              onChange={(event) =>
                !readOnly
                  ? onChangeAllowSingleCharacterMatch(event.target.checked)
                  : undefined
              }
            />
            <span>
              {translate("glossaryEditor.allowSingleCharacterMatch.label")}
            </span>
            <p className="glossaryEditorMatchBoundaryDescription">
              {translate("glossaryEditor.allowSingleCharacterMatch.helper")}
            </p>
          </label>
        </div>
      ) : null}
    </div>
  );
}

interface GlossaryFormAdvancedMatchingSettingsProps {
  matchBoundaryStart: GlossaryFormMatchBoundary;
  matchBoundaryEnd: GlossaryFormMatchBoundary;
  allowSingleCharacterMatch: boolean;
  translate: Translate;
  readOnly?: boolean;
  onChangeMatchBoundaryStart: (value: GlossaryFormMatchBoundary) => void;
  onChangeMatchBoundaryEnd: (value: GlossaryFormMatchBoundary) => void;
  onChangeAllowSingleCharacterMatch: (value: boolean) => void;
}

export function GlossaryFormAdvancedMatchingSettings(
  props: GlossaryFormAdvancedMatchingSettingsProps
): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <GlossaryFormAdvancedMatchingSettingsView
      {...props}
      isExpanded={isExpanded}
      onToggleExpanded={() => setIsExpanded((current) => !current)}
    />
  );
}
