/**
 * #273: the Markdown / CodeMirror editor View State foundation.
 *
 *     CodeMirror / Editor
 *         ↓ captureEditorViewState
 *     Serializable EditorViewState   (plain JSON-safe data)
 *         ↓ applyEditorViewState  (validate / digest-gate / re-apply)
 *     CodeMirror / Editor
 *
 * This module produces and consumes only application-level plain data. It
 * NEVER persists anything: no Session file, no Session schema, no userData
 * write, no SQLite, no `pergamum.json`, no startup restore, no recovery,
 * no NotificationToast. Those are later Issues. #273 delivers the type, the
 * capture API, validation, the apply API, the mismatch result, and tests —
 * nothing that writes to disk.
 *
 * Scope: Markdown / CodeMirror editor only. Glossary Editor and every other
 * editor kind are out of scope.
 *
 * The returned `EditorViewState` must stay serializable: no `EditorView`,
 * no `EditorState`, no CodeMirror `SelectionRange` / `Transaction`, no DOM
 * node, no function, no class instance — only strings, numbers, booleans,
 * null, plain objects and arrays. The document body itself is never
 * included; only its SHA-256 digest is.
 */

import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import {
  computeEditorContentDigest,
  editorContentMatchesDigest,
  type EditorContentDigest
} from "./editorContentDigest";

/**
 * Primary selection only (#273). `anchor` is the fixed end, `head` the
 * moving end — so `anchor <= head` is a forward selection, `anchor > head`
 * a reverse selection, and `anchor === head` a plain caret. Storing both
 * ends preserves selection direction across a round trip.
 */
export interface SerializableEditorSelection {
  readonly anchor: number;
  readonly head: number;
}

/**
 * Application-level scroll representation — the editor scroller's pixel
 * offsets, never CodeMirror's internal scroll snapshot / `ScrollTarget`
 * object. `null` means "no usable scroll information was captured"; a
 * caller must treat that as "leave scroll alone / start at the top", not
 * as an error.
 */
export interface SerializableScrollState {
  readonly top: number;
  readonly left: number;
}

export interface EditorViewState {
  readonly contentDigest: EditorContentDigest;
  readonly selection: SerializableEditorSelection;
  readonly scroll: SerializableScrollState | null;
}

/**
 * Why `applyEditorViewState` did not restore cleanly.
 *
 * - `stateMissing` — no View State was supplied (`null` / `undefined`).
 * - `stateMalformed` — the supplied value is not a well-formed
 *   `EditorViewState` (bad digest descriptor or bad selection shape).
 * - `selectionClamped` — digest matched, but a selection endpoint was
 *   out of `[0, docLength]` (or non-integer) and was clamped.
 * - `selectionReset` — digest matched, but the selection was unusable
 *   (NaN / Infinity) and was reset to a zero-length caret at the document
 *   start.
 * - `scrollDropped` — digest matched, but the scroll value was malformed
 *   or could not be applied; every other part of the View State was still
 *   applied.
 */
export type EditorViewStateFallbackReason =
  | "stateMissing"
  | "stateMalformed"
  | "selectionClamped"
  | "selectionReset"
  | "scrollDropped";

/**
 * Outcome of `applyEditorViewState`, designed so a later Session Restore
 * caller can tell the three cases apart:
 *
 * - `applied` — digest matched and every value restored verbatim.
 * - `contentMismatch` — the document open now is not the one the View
 *   State was captured from; NOTHING from the saved View State was
 *   applied, and the editor was normalized to its initial state (caret at
 *   document start, zero-length selection, scroll at top). A Session
 *   Restore caller receiving this is the one that would surface the
 *   "file changed externally, cursor reset" NotificationToast — #273 does
 *   not show it.
 * - `fallback` — the View State was missing/malformed, or the digest
 *   matched but individual values needed safe fallback; `reasons` says
 *   which. The document open was never failed as a whole.
 */
export type ApplyEditorViewStateResult =
  | { readonly status: "applied" }
  | { readonly status: "contentMismatch" }
  | {
      readonly status: "fallback";
      readonly reasons: readonly EditorViewStateFallbackReason[];
    };

/**
 * Read the editor scroller's pixel offsets as plain numbers. Pure
 * observation — never dispatches, focuses, or mutates. Returns `null` when
 * the scroller is unavailable or reports non-finite values (e.g. a
 * not-yet-laid-out editor).
 */
