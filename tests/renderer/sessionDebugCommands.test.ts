import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "../../src/shared/commandRegistry";
import {
  registerSessionDebugCommands,
  sessionDebugCommandIds,
  type SessionDebugCommandController
} from "../../src/renderer/sessionDebugCommands";

describe("sessionDebugCommands (#519)", () => {
  it("registers all debug session commands", () => {
    const registry = new CommandRegistry();
    const controller: SessionDebugCommandController = {
      injectFailure: vi.fn(),
      clearInjection: vi.fn()
    };

    registerSessionDebugCommands(registry, controller);

    expect(registry.get(sessionDebugCommandIds.lockUnavailable)).not.toBeNull();
    expect(registry.get(sessionDebugCommandIds.manifestNotMutable)).not.toBeNull();
    expect(registry.get(sessionDebugCommandIds.diskFull)).not.toBeNull();
    expect(registry.get(sessionDebugCommandIds.ioError)).not.toBeNull();
    expect(registry.get(sessionDebugCommandIds.permissionDenied)).not.toBeNull();
    expect(registry.get(sessionDebugCommandIds.writeFailed)).not.toBeNull();
    expect(
      registry.get(sessionDebugCommandIds.lockUnavailableStreak)
    ).not.toBeNull();
    expect(registry.get(sessionDebugCommandIds.ioErrorStreak)).not.toBeNull();
    expect(registry.get(sessionDebugCommandIds.slowIo)).not.toBeNull();
    expect(registry.get(sessionDebugCommandIds.slowIoStreak)).not.toBeNull();
    expect(registry.get(sessionDebugCommandIds.clearInjection)).not.toBeNull();
  });

  it("invokes controller.injectFailure when failure injection command executed", () => {
    const registry = new CommandRegistry();
    const injectFailure = vi.fn();
    const clearInjection = vi.fn();

    registerSessionDebugCommands(registry, { injectFailure, clearInjection });

    const lockCmd = registry.get(sessionDebugCommandIds.lockUnavailable);
    lockCmd?.execute();
    expect(injectFailure).toHaveBeenCalledWith("lockUnavailable", 1);

    const streakCmd = registry.get(sessionDebugCommandIds.lockUnavailableStreak);
    streakCmd?.execute();
    expect(injectFailure).toHaveBeenCalledWith("lockUnavailable", 3);

    const slowIoCmd = registry.get(sessionDebugCommandIds.slowIo);
    slowIoCmd?.execute();
    expect(injectFailure).toHaveBeenCalledWith("slowIo", 1);

    const slowIoStreakCmd = registry.get(sessionDebugCommandIds.slowIoStreak);
    slowIoStreakCmd?.execute();
    expect(injectFailure).toHaveBeenCalledWith("slowIo", 3);

    const clearCmd = registry.get(sessionDebugCommandIds.clearInjection);
    clearCmd?.execute();
    expect(clearInjection).toHaveBeenCalled();
  });
});
