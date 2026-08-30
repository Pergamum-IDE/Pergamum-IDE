import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RecoveryDocumentPayload,
  RecoveryDocumentWriteResult
} from "../../src/shared/recoveryDocument";
import type { RecoveryDirtyDocument } from "../../src/renderer/recovery/recoveryDocumentPayload";
import {
  RecoveryPayloadCoordinator,
  RECOVERY_IDLE_FLUSH_MS,
  RECOVERY_MAX_FLUSH_MS,
  type RecoveryPayloadScheduler
} from "../../src/renderer/recovery/recoveryPayloadCoordinator";

// ---------------------------------------------------------------------------
// A deterministic scheduler + clock.
// ---------------------------------------------------------------------------

class FakeClock {
  private nowMs = 0;
  private nextId = 1;
  private timers = new Map<
    number,
    { fireAt: number; callback: () => void }
  >();

  readonly scheduler: RecoveryPayloadScheduler = {
    schedule: (callback, delayMs) => {
      const id = this.nextId++;
      this.timers.set(id, { fireAt: this.nowMs + delayMs, callback });
      return id;
    },
    cancel: (handle) => {
      this.timers.delete(handle as number);
    }
  };

  now = (): number => this.nowMs;

  async advance(ms: number): Promise<void> {
    const target = this.nowMs + ms;
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, t]) => t.fireAt <= target)
        .sort((a, b) => a[1].fireAt - b[1].fireAt);
      if (due.length === 0) break;
      const [id, timer] = due[0];
      this.timers.delete(id);
      this.nowMs = timer.fireAt;
      timer.callback();
      await Promise.resolve();
      await Promise.resolve();
    }
    this.nowMs = target;
    await Promise.resolve();
  }
}

function payload(
  documentKey: string,
  payloadText: string
): RecoveryDocumentPayload {
  return {
    documentKey,
    documentType: documentKey.startsWith("untitled:")
      ? "markdown.untitled"
      : "markdown.file",
    sourceUri: documentKey.replace(/^(file|untitled):/, "$1://"),
    displayName: "doc.md",
    payloadText
  };
}

function dirty(
  documentKey: string,
  payloadText: string
): RecoveryDirtyDocument {
  return { documentKey, payload: payload(documentKey, payloadText) };
}

interface Harness {
  coordinator: RecoveryPayloadCoordinator;
  clock: FakeClock;
  upsert: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  flushErrors: Array<{ documentKey: string; operation: string }>;
  onPersisted: ReturnType<typeof vi.fn>;
}

function makeHarness(
  opts: {
    enabled?: boolean;
    upsertImpl?: (
      p: RecoveryDocumentPayload
    ) => RecoveryDocumentWriteResult | Promise<RecoveryDocumentWriteResult>;
    deleteImpl?: (
      k: string
    ) => RecoveryDocumentWriteResult | Promise<RecoveryDocumentWriteResult>;
  } = {}
): Harness {
  const clock = new FakeClock();
  const upsert = vi.fn(
    opts.upsertImpl ??
      ((): RecoveryDocumentWriteResult => ({ ok: true, mode: "inserted" }))
  );
  const del = vi.fn(
    opts.deleteImpl ??
      ((): RecoveryDocumentWriteResult => ({ ok: true, mode: "deleted" }))
  );
  const flushErrors: Harness["flushErrors"] = [];
  const onPersisted = vi.fn();

  const coordinator = new RecoveryPayloadCoordinator({
    transport: { upsert, delete: del },
    enabled: opts.enabled ?? true,
    scheduler: clock.scheduler,
    now: clock.now,
    onFlushError: (info) =>
      flushErrors.push({
        documentKey: info.documentKey,
        operation: info.operation
      }),
    onPersisted
  });

  return { coordinator, clock, upsert, del, flushErrors, onPersisted };
}

// ---------------------------------------------------------------------------

