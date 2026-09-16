import type { RawFontData } from "../shared/fontCache";
import { parseFontNameRecords } from "./fontNameTableParser";
import {
  resolveDisplayNameFromRecords,
  type FontNameUiLanguage
} from "./fontDisplayNameResolver";

/**
 * #496: resolves one scanned font face's localized display name by reading
 * `FontData.blob()`, parsing its `name` table, and picking the best record
 * for `uiLanguage`. Only ever called from the explicit user-triggered scan
 * flow (`FontCacheControl.handleScan`) — never on startup, Settings open,
 * or font picker open.
 *
 * Safe by construction: `rawFont.family` is always the fallback, and every
 * failure mode (`blob()` missing/rejecting, unreadable bytes, malformed/
 * unsupported font data, parser exceptions) is caught here and resolved to
 * that fallback rather than propagated — one font's failure must never
 * abort the rest of the scan.
 */
export async function resolveLocalizedDisplayName(
  rawFont: RawFontData,
  uiLanguage: FontNameUiLanguage
): Promise<string> {
  const fallback = rawFont.family;
  try {
    if (typeof rawFont.blob !== "function") {
      return fallback;
    }
    const blob = await rawFont.blob();
    const buffer = await blob.arrayBuffer();
    const records = parseFontNameRecords(buffer);
    return resolveDisplayNameFromRecords(records, uiLanguage, fallback);
  } catch {
    return fallback;
  }
}
