import {
  Component,
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode
} from "react";
import gripperIconRaw from "../../../assets/icons/codicons/dialog/gripper.svg?raw";
import type {
  CheckFileExistsRequest,
  CheckFileExistsResult,
  SelectExportFolderRequest,
  SelectExportFolderResult
} from "../../shared/api";
import {
  representativeGlossaryAtom,
  type GlossaryAtom,
  type GlossaryEntry,
  type GlossaryTag
} from "../../shared/glossary";
import { buildFontFamilyCss, type FontFamilySetting } from "../../shared/fontSettings";
import {
  formatLocalizedNumber,
  type Language,
  type Translate,
  type TranslationKey
} from "../../shared/i18n";
import {
  DEFAULT_PDF_PAGE_NUMBER_SETTINGS,
  formatPdfPageNumberSummaryText,
  type PdfPageNumberSettings
} from "../../shared/pdfPageNumbering";
import { DEFAULT_IMAGE_ASSET_FOLDER_NAME } from "../exportTypes";
import { joinExportPath } from "../exportPathHelper";
import { validateDocumentMapPngBaseFileName } from "../documentMapPngExportPlan";
import { GlossaryTagChip } from "../GlossaryTagChip";
import {
  buildCombinedGlossaryExportHtml,
  type GlossaryExportDocumentLabels
} from "../glossaryExport/glossaryExportHtml";
import { defaultGlossaryExportContentOptions } from "../glossaryExport/glossaryExportModel";
import type { GlossaryEntryOccurrenceCounts } from "../glossaryExport/glossaryExportOccurrences";
import {
  runCombinedGlossaryExport,
  type CombinedGlossaryExportPlan,
  type CombinedGlossaryExportRunResult
} from "../glossaryExport/glossaryExportRunner";
import { FontPickerDialog } from "./FontPickerDialog";
import { InfoDialog } from "./InfoDialog";
import { PdfPageNumberSettingsDialog } from "./PdfPageNumberSettingsDialog";

export type OccurrenceCountState =
  | { status: "loading" }
  | { status: "ready"; count: number; occurrences?: GlossaryEntryOccurrenceCounts }
  | { status: "failed" };

export type OccurrenceCountValue =
  | OccurrenceCountState
  | number
  | "loading"
  | "failed";

export interface GlossaryExportWizardRowState {
  readonly entryId: string;
  readonly representativeSurface: string;
  readonly tags: readonly GlossaryTag[];
  readonly entry: GlossaryEntry;
  readonly enabled: boolean;
}

export interface GlossaryExportWizardDialogProps {
  readonly isOpen: boolean;
  readonly entries: readonly GlossaryEntry[];
  readonly occurrenceCountsByEntryId?: ReadonlyMap<string, OccurrenceCountValue>;
  readonly translate: Translate;
  readonly uiLanguage?: Language;
  readonly opener?: Element | null;
  readonly onClose: () => void;
  readonly onSelectFolder?: (
    request: SelectExportFolderRequest
  ) => Promise<SelectExportFolderResult>;
  readonly onCheckFileExists?: (
    request: CheckFileExistsRequest
  ) => Promise<CheckFileExistsResult>;
  readonly onConfirmOverwrite?: () => Promise<boolean>;
  readonly onExportCombined?: (
    plan: CombinedGlossaryExportPlan
  ) => Promise<CombinedGlossaryExportRunResult>;
}

const WIZARD_DRAG_MIME = "application/x-pergamum-glossary-wizard-reorder";

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly error?: unknown;
}

export class GlossaryExportWizardErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: unknown, errorInfo: unknown): void {
    console.error("GlossaryExportWizard rendering error:", error, errorInfo);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className="glossaryExportWizardErrorFallback"
          style={{ padding: 20, color: "#cf222e", fontWeight: "bold" }}
        >
          語彙エクスポート表示中にエラーが発生しました。
        </div>
      );
    }
    return this.props.children;
  }
}

function safeRepresentativeSurface(entry: GlossaryEntry): string {
  if (!entry) return "";
  try {
    return representativeGlossaryAtom(entry)?.value ?? entry.id ?? "";
  } catch {
    return entry.id ?? "";
  }
}

function safeTags(entry: GlossaryEntry): readonly GlossaryTag[] {
  if (!entry || !Array.isArray(entry.tags)) {
    return [];
  }
  return entry.tags.filter((tag) => tag && typeof tag.id === "string");
}

