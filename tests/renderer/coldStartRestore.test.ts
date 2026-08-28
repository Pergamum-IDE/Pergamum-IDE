import { describe, expect, it, vi } from "vitest";
import {
  runColdStartRestore,
  type ColdStartRestoreDeps,
  type RestoredEnvironment
} from "../../src/renderer/session/coldStartRestore";
import type {
  ColdStartRestorePayload,
  MarkdownFile,
  PergamumProject
} from "../../src/shared/api";
import {
  SESSION_SCHEMA_VERSION,
  type SessionEditor,
  type SessionRecord
} from "../../src/shared/session";
import type { GlossaryEntry } from "../../src/shared/glossary";
import { PROJECT_ID, RUN_ID, sid } from "../shared/sessionTestFixtures";

const PROJECT: PergamumProject = {
  rootPath: "/w/Book",
  activeProjectFilePath: "/w/Book/Book.pergamum",
  accessMode: { kind: "readWrite" },
  name: "Book",
  config: null,
  documents: [{ relativePath: "chapters/one.md", name: "one.md" }]
};

const MD_FILE: MarkdownFile = {
  path: "/w/notes/n.md",
  content: "# n\n",
  metadata: {
    encoding: "utf8",
    lineEnding: "lf",
    byteLength: 4,
    characterLength: 4,
    hadBom: false
  }
};

const GLOSSARY_ENTRY = {
  id: "e1",
  kind: "term",
  canonicalSurface: "Term",
  description: "",
  forms: []
} as unknown as GlossaryEntry;

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    sessionId: sid("restore"),
    instanceRunId: RUN_ID,
    updatedAt: "2026-08-28T00:00:00.000Z",
    projectContext: null,
    window: null,
    editors: [],
    activeEditor: null,
    ...overrides
  };
}

const withProject: SessionRecord["projectContext"] = {
  projectId: PROJECT_ID,
  projectFilePath: "/w/Book/Book.pergamum",
  rootPath: "/w/Book"
};

function sm(filePath: string, order: number): SessionEditor {
  return { kind: "standaloneMarkdown", order, filePath, viewState: null };
}
function pm(relativePath: string, order: number): SessionEditor {
  return { kind: "projectMarkdown", order, relativePath, viewState: null };
}

interface Harness {
  deps: ColdStartRestoreDeps;
  applied: RestoredEnvironment[];
  adopted: string[];
  finished: boolean[];
  routedMarkdown: string[];
  skipped: string[];
  restoreUnavailable: string[];
  projectRestoreFailed: number;
  openedNormally: number;
}

function harness(
  payload: ColdStartRestorePayload,
  overrides: Partial<ColdStartRestoreDeps> = {}
): Harness {
  const applied: RestoredEnvironment[] = [];
  const adopted: string[] = [];
  const finished: boolean[] = [];
  const routedMarkdown: string[] = [];
  const skipped: string[] = [];
  const restoreUnavailable: string[] = [];
  let projectRestoreFailed = 0;
  let openedNormally = 0;

  const deps: ColdStartRestoreDeps = {
    platform: "linux",
    getColdStartRestore: () => Promise.resolve(payload),
    openProjectByFilePath: vi.fn(() =>
      Promise.resolve({ kind: "opened", result: PROJECT } as const)
    ),
    resolveProjectOpenResult: vi.fn(() => Promise.resolve(PROJECT)),
    reloadSettingsAfterProjectOpen: vi.fn(() => Promise.resolve()),
    openLaunchTargetProjectNormally: vi.fn(() => {
      openedNormally += 1;
      return Promise.resolve(null);
    }),
    readProjectDocumentContent: vi.fn(() => Promise.resolve("body\n")),
    readMarkdownFile: vi.fn(() => Promise.resolve(MD_FILE)),
    getGlossaryEntryById: vi.fn(() => Promise.resolve(GLOSSARY_ENTRY)),
    applyRestoredEnvironment: (env) => {
      // record the adoption order relative to apply
      applied.push(env);
    },
    adoptSessionId: (id) => adopted.push(id),
    finishColdStart: (restored) => finished.push(restored),
    routeMarkdownLaunchTarget: (filePath) => routedMarkdown.push(filePath),
    notifyRestoreUnavailable: (reason) => restoreUnavailable.push(reason),
    notifyProjectRestoreFailed: () => {
      projectRestoreFailed += 1;
    },
    notifyEditorSkipped: (name) => skipped.push(name),
    ...overrides
  };

  return {
    deps,
    applied,
    adopted,
    finished,
    routedMarkdown,
    skipped,
    restoreUnavailable,
    get projectRestoreFailed() {
      return projectRestoreFailed;
    },
    get openedNormally() {
      return openedNormally;
    }
  };
}

