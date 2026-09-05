import { describe, expect, it, vi } from "vitest";
import {
  applicationCommandIds,
  editorCommandIds
} from "../../src/shared/commandIds";
import {
  invokeApplicationMenuCommand,
  subscribeApplicationMenuCommands,
  type ApplicationMenuCommandExecutor,
  type ApplicationMenuAllowedCommandExecutor,
  type ApplicationMenuCommandSubscription
} from "../../src/renderer/applicationMenuBridge";

describe("application menu renderer bridge", () => {
  it("invokes allowlisted application menu commands", () => {
    const execute = vi.fn<ApplicationMenuAllowedCommandExecutor>();

    expect(
      invokeApplicationMenuCommand(editorCommandIds.saveDocument, execute)
    ).toBe(true);
    expect(execute).toHaveBeenCalledWith(editorCommandIds.saveDocument);
  });

  it("ignores command IDs outside the application menu allowlist", () => {
    const execute = vi.fn<ApplicationMenuAllowedCommandExecutor>();

    expect(invokeApplicationMenuCommand("workspace.files.toggle", execute)).toBe(
      false
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns the subscription cleanup function", () => {
    const unsubscribe = vi.fn();
    const onCommand = vi.fn(() => unsubscribe);

    const cleanup = subscribeApplicationMenuCommands(onCommand, () => vi.fn());

    expect(cleanup).toBe(unsubscribe);
    cleanup();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("uses the latest executor and avoids stale closures", () => {
    const firstExecute = vi.fn<ApplicationMenuCommandExecutor>();
    const secondExecute = vi.fn<ApplicationMenuCommandExecutor>();
    let currentExecute = firstExecute;
    const onCommand = vi.fn<ApplicationMenuCommandSubscription>(
      () => () => undefined
    );

    subscribeApplicationMenuCommands(onCommand, () => currentExecute);
    const listener = onCommand.mock.calls[0][0];

    listener(editorCommandIds.saveDocument);
    currentExecute = secondExecute;
    listener(applicationCommandIds.openProject);

    expect(firstExecute).toHaveBeenCalledWith(editorCommandIds.saveDocument);
    expect(secondExecute).toHaveBeenCalledWith(applicationCommandIds.openProject);
  });

  it("passes raw command IDs through to the app-level guard", () => {
    const execute = vi.fn<ApplicationMenuCommandExecutor>();
    const onCommand = vi.fn<ApplicationMenuCommandSubscription>(
      () => () => undefined
    );

    subscribeApplicationMenuCommands(onCommand, () => execute);
    const listener = onCommand.mock.calls[0][0];

    listener("workspace.files.toggle");

    expect(execute).toHaveBeenCalledWith("workspace.files.toggle");
  });
});
