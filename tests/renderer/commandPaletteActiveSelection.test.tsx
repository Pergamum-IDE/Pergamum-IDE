// @vitest-environment happy-dom
//
// #316: interactive coverage for the Command Palette command-mode
// active-selection model. Unlike CommandPalette.test.tsx (SSR / source
// assertions only), this file drives the real widget with keyboard and
// pointer events so the *derived* active entry, its ARIA wiring, and the
// ENTER execution target are exercised together.
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectDocument } from "../../src/shared/api";
import { CommandRegistry, defineCommandId } from "../../src/shared/commandRegistry";
import type { CommandContext } from "../../src/shared/commandEnablement";
import { t, type Translate } from "../../src/shared/i18n";
import {
  CommandPalette,
  type CommandPaletteProps
} from "../../src/renderer/CommandPalette";

const translate: Translate = (key) => key;
const translateEn: Translate = (key, values) => t("en", key, values);

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

const alphaId = defineCommandId("test.palette.alpha");
const betaId = defineCommandId("test.palette.beta");
const gammaId = defineCommandId("test.palette.gamma");
const deltaId = defineCommandId("test.palette.delta");

function projectDocument(relativePath: string): ProjectDocument {
  return {
    relativePath,
    name: relativePath.split(/[\\/]/).pop() ?? relativePath
  };
}

function buildRegistry(): CommandRegistry {
  const registry = new CommandRegistry();

  registry.register({
    id: alphaId,
    title: "Alpha Command",
    execute: () => undefined,
    isEnabled: () => true
  });
  registry.register({
    id: betaId,
    title: "Beta Command",
    execute: () => undefined,
    isEnabled: () => true
  });
  registry.register({
    id: gammaId,
    title: "Gamma Command",
    execute: () => undefined,
    isEnabled: () => false
  });
  registry.register({
    id: deltaId,
    title: "Delta Command",
    execute: () => undefined,
    isEnabled: () => true
  });

  return registry;
}

const PAGED_COMMAND_COUNT = 12;

function pagedCommandId(index: number) {
  return defineCommandId(
    `test.paged.cmd${String(index).padStart(2, "0")}`
  );
}

function pagedCommandLabel(index: number): string {
  return `Paged Command ${String(index).padStart(2, "0")}`;
}

