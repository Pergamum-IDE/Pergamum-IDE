/**
 * #409: renderer-side classification + resolution of a Markdown image `src`
 * for the Preview rewrite pass.
 *
 * Only *project-local* image links are rewritten to `pergamum-asset://`. A
 * link is project-local when it has no URL scheme, is not protocol-relative
 * (`//host/...`), is not a fragment, does not use a Windows drive letter or
 * backslash, and does not start with `/`. Such a link is resolved against the
 * directory of the *source* Markdown file (its project-root-relative path),
 * `.` / `..` are collapsed, and the result must stay inside the project root
 * and name a supported image extension.
 *
 * This is a UX-side convenience. The main-process protocol handler
 * ({@link ../main/pergamumAssetProtocol}) re-validates the request path and
 * the file itself (realpath containment, protected locations, magic bytes,
 * directory / existence) and is the real security boundary.
 */

import { validateAttachedImageSaveDestination } from "./attachedImageSaveDestination";
import { supportedImageAttachmentFormatForFileName } from "./imageAttachmentFormat";
import { buildPergamumAssetUrl } from "./pergamumAssetUrl";

const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
// A single letter + colon + separator is a Windows drive path (`C:\`, `C:/`),
// NOT a URL scheme - it must be blocked, never treated as external.
const WINDOWS_DRIVE_PATH_PATTERN = /^[a-zA-Z]:[\\/]/;
const WINDOWS_DRIVE_RELATIVE_PATTERN = /^[a-zA-Z]:/;

export type ProjectLocalImageSrcResolution =
  | { readonly kind: "passThrough" }
  | { readonly kind: "blocked" }
  | {
      readonly kind: "rewrite";
      readonly url: string;
      readonly projectRelativePath: string;
    };

/**
 * #412: how a Preview resolves the project-local image links inside the
 * content it renders. An explicit tagged union — never `null` with two
 * meanings.
 *
 * - `none` — do NOT rewrite. A standalone `.md` file, a non-project
 *   document, or any surface with no project context. Links render verbatim
 *   (pre-#409 behavior).
 * - `sourceFile` — a project Markdown *document* Preview. A link is resolved
 *   relative to the folder of `sourceMarkdownProjectRelativePath` (the
 *   document's own project-root-relative path), so `../x.png` can climb to a
 *   sibling folder. This is the #409 policy.
 * - `projectRoot` — a Glossary vocabulary Preview (#412). Glossary text has
 *   no source-file location, so a link is resolved relative to the project
 *   ROOT: `assets/x.png` means `<root>/assets/x.png`, and `../x.png` escapes
 *   the root and is blocked.
 *
 * The same link string can therefore resolve differently (or be blocked) in
 * a document vs. the Glossary — that asymmetry is intentional and is never
 * auto-corrected.
 */
export type ProjectLocalImageResolutionContext =
  | { readonly kind: "none" }
  | {
      readonly kind: "sourceFile";
      readonly sourceMarkdownProjectRelativePath: string;
    }
  | { readonly kind: "projectRoot" };

/**
 * `true` for an `src` that must be left exactly as authored: it carries a URL
 * scheme (`http:`, `https:`, `data:`, `blob:`, `mailto:`, `pergamum-asset:`,
 * ...), is protocol-relative, or is a bare fragment. An empty string is not
 * "external" — the caller passes it through separately.
 */
export function isExternalImageSrc(src: string): boolean {
  const value = src.trim();
  if (value.length === 0) {
    return false;
  }
  // A Windows drive path is not external - the resolver must block it.
  if (WINDOWS_DRIVE_PATH_PATTERN.test(value)) {
    return false;
  }
  return (
    value.startsWith("#") ||
    value.startsWith("//") ||
    URL_SCHEME_PATTERN.test(value)
  );
}

/** POSIX-style `dirname` for a `/`-separated project-relative path. */
function projectRelativeDirname(projectRelativePath: string): string {
  const slashIndex = projectRelativePath.lastIndexOf("/");
  return slashIndex <= 0 ? "" : projectRelativePath.slice(0, slashIndex);
}

/**
 * The project-root-relative directory a `sourceFile` / `projectRoot` context
 * anchors links at. `""` = the project root itself. Never called for `none`.
 */
function resolutionBaseDir(
  context: Exclude<ProjectLocalImageResolutionContext, { kind: "none" }>
): string {
  return context.kind === "sourceFile"
    ? projectRelativeDirname(context.sourceMarkdownProjectRelativePath)
    : "";
}

/**
 * Resolve a Markdown image `src` for a Preview, given how that Preview's
 * surface anchors project-local links ({@link ProjectLocalImageResolutionContext}).
 *
 * - `passThrough` — leave the `src` untouched (context is `none`; or the
 *   `src` is an external URL / data / blob / fragment / empty; or it is a
 *   project-local link that does not name a supported image extension).
 * - `blocked` — the link is project-local in shape but unsafe (backslash,
 *   drive letter, leading `/`, or it escapes the project root once resolved
 *   from the context's base); the caller neutralizes the `src`.
 * - `rewrite` — replace the `src` with `url` (`pergamum-asset://project/...`).
 *
 * The `projectRelativePath` in a `rewrite` result is always ROOT-relative and
 * `.`/`..`-free, whichever context produced it — so the main-process
 * `pergamum-asset://` handler validates every Preview's links identically and
 * the renderer never passes a project root.
 */
