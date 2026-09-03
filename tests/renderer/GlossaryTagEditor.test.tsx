// @vitest-environment happy-dom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Translate } from "../../src/shared/i18n";
import { GlossaryTagEditor } from "../../src/renderer/GlossaryTagEditor";
import { autoGlossaryTagForegroundRgb } from "../../src/shared/glossaryTagColor";
import {
  createGlossaryTagDraftFromTag,
  type GlossaryTagDraft
} from "../../src/renderer/glossaryTagDraft";

const translate: Translate = (key) => key;

const savedTag = {
  id: "018f4b8c-7a2b-7c3d-8e4f-300000000001",
  label: "武将",
  description: null,
  backgroundRgb: "#1f77b4",
  foregroundRgb: "#ffffff",
  sortOrder: 0,
  createdAt: "2026-09-02T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z"
};

function editDraft(): GlossaryTagDraft {
  return createGlossaryTagDraftFromTag(savedTag);
}

describe("GlossaryTagEditor (#375) — markup", () => {
  it("renders label / description / background / foreground fields and a live preview, with no Auto button", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryTagEditor, {
        draft: editDraft(),
        translate,
        onChange: () => undefined,
        onSubmit: () => undefined
      })
    );

    expect(markup).toContain("glossaryTagEditor.name");
    expect(markup).toContain("glossaryTagEditor.description");
    expect(markup).toContain("glossaryTagEditor.background");
    expect(markup).toContain("glossaryTagEditor.foreground");
    expect(markup).toContain("glossaryTagEditor.randomBackground");
    expect(markup).toContain("glossaryTagChip");
    expect(markup).toContain("background-color:#1f77b4");
    // #375: background AND foreground each get a text input + a native color
    // picker.
    expect(markup.match(/type="color"/g)).toHaveLength(2);
    expect(markup.match(/glossaryTagEditorColorInput/g)).toHaveLength(2);
    // #375: the manual auto-foreground button is gone.
    expect(markup).not.toContain("glossaryTagEditor.autoForeground");
    // It is a plain body form — no title heading, no action buttons.
    expect(markup).not.toContain("<h2");
    expect(markup).not.toContain("glossaryTagEditorSave");
    expect(markup).not.toContain("glossaryTagEditorCancel");
  });

  it("shows a validity message for an empty label", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryTagEditor, {
        draft: { ...editDraft(), label: "" },
        translate,
        onChange: () => undefined,
        onSubmit: () => undefined
      })
    );

    expect(markup).toContain("glossaryTagEditor.validity.emptyLabel");
    expect(markup).toContain('role="alert"');
  });

  it("shows an operation error when the label is otherwise valid", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryTagEditor, {
        draft: editDraft(),
        translate,
        operationError: "glossaryTagEditor.saveFailed",
        onChange: () => undefined,
        onSubmit: () => undefined
      })
    );

    expect(markup).toContain("glossaryTagEditor.saveFailed");
  });
});

describe("GlossaryTagEditor (#375) — interaction", () => {
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
    draft: GlossaryTagDraft,
    onChange: (d: GlossaryTagDraft) => void,
    onSubmit: () => void = vi.fn()
  ) {
    act(() => {
      root.render(
        React.createElement(GlossaryTagEditor, {
          draft,
          translate,
          onChange,
          onSubmit
        })
      );
    });
  }

  function findButton(text: string): HTMLButtonElement {
    return Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === text
    )!;
  }

  it("the Random button replaces the background AND recomputes the foreground via YIQ", () => {
    const onChange = vi.fn();
    render(editDraft(), onChange);

    act(() => findButton("glossaryTagEditor.randomBackground").click());

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as GlossaryTagDraft;
    expect(next.backgroundRgb).toMatch(/^#[0-9a-f]{6}$/);
    expect(next.foregroundRgb).toBe(
      autoGlossaryTagForegroundRgb(next.backgroundRgb)
    );
  });

  it("lets the user type the foreground by hand (no auto button)", () => {
    const onChange = vi.fn();
    render(editDraft(), onChange);

    expect(findButton("glossaryTagEditor.autoForeground")).toBeUndefined();

    const fgInput = container.querySelectorAll<HTMLInputElement>(
      ".glossaryTagEditorColorInput"
    )[1];
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )!.set!;
      setter.call(fgInput, "#123456");
      fgInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(onChange.mock.calls[0][0].foregroundRgb).toBe("#123456");
  });

  it("keeps the native color pickers in sync with the text inputs", () => {
    const onChange = vi.fn();
    render(editDraft(), onChange);

    const pickers = container.querySelectorAll<HTMLInputElement>(
      'input[type="color"]'
    );
    expect(pickers).toHaveLength(2);
    // The background picker mirrors the current #RRGGBB text value.
    expect(pickers[0].value).toBe("#1f77b4");
    expect(pickers[1].value).toBe("#ffffff");

    // Choosing a color in the background picker writes it back as #RRGGBB.
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )!.set!;
      setter.call(pickers[0], "#00ff00");
      pickers[0].dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChange.mock.calls[0][0].backgroundRgb).toBe("#00ff00");

    // The foreground picker is a manual control too — no auto mode.
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )!.set!;
      setter.call(pickers[1], "#abcdef");
      pickers[1].dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChange.mock.calls[1][0].foregroundRgb).toBe("#abcdef");
  });

  it("submits through onSubmit only when the draft is valid", () => {
    const onSubmit = vi.fn();
    render({ ...editDraft(), label: "" }, vi.fn(), onSubmit);

    act(() => {
      container
        .querySelector("form")!
        .dispatchEvent(
          new window.Event("submit", { bubbles: true, cancelable: true })
        );
    });
    expect(onSubmit).not.toHaveBeenCalled();

    render(editDraft(), vi.fn(), onSubmit);
    act(() => {
      container
        .querySelector("form")!
        .dispatchEvent(
          new window.Event("submit", { bubbles: true, cancelable: true })
        );
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
