/**
 * #414 (C2): plan the in-place rewrites of the inline project-local image
 * links in ONE Markdown document that reference an image file which is being
 * moved / renamed elsewhere in the project.
 *
 * Where #413 (C1) rewrites a *moved document's own* links, C2 rewrites the
 * links in *other* documents that point at a *moved image*. The goal is the
 * same reference stability: a link that resolved to `assets/foo.png` before
 * the image moved must resolve to `assets/characters/foo.png` after it.
 *
 * This module is PURE — no filesystem, no `node:path`, no settings, no
 * existence check. A broken / missing link whose text still resolves to the
 * moved image's old path is rewritten exactly like a live one.
 *
 * Resolution policy is the #409 / #411 source-file-relative one, via
 * {@link resolveProjectLocalImageSrc} with a `sourceFile` context. There is
 * NO fallback resolution and `imageAttachment.saveDirectory` is never
 * consulted.
 *
 * Candidate filtering (Issue #414 "参照元検索方針"): a scanned link is only
 * ever *resolved* when its decoded basename matches the basename of one of
 * the `movedImages`. Links whose basename matches nothing are skipped before
 * any resolution — the caller must not resolve every link unconditionally.
 *
 * Out of scope (left byte-for-byte, never reported): external
 * `http:` / `https:` / `data:` / `blob:` / protocol-relative / other-scheme /
 * fragment links, inline HTML `<img>`, reference-style images, `.svg` /
 * `.bmp` / `.avif` and non-image extensions, links whose shape can't be
 * resolved, links that resolve somewhere other than a moved image's old path,
 * and a link whose recomputed destination equals the original.
 *
 * Notation preservation (Issue #414 "記法保持方針"): an angle-wrapped
 * destination stays angle-wrapped; a percent-encoded destination keeps
 * `%20`-style encoding (spaces are never decoded into a bare destination); a
 * bare destination stays bare when the new form is a safe bare CommonMark
 * destination and is wrapped in `<...>` (the #407 policy) otherwise.
 */

import {
  markdownDestinationNeedsAngleWrapping,
  projectRelativeDirname,
  projectRelativeLinkPath
} from "./markdownImageLink";
import { scanMarkdownImageLinks } from "./markdownImageLinkExtraction";
import {
  decodeImageLinkSrcForResolution,
  isExternalImageSrc,
  resolveProjectLocalImageSrc
} from "./projectLocalImageLink";

/** One image file being moved / renamed, in project-root-relative form. */
export interface MovedImageFile {
  readonly oldProjectRelativePath: string;
  readonly newProjectRelativePath: string;
}

/**
 * #414 P0-2: a Markdown document relocated by the SAME File Explorer
 * operation. When the document being planned is one of these, its references
 * are recomputed from its FINAL folder (`newProjectRelativePath`) so a mixed
 * "move `a.md` and `foo.png` together" ends with `a.md`'s link resolving from
 * `a.md`'s new location to `foo.png`'s new location — in one rewrite, never a
 * C1-then-C2 double apply.
 */
export interface MovedMarkdownDocument {
  readonly oldProjectRelativePath: string;
  readonly newProjectRelativePath: string;
}

/**
 * One planned edit in one Markdown document. `[from, to)` spans the
 * destination *including* its `<...>` wrapper when the author used one.
 */
export interface MarkdownImageReferenceMoveRewrite {
  readonly markdownDocumentProjectRelativePath: string;
  readonly from: number;
  readonly to: number;
  readonly oldDestination: string;
  readonly newDestination: string;
  readonly oldImageProjectRelativePath: string;
  readonly newImageProjectRelativePath: string;
}

export interface PlanMarkdownImageReferenceRewritesForImageMoveArgs {
  /** The Markdown document's current (pre-move) source text. */
  readonly markdown: string;
  /** `/`-separated project-root-relative path of the Markdown document. */
  readonly markdownDocumentProjectRelativePath: string;
  /** The image files being moved. Each must have `old !== new`. */
  readonly movedImages: readonly MovedImageFile[];
  /**
   * #414 P0-2: Markdown documents relocated by the SAME operation. If this
   * document is among them, generated destinations (and the emitted
   * `markdownDocumentProjectRelativePath`) use its FINAL location. Optional —
   * a pure image move passes nothing.
   */
  readonly movedMarkdownDocuments?: readonly MovedMarkdownDocument[];
}

/** The last `/`-separated segment of a `/`-separated path. */
function posixBasename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

