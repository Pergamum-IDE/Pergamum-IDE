/**
 * #647: key capture for the Keyboard Shortcuts editing UI (main process).
 *
 * While the capture dialog is open the renderer turns the capture mode on.
 * From then on every keyDown in that window is swallowed here
 * (`before-input-event` + `preventDefault`, which also stops the Electron menu
 * accelerators and every shortcut from firing) and forwarded to the renderer
 * as a minimal `KeybindingCaptureInput`: key identity, modifiers and repeat
 * only. No text, selection or path is ever sent.
 *
 * The mode can never get stuck on: it is cleared when the dialog turns it off,
 * after a timeout, and when the window is destroyed, reloaded or crashes.
 */

import type { Event as ElectronEvent, Input, WebContents } from "electron";
import {
  KEYBINDINGS_CHANNELS,
  type KeybindingCaptureInput
} from "../shared/api";

/** Hard ceiling for one capture session. */
export const KEYBINDING_CAPTURE_TIMEOUT_MS = 60_000;

type CaptureWebContents = Pick<WebContents, "id" | "on" | "send">;

interface ActiveCapture {
  readonly webContentsId: number;
  readonly timer: ReturnType<typeof setTimeout>;
}

let installedWebContentsId: number | null = null;
let active: ActiveCapture | null = null;

export function isKeybindingCaptureActive(): boolean {
  return active !== null;
}

function deactivate(): void {
  if (active !== null) {
    clearTimeout(active.timer);
    active = null;
  }
}

/**
 * Turns the capture on / off. Only the window it was installed on may do so.
 * Returns whether the request was honored.
 */
export function setKeybindingCaptureActive(
  enabled: boolean,
  senderWebContentsId: number,
  timeoutMs: number = KEYBINDING_CAPTURE_TIMEOUT_MS
): boolean {
  if (installedWebContentsId === null || senderWebContentsId !== installedWebContentsId) {
    return false;
  }
  deactivate();
  if (enabled) {
    active = {
      webContentsId: senderWebContentsId,
      timer: setTimeout(deactivate, timeoutMs)
    };
  }
  return true;
}

/** The forwarded shape of an Electron `Input`. */
export function toCaptureInput(input: Input): KeybindingCaptureInput {
  return {
    key: input.key,
    code: input.code,
    ctrlKey: input.control,
    metaKey: input.meta,
    altKey: input.alt,
    shiftKey: input.shift,
    repeat: input.isAutoRepeat
  };
}

export function installKeybindingCapture(webContents: CaptureWebContents): void {
  installedWebContentsId = webContents.id;

  webContents.on(
    "before-input-event",
    (event: ElectronEvent, input: Input): void => {
      if (
        active === null ||
        active.webContentsId !== webContents.id ||
        input.type !== "keyDown"
      ) {
        return;
      }
      event.preventDefault();
      webContents.send(KEYBINDINGS_CHANNELS.captureInput, toCaptureInput(input));
    }
  );

  // A reload, a crash or closing the window must never leave keys swallowed.
  const reset = (): void => {
    if (active?.webContentsId === webContents.id) {
      deactivate();
    }
  };
  webContents.on("did-start-loading", reset);
  webContents.on("render-process-gone", reset);
  webContents.on("destroyed", reset);
}
