// @vitest-environment happy-dom
//
// #413: the pre-move confirmation dialog must map its three footer buttons to
// three DISTINCT callbacks — "更新する" / "更新しない" / "キャンセル" — so
// "don't update" can never be treated like "update".
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { t, type Translate } from "../../src/shared/i18n";
import { MarkdownImageLinkMoveUpdateDialog } from "../../src/renderer/dialog/MarkdownImageLinkMoveUpdateDialog";

const translate: Translate = (key, values) => t("en", key, values);

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

function mount(props: {
  linkCount: number;
  documentCount: number;
  onUpdate: () => void;
  onKeep: () => void;
  onCancel: () => void;
}): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      React.createElement(MarkdownImageLinkMoveUpdateDialog, {
        translate,
        opener: null,
        ...props
      })
    );
  });
}

function click(selector: string): void {
  act(() => {
    container!
      .querySelector<HTMLButtonElement>(selector)!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("MarkdownImageLinkMoveUpdateDialog", () => {
  it("wires each footer button to its own distinct callback", () => {
    const onUpdate = vi.fn();
    const onKeep = vi.fn();
    const onCancel = vi.fn();
    mount({ linkCount: 3, documentCount: 1, onUpdate, onKeep, onCancel });

    click(".markdownImageLinkMoveUpdateApply");
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onKeep).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    click(".markdownImageLinkMoveUpdateKeep");
    expect(onKeep).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledTimes(1);

    click(".markdownImageLinkMoveUpdateCancel");
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onKeep).toHaveBeenCalledTimes(1);
  });

  it("shows the total link count, and the document count only when > 1", () => {
    mount({
      linkCount: 5,
      documentCount: 2,
      onUpdate: vi.fn(),
      onKeep: vi.fn(),
      onCancel: vi.fn()
    });
    expect(
      container!.querySelector(
        '[data-testid="markdownImageLinkMoveUpdateCount"]'
      )?.textContent
    ).toContain("5");
    expect(
      container!.querySelector(
        '[data-testid="markdownImageLinkMoveUpdateDocumentCount"]'
      )?.textContent
    ).toContain("2");
  });

  it("hides the document-count line for a single document", () => {
    mount({
      linkCount: 3,
      documentCount: 1,
      onUpdate: vi.fn(),
      onKeep: vi.fn(),
      onCancel: vi.fn()
    });
    expect(
      container!.querySelector(
        '[data-testid="markdownImageLinkMoveUpdateDocumentCount"]'
      )
    ).toBeNull();
  });

  it("uses the single-document button wording for one document", () => {
    mount({
      linkCount: 3,
      documentCount: 1,
      onUpdate: vi.fn(),
      onKeep: vi.fn(),
      onCancel: vi.fn()
    });
    expect(
      container!.querySelector(".markdownImageLinkMoveUpdateApply")?.textContent
    ).toBe("Update");
    expect(
      container!.querySelector(".markdownImageLinkMoveUpdateKeep")?.textContent
    ).toBe("Don't update");
    expect(
      container!.querySelector(".markdownImageLinkMoveUpdateCancel")?.textContent
    ).toBe("Cancel");
  });

  it("uses the batch button + body wording for multiple documents", () => {
    mount({
      linkCount: 5,
      documentCount: 2,
      onUpdate: vi.fn(),
      onKeep: vi.fn(),
      onCancel: vi.fn()
    });
    expect(
      container!.querySelector(".markdownImageLinkMoveUpdateApply")?.textContent
    ).toBe("Update all");
    expect(
      container!.querySelector(".markdownImageLinkMoveUpdateKeep")?.textContent
    ).toBe("Don't update any");
    expect(
      container!.querySelector(".markdownImageLinkMoveUpdateCancel")?.textContent
    ).toBe("Cancel");
    expect(
      container!.querySelector(".markdownImageLinkMoveUpdateDescription")
        ?.textContent
    ).toContain("every document");
  });

  it("keeps the same three callbacks regardless of wording (batch)", () => {
    const onUpdate = vi.fn();
    const onKeep = vi.fn();
    const onCancel = vi.fn();
    mount({ linkCount: 5, documentCount: 3, onUpdate, onKeep, onCancel });

    click(".markdownImageLinkMoveUpdateApply");
    click(".markdownImageLinkMoveUpdateKeep");
    click(".markdownImageLinkMoveUpdateCancel");
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onKeep).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
