import React, { useEffect, useRef, useState } from "react";
import {
  aggregateFontFamiliesWithDisplayNames,
  type FontCache,
  type FontCacheState,
  type RawFontData,
  type RawFontDataWithDisplayName
} from "../shared/fontCache";
import {
  createCanvasMeasureTextWidth,
  measureFixedWidthForFamilies
} from "./fontFixedWidthDetection";
import { resolveDisplayNameFromFamilyRecords } from "./fontDisplayNameResolver";
import { resolveFontNameRecords } from "./fontLocalizedDisplayName";
import type { Language, Translate } from "../shared/i18n";
import reloadIconRaw from "../../assets/icons/ionicons/dialog/reload-outline.svg?raw";

declare global {
  interface Window {
    queryLocalFonts?: (options?: { postscriptNames?: string[] }) => Promise<RawFontData[]>;
  }
}

export interface FontCacheControlProps {
  id: string;
  disabled?: boolean;
  translate: Translate;
  /** #496: the application's current UI language, used to prefer localized
   * `name`-table records when resolving each cached family's displayName.
   * Optional (defaults to "ja") so existing callers/tests that don't care
   * about localization keep working unchanged. */
  uiLanguage?: Language;
}

function formatScannedDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  } catch {
    return isoString;
  }
}

/**
 * #496/#497: resolves each raw scanned face's name-table records, then
 * decides a displayName per family using ADR-0015 F-15 across all faces in
 * that exact `FontData.family`. Faces are processed sequentially (see #495's
 * precedent for sequential-is-fine at this scale). We deliberately do not
 * short-circuit after the first face: a first face without a localized name
 * must not lock the whole family to the `family` fallback when a later face
 * has the proper localized family name.
 *
 * Deliberately does NOT build the result via `{ ...font, resolvedDisplayName }`
 * — the real Font Access API's `FontData` exposes `family`/`fullName`/
 * `postscriptName`/`style` as prototype accessors, not own properties, and
 * object spread only copies own enumerable properties. Spreading silently
 * produced empty `RawFontDataWithDisplayName` objects (every family lost —
 * caught only in real-app dogfood, never in unit tests against plain mock
 * objects), so every field is copied explicitly via direct property access
 * instead, which correctly invokes the getters.
 */
async function resolveDisplayNamesForScan(
  rawFonts: readonly RawFontData[],
  uiLanguage: Language
): Promise<RawFontDataWithDisplayName[]> {
  const result: RawFontDataWithDisplayName[] = [];
  const recordsByFamily = new Map<string, Array<Awaited<ReturnType<typeof resolveFontNameRecords>>>>();

  const withResolvedName = (
    font: RawFontData,
    resolvedDisplayName: string | undefined
  ): RawFontDataWithDisplayName => ({
    family: font.family,
    fullName: font.fullName,
    postscriptName: font.postscriptName,
    style: font.style,
    blob: font.blob,
    resolvedDisplayName
  });

  for (const font of rawFonts) {
    if (!font) {
      continue;
    }
    if (typeof font.family !== "string" || font.family.trim() === "") {
      result.push(withResolvedName(font, undefined));
      continue;
    }

    const records = await resolveFontNameRecords(font);
    const familyRecords = recordsByFamily.get(font.family);
    if (familyRecords) {
      familyRecords.push(records);
    } else {
      recordsByFamily.set(font.family, [records]);
    }
    result.push(withResolvedName(font, undefined));
  }

  const displayNameByFamily = new Map<string, string>();
  for (const [family, familyRecords] of recordsByFamily.entries()) {
    displayNameByFamily.set(
      family,
      resolveDisplayNameFromFamilyRecords(familyRecords, uiLanguage, family)
    );
  }

  return result.map((font) =>
    typeof font.family === "string"
      ? { ...font, resolvedDisplayName: displayNameByFamily.get(font.family) }
      : font
  );
}

