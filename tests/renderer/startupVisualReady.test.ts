import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createOneShotNotifier } from "../../src/renderer/startupVisualReady";

describe("startup visual ready notifier (#659)", () => {
  it("sends exactly once and every call shares the same promise (StrictMode)", async () => {
    const send = vi.fn(async () => undefined);
    const notify = createOneShotNotifier(send);

    const first = notify();
    const second = notify();
    expect(second).toBe(first);
    await first;
    await notify();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("resolves only after the send settles (Main replied)", async () => {
    let reply: () => void = () => undefined;
    const notify = createOneShotNotifier(
      () => new Promise<void>((resolve) => (reply = resolve))
    );
    let settled = false;
    void notify().then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    reply();
    await notify();
    expect(settled).toBe(true);
  });

  it("never rejects on a rejected or throwing send", async () => {
    await expect(
      createOneShotNotifier(() => Promise.reject(new Error("x")))()
    ).resolves.toBeUndefined();
    await expect(
      createOneShotNotifier(() => {
        throw new Error("x");
      })()
    ).resolves.toBeUndefined();
  });
});

describe("startup visual ready wiring (#659 / #274)", () => {
  const app = readFileSync("src/renderer/App.tsx", "utf8");
  const hook = readFileSync("src/renderer/useApplicationSettings.ts", "utf8");

  it("notifies only after settings finished loading, after every visual effect", () => {
    const notify = app.indexOf("notifyStartupVisualReady()");
    expect(notify).toBeGreaterThan(-1);
    expect(app.slice(notify - 200, notify)).toContain("isSettingsLoading");

    for (const apply of [
      "applyColorThemeById(",
      "applyWorkbenchFontFamily(",
      "applyEditorFontFamily(",
      "applyWorkbenchUiFontFamilyList(",
      "applyEditorFontFamilyList(",
      "applyPreviewFontFamilyList("
    ]) {
      const index = app.lastIndexOf(apply, notify);
      expect(index, apply).toBeGreaterThan(-1);
      expect(index, apply).toBeLessThan(notify);
    }
  });

  it("cold-start Session restore waits for the window-mode reply", () => {
    const restore = app.indexOf("coldStartRestoreAttemptedRef.current = true;");
    const guard = app.slice(restore - 220, restore);
    expect(guard).toContain("isSettingsLoading");
    expect(guard).toContain("!startupWindowModeReady");
  });

  it("flips isLoading in the same block as the settings (success and failure)", () => {
    expect(hook).not.toContain(".finally(");
    const success = hook.indexOf("setDisplayLanguage(loadedSettings");
    expect(hook.indexOf("setIsLoading(false);", success)).toBeGreaterThan(
      success
    );
    expect(hook).toContain(
      "setError(errorMessage(loadError));\n        setIsLoading(false);"
    );
  });
});
