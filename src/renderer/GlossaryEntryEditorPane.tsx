import type {
  CreateGlossaryEntryInput,
  GlossaryTag
} from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import { GlossaryEntryCreateForm } from "./GlossaryEntryCreateForm";
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
 * #436 Phase 8-0 PoC.
 *
 * The Glossary Entry Editor Pane sits below the editor / preview area, in the
 * slot the former Utility Window used, and replaces the per-entry glossary
 * editing tabs.
 *
 * - create mode (Slice 6): a real new-entry form (`GlossaryEntryCreateForm`).
 * - edit  mode: still a debug echo of the operation-API state — the real edit
 *   form arrives in a later slice.
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
          <GlossaryEntryCreateForm
            key={`${state.source}:${state.presetRepresentative}`}
            presetRepresentative={state.presetRepresentative}
            availableTags={availableTags}
            translate={translate}
            onCreate={onCreateEntry}
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
