import { describe, expect, it } from "vitest";
import type { GlossaryEntry } from "../../src/shared/glossary";
import {
  createGlossaryDescriptionEditorId,
  createProjectDocumentEditorId,
  createUntitledEditorId
} from "../../src/shared/editorId";
import {
  createUntitledDocument,
  updateCurrentDocumentContent
} from "../../src/renderer/currentDocument";
import { analyzeLineEndings } from "../../src/renderer/lineEndingTracking";
import { buildLineEndingBreakSet } from "../../src/renderer/editorLineEndingField";
import {
  createGlossaryDescriptionCurrentEditor,
  createMarkdownCurrentEditor
} from "../../src/renderer/currentEditor";
import type { OpenDocumentsState } from "../../src/renderer/openDocuments";
import {
  getActiveFindDocumentState,
  setActiveFindDocumentState,
  DEFAULT_ACTIVE_FIND_DOCUMENT_STATE
} from "../../src/renderer/find/activeFindSessionStore";

const ts = "2026-09-26T00:00:00.000Z";

function makeEntry(id: string, values: string[], description = ""): GlossaryEntry {
  return {
    id,
    description,
    atoms: values.map((value, index) => ({
      id: `${id}-atom-${index}`,
      entryId: id,
      sortOrder: index,
      value,
      matchFlags: 0,
      createdAt: ts,
      updatedAt: ts
    })),
    tags: [],
    createdAt: ts,
    updatedAt: ts
  };
}

describe("#585 Active Editor Glossary Occurrences & Surface Scoping", () => {
  it("retains tab-local query/replace/options state per documentKey across surface switches", () => {
    const docKey1 = "projectDocument:chapter1.md";
    const docKey2 = "glossaryDescription:018f4b8c-7a2b-7c3d-8e4f-100000000001";

    setActiveFindDocumentState(docKey1, {
      ...DEFAULT_ACTIVE_FIND_DOCUMENT_STATE,
      query: "王都",
      replaceText: "帝都"
    });

    setActiveFindDocumentState(docKey2, {
      ...DEFAULT_ACTIVE_FIND_DOCUMENT_STATE,
      query: "魔法",
      replaceText: "魔術"
    });

    expect(getActiveFindDocumentState(docKey1).query).toBe("王都");
    expect(getActiveFindDocumentState(docKey1).replaceText).toBe("帝都");
    expect(getActiveFindDocumentState(docKey2).query).toBe("魔法");
    expect(getActiveFindDocumentState(docKey2).replaceText).toBe("魔術");
  });

  it("identifies Markdown and Glossary Description active surfaces correctly", () => {
    const entry = makeEntry("entry-1", ["騎士"], "近衛騎士団所属");
    const descEditor = createGlossaryDescriptionCurrentEditor(entry);
    descEditor.draft.description = "近衛騎士団所属の未保存編集メモ";

    expect(descEditor.draft.description).toBe("近衛騎士団所属の未保存編集メモ");

    const markdownDoc = updateCurrentDocumentContent(
      createUntitledDocument(),
      "騎士が一人立ちつくす。",
      buildLineEndingBreakSet(analyzeLineEndings("騎士が一人立ちつくす。"))
    );
    const markdownEditor = createMarkdownCurrentEditor(markdownDoc);
    expect(markdownEditor.document.content).toBe("騎士が一人立ちつくす。");
  });
});
