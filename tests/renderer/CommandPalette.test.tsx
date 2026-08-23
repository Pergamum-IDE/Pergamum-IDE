import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CommandRegistry, defineCommandId } from "../../src/shared/commandRegistry";
import type { CommandContext } from "../../src/shared/commandEnablement";
import { t, type Translate } from "../../src/shared/i18n";
import { enTranslations } from "../../src/shared/i18n/en";
import { jaTranslations } from "../../src/shared/i18n/ja";
import {
  CommandPalette,
  CommandPaletteHighlightedText,
  commandPaletteItemClassName,
  resolveCommandPaletteFooterModel,
  scrollCommandPaletteSelectionIntoView
} from "../../src/renderer/CommandPalette";
import {
  filterCommandPaletteEntries,
  resolveCommandPaletteEnterSelection,
  type CommandPaletteEntry
} from "../../src/renderer/commandPaletteEntries";
import { registerLineJumpCommands } from "../../src/renderer/lineJumpCommands";
import type { LineJumpEditorSnapshot } from "../../src/renderer/lineJumpQuery";

const translate: Translate = (key) => key;
const realTranslateEn: Translate = (key, values) => t("en", key, values);
const realTranslateJa: Translate = (key, values) => t("ja", key, values);
const notComposing = () => false;
const noop = () => undefined;

function buildRegistry(): CommandRegistry {
  const registry = new CommandRegistry();

  registry.register({
    id: defineCommandId("test.command.save"),
    title: "保存",
    description: "現在の文書を保存",
    canonicalLabel: "Save Document",
    execute: () => undefined,
    isEnabled: () => true
  });
  registry.register({
    id: defineCommandId("test.command.disabled"),
    title: "Disabled Command",
    execute: () => undefined,
    isEnabled: () => false
  });
  registry.register({
    id: defineCommandId("test.command.fallback"),
    title: "Fallback Only",
    execute: () => undefined
  });

  return registry;
}

function buildWhenGatedRegistry(): CommandRegistry {
  const registry = new CommandRegistry();

  registry.register({
    id: defineCommandId("test.command.whenGated"),
    title: "When Gated",
    execute: () => undefined,
    when: { key: "editor.isDirty" }
  });

  return registry;
}

function buildReadOnlyProjectWriteRegistry(): CommandRegistry {
  const registry = new CommandRegistry();

  registry.register({
    id: defineCommandId("test.command.projectWrite"),
    title: "Project write",
    execute: () => undefined,
    when: { key: "project.access.readWrite" }
  });
  registry.register({
    id: defineCommandId("test.command.normalDisabled"),
    title: "Normal disabled",
    execute: () => undefined,
    when: { key: "editor.isDirty" }
  });

  return registry;
}

function renderPalette(overrides: {
  registry?: CommandRegistry;
  commandContext?: CommandContext;
  translate?: Translate;
  initialInputValue?: string;
  onExecuteCommand?: (commandId: unknown, ...args: readonly unknown[]) => void;
  onBlockedCommand?: (commandId: unknown) => void;
  lineJumpEditorSnapshot?: LineJumpEditorSnapshot | null;
} = {}): string {
  return renderToStaticMarkup(
    React.createElement(CommandPalette, {
      commandRegistry: overrides.registry ?? buildRegistry(),
      translate: overrides.translate ?? translate,
      isComposing: notComposing,
      commandContext: overrides.commandContext ?? {},
      initialInputValue: overrides.initialInputValue,
      onExecuteCommand: overrides.onExecuteCommand ?? noop,
      onBlockedCommand: overrides.onBlockedCommand ?? noop,
      onClose: noop,
      lineJumpEditorSnapshot: overrides.lineJumpEditorSnapshot
    })
  );
}

function buildLineJumpEditorSnapshot(
  lineCount: number,
  getLineText: (line: number) => string = () => ""
): LineJumpEditorSnapshot {
  return { lineCount, getLineText };
}

function buildLineJumpRegistry(
  goToLine: (line: number) => void = () => undefined
): CommandRegistry {
  const registry = new CommandRegistry();

  registerLineJumpCommands(
    registry,
    { goToLine },
    {
      goToLine: "Go to Line",
      goToLineDescription: "Move the cursor to a line in the active editor"
    }
  );

  return registry;
}

