import { describe, expect, it, vi } from "vitest";
import { applicationCommandIds, editorCommandIds } from "../../src/shared/commandIds";
import { CommandRegistry } from "../../src/shared/commandRegistry";
import {
  canMutateWorkingCopy,
  createLifecycleCommitBarrier
} from "../../src/renderer/lifecycleCommitBarrier";

describe("lifecycle commit barrier (#271)", () => {
  it("starts inactive and returns to inactive after the current token exits", () => {
    const barrier = createLifecycleCommitBarrier();

    expect(barrier.isActive()).toBe(false);
    expect(barrier.currentIntent()).toBeNull();

    const token = barrier.enter("explicitProjectClose");

    expect(barrier.isActive()).toBe(true);
    expect(barrier.currentIntent()).toBe("explicitProjectClose");
    expect(barrier.isCurrent(token)).toBe(true);

    expect(barrier.exit(token)).toBe(true);
    expect(barrier.isActive()).toBe(false);
    expect(barrier.currentIntent()).toBeNull();
  });

  it("rejects double enter while a commit barrier is active", () => {
    const barrier = createLifecycleCommitBarrier();

    barrier.enter("ordinaryWindowClose");

    expect(() => barrier.enter("explicitApplicationQuit")).toThrow(
      "Lifecycle commit barrier is already active."
    );
    expect(barrier.currentIntent()).toBe("ordinaryWindowClose");
  });

  it("ignores stale exits and keeps the active token current", () => {
    const barrier = createLifecycleCommitBarrier();
    const firstToken = barrier.enter("explicitProjectClose");

    expect(barrier.exit(firstToken)).toBe(true);

    const secondToken = barrier.enter("explicitApplicationQuit");

    expect(barrier.exit(firstToken)).toBe(false);
    expect(barrier.isActive()).toBe(true);
    expect(barrier.isCurrent(secondToken)).toBe(true);
  });

  it("allows working-copy mutation only when both barrier and read-only project guard are inactive", () => {
    expect(
      canMutateWorkingCopy({
        lifecycleCommitBarrierActive: false,
        isReadOnlyProjectOwnedEditor: false
      })
    ).toBe(true);
    expect(
      canMutateWorkingCopy({
        lifecycleCommitBarrierActive: true,
        isReadOnlyProjectOwnedEditor: false
      })
    ).toBe(false);
    expect(
      canMutateWorkingCopy({
        lifecycleCommitBarrierActive: false,
        isReadOnlyProjectOwnedEditor: true
      })
    ).toBe(false);
  });

  it("blocks registry-routed state-mutating commands while the barrier is active", async () => {
    const barrier = createLifecycleCommitBarrier();
    const registry = new CommandRegistry();
    const openProject = vi.fn();
    const closeTab = vi.fn();

    registry.register({
      id: applicationCommandIds.openProject,
      title: "Open Project",
      execute: openProject
    });
    registry.register({
      id: editorCommandIds.close,
      title: "Close Tab",
      execute: closeTab
    });
    registry.setCommandExecutionBlocker(() =>
      barrier.isActive() ? "app_modal_open" : null
    );

    await registry.execute(applicationCommandIds.openProject, {
      source: "toolbar"
    });
    await registry.execute(editorCommandIds.close, {
      source: "documentTabBar"
    });

    expect(openProject).toHaveBeenCalledTimes(1);
    expect(closeTab).toHaveBeenCalledTimes(1);

    barrier.enter("explicitProjectClose");

    await expect(
      registry.execute(applicationCommandIds.openProject, {
        source: "toolbar"
      })
    ).rejects.toMatchObject({
      commandId: applicationCommandIds.openProject,
      reason: "app_modal_open"
    });
    await expect(
      registry.execute(editorCommandIds.close, {
        source: "documentTabBar"
      })
    ).rejects.toMatchObject({
      commandId: editorCommandIds.close,
      reason: "app_modal_open"
    });

    expect(openProject).toHaveBeenCalledTimes(1);
    expect(closeTab).toHaveBeenCalledTimes(1);
  });
});
