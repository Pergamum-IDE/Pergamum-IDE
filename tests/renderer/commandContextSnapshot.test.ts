import { describe, expect, it } from "vitest";
import {
  ConflictingEditorKindError,
  buildCommandContextSnapshot
} from "../../src/renderer/commandContextSnapshot";

const baseInput = {
  projectIsOpen: true,
  projectAccessReadWrite: true,
  projectAccessReadOnly: false,
  editorHasDocument: true,
  editorIsDirty: false,
  editorKindMarkdown: true,
  editorKindGlossary: false,
  editorDocumentProjectOwned: true,
  activeEditorSaveBlockedByReadOnlyProjectRootForUi: false,
  occurrenceTrackingActive: false
};

describe("buildCommandContextSnapshot", () => {
  it("copies each input into the matching context key", () => {
    expect(buildCommandContextSnapshot(baseInput)).toEqual({
      "project.isOpen": true,
      "project.access.readWrite": true,
      "project.access.readOnly": false,
      "editor.hasDocument": true,
      "editor.isDirty": false,
      "editor.kind.markdown": true,
      "editor.kind.glossary": false,
      "editor.document.projectOwned": true,
      "activeEditor.saveBlockedByReadOnlyProjectRootForUi": false,
      "glossary.occurrences.tracking.active": false
    });
  });

  it("returns a frozen (semantically immutable) snapshot", () => {
    const snapshot = buildCommandContextSnapshot(baseInput);

    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it("does not store references to mutable input objects, only booleans", () => {
    const snapshot = buildCommandContextSnapshot(baseInput);

    for (const value of Object.values(snapshot)) {
      expect(typeof value).toBe("boolean");
    }
  });

  it("throws when editor.kind.markdown and editor.kind.glossary are both true", () => {
    expect(() =>
      buildCommandContextSnapshot({
        ...baseInput,
        editorKindMarkdown: true,
        editorKindGlossary: true
      })
    ).toThrow(ConflictingEditorKindError);
  });

  it("allows neither editor kind to be true", () => {
    expect(() =>
      buildCommandContextSnapshot({
        ...baseInput,
        editorKindMarkdown: false,
        editorKindGlossary: false
      })
    ).not.toThrow();
  });
});
