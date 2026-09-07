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
 * Resolve a Markdown image `src` for the Preview.
 *
 * - `passThrough` — leave the `src` untouched (external URL / data / blob /
 *   fragment / empty, or a project-local link that does not name a supported
 *   image extension).
 * - `blocked` — the link is project-local in shape but unsafe (backslash,
 *   drive letter, leading `/`, or it escapes the project root once resolved);
 *   the caller neutralizes the `src` so no request is made.
 * - `rewrite` — replace the `src` with `url` (`pergamum-asset://project/...`).
 *
 * `sourceMarkdownProjectRelativePath` MUST be the project-root-relative path
 * of the Markdown file being previewed (e.g. `chapters/chapter01.md`). When
 * the previewed document is not a project document the caller must not invoke
 * this at all.
 */
export function resolveProjectLocalImageSrc(
  rawSrc: string,
  sourceMarkdownProjectRelativePath: string
): ProjectLocalImageSrcResolution {
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

  const sourceDir = projectRelativeDirname(sourceMarkdownProjectRelativePath);
  const combined = sourceDir.length === 0 ? src : `${sourceDir}/${src}`;

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
