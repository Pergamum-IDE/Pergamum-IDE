/**
 * #463 — the `Mod+]` / `Mod+[` indent / outdent command foundation (ADR-0014
 * "エディタのTabキー・インデント・アクセシビリティ方針").
 *
 * This issue's goal is the FOUNDATION, not the behavior: a single command
 * per direction that reads `EditorState.readOnly` (T-8 - never
 * `EditorView.editable`), extracts the selection's touched lines
 * ({@link extractTouchedLines}), classifies each one ({@link classifyLine}),
 * and dispatches through one small per-context dispatcher
 * ({@link buildLineChange}). Every context's handler is a stub that
 * returns `null` (no change) in this issue - list sink/lift, blockquote
 * indent/outdent, and fenced/indented-code indent are all explicitly
 * future work (ADR-0014 決定3, 決定6). A no-op is a normal, successful
 * result here, not a failure - see {@link IndentCommandResult}.
 *
 * `Mod+]` / `Mod+[` are NOT new key bindings on top of CodeMirror's own:
 * `@codemirror/commands`' `defaultKeymap` already binds them to the
 * generic, Markdown-unaware `indentMore` / `indentLess` (insert/remove a
 * flat `indentUnit` of whitespace on every selected line, regardless of
 * context). `markdownEditorCodeMirrorSetup.ts` filters those two bindings
 * out of `defaultKeymap` - the same way it already filters `searchKeymap`'s
 * native-panel openers - and this module's {@link editorIndentKeymap}
 * takes their place with the context-aware commands below.
 */

import {
  ChangeSet,
  type ChangeSpec,
  type EditorState,
  type Line,
  type Text
} from "@codemirror/state";
import type { Command, EditorView, KeyBinding } from "@codemirror/view";
import {
  canIndentListItem,
  classifyLine,
  type LineContext
} from "./indentLineContext";
import { extractTouchedLines } from "./indentTouchedLines";

export type IndentDirection = "indent" | "outdent";

/**
 * Why an indent / outdent command produced no document change. Kept
 * intentionally small and command-level (not one entry per `LineContext`):
 * when every touched line shares the same reason, that reason is reported
 * verbatim; a genuinely mixed selection falls back to `noSupportedLines`
 * (see {@link summarizeNoopReason}).
 */
export type IndentNoopReason =
  | "readonly"
  | "noSupportedLines"
  | "topLevelParagraph"
  | "outermostList"
  | "unsupportedContext";

export type IndentCommandResult =
  | { readonly kind: "applied"; readonly changedLineCount: number }
  | { readonly kind: "noop"; readonly reason: IndentNoopReason };

function getLeadingWhitespaceDeleteLength(lineText: string): number {
  if (lineText.startsWith("  ")) {
    return 2;
  }
  if (lineText.startsWith(" ") || lineText.startsWith("\t")) {
    return 1;
  }
  return 0;
}

/**
 * Per-line context + direction -> a document change, or `null` for "this
 * line contributes nothing".
 */
export function buildLineChange(
  line: Line,
  context: LineContext,
  direction: IndentDirection,
  doc?: Text
): ChangeSpec | null {
  switch (context) {
    case "listItem":
    case "nestedListItem":
      if (direction === "indent") {
        if (doc && canIndentListItem(doc, line)) {
          return { from: line.from, insert: "  " };
        }
        return null;
      }
      if (context === "nestedListItem") {
        const deleteLen = getLeadingWhitespaceDeleteLength(line.text);
        if (deleteLen > 0) {
          return { from: line.from, to: line.from + deleteLen, insert: "" };
        }
      }
      return null;
    case "blockquote":
      // Future work: blockquote indent / outdent (ADR-0014 決定3).
      return null;
    case "indentedCode":
      // Future work: fenced/indented code indent (ADR-0014 決定3, 決定5).
      return null;
    case "topLevelParagraph":
    case "blank":
    case "unsupportedContext":
      // ADR-0014 決定4: no Markdown "indent attribute" exists here - not a
      // safety fallback, there is nothing for this command to do.
      return null;
  }
}

/** The reason a single touched line contributed nothing, given its
 *  context and the requested direction. `listItem` outdent is T-5
 *  (最外周リスト項目 outdent は no-op) specifically, not a future-work stub;
 *  every other unimplemented context reports the generic bucket. */
