import { useId, useState } from "react";
import chevronsDownIcon from "../../assets/icons/feather/glossary/chevrons-down.svg?raw";
import chevronsRightIcon from "../../assets/icons/feather/glossary/chevrons-right.svg?raw";
import {
  GlossaryAtomFlags,
  GlossaryBoundaryPolicy,
  getGlossaryAtomBoundaryEndPolicy,
  getGlossaryAtomBoundaryStartPolicy,
  hasGlossaryAtomFlag,
  setGlossaryAtomBoundaryEndPolicy,
  setGlossaryAtomBoundaryStartPolicy,
  setGlossaryAtomFlag,
  type GlossaryBoundaryPolicyValue
} from "../shared/glossaryAtomFlags";
import type { Translate, TranslationKey } from "../shared/i18n";

interface GlossaryAtomMatchFlagsEditorProps {
  matchFlags: number;
  translate: Translate;
  readOnly?: boolean;
  onChange: (matchFlags: number) => void;
}

interface BoundaryPolicyOption {
  readonly value: GlossaryBoundaryPolicyValue;
  readonly labelKey: TranslationKey;
}

/** `Reserved` is an internal encoding, not offered in the UI. */
const BOUNDARY_POLICY_OPTIONS: readonly BoundaryPolicyOption[] = [
  {
    value: GlossaryBoundaryPolicy.None,
    labelKey: "glossaryEditor.atoms.matchFlags.boundaryPolicy.none"
  },
  {
    value: GlossaryBoundaryPolicy.Auto,
    labelKey: "glossaryEditor.atoms.matchFlags.boundaryPolicy.auto"
  },
  {
    value: GlossaryBoundaryPolicy.Strict,
    labelKey: "glossaryEditor.atoms.matchFlags.boundaryPolicy.strict"
  }
];

function coerceBoundaryPolicyOption(raw: string): GlossaryBoundaryPolicyValue {
  const parsed = Number.parseInt(raw, 10);

  return (
    BOUNDARY_POLICY_OPTIONS.find((option) => option.value === parsed)?.value ??
    GlossaryBoundaryPolicy.None
  );
}

/**
 * #375: per-atom `matchFlags` bitmask editor.
 *
 * `AllowSingleCharacterMatch` is a single boolean (bit 0). Each match edge
 * carries a 2-bit boundary policy (bits 1-2 / 3-4), edited as its own
 * dropdown. Every write goes through the `glossaryAtomFlags` helpers rather
 * than raw bit literals, so `matchFlags` stays a normalized integer.
 */
export function GlossaryAtomMatchFlagsEditor({
  matchFlags,
  translate,
  readOnly = false,
  onChange
}: GlossaryAtomMatchFlagsEditorProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();
  const startPolicy = getGlossaryAtomBoundaryStartPolicy(matchFlags);
  const endPolicy = getGlossaryAtomBoundaryEndPolicy(matchFlags);

  return (
    <fieldset className="glossaryEditorAtomMatchFlags" data-expanded={expanded}>
      <legend>
        <button
          type="button"
          className="glossaryEditorAtomMatchFlagsToggle"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setExpanded((prev) => !prev)}
        >
          <span
            className="glossaryEditorAtomMatchFlagsToggleIcon"
            aria-hidden="true"
            dangerouslySetInnerHTML={{
              __html: expanded ? chevronsDownIcon : chevronsRightIcon
            }}
          />
          <span>{translate("glossaryEditor.atoms.matchFlags.heading")}</span>
        </button>
      </legend>

      <div
        id={bodyId}
        className="glossaryEditorAtomMatchFlagsBody"
        hidden={!expanded}
      >
        <label className="glossaryEditorAtomMatchFlagsField">
          <input
            type="checkbox"
            checked={hasGlossaryAtomFlag(
              matchFlags,
              GlossaryAtomFlags.AllowSingleCharacterMatch
            )}
            disabled={readOnly}
            onChange={(event) => {
              if (!readOnly) {
                onChange(
                  setGlossaryAtomFlag(
                    matchFlags,
                    GlossaryAtomFlags.AllowSingleCharacterMatch,
                    event.target.checked
                  )
                );
              }
            }}
          />
          <span>
            {translate("glossaryEditor.atoms.matchFlags.singleCharacter")}
          </span>
        </label>

        <label className="glossaryEditorAtomMatchFlagsField">
          <span>
            {translate("glossaryEditor.atoms.matchFlags.boundaryStartPolicy")}
          </span>
          <select
            value={String(startPolicy)}
            disabled={readOnly}
            onChange={(event) => {
              if (!readOnly) {
                onChange(
                  setGlossaryAtomBoundaryStartPolicy(
                    matchFlags,
                    coerceBoundaryPolicyOption(event.target.value)
                  )
                );
              }
            }}
          >
            {BOUNDARY_POLICY_OPTIONS.map((option) => (
              <option key={option.value} value={String(option.value)}>
                {translate(option.labelKey)}
              </option>
            ))}
          </select>
        </label>

        <label className="glossaryEditorAtomMatchFlagsField">
          <span>
            {translate("glossaryEditor.atoms.matchFlags.boundaryEndPolicy")}
          </span>
          <select
            value={String(endPolicy)}
            disabled={readOnly}
            onChange={(event) => {
              if (!readOnly) {
                onChange(
                  setGlossaryAtomBoundaryEndPolicy(
                    matchFlags,
                    coerceBoundaryPolicyOption(event.target.value)
                  )
                );
              }
            }}
          >
            {BOUNDARY_POLICY_OPTIONS.map((option) => (
              <option key={option.value} value={String(option.value)}>
                {translate(option.labelKey)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </fieldset>
  );
}
