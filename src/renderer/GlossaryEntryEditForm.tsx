import { useEffect, useRef, useState } from "react";
import type {
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
import { GlossaryEditor } from "./GlossaryEditor";
import {
  addGlossaryEntryDraftAtom,
  applyGlossaryEntryDraftSaveResult,
  assignGlossaryEntryDraftTag,
  createGlossaryEntryDraft,
  deleteGlossaryEntryDraftAtom,
  glossaryEntryDraftUpdateInput,
  glossaryEntryDraftValidity,
  isGlossaryEntryDraftDirty,
  markGlossaryEntryDraftSaveFailed,
  markGlossaryEntryDraftSaving,
  reorderAssignedGlossaryEntryDraftTags,
  reorderGlossaryEntryDraftAtom,
  unassignGlossaryEntryDraftTag,
  updateGlossaryEntryDraftAtomMatchFlags,
  updateGlossaryEntryDraftAtomValue,
  updateGlossaryEntryDraftDescription,
  type GlossaryEntryDraft
} from "./glossaryEntryDraft";

interface GlossaryEntryEditFormProps {
  entryId: GlossaryEntryId;
  availableTags: readonly GlossaryTag[];
  translate: Translate;
  readOnly: boolean;
  markerGlyph: LineEndingMarkerGlyph;
  expectedLineEnding: ExpectedLineEnding;
  newFileLineEndingFallback: NewFileLineEnding;
  whitespaceSettings: ApplicationEditorWhitespaceSettings;
  undoHistoryMinDepth: number;
  /** Load the entry to edit. `null` = not found (rendered like a load failure). */
  onLoadEntry: (entryId: GlossaryEntryId) => Promise<GlossaryEntry | null>;
  /** Persist the draft through the EXISTING glossary update IPC. Resolves
   *  with the saved entry (used to re-key local atom ids); rejects on
   *  failure (the host is expected to have already surfaced the error). */
  onSaveEntry: (input: UpdateGlossaryEntryInput) => Promise<GlossaryEntry>;
  /** Confirm + hard-delete through the EXISTING destructive-confirm flow.
   *  Resolves `true` only if the entry was actually deleted. */
  onDeleteEntry: (draft: GlossaryEntryDraft) => Promise<boolean>;
  onOpenTagManager: () => void;
  onNavigateToPreviousOccurrence: (entryId: GlossaryEntryId) => void;
  onNavigateToNextOccurrence: (entryId: GlossaryEntryId) => void;
  onClose: () => void;
}

type LoadState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; draft: GlossaryEntryDraft };

/**
 * #436 Phase 8-0 PoC — Slice 8.
 *
 * Edit-mode orchestration for the Glossary Entry Editor Pane. Per PO
 * direction this Slice does NOT build a new edit form — it loads
 * `entryId` (loading / failed / ready) and then renders the EXISTING
 * `GlossaryEditor.tsx` (the same component the old `glossaryEntry` tab used),
 * wired to a LOCAL draft — not `currentEditor` / `openDocumentsState` — so no
 * `glossaryEntry` tab is revived. Every editing/validation/save-shape
 * primitive comes straight from `glossaryEntryDraft.ts` unchanged; the only
 * new code here is the plumbing that used to live in `updateActiveGlossaryDraft`
 * (tab-coupled) re-pointed at this pane-local draft, plus a minimal Save
 * control (the old tab had none of its own — saving went through the global
 * Ctrl+S / Save command, which does not apply to a non-tab pane).
 */
