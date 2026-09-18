import { describe, expect, it } from "vitest";
import {
  attributeKeydownPane,
  classifyPreviewScrollEvent,
  createPreviewScrollLeaderTracker
} from "../../src/renderer/previewScrollLeaderTracker";

describe("Preview scroll leader tracker (#505 Phase 1: sticky leadership)", () => {
  describe("initial value", () => {
    it("starts with editor as leader (app start)", () => {
      const tracker = createPreviewScrollLeaderTracker();
      expect(tracker.getLeader()).toBe("editor");
    });
  });

  describe("acquisition", () => {
    it.each([
      "wheel",
      "pointerdown",
      "touchstart",
      "focusin",
      "keydown",
      "editorTransactionScrollIntoView"
    ] as const)("acquires leadership for a pane on a %s input", (trigger) => {
      const tracker = createPreviewScrollLeaderTracker();

      const result = tracker.setLeader("preview", trigger);

      expect(result).toEqual({ leader: "preview", changed: true, trigger });
      expect(tracker.getLeader()).toBe("preview");
    });

    it("does not report changed on a repeat input from the same already-leading pane", () => {
      const tracker = createPreviewScrollLeaderTracker();

      tracker.setLeader("preview", "wheel");
      const result = tracker.setLeader("preview", "wheel");

      expect(result).toEqual({ leader: "preview", changed: false, trigger: "wheel" });
    });
  });

  describe("stickiness (no expiry)", () => {
    it("persists across many scroll-driven queries with no new input", () => {
      const tracker = createPreviewScrollLeaderTracker();
      tracker.setLeader("preview", "wheel");

      // Sticky: nothing decays it — simulate "a long time / many events pass".
      for (let i = 0; i < 1000; i += 1) {
        expect(tracker.getLeader()).toBe("preview");
      }
    });

    it("switches only on an input to the other pane, never on its own", () => {
      const tracker = createPreviewScrollLeaderTracker();
      tracker.setLeader("editor", "wheel");
      expect(tracker.getLeader()).toBe("editor");

      // Repeated same-pane input: still editor.
      tracker.setLeader("editor", "wheel");
      tracker.setLeader("editor", "keydown");
      expect(tracker.getLeader()).toBe("editor");

      // Input on the OTHER pane: switches immediately.
      const result = tracker.setLeader("preview", "wheel");
      expect(result).toEqual({ leader: "preview", changed: true, trigger: "wheel" });
      expect(tracker.getLeader()).toBe("preview");

      // And back again.
      tracker.setLeader("editor", "pointerdown");
      expect(tracker.getLeader()).toBe("editor");
    });
  });

  describe("reset", () => {
    it.each(["documentOpen", "tabSwitch"] as const)(
      "resets to editor on %s",
      (trigger) => {
        const tracker = createPreviewScrollLeaderTracker();
        tracker.setLeader("preview", "wheel");
        expect(tracker.getLeader()).toBe("preview");

        const result = tracker.reset(trigger);

        expect(result).toEqual({ leader: "editor", changed: true, trigger });
        expect(tracker.getLeader()).toBe("editor");
      }
    );

    it("reports changed: false when resetting while already editor", () => {
      const tracker = createPreviewScrollLeaderTracker();

      const result = tracker.reset("documentOpen");

      expect(result).toEqual({ leader: "editor", changed: false, trigger: "documentOpen" });
    });
  });

  describe("last pointerdown pane tracking", () => {
    it("starts with no last pointerdown pane", () => {
      const tracker = createPreviewScrollLeaderTracker();
      expect(tracker.getLastPointerDownPane()).toBeNull();
    });

    it("remembers the most recent pointerdown pane independent of current leader", () => {
      const tracker = createPreviewScrollLeaderTracker();

      tracker.notePointerDownPane("preview");
      expect(tracker.getLastPointerDownPane()).toBe("preview");

      tracker.setLeader("editor", "wheel");
      expect(tracker.getLastPointerDownPane()).toBe("preview");

      tracker.notePointerDownPane("editor");
      expect(tracker.getLastPointerDownPane()).toBe("editor");
    });
  });

  describe("attributeKeydownPane", () => {
    it("prefers the active element's pane when known", () => {
      expect(attributeKeydownPane("preview", "editor")).toBe("preview");
      expect(attributeKeydownPane("editor", "preview")).toBe("editor");
    });

    it("falls back to the last pointerdown pane when activeElement resolves to neither pane", () => {
      expect(attributeKeydownPane(null, "preview")).toBe("preview");
      expect(attributeKeydownPane(null, "editor")).toBe("editor");
    });

    it("leaves the leader unchanged (null) when neither signal resolves", () => {
      expect(attributeKeydownPane(null, null)).toBeNull();
    });
  });

  describe("classifyPreviewScrollEvent", () => {
    it("classifies as leader when the scrolling pane IS the current leader and the direction is enabled", () => {
      expect(classifyPreviewScrollEvent("editor", "editor", true)).toEqual({
        reason: "leader",
        leader: "editor",
        propagated: true
      });
    });

    it("classifies as follower when the OTHER pane is leader, regardless of the setting", () => {
      expect(classifyPreviewScrollEvent("preview", "editor", true)).toEqual({
        reason: "follower",
        leader: "editor",
        propagated: false
      });
      expect(classifyPreviewScrollEvent("preview", "editor", false)).toEqual({
        reason: "follower",
        leader: "editor",
        propagated: false
      });
    });

    it("classifies as disabledBySetting when the pane IS leader but the direction's setting is off", () => {
      expect(classifyPreviewScrollEvent("preview", "preview", false)).toEqual({
        reason: "disabledBySetting",
        leader: "preview",
        propagated: false
      });
    });

    it("propagated is true only for reason leader", () => {
      for (const pane of ["editor", "preview"] as const) {
        for (const leader of ["editor", "preview"] as const) {
          for (const writeEnabled of [true, false]) {
            const classification = classifyPreviewScrollEvent(pane, leader, writeEnabled);
            expect(classification.propagated).toBe(classification.reason === "leader");
          }
        }
      }
    });
  });
});
