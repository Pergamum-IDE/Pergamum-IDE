/**
 * #424 Slice 5 — pure helpers for Ctrl+Space Glossary IntelliSense inside the
 * active Find / Replace panel's `検索語句` / `置換語句` inputs.
 *
 * The Markdown Editor's in-body Glossary IntelliSense is the source of truth:
 * this module reuses its prefix strategy
 * ({@link extractGlossaryCompletionPrefix}), its `startsWith` matcher
 * ({@link filterGlossaryCompletionCandidates}), and — crucially — the same
 * {@link GlossaryCompletionDisplayItem} rows, so the popup renders identically.
 *
 * Panel-specific pieces only: which text becomes the filter prefix per input,
 * and how a picked value lands back in the input. The picked `insertText` is
 * always the atom's RAW value — never normalized to the representative form.
 */
import {
  extractGlossaryCompletionPrefix,
  filterGlossaryCompletionCandidates,
  toGlossaryCompletionDisplayItem,
  type GlossaryCompletionDisplayItem
} from "../glossaryCompletion";
import type { FindGlossaryCandidate } from "./findGlossaryPicker";

export type { GlossaryCompletionDisplayItem };

/** Which panel input the completion popup is attached to. */
export type ActiveFindGlossaryCompletionTarget = "query" | "replace";

/**
 * Candidate ceiling for the panel popup (Slice 5). Lower than the in-editor
 * completion's default — the panel popup is a small overlay.
 */
export const ACTIVE_FIND_GLOSSARY_COMPLETION_LIMIT = 50;

/**
 * The filter prefix for the popup, derived from the input's text + caret:
 * - `"query"`   → the WHOLE input value. The search box holds a single term,
 *   so a candidate is matched against everything typed so far.
 * - `"replace"` → the SAME prefix the in-editor completion would use at this
 *   caret ({@link extractGlossaryCompletionPrefix}: the longest caret-suffix
 *   that is itself a `startsWith` prefix of some registered form, else the
 *   delimiter-bounded run). `atomValues` is the flattened list of registered
 *   forms — ignored for `"query"`.
 */
export function resolveActiveFindGlossaryCompletionPrefix(
  target: ActiveFindGlossaryCompletionTarget,
  value: string,
  selectionStart: number,
  atomValues: readonly string[] = []
): string {
  if (target === "query") {
    return value;
  }
  const caret = Math.max(0, Math.min(selectionStart, value.length));
  return extractGlossaryCompletionPrefix(value.slice(0, caret), atomValues);
}

/** Every registered form across `candidates`, for the prefix strategy. */
export function activeFindGlossaryAtomValues(
  candidates: readonly FindGlossaryCandidate[]
): string[] {
  return candidates.map((candidate) => candidate.value);
}

/**
 * Prefix-filtered {@link GlossaryCompletionDisplayItem} rows for the popup, in
 * the project's own order — the exact rows the editor tooltip would show for
 * the same `prefix`.
 */
export function collectActiveFindGlossaryCompletionItems(
  candidates: readonly FindGlossaryCandidate[],
  prefix: string,
  limit: number = ACTIVE_FIND_GLOSSARY_COMPLETION_LIMIT
): GlossaryCompletionDisplayItem[] {
  // The panel's `candidates` are already the flattened, project-ordered atom
  // list (`findGlossaryPicker.collectFindGlossaryCandidates`), so feed them
  // straight into the shared matcher rather than round-tripping through
  // `GlossaryEntry[]`.
  return filterGlossaryCompletionCandidates({
    atoms: candidates,
    prefix,
    limit
  }).map(toGlossaryCompletionDisplayItem);
}

export interface ApplyActiveFindGlossaryCompletionInput {
  readonly value: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly insertText: string;
  readonly target: ActiveFindGlossaryCompletionTarget;
  /**
   * `"replace"` + no selection only: how many characters immediately before
   * the caret the completion prefix covered — they are replaced along with the
   * insert, exactly as the editor tooltip replaces its own prefix. `0` (and
   * always for `"query"` / a real selection) means a plain caret insert.
   */
  readonly replacePrefixLength?: number;
}

export interface ActiveFindGlossaryCompletionEdit {
  readonly value: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

/**
 * Apply a picked row to the input text:
 * - `"query"`   → replace the WHOLE value with `insertText`; caret at the end.
 *   (A single-term search box — selection is ignored.)
 * - `"replace"` → replace `[selectionStart − replacePrefixLength, selectionEnd)`
 *   with `insertText`. A real selection replaces exactly that range
 *   (`replacePrefixLength` is `0`); with no selection the covered completion
 *   prefix is consumed too, so typing `迷` + pick `迷子` yields `迷子`, never
 *   `迷迷子` — matching the editor tooltip. Caret lands right after the insert.
 *
 * `insertText` is inserted verbatim — never regex-escaped. The caller's regex
 * / replacement-template handling is unchanged.
 */
export function applyActiveFindGlossaryCompletion(
  input: ApplyActiveFindGlossaryCompletionInput
): ActiveFindGlossaryCompletionEdit {
  if (input.target === "query") {
    const caret = input.insertText.length;
    return { value: input.insertText, selectionStart: caret, selectionEnd: caret };
  }

  const selMin = Math.min(input.selectionStart, input.selectionEnd);
  const selMax = Math.max(input.selectionStart, input.selectionEnd);
  const hasSelection = selMax > selMin;
  const prefixLen = hasSelection
    ? 0
    : Math.max(0, Math.min(input.replacePrefixLength ?? 0, selMin));

  const start = Math.max(0, Math.min(selMin - prefixLen, input.value.length));
  const end = Math.max(start, Math.min(selMax, input.value.length));
  const nextValue =
    input.value.slice(0, start) + input.insertText + input.value.slice(end);
  const caret = start + input.insertText.length;
  return { value: nextValue, selectionStart: caret, selectionEnd: caret };
}
