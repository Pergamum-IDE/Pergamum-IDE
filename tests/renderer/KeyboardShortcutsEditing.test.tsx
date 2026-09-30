// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApplyKeybindingChangeResult,
  GetKeyboardShortcutItemsResult,
  KeybindingCaptureInput
} from "../../src/shared/api";
import { t, type Translate } from "../../src/shared/i18n";
import {
  listKeyboardShortcutRows,
  resolveDefaultKeybindings,
  resolveEffectiveKeybindings,
  type KeybindingEditRequest,
  type KeyboardShortcutRow
} from "../../src/shared/keybindings";
import { KeyboardShortcutsScreen } from "../../src/renderer/KeyboardShortcutsScreen";
import {
  getEffectiveKeybindingRows,
  getEffectiveKeybindingsRevision,
  resetEffectiveKeybindings
} from "../../src/renderer/keybindings/effectiveKeybindingStore";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const translate: Translate = (key, values) => t("ja", key, values);

function rowsFor(entries: Parameters<typeof resolveEffectiveKeybindings>[0]["userEntries"]) {
  const { keybindings, diagnostics } = resolveEffectiveKeybindings({
    platform: "win32",
    userEntries: entries
  });
  return {
    keybindings,
    diagnostics,
    items: listKeyboardShortcutRows(keybindings, "win32")
  };
}

let container: HTMLDivElement;
let root: Root;
let captureListener: ((input: KeybindingCaptureInput) => void) | null = null;
const setCaptureMode = vi.fn();
const applyKeybindingChange = vi.fn();
const getKeyboardShortcutItems = vi.fn();
const unsubscribe = vi.fn();

function installApi(initial = rowsFor([])): void {
  captureListener = null;
  setCaptureMode.mockReset().mockResolvedValue({ ok: true });
  unsubscribe.mockReset();
  applyKeybindingChange.mockReset();
  getKeyboardShortcutItems.mockReset().mockResolvedValue({
    platform: "win32",
    items: initial.items,
    diagnostics: []
  } satisfies GetKeyboardShortcutItemsResult);
  (window as unknown as { pergamum: unknown }).pergamum = {
    keybindings: {
      getKeyboardShortcutItems,
      applyKeybindingChange,
      setCaptureMode,
      onCaptureInput: (listener: (input: KeybindingCaptureInput) => void) => {
        captureListener = listener;
        return () => {
          captureListener = null;
          unsubscribe();
        };
      },
      openKeybindingsJsonLocation: vi.fn().mockResolvedValue({ ok: true })
    }
  };
}


async function showReadonly(): Promise<void> {
  const toggle = container.querySelector<HTMLInputElement>(
    ".keyboardShortcutsFilterToggle input"
  )!;
  await act(async () => {
    toggle.click();
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function render(): Promise<void> {
  await act(async () => {
    root.render(<KeyboardShortcutsScreen translate={translate} />);
  });
  await flush();
}

function groupOf(commandId: string): HTMLElement {
  return [...container.querySelectorAll("li.keyboardShortcutGroup")].find(
    (li) => li.querySelector(".keyboardShortcutCommandId")?.textContent === commandId
  ) as HTMLElement;
}

/** The index-th binding row of the command's group. */
function rowOf(commandId: string, index = 0): HTMLElement {
  return groupOf(commandId).querySelectorAll("li.keyboardShortcutRow")[index] as HTMLElement;
}

function button(row: HTMLElement, kind: "edit" | "unbind" | "reset"): HTMLButtonElement | null {
  return row.querySelector(`.keyboardShortcutAction${kind[0]!.toUpperCase()}${kind.slice(1)}`);
}

async function press(input: Partial<KeybindingCaptureInput>): Promise<void> {
  await act(async () => {
    captureListener?.({
      key: "",
      code: "",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      repeat: false,
      ...input
    });
    await Promise.resolve();
  });
  await flush();
}

function okResult(entries: Parameters<typeof rowsFor>[0]): ApplyKeybindingChangeResult {
  const next = rowsFor(entries);
  return {
    ok: true,
    platform: "win32",
    items: next.items,
    keybindings: next.keybindings,
    diagnostics: next.diagnostics
  };
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  resetEffectiveKeybindings();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete (window as unknown as { pergamum?: unknown }).pergamum;
  resetEffectiveKeybindings();
});

describe("row actions and read-only rows (#647)", () => {
  it("an assigned editable row shows edit and unbind; reset only when there is something to reset", async () => {
    installApi();
    await render();
    const bold = rowOf("editor.markdown.bold");
    expect(button(bold, "edit")).not.toBeNull();
    expect(button(bold, "unbind")).not.toBeNull();
    expect(button(bold, "reset")).toBeNull();
    expect(bold.querySelector(".keyboardShortcutReadonly")).toBeNull();
  });

  it("the action buttons carry the Japanese aria-labels and use the assigned codicons (no trash)", async () => {
    installApi();
    await render();
    const bold = rowOf("editor.markdown.bold");
    expect(button(bold, "edit")?.getAttribute("aria-label")).toBe("ショートカットを編集");
    expect(button(bold, "unbind")?.getAttribute("aria-label")).toBe("ショートカットを解除");
    // Every icon is an svg inside an aria-hidden wrapper; the button name is the label.
    expect(button(bold, "edit")?.querySelector("[aria-hidden=true] svg")).not.toBeNull();
    expect(button(bold, "unbind")?.querySelector("[aria-hidden=true] svg")).not.toBeNull();
  });

  it("an editable UNASSIGNED row shows edit, no unbind, and 未割当", async () => {
    installApi();
    await render();
    const row = rowOf("workspace.keyboardShortcuts.open");
    expect(button(row, "edit")).not.toBeNull();
    expect(button(row, "unbind")).toBeNull();
    expect(button(row, "reset")).toBeNull();
    expect(row.textContent).toContain("未割当");
  });

  it("an unbound default shows 未割当（既定: …） with reset (and edit), no unbind", async () => {
    installApi(rowsFor([{ key: "F1", command: "-workbench.commandPalette.open" }]));
    await render();
    const unassigned = [...container.querySelectorAll("li.keyboardShortcutRow")].find(
      (li) => li.textContent?.includes("未割当（既定: F1）")
    ) as HTMLElement;
    expect(unassigned).toBeDefined();
    expect(button(unassigned, "reset")?.getAttribute("aria-label")).toBe("既定値に戻す");
    expect(button(unassigned, "edit")).not.toBeNull();
    expect(button(unassigned, "unbind")).toBeNull();
  });

  it("a user-added row shows edit and unbind but no reset (#648)", async () => {
    installApi(rowsFor([{ key: "Mod-Alt-9", command: "editor.markdown.bold" }]));
    await render();
    const userRow = rowOf("editor.markdown.bold", 1);
    expect(userRow.textContent).toContain("Ctrl+Alt+9");
    expect(button(userRow, "edit")).not.toBeNull();
    expect(button(userRow, "unbind")).not.toBeNull();
    expect(button(userRow, "reset")).toBeNull();
    // The untouched default row of the same command has no reset.
    expect(button(rowOf("editor.markdown.bold", 0), "reset")).toBeNull();
  });

  it("read-only rows show the shield and 読み取り専用 text, and expose no edit / unbind / reset", async () => {
    installApi();
    await render();
    await showReadonly();
    for (const commandId of ["editor.selection.copy", "editor.undo", "editor.cursor.lineStart"]) {
      const row = groupOf(commandId);
      const badge = row.querySelector(".keyboardShortcutReadonly") as HTMLElement;
      expect(badge.textContent).toContain("読み取り専用");
      expect(badge.querySelector("svg")).not.toBeNull();
      expect(row.querySelectorAll("button")).toHaveLength(0);
      expect(row.getAttribute("data-readonly")).toBe("true");
    }
  });

  it("action buttons are keyboard focusable (real buttons, not tabindex -1)", async () => {
    installApi();
    await render();
    for (const b of container.querySelectorAll(".keyboardShortcutActionButton")) {
      expect(b.tagName).toBe("BUTTON");
      expect(b.getAttribute("tabindex")).not.toBe("-1");
    }
  });
});

describe("key capture dialog (#647)", () => {
  async function openEdit(commandId = "editor.markdown.bold"): Promise<void> {
    installApi();
    await render();
    await act(async () => {
      button(rowOf(commandId), "edit")?.click();
      await Promise.resolve();
    });
    await flush();
  }

  it("opens a dialog asking for the new key, with Esc-to-cancel text and a cancel button", async () => {
    await openEdit();
    const dialog = document.querySelector("[role=dialog]") as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.textContent).toContain("新しいショートカットキーを押してください");
    expect(dialog.textContent).toContain("Esc でキャンセル");
    expect(dialog.textContent).toContain("editor.markdown.bold");
    expect(dialog.textContent).toContain("Ctrl+B");
    expect(
      [...dialog.querySelectorAll("button")].map((b) => b.textContent)
    ).toEqual(["キャンセル"]);
  });

  it("turns the main-process capture mode on while open and off when it closes", async () => {
    await openEdit();
    expect(setCaptureMode).toHaveBeenCalledWith(true);
    expect(captureListener).not.toBeNull();
    await act(async () => {
      (document.querySelector("[role=dialog] button") as HTMLButtonElement).click();
    });
    await flush();
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(setCaptureMode).toHaveBeenLastCalledWith(false);
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("Esc cancels without saving and releases the capture", async () => {
    await openEdit();
    await press({ key: "Escape", code: "Escape" });
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(applyKeybindingChange).not.toHaveBeenCalled();
    expect(setCaptureMode).toHaveBeenLastCalledWith(false);
  });

  it("modifier-only presses are ignored; the dialog keeps waiting", async () => {
    await openEdit();
    await press({ key: "Control", code: "ControlLeft", ctrlKey: true });
    await press({ key: "Shift", code: "ShiftLeft", shiftKey: true });
    expect(document.querySelector("[role=dialog]")).not.toBeNull();
    expect(applyKeybindingChange).not.toHaveBeenCalled();
  });

  it("an unsupported key shows a message and keeps waiting", async () => {
    await openEdit();
    await press({ key: "b", code: "KeyB" }); // a bare letter
    expect(document.querySelector("[role=dialog]")?.textContent).toContain("未対応のキーです。");
    expect(applyKeybindingChange).not.toHaveBeenCalled();
    expect(document.querySelector("[role=dialog]")).not.toBeNull();
  });

  it("auto-repeat presses are ignored", async () => {
    await openEdit();
    await press({ key: "s", code: "KeyS", ctrlKey: true, repeat: true });
    expect(applyKeybindingChange).not.toHaveBeenCalled();
    expect(document.querySelector("[role=dialog]")).not.toBeNull();
  });

  it("Enter is just a key, not a confirmation (Ctrl+Enter is captured, bare Enter is unsupported)", async () => {
    await openEdit();
    await press({ key: "Enter", code: "Enter" });
    expect(applyKeybindingChange).not.toHaveBeenCalled();
    expect(document.querySelector("[role=dialog]")?.textContent).toContain("未対応のキーです。");
  });

  it("falls back to a DOM key listener when main cannot engage the capture mode", async () => {
    installApi();
    setCaptureMode.mockResolvedValue({ ok: false });
    await render();
    await act(async () => {
      button(rowOf("editor.markdown.bold"), "edit")?.click();
      await Promise.resolve();
    });
    await flush();
    applyKeybindingChange.mockResolvedValue(okResult([]));
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true })
      );
      await Promise.resolve();
    });
    await flush();
    expect(document.querySelector("[role=dialog]")).toBeNull();
  });

  it("unmounting the screen while capturing still releases the capture mode", async () => {
    await openEdit();
    act(() => root.unmount());
    expect(setCaptureMode).toHaveBeenLastCalledWith(false);
    expect(unsubscribe).toHaveBeenCalled();
    root = createRoot(container);
  });
});

