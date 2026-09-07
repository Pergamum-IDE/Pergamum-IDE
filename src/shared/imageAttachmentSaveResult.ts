import type { SupportedImageAttachmentFormat } from "./imageAttachmentFormat";

export interface SaveImageAttachmentPayload {
  readonly saveDirectory: string;
  readonly bytes: Uint8Array;
  readonly reportedMimeType: string;
}

export type SaveImageAttachmentStorageFailureReason =
  | "sizeOverflow"
  | "unsupportedFormat"
  | "mimeMagicMismatch"
  | "invalidPath"
  | "protectedLocation"
  | "containmentFailure"
  | "saveDirectoryNotDirectory"
  | "diskFull"
  | "permissionDenied"
  | "ioError"
  | "collisionExhausted"
  | "writeFailure";

export type SaveImageAttachmentFailureReason =
  | SaveImageAttachmentStorageFailureReason
  | "projectNotOpen";

export interface SaveImageAttachmentSuccess {
  readonly ok: true;
  /** Project-root-relative, `/`-separated path of the saved image. */
  readonly relativePath: string;
  readonly fileName: string;
  readonly format: SupportedImageAttachmentFormat;
  readonly byteLength: number;
}

export interface SaveImageAttachmentFailure<
  Reason extends SaveImageAttachmentFailureReason
> {
  readonly ok: false;
  readonly reason: Reason;
  /** Actual size (bytes) - only for `sizeOverflow`, for the warning text. */
  readonly actualBytes?: number;
}

export type SaveImageAttachmentResult<
  Reason extends SaveImageAttachmentFailureReason = SaveImageAttachmentFailureReason
> =
  | SaveImageAttachmentSuccess
  | SaveImageAttachmentFailure<Reason>;

export type SaveImageAttachmentStorageResult =
  SaveImageAttachmentResult<SaveImageAttachmentStorageFailureReason>;
