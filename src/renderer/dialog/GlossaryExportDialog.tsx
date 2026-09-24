import { useEffect, useState } from "react";
import type {
  CheckFileExistsRequest,
  CheckFileExistsResult,
  SelectExportFolderRequest,
  SelectExportFolderResult
} from "../../shared/api";
import type { GlossaryEntryId } from "../../shared/glossary";
import type { Translate, TranslationKey } from "../../shared/i18n";
import {
  defaultGlossaryExportBaseFileName,
  defaultGlossaryExportContentOptions,
  planGlossaryExport,
  type GlossaryExportPlan
} from "../glossaryExport/glossaryExportModel";
import type { GlossaryExportRunResult } from "../glossaryExport/glossaryExportRunner";
import { InfoDialog } from "./InfoDialog";

/**
 * #574 Slice 6: the Glossary Export Dialog — one entry, HTML only.
 *
 * Target, format and content sections are fixed in this slice and shown as
 * plain text (no disabled future options); the user picks an output folder
 * and a file name. The export itself is the host's `onExport`.
 */

export interface GlossaryExportDialogRequest {
  readonly entryId: GlossaryEntryId;
  /** Representative surface, shown as the target and seeding the file name. */
  readonly entryLabel: string;
}

export interface GlossaryExportDialogProps {
  /** `null` = closed. A new object identity opens the dialog fresh. */
  readonly request: GlossaryExportDialogRequest | null;
  readonly translate: Translate;
  readonly opener?: Element | null;
  readonly onClose: () => void;
  readonly onSelectFolder: (
    request: SelectExportFolderRequest
  ) => Promise<SelectExportFolderResult>;
  readonly onCheckFileExists: (
    request: CheckFileExistsRequest
  ) => Promise<CheckFileExistsResult>;
  /** Resolves `true` for "overwrite", `false` for "cancel" (write nothing). */
  readonly onConfirmOverwrite: () => Promise<boolean>;
  readonly onExport: (plan: GlossaryExportPlan) => Promise<GlossaryExportRunResult>;
}

const CONTENT_ITEM_KEYS: readonly TranslationKey[] = [
  "glossaryExport.content.glossaryInfo",
  "glossaryExport.content.occurrenceCounts",
  "glossaryExport.content.description"
];

