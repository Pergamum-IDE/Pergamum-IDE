export const TEXT_IMPORT_PREVIEW_CHARACTER_COUNT = 20;

export const TEXT_IMPORT_ENCODINGS = [
  "utf8",
  "utf8Bom",
  "shiftJis",
  "eucJp",
  "utf16le",
  "utf16be",
  "iso2022Jp"
] as const;

export type TextImportEncoding = (typeof TEXT_IMPORT_ENCODINGS)[number];

export type TextImportBomKind = "none" | "utf8" | "utf16le" | "utf16be";

export type TextImportLineEnding = "lf" | "crlf";

export const TEXT_IMPORT_LINE_ENDINGS = ["lf", "crlf"] as const;

export type TextImportSkipReason =
  | "notTextFile"
  | "invalidProjectPath"
  | "targetExists"
  | "sourceMissing"
  | "sourceUnreadable"
  | "decodeFailed"
  | "unsupportedSource";

export const TEXT_IMPORT_SKIP_REASONS = [
  "notTextFile",
  "invalidProjectPath",
  "targetExists",
  "sourceMissing",
  "sourceUnreadable",
  "decodeFailed",
  "unsupportedSource"
] as const satisfies readonly TextImportSkipReason[];

export interface TextImportDryRunFile {
  readonly id: string;
  readonly sourcePath: string;
  readonly sourceDisplayPath: string;
  readonly targetProjectRelativePath: string;
  readonly originalTargetProjectRelativePath: string;
  readonly selectedEncoding: TextImportEncoding;
  readonly bomKind: TextImportBomKind;
  readonly renamed: boolean;
  readonly skipped: boolean;
  readonly skipReason?: TextImportSkipReason;
  readonly previewHead: string;
  readonly previewTail: string;
}

export interface TextImportDryRunFolder {
  readonly sourcePath: string;
  readonly targetProjectRelativePath: string;
  readonly hasSkippedDescendant: boolean;
}

export type TextImportDryRunResult =
  | {
      readonly ok: true;
      readonly files: readonly TextImportDryRunFile[];
      readonly folders: readonly TextImportDryRunFolder[];
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly message?: string;
    };

export interface DryRunTextImportRequest {
  readonly projectId: string;
  readonly destinationFolderProjectRelativePath: string;
  readonly sourcePaths: readonly string[];
}

export interface PreviewTextImportFileRequest {
  readonly sourcePath: string;
  readonly encoding: TextImportEncoding;
}

export interface PreviewTextImportFileRequestItem
  extends PreviewTextImportFileRequest {
  readonly id: string;
}

export interface PreviewTextImportFilesRequest {
  readonly files: readonly PreviewTextImportFileRequestItem[];
}

export type TextImportPreviewFailureReason =
  | "sourceMissing"
  | "sourceUnreadable"
  | "decodeFailed";

export type PreviewTextImportFilePreviewResult =
  | {
      readonly ok: true;
      readonly id: string;
      readonly sourcePath: string;
      readonly encoding: TextImportEncoding;
      readonly bomKind: TextImportBomKind;
      readonly previewHead: string;
      readonly previewTail: string;
    }
  | {
      readonly ok: false;
      readonly id: string;
      readonly sourcePath: string;
      readonly encoding: TextImportEncoding;
      readonly reason: TextImportPreviewFailureReason;
      readonly message?: string;
    };

export type PreviewTextImportFilesResult =
  | {
      readonly ok: true;
      readonly files: readonly PreviewTextImportFilePreviewResult[];
    }
  | {
      readonly ok: false;
      readonly reason: "invalidRequest";
      readonly message?: string;
    };

export type PreviewTextImportFileResult =
  | {
      readonly ok: true;
      readonly previewHead: string;
      readonly previewTail: string;
      readonly bomKind: TextImportBomKind;
    }
  | {
      readonly ok: false;
      readonly reason: TextImportPreviewFailureReason;
      readonly message?: string;
    };

export interface ExecuteTextImportFileRequest {
  readonly sourcePath: string;
  readonly targetProjectRelativePath: string;
  readonly encoding: TextImportEncoding;
  readonly skipped?: boolean;
  readonly skipReason?: TextImportSkipReason;
}

export interface ExecuteTextImportRequest {
  readonly projectId: string;
  readonly destinationFolderProjectRelativePath: string;
  readonly files: readonly ExecuteTextImportFileRequest[];
  readonly normalizeLineEndings: boolean;
  /**
   * Step 1 has no UI/settings orchestration yet. Step 2 can pass the
   * application setting here while the main process still performs the
   * normalization and file write.
   */
  readonly targetLineEnding: TextImportLineEnding;
}

export type ExecuteTextImportResult =
  | {
      readonly ok: true;
      readonly imported: readonly {
        readonly sourcePath: string;
        readonly targetProjectRelativePath: string;
      }[];
      readonly skipped: readonly {
        readonly sourcePath: string;
        readonly targetProjectRelativePath?: string;
        readonly reason: TextImportSkipReason;
      }[];
      readonly failed: readonly {
        readonly sourcePath: string;
        readonly targetProjectRelativePath?: string;
        readonly reason: TextImportSkipReason;
        readonly message?: string;
      }[];
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly message?: string;
    };

export function isTextImportEncoding(
  value: unknown
): value is TextImportEncoding {
  return (
    typeof value === "string" &&
    (TEXT_IMPORT_ENCODINGS as readonly string[]).includes(value)
  );
}

export function isTextImportLineEnding(
  value: unknown
): value is TextImportLineEnding {
  return (
    typeof value === "string" &&
    (TEXT_IMPORT_LINE_ENDINGS as readonly string[]).includes(value)
  );
}

export function isTextImportSkipReason(
  value: unknown
): value is TextImportSkipReason {
  return (
    typeof value === "string" &&
    (TEXT_IMPORT_SKIP_REASONS as readonly string[]).includes(value)
  );
}
