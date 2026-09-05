import type { App, BrowserWindow, IpcMain } from "electron";
import {
  LIFECYCLE_CHANNELS,
  type LifecycleCloseDecision,
  type LifecycleWindowCloseRequest,
  type QuitApplicationRequest,
  type QuitApplicationResult
} from "../shared/api";

type WindowCloseState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "pendingRendererDecision";
      readonly requestId: string;
      readonly timeout: ReturnType<typeof setTimeout>;
    }
  | { readonly kind: "closeApproved"; readonly requestId: string };

interface PreventableCloseEvent {
  preventDefault(): void;
}

export interface WindowLifecycleSystemTerminationSource {
  on(eventName: "shutdown", listener: () => void): void;
}

export interface WindowLifecycleController {
  registerWindow(window: BrowserWindow): void;
  requestApplicationQuit(): QuitApplicationResult;
  markSystemTermination(): void;
}

export interface WindowLifecycleOptions {
  readonly app: Pick<App, "quit" | "relaunch">;
  readonly ipcMain: Pick<IpcMain, "handle">;
  readonly getOpenWindowCount: () => number;
  readonly systemTerminationSource?: WindowLifecycleSystemTerminationSource;
  readonly requestTimeoutMs?: number;
}

const defaultWindowCloseRequestTimeoutMs = 30_000;

