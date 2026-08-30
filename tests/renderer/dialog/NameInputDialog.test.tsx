// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Translate } from "../../../src/shared/i18n";
import type { ClipboardAdapter } from "../../../src/renderer/dialog/clipboardAdapter";
import {
  NameInputDialog,
  type NameInputDialogProps,
  type NameInputDialogValidation
} from "../../../src/renderer/dialog/NameInputDialog";

const translate: Translate = (key) => `t:${key}`;

let container: HTMLDivElement;
let root: Root;

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

function baseProps(
  overrides: Partial<NameInputDialogProps> = {}
): NameInputDialogProps {
  return {
    title: "New Markdown File",
    description: "Enter a file name.",
    inputLabel: "File name",
    placeholder: "new-file.md",
    primaryLabel: "Create File",
    icon: { url: "/assets/icons/file-plus.svg" },
    translate,
    clipboardAdapter: { writeText: vi.fn(async () => undefined) },
    opener: null,
    validateName: () => ({ state: "valid" }) as NameInputDialogValidation,
    onSubmit: vi.fn(async () => ({ ok: true }) as const),
    onClose: vi.fn(),
    ...overrides
  };
}

function render(props: NameInputDialogProps): void {
  act(() => {
    root.render(React.createElement(NameInputDialog, props));
  });
}

function input(): HTMLInputElement {
  return container.querySelector<HTMLInputElement>(".nameInputDialogInput")!;
}
function primaryButton(): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(".nameInputDialogPrimary")!;
}
function copyButton(): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>(".nameInputDialogCopyButton");
}
function errorText(): string | null {
  return container.querySelector(".nameInputDialogError")?.textContent ?? null;
}

function type(value: string): void {
  act(() => {
    const field = input();
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    nativeSetter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("NameInputDialog", () => {
  it("renders the caller-provided title, description, label, placeholder, primary label, and icon", () => {
    render(
      baseProps({
        title: "T",
        description: "D",
        inputLabel: "L",
        placeholder: "P",
        primaryLabel: "GO",
        icon: { url: "/caller/icon.svg", alt: "caller icon" }
      })
    );

    expect(container.textContent).toContain("T");
    expect(container.textContent).toContain("D");
    expect(container.textContent).toContain("L");
    expect(input().placeholder).toBe("P");
    expect(primaryButton().textContent).toBe("GO");

    const icon = container.querySelector<HTMLImageElement>(".nameInputDialogIcon")!;
    expect(icon.getAttribute("src")).toBe("/caller/icon.svg");
    expect(icon.getAttribute("alt")).toBe("caller icon");
  });

  it("treats an icon with no alt as decorative", () => {
    render(baseProps({ icon: { url: "/x.svg" } }));
    const icon = container.querySelector<HTMLImageElement>(".nameInputDialogIcon")!;
    expect(icon.getAttribute("alt")).toBe("");
    expect(icon.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows an injected validation error on submit and does not call onSubmit or show a copy button", async () => {
    const onSubmit = vi.fn(async () => ({ ok: true }) as const);
    render(
      baseProps({
        onSubmit,
        validateName: (value) =>
          value === "ok"
            ? { state: "valid" }
            : { state: "invalid", message: "bad name here" }
      })
    );

    type("nope");
    await act(async () => {
      primaryButton().click();
    });

    expect(errorText()).toBe("bad name here");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(copyButton()).toBeNull();
  });

  it("calls onSubmit with the raw value once the name is valid", async () => {
    const onSubmit = vi.fn(async () => ({ ok: true }) as const);
    render(
      baseProps({
        onSubmit,
        validateName: () => ({ state: "valid" })
      })
    );

    type("chapter-01");
    await act(async () => {
      primaryButton().click();
    });

    expect(onSubmit).toHaveBeenCalledWith("chapter-01");
  });

  it("shows the operation error message and a technical-copy button that copies the sanitized details", async () => {
    const writeText = vi.fn(async () => undefined);
    render(
      baseProps({
        clipboardAdapter: { writeText },
        onSubmit: async () => ({
          ok: false,
          error: {
            message: "could not create the item",
            technicalDetails: "reason: permissionDenied\nparent: (project root)"
          }
        })
      })
    );

    type("chapter-01");
    await act(async () => {
      primaryButton().click();
    });

    expect(errorText()).toBe("could not create the item");
    const copy = copyButton();
    expect(copy).not.toBeNull();
    expect(copy!.getAttribute("aria-label")).toBe("t:dialog.copyErrorDetails");

    await act(async () => {
      copy!.click();
    });
    expect(writeText).toHaveBeenCalledWith(
      "reason: permissionDenied\nparent: (project root)"
    );
  });

  it("does not show a technical-copy button for an operation error without details", async () => {
    render(
      baseProps({
        onSubmit: async () => ({
          ok: false,
          error: { message: "plain operation error" }
        })
      })
    );

    type("chapter-01");
    await act(async () => {
      primaryButton().click();
    });

    expect(errorText()).toBe("plain operation error");
    expect(copyButton()).toBeNull();
  });

  it("surfaces a clipboard failure without throwing", async () => {
    const writeText = vi.fn(async () => {
      throw new Error("clipboard blocked");
    });
    render(
      baseProps({
        clipboardAdapter: { writeText } as ClipboardAdapter,
        onSubmit: async () => ({
          ok: false,
          error: { message: "op error", technicalDetails: "details" }
        })
      })
    );

    type("chapter-01");
    await act(async () => {
      primaryButton().click();
    });
    await act(async () => {
      copyButton()!.click();
    });

    expect(
      container.querySelector(".appDialogCopyFailure")?.textContent
    ).toBe("t:dialog.copyErrorDetailsFailed");
  });

  it("does the create work outside the component — it never calls window.pergamum itself", () => {
    const source = require("node:fs").readFileSync(
      "src/renderer/dialog/NameInputDialog.tsx",
      "utf8"
    ) as string;
    expect(source).not.toContain("window.pergamum");
    expect(source).not.toMatch(/require\(["']node:fs["']\)|from ["']node:fs["']/);
    expect(source).not.toContain("projectRoot");
  });
});
