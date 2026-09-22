/**
 * #546 (ADR-0014 決定3a / T-12) — free-form indent / outdent for plain text
 * (`.txt`) documents.
 *
 * `.txt` is not a Markdown structure document (ADR-0014 決定8), so the
 * Markdown-aware context dispatch in `indentCommands.ts` — including the
 * 決定4 "top-level paragraph is a no-op" rule — does not apply. Plain text
 * indent / outdent is a plain text editing command instead: it inserts /
 * removes one indent unit at the start of every target line, using the same
 * target-line selection rule (T-4 / {@link extractTouchedLines}) as the
 * Markdown-aware command.
 *
 * `documentIsMarkdownFacet` is how `indentCommands.ts`'s `indentCommand` /
 * `outdentCommand` — the single entry point every UI surface (toolbar,
 * `Mod+]` / `Mod+[`, `editor.captureTabInEditor` Tab / Shift+Tab) already
 * calls — decide which of the two behaviors to run for the active document.
 * Defaults to `true` (Markdown-aware) so every `EditorState` that never sets
 * this facet (every existing test, every non-`.txt` editor) keeps today's
 * behavior unchanged.
 *
 * #546 follow-up: the indent unit itself is `textFiles.indentUnit`
 * (Application Settings only — no project override), read live via
 * {@link textFileIndentUnitFacet}, the same "facet + Compartment" shape as
 * `indentCommands.ts`'s own `fencedCodeIndentUnitFacet`, so a Settings
 * change reconfigures an already-open `.txt` document immediately.
 */

import {
  ChangeSet,
  EditorSelection,
  Facet,
  type ChangeSpec,
  type EditorState,
  type Line
} from "@codemirror/state";
import type { Command, EditorView } from "@codemirror/view";
import { extractTouchedLines } from "./indentTouchedLines";
import {
  resolveTextFilesIndentText,
  type TextFilesIndentUnit
} from "../shared/settings";

export type PlainTextIndentDirection = "indent" | "outdent";

export const documentIsMarkdownFacet = Facet.define<boolean, boolean>({
  combine: (values) => values[values.length - 1] ?? true
});

/** #546 follow-up: `textFiles.indentUnit`'s live value on a document's
 *  `EditorState`. Defaults to `"tab"`, matching the catalog default. */
export const textFileIndentUnitFacet = Facet.define<
  TextFilesIndentUnit,
  TextFilesIndentUnit
>({
  combine: (values) => values[values.length - 1] ?? "tab"
});

/**
 * Outdent's forgiving space-fallback width (Issue #546 follow-up "Outdent
 * behavior" table): how many leading spaces an outdent may remove when the
 * line starts with neither the configured unit's exact text nor a bare tab.
 */
function spaceFallbackWidth(unit: TextFilesIndentUnit): number {
  return unit === "twoSpaces" ? 2 : 4;
}

/**
 * Forgiving outdent order (Issue #546 follow-up "Outdent behavior"):
 * 1. the line starts with the currently configured indent unit -> remove it
 * 2. otherwise the line starts with a real tab -> remove one tab
 * 3. otherwise the line starts with spaces -> remove up to the configured
 *    fallback width worth of spaces (only as many as are actually there)
 * 4. otherwise no-op
 * Never requires the existing indentation to exactly match the current
 * setting - tolerant of externally edited / differently-indented `.txt`
 * files. Never removes non-whitespace content.
 */
function getPlainTextOutdentDeleteLength(
  lineText: string,
  unit: TextFilesIndentUnit
): number {
  const configuredUnitText = resolveTextFilesIndentText(unit);
  if (lineText.startsWith(configuredUnitText)) {
    return configuredUnitText.length;
  }
  if (lineText.startsWith("\t")) {
    return 1;
  }
  if (lineText.startsWith(" ")) {
    const maxWidth = spaceFallbackWidth(unit);
    let count = 0;
    while (count < maxWidth && lineText[count] === " ") {
      count += 1;
    }
    return count;
  }
  return 0;
}

function buildPlainTextLineChange(
  line: Line,
  direction: PlainTextIndentDirection,
  unit: TextFilesIndentUnit
): ChangeSpec | null {
  if (direction === "indent") {
    return { from: line.from, insert: resolveTextFilesIndentText(unit) };
  }

  const deleteLength = getPlainTextOutdentDeleteLength(line.text, unit);
  if (deleteLength === 0) {
    return null;
  }
  return { from: line.from, to: line.from + deleteLength, insert: "" };
}

