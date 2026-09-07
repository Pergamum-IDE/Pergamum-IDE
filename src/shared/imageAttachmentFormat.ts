/**
 * #407: clipboard image attachment — supported-format detection and
 * MIME/magic reconciliation.
 *
 * Pure, environment-agnostic logic shared by the renderer (preliminary
 * validation before an IPC round trip) and the main process (authoritative
 * re-validation before any disk write). It never touches the filesystem,
 * never re-encodes image bytes, and reads at most the first 16 bytes of a
 * buffer.
 *
 * Scope (Issue #407 §11 / §12):
 *   - initial supported formats: PNG, JPEG, GIF, WebP
 *   - magic bytes are authoritative; a present `File.type` is auxiliary and
 *     must agree with the magic bytes or the image is rejected
 *   - SVG / BMP / AVIF and every other `image/*` are explicitly out of scope
 */

/** The four formats accepted by the initial implementation. */
export type SupportedImageAttachmentFormat = "png" | "jpeg" | "gif" | "webp";

export const SUPPORTED_IMAGE_ATTACHMENT_FORMATS: readonly SupportedImageAttachmentFormat[] =
  ["png", "jpeg", "gif", "webp"];

/**
 * Per-image hard cap (Issue #407 §10). Not configurable. Enforced against
 * `File.size` BEFORE any `arrayBuffer()` conversion on the renderer side and
 * again against the received byte length on the main side.
 */
export const IMAGE_ATTACHMENT_MAX_BYTES = 134_217_728; // 128 MiB

/** Number of leading bytes inspected for a magic-byte signature (§12). */
export const IMAGE_ATTACHMENT_MAGIC_PREFIX_LENGTH = 16;

const FORMAT_EXTENSION: Record<SupportedImageAttachmentFormat, string> = {
  png: ".png",
  jpeg: ".jpg",
  gif: ".gif",
  webp: ".webp"
};

const FORMAT_MIME_TYPE: Record<SupportedImageAttachmentFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp"
};

/** Canonical filename extension for a format, e.g. `"jpeg"` -> `".jpg"`. */
export function imageAttachmentExtension(
  format: SupportedImageAttachmentFormat
): string {
  return FORMAT_EXTENSION[format];
}

/** Canonical MIME type for a format, e.g. `"jpeg"` -> `"image/jpeg"`. */
export function imageAttachmentMimeType(
  format: SupportedImageAttachmentFormat
): string {
  return FORMAT_MIME_TYPE[format];
}

function startsWithBytes(
  bytes: Uint8Array,
  signature: readonly number[]
): boolean {
  if (bytes.length < signature.length) {
    return false;
  }
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[index] !== signature[index]) {
      return false;
    }
  }
  return true;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const GIF87A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61];
const GIF89A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP_FOURCC = [0x57, 0x45, 0x42, 0x50]; // "WEBP" at offset 8

function isWebpMagic(bytes: Uint8Array): boolean {
  // 52 49 46 46 xx xx xx xx 57 45 42 50  ("RIFF" .... "WEBP")
  if (bytes.length < 12) {
    return false;
  }
  if (!startsWithBytes(bytes, RIFF_SIGNATURE)) {
    return false;
  }
  for (let index = 0; index < WEBP_FOURCC.length; index += 1) {
    if (bytes[8 + index] !== WEBP_FOURCC[index]) {
      return false;
    }
  }
  return true;
}

/**
 * Identify a supported image format purely from the leading bytes of a
 * buffer, or `null` when the bytes match none of the initial formats.
 *
 * Only the first {@link IMAGE_ATTACHMENT_MAGIC_PREFIX_LENGTH} bytes are
 * consulted; a shorter buffer simply fails to match.
 */
export function detectImageAttachmentFormatFromMagicBytes(
  bytes: Uint8Array
): SupportedImageAttachmentFormat | null {
  const prefix =
    bytes.length > IMAGE_ATTACHMENT_MAGIC_PREFIX_LENGTH
      ? bytes.subarray(0, IMAGE_ATTACHMENT_MAGIC_PREFIX_LENGTH)
      : bytes;

  if (startsWithBytes(prefix, PNG_SIGNATURE)) {
    return "png";
  }
  if (startsWithBytes(prefix, JPEG_SIGNATURE)) {
    return "jpeg";
  }
  if (
    startsWithBytes(prefix, GIF87A_SIGNATURE) ||
    startsWithBytes(prefix, GIF89A_SIGNATURE)
  ) {
    return "gif";
  }
  if (isWebpMagic(prefix)) {
    return "webp";
  }
  return null;
}

