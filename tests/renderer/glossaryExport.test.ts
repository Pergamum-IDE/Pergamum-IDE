// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { ProjectDocument } from "../../src/shared/api";
import type { GlossaryEntry } from "../../src/shared/glossary";
import {
  defaultGlossaryExportBaseFileName,
  defaultGlossaryExportContentOptions,
  planGlossaryExport,
  type GlossaryExportOptions
} from "../../src/renderer/glossaryExport/glossaryExportModel";
import { countGlossaryEntryOccurrences } from "../../src/renderer/glossaryExport/glossaryExportOccurrences";
import {
  buildGlossaryEntryExportHtml,
  renderGlossaryDescriptionForExport,
  type GlossaryExportDocumentLabels,
  type RenderedGlossaryDescription
} from "../../src/renderer/glossaryExport/glossaryExportHtml";
import { runCombinedGlossaryExport, runGlossaryExport } from "../../src/renderer/glossaryExport/glossaryExportRunner";
import { inlineKatexWoff2Fonts } from "../../src/renderer/glossaryExport/katexExportCss";
import type { MermaidPreviewMessages } from "../../src/renderer/preview/markdownMermaidRendering";

// #574 Slice 6: glossary entry → HTML export.

const entryId = "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f00a1";

function entry(overrides: Partial<GlossaryEntry> = {}): GlossaryEntry {
  const atom = (id: string, sortOrder: number, value: string) => ({
    id,
    entryId,
    sortOrder,
    value,
    matchFlags: 0,
    createdAt: "2026-09-24T00:00:00.000Z",
    updatedAt: "2026-09-24T00:00:00.000Z"
  });

  return {
    id: entryId,
    description: "説明",
    atoms: [atom("a1", 0, "ジャン"), atom("a2", 1, "ジャンヌ")],
    tags: [
      {
        id: "t1",
        label: "人物",
        description: null,
        backgroundRgb: "#1f77b4",
        foregroundRgb: "#ffffff",
        sortOrder: 0,
        createdAt: "2026-09-24T00:00:00.000Z",
        updatedAt: "2026-09-24T00:00:00.000Z"
      }
    ],
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-24T01:00:00.000Z",
    ...overrides
  };
}

const labels: GlossaryExportDocumentLabels = {
  infoHeading: "語彙情報",
  representative: "代表表記",
  atoms: "表記",
  tags: "タグ",
  noTags: "タグなし",
  createdAt: "作成日",
  updatedAt: "更新日",
  occurrencesHeading: "表記ごとの出現数",
  atomColumn: "表記",
  countColumn: "出現回数",
  total: "合計",
  occurrenceScope: "文書 2 件",
  occurrenceSkipped: null,
  descriptionHeading: "Description",
  emptyDescription: "（なし）"
};

const mermaidMessages: MermaidPreviewMessages = {
  emptyMessage: "empty",
  errorMessage: "mermaid failed",
  errorHint: "hint",
  showDetailsLabel: "details"
};

describe("export model (#574 Slice 6)", () => {
  const base: GlossaryExportOptions = {
    target: { kind: "single", entryId },
    format: "html",
    content: defaultGlossaryExportContentOptions,
    outputFolder: "C:\\exports",
    baseFileName: "ジャン"
  };

  it("plans a single entry → one .html next to its image asset folder", () => {
    expect(planGlossaryExport(base)).toEqual({
      ok: true,
      plan: {
        entryId,
        format: "html",
        content: defaultGlossaryExportContentOptions,
        outputFilePath: "C:\\exports\\ジャン.html",
        fileName: "ジャン.html",
        imageAssetFolderName: "ジャン.assets"
      }
    });
  });

  it("requires an output folder and a valid file name", () => {
    expect(planGlossaryExport({ ...base, outputFolder: "" })).toEqual({
      ok: false,
      error: "missingOutputFolder"
    });
    expect(planGlossaryExport({ ...base, baseFileName: "" })).toEqual({
      ok: false,
      error: "empty"
    });
    expect(planGlossaryExport({ ...base, baseFileName: "a/b" })).toEqual({
      ok: false,
      error: "invalidCharacter"
    });
  });

  it("selected / all targets are modelled but not supported yet", () => {
    expect(
      planGlossaryExport({ ...base, target: { kind: "selected", entryIds: [entryId] } })
    ).toEqual({ ok: false, error: "unsupportedTarget" });
    expect(planGlossaryExport({ ...base, target: { kind: "all" } })).toEqual({
      ok: false,
      error: "unsupportedTarget"
    });
  });

  it("sanitizes the default file name", () => {
    expect(defaultGlossaryExportBaseFileName("A/B:C?")).toBe("A_B_C_");
    expect(defaultGlossaryExportBaseFileName("   ")).toBe("glossary");
  });
});

