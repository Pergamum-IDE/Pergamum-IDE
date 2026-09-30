import { useEffect, useRef, useState } from "react";
import type { KeybindingCaptureInput } from "../shared/api";
import type { Translate } from "../shared/i18n";
import {
  captureKeyEvent,
  type KeyboardShortcutRow,
  type PergamumPlatform
} from "../shared/keybindings";
import { InfoDialog } from "./dialog/InfoDialog";

/**
 * #647: the key capture dialog of the Keyboard Shortcuts editor.
 *
 * While it is open, the main process swallows every key press (so no menu
 * accelerator or command fires) and forwards it over IPC; this dialog turns the
 * first meaningful one into catalog notation (`captureKeyEvent`). Escape
 * cancels; modifier-only presses are ignored; an unsupported key shows a
 * message and keeps waiting. Enter is not a confirmation: it is just a key.
 *
 * The capture mode is ALWAYS turned off when the dialog goes away (capture,
 * cancel, or unmount). If main cannot engage the mode, the dialog falls back to
 * its own DOM key listener.
 */

export interface KeyboardShortcutCaptureDialogProps {
  readonly translate: Translate;
  readonly platform: PergamumPlatform;
  readonly row: KeyboardShortcutRow;
  readonly opener: Element | null;
  /** The captured key, in catalog notation. */
  readonly onCapture: (notation: string) => void;
  readonly onCancel: () => void;
}

export function KeyboardShortcutCaptureDialog({
  translate,
  platform,
  row,
  opener,
  onCapture,
  onCancel
}: KeyboardShortcutCaptureDialogProps): JSX.Element {
  const [unsupported, setUnsupported] = useState(false);
  const callbacksRef = useRef({ onCapture, onCancel, platform });
  callbacksRef.current = { onCapture, onCancel, platform };
  const settledRef = useRef(false);

  useEffect(() => {
    const keybindings = window.pergamum.keybindings;
    let disposed = false;

    function handleInput(input: KeybindingCaptureInput): void {
      if (settledRef.current || input.repeat) {
        return;
      }
      const result = captureKeyEvent(input, callbacksRef.current.platform);
      if (result.kind === "ignore") {
        return;
      }
      if (result.kind === "unsupported") {
        setUnsupported(true);
        return;
      }
      settledRef.current = true;
      if (result.kind === "cancel") {
        callbacksRef.current.onCancel();
      } else {
        callbacksRef.current.onCapture(result.notation);
      }
    }

    const unsubscribe = keybindings.onCaptureInput(handleInput);

    // Fallback: if main cannot swallow the keys, listen in the DOM instead.
    const domListener = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      handleInput({
        key: event.key,
        code: event.code,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        repeat: event.repeat
      });
    };
    let domFallbackActive = false;

    void (async () => {
      let engaged = false;
      try {
        engaged = (await keybindings.setCaptureMode(true)).ok;
      } catch {
        engaged = false;
      }
      if (!engaged && !disposed) {
        domFallbackActive = true;
        window.addEventListener("keydown", domListener, true);
      }
    })();

    return () => {
      disposed = true;
      unsubscribe();
      if (domFallbackActive) {
        window.removeEventListener("keydown", domListener, true);
      }
      void keybindings.setCaptureMode(false).catch(() => undefined);
    };
  }, []);

  return (
    <InfoDialog
      title={translate("keyboardShortcuts.capture.title")}
      opener={opener}
      onClose={onCancel}
      footer={
        <button
          type="button"
          className="appDialogButton appDialogButton-cancel"
          onClick={onCancel}
        >
          {translate("keyboardShortcuts.capture.cancel")}
        </button>
      }
    >
      <div className="keyboardShortcutCaptureBody">
        <p className="keyboardShortcutCapturePrompt" role="status">
          {translate("keyboardShortcuts.capture.prompt")}
        </p>
        <p className="keyboardShortcutCaptureMeta">
          {translate("keyboardShortcuts.capture.command", {
            title: row.title,
            commandId: row.commandId
          })}
        </p>
        <p className="keyboardShortcutCaptureMeta">
          {translate("keyboardShortcuts.capture.current", {
            key: row.keyLabel ?? translate("keyboardShortcuts.unassigned")
          })}
        </p>
        <p className="keyboardShortcutCaptureHint">
          {translate("keyboardShortcuts.capture.hint")}
        </p>
        {unsupported ? (
          <p className="keyboardShortcutCaptureError" role="alert">
            {translate("keyboardShortcuts.unsupportedKey")}
          </p>
        ) : null}
      </div>
    </InfoDialog>
  );
}
