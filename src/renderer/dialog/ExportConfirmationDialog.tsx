import {
  useEffect,
  useMemo,
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
import type { Translate } from "../../shared/i18n";
import type { ExportTxtUtf8Result } from "../../shared/api";
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
  reorderFileWithinGroup,
  reorderFolderGroup
} from "../exportDialogOrder";
import {
  DEFAULT_EXPORT_BODY_NOTATION,
  DEFAULT_EXPORT_DIALOG_OPTIONS_STATE,
  DEFAULT_INCLUDE_FILE_STRUCTURE_TOC,
  EXPORT_BODY_NOTATIONS,
  TXT_UTF8_EXPORT_FORMAT,
  createExportAssembly,
  txtExportDefaultFileName,
  type ExportBodyNotation,
  type ExportDialogOptionsState,
  type ExportFormat,
  type ExportTxtExecutionRequest
} from "../exportTxt";
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
  readonly onConfirmDiscardReload: () => Promise<boolean>;
  readonly onExportTxt: (
    request: ExportTxtExecutionRequest
  ) => Promise<ExportTxtUtf8Result>;
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

function cloneCandidates(
  candidates: readonly ExportCandidateListItem[]
): readonly ExportCandidateListItem[] {
  return candidates.map((candidate) => ({ ...candidate }));
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
  }
}

function parseHeadingRemovalLevel(value: string): HeadingRemovalLevel {
  const parsed = Number(value);
  return Number.isInteger(parsed) && isHeadingRemovalLevel(parsed) ? parsed : 0;
}

function exportFormatLabel(format: ExportFormat, translate: Translate): string {
  switch (format) {
    case "txtUtf8":
      return translate("export.confirmation.format.txtUtf8");
    case "html":
      return "HTML";
    case "pdf":
      return "PDF";
    case "docx":
      return "DOCX";
  }
}

function bodyNotationLabel(
  notation: ExportBodyNotation,
  translate: Translate
): string {
  switch (notation) {
    case "markdown":
      return translate("export.confirmation.bodyNotation.markdown");
    case "aozora":
      return translate("export.confirmation.bodyNotation.aozora");
    case "narou":
      return translate("export.confirmation.bodyNotation.narou");
    case "kakuyomu":
      return translate("export.confirmation.bodyNotation.kakuyomu");
  }
}

function parseExportBodyNotation(value: string): ExportBodyNotation {
  return EXPORT_BODY_NOTATIONS.includes(value as ExportBodyNotation)
    ? (value as ExportBodyNotation)
    : DEFAULT_EXPORT_BODY_NOTATION;
}

function dropTargetsEqual(
  first: ExportDialogDropTarget | null,
  second: ExportDialogDropTarget | null
): boolean {
  if (first === second) {
    return true;
  }

  if (first === null || second === null || first.kind !== second.kind) {
    return false;
  }

  if (first.kind === "folder") {
    return first.parentPath === second.parentPath;
  }

  if (second.kind !== "file") {
    return false;
  }

  return (
    first.parentPath === second.parentPath &&
    first.filePath === second.filePath
  );
}

