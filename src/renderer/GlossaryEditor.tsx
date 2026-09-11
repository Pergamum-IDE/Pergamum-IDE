import { useCallback, useMemo, useState } from "react";
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
import { pergamumContextSurfaceAttribute } from "../shared/editContextMenu";
import { GlossaryAtomMatchFlagsEditor } from "./GlossaryAtomMatchFlagsEditor";
import { GlossaryEntryTagAssignmentEditor } from "./GlossaryEntryTagAssignmentEditor";
import {
  glossaryEntryDraftValidity,
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

/** Private DataTransfer type — keeps atom reorder drags from mixing with
 *  File Explorer / tab reorder drags. */
const ATOM_REORDER_MIME = "application/x-pergamum-glossary-atom-reorder";

/** The grab-to-reorder glyph shown at the head of every atom row. */
const ATOM_DRAG_HANDLE_GLYPH = "⣿"; // ⣿

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
  // #375: transient drag state for atom reorder (D&D). `dropGap` is a slot
  // index in `[0, atoms.length]` — the position the dragged atom would land.
  const [draggedAtomId, setDraggedAtomId] = useState<string | null>(null);
  const [dropGap, setDropGap] = useState<number | null>(null);

  function clearAtomDrag(): void {
    setDraggedAtomId(null);
    setDropGap(null);
  }

  function atomDropGapFor(
    event: { clientY: number; currentTarget: HTMLElement },
    index: number
  ): number {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2 ? index + 1 : index;
  }

  const title =
    representativeGlossaryAtomDraft(draft)?.value.trim() ||
    representativeGlossarySurface(draft.entry);
  const descriptionHtml = markdownPreviewRenderer.render(draft.description, {
    projectLocalImageResolution: GLOSSARY_PREVIEW_IMAGE_RESOLUTION
  });
  const validity = glossaryEntryDraftValidity(draft);

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

      <section className="glossaryEditorSection">
        <h2>{translate("glossaryEditor.atoms.heading")}</h2>
        <ol className="glossaryEditorAtoms">
          {draft.atoms.map((atom, index) => {
            const reorderable = !readOnly && draft.atoms.length > 1;

            return (
              <li
                className="glossaryEditorAtomRow"
                key={atom.id}
                data-dragging={draggedAtomId === atom.id || undefined}
                data-drop-before={dropGap === index || undefined}
                data-drop-after={
                  dropGap === index + 1 && index === draft.atoms.length - 1
                    ? true
                    : undefined
                }
                onDragOver={(event) => {
                  if (
                    !reorderable ||
                    draggedAtomId === null ||
                    !Array.from(event.dataTransfer.types).includes(
                      ATOM_REORDER_MIME
                    )
                  ) {
                    return;
                  }
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  const gap = atomDropGapFor(event, index);
                  if (gap !== dropGap) {
                    setDropGap(gap);
                  }
                }}
                onDrop={(event) => {
                  if (!reorderable || draggedAtomId === null) {
                    return;
                  }
                  event.preventDefault();
                  const gap = atomDropGapFor(event, index);
                  const from = draft.atoms.findIndex(
                    (candidate) => candidate.id === draggedAtomId
                  );
                  const movedAtomId = draggedAtomId;
                  clearAtomDrag();
                  if (from !== -1) {
                    onReorderAtom(
                      movedAtomId,
                      gap > from ? gap - 1 : gap
                    );
                  }
                }}
              >
                <div className="glossaryEditorAtomRowMain">
                  <button
                    type="button"
                    className="glossaryEditorAtomDragHandle"
                    aria-label={translate("glossaryEditor.atoms.dragHandle")}
                    title={translate("glossaryEditor.atoms.dragHandle")}
                    draggable={reorderable}
                    disabled={!reorderable}
                    onDragStart={(event) => {
                      if (!reorderable) {
                        event.preventDefault();
                        return;
                      }
                      setDraggedAtomId(atom.id);
                      setDropGap(null);
                      event.dataTransfer.setData(ATOM_REORDER_MIME, atom.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={clearAtomDrag}
                    onKeyDown={(event) => {
                      if (!reorderable) {
                        return;
                      }
                      if (event.key === "ArrowUp" && index > 0) {
                        event.preventDefault();
                        onReorderAtom(atom.id, index - 1);
                      } else if (
                        event.key === "ArrowDown" &&
                        index < draft.atoms.length - 1
                      ) {
                        event.preventDefault();
                        onReorderAtom(atom.id, index + 1);
                      }
                    }}
                  >
                    <span aria-hidden="true">{ATOM_DRAG_HANDLE_GLYPH}</span>
                  </button>
                  {index === 0 ? (
                    <span className="glossaryEditorAtomRepresentativeBadge">
                      {translate("glossaryEditor.atoms.representative")}
                    </span>
                  ) : null}
                  <input
                    type="text"
                    className="glossaryEditorAtomValue"
                    value={atom.value}
                    aria-label={translate("glossaryEditor.atoms.value")}
                    readOnly={readOnly}
                    {...{
                      [pergamumContextSurfaceAttribute]: "glossaryAtomValue"
                    }}
                    onChange={(event) => {
                      if (!readOnly) {
                        onChangeAtomValue(atom.id, event.target.value);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="glossaryEditorAtomRemoveButton"
                    aria-label={translate("glossaryEditor.atoms.remove")}
                    title={translate("glossaryEditor.atoms.remove")}
                    disabled={readOnly || draft.atoms.length === 1}
                    onClick={() => {
                      if (!readOnly) {
                        onDeleteAtom(atom.id);
                      }
                    }}
                  >
                    <span
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{ __html: deleteIcon }}
                    />
                  </button>
                </div>
                <GlossaryAtomMatchFlagsEditor
                  matchFlags={atom.matchFlags}
                  translate={translate}
                  readOnly={readOnly}
                  onChange={(matchFlags) =>
                    onChangeAtomMatchFlags(atom.id, matchFlags)
                  }
                />
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          className="glossaryEditorAddAtom"
          disabled={readOnly}
          onClick={() => {
            if (!readOnly) {
              onAddAtom();
            }
          }}
        >
          {translate("glossaryEditor.atoms.add")}
        </button>
        {!validity.ok ? (
          <p className="glossaryEditorValidityMessage" role="alert">
            {translate(
              validity.reason === "noAtoms"
                ? "glossaryEditor.validity.noAtoms"
                : "glossaryEditor.validity.duplicateAtomValue"
            )}
          </p>
        ) : null}
      </section>

      <section className="glossaryEditorSection glossaryEditorTags">
        <h2>{translate("glossaryEditor.tags.heading")}</h2>
        <GlossaryEntryTagAssignmentEditor
          assignedTagIds={draft.tagIds}
          projectTags={availableTags}
          translate={translate}
          readOnly={readOnly}
          onAssignTag={onAssignTag}
          onUnassignTag={onUnassignTag}
          onReorderAssignedTag={onReorderAssignedTag}
          onOpenTagManager={onOpenTagManager}
        />
      </section>

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
