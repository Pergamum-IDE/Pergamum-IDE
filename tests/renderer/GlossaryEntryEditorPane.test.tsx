// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t, type Translate } from "../../src/shared/i18n";
import type {
  CreateGlossaryEntryInput,
  GlossaryTag
} from "../../src/shared/glossary";
import { GlossaryEntryEditorPane } from "../../src/renderer/GlossaryEntryEditorPane";
import {
  DEFAULT_GLOSSARY_ENTRY_PRESET_REPRESENTATIVE,
  GLOSSARY_ENTRY_EDITOR_PANE_DEFAULT_HEIGHT,
  GLOSSARY_ENTRY_EDITOR_PANE_MIN_HEIGHT,
  clampGlossaryEntryEditorPaneHeight,
  closeGlossaryEntryEditorPane,
  createInitialGlossaryEntryEditorPaneState,
  openGlossaryEntryCreatePane,
  openGlossaryEntryEditPane,
  type OpenGlossaryEntryEditorPaneState
} from "../../src/renderer/glossaryEntryEditorPaneState";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const translate: Translate = (key, values) => t("ja", key, values);

const tagWarrior: GlossaryTag = {
  id: "018f-tag-warrior",
  label: "武将",
  description: null,
  backgroundRgb: "#334155",
  foregroundRgb: "#ffffff",
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};
const tagPlace: GlossaryTag = {
  ...tagWarrior,
  id: "018f-tag-place",
  label: "地名",
  sortOrder: 1
};

describe("glossaryEntryEditorPaneState — Slice 2 operation API (#436)", () => {
  it("starts closed", () => {
    expect(createInitialGlossaryEntryEditorPaneState()).toEqual({
      isOpen: false
    });
  });

  it("create open sets mode 'create' and keeps the source", () => {
    expect(
      openGlossaryEntryCreatePane({ source: "glossary-pane" })
    ).toMatchObject({
      isOpen: true,
      mode: "create",
      source: "glossary-pane"
    });
  });

  it("create open keeps an explicit presetRepresentative", () => {
    const state = openGlossaryEntryCreatePane({
      source: "editor-selection",
      presetRepresentative: "シズク"
    });

    expect(state).toEqual({
      isOpen: true,
      mode: "create",
      source: "editor-selection",
      presetRepresentative: "シズク"
    });
  });

  it("create open falls back to 新しい語彙 when presetRepresentative is missing or empty", () => {
    expect(DEFAULT_GLOSSARY_ENTRY_PRESET_REPRESENTATIVE).toBe("新しい語彙");

    for (const preset of [undefined, ""]) {
      const state = openGlossaryEntryCreatePane({
        source: "glossary-settings",
        presetRepresentative: preset
      });
      expect(state).toMatchObject({
        mode: "create",
        presetRepresentative: "新しい語彙"
      });
    }
  });

  it("edit open sets mode 'edit' and keeps the entryId and source", () => {
    expect(
      openGlossaryEntryEditPane({
        source: "glossary-settings",
        entryId: "entry-42"
      })
    ).toEqual({
      isOpen: true,
      mode: "edit",
      source: "glossary-settings",
      entryId: "entry-42"
    });
  });

  it("close returns the closed state", () => {
    expect(closeGlossaryEntryEditorPane()).toEqual({ isOpen: false });
  });
});

describe("clampGlossaryEntryEditorPaneHeight — Slice 6 remediation (#436)", () => {
  it("defaults above the minimum", () => {
    expect(GLOSSARY_ENTRY_EDITOR_PANE_DEFAULT_HEIGHT).toBeGreaterThan(
      GLOSSARY_ENTRY_EDITOR_PANE_MIN_HEIGHT
    );
  });

  it("raises a too-small height to the minimum", () => {
    expect(clampGlossaryEntryEditorPaneHeight(40)).toBe(
      GLOSSARY_ENTRY_EDITOR_PANE_MIN_HEIGHT
    );
    expect(clampGlossaryEntryEditorPaneHeight(40, 1000)).toBe(
      GLOSSARY_ENTRY_EDITOR_PANE_MIN_HEIGHT
    );
  });

  it("passes a mid-range height through when the area is roomy", () => {
    expect(clampGlossaryEntryEditorPaneHeight(300, 1000)).toBe(300);
  });

  it("caps the height to 65% of the editor area", () => {
    expect(clampGlossaryEntryEditorPaneHeight(900, 1000)).toBe(650);
  });

  it("keeps a minimum of content visible above the pane in a short area", () => {
    // 400 area, content-min 160 → pane capped at 240 even though 65% = 260.
    expect(clampGlossaryEntryEditorPaneHeight(900, 400)).toBe(240);
  });

  it("lets the pane shrink below its own minimum when the area cannot fit both", () => {
    const clamped = clampGlossaryEntryEditorPaneHeight(900, 200);
    expect(clamped).toBeLessThan(GLOSSARY_ENTRY_EDITOR_PANE_MIN_HEIGHT);
    expect(clamped).toBeGreaterThan(0);
  });
});

