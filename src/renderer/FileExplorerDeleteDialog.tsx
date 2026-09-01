import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from "react";
import hourglassIconUrl from "../../assets/icons/ionicons/dialog/hourglass-outline.svg?url";
import trashBinIconUrl from "../../assets/icons/ionicons/dialog/trash-bin-outline.svg?url";
import type { Translate } from "../shared/i18n";
import {
  fileExplorerDeleteExecutionFailureReasonKey,
  orderFileExplorerDeleteTargets,
  type FileExplorerDeleteEntryResult,
  type FileExplorerDeleteItemKind,
  type FileExplorerDeleteTarget
} from "../shared/fileExplorerDelete";
import { InfoDialog } from "./dialog/InfoDialog";
import { dialogIconSvgByKind } from "./dialog/dialogIcons";
import {
  abortPendingFileExplorerDeleteRows,
  initFileExplorerDeleteRows,
  isFileExplorerDeleteRowResolved,
  resetFileExplorerDeleteRowsForRerun,
  setFileExplorerDeleteRowStatus,
  summarizeFileExplorerDeleteRun,
  type FileExplorerDeleteRowState
} from "./fileExplorerDeleteState";

/**
 * #351: an explicit direct deletion (never the OS trash) can't be confirmed
 * the instant the dialog opens. The delete button "arms" only after this
 * delay, showing an hourglass while disabled and a trash-bin once enabled
 * (ADR-0011 DEL-9). Same 5-second friction the Recovery discard button uses.
 *
 * The delay applies to the FIRST confirmation only. Once the user has been
 * through it, a retry of the leftover (failed / aborted) rows runs on the
 * next click without re-arming.
 */
export const FILE_EXPLORER_DELETE_ARM_DELAY_MS = 5000;

/**
 * `confirm` — first run, delete button arms after the delay.
 * `running` — a run is in progress; the dialog cannot be dismissed.
 * `done`    — a run settled. If retryable rows remain, the delete button is
 *             re-enabled and re-runs ONLY those rows.
 */
type DeletePhase = "confirm" | "running" | "done";

export interface FileExplorerDeleteDialogProps {
  readonly targets: readonly FileExplorerDeleteTarget[];
  readonly fileCount: number;
  readonly folderCount: number;
  readonly translate: Translate;
  readonly opener: Element | null;
  /** One already-validated entry. The dialog drives the ordered loop. */
  readonly deleteEntry: (
    relativePath: string,
    kind: FileExplorerDeleteItemKind
  ) => Promise<FileExplorerDeleteEntryResult>;
  /**
   * Fired once per settled run, with the paths that became resolved (deleted
   * or already-absent) IN THAT RUN. The parent closes any open editors for
   * them and refreshes the tree. A retry run fires it again with only the
   * newly resolved paths.
   */
  readonly onRunSettled: (resolvedRelativePaths: readonly string[]) => void;
  /** Dismiss the dialog: Cancel in the confirm phase (nothing happened) or
   *  Close after a run's results are shown. Never available while running. */
  readonly onDismiss: () => void;
}

function rowStatusText(
  row: FileExplorerDeleteRowState,
  translate: Translate
): string {
  switch (row.status) {
    case "pending":
      return translate("explorer.delete.state.pending");
    case "deleting":
      return translate("explorer.delete.state.deleting");
    case "deleted":
      return translate("explorer.delete.state.deleted");
    case "already-absent":
      return translate("explorer.delete.state.alreadyAbsent");
    case "aborted":
      return translate("explorer.delete.state.aborted");
    case "failed":
      return translate("explorer.delete.state.failed", {
        reason: translate(
          fileExplorerDeleteExecutionFailureReasonKey(
            row.failureReason ?? "delete-failed"
          )
        )
      });
  }
}

function previewCell(
  value: string | null,
  isFolder: boolean,
  unavailable: boolean,
  translate: Translate
): string {
  if (isFolder) {
    return translate("explorer.delete.preview.folder");
  }
  if (unavailable) {
    return translate("explorer.delete.preview.unavailable");
  }
  if (value === null || value === "") {
    return translate("explorer.delete.preview.empty");
  }
  return value;
}

