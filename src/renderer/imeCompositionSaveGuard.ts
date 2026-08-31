import {
  editorCommandIds,
  isApplicationMenuCommandId,
  type ApplicationMenuCommandId
} from "../shared/commandIds";
import type { DebugLogEventName } from "../shared/debugLog";

/**
 * Save commands that are DEFERRED (not dropped) when they reach Pergamum
 * during IME composition: they re-fire once in the task after
 * `compositionend`. Save As is deliberately excluded — it opens a native
 * dialog rather than committing text, so IME timing is not a concern there.
 */
const deferrableSaveCommandIds: readonly string[] = [
  editorCommandIds.saveDocument,
  editorCommandIds.saveAll
];

function isDeferrableSaveCommandId(commandId: string): boolean {
  return deferrableSaveCommandIds.includes(commandId);
}

export type ApplicationMenuAllowedCommandExecutor = (
  commandId: ApplicationMenuCommandId
) => void;
export type CancelScheduledTask = () => void;
export type ScheduleTask = (callback: () => void) => CancelScheduledTask;
export type ImePendingSaveClearReason =
  | "focus_left_app_shell"
  | "active_editor_changed"
  | "project_context_changed"
  | "unmount"
  | "composition_restarted"
  | "manual_clear";
export type ImeCompositionSaveGuardLogger = (input: {
  event: DebugLogEventName;
  details?: Record<string, unknown>;
}) => void;

export interface ImeCompositionSaveGuardOptions {
  schedule?: ScheduleTask;
  log?: ImeCompositionSaveGuardLogger;
}

export interface ImeCompositionSaveGuard {
  handleCompositionStart(): void;
  handleCompositionEnd(execute: ApplicationMenuAllowedCommandExecutor): void;
  handleCommand(commandId: string, execute: ApplicationMenuAllowedCommandExecutor): boolean;
  clearPendingSave(reason?: ImePendingSaveClearReason): void;
  hasPendingSave(): boolean;
  hasScheduledSave(): boolean;
  isComposing(): boolean;
}

export function scheduleNextTask(callback: () => void): CancelScheduledTask {
  const timeoutId = setTimeout(callback, 0);

  return () => clearTimeout(timeoutId);
}

/**
 * Defers only Save commands that actually reach Pergamum during IME composition.
 *
 * #118 dogfood did not observe CommandOrControl+S reaching Pergamum during
 * composition in the tested Japanese IMEs; those IMEs consumed or handled the
 * shortcut before Electron's menu command path. The guard remains as a safety
 * net for IME versions, settings, platforms, and non-Japanese IMEs where Save
 * may reach Pergamum before committed text reaches the editor model.
 *
 * 日本語メモ:
 * 確認した日本語IMEでは変換中Ctrl+SはPergamumまで届かなかったが、
 * 未検証IMEや将来の挙動変更に備え、Save command が composition 中に
 * 届いた場合だけ compositionend 後へ遅延する。IMEが消費したショートカットを
 * Pergamumが後からSaveとして捏造してはいけない。
 */

export function createImeCompositionSaveGuard({
  schedule = scheduleNextTask,
  log = () => undefined
}: ImeCompositionSaveGuardOptions = {}): ImeCompositionSaveGuard {
  let composing = false;
  // The deferred save command awaiting `compositionend`, or `null` when none
  // is pending. `saveDocument` and `saveAll` share this single slot — the
  // most recent one wins, matching the "one pending save per composition"
  // rule the boolean flag enforced before.
  let pendingSaveCommandId: ApplicationMenuCommandId | null = null;
  let cancelScheduledSave: CancelScheduledTask | null = null;

  function hasScheduledSave(): boolean {
    return cancelScheduledSave !== null;
  }

  function hasPendingSave(): boolean {
    return pendingSaveCommandId !== null;
  }

  function pendingStateDetails(): Record<string, unknown> {
    return {
      isComposing: composing,
      hasPendingSave: hasPendingSave(),
      hasScheduledSave: hasScheduledSave()
    };
  }

  function clearScheduledSave(): void {
    if (!cancelScheduledSave) {
      return;
    }

    cancelScheduledSave();
    cancelScheduledSave = null;
  }

  function clearScheduledSaveForReason(
    reason: ImePendingSaveClearReason
  ): void {
    if (!hasScheduledSave()) {
      return;
    }

    log({
      event: "ime.save.pending.cleared",
      details: {
        reason,
        ...pendingStateDetails()
      }
    });
    clearScheduledSave();
  }

  function clearPendingSave(
    reason: ImePendingSaveClearReason = "manual_clear"
  ): void {
    const hadPendingSave = hasPendingSave();
    const hadScheduledSave = hasScheduledSave();

    if (hadPendingSave || hadScheduledSave) {
      log({
        event: "ime.save.pending.cleared",
        details: {
          reason,
          ...pendingStateDetails()
        }
      });
    }

    pendingSaveCommandId = null;
    clearScheduledSave();
  }

  return {
    handleCompositionStart: () => {
      composing = true;
      clearScheduledSaveForReason("composition_restarted");
    },
    handleCompositionEnd: (execute) => {
      composing = false;

      if (pendingSaveCommandId === null) {
        return;
      }

      const commandToExecute = pendingSaveCommandId;
      pendingSaveCommandId = null;
      clearScheduledSave();
      cancelScheduledSave = schedule(() => {
        cancelScheduledSave = null;
        log({
          event: "ime.save.pending.executed",
          details: {
            commandId: commandToExecute,
            operation: "command",
            result: "succeeded",
            ...pendingStateDetails()
          }
        });
        execute(commandToExecute);
      });
      log({
        event: "ime.save.pending.scheduled",
        details: {
          commandId: commandToExecute,
          operation: "command",
          result: "succeeded",
          ...pendingStateDetails()
        }
      });
    },
    handleCommand: (commandId, execute) => {
      if (!isApplicationMenuCommandId(commandId)) {
        log({
          event: "ime.command.ignored",
          details: {
            commandId,
            operation: "command",
            result: "ignored",
            reason: "invalid_command",
            ...pendingStateDetails()
          }
        });
        return false;
      }

      if (isDeferrableSaveCommandId(commandId) && composing) {
        const hadPendingSave = hasPendingSave();
        pendingSaveCommandId = commandId;

        if (!hadPendingSave) {
          log({
            event: "ime.save.pending.created",
            details: {
              commandId,
              operation: "command",
              result: "succeeded",
              ...pendingStateDetails()
            }
          });
        }

        return true;
      }

      log({
        event: "ime.command.passed_through",
        details: {
          commandId,
          operation: "command",
          result: "succeeded",
          ...pendingStateDetails()
        }
      });
      execute(commandId);
      return true;
    },
    clearPendingSave,
    hasPendingSave,
    hasScheduledSave,
    isComposing: () => composing
  };
}