/**
 * #414 P1-3: percent-encode ONE `/`-separated destination segment the way an
 * authoring tool would — full RFC 3986 `pchar` escaping (`encodeURIComponent`
 * plus the `!'()*` that it leaves alone). `/` never reaches here (the caller
 * splits first), and the input is already fully decoded, so nothing is
 * double-encoded. `.` / `..` pass through unchanged.
 */
function encodeDestinationSegment(segment: string): string {
  if (segment === "." || segment === "..") {
    return segment;
  }
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export function planMarkdownImageReferenceRewritesForImageMove(
  args: PlanMarkdownImageReferenceRewritesForImageMoveArgs
): readonly MarkdownImageReferenceMoveRewrite[] {
  const movedImages = args.movedImages.filter(
    (image) => image.oldProjectRelativePath !== image.newProjectRelativePath
  );
  if (movedImages.length === 0) {
    return [];
  }

  // Links are always resolved from the document's CURRENT (pre-move) folder —
  // that is what the link text means today. Destinations are GENERATED from
  // the document's FINAL folder when this document is itself moving (#414
  // P0-2), so a mixed doc+image move needs only one rewrite per link.
  const relocation = (args.movedMarkdownDocuments ?? []).find(
    (doc) =>
      doc.oldProjectRelativePath === args.markdownDocumentProjectRelativePath
  );
  const finalDocumentPath =
    relocation?.newProjectRelativePath ??
    args.markdownDocumentProjectRelativePath;
  const finalDocDir = projectRelativeDirname(finalDocumentPath);

  const sourceFileContext = {
    kind: "sourceFile" as const,
    sourceMarkdownProjectRelativePath: args.markdownDocumentProjectRelativePath
  };

  const rewrites: MarkdownImageReferenceMoveRewrite[] = [];

  for (const link of scanMarkdownImageLinks(args.markdown)) {
    const rawInner = link.src;
    if (rawInner.trim().length === 0 || isExternalImageSrc(rawInner)) {
      continue;
    }

    const decoded = decodeImageLinkSrcForResolution(rawInner);
    const decodedBasename = posixBasename(decoded);

    // Candidate filter: never resolve a link whose basename matches no moved
    // image. This is what keeps C2 from resolving every link in the project.
    const basenameCandidates = movedImages.filter(
      (image) => posixBasename(image.oldProjectRelativePath) === decodedBasename
    );
    if (basenameCandidates.length === 0) {
      continue;
    }

    const resolution = resolveProjectLocalImageSrc(decoded, sourceFileContext);
    if (resolution.kind !== "rewrite") {
      // passThrough (external / unsupported extension / empty) or blocked
      // (backslash / drive / leading `/` / escapes the project root).
      continue;
    }

    // Final match is on the FULL resolved project-relative target, never the
    // filename — `assets/foo.png` and `chars/foo.png` stay distinct.
    const movedImage = basenameCandidates.find(
      (image) =>
        image.oldProjectRelativePath === resolution.projectRelativePath
    );
    if (!movedImage) {
      continue;
    }

    const newComputed = projectRelativeLinkPath(
      finalDocDir,
      movedImage.newProjectRelativePath
    );

    const wasAngleWrapped =
      link.from > 0 &&
      args.markdown[link.from - 1] === "<" &&
      args.markdown[link.to] === ">";
    const wasPercentEncoded = rawInner !== decoded;

    // #414 P1-3: keep the author's percent-encoded notation. `newComputed` is
    // fully decoded, so re-encode each path segment (never the `/`) — this
    // preserves `%20` / `%23` / `%25` / `%28` … alike, not just spaces.
    const newInner = wasPercentEncoded
      ? newComputed.split("/").map(encodeDestinationSegment).join("/")
      : newComputed;

    const nowAngleWrapped =
      wasAngleWrapped || markdownDestinationNeedsAngleWrapping(newInner);

    const oldDestination = wasAngleWrapped ? `<${rawInner}>` : rawInner;
    const newDestination = nowAngleWrapped ? `<${newInner}>` : newInner;
    if (newDestination === oldDestination) {
      continue;
    }

    rewrites.push({
      markdownDocumentProjectRelativePath: finalDocumentPath,
      from: wasAngleWrapped ? link.from - 1 : link.from,
      to: wasAngleWrapped ? link.to + 1 : link.to,
      oldDestination,
      newDestination,
      oldImageProjectRelativePath: movedImage.oldProjectRelativePath,
      newImageProjectRelativePath: movedImage.newProjectRelativePath
    });
  }

  return rewrites;
}
