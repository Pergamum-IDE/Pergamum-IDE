// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t, type Translate } from "../../../src/shared/i18n";
import { applicationCommandIds } from "../../../src/shared/commandIds";
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
  autoDismissMs = 10_000,
  outputEnabled = true,
  actionOptions: Pick<
    React.ComponentProps<typeof NotificationHost>,
    "isActionEnabled" | "onExecuteAction"
  > = {}
): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root!.render(
      React.createElement(NotificationHost, {
        controller,
        translate,
        autoDismissMs,
        outputEnabled,
        ...actionOptions
      })
    );
  });
}

function hostElement(): HTMLElement {
  const host = container!.querySelector(".notificationHost-viewport");

  if (!(host instanceof HTMLElement)) {
    throw new Error("notification viewport host not rendered");
  }

  return host;
}

function anchorHostElement(): HTMLElement {
  const host = container!.querySelector(".notificationHost-anchorLayer");

  if (!(host instanceof HTMLElement)) {
    throw new Error("notification anchor host not rendered");
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

    const anchorHost = anchorHostElement();

    expect(anchorHost.tagName).toBe("OL");
    expect(anchorHost.getAttribute("aria-live")).toBe("polite");
    expect(anchorHost.querySelectorAll(".notificationToast")).toHaveLength(0);
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

  it("renders multiple toasts in the controller's priority-sorted DOM order", () => {
    const controller = new NotificationController();
    mount(controller);

    act(() => {
      controller.notify({ message: "one", priority: 10 });
      controller.notify({ message: "two", priority: 30 });
      controller.notify({ message: "three", priority: 20 });
    });

    expect(toastMessages()).toEqual(["two", "three", "one"]);
  });

  it("renders anchorRect toasts in a dedicated layer above dialogs without raising viewport toasts", () => {
    const controller = new NotificationController();
    mount(controller);

    act(() => {
      controller.notify({ message: "viewport" });
      controller.notify({
        message: "anchored",
        placement: {
          kind: "anchorRect",
          rect: { x: 20, y: 30, width: 40, height: 50 },
          preferredPlacement: "below"
        }
      });
    });

    expect(
      [...hostElement().querySelectorAll(".notificationToastMessage")].map(
        (node) => node.textContent ?? ""
      )
    ).toEqual(["viewport"]);
    expect(
      [
        ...anchorHostElement().querySelectorAll(".notificationToastMessage")
      ].map((node) => node.textContent ?? "")
    ).toEqual(["anchored"]);

    const anchoredToast = anchorHostElement().querySelector(
      ".notificationToast"
    ) as HTMLElement;

    expect(anchoredToast.style.position).toBe("fixed");
    expect(anchoredToast.style.insetBlockStart).toBe("88px");
  });

  it("keeps only the anchor layer above the app modal z-index", () => {
    const css = readFileSync("src/renderer/styles.css", "utf8");
    const ruleBlock = (selector: string): string => {
      const start = css.indexOf(selector);
      const end = css.indexOf("\n}", start);

      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);

      return css.slice(start, end + 2);
    };

    const viewportHostBlock = ruleBlock(".notificationHost-viewport");
    const anchorHostBlock = ruleBlock(".notificationHost-anchorLayer");
    const appDialogBackdropBlock = ruleBlock(".appDialogBackdrop");

    expect(appDialogBackdropBlock).toContain("z-index: 1000");
    expect(viewportHostBlock).toContain("z-index: 900");
    expect(anchorHostBlock).toContain("z-index: 1001");
  });

  it("pushes the autoDismissMs prop into the controller so toasts auto-dismiss", () => {
    const controller = new NotificationController();
    mount(controller, 5_000);

    act(() => {
      controller.notify({ message: "auto" });
    });
    expect(toastMessages()).toEqual(["auto"]);

    act(() => {
      vi.advanceTimersByTime(5_499);
    });
    expect(toastMessages()).toEqual(["auto"]);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(toastMessages()).toEqual([]);
  });

  it("does not auto-dismiss when autoDismissMs is 0", () => {
    const controller = new NotificationController();
    mount(controller, 0);

    act(() => {
      controller.notify({ message: "sticky" });
    });

    act(() => {
      vi.advanceTimersByTime(2_999);
    });

    expect(toastMessages()).toEqual(["sticky"]);

    act(() => {
      vi.advanceTimersByTime(1_000_000);
    });

    expect(toastMessages()).toEqual(["sticky"]);
  });

  it("suppresses and clears toasts when notification output is disabled", () => {
    const controller = new NotificationController();
    mount(controller, 10_000, false);

    act(() => {
      controller.notify({ message: "hidden" });
    });

    expect(toastMessages()).toEqual([]);
  });

  it("renders command actions as accessible buttons and rechecks disabled actions on click", () => {
    const controller = new NotificationController();
    const onExecuteAction = vi.fn();
    mount(controller, 10_000, true, {
      isActionEnabled: () => false,
      onExecuteAction
    });

    act(() => {
      controller.notify({
        message: "action",
        action: {
          kind: "command",
          commandId: applicationCommandIds.toggleRecentProjects,
          labelKey: "common.close"
        }
      });
    });

    const action = container!.querySelector(
      ".notificationToastAction"
    ) as HTMLButtonElement;

    expect(action.type).toBe("button");
    expect(action.getAttribute("aria-disabled")).toBe("true");

    act(() => {
      action.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onExecuteAction).not.toHaveBeenCalled();
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

  it("does not move focus when an anchored toast appears", () => {
    const controller = new NotificationController();
    mount(controller);

    const sentinel = document.createElement("input");
    document.body.appendChild(sentinel);
    sentinel.focus();
    expect(document.activeElement).toBe(sentinel);

    act(() => {
      controller.notify({
        message: "anchored focus",
        placement: {
          kind: "anchorRect",
          rect: { x: 20, y: 30, width: 40, height: 50 },
          preferredPlacement: "below"
        }
      });
    });

    expect(document.activeElement).toBe(sentinel);
    sentinel.remove();
  });
});
