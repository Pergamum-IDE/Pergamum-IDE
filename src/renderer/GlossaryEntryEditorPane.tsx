import type {
  CreateGlossaryEntryInput,
  GlossaryTag
} from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import {
  GlossaryEntryForm,
  type GlossaryEntryFormValue
} from "./GlossaryEntryForm";
import type { OpenGlossaryEntryEditorPaneState } from "./glossaryEntryEditorPaneState";

interface GlossaryEntryEditorPaneProps {
  state: OpenGlossaryEntryEditorPaneState;
  translate: Translate;
  /** Current pane height in px (user-resizable via the top-edge handle). */
  height: number;
  availableTags: readonly GlossaryTag[];
  /** Persist a new entry. Resolves `true` on success, `false` on failure. */
  onCreateEntry: (input: CreateGlossaryEntryInput) => Promise<boolean>;
  onClose: () => void;
}

/**
 * #436 Slice 7: `GlossaryEntryForm`'s generic `{representative, description,
 * tagIds}` value → the create IPC's `CreateGlossaryEntryInput`. The form has
 * no multi-atom UI yet, so the representative becomes the single
 * `sortOrder: 0` atom. Kept here (not inside `GlossaryEntryForm`) so the form
 * stays create/edit-agnostic — an edit-mode adapter to `UpdateGlossaryEntryInput`
 * lives beside this one, not inside the shared form.
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
 * - create mode: a real new-entry form. Slice 6 introduced it as a
 *   create-only component; Slice 7 generalized it to `GlossaryEntryForm` —
 *   per PO direction, registering and editing a glossary entry are never
 *   separate screens, so edit mode reuses the same component once wired up.
 * - edit  mode: still a debug echo of the operation-API state — the real edit
 *   wiring (load the entry, `GlossaryEntryForm` with an update adapter)
 *   arrives in a later slice.
 */
export function GlossaryEntryEditorPane({
  state,
  translate,
  height,
  availableTags,
  onCreateEntry,
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
          <>
            <p className="glossaryEntryEditorPaneNotice">
              {translate("glossaryEntryEditorPane.poNotice")}
            </p>
            <dl className="glossaryEntryEditorPaneDebug">
              <div className="glossaryEntryEditorPaneDebugRow">
                <dt>Mode</dt>
                <dd data-field="mode">{state.mode}</dd>
              </div>
              <div className="glossaryEntryEditorPaneDebugRow">
                <dt>Source</dt>
                <dd data-field="source">{state.source}</dd>
              </div>
              <div className="glossaryEntryEditorPaneDebugRow">
                <dt>Entry ID</dt>
                <dd data-field="entryId">{state.entryId}</dd>
              </div>
            </dl>
          </>
        )}
      </div>
    </section>
  );
}