export function ExportConfirmationDialog({
  origin,
  projectName,
  candidates,
  translate,
  opener,
  onReloadCandidates,
  onConfirmDiscardReload,
  onExportTxt,
  loadAozoraText,
  onExportUnavailable,
  onExportFailed,
  onClose
}: ExportConfirmationDialogProps): JSX.Element {
  const title = translate("export.confirmation.title");
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
      includeFileStructureToc: effectiveIncludeFileStructureToc
    }),
    [bodyNotation, effectiveIncludeFileStructureToc, exportFormat]
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

  useEffect(() => {
    const nextRows = recalculateExportCandidateMetadata(
      cloneCandidates(candidates),
      0
    );
    const nextOrderState = createOrderStateFromCandidates(nextRows);
    setRows(nextRows);
    setOrderState(nextOrderState);
    setInitialState(createInitialExportDialogState(nextRows, 0));
    setHeadingRemovalLevel(0);
    setExportFormat(TXT_UTF8_EXPORT_FORMAT);
    setBodyNotation(DEFAULT_EXPORT_BODY_NOTATION);
    setIncludeFileStructureToc(DEFAULT_INCLUDE_FILE_STRUCTURE_TOC);
    setCollapsedParentPaths(new Set());
    setDragState(null);
    setDropTarget(null);
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

  async function handleExport(): Promise<void> {
    if (isExporting) {
      return;
    }

    const includedRows = orderedRows.filter((candidate) => candidate.included);
    if (includedRows.length === 0) {
      onExportUnavailable();
      return;
    }

    if (exportFormat !== TXT_UTF8_EXPORT_FORMAT) {
      onExportFailed(new Error("Unsupported export format."));
      return;
    }

    setIsExporting(true);
    try {
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

      await onExportTxt({
        assembly,
        defaultFileName: txtExportDefaultFileName(origin, projectName)
      });
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
      dropTargetsEqual(current, next) ? current : next
    );
  }

  function handleDropTargetDragLeave(
    event: ReactDragEvent<HTMLTableRowElement>
  ): void {
    const relatedTarget = event.relatedTarget;
    if (
      relatedTarget instanceof Node &&
      event.currentTarget.contains(relatedTarget)
    ) {
      return;
    }

    updateDropTarget(null);
  }

  function handleFolderDragOver(
    event: ReactDragEvent<HTMLTableRowElement>,
    targetParentPath: string
  ): void {
    if (
      dragState?.kind === "folder" &&
      dragState.parentPath !== targetParentPath
    ) {
      event.preventDefault();
      updateDropTarget({ kind: "folder", parentPath: targetParentPath });
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    } else if (dragState?.kind === "folder") {
      updateDropTarget(null);
    }
  }

  function handleFolderDrop(
    event: ReactDragEvent<HTMLTableRowElement>,
    targetParentPath: string
  ): void {
    if (dragState?.kind !== "folder") {
      return;
    }

    event.preventDefault();
    setOrderState((current) =>
      reorderFolderGroup(current, dragState.parentPath, targetParentPath)
    );
    setDragState(null);
    setDropTarget(null);
  }

  function handleFileDragOver(
    event: ReactDragEvent<HTMLTableRowElement>,
    targetCandidate: ExportCandidateListItem
  ): void {
    if (
      dragState?.kind === "file" &&
      dragState.parentPath === targetCandidate.parentPath &&
      dragState.filePath !== targetCandidate.filePath
    ) {
      event.preventDefault();
      updateDropTarget({
        kind: "file",
        parentPath: targetCandidate.parentPath,
        filePath: targetCandidate.filePath
      });
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    } else if (dragState?.kind === "file") {
      updateDropTarget(null);
    }
  }

  function handleFileDrop(
    event: ReactDragEvent<HTMLTableRowElement>,
    targetCandidate: ExportCandidateListItem
  ): void {
    if (dragState?.kind !== "file") {
      return;
    }

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
    setDragState(null);
    setDropTarget(null);
  }

  async function handleReload(): Promise<void> {
    if (isReloading) {
      return;
    }

    if (isDirty && !(await onConfirmDiscardReload())) {
      return;
    }

    setIsReloading(true);
    try {
      const reloadedCandidates = await onReloadCandidates();
      if (reloadedCandidates === null) {
        return;
      }

      const nextHeadingRemovalLevel = isDirty ? 0 : headingRemovalLevel;
      const nextOptionsState = isDirty
        ? DEFAULT_EXPORT_DIALOG_OPTIONS_STATE
        : optionsState;
      const nextRows = recalculateExportCandidateMetadata(
        isDirty
          ? reloadedCandidates
          : mergeExportCandidateIncludedStates(reloadedCandidates, rows),
        nextHeadingRemovalLevel
      );
      const nextOrderState = createOrderStateFromCandidates(nextRows);
      setRows(nextRows);
      setOrderState(nextOrderState);
      setInitialState(
        createInitialExportDialogState(
          nextRows,
          nextHeadingRemovalLevel,
          nextOptionsState
        )
      );
      setHeadingRemovalLevel(nextHeadingRemovalLevel);
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

  return (
    <InfoDialog
      title={title}
      className="exportConfirmationDialog"
      opener={opener}
      titleAccessory={
        isDirty ? (
          <span
            className="exportConfirmationDialogDirtyIcon"
            role="img"
            aria-label={translate("export.confirmation.modified")}
            title={translate("export.confirmation.modified")}
          >
            <img src={editIconUrl} alt="" aria-hidden="true" />
          </span>
        ) : null
      }
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
              disabled={isExporting}
              aria-disabled={isExporting}
              onClick={() => {
                void handleExport();
              }}
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
      <div className="exportConfirmationDialogControls">
        <label className="exportConfirmationDialogControl">
          <span className="exportConfirmationDialogControlLabel">
            {translate("export.confirmation.format.label")}
          </span>
          <select
            className="exportConfirmationDialogSelect"
            value={exportFormat}
            data-export-format-select="true"
            onChange={(event) =>
              setExportFormat(event.currentTarget.value as ExportFormat)
            }
          >
            <option value={TXT_UTF8_EXPORT_FORMAT}>
              {exportFormatLabel(TXT_UTF8_EXPORT_FORMAT, translate)}
            </option>
          </select>
        </label>
        {isTxtUtf8Export ? (
          <span className="exportConfirmationDialogControlNote">
            {translate("export.confirmation.txtUtf8.note")}
          </span>
        ) : null}
        <label className="exportConfirmationDialogControl">
          <span className="exportConfirmationDialogControlLabel">
            {translate("export.confirmation.bodyNotation.prefix")}
          </span>
          <select
            className="exportConfirmationDialogSelect"
            value={bodyNotation}
            data-export-body-notation-select="true"
            onChange={(event) =>
              handleBodyNotationChange(event.currentTarget.value)
            }
          >
            {EXPORT_BODY_NOTATIONS.map((notation) => (
              <option key={notation} value={notation}>
                {bodyNotationLabel(notation, translate)}
              </option>
            ))}
          </select>
          <span className="exportConfirmationDialogControlLabel">
            {translate("export.confirmation.bodyNotation.suffix")}
          </span>
        </label>
        <label className="exportConfirmationDialogControl">
          <span className="exportConfirmationDialogControlLabel">
            {translate("export.confirmation.headingRemoval.label")}
          </span>
          <select
            className="exportConfirmationDialogSelect"
            value={headingRemovalLevel}
            data-export-heading-removal-select="true"
            onChange={(event) =>
              handleHeadingRemovalLevelChange(event.currentTarget.value)
            }
          >
            {HEADING_REMOVAL_LEVELS.map((level) => (
              <option key={level} value={level}>
                {headingRemovalOptionLabel(level, translate)}
              </option>
            ))}
          </select>
        </label>
        <span className="exportConfirmationDialogControlNote">
          {translate("export.confirmation.headingRemoval.note")}
        </span>
        <label
          className="exportConfirmationDialogControl exportConfirmationDialogTocControl"
          title={fileStructureTocTooltip}
        >
          <span className="exportConfirmationDialogControlLabel">
            {translate("export.confirmation.fileStructureToc.label")}
          </span>
          <span className="exportConfirmationDialogIncludeSwitch">
            <input
              className="exportConfirmationDialogIncludeInput"
              type="checkbox"
              role="switch"
              aria-label={translate(
                "export.confirmation.fileStructureToc.label"
              )}
              data-export-file-structure-toc-toggle="true"
              checked={effectiveIncludeFileStructureToc}
              disabled={isTxtUtf8Export}
              onChange={(event) =>
                setIncludeFileStructureToc(event.currentTarget.checked)
              }
            />
            <span
              className="exportConfirmationDialogIncludeTrack"
              aria-hidden="true"
            >
              <span className="exportConfirmationDialogIncludeThumb" />
            </span>
          </span>
        </label>
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
                const isGroupOrderDirty = orderDirtyGroups.has(
                  group.parentPath
                );
                const isGroupDragging =
                  dragState?.kind === "folder" &&
                  dragState.parentPath === group.parentPath;
                const isGroupDropTarget =
                  dropTarget?.kind === "folder" &&
                  dropTarget.parentPath === group.parentPath;
                const folderRows = [
                  <tr
                    key={`folder:${group.parentPath}`}
                    className={classNames(
                      "exportConfirmationDialogFolderRow",
                      isGroupOrderDirty &&
                        "exportConfirmationDialogOrderDirty",
                      isGroupDragging && "exportConfirmationDialogDragging",
                      isGroupDropTarget && "exportConfirmationDialogDropTarget"
                    )}
                    data-export-folder-parent-path={group.parentPath}
                    data-export-folder-include-state={group.includeState}
                    data-export-dragging={isGroupDragging ? "true" : "false"}
                    data-export-drop-target={
                      isGroupDropTarget ? "true" : "false"
                    }
                    data-export-order-dirty={
                      isGroupOrderDirty ? "true" : "false"
                    }
                    onDragOver={(event) =>
                      handleFolderDragOver(event, group.parentPath)
                    }
                    onDrop={(event) => handleFolderDrop(event, group.parentPath)}
                    onDragLeave={handleDropTargetDragLeave}
                  >
                    <td className="exportConfirmationDialogHandle">
                      <span
                        className="exportConfirmationDialogDragHandle"
                        draggable={true}
                        aria-label={translate(
                          "export.confirmation.folderDragHandleLabel",
                          { folder: group.label }
                        )}
                        title={translate(
                          "export.confirmation.folderDragHandleLabel",
                          { folder: group.label }
                        )}
                        data-export-folder-drag-handle-parent-path={
                          group.parentPath
                        }
                        onDragStart={(event) =>
                          handleFolderDragStart(event, group.parentPath)
                        }
                        onDragEnd={handleDragEnd}
                      >
                        <img
                          className="exportConfirmationDialogHandleIcon"
                          src={gripperIconUrl}
                          alt=""
                          aria-hidden="true"
                        />
                      </span>
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
                  group.items.map((candidate) => {
                    const isFileOrderDirty = orderDirtyFiles.has(
                      candidate.filePath
                    );
                    const isFileDragging =
                      dragState?.kind === "file" &&
                      dragState.filePath === candidate.filePath;
                    const isFileDropTarget =
                      dropTarget?.kind === "file" &&
                      dropTarget.filePath === candidate.filePath;
                    const isDraggedFolderChild =
                      dragState?.kind === "folder" &&
                      dragState.parentPath === candidate.parentPath;
                    return (
                      <tr
                        key={candidate.documentKey}
                        className={classNames(
                          "exportConfirmationDialogRow",
                          isFileOrderDirty &&
                            "exportConfirmationDialogOrderDirty",
                          isFileDragging && "exportConfirmationDialogDragging",
                          isFileDropTarget &&
                            "exportConfirmationDialogDropTarget",
                          isDraggedFolderChild &&
                            "exportConfirmationDialogFolderDragSubdued"
                        )}
                        data-export-candidate-file-path={candidate.filePath}
                        data-export-candidate-included={
                          candidate.included ? "true" : "false"
                        }
                        data-export-dragging={isFileDragging ? "true" : "false"}
                        data-export-drop-target={
                          isFileDropTarget ? "true" : "false"
                        }
                        data-export-folder-drag-subdued={
                          isDraggedFolderChild ? "true" : "false"
                        }
                        data-export-order-dirty={
                          isFileOrderDirty ? "true" : "false"
                        }
                        onDragOver={(event) =>
                          handleFileDragOver(event, candidate)
                        }
                        onDrop={(event) => handleFileDrop(event, candidate)}
                        onDragLeave={handleDropTargetDragLeave}
                      >
                        <td className="exportConfirmationDialogHandle">
                          <span
                            className="exportConfirmationDialogDragHandle"
                            draggable={true}
                            aria-label={translate(
                              "export.confirmation.fileDragHandleLabel",
                              { fileName: candidate.fileName }
                            )}
                            title={translate(
                              "export.confirmation.fileDragHandleLabel",
                              { fileName: candidate.fileName }
                            )}
                            data-export-file-drag-handle-file-path={
                              candidate.filePath
                            }
                            onDragStart={(event) =>
                              handleFileDragStart(event, candidate)
                            }
                            onDragEnd={handleDragEnd}
                          >
                            <img
                              className="exportConfirmationDialogHandleIcon"
                              src={gripperIconUrl}
                              alt=""
                              aria-hidden="true"
                            />
                          </span>
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
                    );
                  })
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </InfoDialog>
  );
}
