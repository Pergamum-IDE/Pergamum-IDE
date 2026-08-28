import { describe, expect, it } from "vitest";
import {
  emptySessionManifest,
  InvalidSessionIdError,
  isSessionId,
  parseRendererSessionSnapshot,
  parseSessionEditor,
  parseSessionEditorIdentity,
  parseSessionEditorViewState,
  isSessionManifestParseFailure,
  parseSessionManifest,
  parseSessionManifestStrict,
  parseSessionProjectContext,
  parseSessionRecord,
  parseSessionRecordStrict,
  parseWindowSessionState,
  sessionDataFileName,
  sessionEditorIdentitiesEqual,
  sessionEditorIdentity,
  sessionManifestWith,
  sessionRecordFromSnapshot,
  SESSION_MANIFEST_SCHEMA_VERSION,
  SESSION_SCHEMA_VERSION,
  type RendererSessionSnapshot,
  type SessionEditor,
  type SessionRecord
} from "../../src/shared/session";
import { sid, RUN_ID, PROJECT_ID, VALID_SHA256 } from "./sessionTestFixtures";

const validDigest = VALID_SHA256;

function validViewState() {
  return {
    contentDigest: { algorithm: "sha256", digest: validDigest },
    selection: { anchor: 3, head: 9 },
    scroll: { top: 40, left: 0 }
  };
}

function baseSnapshot(
  overrides: Partial<RendererSessionSnapshot> = {}
): RendererSessionSnapshot {
  return {
    sessionId: sid("snapshot"),
    projectContext: null,
    editors: [],
    activeEditor: null,
    ...overrides
  };
}

describe("isSessionId (#272 review Blocker 1)", () => {
  it("accepts a lowercase UUIDv7", () => {
    expect(isSessionId(sid("ok"))).toBe(true);
    expect(isSessionId("0190a000-0000-7000-8000-000000000001")).toBe(true);
  });

  it("rejects an arbitrary string / path fragment / absolute path / empty", () => {
    for (const bad of [
      "session-1",
      "../x",
      "../../outside",
      "C:\\Windows\\system32",
      "/absolute/path",
      "a/b",
      "",
      "0190A000-0000-7000-8000-000000000001", // uppercase
      "not-a-uuid-at-all"
    ]) {
      expect(isSessionId(bad), bad).toBe(false);
    }
  });
});

describe("sessionDataFileName path-traversal guard (#272 review Blocker 1)", () => {
  it("returns `<uuid>.json` for a valid Session id", () => {
    const id = sid("file");
    expect(sessionDataFileName(id)).toBe(`${id}.json`);
  });

  it("throws for anything that could escape the data directory", () => {
    for (const bad of [
      "../x",
      "../../outside",
      "C:\\x",
      "/abs/path",
      "a/b",
      "a\\b",
      "..",
      "",
      "session-1"
    ]) {
      expect(() => sessionDataFileName(bad), bad).toThrow(InvalidSessionIdError);
    }
  });
});

describe("parseWindowSessionState (#272)", () => {
  it("accepts normal / maximized / fullscreen modes with normal bounds", () => {
    for (const mode of ["normal", "maximized", "fullscreen"] as const) {
      expect(
        parseWindowSessionState({
          normalBounds: { x: 10, y: 20, width: 800, height: 600 },
          mode
        })
      ).toEqual({
        normalBounds: { x: 10, y: 20, width: 800, height: 600 },
        mode
      });
    }
  });

  it("rejects an unknown / minimized mode", () => {
    expect(
      parseWindowSessionState({
        normalBounds: { x: 0, y: 0, width: 800, height: 600 },
        mode: "minimized"
      })
    ).toBeNull();
  });

  it("rejects non-finite or non-positive bounds", () => {
    expect(
      parseWindowSessionState({
        normalBounds: { x: 0, y: 0, width: 0, height: 600 },
        mode: "normal"
      })
    ).toBeNull();
    expect(
      parseWindowSessionState({
        normalBounds: { x: Number.NaN, y: 0, width: 800, height: 600 },
        mode: "normal"
      })
    ).toBeNull();
  });
});