describe("saving a change (#647)", () => {
  async function capture(commandId: string, input: Partial<KeybindingCaptureInput>): Promise<void> {
    await act(async () => {
      button(rowOf(commandId), "edit")?.click();
      await Promise.resolve();
    });
    await flush();
    await press(input);
  }

  it("a valid key sends ONE change request with the row's target and the captured notation", async () => {
    installApi();
    applyKeybindingChange.mockResolvedValue(
      okResult([
        { key: "Mod-b", command: "-editor.markdown.bold" },
        { key: "Mod-Alt-9", command: "editor.markdown.bold" }
      ])
    );
    await render();
    await capture("editor.markdown.bold", {
      key: "9",
      code: "Digit9",
      ctrlKey: true,
      altKey: true
    });
    expect(applyKeybindingChange).toHaveBeenCalledTimes(1);
    const request = applyKeybindingChange.mock.calls[0]?.[0] as KeybindingEditRequest;
    expect(request).toEqual({
      kind: "change",
      target: {
        commandId: "editor.markdown.bold",
        key: "Mod-b",
        origin: "default",
        defaultKey: null
      },
      newKey: "Mod-Alt-9"
    });
  });

  it("success updates the visible list and the renderer's effective keybindings", async () => {
    installApi();
    const result = okResult([
      { key: "Mod-b", command: "-editor.markdown.bold" },
      { key: "Mod-Alt-9", command: "editor.markdown.bold" }
    ]);
    applyKeybindingChange.mockResolvedValue(result);
    await render();
    const before = getEffectiveKeybindingsRevision();
    await capture("editor.markdown.bold", { key: "9", code: "Digit9", ctrlKey: true, altKey: true });

    const labels = [...container.querySelectorAll("li.keyboardShortcutGroup")]
      .filter((li) => li.textContent?.includes("editor.markdown.bold"))
      .map((li) => li.textContent ?? "");
    expect(labels.some((text) => text.includes("Ctrl+Alt+9"))).toBe(true);
    expect(labels.some((text) => text.includes("未割当（既定: Ctrl+B）"))).toBe(true);
    expect(document.querySelector("[role=dialog]")).toBeNull();
    // The runtime (renderer matchers / editors) sees the new keybindings now.
    expect(getEffectiveKeybindingsRevision()).toBeGreaterThan(before);
    expect(
      getEffectiveKeybindingRows("win32").filter(
        (row) => row.command === "editor.markdown.bold" && row.key !== null
      ).map((row) => row.key)
    ).toEqual(["Mod-Alt-9"]);
  });

  it("a conflict response shows the conflict dialog with the other command's details, and changes nothing", async () => {
    installApi();
    applyKeybindingChange.mockResolvedValue({
      ok: false,
      platform: "win32",
      diagnostics: [],
      failure: {
        reason: "conflict",
        conflict: {
          key: "Mod-i",
          keyLabel: "Ctrl+I",
          commandId: "editor.markdown.italic",
          title: "Italic",
          category: "Markdown",
          scope: "editor"
        }
      }
    } satisfies ApplyKeybindingChangeResult);
    await render();
    const revision = getEffectiveKeybindingsRevision();
    await capture("editor.markdown.bold", { key: "i", code: "KeyI", ctrlKey: true });

    const dialog = document.querySelector("[role=alertdialog]") as HTMLElement;
    expect(dialog.textContent).toContain("このショートカットは既に使用されています。");
    expect(dialog.textContent).toContain("Ctrl+I");
    expect(dialog.textContent).toContain("Italic");
    expect(dialog.textContent).toContain("editor.markdown.italic");
    expect(dialog.textContent).toContain("Markdown");
    expect(dialog.textContent).toContain("editor");
    expect(getEffectiveKeybindingsRevision()).toBe(revision);
    // The list is unchanged: the default Ctrl+B row is still there.
    expect(rowOf("editor.markdown.bold").textContent).toContain("Ctrl+B");
  });

  it("a reserved-key response shows the reserved dialog", async () => {
    installApi();
    applyKeybindingChange.mockResolvedValue({
      ok: false,
      platform: "win32",
      diagnostics: [],
      failure: { reason: "reserved" }
    } satisfies ApplyKeybindingChangeResult);
    await render();
    await capture("editor.markdown.bold", { key: "F5", code: "F5" });
    const dialog = document.querySelector("[role=alertdialog]") as HTMLElement;
    expect(dialog.textContent).toContain("このショートカットは予約されているため使用できません。");
    expect(dialog.textContent).toContain("F5");
  });

  it("a failed save shows the error and leaves the list and the effective keybindings alone", async () => {
    installApi();
    applyKeybindingChange.mockResolvedValue({
      ok: false,
      platform: "win32",
      diagnostics: [{ code: "fileWriteError", severity: "error", message: "x" }],
      failure: { reason: "saveFailed" }
    } satisfies ApplyKeybindingChangeResult);
    await render();
    const revision = getEffectiveKeybindingsRevision();
    await capture("editor.markdown.bold", { key: "9", code: "Digit9", ctrlKey: true, altKey: true });
    expect(document.querySelector("[role=alertdialog]")?.textContent).toContain("保存に失敗しました。");
    expect(getEffectiveKeybindingsRevision()).toBe(revision);
    expect(rowOf("editor.markdown.bold").textContent).toContain("Ctrl+B");
  });

  it("an IPC exception is reported as a failed save", async () => {
    installApi();
    applyKeybindingChange.mockRejectedValue(new Error("ipc"));
    await render();
    await capture("editor.markdown.bold", { key: "9", code: "Digit9", ctrlKey: true, altKey: true });
    expect(document.querySelector("[role=alertdialog]")?.textContent).toContain("保存に失敗しました。");
  });

  it("an unreadable keybindings.json is explained (and nothing is overwritten)", async () => {
    installApi();
    applyKeybindingChange.mockResolvedValue({
      ok: false,
      platform: "win32",
      diagnostics: [],
      failure: { reason: "fileInvalid" }
    } satisfies ApplyKeybindingChangeResult);
    await render();
    await capture("editor.markdown.bold", { key: "9", code: "Digit9", ctrlKey: true, altKey: true });
    expect(document.querySelector("[role=alertdialog]")?.textContent).toContain(
      "keybindings.json を読み込めない"
    );
  });

  it("a stale target refreshes the list and explains", async () => {
    installApi();
    applyKeybindingChange.mockResolvedValue({
      ok: false,
      platform: "win32",
      diagnostics: [],
      failure: { reason: "stale" }
    } satisfies ApplyKeybindingChangeResult);
    await render();
    getKeyboardShortcutItems.mockClear();
    await capture("editor.markdown.bold", { key: "9", code: "Digit9", ctrlKey: true, altKey: true });
    expect(getKeyboardShortcutItems).toHaveBeenCalledOnce();
    expect(document.querySelector("[role=alertdialog]")?.textContent).toContain("一覧を更新しました");
  });

  it("the notice dialog closes with OK", async () => {
    installApi();
    applyKeybindingChange.mockResolvedValue({
      ok: false,
      platform: "win32",
      diagnostics: [],
      failure: { reason: "reserved" }
    } satisfies ApplyKeybindingChangeResult);
    await render();
    await capture("editor.markdown.bold", { key: "F5", code: "F5" });
    await act(async () => {
      (document.querySelector("[role=alertdialog] button") as HTMLButtonElement).click();
    });
    expect(document.querySelector("[role=alertdialog]")).toBeNull();
  });
});