function createLifecycleRequestId(intent: string): string {
  return `${intent}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function isRequestObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLifecycleCloseDecision(
  value: unknown
): LifecycleCloseDecision {
  if (
    !isRequestObject(value) ||
    typeof value.requestId !== "string" ||
    value.requestId.length === 0 ||
    typeof value.status !== "string"
  ) {
    throw new Error("Invalid lifecycle close decision.");
  }

  switch (value.status) {
    case "approved":
    case "cancelled":
      return {
        status: value.status,
        requestId: value.requestId
      };
    case "failed":
      if (
        value.reason !== "dirtyResolutionFailed" &&
        value.reason !== "rendererUnavailable"
      ) {
        throw new Error("Invalid lifecycle close failure reason.");
      }

      return {
        status: "failed",
        requestId: value.requestId,
        reason: value.reason
      };
    default:
      throw new Error("Invalid lifecycle close decision status.");
  }
}

function parseQuitApplicationRequest(
  value: unknown
): QuitApplicationRequest {
  if (
    !isRequestObject(value) ||
    typeof value.requestId !== "string" ||
    value.requestId.length === 0 ||
    value.intent !== "explicitApplicationQuit" ||
    (value.restartAfterQuit !== undefined &&
      typeof value.restartAfterQuit !== "boolean")
  ) {
    throw new Error("Invalid application quit request.");
  }

  return {
    requestId: value.requestId,
    intent: value.intent,
    restartAfterQuit: value.restartAfterQuit === true
  };
}

export function createWindowLifecycleController(
  options: WindowLifecycleOptions
): WindowLifecycleController {
  const requestTimeoutMs =
    options.requestTimeoutMs ?? defaultWindowCloseRequestTimeoutMs;
  const windows = new Map<number, BrowserWindow>();
  const windowStates = new Map<number, WindowCloseState>();
  let quitApproved = false;
  // One-way for this process: after OS/session shutdown is observed, Pergamum
  // assumes the process is already moving toward termination and must not
  // start renderer dirty-resolution dialogs from window close events.
  let systemTerminationActive = false;

  function setWindowState(window: BrowserWindow, state: WindowCloseState): void {
    windowStates.set(window.id, state);
  }

  function clearPendingTimeout(state: WindowCloseState): void {
    if (state.kind === "pendingRendererDecision") {
      clearTimeout(state.timeout);
    }
  }

  function resetWindowState(window: BrowserWindow): void {
    const state = windowStates.get(window.id);
    if (state) {
      clearPendingTimeout(state);
    }
    setWindowState(window, { kind: "idle" });
  }

  function findPendingWindow(
    requestId: string
  ): { window: BrowserWindow; state: WindowCloseState } | null {
    for (const window of windows.values()) {
      const state = windowStates.get(window.id);
      if (
        state?.kind === "pendingRendererDecision" &&
        state.requestId === requestId
      ) {
        return { window, state };
      }
    }

    return null;
  }

  function handleWindowClose(
    window: BrowserWindow,
    event: PreventableCloseEvent
  ): void {
    const state = windowStates.get(window.id) ?? { kind: "idle" };

    if (
      quitApproved ||
      systemTerminationActive ||
      state.kind === "closeApproved"
    ) {
      clearPendingTimeout(state);
      windowStates.delete(window.id);
      return;
    }

    event.preventDefault();

    if (state.kind === "pendingRendererDecision") {
      return;
    }

    if (window.isDestroyed() || window.webContents.isDestroyed()) {
      resetWindowState(window);
      return;
    }

    const request: LifecycleWindowCloseRequest = {
      requestId: createLifecycleRequestId("ordinaryWindowClose"),
      intent: "ordinaryWindowClose",
      isFinalWindow: options.getOpenWindowCount() <= 1
    };
    const timeout = setTimeout(() => {
      const latestState = windowStates.get(window.id);
      if (
        latestState?.kind === "pendingRendererDecision" &&
        latestState.requestId === request.requestId
      ) {
        setWindowState(window, { kind: "idle" });
      }
    }, requestTimeoutMs);

    setWindowState(window, {
      kind: "pendingRendererDecision",
      requestId: request.requestId,
      timeout
    });
    window.webContents.send(LIFECYCLE_CHANNELS.windowCloseRequested, request);
  }

  function handleWindowCloseDecision(decision: LifecycleCloseDecision): void {
    const pending = findPendingWindow(decision.requestId);

    if (!pending) {
      return;
    }

    clearPendingTimeout(pending.state);

    if (decision.status !== "approved") {
      setWindowState(pending.window, { kind: "idle" });
      return;
    }

    setWindowState(pending.window, {
      kind: "closeApproved",
      requestId: decision.requestId
    });

    if (!pending.window.isDestroyed()) {
      pending.window.close();
    }
  }

  function requestApplicationQuit(
    request: QuitApplicationRequest
  ): QuitApplicationResult {
    if (quitApproved) {
      return { status: "ignored", reason: "quitAlreadyApproved" };
    }

    quitApproved = true;

    // #394 Step 3: this is the ONE point where quit is actually being
    // authorized for this request (dirty-document preflight, if any, has
    // already resolved by the time a renderer reaches this IPC call — see
    // App.tsx's runQuitOrRestartFlow). Relaunch is scheduled here, strictly
    // BEFORE the quit it rides on, and never for a request that didn't ask
    // for it. `quitApproved` above already guarantees at most one relaunch
    // per process, no matter how many requests arrive.
    if (request.restartAfterQuit) {
      options.app.relaunch();
    }

    options.app.quit();

    return { status: "quitting" };
  }

  options.ipcMain.handle(
    LIFECYCLE_CHANNELS.respondWindowCloseRequest,
    (_event, rawDecision: unknown): void => {
      handleWindowCloseDecision(parseLifecycleCloseDecision(rawDecision));
    }
  );

  options.ipcMain.handle(
    LIFECYCLE_CHANNELS.quitApplication,
    (_event, rawRequest: unknown): QuitApplicationResult =>
      requestApplicationQuit(parseQuitApplicationRequest(rawRequest))
  );

  options.systemTerminationSource?.on("shutdown", () => {
    systemTerminationActive = true;
  });

  return {
    registerWindow(window) {
      windows.set(window.id, window);
      setWindowState(window, { kind: "idle" });
      window.on("close", (event) => handleWindowClose(window, event));
      window.on("closed", () => {
        const state = windowStates.get(window.id);
        if (state) {
          clearPendingTimeout(state);
        }
        windows.delete(window.id);
        windowStates.delete(window.id);
      });
      window.on("query-session-end", () => {
        systemTerminationActive = true;
      });
      window.on("session-end", () => {
        systemTerminationActive = true;
      });
    },
    requestApplicationQuit() {
      return requestApplicationQuit({
        requestId: createLifecycleRequestId("explicitApplicationQuit"),
        intent: "explicitApplicationQuit"
      });
    },
    markSystemTermination() {
      systemTerminationActive = true;
    }
  };
}
