import { useEffect, useRef, useState, type FC, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Translate } from "../../shared/i18n";

export interface TableSizePopoverProps {
  onSelectTableSize: (columns: number, rows: number) => void;
  onClose: () => void;
  translate: Translate;
}

export const TableSizePopover: FC<TableSizePopoverProps> = ({
  onSelectTableSize,
  onClose,
  translate
}) => {
  const [hoveredCols, setHoveredCols] = useState<number>(1);
  const [hoveredRows, setHoveredRows] = useState<number>(1);
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

  const rows = [1, 2, 3, 4, 5, 6];
  const cols = [1, 2, 3, 4, 5, 6];

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
          cols: String(hoveredCols),
          rows: String(hoveredRows)
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
                  }}
                  onClick={() => onSelectTableSize(c, r)}
                  aria-label={`${c} x ${r}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
