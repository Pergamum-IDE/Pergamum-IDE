import { describe, expect, it, vi } from "vitest";
import {
  NotificationController,
  clampPriority,
  notificationToastMaxDurationMs,
  notificationToastMinDurationMs,
  resolveNotificationDurationMs,
  type NotificationTimers
} from "../../../src/renderer/notification/notificationController";

/**
 * A deterministic stand-in for setTimeout/clearTimeout so auto-dismiss and
 * per-notification timer lifecycle can be asserted without real time or
 * vitest's global fake timers.
 */
class FakeTimers {
  private handlers = new Map<number, { fn: () => void; at: number }>();
  private now = 0;
  private nextHandle = 1;
  private scheduledDelays: number[] = [];

  readonly timers: NotificationTimers = {
    setTimeout: (fn, delayMs) => {
      const handle = this.nextHandle++;
      this.scheduledDelays.push(delayMs);
      this.handlers.set(handle, { fn, at: this.now + delayMs });
      return handle as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (handle) => {
      this.handlers.delete(handle as unknown as number);
    }
  };

  advance(ms: number): void {
    this.now += ms;

    for (const [handle, entry] of [...this.handlers.entries()]) {
      if (entry.at <= this.now) {
        this.handlers.delete(handle);
        entry.fn();
      }
    }
  }

  get pendingCount(): number {
    return this.handlers.size;
  }

  get delays(): readonly number[] {
    return this.scheduledDelays;
  }
}

function messages(controller: NotificationController): readonly string[] {
  return controller.getNotifications().map((entry) => entry.message);
}

describe("NotificationController (#298)", () => {
  describe("request normalization", () => {
    it("adds an internal information notification with typed defaults", () => {
      const controller = new NotificationController({
        autoDismissMs: 10_000,
        now: () => "2026-08-29T00:00:00.000Z"
      });

      const id = controller.notify({ message: "hello" });
      const entry = controller.getNotifications()[0];

      expect(id).toBe(entry.id);
      expect(entry).toMatchObject({
        lane: "internal",
        priority: 10,
        message: "hello",
        icon: { kind: "preset", name: "info" },
        placement: { kind: "viewportBottomEnd" },
        motion: { kind: "slideUpFade" },
        detailRows: [],
        durationMs: 11_000,
        createdAt: "2026-08-29T00:00:00.000Z"
      });
    });

    it("clamps priority to 0..100 and falls back to the normal information priority for invalid input", () => {
      expect(clampPriority(-1)).toBe(0);
      expect(clampPriority(101)).toBe(100);
      expect(clampPriority(30)).toBe(30);
      expect(clampPriority(Number.NaN)).toBe(10);
      expect(clampPriority("30")).toBe(10);
    });

    it("accepts the trusted pergamum preset icon and rejects unknown preset names", () => {
      const controller = new NotificationController({
        visibleLimits: { internal: 2 }
      });

      controller.notify({
        message: "pergamum",
        icon: { kind: "preset", name: "pergamum" }
      });
      controller.notify({
        message: "unknown",
        icon: { kind: "preset", name: "custom-svg" } as never
      });

      expect(controller.getNotifications().map((entry) => entry.icon)).toEqual([
        { kind: "preset", name: "pergamum" },
        { kind: "preset", name: "info" }
      ]);
    });

    it("keeps marquee motion on ambient lane only and never with an action", () => {
      const controller = new NotificationController({
        visibleLimits: { ambient: 2 }
      });

      controller.notify({
        message: "ambient",
        lane: "ambient",
        motion: { kind: "marquee", direction: "inlineEnd" }
      });
      controller.notify({
        message: "internal",
        lane: "internal",
        motion: { kind: "marquee", direction: "inlineStart" }
      });
      controller.notify({
        message: "action",
        lane: "ambient",
        motion: { kind: "marquee", direction: "inlineStart" },
        action: {
          kind: "command",
          commandId: "workspace.recentProjects.toggle" as never,
          labelKey: "common.close"
        }
      });

      expect(controller.getNotifications().map((entry) => entry.motion)).toEqual([
        { kind: "slideUpFade" },
        { kind: "marquee", direction: "inlineEnd" },
        { kind: "slideUpFade" }
      ]);
    });
  });

  describe("output gate", () => {
    it("does not add or announce toasts while notification output is disabled", () => {
      const controller = new NotificationController({ outputEnabled: false });
      const onChange = vi.fn();

      controller.subscribe(onChange);

      expect(controller.notify({ message: "suppressed" })).toBeNull();
      expect(controller.getNotifications()).toEqual([]);
      expect(onChange).not.toHaveBeenCalled();
    });

    it("clears visible toasts and timers when notification output is disabled", () => {
      const fake = new FakeTimers();
      const controller = new NotificationController({
        autoDismissMs: 10_000,
        timers: fake.timers
      });
      const onChange = vi.fn();

      controller.notify({ message: "visible" });
      controller.subscribe(onChange);
      expect(fake.pendingCount).toBe(1);

      controller.setOutputEnabled(false);

      expect(controller.getNotifications()).toEqual([]);
      expect(fake.pendingCount).toBe(0);
      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  describe("auto dismiss duration", () => {
    it("resolves unspecified duration from base duration and priority, then clamps it", () => {
      expect(
        resolveNotificationDurationMs({
          baseDurationMs: 10_000,
          priority: 50
        })
      ).toBe(15_000);
      expect(
        resolveNotificationDurationMs({
          baseDurationMs: 1,
          priority: 0
        })
      ).toBe(notificationToastMinDurationMs);
      expect(
        resolveNotificationDurationMs({
          baseDurationMs: 600_000,
          priority: 100
        })
      ).toBe(notificationToastMaxDurationMs);
    });

    it("uses explicit duration first, still applying the safe min/max clamp", () => {
      expect(
        resolveNotificationDurationMs({
          baseDurationMs: 10_000,
          explicitDurationMs: 0,
          priority: 100
        })
      ).toBeNull();
      expect(
        resolveNotificationDurationMs({
          baseDurationMs: 10_000,
          explicitDurationMs: -1,
          priority: 100
        })
      ).toBeNull();
      expect(
        resolveNotificationDurationMs({
          baseDurationMs: 10_000,
          explicitDurationMs: 1,
          priority: 100
        })
      ).toBe(notificationToastMinDurationMs);
      expect(
        resolveNotificationDurationMs({
          baseDurationMs: 10_000,
          explicitDurationMs: 60_000,
          priority: 0
        })
      ).toBe(notificationToastMaxDurationMs);
    });

    it("removes a notification once its adjusted duration has elapsed", () => {
      const fake = new FakeTimers();
      const controller = new NotificationController({
        autoDismissMs: 10_000,
        timers: fake.timers
      });
      const onChange = vi.fn();

      controller.notify({ message: "hello", priority: 50 });
      controller.subscribe(onChange);

      fake.advance(14_999);
      expect(messages(controller)).toEqual(["hello"]);

      fake.advance(1);
      expect(messages(controller)).toEqual([]);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("does not schedule an auto-dismiss timer when the base duration is 0 or negative", () => {
      const fake = new FakeTimers();
      const controller = new NotificationController({
        autoDismissMs: 0,
        timers: fake.timers
      });

      controller.notify({ message: "sticky" });
      controller.setAutoDismissMs(-1);
      controller.notify({ message: "sticky negative" });

      expect(controller.getNotifications()[0].durationMs).toBeNull();
      expect(controller.getNotifications()[1].durationMs).toBeNull();
      expect(fake.pendingCount).toBe(0);
      expect(fake.delays).toEqual([]);
    });

    it("schedules the safe minimum duration when the base duration is non-finite", () => {
      const fake = new FakeTimers();
      const controller = new NotificationController({
        autoDismissMs: Number.NaN,
        timers: fake.timers
      });

      controller.notify({ message: "minimum" });

      expect(fake.delays).toEqual([notificationToastMinDurationMs]);
    });
  });

  describe("queue order and lane overflow", () => {
    it("orders visible toasts by lane, priority descending, then createdAt ascending", () => {
      const controller = new NotificationController({
        now: () => "2026-08-29T00:00:00.000Z"
      });

      controller.notify({
        message: "old normal",
        priority: 10,
        createdAt: "2026-08-29T00:00:01.000Z"
      });
      controller.notify({
        message: "external high",
        lane: "external",
        priority: 100,
        createdAt: "2026-08-29T00:00:00.000Z"
      });
      controller.notify({
        message: "new high",
        priority: 30,
        createdAt: "2026-08-29T00:00:02.000Z"
      });
      controller.notify({
        message: "old high",
        priority: 30,
        createdAt: "2026-08-29T00:00:00.000Z"
      });

      expect(messages(controller)).toEqual([
        "old high",
        "new high",
        "old normal",
        "external high"
      ]);
    });

    it("drops the lower-priority and then older notification only within the overflowing lane", () => {
      const controller = new NotificationController({
        visibleLimits: { internal: 2 }
      });

      controller.notify({
        message: "old low",
        priority: 10,
        createdAt: "2026-08-29T00:00:00.000Z"
      });
      controller.notify({
        message: "new low",
        priority: 10,
        createdAt: "2026-08-29T00:00:01.000Z"
      });
      controller.notify({
        message: "high",
        priority: 20,
        createdAt: "2026-08-29T00:00:02.000Z"
      });

      expect(messages(controller)).toEqual(["high", "new low"]);
    });

    it("lets external lane overflow drop only external toasts, never internal toasts", () => {
      const controller = new NotificationController({
        visibleLimits: { internal: 2, external: 1 }
      });

      controller.notify({ message: "internal A", lane: "internal", priority: 10 });
      controller.notify({ message: "internal B", lane: "internal", priority: 10 });
      controller.notify({ message: "external low", lane: "external", priority: 1 });
      controller.notify({
        message: "external high",
        lane: "external",
        priority: 100
      });

      expect(messages(controller)).toEqual([
        "internal A",
        "internal B",
        "external high"
      ]);
    });

    it("lets ambient lane overflow drop only ambient toasts, never internal or external toasts", () => {
      const controller = new NotificationController({
        visibleLimits: { internal: 1, external: 1, ambient: 1 }
      });

      controller.notify({ message: "internal", lane: "internal" });
      controller.notify({ message: "external", lane: "external" });
      controller.notify({ message: "ambient low", lane: "ambient", priority: 0 });
      controller.notify({
        message: "ambient high",
        lane: "ambient",
        priority: 100
      });

      expect(messages(controller)).toEqual([
        "internal",
        "external",
        "ambient high"
      ]);
    });
  });

  describe("manual dismiss and lifecycle", () => {
    it("removes only the targeted notification and notifies subscribers", () => {
      const controller = new NotificationController();
      const onChange = vi.fn();

      const firstId = controller.notify({ message: "first" });
      controller.notify({ message: "second" });
      controller.subscribe(onChange);

      controller.dismiss(String(firstId));

      expect(messages(controller)).toEqual(["second"]);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("is a no-op for an unknown / already-removed id (no throw, no change notification)", () => {
      const controller = new NotificationController();
      const onChange = vi.fn();

      const id = controller.notify({ message: "hello" });
      controller.dismiss(String(id));
      controller.subscribe(onChange);

      expect(() => controller.dismiss(String(id))).not.toThrow();
      expect(() => controller.dismiss("never-issued")).not.toThrow();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("keeps each notification's adjusted timer independent of the others", () => {
      const fake = new FakeTimers();
      const controller = new NotificationController({
        autoDismissMs: 10_000,
        timers: fake.timers
      });

      controller.notify({ message: "A", priority: 0 });
      fake.advance(5_000);
      controller.notify({ message: "B", priority: 0 });

      fake.advance(5_000);
      expect(messages(controller)).toEqual(["B"]);

      fake.advance(5_000);
      expect(messages(controller)).toEqual([]);
    });

    it("manual dismissal of one notification cancels only that toast's timer", () => {
      const fake = new FakeTimers();
      const controller = new NotificationController({
        autoDismissMs: 10_000,
        timers: fake.timers
      });

      const firstId = controller.notify({ message: "A" });
      controller.notify({ message: "B" });
      expect(fake.pendingCount).toBe(2);

      controller.dismiss(String(firstId));
      expect(fake.pendingCount).toBe(1);

      fake.advance(11_000);
      expect(messages(controller)).toEqual([]);
    });

    it("setAutoDismissMs only affects notifications created afterwards", () => {
      const fake = new FakeTimers();
      const controller = new NotificationController({
        autoDismissMs: 10_000,
        timers: fake.timers
      });

      controller.notify({ message: "A", priority: 0 });
      controller.setAutoDismissMs(2_000);
      controller.notify({ message: "B", priority: 0 });

      fake.advance(3_000);
      expect(messages(controller)).toEqual(["A"]);

      fake.advance(7_000);
      expect(messages(controller)).toEqual([]);
    });

    it("dispose drops every notification and cancels every pending timer", () => {
      const fake = new FakeTimers();
      const controller = new NotificationController({
        autoDismissMs: 10_000,
        timers: fake.timers
      });
      const onChange = vi.fn();

      controller.subscribe(onChange);
      controller.notify({ message: "A" });
      controller.notify({ message: "B" });
      onChange.mockClear();

      controller.dispose();

      expect(controller.getNotifications()).toEqual([]);
      expect(fake.pendingCount).toBe(0);

      fake.advance(1_000_000);
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
