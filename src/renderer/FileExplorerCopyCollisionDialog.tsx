import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Translate } from "../shared/i18n";
import type {
  CopyEntriesExecutionResult,
  CopyEntryExecutionResult,
  FileExplorerCopyPlan,
  FileExplorerCopyPlanRow
} from "../shared/projectCopy";
import { fileOperationFailureReasonTextKey } from "./fileOperationFailure";
import { InfoDialog } from "./dialog/InfoDialog";

/**
 * #356: shown after a copy PLAN when at least one row's first-choice ` copy`
 * name collided and had to advance along the ladder. It is a rename-copy
 * confirmation, NOT an overwrite dialog — nothing is ever overwritten.
 *
 *   - `confirm` — the plan is shown; `Copy` / `Cancel`, Cancel focused.
 *   - `running` — both buttons disabled, the batch is executing.
 *   - `done`    — `Copy` stays disabled; `Cancel` becomes `Close`.
 *
 * There is no arming delay and no abort during execution (v1).
 */
type CopyCollisionDialogPhase = "confirm" | "running" | "done";

export interface FileExplorerCopyCollisionDialogProps {
  readonly plan: FileExplorerCopyPlan;
  readonly translate: Translate;
  readonly opener: Element | null;
  /** Runs the execute IPC + the renderer-side refresh; resolves with the
   *  batch result (or `null` when the IPC was unavailable). */
  readonly executePlan: () => Promise<CopyEntriesExecutionResult | null>;
  readonly onDismiss: () => void;
}

function sizeCell(bytes: number | null): string {
  return bytes === null ? "—" : bytes.toLocaleString();
}

