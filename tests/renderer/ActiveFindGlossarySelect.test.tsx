// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../../src/shared/i18n";
import {
  ActiveFindGlossarySelect,
  type ActiveFindGlossarySelectProps
} from "../../src/renderer/find/ActiveFindGlossarySelect";
import type { FindGlossaryCandidate } from "../../src/renderer/find/findGlossaryPicker";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const CANDIDATES: FindGlossaryCandidate[] = [
  { atomId: "a1", entryId: "e1", value: "シズク", matchFlags: 0, entryLabel: "シズク", isRepresentative: true },
  { atomId: "a2", entryId: "e1", value: "迷子", matchFlags: 0, entryLabel: "シズク", isRepresentative: false },
  { atomId: "a3", entryId: "e2", value: "港町", matchFlags: 0, entryLabel: "港町", isRepresentative: true }
];

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

function render(
  overrides: Partial<ActiveFindGlossarySelectProps> = {}
): ActiveFindGlossarySelectProps {
  const props: ActiveFindGlossarySelectProps = {
    translate: (key, values) => t("ja", key, values),
    variant: "multi",
    candidates: CANDIDATES,
    selectedIds: [],
    onChange: vi.fn(),
    placeholder: "語彙を選択",
    focusToken: 0,
    ...overrides
  };
  act(() => root.render(<ActiveFindGlossarySelect {...props} />));
  return props;
}

const input = () =>
  container.querySelector<HTMLInputElement>(
    ".activeFindPanelGlossarySelectInput"
  )!;
const popup = () =>
  container.querySelector<HTMLElement>(".activeFindPanelGlossarySelectPopup");
const options = () =>
  Array.from(
    container.querySelectorAll<HTMLLIElement>(
      ".activeFindPanelGlossarySelectOption"
    )
  );
const chips = () =>
  Array.from(
    container.querySelectorAll<HTMLElement>(".activeFindPanelGlossaryChip")
  );

function keydown(target: HTMLElement, init: KeyboardEventInit & { key: string }) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init
  });
  act(() => target.dispatchEvent(event));
  return event;
}

describe("ActiveFindGlossarySelect (#424 Slice 6)", () => {
  it("opens on ArrowDown / Ctrl+Space and lists candidates", () => {
    render();
    expect(popup()).toBeNull();
    keydown(input(), { key: "ArrowDown" });
    expect(popup()).not.toBeNull();
    expect(options()).toHaveLength(3);
  });

  it("multi: Enter adds the active candidate and keeps the popup open", () => {
    const props = render({ variant: "multi", selectedIds: [] });
    keydown(input(), { key: "ArrowDown" });
    keydown(input(), { key: "ArrowDown" }); // active -> 迷子
    keydown(input(), { key: "Enter" });
    expect(props.onChange).toHaveBeenCalledWith(["a2"]);
    expect(popup()).not.toBeNull();
  });

  it("multi: clicking an already-selected candidate toggles it OFF", () => {
    const props = render({ variant: "multi", selectedIds: ["a1", "a2"] });
    keydown(input(), { key: "ArrowDown" });
    act(() => options()[0].click()); // シズク is selected -> remove
    expect(props.onChange).toHaveBeenCalledWith(["a2"]);
  });

  it("multi: Backspace on an empty filter removes the last selected atom", () => {
    const props = render({ variant: "multi", selectedIds: ["a1", "a2"] });
    keydown(input(), { key: "Backspace" });
    expect(props.onChange).toHaveBeenCalledWith(["a1"]);
  });

  it("single: choosing a candidate replaces the selection and closes the popup", () => {
    const props = render({ variant: "single", selectedIds: ["a1"] });
    keydown(input(), { key: "ArrowDown" });
    act(() => options()[2].click()); // 港町
    expect(props.onChange).toHaveBeenCalledWith(["a3"]);
    expect(popup()).toBeNull();
  });

  it("renders a chip per selected atom with a remove button", () => {
    const props = render({ variant: "multi", selectedIds: ["a2"] });
    expect(chips()).toHaveLength(1);
    expect(chips()[0].textContent).toContain("迷子");
    act(() =>
      chips()[0]
        .querySelector<HTMLButtonElement>(".activeFindPanelGlossaryChipRemove")!
        .click()
    );
    expect(props.onChange).toHaveBeenCalledWith([]);
  });

  it("shows the empty state when there are no candidates", () => {
    render({ candidates: [] });
    keydown(input(), { key: "ArrowDown" });
    expect(options()).toHaveLength(0);
    expect(
      popup()!.querySelector(".activeFindPanelCompletionEmpty")?.textContent
    ).toBe(t("ja", "editor.find.glossaryEmpty"));
  });

  it("Escape closes the popup and stops propagation; unhandled keys bubble to the panel", () => {
    const onUnhandledKeyDown = vi.fn().mockReturnValue(false);
    render({ onUnhandledKeyDown });
    keydown(input(), { key: "ArrowDown" });
    const escape = keydown(input(), { key: "Escape" });
    expect(escape.defaultPrevented).toBe(true);
    expect(popup()).toBeNull();
    // a non-navigation key with the popup closed is offered to the panel
    keydown(input(), { key: "f", code: "KeyF", ctrlKey: true });
    expect(onUnhandledKeyDown).toHaveBeenCalled();
  });

  it("does not act while the IME is composing", () => {
    const props = render();
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(event, "isComposing", { value: true });
    act(() => input().dispatchEvent(event));
    expect(props.onChange).not.toHaveBeenCalled();
  });
});
