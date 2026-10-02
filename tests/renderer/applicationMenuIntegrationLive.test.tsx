// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationMenuBar } from "../../src/renderer/ApplicationMenuBar";
import { useApplicationMenuIntegration } from "../../src/renderer/applicationMenuIntegration";
import {
  getEffectiveKeybindingRows,
  resetEffectiveKeybindings,
  setEffectiveKeybindings
} from "../../src/renderer/keybindings/effectiveKeybindingStore";
import { getRuntimePlatform } from "../../src/renderer/platformModifier";
import { editorCommandIds } from "../../src/shared/commandIds";
import {
  CommandRegistry,
  defineCommandId
} from "../../src/shared/commandRegistry";
import { t, type Translate } from "../../src/shared/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const translate: Translate = (key, values) => t("en", key, values);

let container: HTMLDivElement;
let root: Root;
const invokeNativeRole = vi.fn(async () => true);
const toggleFullscreen = vi.fn(async () => true);

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  (window as unknown as { pergamum: unknown }).pergamum = {
    platform: "windows",
    applicationMenu: { invokeNativeRole },
    window: { toggleFullscreen }
  };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  resetEffectiveKeybindings();
  delete (window as unknown as { pergamum?: unknown }).pergamum;
  vi.clearAllMocks();
});

function Harness(props: {
  registry: CommandRegistry;
  executed: string[];
}) {
  const integration = useApplicationMenuIntegration({
    commandRegistry: props.registry,
    commandContext: {},
    executeMenuCommand: (commandId) => props.executed.push(commandId)
  });

  return (
    <ApplicationMenuBar
      platform="windows"
      translate={translate}
      onInvoke={integration.onInvoke}
      getShortcutLabel={integration.getShortcutLabel}
      isDisabled={integration.isDisabled}
    />
  );
}

function registryWith(
  commands: Record<string, { enabled: boolean }>
): CommandRegistry {
  const registry = new CommandRegistry();
  for (const [id, state] of Object.entries(commands)) {
    registry.register({
      id: defineCommandId(id),
      title: id,
      isEnabled: () => state.enabled,
      execute: () => undefined
    });
  }
  return registry;
}

const click = (element: Element) =>
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

function item(label: string): HTMLElement {
  return Array.from(
    container.querySelectorAll<HTMLElement>(".applicationMenuItem")
  ).find(
    (candidate) =>
      candidate.querySelector(":scope > .applicationMenuItemLabel")
        ?.textContent === label
  )!;
}

const openFile = () =>
  click(
    Array.from(
      container.querySelectorAll<HTMLElement>(".applicationMenuBarItem")
    ).find((button) => button.textContent === "File")!
  );

describe("Renderer menu integration in React (#664)", () => {
  it("click executes the command through the injected shared handler once", () => {
    const executed: string[] = [];
    act(() => {
      root.render(
        <Harness
          registry={registryWith({ [editorCommandIds.saveDocument]: { enabled: true } })}
          executed={executed}
        />
      );
    });
    openFile();

    click(item("Save"));

    expect(executed).toEqual([editorCommandIds.saveDocument]);
  });

  it("a command the registry reports disabled is shown disabled and not executed", () => {
    const executed: string[] = [];
    act(() => {
      root.render(
        <Harness
          registry={registryWith({
            [editorCommandIds.saveDocument]: { enabled: false },
            [editorCommandIds.saveAll]: { enabled: true }
          })}
          executed={executed}
        />
      );
    });
    openFile();

    expect(item("Save").getAttribute("aria-disabled")).toBe("true");
    click(item("Save"));
    expect(executed).toEqual([]);
    // An unregistered command is disabled, not silently enabled.
    expect(item("Create Project...").getAttribute("aria-disabled")).toBe("true");
  });

  it("a native edit role click goes to the allowlisted bridge and not to the command route", () => {
    const executed: string[] = [];
    act(() => {
      root.render(
        <Harness
          registry={registryWith({ [editorCommandIds.copySelection]: { enabled: true } })}
          executed={executed}
        />
      );
    });
    click(
      Array.from(
        container.querySelectorAll<HTMLElement>(".applicationMenuBarItem")
      ).find((button) => button.textContent === "Edit")!
    );

    click(item("Copy"));

    expect(invokeNativeRole).toHaveBeenCalledTimes(1);
    expect(invokeNativeRole).toHaveBeenCalledWith("copy");
    expect(executed).toEqual([]);
  });

  it("Toggle Full Screen uses the existing window API", () => {
    act(() => {
      root.render(<Harness registry={registryWith({})} executed={[]} />);
    });
    click(
      Array.from(
        container.querySelectorAll<HTMLElement>(".applicationMenuBarItem")
      ).find((button) => button.textContent === "View")!
    );

    click(item("Toggle Full Screen"));

    expect(toggleFullscreen).toHaveBeenCalledTimes(1);
    expect(invokeNativeRole).not.toHaveBeenCalled();
  });

  it("updates the shortcut label live when the effective keybindings change, even while open", () => {
    act(() => {
      root.render(
        <Harness
          registry={registryWith({ [editorCommandIds.saveDocument]: { enabled: true } })}
          executed={[]}
        />
      );
    });
    openFile();
    const label = () =>
      item("Save").querySelector(".applicationMenuItemShortcut")?.textContent;
    expect(label()).toBe("Ctrl+S");

    const platform = getRuntimePlatform();
    const rows = getEffectiveKeybindingRows(platform).map((row) =>
      row.command === editorCommandIds.saveDocument
        ? { ...row, key: "Mod-Alt-s" }
        : row
    );
    act(() => setEffectiveKeybindings(platform, rows));

    expect(label()).toBe("Ctrl+Alt+S");

    // Unbound: no label, and no default fallback.
    act(() =>
      setEffectiveKeybindings(
        platform,
        rows.map((row) =>
          row.command === editorCommandIds.saveDocument
            ? { ...row, key: null }
            : row
        )
      )
    );
    expect(label()).toBeUndefined();
  });
});
