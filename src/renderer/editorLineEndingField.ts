import {
  Range,
  RangeSet,
  RangeSetBuilder,
  RangeValue,
  StateEffect,
  StateField,
  Transaction,
  type Extension,
  type TransactionSpec
} from "@codemirror/state";
import { invertedEffects } from "@codemirror/commands";
import type { LineEndingBreak, LineEndingKind } from "./lineEndingTracking";

/**
 * #253: CodeMirror-side half of line-ending kind tracking. See
 * lineEndingTracking.ts for the CodeMirror-agnostic analysis/serialization
 * half. This module owns the `StateField` that keeps per-break kind data
 * positioned correctly across edits (via `RangeSet.map`) and exactly
 * restorable across Undo/Redo (via `@codemirror/commands`'s
 * `invertedEffects`, the documented mechanism for integrating custom
 * StateField data into CodeMirror's own undo history).
 */

export class LineEndingBreakValue extends RangeValue {
  constructor(readonly kind: LineEndingKind) {
    super();
  }

  eq(other: RangeValue): boolean {
    return other instanceof LineEndingBreakValue && other.kind === this.kind;
  }
}
// Point range: a line break lives at a single position, not a span.
LineEndingBreakValue.prototype.point = true;

export type LineEndingBreakSet = RangeSet<LineEndingBreakValue>;

export function buildLineEndingBreakSet(
  breaks: readonly LineEndingBreak[]
): LineEndingBreakSet {
  const builder = new RangeSetBuilder<LineEndingBreakValue>();

  for (const lineBreak of breaks) {
    builder.add(
      lineBreak.position,
      lineBreak.position,
      new LineEndingBreakValue(lineBreak.kind)
    );
  }

  return builder.finish();
}

/** Inverse of buildLineEndingBreakSet — only ever called at save time. */
export function lineEndingBreakSetToArray(
  set: LineEndingBreakSet
): readonly LineEndingBreak[] {
  const breaks: LineEndingBreak[] = [];
  const cursor = set.iter();

  while (cursor.value) {
    breaks.push({ position: cursor.from, kind: cursor.value.kind });
    cursor.next();
  }

  return breaks;
}

/**
 * Structural (not just reference) equality between two break sets — same
 * positions, same kinds, in the same order. Callers should check `a === b`
 * first (true immediately after open/save, since both sides are the exact
 * same RangeSet reference) and only fall back to this O(n) walk when the
 * references actually differ (see currentDocument.ts#isCurrentDocumentDirty)
 * — never per keystroke, and never by converting either side to an array
 * first.
 */
export function lineEndingBreakSetsEqual(
  a: LineEndingBreakSet,
  b: LineEndingBreakSet
): boolean {
  if (a === b) {
    return true;
  }

  const cursorA = a.iter();
  const cursorB = b.iter();

  while (cursorA.value && cursorB.value) {
    if (
      cursorA.from !== cursorB.from ||
      cursorA.value.kind !== cursorB.value.kind
    ) {
      return false;
    }
    cursorA.next();
    cursorB.next();
  }

  return !cursorA.value && !cursorB.value;
}

function findKindAtOrAfter(
  set: LineEndingBreakSet,
  position: number
): LineEndingKind | null {
  const cursor = set.iter(position);
  return cursor.value ? cursor.value.kind : null;
}

function findKindBefore(
  set: LineEndingBreakSet,
  position: number
): LineEndingKind | null {
  let result: LineEndingKind | null = null;
  const cursor = set.iter(0);

  while (cursor.value && cursor.from < position) {
    result = cursor.value.kind;
    cursor.next();
  }

  return result;
}

/**
 * #253 new-break inheritance rule: a newly created line break has no
 * original-file kind, so it takes on the *local* existing line-ending
 * style at its insertion point — never `editor.lineEnding.expected` or the
 * document's majority kind.
 *
 * 1. the existing break that follows the insertion point (in the
 *    pre-edit document), if any
 * 2. else the existing break that precedes it, if any
 * 3. else `fallback` (the effective `files.newFile.lineEnding` setting)
 */
export function inheritedKindForInsertion(
  oldSet: LineEndingBreakSet,
  insertionPosition: number,
  fallback: LineEndingKind
): LineEndingKind {
  return (
    findKindAtOrAfter(oldSet, insertionPosition) ??
    findKindBefore(oldSet, insertionPosition) ??
    fallback
  );
}

