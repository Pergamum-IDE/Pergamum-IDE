import type { Translate } from "../shared/i18n";
import type { GlossaryEntryEditorPaneMode } from "./glossaryEntryEditorPaneState";

interface GlossaryEntryEditorPaneProps {
  mode: GlossaryEntryEditorPaneMode;
  translate: Translate;
  onClose: () => void;
}

/**
 * #436 Phase 8-0 PoC — Slice 1.
 *
 * Placeholder shell for the Glossary Entry Editor Pane. It sits below the
 * editor / preview area, in the slot the former Utility Window used. The
 * create / edit form bodies arrive in later slices; for now this only proves
 * the bottom-pane frame, its title, and a working close control.
 */
export function GlossaryEntryEditorPane({
  mode,
  translate,
  onClose
}: GlossaryEntryEditorPaneProps): JSX.Element {
  const label = translate("glossaryEntryEditorPane.label");

  return (
    <section
      className="glossaryEntryEditorPane"
      aria-label={label}
      data-pane-mode={mode}
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
      </div>
    </section>
  );
}
