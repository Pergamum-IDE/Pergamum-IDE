import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent
} from "react";
import gripperIconUrl from "../../../assets/icons/codicons/dialog/gripper.svg?url";
import folderIconUrl from "../../../assets/icons/codicons/explorer/folder.svg?url";
import chevronDownIconUrl from "../../../assets/icons/feather/glossary/chevrons-down.svg?url";
import chevronRightIconUrl from "../../../assets/icons/feather/glossary/chevrons-right.svg?url";
import editIconUrl from "../../../assets/icons/feather/global/edit-2.svg?url";
import markdownFileIconUrl from "../../../assets/icons/svgrepo/explorer/markdown-svgrepo-com.svg?url";
import textFileIconUrl from "../../../assets/icons/svgrepo/explorer/document-svgrepo-com.svg?url";
import reloadIconUrl from "../../../assets/icons/ionicons/dialog/reload-outline.svg?url";
import closeXIconUrl from "../../../assets/icons/feather/global/close-x.svg?url";
import parchmentRollLoaderUrl from "../../../assets/parchment-roll-loader-220h.gif?url";
import {
  defaultLanguage,
  formatLocalizedNumber,
  type Language,
  type Translate
} from "../../shared/i18n";
import type {
  CheckFileExistsRequest,
  CheckFileExistsResult,
  ExportHtmlCombinedRequest,
  ExportHtmlCombinedResult,
  ExportPdfCombinedRequest,
  ExportPdfCombinedResult,
  ExportTxtUtf8Result,
  GetDocumentsPathResult,
  PdfFontInspectionResult,
  SelectExportFolderRequest,
  SelectExportFolderResult,
  SelectPdfSavePathRequest,
  SelectPdfSavePathResult
} from "../../shared/api";
import { buildFontFamilyCss, type FontFamilySetting } from "../../shared/fontSettings";
import type {
  ExportCandidateListItem,
  ExportCandidateFolderGroup,
  ExportDocumentKind,
  ExportOrigin,
  HeadingRemovalLevel
} from "../exportCandidates";
import {
  HEADING_REMOVAL_LEVELS,
  groupExportCandidatesByParentPath,
  isHeadingRemovalLevel,
  mergeExportCandidateIncludedStates,
  recalculateExportCandidateMetadata,
  summarizeExportCandidates,
  toggleFolderIncluded
} from "../exportCandidates";
import {
  applyExportDialogOrder,
  createInitialExportDialogState,
  createOrderStateFromCandidates,
  getOrderDirtyFiles,
  getOrderDirtyGroups,
  isExportDialogDirty,
  isExportDialogOrderDirty,
  isIncludeStateDirty,
  reorderFileWithinGroup,
  reorderFolderGroup
} from "../exportDialogOrder";
import {
  countExternalImageReferences,
  generateCombinedHtml,
  htmlExportDefaultFileName
} from "../exportHtml";
import { pdfExportDefaultFileName } from "../exportPdf";
import {
  DEFAULT_EXPORT_BODY_NOTATION,
  DEFAULT_EXPORT_DIALOG_OPTIONS_STATE,
  DEFAULT_IMAGE_ASSET_FOLDER_NAME,
  DEFAULT_INCLUDE_FILE_STRUCTURE_TOC,
  EXPORT_BODY_NOTATIONS,
  HTML_COMBINED_EXPORT_FORMAT,
  PDF_COMBINED_EXPORT_FORMAT,
  TXT_UTF8_EXPORT_FORMAT,
  getFixedExtensionForFormat,
  sanitizeFileName,
  validateImageAssetFolderName,
  type ExportBodyNotation,
  type ExportDialogOptionsState,
  type ExportFormat,
  type ExportWizardStep
} from "../exportTypes";
import {
  createExportAssembly,
  txtExportDefaultFileName,
  type ExportTxtExecutionRequest
} from "../exportTxt";
import { InfoDialog } from "./InfoDialog";
import { FontPickerDialog } from "./FontPickerDialog";

export interface ExportConfirmationDialogProps {
  readonly origin: ExportOrigin;
  readonly projectName: string | null;
  readonly candidates: readonly ExportCandidateListItem[];
  readonly translate: Translate;
  readonly uiLanguage?: Language;
  readonly opener: Element | null;
  readonly onReloadCandidates: () => Promise<
    readonly ExportCandidateListItem[] | null
  >;
  readonly onConfirmDiscardReload: () => Promise<boolean>;
  readonly onExportTxt: (
    request: ExportTxtExecutionRequest
  ) => Promise<ExportTxtUtf8Result>;
  readonly onExportHtmlCombined?: (
    request: ExportHtmlCombinedRequest
  ) => Promise<ExportHtmlCombinedResult>;
  readonly onSelectPdfSavePath?: (
    request: SelectPdfSavePathRequest
  ) => Promise<SelectPdfSavePathResult>;
  readonly onExportPdfCombined?: (
    request: ExportPdfCombinedRequest
  ) => Promise<ExportPdfCombinedResult>;
  readonly onSelectExportFolder?: (
    request?: SelectExportFolderRequest
  ) => Promise<SelectExportFolderResult>;
  readonly onGetDocumentsPath?: () => Promise<GetDocumentsPathResult>;
  readonly onCheckFileExists?: (
    request: CheckFileExistsRequest
  ) => Promise<CheckFileExistsResult>;
  readonly loadAozoraText: (relativePath: string) => Promise<string>;
  readonly onExportUnavailable: () => void;
  readonly onExportFailed: (error: unknown) => void;
  readonly onClose: () => void;
}

type ExportDialogDragState =
  | { readonly kind: "folder"; readonly parentPath: string }
  | {
      readonly kind: "file";
      readonly parentPath: string;
      readonly filePath: string;
    };

type ExportDialogDropTarget =
  | { readonly kind: "folder"; readonly parentPath: string }
  | {
      readonly kind: "file";
      readonly parentPath: string;
      readonly filePath: string;
    };

function classNames(
  ...values: readonly (string | false | null | undefined)[]
): string {
  return values.filter(Boolean).join(" ");
}

function parseHeadingRemovalLevel(value: string): HeadingRemovalLevel {
  const parsed = Number.parseInt(value, 10);
  return isHeadingRemovalLevel(parsed) ? parsed : 0;
}

function headingRemovalOptionLabel(
  level: HeadingRemovalLevel,
  translate: Translate
): string {
  switch (level) {
    case 0:
      return translate("export.confirmation.headingRemoval.none");
    case 1:
      return translate("export.confirmation.headingRemoval.level1");
    case 2:
      return translate("export.confirmation.headingRemoval.level2");
    case 3:
      return translate("export.confirmation.headingRemoval.level3");
    case 4:
      return translate("export.confirmation.headingRemoval.level4");
    case 5:
      return translate("export.confirmation.headingRemoval.level5");
    case 6:
      return translate("export.confirmation.headingRemoval.level6");
    default:
      return translate("export.confirmation.headingRemoval.none");
  }
}

function parseExportBodyNotation(value: string): ExportBodyNotation {
  return EXPORT_BODY_NOTATIONS.includes(value as ExportBodyNotation)
    ? (value as ExportBodyNotation)
    : DEFAULT_EXPORT_BODY_NOTATION;
}