/**
 * Replaces the field's entire value outright, bypassing the normal
 * map/infer logic for that one transaction. Used for two things:
 *
 * 1. A genuine document switch — dispatched bundled into the same
 *    transaction as the content replace, seeded from the new document's
 *    `initialLineEndingBreaks`, so the tracking data is never briefly
 *    stale or mapped against the wrong document. (A `StateField`'s own
 *    `create()` cannot be used for this: CodeMirror advances a freshly
 *    `create()`d value through the very transaction that introduced the
 *    field, which would double-apply that transaction's own changes to
 *    the just-seeded breaks — confirmed directly against
 *    `@codemirror/state`, not assumed.)
 * 2. Undo/Redo (see `computeLineEndingInverseEffects` below) — the
 *    simplest exact-restoration strategy is "the inverse of any edit is
 *    resetting this field back to its exact pre-edit value", rather than
 *    surgically re-deriving just the affected positions. `RangeSet` is an
 *    immutable, structurally-shared data structure, so keeping a
 *    reference to a prior value around (as CodeMirror's own history
 *    already does for `ChangeSet`s) costs no more than that reference.
 *
 * `map` is explicitly `() => undefined` (never survives being mapped),
 * not the library's default identity map. This matters only for the
 * document-switch case: `@codemirror/commands`'s `history()` remaps every
 * *other* branch entry's effects through an `addToHistory: false`
 * transaction's changes (see documentSwitchTransactionSpec below) to
 * decide whether that entry should still be kept, and an entry survives
 * if `event.effects.length` is still nonzero after mapping — so a
 * resetLineEndingBreaksEffect left over on some earlier (still-undoable)
 * per-edit history entry would, under the default identity map, always
 * "survive" that check and keep the whole entry (and its now-irrelevant,
 * pre-switch RangeSet snapshot) alive in the undo stack indefinitely,
 * even though its own text changes did fully map away. Confirmed via a
 * direct `@codemirror/commands` reproduction: with the default map,
 * `undoDepth` stayed nonzero after a switch; with this explicit map, it
 * correctly drops to 0. This never affects ordinary (non-switch)
 * Undo/Redo of a single edit: `history()` applies a popped branch
 * entry's stored effects verbatim, without calling `.map()` on them at
 * all — `.map()` only runs when a *different*, later `addToHistory:
 * false` transaction forces existing entries to be re-evaluated.
 */
export const resetLineEndingBreaksEffect = StateEffect.define<
  LineEndingBreakSet
>({ map: () => undefined });

/**
 * The transaction spec for a genuine document switch (see
 * resetLineEndingBreaksEffect above) — bundles the whole-document content
 * replace with the tracking field reset into one transaction, and
 * excludes that transaction from CodeMirror's undo history entirely via
 * `Transaction.addToHistory.of(false)`.
 *
 * This exclusion is required, not cosmetic: the editor's `EditorView`
 * persists across document switches (a single instance is reused for
 * every open document, per #250), so without it, a document-replace
 * transaction is pushed onto the shared undo stack like any other edit.
 * Pressing Undo right after switching from document A to document B would
 * then replay A's content back into the transaction's inverse — but
 * `computeLineEndingInverseEffects` deliberately contributes no inverse
 * effect for a switch (see above), so only the *text* would revert to A
 * while the tracking field stayed at B's breaks, splitting content and
 * metadata across two different documents' generations.
 *
 * Marking the transaction `addToHistory: false` was verified (via a
 * direct `@codemirror/state`/`@codemirror/commands` script, not assumed)
 * to do more than skip recording it as its own undo step: CodeMirror's
 * `history()` remaps every existing history entry through this
 * transaction's changes instead of recording a new one, and remapping a
 * prior entry through a "replace the entire document" change collapses
 * that entry to a no-op — so the previous document's undo history becomes
 * unreachable (`undoDepth` drops to 0) immediately at the switch, not just
 * "not added to." `undo()`/`redo()` called right after a switch are then
 * confirmed no-ops.
 */
export function documentSwitchTransactionSpec(
  currentDocLength: number,
  value: string,
  initialBreaks: LineEndingBreakSet
): TransactionSpec {
  return {
    changes: { from: 0, to: currentDocLength, insert: value },
    effects: resetLineEndingBreaksEffect.of(initialBreaks),
    annotations: Transaction.addToHistory.of(false)
  };
}

/**
 * Registered via `invertedEffects.of(...)`: the inverse of any edit this
 * field reacted to is simply "go back to exactly what the field held
 * before that edit" — see resetLineEndingBreaksEffect above for why this
 * (rather than reconstructing just the diff) is both simpler and exactly
 * correct, with no re-inference and no edge cases around a new break
 * landing exactly on a change boundary.
 */
