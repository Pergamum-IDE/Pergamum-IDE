import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GlossaryEntry } from "../../src/shared/glossary";
import { planGlossaryDescriptionImageReferenceRewritesForImageMove } from "../../src/shared/markdownImageReferenceMoveRewrite";
import { resolveProjectLocalImageSrc } from "../../src/shared/projectLocalImageLink";
import {
  countGlossaryImageReferences,
  glossaryEntryDescriptionUpdateInput,
  rebaseGlossaryDescriptionEditorBaseline,
  rewriteGlossaryDescriptionImageReferences
} from "../../src/renderer/glossaryImageReferenceMoveUpdate";
import {
  createGlossaryDescriptionCurrentEditor,
  createNewGlossaryDescriptionCurrentEditor,
  isCurrentEditorDirty,
  updateGlossaryDescriptionEditorDraft,
  updateGlossaryDescriptionEditorText,
  type CurrentEditor,
  type GlossaryDescriptionCurrentEditor
} from "../../src/renderer/currentEditor";
import {
  glossaryEntryDraftUpdateInput,
  unassignGlossaryEntryDraftTag
} from "../../src/renderer/glossaryEntryDraft";
import { buildLineEndingBreakSet } from "../../src/renderer/editorLineEndingField";
import { analyzeLineEndings } from "../../src/renderer/lineEndingTracking";

// #574 Slice 2: glossary Description image references follow image
// Move / Rename (project-root-relative links).

const rename = [
  {
    oldProjectRelativePath: "assets/images/foo.png",
    newProjectRelativePath: "assets/images/bar.png"
  }
];
const move = [
  {
    oldProjectRelativePath: "assets/images/foo.png",
    newProjectRelativePath: "images/archive/foo.png"
  }
];

function rewrite(markdown: string, movedImages = rename): string | null {
  return (
    rewriteGlossaryDescriptionImageReferences(markdown, movedImages)
      ?.description ?? null
  );
}

const TAG_ID = "0190b6a1-1c2d-7e3f-8a4b-00000000b001";

function entry(description: string, id = "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f00a1"): GlossaryEntry {
  return {
    id,
    description,
    atoms: [
      {
        id: `${id.slice(0, -4)}a0a1`,
        entryId: id,
        sortOrder: 0,
        value: "王都",
        matchFlags: 3,
        createdAt: "2026-09-24T00:00:00.000Z",
        updatedAt: "2026-09-24T00:00:00.000Z"
      }
    ],
    tags: [
      {
        id: TAG_ID,
        label: "地名",
        description: null,
        backgroundRgb: "#ffffff",
        foregroundRgb: "#000000",
        sortOrder: 0,
        createdAt: "2026-09-24T00:00:00.000Z",
        updatedAt: "2026-09-24T00:00:00.000Z"
      }
    ],
    createdAt: "2026-09-24T00:00:00.000Z",
    updatedAt: "2026-09-24T00:00:00.000Z"
  };
}

function setDescription(editor: CurrentEditor, text: string): CurrentEditor {
  return updateGlossaryDescriptionEditorText(
    editor,
    text,
    buildLineEndingBreakSet(analyzeLineEndings(text))
  );
}

describe("glossary Description image reference rewriting (#574 Slice 2)", () => {
  it("rewrites a project-root-relative link on rename and on move", () => {
    expect(rewrite("前 ![](assets/images/foo.png) 後")).toBe(
      "前 ![](assets/images/bar.png) 後"
    );
    expect(rewrite("![](assets/images/foo.png)", move)).toBe(
      "![](images/archive/foo.png)"
    );
  });

  it("stays project-root-relative (never document-folder-relative)", () => {
    const planned = planGlossaryDescriptionImageReferenceRewritesForImageMove({
      markdown: "![](assets/images/foo.png)",
      movedImages: move
    });

    expect(planned.map((item) => item.newDestination)).toEqual([
      "images/archive/foo.png"
    ]);
    // …and resolves from the project root, like the glossary Preview.
    expect(
      resolveProjectLocalImageSrc(planned[0].newDestination, { kind: "projectRoot" })
    ).toMatchObject({ projectRelativePath: "images/archive/foo.png" });
    // A `../` link escapes the project root from the glossary base: untouched.
    expect(rewrite("![](../assets/images/foo.png)")).toBeNull();
  });

  it("keeps angle-wrapped / spaced / percent-encoded / parenthesised notation", () => {
    const spaced = [
      {
        oldProjectRelativePath: "assets/my pics/foo (1).png",
        newProjectRelativePath: "assets/my pics/bar (2).png"
      }
    ];

    expect(rewrite("![](<assets/my pics/foo (1).png>)", spaced)).toBe(
      "![](<assets/my pics/bar (2).png>)"
    );
    expect(rewrite("![](assets/my%20pics/foo%20%281%29.png)", spaced)).toBe(
      "![](assets/my%20pics/bar%20%282%29.png)"
    );
  });

  it("leaves external URLs, other images and non-image links alone", () => {
    const text = [
      "![](https://example.com/assets/images/foo.png)",
      "[link](assets/images/foo.png)",
      "![](assets/images/other.png)",
      "![](other/foo.png)"
    ].join("\n");

    expect(rewrite(text)).toBeNull();
  });

  it("rewrites every matching link in one Description", () => {
    const result = rewriteGlossaryDescriptionImageReferences(
      "![](assets/images/foo.png) と ![](<assets/images/foo.png>)",
      rename
    );

    expect(result).toEqual({
      description: "![](assets/images/bar.png) と ![](<assets/images/bar.png>)",
      referenceCount: 2
    });
  });

  it("returns null (= do not write the entry) when nothing changes", () => {
    expect(rewrite("画像なし")).toBeNull();
  });
});

