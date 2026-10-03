import {
  classifyPreviewLinkHref,
  type PreviewLinkClassification
} from "../shared/externalHttpUrl";

/**
 * Interactive Preview link activation (one delegated click handler for every
 * `.preview` surface):
 *
 *   - `http:` / `https:`  -> never navigate Pergamum itself; ask first, and
 *     only on "Open" hand the canonical URL to the main process, which
 *     re-validates it and opens the OS browser.
 *   - `#anchor`           -> left alone (normal in-page behavior).
 *   - anything else       -> navigation prevented, nothing is opened, no
 *     dialog (file:, mailto:, ftp:, javascript:, data:, unknown, relative).
 */
export interface PreviewLinkClickEvent {
  readonly target: EventTarget | null;
  preventDefault(): void;
  stopPropagation(): void;
}

export interface PreviewExternalLinkDeps {
  /** Resolves `true` only when the user chose "Open". */
  readonly confirmOpen: (url: string) => Promise<boolean>;
  readonly openExternal: (url: string) => Promise<void>;
}

/** The anchor inside a `.preview` surface the click landed on, if any. */
export function previewAnchorForClickTarget(
  target: EventTarget | null
): HTMLAnchorElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const anchor = target.closest("a");

  if (!anchor || !anchor.closest(".preview")) {
    return null;
  }

  return anchor as HTMLAnchorElement;
}

export function classifyPreviewAnchor(
  anchor: HTMLAnchorElement
): PreviewLinkClassification {
  return classifyPreviewLinkHref(anchor.getAttribute("href"));
}

/**
 * Handles a click. Returns `true` when the click was on a Preview anchor and
 * was taken over (so the caller knows default navigation was prevented, or —
 * for a hash link — deliberately left alone: that returns `false`).
 */
export function handlePreviewLinkClick(
  event: PreviewLinkClickEvent,
  deps: PreviewExternalLinkDeps
): boolean {
  const anchor = previewAnchorForClickTarget(event.target);

  if (!anchor) {
    return false;
  }

  const classification = classifyPreviewAnchor(anchor);

  if (classification.kind === "hashOnly") {
    return false;
  }

  // Never let the BrowserWindow follow the link.
  event.preventDefault();
  event.stopPropagation();

  if (classification.kind === "blocked") {
    return true;
  }

  void deps
    .confirmOpen(classification.url)
    .then((confirmed) =>
      confirmed ? deps.openExternal(classification.url) : undefined
    )
    .catch(() => undefined);

  return true;
}
