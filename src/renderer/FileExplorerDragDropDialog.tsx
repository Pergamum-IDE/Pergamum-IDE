import { useEffect, useRef } from "react";
import type { Translate } from "../shared/i18n";
import { InfoDialog } from "./dialog/InfoDialog";

/**
 * #356: shown when the user drops a valid internal File Explorer drag. The
 * drop no longer executes Move immediately — the user chooses Move, Copy, or
 * Cancel here first.
 *
 *   - Initial focus is Cancel; Enter therefore never triggers Move / Copy.
 *   - No arming delay (only Delete has the 5-second friction).
 *   - The table lists the TOP-LEVEL dragged entries only — folder contents
 *     are not enumerated (a note says they are included).
 */
export interface FileExplorerDragDropSourceRow {
  readonly relativePath: string;
  readonly name: string;
  /** Parent path, project-root-relative; `""` = project root. */
  readonly parentRelativePath: string;
  readonly kind: "file" | "folder";
  /** Byte size for a file; `null` for a folder / still loading. */
  readonly sizeBytes: number | null;
  /** ISO 8601 mtime; `null` for still loading / unavailable. */
  readonly modifiedAt: string | null;
}

export interface FileExplorerDragDropDialogProps {
  readonly sources: readonly FileExplorerDragDropSourceRow[];
  /** `""` = project root. */
  readonly destinationFolderRelativePath: string;
  readonly includesFolder: boolean;
  /** An operation is running — disable Move / Copy. */
  readonly busy: boolean;
  readonly translate: Translate;
  readonly opener: Element | null;
  readonly onMove: () => void;
  readonly onCopy: () => void;
  readonly onCancel: () => void;
}

function modifiedCell(iso: string | null): string {
  if (iso === null) {
    return "";
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export function FileExplorerDragDropDialog({
  sources,
  destinationFolderRelativePath,
  includesFolder,
  busy,
  translate,
  opener,
  onMove,
  onCopy,
  onCancel
}: FileExplorerDragDropDialogProps): JSX.Element {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    cancelButtonRef.current?.focus();
  }, []);

  const destinationLabel =
    destinationFolderRelativePath === ""
      ? translate("explorer.dnd.dialog.destinationProjectRoot")
      : destinationFolderRelativePath;

  return (
    <InfoDialog
      title={translate("explorer.dnd.dialog.title")}
      opener={opener}
      onClose={onCancel}
      className="fileExplorerDragDropDialog"
      footer={
        <div className="appDialogActions fileExplorerDragDropDialogActions">
          <button
            type="button"
            className="appDialogButton appDialogButton-choice fileExplorerDragDropMoveButton"
            disabled={busy}
            aria-disabled={busy}
            onClick={onMove}
          >
            {translate("explorer.dnd.dialog.move")}
          </button>
          <button
            type="button"
            className="appDialogButton appDialogButton-choice fileExplorerDragDropCopyButton"
            disabled={busy}
            aria-disabled={busy}
            onClick={onCopy}
          >
            {translate("explorer.dnd.dialog.copy")}
          </button>
          <button
            ref={cancelButtonRef}
            type="button"
            className="appDialogButton fileExplorerDragDropCancelButton"
            autoFocus
            onClick={onCancel}
          >
            {translate("explorer.dnd.dialog.cancel")}
          </button>
        </div>
      }
    >
      <div className="fileExplorerDragDropDialogBody">
        <p className="fileExplorerDragDropDialogIntro">
          {translate("explorer.dnd.dialog.intro", { count: sources.length })}
        </p>
        <p className="fileExplorerDragDropDialogDestination">
          <span className="fileExplorerDragDropDialogDestinationLabel">
            {translate("explorer.dnd.dialog.destinationLabel")}
          </span>
          <span className="fileExplorerDragDropDialogDestinationPath">
            {destinationLabel}
          </span>
        </p>
        {includesFolder ? (
          <p className="fileExplorerDragDropDialogFolderNote">
            {translate("explorer.dnd.dialog.folderNote")}
          </p>
        ) : null}
        <div className="fileExplorerDragDropDialogTableWrap">
          <table
            className="fileExplorerDragDropDialogTable"
            role="grid"
            aria-label={translate("explorer.dnd.dialog.title")}
          >
            <thead>
              <tr>
                <th scope="col">{translate("explorer.dnd.column.status")}</th>
                <th scope="col">{translate("explorer.dnd.column.path")}</th>
                <th scope="col">{translate("explorer.dnd.column.name")}</th>
                <th scope="col">{translate("explorer.dnd.column.kind")}</th>
                <th scope="col">
                  {translate("explorer.dnd.column.modified")}
                </th>
                <th scope="col">{translate("explorer.dnd.column.size")}</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((row) => (
                <tr key={row.relativePath} data-dnd-kind={row.kind}>
                  <td>{translate("explorer.dnd.value.target")}</td>
                  <td className="fileExplorerDragDropDialogPathCell">
                    {row.parentRelativePath === ""
                      ? translate("explorer.dnd.dialog.destinationProjectRoot")
                      : row.parentRelativePath}
                  </td>
                  <td>{row.name}</td>
                  <td>
                    {row.kind === "folder"
                      ? translate("explorer.dnd.value.folder")
                      : translate("explorer.dnd.value.file")}
                  </td>
                  <td>{modifiedCell(row.modifiedAt)}</td>
                  <td className="fileExplorerDragDropDialogSizeCell">
                    {row.kind === "folder"
                      ? translate("explorer.dnd.value.folderSize")
                      : row.sizeBytes === null
                        ? translate("explorer.dnd.value.folderSize")
                        : row.sizeBytes.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </InfoDialog>
  );
}