describe("parseSessionEditorViewState (#272)", () => {
  it("round-trips a well-formed view state", () => {
    expect(parseSessionEditorViewState(validViewState())).toEqual(
      validViewState()
    );
  });

  it("keeps a null scroll", () => {
    expect(
      parseSessionEditorViewState({ ...validViewState(), scroll: null })
    ).toMatchObject({ scroll: null });
  });

  it("does not let a malformed scroll invalidate the whole view state", () => {
    const parsed = parseSessionEditorViewState({
      ...validViewState(),
      scroll: { top: "bad", left: 0 }
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.scroll).toBeNull();
    expect(parsed?.selection).toEqual({ anchor: 3, head: 9 });
  });

  it("rejects a non-64-hex digest or bad selection", () => {
    expect(
      parseSessionEditorViewState({
        ...validViewState(),
        contentDigest: { algorithm: "sha256", digest: "short" }
      })
    ).toBeNull();
    expect(
      parseSessionEditorViewState({
        ...validViewState(),
        selection: { anchor: "0", head: 0 }
      })
    ).toBeNull();
  });
});

describe("parseSessionEditor (#272) — editor kinds", () => {
  it("parses each editor kind with its identity / locator", () => {
    expect(
      parseSessionEditor({
        kind: "projectMarkdown",
        order: 0,
        relativePath: "chapters/01.md",
        viewState: null
      })
    ).toEqual({
      kind: "projectMarkdown",
      order: 0,
      relativePath: "chapters/01.md",
      viewState: null
    });

    expect(
      parseSessionEditor({
        kind: "standaloneMarkdown",
        order: 1,
        filePath: "C:/notes/scratch.md",
        viewState: validViewState()
      })
    ).toMatchObject({
      kind: "standaloneMarkdown",
      filePath: "C:/notes/scratch.md",
      viewState: { contentDigest: { digest: validDigest } }
    });

    expect(
      parseSessionEditor({
        kind: "untitled",
        order: 2,
        untitledId: "7",
        viewState: null
      })
    ).toMatchObject({ kind: "untitled", untitledId: "7" });

    expect(
      parseSessionEditor({
        kind: "glossaryEntry",
        order: 3,
        entryId: "0190aa00-0000-7000-8000-000000000000",
        viewState: null
      })
    ).toEqual({
      kind: "glossaryEntry",
      order: 3,
      entryId: "0190aa00-0000-7000-8000-000000000000",
      viewState: null
    });
  });

  it("drops an editor with a bad order or missing identity", () => {
    expect(
      parseSessionEditor({ kind: "projectMarkdown", order: -1, relativePath: "x" })
    ).toBeNull();
    expect(
      parseSessionEditor({ kind: "standaloneMarkdown", order: 0 })
    ).toBeNull();
    expect(parseSessionEditor({ kind: "mystery", order: 0 })).toBeNull();
  });

  it("null-outs a malformed view state without dropping the editor", () => {
    expect(
      parseSessionEditor({
        kind: "standaloneMarkdown",
        order: 0,
        filePath: "a.md",
        viewState: { contentDigest: { algorithm: "sha256", digest: "nope" } }
      })
    ).toMatchObject({ kind: "standaloneMarkdown", viewState: null });
  });
});

describe("sessionEditorIdentity helpers (#272)", () => {
  it("derives identity and compares by identity", () => {
    const a: SessionEditor = {
      kind: "standaloneMarkdown",
      order: 0,
      filePath: "/a.md",
      viewState: null
    };

    expect(sessionEditorIdentity(a)).toEqual({
      kind: "standaloneMarkdown",
      filePath: "/a.md"
    });
    expect(
      sessionEditorIdentitiesEqual(sessionEditorIdentity(a), {
        kind: "standaloneMarkdown",
        filePath: "/a.md"
      })
    ).toBe(true);
    expect(
      sessionEditorIdentitiesEqual(sessionEditorIdentity(a), {
        kind: "standaloneMarkdown",
        filePath: "/b.md"
      })
    ).toBe(false);
  });

  it("parses an identity ref", () => {
    expect(
      parseSessionEditorIdentity({ kind: "untitled", untitledId: "3" })
    ).toEqual({ kind: "untitled", untitledId: "3" });
    expect(parseSessionEditorIdentity({ kind: "untitled" })).toBeNull();
  });
});

describe("parseSessionProjectContext (#272)", () => {
  it("keeps projectId (identity) and projectFilePath (locator) distinct", () => {
    const context = parseSessionProjectContext({
      projectId: "0190aa00-0000-7000-8000-000000000000",
      projectFilePath: "C:/novel/story.pergamum",
      rootPath: "C:/novel"
    });

    expect(context).toEqual({
      projectId: "0190aa00-0000-7000-8000-000000000000",
      projectFilePath: "C:/novel/story.pergamum",
      rootPath: "C:/novel"
    });
  });

  it("rejects a context missing any field", () => {
    expect(
      parseSessionProjectContext({
        projectId: "x",
        projectFilePath: "y"
      })
    ).toBeNull();
  });

  it("rejects a non-UUIDv7 projectId — including the old \"unknown-project\" sentinel (Blocker 4)", () => {
    for (const projectId of [
      "unknown-project",
      "not-a-uuid",
      "0190AA00-0000-7000-8000-000000000000", // uppercase
      "01234"
    ]) {
      expect(
        parseSessionProjectContext({
          projectId,
          projectFilePath: "C:/n/s.pergamum",
          rootPath: "C:/n"
        }),
        projectId
      ).toBeNull();
    }
  });
});

describe("instanceRunId / projectId identity validation (#272 review Blocker 4)", () => {
  function recordWith(
    overrides: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      schemaVersion: SESSION_SCHEMA_VERSION,
      sessionId: sid("b4"),
      instanceRunId: RUN_ID,
      updatedAt: "2026-08-28T00:00:00.000Z",
      projectContext: null,
      window: null,
      editors: [],
      activeEditor: null,
      ...overrides
    };
  }

  it("accepts a valid UUIDv7 instanceRunId", () => {
    expect(parseSessionRecord(recordWith({}))?.instanceRunId).toBe(RUN_ID);
  });

  it("REJECTS a record whose instanceRunId is not a UUIDv7 — never a fake \"unknown-instance-run\"", () => {
    for (const instanceRunId of [
      "unknown-instance-run",
      "run-1",
      "",
      undefined,
      42
    ]) {
      expect(parseSessionRecord(recordWith({ instanceRunId })), String(instanceRunId)).toBeNull();
    }
  });

  it("accepts a valid UUIDv7 projectId inside a record", () => {
    const parsed = parseSessionRecord(
      recordWith({
        projectContext: {
          projectId: PROJECT_ID,
          projectFilePath: "C:/n/s.pergamum",
          rootPath: "C:/n"
        }
      })
    );
    expect(parsed?.projectContext?.projectId).toBe(PROJECT_ID);
  });

  it("drops a projectContext whose projectId is not a UUIDv7 (record still loads)", () => {
    const parsed = parseSessionRecord(
      recordWith({
        projectContext: {
          projectId: "unknown-project",
          projectFilePath: "C:/n/s.pergamum",
          rootPath: "C:/n"
        },
        editors: []
      })
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.projectContext).toBeNull();
  });

  it("no production parse result carries \"unknown-instance-run\" / \"unknown-project\"", () => {
    const parsed = parseSessionRecord(
      recordWith({
        instanceRunId: RUN_ID,
        projectContext: {
          projectId: PROJECT_ID,
          projectFilePath: "C:/n/s.pergamum",
          rootPath: "C:/n"
        }
      })
    );
    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toContain("unknown-instance-run");
    expect(serialized).not.toContain("unknown-project");
  });

  it("sessionRecordFromSnapshot rejects a non-UUIDv7 instanceRunId enrichment", () => {
    const record = sessionRecordFromSnapshot(baseSnapshot(), {
      instanceRunId: "unknown-instance-run",
      projectId: null,
      window: null,
      now: new Date()
    });
    expect(record).toBeNull();
  });
});

