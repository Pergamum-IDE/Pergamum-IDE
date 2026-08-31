import type { FileExplorerEntry, PergamumProject } from "../shared/api";
import type { ProjectDocumentPathRelocation } from "../shared/projectMove";
import type { CreateGlossaryEntryInput, GlossaryEntryId } from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import {
  FileExplorer,
  type FileExplorerCreateEntryRequest,
  type FileExplorerRenameEntryRequest
} from "./FileExplorer";
import { GlossarySidebar } from "./GlossarySidebar";
import { SearchSidebar } from "./SearchSidebar";
import type { SidebarMode } from "./sidebarMode";

interface WorkspaceSidebarProps {
  mode: SidebarMode;
  project: PergamumProject | null;
  highlightedProjectDocumentRelativePath: string | null;
  highlightedGlossaryEntryId: GlossaryEntryId | null;
  glossaryRefreshToken: number;
  /** #311: Command Palette "Create New File / Folder" request, forwarded to
   *  the File Explorer so it opens the shared create dialog. */
  fileExplorerCreateEntryRequest: FileExplorerCreateEntryRequest | null;
  fileExplorerRenameEntryRequest?: FileExplorerRenameEntryRequest | null;
  translate: Translate;
  onActivateProjectDocument: (relativePath: string) => void;
  onFileExplorerCreateEntryRequestHandled: () => void;
  onFileExplorerRenameEntryRequestHandled?: () => void;
  isFileExplorerProjectDocumentDirty?: (relativePath: string) => boolean;
  onFileExplorerProjectDocumentRenamed?: (
    oldRelativePath: string,
    newEntry: FileExplorerEntry
  ) => void;
  /** #338: after a successful File Explorer Move, the old → new relocations
   *  for every moved file. The host follows open editor identity along these. */
  onFileExplorerProjectDocumentsMoved?: (
    relocations: readonly ProjectDocumentPathRelocation[]
  ) => void;
  onFileExplorerRenameUnavailable?: (message: string) => void;
  /** #327/#338: project-relative paths of open documents with UNSAVED changes
   *  (the only editor state that blocks a Move), and a status-line sink for
   *  the Move routes. */
  fileExplorerDirtyProjectDocumentRelativePaths?: readonly string[];
  onFileExplorerMoveResultMessage?: (message: string) => void;
  onActivateGlossaryEntry: (entryId: GlossaryEntryId) => void;
  onCreateGlossaryEntry: (
    input: CreateGlossaryEntryInput
  ) => Promise<boolean>;
}

export function WorkspaceSidebar({
  mode,
  project,
  highlightedProjectDocumentRelativePath,
  highlightedGlossaryEntryId,
  glossaryRefreshToken,
  fileExplorerCreateEntryRequest,
  fileExplorerRenameEntryRequest = null,
  translate,
  onActivateProjectDocument,
  onFileExplorerCreateEntryRequestHandled,
  onFileExplorerRenameEntryRequestHandled,
  isFileExplorerProjectDocumentDirty,
  onFileExplorerProjectDocumentRenamed,
  onFileExplorerProjectDocumentsMoved,
  onFileExplorerRenameUnavailable,
  fileExplorerDirtyProjectDocumentRelativePaths,
  onFileExplorerMoveResultMessage,
  onActivateGlossaryEntry,
  onCreateGlossaryEntry
}: WorkspaceSidebarProps): JSX.Element {
  switch (mode) {
    case "files":
      return (
        <FileExplorer
          key={project?.rootPath ?? "no-project"}
          project={project}
          highlightedRelativePath={
            project ? highlightedProjectDocumentRelativePath : null
          }
          readOnly={project?.accessMode.kind === "readOnly"}
          translate={translate}
          createEntryRequest={fileExplorerCreateEntryRequest}
          onCreateEntryRequestHandled={
            onFileExplorerCreateEntryRequestHandled
          }
          renameEntryRequest={fileExplorerRenameEntryRequest}
          onRenameEntryRequestHandled={
            onFileExplorerRenameEntryRequestHandled
          }
          isProjectDocumentDirty={isFileExplorerProjectDocumentDirty}
          onProjectDocumentRenamed={onFileExplorerProjectDocumentRenamed}
          onProjectDocumentsMoved={onFileExplorerProjectDocumentsMoved}
          onRenameUnavailable={onFileExplorerRenameUnavailable}
          dirtyProjectDocumentRelativePaths={
            fileExplorerDirtyProjectDocumentRelativePaths
          }
          onMoveResultMessage={onFileExplorerMoveResultMessage}
          onActivateDocument={onActivateProjectDocument}
        />
      );
    case "search":
      return <SearchSidebar translate={translate} />;
    case "glossary":
      return (
        <GlossarySidebar
          projectRootPath={project?.rootPath ?? null}
          readOnly={project?.accessMode.kind === "readOnly"}
          highlightedEntryId={project ? highlightedGlossaryEntryId : null}
          refreshToken={glossaryRefreshToken}
          translate={translate}
          onActivateEntry={onActivateGlossaryEntry}
          onCreateEntry={onCreateGlossaryEntry}
        />
      );
  }
}
