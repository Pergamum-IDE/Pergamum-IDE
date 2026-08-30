import type { PergamumProject } from "../shared/api";
import type { CreateGlossaryEntryInput, GlossaryEntryId } from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import {
  FileExplorer,
  type FileExplorerCreateEntryRequest
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
  translate: Translate;
  onActivateProjectDocument: (relativePath: string) => void;
  onFileExplorerCreateEntryRequestHandled: () => void;
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
  translate,
  onActivateProjectDocument,
  onFileExplorerCreateEntryRequestHandled,
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