function okPayload(
  sessions: SessionRecord[],
  launchTarget: ColdStartRestorePayload["launchTarget"] = null,
  manifestListedSessionCount = sessions.length
): ColdStartRestorePayload {
  return {
    read: {
      kind: "ok",
      sessions,
      manifestListedSessionCount,
      skippedSessionCount: manifestListedSessionCount - sessions.length
    },
    launchTarget
  };
}

describe("runColdStartRestore (#274)", () => {
  it("Project + zero tabs restores the project with no editor tabs, no active", async () => {
    const h = harness(okPayload([record({ projectContext: withProject })]));
    await runColdStartRestore(h.deps);

    expect(h.adopted).toEqual([sid("restore")]);
    expect(h.applied).toHaveLength(1);
    expect(h.applied[0].project).toBe(PROJECT);
    expect(h.applied[0].openDocuments.documents).toEqual([]);
    expect(h.applied[0].openDocuments.activeDocumentId).toBeNull();
    expect(h.finished).toEqual([true]);
  });

  it("adopts the sessionId BEFORE applying the environment", async () => {
    const order: string[] = [];
    const h = harness(okPayload([record({ projectContext: withProject })]), {
      adoptSessionId: () => order.push("adopt"),
      applyRestoredEnvironment: () => order.push("apply")
    });
    await runColdStartRestore(h.deps);
    expect(order).toEqual(["adopt", "apply"]);
  });

  it("restores a standalone editor even with a Project open; they are independent", async () => {
    const h = harness(
      okPayload([
        record({ projectContext: withProject, editors: [sm("/w/x/a.md", 0)] })
      ])
    );
    await runColdStartRestore(h.deps);

    const docs = h.applied[0].openDocuments.documents;
    expect(docs).toHaveLength(1);
    expect(docs[0].id.kind).toBe("file");
  });

  it("no Project + standalone editor: project null, editor restored", async () => {
    const h = harness(okPayload([record({ editors: [sm("/w/x/a.md", 0)] })]));
    await runColdStartRestore(h.deps);
    expect(h.applied[0].project).toBeNull();
    expect(h.applied[0].openDocuments.documents).toHaveLength(1);
  });

  it("Project identity mismatch → Project restore failed, standalone still restored", async () => {
    const h = harness(
      okPayload([
        record({
          projectContext: withProject,
          editors: [pm("chapters/one.md", 0), sm("/w/x/a.md", 1)]
        })
      ]),
      {
        openProjectByFilePath: () =>
          Promise.resolve({ kind: "identityMismatch" } as const)
      }
    );
    await runColdStartRestore(h.deps);

    expect(h.projectRestoreFailed).toBe(1);
    const docs = h.applied[0].openDocuments.documents;
    expect(docs).toHaveLength(1);
    expect(docs[0].id.kind).toBe("file"); // projectMarkdown skipped, standalone kept
    expect(h.applied[0].project).toBeNull();
  });

  it("missing project-owned Markdown skips only that editor", async () => {
    const h = harness(
      okPayload([
        record({
          projectContext: withProject,
          editors: [pm("chapters/one.md", 0), pm("chapters/missing.md", 1)]
        })
      ])
    );
    await runColdStartRestore(h.deps);

    expect(h.applied[0].openDocuments.documents).toHaveLength(1);
    expect(h.skipped).toEqual(["missing.md"]);
  });

  it("a missing standalone Markdown skips only that editor", async () => {
    const h = harness(
      okPayload([
        record({ editors: [sm("/w/x/a.md", 0), sm("/w/x/gone.md", 1)] })
      ]),
      {
        readMarkdownFile: (filePath) =>
          filePath.endsWith("gone.md")
            ? Promise.reject(new Error("ENOENT"))
            : Promise.resolve(MD_FILE)
      }
    );
    await runColdStartRestore(h.deps);

    expect(h.applied[0].openDocuments.documents).toHaveLength(1);
    expect(h.skipped).toEqual(["gone.md"]);
  });

  it("untitled editors are never reopened and never block others", async () => {
    const untitled: SessionEditor = {
      kind: "untitled",
      order: 0,
      untitledId: "u-1",
      viewState: null
    };
    const h = harness(
      okPayload([record({ editors: [untitled, sm("/w/x/a.md", 1)] })])
    );
    await runColdStartRestore(h.deps);

    const docs = h.applied[0].openDocuments.documents;
    expect(docs).toHaveLength(1);
    expect(docs.every((d) => d.id.kind !== "untitled")).toBe(true);
    expect(h.skipped).toEqual([]); // untitled skip is silent
  });

  it("editor relative order is preserved among successful restores", async () => {
    const h = harness(
      okPayload([
        record({
          editors: [sm("/w/x/c.md", 0), sm("/w/x/gone.md", 1), sm("/w/x/a.md", 2)]
        })
      ]),
      {
        readMarkdownFile: (filePath) =>
          filePath.endsWith("gone.md")
            ? Promise.reject(new Error("ENOENT"))
            : Promise.resolve({ ...MD_FILE, path: filePath })
      }
    );
    await runColdStartRestore(h.deps);

    const paths = h.applied[0].openDocuments.documents.map((d) =>
      d.id.kind === "file" ? d.id.path : ""
    );
    expect(paths).toEqual(["/w/x/c.md", "/w/x/a.md"]);
  });

  it("a missing saved active editor falls back to the filename-ascending file editor", async () => {
    const h = harness(
      okPayload([
        record({
          editors: [sm("/w/x/b.md", 0), sm("/w/x/a.md", 1)],
          activeEditor: { kind: "untitled", untitledId: "u-gone" }
        })
      ]),
      {
        readMarkdownFile: (filePath) =>
          Promise.resolve({ ...MD_FILE, path: filePath })
      }
    );
    await runColdStartRestore(h.deps);

    const active = h.applied[0].openDocuments.activeDocumentId;
    expect(active && active.kind === "file" && active.path).toBe("/w/x/a.md");
  });

  it("a glossary entry restore failure is isolated to that editor", async () => {
    const h = harness(
      okPayload([
        record({
          projectContext: withProject,
          editors: [
            { kind: "glossaryEntry", order: 0, entryId: "gone", viewState: null },
            sm("/w/x/a.md", 1)
          ]
        })
      ]),
      { getGlossaryEntryById: () => Promise.resolve(null) }
    );
    await runColdStartRestore(h.deps);

    expect(h.applied[0].openDocuments.documents).toHaveLength(1);
    expect(h.skipped).toEqual(["gone"]);
  });

  // -------------------------------------------------------------------------
  // #274 FIX-2: restore must never produce an illegal OpenDocumentsState
  //   documents.length === 0  ⟺  activeDocumentId === null
  // -------------------------------------------------------------------------

  function assertOpenDocumentsInvariant(env: RestoredEnvironment): void {
    const { documents, activeDocumentId } = env.openDocuments;
    if (documents.length === 0) {
      expect(activeDocumentId).toBeNull();
    } else {
      expect(activeDocumentId).not.toBeNull();
      expect(
        documents.some(
          (d) =>
            JSON.stringify(d.id) === JSON.stringify(activeDocumentId)
        )
      ).toBe(true);
    }
  }

  it("restored editors = [] → activeDocumentId === null (invariant held)", async () => {
    const h = harness(okPayload([record({ projectContext: withProject })]));
    await runColdStartRestore(h.deps);
    assertOpenDocumentsInvariant(h.applied[0]);
    expect(h.applied[0].openDocuments.documents).toEqual([]);
  });

  const G1 = sid("glossary-1");
  const G2 = sid("glossary-2");

  it("glossary-only restore, saved active missing → deterministic glossary fallback (active non-null)", async () => {
    const h = harness(
      okPayload([
        record({
          projectContext: withProject,
          editors: [
            { kind: "glossaryEntry", order: 0, entryId: G1, viewState: null }
          ],
          activeEditor: null
        })
      ]),
      {
        getGlossaryEntryById: (id) =>
          Promise.resolve({ ...GLOSSARY_ENTRY, id } as never)
      }
    );
    await runColdStartRestore(h.deps);

    const env = h.applied[0];
    assertOpenDocumentsInvariant(env);
    expect(env.openDocuments.documents).toHaveLength(1);
    expect(env.openDocuments.activeDocumentId?.kind).toBe("glossaryEntry");
  });

  it("glossary-only restore, saved active was untitled (skipped) → deterministic glossary fallback", async () => {
    const h = harness(
      okPayload([
        record({
          projectContext: withProject,
          editors: [
            { kind: "glossaryEntry", order: 0, entryId: G1, viewState: null }
          ],
          activeEditor: { kind: "untitled", untitledId: "u-gone" }
        })
      ]),
      {
        getGlossaryEntryById: (id) =>
          Promise.resolve({ ...GLOSSARY_ENTRY, id } as never)
      }
    );
    await runColdStartRestore(h.deps);

    const env = h.applied[0];
    assertOpenDocumentsInvariant(env);
    expect(env.openDocuments.activeDocumentId?.kind).toBe("glossaryEntry");
    // never a fake untitled
    expect(
      env.openDocuments.documents.every((d) => d.id.kind !== "untitled")
    ).toBe(true);
  });

  it("multiple glossary-only editors → active = first by saved order (deterministic)", async () => {
    const h = harness(
      okPayload([
        record({
          projectContext: withProject,
          editors: [
            { kind: "glossaryEntry", order: 0, entryId: G1, viewState: null },
            { kind: "glossaryEntry", order: 1, entryId: G2, viewState: null }
          ],
          activeEditor: null
        })
      ]),
      {
        getGlossaryEntryById: (id) =>
          Promise.resolve({ ...GLOSSARY_ENTRY, id } as never)
      }
    );
    await runColdStartRestore(h.deps);

    const env = h.applied[0];
    assertOpenDocumentsInvariant(env);
    const active = env.openDocuments.activeDocumentId;
    expect(
      active && active.kind === "glossaryEntry" && active.entryId
    ).toBe(G1);
  });

  it("mixed glossary + file editor, saved active missing → filename fallback still wins (glossary not a file editor)", async () => {
    const h = harness(
      okPayload([
        record({
          projectContext: withProject,
          editors: [
            { kind: "glossaryEntry", order: 0, entryId: G1, viewState: null },
            sm("/w/x/zzz.md", 1)
          ],
          activeEditor: { kind: "untitled", untitledId: "u-gone" }
        })
      ]),
      {
        getGlossaryEntryById: (id) =>
          Promise.resolve({ ...GLOSSARY_ENTRY, id } as never)
      }
    );
    await runColdStartRestore(h.deps);

    const env = h.applied[0];
    assertOpenDocumentsInvariant(env);
    expect(env.openDocuments.activeDocumentId?.kind).toBe("file");
  });

  it("carries persisted #273 View State into pendingViewStates", async () => {
    const viewState = {
      contentDigest: { algorithm: "sha256", digest: "a".repeat(64) },
      selection: { anchor: 3, head: 7 },
      scroll: { top: 10, left: 0 }
    };
    const h = harness(
      okPayload([
        record({
          editors: [
            {
              kind: "standaloneMarkdown",
              order: 0,
              filePath: "/w/x/a.md",
              viewState
            }
          ]
        })
      ])
    );
    await runColdStartRestore(h.deps);

    expect([...h.applied[0].pendingViewStates.values()]).toEqual([viewState]);
  });

  it("empty restore set + no launch target: nothing applied, persistence released", async () => {
    const h = harness({ read: { kind: "empty" }, launchTarget: null });
    await runColdStartRestore(h.deps);
    expect(h.applied).toEqual([]);
    expect(h.finished).toEqual([false]);
    expect(h.restoreUnavailable).toEqual([]);
  });

  it("empty restore set + Markdown launch target: routes the Markdown", async () => {
    const h = harness({
      read: { kind: "empty" },
      launchTarget: { kind: "markdown", filePath: "/w/x/a.md" }
    });
    await runColdStartRestore(h.deps);
    expect(h.routedMarkdown).toEqual(["/w/x/a.md"]);
  });

  it("empty restore set + `.pergamum` launch target: opens the project normally", async () => {
    const h = harness({
      read: { kind: "empty" },
      launchTarget: { kind: "pergamum", filePath: "/w/C/C.pergamum" }
    });
    await runColdStartRestore(h.deps);
    expect(h.openedNormally).toBe(1);
  });

  it("manifest unavailable → Error dialog + launch routing still runs", async () => {
    const h = harness({
      read: { kind: "manifestUnavailable", reason: "malformed" },
      launchTarget: { kind: "markdown", filePath: "/w/x/a.md" }
    });
    await runColdStartRestore(h.deps);
    expect(h.restoreUnavailable).toEqual(["malformed"]);
    expect(h.routedMarkdown).toEqual(["/w/x/a.md"]);
    expect(h.applied).toEqual([]);
    expect(h.finished).toEqual([false]);
  });

  it("slow-read timeout → Error dialog + launch routing still runs", async () => {
    const h = harness({
      read: { kind: "timedOut" },
      launchTarget: { kind: "pergamum", filePath: "/w/C/C.pergamum" }
    });
    await runColdStartRestore(h.deps);
    expect(h.restoreUnavailable).toEqual(["abnormallySlow"]);
    expect(h.openedNormally).toBe(1);
  });

  it("all listed sessions invalid → Error dialog, then open launch target", async () => {
    const h = harness(
      okPayload([], { kind: "pergamum", filePath: "/w/C/C.pergamum" }, 3)
    );
    await runColdStartRestore(h.deps);
    expect(h.restoreUnavailable).toEqual(["allSessionsInvalid"]);
    expect(h.openedNormally).toBe(1);
    expect(h.applied).toEqual([]);
  });

  it("`.pergamum` matching a valid Session restores it — no duplicate open", async () => {
    const h = harness(
      okPayload(
        [record({ projectContext: withProject })],
        { kind: "pergamum", filePath: "/w/Book/Book.pergamum" }
      )
    );
    await runColdStartRestore(h.deps);

    expect(h.applied).toHaveLength(1);
    expect(h.openedNormally).toBe(0);
    expect(h.routedMarkdown).toEqual([]);
  });

  it("`.pergamum` NOT matching any Session → unrelated Session is not restored", async () => {
    const h = harness(
      okPayload(
        [record({ projectContext: withProject })],
        { kind: "pergamum", filePath: "/w/Other/Other.pergamum" }
      )
    );
    await runColdStartRestore(h.deps);

    expect(h.applied).toEqual([]);
    expect(h.openedNormally).toBe(1);
  });

  it("BLOCKER 3: same locator + identityMismatch → the explicit `.pergamum` target is still opened normally", async () => {
    const h = harness(
      okPayload(
        [
          record({
            projectContext: withProject,
            editors: [sm("/w/x/a.md", 0)]
          })
        ],
        { kind: "pergamum", filePath: "/w/Book/Book.pergamum" }
      ),
      {
        openProjectByFilePath: () =>
          Promise.resolve({ kind: "identityMismatch" } as const)
      }
    );
    await runColdStartRestore(h.deps);

    // Project Context restore failed → dialog; independent standalone editor
    // still restored (partial-success hierarchy).
    expect(h.projectRestoreFailed).toBe(1);
    expect(h.applied[0].openDocuments.documents).toHaveLength(1);
    expect(h.applied[0].project).toBeNull();
    // The launched `.pergamum` is NOT lost — it is opened the ordinary way.
    expect(h.openedNormally).toBe(1);
  });

  it("BLOCKER 3: same locator + openProjectByFilePath 'failed' → target still opened normally", async () => {
    const h = harness(
      okPayload([record({ projectContext: withProject })], {
        kind: "pergamum",
        filePath: "/w/Book/Book.pergamum"
      }),
      {
        openProjectByFilePath: () =>
          Promise.resolve({
            kind: "failed",
            reason: "notFound",
            message: "gone"
          } as const)
      }
    );
    await runColdStartRestore(h.deps);

    expect(h.projectRestoreFailed).toBe(1);
    expect(h.openedNormally).toBe(1);
  });

  it("`.pergamum` matched + Project restored cleanly → NOT opened normally again", async () => {
    const h = harness(
      okPayload([record({ projectContext: withProject })], {
        kind: "pergamum",
        filePath: "/w/Book/Book.pergamum"
      })
    );
    await runColdStartRestore(h.deps);

    expect(h.applied).toHaveLength(1);
    expect(h.openedNormally).toBe(0);
  });

  it("no-launch-target Session whose Project fails does NOT trigger an ordinary open", async () => {
    const h = harness(
      okPayload([
        record({
          projectContext: withProject,
          editors: [sm("/w/x/a.md", 0)]
        })
      ]),
      {
        openProjectByFilePath: () =>
          Promise.resolve({ kind: "identityMismatch" } as const)
      }
    );
    await runColdStartRestore(h.deps);

    expect(h.projectRestoreFailed).toBe(1);
    expect(h.applied[0].openDocuments.documents).toHaveLength(1); // standalone kept
    expect(h.openedNormally).toBe(0); // no `.pergamum` target to open
  });

  it("Markdown launch target is routed AFTER the selected Session restore", async () => {
    const seen: string[] = [];
    const h = harness(
      okPayload([record({ projectContext: withProject })], {
        kind: "markdown",
        filePath: "/w/Book/chapters/one.md"
      }),
      {
        applyRestoredEnvironment: () => seen.push("apply"),
        routeMarkdownLaunchTarget: () => seen.push("route")
      }
    );
    await runColdStartRestore(h.deps);
    expect(seen).toEqual(["apply", "route"]);
  });

  it("a thrown payload fetch is best-effort: notifies + releases persistence", async () => {
    const h = harness(okPayload([]), {
      getColdStartRestore: () => Promise.reject(new Error("ipc down"))
    });
    await runColdStartRestore(h.deps);
    expect(h.restoreUnavailable).toEqual(["unreadable"]);
    expect(h.finished).toEqual([false]);
  });
});
