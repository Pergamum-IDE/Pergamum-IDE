// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../../src/shared/i18n";
import {
  ActiveFindPanel,
  type ActiveFindPanelProps
} from "../../src/renderer/find/ActiveFindPanel";
import { DEFAULT_ACTIVE_DOCUMENT_FIND_OPTIONS } from "../../src/renderer/find/activeDocumentFind";
import { glossaryCompletionCandidateDetail } from "../../src/renderer/glossaryCompletion";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const translate: ActiveFindPanelProps["translate"] = (key, values) =>
  t("ja", key, values);

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value"
)!.set!;
const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLTextAreaElement.prototype,
  "value"
)!.set!;

function typeInto(element: HTMLInputElement, value: string): void {
  nativeInputValueSetter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

// #456: the query / replace fields are now <textarea> - a distinct setter is
// required (happy-dom's HTMLInputElement value setter throws on one).
function typeIntoTextarea(element: HTMLTextAreaElement, value: string): void {
  nativeTextareaValueSetter.call(element, value);
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
    replaceAllEnabled: false,
    glossaryCandidates: [],
    queryKind: "text",
    glossaryRelation: "any",
    glossaryNearbySettings: {
      unit: "paragraphs",
      characterDistance: 500,
      paragraphDistance: 2
    },
    searchGlossaryAtomIds: [],
    replaceGlossaryAtomId: null,
    matchCount: 0,
    activeIndex: null,
    focusToken: 0,
    onModeChange: vi.fn(),
    onQueryChange: vi.fn(),
    onReplaceTextChange: vi.fn(),
    onToggleOption: vi.fn(),
    onToggleMarkAll: vi.fn(),
    onReplaceCurrent: vi.fn(),
    onReplaceAll: vi.fn(),
    onQueryKindChange: vi.fn(),
    onGlossaryRelationChange: vi.fn(),
    onSearchGlossaryAtomIdsChange: vi.fn(),
    onReplaceGlossaryAtomIdChange: vi.fn(),
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

const q = () =>
  container.querySelector<HTMLTextAreaElement>(".activeFindPanelInput")!;
const replaceInput = () =>
  container.querySelector<HTMLTextAreaElement>(".activeFindPanelReplaceInput");
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
const replaceAllButton = () =>
  container.querySelector<HTMLButtonElement>(".activeFindPanelReplaceAllButton");
const closeButton = () =>
  container.querySelector<HTMLButtonElement>(".activeFindPanelCloseButton")!;
const modeRow = () =>
  container.querySelector<HTMLDivElement>(".activeFindPanelModeRow")!;
const queryRow = () =>
  container.querySelector<HTMLDivElement>(".activeFindPanelQueryRow")!;
const glossaryButton = () =>
  container.querySelector<HTMLButtonElement>(".activeFindPanelGlossaryButton")!;
const glossarySelect = () =>
  container.querySelector<HTMLDivElement>(".activeFindPanelGlossarySelect");
const glossarySelectInput = () =>
  container.querySelector<HTMLInputElement>(
    ".activeFindPanelGlossarySelectInput"
  )!;
const glossarySelectPopup = () =>
  container.querySelector<HTMLElement>(".activeFindPanelGlossarySelectPopup");
const glossarySelectOptions = () =>
  Array.from(
    container.querySelectorAll<HTMLLIElement>(
      ".activeFindPanelGlossarySelectOption"
    )
  );
const glossaryChips = () =>
  Array.from(
    container.querySelectorAll<HTMLElement>(".activeFindPanelGlossaryChip")
  );
const relationSelect = () =>
  container.querySelector<HTMLSelectElement>(
    ".activeFindPanelGlossaryRelationSelect"
  );
const completionPopup = () =>
  container.querySelector<HTMLElement>(".activeFindPanelCompletion");
const completionOptions = () =>
  Array.from(
    container.querySelectorAll<HTMLLIElement>(".activeFindPanelCompletionOption")
  );
const activeCompletionOption = () =>
  container.querySelector<HTMLLIElement>(
    '.activeFindPanelCompletionOption[data-active="true"]'
  );

function keydown(
  target: HTMLElement,
  init: KeyboardEventInit & { key: string }
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init
  });
  act(() => target.dispatchEvent(event));
  return event;
}

function ctrlSpace(
  target: HTMLElement,
  overrides: Partial<KeyboardEventInit> = {}
): KeyboardEvent {
  return keydown(target, {
    key: " ",
    code: "Space",
    ctrlKey: true,
    ...overrides
  });
}

