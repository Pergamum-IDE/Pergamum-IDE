import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  createGlossaryEntryEditorId,
  createProjectDocumentEditorId,
  createUntitledEditorId,
  editorIdEquals,
  type EditorId
} from "../../src/shared/editorId";
import {
  EditorNavigation,
  type EditorResolveResult
} from "../../src/renderer/editorNavigation";

const editorA = createUntitledEditorId(1);
const editorB = createUntitledEditorId(2);
const editorC = createUntitledEditorId(3);
const editorD = createUntitledEditorId(4);
const projectContext = {
  rootPath: "C:\\Novel"
};
const markdownEditor = createProjectDocumentEditorId(
  "chapter-01.md",
  projectContext
);
const glossaryEditor = createGlossaryEntryEditorId(
  "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
  projectContext
);

type ResolvedEditor = {
  readonly id: EditorId;
  readonly label: string;
};

function editorLabel(editorId: EditorId): string {
  switch (editorId.kind) {
    case "untitled":
      return `untitled-${editorId.sessionId}`;
    case "projectDocument":
      return `projectDocument-${editorId.relativePath}`;
    case "glossaryEntry":
      return `glossaryEntry-${editorId.entryId}`;
    case "file":
      return `file-${editorId.path}`;
  }
}

function createResolvedEditor(editorId: EditorId): ResolvedEditor {
  return {
    id: editorId,
    label: editorLabel(editorId)
  };
}

function editorKey(editorId: EditorId): string {
  return editorLabel(editorId);
}

function createResolveResult(
  editorId: EditorId,
  missingEditors: Set<string>
): EditorResolveResult<ResolvedEditor> {
  return missingEditors.has(editorKey(editorId))
    ? { kind: "notFound" }
    : {
        kind: "resolved",
        editor: createResolvedEditor(editorId)
      };
}

function expectAppliedEditors(
  appliedEditors: readonly ResolvedEditor[],
  expectedEditorIds: readonly EditorId[]
): void {
  expect(appliedEditors.length).toBe(expectedEditorIds.length);

  for (const [index, expectedEditorId] of expectedEditorIds.entries()) {
    expect(editorIdEquals(appliedEditors[index].id, expectedEditorId)).toBe(
      true
    );
  }
}

function deferred<TResult>(): {
  promise: Promise<TResult>;
  resolve: (value: TResult) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: TResult) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<TResult>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    resolve,
    reject
  };
}

