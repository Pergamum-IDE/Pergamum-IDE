import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ResumeHub } from "../../src/renderer/ResumeHub";
import type { RecentProjectDocumentItem } from "../../src/shared/api";
import type { GlossaryEntry } from "../../src/shared/glossary";
import { jaTranslations } from "../../src/shared/i18n/ja";

function translate(key: string, values?: Record<string, string | number>): string {
  let template = (jaTranslations as Record<string, string>)[key] ?? key;
  if (values) {
    for (const [k, v] of Object.entries(values)) {
      template = template.replace(`{${k}}`, String(v));
    }
  }
  return template;
}

const mockDocuments: RecentProjectDocumentItem[] = [
  {
    relativePath: "novels/chapter-01.md",
    name: "chapter-01.md",
    preview: "彼女が箱を開けた瞬間、…",
    updatedAt: "2026-09-28 07:10",
    mtimeMs: 1000
  },
  {
    relativePath: "novels/chapter-02.md",
    name: "chapter-02.md",
    preview: "静かな朝が始まった。",
    updatedAt: "2026-09-28 06:00",
    mtimeMs: 900
  }
];

const mockGlossaryEntries: GlossaryEntry[] = [
  {
    id: "entry-1" as any,
    description: "主人公の師匠",
    atoms: [
      { id: "atom-1" as any, entryId: "entry-1" as any, value: "千年領主", matchFlags: 0, sortOrder: 0, createdAt: "", updatedAt: "" },
      { id: "atom-2" as any, entryId: "entry-1" as any, value: "古の領主", matchFlags: 0, sortOrder: 1, createdAt: "", updatedAt: "" }
    ],
    tags: [
      { id: "tag-1" as any, label: "主要人物", description: null, backgroundRgb: "#ff0000", foregroundRgb: "#ffffff", sortOrder: 0, createdAt: "", updatedAt: "" }
    ],
    createdAt: "2026-09-28T05:00:00.000Z",
    updatedAt: "2026-09-28T06:42:00.000Z"
  }
];

describe("ResumeHub Component", () => {
  it("renders recent documents and glossary entries HTML output", () => {
    const html = renderToStaticMarkup(
      React.createElement(ResumeHub, {
        recentDocuments: mockDocuments,
        recentGlossaryEntries: mockGlossaryEntries,
        translate,
        onOpenDocument: vi.fn(),
        onOpenGlossaryEntry: vi.fn()
      })
    );

    expect(html).toContain("作業再開");
    expect(html).toContain("最近更新した文書");
    expect(html).toContain("最近更新した語彙");

    expect(html).toContain("novels/chapter-01.md");
    expect(html).toContain("彼女が箱を開けた瞬間、…");
    expect(html).toContain("2026-09-28 07:10");

    expect(html).toContain("千年領主");
    expect(html).toContain("Atom 2件 / Tag 1件");
    expect(html).toContain("2026-09-28 15:42"); // formatted local date
    expect(html).toContain("開く");
  });

  it("renders empty state messages when documents and glossary entries are empty", () => {
    const html = renderToStaticMarkup(
      React.createElement(ResumeHub, {
        recentDocuments: [],
        recentGlossaryEntries: [],
        translate,
        onOpenDocument: vi.fn(),
        onOpenGlossaryEntry: vi.fn()
      })
    );

    expect(html).toContain("最近更新した文書はありません。");
    expect(html).toContain("最近更新した語彙はありません。");
  });

  it("limits items to maximum 5 entries", () => {
    const manyDocs: RecentProjectDocumentItem[] = Array.from({ length: 8 }, (_, i) => ({
      relativePath: `doc-${i + 1}.md`,
      name: `doc-${i + 1}.md`,
      preview: `preview ${i + 1}`,
      updatedAt: `2026-09-28 07:0${i}`,
      mtimeMs: 1000 - i
    }));

    const html = renderToStaticMarkup(
      React.createElement(ResumeHub, {
        recentDocuments: manyDocs,
        recentGlossaryEntries: [],
        translate,
        onOpenDocument: vi.fn(),
        onOpenGlossaryEntry: vi.fn()
      })
    );

    expect(html).toContain("doc-1.md");
    expect(html).toContain("doc-5.md");
    expect(html).not.toContain("doc-6.md");
  });
});
