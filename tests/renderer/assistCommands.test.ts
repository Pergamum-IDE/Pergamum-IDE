import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  CommandDisabledError,
  CommandRegistry
} from "../../src/shared/commandRegistry";
import { assistCommandIds } from "../../src/shared/commandIds";
import {
  createAssistCommandTitles,
  paragraphIndentCommandWhen,
  registerAssistCommands,
  showLineEndingDistributionCommandWhen
} from "../../src/renderer/assistCommands";

const titles = {
  showLineEndingDistribution: "Show Line Ending Distribution",
  showLineEndingDistributionDescription:
    "Show the distribution of LF, CRLF, and CR line endings in the current document.",
  insertParagraphIndent: "Insert Paragraph Indents",
  insertParagraphIndentDescription:
    "Insert full-width paragraph indent spaces into non-empty lines in the current Markdown document.",
  removeParagraphIndent: "Remove Paragraph Indents",
  removeParagraphIndentDescription:
    "Remove one leading full-width space from each line in the current Markdown document."
};
const executionOptions = { source: "commandPalette" } as const;

function registerAssistCommandSet(
  registry: CommandRegistry,
  overrides: Partial<{
    showLineEndingDistribution: () => void;
    insertParagraphIndent: () => void;
    removeParagraphIndent: () => void;
  }> = {}
): void {
  registerAssistCommands(
    registry,
    {
      showLineEndingDistribution: () => undefined,
      insertParagraphIndent: () => undefined,
      removeParagraphIndent: () => undefined,
      ...overrides
    },
    titles
  );
}

