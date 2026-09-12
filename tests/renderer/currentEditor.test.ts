import { describe, expect, it } from "vitest";
import {
  createFileDocument,
  createProjectDocument
} from "../../src/renderer/currentDocument";
import {
  createMarkdownCurrentEditor,
  currentEditorTitle,
  editorIdForCurrentEditor,
  isCurrentEditorDirty
} from "../../src/renderer/currentEditor";

const projectContext = { rootPath: "C:\\Novel" };

describe("CurrentEditor", () => {
  it("keeps Markdown dirty behavior unchanged", () => {
    const document = createFileDocument({
      path: "C:\\Novel\\chapter.md",
      content: "saved",
      metadata: {
        encoding: "utf8",
        lineEnding: "lf",
        byteLength: 5,
        characterLength: 5,
        hadBom: false
      }
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

  it("derives Markdown titles and EditorIds from the current document", () => {
    const doc = createProjectDocument(
      { relativePath: "chapter.md", name: "chapter.md" },
      "hello"
    );
    const editor = createMarkdownCurrentEditor(doc);

    expect(currentEditorTitle(editor)).toBe("chapter.md");
    expect(editorIdForCurrentEditor(editor, projectContext)).toMatchObject({
      kind: "projectDocument",
      relativePath: "chapter.md"
    });
  });
});
