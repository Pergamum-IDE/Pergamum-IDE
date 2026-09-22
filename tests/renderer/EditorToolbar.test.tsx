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

const originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "matchMedia"
);
const originalAnimateDescriptor = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "animate"
);

function restoreProperty(
  target: object,
  property: PropertyKey,
  descriptor: PropertyDescriptor | undefined
): void {
  if (descriptor) {
    Object.defineProperty(target, property, descriptor);
    return;
  }

  delete (target as any)[property];
}

function mockTranslate(key: string, values?: TranslationValues): string {
  let text = (jaTranslations as any)[key] ?? key;
  if (values) {
    for (const [k, v] of Object.entries(values)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
}

function mockMatchMedia(prefersReducedMotion: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => {
      return {
        matches:
          query === "(prefers-reduced-motion: reduce)"
            ? prefersReducedMotion
            : false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      } as unknown as MediaQueryList;
    })
  });
}

function mockElementAnimate(finished: Promise<void>): ReturnType<typeof vi.fn> {
  const animate = vi.fn(() => {
    return {
      finished,
      cancel: vi.fn()
    } as unknown as Animation;
  });

  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    writable: true,
    value: animate
  });

  return animate;
}

function domRect(
  left: number,
  top: number,
  width: number,
  height: number
): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({})
  } as DOMRect;
}

function mockLaunchAnimationRects(): void {
  const originalGetBoundingClientRect =
    HTMLElement.prototype.getBoundingClientRect;

  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement): DOMRect {
      if (this.classList.contains("toolbarCommandBoxBody")) {
        return domRect(20, 12, 160, 28);
      }

      if (this.classList.contains("commandPaletteLaunchMeasureInput")) {
        return domRect(260, 96, 420, 26);
      }

      return originalGetBoundingClientRect.call(this);
    }
  );
}

function clickWithPointer(button: HTMLButtonElement): void {
  button.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      detail: 1
    })
  );
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
  document
    .querySelectorAll(".commandPaletteLaunchGhost, .commandPaletteLaunchMeasure")
    .forEach((element) => element.remove());
  vi.restoreAllMocks();
  restoreProperty(window, "matchMedia", originalMatchMediaDescriptor);
  restoreProperty(Element.prototype, "animate", originalAnimateDescriptor);
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
    onApplyList: vi.fn(),
    onOutdent: vi.fn(),
    onIndent: vi.fn(),
    onOpenLinkDialog: vi.fn(),
    onInsertHorizontalRule: vi.fn(),
    onInsertCodeBlock: vi.fn(),
    canInsertImage: true,
    onOpenImageInsertion: vi.fn(),
    onInsertTable: vi.fn(),
    hasEditableTextLikeDocument: true,
    onOpenRubyDialog: vi.fn(),
    onOpenEmphasisDialog: vi.fn(),
    canTogglePreview: true,
    isPreviewVisible: true,
    onTogglePreview: vi.fn(),
    isCommandPaletteOpen: false,
    commandPaletteLaunchAnimationDurationMs: 200,
    onOpenCommandPalette: vi.fn(),
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

const BUTTON_ORDER = [
  "見出しを挿入",
  "太字",
  "斜体",
  "取消線",
  "非オーダーリスト",
  "オーダーリスト",
  "チェックリスト",
  "アウトデント",
  "インデント",
  "リンクを挿入",
  "水平線",
  "コードブロック",
  "画像を挿入",
  "表を挿入",
  "ルビ",
  "傍点",
  "プレビューを切り替え"
];