/**
 * Map a browser-reported MIME type to a supported format, or `null` for the
 * empty string and every unsupported / non-image type. Comparison is
 * case-insensitive and tolerant of a `; charset=...`-style parameter tail
 * (`DataTransferItem.type` never carries one in practice, but a defensive
 * parse costs nothing).
 *
 * `image/jpg` — a non-standard alias some tools emit — is accepted as JPEG
 * per PO decision (Issue #407 remediation §5); the magic bytes must still
 * be JPEG for {@link resolveImageAttachmentFormat} to accept it.
 * `image/pjpeg` is deliberately NOT added.
 */
export function supportedFormatForReportedMimeType(
  reportedMimeType: string
): SupportedImageAttachmentFormat | null {
  const essence = reportedMimeType
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  switch (essence) {
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpeg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

/**
 * #409: map a filename extension to a supported format, or `null` for an
 * unsupported / missing extension. Comparison is case-insensitive.
 * `.jpg` and `.jpeg` both resolve to `"jpeg"`. Only the trailing extension
 * matters — the caller is responsible for having a real path segment.
 */
const FILE_EXTENSION_FORMAT: Record<string, SupportedImageAttachmentFormat> = {
  ".png": "png",
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".gif": "gif",
  ".webp": "webp"
};

export function supportedImageAttachmentFormatForFileName(
  fileName: string
): SupportedImageAttachmentFormat | null {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return null;
  }
  const extension = fileName.slice(dotIndex).toLowerCase();
  return FILE_EXTENSION_FORMAT[extension] ?? null;
}

export type ImageAttachmentFormatRejection =
  | "unsupportedFormat" // magic bytes match no supported format
  | "mimeMagicMismatch"; // a present File.type disagrees with the magic bytes

export type ImageAttachmentFormatResolution =
  | { readonly ok: true; readonly format: SupportedImageAttachmentFormat }
  | { readonly ok: false; readonly reason: ImageAttachmentFormatRejection };

/**
 * Decide whether a buffer is an acceptable image attachment (Issue #407
 * §6 / §12):
 *
 *   - `reportedMimeType === ""` -> accept iff the magic bytes identify a
 *     supported format.
 *   - `reportedMimeType` present -> accept iff the magic bytes identify a
 *     supported format AND the reported type resolves to that SAME format.
 *     Any disagreement — including a reported type outside the supported
 *     set (`image/svg+xml`, `image/bmp`, `image/avif`, ...) — is a
 *     `mimeMagicMismatch` rejection.
 *
 * The magic bytes are always authoritative; the reported type only ever
 * narrows, never widens, acceptance.
 */
export function resolveImageAttachmentFormat(input: {
  readonly bytes: Uint8Array;
  readonly reportedMimeType: string;
}): ImageAttachmentFormatResolution {
  const magicFormat = detectImageAttachmentFormatFromMagicBytes(input.bytes);

  if (magicFormat === null) {
    return { ok: false, reason: "unsupportedFormat" };
  }

  const reported = input.reportedMimeType.trim();
  if (reported.length === 0) {
    return { ok: true, format: magicFormat };
  }

  const reportedFormat = supportedFormatForReportedMimeType(reported);
  if (reportedFormat === null || reportedFormat !== magicFormat) {
    return { ok: false, reason: "mimeMagicMismatch" };
  }

  return { ok: true, format: magicFormat };
}

/**
 * Human-facing size string for the over-limit warning dialog (Issue #407
 * §10), e.g. `"312 MiB"`, `"128 MiB"`, `"128.5 MiB"`. Always MiB — an
 * over-limit image is never smaller than 128 MiB. One decimal place, with a
 * trailing `.0` dropped.
 */
export function formatImageByteSizeMiB(bytes: number): string {
  const mib = bytes / (1024 * 1024);
  const rounded = Math.round(mib * 10) / 10;
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1);
  return `${text} MiB`;
}
