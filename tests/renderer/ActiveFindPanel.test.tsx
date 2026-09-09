// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../../src/shared/i18n";
import {
  ActiveFindPanel,
  type ActiveFindPanelProps
} from "../../src/renderer/find/ActiveFindPanel";
import { DEFAULT_ACTIVE_DOCUMENT_FIND_OPTIONS } from "../../src/renderer/find/activeDocumentFind";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const translate: ActiveFindPanelProps["translate"] = (key, values) =>
  t("ja", key, values);

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value"
)!.set!;

function typeInto(element: HTMLInputElement, value: string): void {
  nativeInputValueSetter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

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

function render(overrides: Partial<ActiveFindPanelProps> = {}): ActiveFindPanelProps {
  const props: ActiveFindPanelProps = {
    translate,
    mode: "search",
    query: "",
    replaceText: "",
    options: DEFAULT_ACTIVE_DOCUMENT_FIND_OPTIONS,
    markAll: true,
    regexError: null,
    templateError: null,
    readOnly: false,
    replaceCurrentEnabled: false,
    matchCount: 0,
    activeIndex: null,
    focusToken: 0,
    onModeChange: vi.fn(),
    onQueryChange: vi.fn(),
    onReplaceTextChange: vi.fn(),
    onToggleOption: vi.fn(),
    onToggleMarkAll: vi.fn(),
    onReplaceCurrent: vi.fn(),
    onNext: vi.fn(),
    onPrevious: vi.fn(),
    onClose: vi.fn(),
    ...overrides
  };
  act(() => {
    root.render(<ActiveFindPanel {...props} />);
  });
  return props;
}

const q = () => container.querySelector<HTMLInputElement>(".activeFindPanelInput")!;
const replaceInput = () =>
  container.querySelector<HTMLInputElement>(".activeFindPanelReplaceInput");
const modeTabs = () =>
  Array.from(
    container.querySelectorAll<HTMLButtonElement>(".activeFindPanelModeTab")
  );
const replaceCurrentButton = () =>
  container.querySelector<HTMLButtonElement>(
    ".activeFindPanelReplaceCurrentButton"
  );
const optionToggles = () =>
  Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      ".activeFindPanelOptions .searchOptionToggle"
    )
  );
const markToggle = () =>
  container.querySelector<HTMLButtonElement>(".activeFindPanelMarkToggle")!;
const errorText = () =>
  container.querySelector(".activeFindPanelError")?.textContent ?? null;
const countText = () =>
  container.querySelector(".activeFindPanelCount")!.textContent ?? "";

describe("ActiveFindPanel — search mode carryover (#424 Slice 3)", () => {
  it("focuses the query input on mount / focusToken change", () => {
    render({ query: "seed" });
    expect(document.activeElement).toBe(q());
    render({ query: "seed", focusToken: 1 });
    act(() => q().blur());
    render({ query: "seed", focusToken: 2 });
    expect(document.activeElement).toBe(q());
  });

  it("reports query edits", () => {
    const props = render();
    act(() => typeInto(q(), "hello"));
    expect(props.onQueryChange).toHaveBeenCalledWith("hello");
  });

  it("Ab / Aa / .* toggle keys, regex disables whole-word", () => {
    const props = render({
      options: { wholeWord: false, caseSensitive: false, useRegex: true }
    });
    const [wholeWordToggle, caseToggle, regexToggle] = optionToggles();
    expect(wholeWordToggle.disabled).toBe(true);
    expect(regexToggle.getAttribute("aria-pressed")).toBe("true");
    act(() => caseToggle.click());
    expect(props.onToggleOption).toHaveBeenCalledWith("caseSensitive");
  });

  it("regex error message + disabled nav + no count", () => {
    render({
      query: "(",
      options: { wholeWord: false, caseSensitive: false, useRegex: true },
      regexError: "bad"
    });
    expect(errorText()).toBe(t("ja", "search.invalidRegex"));
    expect(countText()).toBe("");
    expect(
      container.querySelector<HTMLButtonElement>(".activeFindPanelPrevButton")!
        .disabled
    ).toBe(true);
  });

  it("Enter / Shift+Enter / Escape from the query input", () => {
    const props = render({ query: "x", matchCount: 3, activeIndex: 0 });
    for (const [key, shift] of [
      ["Enter", false],
      ["Enter", true],
      ["Escape", false]
    ] as const) {
      act(() =>
        q().dispatchEvent(
          new KeyboardEvent("keydown", { key, shiftKey: shift, bubbles: true })
        )
      );
    }
    expect(props.onNext).toHaveBeenCalledTimes(1);
    expect(props.onPrevious).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});

describe("ActiveFindPanel — mode tabs + replace mode (#424 Slice 3)", () => {
  it("renders the 検索 / 置換 tabs and reports mode changes", () => {
    const props = render({ mode: "search" });
    const tabs = modeTabs();
    expect(tabs).toHaveLength(2);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("aria-selected")).toBe("false");
    act(() => tabs[1].click());
    expect(props.onModeChange).toHaveBeenCalledWith("replace");
  });

  it("shows the replace input and replace-current button only in replace mode", () => {
    render({ mode: "search" });
    expect(replaceInput()).toBeNull();
    expect(replaceCurrentButton()).toBeNull();

    render({ mode: "replace" });
    expect(replaceInput()).not.toBeNull();
    expect(replaceCurrentButton()).not.toBeNull();
  });

  it("replace-current button is icon-only with title + aria-label", () => {
    render({ mode: "replace" });
    const button = replaceCurrentButton()!;
    expect(button.textContent?.trim()).toBe("");
    expect(button.querySelector("svg")).not.toBeNull();
    expect(button.getAttribute("aria-label")).toBe(
      t("ja", "editor.find.replaceCurrent")
    );
    expect(button.getAttribute("title")).toBe(
      t("ja", "editor.find.replaceCurrentTooltip")
    );
  });

  it("replace-current disabled unless the owner says it is enabled", () => {
    render({ mode: "replace", replaceCurrentEnabled: false });
    expect(replaceCurrentButton()!.disabled).toBe(true);
    render({ mode: "replace", replaceCurrentEnabled: true });
    expect(replaceCurrentButton()!.disabled).toBe(false);
  });

  it("replace input reports edits and Enter triggers replace-current when enabled", () => {
    const props = render({
      mode: "replace",
      replaceCurrentEnabled: true
    });
    act(() => typeInto(replaceInput()!, "xyz"));
    expect(props.onReplaceTextChange).toHaveBeenCalledWith("xyz");

    act(() =>
      replaceInput()!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    );
    expect(props.onReplaceCurrent).toHaveBeenCalledTimes(1);
  });

  it("replace input Enter does nothing while replace-current is disabled", () => {
    const props = render({ mode: "replace", replaceCurrentEnabled: false });
    act(() =>
      replaceInput()!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    );
    expect(props.onReplaceCurrent).not.toHaveBeenCalled();
  });

  it("replace input Shift+Enter goes to previous, Escape closes; IME Enter is ignored", () => {
    const props = render({ mode: "replace", replaceCurrentEnabled: true });
    act(() =>
      replaceInput()!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          shiftKey: true,
          bubbles: true
        })
      )
    );
    act(() =>
      replaceInput()!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    );
    const composing = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
    Object.defineProperty(composing, "isComposing", { value: true });
    act(() => replaceInput()!.dispatchEvent(composing));

    expect(props.onPrevious).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onReplaceCurrent).not.toHaveBeenCalled();
  });

  it("shows the invalid-template message in replace mode", () => {
    render({
      mode: "replace",
      options: { wholeWord: false, caseSensitive: false, useRegex: true },
      templateError: "missingGroup"
    });
    expect(errorText()).toBe(
      t("ja", "search.replace.template.missingGroup")
    );
    expect(replaceInput()!.getAttribute("data-invalid")).toBe("true");
  });

  it("shows the read-only replace message when read-only in replace mode", () => {
    render({ mode: "replace", readOnly: true });
    expect(errorText()).toBe(
      t("ja", "editor.find.readOnlyReplaceUnavailable")
    );
  });
});

