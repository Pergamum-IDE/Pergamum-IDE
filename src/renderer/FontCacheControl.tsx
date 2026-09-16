import React, { useEffect, useState } from "react";
import {
  aggregateFontFamilies,
  type FontCache,
  type FontCacheState,
  type RawFontData
} from "../shared/fontCache";
import type { Translate } from "../shared/i18n";

declare global {
  interface Window {
    queryLocalFonts?: (options?: { postscriptNames?: string[] }) => Promise<RawFontData[]>;
  }
}

export interface FontCacheControlProps {
  id: string;
  disabled?: boolean;
  translate: Translate;
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

export const FontCacheControl: React.FC<FontCacheControlProps> = ({
  id,
  disabled = false,
  translate
}) => {
  const [cacheState, setCacheState] = useState<FontCacheState>({
    status: "notScanned"
  });
  const [isScanning, setIsScanning] = useState<boolean>(false);

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
    if (isScanning || disabled) {
      return;
    }

    if (typeof window.queryLocalFonts !== "function") {
      setCacheState((prev) => {
        if (prev.status === "loaded") {
          return prev;
        }
        return {
          status: "error",
          message: translate("fontCache.status.unsupported")
        };
      });
      return;
    }

    setIsScanning(true);
    try {
      const rawFonts: RawFontData[] = await window.queryLocalFonts();
      const aggregated = aggregateFontFamilies(rawFonts);
      const newCache: FontCache = {
        version: 1,
        scannedAt: new Date().toISOString(),
        uiLanguage: "ja",
        families: aggregated
      };

      const fontCacheApi = window.pergamum?.fontCache;
      if (fontCacheApi?.save) {
        const savedState = await fontCacheApi.save(newCache);
        setCacheState(savedState);
      } else {
        setCacheState({ status: "loaded", cache: newCache });
      }
    } catch (err) {
      setCacheState((prev) => {
        if (prev.status === "loaded") {
          return prev;
        }
        return {
          status: "error",
          message: err instanceof Error ? err.message : translate("fontCache.status.error")
        };
      });
    } finally {
      setIsScanning(false);
    }
  };

  const renderStatusText = (): string => {
    switch (cacheState.status) {
      case "notScanned":
        return translate("fontCache.status.notScanned");
      case "loaded":
        return translate("fontCache.status.loaded", {
          count: cacheState.cache.families.length,
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

  return (
    <div id={id} className="fontCacheControlGroup">
      <div className="fontCacheStatusText">{renderStatusText()}</div>
      <button
        type="button"
        className="fontCacheScanButton settingsButton"
        disabled={disabled || isScanning}
        onClick={handleScan}
      >
        {isScanning ? translate("documentMap.rendering") : buttonLabel}
      </button>
    </div>
  );
};
