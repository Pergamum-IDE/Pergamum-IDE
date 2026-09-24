import { describe, expect, it, vi } from "vitest";
import type {
  ColdStartRestorePayload,
  MarkdownFile,
  PergamumProject
} from "../../src/shared/api";
import type { GlossaryEntry } from "../../src/shared/glossary";
import {
  SESSION_SCHEMA_VERSION,
  parseSessionEditor,
  parseSessionEditorIdentity,
  parseSessionRecord,
  sessionEditorIdentitiesEqual,
  type SessionEditor,
  type SessionEditorViewState,
  type SessionRecord
} from "../../src/shared/session";
import {
  createGlossaryDescriptionEditorId,
  editorIdEquals,
  serializeEditorId
} from "../../src/shared/editorId";
import {
  createGlossaryDescriptionCurrentEditor,
  createMarkdownCurrentEditor,
  createNewGlossaryDescriptionCurrentEditor,
  currentEditorTitle,
  isCurrentEditorDirty,
  updateGlossaryDescriptionEditorText,
  type GlossaryDescriptionCurrentEditor
} from "../../src/renderer/currentEditor";
import { createProjectDocument } from "../../src/renderer/currentDocument";
import {
  createInitialOpenDocumentsState,
  documentTabs,
  openOrActivateEditor,
  type OpenDocumentsState
} from "../../src/renderer/openDocuments";
import {
  buildRendererSessionSnapshot,
  buildSessionSnapshotInputs
} from "../../src/renderer/session/sessionSnapshot";
import {
  runColdStartRestore,
  type ColdStartRestoreDeps,
  type RestoredEnvironment
} from "../../src/renderer/session/coldStartRestore";
import { PROJECT_ID, RUN_ID, sid } from "../shared/sessionTestFixtures";

const entryA = "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f00a1";
const entryB = "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f00b2";
const localNew = "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f00c3";
const projectContext = { rootPath: "/w/Book" };

function glossaryEntry(id: string, value: string, description = "説明"): GlossaryEntry {
  return {
    id,
    description,
    atoms: [
      {
        id: `${id.slice(0, -4)}ffff`,
        entryId: id,
        sortOrder: 0,
        value,
        matchFlags: 0,
        createdAt: "2026-09-24T00:00:00.000Z",
        updatedAt: "2026-09-24T00:00:00.000Z"
      }
    ],
    tags: [],
    createdAt: "2026-09-24T00:00:00.000Z",
    updatedAt: "2026-09-24T00:00:00.000Z"
  };
}

const viewState: SessionEditorViewState = {
  contentDigest: { algorithm: "sha256", digest: "b".repeat(64) },
  selection: { anchor: 1, head: 2 },
  scroll: { top: 5, left: 0 }
};

describe("session schema: glossaryDescription (#573 Slice 8)", () => {
  it("parses a glossary Description editor and identity, dropping any View State (deferred)", () => {
    expect(
      parseSessionEditor({
        kind: "glossaryDescription",
        order: 2,
        entryId: entryA,
        viewState
      })
    ).toEqual({
      kind: "glossaryDescription",
      order: 2,
      entryId: entryA,
      viewState: null
    });
    expect(
      parseSessionEditorIdentity({ kind: "glossaryDescription", entryId: entryA })
    ).toEqual({ kind: "glossaryDescription", entryId: entryA });
    expect(
      parseSessionEditor({ kind: "glossaryDescription", order: 0, entryId: "" })
    ).toBeNull();
  });

  it("never confuses a glossary identity with another kind", () => {
    expect(
      sessionEditorIdentitiesEqual(
        { kind: "glossaryDescription", entryId: "x" },
        { kind: "untitled", untitledId: "x" }
      )
    ).toBe(false);
  });

  it("keeps dropping the retired pre-#436 glossaryEntry kind", () => {
    const record = parseSessionRecord({
      schemaVersion: SESSION_SCHEMA_VERSION,
      sessionId: sid("legacy"),
      instanceRunId: RUN_ID,
      updatedAt: "2026-09-24T00:00:00.000Z",
      projectContext: null,
      window: null,
      editors: [
        { kind: "glossaryEntry", order: 0, entryId: entryA, viewState: null },
        { kind: "glossaryDescription", order: 1, entryId: entryB, viewState: null }
      ],
      activeEditor: { kind: "glossaryEntry", entryId: entryA },
      previewVisible: true
    });

    expect(record?.editors).toEqual([
      { kind: "glossaryDescription", order: 0, entryId: entryB, viewState: null }
    ]);
    expect(record?.activeEditor).toBeNull();
  });
});