describe("occurrence counts (#574 Slice 6)", () => {
  const documents: ProjectDocument[] = [
    { relativePath: "a.md", name: "a.md" },
    { relativePath: "b.md", name: "b.md" },
    { relativePath: "broken.md", name: "broken.md" }
  ];

  it("counts per Atom with glossary matching (longest Atom wins), uncapped, skipping unreadable files", async () => {
    const texts: Record<string, string | null> = {
      "a.md": "ジャンとジャンヌ。ジャンヌ",
      // More than the Search pane's 100-per-file cap.
      "b.md": "ジャン、".repeat(150),
      "broken.md": null
    };
    const counts = await countGlossaryEntryOccurrences({
      entry: entry(),
      documents,
      readText: async (path) => texts[path] ?? null
    });

    expect(counts.atoms).toEqual([
      { atomId: "a1", value: "ジャン", count: 151 },
      { atomId: "a2", value: "ジャンヌ", count: 2 }
    ]);
    expect(counts.total).toBe(153);
    expect(counts.documentCount).toBe(3);
    expect(counts.skippedFileCount).toBe(1);
  });
});

describe("rendering the Description with the preview pipeline (#574 Slice 6)", () => {
  const description = [
    "> [!NOTE]",
    "> 注記",
    "",
    "数式 $x^2$",
    "",
    "```ts",
    "const a = 1;",
    "```",
    "",
    "```mermaid",
    "graph TD; A-->B",
    "```",
    "",
    "![地図](images/map.png)",
    "",
    "![外部](https://example.com/x.png)"
  ].join("\n");

  it("keeps callouts, KaTeX, highlight.js, Mermaid SVG and project-root images", async () => {
    const mermaidRender = vi.fn(async (id: string) => ({
      svg: `<svg id="${id}"><g class="node"></g></svg>`
    }));
    const rendered = await renderGlossaryDescriptionForExport(description, {
      imageAssetFolderName: "ジャン.assets",
      mermaidMessages,
      mermaidRender
    });

    expect(rendered.html).toContain('class="markdown-callout markdown-callout-note"');
    expect(rendered.html).toContain('class="katex');
    expect(rendered.usesMath).toBe(true);
    expect(rendered.html).toContain('class="hljs language-ts"');
    expect(rendered.html).toContain("hljs-keyword");
    expect(mermaidRender).toHaveBeenCalledWith(
      "pergamum-glossary-export-mermaid-0",
      "graph TD; A-->B"
    );
    expect(rendered.html).toContain(
      '<div class="markdownMermaidDiagram"><svg id="pergamum-glossary-export-mermaid-0">'
    );
    expect(rendered.html).not.toContain("markdownMermaidSource");
    // Project-root-relative image → copied into the asset folder.
    // (markdown-it percent-encodes the URL; it decodes to the copied file.)
    expect(rendered.html).toContain(
      `src="${encodeURI("ジャン.assets/images/map.png")}"`
    );
    expect(rendered.imageAssets).toEqual([
      {
        sourceProjectRelativePath: "images/map.png",
        outputRelativePath: "ジャン.assets/images/map.png"
      }
    ]);
    // External images are left as authored; never a pergamum-asset URL.
    expect(rendered.html).toContain('src="https://example.com/x.png"');
    expect(rendered.html).not.toContain("pergamum-asset:");
  });

  it("a Mermaid failure becomes the preview's static error card (not raw code only)", async () => {
    const rendered = await renderGlossaryDescriptionForExport(
      "```mermaid\nbroken\n```",
      {
        imageAssetFolderName: "x.assets",
        mermaidMessages,
        mermaidRender: async () => {
          throw new Error("parse error");
        }
      }
    );

    expect(rendered.html).toContain('class="markdownMermaidError"');
    expect(rendered.html).toContain("mermaid failed");
    expect(rendered.usesMath).toBe(false);
  });
});

