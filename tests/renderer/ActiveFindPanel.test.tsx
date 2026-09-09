// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../../src/shared/i18n";
import {
  ActiveFindPanel,
  type ActiveFindPanelProps
} from "../../src/renderer/find/ActiveFindPanel";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value"
)!.set!;

function typeInto(element: HTMLInputElement, value: string): void {
  nativeInputValueSetter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

const translate: ActiveFindPanelProps["translate"] = (key, values) =>
  t("ja", key, values);

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
    matchCount: 0,
    activeIndex: null,
    focusToken: 0,
    onQueryChange: vi.fn(),
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
function countText(): string {
  return container.querySelector(".activeFindPanelCount")!.textContent ?? "";
}

describe("ActiveFindPanel (#424 Slice 1)", () => {
  it("focuses and selects the search input on mount", () => {
    render({ query: "seed" });
    expect(document.activeElement).toBe(input());
    expect(input().selectionStart).toBe(0);
    expect(input().selectionEnd).toBe("seed".length);
  });

  it("re-focuses + re-selects the input when focusToken changes", () => {
    render({ query: "abc", focusToken: 1 });
    act(() => input().blur());
    expect(document.activeElement).not.toBe(input());

    render({ query: "abc", focusToken: 2 });
    expect(document.activeElement).toBe(input());
  });

  it("reports query edits through onQueryChange", () => {
    const props = render();
    act(() => {
      typeInto(input(), "hello");
    });
    expect(props.onQueryChange).toHaveBeenCalledWith("hello");
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

    act(() => {
      input().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });
    act(() => {
      input().dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          shiftKey: true,
          bubbles: true
        })
      );
    });
    act(() => {
      input().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });

    expect(props.onNext).toHaveBeenCalledTimes(1);
    expect(props.onPrevious).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("does not treat Enter as find-next while the IME is composing", () => {
    const props = render({ query: "x", matchCount: 3, activeIndex: 0 });
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true
    });
    Object.defineProperty(event, "isComposing", { value: true });
    act(() => {
      input().dispatchEvent(event);
    });
    expect(props.onNext).not.toHaveBeenCalled();
  });
});
