/**
 * #407 B4 Remediation: Extracted App-level dependencies for image attachment paste.
 *
 * Implements target resolution, position resolution, cached marker clearing,
 * link insertion (both live active editor and cached inactive document states),
 * and project settings saving from the paste prompt dialog.
 */

import { editorIdEquals, serializeEditorId } from "../shared/editorId";
import type {
  ImageAttachmentPastePreparationResult,
  PendingImageAttachment
} from "./clipboardImageAttachment";
import type {
  ImageAttachmentPasteTargetResolution,
  InsertMarkdownImageLinkRequest,
  SaveProjectSettingsFromPromptResult
} from "./imageAttachmentPasteOrchestration";
import {
  clearPendingImageAttachmentPosition,
  resolvePendingImageAttachmentPosition
} from "./markdownImageAttachmentPositionTracker";
import type {
  MarkdownEditorParagraphIndentController,
  MarkdownImageAttachmentPositionController
} from "./MarkdownEditor";
import {
  applyChangesToCachedMarkdownEditorDocumentState,
  type MarkdownEditorDocumentState
} from "./markdownEditorDocumentState";
import {
  isProjectCurrentDocument,
  updateCurrentDocumentContent
} from "./currentDocument";
import {
  currentEditorTitle,
  markdownDocumentForEditor,
  updateGlossaryDescriptionEditorText,
  type CurrentEditor
} from "./currentEditor";
import type { MarkdownImageLinkBase } from "../shared/markdownImageLink";
import type { OpenDocumentsState } from "./openDocuments";
import { updateOpenEditor } from "./openDocuments";
import type {
  ApplicationSettings,
  EffectiveImageAttachmentSettings,
  ProjectSettings
} from "../shared/settings";
import { buildImageAttachmentPasteProjectSettingsRequest } from "./imageAttachmentProjectSettings";
import type { UpdateProjectSettingsRequest } from "../shared/api";

export function imageAttachmentSourceEditorId(
  projectFilePath: string,
  documentId: string
): string {
  return JSON.stringify({
    projectFilePath,
    documentId
  });
}

/**
 * #573 Slice 6: an open editor an image can be pasted into — a project
 * Markdown document (links relative to its own folder) or a glossary
 * Description tab (links relative to the project root, the base its Preview
 * already resolves against). `null` for anything else.
 */
interface ImageAttachmentPasteSurface {
  readonly imageLinkBase: MarkdownImageLinkBase;
  readonly documentName: string;
  /** The editor's current text, for inserting into a cached (inactive) state. */
  readonly text: string;
}

type ImageAttachmentPasteSurfaceResolution =
  | { readonly ok: true; readonly surface: ImageAttachmentPasteSurface }
  | {
      readonly ok: false;
      readonly reason: "targetDocumentUnavailable" | "projectNotOpen";
    };

function imageAttachmentPasteSurfaceForEditor(
  editor: CurrentEditor
): ImageAttachmentPasteSurfaceResolution {
  if (editor.kind === "glossaryDescription") {
    return {
      ok: true,
      surface: {
        imageLinkBase: { kind: "projectRoot" },
        documentName: currentEditorTitle(editor),
        text: editor.draft.description
      }
    };
  }

  const markdownDocument = markdownDocumentForEditor(editor);

  if (!markdownDocument) {
    return { ok: false, reason: "targetDocumentUnavailable" };
  }

  if (!isProjectCurrentDocument(markdownDocument)) {
    return { ok: false, reason: "projectNotOpen" };
  }

  return {
    ok: true,
    surface: {
      imageLinkBase: {
        kind: "sourceFile",
        sourceMarkdownProjectRelativePath: markdownDocument.relativePath
      },
      documentName: markdownDocument.name,
      text: markdownDocument.content
    }
  };
}

export interface ImageAttachmentProjectContext {
  readonly activeProjectFilePath: string;
  readonly accessMode: { readonly kind: "readWrite" | "readOnly" };
  readonly config?: { readonly settings?: ProjectSettings } | null;
}

export function resolveImageAttachmentPosition(
  pending: PendingImageAttachment,
  useLiveActiveEditor: boolean,
  liveController: MarkdownImageAttachmentPositionController | null,
  cachedDocumentStates: ReadonlyMap<string, MarkdownEditorDocumentState>
): { ok: true; position: number } | { ok: false } | null {
  if (useLiveActiveEditor && liveController) {
    return liveController.resolvePendingPosition(pending.positionTrackingId);
  }

  const cached = cachedDocumentStates.get(pending.sourceDocumentId);
  return cached
    ? resolvePendingImageAttachmentPosition(
        cached.state,
        pending.positionTrackingId
      )
    : null;
}