describe("assembling the HTML document (#574 Slice 6)", () => {
  const description: RenderedGlossaryDescription = {
    html: "<p>本文</p>",
    imageAssets: [],
    usesMath: false
  };
  const occurrences = {
    atoms: [
      { atomId: "a1", value: "ジャン", count: 12 },
      { atomId: "a2", value: "ジャンヌ", count: 3 }
    ],
    total: 15,
    documentCount: 2,
    skippedFileCount: 0
  };

  it("is a complete document: title, info, occurrence table, rendered Description", () => {
    const html = buildGlossaryEntryExportHtml({
      entry: entry(),
      content: defaultGlossaryExportContentOptions,
      occurrences,
      description,
      labels,
      lang: "ja",
      katexCss: null
    });

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain("<title>ジャン</title>");
    expect(html).toContain('<article class="glossary-export">');
    expect(html).toContain("<h1>ジャン</h1>");
    expect(html).toContain('<section class="glossary-export__info">');
    expect(html).toContain(
      '<span class="glossary-export__tag" style="background-color: #1f77b4; color: #ffffff;">人物</span>'
    );
    expect(html).toContain('<section class="glossary-export__occurrences">');
    expect(html).toContain(
      '<tr><td>ジャン</td><td class="glossary-export__count">12</td></tr>'
    );
    expect(html).toContain('<td class="glossary-export__count">15</td>');
    expect(html).not.toContain("文書 2 件");
    expect(html).not.toContain("プロジェクト内の文書");
    expect(html).toContain('<section class="glossary-export__description">');
    expect(html).toContain("<p>本文</p>");
    expect(html).toContain(".markdown-callout");
    expect(html).toContain(".hljs-keyword");
    expect(html).not.toContain("<script");
  });

  it("escapes user-authored text and ignores non-hex tag colors", () => {
    const hostile = entry({
      atoms: [
        {
          id: "a1",
          entryId,
          sortOrder: 0,
          value: '<script>alert("x")</script>',
          matchFlags: 0,
          createdAt: "",
          updatedAt: ""
        }
      ],
      tags: [
        {
          ...entry().tags[0],
          label: "<b>tag</b>",
          backgroundRgb: "red; background-image: url(x)"
        }
      ]
    });
    const html = buildGlossaryEntryExportHtml({
      entry: hostile,
      content: defaultGlossaryExportContentOptions,
      occurrences: null,
      description,
      labels,
      lang: "ja",
      katexCss: null
    });

    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;alert(\"x\")&lt;/script&gt;");
    expect(html).toContain('<span class="glossary-export__tag">&lt;b&gt;tag&lt;/b&gt;</span>');
    expect(html).not.toContain("background-image");
  });

  it("embeds the KaTeX stylesheet only when the Description uses math", () => {
    const build = (usesMath: boolean) =>
      buildGlossaryEntryExportHtml({
        entry: entry(),
        content: defaultGlossaryExportContentOptions,
        occurrences: null,
        description: { ...description, usesMath },
        labels,
        lang: "en",
        katexCss: ".katex{font:KATEX_MARKER}"
      });

    expect(build(true)).toContain("KATEX_MARKER");
    expect(build(false)).not.toContain("KATEX_MARKER");
  });
});

