import type { PergamumProject } from "../shared/api";
import type { CreateGlossaryEntryInput, GlossaryEntryId } from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import { FileExplorer } from "./FileExplorer";
import { GlossarySidebar } from "./GlossarySidebar";
import { SearchSidebar } from "./SearchSidebar";
import type { SidebarMode } from "./sidebarMode";

interface WorkspaceSidebarProps {
  mode: SidebarMode;
  project: PergamumProject | null;
  highlightedProjectDocumentRelativePath: string | null;
  highlightedGlossaryEntryId: GlossaryEntryId | null;
  glossaryRefreshToken: number;
  translate: Translate;
  onActivateProjectDocument: (relativePath: string) => void;
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
  translate,
  onActivateProjectDocument,
  onActivateGlossaryEntry,
  onCreateGlossaryEntry
}: WorkspaceSidebarProps): JSX.Element {
  switch (mode) {
    case "files":
      return (
        <FileExplorer
          key={project?.rootPath ?? "no-project"}
          documents={project?.documents ?? []}
          highlightedRelativePath={
            project ? highlightedProjectDocumentRelativePath : null
          }
          translate={translate}
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
