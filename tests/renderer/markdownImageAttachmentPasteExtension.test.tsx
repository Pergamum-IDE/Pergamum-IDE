// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { EditorView } from "@codemirror/view";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MarkdownEditor,
  type MarkdownImageAttachmentPositionController
} from "../../src/renderer/MarkdownEditor";
import { handleMarkdownImageAttachmentPaste } from "../../src/renderer/markdownImageAttachmentPasteExtension";
import type {
  ClipboardDataLike,
  ClipboardDataTransferItemLike,
  ClipboardImageFile,
  ClipboardListLike,
  ImageAttachmentPastePreparationResult
} from "../../src/renderer/clipboardImageAttachment";
import type { MarkdownEditorDocumentState } from "../../src/renderer/markdownEditorDocumentState";
import { IMAGE_ATTACHMENT_MAX_BYTES } from "../../src/shared/imageAttachmentFormat";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00
]);

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

interface FakeClipboardImageFile extends ClipboardImageFile {
  readonly arrayBuffer: ReturnType<typeof vi.fn<() => Promise<ArrayBuffer>>>;
}

function arrayBufferFrom(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes);
  return copy.buffer;
}

function fakeFile(input: {
  readonly type: string;
  readonly bytes?: Uint8Array;
  readonly size?: number;
}): FakeClipboardImageFile {
  const bytes = input.bytes ?? PNG_BYTES;

  return {
    name: "pasted.png",
    type: input.type,
    size: input.size ?? bytes.byteLength,
    arrayBuffer: vi.fn(async () => arrayBufferFrom(bytes))
  };
}

function list<T>(values: readonly T[]): ClipboardListLike<T> {
  const result = [...values] as T[] & { item(index: number): T | null };
  result.item = (index: number) => result[index] ?? null;
  return result;
}

function item(file: ClipboardImageFile): ClipboardDataTransferItemLike {
  return {
    kind: "file",
    type: file.type,
    getAsFile: () => file
  };
}

function clipboardData(file: ClipboardImageFile): ClipboardDataLike & {
  getData(type: string): string;
} {
  return {
    items: list([item(file)]),
    files: list([file]),
    getData: () => ""
  };
}

function mountMarkdownEditor(input: {
  readonly onImageAttachmentPaste?: (
    result: ImageAttachmentPastePreparationResult
  ) => void;
  readonly onController?: (
    controller: MarkdownImageAttachmentPositionController | null
  ) => void;
  readonly documentStates?: Map<string, MarkdownEditorDocumentState>;
}): HTMLElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root!.render(
      React.createElement(MarkdownEditor, {
        value: "abcdef",
        documentKey: "doc:A",
        onChange: () => undefined,
        onImageAttachmentPaste: input.onImageAttachmentPaste,
        onImageAttachmentPositionControllerChange: input.onController,
        createImageAttachmentPendingId: () => "pending-1",
        documentStates: input.documentStates
      })
    );
  });

  return container.querySelector(".cm-content") as HTMLElement;
}

