import { describe, expect, it, vi } from "vitest";
import type {
  DebugLogLevel,
  DebugLogSnapshot,
  SanitizedDebugLogEvent
} from "../../src/shared/debugLog";
import {
  appendDebugLogEventBatch,
  createDebugLogPanelSessionController,
  formatDebugLogEventTime,
  mergeDebugLogSnapshotWithSubscribedEvents,
  resolveDebugLogSubscribedEventGap,
  type DebugLogApi,
  type DebugLogBatchScheduler
} from "../../src/renderer/debugLogPanelState";

function event(
  seq: number,
  overrides: Partial<SanitizedDebugLogEvent> = {}
): SanitizedDebugLogEvent {
  return {
    seq,
    timestamp: `2026-08-14T22:00:${String(seq).padStart(2, "0")}.000+09:00`,
    level: "debug" as DebugLogLevel,
    event: "command.invoked",
    ...overrides
  };
}

function snapshot(
  events: SanitizedDebugLogEvent[],
  overrides: Partial<DebugLogSnapshot> = {}
): DebugLogSnapshot {
  return {
    enabled: true,
    sessionId: "018f4b8c-7a2b-4c3d-9e4f-100000000001",
    events,
    uiDroppedEventCount: 0,
    uiBufferLimit: 1000,
    ...overrides
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: resolvePromise
  };
}

function createManualScheduler(): DebugLogBatchScheduler & {
  flush(): void;
  pendingCount(): number;
} {
  const callbacks: Array<() => void> = [];

  return {
    request(callback) {
      callbacks.push(callback);
      return callback;
    },
    cancel(handle) {
      const index = callbacks.indexOf(handle as () => void);

      if (index >= 0) {
        callbacks.splice(index, 1);
      }
    },
    flush() {
      const callback = callbacks.shift();
      callback?.();
    },
    pendingCount() {
      return callbacks.length;
    }
  };
}

