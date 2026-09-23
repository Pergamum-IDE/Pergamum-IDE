import { useCallback, useMemo } from "react";
import deleteIcon from "../../assets/icons/feather/glossary/delete.svg?raw";
import type { GlossaryTag } from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import type {
  ApplicationEditorWhitespaceSettings,
  ExpectedLineEnding,
  LineEndingMarkerGlyph,
  NewFileLineEnding
} from "../shared/settings";
import type { MarkdownImageLinkDiagnosticReason } from "../shared/api";
import { GlossaryEntryMetadataFields } from "./GlossaryEntryMetadataFields";
import {
  representativeGlossaryAtomDraft,
  type GlossaryEntryDraft
} from "./glossaryEntryDraft";
import { representativeGlossarySurface } from "./glossaryPresentation";
import { analyzeLineEndings } from "./lineEndingTracking";
import { MarkdownEditor } from "./MarkdownEditor";
import { formatMarkdownImageLinkDiagnosticMessage } from "./markdownImageLinkDiagnosticMessage";
import { markdownPreviewRenderer } from "./preview/markdownPreviewRenderer";
import type { ProjectLocalImageResolutionContext } from "../shared/projectLocalImageLink";

// #412: Glossary vocabulary text has no source-file location, so both its
// Preview AND its broken-image-link diagnostics resolve project-local image
// links against the PROJECT ROOT. Module-level constant → stable identity, no
// fallback to any other base. The main-process `pergamum-asset://` handler /
// diagnostics IPC own the real project root + validation.
const GLOSSARY_PREVIEW_IMAGE_RESOLUTION: ProjectLocalImageResolutionContext = {
  kind: "projectRoot"
};
const DIAGNOSTICS_DISABLED: ProjectLocalImageResolutionContext = {
  kind: "none"
};

/** #436 Slice 9: `"create"` hides the delete button (nothing persisted yet
 *  to delete) — everything else renders identically in both modes. */
export type GlossaryEditorMode = "create" | "edit";

interface GlossaryEditorProps {
  mode: GlossaryEditorMode;
  draft: GlossaryEntryDraft;
  /** Every tag defined in the project, for the attach/detach picker. */
  availableTags: readonly GlossaryTag[];
  translate: Translate;
  onChangeDescription: (description: string) => void;
  onAddAtom: () => void;
  onChangeAtomValue: (atomId: string, value: string) => void;
  onChangeAtomMatchFlags: (atomId: string, matchFlags: number) => void;
  onDeleteAtom: (atomId: string) => void;
  /**
   * #375: move `atomId` to array index `toIndex` (array order = `sortOrder`,
   * index 0 = representative). Driven by the per-row drag handle (D&D) and
   * its Arrow Up / Down keyboard fallback.
   */
  onReorderAtom: (atomId: string, toIndex: number) => void;
  /**
   * #375: ORDERED tag assignment (two-list editor). `onAssignTag` inserts a
   * tag at array index `toIndex` (right → left, or reorder within assigned);
   * `onUnassignTag` removes it (left → right); `onReorderAssignedTag` moves an
   * already-assigned tag. Index 0 is the entry's PRIMARY tag. Draft-only until
   * the entry is saved.
   */
  onAssignTag: (tagId: string, toIndex: number) => void;
  onUnassignTag: (tagId: string) => void;
  onReorderAssignedTag: (tagId: string, toIndex: number) => void;
  /**
   * #375: open the dedicated Glossary Tag Manager tab — the "I need a tag
   * that doesn't exist yet" escape hatch from the tag picker.
   */
  onOpenTagManager: () => void;
  onDeleteEntry: () => void;
  readOnly?: boolean;
  /**
   * #412 Blocker 1: the SAME global editor settings the main Markdown editor
   * uses, so the description field's line-break marker / whitespace rendering
   * follows Application Settings instead of MarkdownEditor's built-in
   * defaults. Passed through from EditorSurface.
   */
  markerGlyph: LineEndingMarkerGlyph;
  expectedLineEnding: ExpectedLineEnding;
  newFileLineEndingFallback: NewFileLineEnding;
  whitespaceSettings: ApplicationEditorWhitespaceSettings;
  undoHistoryMinDepth: number;
}

