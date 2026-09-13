import { describe, expect, it } from "vitest";
import {
  getCurrentActiveEditorSelectionText,
  publishCurrentActiveEditorSelectionAccess,
  unpublishCurrentActiveEditorSelectionAccess,
  type ActiveEditorSelectionAccess
} from "../../src/renderer/find/activeEditorSelectionAccess";

describe("activeEditorSelectionAccess module-level slot (#457)", () => {
  it("an unpublish for an object that was never published is a harmless no-op", () => {
    const access: ActiveEditorSelectionAccess = { getSelectionText: () => "x" };
    expect(() => unpublishCurrentActiveEditorSelectionAccess(access)).not.toThrow();
  });

  it("getCurrentActiveEditorSelectionText reflects the published accessor", () => {
    const access: ActiveEditorSelectionAccess = {
      getSelectionText: () => "hello world"
    };
    publishCurrentActiveEditorSelectionAccess(access);
    expect(getCurrentActiveEditorSelectionText()).toBe("hello world");
    unpublishCurrentActiveEditorSelectionAccess(access);
  });

  it("reflects the LIVE return value on every call, not a snapshot", () => {
    let value = "first";
    const access: ActiveEditorSelectionAccess = {
      getSelectionText: () => value
    };
    publishCurrentActiveEditorSelectionAccess(access);
    expect(getCurrentActiveEditorSelectionText()).toBe("first");
    value = "second";
    expect(getCurrentActiveEditorSelectionText()).toBe("second");
    unpublishCurrentActiveEditorSelectionAccess(access);
  });

  it("preserves a raw multiline selection text unmodified", () => {
    const access: ActiveEditorSelectionAccess = {
      getSelectionText: () => " foo\nbar "
    };
    publishCurrentActiveEditorSelectionAccess(access);
    expect(getCurrentActiveEditorSelectionText()).toBe(" foo\nbar ");
    unpublishCurrentActiveEditorSelectionAccess(access);
  });

  it("unpublish clears the slot back to ''", () => {
    const access: ActiveEditorSelectionAccess = { getSelectionText: () => "x" };
    publishCurrentActiveEditorSelectionAccess(access);
    expect(getCurrentActiveEditorSelectionText()).toBe("x");
    unpublishCurrentActiveEditorSelectionAccess(access);
    expect(getCurrentActiveEditorSelectionText()).toBe("");
  });

  it("unpublish with a STALE (non-current) object does not clear the current publish (remount safety)", () => {
    const stale: ActiveEditorSelectionAccess = { getSelectionText: () => "stale" };
    const current: ActiveEditorSelectionAccess = { getSelectionText: () => "current" };

    publishCurrentActiveEditorSelectionAccess(stale);
    publishCurrentActiveEditorSelectionAccess(current);
    // The stale mount's (async) teardown fires after the new mount published.
    unpublishCurrentActiveEditorSelectionAccess(stale);

    expect(getCurrentActiveEditorSelectionText()).toBe("current");
    unpublishCurrentActiveEditorSelectionAccess(current);
  });

  it("a later publish replaces an earlier one", () => {
    const first: ActiveEditorSelectionAccess = { getSelectionText: () => "first" };
    const second: ActiveEditorSelectionAccess = { getSelectionText: () => "second" };

    publishCurrentActiveEditorSelectionAccess(first);
    publishCurrentActiveEditorSelectionAccess(second);
    expect(getCurrentActiveEditorSelectionText()).toBe("second");
    unpublishCurrentActiveEditorSelectionAccess(second);
  });
});
