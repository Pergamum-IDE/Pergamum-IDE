import { useEffect, useId, useState } from "react";
import type { Translate } from "../../shared/i18n";
import type {
  PdfPageNumberFormat,
  PdfPageNumberPosition,
  PdfPageNumberSettings
} from "../../shared/pdfPageNumbering";
import {
  DEFAULT_PDF_PAGE_NUMBER_SETTINGS,
  formatOptionLabel,
  normalizePdfPageNumberSettings,
  PDF_PAGE_NUMBER_FORMATS,
  PDF_PAGE_NUMBER_POSITIONS,
  positionOptionLabel
} from "../../shared/pdfPageNumbering";
import { InfoDialog } from "./InfoDialog";

export interface PdfPageNumberSettingsDialogProps {
  readonly isOpen: boolean;
  readonly initialSettings?: PdfPageNumberSettings;
  readonly translate: Translate;
  readonly opener?: Element | null;
  readonly onApply: (settings: PdfPageNumberSettings) => void;
  readonly onClose: () => void;
}

export function PdfPageNumberSettingsDialog({
  isOpen,
  initialSettings = DEFAULT_PDF_PAGE_NUMBER_SETTINGS,
  translate,
  opener,
  onApply,
  onClose
}: PdfPageNumberSettingsDialogProps): JSX.Element | null {
  const [position, setPosition] = useState<PdfPageNumberPosition>(
    () => normalizePdfPageNumberSettings(initialSettings).position
  );
  const [format, setFormat] = useState<PdfPageNumberFormat>(
    () => normalizePdfPageNumberSettings(initialSettings).format
  );

  const dialogId = useId();
  const positionSelectId = `${dialogId}-position`;
  const formatSelectId = `${dialogId}-format`;

  useEffect(() => {
    if (isOpen) {
      const normalized = normalizePdfPageNumberSettings(initialSettings);
      setPosition(normalized.position);
      setFormat(normalized.format);
    }
  }, [isOpen, initialSettings]);

  if (!isOpen) {
    return null;
  }

  const handlePositionChange = (newPos: PdfPageNumberPosition): void => {
    if (newPos === "none") {
      setPosition("none");
      setFormat("none");
    } else {
      setPosition(newPos);
      if (format === "none") {
        setFormat("dash");
      }
    }
  };

  const handleFormatChange = (newFmt: PdfPageNumberFormat): void => {
    if (position === "none") {
      setFormat("none");
    } else {
      setFormat(newFmt);
    }
  };

  const handleApply = (): void => {
    const finalSettings = normalizePdfPageNumberSettings({ position, format });
    onApply(finalSettings);
    onClose();
  };

  return (
    <InfoDialog
      title={translate("export.wizard.pdfPageSettingsTitle")}
      opener={opener ?? null}
      className="pdfPageNumberSettingsDialog"
      onClose={onClose}
      footer={
        <div className="appDialogActions">
          <button
            type="button"
            className="appDialogButton appDialogButton-cancel"
            onClick={onClose}
          >
            {translate("fontPicker.button.cancel")}
          </button>
          <button
            type="button"
            className="appDialogButton appDialogButton-primary"
            onClick={handleApply}
          >
            {translate("fontPicker.button.apply")}
          </button>
        </div>
      }
    >
      <div className="pdfPageNumberSettingsContent">
        <div className="pdfPageNumberSettingsRow">
          <label htmlFor={positionSelectId} className="pdfPageNumberSettingsLabel">
            {translate("export.wizard.pdfPageNumberPositionLabel")}
          </label>
          <select
            id={positionSelectId}
            className="pdfPageNumberSettingsSelect settingsSelect"
            value={position}
            onChange={(e) =>
              handlePositionChange(e.target.value as PdfPageNumberPosition)
            }
          >
            {PDF_PAGE_NUMBER_POSITIONS.map((pos) => (
              <option key={pos} value={pos}>
                {positionOptionLabel(pos, translate)}
              </option>
            ))}
          </select>
        </div>

        <div className="pdfPageNumberSettingsRow">
          <label htmlFor={formatSelectId} className="pdfPageNumberSettingsLabel">
            {translate("export.wizard.pdfPageNumberFormatLabel")}
          </label>
          <select
            id={formatSelectId}
            className="pdfPageNumberSettingsSelect settingsSelect"
            value={format}
            disabled={position === "none"}
            onChange={(e) =>
              handleFormatChange(e.target.value as PdfPageNumberFormat)
            }
          >
            {PDF_PAGE_NUMBER_FORMATS.map((fmt) => (
              <option key={fmt} value={fmt}>
                {formatOptionLabel(fmt, translate)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </InfoDialog>
  );
}
