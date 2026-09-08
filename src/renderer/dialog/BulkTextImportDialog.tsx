import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent
} from "react";
import type { Translate } from "../../shared/i18n";
import type {
  TextImportDryRunFile,
  TextImportDryRunFolder,
  TextImportDryRunResult
} from "../../shared/textImport";
import { InfoDialog } from "./InfoDialog";
import {
  TextImportDestinationPicker,
  type TextImportFolderListing
} from "./TextImportDestinationPicker";
import {
  addSourcePaths,
  bulkTextImportDestinationLabel,
  bulkTextImportInputsKey,
  bulkTextImportInputsReady,
  createInitialBulkTextImportDialogState,
  isStaleDryRunResponse,
  removeSourcePath,
  textImportBomKindKey,
  textImportEncodingNameKey,
  textImportSkipReasonKey,
  type BulkTextImportDialogState
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
}

export function BulkTextImportDialog({
  isOpen,
  translate,
  opener = null,
  onClose,
  listFolders,
  onDryRun,
  getDroppedFilePaths
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
    setState((current) => ({
      ...current,
      dryRunStatus: "loading",
      dryRunRequestId: requestId
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
          dryRunResult: result
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
            <BulkTextImportTargets state={state} translate={translate} />
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
  translate
}: {
  readonly state: BulkTextImportDialogState;
  readonly translate: Translate;
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

  const { files, folders } = state.dryRunResult;

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
          {translate("textImport.dialog.filesHeading", { count: files.length })}
        </h4>
        {files.length === 0 ? (
          <p className="bulkTextImportDialogEmptyTargets">
            {translate("textImport.dialog.emptyTargets")}
          </p>
        ) : (
          <ul className="bulkTextImportDialogFileList">
            {files.map((file) => (
              <BulkTextImportFileRow
                key={file.id}
                file={file}
                translate={translate}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function BulkTextImportFileRow({
  file,
  translate
}: {
  readonly file: TextImportDryRunFile;
  readonly translate: Translate;
}): JSX.Element {
  return (
    <li
      className={
        file.skipped
          ? "bulkTextImportDialogFileRow isSkipped"
          : "bulkTextImportDialogFileRow"
      }
      data-skipped={file.skipped ? "true" : "false"}
      data-renamed={file.renamed ? "true" : "false"}
    >
      <div className="bulkTextImportDialogFileRowHead">
        <span className="bulkTextImportDialogFileSource">
          {file.sourceDisplayPath}
        </span>
        <span className="bulkTextImportDialogFileEncoding">
          {translate(textImportEncodingNameKey(file.selectedEncoding))}
        </span>
        <span className="bulkTextImportDialogFileBom">
          {translate("textImport.dialog.bom")}:{" "}
          {translate(textImportBomKindKey(file.bomKind))}
        </span>
      </div>
      <div className="bulkTextImportDialogFileTarget">
        {file.targetProjectRelativePath}
      </div>
      {file.renamed ? (
        <p className="bulkTextImportDialogFileRenamed">
          {translate("textImport.dialog.renamed", {
            target: file.targetProjectRelativePath
          })}
        </p>
      ) : null}
      {file.skipped && file.skipReason ? (
        <p className="bulkTextImportDialogFileSkipped" role="note">
          {translate("textImport.dialog.skipped", {
            reason: translate(textImportSkipReasonKey(file.skipReason))
          })}
        </p>
      ) : (
        <>
          <p className="bulkTextImportDialogFilePreview">
            <span className="bulkTextImportDialogFilePreviewLabel">
              {translate("textImport.dialog.previewHead")}:
            </span>{" "}
            {file.previewHead}
          </p>
          <p className="bulkTextImportDialogFilePreview">
            <span className="bulkTextImportDialogFilePreviewLabel">
              {translate("textImport.dialog.previewTail")}:
            </span>{" "}
            {file.previewTail}
          </p>
        </>
      )}
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
