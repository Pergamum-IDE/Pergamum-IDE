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

  describe("#496 localized display names", () => {
    function encodeUtf16Be(value: string): Uint8Array {
      const bytes = new Uint8Array(value.length * 2);
      for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        bytes[i * 2] = (code >> 8) & 0xff;
        bytes[i * 2 + 1] = code & 0xff;
      }
      return bytes;
    }

    function writeTag(view: DataView, offset: number, tag: string): void {
      for (let i = 0; i < 4; i++) {
        view.setUint8(offset + i, tag.charCodeAt(i));
      }
    }

    /** Minimal single-font sfnt binary with one Microsoft-platform
     * Typographic Family (nameID 16) record. Real (not mocked) name-table
     * parsing/resolution runs against this in these tests — only
     * `blob()` itself is a test double. */
    function buildFontBinary(languageID: number, value: string): ArrayBuffer {
      const encoded = encodeUtf16Be(value);
      const nameHeaderSize = 6;
      const nameRecordSize = 12;
      const stringOffset = nameHeaderSize + nameRecordSize;
      const nameTableSize = stringOffset + encoded.length;
      const sfntHeaderSize = 12;
      const tableRecordSize = 16;
      const nameTableStart = sfntHeaderSize + tableRecordSize;
      const totalSize = nameTableStart + nameTableSize;

      const buffer = new ArrayBuffer(totalSize);
      const view = new DataView(buffer);
      view.setUint32(0, 0x00010000, false);
      view.setUint16(4, 1, false);
      writeTag(view, sfntHeaderSize, "name");
      view.setUint32(sfntHeaderSize + 8, nameTableStart, false);
      view.setUint32(sfntHeaderSize + 12, nameTableSize, false);

      view.setUint16(nameTableStart, 0, false);
      view.setUint16(nameTableStart + 2, 1, false);
      view.setUint16(nameTableStart + 4, stringOffset, false);
      view.setUint16(nameTableStart + 6, 3, false); // platformID: Microsoft
      view.setUint16(nameTableStart + 8, 1, false);
      view.setUint16(nameTableStart + 10, languageID, false);
      view.setUint16(nameTableStart + 12, 16, false); // nameID: Typographic Family
      view.setUint16(nameTableStart + 14, encoded.length, false);
      view.setUint16(nameTableStart + 16, 0, false);

      new Uint8Array(buffer).set(encoded, nameTableStart + stringOffset);
      return buffer;
    }

    const JAPANESE = 0x0411;

    function blobOf(buffer: ArrayBuffer) {
      return async () => ({ arrayBuffer: async () => buffer });
    }

    it("resolves and saves a localized displayName during an explicit scan (uiLanguage=ja)", async () => {
      (window as any).queryLocalFonts = vi.fn().mockResolvedValue([
        {
          family: "Yu Gothic",
          fullName: "Yu Gothic Regular",
          blob: blobOf(buildFontBinary(JAPANESE, "游ゴシック"))
        }
      ]);
      const saveMock = vi.fn(async (cache) => ({ status: "loaded" as const, cache }));
      (window as any).pergamum = {
        fontCache: { load: vi.fn().mockResolvedValue({ status: "notScanned" }), save: saveMock }
      };

      await act(async () => {
        root.render(
          <FontCacheControl id="test-font-cache" translate={translateJa} uiLanguage="ja" />
        );
      });
      const scanButton = container.querySelector<HTMLButtonElement>(".fontCacheScanButton")!;
      await act(async () => {
        scanButton.click();
      });

      expect(saveMock).toHaveBeenCalledTimes(1);
      const savedCache = saveMock.mock.calls[0][0];
      expect(savedCache.uiLanguage).toBe("ja");
      expect(savedCache.families[0]).toMatchObject({
        family: "Yu Gothic",
        displayName: "游ゴシック"
      });
    });

    it("does not resolve a localized name for English UI even when a Japanese record exists (falls back to family)", async () => {
      (window as any).queryLocalFonts = vi.fn().mockResolvedValue([
        { family: "Yu Gothic", blob: blobOf(buildFontBinary(JAPANESE, "游ゴシック")) }
      ]);
      const saveMock = vi.fn(async (cache) => ({ status: "loaded" as const, cache }));
      (window as any).pergamum = {
        fontCache: { load: vi.fn().mockResolvedValue({ status: "notScanned" }), save: saveMock }
      };

      await act(async () => {
        root.render(
          <FontCacheControl id="test-font-cache" translate={translateJa} uiLanguage="en" />
        );
      });
      const scanButton = container.querySelector<HTMLButtonElement>(".fontCacheScanButton")!;
      await act(async () => {
        scanButton.click();
      });

      const savedCache = saveMock.mock.calls[0][0];
      expect(savedCache.uiLanguage).toBe("en");
      expect(savedCache.families[0]).toMatchObject({
        family: "Yu Gothic",
        displayName: "Yu Gothic"
      });
    });

    it("blob() failure for one font falls back to family and does not abort the rest of the scan", async () => {
      (window as any).queryLocalFonts = vi.fn().mockResolvedValue([
        {
          family: "Broken Blob Font",
          blob: async () => {
            throw new Error("blob failed");
          }
        },
        { family: "Yu Gothic", blob: blobOf(buildFontBinary(JAPANESE, "游ゴシック")) }
      ]);
      const saveMock = vi.fn(async (cache) => ({ status: "loaded" as const, cache }));
      (window as any).pergamum = {
        fontCache: { load: vi.fn().mockResolvedValue({ status: "notScanned" }), save: saveMock }
      };

      await act(async () => {
        root.render(
          <FontCacheControl id="test-font-cache" translate={translateJa} uiLanguage="ja" />
        );
      });
      const scanButton = container.querySelector<HTMLButtonElement>(".fontCacheScanButton")!;
      await act(async () => {
        scanButton.click();
      });

      expect(saveMock).toHaveBeenCalledTimes(1);
      const savedCache = saveMock.mock.calls[0][0];
      const byFamily = Object.fromEntries(
        savedCache.families.map((f: { family: string; displayName: string }) => [
          f.family,
          f.displayName
        ])
      );
      expect(byFamily["Broken Blob Font"]).toBe("Broken Blob Font");
      expect(byFamily["Yu Gothic"]).toBe("游ゴシック");
    });

    it("does not call blob() on mount (Settings open) — only an explicit scan click does", async () => {
      const blobMock = vi.fn(blobOf(buildFontBinary(JAPANESE, "游ゴシック")));
      (window as any).queryLocalFonts = vi.fn().mockResolvedValue([
        { family: "Yu Gothic", blob: blobMock }
      ]);
      (window as any).pergamum = {
        fontCache: { load: vi.fn().mockResolvedValue({ status: "notScanned" }), save: vi.fn() }
      };

      await act(async () => {
        root.render(
          <FontCacheControl id="test-font-cache" translate={translateJa} uiLanguage="ja" />
        );
      });

      expect(blobMock).not.toHaveBeenCalled();
    });

    // Regression test for a real bug caught only in app dogfood, never in
    // unit tests using plain mock objects: the real Font Access API's
    // `FontData` exposes `family`/`fullName`/`postscriptName`/`style` as
    // PROTOTYPE accessor properties, not own properties. Object spread
    // (`{ ...font }`) only copies own enumerable properties, so spreading a
    // real `FontData`-shaped object silently drops every field — the scan
    // resolved 330 blob() calls successfully but aggregated to 0 families.
    // This fixture reproduces that shape so a future regression is caught
    // here, not by an engineer stumbling on a real 0-family scan.
    function buildPrototypeAccessorFontData(
      family: string,
      blob: () => Promise<{ arrayBuffer: () => Promise<ArrayBuffer> }>
    ): any {
      const proto = {
        get family() {
          return family;
        },
        get fullName() {
          return `${family} Regular`;
        }
      };
      return Object.assign(Object.create(proto), { blob });
    }

    it("resolves families correctly even when FontData exposes family/fullName via prototype accessors (not own properties)", async () => {
      const fontData = buildPrototypeAccessorFontData(
        "Yu Gothic",
        blobOf(buildFontBinary(JAPANESE, "游ゴシック"))
      );
      // Sanity check the fixture actually reproduces the shape: a naive
      // `{ ...fontData }` must NOT carry `family` over (own-properties only).
      expect(Object.prototype.hasOwnProperty.call(fontData, "family")).toBe(false);
      expect({ ...fontData }.family).toBeUndefined();
      expect(fontData.family).toBe("Yu Gothic"); // but direct access works fine

      (window as any).queryLocalFonts = vi.fn().mockResolvedValue([fontData]);
      const saveMock = vi.fn(async (cache) => ({ status: "loaded" as const, cache }));
      (window as any).pergamum = {
        fontCache: { load: vi.fn().mockResolvedValue({ status: "notScanned" }), save: saveMock }
      };

      await act(async () => {
        root.render(
          <FontCacheControl id="test-font-cache" translate={translateJa} uiLanguage="ja" />
        );
      });
      const scanButton = container.querySelector<HTMLButtonElement>(".fontCacheScanButton")!;
      await act(async () => {
        scanButton.click();
      });

      const savedCache = saveMock.mock.calls[0][0];
      expect(savedCache.families).toHaveLength(1);
      expect(savedCache.families[0]).toMatchObject({
        family: "Yu Gothic",
        displayName: "游ゴシック"
      });
    });

    it("still measures and saves fixedWidth values alongside the localized displayName", async () => {
      vi.mocked(createCanvasMeasureTextWidth).mockReturnValue(fakeMeasurer);
      (window as any).queryLocalFonts = vi.fn().mockResolvedValue([
        {
          family: "Cascadia Mono",
          blob: blobOf(buildFontBinary(JAPANESE, "キャスケイディア モノ"))
        }
      ]);
      const saveMock = vi.fn(async (cache) => ({ status: "loaded" as const, cache }));
      (window as any).pergamum = {
        fontCache: { load: vi.fn().mockResolvedValue({ status: "notScanned" }), save: saveMock }
      };

      await act(async () => {
        root.render(
          <FontCacheControl id="test-font-cache" translate={translateJa} uiLanguage="ja" />
        );
      });
      const scanButton = container.querySelector<HTMLButtonElement>(".fontCacheScanButton")!;
      await act(async () => {
        scanButton.click();
      });

      const savedCache = saveMock.mock.calls[0][0];
      // `fakeMeasurer` (defined above) classifies any css containing "Mono"
      // as fixed — and crucially, `measureFixedWidthForFamilies` is fed
      // `family` ("Cascadia Mono", which contains "Mono"), not the
      // Japanese `displayName` ("キャスケイディア モノ", which does not).
      expect(savedCache.families[0]).toMatchObject({
        family: "Cascadia Mono",
        displayName: "キャスケイディア モノ",
        fixedWidth: "fixed"
      });
    });
  });
});
