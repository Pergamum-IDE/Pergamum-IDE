/**
 * Where an export starts from: the whole project, one folder, or one file
 * (project-relative paths). Plain data, shared so a command id can name it
 * without depending on renderer code.
 */
export type ExportOrigin =
  | { readonly kind: "projectRoot" }
  | { readonly kind: "folder"; readonly folderPath: string }
  | { readonly kind: "file"; readonly filePath: string };
