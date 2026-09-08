// @vitest-environment happy-dom
//
// #414 (C2): the pre-move confirmation dialog for updating OTHER documents'
// references to moved image files. Three distinct footer callbacks; batch
// wording when >1 image or >1 document; a permanent Glossary-exclusion note.
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { t, type Translate } from "../../src/shared/i18n";
import { MarkdownImageReferenceMoveUpdateDialog } from "../../src/renderer/dialog/MarkdownImageReferenceMoveUpdateDialog";

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
  referenceCount: number;
  documentCount: number;
  imageCount: number;
  onUpdate: () => void;
  onKeep: () => void;
  onCancel: () => void;
}): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      React.createElement(MarkdownImageReferenceMoveUpdateDialog, {
        translate,
        opener: null,
        ...props
      })
    );
  });
}

function q(sel: string): HTMLElement | null {
  return container!.querySelector<HTMLElement>(sel);
}
function click(sel: string): void {
  act(() => {
    container!
      .querySelector<HTMLButtonElement>(sel)!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

const noop = { onUpdate: vi.fn(), onKeep: vi.fn(), onCancel: vi.fn() };

describe("MarkdownImageReferenceMoveUpdateDialog", () => {
  it("wires each footer button to its own callback", () => {
    const onUpdate = vi.fn();
    const onKeep = vi.fn();
    const onCancel = vi.fn();
    mount({
      referenceCount: 3,
      documentCount: 1,
      imageCount: 1,
      onUpdate,
      onKeep,
      onCancel
    });

    click(".markdownImageReferenceMoveUpdateApply");
    click(".markdownImageReferenceMoveUpdateKeep");
    click(".markdownImageReferenceMoveUpdateCancel");
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onKeep).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("always shows the Glossary exclusion note and the reference count", () => {
    mount({ referenceCount: 12, documentCount: 1, imageCount: 1, ...noop });
    expect(
      q('[data-testid="markdownImageReferenceMoveUpdateGlossaryNote"]')
        ?.textContent
    ).toContain("Glossary");
    expect(
      q('[data-testid="markdownImageReferenceMoveUpdateCount"]')?.textContent
    ).toContain("12");
  });

  it("single wording + no image/document count lines for one image, one document", () => {
    mount({ referenceCount: 3, documentCount: 1, imageCount: 1, ...noop });
    expect(q(".markdownImageReferenceMoveUpdateApply")?.textContent).toBe(
      "Update"
    );
    expect(q(".markdownImageReferenceMoveUpdateKeep")?.textContent).toBe(
      "Don't update"
    );
    expect(
      q('[data-testid="markdownImageReferenceMoveUpdateImageCount"]')
    ).toBeNull();
    expect(
      q('[data-testid="markdownImageReferenceMoveUpdateDocumentCount"]')
    ).toBeNull();
  });

  it("batch wording + count lines when multiple documents are affected", () => {
    mount({ referenceCount: 12, documentCount: 4, imageCount: 1, ...noop });
    expect(q(".markdownImageReferenceMoveUpdateApply")?.textContent).toBe(
      "Update all"
    );
    expect(q(".markdownImageReferenceMoveUpdateKeep")?.textContent).toBe(
      "Don't update any"
    );
    expect(
      q('[data-testid="markdownImageReferenceMoveUpdateDocumentCount"]')
        ?.textContent
    ).toContain("4");
  });

  it("batch wording + image count line when multiple images are involved", () => {
    mount({ referenceCount: 12, documentCount: 1, imageCount: 2, ...noop });
    expect(q(".markdownImageReferenceMoveUpdateApply")?.textContent).toBe(
      "Update all"
    );
    expect(
      q('[data-testid="markdownImageReferenceMoveUpdateImageCount"]')
        ?.textContent
    ).toContain("2");
  });
});