describe("session snapshot: glossaryDescription (#573 Slice 8)", () => {
  function mixedState(): OpenDocumentsState {
    let state = openOrActivateEditor(
      createInitialOpenDocumentsState(),
      createMarkdownCurrentEditor(
        createProjectDocument({ relativePath: "ch1.md", name: "ch1.md" }, "一")
      ),
      projectContext
    );
    state = openOrActivateEditor(
      state,
      createGlossaryDescriptionCurrentEditor(glossaryEntry(entryA, "主人公")),
      projectContext
    );
    state = openOrActivateEditor(
      state,
      createNewGlossaryDescriptionCurrentEditor("新語", localNew),
      projectContext
    );
    // Leave the saved glossary tab active.
    return {
      ...state,
      activeDocumentId: createGlossaryDescriptionEditorId(entryA)
    };
  }

  it("records saved glossary tabs by entry id, in tab order, and skips never-saved ones", () => {
    const inputs = buildSessionSnapshotInputs("s", null, mixedState(), true);

    expect(inputs.editors.map(({ editor }) => editor)).toEqual([
      { kind: "projectMarkdown", order: 0, relativePath: "ch1.md", viewState: null },
      { kind: "glossaryDescription", order: 1, entryId: entryA, viewState: null }
    ]);
    expect(inputs.activeEditor).toEqual({
      kind: "glossaryDescription",
      entryId: entryA
    });
  });

  it("never records the draft or Description text", () => {
    const inputs = buildSessionSnapshotInputs("s", null, mixedState(), true);
    const serialized = JSON.stringify(inputs);

    expect(serialized).not.toContain("説明");
    expect(serialized).not.toContain("draft");
  });

  it("records no #273 View State for glossary tabs (deferred), leaving documents' untouched", () => {
    const inputs = buildSessionSnapshotInputs("s", null, mixedState(), true);
    const glossaryKey = serializeEditorId(
      createGlossaryDescriptionEditorId(entryA)
    );
    const documentKey = inputs.editors[0].viewStateKey!;

    expect(inputs.editors[1].viewStateKey).toBeNull();
    const snapshot = buildRendererSessionSnapshot(
      inputs,
      new Map([
        [glossaryKey, viewState as never],
        [documentKey, viewState as never]
      ])
    );
    expect(snapshot.editors[1]).toEqual({
      kind: "glossaryDescription",
      order: 1,
      entryId: entryA,
      viewState: null
    });
    // A document's View State is still overlaid as before.
    expect(snapshot.editors[0]).toMatchObject({ viewState });
  });
});

// ---------------------------------------------------------------------------
// Cold start
// ---------------------------------------------------------------------------

const PROJECT: PergamumProject = {
  rootPath: "/w/Book",
  activeProjectFilePath: "/w/Book/Book.pergamum",
  accessMode: { kind: "readWrite" },
  name: "Book",
  config: null,
  documents: [
    { relativePath: "ch1.md", name: "ch1.md" },
    { relativePath: "ch2.md", name: "ch2.md" }
  ]
};

const withProject: SessionRecord["projectContext"] = {
  projectId: PROJECT_ID,
  projectFilePath: "/w/Book/Book.pergamum",
  rootPath: "/w/Book"
};

function pm(relativePath: string, order: number): SessionEditor {
  return { kind: "projectMarkdown", order, relativePath, viewState: null };
}

function gd(entryId: string, order: number): SessionEditor {
  return { kind: "glossaryDescription", order, entryId, viewState: null };
}

function record(overrides: Partial<SessionRecord>): SessionRecord {
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    sessionId: sid("glossary"),
    instanceRunId: RUN_ID,
    updatedAt: "2026-09-24T00:00:00.000Z",
    projectContext: withProject,
    window: null,
    editors: [],
    activeEditor: null,
    previewVisible: true,
    ...overrides
  };
}

async function restore(
  sessionRecord: SessionRecord,
  entries: Record<string, GlossaryEntry>,
  overrides: Partial<ColdStartRestoreDeps> = {}
): Promise<{ env: RestoredEnvironment; skipped: string[]; getById: ReturnType<typeof vi.fn> }> {
  const applied: RestoredEnvironment[] = [];
  const skipped: string[] = [];
  const getById = vi.fn((entryId: string) =>
    Promise.resolve(entries[entryId] ?? null)
  );
  const payload: ColdStartRestorePayload = {
    read: {
      kind: "ok",
      sessions: [sessionRecord],
      manifestListedSessionCount: 1,
      skippedSessionCount: 0
    },
    launchTarget: null
  };
  const deps: ColdStartRestoreDeps = {
    platform: "linux",
    getColdStartRestore: () => Promise.resolve(payload),
    openProjectByFilePath: () =>
      Promise.resolve({ kind: "opened", result: PROJECT } as const),
    resolveProjectOpenResult: () => Promise.resolve(PROJECT),
    reloadSettingsAfterProjectOpen: () => Promise.resolve(),
    openLaunchTargetProjectNormally: () => Promise.resolve(null),
    readProjectDocumentContent: (relativePath) =>
      Promise.resolve(`# ${relativePath}\n`),
    readMarkdownFile: () => Promise.reject(new Error("unused")) as Promise<MarkdownFile>,
    registerProjectDocumentPath: () => Promise.resolve(null),
    getGlossaryEntryById: getById,
    applyRestoredEnvironment: (env) => applied.push(env),
    adoptSessionId: () => undefined,
    finishColdStart: () => undefined,
    routeMarkdownLaunchTarget: () => undefined,
    notifyStartupMarkdownRejected: () => undefined,
    notifyRestoreUnavailable: () => undefined,
    notifyProjectRestoreFailed: () => undefined,
    notifyEditorSkipped: (name) => skipped.push(name),
    ...overrides
  };

  await runColdStartRestore(deps);
  expect(applied).toHaveLength(1);
  return { env: applied[0], skipped, getById };
}