export function GlossaryEditor({
  mode,
  draft,
  availableTags,
  translate,
  onChangeDescription,
  onAddAtom,
  onChangeAtomValue,
  onChangeAtomMatchFlags,
  onDeleteAtom,
  onReorderAtom,
  onAssignTag,
  onUnassignTag,
  onReorderAssignedTag,
  onOpenTagManager,
  onDeleteEntry,
  readOnly = false,
  markerGlyph,
  expectedLineEnding,
  newFileLineEndingFallback,
  whitespaceSettings,
  undoHistoryMinDepth
}: GlossaryEditorProps): JSX.Element {
  const title =
    representativeGlossaryAtomDraft(draft)?.value.trim() ||
    representativeGlossarySurface(draft.entry);
  const descriptionHtml = markdownPreviewRenderer.render(draft.description, {
    projectLocalImageResolution: GLOSSARY_PREVIEW_IMAGE_RESOLUTION
  });

  // #412 Blocker 1: a stable per-entry key so switching entries rebuilds the
  // editor state (and its settings-driven compartments) while typing does
  // not. #412 Blocker 2: `projectRoot` diagnostics unless the entry is
  // read-only.
  const descriptionEditorKey = `glossary-description:${draft.entry.id}`;
  // Seed the line-ending tracking field from the loaded description so the
  // marker feature has breaks to decorate immediately — recomputed only on
  // an entry switch, never per keystroke (mirrors MarkdownEditorSurface).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialDescriptionLineEndingBreaks = useMemo(
    () => analyzeLineEndings(draft.description),
    [descriptionEditorKey]
  );
  const imageLinkDiagnosticsResolutionContext = readOnly
    ? DIAGNOSTICS_DISABLED
    : GLOSSARY_PREVIEW_IMAGE_RESOLUTION;
  const formatImageLinkDiagnosticMessage = useCallback(
    (reason: MarkdownImageLinkDiagnosticReason, src: string) =>
      formatMarkdownImageLinkDiagnosticMessage(translate, reason, src),
    [translate]
  );

  return (
    <section
      className="glossaryEditor"
      aria-label={translate("glossaryEditor.label")}
    >
      <header className="glossaryEditorHeader">
        <h1>{title}</h1>
        {mode === "edit" ? (
          <button
            type="button"
            className="glossaryEditorDeleteButton"
            aria-label={translate("glossaryEditor.deleteEntry")}
            title={translate("glossaryEditor.deleteEntry")}
            disabled={readOnly}
            onClick={() => {
              if (!readOnly) {
                onDeleteEntry();
              }
            }}
          >
            <span
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: deleteIcon }}
            />
          </button>
        ) : null}
      </header>

      <GlossaryEntryMetadataFields
        draft={draft}
        availableTags={availableTags}
        translate={translate}
        onAddAtom={onAddAtom}
        onChangeAtomValue={onChangeAtomValue}
        onChangeAtomMatchFlags={onChangeAtomMatchFlags}
        onDeleteAtom={onDeleteAtom}
        onReorderAtom={onReorderAtom}
        onAssignTag={onAssignTag}
        onUnassignTag={onUnassignTag}
        onReorderAssignedTag={onReorderAssignedTag}
        onOpenTagManager={onOpenTagManager}
        readOnly={readOnly}
      />

      <section className="glossaryEditorSection glossaryEditorDescription">
        <h2>{translate("glossaryEditor.description")}</h2>
        <div className="workspace glossaryEditorDescriptionWorkspace">
          <section
            className="pane"
            aria-label={translate("workspace.markdownEditor")}
          >
            <MarkdownEditor
              value={draft.description}
              onChange={readOnly ? () => undefined : onChangeDescription}
              contextSurface="glossaryDescription"
              readOnly={readOnly}
              documentKey={descriptionEditorKey}
              initialLineEndingBreaks={initialDescriptionLineEndingBreaks}
              markerGlyph={markerGlyph}
              expectedLineEnding={expectedLineEnding}
              newFileLineEndingFallback={newFileLineEndingFallback}
              whitespaceSettings={whitespaceSettings}
              undoHistoryMinDepth={undoHistoryMinDepth}
              imageLinkDiagnosticsResolutionContext={
                imageLinkDiagnosticsResolutionContext
              }
              formatImageLinkDiagnosticMessage={
                formatImageLinkDiagnosticMessage
              }
            />
          </section>

          <section
            className="pane"
            aria-label={translate("workspace.markdownPreview")}
          >
            {draft.description.trim().length > 0 ? (
              <article
                className="preview glossaryDescriptionPreview"
                dangerouslySetInnerHTML={{ __html: descriptionHtml }}
              />
            ) : (
              <p className="glossaryEditorEmptyDescription">
                {translate("glossaryEditor.emptyDescription")}
              </p>
            )}
          </section>
        </div>
      </section>
    </section>
  );
}
