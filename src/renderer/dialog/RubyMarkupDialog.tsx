import { Fragment, useId, useState, type FormEvent } from "react";
import type { RubyMarkupRule } from "../../shared/settings";
import type { Translate } from "../../shared/i18n";
import {
  countGraphemes,
  RUBY_TEXT_MAX_GRAPHEMES,
  validateRubyText
} from "../../shared/rubyMarkupSettings";
import {
  applyRubyMarkup,
  renderDendenRubyHtml
} from "../../shared/rubyMarkupGenerator";
import { InfoDialog } from "./InfoDialog";

export interface RubyMarkupDialogProps {
  readonly isOpen: boolean;
  readonly selectedText: string;
  readonly initialRule: RubyMarkupRule;
  readonly opener?: Element | null;
  readonly translate: Translate;
  readonly onApply: (replacementText: string) => void;
  readonly onClose: () => void;
}

function RubyMarkupDialogContent({
  selectedText,
  initialRule,
  opener,
  translate,
  onApply,
  onClose
}: Omit<RubyMarkupDialogProps, "isOpen">): JSX.Element {
  const [rule, setRule] = useState<RubyMarkupRule>(initialRule);
  const [rubyText, setRubyText] = useState<string>("");

  const dialogId = useId();
  const ruleSelectId = `${dialogId}-rule`;
  const rubyInputId = `${dialogId}-rubyText`;

  const isValid = validateRubyText(rubyText, rule);

  const sourcePreviewText = isValid
    ? applyRubyMarkup({
        text: selectedText,
        rule,
        rubyText
      })
    : "";

  const currentGraphemeCount = countGraphemes(rubyText);

  const handleSubmit = (event?: FormEvent): void => {
    if (event) {
      event.preventDefault();
    }
    if (!isValid) {
      return;
    }
    onApply(sourcePreviewText);
    onClose();
  };

  const renderAppliedPreview = (): JSX.Element | null => {
    if (!isValid) {
      return null;
    }
    if (rule === "denden") {
      const parts = rubyText.split("|");
      const html = renderDendenRubyHtml(selectedText, parts);
      return <span dangerouslySetInnerHTML={{ __html: html }} />;
    }
    return (
      <ruby>
        {selectedText}
        <rt>{rubyText}</rt>
      </ruby>
    );
  };

  return (
    <InfoDialog
      title={translate("rubyMarkup.dialog.title")}
      opener={opener ?? null}
      className="rubyMarkupDialog"
      onClose={onClose}
      footer={
        <div className="appDialogActions">
          <button
            type="button"
            className="appDialogButton appDialogButton-cancel"
            onClick={onClose}
          >
            {translate("rubyMarkup.dialog.cancel")}
          </button>
          <button
            type="button"
            className="appDialogButton appDialogButton-confirm"
            disabled={!isValid}
            onClick={() => handleSubmit()}
          >
            {translate("rubyMarkup.dialog.insert")}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="rubyMarkupDialogForm">
        <div className="appFormField rubyTargetField">
          <span className="rubyTargetLabel">
            {translate("rubyMarkup.dialog.targetLabel")}
          </span>{" "}
          <span className="rubyTargetText">{selectedText}</span>
        </div>

        <div className="appFormField">
          <label htmlFor={ruleSelectId} className="appFormLabel">
            {translate("rubyMarkup.dialog.ruleLabel")}
          </label>
          <select
            id={ruleSelectId}
            className="appSelect"
            value={rule}
            onChange={(e) => setRule(e.target.value as RubyMarkupRule)}
          >
            <option value="aozora">
              {translate("settings.editor.ruby.rule.option.aozora.label")}
            </option>
            <option value="denden">
              {translate("settings.editor.ruby.rule.option.denden.label")}
            </option>
          </select>
        </div>

        <div className="appFormField">
          <div className="rubyInputHeader">
            <label htmlFor={rubyInputId} className="appFormLabel">
              {translate("rubyMarkup.dialog.rubyLabel")}
            </label>
            <span className="rubyGraphemeCounter">
              {currentGraphemeCount} / {RUBY_TEXT_MAX_GRAPHEMES}
            </span>
          </div>
          <input
            id={rubyInputId}
            type="text"
            className="appInput"
            value={rubyText}
            autoFocus
            onChange={(e) => setRubyText(e.target.value)}
          />
          {rubyText.length > 0 && !isValid && (
            <div className="appFormHelp appFormHelp-error">
              {translate("rubyMarkup.dialog.invalidNote")}
            </div>
          )}
        </div>

        {rule === "denden" && (
          <div className="appFormField rubyDendenNoteField">
            <div className="appFormHelp">
              {translate("rubyMarkup.dialog.dendenNote")}
            </div>
          </div>
        )}

        <div className="appFormField rubySourcePreviewField">
          <div className="appFormLabel">
            {translate("rubyMarkup.dialog.sourcePreviewLabel")}
          </div>
          <div className="rubySourcePreview">{sourcePreviewText}</div>
        </div>

        <div className="appFormField rubyAppliedPreviewField">
          <div className="appFormLabel">
            {translate("rubyMarkup.dialog.appliedPreviewLabel")}
          </div>
          <div className="rubyAppliedPreview">
            {renderAppliedPreview()}
          </div>
        </div>
      </form>
    </InfoDialog>
  );
}

export function RubyMarkupDialog(props: RubyMarkupDialogProps): JSX.Element | null {
  if (!props.isOpen) {
    return null;
  }
  return <RubyMarkupDialogContent {...props} />;
}
