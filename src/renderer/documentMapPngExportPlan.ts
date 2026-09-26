/**
 * #537: pure planning / validation logic for the Document Map PNG export
 * dialog. Nothing here touches the DOM, canvas, or the filesystem — those
 * live in `documentMapPngRenderer.ts` (canvas → PNG bytes) and the
 * `files.exportPng` IPC call (bytes → disk). Kept pure so filename
 * generation, validation, row/toggle state, and export-target planning are
 * unit-testable without a browser environment.
 */

import { containsControlCharacter } from "../shared/fileExplorerCreate";
import { joinExportPath } from "./exportPathHelper";
import { sanitizeFileName } from "./exportTypes";

/** Always 3-digit zero-padded page numbering, even for a single-page map. */
export const DOCUMENT_MAP_PNG_FILE_NAME_PAGE_DIGITS = 3;

export const DOCUMENT_MAP_PNG_DEFAULT_BASE_FILE_NAME = "document-map";

/**
 * Classic Windows device names — reserved regardless of extension, and not
 * covered by {@link sanitizeFileName} or the File Explorer's own
 * `isReservedFileExplorerName` (that list is Pergamum's own reserved names,
 * not the OS device-name set).
 */
const WINDOWS_RESERVED_DEVICE_NAMES: ReadonlySet<string> = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9"
]);

/** `< > : " / \ | ? *` — the classic Windows-forbidden filename characters. */
const FORBIDDEN_BASE_FILE_NAME_CHARACTER_PATTERN = /[<>:"/\\|?*]/;

function isWindowsReservedDeviceName(name: string): boolean {
  return WINDOWS_RESERVED_DEVICE_NAMES.has(name.normalize("NFC").toLowerCase());
}

function stripMarkdownExtension(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".markdown")) {
    return name.slice(0, -".markdown".length);
  }
  if (lower.endsWith(".md")) {
    return name.slice(0, -".md".length);
  }
  return name;
}

/**
 * Derives the export dialog's default base filename from the active
 * document's display name (e.g. `"chapter01.md"` -> `"chapter01"`). The
 * Markdown extension is stripped BEFORE sanitizing — {@link sanitizeFileName}
 * has no reason to treat a literal `.md` as invalid, so leaving it in would
 * produce a base name that still carries a stray `.md` in every planned PNG
 * filename.
 *
 * Always returns an already-VALID name (never `undefined`/empty and never a
 * Windows reserved device name) so the dialog opens with Export already
 * enabled — the user should never have to fix the default before typing
 * their own name.
 */
export function deriveDefaultDocumentMapPngBaseFileName(
  documentTitle: string | null
): string {
  const withoutExtension = stripMarkdownExtension(documentTitle ?? "");
  const sanitized = sanitizeFileName(withoutExtension);

  if (isWindowsReservedDeviceName(sanitized)) {
    return `${sanitized}_`;
  }

  return sanitized;
}

export type DocumentMapPngBaseFileNameValidationError =
  | "empty"
  | "invalidCharacter"
  | "controlCharacter"
  | "trailingDotOrSpace"
  | "reservedName";

export type DocumentMapPngBaseFileNameValidationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly error: DocumentMapPngBaseFileNameValidationError;
    };

/**
 * Validates a user-EDITED base filename. Unlike
 * {@link deriveDefaultDocumentMapPngBaseFileName} (which silently sanitizes),
 * this REJECTS — the user must fix the name themselves once they have taken
 * over editing it.
 */
export function validateDocumentMapPngBaseFileName(
  rawName: string
): DocumentMapPngBaseFileNameValidationResult {
  if (rawName.length === 0) {
    return { ok: false, error: "empty" };
  }

  if (FORBIDDEN_BASE_FILE_NAME_CHARACTER_PATTERN.test(rawName)) {
    return { ok: false, error: "invalidCharacter" };
  }

  if (containsControlCharacter(rawName)) {
    return { ok: false, error: "controlCharacter" };
  }

  if (rawName.endsWith(".") || rawName.endsWith(" ")) {
    return { ok: false, error: "trailingDotOrSpace" };
  }

  if (isWindowsReservedDeviceName(rawName)) {
    return { ok: false, error: "reservedName" };
  }

  return { ok: true };
}

export function isDocumentMapPngBaseFileNameValid(rawName: string): boolean {
  return validateDocumentMapPngBaseFileName(rawName).ok;
}

/** `<base>_001.png`, `<base>_002.png`, ... — always 3-digit, even for page 1 of 1. */
export function documentMapPngPageFileName(
  baseFileName: string,
  pageNumber: number
): string {
  const padded = String(pageNumber).padStart(
    DOCUMENT_MAP_PNG_FILE_NAME_PAGE_DIGITS,
    "0"
  );
  return `${baseFileName}_${padded}.png`;
}