describe("unbind and reset buttons (#647)", () => {
  it("unbind sends an unbind request for exactly that row (one alias)", async () => {
    installApi();
    applyKeybindingChange.mockResolvedValue(
      okResult([{ key: "F1", command: "-workbench.commandPalette.open" }])
    );
    await render();
    await act(async () => {
      button(rowOf("workbench.commandPalette.open", 1), "unbind")?.click();
      await Promise.resolve();
    });
    await flush();
    expect(applyKeybindingChange).toHaveBeenCalledWith({
      kind: "unbind",
      target: {
        commandId: "workbench.commandPalette.open",
        key: "F1",
        origin: "default",
        defaultKey: null
      }
    });
    // The list now shows the unassigned default row; Ctrl+P stays.
    const texts = [...container.querySelectorAll("li.keyboardShortcutGroup")]
      .filter((li) => li.textContent?.includes("workbench.commandPalette.open"))
      .map((li) => li.textContent ?? "");
    expect(texts.some((text) => text.includes("Ctrl+P"))).toBe(true);
    expect(texts.some((text) => text.includes("未割当（既定: F1）"))).toBe(true);
  });

  it("reset on an unbound default sends a reset request for that default", async () => {
    installApi(rowsFor([{ key: "F1", command: "-workbench.commandPalette.open" }]));
    applyKeybindingChange.mockResolvedValue(okResult([]));
    await render();
    const unassigned = [...container.querySelectorAll("li.keyboardShortcutRow")].find((li) =>
      li.textContent?.includes("未割当（既定: F1）")
    ) as HTMLElement;
    await act(async () => {
      button(unassigned, "reset")?.click();
      await Promise.resolve();
    });
    await flush();
    expect(applyKeybindingChange).toHaveBeenCalledWith({
      kind: "reset",
      target: {
        commandId: "workbench.commandPalette.open",
        key: null,
        origin: "default",
        defaultKey: "F1"
      }
    });
    expect(container.textContent).not.toContain("未割当（既定: F1）");
  });

  it("unbind on a user-added row sends an unbind request for the user binding (removes it)", async () => {
    installApi(rowsFor([{ key: "Mod-Alt-9", command: "editor.markdown.bold" }]));
    applyKeybindingChange.mockResolvedValue(okResult([]));
    await render();
    await act(async () => {
      button(rowOf("editor.markdown.bold", 1), "unbind")?.click();
      await Promise.resolve();
    });
    await flush();
    expect(applyKeybindingChange).toHaveBeenCalledWith({
      kind: "unbind",
      target: {
        commandId: "editor.markdown.bold",
        key: "Mod-Alt-9",
        origin: "user",
        defaultKey: null
      }
    });
  });

  it("while a request is in flight the action buttons are disabled (no double submit)", async () => {
    installApi();
    let release: (value: ApplyKeybindingChangeResult) => void = () => undefined;
    applyKeybindingChange.mockReturnValue(
      new Promise<ApplyKeybindingChangeResult>((resolve) => {
        release = resolve;
      })
    );
    await render();
    await act(async () => {
      button(rowOf("editor.markdown.bold"), "unbind")?.click();
      await Promise.resolve();
    });
    expect(
      [...container.querySelectorAll<HTMLButtonElement>(".keyboardShortcutActionButton")].every(
        (b) => b.disabled
      )
    ).toBe(true);
    await act(async () => {
      release(okResult([{ key: "Mod-b", command: "-editor.markdown.bold" }]));
      await Promise.resolve();
    });
    await flush();
    expect(
      [...container.querySelectorAll<HTMLButtonElement>(".keyboardShortcutActionButton")].some(
        (b) => b.disabled
      )
    ).toBe(false);
  });

  it("a failed unbind shows the error and does not change the list", async () => {
    installApi();
    applyKeybindingChange.mockResolvedValue({
      ok: false,
      platform: "win32",
      diagnostics: [],
      failure: { reason: "saveFailed" }
    } satisfies ApplyKeybindingChangeResult);
    await render();
    await act(async () => {
      button(rowOf("editor.markdown.bold"), "unbind")?.click();
      await Promise.resolve();
    });
    await flush();
    expect(document.querySelector("[role=alertdialog]")).not.toBeNull();
    expect(rowOf("editor.markdown.bold").textContent).toContain("Ctrl+B");
  });
});

describe("the screen stays within scope (#647)", () => {
  it("shows no JSON editor, no chord or platform-override controls", async () => {
    installApi();
    await render();
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.textContent).not.toMatch(/chord|コード進行/i);
    expect(container.querySelectorAll("input:not([type=checkbox])")).toHaveLength(1);
  });

  it("the default list helper still sources rows from the same shared listing", () => {
    expect(
      listKeyboardShortcutRows(resolveDefaultKeybindings("win32"), "win32").length
    ).toBeGreaterThan(50);
  });
});

// Keep a typed reference so the import stays used.
export type _Row = KeyboardShortcutRow;

describe("scroll and focus after a change (#647 dogfood fix)", () => {
  function scroller(): HTMLElement {
    return container.querySelector(".keyboardShortcutsListScroll") as HTMLElement;
  }

  async function clickAndSettle(el: HTMLElement | null | undefined): Promise<void> {
    await act(async () => {
      el?.click();
      await Promise.resolve();
    });
    await flush();
  }

  it("keeps the scroll position after a successful unbind and focuses the corresponding row's edit button", async () => {
    installApi();
    applyKeybindingChange.mockResolvedValue(
      okResult([{ key: "Mod-b", command: "-editor.markdown.bold" }])
    );
    await render();
    scroller().scrollTop = 1234;
    const unbind = button(rowOf("editor.markdown.bold"), "unbind");
    unbind?.focus();
    await clickAndSettle(unbind);
    expect(scroller().scrollTop).toBe(1234);
    const after = rowOf("editor.markdown.bold");
    expect(document.activeElement).toBe(button(after, "edit"));
  });

  it("keeps the scroll position and focuses the reset button after a reset", async () => {
    installApi(rowsFor([{ key: "Mod-b", command: "-editor.markdown.bold" }]));
    applyKeybindingChange.mockResolvedValue(okResult([]));
    await render();
    scroller().scrollTop = 777;
    const reset = button(rowOf("editor.markdown.bold"), "reset");
    reset?.focus();
    await clickAndSettle(reset);
    expect(scroller().scrollTop).toBe(777);
    // After a reset the default row is assigned again; the reset button is gone
    // there, so focus falls back to its edit button.
    expect(document.activeElement).toBe(button(rowOf("editor.markdown.bold"), "edit"));
  });

  it("after a key change, focus lands on the row that now has the new key", async () => {
    installApi();
    applyKeybindingChange.mockResolvedValue(
      okResult([
        { key: "Mod-b", command: "-editor.markdown.bold" },
        { key: "Mod-Alt-9", command: "editor.markdown.bold" }
      ])
    );
    await render();
    scroller().scrollTop = 500;
    const edit = button(rowOf("editor.markdown.bold"), "edit");
    edit?.focus();
    await clickAndSettle(edit);
    await press({ key: "9", code: "Digit9", ctrlKey: true, altKey: true });
    expect(scroller().scrollTop).toBe(500);
    const active = document.activeElement as HTMLElement;
    const li = active.closest("li.keyboardShortcutRow") as HTMLElement;
    expect(li.textContent).toContain("Ctrl+Alt+9");
    expect(active).toBe(button(li, "edit"));
  });

  it("keeps the search query and filtered list after a change", async () => {
    installApi();
    applyKeybindingChange.mockResolvedValue(
      okResult([{ key: "Mod-b", command: "-editor.markdown.bold" }])
    );
    await render();
    const search = container.querySelector<HTMLInputElement>("#keyboardShortcutsSearch")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!;
      setter.call(search, "editor.markdown.bold");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickAndSettle(button(rowOf("editor.markdown.bold"), "unbind"));
    expect(search.value).toBe("editor.markdown.bold");
    expect(
      [...container.querySelectorAll(".keyboardShortcutCommandId")].every(
        (el) => el.textContent === "editor.markdown.bold"
      )
    ).toBe(true);
  });

  it("does not move scroll or focus when the change is refused", async () => {
    installApi();
    applyKeybindingChange.mockResolvedValue({
      ok: false,
      failure: { reason: "saveFailed" }
    });
    await render();
    scroller().scrollTop = 321;
    await clickAndSettle(button(rowOf("editor.markdown.bold"), "unbind"));
    expect(scroller().scrollTop).toBe(321);
  });
});