describe("KaTeX stylesheet with inlined fonts (#574 Slice 6)", () => {
  it("replaces the woff2 url with a data URL and drops woff / ttf fallbacks", async () => {
    const css =
      '@font-face{font-family:KaTeX_Main;src:url(fonts/KaTeX_Main-Regular.woff2) format("woff2"),url(fonts/KaTeX_Main-Regular.woff) format("woff"),url(fonts/KaTeX_Main-Regular.ttf) format("truetype")}';
    const inlined = await inlineKatexWoff2Fonts(css, {
      "/node_modules/katex/dist/fonts/KaTeX_Main-Regular.woff2": async () =>
        "data:font/woff2;base64,AAAA"
    });

    expect(inlined).toBe(
      '@font-face{font-family:KaTeX_Main;src:url(data:font/woff2;base64,AAAA) format("woff2")}'
    );
  });

  it("reads the raw KaTeX stylesheet and inlines its woff2 fonts lazily", () => {
    const source = readFileSync(
      "src/renderer/glossaryExport/katexExportCss.ts",
      "utf8"
    );

    expect(source).toContain('import katexCss from "katex/dist/katex.min.css?raw";');
    expect(source).toContain('{ query: "?inline", import: "default" }');
  });
});

describe("running an export (#574 Slice 6)", () => {
  const plan = {
    entryId,
    format: "html" as const,
    content: defaultGlossaryExportContentOptions,
    outputFilePath: "C:\\exports\\ジャン.html",
    fileName: "ジャン.html",
    imageAssetFolderName: "ジャン.assets"
  };

  function deps(overrides: Partial<Parameters<typeof runGlossaryExport>[1]> = {}) {
    return {
      getEntry: vi.fn(async () => entry({ description: "![a](images/a.png)" })),
      countOccurrences: vi.fn(async () => ({
        atoms: [],
        total: 0,
        documentCount: 0,
        skippedFileCount: 0
      })),
      renderDescription: vi.fn(async () => ({
        html: "<p>x</p>",
        imageAssets: [
          { sourceProjectRelativePath: "images/a.png", outputRelativePath: "ジャン.assets/images/a.png" }
        ],
        usesMath: false
      })),
      loadKatexCss: vi.fn(async () => ""),
      labels: () => labels,
      lang: "ja",
      writeHtml: vi.fn(async () => ({
        ok: true as const,
        outputPath: "C:\\exports\\ジャン.html",
        warningCount: 0
      })),
      ...overrides
    };
  }

  it("writes the SAVED entry through the HTML export IPC with its images", async () => {
    const d = deps();
    const result = await runGlossaryExport(plan, d);

    expect(result).toEqual({
      ok: true,
      outputPath: "C:\\exports\\ジャン.html",
      warningCount: 0
    });
    expect(d.getEntry).toHaveBeenCalledWith(entryId);
    expect(d.renderDescription).toHaveBeenCalledWith(
      "![a](images/a.png)",
      "ジャン.assets"
    );
    expect(d.loadKatexCss).not.toHaveBeenCalled();
    expect(d.writeHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        targetPath: "C:\\exports\\ジャン.html",
        defaultFileName: "ジャン.html",
        allowOverwrite: true,
        imageAssets: [
          { sourceProjectRelativePath: "images/a.png", outputRelativePath: "ジャン.assets/images/a.png" }
        ]
      })
    );
  });

  it("a deleted entry is reported, nothing is written", async () => {
    const d = deps({ getEntry: vi.fn(async () => null) });

    expect(await runGlossaryExport(plan, d)).toEqual({
      ok: false,
      reason: "entryNotFound"
    });
    expect(d.writeHtml).not.toHaveBeenCalled();
  });

  it("loads the KaTeX stylesheet only for math", async () => {
    const d = deps({
      renderDescription: vi.fn(async () => ({
        html: '<span class="katex">x</span>',
        imageAssets: [],
        usesMath: true
      }))
    });

    await runGlossaryExport(plan, d);
    expect(d.loadKatexCss).toHaveBeenCalledTimes(1);
  });
});