function pasteEvent(clipboardData: ClipboardDataLike): Event {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    configurable: true,
    value: clipboardData
  });
  return event;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("MarkdownEditor image paste extension (#407 B3)", () => {
  it("does not preventDefault when the B4 orchestration callback is not connected", () => {
    const preventDefault = vi.fn();
    const dispatch = vi.fn<(spec: TransactionSpec) => void>();
    const handled = handleMarkdownImageAttachmentPaste(
      {
        clipboardData: clipboardData(fakeFile({ type: "image/png" })),
        preventDefault
      },
      {
        state: EditorState.create({ doc: "abcdef" }),
        dispatch
      },
      {
        getHandler: () => null,
        getSourceDocumentId: () => "doc:A"
      }
    );

    expect(handled).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not preventDefault for unsupported candidates", () => {
    const onImageAttachmentPaste = vi.fn();
    const preventDefault = vi.fn();
    const handled = handleMarkdownImageAttachmentPaste(
      {
        clipboardData: clipboardData(fakeFile({ type: "image/svg+xml" })),
        preventDefault
      },
      {
        state: EditorState.create({ doc: "abcdef" }),
        dispatch: () => undefined
      },
      {
        getHandler: () => onImageAttachmentPaste,
        getSourceDocumentId: () => "doc:A"
      }
    );

    expect(handled).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(onImageAttachmentPaste).not.toHaveBeenCalled();
  });

  it("does not preventDefault in read-only mode", () => {
    const onImageAttachmentPaste = vi.fn();
    const preventDefault = vi.fn();
    const dispatch = vi.fn<(spec: TransactionSpec) => void>();
    const handled = handleMarkdownImageAttachmentPaste(
      {
        clipboardData: clipboardData(fakeFile({ type: "image/png" })),
        preventDefault
      },
      {
        state: EditorState.create({ doc: "abcdef" }),
        dispatch
      },
      {
        getHandler: () => onImageAttachmentPaste,
        getSourceDocumentId: () => "doc:A",
        isReadOnly: () => true
      }
    );

    expect(handled).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(onImageAttachmentPaste).not.toHaveBeenCalled();
  });

  it("prevents default synchronously for a supported image and reports detached pending bytes", async () => {
    const onImageAttachmentPaste = vi.fn();
    const controllerRef: {
      current: MarkdownImageAttachmentPositionController | null;
    } = { current: null };
    const content = mountMarkdownEditor({
      onImageAttachmentPaste,
      onController: (next) => {
        controllerRef.current = next;
      }
    });
    const view = EditorView.findFromDOM(content)!;

    act(() => {
      view.dispatch({ selection: { anchor: 3 } });
    });

    const event = pasteEvent(clipboardData(fakeFile({ type: "image/png" })));

    act(() => {
      content.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    const controller = controllerRef.current;
    expect(controller).not.toBeNull();
    if (!controller) {
      throw new Error("Expected an image attachment position controller.");
    }
    expect(controller.resolvePendingPosition("pending-1")).toEqual({
      ok: true,
      id: "pending-1",
      initialPosition: 3,
      position: 3
    });

    await flushPromises();

    expect(onImageAttachmentPaste).toHaveBeenCalledTimes(1);
    const result = onImageAttachmentPaste.mock.calls[0][0];
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pending).toMatchObject({
        id: "pending-1",
        positionTrackingId: "pending-1",
        sourceDocumentId: "doc:A",
        initialPosition: 3,
        reportedMimeType: "image/png",
        detectedFormat: "png",
        hadMultipleImages: false,
        ignoredAdditionalImageCount: 0
      });
      expect(result.pending.bytes).toEqual(PNG_BYTES);
    }
  });

  it("prevents default synchronously for an oversized image and reports sizeOverflow without reading bytes", async () => {
    const onImageAttachmentPaste = vi.fn();
    const file = fakeFile({
      type: "image/png",
      size: IMAGE_ATTACHMENT_MAX_BYTES + 1
    });
    const content = mountMarkdownEditor({ onImageAttachmentPaste });
    const event = pasteEvent(clipboardData(file));

    act(() => {
      content.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);

    await flushPromises();

    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(onImageAttachmentPaste).toHaveBeenCalledTimes(1);
    expect(onImageAttachmentPaste.mock.calls[0][0]).toMatchObject({
      ok: false,
      reason: "sizeOverflow",
      actualBytes: IMAGE_ATTACHMENT_MAX_BYTES + 1
    });
  });

  it("logs async handler failures instead of silently swallowing them", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const controllerRef: {
      current: MarkdownImageAttachmentPositionController | null;
    } = { current: null };
    const content = mountMarkdownEditor({
      onImageAttachmentPaste: () => {
        throw new Error("handler failed");
      },
      onController: (next) => {
        controllerRef.current = next;
      }
    });
    const event = pasteEvent(clipboardData(fakeFile({ type: "image/png" })));

    act(() => {
      content.dispatchEvent(event);
    });

    await flushPromises();

    expect(consoleError).toHaveBeenCalledWith(
      "Markdown image attachment paste handler failed.",
      expect.any(Error)
    );
    expect(controllerRef.current?.resolvePendingPosition("pending-1")).toBeNull();
    consoleError.mockRestore();
  });

  it("invokes the latest paste handler when MarkdownEditor remounts with cached documentStates (#407 dogfood blocker)", async () => {
    const documentStates = new Map<string, MarkdownEditorDocumentState>();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    // 1. Mount editor with handler1
    mountMarkdownEditor({
      onImageAttachmentPaste: handler1,
      documentStates
    });

    // 2. Unmount editor (simulating user switching to Settings tab)
    act(() => {
      root!.unmount();
      root = null;
    });

    expect(documentStates.has("doc:A")).toBe(true);

    // 3. Remount editor with handler2 and the same documentStates (simulating return from Settings tab)
    const content2 = mountMarkdownEditor({
      onImageAttachmentPaste: handler2,
      documentStates
    });

    // 4. Dispatch paste event on the remounted editor
    const event = pasteEvent(clipboardData(fakeFile({ type: "image/png" })));
    act(() => {
      content2.dispatchEvent(event);
    });

    await flushPromises();

    // 5. handler2 must be called, and handler1 must NOT be called
    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        pending: expect.objectContaining({
          reportedMimeType: "image/png"
        })
      })
    );
  });
});
