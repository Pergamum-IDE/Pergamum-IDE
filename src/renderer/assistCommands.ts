import type { Command, CommandRegistry } from "../shared/commandRegistry";
import type { CommandEnablementExpression } from "../shared/commandEnablement";
import { assistCommandIds } from "../shared/commandIds";
import type { AssistExportTarget } from "../shared/glossaryExportEntry";
import type { Translate } from "../shared/i18n";
import type { JapaneseMachineCheckTarget } from "../shared/japaneseMachineCheck";
import { projectOwnedWriteAllowedCommandWhen } from "./editorCommands";

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

export const paragraphIndentCommandWhen: CommandEnablementExpression = {
  allOf: [
    { key: "editor.hasDocument" },
    { key: "editor.kind.markdown" },
    projectOwnedWriteAllowedCommandWhen
  ]
};

export interface AssistCommandController {
  showLineEndingDistribution(): void;
  insertParagraphIndent(): void;
  removeParagraphIndent(): void;
  /** No `target`: the whole project. */
  openExportDialog?(target?: AssistExportTarget): void;
  /** Only asked when an explicit `target` is given (a clicked tab). */
  canOpenExportDialog?(target: AssistExportTarget): boolean;
  /** No `target`: the active editor's target. */
  openJapaneseMachineCheckDialog?(target?: JapaneseMachineCheckTarget): void;
  /** No `target`: whether the active editor has one. */
  canRunJapaneseMachineCheck?(target?: JapaneseMachineCheckTarget): boolean;
}

/** The optional explicit-target options of the two dialog commands (#684). */
interface ExportCommandOptions {
  readonly target?: AssistExportTarget;
}
interface JapaneseMachineCheckCommandOptions {
  readonly target?: JapaneseMachineCheckTarget;
}

export interface AssistCommandTitles {
  showLineEndingDistribution: string;
  showLineEndingDistributionDescription: string;
  insertParagraphIndent: string;
  insertParagraphIndentDescription: string;
  removeParagraphIndent: string;
  removeParagraphIndentDescription: string;
  openExportDialog?: string;
  openExportDialogDescription?: string;
  openJapaneseMachineCheckDialog?: string;
  openJapaneseMachineCheckDialogDescription?: string;
}

type AssistCommand = Command<readonly [], void>;
type OptionsCommand<TOptions> = Command<readonly [TOptions?], void>;
type AssistCommandEntry =
  | AssistCommand
  | OptionsCommand<ExportCommandOptions>
  | OptionsCommand<JapaneseMachineCheckCommandOptions>;

export function createAssistCommandTitles(
  translate: Translate
): AssistCommandTitles {
  return {
    showLineEndingDistribution: translate(
      "command.assist.lineEndingDistribution.show"
    ),
    showLineEndingDistributionDescription: translate(
      "command.assist.lineEndingDistribution.show.description"
    ),
    insertParagraphIndent: translate("command.assist.paragraphIndent.insert"),
    insertParagraphIndentDescription: translate(
      "command.assist.paragraphIndent.insert.description"
    ),
    removeParagraphIndent: translate("command.assist.paragraphIndent.remove"),
    removeParagraphIndentDescription: translate(
      "command.assist.paragraphIndent.remove.description"
    ),
    openExportDialog: translate("command.assist.export.openDialog"),
    openExportDialogDescription: translate(
      "command.assist.export.openDialog.description"
    ),
    openJapaneseMachineCheckDialog: translate(
      "command.assist.japaneseMachineCheck.openDialog"
    ),
    openJapaneseMachineCheckDialogDescription: translate(
      "command.assist.japaneseMachineCheck.openDialog.description"
    )
  };
}

export function createAssistCommands(
  controller: AssistCommandController,
  titles: AssistCommandTitles
): readonly AssistCommandEntry[] {
  return [
    {
      id: assistCommandIds.showLineEndingDistribution,
      title: titles.showLineEndingDistribution,
      description: titles.showLineEndingDistributionDescription,
      when: showLineEndingDistributionCommandWhen,
      category: "assist",
      paletteOrder: 10,
      execute: () => controller.showLineEndingDistribution()
    },
    {
      id: assistCommandIds.insertParagraphIndent,
      title: titles.insertParagraphIndent,
      description: titles.insertParagraphIndentDescription,
      when: paragraphIndentCommandWhen,
      category: "assist",
      paletteOrder: 20,
      execute: () => controller.insertParagraphIndent()
    },
    {
      id: assistCommandIds.removeParagraphIndent,
      title: titles.removeParagraphIndent,
      description: titles.removeParagraphIndentDescription,
      when: paragraphIndentCommandWhen,
      category: "assist",
      paletteOrder: 30,
      execute: () => controller.removeParagraphIndent()
    },
    // With no argument these behave exactly as before #684. An explicit
    // target (a document tab's context menu) is judged and used as
    // given - never the active editor's.
    {
      id: assistCommandIds.openExportDialog,
      title: titles.openExportDialog ?? "Export Project...",
      description: titles.openExportDialogDescription ?? "",
      when: { key: "project.isOpen" },
      ...(controller.canOpenExportDialog === undefined
        ? {}
        : {
            isEnabled: (options?: ExportCommandOptions) =>
              options?.target === undefined ||
              controller.canOpenExportDialog!(options.target)
          }),
      category: "assist",
      paletteOrder: 40,
      execute: (options?: ExportCommandOptions) =>
        controller.openExportDialog?.(options?.target)
    } as unknown as OptionsCommand<ExportCommandOptions>,
    {
      id: assistCommandIds.openJapaneseMachineCheckDialog,
      title: titles.openJapaneseMachineCheckDialog ?? "Japanese Style Check...",
      description: titles.openJapaneseMachineCheckDialogDescription ?? "",
      when: { key: "project.isOpen" },
      ...(controller.canRunJapaneseMachineCheck === undefined
        ? {}
        : {
            isEnabled: (options?: JapaneseMachineCheckCommandOptions) =>
              controller.canRunJapaneseMachineCheck!(options?.target)
          }),
      category: "assist",
      paletteOrder: 50,
      execute: (options?: JapaneseMachineCheckCommandOptions) =>
        controller.openJapaneseMachineCheckDialog?.(options?.target)
    } as unknown as OptionsCommand<JapaneseMachineCheckCommandOptions>
  ];
}

export function registerAssistCommands(
  registry: CommandRegistry,
  controller: AssistCommandController,
  titles: AssistCommandTitles
): void {
  for (const command of createAssistCommands(controller, titles)) {
    registry.register(command as AssistCommand);
  }
}
