// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GetKeyboardShortcutItemsResult } from "../../src/shared/api";
import { t, type Translate } from "../../src/shared/i18n";
import type { KeyboardShortcutRow } from "../../src/shared/keybindings";
import { KeyboardShortcutsScreen } from "../../src/renderer/KeyboardShortcutsScreen";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const translate: Translate = (key, values) => t("ja", key, values);

function row(overrides: Partial<KeyboardShortcutRow>): KeyboardShortcutRow {
  return {
    commandId: "editor.markdown.bold",
    title: "太字",
    category: "Markdown",
    description: "",
    scope: "editor",
    executionHost: "renderer",
    source: "pergamum",
    readonly: false,
    readonlyReason: null,
    handlerStatus: "registered",
    when: "editorFocus && markdownDocument && !readOnly",
    key: "Mod-b",
    keyLabel: "Ctrl+B",
    rowId: `${overrides.commandId ?? "editor.markdown.bold"}|${overrides.key ?? "Mod-b"}`,
    origin: "default",
    editable: overrides.source === undefined || overrides.source === "pergamum",
    canReset: false,
    defaultKey: null,
    defaultKeyLabel: null,
    originKind: "default",
    ...overrides
  };
}

const sampleRows: KeyboardShortcutRow[] = [
  row({}),
  row({
    commandId: "editor.markdown.insertRuby",
    title: "ルビを挿入",
    key: "Mod-r",
    keyLabel: "Ctrl+R"
  }),
  row({
    commandId: "editor.selection.copy",
    title: "コピー",
    category: "Edit",
    scope: "native",
    source: "nativeRole",
    readonly: true,
    readonlyReason: "nativeRole",
    when: "native",
    key: "Mod-c",
    keyLabel: "Ctrl+C"
  }),
  row({
    commandId: "editor.comment.toggle",
    title: "コメントの切り替え",
    category: "Editor",
    source: "standard",
    readonly: true,
    readonlyReason: "standardBehavior",
    when: "standard",
    key: "Mod-/",
    keyLabel: "Ctrl+/"
  }),
  row({
    commandId: "workspace.keyboardShortcuts.open",
    title: "キーボードショートカットを開く",
    category: "View",
    scope: "app",
    when: null,
    key: null,
    keyLabel: null
  })
];

let container: HTMLDivElement;
let root: Root;
const getItems = vi.fn();
const openLocation = vi.fn();

function install(data: GetKeyboardShortcutItemsResult | Error): void {
  getItems.mockReset();
  getItems.mockImplementation(async () => {
    if (data instanceof Error) {
      throw data;
    }
    return data;
  });
  (window as unknown as { pergamum: unknown }).pergamum = {
    keybindings: {
      getKeyboardShortcutItems: getItems,
      openKeybindingsJsonLocation: openLocation
    }
  };
}

