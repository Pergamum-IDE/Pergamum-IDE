import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { markdownPreviewRenderer } from "../../src/renderer/preview/markdownPreviewRenderer";

describe("Markdown Preview Scroll Sync Wiring (#503)", () => {
  const editorSurfaceSource = readFileSync(
    "src/renderer/EditorSurface.tsx",
    "utf8"
  );
  const markdownEditorSource = readFileSync(
    "src/renderer/MarkdownEditor.tsx",
    "utf8"
  );
  const glossaryPreviewDecoratorSource = readFileSync(
    "src/renderer/GlossaryPreviewDecorator.tsx",
    "utf8"
  );
  const previewScrollSyncSource = readFileSync(
    "src/renderer/previewScrollSync.ts",
    "utf8"
  );

  it("injects 1-based data-source-line attributes into Markdown block elements matching CodeMirror 1-based line numbers", () => {
    const markdownContent = "# Title\n\nFirst paragraph.\n\nSecond paragraph.";
    const html = markdownPreviewRenderer.render(markdownContent);

    expect(html).toContain('<h1 data-source-line="1">Title</h1>');
    expect(html).toContain('<p data-source-line="3">First paragraph.</p>');
    expect(html).toContain('<p data-source-line="5">Second paragraph.</p>');
  });

  it("imports and wires previewScrollSync anchor helpers and EditorScrollSyncAdapter in EditorSurface.tsx", () => {
    expect(editorSurfaceSource).toContain(
      'from "./previewScrollSync"'
    );
    expect(editorSurfaceSource).toContain("collectPreviewBlockRefs(");
    expect(editorSurfaceSource).toContain("syncPreviewScrollWithBlocks({");
    expect(editorSurfaceSource).toContain("createScrollSyncGuard()");
    expect(editorSurfaceSource).toContain("editorAdapter?.getTopSourceLine()");
  });

  it("explicitly configures Markdown Preview with vertical axis", () => {
    expect(editorSurfaceSource).toContain('previewScrollAxis: PreviewScrollAxis = "vertical"');
    expect(editorSurfaceSource).toContain("sourceAxis: previewScrollAxis");
    expect(editorSurfaceSource).toContain("targetAxis: previewScrollAxis");
  });

  it("exposes container & adapter mount callbacks on MarkdownEditor and GlossaryPreviewDecorator", () => {
    expect(markdownEditorSource).toContain("onScrollerMount?: (scroller: HTMLElement | null) => void;");
    expect(markdownEditorSource).toContain("onScrollSyncAdapterMount?: (adapter: EditorScrollSyncAdapter | null) => void;");
    expect(glossaryPreviewDecoratorSource).toContain("onPreviewContainerMount?: (container: HTMLElement | null) => void;");
  });

  it("does not introduce vertical writing renderers, novel presets, or preset UI selectors", () => {
    expect(editorSurfaceSource).not.toContain("vertical-rl");
    expect(editorSurfaceSource).not.toContain("Narou");
    expect(editorSurfaceSource).not.toContain("Kakuyomu");
    expect(previewScrollSyncSource).not.toContain("vertical-rl");
    expect(previewScrollSyncSource).not.toContain("Narou");
    expect(previewScrollSyncSource).not.toContain("Kakuyomu");
  });
});
