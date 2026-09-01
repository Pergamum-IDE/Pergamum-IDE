// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkbenchFilesSidebar } from "../../src/renderer/WorkbenchFilesSidebar";
import { extractMarkdownOutline } from "../../src/shared/markdownOutline";
import { t, type Translate } from "../../src/shared/i18n";

const translate: Translate = (key, values) => t("en", key, values);

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
  overrides: Partial<Parameters<typeof WorkbenchFilesSidebar>[0]> = {}
) {
  act(() => {
    root.render(
      <WorkbenchFilesSidebar
        fileExplorer={<div data-testid="file-explorer">FE</div>}
        translate={translate}
        markdownOutline={
          overrides.markdownOutline ??
          extractMarkdownOutline("# A\n## B\n## C\n## D")
        }
        activeEditorIsMarkdown={overrides.activeEditorIsMarkdown ?? true}
        onOutlineHeadingClick={overrides.onOutlineHeadingClick ?? vi.fn()}
      />
    );
  });
}

function toggle(): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(
    ".collapsibleSidebarSectionHeader"
  )!;
}
function body(): HTMLElement | null {
  return container.querySelector<HTMLElement>(".collapsibleSidebarSectionBody");
}
function handle(): HTMLElement | null {
  return container.querySelector<HTMLElement>(
    ".workbenchFilesSidebarResizeHandle"
  );
}
function expand(): void {
  if (toggle().getAttribute("aria-expanded") === "false") {
    act(() => toggle().click());
  }
}
function drag(from: number, to: number): void {
  const el = handle()!;
  act(() => {
    el.dispatchEvent(
      Object.assign(new Event("pointerdown", { bubbles: true }), {
        button: 0,
        pointerId: 1,
        clientY: from
      })
    );
  });
  act(() => {
    el.dispatchEvent(
      Object.assign(new Event("pointermove", { bubbles: true }), {
        pointerId: 1,
        clientY: to
      })
    );
  });
  act(() => {
    el.dispatchEvent(
      Object.assign(new Event("pointerup", { bubbles: true }), { pointerId: 1 })
    );
  });
}

describe("WorkbenchFilesSidebar — Outline resize / collapse (#352)", () => {
  it("keeps the File Explorer and starts with the Outline collapsed (header only, no body, no handle)", () => {
    render();
    expect(container.querySelector('[data-testid="file-explorer"]')).not.toBeNull();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(body()).toBeNull();
    expect(handle()).toBeNull();
  });

  it("shows the body and the resize handle once expanded", () => {
    render();
    expand();
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(body()).not.toBeNull();
    expect(handle()).not.toBeNull();
    expect(container.querySelector(".markdownOutlineTree")).not.toBeNull();
  });

  it("changes the Outline body height with a pointer drag on the handle", () => {
    render();
    expand();
    const before = body()!.style.height;
    expect(before).toBe("200px"); // default

    // drag the handle UP by 60px → the Outline pane grows
    drag(300, 240);
    const grown = parseInt(body()!.style.height, 10);
    expect(grown).toBeGreaterThan(200);

    // drag DOWN by 120px from the new position → it shrinks
    drag(240, 360);
    const shrunk = parseInt(body()!.style.height, 10);
    expect(shrunk).toBeLessThan(grown);
  });

  it("clamps the height to a sane minimum", () => {
    render();
    expand();
    drag(300, 3000); // yank far down
    expect(parseInt(body()!.style.height, 10)).toBeGreaterThanOrEqual(96);
  });

  it("restores the previous height when re-expanded after a collapse", () => {
    render();
    expand();
    drag(300, 240); // grow
    const grown = body()!.style.height;

    act(() => toggle().click()); // collapse
    expect(body()).toBeNull();
    act(() => toggle().click()); // expand again

    expect(body()!.style.height).toBe(grown);
  });

  it("does not render a heading tree when the active editor is not Markdown", () => {
    render({ activeEditorIsMarkdown: false, markdownOutline: null });
    expand();
    expect(container.querySelector(".markdownOutlineTree")).toBeNull();
    expect(container.textContent).toContain(
      t("en", "outline.empty.notMarkdown")
    );
  });
});
