export interface AppShutdownCleanupEvent {
  preventDefault(): void;
}

export interface AppShutdownCleanupTarget {
  on(
    eventName: "before-quit" | "will-quit",
    listener: (event: AppShutdownCleanupEvent) => void
  ): void;
  quit(): void;
}

export type AppShutdownCleanup = () => Promise<void> | void;

interface AppShutdownCleanupControllerOptions {
  cleanup: AppShutdownCleanup;
  requestQuit: () => void;
}

export interface AppShutdownCleanupController {
  handleQuitEvent(event: AppShutdownCleanupEvent): void;
}

export function createAppShutdownCleanupController({
  cleanup,
  requestQuit
}: AppShutdownCleanupControllerOptions): AppShutdownCleanupController {
  let cleanupPromise: Promise<void> | null = null;
  let cleanupComplete = false;
  let quitRequestedAfterCleanup = false;

  async function runCleanup(): Promise<void> {
    try {
      await cleanup();
    } catch {
      // Shutdown cleanup is best-effort, but normal quit waits for the attempt.
    } finally {
      cleanupComplete = true;
    }
  }

  function cleanupOnce(): Promise<void> {
    cleanupPromise ??= runCleanup();

    return cleanupPromise;
  }

  function requestQuitAfterCleanup(): void {
    if (quitRequestedAfterCleanup) {
      return;
    }

    quitRequestedAfterCleanup = true;
    requestQuit();
  }

  function handleQuitEvent(event: AppShutdownCleanupEvent): void {
    if (cleanupComplete) {
      return;
    }

    event.preventDefault();

    void cleanupOnce().finally(requestQuitAfterCleanup);
  }

  return {
    handleQuitEvent
  };
}

export function installAppShutdownCleanup(
  app: AppShutdownCleanupTarget,
  cleanup: AppShutdownCleanup
): void {
  const controller = createAppShutdownCleanupController({
    cleanup,
    requestQuit: () => app.quit()
  });

  app.on("before-quit", controller.handleQuitEvent);
  app.on("will-quit", controller.handleQuitEvent);
}
