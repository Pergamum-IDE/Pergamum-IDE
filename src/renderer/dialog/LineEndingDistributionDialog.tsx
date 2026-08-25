import type { Translate, TranslationKey } from "../../shared/i18n";
import type { LineEndingDistribution } from "../lineEndingDistribution";
import type { LineEndingKind } from "../lineEndingTracking";
import { InfoDialog } from "./InfoDialog";

export interface LineEndingDistributionDialogProps {
  distribution: LineEndingDistribution;
  translate: Translate;
  opener: Element | null;
  onClose: () => void;
}

const lineEndingRowKinds: readonly LineEndingKind[] = ["lf", "crlf", "cr"];

function lineEndingLabelKey(kind: LineEndingKind): TranslationKey {
  switch (kind) {
    case "lf":
      return "dialog.lineEndingDistribution.lf.label";
    case "crlf":
      return "dialog.lineEndingDistribution.crlf.label";
    case "cr":
      return "dialog.lineEndingDistribution.cr.label";
  }
}

/**
 * #252: read-only informational dialog — Close is its only action, and it
 * never mutates the document or its line-ending tracking state. Built on
 * the shared InfoDialog primitive (see AboutDialog.tsx for the established
 * pattern this mirrors), not ConfirmDialog/ChoiceDialog.
 */
export function LineEndingDistributionDialog({
  distribution,
  translate,
  opener,
  onClose
}: LineEndingDistributionDialogProps): JSX.Element {
  return (
    <InfoDialog
      title={translate("dialog.lineEndingDistribution.title")}
      opener={opener}
      onClose={onClose}
      footer={
        <div className="appDialogActions">
          <button
            type="button"
            className="appDialogButton appDialogButton-confirm"
            autoFocus
            onClick={onClose}
          >
            {translate("common.close")}
          </button>
        </div>
      }
    >
      <div className="lineEndingDistributionDialogContent">
        {distribution.total === 0 ? (
          <p>{translate("dialog.lineEndingDistribution.emptyDocument")}</p>
        ) : (
          <dl className="lineEndingDistributionRows">
            {lineEndingRowKinds.map((kind) => (
              <div className="lineEndingDistributionRow" key={kind}>
                <dt>{translate(lineEndingLabelKey(kind))}</dt>
                <dd>
                  <div
                    className="lineEndingDistributionBarTrack"
                    role="presentation"
                  >
                    <div
                      className="lineEndingDistributionBarFill"
                      style={{ width: `${distribution.percentages[kind]}%` }}
                    />
                  </div>
                  <span className="lineEndingDistributionRowValue">
                    {distribution.counts[kind]} (
                    {distribution.percentages[kind].toFixed(1)}%)
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        )}

        <dl className="lineEndingDistributionSummary">
          <div className="lineEndingDistributionSummaryRow">
            <dt>{translate("dialog.lineEndingDistribution.total.label")}</dt>
            <dd>{distribution.total}</dd>
          </div>
          <div className="lineEndingDistributionSummaryRow">
            <dt>
              {translate("dialog.lineEndingDistribution.expected.label")}
            </dt>
            <dd>{translate(lineEndingLabelKey(distribution.expectedKind))}</dd>
          </div>
          <div className="lineEndingDistributionSummaryRow">
            <dt>
              {translate("dialog.lineEndingDistribution.unexpected.label")}
            </dt>
            <dd>{distribution.unexpectedCount}</dd>
          </div>
        </dl>
      </div>
    </InfoDialog>
  );
}
