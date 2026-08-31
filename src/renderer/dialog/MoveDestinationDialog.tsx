import { useState } from "react";
import type { Translate } from "../../shared/i18n";
import { FILE_EXPLORER_MOVE_ROOT_DESTINATION } from "../fileExplorerMoveDestinations";
import { InfoDialog } from "./InfoDialog";

/**
 * #327: a deliberately minimal destination-folder picker for File Explorer
 * Move. It is a single-select list of `folderRelativePaths` (which already
 * includes `""` = project root, first) — no new-folder creation, no search,
 * no favorites. `InfoDialog` owns the overlay, Escape-to-cancel, and the
 * focus trap.
 */
export interface MoveDestinationDialogProps {
  /** Destination options; `""` (project root) must be first (see
   *  `collectFileExplorerMoveDestinationFolders`). */
  readonly folderRelativePaths: readonly string[];
  /** How many files the move would affect — shown for context. */
  readonly sourceCount: number;
  readonly translate: Translate;
  readonly opener: Element | null;
  readonly onCancel: () => void;
  readonly onConfirm: (destinationFolderRelativePath: string) => void;
}

export function MoveDestinationDialog({
  folderRelativePaths,
  sourceCount,
  translate,
  opener,
  onCancel,
  onConfirm
}: MoveDestinationDialogProps): JSX.Element {
  const [selected, setSelected] = useState<string>(
    folderRelativePaths[0] ?? FILE_EXPLORER_MOVE_ROOT_DESTINATION
  );

  const label = (folderRelativePath: string): string =>
    folderRelativePath === FILE_EXPLORER_MOVE_ROOT_DESTINATION
      ? translate("explorer.move.destination.projectRoot")
      : folderRelativePath;

  return (
    <InfoDialog
      title={translate("explorer.move.destination.title")}
      opener={opener}
      onClose={onCancel}
      footer={
        <div className="appDialogActions">
          <button
            type="button"
            className="appDialogButton"
            onClick={onCancel}
          >
            {translate("common.cancel")}
          </button>
          <button
            type="button"
            className="appDialogButton appDialogButton-confirm moveDestinationDialogPrimary"
            onClick={() => onConfirm(selected)}
          >
            {translate("explorer.move.destination.confirm")}
          </button>
        </div>
      }
    >
      <p className="moveDestinationDialogDescription">
        {translate("explorer.move.destination.description", {
          count: sourceCount
        })}
      </p>
      <ul
        className="moveDestinationDialogList"
        role="radiogroup"
        aria-label={translate("explorer.move.destination.title")}
      >
        {folderRelativePaths.map((folderRelativePath) => {
          const isSelected = folderRelativePath === selected;

          return (
            <li key={folderRelativePath || "\0root"}>
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={
                  [
                    "moveDestinationDialogOption",
                    isSelected ? "isSelected" : null
                  ]
                    .filter(Boolean)
                    .join(" ")
                }
                data-move-destination-path={folderRelativePath}
                onClick={() => setSelected(folderRelativePath)}
                onDoubleClick={() => onConfirm(folderRelativePath)}
              >
                {label(folderRelativePath)}
              </button>
            </li>
          );
        })}
      </ul>
    </InfoDialog>
  );
}
