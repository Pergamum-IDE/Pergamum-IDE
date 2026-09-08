import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type DragEvent as ReactDragEvent
} from "react";
import type { Translate } from "../../shared/i18n";
import {
  TEXT_IMPORT_ENCODINGS,
  isTextImportEncoding,
  type PreviewTextImportFilesRequest,
  type PreviewTextImportFilesResult,
  type TextImportDryRunFolder,
  type TextImportDryRunResult,
  type TextImportEncoding
} from "../../shared/textImport";
import { InfoDialog } from "./InfoDialog";
import {
  TextImportDestinationPicker,
  type TextImportFolderListing
} from "./TextImportDestinationPicker";
import {
  addSourcePaths,
  applyPreviewFailure,
  applyPreviewSuccess,
  applySelectedEncoding,
  buildFileRowViewStates,
  bulkTextImportDestinationLabel,
  bulkTextImportInputsKey,
  bulkTextImportInputsReady,
  createInitialBulkTextImportDialogState,
  isStaleDryRunResponse,
  isTextImportEncodingEditable,
  isTextImportPreviewFailureReason,
  removeSourcePath,
  textImportBomKindKey,
  textImportEncodingNameKey,
  textImportPreviewFailureReasonKey,
  textImportSkipReasonKey,
  type BulkTextImportDialogState,
  type BulkTextImportFileRowViewState
} from "./bulkTextImportDialogState";

export interface BulkTextImportDryRunInput {
  readonly destinationFolderProjectRelativePath: string;
  readonly sourcePaths: readonly string[];
}

export interface BulkTextImportDialogProps {
  readonly isOpen: boolean;
  readonly translate: Translate;
  readonly opener?: Element | null;
  readonly onClose: () => void;
  /**
   * Lists project folders one level at a time (`null` = root). Wraps
   * `projects:listFileExplorerChildren`; the main process stays the
   * containment / protected-path boundary. Absent ⟹ no destination picker
   * (used only by the Step-2 skeleton render path).
   */
  readonly listFolders?: (
    directoryRelativePath: string | null
  ) => Promise<TextImportFolderListing>;
  /**
   * Runs the side-effect-free import dry-run for the current inputs. The
   * caller fills in `projectId`. Absent ⟹ dry-run is never attempted.
   */
  readonly onDryRun?: (
    input: BulkTextImportDryRunInput
  ) => Promise<TextImportDryRunResult>;
  /**
   * Resolves the absolute paths of `File`s from an external drop (Electron
   * `webUtils` in the preload). The renderer never reads the files. Absent
   * ⟹ dropped files are ignored.
   */
  readonly getDroppedFilePaths?: (
    files: readonly File[]
  ) => readonly string[];
  /**
   * #420 Step 4: batch preview for the per-file encoding dropdown. The App
   * wires this to the Step 1 batch-preview project IPC; the main process
   * reads the external file and decodes it with the chosen encoding. The
   * renderer never reads the file. Absent ⟹ the encoding dropdown is
   * read-only.
   */
  readonly onPreview?: (
    request: PreviewTextImportFilesRequest
  ) => Promise<PreviewTextImportFilesResult>;
}

