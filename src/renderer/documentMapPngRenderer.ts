/**
 * #537: renders one Document Map page to PNG bytes, reusing the exact same
 * plan-building + drawing path as the live `GlossaryTextMinimapCanvas`
 * (`buildGlossaryDocumentMapPlan` / `drawGlossaryDocumentMap`) — just against
 * a detached, never-attached `<canvas>` instead of the DOM-visible one. No
 * separate image-splitting or rasterization mechanism is introduced.
 *
 * The plan is built ONCE by the caller (it depends only on the document text
 * / entries / settings, not on which page is being drawn) and reused across
 * every page's render call — mirroring `GlossaryTextMinimapCanvas`'s own
 * `planCacheRef`, so exporting an N-page map does not re-scan the whole
 * document N times.
 */

import {
  GLOSSARY_DOCUMENT_MAP_CELL_SIZE,
  drawGlossaryDocumentMap,
  type DocumentMapPage,
  type GlossaryDocumentMapPlan
} from "./glossaryDocumentMap";

export class DocumentMapPngRenderFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentMapPngRenderFailedError";
  }
}

/**
 * Renders a single page to PNG bytes. `contentWidth` is the plan's logical
 * pixel width (`wrapColumns * GLOSSARY_DOCUMENT_MAP_CELL_SIZE`) — the same
 * value `GlossaryTextMinimapCanvas` computes for its own canvas. `pixelRatio`
 * mirrors the live canvas's own `window.devicePixelRatio` scaling so the
 * exported PNG matches what the user sees on screen.
 *
 * Rejects with {@link DocumentMapPngRenderFailedError} when the canvas has no
 * 2D context or `toBlob` reports failure (`null`) — both must be surfaced to
 * the dialog as a retryable error, never silently skipped.
 */
export async function renderDocumentMapPageToPngBytes(input: {
  readonly plan: GlossaryDocumentMapPlan;
  readonly page: DocumentMapPage;
  readonly contentWidth: number;
  readonly pixelRatio: number;
}): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  const scale = Math.max(0.1, input.pixelRatio);
  canvas.width = Math.max(1, Math.round(input.contentWidth * scale));
  canvas.height = Math.max(1, Math.round(input.page.height * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    throw new DocumentMapPngRenderFailedError(
      "Document Map export: failed to obtain a 2D canvas context."
    );
  }

  context.imageSmoothingEnabled = false;
  context.setTransform(scale, 0, 0, scale, 0, 0);
  drawGlossaryDocumentMap(context, input.plan, input.page);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });

  if (!blob) {
    throw new DocumentMapPngRenderFailedError(
      `Document Map export: PNG encoding failed for page ${input.page.index + 1}.`
    );
  }

  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

export { GLOSSARY_DOCUMENT_MAP_CELL_SIZE };