describe("stored glossary entry update (#574 Slice 2)", () => {
  it("changes ONLY the Description, sending the stored atoms (ids) and tags back", () => {
    const stored = entry("![](assets/images/foo.png)");

    expect(
      glossaryEntryDescriptionUpdateInput(stored, "![](assets/images/bar.png)")
    ).toEqual({
      id: stored.id,
      description: "![](assets/images/bar.png)",
      atoms: [{ id: stored.atoms[0].id, value: "王都", matchFlags: 3 }],
      tagIds: [TAG_ID]
    });
  });

  it("counts entries once — an open tab by its current draft, others by the stored text", () => {
    const a = entry("![](assets/images/foo.png)", "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f00a1");
    const b = entry("画像なし", "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f00b2");
    const c = entry("![](assets/images/foo.png) ![](assets/images/foo.png)", "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f00c3");
    // Tab for B: the (unsaved) draft now references the image.
    const openB = setDescription(
      createGlossaryDescriptionCurrentEditor(b),
      "![](assets/images/foo.png)"
    ) as GlossaryDescriptionCurrentEditor;
    // A never-saved tab referencing it too.
    const newTab = setDescription(
      createNewGlossaryDescriptionCurrentEditor("新語", "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f00d4"),
      "![](assets/images/foo.png)"
    ) as GlossaryDescriptionCurrentEditor;

    const count = countGlossaryImageReferences([a, b, c], [openB, newTab], rename);

    expect(count.entryCount).toBe(4);
    expect(count.referenceCount).toBe(5);
    expect([...count.imageOldPaths]).toEqual(["assets/images/foo.png"]);
  });
});

describe("open glossary tabs (#574 Slice 2)", () => {
  it("clean tab: draft rewrite + baseline rebase ⇒ updated and still clean", () => {
    const stored = entry("![](assets/images/foo.png)");
    const tab = createGlossaryDescriptionCurrentEditor(stored);
    const rewritten = rewrite(stored.description)!;
    const saved = { ...stored, description: rewritten, updatedAt: "2026-09-24T02:00:00.000Z" };

    // Either order (draft update from the editor vs. rebase) ends clean.
    const draftFirst = rebaseGlossaryDescriptionEditorBaseline(
      setDescription(tab, rewritten),
      saved
    );
    const rebaseFirst = setDescription(
      rebaseGlossaryDescriptionEditorBaseline(tab, saved),
      rewritten
    );

    for (const result of [draftFirst, rebaseFirst]) {
      const editor = result as GlossaryDescriptionCurrentEditor;
      expect(editor.draft.description).toBe("![](assets/images/bar.png)");
      expect(editor.draft.entry.description).toBe("![](assets/images/bar.png)");
      expect(isCurrentEditorDirty(editor)).toBe(false);
    }
  });

  it("dirty tab: keeps its own edits (text AND metadata), stays dirty, and Ctrl+S never reverts the link", () => {
    const stored = entry("![](assets/images/foo.png)\n旧");
    let tab: CurrentEditor = createGlossaryDescriptionCurrentEditor(stored);
    tab = setDescription(tab, "![](assets/images/foo.png)\n新しく書いた");
    tab = updateGlossaryDescriptionEditorDraft(tab, (draft) =>
      unassignGlossaryEntryDraftTag(draft, TAG_ID)
    );

    // 1. the draft is rewritten in place (only the destination changes)…
    const draftRewritten = rewrite(
      (tab as GlossaryDescriptionCurrentEditor).draft.description
    )!;
    tab = setDescription(tab, draftRewritten);
    // 2. …the stored Description is updated, the BASELINE rebased.
    const saved = { ...stored, description: rewrite(stored.description)! };
    tab = rebaseGlossaryDescriptionEditorBaseline(tab, saved);

    const editor = tab as GlossaryDescriptionCurrentEditor;
    expect(editor.draft.description).toBe(
      "![](assets/images/bar.png)\n新しく書いた"
    );
    expect(editor.draft.tagIds).toEqual([]);
    expect(isCurrentEditorDirty(editor)).toBe(true);
    // Ctrl+S sends the NEW link, with the user's own edits.
    expect(glossaryEntryDraftUpdateInput(editor.draft)).toMatchObject({
      description: "![](assets/images/bar.png)\n新しく書いた",
      tagIds: []
    });
  });

  it("rebase ignores another entry's tab or a Markdown editor", () => {
    const tab = createGlossaryDescriptionCurrentEditor(entry("x"));
    const other = entry("y", "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f00e5");

    expect(rebaseGlossaryDescriptionEditorBaseline(tab, other)).toBe(tab);
  });
});

