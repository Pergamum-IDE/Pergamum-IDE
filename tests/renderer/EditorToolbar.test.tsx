// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jaTranslations } from "../../src/shared/i18n/ja";
import {
  EditorToolbar,
  type EditorToolbarProps
} from "../../src/renderer/components/EditorToolbar";

import type { TranslationValues } from "../../src/shared/i18n";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function mockTranslate(key: string, values?: TranslationValues): string {
  let text = (jaTranslations as any)[key] ?? key;
  if (values) {
    for (const [k, v] of Object.entries(values)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
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

function defaultProps(
  overrides: Partial<EditorToolbarProps> = {}
): EditorToolbarProps {
  return {
    canUseMarkdownToolbarCommands: true,
    canInsertTable: true,
    onApplyBold: vi.fn(),
    onApplyItalic: vi.fn(),
    onApplyStrikethrough: vi.fn(),
    isHeadingSelectorOpen: false,
    onToggleHeadingSelector: vi.fn(),
    onCloseHeadingSelector: vi.fn(),
    onSelectHeadingLevel: vi.fn(),
    onOpenLinkDialog: vi.fn(),
    onInsertHorizontalRule: vi.fn(),
    onInsertCodeBlock: vi.fn(),
    onInsertTable: vi.fn(),
    hasEditableTextLikeDocument: true,
    onOpenRubyDialog: vi.fn(),
    onOpenEmphasisDialog: vi.fn(),
    translate: mockTranslate,
    ...overrides
  };
}

function renderToolbar(overrides: Partial<EditorToolbarProps> = {}) {
  const props = defaultProps(overrides);
  act(() => {
    root.render(<EditorToolbar {...props} />);
  });
  return props;
}

function toolbarButtons(): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll("button.editorToolbarButton")
  ) as HTMLButtonElement[];
}

describe("EditorToolbar", () => {
  it("renders all buttons in the approved order", () => {
    renderToolbar();

    const buttons = toolbarButtons();
    expect(buttons).toHaveLength(10);
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "見出しを挿入",
      "太字",
      "斜体",
      "取消線",
      "リンクを挿入",
      "水平線",
      "コードブロック",
      "表を挿入",
      "ルビ",
      "傍点"
    ]);
  });

  it("renders four visual separators between the command groups", () => {
    renderToolbar();
    expect(
      container.querySelectorAll(".editorToolbarSeparator")
    ).toHaveLength(4);
  });

  it("every button is icon-only with aria-label and title, no visible text", () => {
    renderToolbar();
    for (const button of toolbarButtons()) {
      expect(button.getAttribute("aria-label")).toBeTruthy();
      expect(button.getAttribute("title")).toBe(
        button.getAttribute("aria-label")
      );
      expect(button.textContent?.trim()).toBe("");
      expect(button.querySelector("svg")).not.toBeNull();
    }
  });

  it("disables Heading/Bold/Italic/Strikethrough/Link/HorizontalRule/CodeBlock when canUseMarkdownToolbarCommands is false", () => {
    renderToolbar({ canUseMarkdownToolbarCommands: false });
    const [
      heading,
      bold,
      italic,
      strikethrough,
      link,
      horizontalRule,
      codeBlock,
      table,
      ruby,
      emphasis
    ] = toolbarButtons();
    expect(heading.disabled).toBe(true);
    expect(bold.disabled).toBe(true);
    expect(italic.disabled).toBe(true);
    expect(strikethrough.disabled).toBe(true);
    expect(link.disabled).toBe(true);
    expect(horizontalRule.disabled).toBe(true);
    expect(codeBlock.disabled).toBe(true);
    // Table's own gate is independent (still passed as true here).
    expect(table.disabled).toBe(false);
    // Ruby / Emphasis follow their own, looser gate (still passed as true here).
    expect(ruby.disabled).toBe(false);
    expect(emphasis.disabled).toBe(false);
  });

  it("disables Ruby/Emphasis when hasEditableTextLikeDocument is false, independent of the Markdown gate", () => {
    renderToolbar({ hasEditableTextLikeDocument: false });
    const buttons = toolbarButtons();
    const ruby = buttons[8];
    const emphasis = buttons[9];
    expect(ruby.disabled).toBe(true);
    expect(emphasis.disabled).toBe(true);
    // Markdown-specific commands stay enabled (still passed as true here).
    expect(buttons[0].disabled).toBe(false);
  });

  it("Bold / Italic / Strikethrough buttons call their handlers when clicked", () => {
    const props = renderToolbar();
    const [, bold, italic, strikethrough] = toolbarButtons();

    act(() => bold.click());
    expect(props.onApplyBold).toHaveBeenCalledOnce();

    act(() => italic.click());
    expect(props.onApplyItalic).toHaveBeenCalledOnce();

    act(() => strikethrough.click());
    expect(props.onApplyStrikethrough).toHaveBeenCalledOnce();
  });

  it("Link button calls onOpenLinkDialog with the button element", () => {
    const props = renderToolbar();
    const [, , , , link] = toolbarButtons();

    act(() => link.click());
    expect(props.onOpenLinkDialog).toHaveBeenCalledWith(link);
  });

  it("Horizontal rule button calls onInsertHorizontalRule when clicked", () => {
    const props = renderToolbar();
    const [, , , , , horizontalRule] = toolbarButtons();

    act(() => horizontalRule.click());
    expect(props.onInsertHorizontalRule).toHaveBeenCalledOnce();
  });

  it("Code block button calls onInsertCodeBlock when clicked", () => {
    const props = renderToolbar();
    const [, , , , , , codeBlock] = toolbarButtons();

    act(() => codeBlock.click());
    expect(props.onInsertCodeBlock).toHaveBeenCalledOnce();
  });

  it("Ruby button calls onOpenRubyDialog with the button element", () => {
    const props = renderToolbar();
    const buttons = toolbarButtons();
    const ruby = buttons[8];

    act(() => ruby.click());
    expect(props.onOpenRubyDialog).toHaveBeenCalledWith(ruby);
  });

  it("Emphasis button calls onOpenEmphasisDialog with the button element", () => {
    const props = renderToolbar();
    const buttons = toolbarButtons();
    const emphasis = buttons[9];

    act(() => emphasis.click());
    expect(props.onOpenEmphasisDialog).toHaveBeenCalledWith(emphasis);
  });

  it("Heading button calls onToggleHeadingSelector when clicked", () => {
    const props = renderToolbar();
    const [heading] = toolbarButtons();

    act(() => heading.click());
    expect(props.onToggleHeadingSelector).toHaveBeenCalledOnce();
  });

  it("shows the heading level popover when isHeadingSelectorOpen is true and selects a level", () => {
    const props = renderToolbar({ isHeadingSelectorOpen: true });

    const popover = container.querySelector(".headingLevelPopover");
    expect(popover).not.toBeNull();

    const options = container.querySelectorAll(".headingLevelPopoverOption");
    expect(options).toHaveLength(7); // H1..H6 + normal paragraph

    act(() => {
      (options[1] as HTMLButtonElement).click(); // H2
    });

    expect(props.onCloseHeadingSelector).toHaveBeenCalledOnce();
    expect(props.onSelectHeadingLevel).toHaveBeenCalledWith(2);
  });

  it("does not show the heading level popover when disabled even if isHeadingSelectorOpen is true", () => {
    renderToolbar({
      isHeadingSelectorOpen: true,
      canUseMarkdownToolbarCommands: false
    });
    expect(container.querySelector(".headingLevelPopover")).toBeNull();
  });

  it("renders disabled icon-only table button with aria-label and title when canInsertTable is false", () => {
    renderToolbar({ canInsertTable: false });

    const buttons = toolbarButtons();
    const table = buttons[7];
    expect(table.disabled).toBe(true);
    expect(table.getAttribute("aria-label")).toBe("表を挿入");
    expect(table.getAttribute("title")).toBe("表を挿入");
    expect(table.textContent?.trim()).toBe("");
  });

  it("opens popover when clicking enabled icon-only table button and selects size", () => {
    const onInsertTable = vi.fn();
    renderToolbar({ canInsertTable: true, onInsertTable });

    const buttons = toolbarButtons();
    const table = buttons[7];
    expect(table.disabled).toBe(false);

    // Popover initially not present
    expect(container.querySelector(".tableSizePopover")).toBeNull();

    // Click button to open popover
    act(() => {
      table.click();
    });

    const popover = container.querySelector(".tableSizePopover");
    expect(popover).not.toBeNull();
    expect(container.querySelector(".tableSizePopoverLabel")?.textContent).toBe("1 x 1");

    // Click cell (3, 2)
    const cells = container.querySelectorAll(".tableSizePopoverCell");
    // Row 2, Col 3 is index (row-1)*6 + (col-1) = 1*6 + 2 = 8
    const cell3x2 = cells[8] as HTMLButtonElement;

    act(() => {
      cell3x2.click();
    });

    expect(onInsertTable).toHaveBeenCalledWith(3, 2);
    // Popover closes after selection
    expect(container.querySelector(".tableSizePopover")).toBeNull();
  });
});
