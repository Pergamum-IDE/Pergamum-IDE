import { useEffect, useRef, useState } from "react";
import type {
  CheckFileExistsRequest,
  CheckFileExistsResult,
  ExportPngFailureReason,
  ExportPngRequest,
  ExportPngResult,
  SelectExportFolderRequest,
  SelectExportFolderResult
} from "../../shared/api";
import type { Translate, TranslationKey } from "../../shared/i18n";
import type { DocumentMapSettings } from "../../shared/documentMapSettings";
import type { GlossaryEntry } from "../../shared/glossary";
import {
  buildGlossaryDocumentMapPlan,
  type DocumentMapPage
} from "../glossaryDocumentMap";
import { renderDocumentMapPageToPngBytes } from "../documentMapPngRenderer";
import {
  applyDocumentMapPngExportHeaderToggle,
  buildDocumentMapPngExportRows,
  isDocumentMapPngExportButtonEnabled,
  planDocumentMapPngExportTargets,
  resolveDocumentMapPngExportHeaderToggleState,
  toggleDocumentMapPngExportRow,
  validateDocumentMapPngBaseFileName,
  type DocumentMapPngExportRow
} from "../documentMapPngExportPlan";
import { InfoDialog } from "./InfoDialog";

/**
 * #537: everything the export dialog needs, captured ONCE at the moment the
 * save/export icon is clicked. Deliberately NOT re-derived from live
 * App-level state while the dialog is open — the export must reflect the
 * Document Map exactly as it looked when the dialog was opened, even if the
 * active document, tag filter, or settings change underneath it afterward.
 */
export interface DocumentMapPngExportSnapshot {
  readonly text: string;
  readonly entries: readonly GlossaryEntry[];
  readonly selectedTagIds: readonly string[];
  readonly wrapColumns: number;
  readonly contentWidth: number;
  readonly documentMapSettings?: DocumentMapSettings;
  readonly normalizeUnicodeToNfc: boolean;
  readonly pages: readonly DocumentMapPage[];
  readonly pixelRatio: number;
  /** Already sanitized/valid — see `deriveDefaultDocumentMapPngBaseFileName`. */
  readonly defaultBaseFileName: string;
}

export interface DocumentMapPngExportDialogProps {
  /** `null` = closed. A new object identity opens the dialog fresh. */
  readonly snapshot: DocumentMapPngExportSnapshot | null;
  readonly translate: Translate;
  readonly opener?: Element | null;
  readonly onClose: () => void;
  readonly onSelectFolder: (
    request: SelectExportFolderRequest
  ) => Promise<SelectExportFolderResult>;
  readonly onCheckFileExists: (
    request: CheckFileExistsRequest
  ) => Promise<CheckFileExistsResult>;
  readonly onExportPng: (request: ExportPngRequest) => Promise<ExportPngResult>;
  /** Resolves `true` for "overwrite", `false` for "cancel" (write nothing). */
  readonly onConfirmOverwrite: (existingFileCount: number) => Promise<boolean>;
}

function baseFileNameErrorKey(
  error: ReturnType<typeof validateDocumentMapPngBaseFileName>
): TranslationKey | null {
  if (error.ok) {
    return null;
  }
  return `documentMap.export.baseFileNameError.${error.error}` as TranslationKey;
}

