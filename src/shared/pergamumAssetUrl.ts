/**
 * #409: the `pergamum-asset://` custom protocol used to display project-local
 * images in the Markdown Preview.
 *
 * A `pergamum-asset://project/<project-root-relative-path>` URL is produced by
 * the renderer's Preview rewrite pass ({@link ../renderer/preview/markdownPreviewRenderer})
 * from an already resolved, already contained, canonical project-root-relative
 * path. The main-process protocol handler
 * ({@link ../main/pergamumAssetProtocol}) parses it back with
 * {@link parsePergamumAssetUrl} and re-validates everything before reading a
 * byte from disk.
 *
 * The request path is deliberately STRICT: `..` / `..\` segments, a leading
 * `/`, backslashes, percent-encoded separators and control characters are all
 * rejected outright rather than normalized away. The renderer only ever emits
 * canonical paths, so a non-canonical protocol request is treated as
 * tampering.
 */

import {
  validateAttachedImageSaveDestination,
  type SaveDestinationRejectionReason
} from "./attachedImageSaveDestination";

export const PERGAMUM_ASSET_SCHEME = "pergamum-asset";

/**
 * The fixed URL authority. A `standard` custom scheme URL is
 * `scheme://<host>/<path>`; pinning the host to a constant keeps the whole
 * project-relative path in the URL path component and lets the handler reject
 * anything with a different host. `project` (not `asset`) so a path that
 * starts with `assets/` does not read as `pergamum-asset://asset/assets/...`.
 */
export const PERGAMUM_ASSET_URL_AUTHORITY = "project";

const PERGAMUM_ASSET_URL_PREFIX = `${PERGAMUM_ASSET_SCHEME}://${PERGAMUM_ASSET_URL_AUTHORITY}/`;

export type PergamumAssetUrlRejectionReason =
  | "notPergamumAssetUrl"
  | "empty"
  | "malformedEncoding"
  | "backslash"
  | "absolute"
  | "parentSegment"
  | "dotSegment"
  | "emptySegment"
  | "invalidPath";

export type PergamumAssetUrlParseResult =
  | {
      readonly ok: true;
      /** Canonical `/`-joined project-root-relative path. */
      readonly projectRelativePath: string;
      readonly segments: readonly string[];
    }
  | { readonly ok: false; readonly reason: PergamumAssetUrlRejectionReason };

// NUL / C0 controls / DEL. Written with explicit escapes so the source file
// stays pure ASCII.
const CONTROL_CHAR_PATTERN = new RegExp("[\u0000-\u001f\u007f]");
const PERCENT_ENCODED_BACKSLASH_PATTERN = /%5c/i;

/**
 * Build a `pergamum-asset://project/...` URL from an ALREADY canonical
 * project-root-relative path (`/`-separated, no `.` / `..` segments, no
 * leading slash). Each segment is percent-encoded so spaces and other URL
 * metacharacters survive the round trip; `/` separators are preserved.
 *
 * Throws if `projectRelativePath` is not canonical — callers must have run it
 * through {@link validateAttachedImageSaveDestination} (or the renderer
 * resolver, which does) first.
 */
export function buildPergamumAssetUrl(projectRelativePath: string): string {
  const shape = validateAttachedImageSaveDestination(projectRelativePath);
  if (!shape.ok || shape.normalized !== projectRelativePath) {
    throw new Error(
      `buildPergamumAssetUrl requires a canonical project-relative path, got "${projectRelativePath}".`
    );
  }
  const encoded = shape.segments
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${PERGAMUM_ASSET_URL_PREFIX}${encoded}`;
}

/**
 * Parse and strictly validate a `pergamum-asset://project/...` URL back into a
 * canonical project-root-relative path. Never touches the filesystem — the
 * caller still runs `path.resolve` + realpath containment + protected-location
 * + format checks.
 */
export function parsePergamumAssetUrl(url: string): PergamumAssetUrlParseResult {
  const trimmed = url.trim();

  const lower = trimmed.toLowerCase();
  if (!lower.startsWith(PERGAMUM_ASSET_URL_PREFIX.toLowerCase())) {
    return { ok: false, reason: "notPergamumAssetUrl" };
  }

  // The scheme + authority are matched case-insensitively; the path is not.
  let rest = trimmed.slice(PERGAMUM_ASSET_URL_PREFIX.length);

  // Drop a query string / fragment - never meaningful for a local file.
  const queryIndex = rest.indexOf("?");
  const fragmentIndex = rest.indexOf("#");
  const cutCandidates = [queryIndex, fragmentIndex].filter(
    (index) => index >= 0
  );
  if (cutCandidates.length > 0) {
    rest = rest.slice(0, Math.min(...cutCandidates));
  }

  if (rest.length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (rest.includes("\\") || PERCENT_ENCODED_BACKSLASH_PATTERN.test(rest)) {
    return { ok: false, reason: "backslash" };
  }
  if (rest.startsWith("/")) {
    // A leading slash means the URL was `pergamum-asset://project//...` - an
    // absolute-looking request.
    return { ok: false, reason: "absolute" };
  }

  const rawSegments = rest.split("/");
  const decodedSegments: string[] = [];
  for (const rawSegment of rawSegments) {
    if (rawSegment.length === 0) {
      return { ok: false, reason: "emptySegment" };
    }

    let decoded: string;
    try {
      decoded = decodeURIComponent(rawSegment);
    } catch {
      return { ok: false, reason: "malformedEncoding" };
    }

    if (decoded === ".") {
      return { ok: false, reason: "dotSegment" };
    }
    if (decoded === "..") {
      return { ok: false, reason: "parentSegment" };
    }
    if (
      decoded.includes("/") ||
      decoded.includes("\\") ||
      CONTROL_CHAR_PATTERN.test(decoded)
    ) {
      return { ok: false, reason: "invalidPath" };
    }

    decodedSegments.push(decoded);
  }

  const joined = decodedSegments.join("/");
  const shape = validateAttachedImageSaveDestination(joined);
  if (!shape.ok) {
    return { ok: false, reason: rejectionFor(shape.reason) };
  }
  // The renderer only ever emits canonical paths - any collapsing here means
  // the request was not canonical.
  if (shape.normalized !== joined) {
    return { ok: false, reason: "invalidPath" };
  }

  return {
    ok: true,
    projectRelativePath: shape.normalized,
    segments: shape.segments
  };
}

function rejectionFor(
  reason: SaveDestinationRejectionReason
): PergamumAssetUrlRejectionReason {
  switch (reason) {
    case "empty":
      return "empty";
    case "absolute":
    case "driveRelative":
      return "absolute";
    case "escapesProjectRoot":
      return "parentSegment";
    default:
      return "invalidPath";
  }
}