function reorderArrayItem<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  if (fromIndex < 0 || fromIndex >= next.length) {
    return next;
  }
  const target = Math.max(0, Math.min(Math.trunc(toIndex), next.length - 1));
  if (target === fromIndex) {
    return next;
  }
  const [moved] = next.splice(fromIndex, 1);
  next.splice(target, 0, moved);
  return next;
}

export function GlossaryExportWizardDialog({
  isOpen,
  entries: initialEntries,
  occurrenceCountsByEntryId,
  translate,
  uiLanguage = "ja",
  opener,
  onClose,
  onSelectFolder,
  onCheckFileExists,
  onConfirmOverwrite,
  onExportCombined
}: GlossaryExportWizardDialogProps): JSX.Element | null {
  const [step, setStep] = useState<1 | 2>(1);
  const [format, setFormat] = useState<"html" | "pdf">("html");
  const [imageAssetFolderName, setImageAssetFolderName] = useState(
    DEFAULT_IMAGE_ASSET_FOLDER_NAME
  );
  const [pdfFontCandidates, setPdfFontCandidates] = useState<readonly FontFamilySetting[]>([]);
  const [pdfPageSettings, setPdfPageSettings] = useState<PdfPageNumberSettings>(
    DEFAULT_PDF_PAGE_NUMBER_SETTINGS
  );
  const [rows, setRows] = useState<readonly GlossaryExportWizardRowState[]>([]);

  // Step 2 TOC & file export state
  const [includeToc, setIncludeToc] = useState(false);
  const [tocPosition, setTocPosition] = useState<"front" | "back">("front");
  const [outputFolder, setOutputFolder] = useState("");
  const [baseFileName, setBaseFileName] = useState("glossary-export");
  const [isExporting, setIsExporting] = useState(false);
  const [exportResultStatus, setExportResultStatus] = useState<
    { kind: "success"; path: string } | { kind: "error"; message: string } | null
  >(null);

  // Modals for PDF font picker and page settings
  const [isOpenFontPicker, setIsOpenFontPicker] = useState(false);
  const [isOpenPdfPageSettings, setIsOpenPdfPageSettings] = useState(false);

  // Drag-and-drop state for table rows
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropGap, setDropGap] = useState<number | null>(null);

  const dialogId = useId();
  const prevIsOpenRef = useRef(false);

  // Reset state on open
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setStep(1);
      setFormat("html");
      setImageAssetFolderName(DEFAULT_IMAGE_ASSET_FOLDER_NAME);
      setPdfFontCandidates([]);
      setPdfPageSettings(DEFAULT_PDF_PAGE_NUMBER_SETTINGS);
      setRows(
        (initialEntries ?? []).map((entry) => ({
          entryId: entry.id,
          representativeSurface: safeRepresentativeSurface(entry),
          tags: safeTags(entry),
          entry,
          enabled: true
        }))
      );
      setDraggingIndex(null);
      setDropGap(null);

      setIncludeToc(false);
      setTocPosition("front");
      setOutputFolder("");
      setBaseFileName("glossary-export");
      setIsExporting(false);
      setExportResultStatus(null);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, initialEntries]);

  if (!isOpen) {
    return null;
  }

  const selectedRows = rows.filter((row) => row.enabled);
  const selectedCount = selectedRows.length;
  const totalCount = rows.length;

  const hasSelectedLoading = selectedRows.some((row) => {
    if (!occurrenceCountsByEntryId) return true;
    const val = occurrenceCountsByEntryId.get(row.entryId);
    if (val === undefined) return true;
    if (typeof val === "object" && val !== null) {
      return val.status === "loading";
    }
    return val === "loading";
  });

  const canGoNext = selectedCount > 0 && !hasSelectedLoading;

  const fileNameValidation = validateDocumentMapPngBaseFileName(baseFileName);
  const isFileNameValid = fileNameValidation.ok;
  const isFolderValid = outputFolder.trim().length > 0;
  const canExecuteExport = selectedCount > 0 && isFolderValid && isFileNameValid && !isExporting;

  function handleToggleRow(entryId: string): void {
    setRows((current) =>
      current.map((row) =>
        row.entryId === entryId ? { ...row, enabled: !row.enabled } : row
      )
    );
  }

  function handleDragStart(event: ReactDragEvent, index: number): void {
    event.dataTransfer.setData(WIZARD_DRAG_MIME, String(index));
    event.dataTransfer.effectAllowed = "move";
    setDraggingIndex(index);
  }

  function handleDragOver(event: ReactDragEvent, index: number): void {
    if (draggingIndex === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const gap = event.clientY > rect.top + rect.height / 2 ? index + 1 : index;
    setDropGap(gap);
  }

  function handleDrop(event: ReactDragEvent, index: number): void {
    event.preventDefault();
    if (draggingIndex === null) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const targetGap = event.clientY > rect.top + rect.height / 2 ? index + 1 : index;
    const finalIndex = draggingIndex < targetGap ? targetGap - 1 : targetGap;
    setRows((current) => reorderArrayItem(current, draggingIndex, finalIndex));
    setDraggingIndex(null);
    setDropGap(null);
  }

  function handleDragEnd(): void {
    setDraggingIndex(null);
    setDropGap(null);
  }

  async function handleExecuteExport(): Promise<void> {
    if (!canExecuteExport) {
      return;
    }
    setIsExporting(true);
    setExportResultStatus(null);

    try {
      const ext = format === "pdf" ? ".pdf" : ".html";
      const fileName = baseFileName.toLowerCase().endsWith(ext)
        ? baseFileName
        : `${baseFileName}${ext}`;
      const outputFilePath = joinExportPath(outputFolder, fileName);

      if (onCheckFileExists) {
        const check = await onCheckFileExists({ filePath: outputFilePath });
        if (check.exists && onConfirmOverwrite) {
          const confirmed = await onConfirmOverwrite();
          if (!confirmed) {
            setIsExporting(false);
            return;
          }
        }
      } else if (window.pergamum?.files?.checkFileExists) {
        const check = await window.pergamum.files.checkFileExists({ filePath: outputFilePath });
        if (check.exists && onConfirmOverwrite) {
          const confirmed = await onConfirmOverwrite();
          if (!confirmed) {
            setIsExporting(false);
            return;
          }
        }
      }

      const plan: CombinedGlossaryExportPlan = {
        format,
        entries: selectedRows.map((r) => r.entry),
        occurrenceCountsByEntryId,
        outputFilePath,
        fileName,
        imageAssetFolderName: imageAssetFolderName || DEFAULT_IMAGE_ASSET_FOLDER_NAME,
        includeToc,
        tocPosition,
        pdfFontCandidates,
        pdfPageSettings,
        documentTitle: translate("glossaryExportWizard.tocTitle")
      };

      let result: CombinedGlossaryExportRunResult;
      if (onExportCombined) {
        result = await onExportCombined(plan);
      } else if (format === "pdf" && window.pergamum?.files?.exportPdfCombined) {
        const htmlContent = buildCombinedGlossaryExportHtml({
          documentTitle: plan.documentTitle ?? "語彙集",
          sections: selectedRows.map((r) => {
            const countVal = occurrenceCountsByEntryId?.get(r.entryId);
            let occurrences: GlossaryEntryOccurrenceCounts | null = null;
            if (
              typeof countVal === "object" &&
              countVal !== null &&
              "occurrences" in countVal &&
              countVal.occurrences
            ) {
              occurrences = countVal.occurrences as GlossaryEntryOccurrenceCounts;
            } else if (
              typeof countVal === "object" &&
              countVal !== null &&
              countVal.status === "ready"
            ) {
              occurrences = {
                atoms: r.entry.atoms.map((a) => ({ atomId: a.id, value: a.value, count: 0 })),
                total: countVal.count,
                documentCount: 0,
                skippedFileCount: 0
              };
            }
            return {
              entry: r.entry,
              occurrences,
              description: null
            };
          }),
          content: defaultGlossaryExportContentOptions,
          includeToc,
          tocPosition,
          labels: {
            infoHeading: translate("glossaryExport.document.infoHeading"),
            representative: translate("glossaryExport.document.representative"),
            atoms: translate("glossaryExport.document.atoms"),
            tags: translate("glossaryExport.document.tags"),
            noTags: translate("glossaryExport.document.noTags"),
            createdAt: translate("glossaryExport.document.createdAt"),
            updatedAt: translate("glossaryExport.document.updatedAt"),
            occurrencesHeading: translate("glossaryExport.document.occurrencesHeading"),
            atomColumn: translate("glossaryExport.document.atomColumn"),
            countColumn: translate("glossaryExport.document.countColumn"),
            total: translate("glossaryExport.document.total"),
            occurrenceScope: translate("glossaryExport.document.occurrenceScope", { count: 0 }),
            occurrenceSkipped: null,
            descriptionHeading: translate("glossaryExport.document.descriptionHeading"),
            emptyDescription: translate("glossaryExport.document.emptyDescription")
          },
          tocTitle: translate("glossaryExportWizard.tocTitle"),
          tocNavLabel: translate("glossaryExportWizard.tocNavLabel"),
          lang: uiLanguage,
          katexCss: null
        });

        const res = await window.pergamum.files.exportPdfCombined({
          defaultFileName: fileName,
          htmlContent,
          imageAssets: [],
          projectRootPath: null,
          targetPath: outputFilePath,
          pdfFontFamily: pdfFontCandidates.length > 0 ? pdfFontCandidates[0].family : null,
          pdfPageNumberSettings: pdfPageSettings,
          allowOverwrite: true
        });
        result = res.ok
          ? { ok: true, outputPath: res.outputPath, warningCount: res.warningCount }
          : { ok: false, reason: "failed" };
      } else if (window.pergamum?.files?.exportHtmlCombined) {
        const htmlContent = buildCombinedGlossaryExportHtml({
          documentTitle: plan.documentTitle ?? "語彙集",
          sections: selectedRows.map((r) => {
            const countVal = occurrenceCountsByEntryId?.get(r.entryId);
            let occurrences: GlossaryEntryOccurrenceCounts | null = null;
            if (
              typeof countVal === "object" &&
              countVal !== null &&
              "occurrences" in countVal &&
              countVal.occurrences
            ) {
              occurrences = countVal.occurrences as GlossaryEntryOccurrenceCounts;
            } else if (
              typeof countVal === "object" &&
              countVal !== null &&
              countVal.status === "ready"
            ) {
              occurrences = {
                atoms: r.entry.atoms.map((a) => ({ atomId: a.id, value: a.value, count: 0 })),
                total: countVal.count,
                documentCount: 0,
                skippedFileCount: 0
              };
            }
            return {
              entry: r.entry,
              occurrences,
              description: null
            };
          }),
          content: defaultGlossaryExportContentOptions,
          includeToc,
          tocPosition,
          labels: {
            infoHeading: translate("glossaryExport.document.infoHeading"),
            representative: translate("glossaryExport.document.representative"),
            atoms: translate("glossaryExport.document.atoms"),
            tags: translate("glossaryExport.document.tags"),
            noTags: translate("glossaryExport.document.noTags"),
            createdAt: translate("glossaryExport.document.createdAt"),
            updatedAt: translate("glossaryExport.document.updatedAt"),
            occurrencesHeading: translate("glossaryExport.document.occurrencesHeading"),
            atomColumn: translate("glossaryExport.document.atomColumn"),
            countColumn: translate("glossaryExport.document.countColumn"),
            total: translate("glossaryExport.document.total"),
            occurrenceScope: translate("glossaryExport.document.occurrenceScope", { count: 0 }),
            occurrenceSkipped: null,
            descriptionHeading: translate("glossaryExport.document.descriptionHeading"),
            emptyDescription: translate("glossaryExport.document.emptyDescription")
          },
          tocTitle: translate("glossaryExportWizard.tocTitle"),
          tocNavLabel: translate("glossaryExportWizard.tocNavLabel"),
          lang: uiLanguage,
          katexCss: null
        });

        const res = await window.pergamum.files.exportHtmlCombined({
          defaultFileName: fileName,
          htmlContent,
          imageAssets: [],
          projectRootPath: null,
          targetPath: outputFilePath,
          allowOverwrite: true
        });
        result = res.ok
          ? { ok: true, outputPath: res.outputPath, warningCount: res.warningCount }
          : { ok: false, reason: "failed" };
      } else {
        result = { ok: false, reason: "failed" };
      }

      if (result.ok) {
        setExportResultStatus({ kind: "success", path: result.outputPath });
      } else {
        setExportResultStatus({
          kind: "error",
          message: translate("glossaryExport.failed")
        });
      }
    } catch {
      setExportResultStatus({
        kind: "error",
        message: translate("glossaryExport.failed")
      });
    } finally {
      setIsExporting(false);
    }
  }

  const fontCandidatesSummaryText =
    pdfFontCandidates.length === 0
      ? translate("export.confirmation.pdfFont.default")
      : pdfFontCandidates.map((f) => buildFontFamilyCss([f])).join(", ");

  const pageNumbersSummaryText = formatPdfPageNumberSummaryText(
    pdfPageSettings,
    translate
  );

  function renderOccurrenceDisplay(entryId: string): string {
    if (!occurrenceCountsByEntryId) {
      return "-";
    }
    const val = occurrenceCountsByEntryId.get(entryId);
    if (val === undefined) {
      return "-";
    }
    if (typeof val === "object" && val !== null) {
      if (val.status === "loading") {
        return translate("glossaryExportWizard.occurrenceLoading");
      }
      if (val.status === "failed") {
        return translate("glossaryExportWizard.occurrenceFailed");
      }
      return formatLocalizedNumber(val.count, uiLanguage);
    }
    if (val === "loading") {
      return translate("glossaryExportWizard.occurrenceLoading");
    }
    if (val === "failed") {
      return translate("glossaryExportWizard.occurrenceFailed");
    }
    return typeof val === "number"
      ? formatLocalizedNumber(val, uiLanguage)
      : String(val);
  }

  const footerActions = (
    <div className="glossaryExportWizardFooterActions">
      {step === 1 ? (
        <>
          <button
            type="button"
            className="glossaryExportWizardCancelButton"
            onClick={onClose}
          >
            {translate("glossaryExport.closeButton")}
          </button>
          <button
            type="button"
            className="glossaryExportWizardNextButton"
            disabled={!canGoNext}
            onClick={() => setStep(2)}
          >
            {translate("glossaryExportWizard.nextButton")}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="glossaryExportWizardBackButton"
            disabled={isExporting}
            onClick={() => setStep(1)}
          >
            {translate("glossaryExportWizard.backButton")}
          </button>
          {exportResultStatus?.kind === "success" ? (
            <button
              type="button"
              className="glossaryExportWizardExportButton"
              onClick={onClose}
            >
              {translate("glossaryExport.closeButton")}
            </button>
          ) : (
            <button
              type="button"
              className="glossaryExportWizardExportButton"
              disabled={!canExecuteExport}
              onClick={() => {
                void handleExecuteExport();
              }}
            >
              {translate("export.wizard.executeExport")}
            </button>
          )}
        </>
      )}
    </div>
  );

  return (
    <GlossaryExportWizardErrorBoundary>
      <InfoDialog
        title={translate("glossaryExportWizard.dialogTitle")}
        opener={opener ?? null}
        onClose={onClose}
        className="glossaryExportWizardDialog"
        footer={footerActions}
      >
        <div className="glossaryExportWizardContainer">
          <header className="glossaryExportWizardHeader">
            <h2 className="glossaryExportWizardStepTitle">
              {step === 1
                ? translate("glossaryExportWizard.step1Title")
                : translate("glossaryExportWizard.step2Title")}
            </h2>
          </header>

          {step === 1 ? (
            <div className="glossaryExportWizardStep1Content">
              {/* Top Options Block */}
              <div className="glossaryExportWizardOptionsBlock">
                <div className="glossaryExportWizardOptionRow">
                  <label
                    htmlFor={`${dialogId}-format`}
                    className="glossaryExportWizardLabel"
                  >
                    {translate("glossaryExport.formatLabel")}
                  </label>
                  <select
                    id={`${dialogId}-format`}
                    className="glossaryExportWizardSelect"
                    value={format}
                    onChange={(e) => setFormat(e.target.value as "html" | "pdf")}
                  >
                    <option value="html">
                      {translate("glossaryExport.format.html")}
                    </option>
                    <option value="pdf">PDF</option>
                  </select>
                </div>

                {format === "html" ? (
                  <div className="glossaryExportWizardFormatOptions">
                    <p className="glossaryExportWizardHelpNote">
                      {translate("glossaryExportWizard.htmlNote")}
                    </p>
                    <div className="glossaryExportWizardOptionRow">
                      <label
                        htmlFor={`${dialogId}-image-folder`}
                        className="glossaryExportWizardLabel"
                      >
                        {translate("glossaryExportWizard.imageFolderLabel")}
                      </label>
                      <input
                        type="text"
                        id={`${dialogId}-image-folder`}
                        className="glossaryExportWizardTextInput"
                        value={imageAssetFolderName}
                        onChange={(e) => setImageAssetFolderName(e.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="glossaryExportWizardFormatOptions">
                    <div className="glossaryExportWizardPdfFontSection">
                      <div className="glossaryExportWizardPdfHeaderRow">
                        <span className="glossaryExportWizardLabel">
                          {translate("glossaryExportWizard.pdfFontLabel")}
                        </span>
                        <button
                          type="button"
                          className="glossaryExportWizardEditButton"
                          onClick={() => setIsOpenFontPicker(true)}
                        >
                          {translate("glossaryExportWizard.editPdfFonts")}
                        </button>
                      </div>
                      <p className="glossaryExportWizardPdfSummary">
                        {fontCandidatesSummaryText}
                      </p>
                      <p className="glossaryExportWizardHelpNote">
                        {translate("glossaryExportWizard.pdfFontNote1")}
                      </p>
                      <p className="glossaryExportWizardHelpNote">
                        {translate("glossaryExportWizard.pdfFontNote2")}
                      </p>
                    </div>

                    <div className="glossaryExportWizardPdfPageSection">
                      <div className="glossaryExportWizardPdfHeaderRow">
                        <span className="glossaryExportWizardLabel">
                          {translate("glossaryExportWizard.pdfPageSettingsLabel")}
                        </span>
                        <button
                          type="button"
                          className="glossaryExportWizardEditButton"
                          onClick={() => setIsOpenPdfPageSettings(true)}
                        >
                          {translate("glossaryExportWizard.editPdfPageSettings")}
                        </button>
                      </div>
                      <p className="glossaryExportWizardPdfSummary">
                        {pageNumbersSummaryText}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Glossary Table */}
              <div className="glossaryExportWizardTableSection">
                <div
                  className="glossaryExportWizardTable"
                  role="table"
                  aria-label={translate("glossaryExportWizard.step1Title")}
                >
                  <div
                    className="glossaryExportWizardTableRow glossaryExportWizardTableHead"
                    role="row"
                  >
                    <span role="columnheader" className="glossaryExportWizardColHandle">
                      {translate("glossaryExportWizard.columns.handle")}
                    </span>
                    <span role="columnheader" className="glossaryExportWizardColRep">
                      {translate("glossaryExportWizard.columns.representative")}
                    </span>
                    <span role="columnheader" className="glossaryExportWizardColTags">
                      {translate("glossaryExportWizard.columns.tags")}
                    </span>
                    <span role="columnheader" className="glossaryExportWizardColCount">
                      {translate("glossaryExportWizard.columns.occurrences")}
                    </span>
                    <span role="columnheader" className="glossaryExportWizardColToggle">
                      {translate("glossaryExportWizard.columns.toggle")}
                    </span>
                  </div>

                  {rows.map((row, index) => (
                    <div
                      className="glossaryExportWizardTableRow glossaryExportWizardEntryRow"
                      role="row"
                      key={row.entryId}
                      data-dragging={draggingIndex === index || undefined}
                      data-drop-before={dropGap === index || undefined}
                      data-drop-after={
                        dropGap === index + 1 && index === rows.length - 1
                          ? true
                          : undefined
                      }
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                    >
                      {/* Gripper / Drag handle */}
                      <span
                        className="glossaryExportWizardDragHandle"
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragEnd={handleDragEnd}
                        title={translate("glossary.entryManager.dragHandle")}
                        aria-label={translate("glossary.entryManager.dragHandle")}
                        role="button"
                        tabIndex={0}
                      >
                        <span
                          aria-hidden="true"
                          className="glossaryExportWizardGripperIcon"
                          dangerouslySetInnerHTML={{ __html: gripperIconRaw }}
                        />
                      </span>

                      {/* Representative surface */}
                      <span className="glossaryExportWizardCellRep" title={row.representativeSurface}>
                        {row.representativeSurface}
                      </span>

                      {/* Tag list */}
                      <span className="glossaryExportWizardCellTags">
                        {row.tags.length === 0 ? (
                          <span className="glossaryExportWizardNoTags">
                            {translate("glossary.entryManager.noTags")}
                          </span>
                        ) : (
                          row.tags.map((tag: GlossaryTag, tagIdx: number) => (
                            <GlossaryTagChip
                              key={tag.id}
                              tag={tag}
                              compact
                              isPrimary={tagIdx === 0}
                              primaryLabel={translate("glossary.entryManager.primaryTag")}
                            />
                          ))
                        )}
                      </span>

                      {/* Occurrence count */}
                      <span className="glossaryExportWizardCellCount">
                        {renderOccurrenceDisplay(row.entryId)}
                      </span>

                      {/* Toggle switch */}
                      <span className="glossaryExportWizardCellToggle">
                        <label className="exportConfirmationDialogIncludeSwitch">
                          <input
                            type="checkbox"
                            className="exportConfirmationDialogIncludeInput"
                            checked={row.enabled}
                            onChange={() => handleToggleRow(row.entryId)}
                          />
                          <span className="exportConfirmationDialogIncludeTrack">
                            <span className="exportConfirmationDialogIncludeThumb" />
                          </span>
                        </label>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status & Validation Footer */}
              <div className="glossaryExportWizardStatusRow">
                <span className="glossaryExportWizardSelectedCount">
                  {translate("glossaryExportWizard.selectedCount", {
                    selectedCount,
                    totalCount
                  })}
                </span>
                {selectedCount === 0 ? (
                  <p className="glossaryExportWizardErrorText">
                    {translate("glossaryExportWizard.noSelectionError")}
                  </p>
                ) : hasSelectedLoading ? (
                  <p className="glossaryExportWizardErrorText">
                    {translate("glossaryExportWizard.occurrenceCountingWait")}
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            /* Step 2 Content Foundation */
            <div className="glossaryExportWizardStep2Content">
              <div className="glossaryExportWizardOptionsBlock">
                {/* TOC Option Row (1-line) */}
                <div className="glossaryExportWizardOptionRow glossaryExportWizardTocRow">
                  <label className="glossaryExportWizardTocToggleLabel">
                    <span>{translate("glossaryExportWizard.includeToc")}</span>
                    <span className="exportConfirmationDialogIncludeSwitch">
                      <input
                        type="checkbox"
                        className="exportConfirmationDialogIncludeInput glossaryExportWizardTocToggleInput"
                        checked={includeToc}
                        onChange={(e) => setIncludeToc(e.target.checked)}
                      />
                      <span className="exportConfirmationDialogIncludeTrack">
                        <span className="exportConfirmationDialogIncludeThumb" />
                      </span>
                    </span>
                  </label>
                  <div className="glossaryExportWizardTocPositionBlock">
                    <label
                      htmlFor={`${dialogId}-toc-position`}
                      className="glossaryExportWizardLabel"
                    >
                      {translate("glossaryExportWizard.tocPosition")}
                    </label>
                    <select
                      id={`${dialogId}-toc-position`}
                      className="glossaryExportWizardSelect"
                      value={tocPosition}
                      disabled={!includeToc}
                      onChange={(e) => setTocPosition(e.target.value as "front" | "back")}
                    >
                      <option value="front">
                        {translate("glossaryExportWizard.tocPosition.front")}
                      </option>
                      <option value="back">
                        {translate("glossaryExportWizard.tocPosition.back")}
                      </option>
                    </select>
                  </div>
                </div>

                {/* Destination Folder Picker */}
                <div className="glossaryExportWizardOptionRow">
                  <label
                    htmlFor={`${dialogId}-output-folder`}
                    className="glossaryExportWizardLabel"
                  >
                    {translate("glossaryExportWizard.outputFolderLabel")}
                  </label>
                  <div className="glossaryExportWizardFolderInputGroup">
                    <input
                      type="text"
                      id={`${dialogId}-output-folder`}
                      className="glossaryExportWizardTextInput"
                      value={outputFolder}
                      onChange={(e) => setOutputFolder(e.target.value)}
                    />
                    <button
                      type="button"
                      className="glossaryExportWizardBrowseButton"
                      onClick={() => {
                        void (async () => {
                          if (onSelectFolder) {
                            const res = await onSelectFolder({
                              defaultPath: outputFolder || null
                            });
                            if (res.ok) setOutputFolder(res.folderPath);
                          } else if (window.pergamum?.files?.selectExportFolder) {
                            const res = await window.pergamum.files.selectExportFolder({
                              defaultPath: outputFolder || null
                            });
                            if (res.ok) setOutputFolder(res.folderPath);
                          }
                        })();
                      }}
                    >
                      {translate("glossaryExportWizard.browseButton")}
                    </button>
                  </div>
                </div>

                {/* Base File Name */}
                <div className="glossaryExportWizardOptionRow">
                  <label
                    htmlFor={`${dialogId}-base-file-name`}
                    className="glossaryExportWizardLabel"
                  >
                    {translate("glossaryExportWizard.fileNameLabel")}
                  </label>
                  <input
                    type="text"
                    id={`${dialogId}-base-file-name`}
                    className="glossaryExportWizardTextInput"
                    value={baseFileName}
                    onChange={(e) => setBaseFileName(e.target.value)}
                  />
                </div>
              </div>

              {/* Summary Block */}
              <div className="glossaryExportWizardSummaryBlock">
                <div className="glossaryExportWizardSummaryRow">
                  <span className="glossaryExportWizardSummaryLabel">
                    {translate("glossaryExportWizard.summaryFormat")}:
                  </span>
                  <span className="glossaryExportWizardSummaryValue">
                    {format.toUpperCase()}
                  </span>
                </div>
                <div className="glossaryExportWizardSummaryRow">
                  <span className="glossaryExportWizardSummaryLabel">
                    {translate("glossaryExportWizard.summaryCount")}:
                  </span>
                  <span className="glossaryExportWizardSummaryValue">
                    {selectedCount}件
                  </span>
                </div>

                {format === "html" ? (
                  <>
                    <div className="glossaryExportWizardSummaryRow">
                      <span className="glossaryExportWizardSummaryLabel">
                        {translate("glossaryExportWizard.summaryImageFolder")}:
                      </span>
                      <span className="glossaryExportWizardSummaryValue">
                        {imageAssetFolderName || DEFAULT_IMAGE_ASSET_FOLDER_NAME}
                      </span>
                    </div>
                    <div className="glossaryExportWizardSummaryRow">
                      <span className="glossaryExportWizardSummaryLabel">
                        {translate("glossaryExportWizard.summaryToc")}:
                      </span>
                      <span className="glossaryExportWizardSummaryValue">
                        {includeToc
                          ? translate(
                              tocPosition === "front"
                                ? "glossaryExportWizard.tocPosition.front"
                                : "glossaryExportWizard.tocPosition.back"
                            )
                          : translate("glossaryExportWizard.summaryTocNone")}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="glossaryExportWizardSummaryRow">
                      <span className="glossaryExportWizardSummaryLabel">
                        {translate("glossaryExportWizard.summaryBodyFonts")}:
                      </span>
                      <span className="glossaryExportWizardSummaryValue">
                        {fontCandidatesSummaryText}
                      </span>
                    </div>
                    <div className="glossaryExportWizardSummaryRow">
                      <span className="glossaryExportWizardSummaryLabel">
                        {translate("glossaryExportWizard.summaryPageNumbers")}:
                      </span>
                      <span className="glossaryExportWizardSummaryValue">
                        {pageNumbersSummaryText}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Notice or Status Row */}
              {exportResultStatus ? (
                <div
                  className={
                    exportResultStatus.kind === "success"
                      ? "glossaryExportWizardSuccessStatus"
                      : "glossaryExportWizardErrorStatus"
                  }
                >
                  {exportResultStatus.kind === "success" ? (
                    <p>
                      {translate("glossaryExport.success", {
                        path: exportResultStatus.path
                      })}
                    </p>
                  ) : (
                    <p>{exportResultStatus.message}</p>
                  )}
                </div>
              ) : !isFileNameValid ? (
                <div className="glossaryExportWizardErrorStatus">
                  <p>
                    {translate(
                      `glossaryExport.fileNameError.${fileNameValidation.error}` as TranslationKey
                    )}
                  </p>
                </div>
              ) : !isFolderValid ? (
                <div className="glossaryExportWizardErrorStatus">
                  <p>{translate("glossaryExport.folderRequired")}</p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </InfoDialog>

      {/* Font Picker Dialog */}
      <FontPickerDialog
        isOpen={isOpenFontPicker}
        slot="preview.fontFamilyList"
        initialValue={pdfFontCandidates}
        translate={translate}
        uiLanguage={uiLanguage}
        onSave={(newFonts) => {
          setPdfFontCandidates(newFonts);
          setIsOpenFontPicker(false);
        }}
        onClose={() => setIsOpenFontPicker(false)}
      />

      {/* PDF Page Number Settings Dialog */}
      <PdfPageNumberSettingsDialog
        isOpen={isOpenPdfPageSettings}
        initialSettings={pdfPageSettings}
        translate={translate}
        onApply={(newSettings) => {
          setPdfPageSettings(newSettings);
          setIsOpenPdfPageSettings(false);
        }}
        onClose={() => setIsOpenPdfPageSettings(false)}
      />
    </GlossaryExportWizardErrorBoundary>
  );
}

