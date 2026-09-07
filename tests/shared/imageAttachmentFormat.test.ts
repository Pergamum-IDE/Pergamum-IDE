import { describe, expect, it } from "vitest";
import {
  IMAGE_ATTACHMENT_MAX_BYTES,
  SUPPORTED_IMAGE_ATTACHMENT_FORMATS,
  detectImageAttachmentFormatFromMagicBytes,
  formatImageByteSizeMiB,
  imageAttachmentExtension,
  imageAttachmentMimeType,
  resolveImageAttachmentFormat,
  supportedFormatForReportedMimeType
} from "../../src/shared/imageAttachmentFormat";

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
const GIF87A_MAGIC = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61];
const GIF89A_MAGIC = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
// "RIFF" <4 size bytes> "WEBP"
const WEBP_MAGIC = [
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50
];

describe("imageAttachmentFormat — constants", () => {
  it("caps attachments at exactly 128 MiB", () => {
    expect(IMAGE_ATTACHMENT_MAX_BYTES).toBe(134_217_728);
    expect(IMAGE_ATTACHMENT_MAX_BYTES).toBe(128 * 1024 * 1024);
  });

  it("supports exactly png / jpeg / gif / webp", () => {
    expect([...SUPPORTED_IMAGE_ATTACHMENT_FORMATS].sort()).toEqual([
      "gif",
      "jpeg",
      "png",
      "webp"
    ]);
  });

  it("maps formats to canonical extensions and MIME types", () => {
    expect(imageAttachmentExtension("png")).toBe(".png");
    expect(imageAttachmentExtension("jpeg")).toBe(".jpg");
    expect(imageAttachmentExtension("gif")).toBe(".gif");
    expect(imageAttachmentExtension("webp")).toBe(".webp");
    expect(imageAttachmentMimeType("jpeg")).toBe("image/jpeg");
  });
});

describe("detectImageAttachmentFormatFromMagicBytes", () => {
  it("detects PNG from its 8-byte signature", () => {
    expect(detectImageAttachmentFormatFromMagicBytes(bytes(...PNG_MAGIC))).toBe(
      "png"
    );
  });

  it("detects JPEG from FF D8 FF", () => {
    expect(detectImageAttachmentFormatFromMagicBytes(bytes(...JPEG_MAGIC))).toBe(
      "jpeg"
    );
  });

  it("detects GIF87a and GIF89a", () => {
    expect(
      detectImageAttachmentFormatFromMagicBytes(bytes(...GIF87A_MAGIC))
    ).toBe("gif");
    expect(
      detectImageAttachmentFormatFromMagicBytes(bytes(...GIF89A_MAGIC))
    ).toBe("gif");
  });

  it("detects WebP only when the WEBP FourCC follows the RIFF header", () => {
    expect(detectImageAttachmentFormatFromMagicBytes(bytes(...WEBP_MAGIC))).toBe(
      "webp"
    );
    // RIFF container that is NOT WebP (e.g. WAV) -> not detected
    const wav = [
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45
    ];
    expect(detectImageAttachmentFormatFromMagicBytes(bytes(...wav))).toBeNull();
  });

  it("returns null for SVG, BMP, AVIF and other non-supported content", () => {
    const svg = new TextEncoder().encode("<svg xmlns=\"http://www.w3.org/2000/svg\">");
    expect(detectImageAttachmentFormatFromMagicBytes(svg)).toBeNull();

    const bmp = bytes(0x42, 0x4d, 0x00, 0x00);
    expect(detectImageAttachmentFormatFromMagicBytes(bmp)).toBeNull();

    // AVIF: ....ftypavif — no supported signature at the front
    const avif = bytes(
      0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66
    );
    expect(detectImageAttachmentFormatFromMagicBytes(avif)).toBeNull();

    expect(detectImageAttachmentFormatFromMagicBytes(bytes())).toBeNull();
  });

  it("only inspects the first 16 bytes", () => {
    // A supported signature that starts at byte 16 must NOT be detected.
    const shifted = new Uint8Array(24);
    shifted.set(PNG_MAGIC, 16);
    expect(detectImageAttachmentFormatFromMagicBytes(shifted)).toBeNull();
  });

  it("succeeds with a truncated 16-byte buffer for GIF/JPEG (short signatures)", () => {
    expect(
      detectImageAttachmentFormatFromMagicBytes(bytes(...JPEG_MAGIC.slice(0, 3)))
    ).toBe("jpeg");
  });
});

