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
  const glossaryEditorSource = readFileSync(
    "src/renderer/GlossaryEditor.tsx",
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
      "readOnly ? { kind: \"none\" } : previewImageResolution"
    );
    expect(editorSurfaceSource).toContain(
      "imageLinkDiagnosticsResolutionContext={"
    );
  });

  it("GlossaryEditor uses the projectRoot context (disabled when read-only) and threads global editor settings", () => {
    expect(glossaryEditorSource).toContain(
      "const imageLinkDiagnosticsResolutionContext = readOnly"
    );
    expect(glossaryEditorSource).toContain("DIAGNOSTICS_DISABLED");
    expect(glossaryEditorSource).toContain(
      "GLOSSARY_PREVIEW_IMAGE_RESOLUTION"
    );
    expect(glossaryEditorSource).toContain(
      "imageLinkDiagnosticsResolutionContext={"
    );
    // Blocker 1: the global line-break marker / whitespace settings now flow in.
    expect(glossaryEditorSource).toContain("markerGlyph={markerGlyph}");
    expect(glossaryEditorSource).toContain(
      "initialLineEndingBreaks={initialDescriptionLineEndingBreaks}"
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
