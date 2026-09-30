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
    expect(container.textContent).not.toMatch(/chord|コード/i);
    expect(container.querySelectorAll("input")).toHaveLength(1);
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
    return container.querySelector(".keyboardShortcutsTab") as HTMLElement;
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
    const scroller = container.querySelector(".keyboardShortcutsTab") as HTMLElement;
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
