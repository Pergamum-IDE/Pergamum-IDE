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

interface PaneProps {
  outline?: ReturnType<typeof extractMarkdownOutline> | null;
  activeEditorIsMarkdown?: boolean;
}

/**
 * The pane is CONTROLLED — this harness supplies the collapsed-set state the
 * way `WorkbenchFilesSidebar` does, so a chevron click actually toggles.
 */
function Harness(props: {
  outline: ReturnType<typeof extractMarkdownOutline> | null;
  activeEditorIsMarkdown: boolean;
  onHeadingClick: (item: MarkdownOutlineItem) => void;
  onToggleSpy?: (itemId: string) => void;
}): JSX.Element {
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(
    () => new Set()
  );
  return (
    <MarkdownOutlinePane
      outline={props.outline}
      activeEditorIsMarkdown={props.activeEditorIsMarkdown}
      collapsedItemIds={collapsed}
      onToggleItemCollapsed={(itemId) => {
        props.onToggleSpy?.(itemId);
        setCollapsed((current) => {
          const next = new Set(current);
          if (next.has(itemId)) {
            next.delete(itemId);
          } else {
            next.add(itemId);
          }
          return next;
        });
      }}
      translate={translate}
      onHeadingClick={props.onHeadingClick}
    />
  );
}

function render(props: PaneProps = {}) {
  const onHeadingClick = vi.fn<(item: MarkdownOutlineItem) => void>();
  const onToggleSpy = vi.fn<(itemId: string) => void>();
  const draw = (next: PaneProps): void => {
    act(() => {
      root.render(
        <Harness
          outline={next.outline ?? null}
          activeEditorIsMarkdown={next.activeEditorIsMarkdown ?? true}
          onHeadingClick={onHeadingClick}
          onToggleSpy={onToggleSpy}
        />
      );
    });
  };
  draw(props);
  return { onHeadingClick, onToggleSpy, rerender: draw };
}

function headingButtons(): HTMLButtonElement[] {
  return [
    ...container.querySelectorAll<HTMLButtonElement>(".markdownOutlineHeading")
  ];
}

function chevronButtons(): HTMLButtonElement[] {
  return [
    ...container.querySelectorAll<HTMLButtonElement>(
      ".markdownOutlineTreeChevron"
    )
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

  it("shows a collapse chevron only for headings that have children", () => {
    render({ outline: extractMarkdownOutline("# A\n## A.1\n# B") });
    // A has a child, B does not.
    const items = [
      ...container.querySelectorAll<HTMLLIElement>(".markdownOutlineTreeItem")
    ];
    const rowA = items[0].querySelector(".markdownOutlineTreeRow")!;
    const rowB = items[2].querySelector(".markdownOutlineTreeRow")!;
    expect(rowA.querySelector(".markdownOutlineTreeChevron")).not.toBeNull();
    expect(rowB.querySelector(".markdownOutlineTreeChevron")).toBeNull();
    // childless rows still get an alignment placeholder
    expect(
      rowB.querySelector(".markdownOutlineTreeChevronPlaceholder")
    ).not.toBeNull();
  });

  it("keeps the jump button and the collapse button as separate elements", () => {
    render({ outline: extractMarkdownOutline("# A\n## A.1") });
    const chevron = chevronButtons()[0];
    const heading = headingButtons()[0];
    expect(chevron).not.toBe(heading);
    expect(chevron.classList.contains("markdownOutlineHeading")).toBe(false);
    expect(heading.classList.contains("markdownOutlineTreeChevron")).toBe(false);
  });

  it("hides children on chevron click and shows them again on a second click", () => {
    render({ outline: extractMarkdownOutline("# A\n## A.1\n### A.1.a") });
    expect(headingButtons().map((b) => b.textContent)).toEqual([
      "A",
      "A.1",
      "A.1.a"
    ]);

    act(() => chevronButtons()[0].click()); // collapse A
    expect(headingButtons().map((b) => b.textContent)).toEqual(["A"]);
    expect(chevronButtons()[0].getAttribute("aria-expanded")).toBe("false");
    expect(chevronButtons()[0].getAttribute("aria-label")).toBe(
      t("en", "outline.item.expand")
    );

    act(() => chevronButtons()[0].click()); // expand A
    expect(headingButtons().map((b) => b.textContent)).toEqual([
      "A",
      "A.1",
      "A.1.a"
    ]);
    expect(chevronButtons()[0].getAttribute("aria-expanded")).toBe("true");
  });

  it("reports the toggled item id to the host and never jumps on a chevron click", () => {
    const outline = extractMarkdownOutline("# A\n## A.1");
    const { onHeadingClick, onToggleSpy } = render({ outline });
    act(() => chevronButtons()[0].click());
    expect(onToggleSpy).toHaveBeenCalledTimes(1);
    expect(onToggleSpy).toHaveBeenCalledWith(outline.tree[0].id);
    expect(onHeadingClick).not.toHaveBeenCalled();
  });

  it("jumps (and does not toggle) when the heading text is clicked", () => {
    const { onHeadingClick, onToggleSpy } = render({
      outline: extractMarkdownOutline("# A\n## A.1")
    });
    act(() => headingButtons()[0].click());
    expect(onHeadingClick).toHaveBeenCalledTimes(1);
    expect(onToggleSpy).not.toHaveBeenCalled();
    // children still visible — a heading click never collapses
    expect(headingButtons().map((b) => b.textContent)).toEqual(["A", "A.1"]);
  });

  it("reflects the controlled collapsedItemIds prop", () => {
    const outline = extractMarkdownOutline("# A\n## A.1");
    act(() => {
      root.render(
        <MarkdownOutlinePane
          outline={outline}
          activeEditorIsMarkdown
          collapsedItemIds={new Set([outline.tree[0].id])}
          onToggleItemCollapsed={vi.fn()}
          translate={translate}
          onHeadingClick={vi.fn()}
        />
      );
    });
    // A is collapsed via the prop → its child is not rendered
    expect(headingButtons().map((b) => b.textContent)).toEqual(["A"]);
    expect(chevronButtons()[0].getAttribute("aria-expanded")).toBe("false");
  });
});
