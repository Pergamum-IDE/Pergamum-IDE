// @vitest-environment happy-dom
//
// #142/#142.1: interactive coverage for the Command Palette `@` / `＠`
// glossary-jump mode. Drives the real widget (keyboard + pointer) so the
// empty-query "open Glossary Manager" row FOLLOWED BY the full browse list
// (#142.1), prefix search over registered forms, the 2-row candidate
// rendering, match highlighting, execution targets, the footer help text, and
// non-regression of the sibling modes are exercised together. Mirrors
// commandPaletteHeadingJumpMode.test.tsx / commandPaletteProjectSearchMode.test.tsx.
import { readFileSync } from "node:fs";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandRegistry, defineCommandId } from "../../src/shared/commandRegistry";
import type { CommandContext } from "../../src/shared/commandEnablement";
import type { Translate } from "../../src/shared/i18n";
import type { GlossaryAtom, GlossaryEntry } from "../../src/shared/glossary";
import { glossaryCommandIds } from "../../src/renderer/glossaryCommands";
import {
  CommandPalette,
  type CommandPaletteProps
} from "../../src/renderer/CommandPalette";
import type { CommandPaletteFooterDetailSettings } from "../../src/shared/settings";

const translate: Translate = (key, values) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

const footerDetailEnabled: CommandPaletteFooterDetailSettings = {
  enable: true,
  marquee: { delay: 2000, speed: 40 }
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

let atomSeq = 0;

function atom(overrides: Partial<GlossaryAtom> = {}): GlossaryAtom {
  atomSeq += 1;
  return {
    id: `atom-${atomSeq}`,
    entryId: "entry-1",
    sortOrder: 0,
    value: "オーダー",
    matchFlags: 0,
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function entry(overrides: Partial<GlossaryEntry> = {}): GlossaryEntry {
  return {
    id: "entry-1",
    description: "",
    atoms: [atom({ entryId: overrides.id ?? "entry-1" })],
    tags: [],
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function buildRegistry(): CommandRegistry {
  const registry = new CommandRegistry();
  registry.register({
    id: defineCommandId("test.palette.save"),
    title: "Save",
    execute: () => undefined,
    isEnabled: () => true
  });
  return registry;
}

function baseProps(
  overrides: Partial<CommandPaletteProps> = {}
): CommandPaletteProps {
  return {
    commandRegistry: buildRegistry(),
    translate,
    isComposing: () => false,
    commandContext: {} as CommandContext,
    onExecuteCommand: vi.fn(),
    onBlockedCommand: vi.fn(),
    onClose: vi.fn(),
    initialInputValue: "@",
    footerDetailSettings: footerDetailEnabled,
    ...overrides
  };
}

function render(props: CommandPaletteProps): void {
  act(() => {
    root.render(React.createElement(CommandPalette, props));
  });
}

function inputEl(): HTMLInputElement {
  return container.querySelector<HTMLInputElement>(".commandPaletteInput")!;
}

function optionEls(): HTMLLIElement[] {
  return Array.from(
    container.querySelectorAll<HTMLLIElement>('li[role="option"]')
  );
}

function selectedOptionEl(): HTMLLIElement | null {
  return (
    container.querySelector<HTMLLIElement>(
      'li[role="option"][aria-selected="true"]'
    ) ?? null
  );
}

function footerStatusText(): string | null {
  return (
    container.querySelector<HTMLElement>(".commandPaletteFooterStatusText")
      ?.textContent ?? null
  );
}

function type(value: string): void {
  act(() => {
    const field = inputEl();
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    nativeSetter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function pressKey(
  key: string,
  opts: { isComposing?: boolean; keyCode?: number } = {}
): void {
  act(() => {
    const event = new window.KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true
    });
    if (opts.isComposing) {
      Object.defineProperty(event, "isComposing", { get: () => true });
    }
    if (opts.keyCode !== undefined) {
      Object.defineProperty(event, "keyCode", { get: () => opts.keyCode });
    }
    inputEl().dispatchEvent(event);
  });
}

describe("Command Palette `@` glossary-jump mode (#142)", () => {
  it("enters glossary-jump mode on `@` / `＠` - a listbox, not the reserved placeholder", () => {
    render(baseProps({ initialInputValue: "＠" }));

    expect(
      container.querySelector(".commandPaletteReservedPlaceholder")
    ).toBeNull();
    expect(container.querySelector('ul[role="listbox"]')).not.toBeNull();
  });

  it("#142.1: shows `open Glossary Manager` as row 1, then every glossary form, for an empty (or whitespace-only) query", () => {
    render(
      baseProps({
        initialInputValue: "@",
        glossaryEntries: [
          entry({
            id: "e1",
            atoms: [atom({ entryId: "e1", value: "第一" })]
          }),
          entry({
            id: "e2",
            atoms: [atom({ entryId: "e2", value: "第二" })]
          })
        ]
      })
    );

    const rows = optionEls();
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain(
      "commandPalette.glossaryJump.openManager"
    );
    expect(
      rows[1].querySelector(".commandPaletteItemPrimary")!.textContent
    ).toBe("第一");
    expect(
      rows[2].querySelector(".commandPaletteItemPrimary")!.textContent
    ).toBe("第二");
    // Manager row is selected by default.
    expect(selectedOptionEl()).toBe(rows[0]);

    type("@   ");
    expect(optionEls()).toHaveLength(3);
    expect(optionEls()[0].textContent).toContain(
      "commandPalette.glossaryJump.openManager"
    );
  });

  it("#142.1: no glossary data - empty query shows only the `open Glossary Manager` row, no crash", () => {
    render(baseProps({ initialInputValue: "@", glossaryEntries: [] }));

    const rows = optionEls();
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain(
      "commandPalette.glossaryJump.openManager"
    );
    expect(container.textContent).not.toContain(
      "commandPalette.glossaryJump.noResults"
    );
  });

  it("#142.1: empty-query browse candidates follow Entry array order, then each entry's own Atom sortOrder", () => {
    render(
      baseProps({
        initialInputValue: "@",
        glossaryEntries: [
          entry({
            id: "e-second",
            atoms: [
              atom({ entryId: "e-second", sortOrder: 0, value: "二番目A" }),
              atom({ entryId: "e-second", sortOrder: 1, value: "二番目B" })
            ]
          }),
          entry({
            id: "e-first",
            atoms: [atom({ entryId: "e-first", sortOrder: 0, value: "一番目" })]
          })
        ]
      })
    );

    const primaries = optionEls()
      .slice(1)
      .map(
        (row) => row.querySelector(".commandPaletteItemPrimary")!.textContent
      );
    expect(primaries).toEqual(["二番目A", "二番目B", "一番目"]);
  });

  it("executes the `open Glossary Manager` row on Enter and on click", () => {
    const onExecuteCommand = vi.fn();
    render(
      baseProps({
        initialInputValue: "@",
        glossaryEntries: [entry()],
        onExecuteCommand
      })
    );

    pressKey("Enter");
    expect(onExecuteCommand).toHaveBeenCalledWith(
      glossaryCommandIds.manageEntries
    );

    onExecuteCommand.mockClear();
    act(() => {
      optionEls()[0].dispatchEvent(
        new window.MouseEvent("mousedown", { bubbles: true, cancelable: true })
      );
      optionEls()[0].click();
    });
    expect(onExecuteCommand).toHaveBeenCalledWith(
      glossaryCommandIds.manageEntries
    );
  });

  it("#142.1: browses past the manager row with ArrowDown and opens the selected form's parent entry", () => {
    const onExecuteCommand = vi.fn();
    render(
      baseProps({
        initialInputValue: "@",
        glossaryEntries: [
          entry({ id: "e1", atoms: [atom({ entryId: "e1", value: "第一" })] }),
          entry({ id: "e2", atoms: [atom({ entryId: "e2", value: "第二" })] })
        ],
        onExecuteCommand
      })
    );

    pressKey("ArrowDown");
    expect(selectedOptionEl()!.querySelector(".commandPaletteItemPrimary")!.textContent).toBe(
      "第一"
    );
    pressKey("Enter");
    expect(onExecuteCommand).toHaveBeenCalledWith(
      glossaryCommandIds.openEntry,
      "e1"
    );

    onExecuteCommand.mockClear();
    act(() => {
      optionEls()[2].dispatchEvent(
        new window.MouseEvent("mousedown", { bubbles: true, cancelable: true })
      );
      optionEls()[2].click();
    });
    expect(onExecuteCommand).toHaveBeenCalledWith(
      glossaryCommandIds.openEntry,
      "e2"
    );
  });

  it("prefix-matches registered forms across entries and renders a 2-row candidate", () => {
    render(
      baseProps({
        initialInputValue: "@オーダ",
        glossaryEntries: [
          entry({
            id: "e1",
            atoms: [atom({ entryId: "e1", value: "オーダーメイド" })]
          }),
          entry({
            id: "e2",
            atoms: [atom({ entryId: "e2", value: "別の語" })]
          })
        ]
      })
    );

    expect(optionEls()).toHaveLength(1);
    const primary = optionEls()[0].querySelector(".commandPaletteItemPrimary")!;
    const secondary = optionEls()[0].querySelector(
      ".commandPaletteItemSecondary"
    )!;

    expect(primary.textContent).toBe("オーダーメイド");
    expect(secondary.textContent).toContain(
      "commandPalette.glossaryJump.entryLabel"
    );

    const mark = primary.querySelector("mark.commandPaletteMatch")!;
    expect(mark.textContent).toBe("オーダ");
  });

  it("#142.1: a non-empty query never shows the `open Glossary Manager` row", () => {
    render(
      baseProps({
        initialInputValue: "@オーダ",
        glossaryEntries: [entry({ atoms: [atom({ value: "オーダーメイド" })] })]
      })
    );

    expect(container.textContent).not.toContain(
      "commandPalette.glossaryJump.openManager"
    );
  });

  it("trims leading whitespace after the prefix but preserves it inside the query", () => {
    render(
      baseProps({
        initialInputValue: "@ オーダ",
        glossaryEntries: [
          entry({ atoms: [atom({ value: "オーダーメイド" })] })
        ]
      })
    );

    expect(optionEls()).toHaveLength(1);
  });

  it("is prefix-only and case-insensitive for Latin forms", () => {
    render(
      baseProps({
        initialInputValue: "@ord",
        glossaryEntries: [entry({ atoms: [atom({ value: "Order" })] })]
      })
    );
    expect(optionEls()).toHaveLength(1);

    type("@rde");
    expect(optionEls()).toHaveLength(0);
  });

  it("does not inject HTML from the atom value", () => {
    render(
      baseProps({
        initialInputValue: "@<img",
        glossaryEntries: [
          entry({ atoms: [atom({ value: "<img src=x onerror=1>" })] })
        ]
      })
    );

    const primary = optionEls()[0].querySelector(
      ".commandPaletteItemPrimary"
    )!;
    expect(primary.querySelector("img")).toBeNull();
    expect(primary.innerHTML).toContain("&lt;img");
  });

  it("shows the no-matching-forms copy when a query matches nothing", () => {
    render(
      baseProps({
        initialInputValue: "@zzz",
        glossaryEntries: [entry({ atoms: [atom({ value: "オーダー" })] })]
      })
    );

    expect(optionEls()).toHaveLength(0);
    expect(container.textContent).toContain(
      "commandPalette.glossaryJump.noResults"
    );
    expect(container.textContent).not.toContain(
      "commandPalette.glossaryJump.openManager"
    );
  });

  it("executes the selected form on Enter and on click, opening its parent entry", () => {
    const onExecuteCommand = vi.fn();
    render(
      baseProps({
        initialInputValue: "@オーダ",
        glossaryEntries: [
          entry({
            id: "e1",
            atoms: [atom({ entryId: "e1", value: "オーダーA" })]
          }),
          entry({
            id: "e2",
            atoms: [atom({ entryId: "e2", value: "オーダーB" })]
          })
        ],
        onExecuteCommand
      })
    );

    pressKey("ArrowDown");
    pressKey("Enter");
    expect(onExecuteCommand).toHaveBeenCalledWith(
      glossaryCommandIds.openEntry,
      "e2"
    );

    onExecuteCommand.mockClear();
    act(() => {
      optionEls()[0].dispatchEvent(
        new window.MouseEvent("mousedown", { bubbles: true, cancelable: true })
      );
      optionEls()[0].click();
    });
    expect(onExecuteCommand).toHaveBeenCalledWith(
      glossaryCommandIds.openEntry,
      "e1"
    );
  });

  it("does not execute a form during IME composition", () => {
    const onExecuteCommand = vi.fn();
    render(
      baseProps({
        initialInputValue: "@オーダ",
        glossaryEntries: [entry({ atoms: [atom({ value: "オーダー" })] })],
        onExecuteCommand
      })
    );

    pressKey("Enter", { isComposing: true });
    pressKey("Enter", { keyCode: 229 });

    expect(onExecuteCommand).not.toHaveBeenCalled();
  });

  it("shows the persistent footer help text regardless of query state", () => {
    render(
      baseProps({
        initialInputValue: "@",
        glossaryEntries: [entry({ atoms: [atom({ value: "オーダー" })] })]
      })
    );
    expect(footerStatusText()).toContain(
      "commandPalette.glossaryJump.footer"
    );

    type("@zzz");
    expect(footerStatusText()).toContain(
      "commandPalette.glossaryJump.footer"
    );
  });

  it("leaves the sibling modes untouched", () => {
    const onExecuteCommand = vi.fn();
    const props = baseProps({
      initialInputValue: ">",
      glossaryEntries: [entry({ atoms: [atom({ value: "オーダー" })] })],
      onExecuteCommand
    });

    render(props);
    expect(container.querySelector('ul[role="listbox"]')).not.toBeNull();
    expect(container.textContent).toContain("Save");

    type(":abc");
    expect(container.textContent).toContain("commandPalette.lineJump.invalid");

    expect(onExecuteCommand).not.toHaveBeenCalled();
  });

  it("never calls File Explorer reveal / selection sync from the palette", () => {
    const source = readFileSync("src/renderer/CommandPalette.tsx", "utf8");
    for (const forbidden of [
      "revealFileExplorer",
      "setFileExplorerRevealRequest",
      "fileExplorerSelection"
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
