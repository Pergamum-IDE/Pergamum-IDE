import {
  defineCommandId,
  type Command,
  type CommandRegistry
} from "../shared/commandRegistry";
import type { SessionStorageFailureReason } from "../shared/sessionPersistenceFailure";

export const sessionDebugCommandIds = {
  lockUnavailable: defineCommandId("debug.session.injectFailure.lockUnavailable"),
  manifestNotMutable: defineCommandId("debug.session.injectFailure.manifestNotMutable"),
  diskFull: defineCommandId("debug.session.injectFailure.diskFull"),
  ioError: defineCommandId("debug.session.injectFailure.ioError"),
  permissionDenied: defineCommandId("debug.session.injectFailure.permissionDenied"),
  writeFailed: defineCommandId("debug.session.injectFailure.writeFailed"),
  lockUnavailableStreak: defineCommandId(
    "debug.session.injectFailure.lockUnavailableStreak"
  ),
  ioErrorStreak: defineCommandId("debug.session.injectFailure.ioErrorStreak"),
  slowIo: defineCommandId("debug.session.injectFailure.slowIo"),
  slowIoStreak: defineCommandId("debug.session.injectFailure.slowIoStreak"),
  clearInjection: defineCommandId("debug.session.clearInjection")
} as const;

export interface SessionDebugCommandController {
  injectFailure(
    reason: SessionStorageFailureReason,
    count: number
  ): void | Promise<void>;
  clearInjection(): void | Promise<void>;
}

export function registerSessionDebugCommands(
  registry: CommandRegistry,
  controller: SessionDebugCommandController
): void {
  const commands: Array<Command<readonly [], void>> = [
    {
      id: sessionDebugCommandIds.lockUnavailable,
      title: "[Debug] 自動保存の失敗を注入: lockUnavailable",
      description: "次回保存時に lockUnavailable を注入 (1回)",
      execute: () => {
        void controller.injectFailure("lockUnavailable", 1);
      }
    },
    {
      id: sessionDebugCommandIds.manifestNotMutable,
      title: "[Debug] 自動保存の失敗を注入: manifestNotMutable",
      description: "次回保存時に manifestNotMutable を注入 (1回)",
      execute: () => {
        void controller.injectFailure("manifestNotMutable", 1);
      }
    },
    {
      id: sessionDebugCommandIds.diskFull,
      title: "[Debug] 自動保存の失敗を注入: diskFull",
      description: "次回保存時に diskFull を注入 (1回)",
      execute: () => {
        void controller.injectFailure("diskFull", 1);
      }
    },
    {
      id: sessionDebugCommandIds.ioError,
      title: "[Debug] 自動保存の失敗を注入: ioError",
      description: "次回保存時に ioError を注入 (1回)",
      execute: () => {
        void controller.injectFailure("ioError", 1);
      }
    },
    {
      id: sessionDebugCommandIds.permissionDenied,
      title: "[Debug] 自動保存の失敗を注入: permissionDenied",
      description: "次回保存時に permissionDenied を注入 (1回)",
      execute: () => {
        void controller.injectFailure("permissionDenied", 1);
      }
    },
    {
      id: sessionDebugCommandIds.writeFailed,
      title: "[Debug] 自動保存の失敗を注入: writeFailed",
      description: "次回保存時に writeFailed を注入 (1回)",
      execute: () => {
        void controller.injectFailure("writeFailed", 1);
      }
    },
    {
      id: sessionDebugCommandIds.lockUnavailableStreak,
      title: "[Debug] 自動保存の失敗を注入: lockUnavailableStreak",
      description: "次回以降の保存に lockUnavailable を3回連続注入",
      execute: () => {
        void controller.injectFailure("lockUnavailable", 3);
      }
    },
    {
      id: sessionDebugCommandIds.ioErrorStreak,
      title: "[Debug] 自動保存の失敗を注入: ioErrorStreak",
      description: "次回以降の保存に ioError を3回連続注入",
      execute: () => {
        void controller.injectFailure("ioError", 3);
      }
    },
    {
      id: sessionDebugCommandIds.slowIo,
      title: "[Debug] 自動保存の失敗を注入: slowIo",
      description: "次回保存時に slowIo を注入 (1回)",
      execute: () => {
        void controller.injectFailure("slowIo", 1);
      }
    },
    {
      id: sessionDebugCommandIds.slowIoStreak,
      title: "[Debug] 自動保存の失敗を注入: slowIoStreak",
      description: "次回以降の保存に slowIo を3回連続注入",
      execute: () => {
        void controller.injectFailure("slowIo", 3);
      }
    },
    {
      id: sessionDebugCommandIds.clearInjection,
      title: "[Debug] 自動保存の失敗注入を解除",
      description: "武装済みの自動保存の失敗注入を取り消す",
      execute: () => {
        void controller.clearInjection();
      }
    }
  ];

  for (const command of commands) {
    registry.register(command);
  }
}