describe("EditorNavigation", () => {
  it("routes existing major editor transitions through the shared openEditor path", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");

    expect(source).toMatch(
      /function activateDocument\(documentId: EditorId\): void \{\s+if \(isLifecycleCommitBarrierActiveNow\(\)\) \{\s+return;\s+\}\s+openEditorFromUi\(documentId\);/
    );
    // openFile() and activateProjectDocument() route through openDocument()
    // / openEditorFromExplicitActivation() via the shared #152 instrumented-
    // open wrapper rather than awaiting them directly, but both still call
    // through to the same underlying functions.
    expect(source).toMatch(/\(\) =>\s*openDocument\(openedDocument\)/);
    expect(source).toContain(
      "() => openEditorFromExplicitActivation(documentId)"
    );
    expect(source).toMatch(
      /function openEditorFromExplicitActivation\([\s\S]*?return openEditor\(editorId, options\);\s*\}/
    );
    expect(source).toMatch(
      /function openEditor\([\s\S]*?return editorNavigation\.openEditor\(editorId, options\);\s*\}/
    );
  });

  it("records normal transitions in navigation history", async () => {
    const appliedEditors: ResolvedEditor[] = [];
    const navigation = new EditorNavigation<ResolvedEditor>({
      resolveEditor: async (editorId) =>
        createResolveResult(editorId, new Set()),
      applyEditor: (_editorId, editor) => {
        appliedEditors.push(editor);
      }
    });

    await navigation.openEditor(editorA);
    await navigation.openEditor(editorB);

    expect(navigation.snapshot().currentIndex).toBe(1);
    expectAppliedEditors(appliedEditors, [editorA, editorB]);
  });

  it("navigates Back and Forward without pushing new history entries", async () => {
    const appliedEditors: ResolvedEditor[] = [];
    const navigation = new EditorNavigation<ResolvedEditor>({
      resolveEditor: async (editorId) =>
        createResolveResult(editorId, new Set()),
      applyEditor: (_editorId, editor) => {
        appliedEditors.push(editor);
      }
    });

    await navigation.openEditor(editorA);
    await navigation.openEditor(editorB);
    await navigation.navigateBack();
    const afterBack = navigation.snapshot();
    await navigation.navigateForward();
    const afterForward = navigation.snapshot();

    expect(afterBack.entries.length).toBe(2);
    expect(afterBack.currentIndex).toBe(0);
    expect(afterForward.entries.length).toBe(2);
    expect(afterForward.currentIndex).toBe(1);
    expectAppliedEditors(appliedEditors, [editorA, editorB, editorA, editorB]);
  });

  it("navigates across Markdown and Glossary EditorIds without type-specific history branches", async () => {
    const appliedEditors: ResolvedEditor[] = [];
    const navigation = new EditorNavigation<ResolvedEditor>({
      resolveEditor: async (editorId) =>
        createResolveResult(editorId, new Set()),
      applyEditor: (_editorId, editor) => {
        appliedEditors.push(editor);
      }
    });

    await navigation.openEditor(markdownEditor);
    await navigation.openEditor(glossaryEditor);
    await expect(navigation.navigateBack()).resolves.toBe(true);
    await expect(navigation.navigateForward()).resolves.toBe(true);

    expectAppliedEditors(appliedEditors, [
      markdownEditor,
      glossaryEditor,
      markdownEditor,
      glossaryEditor
    ]);
  });

  it("removes an EditorId from history via invalidateEditor without resolving it", async () => {
    const navigation = new EditorNavigation<ResolvedEditor>({
      resolveEditor: async (editorId) =>
        createResolveResult(editorId, new Set()),
      applyEditor: () => undefined
    });

    await navigation.openEditor(editorA);
    await navigation.openEditor(editorB);
    await navigation.openEditor(editorC);

    navigation.invalidateEditor(editorB);

    const snapshot = navigation.snapshot();
    expect(snapshot.entries.length).toBe(2);
    expect(
      snapshot.entries.some((editorId) => editorIdEquals(editorId, editorB))
    ).toBe(false);
    expect(editorIdEquals(snapshot.entries[0], editorA)).toBe(true);
    expect(editorIdEquals(snapshot.entries[1], editorC)).toBe(true);
  });

  it("skips a Back navigation target after it was invalidated ahead of time", async () => {
    const appliedEditors: ResolvedEditor[] = [];
    const navigation = new EditorNavigation<ResolvedEditor>({
      resolveEditor: async (editorId) =>
        createResolveResult(editorId, new Set()),
      applyEditor: (_editorId, editor) => {
        appliedEditors.push(editor);
      }
    });

    await navigation.openEditor(editorA);
    await navigation.openEditor(editorB);
    await navigation.openEditor(editorC);

    navigation.invalidateEditor(editorB);

    await expect(navigation.navigateBack()).resolves.toBe(true);
    expectAppliedEditors(appliedEditors, [editorA, editorB, editorC, editorA]);
  });

  it("discards Forward history after normal navigation following Back", async () => {
    const navigation = new EditorNavigation<ResolvedEditor>({
      resolveEditor: async (editorId) =>
        createResolveResult(editorId, new Set()),
      applyEditor: () => undefined
    });

    await navigation.openEditor(editorA);
    await navigation.openEditor(editorB);
    await navigation.openEditor(editorC);
    await navigation.navigateBack();
    await navigation.openEditor(editorD);

    const snapshot = navigation.snapshot();
    expect(snapshot.currentIndex).toBe(2);
    expect(snapshot.entries.length).toBe(3);
    expect(editorIdEquals(snapshot.entries[2], editorD)).toBe(true);
    expect(
      snapshot.entries.some((editorId) => editorIdEquals(editorId, editorC))
    ).toBe(false);
  });

  it("skips an unresolvable history entry during Back", async () => {
    const missingEditors = new Set([editorKey(editorC)]);
    const appliedEditors: ResolvedEditor[] = [];
    const navigation = new EditorNavigation<ResolvedEditor>({
      resolveEditor: async (editorId) =>
        createResolveResult(editorId, missingEditors),
      applyEditor: (_editorId, editor) => {
        appliedEditors.push(editor);
      }
    });

    await navigation.openEditor(editorA, {
      resolvedEditor: createResolvedEditor(editorA)
    });
    await navigation.openEditor(editorB, {
      resolvedEditor: createResolvedEditor(editorB)
    });
    await navigation.openEditor(editorC, {
      resolvedEditor: createResolvedEditor(editorC)
    });
    await navigation.openEditor(editorD, {
      resolvedEditor: createResolvedEditor(editorD)
    });

    await expect(navigation.navigateBack()).resolves.toBe(true);

    const snapshot = navigation.snapshot();
    expect(snapshot.currentIndex).toBe(1);
    expect(snapshot.entries.length).toBe(3);
    expectAppliedEditors(appliedEditors, [
      editorA,
      editorB,
      editorC,
      editorD,
      editorB
    ]);
  });

  it("skips multiple consecutive unresolvable entries", async () => {
    const missingEditors = new Set([editorKey(editorB), editorKey(editorC)]);
    const appliedEditors: ResolvedEditor[] = [];
    const navigation = new EditorNavigation<ResolvedEditor>({
      resolveEditor: async (editorId) =>
        createResolveResult(editorId, missingEditors),
      applyEditor: (_editorId, editor) => {
        appliedEditors.push(editor);
      }
    });

    await navigation.openEditor(editorA, {
      resolvedEditor: createResolvedEditor(editorA)
    });
    await navigation.openEditor(editorB, {
      resolvedEditor: createResolvedEditor(editorB)
    });
    await navigation.openEditor(editorC, {
      resolvedEditor: createResolvedEditor(editorC)
    });
    await navigation.openEditor(editorD, {
      resolvedEditor: createResolvedEditor(editorD)
    });

    await expect(navigation.navigateBack()).resolves.toBe(true);

    const snapshot = navigation.snapshot();
    expect(snapshot.currentIndex).toBe(0);
    expect(snapshot.entries.length).toBe(2);
    expectAppliedEditors(appliedEditors, [
      editorA,
      editorB,
      editorC,
      editorD,
      editorA
    ]);
  });

  it("skips unresolvable entries during Forward", async () => {
    const missingEditors = new Set<string>();
    const appliedEditors: ResolvedEditor[] = [];
    const navigation = new EditorNavigation<ResolvedEditor>({
      resolveEditor: async (editorId) =>
        createResolveResult(editorId, missingEditors),
      applyEditor: (_editorId, editor) => {
        appliedEditors.push(editor);
      }
    });

    await navigation.openEditor(editorA);
    await navigation.openEditor(editorB);
    await navigation.openEditor(editorC);
    await navigation.openEditor(editorD);
    await navigation.navigateBack();
    await navigation.navigateBack();
    await navigation.navigateBack();
    missingEditors.add(editorKey(editorB));
    missingEditors.add(editorKey(editorC));

    await expect(navigation.navigateForward()).resolves.toBe(true);

    const snapshot = navigation.snapshot();
    expect(snapshot.currentIndex).toBe(1);
    expect(snapshot.entries.length).toBe(2);
    expectAppliedEditors(appliedEditors, [
      editorA,
      editorB,
      editorC,
      editorD,
      editorC,
      editorB,
      editorA,
      editorD
    ]);
  });

  it("does not invalidate temporarily unavailable history entries", async () => {
    const unavailableEditors = new Set([editorKey(editorA)]);
    const error = new Error("temporary storage unavailable");
    const navigation = new EditorNavigation<ResolvedEditor>({
      resolveEditor: async (editorId) =>
        unavailableEditors.has(editorKey(editorId))
          ? {
              kind: "unavailable",
              error
            }
          : createResolveResult(editorId, new Set()),
      applyEditor: () => undefined
    });

    await navigation.openEditor(editorA, {
      resolvedEditor: createResolvedEditor(editorA)
    });
    await navigation.openEditor(editorB);

    await expect(navigation.navigateBack()).rejects.toBe(error);

    const snapshot = navigation.snapshot();
    expect(snapshot.currentIndex).toBe(1);
    expect(snapshot.entries.length).toBe(2);
    expect(editorIdEquals(snapshot.entries[0], editorA)).toBe(true);
  });

  it("does nothing when no valid Back target exists", async () => {
    const missingEditors = new Set([editorKey(editorA), editorKey(editorB)]);
    const appliedEditors: ResolvedEditor[] = [];
    const navigation = new EditorNavigation<ResolvedEditor>({
      resolveEditor: async (editorId) =>
        createResolveResult(editorId, missingEditors),
      applyEditor: (_editorId, editor) => {
        appliedEditors.push(editor);
      }
    });

    await navigation.openEditor(editorA, {
      resolvedEditor: createResolvedEditor(editorA)
    });
    await navigation.openEditor(editorB, {
      resolvedEditor: createResolvedEditor(editorB)
    });

    await expect(navigation.navigateBack()).resolves.toBe(false);

    const snapshot = navigation.snapshot();
    expect(snapshot.currentIndex).toBe(0);
    expect(snapshot.entries.length).toBe(1);
    expectAppliedEditors(appliedEditors, [editorA, editorB]);
  });

  it("resets history when Project Context changes", async () => {
    const navigation = new EditorNavigation<ResolvedEditor>({
      resolveEditor: async (editorId) =>
        createResolveResult(editorId, new Set()),
      applyEditor: () => undefined
    });

    await navigation.openEditor(editorA);
    await navigation.openEditor(editorB);
    navigation.reset();

    expect(navigation.snapshot()).toEqual({
      entries: [],
      currentIndex: -1
    });
  });

  it("does not apply a delayed resolve result from before reset", async () => {
    const pendingResolve = deferred<EditorResolveResult<ResolvedEditor>>();
    const applyEditor = vi.fn();
    const navigation = new EditorNavigation<ResolvedEditor>({
      resolveEditor: vi.fn(() => pendingResolve.promise),
      applyEditor
    });

    const openPromise = navigation.openEditor(editorA);
    await Promise.resolve();

    navigation.reset();
    pendingResolve.resolve({
      kind: "resolved",
      editor: createResolvedEditor(editorA)
    });

    await expect(openPromise).resolves.toBe(false);
    expect(applyEditor).not.toHaveBeenCalled();
    expect(navigation.snapshot()).toEqual({
      entries: [],
      currentIndex: -1
    });
  });

  it("does not run queued operations captured before reset", async () => {
    const pendingResolve = deferred<EditorResolveResult<ResolvedEditor>>();
    const resolveEditor = vi.fn((editorId: EditorId) =>
      editorIdEquals(editorId, editorA)
        ? pendingResolve.promise
        : Promise.resolve({
            kind: "resolved" as const,
            editor: createResolvedEditor(editorId)
          })
    );
    const applyEditor = vi.fn();
    const navigation = new EditorNavigation<ResolvedEditor>({
      resolveEditor,
      applyEditor
    });

    const firstOpen = navigation.openEditor(editorA);
    const queuedOpen = navigation.openEditor(editorB);
    await Promise.resolve();

    navigation.reset();
    pendingResolve.resolve({
      kind: "resolved",
      editor: createResolvedEditor(editorA)
    });

    await expect(firstOpen).resolves.toBe(false);
    await expect(queuedOpen).resolves.toBe(false);
    expect(resolveEditor).toHaveBeenCalledTimes(1);
    expect(applyEditor).not.toHaveBeenCalled();
  });

  it("serializes navigation operations in request order", async () => {
    const appliedEditors: ResolvedEditor[] = [];
    const resolveEditor = vi.fn(
      async (editorId: EditorId): Promise<EditorResolveResult<ResolvedEditor>> =>
        createResolveResult(editorId, new Set())
    );
    const navigation = new EditorNavigation<ResolvedEditor>({
      resolveEditor,
      applyEditor: (_editorId, editor) => {
        appliedEditors.push(editor);
      }
    });

    await navigation.openEditor(editorA);
    await navigation.openEditor(editorB);

    const back = navigation.navigateBack();
    const forward = navigation.navigateForward();

    await Promise.all([back, forward]);

    expectAppliedEditors(appliedEditors, [editorA, editorB, editorA, editorB]);
    expect(navigation.snapshot().currentIndex).toBe(1);
  });
});
