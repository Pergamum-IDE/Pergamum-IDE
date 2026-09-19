import { useEffect, useMemo, useState } from "react";
import gripperIconUrl from "../../../assets/icons/codicons/dialog/gripper.svg?url";
import markdownFileIconUrl from "../../../assets/icons/svgrepo/explorer/markdown-svgrepo-com.svg?url";
import textFileIconUrl from "../../../assets/icons/svgrepo/explorer/document-svgrepo-com.svg?url";
import type { Translate } from "../../shared/i18n";
import type {
  ExportCandidateListItem,
  ExportDocumentKind,
  ExportOrigin
} from "../exportCandidates";
import { summarizeExportCandidates } from "../exportCandidates";
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

function kindIconUrl(kind: ExportDocumentKind): string {
  return kind === "markdown" ? markdownFileIconUrl : textFileIconUrl;
}

function formatInteger(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
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
  const [rows, setRows] = useState<readonly ExportCandidateListItem[]>(() =>
    candidates.map((candidate) => ({ ...candidate }))
  );
  const summary = useMemo(() => summarizeExportCandidates(rows), [rows]);

  useEffect(() => {
    setRows(candidates.map((candidate) => ({ ...candidate })));
  }, [candidates]);

  function setCandidateIncluded(documentKey: string, included: boolean): void {
    setRows((current) =>
      current.map((candidate) =>
        candidate.documentKey === documentKey
          ? { ...candidate, included }
          : candidate
      )
    );
  }

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
          <span
            className="exportConfirmationDialogSummaryValue"
            data-export-confirmation-summary="candidate-count"
          >
            {translate("export.confirmation.candidateCount", {
              count: summary.candidateCount
            })}
          </span>
        </div>
        <div className="exportConfirmationDialogSummaryRow">
          <span className="exportConfirmationDialogSummaryLabel">
            {translate("export.confirmation.includedLabel")}
          </span>
          <span
            className="exportConfirmationDialogSummaryValue"
            data-export-confirmation-summary="included-count"
          >
            {translate("export.confirmation.includedCount", {
              count: summary.includedCount
            })}
          </span>
        </div>
        <div className="exportConfirmationDialogSummaryRow">
          <span className="exportConfirmationDialogSummaryLabel">
            {translate("export.confirmation.totalCharactersLabel")}
          </span>
          <span
            className="exportConfirmationDialogSummaryValue"
            data-export-confirmation-summary="character-count"
          >
            {translate("export.confirmation.totalCharacterCount", {
              count: formatInteger(summary.includedCharacterCount)
            })}
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
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
                  <span className="srOnly">
                    {translate("export.confirmation.kindHeader")}
                  </span>
                </th>
                <th scope="col">
                  {translate("export.confirmation.parentPathHeader")}
                </th>
                <th scope="col">
                  {translate("export.confirmation.fileNameHeader")}
                </th>
                <th scope="col">
                  {translate("export.confirmation.previewStartHeader")}
                </th>
                <th scope="col">
                  {translate("export.confirmation.previewEndHeader")}
                </th>
                <th scope="col">
                  {translate("export.confirmation.characterCountHeader")}
                </th>
                <th scope="col">
                  {translate("export.confirmation.includeHeader")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((candidate) => (
                <tr
                  key={candidate.documentKey}
                  data-export-candidate-file-path={candidate.filePath}
                  data-export-candidate-included={
                    candidate.included ? "true" : "false"
                  }
                >
                  <td
                    className="exportConfirmationDialogHandle"
                    aria-hidden="true"
                  >
                    <img
                      className="exportConfirmationDialogHandleIcon"
                      src={gripperIconUrl}
                      alt=""
                    />
                  </td>
                  <td
                    className="exportConfirmationDialogKindIconCell"
                    title={kindLabel(candidate.kind, translate)}
                  >
                    <img
                      className="exportConfirmationDialogKindIcon"
                      src={kindIconUrl(candidate.kind)}
                      alt=""
                      aria-hidden="true"
                    />
                    <span className="srOnly">
                      {kindLabel(candidate.kind, translate)}
                    </span>
                  </td>
                  <td className="exportConfirmationDialogParentPath">
                    {candidate.parentPath ||
                      translate("export.confirmation.projectRootParent")}
                  </td>
                  <td className="exportConfirmationDialogFileName">
                    {candidate.fileName}
                  </td>
                  <td
                    className="exportConfirmationDialogPreview"
                    title={candidate.previewStart}
                  >
                    {candidate.previewStart}
                  </td>
                  <td
                    className="exportConfirmationDialogPreview"
                    title={candidate.previewEnd}
                  >
                    {candidate.previewEnd}
                  </td>
                  <td className="exportConfirmationDialogCharacterCount">
                    {formatInteger(candidate.characterCount)}
                  </td>
                  <td className="exportConfirmationDialogInclude">
                    <label className="exportConfirmationDialogIncludeSwitch">
                      <input
                        className="exportConfirmationDialogIncludeInput"
                        type="checkbox"
                        role="switch"
                        checked={candidate.included}
                        aria-label={translate(
                          "export.confirmation.includeToggleLabel",
                          { fileName: candidate.fileName }
                        )}
                        data-export-include-toggle-file-path={
                          candidate.filePath
                        }
                        onChange={(event) =>
                          setCandidateIncluded(
                            candidate.documentKey,
                            event.currentTarget.checked
                          )
                        }
                      />
                      <span
                        className="exportConfirmationDialogIncludeTrack"
                        aria-hidden="true"
                      >
                        <span className="exportConfirmationDialogIncludeThumb" />
                      </span>
                    </label>
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
