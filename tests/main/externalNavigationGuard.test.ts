import { describe, expect, it, vi } from "vitest";
import {
  installExternalNavigationGuard,
  isApplicationNavigation,
  type NavigationGuardWebContents
} from "../../src/main/externalNavigationGuard";

const packagedUrl = "file:///C:/Program%20Files/Pergamum/resources/app/index.html";
const devUrl = "http://localhost:5173/";

describe("isApplicationNavigation", () => {
  it("allows the application's own document (packaged and dev server)", () => {
    expect(isApplicationNavigation(packagedUrl, packagedUrl)).toBe(true);
    expect(isApplicationNavigation(`${packagedUrl}#anchor`, packagedUrl)).toBe(true);
    expect(isApplicationNavigation("http://localhost:5173/#x", devUrl)).toBe(true);
    expect(isApplicationNavigation("http://localhost:5173/other", devUrl)).toBe(true);
  });

  it("denies every external destination", () => {
    for (const target of [
      "https://www.github.com/",
      "http://www.github.com/",
      "file:///C:/Windows/System32/notepad.exe",
      "mailto:test@example.com",
      "ftp://example.com/",
      "javascript:alert(1)",
      "data:text/html,x",
      "not a url"
    ]) {
      expect(isApplicationNavigation(target, packagedUrl), target).toBe(false);
      expect(isApplicationNavigation(target, devUrl), target).toBe(false);
    }
  });
});

describe("installExternalNavigationGuard", () => {
  function fakeWebContents(currentUrl: string) {
    let willNavigate:
      | ((event: { preventDefault(): void }, url: string) => void)
      | undefined;
    let openHandler: (() => { action: "deny" }) | undefined;
    const webContents: NavigationGuardWebContents = {
      on: (_event, listener) => {
        willNavigate = listener;
      },
      setWindowOpenHandler: (handler) => {
        openHandler = handler;
      },
      getURL: () => currentUrl
    };

    return {
      webContents,
      navigate: (url: string) => {
        const event = { preventDefault: vi.fn() };
        willNavigate?.(event, url);
        return event.preventDefault.mock.calls.length > 0;
      },
      open: () => openHandler?.()
    };
  }

  it("prevents navigation to an external page but not within the app", () => {
    const fake = fakeWebContents(packagedUrl);
    installExternalNavigationGuard(fake.webContents);

    expect(fake.navigate("https://www.github.com/")).toBe(true);
    expect(fake.navigate("http://www.github.com/")).toBe(true);
    expect(fake.navigate("file:///C:/Windows/System32/notepad.exe")).toBe(true);
    expect(fake.navigate(`${packagedUrl}#heading`)).toBe(false);
  });

  it("denies every new window (target=_blank / window.open)", () => {
    const fake = fakeWebContents(devUrl);
    installExternalNavigationGuard(fake.webContents);

    expect(fake.open()).toEqual({ action: "deny" });
  });
});

describe("main window wiring", () => {
  it("installs the guard on the main BrowserWindow right after it is created", async () => {
    const { readFileSync } = await import("node:fs");
    const main = readFileSync("src/main/main.ts", "utf8");

    expect(main).toContain("installExternalNavigationGuard(mainWindow.webContents)");
    expect(main.indexOf("new BrowserWindow({")).toBeLessThan(
      main.indexOf("installExternalNavigationGuard(mainWindow.webContents)")
    );
  });
});
