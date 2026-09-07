/**
 * #411: IPC contract for broken project-local image-link diagnostics in the
 * active Markdown editor.
 *
 * The renderer extracts every project-local image link (destination + document
 * offsets) from the active document and asks the main process which of them
 * are broken and why. The renderer NEVER sends the project root and NEVER
 * decides file existence / realpath / magic bytes — main resolves the current
 * project root itself and performs all filesystem validation
 * ({@link ../main/projectLocalImageFileValidation}).
 *
 * Read-only: no request or response here ever rewrites the Markdown body.
 */

/** One image link the renderer found, with its destination-text range. */
export interface MarkdownImageLinkDiagnosticRequestLink {
  /** The destination exactly as authored (no URI-decode, no angle brackets). */
  readonly src: string;
  /** Start offset of the destination in the document (inclusive). */
  readonly from: number;
  /** End offset of the destination in the document (exclusive). */
  readonly to: number;
}

export interface MarkdownImageLinkDiagnosticsRequest {
  /**
   * Project-root-relative path of the Markdown file being edited (e.g.
   * `chapters/chapter01.md`). Image links are resolved against this file's
   * directory — the same #409 policy the Preview uses.
   */
  readonly sourceMarkdownProjectRelativePath: string;
  readonly links: readonly MarkdownImageLinkDiagnosticRequestLink[];
}

/**
 * Why a link is broken. Mirrors the shared main-side validation reasons plus
 * the renderer-side shape classifications (`outsideProject`, `invalidPath`,
 * `unsupportedFormat`).
 */
export type MarkdownImageLinkDiagnosticReason =
  | "missing"
  | "directory"
  | "outsideProject"
  | "protectedLocation"
  | "unsupportedFormat"
  | "formatMismatch"
  | "invalidPath"
  | "tooLarge";

export interface MarkdownImageLinkDiagnostic {
  /** Echoed from the matching request link (pre-clamp document offsets). */
  readonly from: number;
  readonly to: number;
  /** The offending destination, for the message. */
  readonly src: string;
  readonly reason: MarkdownImageLinkDiagnosticReason;
}

export interface MarkdownImageLinkDiagnosticsResult {
  /**
   * `false` when diagnostics could not be produced at all (no project open,
   * or the source path is not a usable project-relative Markdown path). The
   * renderer then shows nothing rather than a misleading empty result.
   */
  readonly ok: boolean;
  readonly diagnostics: readonly MarkdownImageLinkDiagnostic[];
}