function lineNoopReason(
  context: LineContext,
  direction: IndentDirection
): IndentNoopReason {
  switch (context) {
    case "topLevelParagraph":
      return "topLevelParagraph";
    case "listItem":
      return direction === "outdent" ? "outermostList" : "noSupportedLines";
    case "nestedListItem":
    case "blockquote":
    case "indentedCode":
      return "noSupportedLines";
    case "blank":
    case "unsupportedContext":
      return "unsupportedContext";
  }
}

/** Reduce every touched line's individual no-op reason to the single
 *  reason reported on {@link IndentCommandResult}: the shared reason when
 *  all touched lines agree, `noSupportedLines` for a genuine mix (or for
 *  no touched lines at all - defensive; a selection always has at least a
 *  cursor line in practice). */
function summarizeNoopReason(
  reasons: readonly IndentNoopReason[]
): IndentNoopReason {
  const [first, ...rest] = reasons;
  if (first === undefined) {
    return "noSupportedLines";
  }
  return rest.every((reason) => reason === first) ? first : "noSupportedLines";
}

interface IndentPlan {
  readonly changes: readonly ChangeSpec[];
  readonly result: IndentCommandResult;
}

/**
 * The pure core: given a document/selection snapshot and a direction,
 * decide what (if anything) to change, and why not otherwise. Never
 * touches a live `EditorView` - {@link indentCommand} / {@link outdentCommand}
 * are the thin CodeMirror `Command` wrappers that dispatch this plan's
 * `changes` when non-empty.
 *
 * `buildLineChangeImpl` defaults to the real {@link buildLineChange} (every
 * context a no-op stub today); tests pass a fake to prove the `applied` /
 * `changedLineCount` aggregation and multi-line-into-one-transaction
 * dispatch actually work, without waiting on a real list sink/lift, etc.
 */
export function planIndentTransaction(
  state: EditorState,
  direction: IndentDirection,
  buildLineChangeImpl: typeof buildLineChange = buildLineChange
): IndentPlan {
  if (state.readOnly) {
    return { changes: [], result: { kind: "noop", reason: "readonly" } };
  }

  const touchedLines = extractTouchedLines(state);
  if (touchedLines.length === 0) {
    return {
      changes: [],
      result: { kind: "noop", reason: "noSupportedLines" }
    };
  }

  const changes: ChangeSpec[] = [];
  const noopReasons: IndentNoopReason[] = [];

  for (const line of touchedLines) {
    const context = classifyLine(line.text);
    const change = buildLineChangeImpl(line, context, direction, state.doc);
    if (change === null) {
      noopReasons.push(lineNoopReason(context, direction));
    } else {
      changes.push(change);
    }
  }

  if (changes.length === 0) {
    return {
      changes: [],
      result: { kind: "noop", reason: summarizeNoopReason(noopReasons) }
    };
  }

  return {
    changes,
    result: { kind: "applied", changedLineCount: changes.length }
  };
}

function runIndentDirection(view: EditorView, direction: IndentDirection): true {
  const plan = planIndentTransaction(view.state, direction);
  if (plan.changes.length > 0) {
    view.dispatch(
      view.state.update({
        changes: ChangeSet.of(plan.changes, view.state.doc.length),
        userEvent: direction === "indent" ? "input.indent" : "delete.dedent"
      })
    );
  }
  // A no-op is a normal, complete outcome for this key (ADR-0014) - always
  // report the key as handled so nothing else (there is nothing else bound
  // to Mod+] / Mod+[ - see markdownEditorCodeMirrorSetup.ts) sees it next.
  return true;
}

/** `Mod+]` - indent. A CodeMirror `Command`: reads `view.state`, dispatches
 *  through `view.dispatch` when {@link planIndentTransaction} produced any
 *  changes, and otherwise leaves the document and selection untouched. */
export const indentCommand: Command = (view) =>
  runIndentDirection(view, "indent");

/** `Mod+[` - outdent. See {@link indentCommand}. */
export const outdentCommand: Command = (view) =>
  runIndentDirection(view, "outdent");

/**
 * Replaces `defaultKeymap`'s own `Mod-]` / `Mod-[` (bound to the generic,
 * Markdown-unaware `indentMore` / `indentLess`) with the context-aware
 * commands above. Deliberately does NOT bind `Tab` / `Shift-Tab` - Issue
 * #463 is the command foundation only; Tab capture is
 * `editor.captureTabInEditor`, a separate, not-yet-implemented opt-in
 * (ADR-0014 決定2).
 */
export const editorIndentKeymap: readonly KeyBinding[] = [
  { key: "Mod-]", run: indentCommand },
  { key: "Mod-[", run: outdentCommand }
];