describe("assist commands (#252)", () => {
  it("registers assist.lineEndingDistribution.show", () => {
    const registry = new CommandRegistry();

    registerAssistCommandSet(registry);

    expect(registry.list().map((command) => command.id)).toEqual([
      "assist.lineEndingDistribution.show",
      "assist.paragraphIndent.insert",
      "assist.paragraphIndent.remove"
    ]);
  });

  it("declares when as editor.kind.markdown — available for any Markdown document, including read-only ones", () => {
    expect(showLineEndingDistributionCommandWhen).toEqual({
      key: "editor.kind.markdown"
    });
  });

  it("declares paragraph indent commands as Markdown write commands", () => {
    expect(paragraphIndentCommandWhen).toEqual({
      allOf: [
        { key: "editor.hasDocument" },
        { key: "editor.kind.markdown" },
        {
          anyOf: [
            { not: { key: "editor.document.projectOwned" } },
            { key: "project.access.readWrite" }
          ]
        }
      ]
    });
  });

  it("shows assist commands in Command Palette search (no palette.visible: false override)", () => {
    const registry = new CommandRegistry();

    registerAssistCommandSet(registry);

    expect(
      registry.get(assistCommandIds.showLineEndingDistribution)?.palette
    ).toBeUndefined();
    expect(registry.get(assistCommandIds.insertParagraphIndent)?.palette).toBeUndefined();
    expect(registry.get(assistCommandIds.removeParagraphIndent)?.palette).toBeUndefined();
  });

  it("routes execution to the controller", async () => {
    const registry = new CommandRegistry();
    const showLineEndingDistribution = vi.fn();
    const insertParagraphIndent = vi.fn();
    const removeParagraphIndent = vi.fn();

    registerAssistCommandSet(registry, {
      showLineEndingDistribution,
      insertParagraphIndent,
      removeParagraphIndent
    });
    registry.setCommandContextProvider(() => ({
      "editor.hasDocument": true,
      "editor.kind.markdown": true,
      "editor.document.projectOwned": false
    }));

    await registry.execute(
      assistCommandIds.showLineEndingDistribution,
      executionOptions
    );
    await registry.execute(assistCommandIds.insertParagraphIndent, executionOptions);
    await registry.execute(assistCommandIds.removeParagraphIndent, executionOptions);

    expect(showLineEndingDistribution).toHaveBeenCalledTimes(1);
    expect(insertParagraphIndent).toHaveBeenCalledTimes(1);
    expect(removeParagraphIndent).toHaveBeenCalledTimes(1);
  });

  it("is enabled when editor.kind.markdown holds, including when the document is read-only (no access-mode key referenced)", () => {
    const registry = new CommandRegistry();

    registerAssistCommandSet(registry);

    expect(
      registry.isEnabledForContext(
        assistCommandIds.showLineEndingDistribution,
        { "editor.kind.markdown": true, "project.access.readOnly": true }
      )
    ).toBe(true);
  });

  it("disables paragraph indent commands for project-owned Markdown documents in read-only projects", () => {
    const registry = new CommandRegistry();

    registerAssistCommandSet(registry);

    for (const commandId of [
      assistCommandIds.insertParagraphIndent,
      assistCommandIds.removeParagraphIndent
    ]) {
      expect(
        registry.enablementForContext(commandId, {
          "editor.hasDocument": true,
          "editor.kind.markdown": true,
          "editor.document.projectOwned": true,
          "project.access.readWrite": false,
          "project.access.readOnly": true
        })
      ).toEqual({
        enabled: false,
        disabledReason: "readOnlyProject"
      });
    }
  });

  it("keeps paragraph indent commands enabled for standalone Markdown documents even when a project session is read-only", () => {
    const registry = new CommandRegistry();

    registerAssistCommandSet(registry);

    for (const commandId of [
      assistCommandIds.insertParagraphIndent,
      assistCommandIds.removeParagraphIndent
    ]) {
      expect(
        registry.enablementForContext(commandId, {
          "editor.hasDocument": true,
          "editor.kind.markdown": true,
          "editor.document.projectOwned": false,
          "project.access.readWrite": false,
          "project.access.readOnly": true
        })
      ).toEqual({
        enabled: true,
        disabledReason: null
      });
    }
  });

  it("is disabled when the active editor is not a Markdown document (e.g. Glossary editor)", () => {
    const registry = new CommandRegistry();

    registerAssistCommandSet(registry);

    expect(
      registry.isEnabledForContext(
        assistCommandIds.showLineEndingDistribution,
        { "editor.kind.markdown": false, "editor.kind.glossary": true }
      )
    ).toBe(false);
  });

  it("rejects execution via the registry when editor.kind.markdown is false, without running the body", async () => {
    const registry = new CommandRegistry();
    const showLineEndingDistribution = vi.fn();

    registerAssistCommandSet(registry, { showLineEndingDistribution });
    registry.setCommandContextProvider(() => ({
      "editor.kind.markdown": false
    }));

    await expect(
      registry.execute(
        assistCommandIds.showLineEndingDistribution,
        executionOptions
      )
    ).rejects.toBeInstanceOf(CommandDisabledError);
    expect(showLineEndingDistribution).not.toHaveBeenCalled();
  });

  it("creates localized command titles from command i18n keys", () => {
    const translate = vi.fn((key: string) => `translated:${key}`);

    expect(createAssistCommandTitles(translate)).toEqual({
      showLineEndingDistribution:
        "translated:command.assist.lineEndingDistribution.show",
      showLineEndingDistributionDescription:
        "translated:command.assist.lineEndingDistribution.show.description",
      insertParagraphIndent:
        "translated:command.assist.paragraphIndent.insert",
      insertParagraphIndentDescription:
        "translated:command.assist.paragraphIndent.insert.description",
      removeParagraphIndent:
        "translated:command.assist.paragraphIndent.remove",
      removeParagraphIndentDescription:
        "translated:command.assist.paragraphIndent.remove.description"
    });
  });

  it("keeps the command definition independent from React and DOM APIs", () => {
    const source = readFileSync("src/renderer/assistCommands.ts", "utf8");

    expect(source).not.toContain("defineCommandId(");
    expect(source).not.toContain('from "react"');
    expect(source).not.toContain("window.");
    expect(source).not.toContain("JSX");
  });
});
