import type {
  MarkdownFile,
  ProjectDocument,
  WriteMarkdownSavedResult
} from "../shared/api";

export const initialDocumentContent =
  "# Untitled\n\nStart writing in Markdown.\n\n**Bold** text renders in the preview.";

interface BaseCurrentDocument {
  name: string;
  content: string;
  savedContent: string;
}

export interface UntitledCurrentDocument extends BaseCurrentDocument {
  kind: "untitled";
  path: null;
}

export interface FileCurrentDocument extends BaseCurrentDocument {
  kind: "file";
  path: string;
}

export interface ProjectCurrentDocument extends BaseCurrentDocument {
  kind: "project";
  relativePath: string;
}

export type CurrentDocument =
  | UntitledCurrentDocument
  | FileCurrentDocument
  | ProjectCurrentDocument;

export function createUntitledDocument(): UntitledCurrentDocument {
  return {
    kind: "untitled",
    path: null,
    name: "Untitled.md",
    content: initialDocumentContent,
    savedContent: initialDocumentContent
  };
}

export function createFileDocument(file: MarkdownFile): FileCurrentDocument {
  return {
    kind: "file",
    path: file.path,
    name: displayName(file.path),
    content: file.content,
    savedContent: file.content
  };
}

export function createProjectDocument(
  document: ProjectDocument,
  content: string
): ProjectCurrentDocument {
  return {
    kind: "project",
    relativePath: document.relativePath,
    name: document.name,
    content,
    savedContent: content
  };
}

export function displayName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

export function currentDocumentTitle(document: CurrentDocument): string {
  return document.name;
}

export function currentDocumentContent(document: CurrentDocument): string {
  return document.content;
}

export function currentProjectRelativePath(
  document: CurrentDocument
): string | null {
  return document.kind === "project" ? document.relativePath : null;
}

export function isInitialUntitledDocument(document: CurrentDocument): boolean {
  return (
    document.kind === "untitled" && document.content === initialDocumentContent
  );
}

export function isCurrentDocumentDirty(document: CurrentDocument): boolean {
  return document.content !== document.savedContent;
}

export function isProjectCurrentDocument(
  document: CurrentDocument
): document is ProjectCurrentDocument {
  return document.kind === "project";
}

export function updateCurrentDocumentContent(
  document: CurrentDocument,
  content: string
): CurrentDocument {
  return {
    ...document,
    content
  };
}

export function standaloneSavePath(document: CurrentDocument): string | null {
  return document.kind === "file" ? document.path : null;
}

export function markCurrentDocumentSaved(
  document: CurrentDocument
): CurrentDocument {
  return {
    ...document,
    savedContent: document.content
  };
}

export function applyStandaloneSaveResult(
  document: CurrentDocument,
  result: WriteMarkdownSavedResult
): FileCurrentDocument {
  return {
    kind: "file",
    path: result.path,
    name: displayName(result.path),
    content: document.content,
    savedContent: document.content
  };
}