export function BulkTextImportDialog({
  isOpen,
  translate,
  opener = null,
  onClose,
  listFolders,
  onDryRun,
  getDroppedFilePaths,
  onPreview
}: BulkTextImportDialogProps): JSX.Element | null {
  const [state, setState] = useState<BulkTextImportDialogState>(
    createInitialBulkTextImportDialogState
  );
  const [isDestinationPickerOpen, setIsDestinationPickerOpen] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const destinationPickerOpenerRef = useRef<Element | null>(null);
  const dragDepthRef = useRef(0);
  // Monotonic dry-run sequence number. Each run claims the next value; a
  // response whose value is not the latest is stale and dropped.
  const dryRunSeqRef = useRef(0);
  // Monotonic preview sequence number, shared across rows. Each encoding
  // change claims the next value; a preview response whose value no longer
  // matches its row's `previewRequestId` is stale and dropped. A fresh
  // dry-run rebuilds rows with `previewRequestId: undefined`, so any preview
  // response from before that rebuild can never match a new row.
  const previewSeqRef = useRef(0);
  // Mirror of the latest state for event handlers that need to read a row
  // without threading it through a functional updater.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Reset every time the dialog transitions closed → the next open starts clean
  // (no stale sourcePaths / dry-run result).
  useEffect(() => {
    if (!isOpen) {
      setState(createInitialBulkTextImportDialogState());
      setIsDestinationPickerOpen(false);
      setIsDragActive(false);
      dragDepthRef.current = 0;
    }
  }, [isOpen]);

  const inputsReady = bulkTextImportInputsReady(state);
  const inputsKey = useMemo(
    () =>
      bulkTextImportInputsKey({
        destinationFolderProjectRelativePath:
          state.destinationFolderProjectRelativePath,
        sourcePaths: state.sourcePaths
      }),
    [state.destinationFolderProjectRelativePath, state.sourcePaths]
  );

  // Re-run the dry-run whenever the destination or the source set changes.
  // A late response tagged with an older request id is dropped.
  useEffect(() => {
    if (!isOpen || !onDryRun || !inputsReady) {
      return;
    }

    let cancelled = false;
    const requestId = (dryRunSeqRef.current += 1);
    // Drop the previous editable rows now: a preview response still in flight
    // for one of them must not land on a row the incoming dry-run rebuilds.
    setState((current) => ({
      ...current,
      dryRunStatus: "loading",
      dryRunRequestId: requestId,
      fileRows: []
    }));

    void (async () => {
      const destination = state.destinationFolderProjectRelativePath ?? "";
      let result: TextImportDryRunResult;
      try {
        result = await onDryRun({
          destinationFolderProjectRelativePath: destination,
          sourcePaths: state.sourcePaths
        });
      } catch {
        result = { ok: false, reason: "unknown" };
      }
      if (cancelled) {
        return;
      }
      setState((current) => {
        if (isStaleDryRunResponse(current, requestId)) {
          return current;
        }
        return {
          ...current,
          dryRunStatus: result.ok ? "ready" : "failed",
          dryRunResult: result,
          fileRows: buildFileRowViewStates(result)
        };
      });
    })();

    return () => {
      cancelled = true;
    };
    // `inputsKey` captures the destination + sourcePaths; the reads inside are
    // from the same render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, onDryRun, inputsReady, inputsKey]);

  const addPaths = useCallback((paths: readonly string[]) => {
    if (paths.length === 0) {
      return;
    }
    setState((current) => {
      const nextSourcePaths = addSourcePaths(current.sourcePaths, paths);
      return nextSourcePaths === current.sourcePaths
        ? current
        : { ...current, sourcePaths: nextSourcePaths };
    });
  }, []);

  const handleDrop = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDragActive(false);
      if (!getDroppedFilePaths) {
        return;
      }
      const files = Array.from(event.dataTransfer?.files ?? []);
      addPaths(getDroppedFilePaths(files));
    },
    [addPaths, getDroppedFilePaths]
  );

  const handleDragOver = useCallback((event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
  }, []);
  const handleDragEnter = useCallback((event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragActive(true);
  }, []);
  const handleDragLeave = useCallback(() => {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragActive(false);
    }
  }, []);

  const openDestinationPicker = useCallback(() => {
    if (typeof document !== "undefined") {
      destinationPickerOpenerRef.current = document.activeElement;
    }
    setIsDestinationPickerOpen(true);
  }, []);

  // #420 Step 4: change one row's encoding and refresh only its preview.
  // This never re-runs the dry-run — the destination and source set are
  // unchanged, so target paths / skip planning do not move; only the decoded
  // preview + BOM for this one file can change.
  const handleEncodingChange = useCallback(
    (rowId: string, encoding: TextImportEncoding) => {
      if (!onPreview) {
        return;
      }
      const row = stateRef.current.fileRows.find((entry) => entry.id === rowId);
      if (
        !row ||
        !isTextImportEncodingEditable(row) ||
        row.selectedEncoding === encoding ||
        row.sourcePath.length === 0
      ) {
        return;
      }

      const requestId = (previewSeqRef.current += 1);
      const { sourcePath } = row;
      setState((current) => ({
        ...current,
        fileRows: applySelectedEncoding(
          current.fileRows,
          rowId,
          encoding,
          requestId
        )
      }));

      void (async () => {
        let result: PreviewTextImportFilesResult;
        try {
          result = await onPreview({
            files: [{ id: rowId, sourcePath, encoding }]
          });
        } catch {
          setState((current) => ({
            ...current,
            fileRows: applyPreviewFailure(
              current.fileRows,
              rowId,
              requestId,
              "updateFailed"
            )
          }));
          return;
        }

        setState((current) => {
          if (!result.ok) {
            return {
              ...current,
              fileRows: applyPreviewFailure(
                current.fileRows,
                rowId,
                requestId,
                "updateFailed"
              )
            };
          }
          const fileResult = result.files.find((entry) => entry.id === rowId);
          if (!fileResult) {
            return current;
          }
          if (fileResult.ok) {
            return {
              ...current,
              fileRows: applyPreviewSuccess(
                current.fileRows,
                rowId,
                requestId,
                fileResult
              )
            };
          }
          return {
            ...current,
            fileRows: applyPreviewFailure(
              current.fileRows,
              rowId,
              requestId,
              fileResult.reason
            )
          };
        });
      })();
    },
    [onPreview]
  );

  if (!isOpen) {
    return null;
  }

  const destinationChosen =
    state.destinationFolderProjectRelativePath !== null;
  const rootLabel = translate("textImport.dialog.destinationRoot");

  return (
    <>
      {/*
        No `dismissOnBackdropClick` (#420 Step 3): the dialog now carries
        transient state — the chosen destination, the source list and the
        dry-run result — so a stray click on the backdrop must not discard it.
        Cancel / the close button / Escape remain the ways to close.
      */}
      <InfoDialog
        title={translate("textImport.dialog.title")}
        opener={opener}
        className="bulkTextImportDialog"
        trapFocus={!isDestinationPickerOpen}
        onClose={onClose}
        footer={
          <div className="appDialogActions">
            <button
              type="button"
              className="appDialogButton appDialogButton-cancel bulkTextImportDialogCancelButton"
              autoFocus
              onClick={onClose}
            >
              {translate("textImport.dialog.cancel")}
            </button>
            <button
              type="button"
              className="appDialogButton appDialogButton-confirm bulkTextImportDialogImportButton"
              disabled
              title={translate("textImport.dialog.importPending")}
            >
              {translate("textImport.dialog.import")}
            </button>
          </div>
        }
      >
        <div className="bulkTextImportDialogContent">
          <p className="bulkTextImportDialogDescription">
            {translate("textImport.dialog.description")}
          </p>

          <section className="bulkTextImportDialogSection">
            <h3>{translate("textImport.dialog.destinationHeading")}</h3>
            <div className="bulkTextImportDialogDestinationRow">
              <span
                className="bulkTextImportDialogDestinationValue"
                data-testid="bulkTextImportDestinationValue"
              >
                {destinationChosen
                  ? bulkTextImportDestinationLabel(
                      state.destinationFolderProjectRelativePath ?? "",
                      rootLabel
                    )
                  : translate("textImport.dialog.destinationNotSelected")}
              </span>
              {listFolders ? (
                <button
                  type="button"
                  className="appDialogButton bulkTextImportDialogSelectDestinationButton"
                  onClick={openDestinationPicker}
                >
                  {translate(
                    destinationChosen
                      ? "textImport.dialog.changeDestination"
                      : "textImport.dialog.selectDestination"
                  )}
                </button>
              ) : null}
            </div>
          </section>

          <section className="bulkTextImportDialogSection">
            <h3>{translate("textImport.dialog.sourcesHeading")}</h3>
            {/*
              Step 3 has no OS file-picker button yet (Step 4), so this is a
              pure drop target — no `role="button"` / `tabIndex` / key handler
              it cannot honour. The renderer only reads the dropped `File`
              *paths* (`getDroppedFilePaths`), never the file contents.
            */}
            <div
              className={
                isDragActive
                  ? "bulkTextImportDialogDropArea isDragActive"
                  : "bulkTextImportDialogDropArea"
              }
              role="group"
              aria-label={translate("textImport.dialog.dropAreaReady")}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
            >
              <p className="bulkTextImportDialogDropAreaLabel">
                {translate(
                  isDragActive
                    ? "textImport.dialog.dropAreaActive"
                    : "textImport.dialog.dropAreaReady"
                )}
              </p>
              <p className="bulkTextImportDialogDropAreaHint">
                {translate("textImport.dialog.dropAreaHint")}
              </p>
            </div>

            {state.sourcePaths.length > 0 ? (
              <>
                <p
                  className="bulkTextImportDialogSourceCount"
                  data-testid="bulkTextImportSourceCount"
                >
                  {translate("textImport.dialog.sourceCount", {
                    count: state.sourcePaths.length
                  })}
                </p>
                <ul className="bulkTextImportDialogSourceList">
                  {state.sourcePaths.map((sourcePath) => (
                    <li
                      key={sourcePath}
                      className="bulkTextImportDialogSourceItem"
                    >
                      <span className="bulkTextImportDialogSourcePath">
                        {sourcePath}
                      </span>
                      <button
                        type="button"
                        className="appDialogButton bulkTextImportDialogRemoveSourceButton"
                        onClick={() =>
                          setState((current) => {
                            const next = removeSourcePath(
                              current.sourcePaths,
                              sourcePath
                            );
                            return next === current.sourcePaths
                              ? current
                              : { ...current, sourcePaths: next };
                          })
                        }
                      >
                        {translate("textImport.dialog.removeSource")}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>

          <section className="bulkTextImportDialogSection bulkTextImportDialogTargets">
            <h3>{translate("textImport.dialog.targetsHeading")}</h3>
            <BulkTextImportTargets
              state={state}
              translate={translate}
              onEncodingChange={onPreview ? handleEncodingChange : undefined}
            />
          </section>
        </div>
      </InfoDialog>

      {isDestinationPickerOpen && listFolders ? (
        <TextImportDestinationPicker
          translate={translate}
          opener={destinationPickerOpenerRef.current}
          listFolders={listFolders}
          onCancel={() => setIsDestinationPickerOpen(false)}
          onConfirm={(destinationFolderProjectRelativePath) => {
            setIsDestinationPickerOpen(false);
            setState((current) =>
              current.destinationFolderProjectRelativePath ===
              destinationFolderProjectRelativePath
                ? current
                : {
                    ...current,
                    destinationFolderProjectRelativePath:
                      destinationFolderProjectRelativePath
                  }
            );
          }}
        />
      ) : null}
    </>
  );
}

function BulkTextImportTargets({
  state,
  translate,
  onEncodingChange
}: {
  readonly state: BulkTextImportDialogState;
  readonly translate: Translate;
  readonly onEncodingChange?: (
    rowId: string,
    encoding: TextImportEncoding
  ) => void;
}): JSX.Element {
  if (!bulkTextImportInputsReady(state)) {
    return (
      <div className="bulkTextImportDialogEmptyTargets">
        <p>{translate("textImport.dialog.emptyTargets")}</p>
        <p className="bulkTextImportDialogEmptyTargetsHint">
          {translate("textImport.dialog.emptyTargetsHint")}
        </p>
      </div>
    );
  }

  if (state.dryRunStatus === "loading" || state.dryRunStatus === "idle") {
    return (
      <p className="bulkTextImportDialogLoading" role="status">
        {translate("textImport.dialog.checkingTargets")}
      </p>
    );
  }

  if (
    state.dryRunStatus === "failed" ||
    !state.dryRunResult ||
    state.dryRunResult.ok === false
  ) {
    const detail =
      state.dryRunResult && state.dryRunResult.ok === false
        ? state.dryRunResult.message ?? state.dryRunResult.reason
        : null;
    return (
      <div className="bulkTextImportDialogCheckFailed" role="alert">
        <p>{translate("textImport.dialog.checkFailed")}</p>
        {detail ? (
          <p className="bulkTextImportDialogCheckFailedDetail">{detail}</p>
        ) : null}
      </div>
    );
  }

  const folders = state.dryRunResult.folders;
  const rows = state.fileRows;

  return (
    <div className="bulkTextImportDialogResult">
      {folders.length > 0 ? (
        <div className="bulkTextImportDialogFolderGroup">
          <h4>
            {translate("textImport.dialog.foldersHeading", {
              count: folders.length
            })}
          </h4>
          <ul className="bulkTextImportDialogFolderList">
            {folders.map((folder) => (
              <BulkTextImportFolderRow
                key={folder.sourcePath}
                folder={folder}
                translate={translate}
              />
            ))}
          </ul>
        </div>
      ) : null}

      <div className="bulkTextImportDialogFileGroup">
        <h4>
          {translate("textImport.dialog.filesHeading", { count: rows.length })}
        </h4>
        {rows.length === 0 ? (
          <p className="bulkTextImportDialogEmptyTargets">
            {translate("textImport.dialog.emptyTargets")}
          </p>
        ) : (
          <ul className="bulkTextImportDialogFileList">
            {rows.map((row) => (
              <BulkTextImportFileRow
                key={row.id}
                row={row}
                translate={translate}
                onEncodingChange={onEncodingChange}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function BulkTextImportFileRow({
  row,
  translate,
  onEncodingChange
}: {
  readonly row: BulkTextImportFileRowViewState;
  readonly translate: Translate;
  readonly onEncodingChange?: (
    rowId: string,
    encoding: TextImportEncoding
  ) => void;
}): JSX.Element {
  const encodingEditable =
    onEncodingChange !== undefined && isTextImportEncodingEditable(row);
  // A `decodeFailed` dry-run row whose new encoding decoded fine is no longer
  // really "skipped" — show the working preview and a softened note.
  const effectivelySkipped =
    row.skipped && !(row.skipReason === "decodeFailed" && row.decodeRecovered);
  const showPreview = !effectivelySkipped;

  return (
    <li
      className={
        effectivelySkipped
          ? "bulkTextImportDialogFileRow isSkipped"
          : "bulkTextImportDialogFileRow"
      }
      data-skipped={effectivelySkipped ? "true" : "false"}
      data-renamed={row.renamed ? "true" : "false"}
      data-preview-status={row.previewStatus}
    >
      <div className="bulkTextImportDialogFileRowHead">
        <span className="bulkTextImportDialogFileSource">
          {row.sourceDisplayPath}
        </span>
        <label className="bulkTextImportDialogFileEncoding">
          <span className="bulkTextImportDialogFileEncodingLabel">
            {translate("textImport.dialog.encoding")}
          </span>
          <select
            className="bulkTextImportDialogFileEncodingSelect"
            value={row.selectedEncoding}
            disabled={!encodingEditable}
            aria-label={translate("textImport.dialog.encodingSelectAriaLabel", {
              name: row.sourceDisplayPath
            })}
            onChange={(event: ReactChangeEvent<HTMLSelectElement>) => {
              const next = event.target.value;
              if (onEncodingChange && isTextImportEncoding(next)) {
                onEncodingChange(row.id, next);
              }
            }}
          >
            {TEXT_IMPORT_ENCODINGS.map((encoding) => (
              <option key={encoding} value={encoding}>
                {translate(textImportEncodingNameKey(encoding))}
              </option>
            ))}
          </select>
        </label>
        <span className="bulkTextImportDialogFileBom">
          {translate("textImport.dialog.bom")}:{" "}
          {translate(textImportBomKindKey(row.bomKind))}
        </span>
      </div>
      <div className="bulkTextImportDialogFileTarget">
        {row.targetProjectRelativePath}
      </div>
      {row.renamed ? (
        <p className="bulkTextImportDialogFileRenamed">
          {translate("textImport.dialog.renamed", {
            target: row.targetProjectRelativePath
          })}
        </p>
      ) : null}

      {row.skipReason === "decodeFailed" ? (
        row.decodeRecovered ? (
          <p className="bulkTextImportDialogFileDecodeRecovered" role="note">
            {translate("textImport.dialog.encodingChangeRecoveredDecode")}
          </p>
        ) : row.previewStatus === "failed" ? (
          <p className="bulkTextImportDialogFileSkipped" role="note">
            {translate("textImport.dialog.encodingChangeDecodeStillFailed")}
          </p>
        ) : (
          <p className="bulkTextImportDialogFileSkipped" role="note">
            {translate("textImport.dialog.skipped", {
              reason: translate(textImportSkipReasonKey("decodeFailed"))
            })}
          </p>
        )
      ) : effectivelySkipped && row.skipReason ? (
        <p className="bulkTextImportDialogFileSkipped" role="note">
          {translate("textImport.dialog.skipped", {
            reason: translate(textImportSkipReasonKey(row.skipReason))
          })}
        </p>
      ) : null}

      {row.previewStatus === "loading" ? (
        <p className="bulkTextImportDialogFilePreviewUpdating" role="status">
          {translate("textImport.dialog.previewUpdating")}
        </p>
      ) : row.previewStatus === "failed" ? (
        <div className="bulkTextImportDialogFilePreviewFailed" role="note">
          <p>
            {translate(
              row.previewErrorReason === "updateFailed"
                ? "textImport.dialog.previewUpdateFailed"
                : "textImport.dialog.previewFailedWithEncoding"
            )}
          </p>
          {isTextImportPreviewFailureReason(row.previewErrorReason) ? (
            <p className="bulkTextImportDialogFilePreviewFailedReason">
              {translate("textImport.dialog.previewFailureReason", {
                reason: translate(
                  textImportPreviewFailureReasonKey(row.previewErrorReason)
                )
              })}
            </p>
          ) : null}
        </div>
      ) : showPreview ? (
        <>
          <p className="bulkTextImportDialogFilePreview">
            <span className="bulkTextImportDialogFilePreviewLabel">
              {translate("textImport.dialog.previewHead")}:
            </span>{" "}
            {row.previewHead}
          </p>
          <p className="bulkTextImportDialogFilePreview">
            <span className="bulkTextImportDialogFilePreviewLabel">
              {translate("textImport.dialog.previewTail")}:
            </span>{" "}
            {row.previewTail}
          </p>
        </>
      ) : null}
    </li>
  );
}

function BulkTextImportFolderRow({
  folder,
  translate
}: {
  readonly folder: TextImportDryRunFolder;
  readonly translate: Translate;
}): JSX.Element {
  return (
    <li
      className="bulkTextImportDialogFolderRow"
      data-has-skipped-descendant={
        folder.hasSkippedDescendant ? "true" : "false"
      }
    >
      <span className="bulkTextImportDialogFolderSource">
        {folder.sourcePath}
      </span>
      <span className="bulkTextImportDialogFolderTarget">
        {folder.targetProjectRelativePath}
      </span>
      {folder.hasSkippedDescendant ? (
        <span className="bulkTextImportDialogFolderSkipNote" role="note">
          {translate("textImport.dialog.folderHasSkipped")}
        </span>
      ) : null}
    </li>
  );
}
