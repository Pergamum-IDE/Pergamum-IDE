import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applicationCommandIds,
  editorCommandIds
} from "../../src/shared/commandIds";
import {
  createImeCompositionSaveGuard,
  type ApplicationMenuAllowedCommandExecutor,
  type ImeCompositionSaveGuardLogger
} from "../../src/renderer/imeCompositionSaveGuard";
import { createSaveInFlightGuard } from "../../src/renderer/saveInFlightGuard";

describe("IME composition save guard", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("defers save while composing and does not execute immediately", () => {
    vi.useFakeTimers();
    const log = vi.fn<ImeCompositionSaveGuardLogger>();
    const guard = createImeCompositionSaveGuard({ log });
    const execute = vi.fn<ApplicationMenuAllowedCommandExecutor>();

    guard.handleCompositionStart();
    expect(guard.handleCommand(editorCommandIds.saveDocument, execute)).toBe(
      true
    );

    expect(execute).not.toHaveBeenCalled();
    expect(guard.hasPendingSave()).toBe(true);
    expect(guard.hasScheduledSave()).toBe(false);
    expect(log).toHaveBeenCalledWith({
      event: "ime.save.pending.created",
      details: {
        commandId: editorCommandIds.saveDocument,
        operation: "command",
        result: "succeeded",
        isComposing: true,
        hasPendingSave: true,
        hasScheduledSave: false
      }
    });
  });

  it("runs one pending save after composition end in the next task", () => {
    vi.useFakeTimers();
    const log = vi.fn<ImeCompositionSaveGuardLogger>();
    const guard = createImeCompositionSaveGuard({ log });
    const execute = vi.fn<ApplicationMenuAllowedCommandExecutor>();

    guard.handleCompositionStart();
    guard.handleCommand(editorCommandIds.saveDocument, execute);
    guard.handleCompositionEnd(execute);

    expect(execute).not.toHaveBeenCalled();
    expect(guard.hasPendingSave()).toBe(false);
    expect(guard.hasScheduledSave()).toBe(true);
    expect(log).toHaveBeenCalledWith({
      event: "ime.save.pending.scheduled",
      details: {
        commandId: editorCommandIds.saveDocument,
        operation: "command",
        result: "succeeded",
        isComposing: false,
        hasPendingSave: false,
        hasScheduledSave: true
      }
    });

    vi.runOnlyPendingTimers();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(editorCommandIds.saveDocument);
    expect(guard.hasScheduledSave()).toBe(false);
    expect(log).toHaveBeenCalledWith({
      event: "ime.save.pending.executed",
      details: {
        commandId: editorCommandIds.saveDocument,
        operation: "command",
        result: "succeeded",
        isComposing: false,
        hasPendingSave: false,
        hasScheduledSave: false
      }
    });
  });

  it("does not queue multiple pending saves during one composition", () => {
    vi.useFakeTimers();
    const guard = createImeCompositionSaveGuard();
    const execute = vi.fn<ApplicationMenuAllowedCommandExecutor>();

    guard.handleCompositionStart();
    guard.handleCommand(editorCommandIds.saveDocument, execute);
    guard.handleCommand(editorCommandIds.saveDocument, execute);
    guard.handleCommand(editorCommandIds.saveDocument, execute);
    guard.handleCompositionEnd(execute);
    vi.runOnlyPendingTimers();

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("keeps a pending save when composition start repeats before composition end", () => {
    vi.useFakeTimers();
    const guard = createImeCompositionSaveGuard();
    const execute = vi.fn<ApplicationMenuAllowedCommandExecutor>();

    guard.handleCompositionStart();
    guard.handleCommand(editorCommandIds.saveDocument, execute);
    guard.handleCompositionStart();
    guard.handleCompositionEnd(execute);
    vi.runOnlyPendingTimers();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(editorCommandIds.saveDocument);
  });


  it("#342: defers Save All while composing and re-fires it (not Save) after composition end", () => {
    vi.useFakeTimers();
    const guard = createImeCompositionSaveGuard();
    const execute = vi.fn<ApplicationMenuAllowedCommandExecutor>();

    guard.handleCompositionStart();
    expect(guard.handleCommand(editorCommandIds.saveAll, execute)).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    expect(guard.hasPendingSave()).toBe(true);

    guard.handleCompositionEnd(execute);
    vi.runOnlyPendingTimers();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(editorCommandIds.saveAll);
  });

  it("#342: the most recent deferred save command wins when Save then Save All arrive in one composition", () => {
    vi.useFakeTimers();
    const guard = createImeCompositionSaveGuard();
    const execute = vi.fn<ApplicationMenuAllowedCommandExecutor>();

    guard.handleCompositionStart();
    guard.handleCommand(editorCommandIds.saveDocument, execute);
    guard.handleCommand(editorCommandIds.saveAll, execute);
    guard.handleCompositionEnd(execute);
    vi.runOnlyPendingTimers();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(editorCommandIds.saveAll);
  });

  it("does not defer non-save File commands while composing", () => {
    const log = vi.fn<ImeCompositionSaveGuardLogger>();
    const guard = createImeCompositionSaveGuard({ log });
    const execute = vi.fn<ApplicationMenuAllowedCommandExecutor>();

    guard.handleCompositionStart();
    expect(
      guard.handleCommand(applicationCommandIds.createProject, execute)
    ).toBe(true);
    expect(guard.handleCommand(applicationCommandIds.openProject, execute)).toBe(
      true
    );
    expect(
      guard.handleCommand(editorCommandIds.openMarkdownDocument, execute)
    ).toBe(true);

    expect(execute).toHaveBeenCalledWith(applicationCommandIds.createProject);
    expect(execute).toHaveBeenCalledWith(applicationCommandIds.openProject);
    expect(execute).toHaveBeenCalledWith(
      editorCommandIds.openMarkdownDocument
    );
    expect(guard.hasPendingSave()).toBe(false);
    expect(log).toHaveBeenCalledWith({
      event: "ime.command.passed_through",
      details: {
        commandId: applicationCommandIds.openProject,
        operation: "command",
        result: "succeeded",
        isComposing: true,
        hasPendingSave: false,
        hasScheduledSave: false
      }
    });
  });

  it("does not defer command IDs outside the File menu allowlist", () => {
    const log = vi.fn<ImeCompositionSaveGuardLogger>();
    const guard = createImeCompositionSaveGuard({ log });
    const execute = vi.fn<ApplicationMenuAllowedCommandExecutor>();

    guard.handleCompositionStart();
    expect(guard.handleCommand("workspace.files.toggle", execute)).toBe(false);

    expect(execute).not.toHaveBeenCalled();
    expect(guard.hasPendingSave()).toBe(false);
    expect(log).toHaveBeenCalledWith({
      event: "ime.command.ignored",
      details: {
        commandId: "workspace.files.toggle",
        operation: "command",
        result: "ignored",
        reason: "invalid_command",
        isComposing: true,
        hasPendingSave: false,
        hasScheduledSave: false
      }
    });
  });

  it("clears pending save before composition end", () => {
    vi.useFakeTimers();
    const log = vi.fn<ImeCompositionSaveGuardLogger>();
    const guard = createImeCompositionSaveGuard({ log });
    const execute = vi.fn<ApplicationMenuAllowedCommandExecutor>();

    guard.handleCompositionStart();
    guard.handleCommand(editorCommandIds.saveDocument, execute);
    guard.clearPendingSave();
    guard.handleCompositionEnd(execute);
    vi.runOnlyPendingTimers();

    expect(execute).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith({
      event: "ime.save.pending.cleared",
      details: {
        reason: "manual_clear",
        isComposing: true,
        hasPendingSave: true,
        hasScheduledSave: false
      }
    });
  });

  it("clears a scheduled pending save before it runs", () => {
    vi.useFakeTimers();
    const log = vi.fn<ImeCompositionSaveGuardLogger>();
    const guard = createImeCompositionSaveGuard({ log });
    const execute = vi.fn<ApplicationMenuAllowedCommandExecutor>();

    guard.handleCompositionStart();
    guard.handleCommand(editorCommandIds.saveDocument, execute);
    guard.handleCompositionEnd(execute);
    guard.clearPendingSave();
    vi.runOnlyPendingTimers();

    expect(execute).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith({
      event: "ime.save.pending.cleared",
      details: {
        reason: "manual_clear",
        isComposing: false,
        hasPendingSave: false,
        hasScheduledSave: true
      }
    });
  });

  it("clears a scheduled pending save when composition restarts", () => {
    vi.useFakeTimers();
    const log = vi.fn<ImeCompositionSaveGuardLogger>();
    const guard = createImeCompositionSaveGuard({ log });
    const execute = vi.fn<ApplicationMenuAllowedCommandExecutor>();

    guard.handleCompositionStart();
    guard.handleCommand(editorCommandIds.saveDocument, execute);
    guard.handleCompositionEnd(execute);
    guard.handleCompositionStart();
    vi.runOnlyPendingTimers();

    expect(execute).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith({
      event: "ime.save.pending.cleared",
      details: {
        reason: "composition_restarted",
        isComposing: true,
        hasPendingSave: false,
        hasScheduledSave: true
      }
    });
  });

  it("uses the save in-flight guard for pending save without retrying", () => {
    vi.useFakeTimers();
    const compositionGuard = createImeCompositionSaveGuard();
    const saveGuard = createSaveInFlightGuard();
    const save = vi.fn(() => new Promise<void>(() => undefined));
    const execute: ApplicationMenuAllowedCommandExecutor = (commandId) => {
      if (commandId === editorCommandIds.saveDocument) {
        void saveGuard.run(save);
      }
    };

    void saveGuard.run(save);
    compositionGuard.handleCompositionStart();
    compositionGuard.handleCommand(editorCommandIds.saveDocument, execute);
    compositionGuard.handleCompositionEnd(execute);
    vi.runOnlyPendingTimers();

    expect(save).toHaveBeenCalledTimes(1);
  });
});
