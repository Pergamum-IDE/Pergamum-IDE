import { useEffect, useMemo, useState } from "react";
import gripperIconUrl from "../../../assets/icons/codicons/dialog/gripper.svg?url";
import folderIconUrl from "../../../assets/icons/codicons/explorer/folder.svg?url";
import chevronDownIconUrl from "../../../assets/icons/feather/glossary/chevrons-down.svg?url";
import chevronRightIconUrl from "../../../assets/icons/feather/glossary/chevrons-right.svg?url";
import markdownFileIconUrl from "../../../assets/icons/svgrepo/explorer/markdown-svgrepo-com.svg?url";
import textFileIconUrl from "../../../assets/icons/svgrepo/explorer/document-svgrepo-com.svg?url";
import type { Translate } from "../../shared/i18n";
import type {
  ExportCandidateListItem,
  ExportCandidateFolderGroup,
  ExportDocumentKind,
  ExportOrigin
} from "../exportCandidates";
import {
  groupExportCandidatesByParentPath,
  mergeExportCandidateIncludedStates,
  summarizeExportCandidates,
  toggleFolderIncluded
} from "../exportCandidates";
import { InfoDialog } from "./InfoDialog";

export interface ExportConfirmationDialogProps {
  readonly origin: ExportOrigin;
  readonly projectName: string | null;
  readonly candidates: readonly ExportCandidateListItem[];
  readonly translate: Translate;
  readonly opener: Element | null;
  readonly onReloadCandidates: () => Promise<
    readonly ExportCandidateListItem[] | null
  >;
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

function formatCharacterCount(value: number, translate: Translate): string {
  return translate("export.confirmation.totalCharacterCount", {
    count: formatInteger(value)
  });
}

function folderIncludedText(
  group: ExportCandidateFolderGroup,
  translate: Translate
): string {
  const values = {
    included: group.includedFileCount,
    total: group.totalFileCount
  };

  return translate(
    group.includeState === "mixed"
      ? "export.confirmation.folderIncludedMixed"
      : "export.confirmation.folderIncluded",
    values
  );
}

export function ExportConfirmationDialog({
  origin,
  projectName,
  candidates,
  translate,
  opener,
  onReloadCandidates,
  onClose
}: ExportConfirmationDialogProps): JSX.Element {
  const title = translate("export.confirmation.title");
  const [rows, setRows] = useState<readonly ExportCandidateListItem[]>(() =>
    candidates.map((candidate) => ({ ...candidate }))
  );
  const [collapsedParentPaths, setCollapsedParentPaths] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [isReloading, setIsReloading] = useState(false);
  const summary = useMemo(() => summarizeExportCandidates(rows), [rows]);
  const groups = useMemo(
    () =>
      groupExportCandidatesByParentPath(
        rows,
        translate("export.confirmation.projectRootParent")
      ),
    [rows, translate]
  );

  useEffect(() => {
    setRows(candidates.map((candidate) => ({ ...candidate })));
    setCollapsedParentPaths(new Set());
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

  function toggleGroupCollapsed(parentPath: string): void {
    setCollapsedParentPaths((current) => {
      const next = new Set(current);
      if (next.has(parentPath)) {
        next.delete(parentPath);
      } else {
        next.add(parentPath);
      }
      return next;
    });
  }

  function handleFolderIncludedToggle(parentPath: string): void {
    setRows((current) => toggleFolderIncluded(current, parentPath));
  }

  async function handleReload(): Promise<void> {
    if (isReloading) {
      return;
    }

    setIsReloading(true);
    try {
      const reloadedCandidates = await onReloadCandidates();
      if (reloadedCandidates === null) {
        return;
      }

      setRows((current) =>
        mergeExportCandidateIncludedStates(reloadedCandidates, current)
      );
      const nextParentPaths = new Set(
        reloadedCandidates.map((candidate) => candidate.parentPath)
      );
      setCollapsedParentPaths((current) => {
        const next = new Set<string>();
        for (const parentPath of current) {
          if (nextParentPaths.has(parentPath)) {
            next.add(parentPath);
          }
        }
        return next;
      });
    } finally {
      setIsReloading(false);
    }
  }

  return (
    <InfoDialog
      title={title}
      className="exportConfirmationDialog"
      opener={opener}
      onClose={onClose}
      footer={
        <div className="exportConfirmationDialogFooter">
          <button
            type="button"
            className="appDialogButton"
            disabled={isReloading}
            aria-disabled={isReloading}
            onClick={() => {
              void handleReload();
            }}
          >
            {translate("export.confirmation.reload")}
          </button>
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
            {formatCharacterCount(summary.includedCharacterCount, translate)}
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
              {groups.flatMap((group) => {
                const isCollapsed = collapsedParentPaths.has(group.parentPath);
                const folderRows = [
                  <tr
                    key={`folder:${group.parentPath}`}
                    className="exportConfirmationDialogFolderRow"
                    data-export-folder-parent-path={group.parentPath}
                    data-export-folder-include-state={group.includeState}
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
                      className="exportConfirmationDialogFolderMain"
                      colSpan={5}
                    >
                      <button
                        type="button"
                        className="exportConfirmationDialogFolderToggle"
                        aria-expanded={!isCollapsed}
                        aria-label={translate(
                          isCollapsed
                            ? "export.confirmation.expandFolder"
                            : "export.confirmation.collapseFolder",
                          { folder: group.label }
                        )}
                        data-export-folder-collapse-parent-path={
                          group.parentPath
                        }
                        onClick={() => toggleGroupCollapsed(group.parentPath)}
                      >
                        <img
                          className="exportConfirmationDialogFolderChevron"
                          src={
                            isCollapsed
                              ? chevronRightIconUrl
                              : chevronDownIconUrl
                          }
                          alt=""
                          aria-hidden="true"
                        />
                      </button>
                      <img
                        className="exportConfirmationDialogFolderIcon"
                        src={folderIconUrl}
                        alt=""
                        aria-hidden="true"
                      />
                      <span className="exportConfirmationDialogFolderLabel">
                        {group.label}
                      </span>
                      <span className="exportConfirmationDialogFolderSummary">
                        {folderIncludedText(group, translate)}
                      </span>
                    </td>
                    <td className="exportConfirmationDialogCharacterCount">
                      {formatCharacterCount(
                        group.includedCharacterCount,
                        translate
                      )}
                    </td>
                    <td className="exportConfirmationDialogInclude exportConfirmationDialogIncludeCell">
                      <label className="exportConfirmationDialogIncludeSwitch">
                        <input
                          className="exportConfirmationDialogIncludeInput"
                          type="checkbox"
                          role="switch"
                          checked={group.includeState !== "off"}
                          aria-label={translate(
                            "export.confirmation.folderIncludeToggleLabel",
                            { folder: group.label }
                          )}
                          data-export-folder-toggle-parent-path={
                            group.parentPath
                          }
                          data-export-folder-include-state={group.includeState}
                          onChange={() =>
                            handleFolderIncludedToggle(group.parentPath)
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
                ];

                if (isCollapsed) {
                  return folderRows;
                }

                return folderRows.concat(
                  group.items.map((candidate) => (
                    <tr
                      key={candidate.documentKey}
                      className="exportConfirmationDialogRow"
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
                        className="exportConfirmationDialogPreview exportConfirmationDialogPreviewStart"
                        title={candidate.previewStartHover}
                      >
                        {candidate.previewStart}
                      </td>
                      <td
                        className="exportConfirmationDialogPreview exportConfirmationDialogPreviewEnd"
                        title={candidate.previewEndHover}
                      >
                        {candidate.previewEnd}
                      </td>
                      <td className="exportConfirmationDialogCharacterCount">
                        {formatCharacterCount(
                          candidate.characterCount,
                          translate
                        )}
                      </td>
                      <td className="exportConfirmationDialogInclude exportConfirmationDialogIncludeCell">
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
                  ))
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </InfoDialog>
  );
}
