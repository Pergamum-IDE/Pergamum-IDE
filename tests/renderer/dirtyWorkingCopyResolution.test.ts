import { describe, expect, it, vi } from "vitest";
import {
  buildLifecycleDirtyChoiceDialogOptions,
  getDirtyWorkingCopiesForLifecycle,
  lifecycleDirtyChoiceIds,
  resolveDirtyWorkingCopies as resolveDirtyWorkingCopiesImpl,
  type DirtyResolutionIntent,
  type DirtyWorkingCopyResolutionDeps,
  type DirtyWorkingCopyResolutionResult
} from "../../src/renderer/dirtyWorkingCopyResolution";
import {
  createLifecycleCommitBarrier,
  type LifecycleCommitBarrierToken
} from "../../src/renderer/lifecycleCommitBarrier";
import {
  closeOpenEditor,
  createInitialOpenDocumentsState,
  getDirtyWorkingCopies,
  openOrActivateEditor,
  openOrActivateDocument,
  updateOpenEditor,
  updateOpenDocument,
  type OpenDocumentsState
} from "../../src/renderer/openDocuments";
import {
  createFileDocument,
  createProjectDocument,
  markCurrentDocumentSaved,
  createUntitledDocument,
  updateCurrentDocumentContent
} from "../../src/renderer/currentDocument";
import { createGlossaryEntryCurrentEditor } from "../../src/renderer/currentEditor";
import {
  applyGlossaryEntryDraftSaveResult,
  markGlossaryEntryDraftSaving,
  updateGlossaryEntryDraftDescription
} from "../../src/renderer/glossaryEntryDraft";
import {
  createFileEditorIdForPath,
  createGlossaryEntryEditorId,
  createProjectDocumentEditorId,
  editorIdEquals,
  type ActiveProjectContext,
  type EditorId
} from "../../src/shared/editorId";
import { t, type Translate } from "../../src/shared/i18n";
import type { GlossaryEntry } from "../../src/shared/glossary";
import type {
  DirtyWorkingCopy,
  SaveWorkingCopyOutcome
} from "../../src/shared/api";

