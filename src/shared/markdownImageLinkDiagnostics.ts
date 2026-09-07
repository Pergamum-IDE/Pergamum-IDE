/**
 * #411 / #412: IPC contract for broken project-local image-link diagnostics.
 *
 * The renderer extracts every project-local image link (destination + document
 * offsets) from the edited text and asks the main process which of them are
 * broken and why. The renderer NEVER sends the project root and NEVER decides
 * file existence / realpath / magic bytes — main resolves the current project
 * root itself and performs all filesystem validation
 * ({@link ../main/projectLocalImageFileValidation}).
 *
 * #412: the request carries an explicit
 * {@link ProjectLocalImageResolutionContext} so the Markdown document editor
 * (`sourceFile`) and the Glossary editor (`projectRoot`) share this one path
 * without a Glossary-specific validator.
 *
 * Read-only: no request or response here ever rewrites the edited text.
 */

import type { ProjectLocalImageResolutionContext } from "./projectLocalImageLink";

export type { ProjectLocalImageResolutionContext };

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
   * How the edited surface anchors project-local links:
   *   - `{ kind: "sourceFile"; sourceMarkdownProjectRelativePath }` — a
   *     Markdown document editor; links resolve against that file's folder.
   *   - `{ kind: "projectRoot" }` — the Glossary editor; links resolve
   *     against the project root.
   *   - `{ kind: "none" }` — diagnostics disabled; main returns
   *     `{ ok: false, diagnostics: [] }`. (The renderer normally does not
   *     send a request at all in this case.)
   */
  readonly resolutionContext: ProjectLocalImageResolutionContext;
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
