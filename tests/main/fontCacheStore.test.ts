import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getFontCacheFilePath,
  loadFontCache,
  saveFontCache
} from "../../src/main/fontCacheStore";
import type { FontCache } from "../../src/shared/fontCache";

describe("fontCacheStore Main Process Persistence (#491)", () => {
  let tempUserDataDir: string;

  beforeEach(async () => {
    tempUserDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "pergamum-font-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempUserDataDir, { recursive: true, force: true });
  });

  it("distinguishes missing file vs invalid JSON vs schema-invalid cache payload vs valid cache", async () => {
    // 1. Missing file -> status: "notScanned"
    const missingResult = await loadFontCache(tempUserDataDir);
    expect(missingResult).toEqual({ status: "notScanned" });

    const cacheFilePath = getFontCacheFilePath(tempUserDataDir);
    await fs.mkdir(path.dirname(cacheFilePath), { recursive: true });

    // 2. Invalid JSON -> status: "error"
    await fs.writeFile(cacheFilePath, "{ broken json ...", "utf8");
    const invalidJsonResult = await loadFontCache(tempUserDataDir);
    expect(invalidJsonResult.status).toBe("error");
    if (invalidJsonResult.status === "error") {
      expect(invalidJsonResult.message).toBeTruthy();
    }

    // 3. Schema-invalid cache payload -> status: "error", message: "Invalid font cache schema"
    await fs.writeFile(cacheFilePath, JSON.stringify({ version: 99, bad: "schema" }), "utf8");
    const invalidSchemaResult = await loadFontCache(tempUserDataDir);
    expect(invalidSchemaResult).toEqual({
      status: "error",
      message: "Invalid font cache schema"
    });

    // 4. Valid cache file -> status: "loaded"
    const sampleCache: FontCache = {
      version: 1,
      scannedAt: "2026-09-16T14:30:00.000Z",
      uiLanguage: "ja",
      families: [
        { family: "MS Gothic", displayName: "MS Gothic", fixedWidth: "unknown" }
      ]
    };
    await saveFontCache(sampleCache, tempUserDataDir);

    expect(cacheFilePath).toBe(
      path.join(tempUserDataDir, "FontCache", "font-cache.json")
    );
    expect(cacheFilePath).not.toContain(".pergamum");

    const loadResult = await loadFontCache(tempUserDataDir);
    expect(loadResult).toEqual({ status: "loaded", cache: sampleCache });
  });

  it("rejects invalid cache payload save without corrupting existing valid cache", async () => {
    const validCache: FontCache = {
      version: 1,
      scannedAt: "2026-09-16T14:30:00.000Z",
      uiLanguage: "ja",
      families: [
        { family: "Consolas", displayName: "Consolas", fixedWidth: "unknown" }
      ]
    };

    await saveFontCache(validCache, tempUserDataDir);

    const invalidSave = await saveFontCache({ invalid: true }, tempUserDataDir);
    expect(invalidSave.status).toBe("error");

    const loadResult = await loadFontCache(tempUserDataDir);
    expect(loadResult).toEqual({ status: "loaded", cache: validCache });
  });
});
