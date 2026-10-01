// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApplyKeybindingChangeResult,
  GetKeyboardShortcutItemsResult
} from "../../src/shared/api";
import { t, type Language, type Translate } from "../../src/shared/i18n";
import {
  listKeyboardShortcutRows,
  resolveEffectiveKeybindings,
  type UserKeybindingEntry
} from "../../src/shared/keybindings";
import { KeyboardShortcutsScreen } from "../../src/renderer/KeyboardShortcutsScreen";
import { DESTRUCTIVE_ARM_DELAY_MS } from "../../src/renderer/dialog/useArmDelay";
import {
  getEffectiveKeybindingRows,
  resetEffectiveKeybindings
} from "../../src/renderer/keybindings/effectiveKeybindingStore";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function stateFor(entries: UserKeybindingEntry[], resettable = entries.length > 0) {
  const { keybindings, diagnostics } = resolveEffectiveKeybindings({
    platform: "win32",
    userEntries: entries
  });
  return {
    keybindings,
    items: listKeyboardShortcutRows(keybindings, "win32"),
    diagnostics,
    resettable
  };
}

let container: HTMLDivElement;
let root: Root;
let changedListener: (() => void) | null = null;
const getKeyboardShortcutItems = vi.fn();
const resetAllKeybindings = vi.fn();

