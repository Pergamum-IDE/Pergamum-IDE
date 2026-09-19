import type { Translate } from "../../shared/i18n";
import type {
  ExportCandidateListItem,
  ExportDocumentKind,
  ExportOrigin
} from "../exportCandidates";
import { InfoDialog } from "./InfoDialog";

export interface ExportConfirmationDialogProps {
  readonly origin: ExportOrigin;
  readonly projectName: string | null;
  readonly candidates: readonly ExportCandidateListItem[];
  readonly translate: Translate;
  readonly opener: Element | null;
  readonly onClose: () => void;
}

function originLabel(
  origin: ExportOrigin,
  projectName: string | null,
  translate: Translate
): string {
  switch (origin.kind) {
    case "projectRoot":
      return projectName
        ? `${translate("export.confirmation.origin.projectRoot")} (${projectName})`
        : translate("export.confirmation.origin.projectRoot");
    case "folder":
      return origin.folderPath;
    case "file":
      return origin.filePath;
  }
}

function kindLabel(kind: ExportDocumentKind, translate: Translate): string {
  return translate(
    kind === "markdown"
      ? "export.confirmation.kind.markdown"
      : "export.confirmation.kind.text"
  );
}

export function ExportConfirmationDialog({
  origin,
  projectName,
  candidates,
  translate,
  opener,
  onClose
}: ExportConfirmationDialogProps): JSX.Element {
  const title = translate("export.confirmation.title");

  return (
    <InfoDialog
      title={title}
      className="exportConfirmationDialog"
      opener={opener}
      onClose={onClose}
      footer={
        <div className="appDialogActions">
          <button type="button" className="appDialogButton" onClick={onClose}>
            {translate("common.cancel")}
          </button>
          <button
            type="button"
            className="appDialogButton appDialogButton-confirm"
            disabled={true}
            aria-disabled="true"
          >
            {translate("export.confirmation.primary")}
          </button>
        </div>
      }
    >
      <div className="exportConfirmationDialogSummary">
        <div className="exportConfirmationDialogSummaryRow">
          <span className="exportConfirmationDialogSummaryLabel">
            {translate("export.confirmation.targetLabel")}
          </span>
          <span className="exportConfirmationDialogSummaryValue">
            {originLabel(origin, projectName, translate)}
          </span>
        </div>
        <div className="exportConfirmationDialogSummaryRow">
          <span className="exportConfirmationDialogSummaryLabel">
            {translate("export.confirmation.candidatesLabel")}
          </span>
          <span className="exportConfirmationDialogSummaryValue">
            {translate("export.confirmation.candidateCount", {
              count: candidates.length
            })}
          </span>
        </div>
      </div>

      {candidates.length === 0 ? (
        <p className="exportConfirmationDialogEmpty">
          {translate("export.confirmation.empty")}
        </p>
      ) : (
        <div className="exportConfirmationDialogTableWrap">
          <table className="exportConfirmationDialogTable">
            <thead>
              <tr>
                <th scope="col">
                  <span className="srOnly">
                    {translate("export.confirmation.handleHeader")}
                  </span>
                </th>
                <th scope="col">
                  {translate("export.confirmation.parentPathHeader")}
                </th>
                <th scope="col">
                  {translate("export.confirmation.fileNameHeader")}
                </th>
                <th scope="col">
                  {translate("export.confirmation.kindHeader")}
                </th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => (
                <tr
                  key={candidate.documentKey}
                  data-export-candidate-file-path={candidate.filePath}
                >
                  <td className="exportConfirmationDialogHandle" aria-hidden="true">
                    ☰
                  </td>
                  <td className="exportConfirmationDialogParentPath">
                    {candidate.parentPath ||
                      translate("export.confirmation.projectRootParent")}
                  </td>
                  <td className="exportConfirmationDialogFileName">
                    {candidate.fileName}
                  </td>
                  <td className="exportConfirmationDialogKind">
                    {kindLabel(candidate.kind, translate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </InfoDialog>
  );
}
