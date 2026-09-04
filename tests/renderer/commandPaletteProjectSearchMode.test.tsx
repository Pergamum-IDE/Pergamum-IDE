// @vitest-environment happy-dom
//
// #384: interactive coverage for the Command Palette `%` / `％` project
// full-text search shortcut mode. Drives the real widget so prefix detection,
// the single action candidate, the footer copy, and Enter / click execution
// are exercised together. Mirrors commandPaletteHeadingJumpMode.test.tsx.
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandRegistry, defineCommandId } from "../../src/shared/commandRegistry";
import type { CommandContext } from "../../src/shared/commandEnablement";
import type { Translate } from "../../src/shared/i18n";
import {
  CommandPalette,
  type CommandPaletteProps
} from "../../src/renderer/CommandPalette";
import type { CommandPaletteFooterDetailSettings } from "../../src/shared/settings";

const translate: Translate = (key, values) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

const footerDetail: CommandPaletteFooterDetailSettings = {
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
    initialInputValue: "%",
    footerDetailSettings: footerDetail,
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

function pressEnter(): void {
  act(() => {
    inputEl().dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true
      })
    );
  });
}

describe("Command Palette `%` project-search mode (#384)", () => {
  it("enters search mode on a bare `%` — one action row, not the reserved placeholder", () => {
    render(baseProps({ initialInputValue: "%" }));
    expect(
      container.querySelector(".commandPaletteReservedPlaceholder")
    ).toBeNull();
    expect(optionEls()).toHaveLength(1);
  });

  it("enters search mode on the full-width `％`", () => {
    render(baseProps({ initialInputValue: "％メイド" }));
    expect(optionEls()).toHaveLength(1);
  });

  it("shows the query candidate title for `%query`", () => {
    render(baseProps({ initialInputValue: "%メイド" }));
    expect(optionEls()[0].textContent).toContain(
      'commandPalette.projectSearch.candidate:{"query":"メイド"}'
    );
  });

  it("shows the open-search title for a bare `%`", () => {
    render(baseProps({ initialInputValue: "%" }));
    expect(optionEls()[0].textContent).toContain(
      "commandPalette.projectSearch.open"
    );
  });

  it("trims whitespace between the prefix and the query for the candidate", () => {
    render(baseProps({ initialInputValue: "％ メイド" }));
    expect(optionEls()[0].textContent).toContain(
      'commandPalette.projectSearch.candidate:{"query":"メイド"}'
    );
  });

  it("shows the project-search footer copy", () => {
    render(baseProps({ initialInputValue: "%メイド" }));
    expect(footerStatusText()).toBe("commandPalette.projectSearch.footer");
  });

  it("Enter runs onExecuteProjectSearch with the trimmed query", () => {
    const onExecuteProjectSearch = vi.fn();
    render(baseProps({ initialInputValue: "%", onExecuteProjectSearch }));

    type("%  メイド  ");
    pressEnter();

    expect(onExecuteProjectSearch).toHaveBeenCalledTimes(1);
    expect(onExecuteProjectSearch).toHaveBeenCalledWith("メイド");
  });

  it("click on the row also runs onExecuteProjectSearch", () => {
    const onExecuteProjectSearch = vi.fn();
    render(
      baseProps({ initialInputValue: "％ジャンヌ", onExecuteProjectSearch })
    );

    act(() => {
      optionEls()[0].click();
    });

    expect(onExecuteProjectSearch).toHaveBeenCalledWith("ジャンヌ");
  });

  it("a bare `%` executes with an empty query", () => {
    const onExecuteProjectSearch = vi.fn();
    render(baseProps({ initialInputValue: "% ", onExecuteProjectSearch }));

    pressEnter();

    expect(onExecuteProjectSearch).toHaveBeenCalledWith("");
  });

  it("does not turn `>` command mode into a search footer", () => {
    render(baseProps({ initialInputValue: ">" }));
    expect(footerStatusText()).not.toBe("commandPalette.projectSearch.footer");
  });
});