function installApi(initial: ReturnType<typeof stateFor>): void {
  changedListener = null;
  getKeyboardShortcutItems.mockReset().mockResolvedValue({
    platform: "win32",
    items: initial.items,
    diagnostics: initial.diagnostics,
    resettable: initial.resettable
  } satisfies GetKeyboardShortcutItemsResult);
  resetAllKeybindings.mockReset();
  (window as unknown as { pergamum: unknown }).pergamum = {
    keybindings: {
      getKeyboardShortcutItems,
      resetAllKeybindings,
      applyKeybindingChange: vi.fn(),
      setCaptureMode: vi.fn().mockResolvedValue({ ok: true }),
      onCaptureInput: () => () => undefined,
      onKeybindingsChanged: (listener: () => void) => {
        changedListener = listener;
        return () => {
          changedListener = null;
        };
      },
      openKeybindingsJsonLocation: vi.fn().mockResolvedValue({ ok: true })
    }
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function render(language: Language = "ja"): Promise<void> {
  const translate: Translate = (key, values) => t(language, key, values);
  await act(async () => {
    root.render(<KeyboardShortcutsScreen translate={translate} language={language} />);
  });
  await flush();
}

const resetButton = () =>
  container.querySelector<HTMLButtonElement>(".keyboardShortcutsResetAll")!;
const dialog = () => document.querySelector<HTMLElement>("[role=alertdialog]");
const confirmButton = () =>
  document.querySelector<HTMLButtonElement>(".keyboardShortcutsResetAllConfirm")!;
const hourglass = () => document.querySelector(".keyboardShortcutsResetAllHourglass");

async function openDialog(): Promise<void> {
  await act(async () => {
    resetButton().click();
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  resetEffectiveKeybindings();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const custom: UserKeybindingEntry[] = [{ key: "Mod-Alt-9", command: "editor.markdown.bold" }];

describe("Reset All button state (#652)", () => {
  it("is disabled with no user changes and enabled with changes", async () => {
    installApi(stateFor([]));
    await render();
    expect(resetButton().disabled).toBe(true);
    expect(resetButton().textContent).toBe("すべて既定値に戻す");

    act(() => root.unmount());
    root = createRoot(container);
    installApi(stateFor(custom));
    await render();
    expect(resetButton().disabled).toBe(false);
  });

  it("is enabled for a broken file (no entries but diagnostics) so it can be recovered", async () => {
    installApi({
      ...stateFor([], true),
      diagnostics: [{ code: "jsonParseError", severity: "error", message: "bad" }]
    });
    await render();
    expect(resetButton().disabled).toBe(false);
  });

  it("follows external changes (live reload) in both directions", async () => {
    installApi(stateFor([]));
    await render();
    expect(resetButton().disabled).toBe(true);

    getKeyboardShortcutItems.mockResolvedValue({ platform: "win32", ...stateFor(custom) });
    await act(async () => {
      changedListener?.();
    });
    await flush();
    expect(resetButton().disabled).toBe(false);

    getKeyboardShortcutItems.mockResolvedValue({ platform: "win32", ...stateFor([]) });
    await act(async () => {
      changedListener?.();
    });
    await flush();
    expect(resetButton().disabled).toBe(true);
  });

  it("English label", async () => {
    installApi(stateFor(custom));
    await render("en");
    expect(resetButton().textContent).toBe("Reset All Keybindings");
  });
});

describe("Reset All confirmation (#652)", () => {
  it("opens a confirmation first and resets nothing yet", async () => {
    installApi(stateFor(custom));
    await render();
    await openDialog();
    expect(dialog()).not.toBeNull();
    expect(dialog()!.textContent).toContain("すべてのショートカットを既定値に戻しますか？");
    expect(dialog()!.textContent).toContain("この操作は元に戻せません。");
    expect(resetAllKeybindings).not.toHaveBeenCalled();
  });

  it("keeps the confirm button disabled with an hourglass for 5 seconds, then arms it", async () => {
    installApi(stateFor(custom));
    await render();
    await openDialog();
    expect(DESTRUCTIVE_ARM_DELAY_MS).toBe(5000);
    expect(confirmButton().disabled).toBe(true);
    expect(confirmButton().getAttribute("aria-disabled")).toBe("true");
    expect(hourglass()).not.toBeNull();
    expect(hourglass()!.getAttribute("aria-hidden")).toBe("true");
    expect(confirmButton().textContent).toBe("既定値に戻す");

    await advance(4999);
    expect(confirmButton().disabled).toBe(true);
    expect(hourglass()).not.toBeNull();

    await advance(1);
    expect(confirmButton().disabled).toBe(false);
    expect(confirmButton().getAttribute("aria-disabled")).toBe("false");
    expect(hourglass()).toBeNull();
  });

  it("cannot be bypassed: clicks / activation while waiting do nothing, focus starts on Cancel", async () => {
    installApi(stateFor(custom));
    await render();
    await openDialog();
    expect(document.activeElement?.textContent).toBe("キャンセル");
    await act(async () => {
      confirmButton().click();
      // Enter / Space on a disabled button never reach its click handler.
      confirmButton().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await advance(100);
    expect(resetAllKeybindings).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();
  });

  it("Cancel closes without changes; reopening waits the full 5 seconds again", async () => {
    installApi(stateFor(custom));
    await render();
    await openDialog();
    await advance(DESTRUCTIVE_ARM_DELAY_MS);
    expect(confirmButton().disabled).toBe(false);

    const cancel = [...document.querySelectorAll<HTMLButtonElement>("[role=alertdialog] button")].find(
      (b) => b.textContent === "キャンセル"
    )!;
    await act(async () => {
      cancel.click();
    });
    expect(dialog()).toBeNull();
    expect(resetAllKeybindings).not.toHaveBeenCalled();

    await openDialog();
    expect(confirmButton().disabled).toBe(true);
    expect(hourglass()).not.toBeNull();
    await advance(4999);
    expect(confirmButton().disabled).toBe(true);
    await advance(1);
    expect(confirmButton().disabled).toBe(false);
  });

  it("Escape closes; unmounting while open leaves no timer behind", async () => {
    installApi(stateFor(custom));
    await render();
    await openDialog();
    await act(async () => {
      dialog()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(dialog()).toBeNull();

    await openDialog();
    act(() => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
    root = createRoot(container);
  });
});

describe("Reset All execution (#652)", () => {
  function successResult(): ApplyKeybindingChangeResult {
    const next = stateFor([], false);
    return {
      ok: true,
      platform: "win32",
      items: next.items,
      keybindings: next.keybindings,
      diagnostics: [],
      resettable: false
    };
  }

  async function confirmReset(): Promise<void> {
    await openDialog();
    await advance(DESTRUCTIVE_ARM_DELAY_MS);
    await act(async () => {
      confirmButton().click();
    });
    await flush();
  }

  it("calls the reset API once, refreshes the list and the effective store, disables the button", async () => {
    installApi(stateFor(custom));
    resetAllKeybindings.mockResolvedValue(successResult());
    await render();
    await confirmReset();

    expect(resetAllKeybindings).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
    expect(resetButton().disabled).toBe(true);
    expect(
      getEffectiveKeybindingRows("win32").filter((row) => row.origin === "user")
    ).toEqual([]);
    expect(container.querySelector(".keyboardShortcutsDiagnostics")).toBeNull();
  });

  it("keeps the #649 filter state (query, view, display options) after a reset", async () => {
    installApi(stateFor(custom));
    resetAllKeybindings.mockResolvedValue(successResult());
    await render();
    const search = container.querySelector<HTMLInputElement>("#keyboardShortcutsSearch")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(search, "bold");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('.keyboardShortcutsViewButton[data-view="modified"]')!
        .click();
    });
    await confirmReset();

    expect(container.querySelector<HTMLInputElement>("#keyboardShortcutsSearch")!.value).toBe("bold");
    expect(
      container
        .querySelector('.keyboardShortcutsViewButton[data-view="modified"]')!
        .getAttribute("aria-pressed")
    ).toBe("true");
    // Modified view after a reset: nothing modified any more.
    expect(container.querySelectorAll("li.keyboardShortcutGroup")).toHaveLength(0);
  });

  it("shows a localized error and changes nothing when the save fails", async () => {
    installApi(stateFor(custom));
    resetAllKeybindings.mockResolvedValue({
      ok: false,
      platform: "win32",
      diagnostics: [{ code: "fileWriteError", severity: "error", message: "RAW EN" }],
      failure: { reason: "saveFailed" }
    } satisfies ApplyKeybindingChangeResult);
    await render();
    const before = container.querySelectorAll("li.keyboardShortcutGroup").length;
    await confirmReset();

    expect(dialog()!.textContent).toContain("ショートカット設定を既定値に戻せませんでした。");
    expect(dialog()!.textContent).not.toContain("RAW EN");
    expect(resetButton().disabled).toBe(false);
    expect(container.querySelectorAll("li.keyboardShortcutGroup")).toHaveLength(before);
  });

  it("an IPC exception is reported the same way", async () => {
    installApi(stateFor(custom));
    resetAllKeybindings.mockRejectedValue(new Error("boom"));
    await render();
    await confirmReset();
    expect(dialog()!.textContent).toContain("ショートカット設定を既定値に戻せませんでした。");
  });
});
