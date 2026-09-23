// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  DocumentMapPngRenderFailedError,
  renderDocumentMapPageToPngBytes
} from "../../src/renderer/documentMapPngRenderer";
import {
  GLOSSARY_DOCUMENT_MAP_CELL_SIZE,
  buildGlossaryDocumentMapPlan
} from "../../src/renderer/glossaryDocumentMap";

/**
 * #537: happy-dom (like jsdom) does not implement 2D canvas rendering —
 * `HTMLCanvasElement.getContext("2d")` returns `null` here, exactly the
 * real-world failure this function must surface as a retryable error rather
 * than silently produce an empty/garbage PNG. This is the one failure path
 * genuinely exercisable without a real browser/Electron canvas backend; see
 * the PR description for the manual dogfood steps that cover actual pixel
 * output.
 */
describe("renderDocumentMapPageToPngBytes", () => {
  it("rejects with DocumentMapPngRenderFailedError when no 2D context is available", async () => {
    const plan = buildGlossaryDocumentMapPlan({
      text: "hello world",
      entries: [],
      wrapColumns: 40
    });

    await expect(
      renderDocumentMapPageToPngBytes({
        plan,
        page: {
          index: 0,
          startVisualRow: 0,
          endVisualRow: 1,
          startLogicalY: 0,
          height: GLOSSARY_DOCUMENT_MAP_CELL_SIZE
        },
        contentWidth: 40 * GLOSSARY_DOCUMENT_MAP_CELL_SIZE,
        pixelRatio: 1
      })
    ).rejects.toBeInstanceOf(DocumentMapPngRenderFailedError);
  });
});
