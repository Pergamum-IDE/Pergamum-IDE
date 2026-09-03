import {
  defineCommandId,
  type Command,
  type CommandRegistry
} from "../shared/commandRegistry";
import type { Translate } from "../shared/i18n";

export const debugLogCommandIds = {
  open: defineCommandId("workbench.debugLog.open")
} as const;

export interface DebugLogCommandController {
  openDebugLog(): void;
}

export interface DebugLogCommandTitles {
  open: string;
  openDescription: string;
}

type DebugLogCommand = Command<readonly [], void>;

export function createDebugLogCommandTitles(
  translate: Translate
): DebugLogCommandTitles {
  return {
    open: translate("command.workbench.debugLog.open"),
    openDescription: translate("command.workbench.debugLog.open.description")
  };
}

export function createDebugLogCommands(
  controller: DebugLogCommandController,
  titles: DebugLogCommandTitles
): readonly DebugLogCommand[] {
  return [
    {
      id: debugLogCommandIds.open,
      title: titles.open,
      description: titles.openDescription,
      execute: () => {
        controller.openDebugLog();
      }
    }
  ];
}

/**
 * #377: registered only while `--pergamum-debug` mode is active, so the
 * Debug Log special tab has no normal-startup entry point — no Command
 * Palette entry, and execution is impossible (the command is simply absent
 * from the registry).
 */
export function registerDebugLogCommands(
  registry: CommandRegistry,
  controller: DebugLogCommandController,
  titles: DebugLogCommandTitles
): void {
  for (const command of createDebugLogCommands(controller, titles)) {
    registry.register(command);
  }
}