const GLOSSARY_CANDIDATES: ActiveFindPanelProps["glossaryCandidates"] = [
  {
    atomId: "a1",
    entryId: "e1",
    value: "シズク",
    matchFlags: 0,
    entryLabel: "シズク",
    isRepresentative: true
  },
  {
    atomId: "a2",
    entryId: "e1",
    value: "迷子",
    matchFlags: 0,
    entryLabel: "シズク",
    isRepresentative: false
  }
];
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
    act(() => typeIntoTextarea(q(), "hello"));
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

  it("Enter finds next, Ctrl+Enter also finds next, Escape closes (#456)", () => {
    const props = render({ query: "x", matchCount: 3, activeIndex: 0 });
    for (const init of [
      { key: "Enter" },
      { key: "Enter", ctrlKey: true },
      { key: "Escape" }
    ]) {
      act(() =>
        q().dispatchEvent(
          new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true })
        )
      );
    }
    expect(props.onNext).toHaveBeenCalledTimes(2);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("#456: Shift+Enter inserts a newline instead of navigating (no longer bound to previous)", () => {
    const props = render({ query: "x", matchCount: 3, activeIndex: 0 });
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      shiftKey: true,
      bubbles: true,
      cancelable: true
    });
    act(() => q().dispatchEvent(event));

    // Not prevented — the textarea's default newline-insertion behaviour runs.
    expect(event.defaultPrevented).toBe(false);
    expect(props.onNext).not.toHaveBeenCalled();
    expect(props.onPrevious).not.toHaveBeenCalled();
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
    act(() => typeIntoTextarea(replaceInput()!, "xyz"));
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

  it("#456: replace input Ctrl+Enter also triggers replace-current", () => {
    const props = render({ mode: "replace", replaceCurrentEnabled: true });
    act(() =>
      replaceInput()!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          ctrlKey: true,
          bubbles: true
        })
      )
    );
    expect(props.onReplaceCurrent).toHaveBeenCalledTimes(1);
  });

  it("#456: replace input Shift+Enter inserts a newline (no longer previous); Escape closes; IME Enter is ignored", () => {
    const props = render({ mode: "replace", replaceCurrentEnabled: true });
    const shiftEnter = new KeyboardEvent("keydown", {
      key: "Enter",
      shiftKey: true,
      bubbles: true,
      cancelable: true
    });
    act(() => replaceInput()!.dispatchEvent(shiftEnter));
    act(() =>
      replaceInput()!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    );
    const composing = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
    Object.defineProperty(composing, "isComposing", { value: true });
    act(() => replaceInput()!.dispatchEvent(composing));

    expect(shiftEnter.defaultPrevented).toBe(false);
    expect(props.onPrevious).not.toHaveBeenCalled();
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

describe("ActiveFindPanel — layout polish (#424 Slice 4 fix)", () => {
  it("puts the close [×] button on the mode-tab row, not the query row", () => {
    render({ mode: "search" });
    expect(modeRow().contains(closeButton())).toBe(true);
    expect(queryRow().contains(closeButton())).toBe(false);
    // the two mode tabs live in their own tablist group beside it
    expect(
      modeRow().querySelector('[role="tablist"] .activeFindPanelModeTab')
    ).not.toBeNull();
  });

  it("the close button still closes the panel and keeps its title / aria-label", () => {
    const props = render({ mode: "replace" });
    expect(closeButton().getAttribute("aria-label")).toBe(
      t("ja", "editor.find.close")
    );
    expect(closeButton().getAttribute("title")).toBe(
      t("ja", "editor.find.close")
    );
    act(() => closeButton().click());
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("the query row no longer contains a close button", () => {
    render({ mode: "replace" });
    expect(
      queryRow().querySelector(".activeFindPanelCloseButton")
    ).toBeNull();
  });

  it("mousedown on the close button is prevented (no focus steal)", () => {
    render({});
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true
    });
    closeButton().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("ActiveFindPanel — 全置換 button (#424 Slice 4)", () => {
  it("appears only in replace mode with a visible label + icon + title/aria-label", () => {
    render({ mode: "search" });
    expect(replaceAllButton()).toBeNull();

    render({ mode: "replace" });
    const button = replaceAllButton()!;
    expect(button).not.toBeNull();
    expect(button.textContent).toContain(t("ja", "editor.find.replaceAll"));
    expect(button.querySelector("svg")).not.toBeNull();
    expect(button.getAttribute("aria-label")).toBe(
      t("ja", "editor.find.replaceAll")
    );
    expect(button.getAttribute("title")).toBe(
      t("ja", "editor.find.replaceAllTooltip")
    );
  });

  it("is disabled unless the owner says replace-all is enabled", () => {
    render({ mode: "replace", replaceAllEnabled: false });
    expect(replaceAllButton()!.disabled).toBe(true);
    render({ mode: "replace", replaceAllEnabled: true });
    expect(replaceAllButton()!.disabled).toBe(false);
  });

  it("stays disabled with no matches / an invalid regex / an invalid template", () => {
    render({ mode: "replace", replaceAllEnabled: false, matchCount: 0 });
    expect(replaceAllButton()!.disabled).toBe(true);
    render({
      mode: "replace",
      replaceAllEnabled: false,
      regexError: "bad",
      options: { wholeWord: false, caseSensitive: false, useRegex: true }
    });
    expect(replaceAllButton()!.disabled).toBe(true);
    render({
      mode: "replace",
      replaceAllEnabled: false,
      templateError: "missingGroup",
      options: { wholeWord: false, caseSensitive: false, useRegex: true }
    });
    expect(replaceAllButton()!.disabled).toBe(true);
  });

  it("calls onReplaceAll when clicked", () => {
    const props = render({ mode: "replace", replaceAllEnabled: true });
    act(() => replaceAllButton()!.click());
    expect(props.onReplaceAll).toHaveBeenCalledTimes(1);
  });

  it("mousedown on the replace-all button is prevented (keeps input focus)", () => {
    render({ mode: "replace", replaceAllEnabled: true });
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true
    });
    replaceAllButton()!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("ActiveFindPanel — 語彙 icon toggles queryKind (#424 Slice 6)", () => {
  it("is an icon-only toggle in the header row, disabled in text mode when there are no candidates (#456: moved from the query row)", () => {
    render({ glossaryCandidates: [] });
    const button = glossaryButton();
    expect(button.closest(".activeFindPanelHeaderOptions")).not.toBeNull();
    expect(button.closest(".activeFindPanelModeRow")).not.toBeNull();
    expect(button.closest(".activeFindPanelQueryRow")).toBeNull();
    expect(button.textContent?.trim()).toBe("");
    expect(button.querySelector("svg")).not.toBeNull();
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("aria-label")).toBe(
      t("ja", "editor.find.queryKind.glossary")
    );
  });

  it("clicking it asks the owner to switch to glossary mode; clicking again returns to text", () => {
    const onQueryKindChange = vi.fn();
    render({ glossaryCandidates: GLOSSARY_CANDIDATES, onQueryKindChange });
    expect(glossaryButton().disabled).toBe(false);
    act(() => glossaryButton().click());
    expect(onQueryKindChange).toHaveBeenNthCalledWith(1, "glossary");

    render({
      glossaryCandidates: GLOSSARY_CANDIDATES,
      queryKind: "glossary",
      onQueryKindChange
    });
    expect(glossaryButton().getAttribute("aria-pressed")).toBe("true");
    act(() => glossaryButton().click());
    expect(onQueryKindChange).toHaveBeenNthCalledWith(2, "text");
  });

  it("text mode shows the text input and the Ab / Aa / .* options", () => {
    render({ queryKind: "text", glossaryCandidates: GLOSSARY_CANDIDATES });
    expect(container.querySelector(".activeFindPanelInput")).not.toBeNull();
    expect(optionToggles()).toHaveLength(3);
    expect(glossarySelect()).toBeNull();
  });

  it("glossary mode hides the text input + option toggles and shows the selector", () => {
    render({ queryKind: "glossary", glossaryCandidates: GLOSSARY_CANDIDATES });
    expect(
      container.querySelector(".activeFindPanelOptions")
    ).toBeNull();
    expect(glossarySelect()).not.toBeNull();
  });

  it("mousedown on the toggle is prevented (keeps input focus)", () => {
    render({ glossaryCandidates: GLOSSARY_CANDIDATES });
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true
    });
    glossaryButton().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("ActiveFindPanel — Glossary search mode (#424 Slice 6)", () => {
  function openSelect() {
    const input = glossarySelectInput();
    act(() => input.focus());
    keydown(input, { key: "ArrowDown" });
    return input;
  }

  it("Search tab uses a MULTI selector; Replace tab uses a SINGLE selector", () => {
    render({
      mode: "search",
      queryKind: "glossary",
      glossaryCandidates: GLOSSARY_CANDIDATES
    });
    expect(glossarySelect()!.getAttribute("data-variant")).toBe("multi");

    render({
      mode: "replace",
      queryKind: "glossary",
      glossaryCandidates: GLOSSARY_CANDIDATES
    });
    expect(glossarySelect()!.getAttribute("data-variant")).toBe("single");
  });

  it("the relation dropdown appears only in Search tab glossary mode, with Any / All / Nearby", () => {
    render({
      mode: "search",
      queryKind: "glossary",
      glossaryCandidates: GLOSSARY_CANDIDATES
    });
    const select = relationSelect()!;
    expect(select).not.toBeNull();
    expect(
      Array.from(select.options).map((option) => option.value)
    ).toEqual(["any", "all", "nearby"]);

    // #424 Slice 7: Replace tab never exposes the relation dropdown.
    render({
      mode: "replace",
      queryKind: "glossary",
      glossaryCandidates: GLOSSARY_CANDIDATES
    });
    expect(relationSelect()).toBeNull();
  });

  it("changing the relation dropdown reports the new value", () => {
    const onGlossaryRelationChange = vi.fn();
    render({
      mode: "search",
      queryKind: "glossary",
      glossaryCandidates: GLOSSARY_CANDIDATES,
      onGlossaryRelationChange
    });
    const select = relationSelect()!;
    act(() => {
      select.value = "all";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onGlossaryRelationChange).toHaveBeenCalledWith("all");
  });

  it("picking a candidate in the Search selector ADDS it to the multi selection", () => {
    const onSearchGlossaryAtomIdsChange = vi.fn();
    render({
      mode: "search",
      queryKind: "glossary",
      glossaryCandidates: GLOSSARY_CANDIDATES,
      searchGlossaryAtomIds: [],
      onSearchGlossaryAtomIdsChange
    });
    openSelect();
    expect(glossarySelectPopup()).not.toBeNull();
    act(() => glossarySelectOptions()[1].click()); // 迷子
    expect(onSearchGlossaryAtomIdsChange).toHaveBeenCalledWith(["a2"]);
  });

  it("picking a candidate in the Replace selector REPLACES the single selection", () => {
    const onReplaceGlossaryAtomIdChange = vi.fn();
    render({
      mode: "replace",
      queryKind: "glossary",
      glossaryCandidates: GLOSSARY_CANDIDATES,
      replaceGlossaryAtomId: "a1",
      onReplaceGlossaryAtomIdChange
    });
    openSelect();
    act(() => glossarySelectOptions()[1].click()); // 迷子
    expect(onReplaceGlossaryAtomIdChange).toHaveBeenCalledWith("a2");
  });

  it("shows a chip per selected atom (its RAW value) that can be removed", () => {
    const onSearchGlossaryAtomIdsChange = vi.fn();
    render({
      mode: "search",
      queryKind: "glossary",
      glossaryCandidates: GLOSSARY_CANDIDATES,
      searchGlossaryAtomIds: ["a1", "a2"],
      onSearchGlossaryAtomIdsChange
    });
    const chips = glossaryChips();
    expect(chips.map((chip) => chip.textContent)).toEqual([
      expect.stringContaining("シズク"),
      expect.stringContaining("迷子")
    ]);
    act(() =>
      chips[0]
        .querySelector<HTMLButtonElement>(".activeFindPanelGlossaryChipRemove")!
        .click()
    );
    expect(onSearchGlossaryAtomIdsChange).toHaveBeenCalledWith(["a2"]);
  });

  it("non-representative candidates show the → representative context", () => {
    render({
      mode: "search",
      queryKind: "glossary",
      glossaryCandidates: GLOSSARY_CANDIDATES
    });
    openSelect();
    const alias = glossarySelectOptions().find((option) =>
      option.textContent?.includes("迷子")
    )!;
    const detail = alias.querySelector(".activeFindPanelCompletionDetail");
    expect(detail!.textContent).toBe("→ シズク");
    const rep = glossarySelectOptions().find(
      (option) =>
        option.querySelector(".activeFindPanelCompletionLabel")?.textContent ===
        "シズク"
    )!;
    expect(rep.querySelector(".activeFindPanelCompletionDetail")).toBeNull();
  });

  it("Escape closes the selector popup without closing the panel", () => {
    const props = render({
      mode: "search",
      queryKind: "glossary",
      glossaryCandidates: GLOSSARY_CANDIDATES
    });
    const input = openSelect();
    expect(glossarySelectPopup()).not.toBeNull();
    keydown(input, { key: "Escape" });
    expect(glossarySelectPopup()).toBeNull();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("Ctrl+F / Ctrl+H from the glossary selector still switch tabs", () => {
    const onModeChange = vi.fn();
    render({
      mode: "search",
      queryKind: "glossary",
      glossaryCandidates: GLOSSARY_CANDIDATES,
      onModeChange
    });
    keydown(glossarySelectInput(), {
      key: "h",
      code: "KeyH",
      ctrlKey: true
    });
    expect(onModeChange).toHaveBeenCalledWith("replace");
  });

  it("no selected atom → navigation disabled and count blank", () => {
    render({
      mode: "search",
      queryKind: "glossary",
      glossaryCandidates: GLOSSARY_CANDIDATES,
      searchGlossaryAtomIds: [],
      matchCount: 0
    });
    expect(
      container.querySelector<HTMLButtonElement>(".activeFindPanelNextButton")!
        .disabled
    ).toBe(true);
    expect(countText()).toBe("");
  });

  it("with a selection + matches, the count shows and Replace All can be enabled", () => {
    render({
      mode: "replace",
      queryKind: "glossary",
      glossaryCandidates: GLOSSARY_CANDIDATES,
      replaceGlossaryAtomId: "a2",
      matchCount: 3,
      activeIndex: 0,
      replaceAllEnabled: true
    });
    expect(countText()).toBe(t("ja", "editor.find.matchCount", { current: 1, total: 3 }));
    expect(replaceAllButton()!.disabled).toBe(false);
    // no Ab / Aa / .* in glossary mode
    expect(container.querySelector(".activeFindPanelOptions")).toBeNull();
  });
});

describe("ActiveFindPanel — Glossary nearby relation (#424 Slice 7)", () => {
  const relationSummary = () =>
    container.querySelector(".activeFindPanelGlossaryRelationSummary");

  it("adds a Nearby option to the Search-tab relation dropdown", () => {
    render({
      mode: "search",
      queryKind: "glossary",
      glossaryCandidates: GLOSSARY_CANDIDATES
    });
    expect(
      Array.from(relationSelect()!.options).map((o) => o.value)
    ).toEqual(["any", "all", "nearby"]);
  });

  it("Nearby is never shown on the Replace tab", () => {
    render({
      mode: "replace",
      queryKind: "glossary",
      replaceGlossaryAtomId: "a1",
      glossaryCandidates: GLOSSARY_CANDIDATES
    });
    expect(relationSelect()).toBeNull();
  });

  it("selecting Nearby reports the new relation value", () => {
    const onGlossaryRelationChange = vi.fn();
    render({
      mode: "search",
      queryKind: "glossary",
      glossaryCandidates: GLOSSARY_CANDIDATES,
      onGlossaryRelationChange
    });
    const select = relationSelect()!;
    act(() => {
      select.value = "nearby";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onGlossaryRelationChange).toHaveBeenCalledWith("nearby");
  });

  it("shows a paragraph-unit summary only while Nearby is selected", () => {
    render({
      mode: "search",
      queryKind: "glossary",
      glossaryRelation: "any",
      glossaryCandidates: GLOSSARY_CANDIDATES,
      glossaryNearbySettings: {
        unit: "paragraphs",
        characterDistance: 500,
        paragraphDistance: 3
      }
    });
    expect(relationSummary()).toBeNull();

    render({
      mode: "search",
      queryKind: "glossary",
      glossaryRelation: "nearby",
      glossaryCandidates: GLOSSARY_CANDIDATES,
      glossaryNearbySettings: {
        unit: "paragraphs",
        characterDistance: 500,
        paragraphDistance: 3
      }
    });
    expect(relationSummary()!.textContent).toBe(
      t("ja", "editor.find.glossaryRelationSummary.paragraphs", { distance: 3 })
    );
  });

  it("shows a character-unit summary when the unit is characters", () => {
    render({
      mode: "search",
      queryKind: "glossary",
      glossaryRelation: "nearby",
      glossaryCandidates: GLOSSARY_CANDIDATES,
      glossaryNearbySettings: {
        unit: "characters",
        characterDistance: 800,
        paragraphDistance: 2
      }
    });
    expect(relationSummary()!.textContent).toBe(
      t("ja", "editor.find.glossaryRelationSummary.characters", { distance: 800 })
    );
  });
});

describe("ActiveFindPanel — Ctrl+Space Glossary IntelliSense (#424 Slice 5)", () => {
  it("Ctrl+Space in the query input opens the suggestions popup with candidates", () => {
    render({ glossaryCandidates: GLOSSARY_CANDIDATES });
    expect(completionPopup()).toBeNull();
    const event = ctrlSpace(q());
    expect(event.defaultPrevented).toBe(true);
    expect(completionPopup()).not.toBeNull();
    expect(completionOptions().map((o) => o.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("シズク")])
    );
  });

  it("Ctrl+Space in the replace input opens the suggestions popup", () => {
    render({ mode: "replace", glossaryCandidates: GLOSSARY_CANDIDATES });
    ctrlSpace(replaceInput()!);
    const popup = completionPopup();
    expect(popup).not.toBeNull();
    expect(popup!.closest(".activeFindPanelReplaceRow")).not.toBeNull();
  });

  it("Cmd+Space (metaKey) does NOT open the popup — editor parity, Ctrl+Space only", () => {
    const props = render({ glossaryCandidates: GLOSSARY_CANDIDATES });
    const cmd = keydown(q(), { key: " ", code: "Space", metaKey: true });
    expect(cmd.defaultPrevented).toBe(false);
    expect(completionPopup()).toBeNull();
    expect(props.onQueryChange).not.toHaveBeenCalled();

    // Ctrl+Meta+Space is likewise ignored (Ctrl-only trigger)
    const both = keydown(q(), {
      key: " ",
      code: "Space",
      ctrlKey: true,
      metaKey: true
    });
    expect(both.defaultPrevented).toBe(false);
    expect(completionPopup()).toBeNull();

    // ...and a plain Ctrl+Space still works from the same input
    ctrlSpace(q());
    expect(completionPopup()).not.toBeNull();
  });

  it("shows the → representative context for a non-representative atom", () => {
    render({ glossaryCandidates: GLOSSARY_CANDIDATES });
    ctrlSpace(q());
    const alias = completionOptions().find((o) =>
      o.textContent?.includes("迷子")
    )!;
    const detail = alias.querySelector(".activeFindPanelCompletionDetail");
    expect(detail).not.toBeNull();
    expect(detail!.textContent).toContain("シズク");
    expect(detail!.textContent).toContain("→");
    // a representative atom shows no context line
    const rep = completionOptions().find(
      (o) =>
        o.querySelector(".activeFindPanelCompletionLabel")?.textContent ===
        "シズク"
    )!;
    expect(rep.querySelector(".activeFindPanelCompletionDetail")).toBeNull();
  });

  it("renders editor-completion-shaped rows: <ul role=listbox> of one-line label + inline detail", () => {
    render({ glossaryCandidates: GLOSSARY_CANDIDATES });
    ctrlSpace(q());
    const popup = completionPopup()!;
    expect(popup.tagName).toBe("UL");
    expect(popup.getAttribute("role")).toBe("listbox");
    const alias = completionOptions().find((o) =>
      o.textContent?.includes("迷子")
    )!;
    expect(alias.tagName).toBe("LI");
    expect(alias.getAttribute("role")).toBe("option");
    // label + detail are siblings on the same row (not a stacked 2-line block)
    expect(alias.querySelector(".activeFindPanelCompletionLabel")!.textContent).toBe(
      "迷子"
    );
    expect(
      alias.querySelector(".activeFindPanelCompletionDetail")!.textContent
    ).toBe("→ シズク");
  });

  it("uses the same display text as the editor glossary completion helper", () => {
    render({ glossaryCandidates: GLOSSARY_CANDIDATES });
    ctrlSpace(q());
    const alias = completionOptions().find((o) =>
      o.textContent?.includes("迷子")
    )!;
    // glossaryCompletionCandidateDetail's contract: "→ " + representative form
    expect(
      glossaryCompletionCandidateDetail({ value: "迷子", entryLabel: "シズク" })
    ).toBe("→ シズク");
    expect(
      alias.querySelector(".activeFindPanelCompletionDetail")!.textContent
    ).toBe(glossaryCompletionCandidateDetail({ value: "迷子", entryLabel: "シズク" }));
  });

  it("Tab does not accept a candidate (editor parity) — it closes the popup and moves on", () => {
    const props = render({ glossaryCandidates: GLOSSARY_CANDIDATES });
    ctrlSpace(q());
    const tab = keydown(q(), { key: "Tab" });
    expect(tab.defaultPrevented).toBe(false);
    expect(props.onQueryChange).not.toHaveBeenCalled();
    expect(completionPopup()).toBeNull();
  });

  it("replace input completion consumes the matched prefix (editor parity)", () => {
    const props = render({
      mode: "replace",
      replaceText: "冒頭、迷",
      glossaryCandidates: GLOSSARY_CANDIDATES
    });
    const input = replaceInput()!;
    input.focus();
    input.setSelectionRange(4, 4); // caret right after the standalone "迷"
    ctrlSpace(input);
    // "迷" prefix-matches "迷子"; picking it replaces the "迷", not appends
    keydown(input, { key: "Enter" });
    expect(props.onReplaceTextChange).toHaveBeenLastCalledWith("冒頭、迷子");
  });

  it("ArrowDown / ArrowUp move the active candidate (with wrap-around)", () => {
    render({ glossaryCandidates: GLOSSARY_CANDIDATES });
    ctrlSpace(q());
    expect(activeCompletionOption()!.textContent).toContain("シズク");
    keydown(q(), { key: "ArrowDown" });
    expect(activeCompletionOption()!.textContent).toContain("迷子");
    keydown(q(), { key: "ArrowDown" });
    expect(activeCompletionOption()!.textContent).toContain("シズク");
    keydown(q(), { key: "ArrowUp" });
    expect(activeCompletionOption()!.textContent).toContain("迷子");
  });

  it("Enter selects the active candidate and inserts its RAW value (query = whole replace)", () => {
    const props = render({ glossaryCandidates: GLOSSARY_CANDIDATES });
    ctrlSpace(q());
    keydown(q(), { key: "ArrowDown" }); // -> 迷子
    const enter = keydown(q(), { key: "Enter" });
    expect(enter.defaultPrevented).toBe(true);
    expect(props.onQueryChange).toHaveBeenLastCalledWith("迷子");
    expect(completionPopup()).toBeNull();
    // Enter did NOT fall through to next-match navigation
    expect(props.onNext).not.toHaveBeenCalled();
  });

  it("clicking a candidate inserts its value and closes the popup", () => {
    const props = render({ glossaryCandidates: GLOSSARY_CANDIDATES });
    ctrlSpace(q());
    const alias = completionOptions().find((o) =>
      o.textContent?.includes("迷子")
    )!;
    act(() => alias.click());
    expect(props.onQueryChange).toHaveBeenLastCalledWith("迷子");
    expect(completionPopup()).toBeNull();
  });

  it("candidate mousedown is prevented so the click is not lost to input blur", () => {
    render({ glossaryCandidates: GLOSSARY_CANDIDATES });
    ctrlSpace(q());
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true
    });
    completionOptions()[0].dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("Escape closes the popup without closing the panel", () => {
    const props = render({ glossaryCandidates: GLOSSARY_CANDIDATES });
    ctrlSpace(q());
    expect(completionPopup()).not.toBeNull();
    const escape = keydown(q(), { key: "Escape" });
    expect(escape.defaultPrevented).toBe(true);
    expect(completionPopup()).toBeNull();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("replace input completion inserts the value at the caret (not a whole-value replace)", () => {
    // caret sits between two delimiters, so the completion prefix is empty and
    // every candidate is offered; the pick is inserted, keeping the surrounds.
    const props = render({
      mode: "replace",
      replaceText: "（）",
      glossaryCandidates: GLOSSARY_CANDIDATES
    });
    const input = replaceInput()!;
    input.focus();
    input.setSelectionRange(1, 1);
    ctrlSpace(input);
    keydown(input, { key: "Enter" }); // active = シズク
    expect(props.onReplaceTextChange).toHaveBeenLastCalledWith("（シズク）");
  });

  it("an empty glossary shows the empty state and does not crash", () => {
    render({ glossaryCandidates: [] });
    ctrlSpace(q());
    expect(completionPopup()).not.toBeNull();
    expect(completionOptions()).toHaveLength(0);
    expect(
      completionPopup()!.querySelector(".activeFindPanelCompletionEmpty")
        ?.textContent
    ).toBe(t("ja", "editor.find.glossaryEmpty"));
    // Enter on an empty list just closes the popup, no navigation
    const props = render({ glossaryCandidates: [] });
    keydown(q(), { key: "Enter" });
    expect(completionPopup()).toBeNull();
    expect(props.onNext).not.toHaveBeenCalled();
  });

  it("does not modify search options or mark-all", () => {
    const props = render({ glossaryCandidates: GLOSSARY_CANDIDATES });
    ctrlSpace(q());
    keydown(q(), { key: "Enter" });
    expect(props.onToggleOption).not.toHaveBeenCalled();
    expect(props.onToggleMarkAll).not.toHaveBeenCalled();
  });

  it("closes the popup when the panel switches modes", () => {
    render({ mode: "search", glossaryCandidates: GLOSSARY_CANDIDATES });
    ctrlSpace(q());
    expect(completionPopup()).not.toBeNull();
    render({ mode: "replace", glossaryCandidates: GLOSSARY_CANDIDATES });
    expect(completionPopup()).toBeNull();
  });

  describe("regressions with the popup", () => {
    it("Ctrl+F / Ctrl+H still switch modes while the popup is open", () => {
      const onModeChange = vi.fn();
      render({ mode: "search", onModeChange, glossaryCandidates: GLOSSARY_CANDIDATES });
      ctrlSpace(q());
      keydown(q(), { key: "h", code: "KeyH", ctrlKey: true });
      expect(onModeChange).toHaveBeenCalledWith("replace");
    });

    it("Enter in the query input still means next-match when the popup is closed", () => {
      const props = render({
        query: "x",
        matchCount: 2,
        activeIndex: 0,
        glossaryCandidates: GLOSSARY_CANDIDATES
      });
      keydown(q(), { key: "Enter" });
      expect(props.onNext).toHaveBeenCalledTimes(1);
    });

    it("Enter in the replace input still means replace-current when the popup is closed", () => {
      const props = render({
        mode: "replace",
        replaceCurrentEnabled: true,
        glossaryCandidates: GLOSSARY_CANDIDATES
      });
      keydown(replaceInput()!, { key: "Enter" });
      expect(props.onReplaceCurrent).toHaveBeenCalledTimes(1);
    });

    it("ignores Ctrl+Space / Enter while the IME is composing", () => {
      const props = render({ glossaryCandidates: GLOSSARY_CANDIDATES });
      const composing = new KeyboardEvent("keydown", {
        key: " ",
        code: "Space",
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      });
      Object.defineProperty(composing, "isComposing", { value: true });
      act(() => q().dispatchEvent(composing));
      expect(composing.defaultPrevented).toBe(false);
      expect(completionPopup()).toBeNull();
      expect(props.onQueryChange).not.toHaveBeenCalled();
    });
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

describe("ActiveFindPanel (#456 — multiline fields + header row layout)", () => {
  function headerOptions(): HTMLElement {
    return container.querySelector<HTMLElement>(
      ".activeFindPanelHeaderOptions"
    )!;
  }

  it("renders the query field as a textarea, not an <input>", () => {
    render();
    expect(q().tagName).toBe("TEXTAREA");
  });

  it("renders the replace field as a textarea, not an <input>", () => {
    render({ mode: "replace" });
    expect(replaceInput()!.tagName).toBe("TEXTAREA");
  });

  it("accepts and preserves a multiline query value", () => {
    const props = render();
    act(() => typeIntoTextarea(q(), "foo\nbar"));
    expect(props.onQueryChange).toHaveBeenCalledWith("foo\nbar");
  });

  it("preserves leading/trailing spaces and newlines in the replacement value", () => {
    const props = render({ mode: "replace" });
    act(() => typeIntoTextarea(replaceInput()!, " bar\nbaz\n"));
    expect(props.onReplaceTextChange).toHaveBeenCalledWith(" bar\nbaz\n");
  });

  it("keeps the Search / Replace tabs at the inline-start, separate from the options cluster", () => {
    render();
    const tabs = modeTabs();
    expect(tabs).toHaveLength(2);
    // The tabs live in their own tablist, a sibling of the options cluster -
    // not inside it.
    expect(
      headerOptions().querySelector(".activeFindPanelModeTab")
    ).toBeNull();
    expect(modeRow().contains(headerOptions())).toBe(true);
  });

  it("#456 follow-up: header row order is search tab, replace tab, glossary button, whole word, match case, regex, close (far right)", () => {
    render();
    const row = modeRow();
    // Every interactive control in the row, document order.
    const controls = Array.from(
      row.querySelectorAll<HTMLElement>(
        [
          ".activeFindPanelModeTab",
          ".activeFindPanelGlossaryButton",
          ".searchOptionToggle",
          ".activeFindPanelCloseButton"
        ].join(",")
      )
    );
    const label = (el: HTMLElement): string =>
      el.className.includes("activeFindPanelModeTab")
        ? (el.textContent ?? "")
        : (el.getAttribute("aria-label") ?? "");

    expect(controls.map(label)).toEqual([
      t("ja", "editor.find.mode.search"),
      t("ja", "editor.find.mode.replace"),
      t("ja", "editor.find.queryKind.glossary"),
      t("ja", "search.option.wholeWord"),
      t("ja", "search.option.caseSensitive"),
      t("ja", "search.option.useRegex"),
      t("ja", "editor.find.close")
    ]);
  });

  it("groups the glossary button + Ab/Aa/.* options as one cluster right after the tabs (not drifted toward the close button)", () => {
    render();
    const glossary = container.querySelector(".activeFindPanelGlossaryButton")!;
    const options = container.querySelector(".activeFindPanelOptions")!;
    expect(headerOptions().contains(glossary)).toBe(true);
    expect(headerOptions().contains(options)).toBe(true);
    // The close button is NOT part of this cluster - it is a sibling of it
    // in the row, pinned to the far right independently.
    expect(headerOptions().querySelector(".activeFindPanelCloseButton")).toBeNull();
    expect(
      modeRow().contains(
        container.querySelector(".activeFindPanelCloseButton")!
      )
    ).toBe(true);
  });

  it("hides the Ab/Aa/.* options (but keeps the glossary button) in glossary mode; close stays available", () => {
    render({ queryKind: "glossary", glossaryCandidates: GLOSSARY_CANDIDATES });
    expect(headerOptions().querySelector(".activeFindPanelOptions")).toBeNull();
    expect(
      headerOptions().querySelector(".activeFindPanelGlossaryButton")
    ).not.toBeNull();
    expect(
      container.querySelector(".activeFindPanelCloseButton")
    ).not.toBeNull();
  });

  it("#456 follow-up: the glossary button shows a visible pressed/toggled state via aria-pressed and data-active", () => {
    render({ glossaryCandidates: GLOSSARY_CANDIDATES });
    const button = () =>
      container.querySelector<HTMLButtonElement>(
        ".activeFindPanelGlossaryButton"
      )!;

    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(button().hasAttribute("data-active")).toBe(false);

    render({
      glossaryCandidates: GLOSSARY_CANDIDATES,
      queryKind: "glossary"
    });
    expect(button().getAttribute("aria-pressed")).toBe("true");
    expect(button().getAttribute("data-active")).toBe("true");
  });

  it("#456 follow-up: the glossary button's pressed state reuses the mark-toggle palette", () => {
    const styles = readFileSync("src/renderer/styles.css", "utf8");
    const start = styles.indexOf(
      '.activeFindPanelGlossaryButton[data-active="true"] {'
    );
    expect(start).toBeGreaterThan(-1);
    const end = styles.indexOf("}", start);
    const rule = styles.slice(start, end + 1);
    expect(rule).toContain("background: #dceafc");
    expect(rule).toContain("border-color: #7aa7d9");
  });
});
