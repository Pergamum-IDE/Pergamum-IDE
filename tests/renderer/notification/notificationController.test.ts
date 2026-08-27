import { describe, expect, it, vi } from "vitest";
import {
  NotificationController,
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

  readonly timers: NotificationTimers = {
    setTimeout: (fn, delayMs) => {
      const handle = this.nextHandle++;
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
}

function messages(controller: NotificationController): readonly string[] {
  return controller.getNotifications().map((entry) => entry.message);
}

describe("NotificationController (#266)", () => {
  describe("add", () => {
    it("adds an information notification and exposes it in insertion order", () => {
      const controller = new NotificationController();

      controller.notify({ message: "first" });
      controller.notify({ message: "second" });

      expect(messages(controller)).toEqual(["first", "second"]);
    });

    it("returns a distinct id per notification and never replaces an existing one", () => {
      const controller = new NotificationController();

      const firstId = controller.notify({ message: "first" });
      const secondId = controller.notify({ message: "second" });

      expect(firstId).not.toBe(secondId);
      expect(controller.getNotifications()).toHaveLength(2);
    });

    it("notifies subscribers when a notification is added", () => {
      const controller = new NotificationController();
      const onChange = vi.fn();

      controller.subscribe(onChange);
      controller.notify({ message: "hello" });

      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  describe("manual dismiss", () => {
    it("removes only the targeted notification and notifies subscribers", () => {
      const controller = new NotificationController();
      const onChange = vi.fn();

      const firstId = controller.notify({ message: "first" });
      controller.notify({ message: "second" });
      controller.subscribe(onChange);

      controller.dismiss(firstId);

      expect(messages(controller)).toEqual(["second"]);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("is a no-op for an unknown / already-removed id (no throw, no change notification)", () => {
      const controller = new NotificationController();
      const onChange = vi.fn();

      const id = controller.notify({ message: "hello" });
      controller.dismiss(id);
      controller.subscribe(onChange);

      expect(() => controller.dismiss(id)).not.toThrow();
      expect(() => controller.dismiss("never-issued")).not.toThrow();
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("auto dismiss", () => {
    it("removes a notification once its own duration has elapsed", () => {
      const fake = new FakeTimers();
      const controller = new NotificationController({
        autoDismissMs: 10_000,
        timers: fake.timers
      });
      const onChange = vi.fn();

      controller.notify({ message: "hello" });
      controller.subscribe(onChange);

      fake.advance(9_999);
      expect(messages(controller)).toEqual(["hello"]);

      fake.advance(1);
      expect(messages(controller)).toEqual([]);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("does not schedule auto dismiss when the duration is 0 (the explicit 'do not auto-dismiss' setting value)", () => {
      const fake = new FakeTimers();
      const controller = new NotificationController({
        autoDismissMs: 0,
        timers: fake.timers
      });

      controller.notify({ message: "sticky" });
      fake.advance(1_000_000);

      expect(messages(controller)).toEqual(["sticky"]);
      expect(fake.pendingCount).toBe(0);
    });

    it("does not schedule auto dismiss for a non-finite duration", () => {
      const fake = new FakeTimers();
      const controller = new NotificationController({
        autoDismissMs: Number.NaN,
        timers: fake.timers
      });

      controller.notify({ message: "hello" });
      fake.advance(1_000_000);

      expect(messages(controller)).toEqual(["hello"]);
      expect(fake.pendingCount).toBe(0);
    });
  });

  describe("multiple notifications with independent lifecycles", () => {
    it("keeps each notification's auto-dismiss timer independent of the others", () => {
      const fake = new FakeTimers();
      const controller = new NotificationController({
        autoDismissMs: 10_000,
        timers: fake.timers
      });

      controller.notify({ message: "A" });
      fake.advance(5_000);
      controller.notify({ message: "B" });

      // A has 5s left, B has 10s left.
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

      controller.dismiss(firstId);
      expect(fake.pendingCount).toBe(1);

      fake.advance(10_000);
      expect(messages(controller)).toEqual([]);
    });

    it("setAutoDismissMs only affects notifications created afterwards", () => {
      const fake = new FakeTimers();
      const controller = new NotificationController({
        autoDismissMs: 10_000,
        timers: fake.timers
      });

      controller.notify({ message: "A" });
      controller.setAutoDismissMs(2_000);
      controller.notify({ message: "B" });

      fake.advance(2_000);
      expect(messages(controller)).toEqual(["A"]);

      fake.advance(8_000);
      expect(messages(controller)).toEqual([]);
    });

    it("changing the duration to 0 does not cancel a visible toast's already-scheduled timer", () => {
      const fake = new FakeTimers();
      const controller = new NotificationController({
        autoDismissMs: 10_000,
        timers: fake.timers
      });

      controller.notify({ message: "A" });
      controller.setAutoDismissMs(0);

      fake.advance(10_000);
      expect(messages(controller)).toEqual([]);
    });
  });

  describe("dispose", () => {
    it("drops every notification and cancels every pending timer", () => {
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