describe("App glossary export wiring (#574 Slice 6)", () => {
  const appSource = readFileSync("src/renderer/App.tsx", "utf8");

  function block(start: string, end: string): string {
    const startIndex = appSource.indexOf(start);
    const endIndex = appSource.indexOf(end, startIndex + start.length);

    expect(startIndex).toBeGreaterThan(-1);
    expect(endIndex).toBeGreaterThan(startIndex);
    return appSource.slice(startIndex, endIndex);
  }

  it("the Glossary Management top-level action opens the export wizard (#583)", () => {
    expect(appSource).toContain(
      "onExportAll={handleOpenGlossaryExportWizard}"
    );
    expect(appSource).not.toContain("onExportEntry={handleExportGlossaryEntryFromManager}");
  });

  it("exports saved data, counts like Glossary Search, writes through the #523 IPC", () => {
    const exportBlock = block(
      "async function exportGlossaryEntry(",
      "async function handleDeleteGlossaryEntryFromManager("
    );

    expect(exportBlock).toContain(
      "getEntry: (entryId) => window.pergamum.glossary.getById(entryId)"
    );
    expect(exportBlock).toContain(
      "readText: createProjectSearchReadText(activeContext)"
    );
    expect(exportBlock).toContain("window.pergamum.files.exportHtmlCombined({");
    expect(exportBlock).toContain("projectRootPath: activeProject.rootPath");
    expect(exportBlock).not.toContain("openDocumentsStateRef");
    expect(exportBlock).not.toContain("logRendererDebugEvent");
  });
});

describe("runCombinedGlossaryExport (#581 Slice 2 & 3)", () => {
  const e1 = entry({ id: "e1", description: "Desc 1" });
  const e2 = entry({ id: "e2", description: "Desc 2" });

  it("exports combined HTML format using writeHtml", async () => {
    const writeHtml = vi.fn(async () => ({ ok: true as const, outputPath: "/out/glossary.html", warningCount: 0 }));
    const writePdf = vi.fn();
    const renderDescription = vi.fn(async (desc: string) => ({ html: `<p>${desc}</p>`, imageAssets: [], usesMath: false }));

    const res = await runCombinedGlossaryExport(
      {
        format: "html",
        entries: [e1, e2],
        outputFilePath: "/out/glossary.html",
        fileName: "glossary.html",
        imageAssetFolderName: "glossary.assets",
        includeToc: true,
        tocPosition: "front"
      },
      {
        renderDescription,
        loadKatexCss: vi.fn(async () => ""),
        labels: () => labels,
        lang: "ja",
        writeHtml,
        writePdf
      }
    );

    expect(res).toEqual({ ok: true, outputPath: "/out/glossary.html", warningCount: 0 });
    expect(writeHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        targetPath: "/out/glossary.html",
        defaultFileName: "glossary.html"
      })
    );
    expect(writePdf).not.toHaveBeenCalled();
  });

  it("exports combined PDF format using writePdf and passes font & page number settings", async () => {
    const writeHtml = vi.fn();
    const writePdf = vi.fn(async () => ({ ok: true as const, outputPath: "/out/glossary.pdf", warningCount: 0 }));
    const renderDescription = vi.fn(async (desc: string) => ({ html: `<p>${desc}</p>`, imageAssets: [], usesMath: false }));

    const res = await runCombinedGlossaryExport(
      {
        format: "pdf",
        entries: [e1, e2],
        outputFilePath: "/out/glossary.pdf",
        fileName: "glossary.pdf",
        imageAssetFolderName: "glossary.assets",
        includeToc: true,
        tocPosition: "back",
        pdfFontCandidates: [{ family: "Noto Serif CJK JP" }],
        pdfPageSettings: { position: "bottom-center", format: "dash" }
      },
      {
        renderDescription,
        loadKatexCss: vi.fn(async () => ""),
        labels: () => labels,
        lang: "ja",
        writeHtml,
        writePdf
      }
    );

    expect(res).toEqual({ ok: true, outputPath: "/out/glossary.pdf", warningCount: 0 });
    expect(writePdf).toHaveBeenCalledWith(
      expect.objectContaining({
        targetPath: "/out/glossary.pdf",
        defaultFileName: "glossary.pdf",
        pdfFontFamily: "Noto Serif CJK JP",
        pdfPageNumberSettings: { position: "bottom-center", format: "dash" }
      })
    );
    expect(writeHtml).not.toHaveBeenCalled();
  });
});