describe("parseSessionRecord (#272)", () => {
  function validRecord(): SessionRecord {
    return {
      schemaVersion: SESSION_SCHEMA_VERSION,
      sessionId: sid("record"),
      instanceRunId: RUN_ID,
      updatedAt: "2026-08-28T00:00:00.000Z",
      projectContext: {
        projectId: PROJECT_ID,
        projectFilePath: "C:/n/s.pergamum",
        rootPath: "C:/n"
      },
      window: {
        normalBounds: { x: 0, y: 0, width: 800, height: 600 },
        mode: "normal"
      },
      editors: [
        {
          kind: "projectMarkdown",
          order: 0,
          relativePath: "01.md",
          viewState: null
        },
        {
          kind: "standaloneMarkdown",
          order: 1,
          filePath: "/x.md",
          viewState: null
        }
      ],
      activeEditor: { kind: "standaloneMarkdown", filePath: "/x.md" }
    };
  }

  it("round-trips a full valid record", () => {
    expect(parseSessionRecord(validRecord())).toEqual(validRecord());
  });

  it("returns null for a wrong / unsupported schemaVersion", () => {
    expect(
      parseSessionRecord({ ...validRecord(), schemaVersion: 999 })
    ).toBeNull();
    expect(parseSessionRecord({ ...validRecord(), schemaVersion: "1" })).toBeNull();
  });

  it("returns null when sessionId is missing or not a UUIDv7", () => {
    const { sessionId: _omit, ...rest } = validRecord();
    expect(parseSessionRecord(rest)).toBeNull();
    expect(
      parseSessionRecord({ ...validRecord(), sessionId: "session-1" })
    ).toBeNull();
    expect(
      parseSessionRecord({ ...validRecord(), sessionId: "../evil" })
    ).toBeNull();
  });

  it("fails soft: a malformed window becomes null, other state survives", () => {
    const parsed = parseSessionRecord({
      ...validRecord(),
      window: { normalBounds: { x: 0, y: 0, width: 0, height: 0 }, mode: "x" }
    });

    expect(parsed?.window).toBeNull();
    expect(parsed?.editors).toHaveLength(2);
    expect(parsed?.projectContext?.projectId).toBe(PROJECT_ID);
  });

  it("fails soft: one malformed editor is dropped, the rest kept and renumbered", () => {
    const record = validRecord();
    const parsed = parseSessionRecord({
      ...record,
      editors: [
        record.editors[0],
        { kind: "standaloneMarkdown", order: 1 }, // malformed — dropped
        { kind: "untitled", order: 5, untitledId: "9", viewState: null }
      ]
    });

    expect(parsed?.editors.map((editor) => editor.kind)).toEqual([
      "projectMarkdown",
      "untitled"
    ]);
    expect(parsed?.editors.map((editor) => editor.order)).toEqual([0, 1]);
  });

  it("fails soft: a malformed view state does not invalidate the session", () => {
    const record = validRecord();
    const parsed = parseSessionRecord({
      ...record,
      editors: [
        {
          kind: "standaloneMarkdown",
          order: 0,
          filePath: "/x.md",
          viewState: { contentDigest: { algorithm: "sha256", digest: "bad" } }
        }
      ],
      activeEditor: { kind: "standaloneMarkdown", filePath: "/x.md" }
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.editors[0].viewState).toBeNull();
  });

  it("nulls an activeEditor that does not match any editor", () => {
    const parsed = parseSessionRecord({
      ...validRecord(),
      activeEditor: { kind: "standaloneMarkdown", filePath: "/not-open.md" }
    });

    expect(parsed?.activeEditor).toBeNull();
  });

  it("accepts a zero-tab record (editors:[] , activeEditor:null)", () => {
    const parsed = parseSessionRecord({
      ...validRecord(),
      editors: [],
      activeEditor: null
    });

    expect(parsed?.editors).toEqual([]);
    expect(parsed?.activeEditor).toBeNull();
    expect(parsed?.projectContext?.projectId).toBe(PROJECT_ID);
  });

  it("accepts a project-open zero-tab record and a no-project standalone record", () => {
    const projectOpenZeroTab = parseSessionRecord({
      ...validRecord(),
      editors: [],
      activeEditor: null
    });
    expect(projectOpenZeroTab?.projectContext).not.toBeNull();
    expect(projectOpenZeroTab?.editors).toEqual([]);

    const noProject = parseSessionRecord({
      ...validRecord(),
      projectContext: null
    });
    expect(noProject?.projectContext).toBeNull();
    expect(noProject?.editors.length).toBeGreaterThan(0);
  });
});

describe("parseSessionRecordStrict (#274) — cold-start restore candidate", () => {
  function validRecord(): SessionRecord {
    return {
      schemaVersion: SESSION_SCHEMA_VERSION,
      sessionId: sid("strict"),
      instanceRunId: RUN_ID,
      updatedAt: "2026-08-28T00:00:00.000Z",
      projectContext: {
        projectId: PROJECT_ID,
        projectFilePath: "C:/n/s.pergamum",
        rootPath: "C:/n"
      },
      window: {
        normalBounds: { x: 0, y: 0, width: 800, height: 600 },
        mode: "normal"
      },
      editors: [
        { kind: "projectMarkdown", order: 0, relativePath: "01.md", viewState: null },
        { kind: "standaloneMarkdown", order: 1, filePath: "/x.md", viewState: null }
      ],
      activeEditor: { kind: "standaloneMarkdown", filePath: "/x.md" }
    };
  }

  it("accepts a fully valid current-schema record (same shape as parseSessionRecord)", () => {
    expect(parseSessionRecordStrict(validRecord())).toEqual(
      parseSessionRecord(validRecord())
    );
  });

  it("accepts a project-open zero-tab record", () => {
    const parsed = parseSessionRecordStrict({
      ...validRecord(),
      editors: [],
      activeEditor: null
    });
    expect(parsed?.projectContext).not.toBeNull();
    expect(parsed?.editors).toEqual([]);
  });

  it("rejects the same schema failures as parseSessionRecord (whole Session skip)", () => {
    expect(
      parseSessionRecordStrict({ ...validRecord(), schemaVersion: 999 })
    ).toBeNull();
    expect(
      parseSessionRecordStrict({ ...validRecord(), sessionId: "session-1" })
    ).toBeNull();
    expect(
      parseSessionRecordStrict({ ...validRecord(), instanceRunId: "run-x" })
    ).toBeNull();
    expect(parseSessionRecordStrict(42)).toBeNull();
  });

  it("Level A: a structurally invalid Project Context skips the whole Session", () => {
    // parseSessionRecord would fail-soft this to projectContext: null.
    expect(parseSessionRecord({ ...validRecord(), projectContext: { projectId: "nope" } })?.projectContext).toBeNull();
    expect(
      parseSessionRecordStrict({
        ...validRecord(),
        projectContext: { projectId: "nope", projectFilePath: "/p", rootPath: "/p" }
      })
    ).toBeNull();
    expect(
      parseSessionRecordStrict({ ...validRecord(), projectContext: { projectId: PROJECT_ID } })
    ).toBeNull();
  });

  it("Level A: a structurally invalid editor record skips the whole Session", () => {
    expect(
      parseSessionRecordStrict({
        ...validRecord(),
        editors: [
          { kind: "projectMarkdown", order: 0, relativePath: "ok.md", viewState: null },
          { kind: "projectMarkdown", order: 1, viewState: null } // missing relativePath
        ]
      })
    ).toBeNull();
    expect(
      parseSessionRecordStrict({ ...validRecord(), editors: [{ kind: "bogus", order: 0 }] })
    ).toBeNull();
    expect(
      parseSessionRecordStrict({ ...validRecord(), editors: "not-an-array" })
    ).toBeNull();
  });

  it("Level A: a structurally invalid active editor identity skips the whole Session", () => {
    expect(
      parseSessionRecordStrict({ ...validRecord(), activeEditor: { kind: "projectMarkdown" } })
    ).toBeNull();
    expect(
      parseSessionRecordStrict({ ...validRecord(), activeEditor: { kind: "bogus", id: 1 } })
    ).toBeNull();
  });

  it("Level A: a structurally invalid Window state skips the whole Session", () => {
    expect(
      parseSessionRecordStrict({
        ...validRecord(),
        window: { normalBounds: { x: 0, y: 0, width: 0, height: 0 }, mode: "x" }
      })
    ).toBeNull();
  });

  it("an active editor identity that parses but matches no editor is NOT a core failure", () => {
    const parsed = parseSessionRecordStrict({
      ...validRecord(),
      activeEditor: { kind: "standaloneMarkdown", filePath: "/not-open.md" }
    });
    expect(parsed).not.toBeNull();
    // downstream fallback territory — parseSessionRecord nulls it here
    expect(parsed?.activeEditor).toBeNull();
  });

  it("Level B: a malformed Editor View State only — the Session stays a candidate", () => {
    const parsed = parseSessionRecordStrict({
      ...validRecord(),
      editors: [
        {
          kind: "standaloneMarkdown",
          order: 0,
          filePath: "/x.md",
          viewState: { contentDigest: { algorithm: "md5", digest: "zzz" }, selection: "bad" }
        }
      ]
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.editors).toHaveLength(1);
    expect(parsed?.editors[0].viewState).toBeNull();
  });

  it("does not repair / rewrite the value it is handed", () => {
    const input = validRecord();
    const snapshot = JSON.stringify(input);
    parseSessionRecordStrict(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  // --- BLOCKER 1: explicit required top-level fields, no fail-soft coercion

  it("a MISSING projectContext / window / activeEditor / editors / updatedAt key skips the whole Session", () => {
    for (const key of [
      "projectContext",
      "window",
      "activeEditor",
      "editors",
      "updatedAt"
    ] as const) {
      const { [key]: _omit, ...rest } = validRecord();
      expect(parseSessionRecordStrict(rest), `missing ${key}`).toBeNull();
    }
  });

  it("explicit null projectContext / window / activeEditor is accepted", () => {
    const parsed = parseSessionRecordStrict({
      ...validRecord(),
      projectContext: null,
      window: null,
      activeEditor: null,
      editors: []
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.projectContext).toBeNull();
    expect(parsed?.window).toBeNull();
    expect(parsed?.activeEditor).toBeNull();
  });

  it("an invalid / non-canonical updatedAt skips the whole Session", () => {
    for (const updatedAt of [
      "",
      "not-a-date",
      "2026-08-28",
      "2026-08-28T00:00:00Z", // no milliseconds — not what toISOString() emits
      "2026-08-28T00:00:00.000+09:00", // not UTC canonical
      1_724_800_000_000,
      null
    ]) {
      expect(
        parseSessionRecordStrict({ ...validRecord(), updatedAt }),
        JSON.stringify(updatedAt)
      ).toBeNull();
    }
    // The canonical form Pergamum actually persists is accepted.
    expect(
      parseSessionRecordStrict({
        ...validRecord(),
        updatedAt: new Date("2026-08-28T12:34:56.789Z").toISOString()
      })
    ).not.toBeNull();
  });

  it("duplicate editor identity skips the whole Session (no dedupe)", () => {
    expect(
      parseSessionRecordStrict({
        ...validRecord(),
        editors: [
          { kind: "standaloneMarkdown", order: 0, filePath: "/dup.md", viewState: null },
          { kind: "standaloneMarkdown", order: 1, filePath: "/dup.md", viewState: null }
        ],
        activeEditor: null
      })
    ).toBeNull();
  });

  it("a non-canonical editor `order` (gapped / duplicate / out-of-order) skips the whole Session (no sort / renumber)", () => {
    const twoEditors = (o0: number, o1: number) => ({
      ...validRecord(),
      editors: [
        { kind: "standaloneMarkdown", order: o0, filePath: "/a.md", viewState: null },
        { kind: "standaloneMarkdown", order: o1, filePath: "/b.md", viewState: null }
      ],
      activeEditor: null
    });

    expect(parseSessionRecordStrict(twoEditors(0, 2)), "gapped").toBeNull();
    expect(parseSessionRecordStrict(twoEditors(1, 0)), "out-of-order").toBeNull();
    expect(parseSessionRecordStrict(twoEditors(0, 0)), "duplicate").toBeNull();
    expect(parseSessionRecordStrict(twoEditors(1, 2)), "not-starting-at-0").toBeNull();
    // The canonical 0..n-1 sequence in array order is accepted.
    expect(parseSessionRecordStrict(twoEditors(0, 1))).not.toBeNull();
  });

  it("#272 parseSessionRecord is NOT affected — it still fail-soft coerces", () => {
    const { updatedAt: _u, projectContext: _p, ...rest } = validRecord();
    const parsed = parseSessionRecord({
      ...rest,
      editors: [
        { kind: "standaloneMarkdown", order: 5, filePath: "/a.md", viewState: null },
        { kind: "standaloneMarkdown", order: 2, filePath: "/b.md", viewState: null }
      ]
    });
    // fail-soft: missing updatedAt → epoch, missing projectContext → null,
    // gapped/out-of-order order → sorted + renumbered 0..n-1.
    expect(parsed).not.toBeNull();
    expect(parsed?.projectContext).toBeNull();
    expect(parsed?.updatedAt).toBe(new Date(0).toISOString());
    expect(parsed?.editors.map((e) => e.order)).toEqual([0, 1]);
  });
});

describe("session manifest (#272)", () => {
  it("treats a missing / malformed / wrong-version manifest as an empty restore set", () => {
    expect(parseSessionManifest(undefined).sessions).toEqual([]);
    expect(parseSessionManifest("not json").sessions).toEqual([]);
    expect(
      parseSessionManifest({ schemaVersion: 2, sessions: [sid("x")] }).sessions
    ).toEqual([]);
    expect(emptySessionManifest().sessions).toEqual([]);
  });

  it("keeps only UUIDv7 membership entries and de-duplicates (Blocker 1)", () => {
    const a = sid("m-a");
    const b = sid("m-b");
    const manifest = parseSessionManifest({
      schemaVersion: SESSION_MANIFEST_SCHEMA_VERSION,
      sessions: [a, a, "", 5, "not-a-uuid", "../x", "/abs", b]
    });

    expect(manifest.sessions).toEqual([a, b]);
  });

  it("sessionManifestWith replaces membership and stamps updatedAt", () => {
    const now = new Date("2026-08-28T12:00:00.000Z");
    const next = sessionManifestWith(emptySessionManifest(), ["x", "y"], now);

    expect(next).toEqual({
      schemaVersion: SESSION_MANIFEST_SCHEMA_VERSION,
      sessions: ["x", "y"],
      updatedAt: now.toISOString()
    });
  });
});

describe("parseSessionManifestStrict — mutation path (#272 review Blocker 3)", () => {
  it("accepts a well-formed v1 manifest verbatim (no filtering, no dedupe)", () => {
    const a = sid("s-a");
    const b = sid("s-b");
    const result = parseSessionManifestStrict({
      schemaVersion: 1,
      sessions: [a, b],
      updatedAt: "2026-08-28T00:00:00.000Z"
    });
    expect(isSessionManifestParseFailure(result)).toBe(false);
    expect((result as { sessions: string[] }).sessions).toEqual([a, b]);
  });

  it("is STRICT: a single non-UUIDv7 membership entry ⇒ `malformed` (never silently filtered, review follow-up 6)", () => {
    const a = sid("s-a");
    expect(
      parseSessionManifestStrict({
        schemaVersion: 1,
        sessions: [a, "evil", a],
        updatedAt: "2026-08-28T00:00:00.000Z"
      })
    ).toEqual({ kind: "malformed" });
  });

  it("is STRICT: a duplicate membership entry ⇒ `malformed` (never silently de-duped)", () => {
    const a = sid("s-a");
    expect(
      parseSessionManifestStrict({
        schemaVersion: 1,
        sessions: [a, a]
      })
    ).toEqual({ kind: "malformed" });
  });

  it("is STRICT: a non-string membership entry ⇒ `malformed`", () => {
    expect(
      parseSessionManifestStrict({ schemaVersion: 1, sessions: [5] })
    ).toEqual({ kind: "malformed" });
  });

  it("reports `unsupportedSchema` for a future schemaVersion (never an empty manifest)", () => {
    const result = parseSessionManifestStrict({
      schemaVersion: 2,
      sessions: [sid("kept")]
    });
    expect(result).toEqual({ kind: "unsupportedSchema", schemaVersion: 2 });
  });

  it("reports `malformed` for non-object / missing schemaVersion / bad sessions", () => {
    expect(parseSessionManifestStrict("nope")).toEqual({ kind: "malformed" });
    expect(parseSessionManifestStrict({ sessions: [] })).toEqual({
      kind: "malformed"
    });
    expect(
      parseSessionManifestStrict({ schemaVersion: "1", sessions: [] })
    ).toEqual({ kind: "malformed" });
    expect(
      parseSessionManifestStrict({ schemaVersion: 1, sessions: "x" })
    ).toEqual({ kind: "malformed" });
  });

  it("the lenient reader still returns empty for all of the above", () => {
    expect(parseSessionManifest({ schemaVersion: 2, sessions: [] }).sessions)
      .toEqual([]);
    expect(parseSessionManifest({ schemaVersion: 1, sessions: "x" }).sessions)
      .toEqual([]);
  });
});

describe("parseRendererSessionSnapshot (#272)", () => {
  it("accepts a minimal snapshot", () => {
    expect(parseRendererSessionSnapshot(baseSnapshot())).toEqual(baseSnapshot());
  });

  it("rejects a snapshot whose sessionId is not a UUIDv7 (Blocker 1)", () => {
    expect(
      parseRendererSessionSnapshot(baseSnapshot({ sessionId: "session-1" }))
    ).toBeNull();
    expect(
      parseRendererSessionSnapshot(baseSnapshot({ sessionId: "../../x" }))
    ).toBeNull();
  });

  it("rejects a snapshot with an editor it cannot represent", () => {
    expect(
      parseRendererSessionSnapshot(
        baseSnapshot({
          editors: [{ kind: "mystery", order: 0 } as unknown as SessionEditor]
        })
      )
    ).toBeNull();
  });

  it("renumbers editor order and validates the active editor against the list", () => {
    const parsed = parseRendererSessionSnapshot(
      baseSnapshot({
        editors: [
          {
            kind: "standaloneMarkdown",
            order: 5,
            filePath: "/b.md",
            viewState: null
          },
          {
            kind: "standaloneMarkdown",
            order: 2,
            filePath: "/a.md",
            viewState: null
          }
        ],
        activeEditor: { kind: "standaloneMarkdown", filePath: "/a.md" }
      })
    );

    expect(parsed?.editors.map((editor) => editor.order)).toEqual([0, 1]);
    // Sorted by declared order (2 before 5), then renumbered.
    expect(
      parsed?.editors.map((editor) => (editor as { filePath: string }).filePath)
    ).toEqual(["/a.md", "/b.md"]);
    expect(parsed?.activeEditor).toEqual({
      kind: "standaloneMarkdown",
      filePath: "/a.md"
    });
  });
});

describe("sessionRecordFromSnapshot (#272) — main enrichment", () => {
  const now = new Date("2026-08-28T09:30:00.000Z");

  it("adds instanceRunId, projectId, window and timestamps", () => {
    const record = sessionRecordFromSnapshot(
      baseSnapshot({
        projectContext: {
          projectFilePath: "C:/n/s.pergamum",
          rootPath: "C:/n"
        }
      }),
      {
        instanceRunId: RUN_ID,
        projectId: PROJECT_ID,
        window: {
          normalBounds: { x: 1, y: 2, width: 900, height: 700 },
          mode: "maximized"
        },
        now
      }
    );

    expect(record).toEqual({
      schemaVersion: SESSION_SCHEMA_VERSION,
      sessionId: sid("snapshot"),
      instanceRunId: RUN_ID,
      updatedAt: now.toISOString(),
      projectContext: {
        projectId: PROJECT_ID,
        projectFilePath: "C:/n/s.pergamum",
        rootPath: "C:/n"
      },
      window: {
        normalBounds: { x: 1, y: 2, width: 900, height: 700 },
        mode: "maximized"
      },
      editors: [],
      activeEditor: null
    });
  });

  it("returns null (never a fake identity) when a Project snapshot has no resolved projectId (Blocker 4)", () => {
    const record = sessionRecordFromSnapshot(
      baseSnapshot({
        projectContext: { projectFilePath: "p", rootPath: "r" }
      }),
      { instanceRunId: RUN_ID, projectId: null, window: null, now }
    );

    expect(record).toBeNull();
  });

  it("still builds a record (projectContext: null) when the snapshot has no project", () => {
    const record = sessionRecordFromSnapshot(baseSnapshot(), {
      instanceRunId: RUN_ID,
      projectId: PROJECT_ID,
      window: null,
      now
    });

    expect(record).not.toBeNull();
    expect(record?.projectContext).toBeNull();
  });

  it("never emits the string \"unknown-project\"", () => {
    const record = sessionRecordFromSnapshot(
      baseSnapshot({
        projectContext: { projectFilePath: "p", rootPath: "r" }
      }),
      { instanceRunId: RUN_ID, projectId: PROJECT_ID, window: null, now }
    );

    expect(JSON.stringify(record)).not.toContain("unknown-project");
    expect(record?.projectContext?.projectId).toBe(PROJECT_ID);
  });
});

describe("session schema data-safety (#272 scope guard)", () => {
  it("has no field anywhere for document / dirty / draft body", () => {
    const record = sessionRecordFromSnapshot(
      baseSnapshot({
        editors: [
          {
            kind: "standaloneMarkdown",
            order: 0,
            filePath: "/x.md",
            viewState: {
              contentDigest: { algorithm: "sha256", digest: validDigest },
              selection: { anchor: 0, head: 0 },
              scroll: null
            }
          }
        ]
      }),
      {
        instanceRunId: RUN_ID,
        projectId: null,
        window: null,
        now: new Date()
      }
    );

    const serialized = JSON.stringify(record);

    for (const forbidden of [
      "content",
      "body",
      "draft",
      "text",
      "markdown",
      "recovery"
    ]) {
      expect(serialized.toLowerCase()).not.toContain(`"${forbidden}"`);
    }
    // contentDigest is the one allowed "content*" key.
    expect(serialized).toContain("contentDigest");
  });
});
