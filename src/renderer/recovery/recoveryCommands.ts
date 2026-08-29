/**
 * Phase 6-4-4: the Command Palette entry that opens the Recovery candidate
 * dialog. Palette-only in this issue — no application-menu item.
 *
 * Enablement requires BOTH:
 *   - `recovery.owner` — this process owns `Recovery.db` (keeps the command
 *     out of the palette for a non-owner / unavailable instance), and
 *   - `recovery.hasRecoverableCandidates` — at least one *previous-run*
 *     Recovery row exists. `recovery.owner` alone is true for a normal
 *     clean run too, so on its own it would surface the current run's own
 *     live dirty-document backups as if they were recoverable (#288).
 */

import type { Command, CommandRegistry } from "../../shared/commandRegistry";
import type { CommandEnablementExpression } from "../../shared/commandEnablement";
import { recoveryCommandIds } from "../../shared/commandIds";
import type { Translate } from "../../shared/i18n";

export { recoveryCommandIds };

export const showRecoveryDocumentsCommandWhen: CommandEnablementExpression = {
  allOf: [
    { key: "recovery.owner" },
    { key: "recovery.hasRecoverableCandidates" }
  ]
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
