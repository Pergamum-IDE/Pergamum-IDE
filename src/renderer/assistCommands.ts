import type { Command, CommandRegistry } from "../shared/commandRegistry";
import type { CommandEnablementExpression } from "../shared/commandEnablement";
import { assistCommandIds } from "../shared/commandIds";
import type { Translate } from "../shared/i18n";

export { assistCommandIds };

/**
 * Read-only diagnostic command: available whenever the active editor is a
 * Markdown document, including a read-only project-owned one (it never
 * mutates the document). Not available for the Glossary editor or when no
 * document is open — `editor.kind.markdown` already implies a document.
 */
export const showLineEndingDistributionCommandWhen: CommandEnablementExpression =
  {
    key: "editor.kind.markdown"
  };

export interface AssistCommandController {
  showLineEndingDistribution(): void;
}

export interface AssistCommandTitles {
  showLineEndingDistribution: string;
  showLineEndingDistributionDescription: string;
}

type AssistCommand = Command<readonly [], void>;

export function createAssistCommandTitles(
  translate: Translate
): AssistCommandTitles {
  return {
    showLineEndingDistribution: translate(
      "command.assist.lineEndingDistribution.show"
    ),
    showLineEndingDistributionDescription: translate(
      "command.assist.lineEndingDistribution.show.description"
    )
  };
}

export function createAssistCommands(
  controller: AssistCommandController,
  titles: AssistCommandTitles
): readonly AssistCommand[] {
  return [
    {
      id: assistCommandIds.showLineEndingDistribution,
      title: titles.showLineEndingDistribution,
      description: titles.showLineEndingDistributionDescription,
      when: showLineEndingDistributionCommandWhen,
      execute: () => controller.showLineEndingDistribution()
    }
  ];
}

export function registerAssistCommands(
  registry: CommandRegistry,
  controller: AssistCommandController,
  titles: AssistCommandTitles
): void {
  for (const command of createAssistCommands(controller, titles)) {
    registry.register(command);
  }
}
