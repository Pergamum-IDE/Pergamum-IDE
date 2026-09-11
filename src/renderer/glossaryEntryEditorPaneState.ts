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

/**
 * #436 Slice 11 — is `next` a re-open of the SAME target `current` already
 * has open? Used to skip the dirty confirm when an "open create/edit pane"
 * action is really just re-triggering the identical session (e.g. clicking
 * 語彙を追加 again, or re-opening the same entry's edit icon) — the existing
 * draft is simply kept (no data loss either way), so asking the user to
 * choose Save/Discard/Cancel would be pure friction for a no-op. `source` is
 * deliberately NOT part of the comparison — two different entry points
 * opening the same create preset / the same entryId are still the same
 * target from the pane's point of view.
 */
export function isSameGlossaryEntryEditorPaneTarget(
  current: GlossaryEntryEditorPaneState,
  next: OpenGlossaryEntryEditorPaneState
): boolean {
  if (!current.isOpen || current.mode !== next.mode) {
    return false;
  }

  return current.mode === "create" && next.mode === "create"
    ? current.presetRepresentative === next.presetRepresentative
    : current.mode === "edit" &&
        next.mode === "edit" &&
        current.entryId === next.entryId;
}

/* -------------------------------------------------------------------------- *
 * #436 Slice 6 remediation: the pane is a user-resizable bottom region.
 * Height is held in renderer memory across open/close, not persisted.
 * -------------------------------------------------------------------------- */

export const GLOSSARY_ENTRY_EDITOR_PANE_MIN_HEIGHT = 180;
export const GLOSSARY_ENTRY_EDITOR_PANE_DEFAULT_HEIGHT = 280;

/** Largest share of the editor-area height the pane may take by dragging. */
const GLOSSARY_ENTRY_EDITOR_PANE_MAX_HEIGHT_RATIO = 0.65;
/** The tab content above the pane never drags below this. */
const GLOSSARY_ENTRY_EDITOR_PANE_CONTENT_MIN_HEIGHT = 160;

/**
 * Clamps a candidate pane height to at least
 * `GLOSSARY_ENTRY_EDITOR_PANE_MIN_HEIGHT`. When `availableHeight` (the editor
 * area's total height) is given, the result is additionally capped to the
 * smaller of 65% of that height and `availableHeight - contentMin`, so the tab
 * content above keeps a usable minimum. If the area is too short to satisfy
 * both minimums, the content minimum wins and the pane shrinks below its own
 * stated minimum rather than pushing the content out.
 */
export function clampGlossaryEntryEditorPaneHeight(
  height: number,
  availableHeight?: number
): number {
  if (availableHeight === undefined || availableHeight <= 0) {
    return Math.max(GLOSSARY_ENTRY_EDITOR_PANE_MIN_HEIGHT, height);
  }

  const ratioCap = Math.round(
    availableHeight * GLOSSARY_ENTRY_EDITOR_PANE_MAX_HEIGHT_RATIO
  );
  const contentCap =
    availableHeight - GLOSSARY_ENTRY_EDITOR_PANE_CONTENT_MIN_HEIGHT;
  const upper = Math.max(0, Math.min(ratioCap, contentCap));
  const lower = Math.min(GLOSSARY_ENTRY_EDITOR_PANE_MIN_HEIGHT, upper);

  return Math.min(Math.max(height, lower), upper);
}