export interface DocumentMapPngExportRow {
  /** 0-based, matches `DocumentMapPage.index`. */
  readonly pageIndex: number;
  /** 1-based, for display and filename numbering. */
  readonly pageNumber: number;
  readonly fileName: string;
  readonly outputEnabled: boolean;
}

/**
 * (Re)builds the planned-output row list for `pageCount` pages and the
 * current base filename. Rows are keyed by `pageIndex`, so an existing row's
 * `outputEnabled` selection survives a base filename edit — only the
 * generated `fileName` changes. A brand-new row (page count increased, or no
 * previous rows) defaults to enabled, matching "export every page unless the
 * user disables it".
 */
export function buildDocumentMapPngExportRows(
  pageCount: number,
  baseFileName: string,
  previousRows: readonly DocumentMapPngExportRow[] = []
): DocumentMapPngExportRow[] {
  const previousByPageIndex = new Map(
    previousRows.map((row) => [row.pageIndex, row] as const)
  );

  const rows: DocumentMapPngExportRow[] = [];
  for (let index = 0; index < pageCount; index += 1) {
    const pageNumber = index + 1;
    rows.push({
      pageIndex: index,
      pageNumber,
      fileName: documentMapPngPageFileName(baseFileName, pageNumber),
      outputEnabled: previousByPageIndex.get(index)?.outputEnabled ?? true
    });
  }
  return rows;
}

export function toggleDocumentMapPngExportRow(
  rows: readonly DocumentMapPngExportRow[],
  pageIndex: number
): DocumentMapPngExportRow[] {
  return rows.map((row) =>
    row.pageIndex === pageIndex
      ? { ...row, outputEnabled: !row.outputEnabled }
      : row
  );
}

export type DocumentMapPngExportHeaderToggleState =
  | "allEnabled"
  | "allDisabled"
  | "mixed";

export function resolveDocumentMapPngExportHeaderToggleState(
  rows: readonly DocumentMapPngExportRow[]
): DocumentMapPngExportHeaderToggleState {
  if (rows.length === 0) {
    return "allDisabled";
  }

  const enabledCount = rows.filter((row) => row.outputEnabled).length;
  if (enabledCount === rows.length) {
    return "allEnabled";
  }
  if (enabledCount === 0) {
    return "allDisabled";
  }
  return "mixed";
}

/**
 * Header bulk toggle interaction rule: disabled -> enable all; mixed ->
 * enable all; enabled -> disable all.
 */
export function applyDocumentMapPngExportHeaderToggle(
  rows: readonly DocumentMapPngExportRow[]
): DocumentMapPngExportRow[] {
  const currentState = resolveDocumentMapPngExportHeaderToggleState(rows);
  const nextEnabled = currentState !== "allEnabled";
  return rows.map((row) => ({ ...row, outputEnabled: nextEnabled }));
}

export interface DocumentMapPngExportButtonEnabledInput {
  readonly outputFolder: string;
  readonly baseFileName: string;
  readonly rows: readonly DocumentMapPngExportRow[];
  readonly isExporting: boolean;
  readonly hasSucceeded: boolean;
}

export function isDocumentMapPngExportButtonEnabled(
  input: DocumentMapPngExportButtonEnabledInput
): boolean {
  if (input.isExporting || input.hasSucceeded) {
    return false;
  }
  if (input.outputFolder.trim().length === 0) {
    return false;
  }
  if (!isDocumentMapPngBaseFileNameValid(input.baseFileName)) {
    return false;
  }
  return input.rows.some((row) => row.outputEnabled);
}

/**
 * Joins an absolute output folder with a plain filename (no separators of
 * its own). Renderer code must not import Node's `path` module (Electron
 * security boundary), so the separator is inferred from the folder string
 * itself — delegating to {@link joinExportPath}.
 */
export function documentMapPngExportFilePath(
  outputFolder: string,
  fileName: string
): string {
  return joinExportPath(outputFolder, fileName);
}

export interface DocumentMapPngExportTarget {
  readonly pageIndex: number;
  readonly fileName: string;
  readonly filePath: string;
}

/**
 * Only OUTPUT-ENABLED rows become export targets — disabled rows must never
 * reach the dry-run exists check, the overwrite confirmation, or the actual
 * write.
 */
export function planDocumentMapPngExportTargets(
  rows: readonly DocumentMapPngExportRow[],
  outputFolder: string
): DocumentMapPngExportTarget[] {
  return rows
    .filter((row) => row.outputEnabled)
    .map((row) => ({
      pageIndex: row.pageIndex,
      fileName: row.fileName,
      filePath: documentMapPngExportFilePath(outputFolder, row.fileName)
    }));
}
