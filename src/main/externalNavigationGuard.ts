/**
 * Keeps Pergamum's own BrowserWindow from ever turning into a web browser.
 *
 * The window only ever shows the application itself, so any navigation away
 * from it (a stray `<a href="https://...">`, `location.href = ...`) is
 * denied, and no additional window may be opened (`target="_blank"`,
 * `window.open`). The one sanctioned way to reach an external site is the
 * renderer's confirmation dialog followed by the validated
 * `appInfo.openExternalUrl` IPC (http/https only, re-checked in main).
 */

/** The slice of `webContents` this guard needs (kept narrow for tests). */
export interface NavigationGuardWebContents {
  on(
    event: "will-navigate",
    listener: (event: { preventDefault(): void }, url: string) => void
  ): unknown;
  setWindowOpenHandler(handler: () => { action: "deny" }): void;
  getURL(): string;
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * Whether a navigation from `currentUrl` to `targetUrl` stays inside the
 * application: the same document (a hash change / the same file), or — for a
 * dev server — the same origin. Anything else is external.
 */
export function isApplicationNavigation(
  targetUrl: string,
  currentUrl: string
): boolean {
  const target = parseUrl(targetUrl);
  const current = parseUrl(currentUrl);

  if (!target || !current || target.protocol !== current.protocol) {
    return false;
  }

  if (target.protocol === "file:") {
    return target.pathname === current.pathname;
  }

  if (target.protocol === "http:" || target.protocol === "https:") {
    // Vite dev server: the page's own origin.
    return target.origin === current.origin;
  }

  return false;
}

export function installExternalNavigationGuard(
  webContents: NavigationGuardWebContents
): void {
  webContents.on("will-navigate", (event, url) => {
    if (!isApplicationNavigation(url, webContents.getURL())) {
      event.preventDefault();
    }
  });

  // No new Electron windows, ever.
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}
