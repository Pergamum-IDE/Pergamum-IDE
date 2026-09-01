import type { FileExplorerEntry, PergamumProject } from "../shared/api";
import type { ProjectDocumentPathRelocation } from "../shared/projectMove";
import type { CreateGlossaryEntryInput, GlossaryEntryId } from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import {
  FileExplorer,
  type FileExplorerCreateEntryRequest,
  type FileExplorerRefreshDirectoriesRequest,
  type FileExplorerRenameEntryRequest,
  type FileExplorerRevealRequest
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
  /** #344: re-list project directories after a Recovery restore added files
   *  outside the File Explorer's own flows. Consumed once per token. */
  fileExplorerRefreshDirectoriesRequest?: FileExplorerRefreshDirectoriesRequest | null;
  /** #355: an explicit "Select in File Explorer" request from a document tab.
   *  Consumed once per token. */
  fileExplorerRevealRequest?: FileExplorerRevealRequest | null;
  translate: Translate;
  onActivateProjectDocument: (relativePath: string) => void;
  onFileExplorerCreateEntryRequestHandled: () => void;
  onFileExplorerRenameEntryRequestHandled?: () => void;
  onFileExplorerRefreshDirectoriesRequestHandled?: () => void;
  onFileExplorerRevealRequestHandled?: () => void;
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
  /** #351: after a File Explorer delete run settles, the project-relative
   *  paths that were actually removed. */
  onFileExplorerEntriesDeleted?: (
    deletedRelativePaths: readonly string[]
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
  fileExplorerRefreshDirectoriesRequest = null,
  fileExplorerRevealRequest = null,
  translate,
  onActivateProjectDocument,
  onFileExplorerCreateEntryRequestHandled,
  onFileExplorerRenameEntryRequestHandled,
  onFileExplorerRefreshDirectoriesRequestHandled,
  onFileExplorerRevealRequestHandled,
  isFileExplorerProjectDocumentDirty,
  onFileExplorerProjectDocumentRenamed,
  onFileExplorerProjectDocumentsMoved,
  onFileExplorerEntriesDeleted,
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
          refreshDirectoriesRequest={fileExplorerRefreshDirectoriesRequest}
          onRefreshDirectoriesRequestHandled={
            onFileExplorerRefreshDirectoriesRequestHandled
          }
          revealRequest={fileExplorerRevealRequest}
          onRevealRequestHandled={onFileExplorerRevealRequestHandled}
          isProjectDocumentDirty={isFileExplorerProjectDocumentDirty}
          onProjectDocumentRenamed={onFileExplorerProjectDocumentRenamed}
          onProjectDocumentsMoved={onFileExplorerProjectDocumentsMoved}
          onEntriesDeleted={onFileExplorerEntriesDeleted}
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