function exportFormatLabel(
  format: ExportFormat,
  translate: Translate
): string {
  switch (format) {
    case TXT_UTF8_EXPORT_FORMAT:
      return translate("export.confirmation.format.txtUtf8");
    case HTML_COMBINED_EXPORT_FORMAT:
      return translate("export.confirmation.format.htmlCombined");
    case PDF_COMBINED_EXPORT_FORMAT:
      return translate("export.confirmation.format.pdfCombined");
    default:
      return "";
  }
}

function formatPdfFontResultText(
  selectedFonts: readonly FontFamilySetting[],
  fontInspection: PdfFontInspectionResult | undefined,
  translate: Translate
): string {
  if (!selectedFonts || selectedFonts.length === 0) {
    return translate("export.confirmation.pdfFont.default");
  }

  const primaryFont = selectedFonts[0];
  const firstFamily =
    primaryFont?.displayName?.trim() || primaryFont?.family || "";
  const summaryText =
    selectedFonts.length > 1
      ? translate("export.wizard.fontSummaryOther", { first: firstFamily })
      : firstFamily;

  const status = fontInspection?.status ?? "skipped";
  switch (status) {
    case "confirmed":
      return translate("export.wizard.fontStatusConfirmed", {
        font: summaryText
      });
    case "partial":
      return translate("export.wizard.fontStatusPartial", {
        font: summaryText
      });
    case "notConfirmed":
      return translate("export.wizard.fontStatusNotConfirmed", {
        font: summaryText
      });
    case "skipped":
    default:
      return translate("export.confirmation.pdfFont.default");
  }
}

function renderInterpretationPreviewSample(bodyNotation: ExportBodyNotation): JSX.Element {
  switch (bodyNotation) {
    case "aozora":
      return (
        <div className="exportInterpretationPreviewSample">
          <span>青空文庫形式（例: ｜吾輩《わがはい》は猫である）</span>
        </div>
      );
    case "narou":
      return (
        <div className="exportInterpretationPreviewSample">
          <span>なろう形式（例: ｜吾輩《わがはい》は猫である）</span>
        </div>
      );
    case "kakuyomu":
      return (
        <div className="exportInterpretationPreviewSample">
          <span>カクヨム形式（例: 《《強調》》、｜漢字《ルビ》）</span>
        </div>
      );
    case "markdown":
    default:
      return (
        <div className="exportInterpretationPreviewSample">
          <span>Markdown標準（ルビ・傍点記法を変換）</span>
        </div>
      );
  }
}

function cloneCandidates(
  candidates: readonly ExportCandidateListItem[]
): ExportCandidateListItem[] {
  return candidates.map((candidate) => ({ ...candidate }));
}

function buildOutputPath(
  folderPath: string,
  fileName: string,
  extension: string
): string {
  const sanitized = sanitizeFileName(fileName);
  const base = sanitized.endsWith(extension) ? sanitized : `${sanitized}${extension}`;
  if (!folderPath || folderPath.trim().length === 0) {
    return base;
  }
  const isWindows = folderPath.includes("\\");
  const sep = isWindows ? "\\" : "/";
  const cleanFolder = folderPath.replace(/[\\/]+$/u, "");
  return `${cleanFolder}${sep}${base}`;
}

