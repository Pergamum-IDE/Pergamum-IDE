// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jaTranslations } from "../../src/shared/i18n/ja";
import { StatusBarZoomControls } from "../../src/renderer/components/StatusBarZoomControls";
import type { TranslationValues } from "../../src/shared/i18n";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function mockTranslate(key: string, values?: TranslationValues): string {
  let text = (jaTranslations as Record<string, string>)[key] ?? key;
  if (values) {
    for (const [k, v] of Object.entries(values)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}

describe("StatusBarZoomControls", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
  });

  it("renders zoom out button, reset zoom percent button, and zoom in button with accessibility attributes", () => {
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    const onResetZoom = vi.fn();

    act(() => {
      root?.render(
        <StatusBarZoomControls
          zoomFactor={1.0}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onResetZoom={onResetZoom}
          translate={mockTranslate}
        />
      );
    });

    const zoomOutBtn = container?.querySelector(
      "button[title='ズームアウト']"
    ) as HTMLButtonElement;
    const zoomInBtn = container?.querySelector(
      "button[title='ズームイン']"
    ) as HTMLButtonElement;
    const resetBtn = container?.querySelector(
      "button.statusBarZoomResetButton"
    ) as HTMLButtonElement;
    const selectEl = container?.querySelector("select");

    expect(zoomOutBtn).toBeTruthy();
    expect(zoomOutBtn.getAttribute("aria-label")).toBe("ズームアウト");
    expect(zoomInBtn).toBeTruthy();
    expect(zoomInBtn.getAttribute("aria-label")).toBe("ズームイン");
    expect(resetBtn).toBeTruthy();
    expect(resetBtn.title).toBe("ズームを100%に戻す");
    expect(resetBtn.getAttribute("aria-label")).toBe("ズームを100%に戻す");
    expect(resetBtn.textContent).toBe("100%");
    expect(selectEl).toBeNull();
  });

  it("displays current zoom percentage (e.g. 125%) on the reset button", () => {
    act(() => {
      root?.render(
        <StatusBarZoomControls
          zoomFactor={1.25}
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onResetZoom={vi.fn()}
          translate={mockTranslate}
        />
      );
    });

    const resetBtn = container?.querySelector(
      "button.statusBarZoomResetButton"
    ) as HTMLButtonElement;

    expect(resetBtn.textContent).toBe("125%");
  });

  it("triggers onZoomOut when clicking the zoom out button", () => {
    const onZoomOut = vi.fn();

    act(() => {
      root?.render(
        <StatusBarZoomControls
          zoomFactor={1.0}
          onZoomIn={vi.fn()}
          onZoomOut={onZoomOut}
          onResetZoom={vi.fn()}
          translate={mockTranslate}
        />
      );
    });

    const zoomOutBtn = container?.querySelector(
      "button[title='ズームアウト']"
    ) as HTMLButtonElement;

    act(() => {
      zoomOutBtn.click();
    });

    expect(onZoomOut).toHaveBeenCalledTimes(1);
  });

  it("triggers onZoomIn when clicking the zoom in button", () => {
    const onZoomIn = vi.fn();

    act(() => {
      root?.render(
        <StatusBarZoomControls
          zoomFactor={1.0}
          onZoomIn={onZoomIn}
          onZoomOut={vi.fn()}
          onResetZoom={vi.fn()}
          translate={mockTranslate}
        />
      );
    });

    const zoomInBtn = container?.querySelector(
      "button[title='ズームイン']"
    ) as HTMLButtonElement;

    act(() => {
      zoomInBtn.click();
    });

    expect(onZoomIn).toHaveBeenCalledTimes(1);
  });

  it("triggers onResetZoom when clicking the zoom percent reset button", () => {
    const onResetZoom = vi.fn();

    act(() => {
      root?.render(
        <StatusBarZoomControls
          zoomFactor={1.25}
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onResetZoom={onResetZoom}
          translate={mockTranslate}
        />
      );
    });

    const resetBtn = container?.querySelector(
      "button.statusBarZoomResetButton"
    ) as HTMLButtonElement;

    act(() => {
      resetBtn.click();
    });

    expect(onResetZoom).toHaveBeenCalledTimes(1);
  });

  it("applies inverse scale transform to compensate for app zoomFactor", () => {
    act(() => {
      root?.render(
        <StatusBarZoomControls
          zoomFactor={0.5}
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onResetZoom={vi.fn()}
          translate={mockTranslate}
        />
      );
    });

    const rootDiv = container?.querySelector(
      ".statusBarZoomControls"
    ) as HTMLDivElement;
    expect(rootDiv.style.transform).toBe("scale(2)");

    act(() => {
      root?.render(
        <StatusBarZoomControls
          zoomFactor={1.0}
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onResetZoom={vi.fn()}
          translate={mockTranslate}
        />
      );
    });
    expect(rootDiv.style.transform).toBe("scale(1)");

    act(() => {
      root?.render(
        <StatusBarZoomControls
          zoomFactor={2.0}
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onResetZoom={vi.fn()}
          translate={mockTranslate}
        />
      );
    });
    expect(rootDiv.style.transform).toBe("scale(0.5)");
  });

  it("honors explicitly provided zoomControlScale prop when passed", () => {
    act(() => {
      root?.render(
        <StatusBarZoomControls
          zoomFactor={1.0}
          zoomControlScale={1.5}
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onResetZoom={vi.fn()}
          translate={mockTranslate}
        />
      );
    });

    const rootDiv = container?.querySelector(
      ".statusBarZoomControls"
    ) as HTMLDivElement;
    expect(rootDiv.style.transform).toBe("scale(1.5)");
  });
});
