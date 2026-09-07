import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * #412 Blocker 1: the Glossary description editor previously used
 * MarkdownEditor's built-in prop defaults (`markerGlyph = "⏎"`, empty
 * line-ending breaks, no whitespace settings), so its line-break marker did
 * not follow Application Settings and vanished on remount. These assertions
 * pin the fix: the global editor settings are threaded EditorSurface →
 * GlossaryEditor → MarkdownEditor, with a stable per-entry documentKey and
 * line-ending breaks seeded from the loaded description.
 */
describe("Glossary description editor settings wiring (#412 Blocker 1)", () => {
  const editorSurfaceSource = readFileSync(
    "src/renderer/EditorSurface.tsx",
    "utf8"
  );
  const glossaryEditorSource = readFileSync(
    "src/renderer/GlossaryEditor.tsx",
    "utf8"
  );

  const SETTINGS_PROPS = [
    "markerGlyph",
    "expectedLineEnding",
    "newFileLineEndingFallback",
    "whitespaceSettings",
    "undoHistoryMinDepth"
  ];

  it("EditorSurface passes every global editor setting to <GlossaryEditor>", () => {
    const glossaryBlock = editorSurfaceSource.slice(
      editorSurfaceSource.indexOf("<GlossaryEditor"),
      editorSurfaceSource.indexOf("</>", editorSurfaceSource.indexOf("<GlossaryEditor")) +
        editorSurfaceSource.indexOf("/>", editorSurfaceSource.indexOf("<GlossaryEditor"))
    );
    for (const prop of SETTINGS_PROPS) {
      expect(editorSurfaceSource).toContain(`${prop}={${prop}}`);
    }
    // sanity: these appear in the GlossaryEditor element region, not only the
    // Markdown one.
    expect(glossaryBlock).toContain("markerGlyph={markerGlyph}");
  });

  it("GlossaryEditor forwards those settings + a stable key + seeded breaks to <MarkdownEditor>", () => {
    const mdBlock = glossaryEditorSource.slice(
      glossaryEditorSource.indexOf("<MarkdownEditor"),
      glossaryEditorSource.indexOf("/>", glossaryEditorSource.indexOf("<MarkdownEditor"))
    );
    for (const prop of SETTINGS_PROPS) {
      expect(mdBlock).toContain(`${prop}={${prop}}`);
    }
    expect(mdBlock).toContain("documentKey={descriptionEditorKey}");
    expect(mdBlock).toContain(
      "initialLineEndingBreaks={initialDescriptionLineEndingBreaks}"
    );
  });

  it("GlossaryEditor derives a per-entry documentKey and analyzes the description for initial breaks", () => {
    expect(glossaryEditorSource).toContain(
      "const descriptionEditorKey = `glossary-description:${draft.entry.id}`"
    );
    expect(glossaryEditorSource).toContain(
      "analyzeLineEndings(draft.description)"
    );
    // recompute keyed only on the entry key, never per keystroke
    expect(glossaryEditorSource).toContain("[descriptionEditorKey]");
  });
});