export interface PlainTextIndentPlan {
  readonly changes: readonly ChangeSpec[];
  /** Set only when the resulting selection must NOT be left to CodeMirror's
   *  default change-mapping — see {@link planPlainTextTabTransaction}'s
   *  "replace the selection" branch, where the default mapping would leave
   *  the newly-inserted text selected rather than collapsing the caret
   *  after it. */
  readonly selection?: EditorSelection;
}

/**
 * The pure core, mirroring `indentCommands.ts`'s `planIndentTransaction`
 * shape: given a document/selection snapshot and a direction, decide what
 * (if anything) to change. Never touches a live `EditorView`. `unit`
 * defaults to `state.facet(textFileIndentUnitFacet)` when omitted, same
 * "optional override, else read live from state" shape as
 * `planIndentTransaction`'s own `fencedCodeIndentUnit` parameter.
 */
export function planPlainTextIndentTransaction(
  state: EditorState,
  direction: PlainTextIndentDirection,
  unit?: TextFilesIndentUnit
): PlainTextIndentPlan {
  if (state.readOnly) {
    return { changes: [] };
  }

  const effectiveUnit = unit ?? state.facet(textFileIndentUnitFacet);

  const changes: ChangeSpec[] = [];
  for (const line of extractTouchedLines(state)) {
    const change = buildPlainTextLineChange(line, direction, effectiveUnit);
    if (change !== null) {
      changes.push(change);
    }
  }

  return { changes };
}

function runPlainTextIndentDirection(
  view: EditorView,
  direction: PlainTextIndentDirection
): true {
  const plan = planPlainTextIndentTransaction(view.state, direction);
  if (plan.changes.length > 0) {
    view.dispatch(
      view.state.update({
        changes: ChangeSet.of(plan.changes, view.state.doc.length),
        userEvent: direction === "indent" ? "input.indent" : "delete.dedent"
      })
    );
  }
  // Same "always report handled" contract as indentCommands.ts's
  // runIndentDirection — a no-op (e.g. outdenting a line with no leading
  // whitespace) is a normal, complete outcome for this key.
  return true;
}

export const plainTextIndentCommand: Command = (view) =>
  runPlainTextIndentDirection(view, "indent");

export const plainTextOutdentCommand: Command = (view) =>
  runPlainTextIndentDirection(view, "outdent");

/**
 * #546 follow-up ("Refine Tab behavior for plain text documents"): Tab in a
 * `.txt` document is text-entry-like, not always line-based like `Mod+]` /
 * toolbar indent / `Shift+Tab` remain. Selection shape decides which:
 *
 * - multiple selections (multi-cursor) -> line-based indent (same as
 *   {@link plainTextIndentCommand})
 * - a single selection spanning more than one line -> line-based indent
 * - a single non-empty selection within one line -> replaced with the
 *   configured indent unit (ordinary text-replacement behavior)
 * - no selection (empty caret) -> the configured indent unit is inserted at
 *   the caret
 *
 * Only Tab gets this treatment (ADR-0014 T-2 / #546's own `documentIsMarkdownFacet`
 * routing is unaffected) — `Mod+]` / `Mod+[`, the toolbar, and `Shift+Tab`
 * keep their existing always-line-based commands unchanged.
 */
function isPlainTextTabLineBased(state: EditorState): boolean {
  if (state.selection.ranges.length > 1) {
    return true;
  }
  const range = state.selection.main;
  if (range.empty) {
    return false;
  }
  return (
    state.doc.lineAt(range.from).number !== state.doc.lineAt(range.to).number
  );
}

export function planPlainTextTabTransaction(
  state: EditorState,
  unit?: TextFilesIndentUnit
): PlainTextIndentPlan {
  if (state.readOnly) {
    return { changes: [] };
  }

  if (isPlainTextTabLineBased(state)) {
    return planPlainTextIndentTransaction(state, "indent", unit);
  }

  const effectiveUnit = unit ?? state.facet(textFileIndentUnitFacet);
  const range = state.selection.main;
  const insertText = resolveTextFilesIndentText(effectiveUnit);
  return {
    changes: [{ from: range.from, to: range.to, insert: insertText }],
    // CodeMirror's default change-mapping would otherwise leave the newly
    // inserted text itself selected (mapping the old range's two endpoints
    // to the insertion's start/end) — explicitly collapse to a caret right
    // after the inserted unit instead, matching ordinary text-replacement.
    selection: EditorSelection.single(range.from + insertText.length)
  };
}

export const plainTextTabCommand: Command = (view) => {
  const plan = planPlainTextTabTransaction(view.state);
  if (plan.changes.length > 0) {
    view.dispatch(
      view.state.update({
        changes: ChangeSet.of(plan.changes, view.state.doc.length),
        ...(plan.selection ? { selection: plan.selection } : {}),
        userEvent: "input.indent"
      })
    );
  }
  return true;
};
