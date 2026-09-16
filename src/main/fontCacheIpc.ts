import { ipcMain } from "electron";
import { FONT_CACHE_CHANNELS } from "../shared/api";
import { loadFontCache, saveFontCache } from "./fontCacheStore";

export function registerFontCacheIpc(): void {
  ipcMain.handle(FONT_CACHE_CHANNELS.load, async () => loadFontCache());

  ipcMain.handle(FONT_CACHE_CHANNELS.save, async (_event, rawCache: unknown) =>
    saveFontCache(rawCache)
  );
}