export function GlossaryEntryEditForm({
  entryId,
  availableTags,
  translate,
  readOnly,
  markerGlyph,
  expectedLineEnding,
  newFileLineEndingFallback,
  whitespaceSettings,
  undoHistoryMinDepth,
  onLoadEntry,
  onSaveEntry,
  onDeleteEntry,
  onOpenTagManager,
  onNavigateToPreviousOccurrence,
  onNavigateToNextOccurrence,
  onClose
}: GlossaryEntryEditFormProps): JSX.Element {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const loadRequestIdRef = useRef(0);
  // `onLoadEntry` is a plain (non-memoized) callback from the host — kept in
  // a ref so a host re-render never re-triggers the load effect below; only
  // `entryId` changing does.
  const onLoadEntryRef = useRef(onLoadEntry);
  onLoadEntryRef.current = onLoadEntry;

  useEffect(() => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    let isActive = true;

    setState({ status: "loading" });

    void onLoadEntryRef.current(entryId)
      .then((entry) => {
        if (!isActive || loadRequestIdRef.current !== requestId) {
          return;
        }
        setState(
          entry
            ? { status: "ready", draft: createGlossaryEntryDraft(entry) }
            : { status: "failed" }
        );
      })
      .catch(() => {
        if (!isActive || loadRequestIdRef.current !== requestId) {
          return;
        }
        setState({ status: "failed" });
      });

    return () => {
      isActive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onLoadEntry is
    // read through `onLoadEntryRef` above, deliberately excluded here.
  }, [entryId]);

  if (state.status === "loading") {
    return (
      <p className="glossaryEntryEditorPaneStatus" role="status">
        {translate("glossaryEntryEditorPane.edit.loading")}
      </p>
    );
  }

  if (state.status === "failed") {
    return (
      <p className="glossaryEntryEditorPaneStatus" role="alert">
        {translate("glossaryEntryEditorPane.edit.loadFailed")}
      </p>
    );
  }

  const draft = state.draft;

  function updateDraft(
    update: (current: GlossaryEntryDraft) => GlossaryEntryDraft
  ): void {
    setState((current) =>
      current.status === "ready"
        ? { status: "ready", draft: update(current.draft) }
        : current
    );
  }

  async function handleSave(): Promise<void> {
    if (
      readOnly ||
      draft.saveState === "saving" ||
      !isGlossaryEntryDraftDirty(draft) ||
      !glossaryEntryDraftValidity(draft).ok
    ) {
      return;
    }

    updateDraft(markGlossaryEntryDraftSaving);

    try {
      const savedEntry = await onSaveEntry(glossaryEntryDraftUpdateInput(draft));
      updateDraft((current) => applyGlossaryEntryDraftSaveResult(current, savedEntry));
    } catch {
      updateDraft(markGlossaryEntryDraftSaveFailed);
    }
  }

  async function handleDelete(): Promise<void> {
    if (readOnly) {
      return;
    }

    if (await onDeleteEntry(draft)) {
      onClose();
    }
  }

  const canSave =
    !readOnly &&
    draft.saveState !== "saving" &&
    isGlossaryEntryDraftDirty(draft) &&
    glossaryEntryDraftValidity(draft).ok;

  return (
    <div className="glossaryEntryEditorPaneEditSession">
      <div className="glossaryEntryEditorPaneEditActions">
        <button
          type="button"
          className="glossaryEntryEditorPaneSaveButton"
          disabled={!canSave}
          onClick={() => void handleSave()}
        >
          {translate("glossaryEntryEditorPane.edit.save")}
        </button>
        {draft.saveState === "saveFailed" ? (
          <span className="glossaryEntryEditorPaneSaveFailed" role="alert">
            {translate("glossaryEntryEditorPane.edit.saveFailed")}
          </span>
        ) : null}
      </div>
      <GlossaryEditor
        draft={draft}
        availableTags={availableTags}
        translate={translate}
        onChangeDescription={(description) =>
          updateDraft((current) =>
            updateGlossaryEntryDraftDescription(current, description)
          )
        }
        onAddAtom={() => updateDraft(addGlossaryEntryDraftAtom)}
        onChangeAtomValue={(atomId, value) =>
          updateDraft((current) =>
            updateGlossaryEntryDraftAtomValue(current, atomId, value)
          )
        }
        onChangeAtomMatchFlags={(atomId, matchFlags) =>
          updateDraft((current) =>
            updateGlossaryEntryDraftAtomMatchFlags(current, atomId, matchFlags)
          )
        }
        onDeleteAtom={(atomId) =>
          updateDraft((current) => deleteGlossaryEntryDraftAtom(current, atomId))
        }
        onReorderAtom={(atomId, toIndex) =>
          updateDraft((current) =>
            reorderGlossaryEntryDraftAtom(current, atomId, toIndex)
          )
        }
        onAssignTag={(tagId, toIndex) =>
          updateDraft((current) =>
            assignGlossaryEntryDraftTag(current, tagId, toIndex)
          )
        }
        onUnassignTag={(tagId) =>
          updateDraft((current) => unassignGlossaryEntryDraftTag(current, tagId))
        }
        onReorderAssignedTag={(tagId, toIndex) =>
          updateDraft((current) =>
            reorderAssignedGlossaryEntryDraftTags(current, tagId, toIndex)
          )
        }
        onOpenTagManager={onOpenTagManager}
        onDeleteEntry={() => void handleDelete()}
        onNavigateToPreviousOccurrence={() =>
          onNavigateToPreviousOccurrence(draft.entry.id)
        }
        onNavigateToNextOccurrence={() =>
          onNavigateToNextOccurrence(draft.entry.id)
        }
        readOnly={readOnly}
        markerGlyph={markerGlyph}
        expectedLineEnding={expectedLineEnding}
        newFileLineEndingFallback={newFileLineEndingFallback}
        whitespaceSettings={whitespaceSettings}
        undoHistoryMinDepth={undoHistoryMinDepth}
      />
    </div>
  );
}