describe("App glossary image reference wiring (#574 Slice 2)", () => {
  const appSource = readFileSync("src/renderer/App.tsx", "utf8");

  function block(start: string, end: string): string {
    const startIndex = appSource.indexOf(start);
    const endIndex = appSource.indexOf(end, startIndex + start.length);

    expect(startIndex).toBeGreaterThan(-1);
    expect(endIndex).toBeGreaterThan(startIndex);
    return appSource.slice(startIndex, endIndex);
  }

  it("counts glossary references while planning, and stages the moves only on 'update'", () => {
    const prepare = block(
      "async function handlePrepareImageReferenceMoves(",
      "function confirmImageReferenceMoveUpdate("
    );

    expect(prepare).toContain("countGlossaryImageReferences(");
    expect(prepare).toContain("await window.pergamum.glossary.list()");
    expect(prepare).toContain(
      "if (batch.plans.length === 0 && glossaryCount.entryCount === 0) {"
    );
    expect(prepare).toContain(
      "glossaryCount.entryCount > 0 ? effectiveMoves : []"
    );
  });

  it("rewrites an open tab's draft BEFORE touching the stored entry, and skips the entry if that fails", () => {
    const apply = block(
      "async function applyGlossaryImageReferenceMoveUpdates(",
      "async function applyImageLinkRewritesToProjectDocument("
    );
    const tabIndex = apply.indexOf(
      "applyGlossaryTabImageReferenceRewrites(tabEditorId, movedImages)"
    );
    const dbIndex = apply.indexOf("await window.pergamum.glossary.update(");

    expect(tabIndex).toBeGreaterThan(-1);
    expect(dbIndex).toBeGreaterThan(tabIndex);
    expect(apply).toContain(
      'if (tabOutcome === "failed") {\n        failedNames.push(name);\n        continue;\n      }'
    );
    expect(apply).toContain(
      "rebaseGlossaryDescriptionEditorBaseline(editor, savedEntry)"
    );
    // Only entries whose Description actually changes are written.
    expect(apply).toContain("if (!rewritten) {\n        continue;\n      }");
  });

  it("updates open tabs through the editor / cached EditorState (never a blind DB copy)", () => {
    const tabApply = block(
      "function applyGlossaryTabImageReferenceRewrites(",
      "async function applyGlossaryImageReferenceMoveUpdates("
    );

    expect(tabApply).toContain("applyReplaceInBufferChanges(");
    expect(tabApply).toContain("applyChangesToCachedMarkdownEditorDocumentState(");
    expect(tabApply).toContain("updateGlossaryDescriptionEditorText(editor, nextText, nextBreaks)");
    expect(tabApply).not.toContain("window.pergamum.glossary");
  });

  it("applies glossary updates only for images that completed their move", () => {
    const applyMoves = block(
      "function handleApplyMoveImageRewrites(",
      "// ------------------------------------------------------------------"
    );

    expect(applyMoves).toContain("c2Pending?.glossaryMovedImages ?? []");
    expect(applyMoves).toContain("completedMoveKeys.has(");
    expect(applyMoves).toContain(
      "await applyGlossaryImageReferenceMoveUpdates(glossaryMovedImages)"
    );
  });
});