describe("debug log panel state", () => {
  it("merges pre-snapshot subscription events without missing or duplicating seq", () => {
    const merged = mergeDebugLogSnapshotWithSubscribedEvents(snapshot([
      event(1),
      event(2)
    ]), [event(2), event(3)]);

    expect(merged.map((debugLogEvent) => debugLogEvent.seq)).toEqual([
      1,
      2,
      3
    ]);
  });

  it("does not treat a snapshot starting after seq 1 as a subscribed gap", () => {
    const gapResult = resolveDebugLogSubscribedEventGap(
      {
        lastSubscribedSeq: null,
        recoveryCount: 0,
        possibleGap: false
      },
      event(42)
    );

    expect(gapResult.shouldRecover).toBe(false);
    expect(gapResult.state.possibleGap).toBe(false);
  });

  it("detects seq gaps only inside the subscribed event stream", () => {
    const first = resolveDebugLogSubscribedEventGap(
      {
        lastSubscribedSeq: null,
        recoveryCount: 0,
        possibleGap: false
      },
      event(10)
    );
    const second = resolveDebugLogSubscribedEventGap(first.state, event(12));

    expect(first.shouldRecover).toBe(false);
    expect(second.shouldRecover).toBe(true);
    expect(second.state.recoveryCount).toBe(1);
  });

  it("bounds appended events by the UI buffer limit", () => {
    const events = appendDebugLogEventBatch([event(1), event(2)], [event(3)], 2);

    expect(events.map((debugLogEvent) => debugLogEvent.seq)).toEqual([2, 3]);
  });

  it("formats first-row and date-changing timestamps", () => {
    const now = new Date(2026, 7, 14, 23, 0, 0, 0);

    expect(
      formatDebugLogEventTime("2026-08-14T22:00:21.959+09:00", null, now)
    ).toBe("22:00:21.959");
    expect(
      formatDebugLogEventTime(
        "2026-08-15T00:00:00.012+09:00",
        "2026-08-14T23:59:59.900+09:00",
        now
      )
    ).toBe("2026-08-15 00:00:00.012");
    expect(
      formatDebugLogEventTime(
        "2026-08-15T00:00:01.345+09:00",
        "2026-08-15T00:00:00.012+09:00",
        now
      )
    ).toBe("00:00:01.345");
  });

  it("subscribes before snapshot and merges events received during the race", async () => {
    const initialSnapshot = deferred<DebugLogSnapshot>();
    const onEvent = vi.fn<DebugLogApi["onEvent"]>(() => vi.fn());
    const states: DebugLogSnapshot["events"][] = [];
    const controller = createDebugLogPanelSessionController({
      api: {
        getSnapshot: vi.fn(() => initialSnapshot.promise),
        onEvent
      },
      onStateChange: (state) => {
        states.push(state.events);
      },
      scheduler: createManualScheduler()
    });

    controller.start();
    const subscriber = onEvent.mock.calls[0][0];
    subscriber(event(2));
    subscriber(event(3));
    initialSnapshot.resolve(snapshot([event(1), event(2)]));
    await Promise.resolve();

    expect(states.at(-1)?.map((debugLogEvent) => debugLogEvent.seq)).toEqual([
      1,
      2,
      3
    ]);
  });

  it("batches subscribed event state updates", async () => {
    const scheduler = createManualScheduler();
    const onEvent = vi.fn<DebugLogApi["onEvent"]>(() => vi.fn());
    const states: DebugLogSnapshot["events"][] = [];
    const controller = createDebugLogPanelSessionController({
      api: {
        getSnapshot: vi.fn(() => Promise.resolve(snapshot([]))),
        onEvent
      },
      onStateChange: (state) => {
        states.push(state.events);
      },
      scheduler
    });

    controller.start();
    await Promise.resolve();
    const subscriber = onEvent.mock.calls[0][0];
    subscriber(event(1));
    subscriber(event(2));

    expect(states.at(-1)).toEqual([]);
    expect(scheduler.pendingCount()).toBe(1);

    scheduler.flush();

    expect(states.at(-1)?.map((debugLogEvent) => debugLogEvent.seq)).toEqual([
      1,
      2
    ]);
  });

  it("recovers from subscribed seq gaps up to three times", async () => {
    const scheduler = createManualScheduler();
    const onEvent = vi.fn<DebugLogApi["onEvent"]>(() => vi.fn());
    const getSnapshot = vi
      .fn()
      .mockResolvedValueOnce(snapshot([]))
      .mockResolvedValueOnce(snapshot([event(12)]))
      .mockResolvedValueOnce(snapshot([event(14)]))
      .mockResolvedValueOnce(snapshot([event(16)]));
    const states: Array<{ events: number[]; possibleGap: boolean }> = [];
    const controller = createDebugLogPanelSessionController({
      api: {
        getSnapshot,
        onEvent
      },
      onStateChange: (state) => {
        states.push({
          events: state.events.map((debugLogEvent) => debugLogEvent.seq),
          possibleGap: state.possibleGap
        });
      },
      scheduler
    });

    controller.start();
    await Promise.resolve();
    const subscriber = onEvent.mock.calls[0][0];
    subscriber(event(10));
    subscriber(event(12));
    await Promise.resolve();
    subscriber(event(14));
    await Promise.resolve();
    subscriber(event(16));
    await Promise.resolve();
    subscriber(event(18));
    await Promise.resolve();
    scheduler.flush();

    expect(getSnapshot).toHaveBeenCalledTimes(4);
    expect(states.at(-1)?.possibleGap).toBe(true);
  });

  it("cleans up the subscription and pending batch on dispose", async () => {
    const scheduler = createManualScheduler();
    const unsubscribe = vi.fn();
    const onEvent = vi.fn<DebugLogApi["onEvent"]>(() => unsubscribe);
    const states: DebugLogSnapshot["events"][] = [];
    const controller = createDebugLogPanelSessionController({
      api: {
        getSnapshot: vi.fn(() => Promise.resolve(snapshot([]))),
        onEvent
      },
      onStateChange: (state) => {
        states.push(state.events);
      },
      scheduler
    });

    controller.start();
    await Promise.resolve();
    const subscriber = onEvent.mock.calls[0][0];
    subscriber(event(1));
    controller.dispose();
    scheduler.flush();
    subscriber(event(2));

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toEqual([]);
  });
});