export function resolveProjectLocalImageSrc(
  rawSrc: string,
  context: ProjectLocalImageResolutionContext
): ProjectLocalImageSrcResolution {
  if (context.kind === "none") {
    return { kind: "passThrough" };
  }

  const src = rawSrc.trim();

  if (src.length === 0 || isExternalImageSrc(src)) {
    return { kind: "passThrough" };
  }

  if (
    src.includes("\\") ||
    src.startsWith("/") ||
    WINDOWS_DRIVE_RELATIVE_PATTERN.test(src)
  ) {
    return { kind: "blocked" };
  }

  // `sourceFile` anchors at the document's own folder; `projectRoot` (Glossary)
  // anchors at "" — the project root itself. NO fallback between the two.
  const baseDir = resolutionBaseDir(context);
  const combined = baseDir.length === 0 ? src : `${baseDir}/${src}`;

  const shape = validateAttachedImageSaveDestination(combined);
  if (!shape.ok) {
    // escapesProjectRoot / invalidCharacter / reservedName / trailingDotOrSpace
    // / (collapsed-to-)empty all mean "do not display".
    return { kind: "blocked" };
  }

  if (supportedImageAttachmentFormatForFileName(shape.normalized) === null) {
    // Not an image we render locally - leave the original src alone so the
    // pre-#409 behavior is unchanged.
    return { kind: "passThrough" };
  }

  return {
    kind: "rewrite",
    url: buildPergamumAssetUrl(shape.normalized),
    projectRelativePath: shape.normalized
  };
}

/**
 * #411 / #412: classification of a Markdown image `src` for the
 * broken-image-link diagnostics, resolved against the same
 * {@link ProjectLocalImageResolutionContext} the Preview uses
 * ({@link resolveProjectLocalImageSrc}) — `sourceFile` for a Markdown
 * document editor, `projectRoot` for the Glossary editor. Same #409 policy
 * (no fallback between bases, settings are NEVER consulted).
 *
 * Unlike the Preview resolver this keeps the "locally-referenced but the
 * extension is not a supported image" case distinct (`unsupportedFormat`)
 * rather than folding it into `passThrough`, and it splits the Preview's
 * single `blocked` outcome into `invalidPath` (bad path shape) vs
 * `outsideProject` (a `..` climbs above the root) so each can carry its own
 * diagnostic message.
 *
 * `candidate` means the path shape is fine and names a supported image
 * extension — whether the file actually exists / is really that format is a
 * filesystem question answered in the main process
 * ({@link ../main/projectLocalImageFileValidation}).
 */
export type ProjectLocalImageLinkClassification =
  | { readonly kind: "external" }
  | { readonly kind: "empty" }
  | { readonly kind: "invalidPath" }
  | { readonly kind: "outsideProject" }
  | {
      readonly kind: "unsupportedFormat";
      readonly projectRelativePath: string;
    }
  | { readonly kind: "candidate"; readonly projectRelativePath: string };

/**
 * #411 follow-up: percent-decode a Markdown image destination for *path
 * resolution only*, matching what markdown-it does before the Preview resolves
 * it — so the Preview and the diagnostics agree on which file a link points at
 * (`![](assets/figure%20image.png)` → `assets/figure image.png`). A malformed
 * escape (`%zz`) is left exactly as authored, again matching markdown-it, which
 * does not throw either; no new diagnostic reason is introduced for it.
 *
 * This is used ONLY to decide resolution / classification. The diagnostic's
 * underline range and the `{src}` in its message keep the author's original,
 * still-encoded text so the reader can find it in the document.
 *
 * `decodeURIComponent` (not `decodeURI`) is deliberate: it also decodes the
 * path separators an attacker might hide traversal behind (`%2e%2e%2f` →
 * `../`), so the downstream containment check cannot be bypassed.
 */
export function decodeImageLinkSrcForResolution(rawSrc: string): string {
  try {
    return decodeURIComponent(rawSrc);
  } catch {
    return rawSrc;
  }
}

export function classifyProjectLocalImageLink(
  rawSrc: string,
  context: ProjectLocalImageResolutionContext
): ProjectLocalImageLinkClassification {
  if (context.kind === "none") {
    // Diagnostics are disabled for this surface — nothing to report.
    return { kind: "empty" };
  }

  const src = rawSrc.trim();

  if (src.length === 0) {
    return { kind: "empty" };
  }
  if (isExternalImageSrc(src)) {
    return { kind: "external" };
  }

  if (
    src.includes("\\") ||
    src.startsWith("/") ||
    WINDOWS_DRIVE_RELATIVE_PATTERN.test(src)
  ) {
    return { kind: "invalidPath" };
  }

  const baseDir = resolutionBaseDir(context);
  const combined = baseDir.length === 0 ? src : `${baseDir}/${src}`;

  const shape = validateAttachedImageSaveDestination(combined);
  if (!shape.ok) {
    return shape.reason === "escapesProjectRoot"
      ? { kind: "outsideProject" }
      : { kind: "invalidPath" };
  }

  if (supportedImageAttachmentFormatForFileName(shape.normalized) === null) {
    return {
      kind: "unsupportedFormat",
      projectRelativePath: shape.normalized
    };
  }

  return { kind: "candidate", projectRelativePath: shape.normalized };
}
