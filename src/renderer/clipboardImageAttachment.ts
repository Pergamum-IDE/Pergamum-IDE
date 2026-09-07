import {
  IMAGE_ATTACHMENT_MAX_BYTES,
  resolveImageAttachmentFormat,
  supportedFormatForReportedMimeType,
  type SupportedImageAttachmentFormat
} from "../shared/imageAttachmentFormat";
import type { SaveImageAttachmentFailureReason } from "../shared/imageAttachmentSaveResult";

export interface ClipboardImageFile {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ClipboardDataTransferItemLike {
  readonly kind: string;
  readonly type: string;
  getAsFile(): ClipboardImageFile | null;
}

export interface ClipboardListLike<T> {
  readonly length: number;
  readonly [index: number]: T | undefined;
  item?(index: number): T | null;
}

export interface ClipboardDataLike {
  readonly items?: ClipboardListLike<ClipboardDataTransferItemLike> | null;
  readonly files?: ClipboardListLike<ClipboardImageFile> | null;
}

export interface ClipboardImageCandidate {
  readonly file: ClipboardImageFile;
  readonly reportedMimeType: string;
  readonly originalFileName?: string;
  readonly actualBytes: number;
  readonly hadMultipleImages: boolean;
  readonly ignoredAdditionalImageCount: number;
}

export type ClipboardImageCandidateSelection =
  | { readonly kind: "selected"; readonly candidate: ClipboardImageCandidate }
  | { readonly kind: "fallback" };

export interface PendingImageAttachment {
  readonly id: string;
  readonly positionTrackingId: string;
  readonly sourceDocumentId: string;
  readonly sourceEditorId?: string;
  readonly initialPosition: number;
  readonly bytes: Uint8Array;
  readonly reportedMimeType: string;
  readonly detectedFormat: SupportedImageAttachmentFormat;
  readonly originalFileName?: string;
  readonly actualBytes: number;
  readonly hadMultipleImages: boolean;
  readonly ignoredAdditionalImageCount: number;
}

type PreliminaryFailureReason = Extract<
  SaveImageAttachmentFailureReason,
  "sizeOverflow" | "unsupportedFormat" | "mimeMagicMismatch" | "ioError"
>;

export interface ImageAttachmentPastePreparationFailure {
  readonly ok: false;
  readonly id: string;
  readonly positionTrackingId: string;
  readonly sourceDocumentId: string;
  readonly sourceEditorId?: string;
  readonly initialPosition: number;
  readonly reason: PreliminaryFailureReason;
  readonly reportedMimeType: string;
  readonly originalFileName?: string;
  readonly actualBytes: number;
  readonly hadMultipleImages: boolean;
  readonly ignoredAdditionalImageCount: number;
}

export type ImageAttachmentPastePreparationResult =
  | { readonly ok: true; readonly pending: PendingImageAttachment }
  | ImageAttachmentPastePreparationFailure;

export interface PreparePendingImageAttachmentInput {
  readonly id: string;
  readonly sourceDocumentId: string;
  readonly sourceEditorId?: string;
  readonly initialPosition: number;
  readonly candidate: ClipboardImageCandidate;
}

function listItem<T>(list: ClipboardListLike<T>, index: number): T | null {
  return list.item?.(index) ?? list[index] ?? null;
}

function nonEmptyName(name: string): string | undefined {
  return name.length > 0 ? name : undefined;
}

function isPotentialSupportedImageFile(file: ClipboardImageFile): boolean {
  const reportedMimeType = file.type.trim();

  return (
    reportedMimeType.length === 0 ||
    supportedFormatForReportedMimeType(reportedMimeType) !== null
  );
}

function addUniqueFile(
  files: ClipboardImageFile[],
  seen: Set<ClipboardImageFile>,
  file: ClipboardImageFile | null
): void {
  if (!file || seen.has(file)) {
    return;
  }

  seen.add(file);
  files.push(file);
}

export function clipboardFilesFromDataTransfer(
  clipboardData: ClipboardDataLike | null
): readonly ClipboardImageFile[] {
  if (!clipboardData) {
    return [];
  }

  const files: ClipboardImageFile[] = [];
  const seen = new Set<ClipboardImageFile>();

  const items = clipboardData.items;
  if (items) {
    for (let index = 0; index < items.length; index += 1) {
      const item = listItem(items, index);
      if (item?.kind !== "file") {
        continue;
      }
      addUniqueFile(files, seen, item.getAsFile());
    }
  }

  const fileList = clipboardData.files;
  if (fileList && files.length === 0) {
    for (let index = 0; index < fileList.length; index += 1) {
      addUniqueFile(files, seen, listItem(fileList, index));
    }
  }

  return files;
}

export function selectClipboardImageCandidate(
  clipboardData: ClipboardDataLike | null
): ClipboardImageCandidateSelection {
  const candidates = clipboardFilesFromDataTransfer(clipboardData).filter(
    isPotentialSupportedImageFile
  );

  if (candidates.length === 0) {
    return { kind: "fallback" };
  }

  const selected = candidates[0];
  // This is the Clipboard-level candidate count (reported MIME is supported
  // or empty), not the number of magic-validated images. An empty-MIME
  // non-image can therefore conservatively trigger the multiple-image toast.
  const ignoredAdditionalImageCount = Math.max(0, candidates.length - 1);

  return {
    kind: "selected",
    candidate: {
      file: selected,
      reportedMimeType: selected.type,
      originalFileName: nonEmptyName(selected.name),
      actualBytes: selected.size,
      hadMultipleImages: ignoredAdditionalImageCount > 0,
      ignoredAdditionalImageCount
    }
  };
}

function preparationFailure(
  input: PreparePendingImageAttachmentInput,
  reason: PreliminaryFailureReason,
  actualBytes: number
): ImageAttachmentPastePreparationFailure {
  return {
    ok: false,
    id: input.id,
    positionTrackingId: input.id,
    sourceDocumentId: input.sourceDocumentId,
    sourceEditorId: input.sourceEditorId,
    initialPosition: input.initialPosition,
    reason,
    reportedMimeType: input.candidate.reportedMimeType,
    originalFileName: input.candidate.originalFileName,
    actualBytes,
    hadMultipleImages: input.candidate.hadMultipleImages,
    ignoredAdditionalImageCount:
      input.candidate.ignoredAdditionalImageCount
  };
}

export async function preparePendingImageAttachment(
  input: PreparePendingImageAttachmentInput
): Promise<ImageAttachmentPastePreparationResult> {
  if (input.candidate.actualBytes > IMAGE_ATTACHMENT_MAX_BYTES) {
    return preparationFailure(
      input,
      "sizeOverflow",
      input.candidate.actualBytes
    );
  }

  let bytes: Uint8Array;
  try {
    const buffer = await input.candidate.file.arrayBuffer();
    bytes = new Uint8Array(buffer);
  } catch {
    return preparationFailure(input, "ioError", input.candidate.actualBytes);
  }

  if (bytes.byteLength > IMAGE_ATTACHMENT_MAX_BYTES) {
    return preparationFailure(input, "sizeOverflow", bytes.byteLength);
  }

  const format = resolveImageAttachmentFormat({
    bytes,
    reportedMimeType: input.candidate.reportedMimeType
  });

  if (!format.ok) {
    return preparationFailure(
      input,
      format.reason,
      input.candidate.actualBytes
    );
  }

  return {
    ok: true,
    pending: {
      id: input.id,
      positionTrackingId: input.id,
      sourceDocumentId: input.sourceDocumentId,
      sourceEditorId: input.sourceEditorId,
      initialPosition: input.initialPosition,
      bytes,
      reportedMimeType: input.candidate.reportedMimeType,
      detectedFormat: format.format,
      originalFileName: input.candidate.originalFileName,
      actualBytes: input.candidate.actualBytes,
      hadMultipleImages: input.candidate.hadMultipleImages,
      ignoredAdditionalImageCount:
        input.candidate.ignoredAdditionalImageCount
    }
  };
}
