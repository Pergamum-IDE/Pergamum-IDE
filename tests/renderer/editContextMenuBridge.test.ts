import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "../../src/shared/commandRegistry";
import { editCommandIds, editorCommandIds } from "../../src/shared/commandIds";
import { pergamumContextSurfaceAttribute } from "../../src/shared/editContextMenu";
import {
  createContextMenuInteractionIdFactory,
  delegatedContextSurfaceFromDocument,
  editableContextSurfaceFromTarget,
  executeContextMenuEditCommand,
  handleEditContextMenuEvent
} from "../../src/renderer/editContextMenuBridge";

interface FakeElement {
  readonly parentElement: FakeElement | null;
  getAttribute(name: string): string | null;
}

function fakeElement(
  attributes: Record<string, string> = {},
  parentElement: FakeElement | null = null
): FakeElement {
  return {
    parentElement,
    getAttribute: (name) => attributes[name] ?? null
  };
}

function editCommandRegistry(
  isEnabled: (commandId: (typeof editCommandIds)[number]) => boolean = () =>
    true
): CommandRegistry {
  const registry = new CommandRegistry();

  for (const commandId of editCommandIds) {
    registry.register({
      id: commandId,
      title: commandId,
      execute: () => undefined,
      isEnabled: () => isEnabled(commandId)
    });
  }

  return registry;
}