describe("adding a shortcut from the command group (#648)", () => {
  function addButton(commandId: string): HTMLButtonElement | null {
    return groupOf(commandId).querySelector(
      ".keyboardShortcutGroupHeader .keyboardShortcutAction-add"
    );
  }

  async function clickAdd(commandId: string): Promise<void> {
    await act(async () => {
      addButton(commandId)?.click();
      await Promise.resolve();
    });
    await flush();
  }

  async function typeSearch(value: string): Promise<HTMLInputElement> {
    const search = container.querySelector<HTMLInputElement>("#keyboardShortcutsSearch")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(search, value);
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    return search;
  }

  it("editable groups show the add button in the header with the add label; read-only groups do not", async () => {
    installApi();
    await render();
    await showReadonly();
    const add = addButton("editor.markdown.bold");
    expect(add?.getAttribute("aria-label")).toBe("ショートカットを追加");
    expect(add?.getAttribute("title")).toBe("ショートカットを追加");
    expect(add?.querySelector("svg")).not.toBeNull();
    for (const commandId of ["editor.selection.copy", "editor.undo", "editor.cursor.lineStart"]) {
      expect(addButton(commandId)).toBeNull();
      expect(groupOf(commandId).querySelector(".keyboardShortcutAction-add")).toBeNull();
    }
  });

  it("an unassigned command shows 未割当 and an add button", async () => {
    installApi();
    await render();
    const group = [...container.querySelectorAll<HTMLElement>("li.keyboardShortcutGroup")].find(
      (g) =>
        g.querySelector(".keyboardShortcutAction-add") !== null &&
        g.querySelectorAll("li.keyboardShortcutRow").length === 1 &&
        g.querySelector(".keyboardShortcutUnassigned") !== null
    );
    expect(group).toBeDefined();
    expect(group!.textContent).toContain("未割当");
  });

  it("clicking add opens the capture dialog with the add wording and no current-key line", async () => {
    installApi();
    await render();
    await clickAdd("editor.markdown.bold");
    const dialog = document.querySelector("[role=dialog]") as HTMLElement;
    expect(dialog.textContent).toContain("追加するショートカットキーを押してください");
    expect(dialog.textContent).toContain("editor.markdown.bold");
    expect(dialog.textContent).not.toContain("現在:");
    expect(setCaptureMode).toHaveBeenCalledWith(true);
  });

  it("a captured key sends ONE add request naming only the command, then updates the list", async () => {
    installApi();
    applyKeybindingChange.mockResolvedValue(
      okResult([{ key: "Mod-Alt-9", command: "editor.markdown.bold" }])
    );
    await render();
    await clickAdd("editor.markdown.bold");
    await press({ key: "9", code: "Digit9", ctrlKey: true, altKey: true });
    expect(applyKeybindingChange).toHaveBeenCalledOnce();
    expect(applyKeybindingChange).toHaveBeenCalledWith({
      kind: "add",
      target: { commandId: "editor.markdown.bold" },
      newKey: "Mod-Alt-9"
    });
    const rows = groupOf("editor.markdown.bold").querySelectorAll("li.keyboardShortcutRow");
    expect([...rows].map((r) => r.textContent)).toEqual([
      expect.stringContaining("Ctrl+B"),
      expect.stringContaining("Ctrl+Alt+9")
    ]);
    expect(setCaptureMode).toHaveBeenLastCalledWith(false);
  });

  it("shows binding origin labels, separate from the source label", async () => {
    installApi(
      rowsFor([
        { key: "F1", command: "-workbench.commandPalette.open" },
        { key: "Mod-Alt-p", command: "workbench.commandPalette.open" }
      ])
    );
    await render();
    const rows = groupOf("workbench.commandPalette.open").querySelectorAll(
      "li.keyboardShortcutRow"
    );
    const origins = [...rows].map((r) => r.querySelector(".keyboardShortcutOrigin")?.textContent);
    expect(origins).toEqual(["既定", "解除済み", "ユーザー"]);
    expect(
      groupOf("workbench.commandPalette.open").querySelector(".keyboardShortcutSource")
        ?.textContent
    ).toBe("Pergamum");
  });

  it("an unbound default row offers reset (not unbind); a user-added row offers edit + unbind (not reset)", async () => {
    installApi(
      rowsFor([
        { key: "F1", command: "-workbench.commandPalette.open" },
        { key: "Mod-Alt-p", command: "workbench.commandPalette.open" }
      ])
    );
    await render();
    const unbound = rowOf("workbench.commandPalette.open", 1);
    expect(button(unbound, "reset")).not.toBeNull();
    expect(button(unbound, "unbind")).toBeNull();
    const user = rowOf("workbench.commandPalette.open", 2);
    expect(button(user, "edit")).not.toBeNull();
    expect(button(user, "unbind")).not.toBeNull();
    expect(button(user, "reset")).toBeNull();
  });

  it.each([
    ["duplicate", "既に同じショートカット"],
    ["reserved", "予約されている"],
    ["saveFailed", "保存に失敗しました"]
  ])("a %s response shows the dialog and changes nothing", async (reason, text) => {
    installApi();
    applyKeybindingChange.mockResolvedValue({ ok: false, failure: { reason } });
    await render();
    const revisionBefore = getEffectiveKeybindingsRevision();
    await clickAdd("editor.markdown.bold");
    await press({ key: "9", code: "Digit9", ctrlKey: true, altKey: true });
    expect(document.querySelector("[role=alertdialog]")?.textContent).toContain(text);
    expect(
      groupOf("editor.markdown.bold").querySelectorAll("li.keyboardShortcutRow")
    ).toHaveLength(1);
    expect(getEffectiveKeybindingsRevision()).toBe(revisionBefore);
  });

  it("a conflict response shows the conflicting command", async () => {
    installApi();
    applyKeybindingChange.mockResolvedValue({
      ok: false,
      failure: {
        reason: "conflict",
        conflict: {
          key: "Mod-i",
          keyLabel: "Ctrl+I",
          commandId: "editor.markdown.italic",
          title: "斜体",
          category: "Markdown",
          scope: "editor"
        }
      }
    });
    await render();
    await clickAdd("editor.markdown.bold");
    await press({ key: "i", code: "KeyI", ctrlKey: true });
    const dialog = document.querySelector("[role=alertdialog]") as HTMLElement;
    expect(dialog.textContent).toContain("editor.markdown.italic");
  });

  it("Esc cancels the add without saving and returns focus to the add button", async () => {
    installApi();
    await render();
    addButton("editor.markdown.bold")?.focus();
    await clickAdd("editor.markdown.bold");
    await press({ key: "Escape", code: "Escape" });
    expect(applyKeybindingChange).not.toHaveBeenCalled();
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(document.activeElement).toBe(addButton("editor.markdown.bold"));
  });

  it("keeps the scroll position and search query, and focuses the new row after an add", async () => {
    installApi();
    applyKeybindingChange.mockResolvedValue(
      okResult([{ key: "Mod-Alt-9", command: "editor.markdown.bold" }])
    );
    await render();
    const search = await typeSearch("editor.markdown.bold");
    const scroller = container.querySelector(".keyboardShortcutsListScroll") as HTMLElement;
    scroller.scrollTop = 640;
    addButton("editor.markdown.bold")?.focus();
    await clickAdd("editor.markdown.bold");
    await press({ key: "9", code: "Digit9", ctrlKey: true, altKey: true });
    expect(scroller.scrollTop).toBe(640);
    expect(search.value).toBe("editor.markdown.bold");
    const active = document.activeElement as HTMLElement;
    expect(active.closest("li.keyboardShortcutRow")?.textContent).toContain("Ctrl+Alt+9");
  });

  it("search matches origin labels, and one matching row shows the whole group", async () => {
    installApi(rowsFor([{ key: "Mod-Alt-9", command: "editor.markdown.bold" }]));
    await render();
    await typeSearch("ユーザー");
    const groups = [...container.querySelectorAll("li.keyboardShortcutGroup")];
    expect(groups).toHaveLength(1);
    expect(groups[0]!.querySelectorAll("li.keyboardShortcutRow")).toHaveLength(2);
  });
});