describe("GlossaryEntryEditorPane (#436)", () => {
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
  });

  function renderPane(options: {
    state: OpenGlossaryEntryEditorPaneState;
    height?: number;
    availableTags?: readonly GlossaryTag[];
    onCreateEntry?: (input: CreateGlossaryEntryInput) => Promise<boolean>;
    onClose?: () => void;
  }): void {
    act(() => {
      root.render(
        <GlossaryEntryEditorPane
          state={options.state}
          translate={translate}
          height={options.height ?? 280}
          availableTags={options.availableTags ?? []}
          onCreateEntry={
            options.onCreateEntry ?? (() => Promise.resolve(true))
          }
          onClose={options.onClose ?? (() => undefined)}
        />
      );
    });
  }

  function field(name: string): string | undefined {
    return (
      container.querySelector(`[data-field="${name}"]`)?.textContent ??
      undefined
    );
  }

  function representativeInput(): HTMLInputElement {
    const input = container.querySelector<HTMLInputElement>(
      ".glossaryEntryCreateFormRepresentative"
    );
    if (!input) {
      throw new Error("no representative input");
    }
    return input;
  }

  function setInputValue(input: HTMLInputElement, value: string): void {
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function submitForm(): void {
    act(() => {
      container
        .querySelector("form.glossaryEntryCreateForm")!
        .dispatchEvent(
          new window.Event("submit", { bubbles: true, cancelable: true })
        );
    });
  }

  it("renders the create form seeded from presetRepresentative", () => {
    renderPane({
      state: openGlossaryEntryCreatePane({
        source: "glossary-pane",
        presetRepresentative: "織田信長"
      })
    });

    const pane = container.querySelector(".glossaryEntryEditorPane");
    expect(pane?.getAttribute("data-pane-mode")).toBe("create");
    expect(pane?.getAttribute("data-pane-source")).toBe("glossary-pane");
    expect(representativeInput().value).toBe("織田信長");
    expect(
      container.querySelector(".glossaryEntryCreateFormSubmit")
    ).not.toBeNull();
    expect(
      container.querySelector(".glossaryEntryCreateFormCancel")
    ).not.toBeNull();
    // No debug echo in create mode any more.
    expect(container.querySelector(".glossaryEntryEditorPaneDebug")).toBeNull();
  });

  it("seeds the input with 新しい語彙 for a preset-less side-pane open", () => {
    renderPane({
      state: openGlossaryEntryCreatePane({ source: "glossary-pane" })
    });
    expect(representativeInput().value).toBe("新しい語彙");
  });

  it("shows the available tags and toggles selection", () => {
    renderPane({
      state: openGlossaryEntryCreatePane({ source: "glossary-settings" }),
      availableTags: [tagWarrior, tagPlace]
    });

    const toggles = container.querySelectorAll<HTMLButtonElement>(
      ".glossaryEntryCreateFormTagToggle"
    );
    expect(toggles).toHaveLength(2);
    expect(toggles[0].getAttribute("aria-pressed")).toBe("false");
    // "creating without tags" hint while nothing is selected
    expect(container.textContent).toContain("タグなしで作成します");

    act(() => toggles[0].click());
    expect(
      container
        .querySelectorAll(".glossaryEntryCreateFormTagToggle")[0]
        .getAttribute("aria-pressed")
    ).toBe("true");
    expect(container.textContent).not.toContain("タグなしで作成します");
  });

  it("shows a hint and still allows creating when no tags exist", async () => {
    const onCreateEntry = vi.fn(() => Promise.resolve(true));
    renderPane({
      state: openGlossaryEntryCreatePane({
        source: "glossary-pane",
        presetRepresentative: "港町"
      }),
      availableTags: [],
      onCreateEntry
    });

    expect(container.textContent).toContain("利用できるタグがありません");

    submitForm();
    await act(async () => {
      await Promise.resolve();
    });

    expect(onCreateEntry).toHaveBeenCalledWith({
      description: "",
      atoms: [{ value: "港町", matchFlags: 0 }],
      tagIds: []
    });
  });

  it("trims the representative and passes selected tags on create, then closes", async () => {
    const onCreateEntry = vi.fn(() => Promise.resolve(true));
    const onClose = vi.fn();
    renderPane({
      state: openGlossaryEntryCreatePane({ source: "glossary-settings" }),
      availableTags: [tagWarrior, tagPlace],
      onCreateEntry,
      onClose
    });

    setInputValue(representativeInput(), "  徳川家康  ");
    act(() =>
      container
        .querySelectorAll<HTMLButtonElement>(
          ".glossaryEntryCreateFormTagToggle"
        )[1]
        .click()
    );

    submitForm();
    await act(async () => {
      await Promise.resolve();
    });

    expect(onCreateEntry).toHaveBeenCalledWith({
      description: "",
      atoms: [{ value: "徳川家康", matchFlags: 0 }],
      tagIds: [tagPlace.id]
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("blocks creating a blank / whitespace-only representative and shows an error", async () => {
    const onCreateEntry = vi.fn(() => Promise.resolve(true));
    renderPane({
      state: openGlossaryEntryCreatePane({ source: "glossary-pane" }),
      onCreateEntry
    });

    setInputValue(representativeInput(), "   ");
    submitForm();
    await act(async () => {
      await Promise.resolve();
    });

    expect(onCreateEntry).not.toHaveBeenCalled();
    expect(
      container.querySelector(".glossaryEntryCreateFormError")?.textContent
    ).toBe("代表表記を入力してください。");
  });

  it("shows an error and stays open when create fails", async () => {
    const onCreateEntry = vi.fn(() => Promise.resolve(false));
    const onClose = vi.fn();
    renderPane({
      state: openGlossaryEntryCreatePane({
        source: "glossary-pane",
        presetRepresentative: "五右衛門"
      }),
      onCreateEntry,
      onClose
    });

    submitForm();
    await act(async () => {
      await Promise.resolve();
    });

    expect(onCreateEntry).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(
      container.querySelector(".glossaryEntryCreateFormError")?.textContent
    ).toBe("語彙を作成できませんでした。");
  });

  it("prevents a double submit while a create is in flight", async () => {
    let resolveCreate: (ok: boolean) => void = () => undefined;
    const onCreateEntry = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveCreate = resolve;
        })
    );
    renderPane({
      state: openGlossaryEntryCreatePane({
        source: "glossary-pane",
        presetRepresentative: "半兵衛"
      }),
      onCreateEntry
    });

    submitForm();
    submitForm();
    submitForm();
    expect(onCreateEntry).toHaveBeenCalledTimes(1);
    expect(
      container.querySelector<HTMLButtonElement>(
        ".glossaryEntryCreateFormSubmit"
      )?.disabled
    ).toBe(true);

    await act(async () => {
      resolveCreate(false);
      await Promise.resolve();
    });
  });

  it("keeps edit mode as a debug echo of the pane state", () => {
    renderPane({
      state: openGlossaryEntryEditPane({
        source: "glossary-settings",
        entryId: "entry-7"
      })
    });

    expect(field("mode")).toBe("edit");
    expect(field("source")).toBe("glossary-settings");
    expect(field("entryId")).toBe("entry-7");
    expect(
      container.querySelector(".glossaryEntryCreateForm")
    ).toBeNull();
  });

  it("applies the supplied height to the pane (Slice 6 remediation)", () => {
    renderPane({
      state: openGlossaryEntryCreatePane({ source: "glossary-pane" }),
      height: 320
    });
    const pane = container.querySelector<HTMLElement>(
      ".glossaryEntryEditorPane"
    );
    expect(pane?.style.height).toBe("320px");
  });

  it("invokes onClose from the header close control", () => {
    const onClose = vi.fn();
    renderPane({
      state: openGlossaryEntryCreatePane({ source: "glossary-pane" }),
      onClose
    });

    const closeButton = container.querySelector<HTMLButtonElement>(
      ".glossaryEntryEditorPaneCloseButton"
    );
    expect(closeButton?.textContent).toBe("閉じる");
    act(() => {
      closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
