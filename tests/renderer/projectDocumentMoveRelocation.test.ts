import { describe, expect, it } from "vitest";
import type { PergamumProject } from "../../src/shared/api";
import {
  createProjectDocumentEditorId,
  editorIdEquals,
  type ActiveProjectContext
} from "../../src/shared/editorId";
import { createProjectDocument } from "../../src/renderer/currentDocument";
import {
  createOpenDocumentsStateWithDocument,
  findOpenDocument,
  documentTabs
} from "../../src/renderer/openDocuments";
import {
  isSameProjectInstance,
  planProjectDocumentMoveRelocation
} from "../../src/renderer/projectDocumentMoveRelocation";

const context: ActiveProjectContext = { rootPath: "C:\\Novel" };

const projectA: PergamumProject = {
  rootPath: "C:\\Novel",
  activeProjectFilePath: "C:\\Novel\\A.pergamum",
  accessMode: { kind: "readWrite" },
  name: "Novel A",
  config: null,
  documents: [{ relativePath: "a.md", name: "a.md" }]
};

// Same root, DIFFERENT `.pergamum` file — a distinct open instance.
const projectASibling: PergamumProject = {
  ...projectA,
  activeProjectFilePath: "C:\\Novel\\B.pergamum",
  name: "Novel B"
};

// Different root entirely.
const projectB: PergamumProject = {
  ...projectA,
  rootPath: "C:\\OtherNovel",
  activeProjectFilePath: "C:\\OtherNovel\\Other.pergamum",
  name: "Other"
};

const recoveryKeyForRelativePath = (relativePath: string): string | null =>
  `key:${relativePath}`;

function openStateWith(relativePath: string) {
  return createOpenDocumentsStateWithDocument(
    createProjectDocument({ relativePath, name: relativePath }, "content"),
    context
  );
}

describe("isSameProjectInstance (#338 blocker)", () => {
  it("is true only when rootPath AND activeProjectFilePath match", () => {
    expect(isSameProjectInstance(projectA, { ...projectA })).toBe(true);
  });

  it("is false for another `.pergamum` file under the same root", () => {
    expect(isSameProjectInstance(projectA, projectASibling)).toBe(false);
  });

  it("is false for a different root", () => {
    expect(isSameProjectInstance(projectA, projectB)).toBe(false);
  });
});

describe("planProjectDocumentMoveRelocation — same project instance (#338)", () => {
  it("relocates the open editor identity and reports the Recovery re-key", () => {
    const plan = planProjectDocumentMoveRelocation({
      projectSnapshot: projectA,
      currentProject: { ...projectA },
      relocations: [
        { oldRelativePath: "a.md", newRelativePath: "Drafts/a.md" }
      ],
      openDocumentsState: openStateWith("a.md"),
      context,
      recoveryKeyForRelativePath
    });

    expect(plan).not.toBeNull();
    expect(plan!.openDocumentsChanged).toBe(true);

    const newId = createProjectDocumentEditorId("Drafts/a.md", context);
    const oldId = createProjectDocumentEditorId("a.md", context);
    expect(findOpenDocument(plan!.openDocumentsState, newId)).not.toBeNull();
    expect(findOpenDocument(plan!.openDocumentsState, oldId)).toBeNull();
    expect(documentTabs(plan!.openDocumentsState)[0].title).toBe("a.md");

    expect(
      plan!.invalidatedEditorIds.some((id) => editorIdEquals(id, oldId))
    ).toBe(true);
    expect(plan!.recoveryKeyRelocations).toEqual([
      { oldKey: "key:a.md", newKey: "key:Drafts/a.md" }
    ]);
  });

  it("no-ops the open-editor update for a relocation whose old path is not open", () => {
    const plan = planProjectDocumentMoveRelocation({
      projectSnapshot: projectA,
      currentProject: { ...projectA },
      relocations: [
        { oldRelativePath: "not-open.md", newRelativePath: "Drafts/not-open.md" }
      ],
      openDocumentsState: openStateWith("a.md"),
      context,
      recoveryKeyForRelativePath
    });

    expect(plan).not.toBeNull();
    expect(plan!.openDocumentsChanged).toBe(false);
    expect(plan!.invalidatedEditorIds).toEqual([]);
    // The Recovery bookkeeping re-key still runs regardless of open state.
    expect(plan!.recoveryKeyRelocations).toEqual([
      { oldKey: "key:not-open.md", newKey: "key:Drafts/not-open.md" }
    ]);
  });

  it("relocates only the moved-and-open entries in a mixed batch", () => {
    const plan = planProjectDocumentMoveRelocation({
      projectSnapshot: projectA,
      currentProject: { ...projectA },
      relocations: [
        { oldRelativePath: "a.md", newRelativePath: "Drafts/a.md" },
        { oldRelativePath: "b.md", newRelativePath: "Drafts/b.md" }
      ],
      openDocumentsState: openStateWith("a.md"),
      context,
      recoveryKeyForRelativePath
    });

    expect(plan).not.toBeNull();
    expect(
      findOpenDocument(
        plan!.openDocumentsState,
        createProjectDocumentEditorId("Drafts/a.md", context)
      )
    ).not.toBeNull();
    expect(
      findOpenDocument(
        plan!.openDocumentsState,
        createProjectDocumentEditorId("Drafts/b.md", context)
      )
    ).toBeNull();
  });
});

describe("planProjectDocumentMoveRelocation — stale project switch (#338 blocker)", () => {
  const relocations = [
    { oldRelativePath: "a.md", newRelativePath: "Drafts/a.md" }
  ];

  it("returns null when the project was CLOSED during the Move IPC", () => {
    const plan = planProjectDocumentMoveRelocation({
      projectSnapshot: projectA,
      currentProject: null,
      relocations,
      openDocumentsState: openStateWith("a.md"),
      context,
      recoveryKeyForRelativePath
    });

    expect(plan).toBeNull();
  });

  it("returns null when the project SWITCHED to another `.pergamum` under the same root", () => {
    const plan = planProjectDocumentMoveRelocation({
      projectSnapshot: projectA,
      currentProject: projectASibling,
      relocations,
      openDocumentsState: openStateWith("a.md"),
      context,
      recoveryKeyForRelativePath
    });

    expect(plan).toBeNull();
  });

  it("returns null when the project SWITCHED to a different root", () => {
    const plan = planProjectDocumentMoveRelocation({
      projectSnapshot: projectA,
      currentProject: projectB,
      relocations,
      openDocumentsState: openStateWith("a.md"),
      context,
      recoveryKeyForRelativePath
    });

    expect(plan).toBeNull();
  });

  it("returns null for an empty relocation list", () => {
    const plan = planProjectDocumentMoveRelocation({
      projectSnapshot: projectA,
      currentProject: { ...projectA },
      relocations: [],
      openDocumentsState: openStateWith("a.md"),
      context,
      recoveryKeyForRelativePath
    });

    expect(plan).toBeNull();
  });
});
