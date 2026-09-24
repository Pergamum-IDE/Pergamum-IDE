import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * #411 / #412: source-text wiring assertions — the broken-image-link lint
 * extension is added only for a surface with a real resolution context
 * (`sourceFile` for a project Markdown document editor, `projectRoot` for the
 * Glossary editor), and the document-state builder adds it conditionally.
 */
describe("markdown image link diagnostics wiring (#411 / #412)", () => {
  const editorSurfaceSource = readFileSync(
    "src/renderer/EditorSurface.tsx",
    "utf8"
  );
  const markdownEditorSource = readFileSync(
    "src/renderer/MarkdownEditor.tsx",
    "utf8"
  );
  const markdownSurfaceSourceSource = readFileSync(
    "src/renderer/markdownSurfaceSource.ts",
    "utf8"
  );
  const documentStateSource = readFileSync(
    "src/renderer/markdownEditorDocumentState.ts",
    "utf8"
  );

  it("EditorSurface derives the diagnostics context from the Preview context, disabled when read-only", () => {
    expect(editorSurfaceSource).toContain(
      "const imageLinkDiagnosticsResolutionContext = useMemo<"
    );
    expect(editorSurfaceSource).toContain(
      "readOnly || !isMarkdown ? { kind: \"none\" } : previewImageResolution"
    );
    expect(editorSurfaceSource).toContain(
      "imageLinkDiagnosticsResolutionContext={"
    );
  });

  it("#573: the glossary Description tab resolves (and so diagnoses) against the projectRoot context", () => {
    // The tab renders through the same MarkdownEditorSurface as documents, so
    // its diagnostics use EditorSurface's rule above over this context.
    expect(markdownSurfaceSourceSource).toContain(
      "const GLOSSARY_DESCRIPTION_IMAGE_RESOLUTION: ProjectLocalImageResolutionContext =\n  { kind: \"projectRoot\" };"
    );
    expect(markdownSurfaceSourceSource).toContain(
      "imageResolution: GLOSSARY_DESCRIPTION_IMAGE_RESOLUTION,"
    );
  });

  it("MarkdownEditor only passes imageLinkDiagnosticsOptions for a non-none context", () => {
    expect(markdownEditorSource).toContain(
      "imageLinkDiagnosticsResolutionContext.kind !== \"none\""
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
    expect(documentStateSource).toContain("options.imageLinkDiagnosticsOptions");
    expect(documentStateSource).toContain(
      "createMarkdownImageLinkDiagnosticsExtension("
    );
  });
});
