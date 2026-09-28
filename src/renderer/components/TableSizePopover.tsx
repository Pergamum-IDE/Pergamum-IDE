import { useEffect, useRef, useState, type FC, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Translate } from "../../shared/i18n";

export interface TableSizePopoverProps {
  onSelectTableSize: (columns: number, rows: number) => void;
  onClose: () => void;
  translate: Translate;
}

function parseDimension(val: string): number | null {
  const trimmed = val.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const num = Number(trimmed);
  if (!Number.isInteger(num) || num < 1 || num > 99) {
    return null;
  }
  return num;
}

export const TableSizePopover: FC<TableSizePopoverProps> = ({
  onSelectTableSize,
  onClose,
  translate
}) => {
  const [hoveredCols, setHoveredCols] = useState<number>(1);
  const [hoveredRows, setHoveredRows] = useState<number>(1);
  const [rowsInput, setRowsInput] = useState<string>("1");
  const [colsInput, setColsInput] = useState<string>("1");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();

    const handleMouseDownOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    window.addEventListener("mousedown", handleMouseDownOutside, true);

    return () => {
      window.removeEventListener("mousedown", handleMouseDownOutside, true);
    };
  }, [onClose]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  };

  const validRows = parseDimension(rowsInput);
  const validCols = parseDimension(colsInput);
  const isValid = validRows !== null && validCols !== null;

  const handleRowsChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setRowsInput(val);
    const parsed = parseDimension(val);
    if (parsed !== null) {
      setHoveredRows(parsed);
    }
  };

  const handleColsChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setColsInput(val);
    const parsed = parseDimension(val);
    if (parsed !== null) {
      setHoveredCols(parsed);
    }
  };

  const handleApply = () => {
    if (isValid) {
      onSelectTableSize(validCols, validRows);
    }
  };

  const handleInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (isValid) {
        onSelectTableSize(validCols, validRows);
      }
    }
  };

  const rows = [1, 2, 3, 4, 5, 6];
  const cols = [1, 2, 3, 4, 5, 6];

  const displayCols = validCols !== null ? String(validCols) : colsInput || "?";
  const displayRows = validRows !== null ? String(validRows) : rowsInput || "?";

  return (
    <div
      ref={containerRef}
      className="tableSizePopover"
      role="dialog"
      aria-label={translate("toolbar.insertTable")}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div className="tableSizePopoverLabel">
        {translate("toolbar.tableGridLabel", {
          cols: displayCols,
          rows: displayRows
        })}
      </div>
      <div className="tableSizePopoverGrid" role="grid">
        {rows.map((r) => (
          <div key={`row-${r}`} className="tableSizePopoverRow" role="row">
            {cols.map((c) => {
              const isSelected = c <= hoveredCols && r <= hoveredRows;
              return (
                <button
                  key={`cell-${r}-${c}`}
                  type="button"
                  className={`tableSizePopoverCell${
                    isSelected ? " isSelected" : ""
                  }`}
                  onMouseEnter={() => {
                    setHoveredCols(c);
                    setHoveredRows(r);
                    setColsInput(String(c));
                    setRowsInput(String(r));
                  }}
                  onClick={() => onSelectTableSize(c, r)}
                  aria-label={`${c} x ${r}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="tableSizePopoverInputs">
        <div className="tableSizePopoverFields">
          <label className="tableSizePopoverField">
            <span className="tableSizePopoverFieldLabel">
              {translate("toolbar.tableRows")}
            </span>
            <input
              type="text"
              className="tableSizePopoverInput"
              aria-label={translate("toolbar.tableRows")}
              value={rowsInput}
              onChange={handleRowsChange}
              onKeyDown={handleInputKeyDown}
            />
          </label>
          <label className="tableSizePopoverField">
            <span className="tableSizePopoverFieldLabel">
              {translate("toolbar.tableCols")}
            </span>
            <input
              type="text"
              className="tableSizePopoverInput"
              aria-label={translate("toolbar.tableCols")}
              value={colsInput}
              onChange={handleColsChange}
              onKeyDown={handleInputKeyDown}
            />
          </label>
        </div>
        <div className="tableSizePopoverHint">
          {translate("toolbar.tableRowsHint")}
        </div>
        <button
          type="button"
          className="tableSizePopoverApplyButton"
          disabled={!isValid}
          onClick={handleApply}
        >
          {translate("toolbar.tableApply")}
        </button>
      </div>
    </div>
  );
};
