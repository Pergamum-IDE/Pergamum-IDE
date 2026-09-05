import { describe, expect, it, vi } from "vitest";
import { DeferredErrorDialogQueue } from "../../src/renderer/dialog/deferredErrorDialogQueue";

/** Let the queue's internal `Promise.resolve().then(present).catch(...)` settle. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function make(priority = ["a", "b"]) {
  return new DeferredErrorDialogQueue(priority);
}

describe("DeferredErrorDialogQueue (#274 — guaranteed-recognition Error dialogs)", () => {
  it("does not present anything until the cold-start sequence is ready", async () => {
    const q = make();
    const present = vi.fn(() => Promise.resolve());

    q.arm("a");
    expect(q.hasOutstanding()).toBe(true);
    q.pump({ isDialogPending: () => false, present });
    await flush();
    expect(present).not.toHaveBeenCalled();
    expect(q.isOwed("a")).toBe(true);

    q.markReady();
    q.pump({ isDialogPending: () => false, present });
    await flush();
    expect(present).toHaveBeenCalledExactlyOnceWith("a");
    expect(q.isShown("a")).toBe(true);
    expect(q.isOwed("a")).toBe(false);
    expect(q.hasOutstanding()).toBe(false);
  });

  it("reports an Error dialog as outstanding until its presentation promise resolves", async () => {
    const q = make();
    let resolvePresentation: () => void = () => undefined;
    const pendingPresentation = new Promise<void>((resolve) => {
      resolvePresentation = resolve;
    });
    const present = vi.fn(() => pendingPresentation);

    q.arm("a");
    q.markReady();
    const presentation = q.pump({ isDialogPending: () => false, present });

    expect(q.hasOutstanding()).toBe(true);
    expect(q.isOwed("a")).toBe(false);
    expect(q.isShown("a")).toBe(true);

    await Promise.resolve();
    expect(present).toHaveBeenCalledExactlyOnceWith("a");
    expect(q.hasOutstanding()).toBe(true);

    resolvePresentation();
    await presentation;
    expect(q.hasOutstanding()).toBe(false);
  });

  it("BLOCKER regression 1: while a modal is open the Error stays owed, then presents exactly once when idle", async () => {
    const q = make();
    const present = vi.fn(() => Promise.resolve());
    q.arm("a");
    q.markReady();

    // Another modal is open (e.g. a launch-routing read-only confirmation).
    let modalOpen = true;
    q.pump({ isDialogPending: () => modalOpen, present });
    await flush();
    expect(present).not.toHaveBeenCalled();
    expect(q.isOwed("a")).toBe(true);

    // Modal closes → the dialog-controller subscription re-drives pump.
    modalOpen = false;
    q.pump({ isDialogPending: () => modalOpen, present });
    q.pump({ isDialogPending: () => modalOpen, present }); // idempotent re-drive
    await flush();
    expect(present).toHaveBeenCalledTimes(1);
    expect(present).toHaveBeenCalledWith("a");
  });

  it("BLOCKER regression 2: a rejected presentation rolls back `shown`, re-arms `owed`, and does not leak an unhandled rejection", async () => {
    const q = make();
    const rejection = new Error("dialogAlreadyOpen");
    let call = 0;
    const present = vi.fn(() => {
      call += 1;
      return call === 1 ? Promise.reject(rejection) : Promise.resolve();
    });

    q.arm("a");
    q.markReady();

    q.pump({ isDialogPending: () => false, present });
    await flush();
    // The first present rejected — must NOT be considered shown.
    expect(q.isShown("a")).toBe(false);
    expect(q.isOwed("a")).toBe(true);
    expect(q.hasOutstanding()).toBe(true);

    // A later idle re-drive presents it successfully.
    q.pump({ isDialogPending: () => false, present });
    await flush();
    expect(present).toHaveBeenCalledTimes(2);
    expect(q.isShown("a")).toBe(true);
    expect(q.isOwed("a")).toBe(false);
  });

  it("survives a synchronous throw from `present` the same way", async () => {
    const q = make();
    let call = 0;
    const present = vi.fn(() => {
      call += 1;
      if (call === 1) {
        throw new Error("sync boom");
      }
      return Promise.resolve();
    });

    q.arm("a");
    q.markReady();
    q.pump({ isDialogPending: () => false, present });
    await flush();
    expect(q.isOwed("a")).toBe(true);
    expect(q.isShown("a")).toBe(false);

    q.pump({ isDialogPending: () => false, present });
    await flush();
    expect(q.isShown("a")).toBe(true);
  });

  it("BLOCKER regression 5: repeated same-cause arming never stacks modals", async () => {
    const q = make();
    const present = vi.fn(() => Promise.resolve());
    q.markReady();

    expect(q.arm("a")).toBe(true);
    expect(q.arm("a")).toBe(false); // already owed
    expect(q.arm("a")).toBe(false);

    q.pump({ isDialogPending: () => false, present });
    await flush();
    expect(present).toHaveBeenCalledTimes(1);

    // Already shown → further arming is a no-op, pump presents nothing more.
    expect(q.arm("a")).toBe(false);
    q.pump({ isDialogPending: () => false, present });
    await flush();
    expect(present).toHaveBeenCalledTimes(1);
  });

  it("presents at most one per pump, in priority order, one after another as dialogs go idle", async () => {
    const q = make(["a", "b"]);
    const seen: string[] = [];
    const present = vi.fn((id: string) => {
      seen.push(id);
      return Promise.resolve();
    });

    q.arm("b");
    q.arm("a");
    q.markReady();

    q.pump({ isDialogPending: () => false, present });
    await flush();
    expect(seen).toEqual(["a"]); // priority: "a" before "b"
    expect(q.isOwed("b")).toBe(true);

    // The "a" dialog closed → idle → next pump presents "b".
    q.pump({ isDialogPending: () => false, present });
    await flush();
    expect(seen).toEqual(["a", "b"]);
    expect(q.isOwed("b")).toBe(false);
  });

  it("does nothing when there is nothing owed", async () => {
    const q = make();
    const present = vi.fn(() => Promise.resolve());
    q.markReady();
    q.pump({ isDialogPending: () => false, present });
    await flush();
    expect(present).not.toHaveBeenCalled();
  });

  it("tolerates a `present` that returns void (not a promise)", async () => {
    const q = make();
    const present = vi.fn<(id: string) => void>(() => undefined);
    q.arm("a");
    q.markReady();
    q.pump({ isDialogPending: () => false, present });
    await flush();
    expect(present).toHaveBeenCalledWith("a");
    expect(q.isShown("a")).toBe(true);
  });
});
