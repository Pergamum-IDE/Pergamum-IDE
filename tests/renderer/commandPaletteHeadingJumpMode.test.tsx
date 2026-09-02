// @vitest-environment happy-dom
//
// #141: interactive coverage for the Command Palette `#` heading-jump mode.
// Drives the real widget (keyboard + pointer) so search, the 2-row candidate
// rendering, match highlighting, the Enter/click execution target, the footer
// preview, and non-regression of the sibling modes are exercised together.
// Mirrors commandPaletteFilePreviewFooter.test.tsx / commandPaletteActive-
// Selection.test.tsx.
import { readFileSync } from "node:fs";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorId } from "../../src/shared/editorId";
import { CommandRegistry, defineCommandId } from "../../src/shared/commandRegistry";
import type { CommandContext } from "../../src/shared/commandEnablement";
import type { Translate } from "../../src/shared/i18n";
import type { MarkdownHeadingSearchCandidate } from "../../src/renderer/markdownOutlineIndex";
import {
  CommandPalette,
  type CommandPaletteProps
} from "../../src/renderer/CommandPalette";
import type { CommandPaletteFooterDetailSettings } from "../../src/shared/settings";

const translate: Translate = (key) => key;

const footerDetailEnabled: CommandPaletteFooterDetailSettings = {
  enable: true,
  marquee: { delay: 2000, speed: 40 }
};
const footerDetailDisabled: CommandPaletteFooterDetailSettings = {
  enable: false,
  marquee: { delay: 2000, speed: 40 }
};

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

function editorIdFor(relativePath: string): EditorId {
  return {
    kind: "projectDocument",
    relativePath,
    rootPath: "C:\\Novel"
  } as unknown as EditorId;
}

let headingSeq = 0;

function headingCandidate(
  overrides: Partial<MarkdownHeadingSearchCandidate> = {}
): MarkdownHeadingSearchCandidate {
  headingSeq += 1;
  const editorKey = overrides.editorKey ?? "doc-a";
  const headingId = overrides.headingId ?? `${headingSeq}:h`;

  return {
    id: `${editorKey}::${headingId}`,
    editorId: overrides.editorId ?? editorIdFor("chapter01.md"),
    editorKey,
    headingId,
    level: 3,
    text: "見出しテキスト",
    lineNumber: headingSeq,
    from: headingSeq * 10,
    to: headingSeq * 10 + 8,
    documentTitle: "chapter01.md",
    documentPath: "manuscripts/chapter01.md",
    documentKind: "project",
    bodyPreview: null,
    ...overrides
  };
}

function buildRegistry(): CommandRegistry {
  const registry = new CommandRegistry();
  registry.register({
    id: defineCommandId("test.palette.save"),
    title: "Save",
    execute: () => undefined,
    isEnabled: () => true
  });
  return registry;
}

function baseProps(
  overrides: Partial<CommandPaletteProps> = {}
): CommandPaletteProps {
  return {
    commandRegistry: buildRegistry(),
    translate,
    isComposing: () => false,
    commandContext: {} as CommandContext,
    onExecuteCommand: vi.fn(),
    onBlockedCommand: vi.fn(),
    onClose: vi.fn(),
    initialInputValue: "#",
    footerDetailSettings: footerDetailEnabled,
    ...overrides
  };
}

function render(props: CommandPaletteProps): void {
  act(() => {
    root.render(React.createElement(CommandPalette, props));
  });
}

function inputEl(): HTMLInputElement {
  return container.querySelector<HTMLInputElement>(".commandPaletteInput")!;
}

function optionEls(): HTMLLIElement[] {
  return Array.from(
    container.querySelectorAll<HTMLLIElement>('li[role="option"]')
  );
}

function selectedOptionEl(): HTMLLIElement | null {
  return (
    container.querySelector<HTMLLIElement>(
      'li[role="option"][aria-selected="true"]'
    ) ?? null
  );
}

function footerStatusText(): string | null {
  return (
    container.querySelector<HTMLElement>(".commandPaletteFooterStatusText")
      ?.textContent ?? null
  );
}

