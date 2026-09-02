// @vitest-environment happy-dom
//
// #370 marquee fix: the footer detail marquee must start whenever the detail
// text is wider than the footer viewport — even though the VISIBLE text
// element clips itself (`overflow: hidden`) and can therefore report a clamped
// `scrollWidth`. Overflow is decided from a dedicated unconstrained twin span;
// these tests stub the geometry (happy-dom does no real layout) to prove the
// decision uses the twin, not the clipped visible element.
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorId } from "../../src/shared/editorId";
import { CommandRegistry } from "../../src/shared/commandRegistry";
import type { CommandContext } from "../../src/shared/commandEnablement";
import type { Translate } from "../../src/shared/i18n";
import type { MarkdownHeadingSearchCandidate } from "../../src/renderer/markdownOutlineIndex";
import {
  CommandPalette,
  type CommandPaletteProps
} from "../../src/renderer/CommandPalette";
import type { CommandPaletteFooterDetailSettings } from "../../src/shared/settings";

const translate: Translate = (key) => key;
const LONG =
  "これはとても長いフッター詳細テキストで、フッターのビューポート幅を確実に超えます。";

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

function editorId(): EditorId {
  return {
    kind: "projectDocument",
    relativePath: "chapter01.md",
    rootPath: "C:\\Novel"
  } as unknown as EditorId;
}

function headingCandidate(bodyPreview: string): MarkdownHeadingSearchCandidate {
  return {
    id: "doc-a::0:h",
    editorId: editorId(),
    editorKey: "doc-a",
    headingId: "0:h",
    level: 2,
    text: "章",
    lineNumber: 0,
    from: 0,
    to: 4,
    documentTitle: "chapter01.md",
    documentPath: "chapter01.md",
    documentKind: "project",
    bodyPreview
  };
}

function baseProps(
  overrides: Partial<CommandPaletteProps> = {}
): CommandPaletteProps {
  return {
    commandRegistry: new CommandRegistry(),
    translate,
    isComposing: () => false,
    commandContext: {} as CommandContext,
    onExecuteCommand: vi.fn(),
    onBlockedCommand: vi.fn(),
    onClose: vi.fn(),
    initialInputValue: "#",
    footerDetailSettings: footerDetailEnabled,
    headingJumpCandidates: [headingCandidate(LONG)],
    ...overrides
  };
}

function render(props: CommandPaletteProps): void {
  act(() => {
    root.render(React.createElement(CommandPalette, props));
  });
}

async function flushFrame(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 32));
  });
}

function viewportEl(): HTMLElement {
  return container.querySelector<HTMLElement>(".commandPaletteFooterStatus")!;
}
function visibleTextEl(): HTMLElement {
  return container.querySelector<HTMLElement>(
    ".commandPaletteFooterStatusText"
  )!;
}
function measureEl(): HTMLElement | null {
  return container.querySelector<HTMLElement>(
    ".commandPaletteFooterStatusMeasure"
  );
}

function stubWidth(el: Element, prop: "scrollWidth" | "clientWidth", value: number): void {
  Object.defineProperty(el, prop, { configurable: true, value });
}

describe("Command Palette footer detail marquee measurement (#370 fix)", () => {
  it("renders a dedicated off-screen measurement twin alongside the visible clipped text", () => {
    render(baseProps());

    expect(visibleTextEl().textContent).toBe(LONG);
    expect(measureEl()).not.toBeNull();
    expect(measureEl()!.textContent).toBe(LONG);
    expect(measureEl()!.getAttribute("aria-hidden")).toBe("true");
    // The twin must not carry the marquee/animation class — it is measured,
    // never animated.
    expect(measureEl()!.className).toBe("commandPaletteFooterStatusMeasure");
  });

  it("activates the marquee when the TWIN overflows the viewport, even though the visible text reports a clamped scrollWidth", async () => {
    render(baseProps());

    // The ellipsized visible element reports a clamped width (this is the bug
    // the fix works around); the unconstrained twin reports the true width.
    // Stubs land before the pending measurement rAF fires.
    stubWidth(viewportEl(), "clientWidth", 120);
    stubWidth(visibleTextEl(), "scrollWidth", 120);
    stubWidth(measureEl()!, "scrollWidth", 640);
    await flushFrame();

    expect(visibleTextEl().className).toContain(
      "commandPaletteFooterStatusText-marquee"
    );
  });

  it("leaves the ellipsis fallback (no marquee) when the twin fits the viewport", async () => {
    render(baseProps());

    stubWidth(viewportEl(), "clientWidth", 400);
    stubWidth(visibleTextEl(), "scrollWidth", 400);
    stubWidth(measureEl()!, "scrollWidth", 320);
    await flushFrame();

    expect(visibleTextEl().className).toBe("commandPaletteFooterStatusText");
  });

  it("preserves reduced-motion behavior: the twin still overflows but the marquee stays inactive", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: query.includes("prefers-reduced-motion"),
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          onchange: null,
          dispatchEvent: () => false
        }) as unknown as MediaQueryList
    );

    render(baseProps());
    stubWidth(viewportEl(), "clientWidth", 120);
    stubWidth(measureEl()!, "scrollWidth", 640);
    await flushFrame();

    expect(visibleTextEl().className).toBe("commandPaletteFooterStatusText");
  });

  it("preserves footer-detail-disabled behavior: no measurement twin, no marquee", async () => {
    render(baseProps({ footerDetailSettings: footerDetailDisabled }));
    await flushFrame();

    expect(measureEl()).toBeNull();
    expect(
      container.querySelector(".commandPaletteFooterStatusText-marquee")
    ).toBeNull();
  });
});