const entries = {
  [entryA]: glossaryEntry(entryA, "主人公"),
  [entryB]: glossaryEntry(entryB, "王都")
};

describe("cold start restore: glossaryDescription (#573 Slice 8)", () => {
  it("restores mixed document / glossary tabs in their saved order", async () => {
    const { env } = await restore(
      record({ editors: [pm("ch1.md", 0), gd(entryA, 1), pm("ch2.md", 2), gd(entryB, 3)] }),
      entries
    );

    expect(documentTabs(env.openDocuments).map((tab) => tab.title)).toEqual([
      "ch1.md",
      "語彙: 主人公",
      "ch2.md",
      "語彙: 王都"
    ]);
  });

  it("restores a glossary tab as clean, current saved data — editable and saveable like a normal open", async () => {
    const { env, getById } = await restore(
      record({ editors: [gd(entryA, 0)] }),
      entries
    );
    const editor = env.openDocuments.documents[0]
      .editor as GlossaryDescriptionCurrentEditor;

    expect(getById).toHaveBeenCalledWith(entryA);
    expect(editor.kind).toBe("glossaryDescription");
    expect(editor.draft.description).toBe("説明");
    expect(currentEditorTitle(editor)).toBe("語彙: 主人公");
    expect(isCurrentEditorDirty(editor)).toBe(false);
    expect(
      isCurrentEditorDirty(
        updateGlossaryDescriptionEditorText(
          editor,
          "編集",
          editor.descriptionLineEndingBreaks
        )
      )
    ).toBe(true);
  });

  it("restores an active glossary tab as active", async () => {
    const { env } = await restore(
      record({
        editors: [pm("ch1.md", 0), gd(entryA, 1)],
        activeEditor: { kind: "glossaryDescription", entryId: entryA }
      }),
      entries
    );

    expect(
      editorIdEquals(
        env.openDocuments.activeDocumentId!,
        createGlossaryDescriptionEditorId(entryA)
      )
    ).toBe(true);
  });

  it("skips a deleted entry quietly and keeps the others in order", async () => {
    const logDebug = vi.fn();
    const gone = "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f00d4";
    const { env, skipped } = await restore(
      record({ editors: [gd(gone, 0), pm("ch1.md", 1), gd(entryB, 2)] }),
      entries,
      { logDebug }
    );

    expect(documentTabs(env.openDocuments).map((tab) => tab.title)).toEqual([
      "ch1.md",
      "語彙: 王都"
    ]);
    expect(skipped).toEqual([]);
    expect(logDebug).toHaveBeenCalledWith("cold-start: glossary entry skipped", {
      reason: "entryUnavailable"
    });
  });

  it("falls back safely when the active glossary entry was deleted", async () => {
    const gone = "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f00d4";
    const { env } = await restore(
      record({
        editors: [gd(entryB, 0), pm("ch2.md", 1), pm("ch1.md", 2), gd(gone, 3)],
        activeEditor: { kind: "glossaryDescription", entryId: gone }
      }),
      entries
    );
    const active = env.openDocuments.activeDocumentId;

    // Existing rule: filename-ascending file editor first.
    expect(active?.kind === "projectDocument" && active.relativePath).toBe(
      "ch1.md"
    );
  });

  it("falls back to the first restored tab when only glossary tabs remain", async () => {
    const gone = "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f00d4";
    const { env } = await restore(
      record({
        editors: [gd(entryB, 0), gd(entryA, 1)],
        activeEditor: { kind: "glossaryDescription", entryId: gone }
      }),
      entries
    );

    expect(
      editorIdEquals(
        env.openDocuments.activeDocumentId!,
        createGlossaryDescriptionEditorId(entryB)
      )
    ).toBe(true);
  });

  it("treats a failing lookup like a missing entry, never crashing", async () => {
    const { env } = await restore(
      record({ editors: [gd(entryA, 0), pm("ch1.md", 1)] }),
      entries,
      { getGlossaryEntryById: () => Promise.reject(new Error("db closed")) }
    );

    expect(env.openDocuments.documents).toHaveLength(1);
  });

  it("does not restore glossary tabs without their project", async () => {
    const { env, getById } = await restore(
      record({ projectContext: null, editors: [gd(entryA, 0)] }),
      entries
    );

    expect(env.openDocuments.documents).toEqual([]);
    expect(getById).not.toHaveBeenCalled();
  });

  it("does not restore a glossary tab's View State (deferred) — the tab itself still restores", async () => {
    // Even a hand-built record carrying a View State is ignored.
    const withViewState = {
      ...gd(entryA, 0),
      viewState
    } as unknown as SessionEditor;
    const { env } = await restore(record({ editors: [withViewState] }), entries);

    expect(env.openDocuments.documents).toHaveLength(1);
    expect(
      env.pendingViewStates.has(
        serializeEditorId(createGlossaryDescriptionEditorId(entryA))
      )
    ).toBe(false);
  });
});
