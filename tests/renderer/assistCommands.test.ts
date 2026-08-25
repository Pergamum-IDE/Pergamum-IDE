import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  CommandDisabledError,
  CommandRegistry
} from "../../src/shared/commandRegistry";
import { assistCommandIds } from "../../src/shared/commandIds";
import {
  createAssistCommandTitles,
  registerAssistCommands,
  showLineEndingDistributionCommandWhen
} from "../../src/renderer/assistCommands";

const titles = {
  showLineEndingDistribution: "Show Line Ending Distribution",
  showLineEndingDistributionDescription:
    "Show the distribution of LF, CRLF, and CR line endings in the current document."
};
const executionOptions = { source: "commandPalette" } as const;

function registerAssistCommandSet(
  registry: CommandRegistry,
  overrides: Partial<{ showLineEndingDistribution: () => void }> = {}
): void {
  registerAssistCommands(
    registry,
    {
      showLineEndingDistribution: () => undefined,
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
      "assist.lineEndingDistribution.show"
    ]);
  });

  it("declares when as editor.kind.markdown — available for any Markdown document, including read-only ones", () => {
    expect(showLineEndingDistributionCommandWhen).toEqual({
      key: "editor.kind.markdown"
    });
  });

  it("shows up in Command Palette search (no palette.visible: false override)", () => {
    const registry = new CommandRegistry();

    registerAssistCommandSet(registry);

    expect(
      registry.get(assistCommandIds.showLineEndingDistribution)?.palette
    ).toBeUndefined();
  });

  it("routes execution to the controller", async () => {
    const registry = new CommandRegistry();
    const showLineEndingDistribution = vi.fn();

    registerAssistCommandSet(registry, { showLineEndingDistribution });
    registry.setCommandContextProvider(() => ({
      "editor.kind.markdown": true
    }));

    await registry.execute(
      assistCommandIds.showLineEndingDistribution,
      executionOptions
    );

    expect(showLineEndingDistribution).toHaveBeenCalledTimes(1);
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
        "translated:command.assist.lineEndingDistribution.show.description"
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
