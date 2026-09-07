import { describe, expect, it, vi } from "vitest";
import { IMAGE_ATTACHMENT_MAX_BYTES } from "../../src/shared/imageAttachmentFormat";
import {
  preparePendingImageAttachment,
  selectClipboardImageCandidate,
  type ClipboardDataLike,
  type ClipboardDataTransferItemLike,
  type ClipboardImageFile,
  type ClipboardListLike
} from "../../src/renderer/clipboardImageAttachment";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00
]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
const GIF_BYTES = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00
]);
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50
]);

interface FakeClipboardImageFile extends ClipboardImageFile {
  readonly arrayBuffer: ReturnType<typeof vi.fn<() => Promise<ArrayBuffer>>>;
}

function arrayBufferFrom(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes);
  return copy.buffer;
}

function fakeFile(input: {
  readonly name?: string;
  readonly type: string;
  readonly bytes?: Uint8Array;
  readonly size?: number;
}): FakeClipboardImageFile {
  const bytes = input.bytes ?? PNG_BYTES;

  return {
    name: input.name ?? "pasted.png",
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

function item(
  file: ClipboardImageFile,
  kind: "file" | "string" = "file"
): ClipboardDataTransferItemLike {
  return {
    kind,
    type: kind === "file" ? file.type : "text/html",
    getAsFile: () => (kind === "file" ? file : null)
  };
}

function clipboardData(input: {
  readonly items?: readonly ClipboardDataTransferItemLike[];
  readonly files?: readonly ClipboardImageFile[];
}): ClipboardDataLike {
  return {
    items: input.items ? list(input.items) : undefined,
    files: input.files ? list(input.files) : undefined
  };
}

async function prepare(candidate: ReturnType<typeof selectClipboardImageCandidate>) {
  if (candidate.kind !== "selected") {
    throw new Error("Expected a selected candidate.");
  }

  return preparePendingImageAttachment({
    id: "pending-1",
    sourceDocumentId: "doc:A",
    sourceEditorId: "editor:A",
    initialPosition: 3,
    candidate: candidate.candidate
  });
}

describe("clipboard image attachment detection (#407 B3)", () => {
  it('accepts a Win+Shift+S-style image from items/files without relying on types: ["image/png"]', () => {
    const file = fakeFile({ type: "image/png" });
    const selected = selectClipboardImageCandidate(
      clipboardData({
        items: [item(file)],
        files: [file]
      })
    );

    expect(selected).toMatchObject({
      kind: "selected",
      candidate: {
        reportedMimeType: "image/png",
        hadMultipleImages: false,
        ignoredAdditionalImageCount: 0
      }
    });
  });

  it("prefers an image File when text/html and Files coexist", () => {
    const file = fakeFile({ type: "image/png" });
    const selected = selectClipboardImageCandidate(
      clipboardData({
        items: [item(file, "string"), item(file)],
        files: [file]
      })
    );

    expect(selected.kind).toBe("selected");
  });

  it("detects an image from files when items is unavailable", () => {
    const file = fakeFile({ type: "image/png" });
    const selected = selectClipboardImageCandidate(
      clipboardData({ files: [file] })
    );

    expect(selected.kind).toBe("selected");
  });

  it("falls back when text/html contains an img but no binary File exists", () => {
    const selected = selectClipboardImageCandidate(
      clipboardData({
        items: [
          {
            kind: "string",
            type: "text/html",
            getAsFile: () => null
          }
        ],
        files: []
      })
    );

    expect(selected).toEqual({ kind: "fallback" });
  });

  it("keeps File.type === \"\" eligible so magic bytes can accept supported formats", async () => {
    for (const [bytes, format] of [
      [PNG_BYTES, "png"],
      [JPEG_BYTES, "jpeg"],
      [GIF_BYTES, "gif"],
      [WEBP_BYTES, "webp"]
    ] as const) {
      const file = fakeFile({ type: "", bytes });
      const selected = selectClipboardImageCandidate(
        clipboardData({ items: [item(file)], files: [file] })
      );
      const result = await prepare(selected);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.pending.reportedMimeType).toBe("");
        expect(result.pending.detectedFormat).toBe(format);
      }
    }
  });

  it("treats image/jpg as a JPEG alias", async () => {
    const file = fakeFile({ type: "image/jpg", bytes: JPEG_BYTES });
    const result = await prepare(
      selectClipboardImageCandidate(
        clipboardData({ items: [item(file)], files: [file] })
      )
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pending.detectedFormat).toBe("jpeg");
      expect(result.pending.reportedMimeType).toBe("image/jpg");
    }
  });

  it("selects only the first image and records ignored additional image count", () => {
    const first = fakeFile({ name: "first.png", type: "image/png" });
    const second = fakeFile({ name: "second.gif", type: "image/gif" });
    const third = fakeFile({ name: "third.webp", type: "image/webp" });

    const selected = selectClipboardImageCandidate(
      clipboardData({
        items: [item(first), item(second), item(third)],
        files: [first, second, third]
      })
    );

    expect(selected).toMatchObject({
      kind: "selected",
      candidate: {
        originalFileName: "first.png",
        hadMultipleImages: true,
        ignoredAdditionalImageCount: 2
      }
    });
  });

  it("skips an unsupported file candidate and selects a later supported image", () => {
    const svg = fakeFile({ name: "vector.svg", type: "image/svg+xml" });
    const png = fakeFile({ name: "pasted.png", type: "image/png" });

    const selected = selectClipboardImageCandidate(
      clipboardData({ items: [item(svg), item(png)], files: [svg, png] })
    );

    expect(selected).toMatchObject({
      kind: "selected",
      candidate: {
        originalFileName: "pasted.png",
        reportedMimeType: "image/png"
      }
    });
  });

  it("does not select unsupported image formats as supported candidates", () => {
    const svg = fakeFile({ name: "vector.svg", type: "image/svg+xml" });
    const bmp = fakeFile({ name: "bitmap.bmp", type: "image/bmp" });

    expect(
      selectClipboardImageCandidate(
        clipboardData({ items: [item(svg), item(bmp)], files: [svg, bmp] })
      )
    ).toEqual({ kind: "fallback" });
  });
});

