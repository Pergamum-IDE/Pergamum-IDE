// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { FontCacheControl } from "../../src/renderer/FontCacheControl";
import type { Translate, TranslationKey } from "../../src/shared/i18n";
import { enTranslations } from "../../src/shared/i18n/en";
import { jaTranslations } from "../../src/shared/i18n/ja";

const translateJa: Translate = (key: TranslationKey, params?: Record<string, string | number>) => {
  let template: string =
    (jaTranslations as Record<string, string>)[key] ??
    (enTranslations as Record<string, string>)[key] ??
    key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      template = template.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return template;
};

describe("FontCacheControl UI Integration (#491)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
    delete (window as any).queryLocalFonts;
    delete (window as any).pergamum;
  });

  it("renders notScanned status initially and does NOT call queryLocalFonts on mount", async () => {
    const queryLocalFontsMock = vi.fn();
    (window as any).queryLocalFonts = queryLocalFontsMock;
    (window as any).pergamum = {
      fontCache: {
        load: vi.fn().mockResolvedValue({ status: "notScanned" }),
        save: vi.fn()
      }
    };

    await act(async () => {
      root.render(<FontCacheControl id="test-font-cache" translate={translateJa} />);
    });

    expect(queryLocalFontsMock).not.toHaveBeenCalled();

    const statusText = container.querySelector(".fontCacheStatusText")?.textContent;
    expect(statusText).toBe(translateJa("fontCache.status.notScanned"));

    const scanButton = container.querySelector<HTMLButtonElement>(".fontCacheScanButton");
    expect(scanButton?.textContent).toBe(translateJa("fontCache.button.scan"));
  });

  it("calls queryLocalFonts only when user clicks scan button and updates to loaded status", async () => {
    const rawFonts = [
      { family: "Consolas", fullName: "Consolas Regular" },
      { family: "Yu Mincho", fullName: "Yu Mincho Regular" }
    ];
    const queryLocalFontsMock = vi.fn().mockResolvedValue(rawFonts);
    (window as any).queryLocalFonts = queryLocalFontsMock;

    const saveMock = vi.fn(async (cache) => ({ status: "loaded" as const, cache }));
    (window as any).pergamum = {
      fontCache: {
        load: vi.fn().mockResolvedValue({ status: "notScanned" }),
        save: saveMock
      }
    };

    await act(async () => {
      root.render(<FontCacheControl id="test-font-cache" translate={translateJa} />);
    });

    expect(queryLocalFontsMock).not.toHaveBeenCalled();

    const scanButton = container.querySelector<HTMLButtonElement>(".fontCacheScanButton")!;
    await act(async () => {
      scanButton.click();
    });

    expect(queryLocalFontsMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledTimes(1);

    const statusText = container.querySelector(".fontCacheStatusText")?.textContent;
    expect(statusText).toContain("ローカルフォント: 2 ファミリー");

    expect(scanButton.textContent).toBe(translateJa("fontCache.button.rescan"));
  });

  it("handles unsupported API safely when queryLocalFonts is missing", async () => {
    delete (window as any).queryLocalFonts;
    (window as any).pergamum = {
      fontCache: {
        load: vi.fn().mockResolvedValue({ status: "notScanned" }),
        save: vi.fn()
      }
    };

    await act(async () => {
      root.render(<FontCacheControl id="test-font-cache" translate={translateJa} />);
    });

    const scanButton = container.querySelector<HTMLButtonElement>(".fontCacheScanButton")!;
    await act(async () => {
      scanButton.click();
    });

    const statusText = container.querySelector(".fontCacheStatusText")?.textContent;
    expect(statusText).toBe(translateJa("fontCache.status.unsupported"));
  });

  it("handles scan failure/permission denied gracefully without crashing", async () => {
    (window as any).queryLocalFonts = vi.fn().mockRejectedValue(new Error("Permission denied"));
    (window as any).pergamum = {
      fontCache: {
        load: vi.fn().mockResolvedValue({ status: "notScanned" }),
        save: vi.fn()
      }
    };

    await act(async () => {
      root.render(<FontCacheControl id="test-font-cache" translate={translateJa} />);
    });

    const scanButton = container.querySelector<HTMLButtonElement>(".fontCacheScanButton")!;
    await act(async () => {
      scanButton.click();
    });

    const statusText = container.querySelector(".fontCacheStatusText")?.textContent;
    expect(statusText).toBe("Permission denied");
  });
});
