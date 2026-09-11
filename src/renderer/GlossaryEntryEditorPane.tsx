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
import { GlossaryEntryEditForm } from "./GlossaryEntryEditForm";
import {
  GlossaryEntryForm,
  type GlossaryEntryFormValue
} from "./GlossaryEntryForm";
import type { GlossaryEntryDraft } from "./glossaryEntryDraft";
import type { OpenGlossaryEntryEditorPaneState } from "./glossaryEntryEditorPaneState";

interface GlossaryEntryEditorPaneProps {
  state: OpenGlossaryEntryEditorPaneState;
  translate: Translate;
  /** Current pane height in px (user-resizable via the top-edge handle). */
  height: number;
  availableTags: readonly GlossaryTag[];
  /** Persist a new entry. Resolves `true` on success, `false` on failure. */
  onCreateEntry: (input: CreateGlossaryEntryInput) => Promise<boolean>;
  /** Load the entry an edit-mode pane targets. `null` = not found. */
  onLoadEntry: (entryId: GlossaryEntryId) => Promise<GlossaryEntry | null>;
  /** Persist an edit-mode draft. Resolves the saved entry; rejects on failure. */
  onSaveEntry: (input: UpdateGlossaryEntryInput) => Promise<GlossaryEntry>;
  /** Confirm + delete the entry being edited. `true` only if actually deleted. */
  onDeleteEntry: (draft: GlossaryEntryDraft) => Promise<boolean>;
  onOpenTagManager: () => void;
  onNavigateToPreviousOccurrence: (entryId: GlossaryEntryId) => void;
  onNavigateToNextOccurrence: (entryId: GlossaryEntryId) => void;
  readOnly: boolean;
  markerGlyph: LineEndingMarkerGlyph;
  expectedLineEnding: ExpectedLineEnding;
  newFileLineEndingFallback: NewFileLineEnding;
  whitespaceSettings: ApplicationEditorWhitespaceSettings;
  undoHistoryMinDepth: number;
  onClose: () => void;
}

/**
 * #436 Slice 7: `GlossaryEntryForm`'s generic `{representative, description,
 * tagIds}` value → the create IPC's `CreateGlossaryEntryInput`. The form has
 * no multi-atom UI yet, so the representative becomes the single
 * `sortOrder: 0` atom. Kept here (not inside `GlossaryEntryForm`) so the form
 * stays create-agnostic of the IPC shape.
 */
function createGlossaryEntryInputFromFormValue(
  value: GlossaryEntryFormValue
): CreateGlossaryEntryInput {
  return {
    description: value.description,
    atoms: [{ value: value.representative, matchFlags: 0 }],
    tagIds: [...value.tagIds]
  };
}

/**
 * #436 Phase 8-0 PoC.
 *
 * The Glossary Entry Editor Pane sits below the editor / preview area, in the
 * slot the former Utility Window used, and replaces the per-entry glossary
 * editing tabs.
 *
 * - create mode: a real new-entry form (`GlossaryEntryForm`, Slice 6/7).
 * - edit   mode (Slice 8): the EXISTING `GlossaryEditor.tsx` — the same
 *   screen the old glossaryEntry tab used — hosted by `GlossaryEntryEditForm`
 *   against a pane-local draft. No new edit form was built for this Slice.
 */
export function GlossaryEntryEditorPane({
  state,
  translate,
  height,
  availableTags,
  onCreateEntry,
  onLoadEntry,
  onSaveEntry,
  onDeleteEntry,
  onOpenTagManager,
  onNavigateToPreviousOccurrence,
  onNavigateToNextOccurrence,
  readOnly,
  markerGlyph,
  expectedLineEnding,
  newFileLineEndingFallback,
  whitespaceSettings,
  undoHistoryMinDepth,
  onClose
}: GlossaryEntryEditorPaneProps): JSX.Element {
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
          <GlossaryEntryForm
            key={`${state.source}:${state.presetRepresentative}`}
            mode="create"
            initialValue={{
              representative: state.presetRepresentative,
              description: "",
              tagIds: []
            }}
            availableTags={availableTags}
            translate={translate}
            submitLabel={translate("glossaryEntryEditorPane.create.submit")}
            failedMessage={translate("glossaryEntryEditorPane.create.failed")}
            onSubmit={(value) =>
              onCreateEntry(createGlossaryEntryInputFromFormValue(value))
            }
            onClose={onClose}
          />
        ) : (
          <GlossaryEntryEditForm
            key={state.entryId}
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
            onSaveEntry={onSaveEntry}
            onDeleteEntry={onDeleteEntry}
            onOpenTagManager={onOpenTagManager}
            onNavigateToPreviousOccurrence={onNavigateToPreviousOccurrence}
            onNavigateToNextOccurrence={onNavigateToNextOccurrence}
            onClose={onClose}
          />
        )}
      </div>
    </section>
  );
}