describe("clipboard image attachment preparation (#407 B3)", () => {
  it("does not call arrayBuffer when File.size exceeds IMAGE_ATTACHMENT_MAX_BYTES", async () => {
    const file = fakeFile({
      type: "image/png",
      size: IMAGE_ATTACHMENT_MAX_BYTES + 1
    });
    const result = await prepare(
      selectClipboardImageCandidate(
        clipboardData({ items: [item(file)], files: [file] })
      )
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "sizeOverflow",
      actualBytes: IMAGE_ATTACHMENT_MAX_BYTES + 1
    });
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });

  it("allows File.size equal to IMAGE_ATTACHMENT_MAX_BYTES", async () => {
    const file = fakeFile({
      type: "image/png",
      size: IMAGE_ATTACHMENT_MAX_BYTES
    });
    const result = await prepare(
      selectClipboardImageCandidate(
        clipboardData({ items: [item(file)], files: [file] })
      )
    );

    expect(file.arrayBuffer).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pending.actualBytes).toBe(IMAGE_ATTACHMENT_MAX_BYTES);
    }
  });

  it("detects MIME and magic-byte mismatch after bytes are detached from the event", async () => {
    const file = fakeFile({ type: "image/png", bytes: JPEG_BYTES });
    const result = await prepare(
      selectClipboardImageCandidate(
        clipboardData({ items: [item(file)], files: [file] })
      )
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "mimeMagicMismatch"
    });
  });

  it("detects unsupported bytes for an empty reported MIME type", async () => {
    const file = fakeFile({
      type: "",
      bytes: new Uint8Array([0x00, 0x01, 0x02, 0x03])
    });
    const result = await prepare(
      selectClipboardImageCandidate(
        clipboardData({ items: [item(file)], files: [file] })
      )
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "unsupportedFormat"
    });
  });

  it("continues from the synchronously captured File even if the event-like clipboard data is cleared", async () => {
    const file = fakeFile({ type: "image/png" });
    const mutableClipboardData: {
      items: ClipboardListLike<ClipboardDataTransferItemLike>;
      files: ClipboardListLike<ClipboardImageFile>;
    } = {
      items: list([item(file)]),
      files: list([file])
    };
    const selected = selectClipboardImageCandidate(mutableClipboardData);

    mutableClipboardData.items = list([]);
    mutableClipboardData.files = list([]);

    const result = await prepare(selected);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pending.bytes).toBeInstanceOf(Uint8Array);
      expect(result.pending.bytes).toEqual(PNG_BYTES);
    }
  });
});