export function DocumentMapPngExportDialog({
  snapshot,
  translate,
  opener = null,
  onClose,
  onSelectFolder,
  onCheckFileExists,
  onExportPng,
  onConfirmOverwrite
}: DocumentMapPngExportDialogProps): JSX.Element | null {
  const [outputFolder, setOutputFolder] = useState("");
  const [baseFileName, setBaseFileName] = useState("");
  const [rows, setRows] = useState<readonly DocumentMapPngExportRow[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [hasSucceeded, setHasSucceeded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null);

  // Fresh state every time a NEW snapshot opens the dialog (a new object
  // identity from the caller). Closing (snapshot -> null) needs no reset of
  // its own — the next open re-initializes everything below.
  useEffect(() => {
    if (!snapshot) {
      return;
    }
    setOutputFolder("");
    setBaseFileName(snapshot.defaultBaseFileName);
    setRows(
      buildDocumentMapPngExportRows(
        snapshot.pages.length,
        snapshot.defaultBaseFileName
      )
    );
    setIsExporting(false);
    setHasSucceeded(false);
    setErrorMessage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  const headerToggleState = resolveDocumentMapPngExportHeaderToggleState(rows);

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = headerToggleState === "mixed";
    }
  }, [headerToggleState]);

  if (!snapshot) {
    return null;
  }
  // Narrowed once, used by the nested handlers below — TypeScript's
  // control-flow narrowing of `snapshot` does not persist into closures
  // declared later in this function body.
  const activeSnapshot = snapshot;

  const controlsDisabled = isExporting || hasSucceeded;
  const baseFileNameValidation = validateDocumentMapPngBaseFileName(baseFileName);
  const baseFileNameErrorTranslationKey = baseFileNameErrorKey(
    baseFileNameValidation
  );
  const exportEnabled = isDocumentMapPngExportButtonEnabled({
    outputFolder,
    baseFileName,
    rows,
    isExporting,
    hasSucceeded
  });

  function handleBaseFileNameChange(nextValue: string): void {
    setBaseFileName(nextValue);
    setRows((current) =>
      buildDocumentMapPngExportRows(
        activeSnapshot.pages.length,
        nextValue,
        current
      )
    );
  }

  async function handleBrowse(): Promise<void> {
    const result = await onSelectFolder({ defaultPath: outputFolder || null });
    if (result.ok) {
      setOutputFolder(result.folderPath);
    }
  }

  function handleHeaderToggle(): void {
    setRows((current) => applyDocumentMapPngExportHeaderToggle(current));
  }

  function handleRowToggle(pageIndex: number): void {
    setRows((current) => toggleDocumentMapPngExportRow(current, pageIndex));
  }

  function writeFailureMessage(
    fileName: string,
    reason: ExportPngFailureReason
  ): string {
    const reasonKey = `documentMap.export.failureReason.${reason}` as TranslationKey;
    return translate("documentMap.export.writeFailed", {
      fileName,
      reason: translate(reasonKey)
    });
  }

  async function handleExport(): Promise<void> {
    if (!exportEnabled) {
      return;
    }

    setErrorMessage(null);
    setIsExporting(true);
    try {
      const targets = planDocumentMapPngExportTargets(rows, outputFolder);
      if (targets.length === 0) {
        return;
      }

      // Dry-run exists check — output-ENABLED rows only (#537).
      const existsResults = await Promise.all(
        targets.map((target) => onCheckFileExists({ filePath: target.filePath }))
      );
      const existingCount = existsResults.filter((result) => result.exists).length;

      if (existingCount > 0) {
        const confirmed = await onConfirmOverwrite(existingCount);
        if (!confirmed) {
          // All-or-cancel: write nothing, return to the still-open dialog.
          return;
        }
      }

      const plan = buildGlossaryDocumentMapPlan({
        text: activeSnapshot.text,
        entries: activeSnapshot.entries,
        wrapColumns: activeSnapshot.wrapColumns,
        narrationColor: activeSnapshot.documentMapSettings?.narrationColor,
        glossaryFallbackColor:
          activeSnapshot.documentMapSettings?.glossaryFallbackColor,
        dialogueDelimiterPairs:
          activeSnapshot.documentMapSettings?.dialogueDelimiterPairs,
        adjustTagColorsForVisibility:
          activeSnapshot.documentMapSettings?.adjustTagColorsForVisibility,
        selectedTagIds: activeSnapshot.selectedTagIds,
        normalizeUnicodeToNfc: activeSnapshot.normalizeUnicodeToNfc
      });

      // Sequential — each file is its own atomic write; no cross-file
      // transaction. A failure stops here, identifying which file failed.
      for (const target of targets) {
        const page = activeSnapshot.pages.find(
          (p) => p.index === target.pageIndex
        );
        if (!page) {
          continue;
        }

        let pngBytes: Uint8Array;
        try {
          pngBytes = await renderDocumentMapPageToPngBytes({
            plan,
            page,
            contentWidth: activeSnapshot.contentWidth,
            pixelRatio: activeSnapshot.pixelRatio
          });
        } catch {
          // Both failure modes inside renderDocumentMapPageToPngBytes (no 2D
          // context, canvas.toBlob() returning null) surface here as the
          // same retryable "could not generate this page" message — the
          // dialog stays open so the user can fix the cause and press
          // Export again.
          setErrorMessage(
            translate("documentMap.export.renderFailed", {
              fileName: target.fileName
            })
          );
          return;
        }

        const writeResult = await onExportPng({
          filePath: target.filePath,
          pngBytes
        });

        if (!writeResult.ok) {
          setErrorMessage(
            writeFailureMessage(target.fileName, writeResult.reason)
          );
          return;
        }
      }

      setHasSucceeded(true);
    } finally {
      setIsExporting(false);
    }
  }

  function handlePrimaryButtonClick(): void {
    if (hasSucceeded) {
      onClose();
      return;
    }
    void handleExport();
  }

  return (
    <InfoDialog
      title={translate("documentMap.export.dialogTitle")}
      opener={opener}
      className="documentMapPngExportDialog"
      onClose={onClose}
      footer={
        <div className="appDialogActions">
          {!hasSucceeded ? (
            <button
              type="button"
              className="appDialogButton appDialogButton-cancel documentMapPngExportCancelButton"
              disabled={isExporting}
              data-document-map-export-cancel-button="true"
              onClick={onClose}
            >
              {translate("common.cancel")}
            </button>
          ) : null}
          <button
            type="button"
            className="appDialogButton appDialogButton-confirm documentMapPngExportPrimaryButton"
            disabled={!hasSucceeded && !exportEnabled}
            data-document-map-export-primary-button="true"
            onClick={handlePrimaryButtonClick}
          >
            {translate(
              hasSucceeded
                ? "documentMap.export.closeButton"
                : "documentMap.export.exportButton"
            )}
          </button>
        </div>
      }
    >
      <div className="documentMapPngExportDialogBody">
        <label className="documentMapPngExportControl">
          <span className="documentMapPngExportControlLabel">
            {translate("documentMap.export.outputFolderLabel")}
          </span>
          <div className="documentMapPngExportInputWithButton">
            <input
              type="text"
              className="documentMapPngExportInput"
              value={outputFolder}
              readOnly
              data-document-map-export-folder-input="true"
            />
            <button
              type="button"
              className="appDialogButton documentMapPngExportBrowseButton"
              disabled={controlsDisabled}
              data-document-map-export-browse-button="true"
              onClick={() => void handleBrowse()}
            >
              {translate("documentMap.export.browseButton")}
            </button>
          </div>
        </label>

        <label className="documentMapPngExportControl">
          <span className="documentMapPngExportControlLabel">
            {translate("documentMap.export.baseFileNameLabel")}
          </span>
          <input
            type="text"
            className="documentMapPngExportInput"
            value={baseFileName}
            disabled={controlsDisabled}
            data-document-map-export-basename-input="true"
            onChange={(event) => handleBaseFileNameChange(event.target.value)}
          />
          {baseFileNameErrorTranslationKey ? (
            <span className="documentMapPngExportFieldError" role="alert">
              {translate(baseFileNameErrorTranslationKey)}
            </span>
          ) : null}
        </label>

        <div className="documentMapPngExportPlannedOutput">
          <span className="documentMapPngExportControlLabel">
            {translate("documentMap.export.plannedOutputHeading")}
          </span>
          <table className="documentMapPngExportTable">
            <thead>
              <tr>
                <th>
                  <label className="documentMapPngExportSwitch">
                    <input
                      ref={headerCheckboxRef}
                      type="checkbox"
                      className="documentMapPngExportSwitchInput"
                      aria-label={translate("documentMap.export.headerToggleLabel")}
                      checked={headerToggleState === "allEnabled"}
                      disabled={controlsDisabled}
                      data-document-map-export-header-toggle="true"
                      data-document-map-export-header-state={headerToggleState}
                      onChange={handleHeaderToggle}
                    />
                    <span className="documentMapPngExportSwitchTrack">
                      <span className="documentMapPngExportSwitchThumb" />
                    </span>
                  </label>
                </th>
                <th>{translate("documentMap.export.columnPage")}</th>
                <th>{translate("documentMap.export.columnFileName")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.pageIndex}>
                  <td>
                    <label className="documentMapPngExportSwitch">
                      <input
                        type="checkbox"
                        className="documentMapPngExportSwitchInput"
                        aria-label={translate("documentMap.export.rowToggleLabel", {
                          page: row.pageNumber
                        })}
                        checked={row.outputEnabled}
                        disabled={controlsDisabled}
                        data-document-map-export-row-toggle={row.pageIndex}
                        onChange={() => handleRowToggle(row.pageIndex)}
                      />
                      <span className="documentMapPngExportSwitchTrack">
                        <span className="documentMapPngExportSwitchThumb" />
                      </span>
                    </label>
                  </td>
                  <td>{row.pageNumber}</td>
                  <td>{row.fileName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isExporting ? (
          <div className="documentMapPngExportStatus" role="status">
            {translate("documentMap.export.exportingStatus")}
          </div>
        ) : null}
        {hasSucceeded ? (
          <div className="documentMapPngExportStatus" role="status">
            {translate("documentMap.export.successStatus")}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="documentMapPngExportStatus documentMapPngExportError" role="alert">
            {errorMessage}
          </div>
        ) : null}
      </div>
    </InfoDialog>
  );
}
