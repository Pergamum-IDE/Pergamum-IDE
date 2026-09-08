/**
 * #413: plan the in-place rewrites of a single Markdown document's inline
 * project-local image links when that document is moved / renamed to a new
 * project-root-relative location.
 *
 * The goal is *reference stability*: a link that resolved to
 * `assets/foo.png` from the document's OLD folder must still resolve to
 * `assets/foo.png` from its NEW folder. Only the relative "climb" prefix of
 * the destination changes; the author-written tail (the segments below the
 * anchor directory, percent-encoding and spaces included) is preserved
 * byte-for-byte.
 *
 * This module is PURE — no filesystem, no `node:path`, no settings. It never
 * checks whether the referenced image actually exists: a broken / missing
 * link is rewritten exactly like a live one so a later-added file still
 * resolves (existence is #411 diagnostics' responsibility, not #413's).
 *
 * Out of scope (left byte-for-byte untouched, never reported here):
 *   - external `http:` / `https:` / `data:` / `blob:` / protocol-relative /
 *     other-scheme / bare-fragment destinations
 *   - inline HTML `<img>` and reference-style `![alt][ref]` images
 *     (the scanner never yields them)
 *   - `.svg` / `.bmp` / `.avif` and any non-image extension — not a
 *     Pergamum project-local image
 *   - a destination whose shape can't be resolved from the OLD context
 *     (backslash, leading `/`, drive letter, a `..` that climbs above the
 *     project root, a non-leading `..`, an empty `//` segment, a trailing
 *     `/`)
 *   - a destination whose computed new form is identical to the old form
 *     (e.g. the move keeps the same parent directory)
 *
 * Notation preservation (Issue #413 "記法保持方針"):
 *   - an angle-wrapped destination `![](<...>)` stays angle-wrapped
 *   - a percent-encoded tail segment (`my%20image.png`) keeps its encoding —
 *     it is never decoded into a bare space
 *   - a bare destination stays bare when the new form is still a safe bare
 *     CommonMark destination, and is wrapped in `<...>` (the #407 policy)
 *     when the new form would be ambiguous bare
 */

import { supportedImageAttachmentFormatForFileName } from "./imageAttachmentFormat";
import {
  markdownDestinationNeedsAngleWrapping,
  projectRelativeDirname
} from "./markdownImageLink";
import { scanMarkdownImageLinks } from "./markdownImageLinkExtraction";
import {
  decodeImageLinkSrcForResolution,
  isExternalImageSrc
} from "./projectLocalImageLink";

/**
 * One planned edit. `[from, to)` is a range in the ORIGINAL document text
 * that spans the destination *including* its `<...>` wrapper when the author
 * used one. `oldDestination` is exactly that slice; `newDestination` is the
 * replacement (which may add a `<...>` wrapper a bare original lacked).
 *
 * The offsets are computed against the document's pre-move text. A Markdown
 * document's bytes do not change when it is moved, so the same offsets stay
 * valid whether the rewrite is applied to the live editor buffer before or
 * after the move completes.
 */
export interface MarkdownImageLinkMoveRewrite {
  readonly from: number;
  readonly to: number;
  readonly oldDestination: string;
  readonly newDestination: string;
}

export interface PlanMarkdownImageLinkRewritesForDocumentMoveArgs {
  /** The Markdown document's current (pre-move) source text. */
  readonly markdown: string;
  /** `/`-separated project-root-relative path of the document BEFORE the move. */
  readonly oldDocumentProjectRelativePath: string;
  /** `/`-separated project-root-relative path of the document AFTER the move. */
  readonly newDocumentProjectRelativePath: string;
  /**
   * #414 P0-2: project-root-relative OLD paths of image files that are moving
   * in the SAME File Explorer operation. A link that resolves to one of these
   * is left for the C2 image-reference planner (which points it at the
   * image's NEW path from this document's NEW folder), so the same link is
   * never rewritten twice. Optional — a document-only move passes nothing.
   */
  readonly imageOldPathsMovingInSameOperation?: readonly string[];
}

/** Split a `/`-separated path into non-empty, non-`.` segments. */
function posixSegments(path: string): string[] {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".");
}

const WINDOWS_DRIVE_PREFIX_PATTERN = /^[a-zA-Z]:/;

/**
 * The author-written destination broken into a leading run of `..` segments
 * and the "tail" below the anchor directory, or `null` when the shape can't
 * be handled (see the module doc). Tail segments are returned exactly as
 * authored — percent-encoding intact.
 */
