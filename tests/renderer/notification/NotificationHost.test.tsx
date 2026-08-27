// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t, type Translate } from "../../../src/shared/i18n";
import { NotificationController } from "../../../src/renderer/notification/notificationController";
import { NotificationHost } from "../../../src/renderer/notification/NotificationHost";

const translate: Translate = (key, values) => t("ja", key, values);

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
  vi.useRealTimers();
});

function mount(
  controller: NotificationController,
  autoDismissMs = 10_000
): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root!.render(
      React.createElement(NotificationHost, {
        controller,
        translate,
        autoDismissMs
      })
    );
  });
}

function hostElement(): HTMLElement {
  const host = container!.querySelector(".notificationHost");

  if (!(host instanceof HTMLElement)) {
    throw new Error("notification host not rendered");
  }

  return host;
}

function toastMessages(): string[] {
  return [...container!.querySelectorAll(".notificationToastMessage")].map(
    (node) => node.textContent ?? ""
  );
}

describe("NotificationHost (#266)", () => {
  it("renders a stable, non-assertive live region even with zero notifications", () => {
    const controller = new NotificationController();
    mount(controller);

    const host = hostElement();

    expect(host.tagName).toBe("OL");
    expect(host.getAttribute("aria-live")).toBe("polite");
    expect(host.querySelectorAll(".notificationToast")).toHaveLength(0);
  });

  it("shows a toast with its message when the controller receives a notification", () => {
    const controller = new NotificationController();
    mount(controller);

    act(() => {
      controller.notify({ message: "プロジェクト外のファイルを開きました" });
    });

    expect(toastMessages()).toEqual([
      "プロジェクト外のファイルを開きました"
    ]);
  });

  it("dismisses a single toast when its close button is clicked", () => {
    const controller = new NotificationController();
    mount(controller);

    act(() => {
      controller.notify({ message: "first" });
      controller.notify({ message: "second" });
    });
    expect(toastMessages()).toEqual(["first", "second"]);

    const firstClose = container!.querySelector(
      ".notificationToastClose"
    ) as HTMLButtonElement;

    act(() => {
      firstClose.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(toastMessages()).toEqual(["second"]);
  });

  it("stacks multiple toasts in insertion order in the DOM", () => {
    const controller = new NotificationController();
    mount(controller);

    act(() => {
      controller.notify({ message: "one" });
      controller.notify({ message: "two" });
      controller.notify({ message: "three" });
    });

    expect(toastMessages()).toEqual(["one", "two", "three"]);
  });

  it("pushes the autoDismissMs prop into the controller so toasts auto-dismiss", () => {
    const controller = new NotificationController();
    mount(controller, 5_000);

    act(() => {
      controller.notify({ message: "auto" });
    });
    expect(toastMessages()).toEqual(["auto"]);

    act(() => {
      vi.advanceTimersByTime(4_999);
    });
    expect(toastMessages()).toEqual(["auto"]);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(toastMessages()).toEqual([]);
  });

  it("keeps a toast on screen indefinitely when autoDismissMs is 0", () => {
    const controller = new NotificationController();
    mount(controller, 0);

    act(() => {
      controller.notify({ message: "sticky" });
    });

    act(() => {
      vi.advanceTimersByTime(600_000);
    });

    expect(toastMessages()).toEqual(["sticky"]);
  });

  it("does not move focus when a toast appears", () => {
    const controller = new NotificationController();
    mount(controller);

    const sentinel = document.createElement("input");
    document.body.appendChild(sentinel);
    sentinel.focus();
    expect(document.activeElement).toBe(sentinel);

    act(() => {
      controller.notify({ message: "no focus steal" });
    });

    expect(document.activeElement).toBe(sentinel);
    sentinel.remove();
  });
});
