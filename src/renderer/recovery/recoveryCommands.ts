/**
 * Phase 6-4-4: the Command Palette entry that opens the Recovery candidate
 * dialog. Palette-only in this issue — no application-menu item.
 *
 * `when: recovery.owner` keeps the command out of the palette for a
 * Recovery non-owner / unavailable instance, so a non-owner sees no UI.
 */

import type { Command, CommandRegistry } from "../../shared/commandRegistry";
import type { CommandEnablementExpression } from "../../shared/commandEnablement";
import { recoveryCommandIds } from "../../shared/commandIds";
import type { Translate } from "../../shared/i18n";

export { recoveryCommandIds };

export const showRecoveryDocumentsCommandWhen: CommandEnablementExpression = {
  key: "recovery.owner"
};

export interface RecoveryCommandController {
  showRecoveryDocuments(): void | Promise<void>;
}

export interface RecoveryCommandTitles {
  showRecoveryDocuments: string;
  showRecoveryDocumentsDescription: string;
}

type RecoveryCommand = Command<readonly [], void>;

export function createRecoveryCommandTitles(
  translate: Translate
): RecoveryCommandTitles {
  return {
    showRecoveryDocuments: translate("command.recovery.documents.show"),
    showRecoveryDocumentsDescription: translate(
      "command.recovery.documents.show.description"
    )
  };
}

export function createRecoveryCommands(
  controller: RecoveryCommandController,
  titles: RecoveryCommandTitles
): readonly RecoveryCommand[] {
  return [
    {
      id: recoveryCommandIds.showDocuments,
      title: titles.showRecoveryDocuments,
      description: titles.showRecoveryDocumentsDescription,
      when: showRecoveryDocumentsCommandWhen,
      execute: () => controller.showRecoveryDocuments()
    }
  ];
}

export function registerRecoveryCommands(
  registry: CommandRegistry,
  controller: RecoveryCommandController,
  titles: RecoveryCommandTitles
): void {
  for (const command of createRecoveryCommands(controller, titles)) {
    registry.register(command);
  }
}
