import type { GlossaryEntry, GlossaryEntryId } from "../shared/glossary";
import { DEFAULT_GLOSSARY_ENTRY_PRESET_REPRESENTATIVE } from "./glossaryEntryEditorPaneState";

/**
 * #436 Slice 12.
 *
 * Pure, React-free helpers for Ctrl+G ("open/create a glossary entry from
 * the current Markdown editor selection"). Deliberately separate from both
 * the CodeMirror keymap extension (`glossarySelectionShortcutExtension.ts`,
 * which only extracts the RAW selected text) and `App.tsx` (which owns the
 * actual pane transition / dirty confirm) — so this logic is independently
 * unit-testable and reusable by a future right-click context-menu entry
 * point (`source: "editor-context-menu"`) without duplicating it.
 */

/**
 * Normalizes a raw editor selection into a single-line glossary
 * representative candidate:
 *  1. trim leading/trailing whitespace (including surrounding blank lines)
 *  2. strip every internal line break (`\r\n`, `\r`, `\n`) — a multi-line
 *     selection collapses into ONE word/phrase, never a multi-line
 *     representative or Atom value
 *  3. trim again (in case stripping line breaks left edge whitespace, e.g.
 *     trailing spaces on the line before a removed break)
 *
 * Internal ordinary spaces and ideographic (full-width) spaces are left
 * alone — only line breaks are removed. Returns `""` for `null`/`undefined`/
 * whitespace-only/blank-lines-only input; callers fall back to
 * {@link DEFAULT_GLOSSARY_ENTRY_PRESET_REPRESENTATIVE} in that case.
 */
export function normalizeGlossaryRepresentativeFromEditorSelection(
  selectedText: string | null | undefined
): string {
  const trimmed = (selectedText ?? "").trim();
  const withoutLineBreaks = trimmed.replace(/\r\n|\r|\n/g, "");
  return withoutLineBreaks.trim();
}

/**
 * `"create"`: no exact Atom match (or nothing was selected) —
 * `presetRepresentative` seeds a new create-mode draft.
 * `"edit"`: exactly one Entry has an Atom (representative or not) whose
 * `value` exactly equals the normalized selection.
 * `"ambiguous"`: more than one DISTINCT Entry matched — the caller must not
 * silently pick one; `entryIds` is deduplicated (an Entry with several
 * matching Atoms still counts once).
 */
export type GlossarySelectionResolution =
  | { readonly kind: "create"; readonly presetRepresentative: string }
  | { readonly kind: "edit"; readonly entryId: GlossaryEntryId }
  | { readonly kind: "ambiguous"; readonly entryIds: readonly GlossaryEntryId[] };

/**
 * Resolves what Ctrl+G (or a future right-click "open glossary entry")
 * should do with the current selection, against the project's full Glossary
 * Entry list. Exact match only: no fuzzy/partial/case-insensitive matching,
 * and `matchFlags` is never consulted (deliberately out of scope — see the
 * Slice 12 spec's "絶対にやらないこと").
 */
export function resolveGlossaryEntryEditorPaneTargetFromSelection(
  selectedText: string | null | undefined,
  entries: readonly GlossaryEntry[]
): GlossarySelectionResolution {
  const normalized = normalizeGlossaryRepresentativeFromEditorSelection(selectedText);

  if (normalized.length === 0) {
    return {
      kind: "create",
      presetRepresentative: DEFAULT_GLOSSARY_ENTRY_PRESET_REPRESENTATIVE
    };
  }

  const matchedEntryIds: GlossaryEntryId[] = [];

  for (const entry of entries) {
    if (entry.atoms.some((atom) => atom.value === normalized)) {
      matchedEntryIds.push(entry.id);
    }
  }

  if (matchedEntryIds.length === 0) {
    return { kind: "create", presetRepresentative: normalized };
  }

  if (matchedEntryIds.length === 1) {
    return { kind: "edit", entryId: matchedEntryIds[0] };
  }

  return { kind: "ambiguous", entryIds: matchedEntryIds };
}
