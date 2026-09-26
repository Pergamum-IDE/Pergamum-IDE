/**
 * Pure helper for joining output directory paths with file names in renderer code.
 *
 * Renderer code cannot directly import Node's `path` module (Electron security boundary),
 * so the separator (`\` or `/`) is inferred from the folder path string itself.
 */
export function joinExportPath(folderPath: string, fileName: string): string {
  const trimmedFolder = folderPath.trim().replace(/[\\/]+$/u, "");
  if (trimmedFolder.length === 0) {
    return fileName;
  }
  const isWindowsStylePath = trimmedFolder.includes("\\");
  const separator = isWindowsStylePath ? "\\" : "/";
  return `${trimmedFolder}${separator}${fileName}`;
}