function buildPagedRegistry(): CommandRegistry {
  const registry = new CommandRegistry();

  for (let index = 0; index < PAGED_COMMAND_COUNT; index += 1) {
    registry.register({
      id: pagedCommandId(index),
      title: pagedCommandLabel(index),
      execute: () => undefined,
      isEnabled: () => true
    });
  }

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
    initialInputValue: ">",
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

function activeDescendantEl(): HTMLElement | null {
  const id = inputEl().getAttribute("aria-activedescendant");
  return id ? container.querySelector<HTMLElement>(`#${CSS.escape(id)}`) : null;
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

describe("Command Palette active selection (#316)", () => {
  it("resolves an active command as soon as it opens", () => {
    render(baseProps());

    const selected = selectedOptionEl();
    expect(selected).not.toBeNull();
    expect(selected!.getAttribute("aria-label")).toBe("Alpha Command");
    expect(inputEl().getAttribute("aria-activedescendant")).toBe(
      selected!.id
    );
    expect(inputEl().getAttribute("role")).toBe("combobox");
  });

  it("re-normalizes the active command after the query changes", () => {
    render(baseProps());

    type(">Beta");

    const options = optionEls();
    expect(options).toHaveLength(1);
    expect(selectedOptionEl()!.getAttribute("aria-label")).toBe(
      "Beta Command"
    );
    expect(inputEl().getAttribute("aria-activedescendant")).toBe(
      selectedOptionEl()!.id
    );
  });

  it("drops to active-none when the query matches nothing, and ENTER is a no-op", () => {
    const onExecuteCommand = vi.fn();
    render(baseProps({ onExecuteCommand }));

    type(">nomatchxyz");

    expect(optionEls()).toHaveLength(0);
    expect(selectedOptionEl()).toBeNull();
    expect(inputEl().hasAttribute("aria-activedescendant")).toBe(false);

    pressKey("Enter");
    expect(onExecuteCommand).not.toHaveBeenCalled();
  });

  it("moves the active command with ArrowDown / ArrowUp and keeps input focus", () => {
    render(baseProps());

    expect(selectedOptionEl()!.getAttribute("aria-label")).toBe(
      "Alpha Command"
    );

    pressKey("ArrowDown");
    expect(selectedOptionEl()!.getAttribute("aria-label")).toBe(
      "Beta Command"
    );

    pressKey("ArrowUp");
    expect(selectedOptionEl()!.getAttribute("aria-label")).toBe(
      "Alpha Command"
    );

    expect(document.activeElement).toBe(inputEl());
  });

  it("executes the derived active command on ENTER", () => {
    const onExecuteCommand = vi.fn();
    render(baseProps({ onExecuteCommand }));

    pressKey("ArrowDown"); // Alpha -> Beta

    pressKey("Enter");

    expect(onExecuteCommand).toHaveBeenCalledTimes(1);
    expect(onExecuteCommand).toHaveBeenCalledWith(betaId);
  });

  it("keeps the visually selected row and the ENTER execution target in lockstep", () => {
    const onExecuteCommand = vi.fn();
    render(baseProps({ onExecuteCommand }));

    pressKey("ArrowDown");
    pressKey("ArrowDown"); // Alpha -> Beta -> Gamma (disabled)
    pressKey("ArrowUp"); // -> Beta

    const selected = selectedOptionEl()!;
    expect(selected.getAttribute("aria-label")).toBe("Beta Command");
    expect(inputEl().getAttribute("aria-activedescendant")).toBe(selected.id);
    expect(activeDescendantEl()).toBe(selected);

    pressKey("Enter");
    expect(onExecuteCommand).toHaveBeenCalledWith(betaId);
  });

  it("never runs a disabled command via ENTER or click", () => {
    const onExecuteCommand = vi.fn();
    const onBlockedCommand = vi.fn();
    render(baseProps({ onExecuteCommand, onBlockedCommand }));

    pressKey("ArrowDown");
    pressKey("ArrowDown"); // -> Gamma (disabled)

    const selected = selectedOptionEl()!;
    expect(selected.getAttribute("aria-label")).toBe("Gamma Command");
    expect(selected.getAttribute("aria-disabled")).toBe("true");

    pressKey("Enter");
    expect(onExecuteCommand).not.toHaveBeenCalled();
    expect(onBlockedCommand).toHaveBeenLastCalledWith(gammaId);

    act(() => {
      selected.click();
    });
    expect(onExecuteCommand).not.toHaveBeenCalled();
    expect(onBlockedCommand).toHaveBeenLastCalledWith(gammaId);
  });

  it("syncs the active command to the hovered row (single highlight)", () => {
    render(baseProps());

    const deltaRow = optionEls()[3];
    act(() => {
      deltaRow.dispatchEvent(new window.MouseEvent("mousemove", { bubbles: true }));
    });

    expect(
      container.querySelectorAll('li[role="option"][aria-selected="true"]')
    ).toHaveLength(1);
    expect(selectedOptionEl()!.getAttribute("aria-label")).toBe(
      "Delta Command"
    );
    expect(inputEl().getAttribute("aria-activedescendant")).toBe(
      selectedOptionEl()!.id
    );
  });

  describe("IME composition guard", () => {
    it("ignores ENTER while a composition is in progress, then runs it once composition ends", () => {
      const onExecuteCommand = vi.fn();
      render(baseProps({ onExecuteCommand }));

      pressKey("Enter", { isComposing: true });
      expect(onExecuteCommand).not.toHaveBeenCalled();

      pressKey("Enter", { keyCode: 229 });
      expect(onExecuteCommand).not.toHaveBeenCalled();

      pressKey("Enter");
      expect(onExecuteCommand).toHaveBeenCalledWith(alphaId);
    });

    it("ignores ArrowDown / ArrowUp while a composition is in progress", () => {
      render(baseProps());

      pressKey("ArrowDown", { isComposing: true });
      expect(selectedOptionEl()!.getAttribute("aria-label")).toBe(
        "Alpha Command"
      );

      pressKey("ArrowDown", { keyCode: 229 });
      expect(selectedOptionEl()!.getAttribute("aria-label")).toBe(
        "Alpha Command"
      );

      pressKey("ArrowDown");
      expect(selectedOptionEl()!.getAttribute("aria-label")).toBe(
        "Beta Command"
      );
    });

    it("also honors the app-wide isComposing() guard", () => {
      const onExecuteCommand = vi.fn();
      render(baseProps({ onExecuteCommand, isComposing: () => true }));

      pressKey("Enter");
      pressKey("ArrowDown");

      expect(onExecuteCommand).not.toHaveBeenCalled();
      expect(selectedOptionEl()!.getAttribute("aria-label")).toBe(
        "Alpha Command"
      );
    });
  });

  it("seeds the active selection from a non-empty initialInputValue query (regression)", () => {
    const onExecuteCommand = vi.fn();
    render(baseProps({ onExecuteCommand, initialInputValue: ">Delta" }));

    // The very first render must already point the active selection at the
    // filtered list, not the unfiltered one — so the first ENTER, with no
    // interaction at all, runs the command the user can see selected.
    const options = optionEls();
    expect(options).toHaveLength(1);
    expect(selectedOptionEl()!.getAttribute("aria-label")).toBe(
      "Delta Command"
    );
    expect(inputEl().getAttribute("aria-activedescendant")).toBe(
      selectedOptionEl()!.id
    );

    pressKey("Enter");
    expect(onExecuteCommand).toHaveBeenCalledTimes(1);
    expect(onExecuteCommand).toHaveBeenCalledWith(deltaId);
  });

  describe("focus model — input-owned combobox/listbox (#316 follow-up)", () => {
    it("keeps the listbox and its option rows out of the tab order", () => {
      render(baseProps());

      const listbox = container.querySelector<HTMLElement>(
        'ul[role="listbox"]'
      )!;
      expect(listbox.hasAttribute("tabindex")).toBe(false);

      for (const option of optionEls()) {
        expect(option.hasAttribute("tabindex")).toBe(false);
      }
    });

    it("does not let a row mouse down steal DOM focus from the input", () => {
      render(baseProps());
      inputEl().focus();

      const row = optionEls()[1];
      const mouseDown = new window.MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true
      });
      act(() => {
        row.dispatchEvent(mouseDown);
      });

      expect(mouseDown.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(inputEl());
    });

    it("runs the clicked command while DOM focus stays on the input", () => {
      const onExecuteCommand = vi.fn();
      render(baseProps({ onExecuteCommand }));
      inputEl().focus();

      const row = optionEls()[1];
      act(() => {
        row.dispatchEvent(
          new window.MouseEvent("mousedown", { bubbles: true, cancelable: true })
        );
        row.dispatchEvent(new window.MouseEvent("mouseup", { bubbles: true }));
        row.click();
      });

      expect(onExecuteCommand).toHaveBeenCalledWith(betaId);
      expect(document.activeElement).toBe(inputEl());
    });

    it("keeps DOM focus on the input when a row is hovered", () => {
      render(baseProps());
      inputEl().focus();

      act(() => {
        optionEls()[2].dispatchEvent(
          new window.MouseEvent("mousemove", { bubbles: true })
        );
      });

      expect(document.activeElement).toBe(inputEl());
    });
  });

  describe("paged navigation — Home / End / PageUp / PageDown (#316 follow-up)", () => {
    function renderPaged(
      overrides: Partial<CommandPaletteProps> = {}
    ): void {
      render(
        baseProps({
          commandRegistry: buildPagedRegistry(),
          initialInputValue: ">Paged",
          ...overrides
        })
      );
    }

    it("PageDown jumps down by a page and clamps at the end", () => {
      renderPaged();
      expect(selectedOptionEl()!.getAttribute("aria-label")).toBe(
        pagedCommandLabel(0)
      );

      pressKey("PageDown");
      expect(selectedOptionEl()!.getAttribute("aria-label")).toBe(
        pagedCommandLabel(8)
      );

      pressKey("PageDown");
      expect(selectedOptionEl()!.getAttribute("aria-label")).toBe(
        pagedCommandLabel(PAGED_COMMAND_COUNT - 1)
      );
    });

    it("PageUp jumps up by a page and clamps at the start", () => {
      renderPaged();
      pressKey("End");
      expect(selectedOptionEl()!.getAttribute("aria-label")).toBe(
        pagedCommandLabel(PAGED_COMMAND_COUNT - 1)
      );

      pressKey("PageUp");
      expect(selectedOptionEl()!.getAttribute("aria-label")).toBe(
        pagedCommandLabel(PAGED_COMMAND_COUNT - 1 - 8)
      );

      pressKey("PageUp");
      expect(selectedOptionEl()!.getAttribute("aria-label")).toBe(
        pagedCommandLabel(0)
      );
    });

    it("Home moves to the first candidate, End to the last", () => {
      renderPaged();

      pressKey("PageDown"); // away from the top first
      pressKey("Home");
      expect(selectedOptionEl()!.getAttribute("aria-label")).toBe(
        pagedCommandLabel(0)
      );

      pressKey("End");
      expect(selectedOptionEl()!.getAttribute("aria-label")).toBe(
        pagedCommandLabel(PAGED_COMMAND_COUNT - 1)
      );
    });

    it("keeps aria-activedescendant, the selected row, and the ENTER target in lockstep after a paged move", () => {
      const onExecuteCommand = vi.fn();
      renderPaged({ onExecuteCommand });

      pressKey("End");

      const selected = selectedOptionEl()!;
      expect(selected.getAttribute("aria-label")).toBe(
        pagedCommandLabel(PAGED_COMMAND_COUNT - 1)
      );
      expect(inputEl().getAttribute("aria-activedescendant")).toBe(selected.id);
      expect(activeDescendantEl()).toBe(selected);
      expect(document.activeElement).toBe(inputEl());

      pressKey("Enter");
      expect(onExecuteCommand).toHaveBeenCalledWith(
        pagedCommandId(PAGED_COMMAND_COUNT - 1)
      );
    });

    it("does not move the selection on paged keys during IME composition", () => {
      renderPaged();

      pressKey("PageDown", { isComposing: true });
      expect(selectedOptionEl()!.getAttribute("aria-label")).toBe(
        pagedCommandLabel(0)
      );

      pressKey("End", { keyCode: 229 });
      expect(selectedOptionEl()!.getAttribute("aria-label")).toBe(
        pagedCommandLabel(0)
      );

      pressKey("PageDown");
      expect(selectedOptionEl()!.getAttribute("aria-label")).toBe(
        pagedCommandLabel(8)
      );
    });

    it("does not advertise the paged keys in the footer hints", () => {
      render(
        baseProps({
          translate: translateEn,
          commandRegistry: buildPagedRegistry(),
          initialInputValue: ">Paged"
        })
      );

      const hints = container.querySelector<HTMLElement>(
        ".commandPaletteFooterHints"
      )!;
      expect(hints.textContent).toBe("↑↓EnterEsc");
      for (const token of ["Page", "PageUp", "PageDown", "Home", "End"]) {
        expect(hints.textContent ?? "").not.toContain(token);
      }
    });
  });
});

describe("Command Palette project file quick open (#143)", () => {
  it("shows no candidates for no-prefix input when no Project is open", () => {
    const onOpenProjectFileQuickOpenCandidate = vi.fn();
    render(
      baseProps({
        initialInputValue: "chapter",
        onOpenProjectFileQuickOpenCandidate
      })
    );

    expect(optionEls()).toHaveLength(0);
    expect(selectedOptionEl()).toBeNull();

    pressKey("Enter");
    expect(onOpenProjectFileQuickOpenCandidate).not.toHaveBeenCalled();
  });

  it("executes the selected Project file candidate on ENTER", () => {
    const onOpenProjectFileQuickOpenCandidate = vi.fn();
    render(
      baseProps({
        initialInputValue: "chap",
        projectFileQuickOpenDocuments: [
          projectDocument("drafts/chapter-01.md"),
          projectDocument("drafts/chapter-02.md")
        ],
        onOpenProjectFileQuickOpenCandidate
      })
    );

    expect(optionEls()).toHaveLength(2);
    expect(selectedOptionEl()!.textContent).toContain("chapter-01.md");

    pressKey("ArrowDown");
    expect(selectedOptionEl()!.textContent).toContain("chapter-02.md");

    pressKey("Enter");
    expect(onOpenProjectFileQuickOpenCandidate).toHaveBeenCalledTimes(1);
    expect(onOpenProjectFileQuickOpenCandidate).toHaveBeenCalledWith(
      "drafts/chapter-02.md"
    );
  });

  it("executes the clicked Project file candidate while keeping input focus", () => {
    const onOpenProjectFileQuickOpenCandidate = vi.fn();
    render(
      baseProps({
        initialInputValue: "chap",
        projectFileQuickOpenDocuments: [
          projectDocument("drafts/chapter-01.md")
        ],
        onOpenProjectFileQuickOpenCandidate
      })
    );
    inputEl().focus();

    const row = optionEls()[0];
    act(() => {
      row.dispatchEvent(
        new window.MouseEvent("mousedown", { bubbles: true, cancelable: true })
      );
      row.click();
    });

    expect(onOpenProjectFileQuickOpenCandidate).toHaveBeenCalledWith(
      "drafts/chapter-01.md"
    );
    expect(document.activeElement).toBe(inputEl());
  });

  it("does not execute a Project file candidate during IME composition", () => {
    const onOpenProjectFileQuickOpenCandidate = vi.fn();
    render(
      baseProps({
        initialInputValue: "chap",
        projectFileQuickOpenDocuments: [
          projectDocument("drafts/chapter-01.md")
        ],
        onOpenProjectFileQuickOpenCandidate
      })
    );

    pressKey("Enter", { isComposing: true });
    pressKey("Enter", { keyCode: 229 });

    expect(onOpenProjectFileQuickOpenCandidate).not.toHaveBeenCalled();
  });

  it("keeps existing command-prefix execution on the command path", () => {
    const onExecuteCommand = vi.fn();
    const onOpenProjectFileQuickOpenCandidate = vi.fn();
    render(
      baseProps({
        initialInputValue: ">Beta",
        projectFileQuickOpenDocuments: [
          projectDocument("Beta Command.md")
        ],
        onExecuteCommand,
        onOpenProjectFileQuickOpenCandidate
      })
    );

    expect(optionEls()).toHaveLength(1);

    pressKey("Enter");

    expect(onExecuteCommand).toHaveBeenCalledWith(betaId);
    expect(onOpenProjectFileQuickOpenCandidate).not.toHaveBeenCalled();
  });

  it("uses recent Project file candidates for an empty no-prefix input", () => {
    const onOpenProjectFileQuickOpenCandidate = vi.fn();
    render(
      baseProps({
        initialInputValue: "",
        projectFileQuickOpenDocuments: [projectDocument("all.md")],
        recentProjectFileQuickOpenDocuments: [
          projectDocument("recent-01.md"),
          projectDocument("recent-02.md")
        ],
        onOpenProjectFileQuickOpenCandidate
      })
    );

    expect(optionEls()).toHaveLength(2);
    expect(selectedOptionEl()!.textContent).toContain("recent-01.md");

    pressKey("Enter");
    expect(onOpenProjectFileQuickOpenCandidate).toHaveBeenCalledWith(
      "recent-01.md"
    );
  });
});