export const FontCacheControl: React.FC<FontCacheControlProps> = ({
  id,
  disabled = false,
  translate,
  uiLanguage = "ja"
}) => {
  const [cacheState, setCacheState] = useState<FontCacheState>({
    status: "notScanned"
  });
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const scanInFlightRef = useRef(false);

  useEffect(() => {
    let active = true;
    const fontCacheApi = window.pergamum?.fontCache;
    if (fontCacheApi?.load) {
      fontCacheApi
        .load()
        .then((state) => {
          if (active && state) {
            setCacheState(state);
          }
        })
        .catch((err) => {
          if (active) {
            setCacheState({
              status: "error",
              message: err instanceof Error ? err.message : "Failed to load cache"
            });
          }
        });
    }
    return () => {
      active = false;
    };
  }, []);

  const handleScan = async () => {
    if (scanInFlightRef.current || disabled) {
      return;
    }

    if (typeof window.queryLocalFonts !== "function") {
      setCacheState({
        status: "error",
        message: translate("fontCache.status.unsupported")
      });
      return;
    }

    scanInFlightRef.current = true;
    setIsScanning(true);
    try {
      const rawFonts: RawFontData[] = await window.queryLocalFonts();
      // #496 (ADR-0015): resolve each face's localized display name from
      // its `name` table — user-action-only, same as the scan itself.
      const rawFontsWithNames = await resolveDisplayNamesForScan(rawFonts, uiLanguage);
      const aggregated = aggregateFontFamiliesWithDisplayNames(rawFontsWithNames);
      // #495 (ADR-0015): classify fixed-width vs proportional via Canvas
      // measurement, once per family, right after the user-triggered scan —
      // never on startup, Settings open, or font picker open. Always keyed
      // on `family` (CSS-facing), never the localized `displayName`.
      const measuredFamilies = measureFixedWidthForFamilies(
        aggregated,
        createCanvasMeasureTextWidth()
      );
      const newCache: FontCache = {
        version: 1,
        scannedAt: new Date().toISOString(),
        uiLanguage,
        families: measuredFamilies
      };

      const fontCacheApi = window.pergamum?.fontCache;
      if (fontCacheApi?.save) {
        const savedState = await fontCacheApi.save(newCache);
        setCacheState(savedState);
      } else {
        setCacheState({ status: "loaded", cache: newCache });
      }
    } catch (err) {
      setCacheState({
        status: "error",
        message: err instanceof Error ? err.message : translate("fontCache.status.error")
      });
    } finally {
      scanInFlightRef.current = false;
      setIsScanning(false);
    }
  };

  const renderStatusText = (): string => {
    switch (cacheState.status) {
      case "notScanned":
        return translate("fontCache.status.notScanned");
      case "loaded":
        return translate("fontCache.status.loaded", {
          date: formatScannedDate(cacheState.cache.scannedAt)
        });
      case "error":
        return cacheState.message || translate("fontCache.status.error");
    }
  };

  const buttonLabel =
    cacheState.status === "loaded"
      ? translate("fontCache.button.rescan")
      : translate("fontCache.button.scan");
  const showLanguageMismatchWarning =
    cacheState.status === "loaded" && cacheState.cache.uiLanguage !== uiLanguage;
  const scanButtonLabel = isScanning
    ? translate("fontCache.button.scanning")
    : buttonLabel;

  return (
    <div id={id} className="fontCacheControlGroup">
      <div className="fontCacheControlRow">
        <button
          type="button"
          className={
            isScanning
              ? "fontCacheScanButton fontCacheScanButton-scanning settingsButton"
              : "fontCacheScanButton settingsButton"
          }
          disabled={disabled || isScanning}
          onClick={handleScan}
        >
          <span
            className={
              isScanning
                ? "fontCacheScanIcon fontCacheScanIcon-spinning"
                : "fontCacheScanIcon"
            }
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: reloadIconRaw }}
          />
          <span>{scanButtonLabel}</span>
        </button>
        <div className="fontCacheStatusArea">
          <div className="fontCacheStatusText">{renderStatusText()}</div>
          {showLanguageMismatchWarning ? (
            <div
              className="fontCacheLanguageWarning fontPickerNotice fontPickerNotice-warning"
              role="note"
            >
              {translate("fontCache.warning.languageMismatch")}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
