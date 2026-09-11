import { forwardRef } from "react";
import type {
  CreateGlossaryEntryInput,
  GlossaryEntry,
  GlossaryEntryId,
  GlossaryTag,
  UpdateGlossaryEntryInput
} from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import type {
  ApplicationEditorWhitespaceSettings,
  ExpectedLineEnding,
  LineEndingMarkerGlyph,
  NewFileLineEnding
} from "../shared/settings";
import {
  GlossaryEntryEditorSession,
  type GlossaryEntryEditorSessionHandle
} from "./GlossaryEntryEditorSession";
import type { GlossaryEntryDraft } from "./glossaryEntryDraft";
import type { OpenGlossaryEntryEditorPaneState } from "./glossaryEntryEditorPaneState";

interface GlossaryEntryEditorPaneProps {
  state: OpenGlossaryEntryEditorPaneState;
  translate: Translate;
  /** Current pane height in px (user-resizable via the top-edge handle). */
  height: number;
  availableTags: readonly GlossaryTag[];
  /** Persist a create-mode draft. Resolves the saved entry. */
  onCreateEntry: (input: CreateGlossaryEntryInput) => Promise<GlossaryEntry>;
  /** Load the entry an edit-mode session targets. `null` = not found. */
  onLoadEntry: (entryId: GlossaryEntryId) => Promise<GlossaryEntry | null>;
  /** Persist an edit-mode (or already-saved-once create) draft. Resolves the
   *  saved entry. */
  onSaveEntry: (input: UpdateGlossaryEntryInput) => Promise<GlossaryEntry>;
  /** Confirm + delete the entry being edited. `true` only if actually deleted. */
  onDeleteEntry: (draft: GlossaryEntryDraft) => Promise<boolean>;
  onOpenTagManager: () => void;
  readOnly: boolean;
  markerGlyph: LineEndingMarkerGlyph;
  expectedLineEnding: ExpectedLineEnding;
  newFileLineEndingFallback: NewFileLineEnding;
  whitespaceSettings: ApplicationEditorWhitespaceSettings;
  undoHistoryMinDepth: number;
  onClose: () => void;
}

/**
 * #436 Phase 8-0 PoC.
 *
 * The Glossary Entry Editor Pane sits below the editor / preview area, in the
 * slot the former Utility Window used, and replaces the per-entry glossary
 * editing tabs.
 *
 * Both create and edit mode render the SAME `GlossaryEntryEditorSession` —
 * which in turn hosts the EXISTING `GlossaryEditor.tsx` (Slice 8) — per PO
 * direction: a new-entry-only screen is exactly the fork this pane exists to
 * avoid (Slice 9 retired the earlier `GlossaryEntryForm` create-only form).
 *
 * #436 Slice 11: forwards its ref straight through to whichever
 * `GlossaryEntryEditorSession` is currently mounted (only one of the two
 * branches below is ever mounted at a time), so `App.tsx`'s project-lifecycle
 * / pane-transition dirty confirm can reach the live session's
 * `isDirty()`/`save()` without the pane needing to know anything about dirty
 * state itself.
 */
export const GlossaryEntryEditorPane = forwardRef<
  GlossaryEntryEditorSessionHandle,
  GlossaryEntryEditorPaneProps
>(function GlossaryEntryEditorPane(
  {
    state,
    translate,
    height,
    availableTags,
    onCreateEntry,
    onLoadEntry,
    onSaveEntry,
    onDeleteEntry,
    onOpenTagManager,
    readOnly,
    markerGlyph,
    expectedLineEnding,
    newFileLineEndingFallback,
    whitespaceSettings,
    undoHistoryMinDepth,
    onClose
  },
  ref
): JSX.Element {
  const label = translate("glossaryEntryEditorPane.label");

  return (
    <section
      className="glossaryEntryEditorPane"
      aria-label={label}
      data-pane-mode={state.mode}
      data-pane-source={state.source}
      style={{ height }}
    >
      <div className="glossaryEntryEditorPaneHeader">
        <span className="glossaryEntryEditorPaneTitle">{label}</span>
        <button
          type="button"
          className="glossaryEntryEditorPaneCloseButton"
          onClick={onClose}
        >
          {translate("glossaryEntryEditorPane.close")}
        </button>
      </div>
      <div className="glossaryEntryEditorPaneBody">
        {state.mode === "create" ? (
          <GlossaryEntryEditorSession
            ref={ref}
            key={`${state.source}:${state.presetRepresentative}`}
            mode="create"
            presetRepresentative={state.presetRepresentative}
            availableTags={availableTags}
            translate={translate}
            readOnly={readOnly}
            markerGlyph={markerGlyph}
            expectedLineEnding={expectedLineEnding}
            newFileLineEndingFallback={newFileLineEndingFallback}
            whitespaceSettings={whitespaceSettings}
            undoHistoryMinDepth={undoHistoryMinDepth}
            onLoadEntry={onLoadEntry}
            onCreateEntry={onCreateEntry}
            onSaveEntry={onSaveEntry}
            onDeleteEntry={onDeleteEntry}
            onOpenTagManager={onOpenTagManager}
            onClose={onClose}
          />
        ) : (
          <GlossaryEntryEditorSession
            ref={ref}
            key={state.entryId}
            mode="edit"
            entryId={state.entryId}
            availableTags={availableTags}
            translate={translate}
            readOnly={readOnly}
            markerGlyph={markerGlyph}
            expectedLineEnding={expectedLineEnding}
            newFileLineEndingFallback={newFileLineEndingFallback}
            whitespaceSettings={whitespaceSettings}
            undoHistoryMinDepth={undoHistoryMinDepth}
            onLoadEntry={onLoadEntry}
            onCreateEntry={onCreateEntry}
            onSaveEntry={onSaveEntry}
            onDeleteEntry={onDeleteEntry}
            onOpenTagManager={onOpenTagManager}
            onClose={onClose}
          />
        )}
      </div>
    </section>
  );
});
