import type { FileExplorerEntry, PergamumProject } from "../shared/api";
import type { DocumentMapSettings } from "../shared/documentMapSettings";
import type { ProjectDocumentPathRelocation } from "../shared/projectMove";
import type {
  CreateGlossaryEntryInput,
  GlossaryEntry,
  GlossaryEntryId,
  GlossaryTag
} from "../shared/glossary";
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
import { TextMapPanel } from "./TextMapPanel";
import {
  DocumentNavigationPanel,
  type DocumentNavigationFileInfo
} from "./DocumentNavigationPanel";
import type { DocumentNavigationAnalysis } from "./documentNavigationAnalysis";
import { WorkbenchFilesSidebar } from "./WorkbenchFilesSidebar";
import type {
  MarkdownOutlineItem,
  MarkdownOutlineParseResult
} from "../shared/markdownOutline";
import type { EditorVisibleTextRange } from "./editorVisibleRange";
import type { EditorScrollAlign } from "./editorScrollAlign";
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
  /** #375: active Markdown document body for glossary occurrence counts. */
  glossaryActiveDocumentContent: string | null;
  /** #375 Text Map: every project glossary entry (occurrence scan). */
  textMapGlossaryEntries?: readonly GlossaryEntry[];
  /** #375 Text Map: project-wide tags (sort_order order) for the "Render
   *  tags" multi-select. */
  textMapGlossaryTags?: readonly GlossaryTag[];
  /** #375 Text Map: the ACTIVE EDITOR's rendered width in CSS pixels (the
   *  logical wrap width), or `null` when it cannot be measured. */
  textMapEditorWidth?: number | null;
  /** #375 Text Map: the active Markdown editor's on-screen document range,
   *  drawn as a "you are here" rectangle. `null` = no overlay. */
  textMapEditorVisibleRange?: EditorVisibleTextRange | null;
  /** #375 Text Map: `documentMap` settings — draw colours + dialogue pairs. */
  textMapDocumentMapSettings?: DocumentMapSettings;
  /** #375 Text Map: navigation — a resolved 0-based source line to scroll the
   *  active Markdown editor to (navigation only). `options.align` is `"center"`
   *  for click-to-scroll, `"start"` for viewport-lens drag. */
  onTextMapNavigateToLine?: (
    lineIndex: number,
    options?: { align?: EditorScrollAlign }
  ) => void;
  onNavigateGlossaryOccurrence: (
    entry: GlossaryEntry,
    direction: "previous" | "next"
  ) => void;
  /** #352: the ACTIVE Markdown document's heading outline (working text), or
   *  `null` when there is no active Markdown document. */
  markdownOutline?: MarkdownOutlineParseResult | null;
  /** #352: whether the active editor is a Markdown document (drives the
   *  Outline pane's empty vs. unavailable state). */
  activeEditorIsMarkdown?: boolean;
  /** #352: serialized identity of the active document. Drives clearing the
   *  Outline tree item collapsed state on document change. */
  activeOutlineDocumentKey?: string | null;
  /** #352: jump the editor to a clicked outline heading. */
  onOutlineHeadingClick?: (item: MarkdownOutlineItem) => void;
  /** #360: whether any document tab is active (Markdown or not). Drives the
   *  Document Navigation pane's "no active document" empty state. */
  hasActiveDocument?: boolean;
  /** #360: the active Markdown document's character count — the SAME value
   *  the status bar shows (#259). `null` while the shared debounced count
   *  has not resolved for the current document. */
  documentNavigationCharacterCount?: number | null;
  /** #360 Phase 2: the active document's glossary / tag / dialogue analysis,
   *  or `null` while the debounced analysis has not resolved. */
  documentNavigationAnalysis?: DocumentNavigationAnalysis | null;
  /** #360: the active Markdown document's backing-file last-modified time /
   *  unsaved / unavailable state, or `null` when there is no active
   *  Markdown file. */
  documentNavigationFileInfo?: DocumentNavigationFileInfo | null;
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
  onCreateGlossaryEntry,
  glossaryActiveDocumentContent,
  textMapGlossaryEntries = [],
  textMapGlossaryTags = [],
  textMapEditorWidth = null,
  textMapEditorVisibleRange = null,
  textMapDocumentMapSettings,
  onTextMapNavigateToLine,
  onNavigateGlossaryOccurrence,
  markdownOutline = null,
  activeEditorIsMarkdown = false,
  activeOutlineDocumentKey = null,
  onOutlineHeadingClick = () => undefined,
  hasActiveDocument = false,
  documentNavigationCharacterCount = null,
  documentNavigationAnalysis = null,
  documentNavigationFileInfo = null
}: WorkspaceSidebarProps): JSX.Element {
  switch (mode) {
    case "files":
      return (
        <WorkbenchFilesSidebar
          key={project?.rootPath ?? "no-project"}
          translate={translate}
          markdownOutline={markdownOutline}
          activeEditorIsMarkdown={activeEditorIsMarkdown}
          activeOutlineDocumentKey={activeOutlineDocumentKey}
          onOutlineHeadingClick={onOutlineHeadingClick}
          fileExplorer={
            <FileExplorer
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
              refreshDirectoriesRequest={
                fileExplorerRefreshDirectoriesRequest
              }
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
          }
        />
      );
    case "search":
      return <SearchSidebar translate={translate} />;
    case "textMap":
      return (
        <TextMapPanel
          translate={translate}
          activeDocumentContent={glossaryActiveDocumentContent}
          glossaryEntries={textMapGlossaryEntries}
          glossaryTags={textMapGlossaryTags}
          editorWidth={textMapEditorWidth}
          editorVisibleRange={textMapEditorVisibleRange}
          documentMapSettings={textMapDocumentMapSettings}
          onNavigateToLine={onTextMapNavigateToLine}
        />
      );
    case "documentNavigation":
      return (
        <DocumentNavigationPanel
          translate={translate}
          hasActiveDocument={hasActiveDocument}
          activeEditorIsMarkdown={activeEditorIsMarkdown}
          characterCount={documentNavigationCharacterCount}
          analysis={documentNavigationAnalysis}
          fileInfo={documentNavigationFileInfo}
        />
      );
    case "glossary":
      return (
        <GlossarySidebar
          projectRootPath={project?.rootPath ?? null}
          readOnly={project?.accessMode.kind === "readOnly"}
          highlightedEntryId={project ? highlightedGlossaryEntryId : null}
          refreshToken={glossaryRefreshToken}
          translate={translate}
          activeDocumentContent={glossaryActiveDocumentContent}
          onActivateEntry={onActivateGlossaryEntry}
          onCreateEntry={onCreateGlossaryEntry}
          onNavigateOccurrence={onNavigateGlossaryOccurrence}
        />
      );
  }
}
