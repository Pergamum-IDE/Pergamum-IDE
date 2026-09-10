/**
 * #436 Phase 8-0 PoC — Slice 1.
 *
 * State for the Glossary Entry Editor Pane: the bottom pane that replaces the
 * former Utility Window and will host glossary entry create / edit forms in
 * later slices.
 *
 * Slice 1 only carries open / close plus the shape the later slices need, so
 * the pane can eventually be opened from:
 *  - the Glossary side pane "語彙を追加" button (`create`)
 *  - the glossary management settings screen (`create` / `edit`)
 *  - Ctrl+G with a `presetRepresentative`
 *  - the editor context menu with a `presetRepresentative`
 *
 * No save / add / edit / Ctrl+G wiring yet — that arrives in later slices.
 */
export type GlossaryEntryEditorPaneMode = "create" | "edit";

export type GlossaryEntryEditorPaneState =
  | { isOpen: false }
  | {
      isOpen: true;
      mode: GlossaryEntryEditorPaneMode;
      entryId?: string;
      presetRepresentative?: string;
    };

export interface OpenGlossaryEntryEditorPaneOptions {
  mode: GlossaryEntryEditorPaneMode;
  entryId?: string;
  presetRepresentative?: string;
}

export function createInitialGlossaryEntryEditorPaneState(): GlossaryEntryEditorPaneState {
  return { isOpen: false };
}

export function openGlossaryEntryEditorPane(
  options: OpenGlossaryEntryEditorPaneOptions
): GlossaryEntryEditorPaneState {
  return {
    isOpen: true,
    mode: options.mode,
    entryId: options.entryId,
    presetRepresentative: options.presetRepresentative
  };
}

export function closeGlossaryEntryEditorPane(): GlossaryEntryEditorPaneState {
  return { isOpen: false };
}

export function toggleGlossaryEntryEditorPane(
  current: GlossaryEntryEditorPaneState,
  options: OpenGlossaryEntryEditorPaneOptions
): GlossaryEntryEditorPaneState {
  return current.isOpen
    ? closeGlossaryEntryEditorPane()
    : openGlossaryEntryEditorPane(options);
}
