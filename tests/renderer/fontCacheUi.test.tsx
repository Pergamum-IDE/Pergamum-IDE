// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { FontCacheControl } from "../../src/renderer/FontCacheControl";
import type { Translate, TranslationKey } from "../../src/shared/i18n";
import { enTranslations } from "../../src/shared/i18n/en";
import { jaTranslations } from "../../src/shared/i18n/ja";
import type { MeasureTextWidth } from "../../src/renderer/fontFixedWidthDetection";

// #495: happy-dom's canvas.getContext('2d') always returns null, so the
// real `createCanvasMeasureTextWidth()` can never exercise a "fixed" or
// "proportional" outcome in this environment. Mock only that one factory
// function — `measureFixedWidthForFamilies`/`detectFixedWidth` stay real,
// so these tests still exercise the actual classification pipeline, just
// fed by a deterministic fake measurer instead of a real canvas.
vi.mock("../../src/renderer/fontFixedWidthDetection", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/renderer/fontFixedWidthDetection")>();
  return {
    ...actual,
    createCanvasMeasureTextWidth: vi.fn(actual.createCanvasMeasureTextWidth)
  };
});
import { createCanvasMeasureTextWidth } from "../../src/renderer/fontFixedWidthDetection";

const FIXED_WIDTHS: Record<string, number> = { W: 10, i: 10, WW: 20, Ｗ: 20 };
const PROPORTIONAL_WIDTHS: Record<string, number> = { W: 12, i: 4, WW: 24, Ｗ: 24 };

/** A deterministic fake measurer: any family name containing "Mono"
 * measures as fixed-width; anything else measures as proportional; a family
 * containing "Broken" throws (simulating a per-family measurement failure). */
const fakeMeasurer: MeasureTextWidth = (fontCss, text) => {
  if (fontCss.includes("Broken")) {
    throw new Error("measurement exploded");
  }
  const widths = fontCss.includes("Mono") ? FIXED_WIDTHS : PROPORTIONAL_WIDTHS;
  return widths[text] ?? NaN;
};

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
    // `vi.restoreAllMocks()` below only restores `vi.spyOn` spies, not the
    // plain `vi.fn()` mock installed by the `vi.mock(...)` factory above —
    // reset its call history and any per-test `mockReturnValue` explicitly
    // so neither leaks into the next test. Reset (not clear) also drops
    // back to "no implementation" (i.e. returns undefined, same falsy
    // "cannot measure" signal as the real happy-dom-canvas-less null).
    vi.mocked(createCanvasMeasureTextWidth).mockReset();
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

  describe("#495 fixed-width detection", () => {
    it("mounting the control (as Settings does) does not trigger measurement", async () => {
      (window as any).pergamum = {
        fontCache: { load: vi.fn().mockResolvedValue({ status: "notScanned" }), save: vi.fn() }
      };
      await act(async () => {
        root.render(<FontCacheControl id="test-font-cache" translate={translateJa} />);
      });
      expect(createCanvasMeasureTextWidth).not.toHaveBeenCalled();
    });

    it("scanning measures each family and saves fixedWidth values (fixed/proportional), isolating one family's measurement failure as unknown", async () => {
      vi.mocked(createCanvasMeasureTextWidth).mockReturnValue(fakeMeasurer);
      const rawFonts = [
        { family: "Cascadia Mono", fullName: "Cascadia Mono Regular" },
        { family: "Arial", fullName: "Arial Regular" },
        { family: "Broken Font", fullName: "Broken Font Regular" }
      ];
      (window as any).queryLocalFonts = vi.fn().mockResolvedValue(rawFonts);
      const saveMock = vi.fn(async (cache) => ({ status: "loaded" as const, cache }));
      (window as any).pergamum = {
        fontCache: { load: vi.fn().mockResolvedValue({ status: "notScanned" }), save: saveMock }
      };

      await act(async () => {
        root.render(<FontCacheControl id="test-font-cache" translate={translateJa} />);
      });
      const scanButton = container.querySelector<HTMLButtonElement>(".fontCacheScanButton")!;
      await act(async () => {
        scanButton.click();
      });

      expect(createCanvasMeasureTextWidth).toHaveBeenCalledTimes(1);
      expect(saveMock).toHaveBeenCalledTimes(1);
      const savedCache = saveMock.mock.calls[0][0];
      const byFamily = Object.fromEntries(
        savedCache.families.map((f: { family: string; fixedWidth: string }) => [
          f.family,
          f.fixedWidth
        ])
      );
      expect(byFamily["Cascadia Mono"]).toBe("fixed");
      expect(byFamily["Arial"]).toBe("proportional");
      // One family's measurement threw — isolated to "unknown", scan/save
      // still completed for the other two.
      expect(byFamily["Broken Font"]).toBe("unknown");
    });

    it("a rejected scan does not overwrite an existing loaded cache", async () => {
      const existingCache = {
        version: 1,
        scannedAt: "2026-09-16T00:00:00.000Z",
        uiLanguage: "ja",
        families: [{ family: "Consolas", displayName: "Consolas", fixedWidth: "fixed" as const }]
      };
      (window as any).queryLocalFonts = vi.fn().mockRejectedValue(new Error("scan failed"));
      const saveMock = vi.fn();
      (window as any).pergamum = {
        fontCache: {
          load: vi.fn().mockResolvedValue({ status: "loaded", cache: existingCache }),
          save: saveMock
        }
      };

      await act(async () => {
        root.render(<FontCacheControl id="test-font-cache" translate={translateJa} />);
      });
      const scanButton = container.querySelector<HTMLButtonElement>(".fontCacheScanButton")!;
      await act(async () => {
        scanButton.click();
      });

      expect(saveMock).not.toHaveBeenCalled();
      const statusText = container.querySelector(".fontCacheStatusText")?.textContent;
      expect(statusText).toContain("ローカルフォント: 1 ファミリー");
    });

    it("does not log the full font list during a scan", async () => {
      vi.mocked(createCanvasMeasureTextWidth).mockReturnValue(fakeMeasurer);
      const rawFonts = Array.from({ length: 150 }, (_, i) => ({
        family: `Font ${i}`,
        fullName: `Font ${i} Regular`
      }));
      (window as any).queryLocalFonts = vi.fn().mockResolvedValue(rawFonts);
      (window as any).pergamum = {
        fontCache: {
          load: vi.fn().mockResolvedValue({ status: "notScanned" }),
          save: vi.fn(async (cache) => ({ status: "loaded" as const, cache }))
        }
      };
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await act(async () => {
        root.render(<FontCacheControl id="test-font-cache" translate={translateJa} />);
      });
      const scanButton = container.querySelector<HTMLButtonElement>(".fontCacheScanButton")!;
      await act(async () => {
        scanButton.click();
      });

      for (const call of [...logSpy.mock.calls, ...warnSpy.mock.calls]) {
        const serialized = JSON.stringify(call);
        expect(serialized).not.toContain("Font 0");
        expect(serialized).not.toContain("Font 149");
      }
    });
  });
});
