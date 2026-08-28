/**
 * #274: a tiny, DOM-free "guaranteed-recognition Error dialog" queue.
 *
 * Same contract as the #272 SUSPENDED-persistence Error dialog: an Error
 * that becomes due is *presented* exactly once — not merely *attempted*
 * once. `DialogController.confirm()` rejects with `dialogAlreadyOpen` while
 * another modal is open, so a "set shown = true, fire and forget" approach
 * loses the dialog forever. This queue separates:
 *
 *   - `owed`   — a cause's Error is due but not yet on screen
 *   - `shown`  — it has actually been presented (never a second one)
 *   - `ready`  — the cold-start restore sequence (launch routing / any
 *                read-only confirmation) has reached a safe boundary; until
 *                then nothing is presented, so it cannot race a
 *                launch-routing modal
 *
 * `pump()` presents at most ONE owed-and-unshown dialog per call, only when
 * `ready` and the dialog controller is idle. A rejected presentation rolls
 * `shown` back and re-arms `owed`. When a dialog starts presenting, `pump()`
 * returns its completion promise so callers with follow-up policies can
 * re-check after dismissal. The caller re-invokes `pump()` whenever dialogs
 * go idle (the dialog-controller subscription).
 *
 * It holds no React / DOM / `DialogController` reference — the caller
 * injects `isDialogPending` and `present` — so the sequencing rules are
 * unit-testable directly.
 */

export interface DeferredErrorDialogPumpDeps {
  /** True when the dialog controller currently has a modal request pending. */
  readonly isDialogPending: () => boolean;
  /**
   * Put the identified Error dialog on screen. Resolves when it closes;
   * rejects (e.g. `dialogAlreadyOpen`, or a presentation race) if it could
   * not be shown right now.
   */
  readonly present: (id: string) => Promise<unknown> | void;
}

export class DeferredErrorDialogQueue {
  private readonly owed = new Set<string>();
  private readonly shown = new Set<string>();
  private readonly presenting = new Set<string>();
  private ready = false;

  /** `priority` lists the cause ids in presentation order. */
  constructor(private readonly priority: readonly string[]) {}

  /**
   * Mark a cause's Error as owed. A no-op (returns `false`) when that cause
   * is already owed or already shown — so repeated same-cause notifications
   * never stack modals.
   */
  arm(id: string): boolean {
    if (this.shown.has(id) || this.owed.has(id)) {
      return false;
    }

    this.owed.add(id);
    return true;
  }

  /** The cold-start restore sequence has settled; owed dialogs may present. */
  markReady(): void {
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  isOwed(id: string): boolean {
    return this.owed.has(id);
  }

  isShown(id: string): boolean {
    return this.shown.has(id);
  }

  hasOutstanding(): boolean {
    return this.owed.size > 0 || this.presenting.size > 0;
  }

  /**
   * Present the highest-priority owed-and-unshown Error dialog, if `ready`
   * and no modal is open. Starts at most one presentation per call. On a
   * rejected `present`, `shown` is rolled back and `owed` re-armed so the
   * dialog is never permanently lost. Returns `null` when nothing starts.
   */
  pump(deps: DeferredErrorDialogPumpDeps): Promise<void> | null {
    if (!this.ready || deps.isDialogPending()) {
      return null;
    }

    const next = this.priority.find(
      (id) => this.owed.has(id) && !this.shown.has(id)
    );

    if (next === undefined) {
      return null;
    }

    this.owed.delete(next);
    this.shown.add(next);
    this.presenting.add(next);

    return Promise.resolve()
      .then(() => deps.present(next))
      .then(() => undefined)
      .catch(() => {
        this.shown.delete(next);
        this.owed.add(next);
      })
      .finally(() => {
        this.presenting.delete(next);
      });
  }
}