function type(value: string): void {
  act(() => {
    const field = inputEl();
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    nativeSetter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function pressKey(
  key: string,
  opts: { isComposing?: boolean; keyCode?: number } = {}
): void {
  act(() => {
    const event = new window.KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true
    });
    if (opts.isComposing) {
      Object.defineProperty(event, "isComposing", { get: () => true });
    }
    if (opts.keyCode !== undefined) {
      Object.defineProperty(event, "keyCode", { get: () => opts.keyCode });
    }
    inputEl().dispatchEvent(event);
  });
}

describe("Command Palette `#` heading-jump mode (#141)", () => {
  it("enters heading-jump mode on `#` / `＃` — a candidate listbox, not the reserved placeholder", () => {
    render(
      baseProps({
        initialInputValue: "＃",
        headingJumpCandidates: [headingCandidate({ text: "第一章" })]
      })
    );

    expect(
      container.querySelector(".commandPaletteReservedPlaceholder")
    ).toBeNull();
    expect(container.querySelector('ul[role="listbox"]')).not.toBeNull();
    expect(optionEls()).toHaveLength(1);
  });

  it("prefix-matches heading text with the marker excluded from the query", () => {
    render(
      baseProps({
        initialInputValue: "#見出し",
        headingJumpCandidates: [
          headingCandidate({ headingId: "a", text: "見出し 3です" }),
          headingCandidate({ headingId: "b", text: "別の章" })
        ]
      })
    );

    expect(optionEls()).toHaveLength(1);
    expect(selectedOptionEl()!.textContent).toContain("見出し 3です");

    // `###` (the marker) is not a query.
    type("###");
    expect(optionEls()).toHaveLength(0);
  });

  it("renders a 2-row candidate: `<marker> <heading text>` then the document path, marker never highlighted", () => {
    render(
      baseProps({
        initialInputValue: "#見出し",
        headingJumpCandidates: [
          headingCandidate({
            level: 3,
            text: "見出し 3です",
            documentPath: "manuscripts/chapter01.md"
          })
        ]
      })
    );

    const row = optionEls()[0];
    const primary = row.querySelector(".commandPaletteItemPrimary")!;
    const secondary = row.querySelector(".commandPaletteItemSecondary")!;

    expect(primary.textContent).toBe("### 見出し 3です");
    expect(secondary.textContent).toBe("/manuscripts/chapter01.md");

    // Only the matched heading-text prefix is inside <mark>; never the marker.
    const mark = primary.querySelector("mark.commandPaletteMatch")!;
    expect(mark.textContent).toBe("見出し");
    expect(primary.querySelector(".commandPaletteHeadingJumpMarker")!.textContent).toBe(
      "###"
    );
    expect(primary.innerHTML).not.toContain("<mark class=\"commandPaletteMatch\">###");
  });

  it("does not inject HTML from the heading text", () => {
    render(
      baseProps({
        initialInputValue: "#<img",
        headingJumpCandidates: [
          headingCandidate({ text: "<img src=x onerror=1>" })
        ]
      })
    );

    const primary = optionEls()[0].querySelector(
      ".commandPaletteItemPrimary"
    )!;
    expect(primary.querySelector("img")).toBeNull();
    expect(primary.innerHTML).toContain("&lt;img");
  });

  it("lists every candidate in the given (active-tab-first) order for a bare `#`", () => {
    render(
      baseProps({
        initialInputValue: "#",
        headingJumpCandidates: [
          headingCandidate({ headingId: "b1", text: "B one", editorKey: "b" }),
          headingCandidate({ headingId: "a1", text: "A one", editorKey: "a" }),
          headingCandidate({ headingId: "a2", text: "A two", editorKey: "a" })
        ]
      })
    );

    expect(optionEls().map((el) => el.querySelector(".commandPaletteItemPrimary")!.textContent)).toEqual(
      ["### B one", "### A one", "### A two"]
    );
    expect(selectedOptionEl()!.textContent).toContain("B one");
  });

  it("shows the standalone (external) document path normalized to `/`", () => {
    render(
      baseProps({
        initialInputValue: "#",
        headingJumpCandidates: [
          headingCandidate({
            documentKind: "external",
            documentPath: "C:\\Outside\\notes.md"
          })
        ]
      })
    );

    expect(
      optionEls()[0].querySelector(".commandPaletteItemSecondary")!.textContent
    ).toBe("C:/Outside/notes.md");
  });

  it("executes the selected heading on Enter and on click, reporting the chosen candidate", () => {
    const onExecuteHeadingJumpCandidate = vi.fn();
    const candidates = [
      headingCandidate({ headingId: "h1", text: "章 A", from: 100 }),
      headingCandidate({ headingId: "h2", text: "章 B", from: 200 })
    ];
    render(
      baseProps({
        initialInputValue: "#章",
        headingJumpCandidates: candidates,
        onExecuteHeadingJumpCandidate
      })
    );

    pressKey("ArrowDown");
    expect(selectedOptionEl()!.textContent).toContain("章 B");
    pressKey("Enter");
    expect(onExecuteHeadingJumpCandidate).toHaveBeenCalledTimes(1);
    expect(onExecuteHeadingJumpCandidate.mock.calls[0][0]).toMatchObject({
      id: candidates[1].id,
      from: 200,
      editorId: candidates[1].editorId
    });

    act(() => {
      optionEls()[0].dispatchEvent(
        new window.MouseEvent("mousedown", { bubbles: true, cancelable: true })
      );
      optionEls()[0].click();
    });
    expect(onExecuteHeadingJumpCandidate).toHaveBeenCalledTimes(2);
    expect(onExecuteHeadingJumpCandidate.mock.calls[1][0]).toMatchObject({
      id: candidates[0].id
    });
  });

  it("does not execute a heading during IME composition", () => {
    const onExecuteHeadingJumpCandidate = vi.fn();
    render(
      baseProps({
        initialInputValue: "#章",
        headingJumpCandidates: [headingCandidate({ text: "章 A" })],
        onExecuteHeadingJumpCandidate
      })
    );

    pressKey("Enter", { isComposing: true });
    pressKey("Enter", { keyCode: 229 });

    expect(onExecuteHeadingJumpCandidate).not.toHaveBeenCalled();
  });

  it("shows the selected heading's body preview in the footer detail, and updates it on selection change", () => {
    const candidates = [
      headingCandidate({ headingId: "h1", text: "章 A", bodyPreview: "本文が始まる。" }),
      headingCandidate({ headingId: "h2", text: "章 B", bodyPreview: "次の本文" })
    ];

    render(
      baseProps({ initialInputValue: "#章", headingJumpCandidates: candidates })
    );
    expect(footerStatusText()).toBe("本文が始まる。");
    pressKey("ArrowDown");
    expect(footerStatusText()).toBe("次の本文");
  });

  it("does not show the heading body preview when footer detail is disabled (#370)", () => {
    render(
      baseProps({
        initialInputValue: "#章",
        headingJumpCandidates: [
          headingCandidate({ text: "章 A", bodyPreview: "本文が始まる。" })
        ],
        footerDetailSettings: footerDetailDisabled
      })
    );

    expect(footerStatusText()).toBeNull();
  });

  it("shows the `no open headings` copy when there are no candidates at all", () => {
    render(baseProps({ initialInputValue: "#", headingJumpCandidates: [] }));

    expect(container.textContent).toContain(
      "commandPalette.headingJump.noOpenHeadings"
    );
  });

  it("shows the `no matching headings` copy when a query matches nothing", () => {
    render(
      baseProps({
        initialInputValue: "#",
        headingJumpCandidates: [headingCandidate({ text: "章 A" })]
      })
    );

    type("#zzz");

    expect(container.textContent).toContain(
      "commandPalette.headingJump.noResults"
    );
    expect(container.textContent).not.toContain(
      "commandPalette.headingJump.noOpenHeadings"
    );
  });

  it("leaves the sibling modes untouched", () => {
    const onExecuteHeadingJumpCandidate = vi.fn();
    const props = baseProps({
      initialInputValue: ">",
      headingJumpCandidates: [headingCandidate({ text: "章 A" })],
      onExecuteHeadingJumpCandidate
    });

    render(props);
    expect(container.querySelector('ul[role="listbox"]')).not.toBeNull();
    expect(container.textContent).toContain("Save");

    // `:` line jump keeps its own message; `@` stays a reserved placeholder.
    type(":abc");
    expect(container.textContent).toContain("commandPalette.lineJump.invalid");
    type("@alice");
    expect(
      container.querySelector(".commandPaletteReservedPlaceholder")!.textContent
    ).toContain("commandPalette.reserved.glossary");

    expect(onExecuteHeadingJumpCandidate).not.toHaveBeenCalled();
  });

  it("never calls File Explorer reveal / selection sync from the palette", () => {
    const source = readFileSync("src/renderer/CommandPalette.tsx", "utf8");
    for (const forbidden of [
      "revealFileExplorer",
      "setFileExplorerRevealRequest",
      "fileExplorerSelection"
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