export interface ResolveImageAttachmentPasteTargetInput {
  readonly pending: PendingImageAttachment;
  readonly openDocumentsState: OpenDocumentsState;
  readonly isEditorAreaSpecialTabActive: boolean;
  readonly currentProject: ImageAttachmentProjectContext | null;
  readonly isLifecycleCommitBarrierActive: boolean;
  readonly livePositionController: MarkdownImageAttachmentPositionController | null;
  readonly cachedDocumentStates: ReadonlyMap<string, MarkdownEditorDocumentState>;
}

export function resolveImageAttachmentPasteTarget({
  pending,
  openDocumentsState,
  isEditorAreaSpecialTabActive,
  currentProject,
  isLifecycleCommitBarrierActive,
  livePositionController,
  cachedDocumentStates
}: ResolveImageAttachmentPasteTargetInput): ImageAttachmentPasteTargetResolution {
  const openDocument = openDocumentsState.documents.find(
    (candidate) => serializeEditorId(candidate.id) === pending.sourceDocumentId
  );

  if (!openDocument) {
    return { ok: false, reason: "targetDocumentUnavailable" };
  }

  const pasteSurface = imageAttachmentPasteSurfaceForEditor(openDocument.editor);

  if (!pasteSurface.ok) {
    return { ok: false, reason: pasteSurface.reason };
  }

  if (!currentProject) {
    return { ok: false, reason: "projectNotOpen" };
  }

  const expectedSourceEditorId = imageAttachmentSourceEditorId(
    currentProject.activeProjectFilePath,
    pending.sourceDocumentId
  );
  if (
    pending.sourceEditorId !== undefined &&
    pending.sourceEditorId !== expectedSourceEditorId
  ) {
    return { ok: false, reason: "targetDocumentUnavailable" };
  }

  if (
    currentProject.accessMode.kind === "readOnly" ||
    isLifecycleCommitBarrierActive
  ) {
    return { ok: false, reason: "targetDocumentReadOnly" };
  }

  const useLiveActiveEditor =
    !isEditorAreaSpecialTabActive &&
    openDocumentsState.activeDocumentId !== null &&
    editorIdEquals(openDocument.id, openDocumentsState.activeDocumentId) &&
    livePositionController !== null;

  const resolvedPosition = resolveImageAttachmentPosition(
    pending,
    useLiveActiveEditor,
    livePositionController,
    cachedDocumentStates
  );

  if (resolvedPosition === null) {
    return { ok: false, reason: "positionUnavailable" };
  }
  if (!resolvedPosition.ok) {
    return { ok: false, reason: "positionDeleted" };
  }

  return {
    ok: true,
    target: {
      documentId: pending.sourceDocumentId,
      imageLinkBase: pasteSurface.surface.imageLinkBase,
      documentName: pasteSurface.surface.documentName,
      isActive: useLiveActiveEditor,
      position: resolvedPosition.position
    }
  };
}

export interface ClearImageAttachmentPendingPositionInput {
  readonly result: ImageAttachmentPastePreparationResult;
  readonly openDocumentsState: OpenDocumentsState;
  readonly isEditorAreaSpecialTabActive: boolean;
  readonly livePositionController: MarkdownImageAttachmentPositionController | null;
  readonly cachedDocumentStates: Map<string, MarkdownEditorDocumentState>;
}

export function clearImageAttachmentPendingPosition({
  result,
  openDocumentsState,
  isEditorAreaSpecialTabActive,
  livePositionController,
  cachedDocumentStates
}: ClearImageAttachmentPendingPositionInput): void {
  const sourceDocumentId = result.ok
    ? result.pending.sourceDocumentId
    : result.sourceDocumentId;
  const positionTrackingId = result.ok
    ? result.pending.positionTrackingId
    : result.positionTrackingId;
  const activeDocumentId = openDocumentsState.activeDocumentId;

  if (
    activeDocumentId !== null &&
    serializeEditorId(activeDocumentId) === sourceDocumentId &&
    !isEditorAreaSpecialTabActive
  ) {
    livePositionController?.clearPendingPosition(positionTrackingId);
  }

  const cached = cachedDocumentStates.get(sourceDocumentId);
  if (!cached) {
    return;
  }

  const nextState = cached.state.update({
    effects: clearPendingImageAttachmentPosition.of(positionTrackingId)
  }).state;
  cachedDocumentStates.set(sourceDocumentId, {
    ...cached,
    state: nextState
  });
}

