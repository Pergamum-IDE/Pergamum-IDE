/**
 * #659: one-shot "startup visual settings are applied" signal to Main, which
 * keeps the Main Window hidden until it arrives.
 *
 * Main replies only AFTER it has applied the saved maximize / fullscreen mode
 * and shown the window, so the returned promise doubles as "startup window
 * mode ready": the renderer starts Session restore only once it settles
 * (#274: Window mode before Session restore / layout).
 *
 * Module-level on purpose: React StrictMode runs effects twice in
 * development, and later runtime setting changes must never re-notify — every
 * call returns the same promise. It never rejects: a failed send must not
 * block restore (Main has its own failsafe reveal).
 */
export function createOneShotNotifier(
  send: () => Promise<void> | void
): () => Promise<void> {
  let settled: Promise<void> | null = null;

  return () => {
    if (settled === null) {
      settled = (async () => {
        try {
          await send();
        } catch {
          // see above
        }
      })();
    }
    return settled;
  };
}

export const notifyStartupVisualReady = createOneShotNotifier(() =>
  window.pergamum.window.startupVisualReady()
);
