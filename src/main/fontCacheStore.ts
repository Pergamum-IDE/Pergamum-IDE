import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { writeFileAtomic } from "./atomicFileWrite";
import {
  isValidFontCache,
  type FontCache,
  type FontCacheState
} from "../shared/fontCache";

const FONT_CACHE_DIR_NAME = "FontCache";
const FONT_CACHE_FILE_NAME = "font-cache.json";

export function getFontCacheFilePath(userDataPath?: string): string {
  const baseDir = userDataPath ?? app.getPath("userData");
  return path.join(baseDir, FONT_CACHE_DIR_NAME, FONT_CACHE_FILE_NAME);
}

export async function loadFontCache(userDataPath?: string): Promise<FontCacheState> {
  const filePath = getFontCacheFilePath(userDataPath);
  try {
    const data = await fs.readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(data);
    if (isValidFontCache(parsed)) {
      return { status: "loaded", cache: parsed };
    }
    return { status: "error", message: "Invalid font cache schema" };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      return { status: "notScanned" };
    }
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Failed to load font cache"
    };
  }
}

export async function saveFontCache(
  rawCache: unknown,
  userDataPath?: string
): Promise<FontCacheState> {
  if (!isValidFontCache(rawCache)) {
    return {
      status: "error",
      message: "Invalid font cache payload"
    };
  }

  const filePath = getFontCacheFilePath(userDataPath);
  const content = JSON.stringify(rawCache, null, 2);

  try {
    await writeFileAtomic(filePath, content);
    return { status: "loaded", cache: rawCache };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Failed to write font cache"
    };
  }
}
