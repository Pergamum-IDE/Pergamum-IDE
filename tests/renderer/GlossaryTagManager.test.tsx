// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GlossaryTag } from "../../src/shared/glossary";
import type { Translate } from "../../src/shared/i18n";
import { GlossaryTagManager } from "../../src/renderer/GlossaryTagManager";

const translate: Translate = (key) => key;
const ts = "2026-09-02T00:00:00.000Z";

function tag(id: string, label: string): GlossaryTag {
  return {
    id,
    label,
    description: null,
    backgroundRgb: "#1f77b4",
    foregroundRgb: "#ffffff",
    sortOrder: 0,
    createdAt: ts,
    updatedAt: ts
  };
}

const tagA = tag("018f4b8c-7a2b-7c3d-8e4f-300000000001", "武将");

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

function render(props: Partial<React.ComponentProps<typeof GlossaryTagManager>> = {}) {
  const handlers = {
    onCreateTag: vi.fn().mockResolvedValue(undefined),
    onUpdateTag: vi.fn().mockResolvedValue(undefined),
    onDeleteTag: vi.fn().mockResolvedValue(undefined)
  };
  act(() => {
    root.render(
      React.createElement(GlossaryTagManager, {
        tags: [tagA],
        translate,
        ...handlers,
        ...props
      })
    );
  });
  return handlers;
}

function button(text: string): HTMLButtonElement {
  const found = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button")
  ).find((b) => b.textContent === text);
  if (!found) {
    throw new Error(`No button with text "${text}"`);
  }
  return found;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("GlossaryTagManager (#375)", () => {
  it("lists existing tags with edit / delete affordances", () => {
    render();
    expect(container.textContent).toContain("武将");
    expect(button("glossaryTagEditor.editTag")).toBeTruthy();
    expect(button("glossaryTagEditor.deleteTag")).toBeTruthy();
  });

  it("shows the empty notice when there are no tags", () => {
    render({ tags: [] });
    expect(container.textContent).toContain("glossaryTagEditor.listEmpty");
  });

  it("opens with the new-tag form already up when autoStartCreate is set", () => {
    render({ tags: [], autoStartCreate: true });
    // The GlossaryTagEditor form is mounted from the first render.
    expect(container.querySelector(".glossaryTagEditor")).not.toBeNull();
  });

  it("stays closed by default (autoStartCreate unset)", () => {
    render({ tags: [] });
    expect(container.querySelector(".glossaryTagEditor")).toBeNull();
  });

  it("hard-deletes through onDeleteTag with a confirmation message", () => {
    const handlers = render();
    act(() => button("glossaryTagEditor.deleteTag").click());
    expect(handlers.onDeleteTag).toHaveBeenCalledWith(
      tagA.id,
      "glossaryTagEditor.deleteConfirmMessage"
    );
  });

  it("opens the editor for a new tag and creates it via onCreateTag", async () => {
    const handlers = render();
    act(() => button("glossaryTagEditor.newTag").click());

    const nameInput = container.querySelector<HTMLInputElement>(
      ".glossaryTagEditor input[type='text']"
    )!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )!.set!;
      setter.call(nameInput, "地名");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    act(() =>
      container
        .querySelector("form")!
        .dispatchEvent(
          new window.Event("submit", { bubbles: true, cancelable: true })
        )
    );
    await flush();

    expect(handlers.onCreateTag).toHaveBeenCalledTimes(1);
    expect(handlers.onCreateTag.mock.calls[0][0]).toMatchObject({
      label: "地名"
    });
    // Editor closes after a successful create.
    expect(container.querySelector(".glossaryTagEditor")).toBeNull();
  });

  it("opens the editor for an existing tag and renames it via onUpdateTag", async () => {
    const handlers = render();
    act(() => button("glossaryTagEditor.editTag").click());

    const nameInput = container.querySelector<HTMLInputElement>(
      ".glossaryTagEditor input[type='text']"
    )!;
    expect(nameInput.value).toBe("武将");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )!.set!;
      setter.call(nameInput, "軍人");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    act(() =>
      container
        .querySelector("form")!
        .dispatchEvent(
          new window.Event("submit", { bubbles: true, cancelable: true })
        )
    );
    await flush();

    expect(handlers.onUpdateTag).toHaveBeenCalledWith(
      expect.objectContaining({ id: tagA.id, label: "軍人" })
    );
  });
});