const translateJa: Translate = (key, values) => t("ja", key, values);
const translateEn: Translate = (key, values) => t("en", key, values);
const projectContext: ActiveProjectContext = { rootPath: "C:\\Novel" };
const glossaryEntry: GlossaryEntry = {
  id: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
  description: "Capital city",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  atoms: [
    {
      id: "018f4b8c-7a2b-7c3d-8e4f-223456789abc",
      entryId: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
      sortOrder: 0,
      value: "Alice",
      matchFlags: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  ],
  tags: []
};

function addDirtyProjectDocument(
  state: OpenDocumentsState,
  relativePath: string
): { state: OpenDocumentsState; editorId: EditorId } {
  const editorId = createProjectDocumentEditorId(relativePath, projectContext);
  const openedState = openOrActivateDocument(
    state,
    createProjectDocument(
      {
        relativePath,
        name: relativePath
      },
      `saved ${relativePath}`
    ),
    projectContext
  );

  return {
    editorId,
    state: updateOpenDocument(openedState, editorId, (document) =>
      updateCurrentDocumentContent(
        document,
        `changed ${relativePath}`,
        document.lineEndingBreaks
      )
    )
  };
}

function addDirtyStandaloneMarkdown(
  state: OpenDocumentsState,
  path: string
): { state: OpenDocumentsState; editorId: EditorId } {
  const editorId = createFileEditorIdForPath(path);
  const openedState = openOrActivateDocument(
    state,
    createFileDocument({
      path,
      content: `saved ${path}`
    }),
    projectContext
  );

  return {
    editorId,
    state: updateOpenDocument(openedState, editorId, (document) =>
      updateCurrentDocumentContent(
        document,
        `changed ${path}`,
        document.lineEndingBreaks
      )
    )
  };
}

function addDirtyUntitledMarkdown(
  state: OpenDocumentsState
): { state: OpenDocumentsState; editorId: EditorId } {
  const openedState = openOrActivateDocument(
    state,
    createUntitledDocument(),
    projectContext
  );
  const editorId = openedState.activeDocumentId;

  if (!editorId) {
    throw new Error("Untitled editor was not opened.");
  }

  return {
    editorId,
    state: updateOpenDocument(openedState, editorId, (document) =>
      updateCurrentDocumentContent(
        document,
        `${document.content}\nchanged`,
        document.lineEndingBreaks
      )
    )
  };
}

function addDirtyGlossaryEntry(
  state: OpenDocumentsState
): { state: OpenDocumentsState; editorId: EditorId } {
  const editorId = createGlossaryEntryEditorId(
    glossaryEntry.id,
    projectContext
  );
  const openedState = openOrActivateEditor(
    state,
    createGlossaryEntryCurrentEditor(glossaryEntry),
    projectContext
  );

  return {
    editorId,
    state: updateOpenEditor(openedState, editorId, (editor) =>
      editor.kind === "glossaryEntry"
        ? {
            ...editor,
            draft: updateGlossaryEntryDraftDescription(
              editor.draft,
              "Changed description"
            )
          }
        : editor
    )
  };
}

function markEditorClean(
  state: OpenDocumentsState,
  editorId: EditorId
): OpenDocumentsState {
  return updateOpenDocument(state, editorId, markCurrentDocumentSaved);
}

function markWorkingCopyClean(
  state: OpenDocumentsState,
  workingCopy: DirtyWorkingCopy
): OpenDocumentsState {
  if (workingCopy.kind === "markdown") {
    return markEditorClean(state, workingCopy.editorId);
  }

  return updateOpenEditor(state, workingCopy.editorId, (editor) =>
    editor.kind === "glossaryEntry"
      ? createGlossaryEntryCurrentEditor(editor.draft.entry)
      : editor
  );
}

function expectDirtyTitles(
  state: OpenDocumentsState,
  titles: readonly string[]
): void {
  expect(getDirtyWorkingCopies(state).map((workingCopy) => workingCopy.title))
    .toEqual(titles);
}

function saveAllChoice() {
  return {
    kind: "chosen" as const,
    id: lifecycleDirtyChoiceIds.saveAll
  };
}

type EnterCommitBarrier =
  DirtyWorkingCopyResolutionDeps["enterCommitBarrier"];

function createCommitBarrierRecorder(events: string[] = []): {
  readonly enterCommitBarrier: EnterCommitBarrier;
  readonly isActive: () => boolean;
  readonly tokens: readonly LifecycleCommitBarrierToken[];
} {
  const barrier = createLifecycleCommitBarrier();
  const tokens: LifecycleCommitBarrierToken[] = [];

  return {
    enterCommitBarrier: vi.fn((intent) => {
      events.push(`barrier:${intent}`);
      const token = barrier.enter(intent);
      tokens.push(token);
      return token;
    }),
    isActive: () => barrier.isActive(),
    tokens
  };
}

async function resolveDirtyWorkingCopies(
  intent: DirtyResolutionIntent,
  deps: Omit<DirtyWorkingCopyResolutionDeps, "enterCommitBarrier">,
  commitBarrier = createCommitBarrierRecorder()
): Promise<DirtyWorkingCopyResolutionResult> {
  return resolveDirtyWorkingCopiesImpl(intent, {
    ...deps,
    enterCommitBarrier: commitBarrier.enterCommitBarrier
  });
}

describe("buildLifecycleDirtyChoiceDialogOptions (#271)", () => {
  it("uses the project display name in the shared unsaved-changes prompt", () => {
    const options = buildLifecycleDirtyChoiceDialogOptions(
      "explicitProjectClose",
      translateJa,
      "迷子たちと千年領主"
    );

    expect(options).toMatchObject({
      title: "未保存の変更があります",
      message: {
        kind: "plainText",
        text:
          "迷子たちと千年領主には保存されていない変更があります。\n" +
          "閉じる前に変更を保存するか選択してください。"
      },
      choices: [
        {
          id: lifecycleDirtyChoiceIds.saveAll,
          label: "すべて保存して閉じる",
          role: "primary"
        },
        {
          id: lifecycleDirtyChoiceIds.discardAll,
          label: "変更を破棄して閉じる",
          role: "destructive",
          icon: { kind: "alertTriangle" }
        },
        {
          id: lifecycleDirtyChoiceIds.cancel,
          label: "キャンセル",
          role: "cancel"
        }
      ]
    });
  });

  it("resolves the shared project-close vocabulary in English", () => {
    const options = buildLifecycleDirtyChoiceDialogOptions(
      "explicitProjectClose",
      translateEn,
      "Lost Children"
    );

    expect(options).toMatchObject({
      title: "Unsaved Changes",
      message: {
        kind: "plainText",
        text:
          "Lost Children has unsaved changes.\n" +
          "Choose whether to save the changes before closing."
      },
      choices: [
        {
          id: lifecycleDirtyChoiceIds.saveAll,
          label: "Save All and Close",
          role: "primary"
        },
        {
          id: lifecycleDirtyChoiceIds.discardAll,
          label: "Discard Changes and Close",
          role: "destructive",
          icon: { kind: "alertTriangle" }
        },
        {
          id: lifecycleDirtyChoiceIds.cancel,
          label: "Cancel",
          role: "cancel"
        }
      ]
    });
  });
});

describe("resolveDirtyWorkingCopies algorithm (#271)", () => {
  it("resolves clean state without opening a dialog", async () => {
    const state = createInitialOpenDocumentsState();
    const choiceDialog = vi.fn();
    const saveDirtyWorkingCopy = vi.fn();

    await expect(
      resolveDirtyWorkingCopies("explicitProjectClose", {
        getState: () => state,
        translate: translateEn,
        targetName: "Project",
        choiceDialog,
        saveDirtyWorkingCopy
      })
    ).resolves.toMatchObject({ status: "resolved" });

    expect(choiceDialog).not.toHaveBeenCalled();
    expect(saveDirtyWorkingCopy).not.toHaveBeenCalled();
  });

  it("limits explicit Project Close dirty resolution to project-owned working copies", async () => {
    let state = createInitialOpenDocumentsState();
    const projectDocument = addDirtyProjectDocument(state, "A.md");
    state = projectDocument.state;
    const standalone = addDirtyStandaloneMarkdown(state, "C:\\Outside\\memo.md");
    state = standalone.state;
    const choiceDialog = vi.fn(async () => saveAllChoice());
    const commitBarrier = createCommitBarrierRecorder();
    const saveDirtyWorkingCopy = vi.fn(
      async (workingCopy: DirtyWorkingCopy) => {
        state = markWorkingCopyClean(state, workingCopy);
        return "saved" as const;
      }
    );

    await expect(
      resolveDirtyWorkingCopies(
        "explicitProjectClose",
        {
          getState: () => state,
          translate: translateEn,
          targetName: "Project",
          choiceDialog,
          saveDirtyWorkingCopy
        },
        commitBarrier
      )
    ).resolves.toMatchObject({ status: "resolved" });

    expect(choiceDialog).toHaveBeenCalledTimes(1);
    expect(
      saveDirtyWorkingCopy.mock.calls.map(([workingCopy]) => workingCopy.title)
    ).toEqual(["A.md"]);
    expect(commitBarrier.tokens).toHaveLength(1);
    expect(commitBarrier.isActive()).toBe(true);
    expect(getDirtyWorkingCopies(state)).toEqual([
      expect.objectContaining({
        editorId: standalone.editorId,
        scope: "standaloneMarkdown",
        title: "memo.md"
      })
    ]);
  });

  it("resolves explicit Project Close without a dialog when only standalone Markdown is dirty", async () => {
    let state = createInitialOpenDocumentsState();
    state = addDirtyStandaloneMarkdown(state, "C:\\Outside\\memo.md").state;
    const choiceDialog = vi.fn();
    const saveDirtyWorkingCopy = vi.fn();
    const commitBarrier = createCommitBarrierRecorder();

    await expect(
      resolveDirtyWorkingCopies(
        "explicitProjectClose",
        {
          getState: () => state,
          translate: translateEn,
          targetName: "Project",
          choiceDialog,
          saveDirtyWorkingCopy
        },
        commitBarrier
      )
    ).resolves.toMatchObject({ status: "resolved" });

    expect(choiceDialog).not.toHaveBeenCalled();
    expect(saveDirtyWorkingCopy).not.toHaveBeenCalled();
    expect(commitBarrier.tokens).toHaveLength(1);
    expect(commitBarrier.isActive()).toBe(true);
  });

  it("includes dirty glossary entries in explicit Project Close resolution", async () => {
    let state = createInitialOpenDocumentsState();
    const glossary = addDirtyGlossaryEntry(state);
    state = glossary.state;
    const choiceDialog = vi.fn(async () => saveAllChoice());
    const commitBarrier = createCommitBarrierRecorder();
    const saveDirtyWorkingCopy = vi.fn(
      async (workingCopy: DirtyWorkingCopy) => {
        state = markWorkingCopyClean(state, workingCopy);
        return "saved" as const;
      }
    );

    await expect(
      resolveDirtyWorkingCopies(
        "explicitProjectClose",
        {
          getState: () => state,
          translate: translateEn,
          targetName: "Project",
          choiceDialog,
          saveDirtyWorkingCopy
        },
        commitBarrier
      )
    ).resolves.toMatchObject({ status: "resolved" });

    expect(
      saveDirtyWorkingCopy.mock.calls.map(([workingCopy]) => ({
        editorId: workingCopy.editorId,
        scope: workingCopy.scope,
        title: workingCopy.title
      }))
    ).toEqual([
      {
        editorId: glossary.editorId,
        scope: "glossary",
        title: "Alice"
      }
    ]);
    expect(commitBarrier.tokens).toHaveLength(1);
    expect(commitBarrier.isActive()).toBe(true);
    expectDirtyTitles(state, []);
  });

  it("includes dirty standalone Markdown in ordinary Window Close resolution", async () => {
    let state = createInitialOpenDocumentsState();
    state = addDirtyStandaloneMarkdown(state, "C:\\Outside\\memo.md").state;
    const choiceDialog = vi.fn(async () => saveAllChoice());
    const commitBarrier = createCommitBarrierRecorder();
    const saveDirtyWorkingCopy = vi.fn(
      async (workingCopy: DirtyWorkingCopy) => {
        state = markWorkingCopyClean(state, workingCopy);
        return "saved" as const;
      }
    );

    await expect(
      resolveDirtyWorkingCopies(
        "ordinaryWindowClose",
        {
          getState: () => state,
          translate: translateEn,
          targetName: "Pergamum",
          choiceDialog,
          saveDirtyWorkingCopy
        },
        commitBarrier
      )
    ).resolves.toMatchObject({ status: "resolved" });

    expect(choiceDialog).toHaveBeenCalledTimes(1);
    expect(
      saveDirtyWorkingCopy.mock.calls.map(([workingCopy]) => ({
        scope: workingCopy.scope,
        title: workingCopy.title
      }))
    ).toEqual([{ scope: "standaloneMarkdown", title: "memo.md" }]);
    expect(commitBarrier.tokens).toHaveLength(1);
    expect(commitBarrier.isActive()).toBe(true);
    expectDirtyTitles(state, []);
  });

  it("includes dirty standalone and untitled Markdown in Quit resolution", async () => {
    let state = createInitialOpenDocumentsState();
    state = addDirtyStandaloneMarkdown(state, "C:\\Outside\\memo.md").state;
    state = addDirtyUntitledMarkdown(state).state;
    const choiceDialog = vi.fn(async () => saveAllChoice());
    const commitBarrier = createCommitBarrierRecorder();
    const saveDirtyWorkingCopy = vi.fn(
      async (workingCopy: DirtyWorkingCopy) => {
        state = markWorkingCopyClean(state, workingCopy);
        return "saved" as const;
      }
    );

    await expect(
      resolveDirtyWorkingCopies(
        "explicitApplicationQuit",
        {
          getState: () => state,
          translate: translateEn,
          targetName: "Pergamum",
          choiceDialog,
          saveDirtyWorkingCopy
        },
        commitBarrier
      )
    ).resolves.toMatchObject({ status: "resolved" });

    expect(
      saveDirtyWorkingCopy.mock.calls.map(([workingCopy]) => ({
        scope: workingCopy.scope,
        title: workingCopy.title
      }))
    ).toEqual([
      { scope: "standaloneMarkdown", title: "memo.md" },
      { scope: "untitledMarkdown", title: "Untitled.md" }
    ]);
    expect(commitBarrier.tokens).toHaveLength(1);
    expect(commitBarrier.isActive()).toBe(true);
    expectDirtyTitles(state, []);
  });

  it("uses the same Project Close selector for final dirty re-collect", async () => {
    let state = createInitialOpenDocumentsState();
    const projectDocument = addDirtyProjectDocument(state, "A.md");
    state = projectDocument.state;
    state = addDirtyStandaloneMarkdown(state, "C:\\Outside\\memo.md").state;
    const choiceDialog = vi.fn(async () => saveAllChoice());
    const commitBarrier = createCommitBarrierRecorder();
    const saveDirtyWorkingCopy = vi.fn(
      async (workingCopy: DirtyWorkingCopy) => {
        state = markEditorClean(state, workingCopy.editorId);
        return "saved" as const;
      }
    );

    await expect(
      resolveDirtyWorkingCopies(
        "explicitProjectClose",
        {
          getState: () => state,
          translate: translateEn,
          targetName: "Project",
          choiceDialog,
          saveDirtyWorkingCopy
        },
        commitBarrier
      )
    ).resolves.toMatchObject({ status: "resolved" });

    expect(saveDirtyWorkingCopy).toHaveBeenCalledTimes(1);
    expect(
      getDirtyWorkingCopiesForLifecycle("explicitProjectClose", state)
    ).toEqual([]);
    expect(commitBarrier.tokens).toHaveLength(1);
    expect(commitBarrier.isActive()).toBe(true);
    expectDirtyTitles(state, ["memo.md"]);
  });

  it("saves every dirty working copy and resolves after final re-collect is clean", async () => {
    let state = createInitialOpenDocumentsState();
    const first = addDirtyProjectDocument(state, "A.md");
    state = first.state;
    const second = addDirtyProjectDocument(state, "B.md");
    state = second.state;
    const choiceDialog = vi.fn(async () => saveAllChoice());
    const commitBarrier = createCommitBarrierRecorder();
    const saveDirtyWorkingCopy = vi.fn(
      async (workingCopy: DirtyWorkingCopy) => {
        state = markEditorClean(state, workingCopy.editorId);
        return "saved" as const;
      }
    );

    await expect(
      resolveDirtyWorkingCopies(
        "explicitProjectClose",
        {
          getState: () => state,
          translate: translateEn,
          targetName: "Project",
          choiceDialog,
          saveDirtyWorkingCopy
        },
        commitBarrier
      )
    ).resolves.toMatchObject({ status: "resolved" });

    expect(choiceDialog).toHaveBeenCalledTimes(1);
    expect(
      saveDirtyWorkingCopy.mock.calls.map(([workingCopy]) => workingCopy.title)
    ).toEqual(["A.md", "B.md"]);
    expect(commitBarrier.tokens).toHaveLength(1);
    expect(commitBarrier.isActive()).toBe(true);
    expectDirtyTitles(state, []);
  });

  it("enters the commit barrier after final re-collect and before resolving to the caller", async () => {
    let state = createInitialOpenDocumentsState();
    const first = addDirtyProjectDocument(state, "A.md");
    state = first.state;
    const events: string[] = [];
    const barrier = createLifecycleCommitBarrier();
    let commitBarrierToken: LifecycleCommitBarrierToken | null = null;
    const choiceDialog = vi.fn(async () => saveAllChoice());
    const saveDirtyWorkingCopy = vi.fn(
      async (workingCopy: DirtyWorkingCopy) => {
        state = markEditorClean(state, workingCopy.editorId);
        events.push("save:clean");
        return "saved" as const;
      }
    );

    const result = await resolveDirtyWorkingCopiesImpl(
      "explicitProjectClose",
      {
        getState: () => state,
        translate: translateEn,
        targetName: "Project",
        choiceDialog,
        saveDirtyWorkingCopy,
        enterCommitBarrier: (intent) => {
          events.push(
            `barrier:${getDirtyWorkingCopiesForLifecycle(intent, state).length}`
          );
          commitBarrierToken = barrier.enter(intent);
          return commitBarrierToken;
        }
      }
    );
    events.push(`caller:${barrier.isActive()}`);

    expect(result).toEqual({
      status: "resolved",
      commitBarrierToken
    });
    expect(events).toEqual(["save:clean", "barrier:0", "caller:true"]);
  });

  it("lets a saved dirty Glossary entry become clean before lifecycle commit proceeds", async () => {
    let state = createInitialOpenDocumentsState();
    const glossary = addDirtyGlossaryEntry(state);
    state = glossary.state;
    const events: string[] = [];
    const barrier = createLifecycleCommitBarrier();
    const choiceDialog = vi.fn(async () => saveAllChoice());
    const saveDirtyWorkingCopy = vi.fn(
      async (workingCopy: DirtyWorkingCopy) => {
        expect(workingCopy.scope).toBe("glossary");
        const savedEntry = {
          ...glossaryEntry,
          description: "Changed description",
          updatedAt: "2026-01-02T00:00:00.000Z"
        };
        state = updateOpenEditor(state, glossary.editorId, (editor) =>
          editor.kind === "glossaryEntry"
            ? {
                ...editor,
                draft: applyGlossaryEntryDraftSaveResult(
                  markGlossaryEntryDraftSaving(editor.draft),
                  savedEntry
                )
              }
            : editor
        );
        events.push(
          `save:${getDirtyWorkingCopiesForLifecycle(
            "explicitProjectClose",
            state
          ).length}`
        );
        return "saved" as const;
      }
    );

    const result = await resolveDirtyWorkingCopiesImpl(
      "explicitProjectClose",
      {
        getState: () => state,
        translate: translateEn,
        targetName: "Project",
        choiceDialog,
        saveDirtyWorkingCopy,
        enterCommitBarrier: (intent) => {
          events.push(
            `barrier:${getDirtyWorkingCopiesForLifecycle(intent, state).length}`
          );
          return barrier.enter(intent);
        }
      }
    );
    events.push(`caller:${barrier.isActive()}`);

    expect(result).toMatchObject({ status: "resolved" });
    expect(events).toEqual(["save:0", "barrier:0", "caller:true"]);
    expectDirtyTitles(state, []);
  });

  it("aborts on partial save failure without rolling back earlier saves or processing later copies", async () => {
    let state = createInitialOpenDocumentsState();
    const first = addDirtyProjectDocument(state, "A.md");
    state = first.state;
    const second = addDirtyProjectDocument(state, "B.md");
    state = second.state;
    const third = addDirtyProjectDocument(state, "C.md");
    state = third.state;
    const commitBarrier = createCommitBarrierRecorder();
    const choiceDialog = vi.fn(async () => saveAllChoice());
    const saveDirtyWorkingCopy = vi.fn(
      async (workingCopy: DirtyWorkingCopy): Promise<SaveWorkingCopyOutcome> => {
        if (editorIdEquals(workingCopy.editorId, first.editorId)) {
          state = markEditorClean(state, first.editorId);
          return "saved";
        }

        if (editorIdEquals(workingCopy.editorId, second.editorId)) {
          return "failed";
        }

        throw new Error("C.md must not be saved after B.md fails.");
      }
    );

    await expect(
      resolveDirtyWorkingCopies(
        "explicitProjectClose",
        {
          getState: () => state,
          translate: translateEn,
          targetName: "Project",
          choiceDialog,
          saveDirtyWorkingCopy
        },
        commitBarrier
      )
    ).resolves.toEqual({
      status: "aborted",
      editorId: second.editorId,
      outcome: "failed"
    });

    expect(
      saveDirtyWorkingCopy.mock.calls.map(([workingCopy]) => workingCopy.title)
    ).toEqual(["A.md", "B.md"]);
    expect(commitBarrier.tokens).toEqual([]);
    expect(commitBarrier.isActive()).toBe(false);
    expectDirtyTitles(state, ["B.md", "C.md"]);
  });

  it.each(["cancelled", "rejected", "failed", "ignored"] as const)(
    "aborts when save returns %s",
    async (outcome) => {
      let state = createInitialOpenDocumentsState();
      const first = addDirtyProjectDocument(state, "A.md");
      state = first.state;
      const commitBarrier = createCommitBarrierRecorder();
      const choiceDialog = vi.fn(async () => saveAllChoice());
      const saveDirtyWorkingCopy = vi.fn(async () => outcome);

      await expect(
        resolveDirtyWorkingCopies(
          "explicitProjectClose",
          {
            getState: () => state,
            translate: translateEn,
            targetName: "Project",
            choiceDialog,
            saveDirtyWorkingCopy
          },
          commitBarrier
        )
      ).resolves.toEqual({
        status: "aborted",
        editorId: first.editorId,
        outcome
      });

      expect(saveDirtyWorkingCopy).toHaveBeenCalledTimes(1);
      expect(commitBarrier.tokens).toEqual([]);
      expect(commitBarrier.isActive()).toBe(false);
      expectDirtyTitles(state, ["A.md"]);
    }
  );

  it("returns discarded without mutating dirty working-copy state", async () => {
    let state = createInitialOpenDocumentsState();
    const first = addDirtyProjectDocument(state, "A.md");
    state = first.state;
    const choiceDialog = vi.fn(async () => ({
      kind: "chosen" as const,
      id: lifecycleDirtyChoiceIds.discardAll
    }));
    const saveDirtyWorkingCopy = vi.fn();
    const commitBarrier = createCommitBarrierRecorder();

    await expect(
      resolveDirtyWorkingCopies(
        "explicitProjectClose",
        {
          getState: () => state,
          translate: translateEn,
          targetName: "Project",
          choiceDialog,
          saveDirtyWorkingCopy
        },
        commitBarrier
      )
    ).resolves.toMatchObject({ status: "discarded" });

    expect(saveDirtyWorkingCopy).not.toHaveBeenCalled();
    expect(commitBarrier.tokens).toHaveLength(1);
    expect(commitBarrier.isActive()).toBe(true);
    expectDirtyTitles(state, ["A.md"]);
  });

  it("returns cancelled without saving when the cancel choice is selected", async () => {
    let state = createInitialOpenDocumentsState();
    const first = addDirtyProjectDocument(state, "A.md");
    state = first.state;
    const choiceDialog = vi.fn(async () => ({
      kind: "chosen" as const,
      id: lifecycleDirtyChoiceIds.cancel
    }));
    const saveDirtyWorkingCopy = vi.fn();
    const commitBarrier = createCommitBarrierRecorder();

    await expect(
      resolveDirtyWorkingCopies(
        "explicitProjectClose",
        {
          getState: () => state,
          translate: translateEn,
          targetName: "Project",
          choiceDialog,
          saveDirtyWorkingCopy
        },
        commitBarrier
      )
    ).resolves.toEqual({ status: "cancelled" });

    expect(saveDirtyWorkingCopy).not.toHaveBeenCalled();
    expect(commitBarrier.tokens).toEqual([]);
    expect(commitBarrier.isActive()).toBe(false);
    expectDirtyTitles(state, ["A.md"]);
  });

  it("treats a dismissed dialog as cancelled", async () => {
    let state = createInitialOpenDocumentsState();
    const first = addDirtyProjectDocument(state, "A.md");
    state = first.state;
    const choiceDialog = vi.fn(async () => ({ kind: "dismissed" as const }));
    const saveDirtyWorkingCopy = vi.fn();
    const commitBarrier = createCommitBarrierRecorder();

    await expect(
      resolveDirtyWorkingCopies(
        "explicitProjectClose",
        {
          getState: () => state,
          translate: translateEn,
          targetName: "Project",
          choiceDialog,
          saveDirtyWorkingCopy
        },
        commitBarrier
      )
    ).resolves.toEqual({ status: "cancelled" });

    expect(saveDirtyWorkingCopy).not.toHaveBeenCalled();
    expect(commitBarrier.tokens).toEqual([]);
    expect(commitBarrier.isActive()).toBe(false);
    expectDirtyTitles(state, ["A.md"]);
  });

  it("aborts as ignored when the target disappears before save", async () => {
    let state = createInitialOpenDocumentsState();
    const first = addDirtyProjectDocument(state, "A.md");
    state = first.state;
    const choiceDialog = vi.fn(async () => {
      state = closeOpenEditor(state, first.editorId);
      return saveAllChoice();
    });
    const saveDirtyWorkingCopy = vi.fn();
    const commitBarrier = createCommitBarrierRecorder();

    await expect(
      resolveDirtyWorkingCopies(
        "explicitProjectClose",
        {
          getState: () => state,
          translate: translateEn,
          targetName: "Project",
          choiceDialog,
          saveDirtyWorkingCopy
        },
        commitBarrier
      )
    ).resolves.toEqual({
      status: "aborted",
      editorId: first.editorId,
      outcome: "ignored"
    });

    expect(saveDirtyWorkingCopy).not.toHaveBeenCalled();
    expect(commitBarrier.tokens).toEqual([]);
    expect(commitBarrier.isActive()).toBe(false);
    expectDirtyTitles(state, []);
  });

  it("skips a target that becomes clean before its turn and continues saving the rest", async () => {
    let state = createInitialOpenDocumentsState();
    const first = addDirtyProjectDocument(state, "A.md");
    state = first.state;
    const second = addDirtyProjectDocument(state, "B.md");
    state = second.state;
    const choiceDialog = vi.fn(async () => saveAllChoice());
    const commitBarrier = createCommitBarrierRecorder();
    const saveDirtyWorkingCopy = vi.fn(
      async (workingCopy: DirtyWorkingCopy) => {
        state = markEditorClean(state, workingCopy.editorId);
        state = markEditorClean(state, second.editorId);
        return "saved" as const;
      }
    );

    await expect(
      resolveDirtyWorkingCopies(
        "explicitProjectClose",
        {
          getState: () => state,
          translate: translateEn,
          targetName: "Project",
          choiceDialog,
          saveDirtyWorkingCopy
        },
        commitBarrier
      )
    ).resolves.toMatchObject({ status: "resolved" });

    expect(
      saveDirtyWorkingCopy.mock.calls.map(([workingCopy]) => workingCopy.title)
    ).toEqual(["A.md"]);
    expect(commitBarrier.tokens).toHaveLength(1);
    expect(commitBarrier.isActive()).toBe(true);
    expectDirtyTitles(state, []);
  });

  it("aborts on final re-collect when saved callbacks leave dirty state behind", async () => {
    let state = createInitialOpenDocumentsState();
    const first = addDirtyProjectDocument(state, "A.md");
    state = first.state;
    const choiceDialog = vi.fn(async () => saveAllChoice());
    const saveDirtyWorkingCopy = vi.fn(async () => "saved" as const);
    const commitBarrier = createCommitBarrierRecorder();

    await expect(
      resolveDirtyWorkingCopies(
        "explicitProjectClose",
        {
          getState: () => state,
          translate: translateEn,
          targetName: "Project",
          choiceDialog,
          saveDirtyWorkingCopy
        },
        commitBarrier
      )
    ).resolves.toEqual({
      status: "aborted",
      editorId: first.editorId,
      outcome: "ignored"
    });

    expect(saveDirtyWorkingCopy).toHaveBeenCalledTimes(1);
    expect(commitBarrier.tokens).toEqual([]);
    expect(commitBarrier.isActive()).toBe(false);
    expectDirtyTitles(state, ["A.md"]);
  });
});
