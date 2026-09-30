import type { AppPlatform } from "../../../src/shared/platform";

/**
 * #636: makes `window.pergamum.platform` report `platform` (the renderer's
 * only platform source). Works even when a test installed `window.pergamum`
 * as a non-writable property. Returns a restore function.
 */
export function stubRuntimePlatform(platform: AppPlatform): () => void {
  const previousDescriptor = Object.getOwnPropertyDescriptor(
    window,
    "pergamum"
  );
  const previousValue = (window as unknown as { pergamum?: object }).pergamum;
  Object.defineProperty(window, "pergamum", {
    configurable: true,
    writable: true,
    value: { ...(previousValue ?? {}), platform }
  });
  return () => {
    if (previousDescriptor === undefined) {
      delete (window as unknown as { pergamum?: unknown }).pergamum;
    } else {
      Object.defineProperty(window, "pergamum", previousDescriptor);
    }
  };
}