function modifiedCell(iso: string | null): string {
  if (iso === null) {
    return "";
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export function FileExplorerDeleteDialog({
  targets,
  fileCount,
  folderCount,
  translate,
  opener,
  deleteEntry,
  onRunSettled,
  onDismiss
}: FileExplorerDeleteDialogProps): JSX.Element {
  const [phase, setPhase] = useState<DeletePhase>("confirm");
  const [armed, setArmed] = useState(false);
  // Row state PERSISTS across runs: a retry only re-touches the not-yet
  // resolved rows, never the already-deleted ones.
  const [rows, setRows] = useState<readonly FileExplorerDeleteRowState[]>(() =>
    initFileExplorerDeleteRows(targets)
  );
  const abortRequestedRef = useRef(false);
  const runInProgressRef = useRef(false);
  const abortButtonRef = useRef<HTMLButtonElement | null>(null);
  const dismissButtonRef = useRef<HTMLButtonElement | null>(null);

  const executionOrder = useMemo(
    () => orderFileExplorerDeleteTargets(targets),
    [targets]
  );
  const targetByPath = useMemo(() => {
    const map = new Map<string, FileExplorerDeleteTarget>();
    for (const target of targets) {
      map.set(target.relativePath, target);
    }
    return map;
  }, [targets]);

  const summary = summarizeFileExplorerDeleteRun(rows);

  // #351 / ADR-0011 DEL-9: arm the delete button after the delay. Only the
  // FIRST confirmation waits; a retry does not re-arm.
  useEffect(() => {
    if (phase !== "confirm") {
      return;
    }
    setArmed(false);
    const timer = setTimeout(
      () => setArmed(true),
      FILE_EXPLORER_DELETE_ARM_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [phase]);

  // Focus never lands on the destructive button on its own: Cancel keeps
  // focus through the whole confirm phase (including after the 5s arm), the
  // Abort button takes focus while running, the Close button once done.
  useEffect(() => {
    if (phase === "running") {
      abortButtonRef.current?.focus();
    } else if (phase === "done") {
      dismissButtonRef.current?.focus();
    }
  }, [phase]);

  const runDeletion = useCallback(async () => {
    if (runInProgressRef.current || phase === "running") {
      return;
    }
    // First run needs the arm; a retry (done phase) does not. Never run when
    // there is nothing left to retry.
    if (phase === "confirm" && !armed) {
      return;
    }
    if (phase === "done" && summary.retryable === 0) {
      return;
    }

    runInProgressRef.current = true;
    abortRequestedRef.current = false;
    setPhase("running");

    try {
      let current = resetFileExplorerDeleteRowsForRerun(rows);
      setRows(current);

      const resolvedThisRun: string[] = [];

      for (const target of executionOrder) {
        const row = current.find(
          (candidate) => candidate.relativePath === target.relativePath
        );
        // Skip rows already resolved by an earlier run — never delete twice.
        if (!row || isFileExplorerDeleteRowResolved(row)) {
          continue;
        }

        if (abortRequestedRef.current) {
          current = abortPendingFileExplorerDeleteRows(current);
          setRows(current);
          break;
        }

        current = setFileExplorerDeleteRowStatus(
          current,
          target.relativePath,
          "deleting"
        );
        setRows(current);

        let result: FileExplorerDeleteEntryResult;
        try {
          result = await deleteEntry(target.relativePath, target.kind);
        } catch {
          result = { ok: false, reason: "delete-failed" };
        }

        if (result.ok) {
          current = setFileExplorerDeleteRowStatus(
            current,
            target.relativePath,
            result.alreadyAbsent ? "already-absent" : "deleted"
          );
          resolvedThisRun.push(target.relativePath);
        } else {
          current = setFileExplorerDeleteRowStatus(
            current,
            target.relativePath,
            "failed",
            result.reason
          );
        }
        setRows(current);

        // A requested abort stops the loop AFTER the in-flight item finishes.
        if (abortRequestedRef.current) {
          current = abortPendingFileExplorerDeleteRows(current);
          setRows(current);
          break;
        }
      }

      setPhase("done");
      onRunSettled(resolvedThisRun);
    } finally {
      runInProgressRef.current = false;
    }
  }, [
    armed,
    deleteEntry,
    executionOrder,
    onRunSettled,
    phase,
    rows,
    summary.retryable
  ]);

  const hasFolders = folderCount > 0;
  const introText = translate("explorer.delete.dialog.intro", {
    count: fileCount + folderCount
  });

  const handleDialogClose = useCallback(() => {
    // While the deletion is running the dialog cannot be dismissed (no
    // "close and let it run in the background" — ADR-0011 DEL-15).
    if (phase === "running") {
      return;
    }
    onDismiss();
  }, [onDismiss, phase]);

  // hourglass while the first confirmation is still waiting; trash-bin once
  // armed and for every later (retry) run.
  const showHourglass = phase === "confirm" && !armed;
  const armButtonIconStyle: CSSProperties & {
    "--file-explorer-delete-button-icon": string;
  } = {
    "--file-explorer-delete-button-icon": `url("${
      showHourglass ? hourglassIconUrl : trashBinIconUrl
    }")`
  };

  const deleteButtonDisabled =
    phase === "confirm" ? !armed : summary.retryable === 0;
  const dismissLabel =
    phase === "confirm"
      ? translate("explorer.delete.dialog.cancel")
      : translate("explorer.delete.dialog.close");

  return (
    <InfoDialog
      title={translate("explorer.delete.dialog.title")}
      opener={opener}
      onClose={handleDialogClose}
      className="appDialog-destructive fileExplorerDeleteDialog"
      role="alertdialog"
      headerIcon={
        <span
          className="appDialogIcon appDialogIcon-warning fileExplorerDeleteDialogHeaderIcon"
          role="img"
          aria-label={translate("dialog.icon.warning")}
          dangerouslySetInnerHTML={{ __html: dialogIconSvgByKind.warning }}
        />
      }
      footer={
        <div className="appDialogActions fileExplorerDeleteDialogActions">
          {/* Destructive action on the LEFT, the escape hatch on the RIGHT. */}
          {phase === "running" ? (
            <button
              ref={abortButtonRef}
              type="button"
              className="appDialogButton appDialogButton-choice-destructive fileExplorerDeleteAbortButton"
              onClick={() => {
                abortRequestedRef.current = true;
              }}
            >
              {translate("explorer.delete.dialog.abort")}
            </button>
          ) : (
            <button
              type="button"
              className="appDialogButton appDialogButton-choice-destructive fileExplorerDeleteConfirmButton"
              disabled={deleteButtonDisabled}
              aria-disabled={deleteButtonDisabled}
              onClick={() => {
                void runDeletion();
              }}
            >
              <span
                className="fileExplorerDeleteConfirmButtonIcon"
                style={armButtonIconStyle}
                aria-hidden="true"
              />
              <span>{translate("explorer.delete.dialog.confirm")}</span>
            </button>
          )}
          <button
            ref={dismissButtonRef}
            type="button"
            className="appDialogButton"
            disabled={phase === "running"}
            aria-disabled={phase === "running"}
            autoFocus={phase === "confirm"}
            onClick={onDismiss}
          >
            {dismissLabel}
          </button>
        </div>
      }
    >
      <div className="fileExplorerDeleteDialogBody">
        <p className="fileExplorerDeleteDialogIntro">{introText}</p>
        <p className="fileExplorerDeleteDialogWarning">
          {translate("explorer.delete.dialog.warning")}
        </p>
        {hasFolders ? (
          <p className="fileExplorerDeleteDialogFolderNote">
            {translate("explorer.delete.dialog.folderNote")}
          </p>
        ) : null}
        {phase === "confirm" ? (
          <p className="fileExplorerDeleteDialogQuestion">
            {translate("explorer.delete.dialog.question")}
          </p>
        ) : null}
        {/* #351: the 5s wait state is shown ONLY by the button (disabled +
            hourglass -> trash), never by a helper sentence. The status line
            below is the run progress / result, and stays out of the confirm
            phase. */}
        {phase !== "confirm" ? (
          <p
            className="fileExplorerDeleteDialogRunStatus"
            role="status"
            aria-live="polite"
          >
            {phase === "running"
              ? translate("explorer.delete.state.deleting")
              : summary.allResolved
                ? translate("explorer.delete.status.completed", {
                    deleted: summary.resolved
                  })
                : summary.failed > 0
                  ? translate("explorer.delete.status.someFailed", {
                      deleted: summary.resolved,
                      failed: summary.failed
                    })
                  : translate("explorer.delete.status.aborted", {
                      deleted: summary.resolved
                    })}
          </p>
        ) : null}
        <div className="fileExplorerDeleteDialogTableWrap">
          <table
            className="fileExplorerDeleteDialogTable"
            role="grid"
            aria-label={translate("explorer.delete.dialog.tableLabel")}
          >
            <thead>
              <tr>
                <th scope="col">
                  {translate("explorer.delete.column.status")}
                </th>
                <th scope="col">{translate("explorer.delete.column.path")}</th>
                <th scope="col">{translate("explorer.delete.column.name")}</th>
                <th scope="col">
                  {translate("explorer.delete.column.modified")}
                </th>
                <th scope="col">
                  {translate("explorer.delete.column.previewHead")}
                </th>
                <th scope="col">
                  {translate("explorer.delete.column.previewTail")}
                </th>
                <th scope="col">
                  {translate("explorer.delete.column.bytes")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const target = targetByPath.get(row.relativePath);
                const isFolder = target?.kind === "folder";
                return (
                  <tr key={row.relativePath} data-delete-status={row.status}>
                    <td>{rowStatusText(row, translate)}</td>
                    <td className="fileExplorerDeleteDialogPathCell">
                      {target?.parentRelativePath === ""
                        ? translate("explorer.delete.pathProjectRoot")
                        : (target?.parentRelativePath ?? "")}
                    </td>
                    <td>{target?.name ?? row.relativePath}</td>
                    <td>{modifiedCell(target?.lastModifiedIso ?? null)}</td>
                    <td>
                      {previewCell(
                        target?.previewHead ?? null,
                        isFolder,
                        target?.previewUnavailable ?? false,
                        translate
                      )}
                    </td>
                    <td>
                      {previewCell(
                        target?.previewTail ?? null,
                        isFolder,
                        target?.previewUnavailable ?? false,
                        translate
                      )}
                    </td>
                    <td className="fileExplorerDeleteDialogBytesCell">
                      {isFolder
                        ? translate("explorer.delete.value.folderBytes")
                        : (target?.sizeBytes ?? 0).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </InfoDialog>
  );
}
