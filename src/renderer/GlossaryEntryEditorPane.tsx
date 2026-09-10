import type { Translate } from "../shared/i18n";
import type { OpenGlossaryEntryEditorPaneState } from "./glossaryEntryEditorPaneState";

interface GlossaryEntryEditorPaneProps {
  state: OpenGlossaryEntryEditorPaneState;
  translate: Translate;
  onClose: () => void;
}

/**
 * #436 Phase 8-0 PoC — Slices 1/2.
 *
 * Placeholder shell for the Glossary Entry Editor Pane. It sits below the
 * editor / preview area, in the slot the former Utility Window used. The
 * create / edit form bodies arrive in later slices; for now this only proves
 * the bottom-pane frame, a working close control, and echoes the state the
 * Slice 2 operation API produced (mode / source / presetRepresentative /
 * entryId) so each future entry point can be verified.
 */
export function GlossaryEntryEditorPane({
  state,
  translate,
  onClose
}: GlossaryEntryEditorPaneProps): JSX.Element {
  const label = translate("glossaryEntryEditorPane.label");

  return (
    <section
      className="glossaryEntryEditorPane"
      aria-label={label}
      data-pane-mode={state.mode}
      data-pane-source={state.source}
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
          {state.mode === "create" ? (
            <div className="glossaryEntryEditorPaneDebugRow">
              <dt>Preset representative</dt>
              <dd data-field="presetRepresentative">
                {state.presetRepresentative}
              </dd>
            </div>
          ) : (
            <div className="glossaryEntryEditorPaneDebugRow">
              <dt>Entry ID</dt>
              <dd data-field="entryId">{state.entryId}</dd>
            </div>
          )}
        </dl>
      </div>
    </section>
  );
}