export interface InsertMarkdownImageLinkIntoTargetInput {
  readonly request: InsertMarkdownImageLinkRequest;
  readonly openDocumentsState: OpenDocumentsState;
  readonly isEditorAreaSpecialTabActive: boolean;
  readonly currentProject: ImageAttachmentProjectContext | null;
  readonly isLifecycleCommitBarrierActive: boolean;
  readonly livePositionController: MarkdownImageAttachmentPositionController | null;
  readonly liveParagraphIndentController: MarkdownEditorParagraphIndentController | null;
  readonly cachedDocumentStates: Map<string, MarkdownEditorDocumentState>;
  readonly setOpenDocumentsState: (next: OpenDocumentsState) => void;
}

export function insertMarkdownImageLinkIntoTarget({
  request,
  openDocumentsState,
  isEditorAreaSpecialTabActive,
  currentProject,
  isLifecycleCommitBarrierActive,
  livePositionController,
  liveParagraphIndentController,
  cachedDocumentStates,
  setOpenDocumentsState
}: InsertMarkdownImageLinkIntoTargetInput): boolean {
  const openDocument = openDocumentsState.documents.find(
    (candidate) => serializeEditorId(candidate.id) === request.target.documentId
  );

  const pasteSurface = openDocument
    ? imageAttachmentPasteSurfaceForEditor(openDocument.editor)
    : null;

  if (
    !openDocument ||
    !pasteSurface?.ok ||
    currentProject?.accessMode.kind === "readOnly" ||
    isLifecycleCommitBarrierActive
  ) {
    return false;
  }

  const change = [
    {
      from: request.target.position,
      to: request.target.position,
      insert: request.markdownLink
    }
  ];
  const useLiveActiveEditor =
    !isEditorAreaSpecialTabActive &&
    openDocumentsState.activeDocumentId !== null &&
    editorIdEquals(openDocument.id, openDocumentsState.activeDocumentId) &&
    livePositionController !== null;

  if (useLiveActiveEditor) {
    return (
      liveParagraphIndentController?.applyReplaceInBufferChanges(change) ?? false
    );
  }

  const cached = cachedDocumentStates.get(request.target.documentId);
  const transactionResult = cached
    ? applyChangesToCachedMarkdownEditorDocumentState(
        cached,
        pasteSurface.surface.text,
        change,
        "input.replace"
      )
    : null;

  if (!transactionResult) {
    return false;
  }

  cachedDocumentStates.set(
    request.target.documentId,
    transactionResult.nextDocumentState
  );
  const nextState = updateOpenEditor(
    openDocumentsState,
    openDocument.id,
    (editor) =>
      editor.kind === "markdown"
        ? {
            ...editor,
            document: updateCurrentDocumentContent(
              editor.document,
              transactionResult.content,
              transactionResult.lineEndingBreaks
            )
          }
        : // #573 Slice 6: an inactive glossary Description tab's draft.
          updateGlossaryDescriptionEditorText(
            editor,
            transactionResult.content,
            transactionResult.lineEndingBreaks
          )
  );
  setOpenDocumentsState(nextState);
  return true;
}

export interface SaveImageAttachmentProjectSettingsFromPromptInput {
  readonly nextSettings: EffectiveImageAttachmentSettings;
  readonly pending: PendingImageAttachment;
  readonly currentProject: ImageAttachmentProjectContext | null;
  readonly applicationSettings: ApplicationSettings;
  readonly saveProjectSettings: (
    request: UpdateProjectSettingsRequest
  ) => Promise<ProjectSettings | undefined>;
}

export async function saveImageAttachmentProjectSettingsFromPrompt({
  nextSettings,
  pending,
  currentProject,
  applicationSettings,
  saveProjectSettings
}: SaveImageAttachmentProjectSettingsFromPromptInput): Promise<SaveProjectSettingsFromPromptResult> {
  if (!currentProject) {
    return "targetStale";
  }
  const expectedSourceEditorId = imageAttachmentSourceEditorId(
    currentProject.activeProjectFilePath,
    pending.sourceDocumentId
  );
  if (
    pending.sourceEditorId !== undefined &&
    pending.sourceEditorId !== expectedSourceEditorId
  ) {
    return "targetStale";
  }

  const request = buildImageAttachmentPasteProjectSettingsRequest({
    nextSettings,
    applicationSettings,
    projectSettings: currentProject.config?.settings
  });
  if (!request) {
    return "saved";
  }
  try {
    const updatedSettings = await saveProjectSettings(request);
    return updatedSettings !== undefined ? "saved" : "settingsSaveFailed";
  } catch {
    return "settingsSaveFailed";
  }
}