describe("CommandPalette", () => {
  it("initializes the search input to '>'", () => {
    const markup = renderPalette();

    expect(markup).toContain('value="&gt;"');
  });

  it("renders a two-line item using description/canonicalLabel with title/id fallback", () => {
    const markup = renderPalette();

    expect(markup).toContain("現在の文書を保存");
    expect(markup).toContain("Save Document");
    expect(markup).toContain("Fallback Only");
    expect(markup).toContain("test.command.fallback");
  });

  it("renders the empty result state in the result list area", () => {
    const markup = renderPalette({
      registry: new CommandRegistry()
    });

    expect(markup).toContain("commandPaletteList");
    expect(markup).toContain("commandPaletteEmpty");
    expect(markup).toContain("commandPalette.noResults");
  });

  it("marks disabled commands with the disabled class and aria-disabled", () => {
    const markup = renderPalette();

    expect(markup).toContain("commandPaletteItemDisabled");
    expect(markup).toContain('aria-disabled="true"');
  });

  it("renders as a labeled dialog with a search input and a close button", () => {
    const markup = renderPalette();

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain("commandPaletteInput");
    expect(markup).toContain("commandPaletteCloseButton");
  });

  it("displays a when-gated command as disabled when the snapshot says it is false", () => {
    const markup = renderPalette({
      registry: buildWhenGatedRegistry(),
      commandContext: { "editor.isDirty": false }
    });

    expect(markup).toContain("When Gated");
    expect(markup).toContain("commandPaletteItemDisabled");
    expect(markup).toContain('aria-disabled="true"');
  });

  it("displays a when-gated command as enabled when the snapshot says it is true", () => {
    const markup = renderPalette({
      registry: buildWhenGatedRegistry(),
      commandContext: { "editor.isDirty": true }
    });

    expect(markup).toContain("When Gated");
    expect(markup).not.toContain("commandPaletteItemDisabled");
    expect(markup).toContain('aria-disabled="false"');
  });

  it("renders the read-only disabled reason in English and Japanese", () => {
    const registry = buildReadOnlyProjectWriteRegistry();
    const commandContext = {
      "project.access.readWrite": false,
      "project.access.readOnly": true
    };
    const englishMarkup = renderPalette({
      registry,
      commandContext,
      translate: realTranslateEn,
      initialInputValue: ">project"
    });
    const japaneseMarkup = renderPalette({
      registry,
      commandContext,
      translate: realTranslateJa,
      initialInputValue: ">project"
    });

    expect(englishMarkup).toContain("Unavailable in read-only mode");
    expect(japaneseMarkup).toContain(
      "読み取り専用のため使用できません"
    );
  });

  it("does not render the read-only reason or shield icon for ordinary disabled commands", () => {
    const markup = renderPalette({
      registry: buildReadOnlyProjectWriteRegistry(),
      commandContext: {
        "project.access.readWrite": true,
        "project.access.readOnly": false,
        "editor.isDirty": false
      },
      translate: realTranslateEn,
      initialInputValue: ">normal"
    });

    expect(markup).toContain("Normal disabled");
    expect(markup).not.toContain("Unavailable in read-only mode");
    expect(markup).not.toContain("feather-shield");
  });

  it("uses the original primary label as the result accessible name", () => {
    const markup = renderPalette();

    expect(markup).toContain('aria-label="Save Document"');
    expect(markup).not.toContain('aria-label="現在の文書を保存"');
  });

  it("keeps the selected disabled item visually distinct", () => {
    expect(commandPaletteItemClassName(true, false)).toBe(
      "commandPaletteItem commandPaletteItemSelected commandPaletteItemDisabled"
    );
  });

  it("keeps the selected item visible with nearest scrolling", () => {
    const scrollIntoView = vi.fn();

    scrollCommandPaletteSelectionIntoView({ scrollIntoView });

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("does not scroll when the result list has no selected item", () => {
    expect(() => scrollCommandPaletteSelectionIntoView(null)).not.toThrow();
  });

  it("renders fixed footer hints and the command-mode search hint, without a result count, for the default empty query", () => {
    const markup = renderPalette();

    expect(markup).toContain("commandPaletteFooter");
    expect(markup).toContain("commandPalette.footer.selectHint");
    expect(markup).toContain("commandPalette.footer.runHint");
    expect(markup).toContain("commandPalette.footer.closeHint");
    expect(markup).toContain("commandPalette.footer.searchHint");
    expect(markup).not.toContain("commandPalette.footer.results");
  });

  it("shows the real English/Japanese search hint text for the default > with an empty query", () => {
    expect(renderPalette({ translate: realTranslateEn })).toContain(
      "Search commands"
    );
    expect(renderPalette({ translate: realTranslateJa })).toContain(
      "コマンドを検索します"
    );
  });

  it("does not show the command-mode search hint for a fully empty input, and renders the native placeholder instead", () => {
    const markup = renderPalette({
      translate: realTranslateEn,
      initialInputValue: ""
    });

    expect(markup).toContain('<div class="commandPaletteFooterStatus"></div>');
    expect(markup).toContain('placeholder="Type &gt; for commands"');
  });

  it("renders '1 result', not '1 results', for a real English query with exactly one match (dogfood regression)", () => {
    // Renders the actual CommandPalette JSX tree end-to-end (real registry
    // filtering, real resolveCommandPaletteFooterModel call, real translate
    // bound to the real en.ts dictionary) rather than only asserting on the
    // pure footer-model function, since a wiring bug between statusKey/
    // statusValues and the rendered JSX would not show up in a model-only
    // test.
    const markup = renderPalette({
      translate: realTranslateEn,
      initialInputValue: ">fallback"
    });

    expect(markup).toContain("1 result");
    expect(markup).not.toContain("1 results");
  });

  it("renders '{count} results' for a real English query with multiple matches", () => {
    const markup = renderPalette({
      translate: realTranslateEn,
      initialInputValue: ">test.command"
    });

    expect(markup).toContain("3 results");
    expect(markup).not.toContain("1 results");
    expect(markup).not.toContain("1 result");
  });

  it("renders the Japanese counter form for a real one-result query", () => {
    const markup = renderPalette({
      translate: realTranslateJa,
      initialInputValue: ">fallback"
    });

    expect(markup).toContain("1件の結果");
  });

  it("does not hard-code either plural results key in CommandPalette.tsx, and passes statusValues through to translate", () => {
    const source = readFileSync("src/renderer/CommandPalette.tsx", "utf8");

    expect(source).not.toContain("commandPalette.footer.results.other");
    expect(source).not.toContain("commandPalette.footer.results.one");
    expect(source).toContain("translate(footer.statusKey, footer.statusValues)");
  });

  it("uses compact key-only footer hints that do not read like clickable actions", () => {
    expect(enTranslations["commandPalette.footer.selectHint"]).toBe("↑↓");
    expect(enTranslations["commandPalette.footer.runHint"]).toBe("Enter");
    expect(enTranslations["commandPalette.footer.closeHint"]).toBe("Esc");
    expect(jaTranslations["commandPalette.footer.selectHint"]).toBe("↑↓");
    expect(jaTranslations["commandPalette.footer.runHint"]).toBe("Enter");
    expect(jaTranslations["commandPalette.footer.closeHint"]).toBe("Esc");
  });

  it("uses adaptive top-anchored height while keeping large result sets scrollable", () => {
    const styles = readFileSync("src/renderer/styles.css", "utf8");

    expect(styles).toContain(".commandPaletteBackdrop");
    expect(styles).toContain("align-items: flex-start;");
    expect(styles).toContain(".commandPalette {\n  display: flex;");
    expect(styles).toContain("width: min(35rem, calc(100vw - 2rem));");
    expect(styles).toContain("max-height: min(30rem, calc(100vh - 24vh));");
    expect(styles).toContain("border-radius: 0.5rem;");
    expect(styles).toContain(".commandPaletteInputRow {\n  display: flex;\n  flex: 0 0 auto;");
    expect(styles).toContain("padding: 0.625rem 0.75rem;");
    expect(styles).toContain(".commandPaletteList {\n  flex: 0 1 auto;");
    expect(styles).toContain("overflow-y: auto;");
    expect(styles).toContain("padding: 0.375rem;");
    expect(styles).toContain(".commandPaletteFooter {\n  display: flex;\n  flex: 0 0 auto;");
    expect(styles).toContain("gap: 1em;");
    expect(styles).toContain(".commandPaletteEmpty {\n  display: flex;\n  min-height: 6rem;");
    expect(styles).toContain(".commandPaletteItem {\n  display: flex;");
    expect(styles).toContain("gap: 0.15em;");
    expect(styles).toContain("min-height: 3rem;");
    expect(styles).toContain("padding: 0.52em 0.6em;");
    expect(styles).toContain("box-shadow: inset 0.1875rem 0 0 #c9d3dc;");
    expect(styles).toContain("border-radius: 0.125em;");
    expect(styles).toContain("padding: 0 0.08em;");
  });
});

describe("CommandPalette highlighting and footer model", () => {
  const entries: CommandPaletteEntry[] = [
    {
      id: defineCommandId("test.command.save"),
      title: "Save Document",
      description: "Write the current editor to disk",
      enabled: true
    },
    {
      id: defineCommandId("test.command.disabled"),
      title: "Disabled Command",
      enabled: false
    }
  ];

  it("renders no highlight markup when there are no matched ranges", () => {
    const markup = renderToStaticMarkup(
      React.createElement(CommandPaletteHighlightedText, {
        text: "Save Document",
        ranges: []
      })
    );

    expect(markup).toBe("Save Document");
    expect(markup).not.toContain("<mark");
  });

  it("safely renders highlighted text without raw HTML injection", () => {
    const markup = renderToStaticMarkup(
      React.createElement(CommandPaletteHighlightedText, {
        text: "<script>Save</script>",
        ranges: [{ start: 8, end: 12 }]
      })
    );

    expect(markup).toContain("&lt;script&gt;");
    expect(markup).toContain("<mark");
    expect(markup).not.toContain("<script>");
  });

  it("highlights matched ranges from the filtering result in every visible matched field", () => {
    const result = filterCommandPaletteEntries(entries, "document")[0];
    const primaryMarkup = renderToStaticMarkup(
      React.createElement(CommandPaletteHighlightedText, {
        text: result.primary.text,
        ranges: result.primary.ranges
      })
    );

    expect(result.primary).toEqual({
      field: "title",
      text: "Save Document",
      ranges: [{ start: 5, end: 13 }]
    });
    expect(primaryMarkup).toContain(
      'Save <mark class="commandPaletteMatch">Document</mark>'
    );
  });

  it("shows result count only for command queries in the footer model", () => {
    const results = filterCommandPaletteEntries(entries, "command");

    expect(
      resolveCommandPaletteFooterModel({
        mode: "command",
        query: "command",
        inputValue: ">command",
        entries: results,
        selectedIndex: 0
      })
    ).toEqual({
      statusKey: "commandPalette.footer.results.other",
      statusValues: { count: 2 },
      canRunSelected: true
    });
    expect(
      resolveCommandPaletteFooterModel({
        mode: "command",
        query: "",
        inputValue: "",
        entries: results,
        selectedIndex: 0
      }).statusKey
    ).toBeNull();
  });

  it("uses the singular one form when exactly one result matches (#129 i18n follow-up)", () => {
    const results = filterCommandPaletteEntries(entries, "save");

    expect(results).toHaveLength(1);
    expect(
      resolveCommandPaletteFooterModel({
        mode: "command",
        query: "save",
        inputValue: ">save",
        entries: results,
        selectedIndex: 0
      })
    ).toEqual({
      statusKey: "commandPalette.footer.results.one",
      statusValues: { count: 1 },
      canRunSelected: true
    });
  });

  it("uses a disabled status and dims Enter when the selected item is disabled", () => {
    const results = filterCommandPaletteEntries(entries, "disabled");

    expect(
      resolveCommandPaletteFooterModel({
        mode: "command",
        query: "disabled",
        inputValue: ">disabled",
        entries: results,
        selectedIndex: 0
      })
    ).toEqual({
      statusKey: "commandPalette.footer.disabled",
      canRunSelected: false
    });
  });

  it("uses the read-only disabled status key only for readOnlyProject disabled entries", () => {
    expect(
      resolveCommandPaletteFooterModel({
        mode: "command",
        query: "save",
        inputValue: ">save",
        entries: [
          {
            id: defineCommandId("test.command.save"),
            title: "Save",
            enabled: false,
            disabledReason: "readOnlyProject",
            matches: [],
            primary: { field: "title", text: "Save", ranges: [] },
            secondary: {
              field: "commandId",
              text: "test.command.save",
              ranges: []
            }
          }
        ],
        selectedIndex: 0
      })
    ).toEqual({
      statusKey: "command.disabled.readOnlyProject",
      canRunSelected: false
    });
    expect(
      resolveCommandPaletteFooterModel({
        mode: "command",
        query: "save",
        inputValue: ">save",
        entries: [
          {
            id: defineCommandId("test.command.save"),
            title: "Save",
            enabled: false,
            disabledReason: null,
            matches: [],
            primary: { field: "title", text: "Save", ranges: [] },
            secondary: {
              field: "commandId",
              text: "test.command.save",
              ranges: []
            }
          }
        ],
        selectedIndex: 0
      })
    ).toEqual({
      statusKey: "commandPalette.footer.disabled",
      canRunSelected: false
    });
  });

  it("shows the command-mode search hint for an empty query once the > prefix has been typed", () => {
    const results = filterCommandPaletteEntries(entries, "");

    expect(
      resolveCommandPaletteFooterModel({
        mode: "command",
        query: "",
        inputValue: ">",
        entries: results,
        selectedIndex: 0
      })
    ).toEqual({
      statusKey: "commandPalette.footer.searchHint",
      canRunSelected: true
    });
  });

  it("does not show the search hint for a fully empty input (native placeholder covers that state instead)", () => {
    const results = filterCommandPaletteEntries(entries, "");

    expect(
      resolveCommandPaletteFooterModel({
        mode: "command",
        query: "",
        inputValue: "",
        entries: results,
        selectedIndex: 0
      }).statusKey
    ).toBeNull();
  });

  it("prioritizes the disabled selected command message over the command-mode search hint", () => {
    const results = filterCommandPaletteEntries(entries, "");

    expect(
      resolveCommandPaletteFooterModel({
        mode: "command",
        query: "",
        inputValue: ">",
        entries: results,
        selectedIndex: 1
      })
    ).toEqual({
      statusKey: "commandPalette.footer.disabled",
      canRunSelected: false
    });
  });

  it("shows a null status and canRunSelected: false for every reserved mode, regardless of entries/selection (#145)", () => {
    const results = filterCommandPaletteEntries(entries, "");

    for (const mode of ["file", "line", "heading", "glossary"] as const) {
      expect(
        resolveCommandPaletteFooterModel({
          mode,
          query: "abc",
          inputValue: "abc",
          entries: results,
          selectedIndex: 0
        })
      ).toEqual({ statusKey: null, canRunSelected: false });
    }
  });
});

describe("CommandPalette reserved Quick Access modes (#145)", () => {
  const reservedCases = [
    { initialInputValue: "abc", mode: "file", key: "commandPalette.reserved.file" },
    { initialInputValue: " abc", mode: "file", key: "commandPalette.reserved.file" },
    { initialInputValue: "%abc", mode: "file", key: "commandPalette.reserved.file" },
    { initialInputValue: "#intro", mode: "heading", key: "commandPalette.reserved.heading" },
    { initialInputValue: "＃intro", mode: "heading", key: "commandPalette.reserved.heading" },
    { initialInputValue: "@alice", mode: "glossary", key: "commandPalette.reserved.glossary" },
    { initialInputValue: "＠alice", mode: "glossary", key: "commandPalette.reserved.glossary" }
  ] as const;

  it.each(reservedCases.map((c) => [c.initialInputValue, c] as const))(
    "shows the reserved-mode message for %j, not the command results list",
    (_input, testCase) => {
      const markup = renderPalette({
        initialInputValue: testCase.initialInputValue
      });

      expect(markup).toContain("commandPaletteReservedPlaceholder");
      expect(markup).toContain(testCase.key);
      // Reserved-mode precedence: no command list, no empty-result text, no
      // result count, and no selectable/clickable result item — so Enter
      // and click can never resolve to a command in a reserved mode.
      expect(markup).not.toContain("commandPaletteList");
      expect(markup).not.toContain("commandPaletteEmpty");
      expect(markup).not.toContain("commandPalette.noResults");
      expect(markup).not.toContain("commandPaletteItem");
      expect(markup).not.toContain("commandPalette.footer.results");
    }
  );

  it("dims the Enter hint in every reserved mode, same as a disabled selection", () => {
    for (const testCase of reservedCases) {
      const markup = renderPalette({
        initialInputValue: testCase.initialInputValue
      });

      expect(markup).toContain("commandPaletteFooterHintUnavailable");
    }
  });

  it("keeps the select/run/close footer key hints visible in reserved modes", () => {
    const markup = renderPalette({ initialInputValue: "#intro" });

    expect(markup).toContain("commandPalette.footer.selectHint");
    expect(markup).toContain("commandPalette.footer.runHint");
    expect(markup).toContain("commandPalette.footer.closeHint");
  });

  it("shows no footer status text (no result count, no search hint) in reserved modes", () => {
    const markup = renderPalette({
      translate: realTranslateEn,
      initialInputValue: "#intro"
    });

    expect(markup).toContain('<div class="commandPaletteFooterStatus"></div>');
  });

  it("computes empty entries for every reserved mode, so Enter/click can never execute or block a command (#145)", () => {
    // CommandPalette.tsx has no logging calls at all (see the wiring
    // describe block below) and only calls onExecuteCommand/onBlockedCommand
    // from a truthy entries[index] lookup. Reserved modes route through this
    // same `entries` computation, gated on mode === "command", so no command
    // lifecycle event (command.invoked / command.ignored / command.blocked)
    // can be emitted from a reserved mode without a code path existing to
    // call either callback in the first place.
    const source = readFileSync("src/renderer/CommandPalette.tsx", "utf8");

    expect(source).toContain(
      'mode === "command"\n      ? filterCommandPaletteEntries('
    );
    expect(source).toContain(": [];");
  });

  it("resolves no Enter selection when entries is empty, as it always is in a reserved mode", () => {
    expect(resolveCommandPaletteEnterSelection([], 0)).toBeNull();
    expect(resolveCommandPaletteEnterSelection([], null)).toBeNull();
    expect(resolveCommandPaletteEnterSelection([], 5)).toBeNull();
  });

  it("still recognizes '#' and '@' as file-mode-adjacent reserved prefixes, not as file queries", () => {
    // Unknown leading characters (e.g. "%") fall back to file mode per
    // #139, but '#' / '@' are reserved prefixes with their own messages,
    // distinct from the plain no-prefix file message. ':' is no longer
    // reserved (#140) — covered separately below.
    const fileMarkup = renderPalette({ initialInputValue: "%abc" });
    const headingMarkup = renderPalette({ initialInputValue: "#abc" });

    expect(fileMarkup).toContain("commandPalette.reserved.file");
    expect(fileMarkup).not.toContain("commandPalette.reserved.heading");
    expect(headingMarkup).toContain("commandPalette.reserved.heading");
    expect(headingMarkup).not.toContain("commandPalette.reserved.file");
  });

  it("no longer treats ':' as a reserved mode (#140): it shows a line-jump message instead", () => {
    const markup = renderPalette({ initialInputValue: ":abc" });

    expect(markup).toContain("commandPalette.lineJump.invalid");
    expect(markup).not.toContain("commandPalette.reserved");
  });
});

describe("CommandPalette snapshot and UI-level block wiring", () => {
  const source = readFileSync("src/renderer/CommandPalette.tsx", "utf8");

  it("derives mode from the #139 parser, not the retired resolver (#145)", () => {
    expect(source).toContain(
      'import {\n  parseQuickAccessInput,\n  type QuickAccessMode\n} from "./quickAccessInputParser";'
    );
    expect(source).toContain("parseQuickAccessInput(inputValue)");
    expect(source).toContain("parseQuickAccessInput(value)");
    expect(source).not.toContain("quickAccessPrefixResolver");
    expect(source).not.toContain("resolveQuickAccessInput");
  });

  it("implements line mode through the imported pure resolvers, not ad-hoc logic (#140)", () => {
    expect(source).toContain("resolveLineJumpPaletteState(");
    expect(source).toContain("resolveLineJumpFooterModel(");
    expect(source).toContain("lineJumpMessageKey(");
  });

  it("does not implement the remaining reserved-mode actions — only the reserved message and mode dispatch", () => {
    // File, heading, and glossary remain reserved (for the reserved-message
    // switch and footer suppression) but must not gain their own execution
    // logic here; that belongs to the future mode issues (#141-#143).
    expect(source).not.toContain("symbolJump");
    expect(source).not.toContain("headingSearch");
    expect(source).not.toContain("glossarySearch");
    expect(source).not.toContain("fileQuickOpen");
  });

  it("captures commandContext once via a lazy useState initializer, not the live prop", () => {
    expect(source).toContain(
      "const [snapshot] = useState<CommandContext>(() => commandContext);"
    );

    const afterCapture = source.slice(
      source.indexOf("const [snapshot] = useState<CommandContext>")
    );

    // Every entries computation should read the captured snapshot, not the
    // (potentially stale-by-design) live commandContext prop directly.
    expect(afterCapture.match(/listCommandPaletteEntries\(/g)?.length).toBe(3);
    expect(
      afterCapture.match(/listCommandPaletteEntries\(commandRegistry, snapshot\)/g)
        ?.length
    ).toBe(3);
  });

  it("blocks a disabled entry at the UI layer on click without executing it", () => {
    const startIndex = source.indexOf("function executeEntryAt(");
    const endIndex = source.indexOf("function handleKeyDown(");
    const body = source.slice(startIndex, endIndex);

    expect(body).toContain("if (!entry.enabled) {");
    expect(body.indexOf("onBlockedCommand(entry.id)")).toBeLessThan(
      body.indexOf("onExecuteCommand(entry.id)")
    );
  });

  it("blocks a disabled entry at the UI layer on Enter without executing it", () => {
    const startIndex = source.indexOf('case "Enter": {');
    const endIndex = source.indexOf("default:");
    const body = source.slice(startIndex, endIndex);

    expect(body).toContain("resolveCommandPaletteEnterSelection(");
    expect(body).toContain("if (!entry.enabled) {");
    expect(body.indexOf("onBlockedCommand(entry.id)")).toBeLessThan(
      body.indexOf("onExecuteCommand(entry.id)")
    );
  });
});

describe("CommandPalette line jump mode (#140 / #148)", () => {
  const source = readFileSync("src/renderer/CommandPalette.tsx", "utf8");

  it("does not show command search results in line mode", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(50),
      commandContext: { "editor.kind.markdown": true },
      initialInputValue: ":42"
    });

    expect(markup).not.toContain("commandPaletteEmpty");
    expect(markup).not.toContain("commandPalette.noResults");
  });

  it("shows an executable 'Go to line N' result for a valid, in-range query", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(50),
      commandContext: { "editor.kind.markdown": true },
      translate: realTranslateEn,
      initialInputValue: ":42"
    });

    expect(markup).toContain("Go to line 42");
    expect(markup).toContain("commandPaletteItemSelected");
    expect(markup).toContain('aria-selected="true"');
    expect(markup).not.toContain("commandPaletteItemDisabled");
    expect(markup).not.toContain("commandPaletteFooterHintUnavailable");
  });

  it("normalizes the displayed line number for :007 and :1,000 (the exact-match candidate)", () => {
    const registry = buildLineJumpRegistry();
    const snapshot = buildLineJumpEditorSnapshot(2000);
    const context = { "editor.kind.markdown": true };

    expect(
      renderPalette({
        registry,
        lineJumpEditorSnapshot: snapshot,
        commandContext: context,
        translate: realTranslateEn,
        initialInputValue: ":007"
      })
    ).toContain("Go to line 7");
    expect(
      renderPalette({
        registry,
        lineJumpEditorSnapshot: snapshot,
        commandContext: context,
        translate: realTranslateEn,
        initialInputValue: ":1,000"
      })
    ).toContain("Go to line 1000");
  });

  it("shows Enter a line number for an empty query", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      translate: realTranslateEn,
      initialInputValue: ":"
    });

    expect(markup).toContain("Enter a line number");
  });

  it("shows Use half-width digits for full-width digit queries", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      translate: realTranslateEn,
      initialInputValue: ":１２"
    });

    expect(markup).toContain("Use half-width digits");
  });

  it("shows Enter a whole line number for decimal queries", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      translate: realTranslateEn,
      initialInputValue: ":1.5"
    });

    expect(markup).toContain("Enter a whole line number");
  });

  it("shows Enter a valid line number for invalid and unsafe-integer queries", () => {
    const invalidMarkup = renderPalette({
      registry: buildLineJumpRegistry(),
      translate: realTranslateEn,
      initialInputValue: ":abc"
    });
    const unsafeMarkup = renderPalette({
      registry: buildLineJumpRegistry(),
      translate: realTranslateEn,
      initialInputValue: ":9,007,199,254,740,992"
    });

    expect(invalidMarkup).toContain("Enter a valid line number");
    expect(unsafeMarkup).toContain("Enter a valid line number");
  });

  it("shows Line number is out of range (no new 'No matching lines' message) when a valid query has zero candidates", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(100),
      commandContext: { "editor.kind.markdown": true },
      translate: realTranslateEn,
      initialInputValue: ":99999"
    });

    expect(markup).toContain("Line number is out of range");
    expect(markup).not.toContain("No matching lines");
    expect(markup).not.toContain("一致する行がありません");
    expect(markup).not.toContain("commandPaletteItem\"");
  });

  it("treats Number.MAX_SAFE_INTEGER as parser-valid but normally out of range", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(100),
      commandContext: { "editor.kind.markdown": true },
      translate: realTranslateEn,
      initialInputValue: ":9,007,199,254,740,991"
    });

    expect(markup).toContain("Line number is out of range");
  });

  it("renders a disabled line-jump result (not a parser message) when the active tab is not an editor", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      commandContext: { "editor.kind.markdown": false },
      translate: realTranslateEn,
      initialInputValue: ":1"
    });

    expect(markup).toContain("Go to line 1");
    expect(markup).toContain("commandPaletteItemDisabled");
    expect(markup).toContain("commandPaletteItemSelected");
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain("This command is currently unavailable");
    expect(markup).toContain("commandPaletteFooterHintUnavailable");
  });

  it("renders a disabled result, not the generic message, for a Glossary Editor active tab", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      commandContext: { "editor.kind.markdown": false, "editor.kind.glossary": true },
      translate: realTranslateEn,
      initialInputValue: ":1"
    });

    expect(markup).not.toContain("commandPalette.lineJump.invalid");
    expect(markup).toContain("commandPaletteItemDisabled");
  });

  it("does not show a result count in line mode", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(50),
      commandContext: { "editor.kind.markdown": true },
      initialInputValue: ":42"
    });

    expect(markup).not.toContain("commandPalette.footer.results");
  });

  it("blocks (does not execute) a disabled line-jump result on Enter/click, emitting command.blocked semantics via onBlockedCommand", () => {
    const body = source.slice(
      source.indexOf("function executeLineJumpResult("),
      source.indexOf("function handleKeyDown(")
    );

    expect(body).toContain('if (lineJumpState.kind === "disabled") {');
    expect(body).toContain("onBlockedCommand(editorCommandIds.goToLine);");
  });

  it("is a no-op for every message state (empty/invalid/unsafe/out-of-range) — Enter calls no callback", () => {
    const body = source.slice(
      source.indexOf("function executeLineJumpResult("),
      source.indexOf("function handleKeyDown(")
    );

    // Only "disabled" and "executable" branches call a callback; every
    // other LineJumpPaletteState kind falls through without calling
    // onExecuteCommand or onBlockedCommand.
    expect(body).not.toContain("onExecuteCommand(");
    expect(body).toContain("executeLineJumpCandidateAt(selectedIndex ?? 0);");
    expect(body.match(/onBlockedCommand\(/g)?.length).toBe(1);
  });

  it("routes Enter in line mode to executeLineJumpResult, not the command-mode entry resolver", () => {
    const startIndex = source.indexOf('case "Enter": {');
    const endIndex = source.indexOf("default:");
    const body = source.slice(startIndex, endIndex);

    expect(body).toContain('if (mode === "line") {');
    expect(body.indexOf('if (mode === "line")')).toBeLessThan(
      body.indexOf("resolveCommandPaletteEnterSelection(")
    );
  });

  it("preserves existing command mode, and file/heading/glossary reserved modes", () => {
    const commandMarkup = renderPalette({ initialInputValue: ">save" });
    const fileMarkup = renderPalette({ initialInputValue: "abc" });
    const headingMarkup = renderPalette({ initialInputValue: "#intro" });
    const glossaryMarkup = renderPalette({ initialInputValue: "@alice" });

    expect(commandMarkup).toContain("commandPaletteList");
    expect(fileMarkup).toContain("commandPalette.reserved.file");
    expect(headingMarkup).toContain("commandPalette.reserved.heading");
    expect(glossaryMarkup).toContain("commandPalette.reserved.glossary");
  });
});