describe("EditorToolbar", () => {
  it("renders all buttons in the approved order", () => {
    renderToolbar();

    const buttons = toolbarButtons();
    expect(buttons).toHaveLength(BUTTON_ORDER.length);
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(
      BUTTON_ORDER
    );
  });

  it("renders separators between command groups and keeps the right-end separator", () => {
    renderToolbar();
    expect(
      container.querySelectorAll(".editorToolbarSeparator")
    ).toHaveLength(8);
  });

  it("renders the Command Box before the Heading button in the centered toolbar flow", () => {
    renderToolbar();
    const toolbar = container.querySelector(".editorToolbar")!;
    const children = Array.from(toolbar.children) as HTMLElement[];

    expect(children[0].classList.contains("toolbarCommandBoxGroup")).toBe(
      true
    );
    expect(children[0].querySelector(".toolbarCommandBox")).not.toBeNull();
    expect(children[1].classList.contains("editorToolbarSeparator")).toBe(true);
    expect(
      children[2]
        .querySelector("button.editorToolbarButton")
        ?.getAttribute("aria-label")
    ).toBe("見出しを挿入");
    expect(
      children[children.length - 1].classList.contains("editorToolbarSeparator")
    ).toBe(true);
  });

  it("Command Box initial mode is commands (prefix '>')", () => {
    renderToolbar();
    const prefixBtn = container.querySelector(
      "[data-testid='toolbarCommandBoxPrefix']"
    ) as HTMLButtonElement | null;
    expect(prefixBtn).not.toBeNull();
    expect(prefixBtn!.dataset.mode).toBe("commands");
  });

  it("Command Box prefix button cycles to the next mode when clicked", () => {
    const onOpenCommandPalette = vi.fn();
    renderToolbar({ onOpenCommandPalette });
    const prefixBtn = container.querySelector(
      "[data-testid='toolbarCommandBoxPrefix']"
    ) as HTMLButtonElement;
    const bodyBtn = container.querySelector(
      "[data-testid='toolbarCommandBoxBody']"
    ) as HTMLButtonElement;

    // Initial state: commands
    expect(prefixBtn.dataset.mode).toBe("commands");
    expect(bodyBtn.dataset.mode).toBe("commands");

    // Click once → projectFiles
    act(() => prefixBtn.click());
    expect(prefixBtn.dataset.mode).toBe("projectFiles");
    expect(bodyBtn.dataset.mode).toBe("projectFiles");
    expect(onOpenCommandPalette).not.toHaveBeenCalled();
  });

  it("Command Box launcher body calls onOpenCommandPalette with the current mode's prefix", () => {
    const onOpenCommandPalette = vi.fn();
    renderToolbar({ onOpenCommandPalette });

    const bodyBtn = container.querySelector(
      "[data-testid='toolbarCommandBoxBody']"
    ) as HTMLButtonElement;

    act(() => bodyBtn.click());
    // Initial mode is commands → prefix ">"
    expect(onOpenCommandPalette).toHaveBeenCalledWith(">");
  });

  it("Command Box launcher body calls onOpenCommandPalette with '' when mode is projectFiles", () => {
    const onOpenCommandPalette = vi.fn();
    renderToolbar({ onOpenCommandPalette });

    const prefixBtn = container.querySelector(
      "[data-testid='toolbarCommandBoxPrefix']"
    ) as HTMLButtonElement;
    const bodyBtn = container.querySelector(
      "[data-testid='toolbarCommandBoxBody']"
    ) as HTMLButtonElement;

    // Advance to projectFiles
    act(() => prefixBtn.click());

    act(() => bodyBtn.click());
    // projectFiles mode → prefix "" (empty string, NOT ">")
    expect(onOpenCommandPalette).toHaveBeenCalledWith("");
    expect(onOpenCommandPalette).not.toHaveBeenCalledWith(">");
  });

  it("Command Box launcher opens each cycled mode with the matching prefix", () => {
    const onOpenCommandPalette = vi.fn();
    renderToolbar({ onOpenCommandPalette });

    const prefixBtn = container.querySelector(
      "[data-testid='toolbarCommandBoxPrefix']"
    ) as HTMLButtonElement;
    const bodyBtn = container.querySelector(
      "[data-testid='toolbarCommandBoxBody']"
    ) as HTMLButtonElement;
    const expectedPrefixes = [">", "", "#", "@", ":", "%"];

    for (const expectedPrefix of expectedPrefixes) {
      act(() => bodyBtn.click());
      expect(onOpenCommandPalette).toHaveBeenLastCalledWith(expectedPrefix);
      act(() => prefixBtn.click());
    }
  });

  it("Command Box pointer click animates the launcher before opening the Command Palette", async () => {
    const onOpenCommandPalette = vi.fn();
    let resolveAnimation: () => void = () => undefined;
    const finished = new Promise<void>((resolve) => {
      resolveAnimation = resolve;
    });
    const animate = mockElementAnimate(finished);
    mockMatchMedia(false);
    mockLaunchAnimationRects();
    renderToolbar({ onOpenCommandPalette });

    const bodyBtn = container.querySelector(
      "[data-testid='toolbarCommandBoxBody']"
    ) as HTMLButtonElement;

    act(() => clickWithPointer(bodyBtn));

    expect(animate).toHaveBeenCalledOnce();
    expect(animate.mock.calls[0]?.[1]).toMatchObject({ duration: 200 });
    expect(onOpenCommandPalette).not.toHaveBeenCalled();
    expect(document.querySelector(".commandPaletteLaunchGhost")).not.toBeNull();

    await act(async () => {
      resolveAnimation();
      await finished;
      await Promise.resolve();
    });

    expect(onOpenCommandPalette).toHaveBeenCalledWith(">");
    expect(document.querySelector(".commandPaletteLaunchGhost")).toBeNull();
  });

  it("Command Box launch animation preserves the selected mode prefix", async () => {
    const onOpenCommandPalette = vi.fn();
    let resolveAnimation: () => void = () => undefined;
    const finished = new Promise<void>((resolve) => {
      resolveAnimation = resolve;
    });
    mockElementAnimate(finished);
    mockMatchMedia(false);
    mockLaunchAnimationRects();
    renderToolbar({ onOpenCommandPalette });

    const prefixBtn = container.querySelector(
      "[data-testid='toolbarCommandBoxPrefix']"
    ) as HTMLButtonElement;
    const bodyBtn = container.querySelector(
      "[data-testid='toolbarCommandBoxBody']"
    ) as HTMLButtonElement;

    act(() => prefixBtn.click());
    act(() => clickWithPointer(bodyBtn));

    await act(async () => {
      resolveAnimation();
      await finished;
      await Promise.resolve();
    });

    expect(onOpenCommandPalette).toHaveBeenCalledWith("");
  });

  it("Command Box launch animation uses the configured duration", () => {
    const onOpenCommandPalette = vi.fn();
    const animate = mockElementAnimate(new Promise(() => undefined));
    mockMatchMedia(false);
    mockLaunchAnimationRects();
    renderToolbar({
      commandPaletteLaunchAnimationDurationMs: 500,
      onOpenCommandPalette
    });

    const bodyBtn = container.querySelector(
      "[data-testid='toolbarCommandBoxBody']"
    ) as HTMLButtonElement;

    act(() => clickWithPointer(bodyBtn));

    expect(animate).toHaveBeenCalledOnce();
    expect(animate.mock.calls[0]?.[1]).toMatchObject({ duration: 500 });
    expect(onOpenCommandPalette).not.toHaveBeenCalled();
  });

  it("Command Box body opens immediately when launch animation duration is 0", () => {
    const onOpenCommandPalette = vi.fn();
    const animate = mockElementAnimate(Promise.resolve());
    mockMatchMedia(false);
    mockLaunchAnimationRects();
    renderToolbar({
      commandPaletteLaunchAnimationDurationMs: 0,
      onOpenCommandPalette
    });

    const bodyBtn = container.querySelector(
      "[data-testid='toolbarCommandBoxBody']"
    ) as HTMLButtonElement;

    act(() => clickWithPointer(bodyBtn));

    expect(animate).not.toHaveBeenCalled();
    expect(onOpenCommandPalette).toHaveBeenCalledWith(">");
  });

  it("Command Box body opens immediately when reduced motion is requested", () => {
    const onOpenCommandPalette = vi.fn();
    const animate = mockElementAnimate(Promise.resolve());
    mockMatchMedia(true);
    mockLaunchAnimationRects();
    renderToolbar({
      commandPaletteLaunchAnimationDurationMs: 500,
      onOpenCommandPalette
    });

    const bodyBtn = container.querySelector(
      "[data-testid='toolbarCommandBoxBody']"
    ) as HTMLButtonElement;

    act(() => clickWithPointer(bodyBtn));

    expect(animate).not.toHaveBeenCalled();
    expect(onOpenCommandPalette).toHaveBeenCalledWith(">");
  });

  it("Command Box body skips duplicate animation when the Command Palette is already open", () => {
    const onOpenCommandPalette = vi.fn();
    const animate = mockElementAnimate(Promise.resolve());
    mockMatchMedia(false);
    mockLaunchAnimationRects();
    renderToolbar({ isCommandPaletteOpen: true, onOpenCommandPalette });

    const bodyBtn = container.querySelector(
      "[data-testid='toolbarCommandBoxBody']"
    ) as HTMLButtonElement;

    act(() => clickWithPointer(bodyBtn));

    expect(animate).not.toHaveBeenCalled();
    expect(onOpenCommandPalette).toHaveBeenCalledWith(">");
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

  it("disables Heading/Bold/Italic/Strikethrough/List/Link/HorizontalRule/CodeBlock when canUseMarkdownToolbarCommands is false", () => {
    renderToolbar({ canUseMarkdownToolbarCommands: false });
    const buttons = toolbarButtons();
    const [
      heading,
      bold,
      italic,
      strikethrough,
      unorderedList,
      orderedList,
      checklist,
      ,
      ,
      link,
      horizontalRule,
      codeBlock,
      image,
      table,
      ruby,
      emphasis
    ] = buttons;
    expect(heading.disabled).toBe(true);
    expect(bold.disabled).toBe(true);
    expect(italic.disabled).toBe(true);
    expect(strikethrough.disabled).toBe(true);
    expect(unorderedList.disabled).toBe(true);
    expect(orderedList.disabled).toBe(true);
    expect(checklist.disabled).toBe(true);
    expect(link.disabled).toBe(true);
    expect(horizontalRule.disabled).toBe(true);
    expect(codeBlock.disabled).toBe(true);
    // Image / Table / Outdent / Indent / Ruby / Emphasis use their own,
    // independent gates (still passed as true/enabled here).
    expect(image.disabled).toBe(false);
    expect(table.disabled).toBe(false);
    expect(ruby.disabled).toBe(false);
    expect(emphasis.disabled).toBe(false);
  });

  it("disables Outdent/Indent/Ruby/Emphasis when hasEditableTextLikeDocument is false, independent of the Markdown gate", () => {
    renderToolbar({ hasEditableTextLikeDocument: false });
    const buttons = toolbarButtons();
    const outdent = buttons[7];
    const indent = buttons[8];
    const ruby = buttons[14];
    const emphasis = buttons[15];
    expect(outdent.disabled).toBe(true);
    expect(indent.disabled).toBe(true);
    expect(ruby.disabled).toBe(true);
    expect(emphasis.disabled).toBe(true);
    // Markdown-specific commands stay enabled (still passed as true here).
    expect(buttons[0].disabled).toBe(false);
    expect(buttons[4].disabled).toBe(false);
  });

  it("disables Image when canInsertImage is false, independent of the other gates", () => {
    renderToolbar({ canInsertImage: false });
    const buttons = toolbarButtons();
    const image = buttons[12];
    expect(image.disabled).toBe(true);
    // Markdown-specific commands and Table stay enabled (still passed as
    // true here).
    expect(buttons[0].disabled).toBe(false);
    expect(buttons[13].disabled).toBe(false);
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

  it("Unordered / Ordered / Checklist buttons call onApplyList with the right kind", () => {
    const props = renderToolbar();
    const buttons = toolbarButtons();

    act(() => buttons[4].click());
    expect(props.onApplyList).toHaveBeenCalledWith("unordered");

    act(() => buttons[5].click());
    expect(props.onApplyList).toHaveBeenCalledWith("ordered");

    act(() => buttons[6].click());
    expect(props.onApplyList).toHaveBeenCalledWith("checklist");
  });

  it("Outdent / Indent buttons call onOutdent / onIndent when clicked", () => {
    const props = renderToolbar();
    const buttons = toolbarButtons();

    act(() => buttons[7].click());
    expect(props.onOutdent).toHaveBeenCalledOnce();

    act(() => buttons[8].click());
    expect(props.onIndent).toHaveBeenCalledOnce();
  });

  it("Link button calls onOpenLinkDialog with the button element", () => {
    const props = renderToolbar();
    const buttons = toolbarButtons();
    const link = buttons[9];

    act(() => link.click());
    expect(props.onOpenLinkDialog).toHaveBeenCalledWith(link);
  });

  it("Horizontal rule button calls onInsertHorizontalRule when clicked", () => {
    const props = renderToolbar();
    const buttons = toolbarButtons();

    act(() => buttons[10].click());
    expect(props.onInsertHorizontalRule).toHaveBeenCalledOnce();
  });

  it("Code block button calls onInsertCodeBlock when clicked", () => {
    const props = renderToolbar();
    const buttons = toolbarButtons();

    act(() => buttons[11].click());
    expect(props.onInsertCodeBlock).toHaveBeenCalledOnce();
  });

  it("Image button calls onOpenImageInsertion with the button element", () => {
    const props = renderToolbar();
    const buttons = toolbarButtons();
    const image = buttons[12];

    act(() => image.click());
    expect(props.onOpenImageInsertion).toHaveBeenCalledWith(image);
  });

  it("Ruby button calls onOpenRubyDialog with the button element", () => {
    const props = renderToolbar();
    const buttons = toolbarButtons();
    const ruby = buttons[14];

    act(() => ruby.click());
    expect(props.onOpenRubyDialog).toHaveBeenCalledWith(ruby);
  });

  it("Emphasis button calls onOpenEmphasisDialog with the button element", () => {
    const props = renderToolbar();
    const buttons = toolbarButtons();
    const emphasis = buttons[15];

    act(() => emphasis.click());
    expect(props.onOpenEmphasisDialog).toHaveBeenCalledWith(emphasis);
  });

  it("Preview button calls onTogglePreview when clicked", () => {
    const props = renderToolbar();
    const buttons = toolbarButtons();
    const preview = buttons[16];

    act(() => preview.click());
    expect(props.onTogglePreview).toHaveBeenCalledOnce();
  });

  it("Preview button reflects isPreviewVisible via aria-pressed", () => {
    renderToolbar({ isPreviewVisible: true });
    expect(toolbarButtons()[16].getAttribute("aria-pressed")).toBe("true");

    renderToolbar({ isPreviewVisible: false });
    expect(toolbarButtons()[16].getAttribute("aria-pressed")).toBe("false");
  });

  it("Preview button is disabled when canTogglePreview is false, independent of other gates", () => {
    renderToolbar({ canTogglePreview: false });
    const buttons = toolbarButtons();
    expect(buttons[16].disabled).toBe(true);
    // Other commands stay enabled (still passed as true here).
    expect(buttons[0].disabled).toBe(false);
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
    const table = buttons[13];
    expect(table.disabled).toBe(true);
    expect(table.getAttribute("aria-label")).toBe("表を挿入");
    expect(table.getAttribute("title")).toBe("表を挿入");
    expect(table.textContent?.trim()).toBe("");
  });

  it("opens popover when clicking enabled icon-only table button and selects size", () => {
    const onInsertTable = vi.fn();
    renderToolbar({ canInsertTable: true, onInsertTable });

    const buttons = toolbarButtons();
    const table = buttons[13];
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
