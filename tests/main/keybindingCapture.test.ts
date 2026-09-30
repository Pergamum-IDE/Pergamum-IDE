import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  KEYBINDING_CAPTURE_TIMEOUT_MS,
  installKeybindingCapture,
  isKeybindingCaptureActive,
  setKeybindingCaptureActive,
  toCaptureInput
} from "../../src/main/keybindingCapture";
import { KEYBINDINGS_CHANNELS } from "../../src/shared/api";

type FakeInput = {
  type: string;
  key: string;
  code: string;
  control: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  isAutoRepeat: boolean;
  isComposing?: boolean;
  [extra: string]: unknown;
};

function input(overrides: Partial<FakeInput> = {}): FakeInput {
  return {
    type: "keyDown",
    key: "s",
    code: "KeyS",
    control: true,
    meta: false,
    alt: false,
    shift: false,
    isAutoRepeat: false,
    ...overrides
  };
}

class FakeWebContents extends EventEmitter {
  readonly send = vi.fn();
  constructor(readonly id: number) {
    super();
  }
  press(fake: FakeInput): boolean {
    const preventDefault = vi.fn();
    this.emit("before-input-event", { preventDefault }, fake);
    return preventDefault.mock.calls.length > 0;
  }
}

let contents: FakeWebContents;

beforeEach(() => {
  vi.useFakeTimers();
  contents = new FakeWebContents(7);
  installKeybindingCapture(
    contents as unknown as Parameters<typeof installKeybindingCapture>[0]
  );
});

afterEach(() => {
  setKeybindingCaptureActive(false, 7);
  vi.useRealTimers();
});

describe("keybinding capture mode (#647)", () => {
  it("is off by default: key presses are left alone", () => {
    expect(isKeybindingCaptureActive()).toBe(false);
    expect(contents.press(input())).toBe(false);
    expect(contents.send).not.toHaveBeenCalled();
  });

  it("when on, swallows the key (so menu accelerators cannot fire) and forwards only the key identity", () => {
    expect(setKeybindingCaptureActive(true, 7)).toBe(true);
    expect(contents.press(input({ key: "s", code: "KeyS", control: true }))).toBe(true);
    expect(contents.send).toHaveBeenCalledOnce();
    expect(contents.send).toHaveBeenCalledWith(KEYBINDINGS_CHANNELS.captureInput, {
      key: "s",
      code: "KeyS",
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      repeat: false
    });
  });

  it("forwards nothing beyond key / code / modifiers / repeat (no text, no extra fields)", () => {
    setKeybindingCaptureActive(true, 7);
    contents.press(
      input({ isComposing: true, text: "secret", path: "C:/secret", modifiers: ["x"] })
    );
    const payload = contents.send.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      ["altKey", "code", "ctrlKey", "key", "metaKey", "repeat", "shiftKey"].sort()
    );
    expect(JSON.stringify(payload)).not.toContain("secret");
  });

  it("forwards the auto-repeat flag so the renderer can ignore repeats", () => {
    setKeybindingCaptureActive(true, 7);
    contents.press(input({ isAutoRepeat: true }));
    expect(contents.send.mock.calls[0]?.[1]).toMatchObject({ repeat: true });
  });

  it("only keyDown is swallowed (keyUp passes)", () => {
    setKeybindingCaptureActive(true, 7);
    expect(contents.press(input({ type: "keyUp" }))).toBe(false);
    expect(contents.send).not.toHaveBeenCalled();
  });

  it("turning it off restores normal key handling", () => {
    setKeybindingCaptureActive(true, 7);
    expect(contents.press(input())).toBe(true);
    setKeybindingCaptureActive(false, 7);
    expect(isKeybindingCaptureActive()).toBe(false);
    expect(contents.press(input())).toBe(false);
  });

  it("only the window it was installed on may turn it on", () => {
    expect(setKeybindingCaptureActive(true, 999)).toBe(false);
    expect(isKeybindingCaptureActive()).toBe(false);
    expect(contents.press(input())).toBe(false);
  });

  it("a different window's key presses are never swallowed", () => {
    setKeybindingCaptureActive(true, 7);
    const other = new FakeWebContents(8);
    installKeybindingCapture(other as unknown as Parameters<typeof installKeybindingCapture>[0]);
    // The capture belongs to window 7; window 8's keys are left alone.
    expect(other.press(input())).toBe(false);
    expect(other.send).not.toHaveBeenCalled();
    expect(contents.press(input())).toBe(true);
    // A window that is not the installed one cannot turn it on or off.
    expect(setKeybindingCaptureActive(false, 7)).toBe(false);
    // Leave module state clean for the next test.
    installKeybindingCapture(contents as unknown as Parameters<typeof installKeybindingCapture>[0]);
    setKeybindingCaptureActive(false, 7);
  });

  it("clears itself after the timeout so keys can never stay swallowed", () => {
    setKeybindingCaptureActive(true, 7);
    vi.advanceTimersByTime(KEYBINDING_CAPTURE_TIMEOUT_MS + 1);
    expect(isKeybindingCaptureActive()).toBe(false);
    expect(contents.press(input())).toBe(false);
  });

  it.each(["did-start-loading", "render-process-gone", "destroyed"])(
    "clears itself on %s",
    (eventName) => {
      setKeybindingCaptureActive(true, 7);
      contents.emit(eventName);
      expect(isKeybindingCaptureActive()).toBe(false);
      expect(contents.press(input())).toBe(false);
    }
  );

  it("turning it on again restarts the timeout", () => {
    setKeybindingCaptureActive(true, 7);
    vi.advanceTimersByTime(KEYBINDING_CAPTURE_TIMEOUT_MS - 1000);
    setKeybindingCaptureActive(true, 7);
    vi.advanceTimersByTime(KEYBINDING_CAPTURE_TIMEOUT_MS - 1000);
    expect(isKeybindingCaptureActive()).toBe(true);
  });
});

describe("toCaptureInput (#647)", () => {
  it("maps an Electron Input to the minimal forwarded shape", () => {
    expect(
      toCaptureInput(
        input({ key: "9", code: "Digit9", control: false, meta: true, alt: true, shift: true }) as never
      )
    ).toEqual({
      key: "9",
      code: "Digit9",
      ctrlKey: false,
      metaKey: true,
      altKey: true,
      shiftKey: true,
      repeat: false
    });
  });
});