describe("CommandPalette line jump prefix candidates (#148)", () => {
  const source = readFileSync("src/renderer/CommandPalette.tsx", "utf8");
  const editorContext = { "editor.kind.markdown": true };

  it("':1' returns prefix candidates 1, 10-19, 100...", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(105),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":1"
    });

    for (const line of [1, 10, 11, 19, 100]) {
      expect(markup).toContain(`Go to line ${line}`);
    }
  });

  it("':12' returns 12, 120, 121, ...", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(130),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":12"
    });

    expect(markup).toContain("Go to line 12");
    expect(markup).toContain("Go to line 120");
    expect(markup).toContain("Go to line 121");
  });

  it("does not use contains matching: ':1' never includes 21 or 31", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(50),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":1"
    });

    expect(markup).not.toContain("Go to line 21");
    expect(markup).not.toContain("Go to line 31");
  });

  it("puts the exact match first, and it is the initially selected candidate", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(130),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":12"
    });
    const exactIndex = markup.indexOf("Go to line 12<");
    const nextIndex = markup.indexOf("Go to line 120");

    expect(exactIndex).toBeGreaterThan(-1);
    expect(nextIndex).toBeGreaterThan(exactIndex);
    // The exact match's <li> is the first one, and it is selected.
    const firstLiStart = markup.indexOf("<li ");
    const firstLiEnd = markup.indexOf("</li>", firstLiStart);
    const firstLi = markup.slice(firstLiStart, firstLiEnd);

    expect(firstLi).toContain("Go to line 12<");
    expect(firstLi).toContain('aria-selected="true"');
  });

  it("does not duplicate the exact match among the additional candidates", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(130),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":12"
    });
    const occurrences = markup.split("Go to line 12<").length - 1;

    expect(occurrences).toBe(1);
  });

  it("resets selection to the first candidate for a freshly rendered query (never preserves a prior index)", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(200),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":1"
    });
    const firstLiStart = markup.indexOf("<li ");
    const firstLiEnd = markup.indexOf("</li>", firstLiStart);
    const firstLi = markup.slice(firstLiStart, firstLiEnd);

    expect(firstLi).toContain("Go to line 1<");
    expect(firstLi).toContain('aria-selected="true"');
    expect((markup.match(/aria-selected="true"/g) ?? []).length).toBe(1);
  });

  it("stops candidate generation at the hard-coded maximum of 20", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(1000000),
      commandContext: editorContext,
      initialInputValue: ":1"
    });
    const rowCount = (markup.match(/commandPaletteItemPrimary/g) ?? []).length;

    expect(rowCount).toBe(20);
  });

  it("shows the remaining-candidate count in the footer when total matches exceed the display limit of 20", () => {
    // Lines 1..200 starting with "1": "1" (1), "10".."19" (10), "100".."199"
    // (100) -> 111 total matches, 20 displayed, 91 remaining.
    const englishMarkup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(200),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":1"
    });
    const japaneseMarkup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(200),
      commandContext: editorContext,
      translate: realTranslateJa,
      initialInputValue: ":1"
    });

    expect(englishMarkup).toContain("91 more candidates");
    expect(japaneseMarkup).toContain("ほかに91件の候補があります");
  });

  it("uses remaining count (total - displayed), not the total count", () => {
    // 105 lines starting with "1": 1, 10-19, 100-105 -> 1 + 10 + 6 = 17
    // total matches, all of which fit within the 20-candidate display limit,
    // so there is nothing left over.
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(105),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":1"
    });

    expect(markup).not.toContain("more candidates");
  });

  it("shows no remaining-count footer status for exactly 20 total candidates", () => {
    // Lines 1..108 starting with "1": "1" (1), "10".."19" (10), "100".."108"
    // (9) -> exactly 20 total matches, all displayed, none remaining.
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(108),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":1"
    });
    const rowCount = (markup.match(/commandPaletteItemPrimary/g) ?? []).length;

    expect(rowCount).toBe(20);
    expect(markup).not.toContain("more candidates");
  });

  it("does not fetch preview text (getLineText) for candidates beyond the display limit", () => {
    const getLineText = vi.fn(() => "text");
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(200, getLineText),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":1"
    });

    expect(markup).toContain("91 more candidates");
    // Called twice per render (initial selectedIndex computation + render
    // body, see the earlier #148 performance note) — 20 displayed
    // candidates each time, never once for the 91 undisplayed matches.
    expect(getLineText.mock.calls.length).toBe(40);
  });

  it("shows no remaining-count footer status for message states (invalid/out-of-range) or the disabled row", () => {
    const invalidMarkup = renderPalette({
      registry: buildLineJumpRegistry(),
      translate: realTranslateEn,
      initialInputValue: ":abc"
    });
    const outOfRangeMarkup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(10),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":99999"
    });
    const disabledMarkup = renderPalette({
      registry: buildLineJumpRegistry(),
      commandContext: { "editor.kind.markdown": false },
      translate: realTranslateEn,
      initialInputValue: ":1"
    });

    for (const markup of [invalidMarkup, outOfRangeMarkup, disabledMarkup]) {
      expect(markup).not.toContain("more candidates");
    }
  });

  it("keeps the display limit at 20 and only displays the first 20 candidates", () => {
    const source2 = readFileSync("src/renderer/lineJumpCandidates.ts", "utf8");

    expect(source2).toContain("DEFAULT_MAX_LINE_JUMP_CANDIDATES = 20");
  });

  it("does not change command lifecycle behavior: executeLineJumpResult/executeLineJumpCandidateAt are unaffected by the remaining-count footer", () => {
    const functionBody = source.slice(
      source.indexOf("function executeLineJumpCandidateAt("),
      source.indexOf("function handleKeyDown(")
    );

    expect(functionBody).not.toContain("remainingCount");
    expect(functionBody).not.toContain("moreCandidates");
  });

  it("shows a preview for each candidate, reusing the existing line preview formatting", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(20, (line) =>
        line === 1 ? "   const answer = 42;" : `text ${line}`
      ),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":1"
    });

    expect(markup).toContain("commandPaletteItemSecondary");
    expect(markup).toContain("const answer = 42;");
    expect(markup).not.toContain(">   const answer = 42;<");
  });

  it("shows Empty line / 空行 for a candidate whose target line is blank", () => {
    const englishMarkup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(3, () => "   "),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":1"
    });
    const japaneseMarkup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(3, () => ""),
      commandContext: editorContext,
      translate: realTranslateJa,
      initialInputValue: ":1"
    });

    expect(englishMarkup).toContain("Empty line");
    expect(japaneseMarkup).toContain("空行");
  });

  it("renders acceptably when multiple candidates are empty lines", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(19, (line) =>
        line % 2 === 0 ? "" : `text ${line}`
      ),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":1"
    });
    const rowCount = (markup.match(/commandPaletteItemPrimary/g) ?? []).length;
    const emptyCount = (markup.match(/\(Empty line\)/g) ?? []).length;

    expect(rowCount).toBe(11); // 1, 10-19
    expect(emptyCount).toBe(5); // 10, 12, 14, 16, 18
  });

  it("does not show a preview for the disabled row (non-editor context)", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      commandContext: { "editor.kind.markdown": false },
      translate: realTranslateEn,
      initialInputValue: ":1"
    });

    expect(markup).not.toContain("commandPaletteItemSecondary");
  });

  it("only calls getLineText for lines that actually become candidates (#148 performance), not once per rejected line", () => {
    const getLineText = vi.fn(() => "text");
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(1000000, getLineText),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":1"
    });

    expect(markup).toContain("Go to line 1");
    // Candidate generation runs twice on initial mount (the lazy
    // `selectedIndex` useState initializer, then the render body's own
    // `lineJumpState`) — same pre-existing pattern as command-mode entries
    // being computed in both `updateInput` and the render body. Each
    // getLineText call is O(1) once cached (see createLineJumpEditorSnapshot
    // / lineJumpQuery.test.ts), so this bounded 2x is not a meaningful cost.
    expect(getLineText.mock.calls.length).toBe(40);
  });

  it("ArrowUp/ArrowDown operate on the candidate list length in line mode, not the (empty) command entries array", () => {
    const startIndex = source.indexOf('case "ArrowDown": {');
    const endIndex = source.indexOf('case "Enter": {');
    const body = source.slice(startIndex, endIndex);

    expect(body).toContain("moveCommandPaletteSelection(selectionLength, current, 1)");
    expect(body).toContain("moveCommandPaletteSelection(selectionLength, current, -1)");

    const selectionLengthDecl = source.slice(
      source.indexOf("const selectionLength ="),
      source.indexOf("useEffect(() => {\n    scrollCommandPaletteSelectionIntoView")
    );

    expect(selectionLengthDecl).toContain("lineJumpCandidates?.length");
  });

  it("attaches selectedItemRef to the selected candidate row, so scroll-into-view targets it", () => {
    const executableBlockStart = source.indexOf(
      'lineJumpState.kind === "executable" ? ('
    );
    const executableBlockEnd = source.indexOf(
      ") : lineJumpState.kind"
    );
    const body = source.slice(executableBlockStart, executableBlockEnd);

    expect(body).toContain(
      "ref={index === selectedIndex ? selectedItemRef : null}"
    );

    const effectStart = source.indexOf(
      "useEffect(() => {\n    scrollCommandPaletteSelectionIntoView"
    );
    const effectBody = source.slice(effectStart, effectStart + 200);

    expect(effectBody).toContain("[selectionLength, mode, query, selectedIndex]");
  });

  it("executes the clicked candidate through onClick={() => executeLineJumpCandidateAt(index)}", () => {
    const executableBlockStart = source.indexOf(
      'lineJumpState.kind === "executable" ? ('
    );
    const executableBlockEnd = source.indexOf(
      ") : lineJumpState.kind"
    );
    const body = source.slice(executableBlockStart, executableBlockEnd);

    expect(body).toContain("onClick={() => executeLineJumpCandidateAt(index)}");
  });

  it("executes the selected candidate's line through the command registry on Enter, via executeLineJumpCandidateAt", () => {
    const functionBody = source.slice(
      source.indexOf("function executeLineJumpCandidateAt("),
      source.indexOf("/** Handles Enter for line mode")
    );

    expect(functionBody).toContain(
      "onExecuteCommand(editorCommandIds.goToLine, candidate.line);"
    );
  });

  it("does not put candidate generation directly in CommandPalette.tsx: it calls the pure resolveLineJumpPaletteState/resolveLineJumpCandidates helpers", () => {
    expect(source).not.toContain("startsWith(");
    expect(source).toContain("resolveLineJumpPaletteState(");
  });
});
