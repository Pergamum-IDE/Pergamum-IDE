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
import {
  representativeGlossaryAtom,
  type GlossaryAtom,
  type GlossaryEntry,
  type GlossaryTag
} from "../../shared/glossary";
import { buildFontFamilyCss, type FontFamilySetting } from "../../shared/fontSettings";
import type { Language, Translate } from "../../shared/i18n";
import {
  DEFAULT_PDF_PAGE_NUMBER_SETTINGS,
  formatPdfPageNumberSummaryText,
  type PdfPageNumberSettings
} from "../../shared/pdfPageNumbering";
import { DEFAULT_IMAGE_ASSET_FOLDER_NAME } from "../exportTypes";
import { GlossaryTagChip } from "../GlossaryTagChip";
import { FontPickerDialog } from "./FontPickerDialog";
import { InfoDialog } from "./InfoDialog";
import { PdfPageNumberSettingsDialog } from "./PdfPageNumberSettingsDialog";

export type OccurrenceCountValue = number | "loading" | "failed";

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
  onClose
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
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, initialEntries]);

  if (!isOpen) {
    return null;
  }

  const selectedCount = rows.filter((row) => row.enabled).length;
  const totalCount = rows.length;
  const canGoNext = selectedCount > 0;

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
    if (val === "loading") {
      return translate("glossaryExportWizard.occurrenceLoading");
    }
    if (val === "failed") {
      return translate("glossaryExportWizard.occurrenceFailed");
    }
    return String(val);
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
            onClick={() => setStep(1)}
          >
            {translate("glossaryExportWizard.backButton")}
          </button>
          <button
            type="button"
            className="glossaryExportWizardExportButton"
            disabled
          >
            {translate("glossaryExport.exportButton")}
          </button>
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
                {!canGoNext && (
                  <p className="glossaryExportWizardErrorText">
                    {translate("glossaryExportWizard.noSelectionError")}
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* Step 2 Content Foundation */
            <div className="glossaryExportWizardStep2Content">
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
                  <div className="glossaryExportWizardSummaryRow">
                    <span className="glossaryExportWizardSummaryLabel">
                      {translate("glossaryExportWizard.summaryImageFolder")}:
                    </span>
                    <span className="glossaryExportWizardSummaryValue">
                      {imageAssetFolderName || DEFAULT_IMAGE_ASSET_FOLDER_NAME}
                    </span>
                  </div>
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

              <div className="glossaryExportWizardSliceNotice">
                <p>{translate("glossaryExportWizard.notImplementedNotice")}</p>
              </div>
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