describe("ActiveFindPanel — Ctrl+F / Ctrl+H from a focused panel input (#424 Slice 3 dogfood)", () => {
  function ctrlKey(
    code: "KeyF" | "KeyH",
    overrides: Partial<KeyboardEventInit> = {}
  ): KeyboardEvent {
    return new KeyboardEvent("keydown", {
      key: code === "KeyF" ? "f" : "h",
      code,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
      ...overrides
    });
  }

  it("Ctrl+H in the query input switches to replace mode; Ctrl+F back to search", () => {
    const onModeChange = vi.fn();
    render({ mode: "search", onModeChange });
    const h = ctrlKey("KeyH");
    act(() => q().dispatchEvent(h));
    expect(h.defaultPrevented).toBe(true);
    expect(onModeChange).toHaveBeenNthCalledWith(1, "replace");

    render({ mode: "replace", onModeChange });
    const f = ctrlKey("KeyF");
    act(() => q().dispatchEvent(f));
    expect(f.defaultPrevented).toBe(true);
    expect(onModeChange).toHaveBeenNthCalledWith(2, "search");
  });

  it("Ctrl+F / Ctrl+H from the replace input also switch modes", () => {
    const props = render({ mode: "replace" });
    act(() => replaceInput()!.dispatchEvent(ctrlKey("KeyF")));
    act(() => replaceInput()!.dispatchEvent(ctrlKey("KeyH")));
    expect(props.onModeChange).toHaveBeenNthCalledWith(1, "search");
    expect(props.onModeChange).toHaveBeenNthCalledWith(2, "replace");
  });

  it("ignores the shortcut while the IME is composing", () => {
    const props = render({ mode: "search" });
    const event = ctrlKey("KeyH");
    Object.defineProperty(event, "isComposing", { value: true });
    act(() => q().dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
    expect(props.onModeChange).not.toHaveBeenCalled();
  });

  it("ignores Ctrl+Shift+H / Ctrl+Alt+F", () => {
    const props = render({ mode: "search" });
    act(() => q().dispatchEvent(ctrlKey("KeyH", { shiftKey: true })));
    act(() => q().dispatchEvent(ctrlKey("KeyF", { altKey: true })));
    expect(props.onModeChange).not.toHaveBeenCalled();
  });
});

describe("ActiveFindPanel — focus polish (#424 Slice 3)", () => {
  it("mousedown on option / mark / mode / replace-current buttons is prevented (keeps input focus)", () => {
    render({ mode: "replace", replaceCurrentEnabled: true, matchCount: 2, activeIndex: 0 });
    const buttons = [
      ...optionToggles(),
      markToggle(),
      ...modeTabs(),
      replaceCurrentButton()!
    ];
    for (const button of buttons) {
      const event = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true
      });
      button.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
  });
});
