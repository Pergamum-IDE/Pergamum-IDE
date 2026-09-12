import { describe, expect, it } from "vitest";
import {
  createEditorIdForPath,
  createProjectDocumentEditorId,
  createUntitledEditorId,
  deserializeEditorId,
  editorIdEquals,
  serializeEditorId,
  type ActiveProjectContext
} from "../../src/shared/editorId";

const projectContext: ActiveProjectContext = {
  rootPath: "C:\\Novel"
};
const uncProjectContext: ActiveProjectContext = {
  rootPath: "\\\\Server\\Share\\Novel"
};
const posixProjectContext: ActiveProjectContext = {
  rootPath: "/Novel"
};

describe("EditorId", () => {
  it("round-trips every EditorId kind through canonical serialization", () => {
    const editorIds = [
      createEditorIdForPath("D:\\Outside\\chapter-01.md", projectContext),
      createEditorIdForPath("C:\\Novel\\chapter-01.md", projectContext),
      createUntitledEditorId(3)
    ];

    for (const editorId of editorIds) {
      const serialized = serializeEditorId(editorId);
      const deserialized = deserializeEditorId(serialized, projectContext);

      expect(editorIdEquals(deserialized, editorId)).toBe(true);
      expect(serializeEditorId(deserialized)).toBe(serialized);
    }
  });

  it("round-trips file and untitled EditorIds without Project Context", () => {
    const editorIds = [
      createEditorIdForPath("D:\\Outside\\chapter-01.md", null),
      createUntitledEditorId(3)
    ];

    for (const editorId of editorIds) {
      expect(
        editorIdEquals(
          deserializeEditorId(serializeEditorId(editorId), null),
          editorId
        )
      ).toBe(true);
    }
  });

  it("canonicalizes a path under the active project root as projectDocument", () => {
    const editorId = createEditorIdForPath(
      "C:\\Novel\\drafts\\..\\chapter-01.md",
      projectContext
    );

    expect(editorId).toMatchObject({
      kind: "projectDocument",
      relativePath: "chapter-01.md"
    });
  });

  it("canonicalizes Windows drive project containment case-insensitively", () => {
    const editorId = createEditorIdForPath(
      "C:\\novel\\MixedCase.md",
      projectContext
    );

    expect(editorId).toMatchObject({
      kind: "projectDocument",
      relativePath: "mixedcase.md"
    });
  });

  it("treats Windows projectDocument relative path case differences as the same identity", () => {
    const upperCaseEditorId = createEditorIdForPath(
      "C:\\Novel\\Chapter-01.md",
      projectContext
    );
    const lowerCaseEditorId = createEditorIdForPath(
      "C:\\novel\\chapter-01.md",
      projectContext
    );

    expect(editorIdEquals(upperCaseEditorId, lowerCaseEditorId)).toBe(true);
    expect(upperCaseEditorId).toMatchObject({
      kind: "projectDocument",
      relativePath: "chapter-01.md"
    });
  });

  it("treats UNC projectDocument case differences as the same identity", () => {
    const upperCaseEditorId = createEditorIdForPath(
      "\\\\Server\\Share\\Novel\\Chapter-01.md",
      uncProjectContext
    );
    const lowerCaseEditorId = createEditorIdForPath(
      "\\\\server\\share\\novel\\chapter-01.md",
      uncProjectContext
    );

    expect(editorIdEquals(upperCaseEditorId, lowerCaseEditorId)).toBe(true);
    expect(upperCaseEditorId).toMatchObject({
      kind: "projectDocument",
      relativePath: "chapter-01.md"
    });
  });

  it("keeps POSIX projectDocument case differences as separate identities", () => {
    const upperCaseEditorId = createEditorIdForPath(
      "/Novel/Chapter-01.md",
      posixProjectContext
    );
    const lowerCaseEditorId = createEditorIdForPath(
      "/Novel/chapter-01.md",
      posixProjectContext
    );

    expect(editorIdEquals(upperCaseEditorId, lowerCaseEditorId)).toBe(false);
  });

  it("canonicalizes a path outside the active project root as file", () => {
    const editorId = createEditorIdForPath(
      "D:\\Outside\\.\\chapter-01.md",
      projectContext
    );

    expect(editorId).toMatchObject({
      kind: "file",
      path: "D:/Outside/chapter-01.md"
    });
  });

  it("does not treat a sibling directory as part of the active project", () => {
    const editorId = createEditorIdForPath(
      "C:\\Novel2\\chapter.md",
      projectContext
    );

    expect(editorId).toMatchObject({
      kind: "file",
      path: "C:/Novel2/chapter.md"
    });
  });

  it("treats the project root path itself as a file EditorId boundary input", () => {
    const editorId = createEditorIdForPath("C:\\Novel", projectContext);

    expect(editorId).toMatchObject({
      kind: "file",
      path: "C:/Novel"
    });
  });

  it("rejects unsupported Windows special paths", () => {
    expect(() =>
      createEditorIdForPath("\\\\?\\C:\\Novel\\chapter.md", projectContext)
    ).toThrow("Windows special paths are not supported.");
    expect(() =>
      createEditorIdForPath("\\\\.\\C:\\Novel\\chapter.md", projectContext)
    ).toThrow("Windows special paths are not supported.");
  });

  it("deserializes projectDocument through active Project Context canonicalization", () => {
    const deserialized = deserializeEditorId(
      '{"kind":"projectDocument","relativePath":"Chapter-01.md"}',
      projectContext
    );
    const factoryEditorId = createProjectDocumentEditorId(
      "chapter-01.md",
      projectContext
    );

    expect(editorIdEquals(deserialized, factoryEditorId)).toBe(true);
  });

  it("rejects project-scoped deserialization without Project Context", () => {
    expect(() =>
      deserializeEditorId(
        '{"kind":"projectDocument","relativePath":"chapter-01.md"}',
        null
      )
    ).toThrow("Active Project Context is required.");
  });

  it("rejects non-canonical serialized EditorIds", () => {
    const canonicalFile = serializeEditorId(
      createEditorIdForPath("D:\\Outside\\chapter-01.md", projectContext)
    );

    expect(() => deserializeEditorId(` ${canonicalFile}`, null)).toThrow(
      "Serialized EditorId must use canonical representation."
    );
    expect(() =>
      deserializeEditorId(
        '{"path":"D:/Outside/chapter-01.md","kind":"file"}',
        null
      )
    ).toThrow("Serialized EditorId must use canonical representation.");
    expect(() =>
      deserializeEditorId(
        '{"kind":"file","path":"D:/Outside/./chapter-01.md"}',
        null
      )
    ).toThrow("Serialized EditorId must use canonical representation.");
  });

  it("rejects unknown serialized EditorId kinds", () => {
    expect(() =>
      deserializeEditorId(
        '{"kind":"unknown","path":"D:/Outside/chapter.md"}',
        null
      )
    ).toThrow("Serialized EditorId kind is not supported.");
  });

  it("requires active Project Context for project-scoped factory inputs", () => {
    expect(() =>
      createProjectDocumentEditorId("chapter-01.md", null)
    ).toThrow("Active Project Context is required.");
  });
});