function splitAuthoredDestination(
  rawInner: string
): { readonly upwardCount: number; readonly tail: readonly string[] } | null {
  if (
    rawInner.length === 0 ||
    rawInner.includes("\\") ||
    rawInner.startsWith("/") ||
    WINDOWS_DRIVE_PREFIX_PATTERN.test(rawInner)
  ) {
    return null;
  }

  const parts = rawInner.split("/");
  // A `//` inside the path or a trailing `/` (directory, not an image).
  if (parts.some((segment, index) => segment.length === 0 && index !== 0)) {
    return null;
  }
  if (parts[0].length === 0) {
    return null;
  }

  const segments: string[] = [];
  for (const part of parts) {
    if (part === ".") {
      continue;
    }
    segments.push(part);
  }

  let upwardCount = 0;
  while (upwardCount < segments.length && segments[upwardCount] === "..") {
    upwardCount += 1;
  }

  const tail = segments.slice(upwardCount);
  if (tail.length === 0 || tail.some((segment) => segment === "..")) {
    // No filename, or a `..` that is not part of the leading run — the #413
    // PoC does not re-synthesise those.
    return null;
  }

  return { upwardCount, tail };
}

/** Length of the shared leading run of two segment lists. */
function commonPrefixLength(
  left: readonly string[],
  right: readonly string[]
): number {
  let index = 0;
  while (
    index < left.length &&
    index < right.length &&
    left[index] === right[index]
  ) {
    index += 1;
  }
  return index;
}

/**
 * Plan every project-local image-link rewrite needed to keep a moved Markdown
 * document's inline image references pointing at the same project-relative
 * targets. Returns `[]` when the move keeps the same parent directory or when
 * no link needs changing. Rewrites are in document order and never overlap.
 */
export function planMarkdownImageLinkRewritesForDocumentMove(
  args: PlanMarkdownImageLinkRewritesForDocumentMoveArgs
): readonly MarkdownImageLinkMoveRewrite[] {
  const oldDir = projectRelativeDirname(args.oldDocumentProjectRelativePath);
  const newDir = projectRelativeDirname(args.newDocumentProjectRelativePath);

  // Same anchor directory ⟹ every relative link still resolves identically.
  if (oldDir === newDir) {
    return [];
  }

  const oldDirSegments = posixSegments(oldDir);
  const newDirSegments = posixSegments(newDir);
  const imageOldPathsMovingInSameOperation = new Set(
    args.imageOldPathsMovingInSameOperation ?? []
  );

  const rewrites: MarkdownImageLinkMoveRewrite[] = [];

  for (const match of scanMarkdownImageLinks(args.markdown)) {
    const rawInner = match.src;
    if (rawInner.trim().length === 0 || isExternalImageSrc(rawInner.trim())) {
      continue;
    }

    const split = splitAuthoredDestination(rawInner);
    if (split === null) {
      continue;
    }

    const { upwardCount, tail } = split;

    // The extension gate — decode the final tail segment so `%2E png` style
    // encodings are judged on their real name. `.svg` / `.bmp` / `.avif` /
    // extension-less all fall out here.
    const decodedFileName = decodeImageLinkSrcForResolution(tail[tail.length - 1]);
    if (supportedImageAttachmentFormatForFileName(decodedFileName) === null) {
      continue;
    }

    // The OLD context must be able to name the target: the climb cannot go
    // above the project root.
    if (upwardCount > oldDirSegments.length) {
      continue;
    }
    const anchorSegments = oldDirSegments.slice(
      0,
      oldDirSegments.length - upwardCount
    );

    // #414 P0-2: this link points at an image that is ALSO moving in this
    // operation — hand it to the C2 planner so it lands on the image's NEW
    // path from this document's NEW folder, in a single rewrite.
    if (imageOldPathsMovingInSameOperation.size > 0) {
      const resolvedTarget = [
        ...anchorSegments,
        ...tail.map((segment) => decodeImageLinkSrcForResolution(segment))
      ].join("/");
      if (imageOldPathsMovingInSameOperation.has(resolvedTarget)) {
        continue;
      }
    }

    // Re-anchor from the NEW directory to that same anchor directory, then
    // re-attach the author's tail verbatim.
    const shared = commonPrefixLength(newDirSegments, anchorSegments);
    const upward = newDirSegments.length - shared;
    const downward = anchorSegments.slice(shared);
    const newInner = [
      ...Array<string>(upward).fill(".."),
      ...downward,
      ...tail
    ].join("/");

    const wasAngleWrapped =
      match.from > 0 &&
      args.markdown[match.from - 1] === "<" &&
      args.markdown[match.to] === ">";
    const nowAngleWrapped =
      wasAngleWrapped || markdownDestinationNeedsAngleWrapping(newInner);

    const oldDestination = wasAngleWrapped ? `<${rawInner}>` : rawInner;
    const newDestination = nowAngleWrapped ? `<${newInner}>` : newInner;

    if (newDestination === oldDestination) {
      continue;
    }

    rewrites.push({
      from: wasAngleWrapped ? match.from - 1 : match.from,
      to: wasAngleWrapped ? match.to + 1 : match.to,
      oldDestination,
      newDestination
    });
  }

  return rewrites;
}