export function ExportConfirmationDialog({
  origin,
  projectName,
  candidates,
  translate,
  uiLanguage,
  opener,
  onReloadCandidates,
  onConfirmDiscardReload,
  onExportTxt,
  onExportHtmlCombined,
  onSelectPdfSavePath,
  onExportPdfCombined,
  onSelectExportFolder,
  onGetDocumentsPath,
  onCheckFileExists,
  loadAozoraText,
  onExportUnavailable,
  onExportFailed,
  onClose
}: ExportConfirmationDialogProps): JSX.Element {
  const [rows, setRows] = useState<readonly ExportCandidateListItem[]>(() =>
    cloneCandidates(candidates)
  );
  const [headingRemovalLevel, setHeadingRemovalLevel] =
    useState<HeadingRemovalLevel>(0);
  const [exportFormat, setExportFormat] = useState<ExportFormat>(
    TXT_UTF8_EXPORT_FORMAT
  );
  const [bodyNotation, setBodyNotation] = useState<ExportBodyNotation>(
    DEFAULT_EXPORT_BODY_NOTATION
  );
  const [includeFileStructureToc, setIncludeFileStructureToc] = useState(
    DEFAULT_INCLUDE_FILE_STRUCTURE_TOC
  );
  const [imageAssetFolderName, setImageAssetFolderName] = useState<string>(
    DEFAULT_IMAGE_ASSET_FOLDER_NAME
  );
  const [pdfFontFamilyList, setPdfFontFamilyList] = useState<
    readonly FontFamilySetting[]
  >([]);
  const [isFontPickerOpen, setIsFontPickerOpen] = useState(false);
  const pdfFontPickerOpenerRef = useRef<HTMLButtonElement | null>(null);

  const pdfFontFamily = useMemo(() => {
    if (pdfFontFamilyList.length === 0) {
      return null;
    }
    return buildFontFamilyCss(pdfFontFamilyList);
  }, [pdfFontFamilyList]);

  const pdfFontSummaryText = useMemo(() => {
    if (pdfFontFamilyList.length === 0) {
      return translate("export.confirmation.pdfFont.default");
    }
    return pdfFontFamilyList
      .map((font) => {
        const displayName = font.displayName?.trim();
        if (displayName && displayName !== font.family) {
          return `${font.family} / ${displayName}`;
        }
        return font.family;
      })
      .join(", ");
  }, [pdfFontFamilyList, translate]);

  const [fontInspection, setFontInspection] = useState<PdfFontInspectionResult | null>(null);

  const [wizardStep, setWizardStep] =
    useState<ExportWizardStep>("sourceInterpretation");
  const [destinationFolder, setDestinationFolder] = useState<string>("");

  const defaultBaseName = useMemo(() => {
    if (projectName && projectName.trim().length > 0) {
      return sanitizeFileName(projectName);
    }
    if (origin.kind === "file") {
      const parts = origin.filePath.split(/[\\/]/);
      const last = parts[parts.length - 1] ?? "";
      const base = last.replace(/\.[^.]+$/, "");
      return sanitizeFileName(base || "Untitled");
    }
    if (origin.kind === "folder") {
      const parts = origin.folderPath.split(/[\\/]/);
      const last = parts[parts.length - 1] ?? "";
      return sanitizeFileName(last || "Untitled");
    }
    return "Untitled";
  }, [origin, projectName]);

  const [fileName, setFileName] = useState<string>(defaultBaseName);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [exportResultInfo, setExportResultInfo] = useState<{
    savedPath: string;
    warningCount?: number;
    fontInspection?: PdfFontInspectionResult;
  } | null>(null);

  useEffect(() => {
    if (!destinationFolder && onGetDocumentsPath) {
      onGetDocumentsPath()
        .then((res) => {
          if (res && res.path) {
            setDestinationFolder(res.path);
          }
        })
        .catch(() => {
          // ignore fallback
        });
    }
  }, [destinationFolder, onGetDocumentsPath]);

  const [lastExportedPath, setLastExportedPath] = useState<string | null>(null);
  const [orderState, setOrderState] = useState(() =>
    createOrderStateFromCandidates(candidates)
  );
  const [initialState, setInitialState] = useState(() =>
    createInitialExportDialogState(
      candidates,
      0,
      DEFAULT_EXPORT_DIALOG_OPTIONS_STATE
    )
  );
  const [collapsedParentPaths, setCollapsedParentPaths] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [isReloading, setIsReloading] = useState(false);
  const [dragState, setDragState] = useState<ExportDialogDragState | null>(
    null
  );
  const [dropTarget, setDropTarget] =
    useState<ExportDialogDropTarget | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const orderedRows = useMemo(
    () => applyExportDialogOrder(rows, orderState),
    [orderState, rows]
  );
  const isTxtUtf8Export = exportFormat === TXT_UTF8_EXPORT_FORMAT;
  const isHtmlCombinedExport = exportFormat === HTML_COMBINED_EXPORT_FORMAT;
  const isPdfCombinedExport = exportFormat === PDF_COMBINED_EXPORT_FORMAT;
  const isValidImageAssetFolderName = isHtmlCombinedExport
    ? validateImageAssetFolderName(imageAssetFolderName)
    : true;

  const isListLocked =
    wizardStep === "outputDestination" || wizardStep === "result";

  const isValidFileName =
    sanitizeFileName(fileName) === fileName.trim() &&
    fileName.trim().length > 0 &&
    !/[\\/]/u.test(fileName);

  const fullOutputPath = useMemo(
    () =>
      buildOutputPath(
        destinationFolder,
        fileName,
        getFixedExtensionForFormat(exportFormat)
      ),
    [destinationFolder, fileName, exportFormat]
  );

  const externalImageCount = useMemo(() => {
    if (!isPdfCombinedExport) {
      return 0;
    }
    const includedCandidateDocuments = orderedRows
      .filter((row) => row.included)
      .map((row) => ({
        filePath: row.filePath,
        parentPath: row.parentPath,
        fileName: row.fileName,
        kind: row.kind,
        text: row.rawText,
        rawText: row.rawText
      }));
    return countExternalImageReferences(includedCandidateDocuments, headingRemovalLevel);
  }, [isPdfCombinedExport, orderedRows, headingRemovalLevel]);

  const effectiveIncludeFileStructureToc =
    isTxtUtf8Export ? false : includeFileStructureToc;
  const fileStructureTocTooltip = translate(
    isTxtUtf8Export
      ? "export.confirmation.fileStructureToc.disabledForTxt"
      : "export.confirmation.fileStructureToc.tooltip"
  );
  const optionsState: ExportDialogOptionsState = useMemo(
    () => ({
      exportFormat,
      bodyNotation,
      includeFileStructureToc: effectiveIncludeFileStructureToc,
      imageAssetFolderName,
      pdfFontFamily
    }),
    [bodyNotation, effectiveIncludeFileStructureToc, exportFormat, imageAssetFolderName, pdfFontFamily]
  );
  const isDirty = useMemo(
    () =>
      isExportDialogDirty({
        orderState,
        candidates: rows,
        headingRemovalLevel,
        optionsState,
        initialState
      }),
    [headingRemovalLevel, initialState, optionsState, orderState, rows]
  );
  const isCandidateListDirty = useMemo(
    () =>
      isExportDialogOrderDirty(orderState, initialState.orderState) ||
      isIncludeStateDirty(rows, initialState.includedByFilePath),
    [initialState, orderState, rows]
  );
  const orderDirtyGroups = useMemo(
    () => getOrderDirtyGroups(orderState, initialState.orderState),
    [initialState, orderState]
  );
  const orderDirtyFiles = useMemo(
    () => getOrderDirtyFiles(orderState, initialState.orderState),
    [initialState, orderState]
  );
  const summary = useMemo(
    () => summarizeExportCandidates(orderedRows),
    [orderedRows]
  );
  const groups = useMemo(
    () =>
      groupExportCandidatesByParentPath(
        orderedRows,
        translate("export.confirmation.projectRootParent")
      ),
    [orderedRows, translate]
  );

  const targetLabel = useMemo(() => {
    if (origin.kind === "file") {
      return origin.filePath;
    }

    if (origin.kind === "folder") {
      return origin.folderPath;
    }

    return projectName && projectName.trim().length > 0
      ? `${translate("export.confirmation.origin.projectRoot")} (${projectName})`
      : translate("export.confirmation.origin.projectRoot");
  }, [origin, projectName, translate]);

  function handleToggleRowIncluded(filePath: string): void {
    if (isListLocked) return;
    setRows((current) =>
      current.map((candidate) =>
        candidate.filePath === filePath
          ? { ...candidate, included: !candidate.included }
          : candidate
      )
    );
  }

  function handleToggleFolderCollapse(parentPath: string): void {
    if (isListLocked) return;
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

  function handleToggleFolderIncluded(parentPath: string): void {
    if (isListLocked) return;
    setRows((current) => toggleFolderIncluded(current, parentPath));
  }

  function handleHeadingRemovalLevelChange(value: string): void {
    const nextLevel = parseHeadingRemovalLevel(value);
    setHeadingRemovalLevel(nextLevel);
    setRows((current) =>
      recalculateExportCandidateMetadata(current, nextLevel)
    );
  }

  function handleBodyNotationChange(value: string): void {
    setBodyNotation(parseExportBodyNotation(value));
  }

  async function aozoraTextByFilePathFor(
    includedRows: readonly ExportCandidateListItem[]
  ): Promise<Readonly<Record<string, string>> | undefined> {
    if (bodyNotation !== "aozora") {
      return undefined;
    }

    const entries = await Promise.all(
      includedRows.map(async (candidate) => [
        candidate.filePath,
        await loadAozoraText(candidate.filePath)
      ] as const)
    );

    return Object.fromEntries(entries);
  }

  async function executeActualExport(
    fullPath: string,
    allowOverwrite: boolean
  ): Promise<void> {
    if (isExporting) {
      return;
    }

    const includedRows = orderedRows.filter((candidate) => candidate.included);
    if (includedRows.length === 0) {
      onExportUnavailable();
      return;
    }

    setIsExporting(true);
    try {
      let resultPath = fullPath;
      let warningCount = 0;
      let resultFontInspection: PdfFontInspectionResult | undefined;

      if (exportFormat === TXT_UTF8_EXPORT_FORMAT) {
        const assembly = createExportAssembly(orderedRows, {
          format: TXT_UTF8_EXPORT_FORMAT,
          bodyNotation,
          headingRemovalLevel,
          aozoraTextByFilePath: await aozoraTextByFilePathFor(includedRows)
        });

        if (assembly.documents.length === 0) {
          onExportUnavailable();
          return;
        }

        const result = await onExportTxt({
          assembly,
          defaultFileName: fileName,
          targetPath: fullPath,
          allowOverwrite
        });

        if (result.ok) {
          resultPath = result.outputPath;
        } else {
          if (result.reason === "canceled") return;
          throw new Error("TXT export failed.");
        }
      } else if (exportFormat === HTML_COMBINED_EXPORT_FORMAT && onExportHtmlCombined) {
        if (!validateImageAssetFolderName(imageAssetFolderName)) {
          return;
        }

        const assembly = createExportAssembly(orderedRows, {
          format: HTML_COMBINED_EXPORT_FORMAT,
          bodyNotation,
          headingRemovalLevel,
          appendFileStructureToc: effectiveIncludeFileStructureToc,
          imageAssetFolderName,
          projectName,
          aozoraTextByFilePath: await aozoraTextByFilePathFor(includedRows)
        });

        if (assembly.documents.length === 0) {
          onExportUnavailable();
          return;
        }

        const { htmlContent, imageAssets } = generateCombinedHtml(assembly);

        const result = await onExportHtmlCombined({
          defaultFileName: fileName,
          htmlContent,
          imageAssets,
          projectRootPath: null,
          targetPath: fullPath,
          allowOverwrite
        });

        if (result.ok) {
          resultPath = result.outputPath;
          warningCount = result.warningCount;
        } else {
          if (result.reason === "canceled") return;
          throw new Error("HTML export failed.");
        }
      } else if (exportFormat === PDF_COMBINED_EXPORT_FORMAT && onExportPdfCombined) {
        const assembly = createExportAssembly(orderedRows, {
          format: PDF_COMBINED_EXPORT_FORMAT,
          bodyNotation,
          headingRemovalLevel,
          appendFileStructureToc: effectiveIncludeFileStructureToc,
          imageAssetFolderName,
          pdfFontFamily,
          projectName,
          aozoraTextByFilePath: await aozoraTextByFilePathFor(includedRows)
        });

        if (assembly.documents.length === 0) {
          onExportUnavailable();
          return;
        }

        const { htmlContent, imageAssets } = generateCombinedHtml(assembly, {
          isPdf: true
        });

        const result = await onExportPdfCombined({
          targetPath: fullPath,
          defaultFileName: fileName,
          htmlContent,
          imageAssets,
          projectRootPath: null,
          pdfFontFamily: pdfFontFamilyList.length > 0 ? pdfFontFamilyList[0].family : null,
          allowOverwrite
        });

        if (result.ok) {
          resultPath = result.outputPath;
          warningCount = result.warningCount;
          resultFontInspection = result.fontInspection;
        } else {
          if (result.reason === "canceled") return;
          throw new Error("PDF export failed.");
        }
      } else {
        throw new Error("Unsupported export format.");
      }

      setLastExportedPath(resultPath);
      if (resultFontInspection) {
        setFontInspection(resultFontInspection);
      }
      setExportResultInfo({
        savedPath: resultPath,
        warningCount,
        fontInspection: resultFontInspection
      });
      setWizardStep("result");
    } catch (error) {
      onExportFailed(error);
    } finally {
      setIsExporting(false);
    }
  }

  function handleFolderDragStart(
    event: ReactDragEvent<HTMLElement>,
    parentPath: string
  ): void {
    if (isListLocked) return;
    setDragState({ kind: "folder", parentPath });
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", parentPath);
    }
  }

  function handleFileDragStart(
    event: ReactDragEvent<HTMLElement>,
    candidate: ExportCandidateListItem
  ): void {
    if (isListLocked) return;
    setDragState({
      kind: "file",
      parentPath: candidate.parentPath,
      filePath: candidate.filePath
    });
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", candidate.filePath);
    }
  }

  function handleDragEnd(): void {
    setDragState(null);
    setDropTarget(null);
  }

  function updateDropTarget(next: ExportDialogDropTarget | null): void {
    setDropTarget((current) =>
      current &&
      current.kind === next?.kind &&
      current.parentPath === next?.parentPath &&
      ("filePath" in current ? current.filePath : undefined) ===
        ("filePath" in (next ?? {})
          ? (next as { filePath?: string }).filePath
          : undefined)
        ? current
        : next
    );
  }

  function handleDragOverFolder(
    event: ReactDragEvent<HTMLElement>,
    parentPath: string
  ): void {
    if (isListLocked) return;
    if (dragState?.kind === "folder" && dragState.parentPath !== parentPath) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      updateDropTarget({ kind: "folder", parentPath });
    }
  }

  function handleDragOverFile(
    event: ReactDragEvent<HTMLElement>,
    candidate: ExportCandidateListItem
  ): void {
    if (isListLocked) return;
    if (
      dragState?.kind === "file" &&
      dragState.parentPath === candidate.parentPath &&
      dragState.filePath !== candidate.filePath
    ) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      updateDropTarget({
        kind: "file",
        parentPath: candidate.parentPath,
        filePath: candidate.filePath
      });
    }
  }

  function handleDropFolder(
    event: ReactDragEvent<HTMLElement>,
    targetParentPath: string
  ): void {
    if (isListLocked) return;
    if (dragState?.kind === "folder" && dragState.parentPath !== targetParentPath) {
      event.preventDefault();
      setOrderState((current) =>
        reorderFolderGroup(current, dragState.parentPath, targetParentPath)
      );
    }
    handleDragEnd();
  }

  function handleDropFile(
    event: ReactDragEvent<HTMLElement>,
    targetCandidate: ExportCandidateListItem
  ): void {
    if (isListLocked) return;
    if (
      dragState?.kind === "file" &&
      dragState.parentPath === targetCandidate.parentPath &&
      dragState.filePath !== targetCandidate.filePath
    ) {
      event.preventDefault();
      setOrderState((current) =>
        reorderFileWithinGroup(
          current,
          dragState.parentPath,
          dragState.filePath,
          targetCandidate.parentPath,
          targetCandidate.filePath
        )
      );
    }
    handleDragEnd();
  }

  async function handleReloadCandidates(): Promise<void> {
    if (isListLocked || isReloading || isExporting) {
      return;
    }

    if (isCandidateListDirty) {
      const confirmed = await onConfirmDiscardReload();
      if (!confirmed) {
        return;
      }
    }

    setIsReloading(true);
    try {
      const reloadedCandidates = await onReloadCandidates();
      if (reloadedCandidates === null) {
        return;
      }

      const nextRows = recalculateExportCandidateMetadata(
        cloneCandidates(reloadedCandidates),
        headingRemovalLevel
      );

      const mergedRows = mergeExportCandidateIncludedStates(
        nextRows,
        rows
      );

      const nextOrderState = createOrderStateFromCandidates(mergedRows);
      const nextOptionsState: ExportDialogOptionsState = {
        exportFormat,
        bodyNotation,
        includeFileStructureToc: effectiveIncludeFileStructureToc,
        imageAssetFolderName,
        pdfFontFamily
      };

      setRows(mergedRows);
      setOrderState(nextOrderState);
      setInitialState(
        createInitialExportDialogState(
          mergedRows,
          headingRemovalLevel,
          nextOptionsState
        )
      );
      setHeadingRemovalLevel(headingRemovalLevel);
      setExportFormat(nextOptionsState.exportFormat);
      setBodyNotation(nextOptionsState.bodyNotation);
      setIncludeFileStructureToc(nextOptionsState.includeFileStructureToc);
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

  const closeButton = (
    <button
      type="button"
      className="appDialogCloseButton"
      disabled={isExporting}
      title={translate("common.cancel")}
      aria-label={translate("common.cancel")}
      data-export-close-button="true"
      onClick={onClose}
    >
      <img src={closeXIconUrl} alt="" className="appDialogCloseIcon" />
    </button>
  );

  return (
    <>
      <InfoDialog
        className="exportConfirmationDialog"
        title={translate("export.confirmation.title")}
        titleAccessory={closeButton}
        opener={opener}
        onClose={onClose}
        footer={
          <div className="exportConfirmationDialogFooter">
            <div className="exportConfirmationDialogFooterLeft">
              {wizardStep === "sourceInterpretation" && (
                <button type="button" className="appDialogButton" onClick={onClose}>
                  {translate("common.cancel")}
                </button>
              )}

              {wizardStep === "outputFormat" && (
                <button
                  type="button"
                  className="appDialogButton"
                  onClick={() => setWizardStep("sourceInterpretation")}
                >
                  {translate("export.wizard.backToSourceInterpretation")}
                </button>
              )}

              {wizardStep === "outputDestination" && (
                <button
                  type="button"
                  className="appDialogButton"
                  onClick={() => setWizardStep("outputFormat")}
                >
                  {translate("export.wizard.backToOutputFormat")}
                </button>
              )}

              {wizardStep === "result" && (
                <button
                  type="button"
                  className="appDialogButton"
                  data-export-reexport-button="true"
                  onClick={() => {
                    setWizardStep("sourceInterpretation");
                    setExportResultInfo(null);
                  }}
                >
                  {translate("export.wizard.reexport")}
                </button>
              )}
            </div>

            <div className="appDialogActions">
              {wizardStep === "sourceInterpretation" && (
                <button
                  type="button"
                  className="appDialogButton appDialogButton-confirm"
                  onClick={() => setWizardStep("outputFormat")}
                >
                  {translate("export.wizard.goToOutputFormat")}
                </button>
              )}

              {wizardStep === "outputFormat" && (
                <button
                  type="button"
                  className="appDialogButton appDialogButton-confirm"
                  disabled={!isValidImageAssetFolderName}
                  onClick={() => setWizardStep("outputDestination")}
                >
                  {translate("export.wizard.goToOutputDestination")}
                </button>
              )}

              {wizardStep === "outputDestination" && (
                <button
                  type="button"
                  className="appDialogButton appDialogButton-confirm"
                  disabled={!isValidFileName || !isValidImageAssetFolderName || isExporting}
                  data-export-execute-button="true"
                  onClick={async () => {
                    if (!isValidFileName) return;
                    const fullPath = buildOutputPath(
                      destinationFolder,
                      fileName,
                      getFixedExtensionForFormat(exportFormat)
                    );
                    if (onCheckFileExists) {
                      const res = await onCheckFileExists({ filePath: fullPath });
                      if (res.exists) {
                        setShowOverwriteConfirm(true);
                        return;
                      }
                    }
                    void executeActualExport(fullPath, false);
                  }}
                >
                  {translate("export.wizard.executeExport")}
                </button>
              )}

              {wizardStep === "result" && (
                <button
                  type="button"
                  className="appDialogButton appDialogButton-confirm"
                  onClick={onClose}
                >
                  {translate("export.wizard.close")}
                </button>
              )}
            </div>
          </div>
        }
      >
        <div className="exportWizardContainer">
          {wizardStep === "sourceInterpretation" && (
            <div className="exportWizardStep exportWizardStep1">
              <div className="exportWizardStepHeader">
                <h3>{translate("export.wizard.sourceInterpretation")}</h3>
              </div>
              <div className="exportConfirmationDialogControls">
                <label className="exportConfirmationDialogControl">
                  <span className="exportConfirmationDialogControlLabel">
                    {translate("export.wizard.sourceInterpretation")}
                  </span>
                  <select
                    className="exportConfirmationDialogSelect"
                    value={bodyNotation}
                    data-export-body-notation-select="true"
                    onChange={(e) => handleBodyNotationChange(e.currentTarget.value)}
                  >
                    <option value="markdown">
                      {translate("export.confirmation.bodyNotation.markdown")}
                    </option>
                    <option value="aozora">
                      {translate("export.confirmation.bodyNotation.aozora")}
                    </option>
                    <option value="narou">
                      {translate("export.confirmation.bodyNotation.narou")}
                    </option>
                    <option value="kakuyomu">
                      {translate("export.confirmation.bodyNotation.kakuyomu")}
                    </option>
                  </select>
                </label>

                <div className="exportInterpretationPreviewBox">
                  <div className="exportInterpretationPreviewHeader">
                    {translate("export.wizard.interpretationPreview")}
                  </div>
                  {renderInterpretationPreviewSample(bodyNotation)}
                </div>
              </div>
            </div>
          )}

          {wizardStep === "outputFormat" && (
            <div className="exportWizardStep exportWizardStep2">
              <div className="exportWizardStepHeader">
                <h3>{translate("export.wizard.outputFormat")}</h3>
              </div>
              <div className="exportConfirmationDialogControls">
                <div className="exportConfirmationDialogControlRow">
                  <label className="exportConfirmationDialogControl">
                    <span className="exportConfirmationDialogControlLabel">
                      {translate("export.confirmation.format.label")}
                    </span>
                    <select
                      className="exportConfirmationDialogSelect"
                      value={exportFormat}
                      data-export-format-select="true"
                      onChange={(e) => {
                        const nextFormat = e.currentTarget.value as ExportFormat;
                        setExportFormat(nextFormat);
                        if (
                          nextFormat === HTML_COMBINED_EXPORT_FORMAT ||
                          nextFormat === PDF_COMBINED_EXPORT_FORMAT
                        ) {
                          setIncludeFileStructureToc(true);
                        }
                      }}
                    >
                      <option value={TXT_UTF8_EXPORT_FORMAT}>
                        {exportFormatLabel(TXT_UTF8_EXPORT_FORMAT, translate)}
                      </option>
                      <option value={HTML_COMBINED_EXPORT_FORMAT}>
                        {exportFormatLabel(HTML_COMBINED_EXPORT_FORMAT, translate)}
                      </option>
                      <option value={PDF_COMBINED_EXPORT_FORMAT}>
                        {exportFormatLabel(PDF_COMBINED_EXPORT_FORMAT, translate)}
                      </option>
                    </select>
                  </label>
                </div>

                <div className="exportConfirmationDialogControlRow">
                  <label className="exportConfirmationDialogControl">
                    <span className="exportConfirmationDialogControlLabel">
                      {translate("export.confirmation.headingRemoval.label")}
                    </span>
                    <select
                      className="exportConfirmationDialogSelect"
                      value={headingRemovalLevel.toString()}
                      data-export-heading-removal-select="true"
                      onChange={(e) => handleHeadingRemovalLevelChange(e.currentTarget.value)}
                    >
                      {HEADING_REMOVAL_LEVELS.map((level) => (
                        <option key={level} value={level.toString()}>
                          {headingRemovalOptionLabel(level, translate)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {isTxtUtf8Export && (
                  <span className="exportConfirmationDialogControlNote">
                    {translate("export.confirmation.txtUtf8.note")}
                  </span>
                )}

                {isHtmlCombinedExport && (
                  <>
                    <span className="exportConfirmationDialogControlNote">
                      {translate("export.confirmation.htmlCombined.note")}
                    </span>
                    <div className="exportConfirmationDialogControlRow">
                      <label className="exportConfirmationDialogControl">
                        <span className="exportConfirmationDialogControlLabel">
                          {translate("export.confirmation.imageAssetFolder.label")}
                        </span>
                        <input
                          type="text"
                          className="exportConfirmationDialogInput"
                          value={imageAssetFolderName}
                          data-export-image-asset-folder-input="true"
                          onChange={(e) => setImageAssetFolderName(e.currentTarget.value)}
                        />
                      </label>
                    </div>
                    <span className="exportConfirmationDialogControlNote">
                      {translate("export.confirmation.imageAssetFolder.note")}
                    </span>
                    {!isValidImageAssetFolderName && (
                      <span className="exportConfirmationDialogErrorNote">
                        {translate("export.confirmation.imageAssetFolder.invalid")}
                      </span>
                    )}
                  </>
                )}

                {isPdfCombinedExport && (
                  <>
                    <div className="exportWizardFontSection">
                      <label className="exportConfirmationDialogControlLabel">
                        {translate("export.wizard.pdfFontCandidatesLabel")}
                      </label>
                      <div className="fontFamilyListSummaryRow">
                        <span
                          className="fontFamilyListSummaryText"
                          title={pdfFontSummaryText}
                          data-export-pdf-font-summary="true"
                        >
                          {pdfFontSummaryText}
                        </span>
                        <button
                          type="button"
                          ref={pdfFontPickerOpenerRef}
                          className="settingsButton fontFamilyListChooseButton"
                          data-export-pdf-font-picker-button="true"
                          onClick={() => setIsFontPickerOpen(true)}
                        >
                          {translate("export.wizard.editPdfFontCandidates")}
                        </button>
                      </div>
                    </div>
                    <span className="exportConfirmationDialogControlNote">
                      {translate("export.wizard.pdfFontFallbackNote")}
                    </span>
                    <span className="exportConfirmationDialogControlNote">
                      {translate("export.confirmation.pdfCombined.fontWarning")}
                    </span>
                    {externalImageCount > 0 && (
                      <span
                        className="exportConfirmationDialogErrorNote"
                        data-export-pdf-external-image-warning="true"
                      >
                        {translate("export.confirmation.pdfCombined.externalImageWarning", {
                          count: externalImageCount
                        })}
                      </span>
                    )}
                  </>
                )}

                {(isHtmlCombinedExport || isPdfCombinedExport) && (
                  <div className="exportConfirmationDialogControlRow">
                    <label className="exportConfirmationDialogControl exportConfirmationDialogTocControl">
                      <span
                        className="exportConfirmationDialogControlLabel"
                        title={fileStructureTocTooltip}
                      >
                        {translate("export.confirmation.fileStructureToc.label")}
                      </span>
                      <label
                        className="exportConfirmationDialogIncludeSwitch"
                        title={fileStructureTocTooltip}
                      >
                        <input
                          type="checkbox"
                          className="exportConfirmationDialogIncludeInput"
                          checked={includeFileStructureToc}
                          data-export-file-structure-toc-toggle="true"
                          onChange={(e) => setIncludeFileStructureToc(e.currentTarget.checked)}
                        />
                        <span className="exportConfirmationDialogIncludeTrack">
                          <span className="exportConfirmationDialogIncludeThumb" />
                        </span>
                      </label>
                    </label>
                  </div>
                )}

                {isPdfCombinedExport && (
                  <span className="exportConfirmationDialogControlNote">
                    {translate("export.confirmation.pdfCombined.note")}
                  </span>
                )}
              </div>
            </div>
          )}

          {wizardStep === "outputDestination" && (
            <div className="exportWizardStep exportWizardStep3">
              <div className="exportWizardStepHeader">
                <h3>{translate("export.wizard.outputPath")}</h3>
              </div>
              <div className="exportConfirmationDialogControls">
                <div className="exportWizardFolderRow">
                  <label className="exportConfirmationDialogControl">
                    <span className="exportConfirmationDialogControlLabel">
                      {translate("export.wizard.outputDestinationFolder")}
                    </span>
                    <div className="exportWizardInputWithButton">
                      <input
                        type="text"
                        className="exportConfirmationDialogInput"
                        value={destinationFolder}
                        data-export-destination-folder-input="true"
                        readOnly
                      />
                      <button
                        type="button"
                        className="appDialogButton"
                        data-export-browse-folder-button="true"
                        onClick={async () => {
                          if (onSelectExportFolder) {
                            const res = await onSelectExportFolder({
                              defaultPath: destinationFolder
                            });
                            if (res.ok && res.folderPath) {
                              setDestinationFolder(res.folderPath);
                            }
                          }
                        }}
                      >
                        {translate("export.wizard.browseFolder")}
                      </button>
                    </div>
                  </label>
                </div>

                <label className="exportConfirmationDialogControl">
                  <span className="exportConfirmationDialogControlLabel">
                    {translate("export.wizard.fileName")}
                  </span>
                  <div className="exportWizardFileNameRow">
                    <input
                      type="text"
                      className="exportConfirmationDialogInput"
                      value={fileName}
                      data-export-file-name-input="true"
                      onChange={(e) => setFileName(e.currentTarget.value)}
                    />
                    <span
                      className="exportWizardFixedExtension"
                      data-export-fixed-extension="true"
                    >
                      {getFixedExtensionForFormat(exportFormat)}
                    </span>
                  </div>
                </label>

                {!isValidFileName && (
                  <span className="exportConfirmationDialogErrorNote">
                    {translate("export.wizard.invalidFileName")}
                  </span>
                )}

                <div className="exportWizardFullPathDisplay">
                  <span className="exportWizardFullPathLabel">
                    {translate("export.wizard.outputPath")}:
                  </span>
                  <span
                    className="exportWizardFullPathValue"
                    data-export-full-output-path={fullOutputPath}
                  >
                    {fullOutputPath}
                  </span>
                </div>
              </div>

              {showOverwriteConfirm && (
                <div
                  className="exportOverwriteConfirmModal"
                  data-export-overwrite-modal="true"
                >
                  <div className="exportOverwriteConfirmContent">
                    <p className="exportOverwriteConfirmMessage">
                      {translate("export.wizard.overwriteConfirmMessage")}
                    </p>
                    <div className="exportOverwriteConfirmActions">
                      <button
                        type="button"
                        className="appDialogButton"
                        data-export-overwrite-cancel="true"
                        onClick={() => setShowOverwriteConfirm(false)}
                      >
                        {translate("common.cancel")}
                      </button>
                      <button
                        type="button"
                        className="appDialogButton appDialogButton-confirm"
                        data-export-overwrite-confirm="true"
                        onClick={() => {
                          setShowOverwriteConfirm(false);
                          const fullPath = buildOutputPath(
                            destinationFolder,
                            fileName,
                            getFixedExtensionForFormat(exportFormat)
                          );
                          void executeActualExport(fullPath, true);
                        }}
                      >
                        {translate("export.wizard.overwriteConfirmButton")}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {wizardStep === "result" && (
            <div className="exportWizardStep exportWizardStep4" data-export-result-step="true">
              <div className="exportWizardStepHeader">
                <h3>{translate("export.wizard.resultSavedPath")}</h3>
              </div>
              <div className="exportWizardResultCard">
                <div className="exportWizardResultRow">
                  <span className="exportWizardResultLabel">
                    {translate("export.wizard.resultSavedPath")}:
                  </span>
                  <span
                    className="exportWizardResultValue"
                    data-export-saved-path="true"
                    data-export-result-path={exportResultInfo?.savedPath}
                  >
                    {exportResultInfo?.savedPath}
                  </span>
                </div>
                {isPdfCombinedExport && (
                  <div className="exportWizardResultRow">
                    <span className="exportWizardResultLabel">
                      {translate("export.wizard.resultFont")}:
                    </span>
                    <span
                      className="exportWizardResultValue"
                      data-export-pdf-font-status={exportResultInfo?.fontInspection?.status}
                    >
                      {formatPdfFontResultText(
                        pdfFontFamilyList,
                        exportResultInfo?.fontInspection,
                        translate
                      )}
                    </span>
                  </div>
                )}
                <div className="exportWizardResultRow">
                  <span className="exportWizardResultLabel">
                    {translate("export.wizard.resultWarnings")}:
                  </span>
                  <span className="exportWizardResultValue">
                    {typeof exportResultInfo?.warningCount === "number" && exportResultInfo.warningCount > 0
                      ? translate("export.wizard.resultWarningsCount", { count: exportResultInfo.warningCount })
                      : translate("export.wizard.resultWarningsNone")}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="exportConfirmationDialogOverview">
            <div className="exportConfirmationDialogHeader">
              <span className="exportConfirmationDialogLabel">
                {translate("export.confirmation.targetLabel")}
              </span>
              <span className="exportConfirmationDialogValue">{targetLabel}</span>
            </div>

            <div className="exportConfirmationDialogStats">
              <span
                className="exportConfirmationDialogStatValue"
                data-export-confirmation-summary="summary"
              >
                {translate("export.confirmation.summary", {
                  totalCharacters: formatLocalizedNumber(
                    summary.includedCharacterCount,
                    uiLanguage ?? defaultLanguage
                  ),
                  included: formatLocalizedNumber(
                    summary.includedCount,
                    uiLanguage ?? defaultLanguage
                  ),
                  candidates: formatLocalizedNumber(
                    summary.candidateCount,
                    uiLanguage ?? defaultLanguage
                  )
                })}
              </span>
            </div>
          </div>

          <div className="exportConfirmationDialogTableWrap">
            {rows.length === 0 ? (
              <div className="exportConfirmationDialogEmpty">
                {translate("export.confirmation.empty")}
              </div>
            ) : (
              <table className="exportConfirmationDialogTable">
                <thead>
                  <tr>
                    <th className="exportConfirmationDialogHandleCell">
                      <button
                        type="button"
                        className="exportConfirmationDialogReloadButton"
                        disabled={
                          isListLocked ||
                          isReloading ||
                          isExporting ||
                          !isCandidateListDirty
                        }
                        title={translate("export.confirmation.reload")}
                        aria-label={translate("export.confirmation.reload")}
                        data-export-table-reload-button="true"
                        onClick={() => void handleReloadCandidates()}
                      >
                        <img
                          src={reloadIconUrl}
                          alt=""
                          className="exportConfirmationDialogReloadIcon"
                        />
                      </button>
                    </th>
                    <th className="exportConfirmationDialogIncludeCell">
                      {translate("export.confirmation.includeHeader")}
                    </th>
                    <th className="exportConfirmationDialogNameCell">
                      {translate("export.confirmation.fileNameHeader")}
                    </th>
                    <th className="exportConfirmationDialogPreviewCell">
                      {translate("export.confirmation.previewStartHeader")}
                    </th>
                    <th className="exportConfirmationDialogPreviewCell">
                      {translate("export.confirmation.previewEndHeader")}
                    </th>
                    <th className="exportConfirmationDialogCountCell">
                      {translate("export.confirmation.characterCountHeader")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => {
                    const isCollapsed = collapsedParentPaths.has(group.parentPath);
                    const isFolderOrderDirty = orderDirtyGroups.has(group.parentPath);

                    return (
                      <Fragment key={group.parentPath || "__project_root__"}>
                        <tr
                          className={classNames(
                            "exportConfirmationDialogRow",
                            "exportConfirmationDialogFolderRow",
                            dropTarget?.kind === "folder" &&
                              dropTarget.parentPath === group.parentPath &&
                              "exportConfirmationDialogDropTarget"
                          )}
                          data-export-folder-parent-path={group.parentPath}
                          data-export-dragging={
                            dragState?.kind === "folder" &&
                            dragState.parentPath === group.parentPath
                          }
                          data-export-drop-target={
                            dropTarget?.kind === "folder" &&
                            dropTarget.parentPath === group.parentPath
                          }
                          data-export-order-dirty={isFolderOrderDirty ? "true" : "false"}
                          onDragOver={(e) => handleDragOverFolder(e, group.parentPath)}
                          onDrop={(e) => handleDropFolder(e, group.parentPath)}
                        >
                          <td className="exportConfirmationDialogHandleCell">
                            <span
                              className="exportConfirmationDialogHandle"
                              draggable={!isListLocked}
                              data-export-folder-drag-handle-parent-path={
                                group.parentPath
                              }
                              title={translate(
                                "export.confirmation.folderDragHandleLabel",
                                { folder: group.label }
                              )}
                              onDragStart={(e) =>
                                handleFolderDragStart(e, group.parentPath)
                              }
                              onDragEnd={handleDragEnd}
                            >
                              <img
                                src={gripperIconUrl}
                                alt=""
                                className="exportConfirmationDialogHandleIcon"
                              />
                            </span>
                          </td>
                          <td className="exportConfirmationDialogIncludeCell">
                            <label
                              className="exportConfirmationDialogIncludeSwitch"
                              title={translate(
                                "export.confirmation.folderIncludeToggleLabel",
                                { folder: group.label }
                              )}
                            >
                              <input
                                type="checkbox"
                                className="exportConfirmationDialogIncludeInput"
                                checked={group.includeState === "on"}
                                ref={(el) => {
                                  if (el) {
                                    el.indeterminate = group.includeState === "mixed";
                                  }
                                }}
                                disabled={isListLocked}
                                data-export-folder-include-state={group.includeState}
                                data-export-folder-toggle-parent-path={
                                  group.parentPath
                                }
                                onChange={() =>
                                  handleToggleFolderIncluded(group.parentPath)
                                }
                              />
                              <span className="exportConfirmationDialogIncludeTrack">
                                <span className="exportConfirmationDialogIncludeThumb" />
                              </span>
                            </label>
                          </td>
                          <td
                            className="exportConfirmationDialogNameCell"
                            colSpan={3}
                            title={group.label}
                          >
                            <div className="exportConfirmationDialogFolderName">
                              <button
                                type="button"
                                className="exportConfirmationDialogFolderToggle"
                                disabled={isListLocked}
                                data-export-folder-collapse-parent-path={
                                  group.parentPath
                                }
                                onClick={() =>
                                  handleToggleFolderCollapse(group.parentPath)
                                }
                              >
                                <img
                                  src={
                                    isCollapsed
                                      ? chevronRightIconUrl
                                      : chevronDownIconUrl
                                  }
                                  alt=""
                                  className="exportConfirmationDialogChevronIcon"
                                />
                              </button>
                              <img
                                src={folderIconUrl}
                                alt=""
                                className="exportConfirmationDialogFolderIcon"
                              />
                              <span
                                className="exportConfirmationDialogFolderLabel"
                                title={group.label}
                              >
                                {group.label}
                              </span>
                              <span className="exportConfirmationDialogFolderStats">
                                {group.includeState === "on"
                                  ? translate(
                                      "export.confirmation.folderIncluded",
                                      {
                                        included: group.totalFileCount,
                                        total: group.totalFileCount
                                      }
                                    )
                                  : group.includeState === "off"
                                    ? translate(
                                        "export.confirmation.folderIncluded",
                                        {
                                          included: 0,
                                          total: group.totalFileCount
                                        }
                                      )
                                    : translate(
                                        "export.confirmation.folderIncludedMixed",
                                        {
                                          included: group.includedFileCount,
                                          total: group.totalFileCount
                                        }
                                      )}
                              </span>
                            </div>
                          </td>
                          <td className="exportConfirmationDialogCountCell exportConfirmationDialogCharacterCount">
                            {translate("export.confirmation.totalCharacterCount", {
                              count: formatLocalizedNumber(
                                group.includedCharacterCount,
                                uiLanguage ?? defaultLanguage
                              )
                            })}
                          </td>
                        </tr>

                        {!isCollapsed &&
                          group.items.map((candidate) => {
                            const isFileOrderDirty = orderDirtyFiles.has(
                              candidate.filePath
                            );
                            const isSubduedByFolderDrag =
                              dragState?.kind === "folder" &&
                              dragState.parentPath === candidate.parentPath;

                            return (
                              <tr
                                key={candidate.documentKey}
                                className={classNames(
                                  "exportConfirmationDialogRow",
                                  "exportConfirmationDialogCandidateRow",
                                  !candidate.included &&
                                    "exportConfirmationDialogRow-excluded",
                                  dropTarget?.kind === "file" &&
                                    dropTarget.filePath === candidate.filePath &&
                                    "exportConfirmationDialogDropTarget"
                                )}
                                data-export-candidate-file-path={
                                  candidate.filePath
                                }
                                data-export-dragging={
                                  dragState?.kind === "file" &&
                                  dragState.filePath === candidate.filePath
                                }
                                data-export-drop-target={
                                  dropTarget?.kind === "file" &&
                                  dropTarget.filePath === candidate.filePath
                                }
                                data-export-order-dirty={
                                  isFileOrderDirty ? "true" : "false"
                                }
                                data-export-folder-drag-subdued={
                                  isSubduedByFolderDrag ? "true" : "false"
                                }
                                onDragOver={(e) =>
                                  handleDragOverFile(e, candidate)
                                }
                                onDrop={(e) => handleDropFile(e, candidate)}
                              >
                                <td className="exportConfirmationDialogHandleCell">
                                  <span
                                    className="exportConfirmationDialogHandle"
                                    draggable={!isListLocked}
                                    data-export-file-drag-handle-file-path={
                                      candidate.filePath
                                    }
                                    title={translate(
                                      "export.confirmation.fileDragHandleLabel",
                                      { fileName: candidate.fileName }
                                    )}
                                    onDragStart={(e) =>
                                      handleFileDragStart(e, candidate)
                                    }
                                    onDragEnd={handleDragEnd}
                                  >
                                    <img
                                      src={gripperIconUrl}
                                      alt=""
                                      className="exportConfirmationDialogHandleIcon"
                                    />
                                  </span>
                                </td>
                                <td className="exportConfirmationDialogIncludeCell">
                                  <label
                                    className="exportConfirmationDialogIncludeSwitch"
                                    title={translate(
                                      "export.confirmation.includeToggleLabel",
                                      { fileName: candidate.fileName }
                                    )}
                                  >
                                    <input
                                      type="checkbox"
                                      className="exportConfirmationDialogIncludeInput"
                                      checked={candidate.included}
                                      disabled={isListLocked}
                                      data-export-include-toggle-file-path={
                                        candidate.filePath
                                      }
                                      onChange={() =>
                                        handleToggleRowIncluded(candidate.filePath)
                                      }
                                    />
                                    <span className="exportConfirmationDialogIncludeTrack">
                                      <span className="exportConfirmationDialogIncludeThumb" />
                                    </span>
                                  </label>
                                </td>
                                <td
                                  className="exportConfirmationDialogNameCell"
                                  title={candidate.fileName}
                                >
                                  <div className="exportConfirmationDialogDocumentName">
                                    <img
                                      src={
                                        candidate.kind === "markdown"
                                          ? markdownFileIconUrl
                                          : textFileIconUrl
                                      }
                                      alt=""
                                      className="exportConfirmationDialogKindIcon"
                                    />
                                    <span>{candidate.fileName}</span>
                                  </div>
                                </td>
                                <td
                                  className="exportConfirmationDialogPreviewCell"
                                  title={candidate.previewStartHover}
                                >
                                  <span className="exportConfirmationDialogPreviewStart">
                                    {candidate.previewStart}
                                  </span>
                                </td>
                                <td
                                  className="exportConfirmationDialogPreviewCell"
                                  title={candidate.previewEndHover}
                                >
                                  <span className="exportConfirmationDialogPreviewEnd">
                                    {candidate.previewEnd}
                                  </span>
                                </td>
                                <td className="exportConfirmationDialogCountCell exportConfirmationDialogCharacterCount">
                                  {translate(
                                    "export.confirmation.totalCharacterCount",
                                    {
                                      count: formatLocalizedNumber(
                                        candidate.characterCount,
                                        uiLanguage ?? defaultLanguage
                                      )
                                    }
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </InfoDialog>

      {isFontPickerOpen && (
        <FontPickerDialog
          isOpen={isFontPickerOpen}
          slot="preview.fontFamilyList"
          initialValue={pdfFontFamilyList}
          translate={translate}
          uiLanguage={uiLanguage}
          opener={pdfFontPickerOpenerRef.current}
          onSave={(selectedFonts) => {
            setPdfFontFamilyList(selectedFonts);
            setIsFontPickerOpen(false);
          }}
          onClose={() => setIsFontPickerOpen(false)}
        />
      )}

      {isExporting && isPdfCombinedExport && (
        <div
          className="exportPdfBlockingBackdrop"
          data-export-pdf-blocking-backdrop="true"
        >
          <div className="exportPdfLoaderCard">
            <img
              src={parchmentRollLoaderUrl}
              alt=""
              className="exportPdfLoaderImage"
            />
            <div className="exportPdfLoaderText">
              {translate("export.wizard.loaderPdf")}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
