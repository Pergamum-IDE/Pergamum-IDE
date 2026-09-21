import type { Translate } from "./i18n";

export type PdfPageNumberPosition =
  | "none"
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type PdfPageNumberFormat =
  | "none"
  | "dash"
  | "p"
  | "page";

export interface PdfPageNumberSettings {
  readonly position: PdfPageNumberPosition;
  readonly format: PdfPageNumberFormat;
}

export const DEFAULT_PDF_PAGE_NUMBER_SETTINGS: PdfPageNumberSettings = {
  position: "none",
  format: "none"
};

export const PDF_PAGE_NUMBER_POSITIONS: readonly PdfPageNumberPosition[] = [
  "none",
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right"
];

export const PDF_PAGE_NUMBER_FORMATS: readonly PdfPageNumberFormat[] = [
  "none",
  "dash",
  "p",
  "page"
];

export function normalizePdfPageNumberSettings(
  settings: PdfPageNumberSettings
): PdfPageNumberSettings {
  if (settings.position === "none") {
    return { position: "none", format: "none" };
  }

  if (settings.format === "none") {
    return { position: "none", format: "none" };
  }

  return settings;
}

export function positionOptionLabel(
  position: PdfPageNumberPosition,
  translate: Translate
): string {
  switch (position) {
    case "top-left":
      return translate("export.wizard.pdfPagePosition.topLeft");
    case "top-center":
      return translate("export.wizard.pdfPagePosition.topCenter");
    case "top-right":
      return translate("export.wizard.pdfPagePosition.topRight");
    case "bottom-left":
      return translate("export.wizard.pdfPagePosition.bottomLeft");
    case "bottom-center":
      return translate("export.wizard.pdfPagePosition.bottomCenter");
    case "bottom-right":
      return translate("export.wizard.pdfPagePosition.bottomRight");
    case "none":
    default:
      return translate("export.wizard.pdfPagePosition.none");
  }
}

export function formatOptionLabel(
  format: PdfPageNumberFormat,
  translate: Translate
): string {
  switch (format) {
    case "dash":
      return translate("export.wizard.pdfPageFormat.dash");
    case "p":
      return translate("export.wizard.pdfPageFormat.p");
    case "page":
      return translate("export.wizard.pdfPageFormat.page");
    case "none":
    default:
      return translate("export.wizard.pdfPageFormat.none");
  }
}

export function formatSampleText(format: PdfPageNumberFormat): string {
  switch (format) {
    case "dash":
      return "- 1 -";
    case "p":
      return "P. 1";
    case "page":
      return "Page. 1";
    case "none":
    default:
      return "";
  }
}

export function formatPdfPageNumberSummaryText(
  settings: PdfPageNumberSettings,
  translate: Translate
): string {
  const normalized = normalizePdfPageNumberSettings(settings);
  if (normalized.position === "none") {
    return translate("export.wizard.pdfPageNumberNone");
  }

  const posLabel = positionOptionLabel(normalized.position, translate);
  const sample = formatSampleText(normalized.format);
  return `${posLabel} / ${sample}`;
}

export interface PdfHeaderFooterTemplates {
  readonly displayHeaderFooter: boolean;
  readonly headerTemplate?: string;
  readonly footerTemplate?: string;
}

export function buildPdfHeaderFooterTemplates(
  settings?: PdfPageNumberSettings | null
): PdfHeaderFooterTemplates {
  const normalized = settings
    ? normalizePdfPageNumberSettings(settings)
    : DEFAULT_PDF_PAGE_NUMBER_SETTINGS;

  if (normalized.position === "none" || normalized.format === "none") {
    return { displayHeaderFooter: false };
  }

  const isTop = normalized.position.startsWith("top-");
  const isLeft = normalized.position.endsWith("-left");
  const isCenter = normalized.position.endsWith("-center");
  const isRight = normalized.position.endsWith("-right");

  let pageNumberHtml = "";
  switch (normalized.format) {
    case "dash":
      pageNumberHtml = '- <span class="pageNumber"></span> -';
      break;
    case "p":
      pageNumberHtml = 'P. <span class="pageNumber"></span>';
      break;
    case "page":
      pageNumberHtml = 'Page. <span class="pageNumber"></span>';
      break;
    default:
      return { displayHeaderFooter: false };
  }

  const leftContent = isLeft ? pageNumberHtml : "";
  const centerContent = isCenter ? pageNumberHtml : "";
  const rightContent = isRight ? pageNumberHtml : "";

  const templateHtml = `
<style>
  .pdf-page-number-row {
    display: flex;
    width: 100%;
    justify-content: space-between;
    align-items: center;
    font-size: 9pt;
    font-family: sans-serif;
    color: #555555;
    padding: 0 0.79in;
    box-sizing: border-box;
  }
  .pdf-page-number-left { flex: 1; text-align: left; }
  .pdf-page-number-center { flex: 1; text-align: center; }
  .pdf-page-number-right { flex: 1; text-align: right; }
</style>
<div class="pdf-page-number-row">
  <span class="pdf-page-number-left">${leftContent}</span>
  <span class="pdf-page-number-center">${centerContent}</span>
  <span class="pdf-page-number-right">${rightContent}</span>
</div>
`.trim();

  const emptyTemplate = "<div></div>";

  return {
    displayHeaderFooter: true,
    headerTemplate: isTop ? templateHtml : emptyTemplate,
    footerTemplate: isTop ? emptyTemplate : templateHtml
  };
}
