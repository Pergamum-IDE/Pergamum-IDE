// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InfoDialog } from "../../../src/renderer/dialog/InfoDialog";
import { handleInfoDialogKeyDown } from "../../../src/renderer/dialog/infoDialogHandlers";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function firstAttributeValue(markup: string, attribute: string): string {
  const match = markup.match(new RegExp(`${attribute}="([^"]+)"`));

  if (!match) {
    throw new Error(`Missing attribute: ${attribute}`);
  }

  return match[1];
}

describe("InfoDialog foundation (#221)", () => {
  it("renders an accessible modal dialog with body content and footer actions", () => {
    const markup = renderToStaticMarkup(
      React.createElement(InfoDialog, {
        title: "About Pergamum",
        opener: null,
        onClose: () => undefined,
        footer: React.createElement(
          "button",
          { type: "button", autoFocus: true },
          "Close"
        ),
        children: React.createElement("p", null, "Dialog body")
      })
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    const titleId = firstAttributeValue(markup, "aria-labelledby");
    const bodyId = firstAttributeValue(markup, "aria-describedby");

    expect(titleId).not.toBe("appInfoDialogTitle");
    expect(bodyId).not.toBe("appInfoDialogBody");
    expect(markup).toContain(`id="${titleId}"`);
    expect(markup).toContain(`id="${bodyId}"`);
    expect(markup).toContain("appDialogHeader appInfoDialogHeader");
    expect(markup).toContain(">About Pergamum<");
    expect(markup).toContain(">Dialog body<");
    expect(markup).toContain(">Close<");
    expect(markup).toContain("appInfoDialog");
  });

  it("can keep the accessible title while hiding the visual title bar", () => {
    const markup = renderToStaticMarkup(
      React.createElement(InfoDialog, {
        title: "About Pergamum",
        opener: null,
        hideVisualTitle: true,
        onClose: () => undefined,
        footer: React.createElement("button", { type: "button" }, "Close"),
        children: React.createElement("p", null, "Dialog body")
      })
    );

    const titleId = firstAttributeValue(markup, "aria-labelledby");

    expect(markup).toContain(`id="${titleId}"`);
    expect(markup).toContain("appInfoDialogHiddenTitle");
    expect(markup).toContain(">About Pergamum<");
    expect(markup).not.toContain("appDialogHeader appInfoDialogHeader");
  });

  it("generates unique title and body ids for multiple InfoDialog instances", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(InfoDialog, {
          title: "First",
          opener: null,
          onClose: () => undefined,
          footer: React.createElement("button", { type: "button" }, "Close"),
          children: React.createElement("p", null, "First body")
        }),
        React.createElement(InfoDialog, {
          title: "Second",
          opener: null,
          onClose: () => undefined,
          footer: React.createElement("button", { type: "button" }, "Close"),
          children: React.createElement("p", null, "Second body")
        })
      )
    );
    const titleIds = [...markup.matchAll(/aria-labelledby="([^"]+)"/g)].map(
      (match) => match[1]
    );
    const bodyIds = [...markup.matchAll(/aria-describedby="([^"]+)"/g)].map(
      (match) => match[1]
    );

    expect(titleIds).toHaveLength(2);
    expect(bodyIds).toHaveLength(2);
    expect(new Set(titleIds).size).toBe(2);
    expect(new Set(bodyIds).size).toBe(2);

    for (const id of [...titleIds, ...bodyIds]) {
      expect(id).not.toBe("appInfoDialogTitle");
      expect(id).not.toBe("appInfoDialogBody");
      expect(markup).toContain(`id="${id}"`);
    }
  });

  it("keeps the hidden title in the accessibility tree with an sr-only CSS pattern", () => {
    const styles = readFileSync("src/renderer/styles.css", "utf8");
    const start = styles.indexOf(".appInfoDialogHiddenTitle {");

    expect(start).toBeGreaterThan(-1);

    const end = styles.indexOf("}", start);
    const hiddenTitleCss = styles.slice(start, end + 1);

    expect(hiddenTitleCss).toContain("position: absolute");
    expect(hiddenTitleCss).toContain("width: 1px");
    expect(hiddenTitleCss).toContain("height: 1px");
    expect(hiddenTitleCss).toContain("clip-path: inset(50%)");
    expect(hiddenTitleCss).not.toContain("display: none");
    expect(hiddenTitleCss).not.toContain("visibility: hidden");
  });

  it("closes on Escape and leaves other keys to the dialog", () => {
    const onClose = vi.fn();

    expect(handleInfoDialogKeyDown({ key: "Escape" }, onClose)).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);

    expect(handleInfoDialogKeyDown({ key: "Enter" }, onClose)).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("InfoDialog backdrop dismissal is strictly opt-in", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  function render(props: Partial<React.ComponentProps<typeof InfoDialog>>): void {
    act(() => {
      root.render(
        React.createElement(InfoDialog, {
          title: "Backdrop test",
          opener: null,
          onClose: () => undefined,
          footer: React.createElement("button", { type: "button" }, "Close"),
          children: React.createElement("p", null, "Body"),
          ...props
        })
      );
    });
  }

  it("does not close on a backdrop click by default", () => {
    const onClose = vi.fn();
    render({ onClose });

    act(() => {
      container.querySelector<HTMLElement>(".appDialogBackdrop")?.click();
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on a backdrop click only when dismissOnBackdropClick is set", () => {
    const onClose = vi.fn();
    render({ onClose, dismissOnBackdropClick: true });

    act(() => {
      container.querySelector<HTMLElement>(".appDialogBackdrop")?.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    // A click that originates inside the dialog body still does not close it.
    act(() => {
      container.querySelector<HTMLElement>(".appInfoDialog")?.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