function captureScrollState(view: EditorView): SerializableScrollState | null {
  try {
    const scroller = view.scrollDOM;

    if (!scroller) {
      return null;
    }

    const top = scroller.scrollTop;
    const left = scroller.scrollLeft;

    if (!Number.isFinite(top) || !Number.isFinite(left)) {
      return null;
    }

    return { top, left };
  } catch {
    return null;
  }
}

/**
 * Capture the current Markdown editor View as a serializable
 * `EditorViewState`.
 *
 * This is a strictly read-only observation. It does NOT move focus, does
 * NOT commit or cancel an IME composition, does NOT dispatch a transaction,
 * and does NOT otherwise change editor state. Preedit / IME candidate state
 * is never read into the result.
 *
 * The SHA-256 digest is computed here, once, from the content CodeMirror
 * currently holds (`view.state.doc.toString()`, already "\n"-normalized) —
 * not from raw file bytes, and not on any per-keystroke path.
 */
export function captureEditorViewState(view: EditorView): EditorViewState {
  const content = view.state.doc.toString();
  const main = view.state.selection.main;

  return {
    contentDigest: computeEditorContentDigest(content),
    selection: { anchor: main.anchor, head: main.head },
    scroll: captureScrollState(view)
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/** A SHA-256 digest string: exactly 64 lowercase hexadecimal characters. */
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

function isValidDigestDescriptor(value: unknown): value is EditorContentDigest {
  return (
    isPlainObject(value) &&
    value.algorithm === "sha256" &&
    typeof value.digest === "string" &&
    SHA256_HEX_PATTERN.test(value.digest)
  );
}

function isSelectionShape(
  value: unknown
): value is SerializableEditorSelection {
  return (
    isPlainObject(value) &&
    typeof value.anchor === "number" &&
    typeof value.head === "number"
  );
}

/**
 * Result of validating the `scroll` slot of an untrusted View State:
 *
 * - `none` — no scroll to restore (captured as `null` / absent). Not a
 *   fallback: the caller just starts at the top.
 * - `value` — a usable pixel offset pair.
 * - `malformed` — a scroll value was present but unusable; apply reports
 *   `scrollDropped` and touches nothing else.
 */
export type ParsedScrollState =
  | { readonly kind: "none" }
  | { readonly kind: "value"; readonly value: SerializableScrollState }
  | { readonly kind: "malformed" };

export interface ParsedEditorViewStateValue {
  readonly contentDigest: EditorContentDigest;
  readonly selection: SerializableEditorSelection;
  readonly scroll: ParsedScrollState;
}

type ParsedEditorViewState =
  | { readonly ok: true; readonly value: ParsedEditorViewStateValue }
  | {
      readonly ok: false;
      readonly reason: "stateMissing" | "stateMalformed";
    };

function parseScrollState(scroll: unknown): ParsedScrollState {
  if (scroll === null || scroll === undefined) {
    return { kind: "none" };
  }

  if (
    isPlainObject(scroll) &&
    typeof scroll.top === "number" &&
    typeof scroll.left === "number" &&
    Number.isFinite(scroll.top) &&
    Number.isFinite(scroll.left) &&
    scroll.top >= 0 &&
    scroll.left >= 0
  ) {
    return { kind: "value", value: { top: scroll.top, left: scroll.left } };
  }

  return { kind: "malformed" };
}

/**
 * Validate an untrusted value as an `EditorViewState`. Strict about the
 * digest descriptor and the selection *shape* (both endpoints must be
 * numbers — range checking happens later, against the live document).
 * Lenient about `scroll`: a malformed scroll never makes the whole state
 * malformed (it is dropped during apply instead), so a bad scroll can
 * never cost the caller its selection.
 */
export function parseEditorViewState(input: unknown): ParsedEditorViewState {
  if (input === null || input === undefined) {
    return { ok: false, reason: "stateMissing" };
  }

  if (!isPlainObject(input)) {
    return { ok: false, reason: "stateMalformed" };
  }

  if (!isValidDigestDescriptor(input.contentDigest)) {
    return { ok: false, reason: "stateMalformed" };
  }

  if (!isSelectionShape(input.selection)) {
    return { ok: false, reason: "stateMalformed" };
  }

  return {
    ok: true,
    value: {
      contentDigest: {
        algorithm: "sha256",
        digest: input.contentDigest.digest
      },
      selection: {
        anchor: input.selection.anchor,
        head: input.selection.head
      },
      scroll: parseScrollState(input.scroll)
    }
  };
}

function clampEndpoint(value: number, docLength: number): number {
  if (value < 0) {
    return 0;
  }

  if (value > docLength) {
    return docLength;
  }

  return Math.trunc(value);
}

interface ResolvedSelection {
  readonly anchor: number;
  readonly head: number;
  readonly reason: "selectionClamped" | "selectionReset" | null;
}

/**
 * Turn a shape-valid but possibly out-of-range / non-finite selection into
 * one that is safe to apply to a document of `docLength` characters.
 *
 *   endpoint < 0               → document start
 *   endpoint > document length → document end
 *   NaN / Infinity             → whole selection reset to a caret at start
 *
 * This is the fallback for a digest that DOES match but whose stored
 * selection values are bad — never a guess at "where the caret used to be"
 * after an external edit.
 */
function resolveSelection(
  selection: SerializableEditorSelection,
  docLength: number
): ResolvedSelection {
  if (
    !Number.isFinite(selection.anchor) ||
    !Number.isFinite(selection.head)
  ) {
    return { anchor: 0, head: 0, reason: "selectionReset" };
  }

  const anchor = clampEndpoint(selection.anchor, docLength);
  const head = clampEndpoint(selection.head, docLength);
  const clamped =
    anchor !== selection.anchor || head !== selection.head;

  return { anchor, head, reason: clamped ? "selectionClamped" : null };
}

/**
 * Apply parsed scroll to the editor scroller via its public `scrollDOM`.
 * Returns `false` (→ `scrollDropped`) when scroll was present but unusable
 * or could not be applied; `none` is a no-op success. No fixed-timeout
 * waiting: the pixel offsets are assigned synchronously and the browser
 * clamps them to the current layout.
 */
function applyScrollState(
  view: EditorView,
  scroll: ParsedScrollState
): boolean {
  if (scroll.kind === "none") {
    return true;
  }

  if (scroll.kind === "malformed") {
    return false;
  }

  try {
    const scroller = view.scrollDOM;

    if (!scroller) {
      return false;
    }

    scroller.scrollTop = scroll.value.top;
    scroller.scrollLeft = scroll.value.left;
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalize the editor to its initial View State: caret at the document
 * start, zero-length selection, scroll at the top. Used when the content
 * digest does not match — the saved View State is discarded wholesale, not
 * partially applied, and no attempt is made to infer the old position.
 */
function resetEditorViewToInitialState(view: EditorView): void {
  view.dispatch({
    selection: EditorSelection.single(0),
    scrollIntoView: false
  });

  try {
    const scroller = view.scrollDOM;

    if (scroller) {
      scroller.scrollTop = 0;
      scroller.scrollLeft = 0;
    }
  } catch {
    // A missing / unstyled scroller just means there is nothing to reset.
  }
}

/**
 * Apply a previously captured `EditorViewState` to the current Markdown
 * editor View.
 *
 * Gate: the digest of the document open *now* (computed the exact same way
 * as at capture) must equal the stored digest. Only then are caret,
 * primary selection and scroll restored, with per-value safe fallback for
 * malformed / out-of-range data. If the digest does not match, nothing
 * from the saved View State is applied and the editor is reset to its
 * initial state; the caller gets `contentMismatch` and owns any user-facing
 * notification.
 *
 * This is foundation only: #273 wires it to unit / integration tests and
 * leaves the real Session Restore lifecycle call sites to a later Issue.
 */
export function applyEditorViewState(
  view: EditorView,
  input: unknown
): ApplyEditorViewStateResult {
  const parsed = parseEditorViewState(input);

  if (!parsed.ok) {
    // Missing / malformed: there is nothing trustworthy to restore. Leave
    // the freshly-opened editor as CodeMirror created it (already a caret
    // at the document start) rather than fighting it.
    return { status: "fallback", reasons: [parsed.reason] };
  }

  const currentContent = view.state.doc.toString();

  if (!editorContentMatchesDigest(currentContent, parsed.value.contentDigest)) {
    resetEditorViewToInitialState(view);
    return { status: "contentMismatch" };
  }

  const reasons: EditorViewStateFallbackReason[] = [];
  const docLength = view.state.doc.length;

  const resolved = resolveSelection(parsed.value.selection, docLength);

  if (resolved.reason) {
    reasons.push(resolved.reason);
  }

  view.dispatch({
    selection: EditorSelection.range(resolved.anchor, resolved.head),
    scrollIntoView: false
  });

  if (!applyScrollState(view, parsed.value.scroll)) {
    reasons.push("scrollDropped");
  }

  return reasons.length === 0
    ? { status: "applied" }
    : { status: "fallback", reasons };
}
