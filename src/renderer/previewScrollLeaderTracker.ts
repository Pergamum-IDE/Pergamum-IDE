/**
 * #505 Phase 1: input-based STICKY leader/ownership tracking for the
 * bidirectional preview <-> editor scroll sync.
 *
 * Phase 0 shipped a 150ms-expiry model (see git history for
 * createPreviewScrollLeaderTracker's earlier shape) and dogfooding it
 * surfaced that the expiry window itself was the wrong mechanism: under
 * load, a single frame can take longer than 150ms, so a genuine sustained
 * editor wheel gesture produced `noLeader` events mid-gesture (27 of 101 in
 * one dogfood run). Preview PageDown never acquired leadership at all
 * because focus is not inside `article.preview`. Typing/IME, incremental
 * find, and restoring scroll position on document open all moved the editor
 * with `noLeader`, which would have left the preview stranded.
 *
 * The fix: **the pane that last received input is the leader until the
 * other pane receives input.** No expiry, no "nobody owns this" window.
 * This is safe because of how the write side is built: writes only ever go
 * leader -> follower, and a follower's own scroll events never propagate —
 * so no feedback loop is possible regardless of what actually moves the
 * follower pane (a programmatic write, scroll anchoring, layout-settle
 * correction, or literally anything else). The old expiry existed to carve
 * out "nobody owns this, don't propagate" windows; in practice those
 * windows were indistinguishable from ordinary slow frames.
 */

export type PreviewScrollSyncPane = "editor" | "preview";

/** No "none" state after startup — the tracker always names a leader. */
export type PreviewScrollLeaderState = "editor" | "preview";

/** Input kinds that acquire leadership for the pane that received them. */
export type PreviewScrollLeaderInputTrigger =
  | "pointerdown"
  | "wheel"
  | "touchstart"
  | "focusin"
  | "keydown"
  | "editorTransactionScrollIntoView";

export type PreviewScrollLeaderResetTrigger = "documentOpen" | "tabSwitch";

export type PreviewScrollLeaderTrigger =
  | PreviewScrollLeaderInputTrigger
  | PreviewScrollLeaderResetTrigger;

export interface PreviewScrollLeaderResult {
  leader: PreviewScrollLeaderState;
  /** True only when THIS call caused the leader identity to change. */
  changed: boolean;
  trigger: PreviewScrollLeaderTrigger;
}

export interface PreviewScrollLeaderTracker {
  getLeader(): PreviewScrollLeaderState;
  /** Sticky: `pane` becomes leader and stays leader until the other pane wins it back. */
  setLeader(
    pane: PreviewScrollSyncPane,
    trigger: PreviewScrollLeaderInputTrigger
  ): PreviewScrollLeaderResult;
  /** Resets to "editor" — app start (the initial value), document open, tab switch. */
  reset(trigger: PreviewScrollLeaderResetTrigger): PreviewScrollLeaderResult;
  /** Tracks the pane of the most recent pointerdown, for keydown attribution. */
  notePointerDownPane(pane: PreviewScrollSyncPane): void;
  getLastPointerDownPane(): PreviewScrollSyncPane | null;
}

export function createPreviewScrollLeaderTracker(): PreviewScrollLeaderTracker {
  // "editor" is both the initial value and the app-start/document-open/
  // tab-switch reset target — see the module doc comment.
  let leader: PreviewScrollLeaderState = "editor";
  let lastPointerDownPane: PreviewScrollSyncPane | null = null;

  return {
    getLeader() {
      return leader;
    },
    setLeader(pane, trigger) {
      const previousLeader = leader;
      leader = pane;
      return { leader, changed: leader !== previousLeader, trigger };
    },
    reset(trigger) {
      const previousLeader = leader;
      leader = "editor";
      return { leader, changed: leader !== previousLeader, trigger };
    },
    notePointerDownPane(pane) {
      lastPointerDownPane = pane;
    },
    getLastPointerDownPane() {
      return lastPointerDownPane;
    }
  };
}

/**
 * #505 Phase 1 decision: attributes a `keydown` to a pane when focus itself
 * doesn't say — many scroll-driving keys (PageDown on the preview, for
 * instance) fire while focus sits somewhere that isn't inside either pane's
 * scroll container. Priority: `document.activeElement`'s pane, else the
 * last pane that received a `pointerdown`, else leave the leader unchanged
 * (`null`).
 */
export function attributeKeydownPane(
  activeElementPane: PreviewScrollSyncPane | null,
  lastPointerDownPane: PreviewScrollSyncPane | null
): PreviewScrollSyncPane | null {
  return activeElementPane ?? lastPointerDownPane ?? null;
}

export type PreviewScrollEventClassificationReason =
  | "leader"
  | "follower"
  | "disabledBySetting";

export interface PreviewScrollEventClassification {
  reason: PreviewScrollEventClassificationReason;
  leader: PreviewScrollLeaderState;
  propagated: boolean;
}

/**
 * #505 Phase 1: classifies a scroll event on `pane` given the leader
 * identity and whether this direction's write is enabled by settings.
 * `propagated` now reflects what actually happens — this gates the real
 * write, it is no longer a dry run.
 */
export function classifyPreviewScrollEvent(
  pane: PreviewScrollSyncPane,
  leader: PreviewScrollLeaderState,
  writeEnabledForThisDirection: boolean
): PreviewScrollEventClassification {
  if (pane !== leader) {
    return { reason: "follower", leader, propagated: false };
  }
  if (!writeEnabledForThisDirection) {
    return { reason: "disabledBySetting", leader, propagated: false };
  }
  return { reason: "leader", leader, propagated: true };
}