function dateCell(iso: string | null): string {
  if (iso === null) {
    return "—";
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function plannedActionKey(
  row: FileExplorerCopyPlanRow
): "explorer.copy.collision.action.copy"
  | "explorer.copy.collision.action.autoRename"
  | "explorer.copy.collision.action.cannotCopy" {
  if (row.status === "blocked") {
    return "explorer.copy.collision.action.cannotCopy";
  }
  if (row.status === "will-auto-rename") {
    return "explorer.copy.collision.action.autoRename";
  }
  return "explorer.copy.collision.action.copy";
}

export function FileExplorerCopyCollisionDialog({
  plan,
  translate,
  opener,
  executePlan,
  onDismiss
}: FileExplorerCopyCollisionDialogProps): JSX.Element {
  const [phase, setPhase] = useState<CopyCollisionDialogPhase>("confirm");
  const [resultByPath, setResultByPath] = useState<
    ReadonlyMap<string, CopyEntryExecutionResult>
  >(() => new Map());
  const runningRef = useRef(false);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (phase === "confirm") {
      cancelButtonRef.current?.focus();
    } else if (phase === "done") {
      closeButtonRef.current?.focus();
    }
  }, [phase]);

  const runnableRows = useMemo(
    () => plan.rows.filter((row) => row.status !== "blocked"),
    [plan.rows]
  );

  const runCopy = useCallback(async () => {
    if (runningRef.current || phase !== "confirm") {
      return;
    }
    runningRef.current = true;
    setPhase("running");
    try {
      const result = await executePlan();
      if (result) {
        const map = new Map<string, CopyEntryExecutionResult>();
        for (const entry of result.results) {
          map.set(entry.sourceRelativePath, entry);
        }
        setResultByPath(map);
      }
    } finally {
      runningRef.current = false;
      setPhase("done");
    }
  }, [executePlan, phase]);

  const handleClose = useCallback(() => {
    if (phase === "running") {
      return;
    }
    onDismiss();
  }, [onDismiss, phase]);

  const runStatusText = (): string => {
    if (phase === "running") {
      return translate("explorer.copy.status.running");
    }
    const copied = [...resultByPath.values()].filter(
      (r) => r.status === "copied"
    ).length;
    const failed = [...resultByPath.values()].filter(
      (r) => r.status === "failed"
    ).length;
    if (failed === 0) {
      return translate("explorer.copy.status.succeeded", {
        count: copied,
        destination:
          plan.destinationFolderRelativePath === ""
            ? translate("explorer.copy.collision.destinationProjectRoot")
            : plan.destinationFolderRelativePath
      });
    }
    if (copied === 0) {
      return translate("explorer.copy.status.allFailed", { failed });
    }
    return translate("explorer.copy.status.partiallyFailed", {
      copied,
      failed
    });
  };

  const rowStatusCell = (row: FileExplorerCopyPlanRow): string => {
    if (phase === "confirm") {
      return translate("explorer.copy.state.pending");
    }
    if (phase === "running") {
      return translate("explorer.copy.state.running");
    }
    const result = resultByPath.get(row.sourceRelativePath);
    if (!result) {
      return translate("explorer.copy.state.pending");
    }
    return result.status === "copied"
      ? translate("explorer.copy.state.copied")
      : translate("explorer.copy.state.failed");
  };

  const rowActionCell = (row: FileExplorerCopyPlanRow): string => {
    const result = phase === "done"
      ? resultByPath.get(row.sourceRelativePath)
      : undefined;
    if (result && result.status === "failed") {
      return translate(fileOperationFailureReasonTextKey(result.reason));
    }
    return translate(plannedActionKey(row));
  };

  const destinationLabel =
    plan.destinationFolderRelativePath === ""
      ? translate("explorer.copy.collision.destinationProjectRoot")
      : plan.destinationFolderRelativePath;

  return (
    <InfoDialog
      title={translate("explorer.copy.collision.title")}
      opener={opener}
      onClose={handleClose}
      className="fileExplorerCopyCollisionDialog"
      footer={
        <div className="appDialogActions fileExplorerCopyCollisionDialogActions">
          <button
            type="button"
            className="appDialogButton appDialogButton-confirm fileExplorerCopyCollisionRunButton"
            disabled={
              phase !== "confirm" || runnableRows.length === 0
            }
            aria-disabled={phase !== "confirm" || runnableRows.length === 0}
            hidden={phase === "done"}
            onClick={() => {
              void runCopy();
            }}
          >
            {translate("explorer.copy.collision.run")}
          </button>
          {phase === "done" ? (
            <button
              ref={closeButtonRef}
              type="button"
              className="appDialogButton fileExplorerCopyCollisionCloseButton"
              onClick={onDismiss}
            >
              {translate("explorer.copy.collision.close")}
            </button>
          ) : (
            <button
              ref={cancelButtonRef}
              type="button"
              className="appDialogButton fileExplorerCopyCollisionCancelButton"
              autoFocus
              disabled={phase === "running"}
              aria-disabled={phase === "running"}
              onClick={onDismiss}
            >
              {translate("explorer.copy.collision.cancel")}
            </button>
          )}
        </div>
      }
    >
      <div className="fileExplorerCopyCollisionDialogBody">
        <p className="fileExplorerCopyCollisionDialogMessage">
          {translate("explorer.copy.collision.message")}
        </p>
        <p className="fileExplorerCopyCollisionDialogDestination">
          <span className="fileExplorerCopyCollisionDialogDestinationLabel">
            {translate("explorer.copy.collision.destinationLabel")}
          </span>
          <span className="fileExplorerCopyCollisionDialogDestinationPath">
            {destinationLabel}
          </span>
        </p>
        {phase !== "confirm" ? (
          <p
            className="fileExplorerCopyCollisionDialogRunStatus"
            role="status"
            aria-live="polite"
          >
            {runStatusText()}
          </p>
        ) : null}
        <div className="fileExplorerCopyCollisionDialogTableWrap">
          <table
            className="fileExplorerCopyCollisionDialogTable"
            role="grid"
            aria-label={translate("explorer.copy.collision.title")}
          >
            <thead>
              <tr>
                <th scope="col">
                  {translate("explorer.copy.collision.column.status")}
                </th>
                <th scope="col">
                  {translate("explorer.copy.collision.column.source")}
                </th>
                <th scope="col">
                  {translate("explorer.copy.collision.column.sourceSize")}
                </th>
                <th scope="col">
                  {translate("explorer.copy.collision.column.sourceModified")}
                </th>
                <th
                  scope="col"
                  aria-label={translate(
                    "explorer.copy.collision.directionLabel"
                  )}
                >
                  {translate("explorer.copy.collision.column.direction")}
                </th>
                <th scope="col">
                  {translate("explorer.copy.collision.column.destinationName")}
                </th>
                <th scope="col">
                  {translate("explorer.copy.collision.column.existingSize")}
                </th>
                <th scope="col">
                  {translate("explorer.copy.collision.column.existingModified")}
                </th>
                <th scope="col">
                  {translate("explorer.copy.collision.column.action")}
                </th>
              </tr>
            </thead>
            <tbody>
              {plan.rows.map((row) => (
                <tr
                  key={row.sourceRelativePath}
                  data-copy-row-status={row.status}
                >
                  <td>{rowStatusCell(row)}</td>
                  <td className="fileExplorerCopyCollisionDialogSourceCell">
                    {row.sourceRelativePath}
                  </td>
                  <td>{sizeCell(row.sourceSizeBytes)}</td>
                  <td>{dateCell(row.sourceModifiedAt)}</td>
                  <td
                    className="fileExplorerCopyCollisionDialogDirectionCell"
                    aria-hidden="true"
                  >
                    ▶
                  </td>
                  <td className="fileExplorerCopyCollisionDialogDestinationNameCell">
                    {row.destinationName || "—"}
                  </td>
                  <td>{sizeCell(row.collisionSizeBytes)}</td>
                  <td>{dateCell(row.collisionModifiedAt)}</td>
                  <td>{rowActionCell(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </InfoDialog>
  );
}