describe("supportedFormatForReportedMimeType", () => {
  it("resolves the four supported types (case / parameter tolerant)", () => {
    expect(supportedFormatForReportedMimeType("image/png")).toBe("png");
    expect(supportedFormatForReportedMimeType("IMAGE/JPEG")).toBe("jpeg");
    expect(supportedFormatForReportedMimeType("image/webp; charset=binary")).toBe(
      "webp"
    );
  });

  it("accepts the non-standard image/jpg alias as JPEG (#407 remediation §5)", () => {
    expect(supportedFormatForReportedMimeType("image/jpg")).toBe("jpeg");
    expect(supportedFormatForReportedMimeType("IMAGE/JPG")).toBe("jpeg");
  });

  it("returns null for the empty string and every unsupported type", () => {
    expect(supportedFormatForReportedMimeType("")).toBeNull();
    expect(supportedFormatForReportedMimeType("image/svg+xml")).toBeNull();
    expect(supportedFormatForReportedMimeType("image/bmp")).toBeNull();
    expect(supportedFormatForReportedMimeType("image/avif")).toBeNull();
    expect(supportedFormatForReportedMimeType("image/pjpeg")).toBeNull(); // not added
    expect(supportedFormatForReportedMimeType("text/plain")).toBeNull();
  });
});

describe("resolveImageAttachmentFormat", () => {
  it("accepts a magic-detected format when File.type is the empty string", () => {
    expect(
      resolveImageAttachmentFormat({
        bytes: bytes(...PNG_MAGIC),
        reportedMimeType: ""
      })
    ).toEqual({ ok: true, format: "png" });
  });

  it("accepts when a present File.type agrees with the magic bytes", () => {
    expect(
      resolveImageAttachmentFormat({
        bytes: bytes(...JPEG_MAGIC),
        reportedMimeType: "image/jpeg"
      })
    ).toEqual({ ok: true, format: "jpeg" });
  });

  it("rejects unsupported content (no supported magic) regardless of File.type", () => {
    const svg = new TextEncoder().encode("<svg></svg>");
    expect(
      resolveImageAttachmentFormat({ bytes: svg, reportedMimeType: "" })
    ).toEqual({ ok: false, reason: "unsupportedFormat" });
    expect(
      resolveImageAttachmentFormat({
        bytes: svg,
        reportedMimeType: "image/svg+xml"
      })
    ).toEqual({ ok: false, reason: "unsupportedFormat" });
  });

  it("rejects a MIME/magic mismatch (PNG bytes reported as image/jpeg)", () => {
    expect(
      resolveImageAttachmentFormat({
        bytes: bytes(...PNG_MAGIC),
        reportedMimeType: "image/jpeg"
      })
    ).toEqual({ ok: false, reason: "mimeMagicMismatch" });
  });

  it("accepts image/jpg only when the magic bytes are actually JPEG (#407 remediation §5)", () => {
    expect(
      resolveImageAttachmentFormat({
        bytes: bytes(...JPEG_MAGIC),
        reportedMimeType: "image/jpg"
      })
    ).toEqual({ ok: true, format: "jpeg" });

    expect(
      resolveImageAttachmentFormat({
        bytes: bytes(...PNG_MAGIC),
        reportedMimeType: "image/jpg"
      })
    ).toEqual({ ok: false, reason: "mimeMagicMismatch" });
  });

  it("rejects supported magic bytes carrying an out-of-scope File.type (PNG reported as image/svg+xml)", () => {
    expect(
      resolveImageAttachmentFormat({
        bytes: bytes(...PNG_MAGIC),
        reportedMimeType: "image/svg+xml"
      })
    ).toEqual({ ok: false, reason: "mimeMagicMismatch" });
  });
});

describe("formatImageByteSizeMiB", () => {
  it("renders whole MiB without a decimal", () => {
    expect(formatImageByteSizeMiB(128 * 1024 * 1024)).toBe("128 MiB");
    expect(formatImageByteSizeMiB(312 * 1024 * 1024)).toBe("312 MiB");
  });

  it("renders one decimal place for a fractional size", () => {
    expect(formatImageByteSizeMiB(Math.round(128.5 * 1024 * 1024))).toBe(
      "128.5 MiB"
    );
  });
});
