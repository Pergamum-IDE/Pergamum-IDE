import { useId, useState, type FormEvent } from "react";
import type { AozoraEmphasisMark, EmphasisMarkRule } from "../../shared/settings";
import type { Translate } from "../../shared/i18n";
import {
  getEmphasisMarkPreviewSymbol,
  validateNarouEmphasisMarkText
} from "../../shared/emphasisMarkSettings";
import { applyEmphasisMark } from "../../shared/emphasisMarkGenerator";
import { InfoDialog } from "./InfoDialog";

export interface EmphasisMarkDialogProps {
  readonly isOpen: boolean;
  readonly selectedText: string;
  readonly initialRule: EmphasisMarkRule;
  readonly initialAozoraMark: AozoraEmphasisMark;
  readonly initialNarouMarkText: string;
  readonly opener?: Element | null;
  readonly translate: Translate;
  readonly onApply: (replacementText: string) => void;
  readonly onClose: () => void;
}

const AOZORA_MARK_OPTIONS: readonly AozoraEmphasisMark[] = [
  "sesame",
  "whiteSesame",
  "circle",
  "whiteCircle",
  "blackTriangle",
  "whiteTriangle",
  "doubleCircle",
  "fisheye",
  "saltire"
];

function EmphasisMarkDialogContent({
  selectedText,
  initialRule,
  initialAozoraMark,
  initialNarouMarkText,
  opener,
  translate,
  onApply,
  onClose
}: Omit<EmphasisMarkDialogProps, "isOpen">): JSX.Element {
  const [rule, setRule] = useState<EmphasisMarkRule>(initialRule);
  const [aozoraMark, setAozoraMark] =
    useState<AozoraEmphasisMark>(initialAozoraMark);
  const [narouMarkText, setNarouMarkText] =
    useState<string>(initialNarouMarkText);

  const dialogId = useId();
  const ruleSelectId = `${dialogId}-rule`;
  const aozoraMarkSelectId = `${dialogId}-aozoraMark`;
  const narouInputId = `${dialogId}-narouMarkText`;

  const isNarouInvalid =
    rule === "narou" && !validateNarouEmphasisMarkText(narouMarkText);

  const sourcePreviewText = isNarouInvalid
    ? ""
    : applyEmphasisMark({
        text: selectedText,
        rule,
        aozoraMark,
        narouMarkText
      });

  const appliedPreviewSymbol = getEmphasisMarkPreviewSymbol({
    rule,
    aozoraMark,
    narouMarkText
  });

  const handleSubmit = (event?: FormEvent): void => {
    if (event) {
      event.preventDefault();
    }
    if (isNarouInvalid) {
      return;
    }
    onApply(sourcePreviewText);
    onClose();
  };

  return (
    <InfoDialog
      title={translate("emphasisMark.dialog.title")}
      opener={opener ?? null}
      className="emphasisMarkDialog"
      onClose={onClose}
      footer={
        <div className="appDialogActions">
          <button
            type="button"
            className="appDialogButton appDialogButton-cancel"
            onClick={onClose}
          >
            {translate("emphasisMark.dialog.cancel")}
          </button>
          <button
            type="button"
            className="appDialogButton appDialogButton-confirm"
            disabled={isNarouInvalid}
            onClick={() => handleSubmit()}
            autoFocus
          >
            {translate("emphasisMark.dialog.insert")}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="emphasisMarkDialogForm">
        <div className="appFormField emphasisMarkTargetField">
          <span className="emphasisMarkTargetLabel">
            {translate("emphasisMark.dialog.targetLabel")}
          </span>{" "}
          <span className="emphasisMarkTargetText">{selectedText}</span>
        </div>

        <div className="appFormField">
          <label htmlFor={ruleSelectId} className="appFormLabel">
            {translate("emphasisMark.dialog.ruleLabel")}
          </label>
          <select
            id={ruleSelectId}
            className="appSelect"
            value={rule}
            onChange={(e) => setRule(e.target.value as EmphasisMarkRule)}
          >
            <option value="aozora">
              {translate("settings.editor.emphasisMark.rule.option.aozora.label")}
            </option>
            <option value="kakuyomu">
              {translate("settings.editor.emphasisMark.rule.option.kakuyomu.label")}
            </option>
            <option value="narou">
              {translate("settings.editor.emphasisMark.rule.option.narou.label")}
            </option>
          </select>
        </div>

        {rule === "aozora" && (
          <div className="appFormField">
            <label htmlFor={aozoraMarkSelectId} className="appFormLabel">
              {translate("emphasisMark.dialog.markSymbolLabel")}
            </label>
            <select
              id={aozoraMarkSelectId}
              className="appSelect"
              value={aozoraMark}
              onChange={(e) =>
                setAozoraMark(e.target.value as AozoraEmphasisMark)
              }
            >
              {AOZORA_MARK_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {translate(
                    `settings.editor.emphasisMark.aozoraMark.option.${opt}.label` as any
                  )}
                </option>
              ))}
            </select>
          </div>
        )}

        {rule === "kakuyomu" && (
          <div className="appFormField">
            <label className="appFormLabel">
              {translate("emphasisMark.dialog.markSymbolLabel")}
            </label>
            <div className="appFormHelp">
              {translate("emphasisMark.dialog.kakuyomuNote")}
            </div>
          </div>
        )}

        {rule === "narou" && (
          <div className="appFormField">
            <label htmlFor={narouInputId} className="appFormLabel">
              {translate("emphasisMark.dialog.markSymbolLabel")}
            </label>
            <input
              id={narouInputId}
              type="text"
              className="appInput"
              value={narouMarkText}
              onChange={(e) => setNarouMarkText(e.target.value)}
            />
            {isNarouInvalid && (
              <div className="appFormHelp appFormHelp-error">
                {translate("emphasisMark.dialog.narouInvalidNote")}
              </div>
            )}
          </div>
        )}

        <div className="appFormField emphasisMarkSourcePreviewField">
          <div className="appFormLabel">
            {translate("emphasisMark.dialog.sourcePreviewLabel")}
          </div>
          <div className="emphasisMarkSourcePreview">{sourcePreviewText}</div>
        </div>

        <div className="appFormField emphasisMarkAppliedPreviewField">
          <div className="appFormLabel">
            {translate("emphasisMark.dialog.appliedPreviewLabel")}
          </div>
          <div className="emphasisMarkAppliedPreview">
            {!isNarouInvalid && (
              <span
                className="emphasisMarkRenderedPreviewText"
                style={
                  {
                    WebkitTextEmphasisStyle: `"${appliedPreviewSymbol}"`,
                    textEmphasisStyle: `"${appliedPreviewSymbol}"`,
                    WebkitTextEmphasisPosition: "over right",
                    textEmphasisPosition: "over right"
                  } as React.CSSProperties
                }
              >
                {selectedText}
              </span>
            )}
          </div>
        </div>
      </form>
    </InfoDialog>
  );
}

export function EmphasisMarkDialog(props: EmphasisMarkDialogProps): JSX.Element | null {
  if (!props.isOpen) {
    return null;
  }
  return <EmphasisMarkDialogContent {...props} />;
}