export function computeLineEndingInverseEffects(
  field: StateField<LineEndingBreakSet>,
  tr: Transaction
): readonly StateEffect<unknown>[] {
  // A document switch isn't an edit to make undoable against the previous
  // document's tracked breaks — see resetLineEndingBreaksEffect.
  if (tr.effects.some((effect) => effect.is(resetLineEndingBreaksEffect))) {
    return [];
  }

  if (!tr.docChanged) {
    return [];
  }

  const oldValue = tr.startState.field(field, false);

  return oldValue ? [resetLineEndingBreaksEffect.of(oldValue)] : [];
}

/**
 * Scans only the *inserted* text of each change in the transaction for new
 * "\n" characters (CodeMirror always normalizes inserted text the same way
 * it normalizes the initial document, so a new break is always exactly one
 * "\n" — see lineEndingTracking.ts's module comment). All new breaks
 * within a single change region (e.g. every break in one multi-line paste)
 * share one inherited kind, decided once per region — never per pasted
 * line, and never from the clipboard/paste source's own line endings.
 */
function findNewBreaks(
  oldSet: LineEndingBreakSet,
  tr: Transaction,
  fallback: LineEndingKind
): Range<LineEndingBreakValue>[] {
  const newRanges: Range<LineEndingBreakValue>[] = [];

  tr.changes.iterChanges((fromA, _toA, fromB, _toB, inserted) => {
    const insertedText = inserted.toString();

    if (!insertedText.includes("\n")) {
      return;
    }

    const kind = inheritedKindForInsertion(oldSet, fromA, fallback);
    let index = insertedText.indexOf("\n");

    while (index !== -1) {
      const position = fromB + index;
      newRanges.push(new LineEndingBreakValue(kind).range(position, position));
      index = insertedText.indexOf("\n", index + 1);
    }
  });

  return newRanges;
}

/**
 * Builds the StateField that tracks per-break line-ending kind across
 * edits. `initialBreaks` seeds it (from lineEndingTracking.ts's raw-content
 * analysis, run once at document open).
 *
 * `getNewFileLineEndingFallback` is read fresh on every transaction rather
 * than captured once, so a runtime change to the effective
 * `files.newFile.lineEnding` setting is honored the next time a new break
 * is created in a document with no existing breaks — without needing to
 * recreate this field (which, mid-document, would risk the same
 * create()-then-replay hazard documented on resetLineEndingBreaksEffect
 * above). It never affects an *existing* break's already-tracked kind.
 *
 * Per transaction: a resetLineEndingBreaksEffect (document switch, or
 * Undo/Redo via computeLineEndingInverseEffects) replaces the value
 * outright; otherwise `RangeSet.map` shifts/drops existing breaks for the
 * edit's positions (no full-document rescan), and new "\n"s in the
 * inserted text (if any — most keystrokes insert none) get the local
 * inherited kind.
 */
export function createLineEndingTrackingField(
  initialBreaks: readonly LineEndingBreak[],
  getNewFileLineEndingFallback: () => LineEndingKind
): StateField<LineEndingBreakSet> {
  const field: StateField<LineEndingBreakSet> = StateField.define({
    create: () => buildLineEndingBreakSet(initialBreaks),
    update(value, tr) {
      for (const effect of tr.effects) {
        if (effect.is(resetLineEndingBreaksEffect)) {
          return effect.value;
        }
      }

      if (!tr.docChanged) {
        return value;
      }

      const next = value.map(tr.changes);
      const newRanges = findNewBreaks(
        value,
        tr,
        getNewFileLineEndingFallback()
      );

      return newRanges.length === 0
        ? next
        : next.update({ add: newRanges, sort: true });
    }
  });

  return field;
}

/**
 * The extension a document's editor should install: the tracking field
 * plus its undo-history integration, bundled together so a caller can't
 * add one without the other.
 */
export function createLineEndingTrackingExtension(
  initialBreaks: readonly LineEndingBreak[],
  getNewFileLineEndingFallback: () => LineEndingKind
): { field: StateField<LineEndingBreakSet>; extension: Extension } {
  const field = createLineEndingTrackingField(
    initialBreaks,
    getNewFileLineEndingFallback
  );

  return {
    field,
    extension: [
      field,
      invertedEffects.of((tr) => computeLineEndingInverseEffects(field, tr))
    ]
  };
}
