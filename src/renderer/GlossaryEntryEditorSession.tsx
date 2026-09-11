import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from "react";
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
import { GlossaryEditor } from "./GlossaryEditor";
import {
  addGlossaryEntryDraftAtom,
  applyGlossaryEntryDraftSaveResult,
  assignGlossaryEntryDraftTag,
  createGlossaryEntryDraft,
  createNewGlossaryEntryDraft,
  deleteGlossaryEntryDraftAtom,
  glossaryEntryDraftCreateInput,
  glossaryEntryDraftIsNew,
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

interface GlossaryEntryEditorSessionCommonProps {
  availableTags: readonly GlossaryTag[];
  translate: Translate;
  readOnly: boolean;
  markerGlyph: LineEndingMarkerGlyph;
  expectedLineEnding: ExpectedLineEnding;
  newFileLineEndingFallback: NewFileLineEnding;
  whitespaceSettings: ApplicationEditorWhitespaceSettings;
  undoHistoryMinDepth: number;
  /** Load the entry an edit-mode session targets. `null` = not found
   *  (rendered like a load failure). Unused in create mode. */
  onLoadEntry: (entryId: GlossaryEntryId) => Promise<GlossaryEntry | null>;
  /** Persist a create-mode draft through the EXISTING glossary create IPC.
   *  Resolves the saved entry (used to re-key local atom ids AND to flip the
   *  session from create-like to edit-like for every save after this one). */
  onCreateEntry: (input: CreateGlossaryEntryInput) => Promise<GlossaryEntry>;
  /** Persist an edit-mode (or already-saved-once create) draft through the
   *  EXISTING glossary update IPC. Resolves the saved entry. */
  onSaveEntry: (input: UpdateGlossaryEntryInput) => Promise<GlossaryEntry>;
  /** Confirm + hard-delete through the EXISTING destructive-confirm flow.
   *  Resolves `true` only if the entry was actually deleted. */
  onDeleteEntry: (draft: GlossaryEntryDraft) => Promise<boolean>;
  onOpenTagManager: () => void;
  onClose: () => void;
}

type GlossaryEntryEditorSessionProps = GlossaryEntryEditorSessionCommonProps &
  (
    | { mode: "create"; presetRepresentative: string }
    | { mode: "edit"; entryId: GlossaryEntryId }
  );

type SessionState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; draft: GlossaryEntryDraft };

/**
 * #436 Slice 11 — an imperative escape hatch for the project-lifecycle /
 * pane-transition dirty confirm (`glossaryEntryEditorPaneDirtyConfirmation.ts`),
 * which lives in `App.tsx` / project-close / project-switch / quit-restart
 * choke points OUTSIDE this component. Those callers need to ask "is there
 * unsaved work right now" and "save it, and tell me if that worked" without
 * owning the draft themselves — the draft stays pane-local state, exactly as
 * Slice 8/9 designed it. `forwardRef`/`useImperativeHandle` is new to this
 * codebase (no prior precedent) but is the standard, minimal way to expose a
 * live method pair off a component that otherwise has no reason to lift its
 * state up.
 */
export interface GlossaryEntryEditorSessionHandle {
  /** `false` while loading/failed (nothing editable yet) or once clean. */
  isDirty(): boolean;
  /**
   * No-ops (resolves `true`) when already clean, loading, or failed — there
   * is nothing to save. Resolves `false` on an invalid draft (e.g. every
   * atom blanked out), a read-only project, or a failed create/update IPC
   * call — callers MUST treat `false` as "do not proceed" (the pane stays
   * open, mid-save state / the failure message stay visible for the user to
   * fix), exactly like the in-pane Save button already does.
   */
  save(): Promise<boolean>;
}

/**
 * #436 Phase 8-0 PoC — Slice 9.
 *
 * The Glossary Entry Editor Pane's ONE editing session, for BOTH create and
 * edit — per PO direction, a new-entry-only screen is exactly the fork this
 * whole effort exists to avoid. Renders the EXISTING `GlossaryEditor.tsx`
 * (Slice 8 relocated it here unmodified; this Slice only adds `mode` to it)
 * against a session-local draft:
 *
 *   - `mode: "create"` seeds a fresh, not-yet-persisted draft synchronously
 *     (`createNewGlossaryEntryDraft`) — no `onLoadEntry` call, no DB write
 *     until Save.
 *   - `mode: "edit"` loads `entryId` first (loading / failed / ready), same
 *     race-guarded effect Slice 8 used.
 *
 * After a create draft's FIRST successful save, `applyGlossaryEntryDraftSaveResult`
 * rebases `draft.entry` to the real saved entry, so `glossaryEntryDraftIsNew`
 * flips to `false` on its own — every subsequent Save in the SAME session
 * calls `onSaveEntry` (update), never `onCreateEntry` again. The initial
 * `mode` prop therefore only decides how the session STARTS; what a given
 * Save does is always decided by `glossaryEntryDraftIsNew(draft)`.
 */
