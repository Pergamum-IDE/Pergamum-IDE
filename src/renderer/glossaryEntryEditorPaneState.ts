/**
 * #436 Phase 8-0 PoC.
 *
 * State + unified operation API for the Glossary Entry Editor Pane: the bottom
 * pane (Slice 1) that replaces the per-entry glossary editing tabs and will
 * host the create / edit forms in later slices.
 *
 * Slice 2 adds the unified entry points every UI calls instead of touching the
 * state shape directly. Later slices route these callers through them:
 *  - Glossary side pane "語彙を追加"     → openGlossaryEntryCreatePane({ source: "glossary-pane" })
 *  - glossary management settings screen → openGlossaryEntryCreatePane / openGlossaryEntryEditPane({ source: "glossary-settings" })
 *  - Ctrl+G (Slice 8)                    → openGlossaryEntryCreatePane({ source: "editor-selection", presetRepresentative })
 *  - editor context menu                → openGlossaryEntryCreatePane({ source: "editor-context-menu", presetRepresentative })
 *
 * No save / add / edit / Ctrl+G / context-menu wiring yet — later slices.
 */
export type GlossaryEntryEditorPaneMode = "create" | "edit";

export type GlossaryEntryEditorPaneSource =
  | "glossary-pane"
  | "glossary-settings"
  | "editor-selection"
  | "editor-context-menu"
  | "developer";

export type GlossaryEntryEditorPaneState =
  | { isOpen: false }
  | {
      isOpen: true;
      mode: "create";
      source: GlossaryEntryEditorPaneSource;
      presetRepresentative: string;
    }
  | {
      isOpen: true;
      mode: "edit";
      source: GlossaryEntryEditorPaneSource;
      entryId: string;
    };

export type OpenGlossaryEntryEditorPaneState = Extract<
  GlossaryEntryEditorPaneState,
  { isOpen: true }
>;

export type CreateGlossaryEntryEditorPaneState = Extract<
  GlossaryEntryEditorPaneState,
  { mode: "create" }
>;

export type EditGlossaryEntryEditorPaneState = Extract<
  GlossaryEntryEditorPaneState,
  { mode: "edit" }
>;

/**
 * Fallback representative surface pre-filled into a create-mode pane when the
 * caller passes no `presetRepresentative` (e.g. the Glossary side pane's
 * "語彙を追加", which has no editor selection to seed from).
 */
export const DEFAULT_GLOSSARY_ENTRY_PRESET_REPRESENTATIVE = "新しい語彙";

export interface OpenGlossaryEntryCreatePaneOptions {
  source: GlossaryEntryEditorPaneSource;
  presetRepresentative?: string;
}

export interface OpenGlossaryEntryEditPaneOptions {
  source: GlossaryEntryEditorPaneSource;
  entryId: string;
}

export function createInitialGlossaryEntryEditorPaneState(): GlossaryEntryEditorPaneState {
  return { isOpen: false };
}

export function openGlossaryEntryCreatePane(
  options: OpenGlossaryEntryCreatePaneOptions
): CreateGlossaryEntryEditorPaneState {
  const preset = options.presetRepresentative;

  return {
    isOpen: true,
    mode: "create",
    source: options.source,
    presetRepresentative:
      preset !== undefined && preset.length > 0
        ? preset
        : DEFAULT_GLOSSARY_ENTRY_PRESET_REPRESENTATIVE
  };
}

export function openGlossaryEntryEditPane(
  options: OpenGlossaryEntryEditPaneOptions
): EditGlossaryEntryEditorPaneState {
  return {
    isOpen: true,
    mode: "edit",
    source: options.source,
    entryId: options.entryId
  };
}

export function closeGlossaryEntryEditorPane(): GlossaryEntryEditorPaneState {
  return { isOpen: false };
}
