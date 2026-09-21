import { useState, type FC } from "react";
import type { Translate } from "../../shared/i18n";
import { TableSizePopover } from "./TableSizePopover";
import tableIconRaw from "../../../assets/icons/codicons/toolbar/table.svg?raw";

export interface EditorToolbarProps {
  canInsertTable: boolean;
  onInsertTable: (columns: number, rows: number) => void;
  translate: Translate;
}

export const EditorToolbar: FC<EditorToolbarProps> = ({
  canInsertTable,
  onInsertTable,
  translate
}) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState<boolean>(false);

  const handleSelectTableSize = (columns: number, rows: number) => {
    setIsPopoverOpen(false);
    onInsertTable(columns, rows);
  };

  return (
    <header className="editorToolbar">
      <div className="editorToolbarGroup">
        <div className="editorToolbarItem">
          <button
            type="button"
            className="editorToolbarButton"
            disabled={!canInsertTable}
            onClick={() => setIsPopoverOpen((prev) => !prev)}
            aria-label={translate("toolbar.insertTable")}
            title={translate("toolbar.insertTable")}
          >
            <span
              className="editorToolbarButtonIcon"
              dangerouslySetInnerHTML={{ __html: tableIconRaw }}
            />
          </button>

          {isPopoverOpen && canInsertTable && (
            <TableSizePopover
              onSelectTableSize={handleSelectTableSize}
              onClose={() => setIsPopoverOpen(false)}
              translate={translate}
            />
          )}
        </div>
      </div>
    </header>
  );
};
