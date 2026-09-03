import { useLayoutEffect, useRef } from "react";
import {
  isAmbiguousGlossarySurfaceTextMatch,
  type GlossarySurfaceIndex
} from "../shared/glossarySurfaceMatching";
import { durationSincePerformanceMark } from "./debugLog";
import {
  buildGlossarySurfaceDecorationSegments,
  shouldSkipGlossarySurfaceDecorationTextNode
} from "./glossarySurfaceDecoration";

interface GlossaryPreviewDecoratorProps {
  previewHtml: string;
  surfaceIndex: GlossarySurfaceIndex;
  /** In-flight document-open correlation id (#152), or null when idle. */
  documentOpenId: string | null;
  /**
   * `performance.now()` mark from the start of this document's preview
   * render (#154) — the same boundary `previewRender.completed` uses, so
   * `previewDom.committed`'s duration stays comparable to it.
   */
  previewRenderStartedAt: number;
  /** Fired once after the preview HTML has been written into the live DOM. */
  onPreviewDomCommitted: (
    documentOpenId: string,
    durationMs: number,
    previewNodeCount: number
  ) => void;
  /** Fired once after decoratePreviewContainer finishes. */
  onPreviewDecorationCompleted: (
    documentOpenId: string,
    durationMs: number,
    visitedTextNodeCount: number,
    decoratedNodeCount: number,
    matchCount: number
  ) => void;
  /**
   * Fired once from a `requestAnimationFrame` callback scheduled right
   * after decoration finishes (#154 follow-up) — see the effect below for
   * what this proxy does and does not guarantee.
   */
  onPreviewFrameObserved: (documentOpenId: string, durationMs: number) => void;
}

interface PreviewDecorationStats {
  visitedTextNodeCount: number;
  decoratedNodeCount: number;
  matchCount: number;
}

// #375 PoC: body-text glossary matches are still visually decorated so
// readers can see which surfaces resolve to an entry, but the reader-
// assistance hover card / tooltip is intentionally gone — the sidebar
// atom list and occurrence navigation are the only glossary affordances
// on the reading surface now.
function replaceTextNodeWithDecorationSegments(
  textNode: Text,
  segments: ReturnType<typeof buildGlossarySurfaceDecorationSegments>
): number {
  const parentNode = textNode.parentNode;
  const matchSegmentCount = segments.filter(
    (segment) => segment.kind === "match"
  ).length;

  if (!parentNode || matchSegmentCount === 0) {
    return 0;
  }

  const fragment = textNode.ownerDocument.createDocumentFragment();

  for (const segment of segments) {
    if (segment.kind === "plain") {
      fragment.appendChild(
        textNode.ownerDocument.createTextNode(segment.text)
      );
      continue;
    }

    const span = textNode.ownerDocument.createElement("span");
    span.className = "glossarySurfaceDecoration";
    span.textContent = segment.match.matchedText;
    span.dataset.glossarySurface = segment.match.matchedText;
    span.dataset.glossaryAmbiguous =
      isAmbiguousGlossarySurfaceTextMatch(segment.match) ? "true" : "false";
    fragment.appendChild(span);
  }

  parentNode.replaceChild(fragment, textNode);

  return matchSegmentCount;
}

function decoratePreviewContainer(
  container: HTMLElement,
  surfaceIndex: GlossarySurfaceIndex
): PreviewDecorationStats {
  if (surfaceIndex.entries.length === 0) {
    return { visitedTextNodeCount: 0, decoratedNodeCount: 0, matchCount: 0 };
  }

  const textNodes: Text[] = [];
  const treeWalker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT
  );
  let currentNode = treeWalker.nextNode();

  while (currentNode) {
    if (
      currentNode instanceof Text &&
      !shouldSkipGlossarySurfaceDecorationTextNode(
        currentNode.parentElement
      )
    ) {
      textNodes.push(currentNode);
    }

    currentNode = treeWalker.nextNode();
  }

  let decoratedNodeCount = 0;
  let matchCount = 0;

  for (const textNode of textNodes) {
    const matchSegmentCount = replaceTextNodeWithDecorationSegments(
      textNode,
      buildGlossarySurfaceDecorationSegments(
        textNode.textContent ?? "",
        surfaceIndex
      )
    );

    if (matchSegmentCount > 0) {
      decoratedNodeCount += 1;
      matchCount += matchSegmentCount;
    }
  }

  return { visitedTextNodeCount: textNodes.length, decoratedNodeCount, matchCount };
}