async function render(language: "ja" | "en" = "ja"): Promise<void> {
  const tr: Translate = (key, values) => t(language, key, values);
  await act(async () => {
    root.render(<KeyboardShortcutsScreen translate={tr} language={language} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}


async function showReadonly(): Promise<void> {
  const toggle = container.querySelector<HTMLInputElement>(
    ".keyboardShortcutsFilterToggle input"
  )!;
  await act(async () => {
    toggle.click();
  });
}

async function showConditions(): Promise<void> {
  const toggle = container.querySelector<HTMLInputElement>(
    ".keyboardShortcutsConditionsToggle input"
  )!;
  await act(async () => {
    toggle.click();
  });
}

function type(value: string): void {
  const input = container.querySelector("input") as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function rowTexts(): string[] {
  return [...container.querySelectorAll("li.keyboardShortcutGroup")].map(
    (li) => li.textContent ?? ""
  );
}

function data(
  items: KeyboardShortcutRow[] = sampleRows,
  diagnostics: GetKeyboardShortcutItemsResult["diagnostics"] = []
): GetKeyboardShortcutItemsResult {
  return { platform: "win32", items, diagnostics };
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  openLocation.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete (window as unknown as { pergamum?: unknown }).pergamum;
});

describe("KeyboardShortcutsScreen rows (#646)", () => {
  it("renders the title, search field, open-location button and the list", async () => {
    install(data());
    await render();
    await showReadonly();
    expect(container.textContent).toContain("キーボードショートカット");
    expect(container.querySelector("input[type=search]")).not.toBeNull();
    expect(container.textContent).toContain("keybindings.json の場所を開く");
    expect(rowTexts()).toHaveLength(5);
  });

  it("each row shows title, commandId, key label, category, scope, source and (with conditions ON) the condition", async () => {
    install(data());
    await render();
    await showConditions();
    const bold = rowTexts().find((text) => text.includes("editor.markdown.bold")) ?? "";
    expect(bold).toContain("太字");
    expect(bold).toContain("editor.markdown.bold");
    expect(bold).toContain("Ctrl+B");
    expect(bold).toContain("マークダウン");
    expect(bold).toContain("editor");
    expect(bold).toContain("Pergamum");
    expect(bold).toContain("適用条件: editorFocus && markdownDocument && !readOnly");
  });

  it("uses the platform key label from the data, never the raw notation as the visible label", async () => {
    install(data());
    await render();
    const kbd = container.querySelector("kbd") as HTMLElement;
    expect(kbd.textContent).toBe("Ctrl+B");
    expect(kbd.textContent).not.toContain("Mod");
    // The raw catalog notation is only a tooltip.
    expect(kbd.getAttribute("title")).toBe("Mod-b");
  });

  it("maps sources to Pergamum / Native / 標準機能", async () => {
    install(data());
    await render();
    await showReadonly();
    const texts = rowTexts();
    expect(texts.find((x) => x.includes("editor.markdown.bold"))).toContain("Pergamum");
    expect(texts.find((x) => x.includes("editor.selection.copy"))).toContain("Native");
    expect(texts.find((x) => x.includes("editor.comment.toggle"))).toContain("標準機能");
  });

  it("readonly rows show the ReadOnly text (and an icon); editable rows do not", async () => {
    install(data());
    await render();
    await showReadonly();
    const copy = [...container.querySelectorAll("li.keyboardShortcutGroup")].find((li) =>
      li.textContent?.includes("editor.selection.copy")
    ) as HTMLElement;
    const badge = copy.querySelector(".keyboardShortcutReadonly") as HTMLElement;
    expect(badge.textContent).toContain("読み取り専用");
    expect(badge.querySelector("svg")).not.toBeNull();
    expect(badge.querySelector("[aria-hidden=true]")).not.toBeNull();
    const bold = [...container.querySelectorAll("li.keyboardShortcutGroup")].find((li) =>
      li.textContent?.includes("editor.markdown.bold")
    ) as HTMLElement;
    expect(bold.querySelector(".keyboardShortcutReadonly")).toBeNull();
    expect(bold.getAttribute("data-readonly")).toBe("false");
    expect(copy.getAttribute("data-readonly")).toBe("true");
    // The native row is readonly even though it shows a key.
    expect(copy.textContent).toContain("Ctrl+C");
  });

  it("an unassigned command shows 未割当 and is not omitted", async () => {
    install(data());
    await render();
    const open = rowTexts().find((x) => x.includes("workspace.keyboardShortcuts.open")) ?? "";
    expect(open).toContain("未割当");
    expect(open).not.toContain("<kbd");
    expect(container.querySelectorAll(".keyboardShortcutUnassigned")).toHaveLength(1);
  });

  it("a command without a when draws no condition at all, even with conditions ON", async () => {
    install(data());
    await render();
    await showConditions();
    const open = rowTexts().find((x) => x.includes("workspace.keyboardShortcuts.open")) ?? "";
    expect(open).not.toContain("適用条件");
    expect(open).not.toContain("when");
  });

  it("one command group with one binding row per key (#648)", async () => {
    install(
      data([
        row({ commandId: "workbench.commandPalette.open", title: "コマンドパレット", key: "Mod-p", keyLabel: "Ctrl+P" }),
        row({ commandId: "workbench.commandPalette.open", title: "コマンドパレット", key: "F1", keyLabel: "F1" })
      ])
    );
    await render();
    expect(rowTexts()).toHaveLength(1);
    const bindings = [...container.querySelectorAll("li.keyboardShortcutRow")].map(
      (li) => li.textContent ?? ""
    );
    expect(bindings).toHaveLength(2);
    expect(bindings[0]).toContain("Ctrl+P");
    expect(bindings[1]).toContain("F1");
  });

  it("rows are keyboard reachable and the search input has an accessible label", async () => {
    install(data());
    await render();
    for (const li of container.querySelectorAll("li.keyboardShortcutRow")) {
      expect(li.getAttribute("tabindex")).toBe("0");
    }
    const input = container.querySelector("input") as HTMLInputElement;
    const label = container.querySelector(`label[for="${input.id}"]`);
    expect(label?.textContent).toBe("ショートカットを検索");
    expect(input.getAttribute("placeholder")).toBe("検索...");
  });

  it("shows loading, then a load failure message", async () => {
    install(new Error("ipc"));
    await render();
    expect(container.textContent).toContain("ショートカットの一覧を読み込めませんでした。");
    expect(container.querySelector("[role=alert]")).not.toBeNull();
  });

  it("states that keybindings.json edits apply after a restart", async () => {
    install(data());
    await render();
    expect(container.textContent).toContain("自動的に再読み込みします");
  });
});

describe("KeyboardShortcutsScreen search (#646)", () => {
  it("filters by command title", async () => {
    install(data());
    await render();
    type("ルビ");
    expect(rowTexts()).toHaveLength(1);
    expect(rowTexts()[0]).toContain("editor.markdown.insertRuby");
  });

  it("filters by commandId", async () => {
    install(data());
    await render();
    type("editor.markdown.bold");
    expect(rowTexts()).toHaveLength(1);
  });

  it("filters by key label (Ctrl+B)", async () => {
    install(data());
    await render();
    type("Ctrl+B");
    expect(rowTexts()).toHaveLength(1);
    expect(rowTexts()[0]).toContain("editor.markdown.bold");
  });

  it("filters by category and by source", async () => {
    install(data());
    await render();
    await showReadonly();
    type("Edit");
    expect(rowTexts().some((x) => x.includes("editor.selection.copy"))).toBe(true);
    type("標準機能");
    expect(rowTexts()).toHaveLength(1);
    expect(rowTexts()[0]).toContain("editor.comment.toggle");
    type("native");
    expect(rowTexts().some((x) => x.includes("editor.selection.copy"))).toBe(true);
  });

  it("an empty search shows every row again", async () => {
    install(data());
    await render();
    await showReadonly();
    type("ルビ");
    expect(rowTexts()).toHaveLength(1);
    type("");
    expect(rowTexts()).toHaveLength(5);
  });

  it("shows the empty message when nothing matches", async () => {
    install(data());
    await render();
    type("zzzz");
    expect(rowTexts()).toHaveLength(0);
    expect(container.textContent).toContain("一致するショートカットはありません。");
  });

  it("shows the result count", async () => {
    install(data());
    await render();
    await showReadonly();
    expect(container.textContent).toContain("5 件");
    type("Ctrl+B");
    expect(container.textContent).toContain("1 件");
  });
});

describe("KeyboardShortcutsScreen diagnostics (#646)", () => {
  it("shows no diagnostics section when there are none", async () => {
    install(data());
    await render();
    expect(container.querySelector(".keyboardShortcutsDiagnostics")).toBeNull();
    expect(container.textContent).not.toContain("件の問題");
  });

  it("shows the summary, each message, and the commandId / key of a diagnostic", async () => {
    install(
      data(sampleRows, [
        {
          code: "conflictingKey",
          severity: "error",
          message: "Entry 0: Mod-i is already bound to editor.markdown.italic",
          command: "editor.markdown.bold",
          key: "Mod-i"
        },
        {
          code: "duplicateUserEntry",
          severity: "warning",
          message: "Entry 1: already bound"
        }
      ])
    );
    await render();
    await showReadonly();
    const section = container.querySelector(".keyboardShortcutsDiagnostics") as HTMLElement;
    expect(section.textContent).toContain(
      "keybindings.json に 1 件のエラーと 1 件の警告があります。"
    );
    // The localized message is shown, never the English developer message.
    expect(section.textContent).toContain("このショートカットは既に使用されています。");
    expect(section.textContent).not.toContain("is already bound");
    expect(section.querySelector(".keyboardShortcutsDiagnosticCommand")?.textContent).toBe(
      "editor.markdown.bold"
    );
    expect(section.querySelector(".keyboardShortcutsDiagnosticKey")?.textContent).toBe("Mod-i");
    expect(section.textContent).toContain("エラー");
    expect(section.textContent).toContain("警告");
    // The defaults / effective list is still shown next to the errors.
    expect(rowTexts()).toHaveLength(5);
  });

  it("warnings only are a status (not an alert) and not styled as errors", async () => {
    install(
      data(sampleRows, [
        { code: "unknownField", severity: "warning", message: "Entry 0: unknown field" }
      ])
    );
    await render();
    const section = container.querySelector(".keyboardShortcutsDiagnostics") as HTMLElement;
    expect(section.getAttribute("role")).toBe("status");
    expect(section.className).toContain("keyboardShortcutsDiagnostics-warning");
    expect(section.className).not.toContain("keyboardShortcutsDiagnostics-error");
  });

  it("errors are an alert", async () => {
    install(
      data(sampleRows, [{ code: "jsonParseError", severity: "error", message: "not valid JSON" }])
    );
    await render();
    const section = container.querySelector(".keyboardShortcutsDiagnostics") as HTMLElement;
    expect(section.getAttribute("role")).toBe("alert");
  });
});

describe("KeyboardShortcutsScreen diagnostics polish (#651)", () => {
  it("shows a 1-based entry number, the position of a syntax error and context chips", async () => {
    install(
      data(sampleRows, [
        {
          code: "unsupportedWhen",
          severity: "error",
          message: "Entry 0: when not supported",
          index: 0,
          command: "editor.markdown.bold",
          key: "Mod-b",
          when: "foo && bar"
        },
        { code: "jsonParseError", severity: "error", message: "bad", line: 3, column: 7 }
      ])
    );
    await render();
    const text = (container.querySelector(".keyboardShortcutsDiagnostics") as HTMLElement)
      .textContent;
    expect(text).toContain("エントリ 1");
    expect(text).not.toContain("エントリ 0");
    expect(text).toContain("3 行 7 列");
    expect(text).toContain("foo && bar");
    expect(text).toContain("このショートカット定義は適用されません。");
    expect(text).not.toContain("when not supported");
  });

  it("an unknown code shows a generic localized message in ja, the developer message in en", async () => {
    const unknown = {
      code: "somethingNew",
      severity: "error",
      message: "Raw developer text"
    } as unknown as GetKeyboardShortcutItemsResult["diagnostics"][number];
    install(data(sampleRows, [unknown]));
    await render("ja");
    let text = container.querySelector(".keyboardShortcutsDiagnostics")?.textContent ?? "";
    expect(text).toContain("キーバインド設定で問題が発生しました。（somethingNew）");
    expect(text).not.toContain("Raw developer text");
    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    install(data(sampleRows, [unknown]));
    await render("en");
    text = container.querySelector(".keyboardShortcutsDiagnostics")?.textContent ?? "";
    expect(text).toContain("Raw developer text");
  });

  it("renders English messages in the English UI", async () => {
    install(
      data(sampleRows, [
        { code: "invalidKeyNotation", severity: "error", message: "x", key: "Ctrl+S", index: 1 }
      ])
    );
    await render("en");
    const text = container.querySelector(".keyboardShortcutsDiagnostics")?.textContent ?? "";
    expect(text).toContain("`Ctrl+S` is not a supported key notation. Example: `Mod-s`");
    expect(text).toContain("Entry 2");
  });
});

describe("KeyboardShortcutsScreen open location (#646)", () => {
  async function click(): Promise<void> {
    const button = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("keybindings.json の場所を開く")
    ) as HTMLButtonElement;
    await act(async () => {
      button.click();
      await Promise.resolve();
    });
  }

  it("the button calls the preload API and shows no error on success", async () => {
    install(data());
    openLocation.mockResolvedValue({ ok: true });
    await render();
    await click();
    expect(openLocation).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain("場所を開けませんでした");
  });

  it("shows an error when the main process reports failure", async () => {
    install(data());
    openLocation.mockResolvedValue({ ok: false });
    await render();
    await click();
    expect(container.textContent).toContain("keybindings.json の場所を開けませんでした。");
    expect(container.querySelector("[role=alert]")?.textContent).toContain("開けませんでした");
  });

  it("shows an error when the IPC throws, and a later success clears it", async () => {
    install(data());
    openLocation.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ ok: true });
    await render();
    await click();
    expect(container.textContent).toContain("場所を開けませんでした");
    await click();
    expect(container.textContent).not.toContain("場所を開けませんでした");
  });
});

describe("KeyboardShortcutsScreen has no JSON editor or chord UI (#647)", () => {
  it("renders no text editor for keybindings.json and no chord controls", async () => {
    install(data());
    await render();
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.querySelector("[contenteditable]")).toBeNull();
    expect(container.querySelectorAll("input:not([type=checkbox])")).toHaveLength(1);
    expect(container.textContent).not.toMatch(/chord|コード進行|when を編集/i);
  });

  it("the source never writes the file, lists user entries or listens to the keyboard itself", () => {
    const source = readFileSync("src/renderer/KeyboardShortcutsScreen.tsx", "utf8");
    expect(source).not.toContain("saveUserKeybindings");
    expect(source).not.toContain("getUserKeybindings");
    expect(source).not.toMatch(/onKeyDown|addEventListener\(["']keydown/);
    expect(source).not.toMatch(/watch|fs\./);
    // No trash icon for unbind / reset.
    expect(source).not.toMatch(/trash/i);
  });

  it("never renders a file path (the location button is text only)", async () => {
    install(data());
    await render();
    expect(container.textContent).not.toMatch(/[A-Za-z]:\|\/Users\/|\/home\//);
  });
});
