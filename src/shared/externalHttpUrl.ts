/**
 * External link policy for interactive Preview links.
 *
 * Only absolute `http:` / `https:` URLs are ever handed to the OS browser
 * (an allowlist, not a denylist). Everything else — `file:`, `mailto:`,
 * `ftp:`, `javascript:`, `data:`, unknown schemes, and relative links — is
 * never opened. A hash-only link is an in-page anchor, not an external link.
 *
 * Shared by the renderer (classification before the confirmation dialog) and
 * the main process (independent re-validation before `shell.openExternal`).
 */

/**
 * Parses `raw` as an absolute http(s) URL and returns its canonical `href`
 * (e.g. `https://example.com` -> `https://example.com/`), or `null` for
 * anything else. The scheme is never changed (`http:` is not upgraded).
 */
export function parseExternalHttpUrl(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    // Not an absolute URL (relative link, garbage, empty string).
    return null;
  }

  return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
}

export type PreviewLinkClassification =
  /** An external http(s) site: confirm, then open in the OS browser. */
  | { readonly kind: "externalHttp"; readonly url: string }
  /** A same-page anchor (`#heading`): left to the browser's default. */
  | { readonly kind: "hashOnly" }
  /** Anything else: never navigated to and never opened. */
  | { readonly kind: "blocked" };

export function classifyPreviewLinkHref(
  href: string | null | undefined
): PreviewLinkClassification {
  if (typeof href !== "string") {
    return { kind: "blocked" };
  }

  if (href.trim().startsWith("#")) {
    return { kind: "hashOnly" };
  }

  const url = parseExternalHttpUrl(href);

  return url === null ? { kind: "blocked" } : { kind: "externalHttp", url };
}