export function GlossaryPreviewDecorator({
  previewHtml,
  surfaceIndex,
  documentOpenId,
  previewRenderStartedAt,
  onPreviewDomCommitted,
  onPreviewDecorationCompleted,
  onPreviewFrameObserved
}: GlossaryPreviewDecoratorProps): JSX.Element {
  const previewRef = useRef<HTMLElement | null>(null);
  // Guards against React StrictMode's dev-only double layout-effect
  // invocation, and against re-firing for the same open on a later,
  // unrelated re-run of this effect — mirrors the reportedDocumentOpenIdRef
  // pattern in EditorSurface.tsx (#152). Each ref is keyed on its own event
  // so a slow decoration pass reporting late can't suppress the (already
  // reported) DOM-commit event or vice versa.
  const reportedPreviewDomCommitDocumentOpenIdRef = useRef<string | null>(
    null
  );
  const reportedPreviewDecorationDocumentOpenIdRef = useRef<string | null>(
    null
  );
  // Guards the deferred (requestAnimationFrame) report specifically: gating
  // is checked when the callback actually fires, not when the frame is
  // requested, so a React StrictMode double-invocation (which schedules,
  // then immediately cancels-via-cleanup, then schedules again) still
  // reports exactly once from whichever request survives to fire — see the
  // effect below.
  const reportedPreviewFrameDocumentOpenIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const previewElement = previewRef.current;

    if (!previewElement) {
      return;
    }

    previewElement.innerHTML = previewHtml;

    // Proxy measurement (#154): React's own commit timing isn't directly
    // observable, so this layout effect firing — which runs synchronously
    // right after React commits this subtree's DOM, before the browser
    // paints — stands in for "commit observed". durationMs is cumulative
    // from previewRenderStartedAt (this render's start), so it covers
    // React's reconciliation/commit/effect-scheduling gap plus the innerHTML
    // write above. It does NOT guarantee the browser has finished layout or
    // painted. documentOpenId/previewRenderStartedAt are read from this
    // render's closure rather than listed as effect deps, so an ordinary
    // content edit (which changes previewHtml but not the open) can't
    // resurrect a since-cleared documentOpenId and misreport itself as part
    // of the open.
    if (
      documentOpenId &&
      reportedPreviewDomCommitDocumentOpenIdRef.current !== documentOpenId
    ) {
      reportedPreviewDomCommitDocumentOpenIdRef.current = documentOpenId;
      onPreviewDomCommitted(
        documentOpenId,
        durationSincePerformanceMark(previewRenderStartedAt),
        previewElement.childElementCount
      );
    }

    const decorationStartedAt = performance.now();
    const decorationStats = decoratePreviewContainer(
      previewElement,
      surfaceIndex
    );

    if (
      documentOpenId &&
      reportedPreviewDecorationDocumentOpenIdRef.current !== documentOpenId
    ) {
      reportedPreviewDecorationDocumentOpenIdRef.current = documentOpenId;
      onPreviewDecorationCompleted(
        documentOpenId,
        durationSincePerformanceMark(decorationStartedAt),
        decorationStats.visitedTextNodeCount,
        decorationStats.decoratedNodeCount,
        decorationStats.matchCount
      );
    }

    // Proxy measurement (#154 follow-up): requestAnimationFrame callbacks
    // run just before the browser is about to paint the next frame, so this
    // stands in for "reached the next paint-adjacent frame boundary after
    // decoration" — it does NOT confirm a paint actually happened.
    // durationMs is this segment's own elapsed time (decoration-end to
    // callback firing), not cumulative from document-open start.
    //
    // documentOpenId is captured into frameDocumentOpenId (a const, not the
    // prop) so the async callback reports the id this specific frame
    // request belongs to, independent of whatever documentOpenId happens to
    // be current when the frame actually fires. Gating
    // (reportedPreviewFrameDocumentOpenIdRef) happens inside the callback,
    // not before requestAnimationFrame is called: gating it before would
    // make React StrictMode's mount/cleanup/mount double-invocation
    // (cleanup below cancels the first request) suppress this event
    // entirely, since the second invocation would see the ref already set
    // and never schedule a replacement frame.
    let frameRequestId: number | null = null;

    if (documentOpenId) {
      const frameDocumentOpenId = documentOpenId;
      const frameObservationStartedAt = performance.now();

      frameRequestId = requestAnimationFrame(() => {
        if (
          reportedPreviewFrameDocumentOpenIdRef.current !== frameDocumentOpenId
        ) {
          reportedPreviewFrameDocumentOpenIdRef.current = frameDocumentOpenId;
          onPreviewFrameObserved(
            frameDocumentOpenId,
            durationSincePerformanceMark(frameObservationStartedAt)
          );
        }
      });
    }

    // Cancels a still-pending frame request when this effect re-runs for a
    // newer open (or a genuine unmount) before the browser gets to it —
    // this is what prevents a superseded open's previewFrame.observed from
    // ever firing, rather than a documentOpenId comparison at report time.
    return () => {
      if (frameRequestId !== null) {
        cancelAnimationFrame(frameRequestId);
      }
    };
    // documentOpenId/previewRenderStartedAt/onPreviewDomCommitted/
    // onPreviewDecorationCompleted/onPreviewFrameObserved are deliberately
    // excluded: this effect must only re-run when the preview content
    // itself changes (open or edit), never merely because App.tsx cleared
    // documentOpenId after handleDocumentOpenMeasured — see comment above.
  }, [previewHtml, surfaceIndex]);

  return <article className="preview" ref={previewRef} />;
}