describe("RecoveryPayloadCoordinator — cadence", () => {
  it("flushes ~3s after the last dirty change (idle)", async () => {
    const h = makeHarness();
    h.coordinator.updateDirtyDocuments([dirty("file:C:/a.md", "v1")]);

    await h.clock.advance(RECOVERY_IDLE_FLUSH_MS - 1);
    expect(h.upsert).not.toHaveBeenCalled();

    await h.clock.advance(1);
    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(h.upsert.mock.calls[0][0].payloadText).toBe("v1");
  });

  it("still flushes within the 60s ceiling under continuous typing", async () => {
    const h = makeHarness();
    // A keystroke every 2s for well past the idle window; the idle timer
    // keeps resetting, but the max ceiling forces a flush.
    for (let i = 0; i < 40; i++) {
      h.coordinator.updateDirtyDocuments([dirty("file:C:/a.md", `v${i}`)]);
      await h.clock.advance(2_000);
    }
    // A flush must have happened at or before the ceiling.
    expect(h.upsert.mock.calls.length).toBeGreaterThanOrEqual(1);
    const firstFlushAt = h.upsert.mock.invocationCallOrder[0];
    expect(firstFlushAt).toBeGreaterThan(0);
    // The last flush is never older than RECOVERY_MAX_FLUSH_MS behind now.
    await h.clock.advance(RECOVERY_MAX_FLUSH_MS);
    expect(h.upsert.mock.calls.at(-1)?.[0].payloadText).toBe("v39");
  });

  it("does not flush a clean document set", async () => {
    const h = makeHarness();
    h.coordinator.updateDirtyDocuments([]);
    await h.clock.advance(RECOVERY_MAX_FLUSH_MS + 10_000);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("does not re-flush an unchanged payload", async () => {
    const h = makeHarness();
    h.coordinator.updateDirtyDocuments([dirty("file:C:/a.md", "same")]);
    await h.clock.advance(RECOVERY_IDLE_FLUSH_MS);
    expect(h.upsert).toHaveBeenCalledTimes(1);

    h.coordinator.updateDirtyDocuments([dirty("file:C:/a.md", "same")]);
    await h.clock.advance(RECOVERY_MAX_FLUSH_MS);
    expect(h.upsert).toHaveBeenCalledTimes(1);
  });

  it("is a complete no-op when disabled (Recovery non-owner)", async () => {
    const h = makeHarness({ enabled: false });
    h.coordinator.updateDirtyDocuments([dirty("file:C:/a.md", "v1")]);
    h.coordinator.onSaveSucceeded({
      oldKey: "file:C:/a.md",
      newKey: "file:C:/a.md",
      postSavePayload: null
    });
    await h.clock.advance(RECOVERY_MAX_FLUSH_MS + 10_000);
    expect(h.upsert).not.toHaveBeenCalled();
    expect(h.del).not.toHaveBeenCalled();
  });
});

describe("RecoveryPayloadCoordinator — enable after edits (ownership resolved late)", () => {
  it("re-evaluates the retained dirty set on disabled → enabled and flushes it", async () => {
    const h = makeHarness({ enabled: false });

    // 1. An edit lands BEFORE Recovery ownership is known.
    h.coordinator.updateDirtyDocuments([dirty("file:C:/a.md", "edited-early")]);
    // 2. While disabled the feed is a no-op.
    await h.clock.advance(RECOVERY_MAX_FLUSH_MS + 10_000);
    expect(h.upsert).not.toHaveBeenCalled();

    // 3. getStoreStatus resolves → owner → enabled; NO further edit occurs.
    h.coordinator.setEnabled(true);

    // 4. The retained dirty doc is flushed on the normal idle cadence.
    await h.clock.advance(RECOVERY_IDLE_FLUSH_MS);
    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(h.upsert.mock.calls[0][0].payloadText).toBe("edited-early");
  });

  it("does not resurrect a stale dirty set once the document is clean again", async () => {
    const h = makeHarness({ enabled: false });
    h.coordinator.updateDirtyDocuments([dirty("file:C:/a.md", "v1")]);
    // The doc returned to clean before ownership resolved.
    h.coordinator.updateDirtyDocuments([]);

    h.coordinator.setEnabled(true);
    await h.clock.advance(RECOVERY_MAX_FLUSH_MS + 10_000);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("disabling again clears pending work", async () => {
    const h = makeHarness({ enabled: false });
    h.coordinator.updateDirtyDocuments([dirty("file:C:/a.md", "v1")]);
    h.coordinator.setEnabled(true);
    h.coordinator.setEnabled(false);
    await h.clock.advance(RECOVERY_MAX_FLUSH_MS + 10_000);
    expect(h.upsert).not.toHaveBeenCalled();
  });
});

describe("RecoveryPayloadCoordinator — tab close / disappearance", () => {
  it("never deletes a Recovery row when a dirty document leaves the set", async () => {
    const h = makeHarness();
    h.coordinator.updateDirtyDocuments([dirty("file:C:/a.md", "v1")]);
    await h.clock.advance(RECOVERY_IDLE_FLUSH_MS);
    expect(h.upsert).toHaveBeenCalledTimes(1);

    // Tab closed / doc became clean → gone from the dirty set.
    h.coordinator.updateDirtyDocuments([]);
    await h.clock.advance(RECOVERY_MAX_FLUSH_MS + 10_000);

    expect(h.del).not.toHaveBeenCalled();
  });
});

describe("RecoveryPayloadCoordinator — onPathsRelocated (#320)", () => {
  it("moves a queued (unflushed) payload from the old key to the new one, rewriting its identity", async () => {
    const h = makeHarness();
    h.coordinator.updateDirtyDocuments([dirty("file:C:/Novel/old.md", "v1")]);

    // Rename happens before the idle flush fires.
    h.coordinator.onPathsRelocated([
      { oldKey: "file:C:/Novel/old.md", newKey: "file:C:/Novel/Drafts/new.md" }
    ]);
    await h.clock.advance(RECOVERY_IDLE_FLUSH_MS);

    expect(h.upsert).toHaveBeenCalledTimes(1);
    const p = h.upsert.mock.calls[0][0];
    expect(p.documentKey).toBe("file:C:/Novel/Drafts/new.md");
    expect(p.sourceUri).toBe("file://C:/Novel/Drafts/new.md");
    expect(p.filePath).toBe("C:/Novel/Drafts/new.md");
    expect(p.displayName).toBe("new.md");
    expect(p.payloadText).toBe("v1");
    // The old key is never written or deleted.
    expect(h.del).not.toHaveBeenCalled();
  });

  it("does not resurrect anything when there is nothing queued, and never deletes a row", async () => {
    const h = makeHarness();
    h.coordinator.updateDirtyDocuments([dirty("file:C:/Novel/old.md", "v1")]);
    await h.clock.advance(RECOVERY_IDLE_FLUSH_MS);
    expect(h.upsert).toHaveBeenCalledTimes(1);
    h.upsert.mockClear();

    h.coordinator.onPathsRelocated([
      { oldKey: "file:C:/Novel/old.md", newKey: "file:C:/Novel/new.md" }
    ]);
    await h.clock.advance(RECOVERY_MAX_FLUSH_MS);

    expect(h.upsert).not.toHaveBeenCalled();
    expect(h.del).not.toHaveBeenCalled();
  });

  it("keeps a fresher payload already queued under the new key", async () => {
    const h = makeHarness();
    h.coordinator.updateDirtyDocuments([dirty("file:C:/Novel/old.md", "v1")]);
    // Host re-fed after the rename: the rebuilt payload is already under the
    // new key when the relocation call arrives.
    h.coordinator.updateDirtyDocuments([
      dirty("file:C:/Novel/new.md", "v2-rebuilt"),
      dirty("file:C:/Novel/old.md", "v1")
    ]);

    h.coordinator.onPathsRelocated([
      { oldKey: "file:C:/Novel/old.md", newKey: "file:C:/Novel/new.md" }
    ]);
    await h.clock.advance(RECOVERY_IDLE_FLUSH_MS);

    const byKey = new Map(
      h.upsert.mock.calls.map((c) => [c[0].documentKey, c[0].payloadText])
    );
    expect(byKey.get("file:C:/Novel/new.md")).toBe("v2-rebuilt");
    expect(byKey.has("file:C:/Novel/old.md")).toBe(false);
  });

  it("is a no-op while disabled", async () => {
    const h = makeHarness({ enabled: false });

    h.coordinator.onPathsRelocated([
      { oldKey: "file:C:/Novel/old.md", newKey: "file:C:/Novel/new.md" }
    ]);
    await h.clock.advance(RECOVERY_MAX_FLUSH_MS);

    expect(h.upsert).not.toHaveBeenCalled();
    expect(h.del).not.toHaveBeenCalled();
  });

  it("ignores a relocation whose old and new keys are identical", async () => {
    const h = makeHarness();
    h.coordinator.updateDirtyDocuments([dirty("file:C:/Novel/a.md", "v1")]);

    h.coordinator.onPathsRelocated([
      { oldKey: "file:C:/Novel/a.md", newKey: "file:C:/Novel/a.md" }
    ]);
    await h.clock.advance(RECOVERY_IDLE_FLUSH_MS);

    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(h.upsert.mock.calls[0][0].documentKey).toBe("file:C:/Novel/a.md");
  });
});

describe("RecoveryPayloadCoordinator — Save-success identity matrix", () => {
  it("normal Save, no in-flight edits: deletes the current key", async () => {
    const h = makeHarness();
    h.coordinator.updateDirtyDocuments([dirty("file:C:/a.md", "v1")]);
    await h.clock.advance(RECOVERY_IDLE_FLUSH_MS);

    h.coordinator.onSaveSucceeded({
      oldKey: "file:C:/a.md",
      newKey: "file:C:/a.md",
      postSavePayload: null
    });
    await h.clock.advance(1);

    expect(h.del).toHaveBeenCalledTimes(1);
    expect(h.del).toHaveBeenCalledWith("file:C:/a.md");
    // No extra upsert.
    expect(h.upsert).toHaveBeenCalledTimes(1);
  });

  it("normal Save with in-flight edits: upserts the SAME key and does NOT delete it", async () => {
    const h = makeHarness();
    h.coordinator.updateDirtyDocuments([dirty("file:C:/a.md", "v1")]);
    await h.clock.advance(RECOVERY_IDLE_FLUSH_MS);
    h.upsert.mockClear();

    h.coordinator.onSaveSucceeded({
      oldKey: "file:C:/a.md",
      newKey: "file:C:/a.md",
      postSavePayload: payload("file:C:/a.md", "v2-post-save-edit")
    });
    await h.clock.advance(1);

    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(h.upsert.mock.calls[0][0].payloadText).toBe("v2-post-save-edit");
    expect(h.del).not.toHaveBeenCalled();
  });

  it("Untitled first Save, no in-flight edits: deletes the old untitled key", async () => {
    const h = makeHarness();
    h.coordinator.updateDirtyDocuments([
      dirty("untitled:0198-uuid", "typed")
    ]);
    await h.clock.advance(RECOVERY_IDLE_FLUSH_MS);

    h.coordinator.onSaveSucceeded({
      oldKey: "untitled:0198-uuid",
      newKey: "file:C:/Novel/new.md",
      postSavePayload: null
    });
    await h.clock.advance(1);

    expect(h.del).toHaveBeenCalledTimes(1);
    expect(h.del).toHaveBeenCalledWith("untitled:0198-uuid");
  });

  it("Untitled first Save with in-flight edits: upserts the new file key, THEN deletes the old untitled key", async () => {
    const order: string[] = [];
    const h = makeHarness({
      upsertImpl: (p) => {
        order.push(`upsert:${p.documentKey}`);
        return { ok: true, mode: "inserted" };
      },
      deleteImpl: (k) => {
        order.push(`delete:${k}`);
        return { ok: true, mode: "deleted" };
      }
    });
    h.coordinator.updateDirtyDocuments([
      dirty("untitled:0198-uuid", "typed")
    ]);
    await h.clock.advance(RECOVERY_IDLE_FLUSH_MS);
    order.length = 0;

    h.coordinator.onSaveSucceeded({
      oldKey: "untitled:0198-uuid",
      newKey: "file:C:/Novel/new.md",
      postSavePayload: payload("file:C:/Novel/new.md", "typed + more")
    });
    await h.clock.advance(1);

    expect(order).toEqual([
      "upsert:file:C:/Novel/new.md",
      "delete:untitled:0198-uuid"
    ]);
    // The new key is never a delete target.
    expect(h.del).not.toHaveBeenCalledWith("file:C:/Novel/new.md");
  });

  it("Save failure: does NOT delete any Recovery row", async () => {
    const h = makeHarness();
    h.coordinator.updateDirtyDocuments([dirty("file:C:/a.md", "v1")]);
    await h.clock.advance(RECOVERY_IDLE_FLUSH_MS);

    // The host only calls onSaveSucceeded after the atomic write resolves;
    // a failed save simply never calls it.
    await h.clock.advance(RECOVERY_MAX_FLUSH_MS + 10_000);

    expect(h.del).not.toHaveBeenCalled();
  });

  it("keeps re-flushing the new key on the normal cadence after Save As", async () => {
    const h = makeHarness();
    h.coordinator.updateDirtyDocuments([dirty("untitled:u", "a")]);
    await h.clock.advance(RECOVERY_IDLE_FLUSH_MS);

    h.coordinator.onSaveSucceeded({
      oldKey: "untitled:u",
      newKey: "file:C:/x.md",
      postSavePayload: payload("file:C:/x.md", "a")
    });
    await h.clock.advance(1);
    h.upsert.mockClear();

    // A further edit under the new identity flushes on cadence.
    h.coordinator.updateDirtyDocuments([dirty("file:C:/x.md", "a + b")]);
    await h.clock.advance(RECOVERY_IDLE_FLUSH_MS);
    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(h.upsert.mock.calls[0][0].payloadText).toBe("a + b");
  });
});

describe("RecoveryPayloadCoordinator — failure handling", () => {
  it("keeps editing alive and retries after a flush error", async () => {
    let calls = 0;
    const h = makeHarness({
      upsertImpl: () => {
        calls++;
        return calls === 1
          ? { ok: false, error: "persist-failed" }
          : { ok: true, mode: "inserted" };
      }
    });
    h.coordinator.updateDirtyDocuments([dirty("file:C:/a.md", "v1")]);
    await h.clock.advance(RECOVERY_IDLE_FLUSH_MS);
    expect(h.flushErrors).toEqual([
      { documentKey: "file:C:/a.md", operation: "upsert" }
    ]);

    // Next change → retried, succeeds.
    h.coordinator.updateDirtyDocuments([dirty("file:C:/a.md", "v2")]);
    await h.clock.advance(RECOVERY_IDLE_FLUSH_MS);
    expect(h.upsert).toHaveBeenCalledTimes(2);
  });
});

describe("RecoveryPayloadCoordinator — onPersisted (backup-saved hint)", () => {
  it("fires once after a confirmed dirty-payload upsert", async () => {
    const h = makeHarness();
    h.coordinator.updateDirtyDocuments([dirty("file:C:/a.md", "v1")]);
    await h.clock.advance(RECOVERY_IDLE_FLUSH_MS);

    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(h.onPersisted).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire for a delete after a normal Save", async () => {
    const h = makeHarness();
    h.coordinator.updateDirtyDocuments([dirty("file:C:/a.md", "v1")]);
    await h.clock.advance(RECOVERY_IDLE_FLUSH_MS);
    h.onPersisted.mockClear();

    h.coordinator.onSaveSucceeded({
      oldKey: "file:C:/a.md",
      newKey: "file:C:/a.md",
      postSavePayload: null
    });
    await h.clock.advance(1);

    expect(h.del).toHaveBeenCalledTimes(1);
    expect(h.onPersisted).not.toHaveBeenCalled();
  });

  it("does NOT fire for a skipped (non-owner / unavailable) upsert", async () => {
    const h = makeHarness({
      upsertImpl: () => ({ ok: false, skipped: "not-owner" })
    });
    h.coordinator.updateDirtyDocuments([dirty("file:C:/a.md", "v1")]);
    await h.clock.advance(RECOVERY_IDLE_FLUSH_MS);

    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(h.onPersisted).not.toHaveBeenCalled();
  });

  it("does NOT fire for a failed upsert", async () => {
    const h = makeHarness({
      upsertImpl: () => ({ ok: false, error: "persist-failed" })
    });
    h.coordinator.updateDirtyDocuments([dirty("file:C:/a.md", "v1")]);
    await h.clock.advance(RECOVERY_IDLE_FLUSH_MS);

    expect(h.flushErrors).toEqual([
      { documentKey: "file:C:/a.md", operation: "upsert" }
    ]);
    expect(h.onPersisted).not.toHaveBeenCalled();
  });

  it("never fires while disabled (Recovery non-owner)", async () => {
    const h = makeHarness({ enabled: false });
    h.coordinator.updateDirtyDocuments([dirty("file:C:/a.md", "v1")]);
    h.coordinator.onSaveSucceeded({
      oldKey: "file:C:/a.md",
      newKey: "file:C:/a.md",
      postSavePayload: payload("file:C:/a.md", "v2")
    });
    await h.clock.advance(RECOVERY_MAX_FLUSH_MS + 10_000);

    expect(h.onPersisted).not.toHaveBeenCalled();
  });

  it("fires for the post-save-edit upsert but not for the paired delete", async () => {
    const h = makeHarness();
    h.coordinator.updateDirtyDocuments([dirty("untitled:u", "typed")]);
    await h.clock.advance(RECOVERY_IDLE_FLUSH_MS);
    h.onPersisted.mockClear();

    // Untitled first Save with an in-flight edit: upsert new key, delete old.
    h.coordinator.onSaveSucceeded({
      oldKey: "untitled:u",
      newKey: "file:C:/x.md",
      postSavePayload: payload("file:C:/x.md", "typed + more")
    });
    await h.clock.advance(1);

    expect(h.del).toHaveBeenCalledWith("untitled:u");
    expect(h.onPersisted).toHaveBeenCalledTimes(1);
  });
});

describe("RecoveryPayloadCoordinator — flushNow / dispose", () => {
  beforeEach(() => vi.clearAllMocks());

  it("flushNow flushes pending work immediately", async () => {
    const h = makeHarness();
    h.coordinator.updateDirtyDocuments([dirty("file:C:/a.md", "v1")]);
    await h.coordinator.flushNow();
    expect(h.upsert).toHaveBeenCalledTimes(1);
  });

  it("dispose stops all further flushing", async () => {
    const h = makeHarness();
    h.coordinator.updateDirtyDocuments([dirty("file:C:/a.md", "v1")]);
    h.coordinator.dispose();
    await h.clock.advance(RECOVERY_MAX_FLUSH_MS + 10_000);
    expect(h.upsert).not.toHaveBeenCalled();
  });
});
