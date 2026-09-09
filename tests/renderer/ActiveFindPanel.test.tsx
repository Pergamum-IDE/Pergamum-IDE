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
    query: "",
    options: DEFAULT_ACTIVE_DOCUMENT_FIND_OPTIONS,
    markAll: true,
    regexError: null,
    matchCount: 0,
    activeIndex: null,
    focusToken: 0,
    onQueryChange: vi.fn(),
    onToggleOption: vi.fn(),
    onToggleMarkAll: vi.fn(),
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

function input(): HTMLInputElement {
  return container.querySelector<HTMLInputElement>(".activeFindPanelInput")!;
}
function nextButton(): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(".activeFindPanelNextButton")!;
}
function prevButton(): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(".activeFindPanelPrevButton")!;
}
function closeButton(): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(".activeFindPanelCloseButton")!;
}
function markToggle(): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(".activeFindPanelMarkToggle")!;
}
function optionToggles(): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      ".activeFindPanelOptions .searchOptionToggle"
    )
  );
}
function countText(): string {
  return container.querySelector(".activeFindPanelCount")!.textContent ?? "";
}

describe("ActiveFindPanel (#424 Slice 2)", () => {
  it("focuses and selects the search input on mount", () => {
    render({ query: "seed" });
    expect(document.activeElement).toBe(input());
    expect(input().selectionStart).toBe(0);
    expect(input().selectionEnd).toBe("seed".length);
  });

  it("re-focuses + re-selects the input when focusToken changes", () => {
    render({ query: "abc", focusToken: 1 });
    act(() => input().blur());
    render({ query: "abc", focusToken: 2 });
    expect(document.activeElement).toBe(input());
  });

  it("reports query edits through onQueryChange", () => {
    const props = render();
    act(() => typeInto(input(), "hello"));
    expect(props.onQueryChange).toHaveBeenCalledWith("hello");
  });

  it("renders the Ab / Aa / .* toggles and reports their key on click", () => {
    const props = render();
    const toggles = optionToggles();
    expect(toggles).toHaveLength(3);
    expect(toggles[0].getAttribute("aria-label")).toBe(
      t("ja", "search.option.wholeWord")
    );
    act(() => toggles[0].click());
    act(() => toggles[1].click());
    act(() => toggles[2].click());
    expect(props.onToggleOption).toHaveBeenNthCalledWith(1, "wholeWord");
    expect(props.onToggleOption).toHaveBeenNthCalledWith(2, "caseSensitive");
    expect(props.onToggleOption).toHaveBeenNthCalledWith(3, "useRegex");
  });

  it("reflects pressed option state via aria-pressed / data-pressed", () => {
    render({
      options: { wholeWord: false, caseSensitive: true, useRegex: false }
    });
    const [, caseToggle] = optionToggles();
    expect(caseToggle.getAttribute("aria-pressed")).toBe("true");
    expect(caseToggle.getAttribute("data-pressed")).toBe("true");
  });

  it("disables the whole-word toggle while regex mode is on", () => {
    render({
      options: { wholeWord: false, caseSensitive: false, useRegex: true }
    });
    const [wholeWordToggle, , regexToggle] = optionToggles();
    expect(wholeWordToggle.disabled).toBe(true);
    expect(regexToggle.getAttribute("aria-pressed")).toBe("true");
  });

  it("shows the regex error message and hides the count when the pattern is invalid", () => {
    render({
      query: "(",
      options: { wholeWord: false, caseSensitive: false, useRegex: true },
      regexError: "Unterminated group",
      matchCount: 0
    });
    expect(
      container.querySelector(".activeFindPanelError")?.textContent
    ).toBe(t("ja", "search.invalidRegex"));
    expect(input().getAttribute("data-invalid")).toBe("true");
    expect(countText()).toBe("");
    expect(prevButton().disabled).toBe(true);
    expect(nextButton().disabled).toBe(true);
  });

  it("wires the マークする toggle (pressed by default) to onToggleMarkAll", () => {
    const props = render({ markAll: true });
    expect(markToggle().getAttribute("aria-pressed")).toBe("true");
    act(() => markToggle().click());
    expect(props.onToggleMarkAll).toHaveBeenCalledTimes(1);

    render({ markAll: false });
    expect(markToggle().getAttribute("aria-pressed")).toBe("false");
  });

  it("shows nothing for an empty query, and the localized no-match text otherwise", () => {
    render({ query: "" });
    expect(countText()).toBe("");
    render({ query: "zzz", matchCount: 0 });
    expect(countText()).toBe(t("ja", "editor.find.noMatches"));
  });

  it("shows current / total when there are matches", () => {
    render({ query: "x", matchCount: 5, activeIndex: 0 });
    expect(countText()).toBe("1 / 5");
    render({ query: "x", matchCount: 5, activeIndex: 3 });
    expect(countText()).toBe("4 / 5");
  });

  it("disables previous / next while there are no matches", () => {
    render({ query: "zzz", matchCount: 0 });
    expect(prevButton().disabled).toBe(true);
    expect(nextButton().disabled).toBe(true);
    render({ query: "x", matchCount: 2, activeIndex: 0 });
    expect(prevButton().disabled).toBe(false);
    expect(nextButton().disabled).toBe(false);
  });

  it("wires the nav + close buttons", () => {
    const props = render({ query: "x", matchCount: 2, activeIndex: 0 });
    act(() => nextButton().click());
    act(() => prevButton().click());
    act(() => closeButton().click());
    expect(props.onNext).toHaveBeenCalledTimes(1);
    expect(props.onPrevious).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("Enter finds next, Shift+Enter finds previous, Escape closes", () => {
    const props = render({ query: "x", matchCount: 3, activeIndex: 0 });
    act(() =>
      input().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    );
    act(() =>
      input().dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          shiftKey: true,
          bubbles: true
        })
      )
    );
    act(() =>
      input().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    );
    expect(props.onNext).toHaveBeenCalledTimes(1);
    expect(props.onPrevious).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("does not treat Enter as find-next while the IME is composing", () => {
    const props = render({ query: "x", matchCount: 3, activeIndex: 0 });
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
    Object.defineProperty(event, "isComposing", { value: true });
    act(() => input().dispatchEvent(event));
    expect(props.onNext).not.toHaveBeenCalled();
  });
});
