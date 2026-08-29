/**
 * Phase 6-4-3: turn the renderer's live dirty Markdown working copies into
 * `RecoveryDocumentPayload`s for the Recovery Store.
 *
 * Pure and side-effect free (no IPC, no disk). The coordinator diffs and
 * sends what this produces.
 *
 *   - `payloadText` is the FULL body, line-ending-reconstructed exactly the
 *     way a save would write it (no diff / incremental encoding).
 *   - the base fingerprint (`baseSize` / `baseSha256`) is computed from the
 *     SAVED baseline's canonical serialization — the persisted state this
 *     working copy diverged from — NOT from the current dirty content, and
 *     it never changes between dirty edits (only load / save move the
 *     baseline). `baseMtimeMs` is `null` in this phase.
 *   - Untitled documents carry `null` encoding / line-end / base
 *     fingerprint (no source file — never defaulted).
 */

import type { ActiveProjectContext } from "../../shared/editorId";
import { createFileEditorIdForPath } from "../../shared/editorId";
import type { PergamumProject } from "../../shared/api";
import type {
  RecoveryDocumentLineEnd,
  RecoveryDocumentPayload
} from "../../shared/recoveryDocument";
import {
  recoveryFileDocumentKey,
  recoveryFileSourceUri,
  recoveryUntitledDocumentKey,
  recoveryUntitledSourceUri
} from "../../shared/recoveryDocument";
import { sha256Hex } from "../editorContentDigest";
import { lineEndingBreakSetToArray } from "../editorLineEndingField";
import { serializeLineEndings } from "../lineEndingTracking";
import {
  documentReadLineEnding,
  type CurrentDocument
} from "../currentDocument";
import type { CurrentEditor } from "../currentEditor";
import {
  isCurrentEditorDirty,
  markdownDocumentForEditor
} from "../currentEditor";
import type { OpenDocumentsState } from "../openDocuments";

export interface RecoveryDirtyDocument {
  readonly documentKey: string;
  readonly payload: RecoveryDocumentPayload;
}

export interface RecoveryDocumentBuildContext {
  readonly project: PergamumProject | null;
  readonly activeProjectContext: ActiveProjectContext | null;
}

function normalizeAbsolutePath(absolutePath: string): string | null {
  try {
    const editorId = createFileEditorIdForPath(absolutePath);
    return editorId.kind === "file" ? editorId.path : null;
  } catch {
    return null;
  }
}

function joinProjectPath(rootPath: string, relativePath: string): string {
  return `${rootPath.replace(/[\\/]+$/, "")}/${relativePath}`;
}

function toRecoveryLineEnd(
  document: CurrentDocument
): RecoveryDocumentLineEnd | null {
  if (document.kind === "untitled") {
    return null;
  }

  const detected = documentReadLineEnding(document);

  return detected === "lf" || detected === "crlf" || detected === "cr"
    ? detected
    : "unknown";
}

function serializedBody(document: CurrentDocument): string {
  return serializeLineEndings(
    document.content,
    lineEndingBreakSetToArray(document.lineEndingBreaks)
  );
}

function canonicalSavedBaseline(document: CurrentDocument): string {
  return serializeLineEndings(
    document.savedContent,
    lineEndingBreakSetToArray(document.savedLineEndingBreaks)
  );
}

/**
 * The Recovery `document_key` for one open editor, or `null` for kinds that
 * are not a recoverable Markdown working copy (Glossary; a project document
 * with no active project context to resolve its absolute path).
 */
export function recoveryDocumentKeyForEditor(
  editor: CurrentEditor,
  context: RecoveryDocumentBuildContext
): string | null {
  const document = markdownDocumentForEditor(editor);

  if (!document) {
    return null;
  }

  return recoveryDocumentKeyForDocument(document, context);
}

export function recoveryDocumentKeyForDocument(
  document: CurrentDocument,
  context: RecoveryDocumentBuildContext
): string | null {
  if (document.kind === "untitled") {
    return recoveryUntitledDocumentKey(document.untitledId);
  }

  const absolutePath =
    document.kind === "file"
      ? document.path
      : context.activeProjectContext
        ? joinProjectPath(
            context.activeProjectContext.rootPath,
            document.relativePath
          )
        : null;

  if (absolutePath === null) {
    return null;
  }

  const normalized = normalizeAbsolutePath(absolutePath);

  return normalized === null ? null : recoveryFileDocumentKey(normalized);
}

/**
 * Build the full Recovery payload for one Markdown document, or `null` when
 * its identity cannot be resolved.
 */
export function buildRecoveryDocumentPayload(
  document: CurrentDocument,
  context: RecoveryDocumentBuildContext
): RecoveryDocumentPayload | null {
  const payloadText = serializedBody(document);

  if (document.kind === "untitled") {
    return {
      documentKey: recoveryUntitledDocumentKey(document.untitledId),
      documentType: "markdown.untitled",
      sourceUri: recoveryUntitledSourceUri(document.untitledId),
      displayName: document.name,
      projectId: null,
      projectFilePath: null,
      filePath: null,
      documentEncoding: null,
      documentLineend: null,
      baseMtimeMs: null,
      baseSize: null,
      baseSha256: null,
      payloadText
    };
  }

  const absolutePath =
    document.kind === "file"
      ? document.path
      : context.activeProjectContext
        ? joinProjectPath(
            context.activeProjectContext.rootPath,
            document.relativePath
          )
        : null;

  if (absolutePath === null) {
    return null;
  }

  const normalized = normalizeAbsolutePath(absolutePath);

  if (normalized === null) {
    return null;
  }

  const baseline = canonicalSavedBaseline(document);

  return {
    documentKey: recoveryFileDocumentKey(normalized),
    documentType: "markdown.file",
    sourceUri: recoveryFileSourceUri(normalized),
    displayName: document.name,
    // Phase 6-4-3: `project_id` is main-side identity only — not resolvable
    // here — so it is left null; `project_file_path` carries the linkage.
    projectId: null,
    projectFilePath:
      document.kind === "project"
        ? (context.project?.activeProjectFilePath ?? null)
        : null,
    filePath: normalized,
    documentEncoding: document.readEncoding,
    documentLineend: toRecoveryLineEnd(document),
    // mtime is not captured in Phase 6-4-3.
    baseMtimeMs: null,
    baseSize: new TextEncoder().encode(baseline).length,
    baseSha256: sha256Hex(baseline),
    payloadText
  };
}

/**
 * Every currently-dirty Markdown working copy as a Recovery payload. Clean
 * documents and Glossary editors are excluded (nothing to protect).
 */
export function buildRecoveryDirtyDocuments(
  openDocumentsState: OpenDocumentsState,
  context: RecoveryDocumentBuildContext
): RecoveryDirtyDocument[] {
  const dirty: RecoveryDirtyDocument[] = [];

  for (const openDocument of openDocumentsState.documents) {
    const document = markdownDocumentForEditor(openDocument.editor);

    if (!document || !isCurrentEditorDirty(openDocument.editor)) {
      continue;
    }

    const payload = buildRecoveryDocumentPayload(document, context);

    if (payload) {
      dirty.push({ documentKey: payload.documentKey, payload });
    }
  }

  return dirty;
}