export function GlossaryExportDialog({
  request,
  translate,
  opener = null,
  onClose,
  onSelectFolder,
  onCheckFileExists,
  onConfirmOverwrite,
  onExport
}: GlossaryExportDialogProps): JSX.Element | null {
  const [outputFolder, setOutputFolder] = useState("");
  const [baseFileName, setBaseFileName] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!request) {
      return;
    }
    setOutputFolder("");
    setBaseFileName(defaultGlossaryExportBaseFileName(request.entryLabel));
    setIsExporting(false);
    setResultMessage(null);
    setErrorMessage(null);
  }, [request]);

  if (!request) {
    return null;
  }

  const activeRequest = request;
  const hasSucceeded = resultMessage !== null;
  const controlsDisabled = isExporting || hasSucceeded;
  const planResult = planGlossaryExport({
    target: { kind: "single", entryId: activeRequest.entryId },
    format: "html",
    content: defaultGlossaryExportContentOptions,
    outputFolder,
    baseFileName
  });
  const fileNameErrorKey =
    !planResult.ok &&
    planResult.error !== "missingOutputFolder" &&
    planResult.error !== "unsupportedTarget"
      ? (`glossaryExport.fileNameError.${planResult.error}` as TranslationKey)
      : null;
  const exportEnabled = planResult.ok && !controlsDisabled;

  async function handleBrowse(): Promise<void> {
    const result = await onSelectFolder({ defaultPath: outputFolder || null });

    if (result.ok) {
      setOutputFolder(result.folderPath);
    }
  }

  async function handleExport(): Promise<void> {
    if (!planResult.ok || controlsDisabled) {
      return;
    }

    const { plan } = planResult;

    setErrorMessage(null);
    setIsExporting(true);
    try {
      const existing = await onCheckFileExists({ filePath: plan.outputFilePath });

      if (existing.exists && !(await onConfirmOverwrite())) {
        return;
      }

      const result = await onExport(plan);

      if (result.ok) {
        setResultMessage(
          translate(
            result.warningCount > 0
              ? "glossaryExport.successWithWarnings"
              : "glossaryExport.success",
            { path: result.outputPath, count: result.warningCount }
          )
        );
      } else {
        setErrorMessage(
          translate(
            result.reason === "entryNotFound"
              ? "glossaryExport.entryNotFound"
              : "glossaryExport.failed"
          )
        );
      }
    } catch {
      setErrorMessage(translate("glossaryExport.failed"));
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <InfoDialog
      title={translate("glossaryExport.dialogTitle")}
      opener={opener}
      className="glossaryExportDialog"
      onClose={onClose}
      footer={
        <div className="appDialogActions">
          {!hasSucceeded ? (
            <button
              type="button"
              className="appDialogButton appDialogButton-cancel"
              disabled={isExporting}
              data-glossary-export-cancel-button="true"
              onClick={onClose}
            >
              {translate("common.cancel")}
            </button>
          ) : null}
          <button
            type="button"
            className="appDialogButton appDialogButton-confirm"
            disabled={!hasSucceeded && !exportEnabled}
            data-glossary-export-primary-button="true"
            onClick={() => {
              if (hasSucceeded) {
                onClose();
                return;
              }
              void handleExport();
            }}
          >
            {translate(
              hasSucceeded ? "glossaryExport.closeButton" : "glossaryExport.exportButton"
            )}
          </button>
        </div>
      }
    >
      <div className="glossaryExportDialogBody">
        <dl className="glossaryExportSummary">
          <dt>{translate("glossaryExport.targetLabel")}</dt>
          <dd data-glossary-export-target="true">{activeRequest.entryLabel}</dd>
          <dt>{translate("glossaryExport.formatLabel")}</dt>
          <dd data-glossary-export-format="html">
            {translate("glossaryExport.format.html")}
          </dd>
          <dt>{translate("glossaryExport.contentLabel")}</dt>
          <dd>
            <ul className="glossaryExportContentList">
              {CONTENT_ITEM_KEYS.map((key) => (
                <li key={key}>{translate(key)}</li>
              ))}
            </ul>
          </dd>
        </dl>
        <p className="glossaryExportNote">{translate("glossaryExport.savedStateNote")}</p>

        <label className="glossaryExportControl">
          <span className="glossaryExportControlLabel">
            {translate("glossaryExport.outputFolderLabel")}
          </span>
          <div className="glossaryExportInputWithButton">
            <input
              type="text"
              className="glossaryExportInput"
              value={outputFolder}
              readOnly
              data-glossary-export-folder-input="true"
            />
            <button
              type="button"
              className="appDialogButton"
              disabled={controlsDisabled}
              data-glossary-export-browse-button="true"
              onClick={() => void handleBrowse()}
            >
              {translate("glossaryExport.browseButton")}
            </button>
          </div>
          {outputFolder.length === 0 ? (
            <span className="glossaryExportFieldHint">
              {translate("glossaryExport.folderRequired")}
            </span>
          ) : null}
        </label>

        <label className="glossaryExportControl">
          <span className="glossaryExportControlLabel">
            {translate("glossaryExport.fileNameLabel")}
          </span>
          <div className="glossaryExportInputWithButton">
            <input
              type="text"
              className="glossaryExportInput"
              value={baseFileName}
              disabled={controlsDisabled}
              data-glossary-export-filename-input="true"
              onChange={(event) => setBaseFileName(event.target.value)}
            />
            <span className="glossaryExportExtension">.html</span>
          </div>
          {fileNameErrorKey ? (
            <span className="glossaryExportFieldError" role="alert">
              {translate(fileNameErrorKey)}
            </span>
          ) : null}
        </label>

        {isExporting ? (
          <div className="glossaryExportStatus" role="status">
            {translate("glossaryExport.exportingStatus")}
          </div>
        ) : null}
        {resultMessage ? (
          <div
            className="glossaryExportStatus"
            role="status"
            data-glossary-export-result="true"
          >
            {resultMessage}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="glossaryExportStatus glossaryExportError" role="alert">
            {errorMessage}
          </div>
        ) : null}
      </div>
    </InfoDialog>
  );
}
