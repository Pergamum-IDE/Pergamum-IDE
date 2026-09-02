// @vitest-environment happy-dom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Translate } from "../../src/shared/i18n";
import { GlossaryTagEditor } from "../../src/renderer/GlossaryTagEditor";
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
  it("renders name / description / background / foreground fields, random + auto buttons, and a live preview chip", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryTagEditor, {
        draft: editDraft(),
        translate,
        onChange: () => undefined,
        onSubmit: () => undefined,
        onCancel: () => undefined
      })
    );

    expect(markup).toContain("glossaryTagEditor.name");
    expect(markup).toContain("glossaryTagEditor.description");
    expect(markup).toContain("glossaryTagEditor.background");
    expect(markup).toContain("glossaryTagEditor.foreground");
    expect(markup).toContain("glossaryTagEditor.randomBackground");
    expect(markup).toContain("glossaryTagEditor.autoForeground");
    expect(markup).toContain("glossaryTagChip");
    expect(markup).toContain("background-color:#1f77b4");
    expect(markup).toContain("glossaryTagEditor.titleEdit");
  });

  it("disables Save and shows a validity message for an empty label", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryTagEditor, {
        draft: { ...editDraft(), label: "" },
        translate,
        onChange: () => undefined,
        onSubmit: () => undefined,
        onCancel: () => undefined
      })
    );

    expect(markup).toMatch(/glossaryTagEditorSave[^>]*disabled/);
    expect(markup).toContain("glossaryTagEditor.validity.emptyLabel");
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

  function render(draft: GlossaryTagDraft, onChange: (d: GlossaryTagDraft) => void) {
    act(() => {
      root.render(
        React.createElement(GlossaryTagEditor, {
          draft,
          translate,
          onChange,
          onSubmit: vi.fn(),
          onCancel: vi.fn()
        })
      );
    });
  }

  it("the Random button replaces the background with a #rrggbb value", () => {
    const onChange = vi.fn();
    render(editDraft(), onChange);

    const randomButton = Array.from(
      container.querySelectorAll("button")
    ).find((b) => b.textContent === "glossaryTagEditor.randomBackground")!;
    act(() => randomButton.click());

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].backgroundRgb).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("the Auto button recomputes the foreground from the background via YIQ", () => {
    const onChange = vi.fn();
    render({ ...editDraft(), backgroundRgb: "#ffffff" }, onChange);

    const autoButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "glossaryTagEditor.autoForeground"
    )!;
    act(() => autoButton.click());

    expect(onChange.mock.calls[0][0].foregroundRgb).toBe("#000000");
  });

  it("submits through onSubmit only when the draft is valid", () => {
    const onSubmit = vi.fn();
    act(() => {
      root.render(
        React.createElement(GlossaryTagEditor, {
          draft: { ...editDraft(), label: "" },
          translate,
          onChange: vi.fn(),
          onSubmit,
          onCancel: vi.fn()
        })
      );
    });

    act(() => {
      container
        .querySelector("form")!
        .dispatchEvent(
          new window.Event("submit", { bubbles: true, cancelable: true })
        );
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
