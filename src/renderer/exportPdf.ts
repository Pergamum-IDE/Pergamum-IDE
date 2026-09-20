import { sanitizeJsonFileNameStem } from "../shared/settingsExport";
import type { ExportOrigin } from "./exportCandidates";

export function pdfExportDefaultFileName(
  origin: ExportOrigin,
  projectName: string | null
): string {
  function pathBaseName(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, "/").replace(/\/+$/u, "");
    const segments = normalized
      .split("/")
      .filter((segment) => segment.length > 0);
    return segments[segments.length - 1] ?? "";
  }

  function fileNameStem(fileName: string): string {
    const dotIndex = fileName.lastIndexOf(".");
    return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  }

  const rawStem =
    origin.kind === "projectRoot"
      ? (projectName ?? "")
      : origin.kind === "folder"
        ? pathBaseName(origin.folderPath)
        : fileNameStem(pathBaseName(origin.filePath));

  return `${sanitizeJsonFileNameStem(rawStem, "export")}.pdf`;
}