describe("edit context menu renderer bridge", () => {
  it("resolves supported surfaces from the project-owned data attribute", () => {
    const surface = fakeElement({
      [pergamumContextSurfaceAttribute]: "markdownEditor"
    });
    const child = fakeElement({}, surface);

    expect(editableContextSurfaceFromTarget(child)).toBe("markdownEditor");
  });

  it("does not treat unknownEditable or generic editability as popup surfaces", () => {
    expect(
      editableContextSurfaceFromTarget(
        fakeElement({
          [pergamumContextSurfaceAttribute]: "unknownEditable"
        })
      )
    ).toBeNull();
    expect(
      editableContextSurfaceFromTarget(
        fakeElement({
          contentEditable: "true"
        })
      )
    ).toBeNull();
  });

  it("suppresses unsupported context menu events without opening a popup", () => {
    const preventDefault = vi.fn();
    const log = vi.fn();
    const popupEditMenu = vi.fn();

    const opened = handleEditContextMenuEvent(
      {
        target: fakeElement(),
        preventDefault
      },
      {
        commandRegistry: editCommandRegistry(),
        nextInteractionId: () => "contextMenu.1",
        editorIdKind: "projectDocument",
        hasSelection: () => false,
        log,
        popupEditMenu
      }
    );

    expect(opened).toBe(false);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(popupEditMenu).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith({
      level: "debug",
      event: "contextMenu.suppressed",
      details: {
        interactionId: "contextMenu.1",
        requestedSurface: "unknownEditable",
        editorIdKind: "projectDocument",
        result: "ignored",
        reason: "unsupported_surface"
      }
    });
  });

  it("evaluates Edit command enablement once immediately before popup", () => {
    const preventDefault = vi.fn();
    const log = vi.fn();
    const popupEditMenu = vi.fn(() => Promise.resolve(true));
    const enabledChecks: string[] = [];
    const surface = fakeElement({
      [pergamumContextSurfaceAttribute]: "glossaryDescription"
    });

    const opened = handleEditContextMenuEvent(
      {
        target: surface,
        preventDefault
      },
      {
        commandRegistry: editCommandRegistry((commandId) => {
          enabledChecks.push(commandId);
          return commandId !== editorCommandIds.pasteSelection;
        }),
        nextInteractionId: () => "contextMenu.7",
        editorIdKind: "glossaryEntry",
        hasSelection: () => true,
        log,
        popupEditMenu
      }
    );

    expect(opened).toBe(true);
    expect(enabledChecks).toEqual([...editCommandIds]);
    expect(popupEditMenu).toHaveBeenCalledWith({
      interactionId: "contextMenu.7",
      requestedSurface: "glossaryDescription",
      items: [
        { commandId: editorCommandIds.cutSelection, enabled: true },
        { commandId: editorCommandIds.copySelection, enabled: true },
        { commandId: editorCommandIds.pasteSelection, enabled: false },
        { commandId: editorCommandIds.selectAllSelection, enabled: true }
      ]
    });
    expect(log).toHaveBeenCalledWith({
      level: "debug",
      event: "contextMenu.requested",
      details: {
        interactionId: "contextMenu.7",
        requestedSurface: "glossaryDescription",
        editorIdKind: "glossaryEntry",
        hasSelection: true
      }
    });
  });

  it("logs suppressed with the same interaction ID when popup IPC fails", async () => {
    const log = vi.fn();

    handleEditContextMenuEvent(
      {
        target: fakeElement({
          [pergamumContextSurfaceAttribute]: "markdownEditor"
        }),
        preventDefault: vi.fn()
      },
      {
        commandRegistry: editCommandRegistry(),
        nextInteractionId: () => "contextMenu.8",
        editorIdKind: "projectDocument",
        hasSelection: () => false,
        log,
        popupEditMenu: () => Promise.reject(new Error("unavailable"))
      }
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(log).toHaveBeenCalledWith({
      level: "debug",
      event: "contextMenu.suppressed",
      details: {
        interactionId: "contextMenu.8",
        requestedSurface: "markdownEditor",
        editorIdKind: "projectDocument",
        result: "ignored",
        reason: "window_unavailable"
      }
    });
  });

  it("leaves diagnosed popup false results to main without duplicate renderer logs", async () => {
    const log = vi.fn();

    handleEditContextMenuEvent(
      {
        target: fakeElement({
          [pergamumContextSurfaceAttribute]: "markdownEditor"
        }),
        preventDefault: vi.fn()
      },
      {
        commandRegistry: editCommandRegistry(),
        nextInteractionId: () => "contextMenu.9",
        editorIdKind: "projectDocument",
        hasSelection: () => false,
        log,
        popupEditMenu: () => Promise.resolve(false)
      }
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(log.mock.calls.map((call) => call[0].event)).toEqual([
      "contextMenu.requested"
    ]);
  });

  it("creates session-local monotonic interaction IDs", () => {
    const nextInteractionId = createContextMenuInteractionIdFactory();

    expect(nextInteractionId()).toBe("contextMenu.1");
    expect(nextInteractionId()).toBe("contextMenu.2");
  });

  it("routes selected edit commands through Command Registry and carries the same interaction ID", async () => {
    const registry = new CommandRegistry();
    const log = vi.fn();
    const contexts: unknown[] = [];
    const execute = vi.fn();

    registry.register({
      id: editorCommandIds.cutSelection,
      title: "Cut",
      execute
    });

    await executeContextMenuEditCommand(
      {
        interactionId: "contextMenu.3",
        commandId: editorCommandIds.cutSelection,
        requestedSurface: "markdownEditor"
      },
      {
        commandRegistry: registry,
        editorIdKind: "projectDocument",
        delegatedSurface: "markdownEditor",
        hasSelection: true,
        log,
        setNativeEditCommandContext: (context) => {
          contexts.push(context);
        },
        clearNativeEditCommandContext: (context) => {
          contexts.push(null);
          expect(context.interactionId).toBe("contextMenu.3");
        }
      }
    );

    expect(execute).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith({
      level: "debug",
      event: "edit.command.requested",
      details: {
        interactionId: "contextMenu.3",
        commandId: editorCommandIds.cutSelection,
        requestedSurface: "markdownEditor",
        delegatedSurface: "markdownEditor",
        editorIdKind: "projectDocument",
        hasSelection: true
      }
    });
    expect(contexts).toEqual([
      {
        interactionId: "contextMenu.3",
        commandId: editorCommandIds.cutSelection,
        requestedSurface: "markdownEditor",
        delegatedSurface: "markdownEditor",
        editorIdKind: "projectDocument",
        hasSelection: true
      },
      null
    ]);
  });

  it("logs ignored edit commands when execution-time Command.isEnabled is false", async () => {
    const registry = new CommandRegistry();
    const log = vi.fn();
    const setNativeEditCommandContext = vi.fn();
    const execute = vi.fn();

    registry.register({
      id: editorCommandIds.copySelection,
      title: "Copy",
      execute,
      isEnabled: () => false
    });

    const executed = await executeContextMenuEditCommand(
      {
        interactionId: "contextMenu.4",
        commandId: editorCommandIds.copySelection,
        requestedSurface: "glossaryAtomValue"
      },
      {
        commandRegistry: registry,
        editorIdKind: "glossaryEntry",
        delegatedSurface: "unknownEditable",
        hasSelection: false,
        log,
        setNativeEditCommandContext,
        clearNativeEditCommandContext: vi.fn()
      }
    );

    expect(executed).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    expect(setNativeEditCommandContext).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith({
      level: "debug",
      event: "edit.command.ignored",
      details: {
        interactionId: "contextMenu.4",
        commandId: editorCommandIds.copySelection,
        requestedSurface: "glossaryAtomValue",
        delegatedSurface: "unknownEditable",
        editorIdKind: "glossaryEntry",
        hasSelection: false,
        result: "ignored",
        reason: "disabled_command"
      }
    });
  });

  it("logs modal-blocked edit commands as ignored instead of failed", async () => {
    const registry = new CommandRegistry();
    const log = vi.fn();
    const execute = vi.fn();
    const clearNativeEditCommandContext = vi.fn();

    registry.register({
      id: editorCommandIds.copySelection,
      title: "Copy",
      execute
    });
    registry.setCommandExecutionBlocker(() => "app_modal_open");

    const executed = await executeContextMenuEditCommand(
      {
        interactionId: "contextMenu.5",
        commandId: editorCommandIds.copySelection,
        requestedSurface: "markdownEditor"
      },
      {
        commandRegistry: registry,
        editorIdKind: "projectDocument",
        delegatedSurface: "markdownEditor",
        hasSelection: true,
        log,
        setNativeEditCommandContext: vi.fn(),
        clearNativeEditCommandContext
      }
    );

    expect(executed).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    expect(clearNativeEditCommandContext).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith({
      level: "debug",
      event: "edit.command.ignored",
      details: {
        interactionId: "contextMenu.5",
        commandId: editorCommandIds.copySelection,
        requestedSurface: "markdownEditor",
        delegatedSurface: "markdownEditor",
        editorIdKind: "projectDocument",
        hasSelection: true,
        result: "ignored",
        reason: "app_modal_open"
      }
    });
    expect(log.mock.calls.map((call) => call[0].event)).not.toContain(
      "edit.command.failed"
    );
  });

  it("does not clear a newer native edit context when overlapping command executions finish out of order", async () => {
    let currentContext: unknown = null;
    const receivedContexts: unknown[] = [];
    const firstDelegation = deferred<void>();
    const secondCanReadContext = deferred<void>();
    const registry = new CommandRegistry();

    registry.register({
      id: editorCommandIds.cutSelection,
      title: "Cut",
      execute: async () => {
        receivedContexts.push(currentContext);
        await firstDelegation.promise;
      }
    });
    registry.register({
      id: editorCommandIds.pasteSelection,
      title: "Paste",
      execute: async () => {
        await secondCanReadContext.promise;
        receivedContexts.push(currentContext);
      }
    });

    const firstExecution = executeContextMenuEditCommand(
      {
        interactionId: "contextMenu.A",
        commandId: editorCommandIds.cutSelection,
        requestedSurface: "markdownEditor"
      },
      {
        commandRegistry: registry,
        editorIdKind: "projectDocument",
        delegatedSurface: "markdownEditor",
        hasSelection: true,
        log: vi.fn(),
        setNativeEditCommandContext: (context) => {
          currentContext = context;
        },
        clearNativeEditCommandContext: (context) => {
          if (currentContext === context) {
            currentContext = null;
          }
        }
      }
    );
    const secondExecution = executeContextMenuEditCommand(
      {
        interactionId: "contextMenu.B",
        commandId: editorCommandIds.pasteSelection,
        requestedSurface: "glossaryAtomValue"
      },
      {
        commandRegistry: registry,
        editorIdKind: "glossaryEntry",
        delegatedSurface: "glossaryAtomValue",
        hasSelection: false,
        log: vi.fn(),
        setNativeEditCommandContext: (context) => {
          currentContext = context;
        },
        clearNativeEditCommandContext: (context) => {
          if (currentContext === context) {
            currentContext = null;
          }
        }
      }
    );

    firstDelegation.resolve();
    await firstExecution;
    secondCanReadContext.resolve();
    await secondExecution;

    expect(receivedContexts).toMatchObject([
      {
        interactionId: "contextMenu.A",
        commandId: editorCommandIds.cutSelection,
        delegatedSurface: "markdownEditor"
      },
      {
        interactionId: "contextMenu.B",
        commandId: editorCommandIds.pasteSelection,
        delegatedSurface: "glossaryAtomValue"
      }
    ]);
  });

  it("re-observes delegatedSurface and hasSelection at command selection time", async () => {
    const registry = new CommandRegistry();
    const log = vi.fn();
    const markdownSurface = fakeElement({
      [pergamumContextSurfaceAttribute]: "markdownEditor"
    });
    const glossarySurface = fakeElement({
      [pergamumContextSurfaceAttribute]: "glossaryDescription"
    });
    const documentLike = { activeElement: glossarySurface };

    registry.register({
      id: editorCommandIds.selectAllSelection,
      title: "Select All",
      execute: () => undefined
    });

    handleEditContextMenuEvent(
      {
        target: markdownSurface,
        preventDefault: vi.fn()
      },
      {
        commandRegistry: editCommandRegistry(),
        nextInteractionId: () => "contextMenu.focus",
        editorIdKind: "projectDocument",
        hasSelection: () => false,
        log: vi.fn(),
        popupEditMenu: () => Promise.resolve(true)
      }
    );
    await executeContextMenuEditCommand(
      {
        interactionId: "contextMenu.focus",
        commandId: editorCommandIds.selectAllSelection,
        requestedSurface: "markdownEditor"
      },
      {
        commandRegistry: registry,
        editorIdKind: "projectDocument",
        delegatedSurface: delegatedContextSurfaceFromDocument(
          documentLike as never
        ),
        hasSelection: true,
        log,
        setNativeEditCommandContext: () => undefined,
        clearNativeEditCommandContext: () => undefined
      }
    );

    expect(log).toHaveBeenCalledWith({
      level: "debug",
      event: "edit.command.requested",
      details: {
        interactionId: "contextMenu.focus",
        commandId: editorCommandIds.selectAllSelection,
        requestedSurface: "markdownEditor",
        delegatedSurface: "glossaryDescription",
        editorIdKind: "projectDocument",
        hasSelection: true
      }
    });
  });

  it("logs one edit.command.failed event for pre-IPC command execution throws", async () => {
    const registry = new CommandRegistry();
    const log = vi.fn();

    registry.register({
      id: editorCommandIds.cutSelection,
      title: "Cut",
      execute: () => {
        throw new Error("pre-main failure");
      }
    });

    await expect(
      executeContextMenuEditCommand(
        {
          interactionId: "contextMenu.failure",
          commandId: editorCommandIds.cutSelection,
          requestedSurface: "markdownEditor"
        },
        {
          commandRegistry: registry,
          editorIdKind: "projectDocument",
          delegatedSurface: "markdownEditor",
          hasSelection: true,
          log,
          setNativeEditCommandContext: () => undefined,
          clearNativeEditCommandContext: () => undefined
        }
      )
    ).rejects.toThrow("pre-main failure");

    expect(log.mock.calls.map((call) => call[0].event)).toEqual([
      "edit.command.requested",
      "edit.command.failed"
    ]);
    expect(
      log.mock.calls.filter((call) => call[0].event === "edit.command.failed")
    ).toHaveLength(1);
    expect(log).toHaveBeenCalledWith({
      level: "error",
      event: "edit.command.failed",
      details: {
        interactionId: "contextMenu.failure",
        commandId: editorCommandIds.cutSelection,
        requestedSurface: "markdownEditor",
        delegatedSurface: "markdownEditor",
        editorIdKind: "projectDocument",
        hasSelection: true,
        result: "failed"
      }
    });
  });

  it("does not emit edit.command.failed when command execution resolves false", async () => {
    const registry = new CommandRegistry();
    const log = vi.fn();

    registry.register({
      id: editorCommandIds.pasteSelection,
      title: "Paste",
      execute: () => false as never
    });

    await expect(
      executeContextMenuEditCommand(
        {
          interactionId: "contextMenu.false",
          commandId: editorCommandIds.pasteSelection,
          requestedSurface: "markdownEditor"
        },
        {
          commandRegistry: registry,
          editorIdKind: "projectDocument",
          delegatedSurface: "markdownEditor",
          hasSelection: false,
          log,
          setNativeEditCommandContext: () => undefined,
          clearNativeEditCommandContext: () => undefined
        }
      )
    ).resolves.toBe(true);

    expect(
      log.mock.calls.filter((call) => call[0].event === "edit.command.failed")
    ).toHaveLength(0);
    expect(log.mock.calls.map((call) => call[0].event)).toEqual([
      "edit.command.requested"
    ]);
  });
});

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value?: T | PromiseLike<T>) => void;
} {
  let resolve: (value?: T | PromiseLike<T>) => void = () => undefined;
  const promise = new Promise<T>((innerResolve) => {
    resolve = (value) => innerResolve(value as T | PromiseLike<T>);
  });

  return { promise, resolve };
}
