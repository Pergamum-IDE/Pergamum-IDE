import { describe, expect, it } from "vitest";
import { buildCommandContextSnapshot } from "../../src/renderer/commandContextSnapshot";

const baseInput = {
  projectIsOpen: true,
  projectAccessReadWrite: true,
  projectAccessReadOnly: false,
  editorHasDocument: true,
  editorIsDirty: false,
  editorKindMarkdown: true,
  editorDocumentProjectOwned: true,
  editorDocumentProjectFile: true,
  activeEditorSaveBlockedByReadOnlyProjectRootForUi: false,
  occurrenceTrackingActive: false,
  recoveryOwner: false,
  recoveryHasRecoverableCandidates: false
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
      "editor.document.projectOwned": true,
      "editor.document.projectFile": true,
      "activeEditor.saveBlockedByReadOnlyProjectRootForUi": false,
      "glossary.occurrences.tracking.active": false,
      "recovery.owner": false,
      "recovery.hasRecoverableCandidates": false
    });
  });

  it("copies recoveryHasRecoverableCandidates into recovery.hasRecoverableCandidates", () => {
    expect(
      buildCommandContextSnapshot({
        ...baseInput,
        recoveryOwner: true,
        recoveryHasRecoverableCandidates: true
      })["recovery.hasRecoverableCandidates"]
    ).toBe(true);
  });

  it("maps editorDocumentProjectFile into editor.document.projectFile (#318)", () => {
    expect(
      buildCommandContextSnapshot({
        ...baseInput,
        editorDocumentProjectFile: false
      })["editor.document.projectFile"]
    ).toBe(false);
    expect(
      buildCommandContextSnapshot({
        ...baseInput,
        editorDocumentProjectFile: true
      })["editor.document.projectFile"]
    ).toBe(true);
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

  it("allows no Markdown editor to be active", () => {
    expect(
      buildCommandContextSnapshot({
        ...baseInput,
        editorKindMarkdown: false
      })["editor.kind.markdown"]
    ).toBe(false);
  });
});