describe("#648 boundary", () => {
  it("adds no JSON editor, chord, file watcher, global shortcut, suggestion or reset-all UI", async () => {
    const { readFileSync } = await import("node:fs");
    const files = [
      "src/renderer/KeyboardShortcutsScreen.tsx",
      "src/renderer/keyboardShortcutSearch.ts",
      "src/shared/keybindings/userEdit.ts",
      "src/shared/keybindings/listing.ts"
    ];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/globalShortcut|fs\.watch|chokidar|<textarea|sparkle/i);
    }
    const screen = readFileSync("src/renderer/KeyboardShortcutsScreen.tsx", "utf8");
    expect(screen).not.toMatch(/resetAll/);
    expect(screen).toContain("add.svg");
    expect(screen).not.toContain("trash");
  });
});

describe("display filters (#649)", () => {
  const toggle = (): HTMLInputElement =>
    container.querySelector(".keyboardShortcutsFilterToggle input") as HTMLInputElement;
  const categorySelect = (): HTMLSelectElement =>
    container.querySelector(".keyboardShortcutsCategorySelect") as HTMLSelectElement;
  const viewButton = (view: string): HTMLButtonElement =>
    container.querySelector(`.keyboardShortcutsViewButton[data-view="${view}"]`) as HTMLButtonElement;
  const clearButton = (): HTMLButtonElement =>
    container.querySelector(
      ".keyboardShortcutsFilters .keyboardShortcutsClearFilters"
    ) as HTMLButtonElement;
  const groupIds = (): string[] =>
    [...container.querySelectorAll("li.keyboardShortcutGroup .keyboardShortcutCommandId")].map(
      (el) => el.textContent ?? ""
    );

  async function click(el: HTMLElement): Promise<void> {
    await act(async () => {
      el.click();
      await Promise.resolve();
    });
    await flush();
  }

  async function choose(select: HTMLSelectElement, value: string): Promise<void> {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
      setter.call(select, value);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  async function typeQuery(value: string): Promise<HTMLInputElement> {
    const search = container.querySelector<HTMLInputElement>("#keyboardShortcutsSearch")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(search, value);
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    return search;
  }

  it("starts with Show ReadOnly OFF and no ReadOnly groups", async () => {
    installApi();
    await render();
    expect(toggle().checked).toBe(false);
    expect(toggle().parentElement?.textContent).toBe("読み取り専用を表示する");
    expect(groupIds()).toContain("editor.markdown.bold");
    for (const id of ["editor.selection.copy", "editor.undo", "editor.cursor.lineStart"]) {
      expect(groupIds()).not.toContain(id);
    }
    expect(viewButton("all").getAttribute("aria-pressed")).toBe("true");
    expect(viewButton("modified").getAttribute("aria-pressed")).toBe("false");
    expect(categorySelect().value).toBe("all");
    expect(clearButton().disabled).toBe(true);
  });

  it("the view choice is a group of pressed-state buttons (no mixed radio roles)", async () => {
    installApi();
    await render();
    const group = container.querySelector(".keyboardShortcutsViewGroup") as HTMLElement;
    expect(group.getAttribute("role")).toBe("group");
    expect(group.querySelector("[role=radio], [role=radiogroup], [aria-checked]")).toBeNull();
    expect(group.querySelectorAll("button[aria-pressed]")).toHaveLength(3);
  });

  it("toggling ON reveals Native / standard / read-only groups; OFF hides them again", async () => {
    installApi();
    await render();
    await click(toggle());
    for (const id of ["editor.selection.copy", "editor.undo", "editor.cursor.lineStart"]) {
      expect(groupIds()).toContain(id);
    }
    expect(groupOf("editor.selection.copy").querySelector(".keyboardShortcutReadonly")).not.toBeNull();
    await click(toggle());
    expect(groupIds()).not.toContain("editor.selection.copy");
  });

  it("the category dropdown filters groups", async () => {
    installApi();
    await render();
    const options = [...categorySelect().options].map((o) => o.value);
    expect(options[0]).toBe("all");
    const category = options[1]!;
    const label = [...categorySelect().options].find((o) => o.value === category)!.textContent;
    await choose(categorySelect(), category);
    const cats = [...container.querySelectorAll("li.keyboardShortcutGroup .keyboardShortcutCategory")].map(
      (el) => el.textContent
    );
    expect(cats.length).toBeGreaterThan(0);
    expect(cats.every((c) => c === label)).toBe(true);
    expect(clearButton().disabled).toBe(false);
  });

  it("Modified shows the whole command group, including default rows", async () => {
    installApi(rowsFor([{ key: "Mod-Alt-p", command: "workbench.commandPalette.open" }]));
    await render();
    await click(viewButton("modified"));
    expect(viewButton("modified").getAttribute("aria-pressed")).toBe("true");
    expect(groupIds()).toEqual(["workbench.commandPalette.open"]);
    const origins = [...groupOf("workbench.commandPalette.open").querySelectorAll(".keyboardShortcutOrigin")].map(
      (el) => el.textContent
    );
    expect(origins).toEqual(["既定", "既定", "ユーザー"]);
  });

  it("Unassigned shows only commands with no effective key, not ones with just an unbound alias", async () => {
    installApi(
      rowsFor([
        { key: "F1", command: "-workbench.commandPalette.open" },
        { key: "Mod-b", command: "-editor.markdown.bold" }
      ])
    );
    await render();
    await click(viewButton("unassigned"));
    expect(groupIds()).toContain("editor.markdown.bold");
    expect(groupIds()).not.toContain("workbench.commandPalette.open");
    for (const id of groupIds()) {
      const rows = groupOf(id).querySelectorAll("li.keyboardShortcutRow kbd");
      expect(rows).toHaveLength(0);
    }
  });

  it("shows the filter empty state with a clear action, and clearing restores the list", async () => {
    installApi();
    await render();
    await typeQuery("zzzz-no-such-shortcut");
    expect(container.textContent).toContain("条件に一致するショートカットはありません。");
    const clear = container.querySelector(
      ".keyboardShortcutsStatus .keyboardShortcutsClearFilters"
    ) as HTMLButtonElement;
    expect(clear).not.toBeNull();
    await click(clear);
    expect(groupIds().length).toBeGreaterThan(1);
    expect(
      (container.querySelector("#keyboardShortcutsSearch") as HTMLInputElement).value
    ).toBe("");
  });

  it("Clear filters resets query, category, view and Show ReadOnly", async () => {
    installApi();
    await render();
    await typeQuery("a");
    await choose(categorySelect(), [...categorySelect().options][1]!.value);
    await click(viewButton("modified"));
    await click(toggle());
    expect(clearButton().disabled).toBe(false);
    await click(clearButton());
    expect((container.querySelector("#keyboardShortcutsSearch") as HTMLInputElement).value).toBe("");
    expect(categorySelect().value).toBe("all");
    expect(viewButton("all").getAttribute("aria-pressed")).toBe("true");
    expect(toggle().checked).toBe(false);
    expect(clearButton().disabled).toBe(true);
    expect(applyKeybindingChange).not.toHaveBeenCalled();
  });

  it("filters stay after add, edit, unbind and reset", async () => {
    installApi(rowsFor([{ key: "Mod-Alt-p", command: "workbench.commandPalette.open" }]));
    applyKeybindingChange.mockResolvedValue(
      okResult([
        { key: "Mod-Alt-p", command: "workbench.commandPalette.open" },
        { key: "Mod-Alt-o", command: "workbench.commandPalette.open" }
      ])
    );
    await render();
    await click(viewButton("modified"));
    const search = await typeQuery("palette");
    const addButton = groupOf("workbench.commandPalette.open").querySelector(
      ".keyboardShortcutAction-add"
    ) as HTMLElement;
    await click(addButton);
    await press({ key: "o", code: "KeyO", ctrlKey: true, altKey: true });
    expect(viewButton("modified").getAttribute("aria-pressed")).toBe("true");
    expect(search.value).toBe("palette");
    expect(groupIds()).toEqual(["workbench.commandPalette.open"]);

    // Unbind a user row while filtered: the filter is kept.
    applyKeybindingChange.mockResolvedValue(
      okResult([{ key: "Mod-Alt-p", command: "workbench.commandPalette.open" }])
    );
    await click(button(rowOf("workbench.commandPalette.open", 3), "unbind")!);
    expect(viewButton("modified").getAttribute("aria-pressed")).toBe("true");
    expect(search.value).toBe("palette");
  });

  it("a group that stops matching after a confirmed change disappears, filters unchanged", async () => {
    installApi(rowsFor([{ key: "Mod-Alt-p", command: "workbench.commandPalette.open" }]));
    applyKeybindingChange.mockResolvedValue(okResult([]));
    await render();
    await click(viewButton("modified"));
    await click(button(rowOf("workbench.commandPalette.open", 2), "unbind")!);
    expect(groupIds()).toEqual([]);
    expect(viewButton("modified").getAttribute("aria-pressed")).toBe("true");
    expect(container.textContent).toContain("条件に一致するショートカットはありません。");
  });
});

describe("#649 boundary", () => {
  it("adds no reset-all, table header, zebra, JSON editor, file watcher, chord, Sparkle or globalShortcut", async () => {
    const { readFileSync } = await import("node:fs");
    const screen = readFileSync("src/renderer/KeyboardShortcutsScreen.tsx", "utf8");
    const search = readFileSync("src/renderer/keyboardShortcutSearch.ts", "utf8");
    for (const [name, text] of [["screen", screen], ["search", search]]) {
      expect(text, name).not.toMatch(/resetAll|globalShortcut|fs\.watch|chokidar|<textarea|sparkle/i);
      expect(text, name).not.toMatch(/<thead|<table|zebra|nth-child/i);
    }
    const css = readFileSync("src/renderer/styles.css", "utf8");
    expect(css).not.toMatch(/keyboardShortcut[\w-]*zebra/i);
    // The filters only read group metadata: no source checks in the component.
    expect(screen).not.toMatch(/source === "(nativeRole|standard)"/);
  });
});

describe("Show ReadOnly toggle and category labels (#649 dogfood)", () => {
  const toggle = (): HTMLInputElement =>
    container.querySelector(".keyboardShortcutsFilterToggle input") as HTMLInputElement;
  const categorySelect = (): HTMLSelectElement =>
    container.querySelector(".keyboardShortcutsCategorySelect") as HTMLSelectElement;
  const optionLabels = (): string[] =>
    [...categorySelect().options].map((o) => o.textContent ?? "");
  const optionValues = (): string[] => [...categorySelect().options].map((o) => o.value);

  async function click(el: HTMLElement): Promise<void> {
    await act(async () => {
      el.click();
      await Promise.resolve();
    });
  }

  async function choose(value: string): Promise<void> {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
      setter.call(categorySelect(), value);
      categorySelect().dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  it("is the app toggle switch (settingsSwitchInput, role=switch), labelled 読み取り専用を表示する, OFF", async () => {
    installApi();
    await render();
    expect(toggle().className).toBe("settingsSwitchInput");
    expect(toggle().getAttribute("role")).toBe("switch");
    expect(toggle().checked).toBe(false);
    expect(toggle().parentElement?.textContent).toBe("読み取り専用を表示する");
    // It is a real, focusable input, so the keyboard keeps working.
    expect(toggle().tabIndex).toBeGreaterThanOrEqual(0);
    expect(toggle().disabled).toBe(false);
  });

  it("the English label is Show ReadOnly", () => {
    expect(t("en", "keyboardShortcuts.filter.showReadonly")).toBe("Show ReadOnly");
    expect(t("ja", "keyboardShortcuts.filter.showReadonly")).toBe("読み取り専用を表示する");
  });

  it("hides ReadOnly groups initially and never shows unregistered commands, even when ON", async () => {
    installApi();
    await render();
    const ids = (): string[] =>
      [...container.querySelectorAll(".keyboardShortcutGroup .keyboardShortcutCommandId")].map(
        (el) => el.textContent ?? ""
      );
    for (const id of ["editor.selection.copy", "editor.undo", "editor.cursor.lineStart"]) {
      expect(ids()).not.toContain(id);
    }
    await click(toggle());
    for (const id of ["editor.selection.copy", "editor.undo", "editor.cursor.lineStart"]) {
      expect(ids()).toContain(id);
    }
    // Every shown group has a runtime handler: metadata-only commands stay out.
    const notRegistered = rowsFor([]).items.filter((i) => i.handlerStatus === "notYetRegistered");
    expect(notRegistered).toHaveLength(0);
  });

  it("the Edit category is labelled 基本編集 and Editor 本文編集; values stay Edit / Editor", async () => {
    installApi();
    await render();
    await click(toggle());
    const values = optionValues();
    expect(values).toContain("Edit");
    expect(values).toContain("Editor");
    const labelOf = (value: string): string | undefined =>
      [...categorySelect().options].find((o) => o.value === value)?.textContent ?? undefined;
    expect(labelOf("Edit")).toBe("基本編集");
    expect(labelOf("Editor")).toBe("本文編集");
    expect(labelOf("Markdown")).toBe("マークダウン");
    expect(optionLabels()).not.toContain("Edit");
  });

  it("the English labels are Clipboard / Editor", () => {
    expect(t("en", "keyboardShortcuts.category.edit")).toBe("Clipboard");
    expect(t("en", "keyboardShortcuts.category.editor")).toBe("Editor");
  });

  it("selecting Edit (基本編集) filters by the internal value and the group header shows the label", async () => {
    installApi();
    await render();
    await click(toggle());
    await choose("Edit");
    const headers = [...container.querySelectorAll(".keyboardShortcutGroup .keyboardShortcutCategory")].map(
      (el) => el.textContent
    );
    expect(headers.length).toBeGreaterThan(0);
    expect(headers.every((h) => h === "基本編集")).toBe(true);
  });

  it("the ReadOnly-only Edit category leaves the dropdown when the toggle is turned OFF, and a selected Edit resets to all", async () => {
    installApi();
    await render();
    expect(optionValues()).not.toContain("Edit");
    await click(toggle());
    expect(optionValues()).toContain("Edit");
    await choose("Edit");
    expect(categorySelect().value).toBe("Edit");
    await click(toggle());
    expect(optionValues()).not.toContain("Edit");
    expect(categorySelect().value).toBe("all");
  });
});

describe("category display labels (#649 final)", () => {
  const JA: Record<string, string> = {
    Application: "アプリケーション",
    "Command Palette": "コマンドパレット",
    Developer: "開発者向け",
    Edit: "基本編集",
    Editor: "本文編集",
    File: "ファイル",
    "File Explorer": "ファイルエクスプローラー",
    Glossary: "語彙集",
    Markdown: "マークダウン",
    Search: "検索",
    View: "表示",
    Window: "ウィンドウ"
  };

  it("every known category has a Japanese label; Edit and Editor, View and 表示 follow the table", async () => {
    const { KEYBOARD_SHORTCUT_CATEGORY_LABEL_KEYS } = await import(
      "../../src/renderer/keyboardShortcutSearch"
    );
    expect(Object.keys(KEYBOARD_SHORTCUT_CATEGORY_LABEL_KEYS).sort()).toEqual(
      Object.keys(JA).sort()
    );
    for (const [category, label] of Object.entries(JA)) {
      expect(t("ja", KEYBOARD_SHORTCUT_CATEGORY_LABEL_KEYS[category]!)).toBe(label);
    }
  });

  it("English keeps the existing category names (Edit is shown as Clipboard)", async () => {
    const { KEYBOARD_SHORTCUT_CATEGORY_LABEL_KEYS } = await import(
      "../../src/renderer/keyboardShortcutSearch"
    );
    for (const category of Object.keys(JA)) {
      const expected = category === "Edit" ? "Clipboard" : category;
      expect(t("en", KEYBOARD_SHORTCUT_CATEGORY_LABEL_KEYS[category]!)).toBe(expected);
    }
  });

  it("the dropdown shows only Japanese labels, keeps the internal values and the catalog order", async () => {
    installApi();
    await render();
    const toggleEl = container.querySelector(".keyboardShortcutsFilterToggle input") as HTMLInputElement;
    await act(async () => {
      toggleEl.click();
    });
    const select = container.querySelector(".keyboardShortcutsCategorySelect") as HTMLSelectElement;
    const options = [...select.options].slice(1);
    expect(options.length).toBeGreaterThan(3);
    for (const option of options) {
      expect(option.textContent).toBe(JA[option.value]);
    }
    const groupOrder: string[] = [];
    const { groupKeyboardShortcutRows } = await import("../../src/shared/keybindings");
    for (const g of groupKeyboardShortcutRows(rowsFor([]).items)) {
      if (!groupOrder.includes(g.category)) groupOrder.push(g.category);
    }
    expect(options.map((o) => o.value)).toEqual(groupOrder);
  });

  it("the localized category label is searchable; the internal value still works", async () => {
    installApi();
    await render();
    const search = container.querySelector<HTMLInputElement>("#keyboardShortcutsSearch")!;
    const type = async (value: string): Promise<void> => {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        setter.call(search, value);
        search.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    const ids = (): string[] =>
      [...container.querySelectorAll(".keyboardShortcutGroup .keyboardShortcutCommandId")].map(
        (el) => el.textContent ?? ""
      );
    await type("マークダウン");
    expect(ids()).toContain("editor.markdown.bold");
    await type("Markdown");
    expect(ids()).toContain("editor.markdown.bold");
    await type("語彙集");
    expect(ids().length).toBeGreaterThan(0);
  });
});

describe("command description (#649 addendum)", () => {
  const groupIds = (): string[] =>
    [...container.querySelectorAll(".keyboardShortcutGroup .keyboardShortcutCommandId")].map(
      (el) => el.textContent ?? ""
    );

  async function typeQuery(value: string): Promise<void> {
    const search = container.querySelector<HTMLInputElement>("#keyboardShortcutsSearch")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(search, value);
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function withDescription(
    commandId: string,
    description: string
  ): ReturnType<typeof rowsFor> {
    const base = rowsFor([]);
    return {
      ...base,
      items: base.items.map((item) =>
        item.commandId === commandId ? { ...item, description } : item
      )
    };
  }

  it("shows the command's description under the commandId, weaker than the title", async () => {
    installApi(withDescription("editor.markdown.bold", "Wraps the selection in strong emphasis."));
    await render();
    const block = groupOf("editor.markdown.bold").querySelector(
      ".keyboardShortcutGroupTitleBlock"
    ) as HTMLElement;
    const children = [...block.children].map((c) => c.className);
    expect(children).toEqual([
      "keyboardShortcutTitle",
      "keyboardShortcutCommandId",
      "keyboardShortcutCommandDescription"
    ]);
    // Japanese UI: the localized description, not the catalog text.
    expect(block.querySelector(".keyboardShortcutCommandDescription")?.textContent).toBe(
      "選択範囲を太字にします。"
    );
    // The right-hand meta and the binding rows stay.
    expect(groupOf("editor.markdown.bold").querySelector(".keyboardShortcutGroupMeta")).not.toBeNull();
    expect(groupOf("editor.markdown.bold").querySelectorAll("li.keyboardShortcutRow")).toHaveLength(1);
  });

  it("renders no description line when it is empty or blank", async () => {
    installApi(withDescription("editor.markdown.bold", ""));
    await render();
    expect(groupOf("editor.markdown.bold").querySelector(".keyboardShortcutCommandDescription")).toBeNull();
    expect(groupOf("editor.markdown.bold").querySelector(".keyboardShortcutGroupTitleBlock")?.children).toHaveLength(2);
  });

  it("finds a group by its description, case-insensitively, and shows the whole group", async () => {
    installApi(withDescription("editor.markdown.bold", "Zyzzyva emphasis helper"));
    await render();
    await typeQuery("ZYZZYVA");
    expect(groupIds()).toEqual(["editor.markdown.bold"]);
    expect(groupOf("editor.markdown.bold").querySelectorAll("li.keyboardShortcutRow")).toHaveLength(1);
  });

  it("a description-only match still shows every binding of a multi-key group", async () => {
    const base = rowsFor([{ key: "Mod-Alt-9", command: "editor.markdown.bold" }]);
    installApi({
      ...base,
      items: base.items.map((i) =>
        i.commandId === "editor.markdown.bold" ? { ...i, description: "Zyzzyva helper" } : i
      )
    });
    await render();
    await typeQuery("zyzzyva");
    expect(groupOf("editor.markdown.bold").querySelectorAll("li.keyboardShortcutRow")).toHaveLength(2);
  });
});

describe("localized command descriptions (#649 blocker)", () => {
  const groupIds = (): string[] =>
    [...container.querySelectorAll(".keyboardShortcutGroup .keyboardShortcutCommandId")].map(
      (el) => el.textContent ?? ""
    );

  async function typeQuery(value: string): Promise<void> {
    const search = container.querySelector<HTMLInputElement>("#keyboardShortcutsSearch")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(search, value);
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("shows the Japanese description and never the raw English one, for every listed command", async () => {
    installApi();
    await render();
    await act(async () => {
      (container.querySelector(".keyboardShortcutsFilterToggle input") as HTMLInputElement).click();
    });
    const shown = [...container.querySelectorAll(".keyboardShortcutGroup")];
    expect(shown.length).toBeGreaterThan(50);
    const items = rowsFor([]).items;
    for (const group of shown) {
      const id = group.querySelector(".keyboardShortcutCommandId")!.textContent!;
      const raw = items.find((i) => i.commandId === id)!.description;
      const text = group.querySelector(".keyboardShortcutCommandDescription")?.textContent ?? "";
      expect(text, id).not.toBe("");
      expect(text, id).not.toBe(raw);
      expect(text, id).toMatch(/[ぁ-んァ-ヶ一-龠]/);
      expect(group.textContent, id).not.toContain(raw);
    }
  });

  it("the commandId is shown unchanged", async () => {
    installApi();
    await render();
    expect(groupIds()).toContain("workbench.commandPalette.file.open");
    expect(
      groupOf("workbench.commandPalette.file.open").querySelector(".keyboardShortcutCommandDescription")
        ?.textContent
    ).toBe("コマンドパレットをファイル検索モード(プレフィックスなし)で開きます。");
  });

  it("searches both the Japanese description and the raw English metadata description", async () => {
    installApi();
    await render();
    await typeQuery("ファイル検索モード");
    expect(groupIds()).toContain("workbench.commandPalette.file.open");
    await typeQuery("file mode (empty prefix)");
    expect(groupIds()).toContain("workbench.commandPalette.file.open");
    // But the raw text is never displayed.
    expect(container.textContent).not.toContain("file mode (empty prefix)");
  });

  it("a command without a description draws no line", async () => {
    const base = rowsFor([]);
    installApi({
      ...base,
      items: base.items.map((i) =>
        i.commandId === "editor.markdown.italic" ? { ...i, description: "" } : i
      )
    });
    await render();
    // The localized text exists for this commandId, so an empty catalog
    // description still draws nothing: the group line is driven by metadata.
    expect(
      groupOf("editor.markdown.italic").querySelector(".keyboardShortcutCommandDescription")
    ).toBeNull();
  });
});

describe("command description i18n (#649 blocker)", () => {
  it("English shows the catalog description (same text, same key path)", async () => {
    const { commandDescriptionKey } = await import("../../src/renderer/keyboardShortcutSearch");
    for (const item of rowsFor([]).items) {
      const key = commandDescriptionKey(item.commandId);
      expect(key, item.commandId).not.toBeNull();
      expect(t("en", key!), item.commandId).toBe(item.description);
      expect(t("ja", key!), item.commandId).not.toBe(item.description);
    }
  });

  it("an unknown command falls back to no localized key", async () => {
    const { commandDescriptionKey } = await import("../../src/renderer/keyboardShortcutSearch");
    expect(commandDescriptionKey("no.such.command")).toBeNull();
  });
});

describe("English UI description (#649 blocker)", () => {
  it("shows the English description in the English UI", async () => {
    installApi();
    const enTranslate: Translate = (key, values) => t("en", key, values);
    await act(async () => {
      root.render(<KeyboardShortcutsScreen translate={enTranslate} />);
    });
    await flush();
    expect(
      groupOf("workbench.commandPalette.file.open").querySelector(
        ".keyboardShortcutCommandDescription"
      )?.textContent
    ).toBe("Opens the Command Palette in file mode (empty prefix).");
  });
});

describe("description fallback by locale (#649 final)", () => {
  const RAW = "Zyzzyva untranslated English description.";

  function untranslated(): ReturnType<typeof rowsFor> {
    const base = rowsFor([]);
    return {
      ...base,
      items: base.items.map((i) =>
        i.commandId === "editor.markdown.bold"
          ? { ...i, commandId: "test.untranslated.command", rowId: "test.untranslated", description: RAW }
          : i
      )
    };
  }

  async function renderWith(language: "ja" | "en"): Promise<void> {
    installApi(untranslated());
    const tr: Translate = (key, values) => t(language, key, values);
    await act(async () => {
      root.render(<KeyboardShortcutsScreen translate={tr} language={language} />);
    });
    await flush();
  }

  async function typeQuery(value: string): Promise<void> {
    const search = container.querySelector<HTMLInputElement>("#keyboardShortcutsSearch")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(search, value);
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("ja + missing translation: no description element and no raw English on screen", async () => {
    await renderWith("ja");
    const group = groupOf("test.untranslated.command");
    expect(group).toBeDefined();
    expect(group.querySelector(".keyboardShortcutCommandDescription")).toBeNull();
    expect(container.textContent).not.toContain(RAW);
    expect(group.querySelector(".keyboardShortcutGroupTitleBlock")?.children).toHaveLength(2);
  });

  it("ja + missing translation: the raw English description is still searchable (and still not shown)", async () => {
    await renderWith("ja");
    await typeQuery("zyzzyva");
    const ids = [...container.querySelectorAll(".keyboardShortcutGroup .keyboardShortcutCommandId")].map(
      (el) => el.textContent
    );
    expect(ids).toEqual(["test.untranslated.command"]);
    expect(container.textContent).not.toContain(RAW);
  });

  it("en + missing translation: falls back to the metadata description", async () => {
    await renderWith("en");
    expect(
      groupOf("test.untranslated.command").querySelector(".keyboardShortcutCommandDescription")
        ?.textContent
    ).toBe(RAW);
  });

  it("displayCommandDescription prefers the translation in both languages", async () => {
    const { displayCommandDescription } = await import("../../src/renderer/keyboardShortcutSearch");
    const ja: Translate = (key, values) => t("ja", key, values);
    const en: Translate = (key, values) => t("en", key, values);
    expect(displayCommandDescription("editor.markdown.bold", "raw", ja, "ja")).toBe(
      "選択範囲を太字にします。"
    );
    expect(displayCommandDescription("editor.markdown.bold", "raw", en, "en")).toBe(
      "Wraps the selection in bold markup."
    );
    expect(displayCommandDescription("x.unknown", "raw", ja, "ja")).toBe("");
    expect(displayCommandDescription("x.unknown", "raw", en, "en")).toBe("raw");
  });
});

describe("list scroll region, sticky header and conditions (#649 dogfood 2)", () => {
  const listScroll = (): HTMLElement =>
    container.querySelector(".keyboardShortcutsListScroll") as HTMLElement;
  const conditionsToggle = (): HTMLInputElement =>
    container.querySelector(".keyboardShortcutsConditionsToggle input") as HTMLInputElement;
  const readonlyToggle = (): HTMLInputElement =>
    container.querySelector(
      ".keyboardShortcutsFilterToggle:not(.keyboardShortcutsConditionsToggle) input"
    ) as HTMLInputElement;
  const conditionTexts = (): string[] =>
    [...container.querySelectorAll(".keyboardShortcutWhen")].map((el) => el.textContent ?? "");
  const groupCount = (): number => container.querySelectorAll("li.keyboardShortcutGroup").length;

  async function click(el: HTMLElement): Promise<void> {
    await act(async () => {
      el.click();
      await Promise.resolve();
    });
    await flush();
  }

  async function typeQuery(value: string): Promise<void> {
    const search = container.querySelector<HTMLInputElement>("#keyboardShortcutsSearch")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(search, value);
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("has a dedicated list scroll container; the controls and the count live outside it", async () => {
    installApi();
    await render();
    const scroll = listScroll();
    expect(scroll).not.toBeNull();
    expect(scroll.querySelector("li.keyboardShortcutGroup")).not.toBeNull();
    for (const selector of [
      "#keyboardShortcutsSearch",
      ".keyboardShortcutsCategorySelect",
      ".keyboardShortcutsViewGroup",
      ".keyboardShortcutsFilterToggle",
      ".keyboardShortcutsConditionsToggle",
      ".keyboardShortcutsClearFilters",
      ".keyboardShortcutsRestartNote",
      ".keyboardShortcutsTitle"
    ]) {
      const el = container.querySelector(selector)!;
      expect(el, selector).not.toBeNull();
      expect(scroll.contains(el), selector).toBe(false);
    }
    const count = [...container.querySelectorAll(".keyboardShortcutsStatus")].find((el) =>
      el.textContent?.includes("件")
    )!;
    expect(scroll.contains(count)).toBe(false);
  });

  it("the page itself does not scroll: the tab is overflow hidden and the list region scrolls in CSS", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/renderer/styles.css", "utf8");
    const tab = css.match(/\.keyboardShortcutsTab \{[^}]*\}/)![0];
    expect(tab).toContain("overflow: hidden");
    const scroll = css.match(/\.keyboardShortcutsListScroll \{[^}]*\}/)![0];
    expect(scroll).toContain("flex: 1");
    expect(scroll).toContain("min-block-size: 0");
    expect(scroll).toContain("overflow-y: auto");
    expect(scroll).not.toMatch(/calc\(100vh/);
    const header = css.match(/\.keyboardShortcutsListHeader \{[^}]*\}/)![0];
    expect(header).toContain("position: sticky");
    expect(header).toContain("inset-block-start: 0");
    expect(header).toContain("var(--pg-color-panel-background)");
  });

  it("the sticky header is the first child of the scroll region with Japanese column labels", async () => {
    installApi();
    await render();
    const header = listScroll().firstElementChild as HTMLElement;
    expect(header.className).toBe("keyboardShortcutsListHeader");
    expect(header.getAttribute("aria-hidden")).toBe("true");
    expect(
      [...header.children].map((c) => c.textContent)
    ).toEqual(["コマンド", "属性", "ショートカット"]);
  });

  it("the English header labels are Command / Attributes / Shortcut", async () => {
    installApi();
    const en: Translate = (key, values) => t("en", key, values);
    await act(async () => {
      root.render(<KeyboardShortcutsScreen translate={en} language="en" />);
    });
    await flush();
    const header = listScroll().firstElementChild as HTMLElement;
    expect([...header.children].map((c) => c.textContent)).toEqual([
      "Command",
      "Attributes",
      "Shortcut"
    ]);
  });

  it("conditions are hidden by default; category / scope / source stay", async () => {
    installApi();
    await render();
    expect(conditionsToggle().checked).toBe(false);
    expect(conditionsToggle().className).toBe("settingsSwitchInput");
    expect(conditionsToggle().getAttribute("role")).toBe("switch");
    expect(conditionsToggle().parentElement?.textContent).toBe("適用条件を表示する");
    expect(conditionTexts()).toEqual([]);
    expect(container.textContent).not.toContain("適用条件:");
    const bold = groupOf("editor.markdown.bold");
    expect(bold.querySelector(".keyboardShortcutCategory")).not.toBeNull();
    expect(bold.querySelector(".keyboardShortcutScope")).not.toBeNull();
    expect(bold.querySelector(".keyboardShortcutSource")).not.toBeNull();
  });

  it("ON shows 適用条件: <raw when>; OFF hides it again; groups without a when draw nothing", async () => {
    installApi();
    await render();
    await click(conditionsToggle());
    expect(conditionTexts().length).toBeGreaterThan(0);
    expect(
      groupOf("editor.markdown.bold").querySelector(".keyboardShortcutWhen")?.textContent
    ).toBe("適用条件: editorFocus && markdownDocument && !readOnly");
    for (const text of conditionTexts()) {
      expect(text).toMatch(/^適用条件: \S/);
    }
    await click(conditionsToggle());
    expect(conditionTexts()).toEqual([]);
  });

  it("English UI shows Condition: <raw when>, and the toggle label is Show conditions", async () => {
    installApi();
    const en: Translate = (key, values) => t("en", key, values);
    await act(async () => {
      root.render(<KeyboardShortcutsScreen translate={en} language="en" />);
    });
    await flush();
    expect(conditionsToggle().parentElement?.textContent).toBe("Show conditions");
    await click(conditionsToggle());
    expect(
      groupOf("editor.markdown.bold").querySelector(".keyboardShortcutWhen")?.textContent
    ).toBe("Condition: editorFocus && markdownDocument && !readOnly");
  });

  it("toggling conditions changes neither the list count nor the filter state", async () => {
    installApi();
    await render();
    await typeQuery("bold");
    const before = groupCount();
    const query = (container.querySelector("#keyboardShortcutsSearch") as HTMLInputElement).value;
    await click(conditionsToggle());
    expect(groupCount()).toBe(before);
    await click(conditionsToggle());
    expect(groupCount()).toBe(before);
    expect((container.querySelector("#keyboardShortcutsSearch") as HTMLInputElement).value).toBe(
      query
    );
    expect(readonlyToggle().checked).toBe(false);
  });

  it("Clear filters leaves the conditions option as it is", async () => {
    installApi();
    await render();
    await click(conditionsToggle());
    await typeQuery("bold");
    await click(readonlyToggle());
    const clear = container.querySelector(
      ".keyboardShortcutsFilters .keyboardShortcutsClearFilters"
    ) as HTMLButtonElement;
    await click(clear);
    expect(conditionsToggle().checked).toBe(true);
    expect(readonlyToggle().checked).toBe(false);
    expect((container.querySelector("#keyboardShortcutsSearch") as HTMLInputElement).value).toBe("");
    expect(conditionTexts().length).toBeGreaterThan(0);
  });

  it("searching by a raw when still works while conditions are hidden", async () => {
    installApi();
    await render();
    await typeQuery("markdownDocument");
    expect(groupCount()).toBeGreaterThan(0);
    expect(conditionTexts()).toEqual([]);
  });

  it("scroll restoration after a mutation applies to the list container, and filters persist", async () => {
    installApi();
    applyKeybindingChange.mockResolvedValue(
      okResult([{ key: "Mod-Alt-9", command: "editor.markdown.bold" }])
    );
    await render();
    await click(conditionsToggle());
    listScroll().scrollTop = 420;
    const addBtn = groupOf("editor.markdown.bold").querySelector(
      ".keyboardShortcutAction-add"
    ) as HTMLElement;
    addBtn.focus();
    await click(addBtn);
    await press({ key: "9", code: "Digit9", ctrlKey: true, altKey: true });
    expect(listScroll().scrollTop).toBe(420);
    expect(conditionsToggle().checked).toBe(true);
    expect(
      (document.activeElement as HTMLElement).closest("li.keyboardShortcutRow")?.textContent
    ).toContain("Ctrl+Alt+9");
  });
});
