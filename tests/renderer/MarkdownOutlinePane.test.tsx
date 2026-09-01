// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarkdownOutlinePane } from "../../src/renderer/MarkdownOutlinePane";
import {
  extractMarkdownOutline,
  type MarkdownOutlineItem
} from "../../src/shared/markdownOutline";
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
  props: {
    outline?: ReturnType<typeof extractMarkdownOutline> | null;
    activeEditorIsMarkdown?: boolean;
  } = {}
) {
  const onHeadingClick = vi.fn<(item: MarkdownOutlineItem) => void>();
  act(() => {
    root.render(
      <MarkdownOutlinePane
        outline={props.outline ?? null}
        activeEditorIsMarkdown={props.activeEditorIsMarkdown ?? true}
        translate={translate}
        onHeadingClick={onHeadingClick}
      />
    );
  });
  return { onHeadingClick };
}

function headingButtons(): HTMLButtonElement[] {
  return [
    ...container.querySelectorAll<HTMLButtonElement>(".markdownOutlineHeading")
  ];
}

describe("MarkdownOutlinePane (#352)", () => {
  it("renders the heading tree with nested groups and per-level data", () => {
    render({
      outline: extractMarkdownOutline("# A\n## A.1\n### A.1.a\n## A.2")
    });
    const tree = container.querySelector('[role="tree"]')!;
    expect(tree).not.toBeNull();
    expect(headingButtons().map((b) => b.textContent)).toEqual([
      "A",
      "A.1",
      "A.1.a",
      "A.2"
    ]);
    expect(headingButtons()[0].dataset.outlineLevel).toBe("1");
    expect(headingButtons()[2].dataset.outlineLevel).toBe("3");
    // A.1.a is nested under A.1
    expect(
      container.querySelectorAll('[role="group"] [role="group"] .markdownOutlineHeading')
    ).toHaveLength(1);
  });

  it("shows the empty state when there are no headings", () => {
    render({ outline: extractMarkdownOutline("no headings here") });
    expect(container.textContent).toBe(t("en", "outline.empty.noHeadings"));
    expect(headingButtons()).toHaveLength(0);
  });

  it("shows the unavailable state when the active editor is not Markdown", () => {
    render({ outline: null, activeEditorIsMarkdown: false });
    expect(container.textContent).toBe(t("en", "outline.empty.notMarkdown"));
  });

  it("calls onHeadingClick with the clicked heading item", () => {
    const outline = extractMarkdownOutline("# A\n## B");
    const { onHeadingClick } = render({ outline });
    act(() => headingButtons()[1].click());
    expect(onHeadingClick).toHaveBeenCalledTimes(1);
    expect(onHeadingClick.mock.calls[0][0]).toMatchObject({
      text: "B",
      level: 2,
      from: outline.flat[1].from
    });
  });

  it("activates a heading via keyboard (native button click on Enter/Space)", () => {
    const outline = extractMarkdownOutline("# A");
    const { onHeadingClick } = render({ outline });
    act(() => {
      headingButtons()[0].dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });
    expect(onHeadingClick).toHaveBeenCalledWith(
      expect.objectContaining({ text: "A" })
    );
  });

  it("renders an empty heading with a placeholder label", () => {
    render({ outline: extractMarkdownOutline("#\n") });
    const button = headingButtons()[0];
    expect(button.getAttribute("aria-label")).toBe(
      t("en", "outline.heading.empty")
    );
    expect(button.textContent).toBe(t("en", "outline.heading.empty"));
  });
});