export const GlossaryEntryEditorSession = forwardRef<
  GlossaryEntryEditorSessionHandle,
  GlossaryEntryEditorSessionProps
>(function GlossaryEntryEditorSession(props, ref): JSX.Element {
  const {
    availableTags,
    translate,
    readOnly,
    markerGlyph,
    expectedLineEnding,
    newFileLineEndingFallback,
    whitespaceSettings,
    undoHistoryMinDepth,
    onLoadEntry,
    onCreateEntry,
    onSaveEntry,
    onDeleteEntry,
    onOpenTagManager,
    onClose
  } = props;

  const [state, setState] = useState<SessionState>(() =>
    props.mode === "create"
      ? {
          status: "ready",
          draft: createNewGlossaryEntryDraft(props.presetRepresentative)
        }
      : { status: "loading" }
  );
  const loadRequestIdRef = useRef(0);
  // `onLoadEntry` is a plain (non-memoized) callback from the host — kept in
  // a ref so a host re-render never re-triggers the load effect below; only
  // the target entryId changing does.
  const onLoadEntryRef = useRef(onLoadEntry);
  onLoadEntryRef.current = onLoadEntry;
  const editEntryId = props.mode === "edit" ? props.entryId : undefined;

  useEffect(() => {
    if (editEntryId === undefined) {
      return;
    }

    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    let isActive = true;

    setState({ status: "loading" });

    void onLoadEntryRef.current(editEntryId)
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
  }, [editEntryId]);

  function updateDraft(
    update: (current: GlossaryEntryDraft) => GlossaryEntryDraft
  ): void {
    setState((current) =>
      current.status === "ready"
        ? { status: "ready", draft: update(current.draft) }
        : current
    );
  }

  function isDirty(): boolean {
    return state.status === "ready" && isGlossaryEntryDraftDirty(state.draft);
  }

  // #436 Slice 11: shared by the in-pane Save button AND the imperative
  // handle's `save()` (the dirty-confirm "保存して続行" choice) — exactly
  // one save code path, so a dialog-driven save behaves identically to a
  // manual one (same validity/read-only guards, same saveState transitions).
  async function performSave(): Promise<boolean> {
    if (state.status !== "ready") {
      return true; // nothing editable yet — trivially "nothing to save".
    }

    const currentDraft = state.draft;

    if (!isGlossaryEntryDraftDirty(currentDraft)) {
      return true;
    }

    if (
      readOnly ||
      currentDraft.saveState === "saving" ||
      !glossaryEntryDraftValidity(currentDraft).ok
    ) {
      return false;
    }

    updateDraft(markGlossaryEntryDraftSaving);

    try {
      const savedEntry = glossaryEntryDraftIsNew(currentDraft)
        ? await onCreateEntry(glossaryEntryDraftCreateInput(currentDraft))
        : await onSaveEntry(glossaryEntryDraftUpdateInput(currentDraft));
      updateDraft((current) =>
        applyGlossaryEntryDraftSaveResult(current, savedEntry)
      );
      return true;
    } catch {
      updateDraft(markGlossaryEntryDraftSaveFailed);
      return false;
    }
  }

  useImperativeHandle(ref, () => ({ isDirty, save: performSave }));

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
  const isNew = glossaryEntryDraftIsNew(draft);

  async function handleSave(): Promise<void> {
    await performSave();
  }

  async function handleDelete(): Promise<void> {
    if (readOnly || isNew) {
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
  const saveLabel = translate(
    isNew ? "glossaryEntryEditorPane.create.submit" : "glossaryEntryEditorPane.edit.save"
  );
  const saveFailedMessage = translate(
    isNew ? "glossaryEntryEditorPane.create.failed" : "glossaryEntryEditorPane.edit.saveFailed"
  );

  return (
    <div className="glossaryEntryEditorPaneEditSession">
      <div className="glossaryEntryEditorPaneEditActions">
        <button
          type="button"
          className="glossaryEntryEditorPaneSaveButton"
          disabled={!canSave}
          onClick={() => void handleSave()}
        >
          {saveLabel}
        </button>
        {draft.saveState === "saveFailed" ? (
          <span className="glossaryEntryEditorPaneSaveFailed" role="alert">
            {saveFailedMessage}
          </span>
        ) : null}
      </div>
      <GlossaryEditor
        mode={isNew ? "create" : "edit"}
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
        readOnly={readOnly}
        markerGlyph={markerGlyph}
        expectedLineEnding={expectedLineEnding}
        newFileLineEndingFallback={newFileLineEndingFallback}
        whitespaceSettings={whitespaceSettings}
        undoHistoryMinDepth={undoHistoryMinDepth}
      />
    </div>
  );
});
