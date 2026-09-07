import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * #411: source-text wiring assertions — the broken-image-link lint extension
 * must only ever be active for an editable project Markdown document, and the
 * document-state builder must add it conditionally.
 */
describe("markdown image link diagnostics wiring (#411)", () => {
  const editorSurfaceSource = readFileSync(
    "src/renderer/EditorSurface.tsx",
    "utf8"
  );
  const markdownEditorSource = readFileSync(
    "src/renderer/MarkdownEditor.tsx",
    "utf8"
  );
  const documentStateSource = readFileSync(
    "src/renderer/markdownEditorDocumentState.ts",
    "utf8"
  );

  it("EditorSurface gates the source path on !readOnly and the project-relative path", () => {
    expect(editorSurfaceSource).toContain(
      "const imageLinkDiagnosticsSourceProjectRelativePath = readOnly"
    );
    expect(editorSurfaceSource).toContain(": previewSourceProjectRelativePath;");
    expect(editorSurfaceSource).toContain(
      "imageLinkDiagnosticsSourceProjectRelativePath={"
    );
    expect(editorSurfaceSource).toContain(
      "formatImageLinkDiagnosticMessage={formatImageLinkDiagnosticMessage}"
    );
  });

  it("MarkdownEditor only passes imageLinkDiagnosticsOptions when a project-relative path is present", () => {
    expect(markdownEditorSource).toContain(
      "(imageLinkDiagnosticsSourceProjectRelativePath ?? null) !== null"
    );
    expect(markdownEditorSource).toContain(
      "? currentImageLinkDiagnosticsOptionsRef.current"
    );
    expect(markdownEditorSource).toContain(": undefined,");
  });

  it("MarkdownEditor registers + unregisters the per-view options map (stale-closure guard)", () => {
    expect(markdownEditorSource).toContain(
      "registerEditorViewImageLinkDiagnosticsOptions("
    );
    expect(markdownEditorSource).toContain(
      "unregisterEditorViewImageLinkDiagnosticsOptions(view);"
    );
  });

  it("the document-state builder adds the lint extension only when options are supplied", () => {
    expect(documentStateSource).toContain(
      "options.imageLinkDiagnosticsOptions"
    );
    expect(documentStateSource).toContain(
      "createMarkdownImageLinkDiagnosticsExtension("
    );
  });
});
