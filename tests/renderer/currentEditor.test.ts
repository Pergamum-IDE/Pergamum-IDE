import { describe, expect, it } from "vitest";
import type { GlossaryEntry } from "../../src/shared/glossary";
import { createGlossaryEntryEditorId } from "../../src/shared/editorId";
import { createFileDocument } from "../../src/renderer/currentDocument";
import {
  createGlossaryEntryCurrentEditor,
  createMarkdownCurrentEditor,
  currentEditorGlossaryEntryId,
  currentEditorTitle,
  editorIdForCurrentEditor,
  isCurrentEditorDirty,
  type GlossaryEntryCurrentEditor
} from "../../src/renderer/currentEditor";
import { updateGlossaryEntryDraftDescription } from "../../src/renderer/glossaryEntryDraft";

const projectContext = { rootPath: "C:\\Novel" };

const ts = "2026-01-01T00:00:00.000Z";
const entry: GlossaryEntry = {
  id: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
  description: "王国の首都",
  createdAt: ts,
  updatedAt: ts,
  atoms: [
    {
      id: "018f4b8c-7a2b-7c3d-8e4f-223456789abc",
      entryId: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
      sortOrder: 0,
      value: "王都",
      matchFlags: 0,
      createdAt: ts,
      updatedAt: ts
    }
  ],
  tags: []
};

describe("CurrentEditor for glossary entries", () => {
  it("starts clean when opened from a resolved GlossaryEntry", () => {
    const editor = createGlossaryEntryCurrentEditor(entry);

    expect(isCurrentEditorDirty(editor)).toBe(false);
  });

  it("is dirty after the draft's description changes from the saved snapshot", () => {
    const editor: GlossaryEntryCurrentEditor = {
      kind: "glossaryEntry",
      draft: updateGlossaryEntryDraftDescription(
        createGlossaryEntryCurrentEditor(entry).draft,
        "変更後の説明"
      )
    };

    expect(isCurrentEditorDirty(editor)).toBe(true);
  });

  it("keeps the representative atom value as the title while the description is edited", () => {
    const editor: GlossaryEntryCurrentEditor = {
      kind: "glossaryEntry",
      draft: updateGlossaryEntryDraftDescription(
        createGlossaryEntryCurrentEditor(entry).draft,
        "変更後の説明"
      )
    };

    expect(currentEditorTitle(editor)).toBe("王都");
  });

  it("derives its EditorId and highlighted entry id from the draft's saved entry", () => {
    const editor = createGlossaryEntryCurrentEditor(entry);

    expect(currentEditorGlossaryEntryId(editor)).toBe(entry.id);
    expect(
      editorIdForCurrentEditor(editor, projectContext)
    ).toEqual(createGlossaryEntryEditorId(entry.id, projectContext));
  });

  it("keeps Markdown dirty behavior unchanged", () => {
    const document = createFileDocument({
      path: "C:\\Novel\\chapter.md",
      content: "saved"
    });

    expect(isCurrentEditorDirty(createMarkdownCurrentEditor(document))).toBe(
      false
    );
    expect(
      isCurrentEditorDirty(
        createMarkdownCurrentEditor({ ...document, content: "changed" })
      )
    ).toBe(true);
  });
});
